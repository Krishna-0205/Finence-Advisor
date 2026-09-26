import type { Ledger } from "../../domain/types";
import type { DataLineage, DataLineageSource, LineageBackedKPI } from "../../domain/finance/data-lineage";
import { today } from "../../domain/money";
import { outstanding, remainingReceivable, paid } from "../finance";
import { CASH_FLOW_DRIVER_VERSION } from "../../domain/finance/cash-flow-drivers";
import { evaluateFreshness, getLastTransactionTimestamp } from "../../domain/finance/freshness";

export const CALCULATION_VERSIONS = {
  OUTSTANDING_PAYABLES: "payables-total-v3",
  EXPECTED_RECEIVABLES: "receivables-total-v2",
  CURRENT_CASH: "cash-reconciled-v2",
  BUDGET_EXPOSURE: "budget-exposure-v2",
  CASH_FLOW_DRIVERS: CASH_FLOW_DRIVER_VERSION,
  FORECAST_30D: "scenario-forecast-v1",
} as const;

// In-memory registry of calculations indexed by companyId -> calculationId
const calculationStore = new Map<string, Map<string, DataLineage>>();

function getCompanyStore(companyId: string): Map<string, DataLineage> {
  let store = calculationStore.get(companyId);
  if (!store) {
    store = new Map();
    calculationStore.set(companyId, store);
  }
  return store;
}

/**
 * Persists a calculation and its source lineage.
 */
export async function saveCalculation(
  companyId: string,
  calculation: DataLineage,
): Promise<DataLineage> {
  const store = getCompanyStore(companyId);
  store.set(calculation.calculationId, calculation);
  return calculation;
}

/**
 * Retrieves a calculation and its lineage for a company.
 */
export async function getMetricLineage(
  companyId: string,
  calculationId: string,
): Promise<DataLineage> {
  const store = getCompanyStore(companyId);
  const calculation = store.get(calculationId);

  if (!calculation) {
    throw new Error(
      `Calculation not found: ${calculationId} for company ${companyId}`,
    );
  }

  return calculation;
}

/**
 * Retrieves the source records for a specific calculation.
 */
export async function getCalculationSources(
  companyId: string,
  calculationId: string,
): Promise<DataLineageSource[]> {
  const calculation = await getMetricLineage(companyId, calculationId);
  return calculation.sourceRecords;
}

/**
 * Builds deterministic, auditable calculations for all major KPIs directly from a Ledger.
 * Every KPI receives a persistent calculationId and complete source record drill-down.
 */
export function buildLedgerCalculations(
  l: Ledger,
  asOf = today(),
): {
  calculations: Map<string, DataLineage>;
  kpis: {
    cash: LineageBackedKPI;
    payables: LineageBackedKPI;
    receivables: LineageBackedKPI;
    overduePayables: LineageBackedKPI;
    overdueReceivables: LineageBackedKPI;
  };
} {
  const calculations = new Map<string, DataLineage>();

  // 1. OUTSTANDING_PAYABLES
  const activeInvoices = l.invoices.filter(
    (i) =>
      i.status !== "REJECTED" &&
      (i.approved_at || ["APPROVED", "SCHEDULED", "PAID"].includes(i.status)),
  );

  const payableSources: DataLineageSource[] = [];
  let totalPayablesMinor = 0;

  for (const inv of activeInvoices) {
    const bal = outstanding(l, inv, asOf);
    if (bal > 0) {
      totalPayablesMinor += bal;
      const vendor = l.vendors.find((v) => v.id === inv.vendor_id);
      payableSources.push({
        recordId: inv.id,
        recordType: "INVOICE",
        referenceNumber: inv.invoice_number,
        counterparty: vendor?.name || "Vendor",
        date: inv.scheduled_payment_date || inv.due_date,
        amountMinor: bal,
        sourceDocumentId: inv.file_id || undefined,
        status: inv.status,
        description: inv.description,
        href: `/invoices/${inv.id}`,
      });
    }
  }

  const payablesCalcId = `calc_payables_${l.company.id}_${asOf.replace(/-/g, "")}`;
  const payablesLineage: DataLineage = {
    calculationId: payablesCalcId,
    metric: "OUTSTANDING_PAYABLES",
    calculationVersion: CALCULATION_VERSIONS.OUTSTANDING_PAYABLES,
    generatedAt: new Date().toISOString(),
    dataAsOf: asOf,
    formula: "SUM(invoice.amount - invoice.paid_amount WHERE status IN ('APPROVED','SCHEDULED','PARTIALLY_PAID'))",
    sourceRecords: payableSources,
    result: { currency: "INR", minor: totalPayablesMinor },
  };
  calculations.set(payablesCalcId, payablesLineage);

  // 2. EXPECTED_RECEIVABLES
  const receivableSources: DataLineageSource[] = [];
  let totalReceivablesMinor = 0;

  for (const r of l.receivables) {
    const rem = remainingReceivable(l, r.id, asOf);
    if (rem > 0) {
      totalReceivablesMinor += rem;
      receivableSources.push({
        recordId: r.id,
        recordType: "RECEIVABLE",
        referenceNumber: r.reference_number || r.id,
        counterparty: r.customer_name,
        date: r.due_date,
        amountMinor: rem,
        status: r.due_date < asOf ? "OVERDUE" : "DUE",
        href: "/cash-flow",
      });
    }
  }

  const receivablesCalcId = `calc_receivables_${l.company.id}_${asOf.replace(/-/g, "")}`;
  const receivablesLineage: DataLineage = {
    calculationId: receivablesCalcId,
    metric: "EXPECTED_RECEIVABLES",
    calculationVersion: CALCULATION_VERSIONS.EXPECTED_RECEIVABLES,
    generatedAt: new Date().toISOString(),
    dataAsOf: asOf,
    formula: "SUM(receivable.amount - receivable.received_amount WHERE remaining > 0)",
    sourceRecords: receivableSources,
    result: { currency: "INR", minor: totalReceivablesMinor },
  };
  calculations.set(receivablesCalcId, receivablesLineage);

  // 3. CURRENT_CASH
  const paidPayments = l.payments.filter(
    (p) =>
      p.status === "COMPLETED" &&
      p.payment_date >= l.company.opening_date &&
      p.payment_date <= asOf,
  );
  const receivedReceipts = l.receipts.filter(
    (r) =>
      r.receipt_date >= l.company.opening_date &&
      r.receipt_date <= asOf,
  );

  const totalPaid = paidPayments.reduce((s, p) => s + p.amount_minor, 0);
  const totalReceived = receivedReceipts.reduce((s, r) => s + r.amount_minor, 0);
  const currentCashMinor = l.company.opening_cash_minor + totalReceived - totalPaid;

  const cashSources: DataLineageSource[] = [
    {
      recordId: `opening_cash_${l.company.id}`,
      recordType: "CASH_FLOW",
      referenceNumber: "OPENING-BALANCE",
      counterparty: "Opening Cash",
      date: l.company.opening_date,
      amountMinor: l.company.opening_cash_minor,
      status: "OPENING",
      description: "Company opening cash balance",
    },
    ...receivedReceipts.map((r) => ({
      recordId: r.id,
      recordType: "RECEIPT" as const,
      referenceNumber: r.reference,
      counterparty: "Customer Collection",
      date: r.receipt_date,
      amountMinor: r.amount_minor,
      status: "RECEIVED",
      href: "/cash-flow",
    })),
    ...paidPayments.map((p) => {
      const inv = l.invoices.find((i) => i.id === p.invoice_id);
      const v = inv ? l.vendors.find((item) => item.id === inv.vendor_id) : undefined;
      return {
        recordId: p.id,
        recordType: "PAYMENT" as const,
        referenceNumber: p.reference || inv?.invoice_number || p.id,
        counterparty: v?.name || "Vendor",
        date: p.payment_date,
        amountMinor: -p.amount_minor,
        status: "DISBURSED",
        href: `/invoices/${p.invoice_id}`,
      };
    }),
  ];

  const cashCalcId = `calc_cash_${l.company.id}_${asOf.replace(/-/g, "")}`;
  const cashLineage: DataLineage = {
    calculationId: cashCalcId,
    metric: "CURRENT_CASH",
    calculationVersion: CALCULATION_VERSIONS.CURRENT_CASH,
    generatedAt: new Date().toISOString(),
    dataAsOf: asOf,
    formula: "opening_cash + SUM(receipts) − SUM(completed_payments)",
    sourceRecords: cashSources,
    result: { currency: "INR", minor: currentCashMinor },
  };
  calculations.set(cashCalcId, cashLineage);

  // 4. Overdue Payables
  const overduePayableSources = payableSources.filter((s) => s.date && s.date < asOf);
  const overduePayablesMinor = overduePayableSources.reduce((s, r) => s + (Number(r.amountMinor) || 0), 0);
  const overduePayablesCalcId = `calc_overdue_pay_${l.company.id}_${asOf.replace(/-/g, "")}`;
  calculations.set(overduePayablesCalcId, {
    calculationId: overduePayablesCalcId,
    metric: "OVERDUE_PAYABLES",
    calculationVersion: CALCULATION_VERSIONS.OUTSTANDING_PAYABLES,
    generatedAt: new Date().toISOString(),
    dataAsOf: asOf,
    formula: "SUM(invoice.outstanding WHERE due_date < current_date)",
    sourceRecords: overduePayableSources,
    result: { currency: "INR", minor: overduePayablesMinor },
  });

  // 5. Overdue Receivables
  const overdueReceivableSources = receivableSources.filter((s) => s.date && s.date < asOf);
  const overdueReceivablesMinor = overdueReceivableSources.reduce((s, r) => s + (Number(r.amountMinor) || 0), 0);
  const overdueReceivablesCalcId = `calc_overdue_rec_${l.company.id}_${asOf.replace(/-/g, "")}`;
  calculations.set(overdueReceivablesCalcId, {
    calculationId: overdueReceivablesCalcId,
    metric: "OVERDUE_RECEIVABLES",
    calculationVersion: CALCULATION_VERSIONS.EXPECTED_RECEIVABLES,
    generatedAt: new Date().toISOString(),
    dataAsOf: asOf,
    formula: "SUM(receivable.remaining WHERE due_date < current_date)",
    sourceRecords: overdueReceivableSources,
    result: { currency: "INR", minor: overdueReceivablesMinor },
  });

  // Save to in-memory company store
  const companyStore = getCompanyStore(l.company.id);
  for (const [id, calc] of calculations.entries()) {
    companyStore.set(id, calc);
  }

  const lastTxAt = getLastTransactionTimestamp(l);
  const now = new Date().toISOString();
  const cashFreshness = evaluateFreshness("REAL_TIME_CASH", now, asOf, lastTxAt);
  const payablesFreshness = evaluateFreshness("DAILY_BUDGET", now, asOf, lastTxAt);
  const receivablesFreshness = evaluateFreshness("DAILY_BUDGET", now, asOf, lastTxAt);

  return {
    calculations,
    kpis: {
      cash: {
        metric: "CURRENT_CASH",
        label: "Current cash",
        value: { currency: "INR", minor: currentCashMinor },
        lineage: {
          calculationId: cashCalcId,
          metric: "CURRENT_CASH",
          calculationVersion: CALCULATION_VERSIONS.CURRENT_CASH,
          generatedAt: cashLineage.generatedAt as string,
          dataAsOf: asOf,
          sourceRecordCount: cashSources.length,
          formula: cashLineage.formula,
        },
        freshness: cashFreshness,
      },
      payables: {
        metric: "OUTSTANDING_PAYABLES",
        label: "Outstanding payables",
        value: { currency: "INR", minor: totalPayablesMinor },
        lineage: {
          calculationId: payablesCalcId,
          metric: "OUTSTANDING_PAYABLES",
          calculationVersion: CALCULATION_VERSIONS.OUTSTANDING_PAYABLES,
          generatedAt: payablesLineage.generatedAt as string,
          dataAsOf: asOf,
          sourceRecordCount: payableSources.length,
          formula: payablesLineage.formula,
        },
        freshness: payablesFreshness,
      },
      receivables: {
        metric: "EXPECTED_RECEIVABLES",
        label: "Expected receivables",
        value: { currency: "INR", minor: totalReceivablesMinor },
        lineage: {
          calculationId: receivablesCalcId,
          metric: "EXPECTED_RECEIVABLES",
          calculationVersion: CALCULATION_VERSIONS.EXPECTED_RECEIVABLES,
          generatedAt: receivablesLineage.generatedAt as string,
          dataAsOf: asOf,
          sourceRecordCount: receivableSources.length,
          formula: receivablesLineage.formula,
        },
        freshness: receivablesFreshness,
      },
      overduePayables: {
        metric: "OVERDUE_PAYABLES",
        label: "Overdue payables",
        value: { currency: "INR", minor: overduePayablesMinor },
        lineage: {
          calculationId: overduePayablesCalcId,
          metric: "OVERDUE_PAYABLES",
          calculationVersion: CALCULATION_VERSIONS.OUTSTANDING_PAYABLES,
          generatedAt: payablesLineage.generatedAt as string,
          dataAsOf: asOf,
          sourceRecordCount: overduePayableSources.length,
        },
        freshness: payablesFreshness,
      },
      overdueReceivables: {
        metric: "OVERDUE_RECEIVABLES",
        label: "Overdue receivables",
        value: { currency: "INR", minor: overdueReceivablesMinor },
        lineage: {
          calculationId: overdueReceivablesCalcId,
          metric: "OVERDUE_RECEIVABLES",
          calculationVersion: CALCULATION_VERSIONS.EXPECTED_RECEIVABLES,
          generatedAt: receivablesLineage.generatedAt as string,
          dataAsOf: asOf,
          sourceRecordCount: overdueReceivableSources.length,
        },
        freshness: receivablesFreshness,
      },
    },
  };
}
