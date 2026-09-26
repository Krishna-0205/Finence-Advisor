import type { Ledger, Invoice } from "../../domain/types";
import { addDays, today } from "../../domain/money";
import { financialEngine, outstanding, paid } from "../finance";
import { risks } from "../risk";

export type TimingScenarioType =
  | "PAY_NOW"
  | "DELAY_7"
  | "DELAY_15"
  | "DELAY_30"
  | "SCHEDULE";

export interface PaymentTimingCost {
  lateFeeMinor: number;
  interestMinor: number;
  discountLostMinor: number;
  otherCostMinor: number;
  totalCostMinor: number;
  source: "CONTRACT" | "USER_INPUT" | "SYSTEM";
}

export interface PaymentTimingImpact {
  scenarioType: TimingScenarioType;
  label: string;
  paymentDate: string;
  currentDate: string;

  cashBeforeMinor: number;
  cashAfterPaymentMinor: number;

  projectedCashAt30DaysMinor: number;

  budgetRemainingBeforeMinor: number;
  budgetRemainingAfterMinor: number;
  budgetUtilizationPercent: number;

  cost: PaymentTimingCost;

  riskBefore: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  riskAfter: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

  assumptions: string[];

  calculationId: string;
  calculationVersion: string;
}

export interface MultiTimingComparison {
  invoiceId: string;
  invoiceNumber: string;
  vendorName: string;
  totalMinor: number;
  outstandingMinor: number;
  dueDate: string;
  scenarios: Record<TimingScenarioType, PaymentTimingImpact>;
  calculationVersion: string;
}

export const TIMING_SIMULATION_VERSION = "payment-timing-v1";

/**
 * Calculates late fee and cost penalties based on payment date vs invoice due date.
 */
export function calculatePaymentTimingCost(
  invoice: Invoice,
  paymentDate: string,
  balanceMinor: number,
): PaymentTimingCost {
  const isLate = paymentDate > invoice.due_date;
  let daysOverdue = 0;
  if (isLate) {
    const pDate = new Date(paymentDate + "T12:00:00Z");
    const dDate = new Date(invoice.due_date + "T12:00:00Z");
    daysOverdue = Math.max(
      0,
      Math.round((pDate.getTime() - dDate.getTime()) / (1000 * 60 * 60 * 24)),
    );
  }

  // 18% annual late fee rate (1.5% per month) prorated per day overdue
  const lateFeeMinor = isLate
    ? Math.round((balanceMinor * 0.18 * daysOverdue) / 365)
    : 0;

  // 2% early prompt discount lost if not paid within first 10 days of invoice date
  const earlyDiscountWindow = addDays(invoice.invoice_date, 10);
  const discountLostMinor =
    paymentDate > earlyDiscountWindow ? Math.round(balanceMinor * 0.02) : 0;

  const totalCostMinor = lateFeeMinor + discountLostMinor;

  return {
    lateFeeMinor,
    interestMinor: lateFeeMinor,
    discountLostMinor,
    otherCostMinor: 0,
    totalCostMinor,
    source: "CONTRACT",
  };
}

/**
 * Deterministically simulates a single payment timing scenario for an invoice.
 */
export function simulateSingleTimingScenario(
  ledger: Ledger,
  invoice: Invoice,
  scenarioType: TimingScenarioType,
  asOf = today(),
  customDate?: string,
): PaymentTimingImpact {
  let paymentDate: string;
  let label: string;

  switch (scenarioType) {
    case "PAY_NOW":
      paymentDate = asOf;
      label = "Pay today";
      break;
    case "DELAY_7":
      paymentDate = addDays(asOf, 7);
      label = "+7 days";
      break;
    case "DELAY_15":
      paymentDate = addDays(asOf, 15);
      label = "+15 days";
      break;
    case "DELAY_30":
      paymentDate = addDays(asOf, 30);
      label = "+30 days";
      break;
    case "SCHEDULE":
      paymentDate = customDate || addDays(asOf, 7);
      label = `Scheduled (${paymentDate})`;
      break;
  }

  const m = financialEngine(ledger, asOf);
  const balance = outstanding(ledger, invoice, asOf);
  const cost = calculatePaymentTimingCost(invoice, paymentDate, balance);

  // Cash today after payment
  const cashBeforeMinor = m.cash;
  const cashAfterPaymentMinor =
    scenarioType === "PAY_NOW" ? m.cash - balance : m.cash;

  // 30-day projection under this scenario
  const p30 = m.projections.find((p) => p.days === 30);
  const baseProjectedCash = p30 ? p30.cash : m.cash;

  // In 30 days, any payment made on or before 30 days is paid
  const isPaidWithin30Days = paymentDate <= addDays(asOf, 30);
  const projectedCashAt30DaysMinor = isPaidWithin30Days
    ? baseProjectedCash - (scenarioType === "PAY_NOW" ? 0 : balance) - cost.lateFeeMinor
    : baseProjectedCash;

  // Budget calculations
  const categoryBudget = m.budgets.find(
    (b) => b.category_id === invoice.category_id,
  );
  const budgetRemainingBeforeMinor = categoryBudget ? categoryBudget.remaining : 0;
  const budgetRemainingAfterMinor = categoryBudget
    ? categoryBudget.remaining - (scenarioType === "PAY_NOW" ? 0 : cost.lateFeeMinor)
    : 0;
  const budgetUtilizationPercent = categoryBudget ? categoryBudget.utilization : 0;

  // Deterministic risk evaluation
  const allRisks = risks(ledger);
  const invRisk = allRisks.find((r) => r.invoice_id === invoice.id);
  const riskBefore = invRisk ? invRisk.severity : "LOW";

  let riskAfter: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = riskBefore;
  if (scenarioType === "PAY_NOW") {
    // Paying now eliminates non-payment risk
    riskAfter = "LOW";
  } else if (paymentDate > invoice.due_date) {
    // Delaying past due date increases risk
    riskAfter = paymentDate > addDays(invoice.due_date, 15) ? "HIGH" : "MEDIUM";
  }

  return {
    scenarioType,
    label,
    paymentDate,
    currentDate: asOf,
    cashBeforeMinor,
    cashAfterPaymentMinor,
    projectedCashAt30DaysMinor,
    budgetRemainingBeforeMinor,
    budgetRemainingAfterMinor,
    budgetUtilizationPercent,
    cost,
    riskBefore,
    riskAfter,
    assumptions: [
      "No additional unexpected expenses occur during window",
      "Scheduled receivables arrive as forecast",
      "Invoice remains payable at full amount",
    ],
    calculationId: `calc_timing_${invoice.id}_${scenarioType}_${asOf.replace(/-/g, "")}`,
    calculationVersion: TIMING_SIMULATION_VERSION,
  };
}

/**
 * Runs full comparison of Pay Now vs +7d vs +15d vs +30d for an invoice.
 */
export function simulateAllTimingScenarios(
  ledger: Ledger,
  invoice: Invoice,
  asOf = today(),
  customDate?: string,
): MultiTimingComparison {
  const vendor = ledger.vendors.find((v) => v.id === invoice.vendor_id);
  const balance = outstanding(ledger, invoice, asOf);

  return {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoice_number,
    vendorName: vendor?.name || "Vendor",
    totalMinor: invoice.total_minor,
    outstandingMinor: balance,
    dueDate: invoice.due_date,
    scenarios: {
      PAY_NOW: simulateSingleTimingScenario(ledger, invoice, "PAY_NOW", asOf),
      DELAY_7: simulateSingleTimingScenario(ledger, invoice, "DELAY_7", asOf),
      DELAY_15: simulateSingleTimingScenario(ledger, invoice, "DELAY_15", asOf),
      DELAY_30: simulateSingleTimingScenario(ledger, invoice, "DELAY_30", asOf),
      SCHEDULE: simulateSingleTimingScenario(ledger, invoice, "SCHEDULE", asOf, customDate),
    },
    calculationVersion: TIMING_SIMULATION_VERSION,
  };
}
