import type {
  CashFlowDriver,
  CashFlowDriverAnalysis,
  CashFlowDriverType,
  ReceivableDelayEvent,
} from "../../domain/finance/cash-flow-drivers";
import { CASH_FLOW_DRIVER_VERSION } from "../../domain/finance/cash-flow-drivers";
import type { LineageTrail, LineageSourceRecord } from "../../domain/finance/lineage";
import type { Ledger } from "../../domain/types";
import { today } from "../../domain/money";
import {
  classifyInvoiceOrPayment,
  paid,
  remainingReceivable,
} from "../finance";

export interface DriverRecord {
  id: string;
  type: CashFlowDriverType;
  amountMinor: bigint | number;
  currency: string;
  reference?: string;
  counterparty?: string;
  date?: string;
  description?: string;
  sourceType?: "INVOICE" | "PAYMENT" | "RECEIVABLE" | "RECEIPT" | "BUDGET";
}

export interface DriverInput {
  periodStart: Date | string;
  periodEnd: Date | string;
  records: DriverRecord[];
}

export const CALCULATION_VERSION = CASH_FLOW_DRIVER_VERSION;

/**
 * Creates an auditable driver record from a ReceivableDelayEvent.
 * Treats delayed receivables as a mathematically defensible cash timing impact.
 */
export function createReceivableDelayDriver(
  event: ReceivableDelayEvent,
): DriverRecord {
  const amountMinor =
    typeof event.amount.minor === "bigint"
      ? event.amount.minor
      : BigInt(event.amount.minor);

  return {
    id: event.receivableId,
    type: "RECEIVABLE_DELAYS",
    amountMinor: -amountMinor,
    currency: event.amount.currency,
    description:
      event.reason ||
      `Collection delayed from ${String(event.originalExpectedDate)} to ${String(event.revisedExpectedDate)}`,
    sourceType: "RECEIVABLE",
  };
}

export function calculateCashFlowDrivers(
  input: DriverInput,
): CashFlowDriverAnalysis {
  const grouped = new Map<
    CashFlowDriverType,
    DriverRecord[]
  >();

  for (const record of input.records) {
    const existing =
      grouped.get(record.type) ?? [];

    existing.push(record);

    grouped.set(record.type, existing);
  }

  const totalImpact = input.records.reduce(
    (sum, record) => sum + BigInt(record.amountMinor),
    0n,
  );

  const drivers: CashFlowDriver[] =
    [...grouped.entries()]
      .map(([type, records]) => {
        const impact = records.reduce(
          (sum, record) =>
            sum + BigInt(record.amountMinor),
          0n,
        );

        return {
          type,
          label: getDriverLabel(type),

          impact: {
            currency: records[0]?.currency ?? "INR",
            minor: Number(impact),
          },

          contributionPercent:
            calculateContribution(
              impact,
              totalImpact,
            ),

          sourceRecordCount:
            records.length,

          sourceRecordIds:
            records.map((record) => record.id),

          explanation:
            getDriverExplanation(type),
        };
      })
      .sort(
        (a, b) =>
          Number(absolute(BigInt(b.impact.minor)) -
          absolute(BigInt(a.impact.minor))),
      );

  return {
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,

    totalCashChange: {
      currency:
        input.records[0]?.currency ?? "INR",
      minor: Number(totalImpact),
    },

    drivers,

    primaryDriver:
      drivers[0]?.type ?? null,

    calculationVersion:
      CALCULATION_VERSION,

    generatedAt: new Date(),
  };
}

export function absolute(value: bigint): bigint {
  return value < 0n ? -value : value;
}

export function calculateContribution(
  impact: bigint,
  totalImpact: bigint,
): number {
  if (totalImpact === 0n) {
    return 0;
  }

  return Number(
    (absolute(impact) * 10000n) /
      absolute(totalImpact),
  ) / 100;
}

export function getDriverLabel(
  type: CashFlowDriverType,
): string {
  switch (type) {
    case "SUPPLIER_PAYMENTS":
      return "Supplier payments";

    case "RECEIVABLE_DELAYS":
      return "Receivables delayed";

    case "OPERATING_EXPENSES":
      return "Operating expenses";

    case "INVESTING":
      return "Investing activities";

    case "FINANCING":
      return "Financing activities";

    case "OTHER":
      return "Other";

    default:
      return "Unknown";
  }
}

export function getDriverExplanation(
  type: CashFlowDriverType,
): string {
  switch (type) {
    case "SUPPLIER_PAYMENTS":
      return "Cash paid to suppliers.";

    case "RECEIVABLE_DELAYS":
      return "Expected collections that have been delayed.";

    case "OPERATING_EXPENSES":
      return "Cash used for operating expenses.";

    case "INVESTING":
      return "Cash impact from investing activities.";

    case "FINANCING":
      return "Cash impact from financing activities.";

    case "OTHER":
      return "Other classified cash movements.";

    default:
      return "Cash movement.";
  }
}

/**
 * Extracts deterministic driver records from a Ledger.
 * Specifically treats delayed receivables as a distinct driver representing
 * the liquidity shortfall between scheduled and actual receipt.
 */
export function extractLedgerDriverRecords(
  l: Ledger,
  periodStart = l.company.opening_date,
  periodEnd = today(),
  asOf = today(),
): DriverRecord[] {
  const records: DriverRecord[] = [];

  // 1. Completed Payments categorized by business activity
  const completedPayments = l.payments.filter(
    (p) =>
      p.status === "COMPLETED" &&
      p.payment_date >= periodStart &&
      p.payment_date <= periodEnd,
  );

  for (const p of completedPayments) {
    const inv = l.invoices.find((i) => i.id === p.invoice_id);
    const classification = inv
      ? classifyInvoiceOrPayment(l, inv.id)
      : { category: "OPERATING", type: "SUPPLIER_PAYMENTS" };

    let driverType: CashFlowDriverType = "SUPPLIER_PAYMENTS";
    if (classification.category === "INVESTING") {
      driverType = "INVESTING";
    } else if (classification.category === "FINANCING") {
      driverType = "FINANCING";
    } else if (classification.type === "OPERATING_EXPENSES") {
      driverType = "OPERATING_EXPENSES";
    }

    const vendor = inv ? l.vendors.find((v) => v.id === inv.vendor_id) : undefined;

    records.push({
      id: p.id,
      type: driverType,
      // Outflows reduce cash (negative impact)
      amountMinor: -BigInt(p.amount_minor),
      currency: "INR",
      reference: p.reference || inv?.invoice_number || p.id,
      counterparty: vendor?.name || "Vendor",
      date: p.payment_date,
      description: inv?.description || "Payment disbursement",
      sourceType: "PAYMENT",
    });
  }

  // 2. Delayed Receivables:
  // Receivables whose contractual due date falls in or before this period, but remain unpaid as of asOf.
  // Their impact is the collection delay shortfall (represented as missing expected inflow).
  for (const r of l.receivables) {
    const rem = remainingReceivable(l, r.id, asOf);
    if (rem > 0 && r.due_date <= periodEnd) {
      records.push({
        id: r.id,
        type: "RECEIVABLE_DELAYS",
        amountMinor: -BigInt(rem),
        currency: r.currency_code || "INR",
        reference: r.reference_number || r.id,
        counterparty: r.customer_name,
        date: r.due_date,
        description: `Overdue receivable of ₹${(rem / 100).toLocaleString("en-IN")} past due date ${r.due_date}`,
        sourceType: "RECEIVABLE",
      });
    }
  }

  return records;
}

export interface CashFlowDriverWithLineage extends CashFlowDriverAnalysis {
  lineage: LineageTrail;
  records: LineageSourceRecord[];
}

/**
 * Builds a complete CashFlowDriverAnalysis alongside an auditable LineageTrail.
 */
export function generateLedgerDriverAnalysis(
  l: Ledger,
  periodStart = l.company.opening_date,
  periodEnd = today(),
  asOf = today(),
): CashFlowDriverWithLineage {
  const driverRecords = extractLedgerDriverRecords(l, periodStart, periodEnd, asOf);

  const analysis = calculateCashFlowDrivers({
    periodStart,
    periodEnd,
    records: driverRecords,
  });

  const lineageRecords: LineageSourceRecord[] = driverRecords.map((r) => {
    const minorVal = typeof r.amountMinor === "bigint" ? Number(r.amountMinor) : r.amountMinor;
    return {
      id: r.id,
      sourceType: r.sourceType || "PAYMENT",
      reference: r.reference || r.id,
      counterparty: r.counterparty || "",
      date: r.date || asOf,
      amount: { currency: r.currency, minor: Math.abs(minorVal) },
      direction: minorVal < 0 ? "OUTFLOW" : minorVal > 0 ? "INFLOW" : "NEUTRAL",
      driverType: r.type,
      status: r.type === "RECEIVABLE_DELAYS" ? "DELAYED_UNPAID" : "SETTLED",
      href: r.sourceType === "RECEIVABLE" ? "/cash-flow" : "/ledger",
      description: r.description,
    };
  });

  const lineage: LineageTrail = {
    metricKey: "total_cash_change",
    metricLabel: "Total Cash Change",
    value: analysis.totalCashChange,
    formula: "Net change = Sum of verified driver impacts (inflows − outflows − delayed shortfall)",
    calculationVersion: CALCULATION_VERSION,
    generatedAt: new Date().toISOString(),
    dataTimestamp: asOf,
    sourceRecordCount: driverRecords.length,
    sourceRecordIds: driverRecords.map((r) => r.id),
    records: lineageRecords,
  };

  return {
    ...analysis,
    lineage,
    records: lineageRecords,
  };
}
