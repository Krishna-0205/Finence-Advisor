import type { Ledger } from "../types";
import { money } from "../money";

export interface EvidenceReference {
  type: "INVOICE" | "PAYMENT" | "RECEIVABLE" | "BUDGET" | "CALCULATION";
  id: string;
  label: string;
  valueMinor?: number;
}

export interface WhyNowRecommendation {
  id: string;
  title: string;
  whyThis: string;
  whyNow: string;
  consequenceIfIgnored: string;
  suggestedAction: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  evidence: EvidenceReference[];
  calculationIds: string[];
  sourceRecordIds: string[];
  createdAt: string;
}

/**
 * Generates deterministic "Why Now?" recommendations from ledger financial state.
 */
export function generateWhyNowRecommendations(
  ledger: Ledger,
  asOf: string = new Date().toISOString().split("T")[0],
): WhyNowRecommendation[] {
  const recommendations: WhyNowRecommendation[] = [];
  const now = new Date().toISOString();

  // 1. Unapproved high-value pending invoices nearing due date
  for (const inv of ledger.invoices) {
    if (inv.status === "PENDING_REVIEW" && inv.total_minor >= 1000000) {
      const daysUntilDue = Math.round((Date.parse(inv.due_date) - Date.parse(asOf)) / 86400000);
      const vendor = ledger.vendors.find((v) => v.id === inv.vendor_id)?.name || "Vendor";
      const cat = ledger.categories.find((c) => c.id === inv.category_id)?.name || "Department";

      // Check budget impact
      const budget = ledger.budgets.find(
        (b) => b.category_id === inv.category_id && b.period_start <= asOf && b.period_end >= asOf,
      );

      let budgetSentence = "";
      if (budget) {
        const curSpend = ledger.invoices
          .filter((i) => i.category_id === inv.category_id && ["APPROVED", "SCHEDULED", "PAID"].includes(i.status))
          .reduce((sum, i) => sum + i.total_minor, 0);
        const curPct = Math.round((curSpend / budget.budget_minor) * 100);
        const nextPct = Math.round(((curSpend + inv.total_minor) / budget.budget_minor) * 100);
        budgetSentence = `Approval would increase ${cat} budget utilization from ${curPct}% to ${nextPct}%.`;
      }

      recommendations.push({
        id: `why_inv_${inv.id}`,
        title: `Review and decide on ${vendor} invoice (${money(inv.total_minor)})`,
        whyThis: `Invoice ${inv.invoice_number} is pending approval for ${money(inv.total_minor)}. ${budgetSentence}`,
        whyNow: daysUntilDue <= 3
          ? `The invoice is due in ${Math.max(0, daysUntilDue)} days (${inv.due_date}). Early settlement qualifies for vendor on-time standing.`
          : `Unreviewed commitments obscure true 30-day cash outflow forecasts.`,
        consequenceIfIgnored: `The obligation will remain uncommitted in cash flow forecasts, risking unplanned settlement spikes and vendor supply disruption.`,
        suggestedAction: `Review supporting line items, verify against category budget, and approve or request investigation.`,
        severity: inv.total_minor >= 50000000 ? "CRITICAL" : "HIGH",
        evidence: [
          {
            type: "INVOICE",
            id: inv.id,
            label: `${vendor} ${inv.invoice_number}`,
            valueMinor: inv.total_minor,
          },
        ],
        calculationIds: ["cash-forecast-v1.0", "budget-variance-v1.0"],
        sourceRecordIds: [inv.id],
        createdAt: now,
      });
    }
  }

  // 2. Overdue Receivables Requiring Immediate Dunning
  const overdueRecs = ledger.receivables.filter(
    (r) => r.due_date < asOf && r.amount_minor > r.received_minor,
  );

  if (overdueRecs.length > 0) {
    const totalOverdue = overdueRecs.reduce((sum, r) => sum + (r.amount_minor - r.received_minor), 0);
    const topRec = overdueRecs.sort((a, b) => (b.amount_minor - b.received_minor) - (a.amount_minor - a.received_minor))[0];
    const daysLate = Math.round((Date.parse(asOf) - Date.parse(topRec.due_date)) / 86400000);

    recommendations.push({
      id: `why_rec_${topRec.id}`,
      title: `Accelerate collection for ${topRec.customer_name} (${money(topRec.amount_minor - topRec.received_minor)})`,
      whyThis: `${money(totalOverdue)} remains uncollected across ${overdueRecs.length} customer accounts. ${topRec.customer_name} represents the largest open balance (${money(topRec.amount_minor - topRec.received_minor)}).`,
      whyNow: `Invoice ${topRec.reference_number} is ${daysLate} days overdue. Collections probability declines by ~1.5% each week a balance remains delinquent.`,
      consequenceIfIgnored: `Operating cash buffer will deteriorate, forcing delay of planned vendor disbursements or debt drawdown.`,
      suggestedAction: `Issue automated payment reminder statement and escalate to customer finance point of contact.`,
      severity: daysLate > 30 ? "CRITICAL" : "HIGH",
      evidence: overdueRecs.map((r) => ({
        type: "RECEIVABLE",
        id: r.id,
        label: `${r.customer_name} (${r.reference_number})`,
        valueMinor: r.amount_minor - r.received_minor,
      })),
      calculationIds: ["receivables-aging-v1.0"],
      sourceRecordIds: overdueRecs.map((r) => r.id),
      createdAt: now,
    });
  }

  // 3. Duplicate Invoices
  for (const alert of ledger.alerts) {
    if (alert.alert_type === "DUPLICATE_INVOICE" && alert.status === "OPEN") {
      const inv = ledger.invoices.find((i) => i.id === alert.invoice_id);
      recommendations.push({
        id: `why_alert_${alert.id}`,
        title: `Block potential duplicate disbursement on ${alert.title}`,
        whyThis: `Matching amount and vendor reference signals indicate a duplicate invoice was submitted.`,
        whyNow: `The invoice is awaiting workflow decision. Approving now would lock in accidental double payment.`,
        consequenceIfIgnored: `Unrecoverable cash disbursement or lengthy vendor credit recovery process.`,
        suggestedAction: `Inspect duplicate audit evidence, verify vendor bank reference, and mark as REJECTED or duplicate.`,
        severity: "CRITICAL",
        evidence: [
          {
            type: "INVOICE",
            id: alert.invoice_id,
            label: alert.title,
            valueMinor: inv?.total_minor,
          },
        ],
        calculationIds: ["duplicate-score-v1.0"],
        sourceRecordIds: [alert.invoice_id],
        createdAt: now,
      });
    }
  }

  return recommendations;
}
