import type { Role } from "../types";

export type AuditSource = "WEB" | "API" | "IMPORT" | "AI" | "SYSTEM";

export interface ImmutableAuditEvent {
  id: string;
  companyId: string;
  actorUserId: string;
  actorName?: string;
  action: string;
  entityType: string;
  entityId: string;
  occurredAt: string; // ISO
  source: AuditSource;
  reason?: string;
  before?: unknown;
  after?: unknown;
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
  calculationId?: string;
  calculationVersion?: string;
  sourceRecords?: string[];
  metadata?: Record<string, any>;
}

export type SecurityEventType =
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILURE"
  | "AUTHORIZATION_FAILURE"
  | "MFA_FAILURE"
  | "MFA_SUCCESS"
  | "BULK_EXPORT"
  | "LARGE_IMPORT"
  | "AI_REQUEST"
  | "RATE_LIMIT"
  | "SUSPICIOUS_ACTIVITY";

export interface SecurityEvent {
  id: string;
  companyId?: string;
  userId?: string;
  userName?: string;
  eventType: SecurityEventType;
  severity: "INFO" | "WARNING" | "CRITICAL";
  title: string;
  description: string;
  occurredAt: string; // ISO
  sourceIp?: string;
  userAgent?: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, any>;
}

export interface SecuritySummary {
  last24Hours: {
    failedLogins: number;
    failedAuthorizations: number;
    mfaFailures: number;
    bulkExports: number;
    largeImports: number;
    aiRequests: number;
    rateLimits: number;
    totalEvents: number;
  };
  events: SecurityEvent[];
}

export type ExportType =
  | "CSV"
  | "PDF"
  | "FINANCIAL_REPORT"
  | "AUDIT_REPORT"
  | "RECONCILIATION_REPORT";

export interface ExportPermissionRequest {
  role: Role;
  exportType: ExportType;
  scope: string;
  recordCount: number;
}

export interface ExportPermissionResult {
  allowed: boolean;
  requiresStepUpMfa: boolean;
  reason?: string;
  maxRecordsAllowed: number;
}

/**
 * Server-side export control evaluation.
 * - Viewer: Limited to summary exports under 50 records; cannot export audit reports or raw payment tables.
 * - Finance: Can export financial reports, invoices, reconciliation up to 5,000 records.
 * - Admin: Full authorized exports. Exports > 100 records or audit reports require Step-Up MFA.
 */
export function canExport(req: ExportPermissionRequest): ExportPermissionResult {
  if (req.role === "viewer") {
    if (req.exportType === "AUDIT_REPORT") {
      return {
        allowed: false,
        requiresStepUpMfa: false,
        reason: "Viewers are not authorized to export audit reports.",
        maxRecordsAllowed: 0,
      };
    }
    if (req.recordCount > 50) {
      return {
        allowed: false,
        requiresStepUpMfa: false,
        reason: "Viewers are limited to exporting 50 records maximum.",
        maxRecordsAllowed: 50,
      };
    }
    return {
      allowed: true,
      requiresStepUpMfa: false,
      maxRecordsAllowed: 50,
    };
  }

  if (req.role === "finance") {
    if (req.exportType === "AUDIT_REPORT") {
      return {
        allowed: false,
        requiresStepUpMfa: false,
        reason: "Audit log exports are restricted to Administrators.",
        maxRecordsAllowed: 0,
      };
    }
    const requiresStepUp = req.recordCount > 200;
    return {
      allowed: true,
      requiresStepUpMfa: requiresStepUp,
      reason: requiresStepUp ? "Bulk export requires step-up confirmation." : undefined,
      maxRecordsAllowed: 5000,
    };
  }

  // Admin
  const requiresStepUp = req.recordCount > 100 || req.exportType === "AUDIT_REPORT";
  return {
    allowed: true,
    requiresStepUpMfa: requiresStepUp,
    reason: requiresStepUp ? "Administrative bulk/audit export requires Step-Up MFA." : undefined,
    maxRecordsAllowed: 25000,
  };
}

/**
 * Determines whether a financial or administrative operation requires Step-Up MFA.
 */
export const STEP_UP_SENSITIVE_INVOICE_THRESHOLD_MINOR = 50000000; // ₹5,00,000 (5L)

export interface SensitiveActionCheck {
  action: string;
  amountMinor?: number;
  role: Role;
}

export function isSensitiveAction(check: SensitiveActionCheck): {
  isSensitive: boolean;
  reason?: string;
} {
  // 1. High value invoice approval (>= ₹5L)
  if (
    check.action === "APPROVE" &&
    check.amountMinor !== undefined &&
    check.amountMinor >= STEP_UP_SENSITIVE_INVOICE_THRESHOLD_MINOR
  ) {
    return {
      isSensitive: true,
      reason: `Invoice amount ₹${(check.amountMinor / 100).toLocaleString()} exceeds ₹5,00,000 step-up authentication threshold.`,
    };
  }

  // 2. Direct payment recording / execution
  if (check.action === "PAY" || check.action === "CREATE_PAYMENT") {
    return {
      isSensitive: true,
      reason: "Payment disbursement requires step-up verification.",
    };
  }

  // 3. User role modifications
  if (check.action === "CHANGE_USER_ROLE" || check.action === "ROLE_CHANGE") {
    return {
      isSensitive: true,
      reason: "Modifying member roles is a privileged administrative security action.",
    };
  }

  // 4. Budget change
  if (check.action === "CHANGE_BUDGET" && check.amountMinor && check.amountMinor >= 10000000) {
    return {
      isSensitive: true,
      reason: "Significant budget allocation changes require step-up verification.",
    };
  }

  return { isSensitive: false };
}

/**
 * Rate limit configuration profiles.
 */
export interface RateLimitPolicy {
  windowSeconds: number;
  maxRequests: number;
  identifierName: string;
}

export const RATE_LIMIT_POLICIES = {
  AI_ADVISOR_PER_MIN: {
    windowSeconds: 60,
    maxRequests: 10,
    identifierName: "AI Advisor Requests (1 min)",
  },
  AI_ADVISOR_PER_HOUR: {
    windowSeconds: 3600,
    maxRequests: 60,
    identifierName: "AI Advisor Requests (1 hour)",
  },
  PDF_EXTRACTION_PER_MIN: {
    windowSeconds: 60,
    maxRequests: 5,
    identifierName: "Document Extractions (1 min)",
  },
  PDF_EXTRACTION_DAILY: {
    windowSeconds: 86400,
    maxRequests: 50,
    identifierName: "Document Extractions (Daily)",
  },
  CSV_IMPORT_PER_HOUR: {
    windowSeconds: 3600,
    maxRequests: 10,
    identifierName: "CSV Data Imports (1 hour)",
  },
  EXPORT_PER_MIN: {
    windowSeconds: 60,
    maxRequests: 10,
    identifierName: "Data Exports (1 min)",
  },
};
