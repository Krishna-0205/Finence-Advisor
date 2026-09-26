import type { Ledger, Invoice, Payment, Receipt } from "../domain/types";
import { addDays, today } from "../domain/money";
import { generateForecastResult } from "./finance/scenario-forecast-engine";
import { generateLedgerDriverAnalysis } from "./finance/cash-flow-driver-engine";
import { calculatePaymentScheduleSummary } from "../domain/finance/payment-scheduling";
import { calculateReceivablesIntelligence } from "./finance/collections-intelligence";
import {
  calculateCustomerPaymentBehaviors,
  getBehavioralExpectedCollectionDate,
} from "../domain/finance/customer-behavior";
import { calculateVendorIntelligence } from "../domain/finance/vendor-intelligence";
import { calculateSpendConcentration } from "../domain/finance/spend-concentration";
import {
  buildLedgerCalculations,
  getMetricLineage,
  getCalculationSources,
} from "./finance/calculation-repository";
import { calculateReconciliation, type ReconciliationSummary } from "../domain/finance/reconciliation";
import {
  evaluateFreshness,
  getLastTransactionTimestamp,
  type DataFreshness,
} from "../domain/finance/freshness";
export {
  calculateCashFlowDrivers,
  generateLedgerDriverAnalysis,
} from "./finance/cash-flow-driver-engine";
export {
  getMetricLineage,
  getCalculationSources,
  buildLedgerCalculations,
} from "./finance/calculation-repository";

export type IAS7Category = "OPERATING" | "INVESTING" | "FINANCING";

export type IAS7ActivityType =
  | "CUSTOMER_COLLECTIONS"
  | "SUPPLIER_PAYMENTS"
  | "OPERATING_EXPENSES"
  | "ASSET_PURCHASE"
  | "ASSET_SALE"
  | "LOAN_RECEIVED"
  | "LOAN_REPAYMENT"
  | "EQUITY_TRANSACTION";

export interface IAS7FlowItem {
  id: string;
  category: IAS7Category;
  type: IAS7ActivityType;
  title: string;
  date: string;
  amount_minor: number;
  reference?: string;
  entity_name?: string;
  is_projected?: boolean;
}

export interface IAS7Statement {
  asOf: string;
  opening_cash_minor: number;
  operating: {
    customer_collections_minor: number;
    supplier_payments_minor: number;
    operating_expenses_minor: number;
    net_minor: number;
    items: IAS7FlowItem[];
  };
  investing: {
    asset_purchases_minor: number;
    asset_sales_minor: number;
    net_minor: number;
    items: IAS7FlowItem[];
  };
  financing: {
    loans_received_minor: number;
    loan_repayments_minor: number;
    equity_transactions_minor: number;
    net_minor: number;
    items: IAS7FlowItem[];
  };
  net_change_minor: number;
  closing_cash_minor: number;
}

export function classifyInvoiceOrPayment(
  l: Ledger,
  invoiceId: string,
): {
  category: IAS7Category;
  type: IAS7ActivityType;
  label: string;
} {
  const inv = l.invoices.find((i) => i.id === invoiceId);
  if (!inv) {
    return {
      category: "OPERATING",
      type: "SUPPLIER_PAYMENTS",
      label: "Supplier payment",
    };
  }
  const cat =
    l.categories.find((c) => c.id === inv.category_id)?.name.toLowerCase() || "";
  const desc = (inv.description || "").toLowerCase();

  // Investing activities: asset purchases, equipment, capex
  if (
    cat.includes("asset") ||
    cat.includes("capital") ||
    cat.includes("equipment") ||
    desc.includes("asset purchase") ||
    desc.includes("machinery") ||
    desc.includes("hardware purchase")
  ) {
    return {
      category: "INVESTING",
      type: "ASSET_PURCHASE",
      label: "Asset purchase (Capex)",
    };
  }

  // Financing activities: loan repayments, borrowing, equity
  if (
    cat.includes("loan") ||
    cat.includes("financing") ||
    cat.includes("equity") ||
    desc.includes("loan repayment") ||
    desc.includes("interest") ||
    desc.includes("dividend")
  ) {
    return {
      category: "FINANCING",
      type: "LOAN_REPAYMENT",
      label: "Loan repayment",
    };
  }

  // Operating Expenses: office renewal, facilities, administrative, overhead
  if (
    cat.includes("operations") ||
    cat.includes("admin") ||
    cat.includes("office") ||
    cat.includes("facilities") ||
    desc.includes("renewal") ||
    desc.includes("utilities") ||
    desc.includes("rent")
  ) {
    return {
      category: "OPERATING",
      type: "OPERATING_EXPENSES",
      label: "Operating expense",
    };
  }

  // Trade suppliers (technology, logistics, components, SaaS)
  return {
    category: "OPERATING",
    type: "SUPPLIER_PAYMENTS",
    label: "Supplier payment",
  };
}

export function classifyReceipt(
  l: Ledger,
  r: Receipt,
): {
  category: IAS7Category;
  type: IAS7ActivityType;
  label: string;
} {
  const rec = l.receivables.find((item) => item.id === r.receivable_id);
  const ref = (r.reference || "").toLowerCase();
  const cust = (rec?.customer_name || "").toLowerCase();

  if (ref.includes("asset") || cust.includes("asset sale")) {
    return {
      category: "INVESTING",
      type: "ASSET_SALE",
      label: "Asset sale proceeds",
    };
  }

  if (ref.includes("loan") || ref.includes("borrowing")) {
    return {
      category: "FINANCING",
      type: "LOAN_RECEIVED",
      label: "Loan proceeds received",
    };
  }

  if (
    ref.includes("equity") ||
    ref.includes("capital") ||
    cust.includes("investor")
  ) {
    return {
      category: "FINANCING",
      type: "EQUITY_TRANSACTION",
      label: "Equity transaction",
    };
  }

  return {
    category: "OPERATING",
    type: "CUSTOMER_COLLECTIONS",
    label: "Customer collection",
  };
}

export const committed = (i: Invoice) =>
  !!i.approved_at || ["APPROVED", "SCHEDULED", "PAID"].includes(i.status);
export function paid(l: Ledger, id: string, asOf = today()) {
  return l.payments
    .filter(
      (p) =>
        p.invoice_id === id &&
        p.status === "COMPLETED" &&
        p.payment_date <= asOf,
    )
    .reduce((s, p) => s + p.amount_minor, 0);
}
export function outstanding(l: Ledger, i: Invoice, asOf = today()) {
  return Math.max(0, i.total_minor - paid(l, i.id, asOf));
}
export function remainingReceivable(l: Ledger, id: string, asOf = today()) {
  const r = l.receivables.find((r) => r.id === id)!;
  return Math.max(
    0,
    r.amount_minor -
      l.receipts
        .filter((p) => p.receivable_id === id && p.receipt_date <= asOf)
        .reduce((s, p) => s + p.amount_minor, 0),
  );
}
export function calculateBudgets(l: Ledger, asOf = today()) {
  const active = l.invoices.filter((i) => i.status !== "REJECTED");
  return l.budgets.map((b) => {
    const invoices = active.filter(
      (i) =>
        i.category_id === b.category_id &&
        i.invoice_date >= b.period_start &&
        i.invoice_date <= b.period_end,
    );
    const actual = invoices.reduce(
      (s, i) => s + Math.min(paid(l, i.id, asOf), i.total_minor),
      0,
    );
    const committed = invoices.reduce((s, i) => s + outstanding(l, i, asOf), 0);
    return {
      ...b,
      name:
        l.categories.find((c) => c.id === b.category_id)?.name ||
        "Uncategorized",
      actual,
      committed,
      remaining: b.budget_minor - actual - committed,
      utilization: b.budget_minor ? ((actual + committed) / b.budget_minor) * 100 : 0,
      source_records: invoices.map((i) => i.id),
    };
  });
}

export function financialEngine(l: Ledger, asOf = today()) {
  const active = l.invoices.filter(
    (i) => committed(i) && i.status !== "REJECTED",
  );
  const payables = active.reduce((s, i) => s + outstanding(l, i, asOf), 0);
  const receivables = l.receivables.reduce(
    (s, r) => s + remainingReceivable(l, r.id, asOf),
    0,
  );
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
      (r) => r.receipt_date >= l.company.opening_date && r.receipt_date <= asOf,
    )
    .reduce((s, r) => s + r.amount_minor, 0);
  const cash = l.company.opening_cash_minor + received - out;

  // IAS 7 Historical Realized Cash Flow Statement
  const operating_items: IAS7FlowItem[] = [];
  const investing_items: IAS7FlowItem[] = [];
  const financing_items: IAS7FlowItem[] = [];

  let customer_collections_minor = 0;
  let supplier_payments_minor = 0;
  let operating_expenses_minor = 0;

  let asset_purchases_minor = 0;
  let asset_sales_minor = 0;

  let loans_received_minor = 0;
  let loan_repayments_minor = 0;
  let equity_transactions_minor = 0;

  for (const r of l.receipts) {
    if (r.receipt_date >= l.company.opening_date && r.receipt_date <= asOf) {
      const cls = classifyReceipt(l, r);
      const rec = l.receivables.find((item) => item.id === r.receivable_id);
      const item: IAS7FlowItem = {
        id: r.id,
        category: cls.category,
        type: cls.type,
        title: `${cls.label}: ${rec?.customer_name || "Receipt"}`,
        date: r.receipt_date,
        amount_minor: r.amount_minor,
        reference: r.reference,
        entity_name: rec?.customer_name,
      };

      if (cls.category === "OPERATING") {
        customer_collections_minor += r.amount_minor;
        operating_items.push(item);
      } else if (cls.category === "INVESTING") {
        asset_sales_minor += r.amount_minor;
        investing_items.push(item);
      } else {
        if (cls.type === "LOAN_RECEIVED") loans_received_minor += r.amount_minor;
        else equity_transactions_minor += r.amount_minor;
        financing_items.push(item);
      }
    }
  }

  for (const p of l.payments) {
    if (
      p.status === "COMPLETED" &&
      p.payment_date >= l.company.opening_date &&
      p.payment_date <= asOf
    ) {
      const cls = classifyInvoiceOrPayment(l, p.invoice_id);
      const inv = l.invoices.find((i) => i.id === p.invoice_id);
      const vendor = l.vendors.find((v) => v.id === inv?.vendor_id);
      const item: IAS7FlowItem = {
        id: p.id,
        category: cls.category,
        type: cls.type,
        title: `${cls.label}: ${vendor?.name || "Payment"}`,
        date: p.payment_date,
        amount_minor: -p.amount_minor,
        reference: p.reference,
        entity_name: vendor?.name,
      };

      if (cls.category === "OPERATING") {
        if (cls.type === "OPERATING_EXPENSES") {
          operating_expenses_minor += p.amount_minor;
        } else {
          supplier_payments_minor += p.amount_minor;
        }
        operating_items.push(item);
      } else if (cls.category === "INVESTING") {
        asset_purchases_minor += p.amount_minor;
        investing_items.push(item);
      } else {
        loan_repayments_minor += p.amount_minor;
        financing_items.push(item);
      }
    }
  }

  const net_operating_minor =
    customer_collections_minor - supplier_payments_minor - operating_expenses_minor;
  const net_investing_minor = asset_sales_minor - asset_purchases_minor;
  const net_financing_minor =
    loans_received_minor + equity_transactions_minor - loan_repayments_minor;
  const net_change_minor =
    net_operating_minor + net_investing_minor + net_financing_minor;
  const closing_cash_minor = l.company.opening_cash_minor + net_change_minor;

  const customerBehaviors = calculateCustomerPaymentBehaviors(l, asOf);

  const cash_flow_statement: IAS7Statement = {
    asOf,
    opening_cash_minor: l.company.opening_cash_minor,
    operating: {
      customer_collections_minor,
      supplier_payments_minor,
      operating_expenses_minor,
      net_minor: net_operating_minor,
      items: operating_items,
    },
    investing: {
      asset_purchases_minor,
      asset_sales_minor,
      net_minor: net_investing_minor,
      items: investing_items,
    },
    financing: {
      loans_received_minor,
      loan_repayments_minor,
      equity_transactions_minor,
      net_minor: net_financing_minor,
      items: financing_items,
    },
    net_change_minor,
    closing_cash_minor,
  };

  const projections = [0, 30, 60, 90].map((days) => {
    const end = addDays(asOf, days);
    const invoices = days
      ? active.filter(
          (i) =>
            (i.scheduled_payment_date || i.due_date) <= end &&
            outstanding(l, i, asOf) > 0,
        )
      : [];
    const receipts = days
      ? l.receivables.filter((r) => {
          const custId = `cust_${r.customer_name.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
          const expDate = getBehavioralExpectedCollectionDate(r, customerBehaviors[custId]);
          return expDate <= end && remainingReceivable(l, r.id, asOf) > 0;
        })
      : [];
    const inflow = receipts.reduce(
      (s, r) => s + remainingReceivable(l, r.id, asOf),
      0,
    );
    const outflow = invoices.reduce((s, i) => s + outstanding(l, i, asOf), 0);

    // IAS 7 Projection Semantic Breakdown
    let proj_supplier_outflow = 0;
    let proj_opex_outflow = 0;
    let proj_investing_outflow = 0;
    let proj_financing_outflow = 0;

    for (const inv of invoices) {
      const bal = outstanding(l, inv, asOf);
      const cls = classifyInvoiceOrPayment(l, inv.id);
      if (cls.category === "OPERATING") {
        if (cls.type === "OPERATING_EXPENSES") proj_opex_outflow += bal;
        else proj_supplier_outflow += bal;
      } else if (cls.category === "INVESTING") {
        proj_investing_outflow += bal;
      } else {
        proj_financing_outflow += bal;
      }
    }

    const proj_collections = inflow;
    const proj_net_operating =
      proj_collections - proj_supplier_outflow - proj_opex_outflow;
    const proj_net_investing = -proj_investing_outflow;
    const proj_net_financing = -proj_financing_outflow;
    const proj_net_change =
      proj_net_operating + proj_net_investing + proj_net_financing;

    return {
      days,
      date: end,
      inflow,
      outflow,
      cash: cash + inflow - outflow,
      ias7: {
        operating: {
          customer_collections_minor: proj_collections,
          supplier_payments_minor: proj_supplier_outflow,
          operating_expenses_minor: proj_opex_outflow,
          net_minor: proj_net_operating,
        },
        investing: {
          asset_purchases_minor: proj_investing_outflow,
          asset_sales_minor: 0,
          net_minor: proj_net_investing,
        },
        financing: {
          loans_received_minor: 0,
          loan_repayments_minor: proj_financing_outflow,
          equity_transactions_minor: 0,
          net_minor: proj_net_financing,
        },
        net_change_minor: proj_net_change,
        projected_cash_minor: cash + proj_net_change,
      },
      source_invoices: [...invoices]
        .sort((a, b) =>
          (a.scheduled_payment_date || a.due_date).localeCompare(
            b.scheduled_payment_date || b.due_date,
          ),
        )
        .map((i) => ({
          id: i.id,
          reference: i.invoice_number,
          vendor_id: i.vendor_id,
          status: i.status,
          amount: outstanding(l, i, asOf),
          due_date: i.scheduled_payment_date || i.due_date,
        })),
      source_receivables: receipts.map((r) => ({
        id: r.id,
        reference: r.reference_number,
        amount: remainingReceivable(l, r.id, asOf),
        due_date: r.due_date,
      })),
    };
  });
  const budgets = calculateBudgets(l, asOf);
  const vendors = l.vendors.map((v) => {
    const invoices = l.invoices.filter(
      (i) => i.vendor_id === v.id && i.status !== "REJECTED",
    );
    const approved = invoices.filter(committed);
    return {
      ...v,
      count: invoices.length,
      average: invoices.length
        ? Math.round(
            invoices.reduce((s, i) => s + i.total_minor, 0) / invoices.length,
          )
        : 0,
      largest: Math.max(0, ...invoices.map((i) => i.total_minor)),
      spend: approved.reduce((s, i) => s + paid(l, i.id, asOf), 0),
      outstanding: approved.reduce((s, i) => s + outstanding(l, i, asOf), 0),
      overdue: approved
        .filter((i) => i.due_date < asOf)
        .reduce((s, i) => s + outstanding(l, i, asOf), 0),
      history: invoices.map((i) => ({
        id: i.id,
        date: i.invoice_date,
        amount: i.total_minor,
      })),
    };
  });
  const currentBudgets = budgets.filter(
    (b) => b.period_start <= asOf && b.period_end >= asOf,
  );
  const budgetTotal = currentBudgets.reduce((s, b) => s + b.budget_minor, 0);
  const exposure = currentBudgets.reduce(
    (s, b) => s + b.actual + b.committed,
    0,
  );
  const nowIso = new Date().toISOString();
  const lastTx = getLastTransactionTimestamp(l);
  const ledgerFreshness = evaluateFreshness("REAL_TIME_CASH", nowIso, asOf, lastTx);
  const reconciliationSummary = calculateReconciliation(l, asOf);

  return {
    asOf,
    updated_at: nowIso,
    cash,
    payables,
    receivables,
    net: cash + receivables - payables,
    coverage: projections[1].outflow ? cash / projections[1].outflow : null,
    projections,
    budgets,
    vendors,
    budget_utilization: budgetTotal ? (exposure / budgetTotal) * 100 : 0,
    overdue_payables: active
      .filter((i) => i.due_date < asOf)
      .reduce((s, i) => s + outstanding(l, i, asOf), 0),
    overdue_receivables: l.receivables
      .filter((r) => r.due_date < asOf)
      .reduce((s, r) => s + remainingReceivable(l, r.id, asOf), 0),
    cash_flow_statement,
    forecast: generateForecastResult(l, asOf, 30, cash),
    cash_flow_drivers: generateLedgerDriverAnalysis(l, l.company.opening_date, asOf, asOf),
    payment_schedule: calculatePaymentScheduleSummary(l, asOf),
    receivables_intelligence: calculateReceivablesIntelligence(l, asOf),
    customer_payment_behaviors: customerBehaviors,
    vendor_intelligence: calculateVendorIntelligence(l, asOf),
    spend_concentration: calculateSpendConcentration(l, asOf),
    lineage_kpis: buildLedgerCalculations(l, asOf).kpis,
    calculations: Object.fromEntries(buildLedgerCalculations(l, asOf).calculations),
    freshness: ledgerFreshness,
    reconciliation: reconciliationSummary,
  };
}
export type Metrics = ReturnType<typeof financialEngine>;

export function paymentScenario(l: Ledger, invoice: Invoice, asOf = today()) {
  const m = financialEngine(l, asOf),
    balance = outstanding(l, invoice, asOf);
  return {
    invoice_id: invoice.id,
    outstanding: balance,
    cash_before: m.cash,
    cash_after_payment: m.cash - balance,
    formula: "Current cash − outstanding invoice balance",
    note: "Immediate payment scenario only. No payment is recorded, and this obligation is not counted twice in the baseline projection.",
  };
}
