import type { Ledger } from "../types";
import { money } from "../money";
import { financialEngine } from "../../server/finance";

export interface ExplanationLineItem {
  id: string;
  name: string;
  amountMinor: number;
  date?: string;
  type: "INFLOW" | "OUTFLOW" | "OPENING" | "BASE";
  entityType?: "invoice" | "receivable" | "company";
}

export interface MetricExplanation {
  metricName: string;
  title: string;
  currentValueMinor: number;
  formattedValue: string;

  // Level 1: Simple summary statement
  level1Simple: string;

  // Level 2: Exact mathematical calculation
  level2Calculation: {
    formula: string;
    terms: Array<{
      label: string;
      valueMinor: number;
      sign: "+" | "−" | "=";
    }>;
    resultMinor: number;
  };

  // Level 3: Itemized evidence and source records
  level3Evidence: {
    calculationId: string;
    calculationVersion: string;
    methodology: string;
    dataAsOf: string;
    inflows: ExplanationLineItem[];
    outflows: ExplanationLineItem[];
    sourceRecordCount: number;
  };
}

/**
 * Generates structured 3-level explanations for any core financial KPI.
 */
export function explainMetric(
  ledger: Ledger,
  metricKey: "PROJECTED_CASH" | "CURRENT_CASH" | "OUTSTANDING_PAYABLES" | "EXPECTED_RECEIVABLES" | "BUDGET_UTILIZATION",
  asOf: string = new Date().toISOString().split("T")[0],
): MetricExplanation {
  const engine = financialEngine(ledger, asOf);
  const p30 = engine.projections[1]; // 30-day projection

  if (metricKey === "PROJECTED_CASH") {
    const opening = ledger.company.opening_cash_minor;
    const inflows = p30.inflow;
    const outflows = p30.outflow;
    const projected = p30.cash;

    const inflowItems: ExplanationLineItem[] = ledger.receivables
      .filter((r) => r.amount_minor > r.received_minor && r.due_date <= p30.date)
      .map((r) => ({
        id: r.id,
        name: `${r.customer_name} (${r.reference_number})`,
        amountMinor: r.amount_minor - r.received_minor,
        date: r.due_date,
        type: "INFLOW",
        entityType: "receivable",
      }));

    const outflowItems: ExplanationLineItem[] = ledger.invoices
      .filter((i) => ["APPROVED", "SCHEDULED"].includes(i.status) && i.due_date <= p30.date)
      .map((i) => ({
        id: i.id,
        name: `${ledger.vendors.find((v) => v.id === i.vendor_id)?.name || "Vendor"} (${i.invoice_number})`,
        amountMinor: i.total_minor,
        date: i.due_date,
        type: "OUTFLOW",
        entityType: "invoice",
      }));

    return {
      metricName: "PROJECTED_CASH",
      title: "30-Day Projected Cash Balance",
      currentValueMinor: projected,
      formattedValue: money(projected),
      level1Simple: `Projected cash in 30 days is ${money(projected)}, reflecting opening cash adjusted for scheduled collections and committed payables.`,
      level2Calculation: {
        formula: "Opening Cash + Expected Inflow − Committed Outflow = Projected Cash",
        terms: [
          { label: "Opening Cash", valueMinor: engine.cash, sign: "+" },
          { label: "Expected Inflow", valueMinor: inflows, sign: "+" },
          { label: "Committed Outflow", valueMinor: outflows, sign: "−" },
        ],
        resultMinor: projected,
      },
      level3Evidence: {
        calculationId: "cash-forecast-v1.0",
        calculationVersion: "cash-forecast-v1.0",
        methodology: "Deterministic cash runway model based on verified ledger receivables and approved commitments.",
        dataAsOf: engine.asOf,
        inflows: inflowItems,
        outflows: outflowItems,
        sourceRecordCount: inflowItems.length + outflowItems.length,
      },
    };
  }

  if (metricKey === "OUTSTANDING_PAYABLES") {
    const payables = engine.payables;
    const items: ExplanationLineItem[] = ledger.invoices
      .filter((i) => ["APPROVED", "SCHEDULED"].includes(i.status))
      .map((i) => ({
        id: i.id,
        name: `${ledger.vendors.find((v) => v.id === i.vendor_id)?.name || "Vendor"} · ${i.invoice_number}`,
        amountMinor: i.total_minor,
        date: i.due_date,
        type: "OUTFLOW",
        entityType: "invoice",
      }));

    return {
      metricName: "OUTSTANDING_PAYABLES",
      title: "Outstanding Payables",
      currentValueMinor: payables,
      formattedValue: money(payables),
      level1Simple: `Outstanding payables total ${money(payables)} across ${items.length} approved invoices awaiting settlement.`,
      level2Calculation: {
        formula: "Sum of Total Minor for all Approved and Scheduled Invoices",
        terms: items.slice(0, 5).map((it) => ({
          label: it.name,
          valueMinor: it.amountMinor,
          sign: "+",
        })),
        resultMinor: payables,
      },
      level3Evidence: {
        calculationId: "payables-v1.0",
        calculationVersion: "payables-v1.0",
        methodology: "Summation of uncancelled, approved vendor obligations not yet marked PAID.",
        dataAsOf: engine.asOf,
        inflows: [],
        outflows: items,
        sourceRecordCount: items.length,
      },
    };
  }

  // Fallback: Current Cash
  return {
    metricName: "CURRENT_CASH",
    title: "Current Verified Cash",
    currentValueMinor: engine.cash,
    formattedValue: money(engine.cash),
    level1Simple: `Current verified cash on hand is ${money(engine.cash)}.`,
    level2Calculation: {
      formula: "Opening Cash + Cumulative Receipts − Cumulative Payments = Current Cash",
      terms: [
        { label: "Opening Cash", valueMinor: ledger.company.opening_cash_minor, sign: "+" },
        { label: "Receipts", valueMinor: ledger.receipts.reduce((s, r) => s + r.amount_minor, 0), sign: "+" },
        { label: "Payments", valueMinor: ledger.payments.reduce((s, p) => s + p.amount_minor, 0), sign: "−" },
      ],
      resultMinor: engine.cash,
    },
    level3Evidence: {
      calculationId: "current-cash-v1.0",
      calculationVersion: "current-cash-v1.0",
      methodology: "Ledger double-entry verification of bank opening position and settled disbursements.",
      dataAsOf: engine.asOf,
      inflows: [],
      outflows: [],
      sourceRecordCount: ledger.payments.length + ledger.receipts.length,
    },
  };
}
