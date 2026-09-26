import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateSeparationOfDuties,
  assertApprovalPolicy,
  ApprovalPolicyError,
  isMaterialChange,
  canTransition,
  transitionInvoice,
  INVOICE_TRANSITIONS,
} from "../src/domain/finance/approval-policy";
import {
  calculatePaymentScheduleSummary,
  PAYMENT_SCHEDULE_VERSION,
} from "../src/domain/finance/payment-scheduling";
import {
  simulateSingleTimingScenario,
  simulateAllTimingScenarios,
  calculatePaymentTimingCost,
  TIMING_SIMULATION_VERSION,
} from "../src/server/finance/payment-timing-simulation";
import {
  getAgingBucket,
  differenceInDays,
  COLLECTIONS_VERSION,
} from "../src/domain/finance/collections";
import { calculateReceivablesIntelligence } from "../src/server/finance/collections-intelligence";
import { seed } from "../src/server/seed";
import { mutate } from "../src/server/operations";
import type { Invoice, Actor, Ledger } from "../src/domain/types";

const TEST_DATE = "2026-09-22";

test("Segregation of Duties: Creator cannot approve their own invoice (Maker-Checker Control)", () => {
  const context = {
    companyId: "comp-1",
    invoiceId: "inv-101",
    amountMinor: 2500000n,
    createdBy: "user-krishna-maker",
    currentUserId: "user-krishna-maker",
    actorRoles: ["finance"],
  };

  const evalResult = evaluateSeparationOfDuties(context);
  assert.equal(evalResult.allowed, false);
  assert.equal(evalResult.code, "MAKER_CANNOT_APPROVE");
  assert.ok(evalResult.reason?.includes("creator cannot approve"));

  assert.throws(
    () => assertApprovalPolicy(context),
    (err: unknown) => {
      assert.ok(err instanceof ApprovalPolicyError);
      assert.equal((err as ApprovalPolicyError).code, "MAKER_CANNOT_APPROVE");
      return true;
    },
  );
});

test("Segregation of Duties: Independent reviewer and approver are permitted", () => {
  const context = {
    companyId: "comp-1",
    invoiceId: "inv-101",
    amountMinor: 2500000n,
    createdBy: "user-krishna-maker",
    currentUserId: "user-admin-checker",
    actorRoles: ["admin"],
    reviewedBy: "user-finance-manager",
  };

  const evalResult = evaluateSeparationOfDuties(context);
  assert.equal(evalResult.allowed, true);
  assert.doesNotThrow(() => assertApprovalPolicy(context));
});

test("Segregation of Duties: Material changes invalidate prior approval and flag review", () => {
  const previous: Partial<Invoice> = {
    total_minor: 10000000,
    vendor_id: "v0",
    due_date: "2026-09-30",
    currency_code: "INR",
  };

  const unchanged: Partial<Invoice> = {
    total_minor: 10000000,
    vendor_id: "v0",
    due_date: "2026-09-30",
    currency_code: "INR",
  };

  assert.equal(isMaterialChange(previous, unchanged).isMaterial, false);

  const amountChanged: Partial<Invoice> = {
    ...previous,
    total_minor: 12000000,
  };
  const res1 = isMaterialChange(previous, amountChanged);
  assert.equal(res1.isMaterial, true);
  assert.ok(res1.changedFields.includes("total_minor"));

  const vendorChanged: Partial<Invoice> = {
    ...previous,
    vendor_id: "v1",
  };
  const res2 = isMaterialChange(previous, vendorChanged);
  assert.equal(res2.isMaterial, true);
  assert.ok(res2.changedFields.includes("vendor_id"));
});

test("Approval State Machine: Enforces legal transition graph", () => {
  assert.equal(canTransition("DRAFT", "PENDING_REVIEW"), true);
  assert.equal(canTransition("PENDING_REVIEW", "REVIEWED"), true);
  assert.equal(canTransition("REVIEWED", "APPROVED"), true);
  assert.equal(canTransition("APPROVED", "SCHEDULED"), true);
  assert.equal(canTransition("SCHEDULED", "PAID"), true);
  assert.equal(canTransition("SCHEDULED", "DUE"), true);
  assert.equal(canTransition("DUE", "PAID"), true);

  // Illegal transitions
  assert.equal(canTransition("PAID", "DRAFT"), false);
  assert.equal(canTransition("DRAFT", "APPROVED"), false);
  assert.equal(canTransition("REJECTED", "APPROVED"), false);
  assert.equal(canTransition("PAID", "APPROVED"), false);
});

test("Approval State Machine: transitionInvoice transitions state and records policy audit", () => {
  const baseInvoice: Invoice = {
    id: "inv-test",
    company_id: "comp-1",
    vendor_id: "v0",
    category_id: "c0",
    invoice_number: "INV-1042",
    invoice_date: "2026-09-01",
    due_date: "2026-09-20",
    subtotal_minor: 9600000,
    tax_minor: 0,
    total_minor: 9600000,
    currency_code: "INR",
    status: "PENDING_REVIEW",
    source: "MANUAL",
    description: "Cloud compute",
    created_by: "user-maker-krishna",
    created_at: new Date().toISOString(),
  };

  // 1. Review step by Finance Manager
  const step1 = transitionInvoice({
    invoice: baseInvoice,
    to: "REVIEWED",
    actorId: "user-finance-manager",
    actorRole: "finance",
  });
  assert.equal(step1.invoice.status, "REVIEWED");
  assert.equal(step1.invoice.reviewed_by, "user-finance-manager");

  // 2. Creator attempts to approve -> Must throw SoD violation
  assert.throws(
    () =>
      transitionInvoice({
        invoice: step1.invoice,
        to: "APPROVED",
        actorId: "user-maker-krishna",
        actorRole: "admin",
      }),
    /creator cannot approve/,
  );

  // 3. Different user (Admin) approves -> Succeeded
  const step2 = transitionInvoice({
    invoice: step1.invoice,
    to: "APPROVED",
    actorId: "user-admin-checker",
    actorRole: "admin",
  });
  assert.equal(step2.invoice.status, "APPROVED");
  assert.equal(step2.invoice.approved_by, "user-admin-checker");
  assert.equal(step2.policyVersion, "approval-policy-v1.2");
});

test("Payment Scheduling: Partitions scheduled obligations into this week, next week, and later", () => {
  const ledger = seed("test", TEST_DATE);
  const summary = calculatePaymentScheduleSummary(ledger, TEST_DATE);

  assert.equal(summary.asOf, TEST_DATE);
  assert.equal(summary.calculationVersion, PAYMENT_SCHEDULE_VERSION);
  assert.ok(summary.dueThisWeek);
  assert.ok(summary.dueNextWeek);
  assert.ok(summary.scheduledLater);

  assert.equal(
    summary.totalScheduledMinor,
    summary.dueThisWeek.totalMinor +
      summary.dueNextWeek.totalMinor +
      summary.scheduledLater.totalMinor,
  );
  assert.equal(
    summary.totalScheduledCount,
    summary.dueThisWeek.count +
      summary.dueNextWeek.count +
      summary.scheduledLater.count,
  );
});

test("Payment Timing Simulation: Evaluates Pay today vs +7d, +15d, +30d and calculates late fees", () => {
  const ledger = seed("test", TEST_DATE);
  const invoice = ledger.invoices.find((i) => i.id === "inv-1042")!;

  const comparison = simulateAllTimingScenarios(ledger, invoice, TEST_DATE);
  assert.equal(comparison.invoiceId, "inv-1042");
  assert.equal(comparison.calculationVersion, TIMING_SIMULATION_VERSION);

  const payNow = comparison.scenarios.PAY_NOW;
  const delay15 = comparison.scenarios.DELAY_15;
  const delay30 = comparison.scenarios.DELAY_30;

  // Pay now immediately depletes cash today
  assert.equal(payNow.cashAfterPaymentMinor, payNow.cashBeforeMinor - comparison.outstandingMinor);

  // Delaying payment preserves immediate cash today
  assert.equal(delay15.cashAfterPaymentMinor, delay15.cashBeforeMinor);
  assert.equal(delay30.cashAfterPaymentMinor, delay30.cashBeforeMinor);

  // Invoice due date is 2026-09-18 (which is in the past relative to TEST_DATE 2026-09-22)
  // Delaying payment further incurs late fee cost
  const cost30 = calculatePaymentTimingCost(invoice, delay30.paymentDate, comparison.outstandingMinor);
  assert.ok(cost30.lateFeeMinor > 0, "Late fee should be incurred when paid past due date");
  assert.equal(delay30.cost.lateFeeMinor, cost30.lateFeeMinor);
});

test("Receivables Aging: Deterministic bucket classification across aging periods", () => {
  assert.equal(getAgingBucket("2026-09-25", TEST_DATE), "CURRENT");
  assert.equal(getAgingBucket("2026-09-22", TEST_DATE), "CURRENT");
  assert.equal(getAgingBucket("2026-09-15", TEST_DATE), "DAYS_1_30");
  assert.equal(getAgingBucket("2026-08-15", TEST_DATE), "DAYS_31_60");
  assert.equal(getAgingBucket("2026-07-15", TEST_DATE), "DAYS_61_90");
  assert.equal(getAgingBucket("2026-05-15", TEST_DATE), "DAYS_90_PLUS");
});

test("Receivables Intelligence: Computes aging buckets, reliability, and priority recommendations", () => {
  const ledger = seed("test", TEST_DATE);
  const report = calculateReceivablesIntelligence(ledger, TEST_DATE);

  assert.equal(report.asOf, TEST_DATE);
  assert.equal(report.calculationVersion, COLLECTIONS_VERSION);
  assert.ok(report.totalOutstandingMinor >= 0);
  assert.ok(report.aging.CURRENT);
  assert.ok(report.aging.DAYS_1_30);
  assert.ok(report.aging.DAYS_31_60);
  assert.ok(report.aging.DAYS_61_90);
  assert.ok(report.aging.DAYS_90_PLUS);

  // Check sum of aging buckets equals total outstanding
  const sumBuckets = Object.values(report.aging).reduce(
    (s, b) => s + b.amountMinor,
    0,
  );
  assert.equal(sumBuckets, report.totalOutstandingMinor);

  // If there are overdue invoices, signals must contain recommendations
  if (report.totalOverdueMinor > 0) {
    assert.ok(report.signals.length > 0);
    assert.ok(report.primaryPriorityCustomer);
    assert.ok(report.signals[0].recommendation.includes("Prioritize collection from"));
  }
});

test("Server Operations: Mutating commands enforce maker-checker SoD and scheduling", () => {
  const ledger = seed("test", TEST_DATE);
  const actorMaker: Actor = {
    user_id: "user-maker-krishna",
    company_id: "test",
    name: "Krishna",
    role: "finance",
    mode: "demo",
  };
  const actorApprover: Actor = {
    user_id: "user-approver-admin",
    company_id: "test",
    name: "Admin Approver",
    role: "admin",
    mode: "demo",
  };

  // 1. Krishna creates invoice
  const l1 = mutate(ledger, actorMaker, {
    type: "invoice",
    payload: {
      vendor_id: "v0",
      category_id: "c0",
      invoice_number: "KRISHNA-01",
      invoice_date: "2026-09-10",
      due_date: "2026-09-30",
      subtotal_minor: 5000000,
      tax_minor: 0,
      total_minor: 5000000,
      currency_code: "INR",
      source: "MANUAL",
      description: "Krishna test invoice",
    },
  });

  const createdInv = l1.invoices.find((i) => i.invoice_number === "KRISHNA-01")!;
  assert.equal(createdInv.created_by, "user-maker-krishna");
  assert.equal(createdInv.status, "PENDING_REVIEW");

  // 2. Krishna (the creator) attempts to approve the same invoice -> Fails SoD
  assert.throws(
    () =>
      mutate(l1, actorMaker, {
        type: "decision",
        payload: {
          id: createdInv.id,
          status: "APPROVED",
          reason: "I approve my own invoice",
        },
      }),
    /creator cannot approve/,
  );

  // 3. Finance Manager reviews the invoice -> Succeeds
  const l2 = mutate(l1, actorMaker, {
    type: "review",
    payload: {
      id: createdInv.id,
      reason: "Reviewed supplier contract and tax details",
    },
  });
  const reviewedInv = l2.invoices.find((i) => i.id === createdInv.id)!;
  assert.equal(reviewedInv.status, "REVIEWED");
  assert.equal(reviewedInv.reviewed_by, "user-maker-krishna");

  // 4. Different authorized user (Admin) approves -> Succeeds
  const l3 = mutate(l2, actorApprover, {
    type: "decision",
    payload: {
      id: createdInv.id,
      status: "APPROVED",
      reason: "Admin approval verified",
    },
  });
  const approvedInv = l3.invoices.find((i) => i.id === createdInv.id)!;
  assert.equal(approvedInv.status, "APPROVED");
  assert.equal(approvedInv.approved_by, "user-approver-admin");

  // 5. Schedule payment for approved invoice
  const l4 = mutate(l3, actorApprover, {
    type: "schedule",
    payload: {
      id: createdInv.id,
      date: "2026-09-28",
      notes: "Planned quarterly disbursement",
    },
  });
  const scheduledInv = l4.invoices.find((i) => i.id === createdInv.id)!;
  assert.equal(scheduledInv.status, "SCHEDULED");
  assert.equal(scheduledInv.scheduled_payment_date, "2026-09-28");
  assert.ok(l4.payment_schedules?.some((ps) => ps.invoice_id === createdInv.id));
});
