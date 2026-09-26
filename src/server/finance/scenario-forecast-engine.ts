import type { Money } from "../../domain/finance/money";
import {
  FORECAST_SCENARIO_DEFINITIONS,
  type ForecastScenario,
  type ForecastScenarioDefinition,
} from "../../domain/finance/forecast-scenario";
import {
  calculateForecastConfidence,
  type ConfidenceInput,
} from "./forecast-confidence";
import type {
  ForecastConfidence,
  ForecastResult,
  ForecastAssumption,
} from "../../domain/finance/forecast";
import type { Ledger } from "../../domain/types";
import { addDays, today } from "../../domain/money";
import {
  outstanding,
  remainingReceivable,
  classifyInvoiceOrPayment,
} from "../finance";
import {
  getLastTransactionTimestamp,
  evaluateFreshness,
  type DataFreshness,
} from "../../domain/finance/freshness";

export interface ForecastTransaction {
  id: string;
  reference: string;
  amount: Money;
  expectedDate: string;
  type:
    | "RECEIVABLE"
    | "PAYABLE"
    | "OPERATING_EXPENSE"
    | "INVESTING"
    | "FINANCING";
  discretionary?: boolean;
  vendorOrCustomer?: string;
}

export interface ScenarioForecastInput {
  companyId: string;
  asOf: string;
  horizonDays: number;
  openingCash: Money;
  transactions: ForecastTransaction[];
  confidenceInput?: ConfidenceInput;
}

export interface ScenarioTransactionImpact {
  id: string;
  reference: string;
  type: ForecastTransaction["type"];
  originalDate: string;
  adjustedDate: string;
  originalAmountMinor: number;
  adjustedAmountMinor: number;
  includedInHorizon: boolean;
  notes?: string;
}

export interface ScenarioResult {
  scenario: ForecastScenario;
  description: string;
  projectedCash: Money;
  inflow: Money;
  outflow: Money;
  netChange: Money;
  assumptions: {
    receivableDelayDays: number;
    payableTimingDays: number;
    discretionaryExpenseAdjustment: number;
  };
  impacts: ScenarioTransactionImpact[];
  reasons: string[];
}

export interface MultiScenarioForecastResult {
  companyId: string;
  asOf: string;
  horizonDays: number;
  horizonDate: string;
  currentCash: Money;
  scenarios: Record<ForecastScenario, ScenarioResult>;
  confidence: ForecastConfidence;
  assumptions: ForecastAssumption[];
  lineage: {
    formula: string;
    sourceRecordCount: number;
    payablesCount: number;
    receivablesCount: number;
    overduePayablesCount: number;
    overdueReceivablesCount: number;
  };
  generatedAt: string;
  freshness?: DataFreshness;
}

/**
 * Calculates deterministic forecast for a single scenario based on explicit assumptions.
 */
export function calculateScenarioForecast(
  input: ScenarioForecastInput,
  definition: ForecastScenarioDefinition,
): ScenarioResult {
  const horizonCutoff = addDays(input.asOf, input.horizonDays);
  const impacts: ScenarioTransactionImpact[] = [];

  let totalInflowMinor = 0;
  let totalOutflowMinor = 0;

  // Explicit assumptions
  // receivableCollectionAdjustment is negative for delay, e.g. -14 means 14 days later
  const receivableDelayDays = definition.assumptions.receivableCollectionAdjustment < 0
    ? Math.abs(definition.assumptions.receivableCollectionAdjustment)
    : 0;

  // payableTimingAdjustmentDays: negative means pay earlier, positive means pay later
  const payableTimingDays = definition.assumptions.payableTimingAdjustmentDays;
  const discretionaryExpenseAdjustment = definition.assumptions.discretionaryExpenseAdjustment;

  for (const tx of input.transactions) {
    if (tx.type === "RECEIVABLE") {
      // Receivables are delayed in conservative scenario
      const adjustedDate = receivableDelayDays > 0
        ? addDays(tx.expectedDate, receivableDelayDays)
        : tx.expectedDate;

      // Check if collections fall within the forecast horizon
      const included = adjustedDate <= horizonCutoff;
      const adjustedAmount = tx.amount.minor;

      if (included) {
        totalInflowMinor += adjustedAmount;
      }

      impacts.push({
        id: tx.id,
        reference: tx.reference,
        type: tx.type,
        originalDate: tx.expectedDate,
        adjustedDate,
        originalAmountMinor: tx.amount.minor,
        adjustedAmountMinor: adjustedAmount,
        includedInHorizon: included,
        notes: receivableDelayDays > 0 ? `Delayed by ${receivableDelayDays} days` : undefined,
      });
    } else {
      // Outflows: Payables, Operating Expenses, Investing, Financing
      // Payable timing adjustment:
      // Negative payableTimingDays means accelerating payments (e.g. -7 days earlier)
      // Positive payableTimingDays means deferring payments (e.g. +7 days later)
      const adjustedDate = payableTimingDays !== 0
        ? addDays(tx.expectedDate, payableTimingDays)
        : tx.expectedDate;

      // Discretionary expense adjustment applies if tx.discretionary or if OPEX
      let adjustedAmount = tx.amount.minor;
      let notes: string | undefined;

      if (tx.discretionary && discretionaryExpenseAdjustment !== 0) {
        const factor = 1 + discretionaryExpenseAdjustment;
        adjustedAmount = Math.max(0, Math.round(tx.amount.minor * factor));
        const pct = Math.round(discretionaryExpenseAdjustment * 100);
        notes = `${pct > 0 ? "+" : ""}${pct}% discretionary adjustment`;
      }

      const included = adjustedDate <= horizonCutoff;
      if (included) {
        totalOutflowMinor += adjustedAmount;
      }

      impacts.push({
        id: tx.id,
        reference: tx.reference,
        type: tx.type,
        originalDate: tx.expectedDate,
        adjustedDate,
        originalAmountMinor: tx.amount.minor,
        adjustedAmountMinor: adjustedAmount,
        includedInHorizon: included,
        notes,
      });
    }
  }

  const projectedCashMinor = input.openingCash.minor + totalInflowMinor - totalOutflowMinor;

  const reasons: string[] = [
    definition.description,
    receivableDelayDays > 0
      ? `Collections delayed by ${receivableDelayDays} days reduce in-horizon receipts`
      : "Standard receipt timing",
    payableTimingDays < 0
      ? `Payables accelerated by ${Math.abs(payableTimingDays)} days pull cash outflows forward`
      : payableTimingDays > 0
        ? `Vendor disbursements deferred by ${payableTimingDays} days preserve near-term cash`
        : "Standard payment timing",
  ];

  if (discretionaryExpenseAdjustment !== 0) {
    const pct = Math.round(discretionaryExpenseAdjustment * 100);
    reasons.push(`Discretionary expenses adjusted by ${pct > 0 ? "+" : ""}${pct}%`);
  }

  return {
    scenario: definition.scenario,
    description: definition.description,
    projectedCash: {
      currency: input.openingCash.currency,
      minor: projectedCashMinor,
    },
    inflow: {
      currency: input.openingCash.currency,
      minor: totalInflowMinor,
    },
    outflow: {
      currency: input.openingCash.currency,
      minor: totalOutflowMinor,
    },
    netChange: {
      currency: input.openingCash.currency,
      minor: totalInflowMinor - totalOutflowMinor,
    },
    assumptions: {
      receivableDelayDays,
      payableTimingDays,
      discretionaryExpenseAdjustment,
    },
    impacts,
    reasons,
  };
}

/**
 * Calculates all defined scenarios (BASE, CONSERVATIVE, OPTIMISTIC).
 */
export function calculateAllScenarios(
  input: ScenarioForecastInput,
): Record<ForecastScenario, ScenarioResult> {
  const results = {} as Record<ForecastScenario, ScenarioResult>;

  for (const def of FORECAST_SCENARIO_DEFINITIONS) {
    results[def.scenario] = calculateScenarioForecast(input, def);
  }

  return results;
}

/**
 * Builds standard ForecastTransactions from an active Ledger.
 */
export function buildForecastTransactions(
  l: Ledger,
  asOf = today(),
): {
  transactions: ForecastTransaction[];
  overduePayablesCount: number;
  overdueReceivablesCount: number;
} {
  const transactions: ForecastTransaction[] = [];
  let overduePayablesCount = 0;
  let overdueReceivablesCount = 0;

  // 1. Receivables
  for (const r of l.receivables) {
    const rem = remainingReceivable(l, r.id, asOf);
    if (rem > 0) {
      if (r.due_date < asOf) overdueReceivablesCount++;
      transactions.push({
        id: r.id,
        reference: r.reference_number || r.id,
        amount: { currency: r.currency_code || "INR", minor: rem },
        expectedDate: r.due_date,
        type: "RECEIVABLE",
        vendorOrCustomer: r.customer_name,
      });
    }
  }

  // 2. Payables (active approved or committed invoices)
  const activeInvoices = l.invoices.filter(
    (i) => i.status !== "REJECTED" && (i.approved_at || ["APPROVED", "SCHEDULED", "PAID"].includes(i.status)),
  );

  for (const inv of activeInvoices) {
    const bal = outstanding(l, inv, asOf);
    if (bal > 0) {
      const dueDate = inv.scheduled_payment_date || inv.due_date;
      if (dueDate < asOf) overduePayablesCount++;

      const cls = classifyInvoiceOrPayment(l, inv.id);
      const cat = l.categories.find((c) => c.id === inv.category_id)?.name.toLowerCase() || "";
      const desc = (inv.description || "").toLowerCase();

      // Check if discretionary
      const isDiscretionary =
        cat.includes("travel") ||
        cat.includes("marketing") ||
        cat.includes("software") ||
        cat.includes("office") ||
        cat.includes("admin") ||
        desc.includes("renewal") ||
        desc.includes("consulting");

      let type: ForecastTransaction["type"] = "PAYABLE";
      if (cls.category === "INVESTING") type = "INVESTING";
      else if (cls.category === "FINANCING") type = "FINANCING";
      else if (cls.type === "OPERATING_EXPENSES") type = "OPERATING_EXPENSE";

      const vendor = l.vendors.find((v) => v.id === inv.vendor_id);

      transactions.push({
        id: inv.id,
        reference: inv.invoice_number,
        amount: { currency: inv.currency_code || "INR", minor: bal },
        expectedDate: dueDate,
        type,
        discretionary: isDiscretionary,
        vendorOrCustomer: vendor?.name,
      });
    }
  }

  return { transactions, overduePayablesCount, overdueReceivablesCount };
}

/**
 * Top-level auditable multi-scenario forecast generator from a Ledger.
 * Directly integrates with financialEngine and produces explainable evidence.
 */
export function generateForecastResult(
  l: Ledger,
  asOf = today(),
  horizonDays = 30,
  currentCash?: number,
): MultiScenarioForecastResult {
  const cashMinor = currentCash ?? (() => {
    const out = l.payments
      .filter(
        (p) =>
          p.status === "COMPLETED" &&
          p.payment_date >= l.company.opening_date &&
          p.payment_date <= asOf,
      )
      .reduce((s, p) => s + p.amount_minor, 0);
    const received = l.receipts
      .filter(
        (r) =>
          r.receipt_date >= l.company.opening_date &&
          r.receipt_date <= asOf,
      )
      .reduce((s, r) => s + r.amount_minor, 0);
    return l.company.opening_cash_minor + received - out;
  })();

  const { transactions, overduePayablesCount, overdueReceivablesCount } =
    buildForecastTransactions(l, asOf);

  const upcomingPayables = transactions.filter((t) => t.type !== "RECEIVABLE").length;
  const upcomingReceivables = transactions.filter((t) => t.type === "RECEIVABLE").length;

  // Calculate historical depth (months between company opening date and asOf)
  const openDate = new Date(l.company.opening_date);
  const curDate = new Date(asOf);
  const diffMonths = Math.max(
    1,
    (curDate.getFullYear() - openDate.getFullYear()) * 12 +
      (curDate.getMonth() - openDate.getMonth()),
  );

  // Measure historical behavior reliability
  const totalReceived = l.receipts.reduce((s, r) => s + r.amount_minor, 0);
  const totalReceivables = l.receivables.reduce((s, r) => s + r.amount_minor, 0);
  const collectionReliability = totalReceivables > 0
    ? Math.min(1, Math.max(0.6, totalReceived / totalReceivables))
    : 0.9;

  const totalPayments = l.payments.filter((p) => p.status === "COMPLETED").length;
  const paymentReliability = totalPayments > 0 ? 0.95 : 0.85;

  const dataCompleteness = l.budgets.length > 0 && l.categories.length > 0 ? 1.0 : 0.85;

  const now = new Date().toISOString();
  const lastTxAt = getLastTransactionTimestamp(l);
  const freshness = evaluateFreshness("FORECAST", now, asOf, lastTxAt);

  const confidenceInput: ConfidenceInput = {
    upcomingPayables,
    upcomingReceivables,
    historicalMonths: diffMonths,
    overdueReceivables: overdueReceivablesCount,
    collectionReliability: Math.round(collectionReliability * 100) / 100,
    paymentReliability,
    dataCompleteness,
    dataFreshness: freshness.status,
  };

  const confidence = calculateForecastConfidence(confidenceInput);

  const scenarioInput: ScenarioForecastInput = {
    companyId: l.company.id,
    asOf,
    horizonDays,
    openingCash: { currency: "INR", minor: cashMinor },
    transactions,
    confidenceInput,
  };

  const scenarios = calculateAllScenarios(scenarioInput);

  const assumptions: ForecastAssumption[] = [
    {
      key: "horizon",
      description: "Forecast Horizon",
      value: `${horizonDays} days (through ${addDays(asOf, horizonDays)})`,
    },
    {
      key: "base_scenario",
      description: "Base Scenario Assumption",
      value: "Expected payment and collection dates based on contractual obligations.",
    },
    {
      key: "conservative_scenario",
      description: "Conservative Scenario Assumption",
      value: "Receivables delayed by 14 days; payables accelerated by 7 days; discretionary expenses +10%.",
    },
    {
      key: "optimistic_scenario",
      description: "Optimistic Scenario Assumption",
      value: "Contractual collections on time; vendor deferrals by 7 days; discretionary expenses -10%.",
    },
    {
      key: "arithmetic_engine",
      description: "Calculation Engine",
      value: "Deterministic integer paise arithmetic; no statistical interpolation or LLM number invention.",
    },
  ];

  return {
    companyId: l.company.id,
    asOf,
    horizonDays,
    horizonDate: addDays(asOf, horizonDays),
    currentCash: { currency: "INR", minor: cashMinor },
    scenarios,
    confidence,
    assumptions,
    freshness,
    lineage: {
      formula: "Projected Cash = Current Cash + In-Horizon Inflows − In-Horizon Outflows",
      sourceRecordCount: transactions.length,
      payablesCount: upcomingPayables,
      receivablesCount: upcomingReceivables,
      overduePayablesCount,
      overdueReceivablesCount,
    },
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Returns a standard ForecastResult matching the domain forecast interface.
 */
export function getStandardForecastResult(
  l: Ledger,
  asOf = today(),
  horizonDays = 30,
): ForecastResult {
  const multi = generateForecastResult(l, asOf, horizonDays);
  return {
    companyId: multi.companyId,
    asOf: multi.asOf,
    horizonDays: multi.horizonDays,
    projectedCash: multi.scenarios.BASE.projectedCash,
    confidence: multi.confidence,
    assumptions: multi.assumptions,
    generatedAt: multi.generatedAt,
  };
}
