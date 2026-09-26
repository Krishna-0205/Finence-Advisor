import { test } from "node:test";
import assert from "node:assert/strict";
import { seed } from "../src/server/seed";
import { financialEngine } from "../src/server/finance";
import {
  simulateScenario,
  type FinancialSnapshot,
  type InvoiceForSimulation,
} from "../src/server/financial/scenario-simulator";
import {
  getFinancialSnapshot,
  getInvoiceForSimulation,
  explainScenario,
  runFinancialScenario,
} from "../src/server/financial/scenario";
import type { Actor } from "../src/domain/types";

const mockSnapshot: FinancialSnapshot = {
  cash: 1000000, // ₹10.0L
  outstandingPayables: 400000,
  expectedReceivables: 300000,
  cashCoverageBase: 600000,
  budget: [
    {
      categoryId: "cat_ops",
      budget: 1000000,
      actual: 300000,
      committed: 480000,
      remaining: 220000,
      utilizationPercent: 78,
    },
  ],
};

const mockApprovedInvoice: InvoiceForSimulation = {
  id: "inv_1042",
  invoiceNumber: "INV-1042",
  vendorName: "ABC Supplies",
  total: 240000,
  paid: 0,
  status: "APPROVED",
  categoryId: "cat_ops",
};

const mockPendingInvoice: InvoiceForSimulation = {
  id: "inv_2001",
  invoiceNumber: "INV-2001",
  vendorName: "Delta Logistics",
  total: 240000,
  paid: 0,
  status: "PENDING_REVIEW",
  categoryId: "cat_ops",
};

test("Scenario Simulator: PAY_INVOICE reduces cash, updates coverage, and is non-persistent", () => {
  const result = simulateScenario(mockSnapshot, mockApprovedInvoice, {
    type: "PAY_INVOICE",
    invoiceId: mockApprovedInvoice.id,
  });

  assert.equal(result.persisted, false);
  assert.equal(result.title, "Pay INV-1042 today");
  assert.equal(result.impact.cash.before, 1000000);
  assert.equal(result.impact.cash.change, -240000);
  assert.equal(result.impact.cash.after, 760000);

  // Cash coverage: 1000000 / 600000 = ~1.67, after = 760000 / 600000 = ~1.27
  assert.equal(result.impact.cashCoverage.before.toFixed(2), "1.67");
  assert.equal(result.impact.cashCoverage.after.toFixed(2), "1.27");

  // Since coverage is < 1.5, risk should flag relatively tight cash coverage
  assert.ok(result.impact.risks.some((r) => r.message.includes("Cash coverage becomes relatively tight")));
});

test("Scenario Simulator: PAY_INVOICE rejects unapproved invoices and zero-balance invoices", () => {
  assert.throws(
    () =>
      simulateScenario(mockSnapshot, mockPendingInvoice, {
        type: "PAY_INVOICE",
        invoiceId: mockPendingInvoice.id,
      }),
    /Only approved or scheduled invoices/,
  );

  const zeroBalanceInvoice: InvoiceForSimulation = {
    ...mockApprovedInvoice,
    paid: 240000,
  };
  assert.throws(
    () =>
      simulateScenario(mockSnapshot, zeroBalanceInvoice, {
        type: "PAY_INVOICE",
        invoiceId: zeroBalanceInvoice.id,
      }),
    /Invoice has no outstanding amount/,
  );
});

test("Scenario Simulator: APPROVE_INVOICE preserves cash but updates budget commitments and risks", () => {
  const result = simulateScenario(mockSnapshot, mockPendingInvoice, {
    type: "APPROVE_INVOICE",
    invoiceId: mockPendingInvoice.id,
  });

  assert.equal(result.persisted, false);
  // Cash must not change when approving an invoice
  assert.equal(result.impact.cash.change, 0);
  assert.equal(result.impact.cash.after, mockSnapshot.cash);

  // Budget impact: committed 480000 + 240000 = 720000 => 72% + 0 (or from budget)
  assert.ok(result.impact.budget);
  assert.equal(result.impact.budget.categoryId, "cat_ops");
  assert.equal(result.impact.budget.beforeUtilization, 78);
  assert.equal(result.impact.budget.afterUtilization, 72);

  // Test budget breach with large invoice
  const largePendingInvoice: InvoiceForSimulation = {
    ...mockPendingInvoice,
    total: 600000,
  };
  const breachResult = simulateScenario(mockSnapshot, largePendingInvoice, {
    type: "APPROVE_INVOICE",
    invoiceId: largePendingInvoice.id,
  });
  assert.ok(breachResult.impact.risks.some((r) => r.level === "HIGH" && r.message.includes("exceed the category budget")));
});

test("Scenario Simulator: RECEIVE_PAYMENT and CHANGE_BUDGET calculate accurate impacts", () => {
  const receiptResult = simulateScenario(mockSnapshot, undefined, {
    type: "RECEIVE_PAYMENT",
    amount: 500000,
  });
  assert.equal(receiptResult.impact.cash.change, 500000);
  assert.equal(receiptResult.impact.cash.after, 1500000);
  assert.equal(receiptResult.impact.cashCoverage.after.toFixed(2), "2.50");

  const budgetResult = simulateScenario(mockSnapshot, undefined, {
    type: "CHANGE_BUDGET",
    categoryId: "cat_ops",
    budgetAmount: 500000, // lowering budget from 1,000,000 to 500,000 against 480,000 committed
  });
  assert.ok(budgetResult.impact.budget);
  assert.equal(budgetResult.impact.budget.afterUtilization, 96);
  assert.ok(budgetResult.impact.risks.some((r) => r.message.includes("Budget utilization is near its limit")));
});

test("Scenario Simulator: Ledger integration reads verified data and preserves ledger state", async () => {
  const ledger = seed("test-co", "2026-09-22");
  const initialRevision = ledger.revision;
  const initialInvoiceCount = ledger.invoices.length;
  const initialPaymentsCount = ledger.payments.length;

  const snapshot = getFinancialSnapshot(ledger, "2026-09-22");
  assert.ok(snapshot.cash > 0);
  assert.ok(snapshot.budget.length > 0);

  const testActor: Actor = {
    user_id: "u1",
    company_id: "test-co",
    role: "admin",
    name: "Tester",
    mode: "demo",
  };

  const invoice = ledger.invoices.find((i) => i.status === "APPROVED" || i.status === "SCHEDULED");
  assert.ok(invoice);

  const res = await runFinancialScenario(
    "test-co",
    {
      type: "PAY_INVOICE",
      invoiceId: invoice.id,
    },
    testActor,
  );

  assert.equal(res.persisted, false);
  assert.ok(res.impact.cash.after < res.impact.cash.before);
  assert.ok(res.aiExplanation && res.aiExplanation.length > 0);

  // Verification: Ledger was NEVER changed
  assert.equal(ledger.revision, initialRevision);
  assert.equal(ledger.invoices.length, initialInvoiceCount);
  assert.equal(ledger.payments.length, initialPaymentsCount);
});

test("Impact Before Approval: Computes post-settlement cash, coverage drop, and budget impact", () => {
  const result = simulateScenario(mockSnapshot, mockPendingInvoice, {
    type: "APPROVE_INVOICE",
    invoiceId: mockPendingInvoice.id,
  });

  // Current cash remains unchanged until payment
  assert.equal(result.impact.cash.before, 1000000);
  assert.equal(result.impact.cash.after, 1000000);

  // But post-payment projection reflects immediate impact upon eventual payout:
  // ₹10.0L - ₹2.4L = ₹7.6L
  assert.equal(result.impact.cash.postPaymentCash, 760000);
  assert.equal(result.impact.cash.postPaymentChange, -240000);

  // Coverage drops after post-settlement: 760000 / 600000 = ~1.27x
  assert.equal(result.impact.cashCoverage.postPaymentCoverage?.toFixed(2), "1.27");

  // Budget commitment impact is verified
  assert.ok(result.impact.budget);
  assert.equal(result.impact.budget.categoryId, "cat_ops");
});

test("IAS 7 Cash Flow Semantics: Classifies Operating, Investing, and Financing flows with reconciliation", () => {
  const ledger = seed("ias7-co", "2026-09-22");
  const m = financialEngine(ledger, "2026-09-22");

  assert.ok(m.cash_flow_statement);
  const stmt = m.cash_flow_statement;

  // Operating activities should have customer collections, supplier payments, and operating expenses
  assert.ok(stmt.operating);
  assert.ok(stmt.operating.customer_collections_minor >= 0);
  assert.ok(stmt.operating.supplier_payments_minor >= 0);
  assert.ok(stmt.operating.operating_expenses_minor >= 0);

  // Verify Net Operating formula: collections - supplier - opex
  const expectedNetOperating =
    stmt.operating.customer_collections_minor -
    stmt.operating.supplier_payments_minor -
    stmt.operating.operating_expenses_minor;
  assert.equal(stmt.operating.net_minor, expectedNetOperating);

  // Extensible Investing and Financing sections are present
  assert.ok(stmt.investing);
  assert.ok(stmt.financing);

  // Cash reconciliation: net_operating + net_investing + net_financing === net_change
  const totalNetChange =
    stmt.operating.net_minor + stmt.investing.net_minor + stmt.financing.net_minor;
  assert.equal(stmt.net_change_minor, totalNetChange);

  // Closing cash equals opening cash + net change
  assert.equal(stmt.closing_cash_minor, stmt.opening_cash_minor + totalNetChange);

  // Closing cash matches the balance sheet cash from the financial engine
  assert.equal(stmt.closing_cash_minor, m.cash);

  // Projections should also contain IAS 7 semantic breakdowns
  assert.ok(m.projections.length > 0);
  for (const p of m.projections) {
    assert.ok(p.ias7);
    assert.ok(p.ias7.operating);
    assert.equal(
      p.ias7.net_change_minor,
      p.ias7.operating.net_minor + p.ias7.investing.net_minor + p.ias7.financing.net_minor,
    );
  }
});
