import type { Actor, Ledger } from "../../domain/types";
import {
  canExport,
  type ExportType,
  RATE_LIMIT_POLICIES,
} from "../../domain/finance/security";
import { checkRateLimit } from "./rate-limiter";
import { logSecurityEvent } from "./events";
import { verifyStepUpMfa } from "./mfa";
import { calculateReconciliation } from "../../domain/finance/reconciliation";
import { financialEngine } from "../finance";

export interface ExportRequest {
  exportType: ExportType;
  scope: string; // e.g., "invoices", "payments", "audit", "reconciliation", "full"
  format: "CSV" | "JSON";
  reason?: string;
  mfaCode?: string;
  from?: string;
  to?: string;
}

export interface ExportResponse {
  filename: string;
  mimeType: string;
  content: string;
  recordCount: number;
  occurredAt: string;
}

/**
 * Validates authorization, checks rate limits, enforces MFA if required,
 * logs immutable audit events and generates the data export.
 */
export function executeExport(
  ledger: Ledger,
  actor: Actor,
  request: ExportRequest,
): ExportResponse {
  // 1. Rate limit check (max 10 exports per min)
  checkRateLimit(actor.user_id, RATE_LIMIT_POLICIES.EXPORT_PER_MIN, {
    companyId: actor.company_id,
    userId: actor.user_id,
    userName: actor.name,
  });

  // 2. Determine record count to evaluate permissions
  let rawRecords: any[] = [];
  let defaultFilename = `export_${request.scope}_${new Date().toISOString().slice(0, 10)}`;

  switch (request.scope) {
    case "invoices":
      rawRecords = ledger.invoices.filter((i) => i.status !== "REJECTED");
      break;
    case "payments":
      rawRecords = ledger.payments;
      break;
    case "receivables":
      rawRecords = ledger.receivables;
      break;
    case "reconciliation": {
      const rec = calculateReconciliation(ledger);
      rawRecords = rec.results;
      break;
    }
    case "audit":
      rawRecords = ledger.audit_logs;
      break;
    case "full":
    case "financial_report":
    default: {
      const m = financialEngine(ledger);
      rawRecords = [
        {
          company: ledger.company.name,
          cash_rupees: m.cash / 100,
          payables_rupees: m.payables / 100,
          receivables_rupees: m.receivables / 100,
          net_rupees: m.net / 100,
          invoices_count: ledger.invoices.length,
          payments_count: ledger.payments.length,
          receivables_count: ledger.receivables.length,
        },
      ];
      break;
    }
  }

  // Filter by date range if provided
  if (request.from || request.to) {
    rawRecords = rawRecords.filter((r) => {
      const d = r.invoice_date || r.payment_date || r.created_at || r.occurredAt;
      if (!d) return true;
      if (request.from && d < request.from) return false;
      if (request.to && d > request.to) return false;
      return true;
    });
  }

  const recordCount = rawRecords.length;

  // 3. Export permission evaluation
  const perm = canExport({
    role: actor.role,
    exportType: request.exportType,
    scope: request.scope,
    recordCount,
  });

  if (!perm.allowed) {
    logSecurityEvent(actor.company_id, {
      userId: actor.user_id,
      userName: actor.name,
      eventType: "AUTHORIZATION_FAILURE",
      severity: "WARNING",
      title: "Export Authorization Denied",
      description: `User role "${actor.role}" was denied export of "${request.scope}" (${recordCount} records): ${perm.reason}`,
      resourceType: "EXPORT",
    });
    throw new Error(perm.reason || "You are not authorized to perform this export.");
  }

  // 4. Step-Up MFA check for sensitive/bulk exports
  if (perm.requiresStepUpMfa) {
    verifyStepUpMfa(actor, `EXPORT_${request.exportType}_${request.scope}`, request.mfaCode);
  }

  // 5. Slice to allowed limit
  const exportSet = rawRecords.slice(0, perm.maxRecordsAllowed);

  // 6. Generate content
  let content = "";
  let mimeType = "text/plain";
  const extension = request.format === "JSON" ? "json" : "csv";

  if (request.format === "JSON") {
    mimeType = "application/json";
    content = JSON.stringify(
      {
        company: ledger.company.name,
        currency: ledger.company.currency_code,
        scope: request.scope,
        exportedAt: new Date().toISOString(),
        exportedBy: actor.name,
        role: actor.role,
        recordCount: exportSet.length,
        records: exportSet,
      },
      null,
      2,
    );
  } else {
    // CSV conversion
    mimeType = "text/csv";
    if (exportSet.length > 0) {
      const headers = Object.keys(exportSet[0]).filter(
        (k) => typeof exportSet[0][k] !== "object" || exportSet[0][k] === null,
      );
      const rows = [headers.join(",")];
      for (const row of exportSet) {
        const line = headers.map((h) => {
          const val = row[h];
          if (val === null || val === undefined) return '""';
          const s = String(val).replace(/"/g, '""');
          return `"${s}"`;
        });
        rows.push(line.join(","));
      }
      content = rows.join("\n");
    } else {
      content = "No records found\n";
    }
  }

  const occurredAt = new Date().toISOString();

  // 7. Log immutable audit event
  ledger.audit_logs.push({
    id: `audit_exp_${Date.now()}`,
    company_id: actor.company_id,
    created_at: occurredAt,
    user_id: actor.user_id,
    action: "EXPORT_DATA",
    entity_type: "export",
    entity_id: defaultFilename,
    previous_state: null,
    new_state: {
      format: request.format,
      scope: request.scope,
      records: exportSet.length,
      reason: request.reason || "User requested data export",
    },
    metadata: {
      format: request.format,
      scope: request.scope,
      records_count: exportSet.length,
      actor_name: actor.name,
      actor_role: actor.role,
      reason: request.reason,
    },
  });

  // 8. Log security event for bulk/audit exports
  if (recordCount > 100 || request.exportType === "AUDIT_REPORT") {
    logSecurityEvent(actor.company_id, {
      userId: actor.user_id,
      userName: actor.name,
      eventType: "BULK_EXPORT",
      severity: "INFO",
      title: "Bulk Data Export Executed",
      description: `User ${actor.name} (${actor.role}) exported ${exportSet.length} ${request.scope} records in ${request.format} format.`,
      resourceType: "EXPORT",
      metadata: { recordCount: exportSet.length, format: request.format, scope: request.scope },
    });
  }

  return {
    filename: `${defaultFilename}.${extension}`,
    mimeType,
    content,
    recordCount: exportSet.length,
    occurredAt,
  };
}
