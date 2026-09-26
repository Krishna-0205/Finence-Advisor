import type { Ledger, StoredAlert, Invoice, Receivable } from "../types";
import { money } from "../money";

export interface AlertPriority {
  id: string;
  title: string;
  category: "OVERDUE_RECEIVABLE" | "DUPLICATE_RISK" | "BUDGET_WARNING" | "CASH_IMPACT" | "INVOICE_ANOMALY";
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  financialImpactMinor: number;
  urgencyScore: number; // 0 to 100
  confidenceScore: number; // 0 to 100
  priorityScore: number; // 0 to 100 (composite rank)
  rank: number;
  dueDate?: string;
  entityType: string;
  entityId: string;
  actionText: string;
  linkUrl: string;
  actionRationale: string;
}

export interface SmartPrioritiesSummary {
  generatedAt: string;
  totalAlertsConsidered: number;
  topPriorities: AlertPriority[];
  allPriorities: AlertPriority[];
}

/**
 * Deterministic formula computing alert priority score:
 * - Financial Impact (weight: 35%): Logarithmic scaling up to ₹10L
 * - Urgency (weight: 30%): Overdue days and immediate cash horizon
 * - Risk Severity (weight: 20%): CRITICAL=100, HIGH=75, MEDIUM=50, LOW=25
 * - Confidence (weight: 15%): Certainty of evidence and calculation
 */
export function calculateSmartPriorities(
  ledger: Ledger,
  asOf: string = new Date().toISOString().split("T")[0],
): SmartPrioritiesSummary {
  const priorities: AlertPriority[] = [];
  let idCounter = 1;

  // 1. Overdue Receivables (Direct uncollected cash)
  for (const rec of ledger.receivables) {
    const uncollected = rec.amount_minor - rec.received_minor;
    if (uncollected > 0 && rec.due_date < asOf) {
      const daysOverdue = Math.max(1, Math.round((Date.parse(asOf) - Date.parse(rec.due_date)) / 86400000));
      const impactScore = Math.min(100, Math.round((uncollected / 10000000) * 100)); // scale to ₹1L
      const urgencyScore = Math.min(100, daysOverdue * 5); // 20 days overdue = 100
      const severity = daysOverdue > 30 ? "CRITICAL" : daysOverdue > 14 ? "HIGH" : "MEDIUM";
      const severityScore = severity === "CRITICAL" ? 100 : severity === "HIGH" ? 75 : 50;
      const confidenceScore = 95;

      const priorityScore = Math.round(
        0.35 * impactScore + 0.30 * urgencyScore + 0.20 * severityScore + 0.15 * confidenceScore,
      );

      priorities.push({
        id: `prio_${idCounter++}`,
        title: `🔴 ${money(uncollected)} Overdue Customer Receivable`,
        category: "OVERDUE_RECEIVABLE",
        severity,
        financialImpactMinor: uncollected,
        urgencyScore,
        confidenceScore,
        priorityScore,
        rank: 0,
        dueDate: rec.due_date,
        entityType: "receivable",
        entityId: rec.id,
        actionText: "Initiate collection workflow",
        linkUrl: "/ledger",
        actionRationale: `${rec.customer_name} is ${daysOverdue} days past due date (${rec.due_date}). Immediate collection required to safeguard cash runway.`,
      });
    }
  }

  // 2. High Risk Alerts (Duplicate Invoices, Severe Spikes)
  for (const alert of ledger.alerts) {
    if (alert.status !== "OPEN") continue;

    const inv = ledger.invoices.find((i) => i.id === alert.invoice_id);
    const impactMinor = inv ? inv.total_minor : 1000000;
    const impactScore = Math.min(100, Math.round((impactMinor / 10000000) * 100));
    const isDuplicate = alert.alert_type === "DUPLICATE_INVOICE";
    const severityScore = alert.severity === "CRITICAL" ? 100 : alert.severity === "HIGH" ? 75 : 50;
    const urgencyScore = isDuplicate ? 90 : 70;
    const confidenceScore = 90;

    const priorityScore = Math.round(
      0.35 * impactScore + 0.30 * urgencyScore + 0.20 * severityScore + 0.15 * confidenceScore,
    );

    priorities.push({
      id: `prio_${idCounter++}`,
      title: isDuplicate
        ? `🟠 ${money(impactMinor)} Possible Duplicate Invoice`
        : `⚠ ${alert.title}`,
      category: isDuplicate ? "DUPLICATE_RISK" : "INVOICE_ANOMALY",
      severity: alert.severity as any,
      financialImpactMinor: impactMinor,
      urgencyScore,
      confidenceScore,
      priorityScore,
      rank: 0,
      entityType: "invoice",
      entityId: alert.invoice_id,
      actionText: isDuplicate ? "Investigate duplicate signal" : "Review risk evidence",
      linkUrl: `/invoices/${alert.invoice_id}`,
      actionRationale: alert.description || "Evidence-backed anomaly requiring verification prior to approval.",
    });
  }

  // 3. Budgets Nearing or Exceeding Limit
  for (const b of ledger.budgets) {
    if (b.period_start <= asOf && b.period_end >= asOf) {
      const catInvoices = ledger.invoices.filter(
        (i) => i.category_id === b.category_id && i.invoice_date >= b.period_start && i.invoice_date <= b.period_end,
      );
      const actualSpend = catInvoices
        .filter((i) => ["APPROVED", "SCHEDULED", "PAID"].includes(i.status))
        .reduce((sum, i) => sum + i.total_minor, 0);

      const utilization = (actualSpend / b.budget_minor) * 100;
      if (utilization >= 85) {
        const severity = utilization >= 100 ? "CRITICAL" : utilization >= 90 ? "HIGH" : "MEDIUM";
        const catName = ledger.categories.find((c) => c.id === b.category_id)?.name || "Category";
        const remaining = b.budget_minor - actualSpend;

        const impactScore = Math.min(100, Math.round((actualSpend / b.budget_minor) * 100));
        const urgencyScore = utilization >= 100 ? 95 : 75;
        const severityScore = severity === "CRITICAL" ? 100 : severity === "HIGH" ? 75 : 50;

        const priorityScore = Math.round(
          0.35 * impactScore + 0.30 * urgencyScore + 0.20 * severityScore + 0.15 * 90,
        );

        priorities.push({
          id: `prio_${idCounter++}`,
          title: `🟠 Budget at ${utilization.toFixed(0)}% for ${catName}`,
          category: "BUDGET_WARNING",
          severity,
          financialImpactMinor: actualSpend,
          urgencyScore,
          confidenceScore: 90,
          priorityScore,
          rank: 0,
          entityType: "budget",
          entityId: b.id,
          actionText: "Inspect category spend",
          linkUrl: "/budgets",
          actionRationale: `${catName} has utilized ${utilization.toFixed(1)}% of its allocated ${money(b.budget_minor)} budget (${money(Math.abs(remaining))} ${remaining < 0 ? "over budget" : "remaining"}).`,
        });
      }
    }
  }

  // Sort descending by priority score
  priorities.sort((a, b) => b.priorityScore - a.priorityScore);

  // Assign 1-indexed ranks
  priorities.forEach((p, idx) => {
    p.rank = idx + 1;
  });

  return {
    generatedAt: new Date().toISOString(),
    totalAlertsConsidered: priorities.length,
    topPriorities: priorities.slice(0, 3), // Today's Priorities: Top 3
    allPriorities: priorities,
  };
}
