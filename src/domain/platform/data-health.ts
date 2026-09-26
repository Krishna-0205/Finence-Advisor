import type { Ledger } from "../types";
import { calculateReconciliation } from "../finance/reconciliation";

export interface DataHealthMetric {
  name: string;
  score: number; // 0 to 100
  status: "HEALTHY" | "WARNING" | "CRITICAL";
  passedChecks: number;
  totalChecks: number;
  summary: string;
}

export interface DataHealthIssue {
  id: string;
  dimension: "completeness" | "consistency" | "freshness" | "integrity" | "reconciliation";
  severity: "INFO" | "WARNING" | "CRITICAL";
  title: string;
  description: string;
  count: number;
  actionText: string;
  actionUrl: string;
}

export interface FinancialDataHealth {
  overallScore: number; // 0 to 100
  status: "EXCELLENT" | "GOOD" | "FAIR" | "POOR";
  completeness: DataHealthMetric;
  consistency: DataHealthMetric;
  freshness: DataHealthMetric;
  integrity: DataHealthMetric;
  reconciliation: DataHealthMetric;
  issues: DataHealthIssue[];
  calculationId: string;
  calculationVersion: string;
  dataAsOf: string;
}

export const DATA_HEALTH_VERSION = "data-health-v1.0";

/**
 * Deterministic Financial Data Health evaluation engine.
 * Evaluates 5 dimensions and computes an explainable health score.
 */
export function calculateFinancialDataHealth(
  ledger: Ledger,
  asOf: string = new Date().toISOString().split("T")[0],
): FinancialDataHealth {
  const issues: DataHealthIssue[] = [];
  const now = new Date().toISOString();

  // --------------------------------------------------------------------------
  // 1. Completeness: Required fields, descriptions, category & vendor mapping
  // --------------------------------------------------------------------------
  let compTotal = 0;
  let compPassed = 0;

  let missingDescriptions = 0;
  let unmappedVendors = 0;

  for (const inv of ledger.invoices) {
    compTotal += 3;
    if (inv.description && inv.description.trim().length > 3) compPassed++;
    else missingDescriptions++;

    if (ledger.vendors.some((v) => v.id === inv.vendor_id)) compPassed++;
    else unmappedVendors++;

    if (ledger.categories.some((c) => c.id === inv.category_id)) compPassed++;
  }

  if (compTotal === 0) {
    compTotal = 1;
    compPassed = 1;
  }

  const compScore = Math.round((compPassed / compTotal) * 100);

  if (missingDescriptions > 0) {
    issues.push({
      id: "issue_comp_desc",
      dimension: "completeness",
      severity: "INFO",
      title: `${missingDescriptions} invoices missing descriptive detail`,
      description: "Descriptive vendor line items improve auditability and AI extraction reliability.",
      count: missingDescriptions,
      actionText: "Review invoices",
      actionUrl: "/invoices",
    });
  }

  // --------------------------------------------------------------------------
  // 2. Consistency: Total = Subtotal + Tax, INR currency checks
  // --------------------------------------------------------------------------
  let consTotal = ledger.invoices.length || 1;
  let consPassed = 0;
  let mathMismatches = 0;

  for (const inv of ledger.invoices) {
    const isMathValid = inv.total_minor === inv.subtotal_minor + inv.tax_minor;
    const isCurrencyValid = inv.currency_code === "INR";
    if (isMathValid && isCurrencyValid) consPassed++;
    else mathMismatches++;
  }

  const consScore = Math.round((consPassed / consTotal) * 100);

  // --------------------------------------------------------------------------
  // 3. Freshness: Transaction age and data currency
  // --------------------------------------------------------------------------
  let freshScore = 100;
  let staleRecords = 0;

  const latestPayment = ledger.payments.reduce((max, p) => p.payment_date > max ? p.payment_date : max, "");
  if (latestPayment) {
    const daysSince = Math.round((Date.parse(asOf) - Date.parse(latestPayment)) / 86400000);
    if (daysSince > 14) {
      freshScore = Math.max(50, 100 - daysSince * 2);
      staleRecords = 1;
      issues.push({
        id: "issue_fresh_tx",
        dimension: "freshness",
        severity: "WARNING",
        title: `No bank transactions recorded in ${daysSince} days`,
        description: "Payment and receipt ledgers should be synced regularly to maintain fresh runway forecasts.",
        count: daysSince,
        actionText: "Import bank CSV",
        actionUrl: "/invoices",
      });
    }
  }

  // --------------------------------------------------------------------------
  // 4. Integrity: Duplicate alerts and anomaly signals
  // --------------------------------------------------------------------------
  const duplicateAlerts = ledger.alerts.filter((a) => a.alert_type === "DUPLICATE_INVOICE" && a.status === "OPEN");
  let integScore = Math.max(20, 100 - duplicateAlerts.length * 20);

  if (duplicateAlerts.length > 0) {
    issues.push({
      id: "issue_integ_dup",
      dimension: "integrity",
      severity: "CRITICAL",
      title: `${duplicateAlerts.length} duplicate payment risks flagged`,
      description: "Potential duplicate supplier billings detected by duplicate signal engine.",
      count: duplicateAlerts.length,
      actionText: "Review risk center",
      actionUrl: "/risk",
    });
  }

  // --------------------------------------------------------------------------
  // 5. Reconciliation: Unmatched disbursements and discrepancies
  // --------------------------------------------------------------------------
  const recon = calculateReconciliation(ledger, asOf);
  let reconScore = 100;
  if (recon.exceptionsCount > 0) {
    reconScore = Math.max(30, 100 - recon.exceptionsCount * 15);
    issues.push({
      id: "issue_recon_exc",
      dimension: "reconciliation",
      severity: "CRITICAL",
      title: `${recon.exceptionsCount} reconciliation discrepancies detected`,
      description: `${recon.unmatchedPaymentsCount} unmatched payments and ${recon.overpaymentsCount} overpayments require reconciliation.`,
      count: recon.exceptionsCount,
      actionText: "Open Reconciliation",
      actionUrl: "/",
    });
  }

  // Overall Score (weighted average)
  const overallScore = Math.round(
    0.20 * compScore + 0.20 * consScore + 0.20 * freshScore + 0.20 * integScore + 0.20 * reconScore,
  );

  const status =
    overallScore >= 90 ? "EXCELLENT" : overallScore >= 75 ? "GOOD" : overallScore >= 60 ? "FAIR" : "POOR";

  const getDimStatus = (s: number) => (s >= 85 ? "HEALTHY" : s >= 70 ? "WARNING" : "CRITICAL");

  return {
    overallScore,
    status,
    completeness: {
      name: "Data Completeness",
      score: compScore,
      status: getDimStatus(compScore),
      passedChecks: compPassed,
      totalChecks: compTotal,
      summary: `${compPassed} of ${compTotal} required fields and mappings valid`,
    },
    consistency: {
      name: "Mathematical Consistency",
      score: consScore,
      status: getDimStatus(consScore),
      passedChecks: consPassed,
      totalChecks: consTotal,
      summary: `${consPassed} of ${consTotal} totals and currency semantics verified`,
    },
    freshness: {
      name: "Data Freshness",
      score: freshScore,
      status: getDimStatus(freshScore),
      passedChecks: staleRecords === 0 ? 1 : 0,
      totalChecks: 1,
      summary: staleRecords === 0 ? "Bank and invoice data up to date" : "Transactions require updating",
    },
    integrity: {
      name: "Data Integrity & Deduplication",
      score: integScore,
      status: getDimStatus(integScore),
      passedChecks: Math.max(0, ledger.invoices.length - duplicateAlerts.length),
      totalChecks: ledger.invoices.length || 1,
      summary: duplicateAlerts.length === 0 ? "Zero duplicate signals" : `${duplicateAlerts.length} duplicate signals flagged`,
    },
    reconciliation: {
      name: "Reconciliation Balance",
      score: reconScore,
      status: getDimStatus(reconScore),
      passedChecks: recon.reconciledCount,
      totalChecks: recon.results.length || 1,
      summary: `${recon.reconciledCount} reconciled · ${recon.exceptionsCount} exceptions`,
    },
    issues,
    calculationId: "calc_data_health",
    calculationVersion: DATA_HEALTH_VERSION,
    dataAsOf: asOf,
  };
}
