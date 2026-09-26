import { test } from "node:test";
import assert from "node:assert/strict";
import { seed } from "../src/server/seed";
import type { Actor, Ledger, Invoice, Payment } from "../src/domain/types";
import { financialEngine } from "../src/server/finance";
import { mutate } from "../src/server/operations";
import {
  evaluateFreshness,
  formatAgeText,
  getLastTransactionTimestamp,
  DEFAULT_FRESHNESS_POLICIES,
} from "../src/domain/finance/freshness";
import {
  calculateReconciliation,
  RECONCILIATION_VERSION,
} from "../src/domain/finance/reconciliation";
import {
  isSensitiveAction,
  canExport,
  RATE_LIMIT_POLICIES,
  STEP_UP_SENSITIVE_INVOICE_THRESHOLD_MINOR,
} from "../src/domain/finance/security";
import {
  createStepUpChallenge,
  verifyStepUpMfa,
  requireStepUpIfSensitive,
} from "../src/server/security/mfa";
import {
  logSecurityEvent,
  getSecurityEvents,
  getSecuritySummary,
} from "../src/server/security/events";
import { checkRateLimit } from "../src/server/security/rate-limiter";
import { executeExport } from "../src/server/security/export-controller";
import { executeBoundedToolCall } from "../src/server/ai";

const testDate = "2026-09-24";

const adminActor: Actor = {
  user_id: "admin-1",
  company_id: "test-co",
  name: "Alex Administrator",
  role: "admin",
  mode: "demo",
};

const financeActor: Actor = {
  user_id: "fin-1",
  company_id: "test-co",
  name: "Fiona Finance",
  role: "finance",
  mode: "demo",
};

const viewerActor: Actor = {
  user_id: "view-1",
  company_id: "test-co",
  name: "Victor Viewer",
  role: "viewer",
  mode: "demo",
};

// ============================================================================
// 29. DATA FRESHNESS TESTS
// ============================================================================

test("29. Data Freshness: Evaluates FRESH, AGING, and STALE based on metric policies", () => {
  const policy = {
    metric: "REAL_TIME_CASH",
    freshWithinSeconds: 300, // 5 min
    agingWithinSeconds: 1800, // 30 min
  };

  const now = new Date("2026-09-24T18:35:00Z");

  // 2 minutes old -> FRESH
  const freshDataAsOf = new Date("2026-09-24T18:33:00Z").toISOString();
  const fresh = evaluateFreshness("REAL_TIME_CASH", now.toISOString(), freshDataAsOf, undefined, policy);
  assert.equal(fresh.status, "FRESH");
  assert.equal(fresh.ageSeconds, 120);
  assert.match(fresh.badgeText, /Updated 2 min ago/);

  // 15 minutes old -> AGING
  const agingDataAsOf = new Date("2026-09-24T18:20:00Z").toISOString();
  const aging = evaluateFreshness("REAL_TIME_CASH", now.toISOString(), agingDataAsOf, undefined, policy);
  assert.equal(aging.status, "AGING");
  assert.equal(aging.ageSeconds, 900);
  assert.match(aging.badgeText, /⚡ Updated 15 min ago/);

  // 2 hours old -> STALE
  const staleDataAsOf = new Date("2026-09-24T16:35:00Z").toISOString();
  const stale = evaluateFreshness("REAL_TIME_CASH", now.toISOString(), staleDataAsOf, undefined, policy);
  assert.equal(stale.status, "STALE");
  assert.equal(stale.ageSeconds, 7200);
  assert.match(stale.badgeText, /⚠ Data may be stale \(2 hrs ago\)/);
});

test("29. Data Freshness: Relative age formatting provides human-readable audit timestamps", () => {
  assert.equal(formatAgeText(45), "just now");
  assert.equal(formatAgeText(120), "2 min ago");
  assert.equal(formatAgeText(3600), "1 hr ago");
  assert.equal(formatAgeText(7200), "2 hrs ago");
  assert.equal(formatAgeText(86400), "1 day ago");
});

test("29. Data Freshness: Attached to financialEngine metrics and forecast confidence", () => {
  const ledger = seed("test-co", testDate);
  const engine = financialEngine(ledger, testDate);

  // Top-level freshness
  assert.ok(engine.freshness);
  assert.ok(["FRESH", "AGING", "STALE"].includes(engine.freshness.status));
  assert.ok(engine.freshness.dataAsOf);
  assert.ok(engine.freshness.generatedAt);

  // Lineage-backed KPIs carry freshness
  assert.ok(engine.lineage_kpis.cash.freshness);
  assert.ok(engine.lineage_kpis.payables.freshness);
  assert.ok(engine.lineage_kpis.receivables.freshness);

  // Forecast carries freshness and confidence reasons
  assert.ok(engine.forecast?.freshness);
  assert.ok(engine.forecast?.confidence.reasons.length);
});

// ============================================================================
// 30. RECONCILIATION CENTER TESTS
// ============================================================================

test("30. Reconciliation Center: Evaluates core equation and detects overpayments & unmatched payments", () => {
  const ledger = seed("test-co", testDate);

  // Add an overpaid invoice
  const overpaidInvoice: Invoice = {
    id: "inv-overpaid",
    company_id: "test-co",
    vendor_id: "v0",
    category_id: "c0",
    invoice_number: "INV-OP-100",
    invoice_date: testDate,
    due_date: testDate,
    subtotal_minor: 10000000, // ₹1,00,000
    tax_minor: 0,
    total_minor: 10000000,
    currency_code: "INR",
    status: "APPROVED",
    source: "MANUAL",
    description: "Cloud computing monthly retainer",
    created_at: new Date().toISOString(),
  };

  // Payment of ₹1,20,000 against ₹1,00,000 invoice (difference: ₹20,000)
  const overpaymentRecord: Payment = {
    id: "pay-overpaid",
    company_id: "test-co",
    invoice_id: "inv-overpaid",
    amount_minor: 12000000,
    payment_date: testDate,
    currency_code: "INR",
    reference: "BANK-OVERPAY-1",
    status: "COMPLETED",
    created_at: new Date().toISOString(),
  };

  // Unmatched payment (non-existent invoice)
  const unmatchedPayment: Payment = {
    id: "pay-unmatched",
    company_id: "test-co",
    invoice_id: "inv-non-existent",
    amount_minor: 7500000, // ₹75,000
    payment_date: testDate,
    currency_code: "INR",
    reference: "BANK-UNMATCHED-1",
    status: "COMPLETED",
    created_at: new Date().toISOString(),
  };

  const testLedger: Ledger = {
    ...ledger,
    invoices: [...ledger.invoices, overpaidInvoice],
    payments: [...ledger.payments, overpaymentRecord, unmatchedPayment],
  };

  const recon = calculateReconciliation(testLedger);

  assert.equal(recon.calculationVersion, RECONCILIATION_VERSION);
  assert.ok(recon.exceptionsCount > 0);
  assert.ok(recon.overpaymentsCount >= 1);
  assert.ok(recon.unmatchedPaymentsCount >= 1);

  // Verify overpayment exception details
  const opException = recon.results
    .find((r) => r.entityId === "inv-overpaid")
    ?.exceptions.find((e) => e.type === "OVERPAYMENT");

  assert.ok(opException);
  assert.equal(opException.differenceMinor, 2000000); // ₹20,000
  assert.equal(opException.severity, "CRITICAL");

  // Verify unmatched payment details
  assert.ok(recon.unmatchedPayments.some((p) => p.id === "pay-unmatched"));
});

test("30. Reconciliation Center: Detects duplicate payments with matching references", () => {
  const ledger = seed("test-co", testDate);
  const baseInv = ledger.invoices[0];

  const pay1: Payment = {
    id: "dup-p1",
    company_id: "test-co",
    invoice_id: baseInv.id,
    amount_minor: 5000000,
    payment_date: testDate,
    currency_code: "INR",
    reference: "REF-DUP-MATCH",
    status: "COMPLETED",
    created_at: new Date().toISOString(),
  };

  const pay2: Payment = {
    id: "dup-p2",
    company_id: "test-co",
    invoice_id: baseInv.id,
    amount_minor: 5000000,
    payment_date: testDate,
    currency_code: "INR",
    reference: "REF-DUP-MATCH",
    status: "COMPLETED",
    created_at: new Date().toISOString(),
  };

  const testLedger: Ledger = {
    ...ledger,
    payments: [...ledger.payments, pay1, pay2],
  };

  const recon = calculateReconciliation(testLedger);
  const dupExceptions = recon.results
    .find((r) => r.entityId === baseInv.id)
    ?.exceptions.filter((e) => e.type === "DUPLICATE_PAYMENT");

  assert.ok(dupExceptions && dupExceptions.length > 0);
});

// ============================================================================
// 31. IMMUTABLE AUDIT EVENTS TESTS
// ============================================================================

test("31. Immutable Audit Events: Records WHO, WHAT, WHEN, WHERE, WHY, BEFORE, AFTER", () => {
  const ledger = seed("test-co", testDate);
  const inv = ledger.invoices.find((i) => i.status === "PENDING_REVIEW") || ledger.invoices[0];

  const reason = "Vendor correction verified against PO";
  const updated = mutate(ledger, financeActor, {
    type: "edit_invoice",
    payload: {
      id: inv.id,
      updates: { total_minor: inv.total_minor + 500000 },
      reason,
      ip_address: "192.168.1.50",
      user_agent: "FinanceClient/2.0",
    },
  });

  const lastAudit = updated.audit_logs[updated.audit_logs.length - 1];
  assert.ok(lastAudit);

  // Top-level compatibility fields
  assert.equal(lastAudit.user_id, financeActor.user_id);
  assert.equal(lastAudit.entity_id, inv.id);

  // Rich metadata answering WHO, WHAT, WHEN, WHERE, WHY, BEFORE, AFTER
  const meta = lastAudit.metadata;
  assert.ok(meta);
  assert.equal(meta.who.userId, financeActor.user_id);
  assert.equal(meta.who.name, financeActor.name);
  assert.equal(meta.who.role, financeActor.role);
  assert.equal(meta.what, "UPDATE_INVOICE");
  assert.ok(meta.when);
  assert.equal(meta.where.ipAddress, "192.168.1.50");
  assert.equal(meta.where.userAgent, "FinanceClient/2.0");
  assert.equal(meta.why, reason);
  assert.ok(meta.before);
  assert.ok(meta.after);
  assert.ok(meta.correlation_id);
});

// ============================================================================
// 32. MFA FOR ADMIN & SENSITIVE ACTIONS TESTS
// ============================================================================

test("32. MFA for Admin: Sensitive action detection triggers for >= ₹5L invoices and payments", () => {
  // ₹4L invoice -> not sensitive for threshold
  const check4L = isSensitiveAction({
    action: "APPROVE",
    amountMinor: 40000000,
    role: "admin",
  });
  assert.equal(check4L.isSensitive, false);

  // ₹8L invoice (>= ₹5L) -> sensitive
  const check8L = isSensitiveAction({
    action: "APPROVE",
    amountMinor: 80000000,
    role: "admin",
  });
  assert.equal(check8L.isSensitive, true);
  assert.match(check8L.reason || "", /exceeds ₹5,00,000/);

  // Role changes -> sensitive administrative action
  const checkRole = isSensitiveAction({
    action: "CHANGE_USER_ROLE",
    role: "admin",
  });
  assert.equal(checkRole.isSensitive, true);
});

test("32. MFA for Admin: Step-up authentication enforces verification code without bypassing authorization", () => {
  // Create challenge
  const challenge = createStepUpChallenge(adminActor, "APPROVE_LARGE_INVOICE");
  assert.ok(challenge.challengeId.startsWith("mfa_"));
  assert.ok(challenge.expiresAt);

  // Rejects invalid code
  assert.throws(
    () => verifyStepUpMfa(adminActor, "APPROVE_LARGE_INVOICE", "000000", challenge.challengeId),
    /Invalid verification code/,
  );

  // Accepts valid demo code (123456)
  const success = verifyStepUpMfa(adminActor, "APPROVE_LARGE_INVOICE", "123456", challenge.challengeId);
  assert.equal(success.verified, true);
  assert.ok(success.stepUpToken);

  // MFA check does NOT allow a viewer to perform an unauthorized mutation
  const ledger = seed("test-co", testDate);
  assert.throws(
    () => mutate(ledger, viewerActor, { type: "company", payload: { name: "Hacked" } }),
    /Viewer access is read-only/,
  );
});

// ============================================================================
// 33. SECURITY EVENT DASHBOARD TESTS
// ============================================================================

test("33. Security Event Dashboard: Logs security events and computes 24-hour summary", () => {
  const companyId = "sec-test-co";

  logSecurityEvent(companyId, {
    eventType: "LOGIN_FAILURE",
    severity: "WARNING",
    title: "Failed Login Attempt",
    description: "Invalid password for user.",
    sourceIp: "10.0.0.1",
  });

  logSecurityEvent(companyId, {
    eventType: "AUTHORIZATION_FAILURE",
    severity: "CRITICAL",
    title: "Unauthorized Mutation Attempt",
    description: "Viewer attempted company settings edit.",
    sourceIp: "10.0.0.2",
  });

  logSecurityEvent(companyId, {
    eventType: "AI_REQUEST",
    severity: "INFO",
    title: "AI Inquiry",
    description: "Advisor question executed.",
  });

  const summary = getSecuritySummary(companyId);
  assert.ok(summary.last24Hours.totalEvents >= 3);
  assert.ok(summary.last24Hours.failedLogins >= 1);
  assert.ok(summary.last24Hours.failedAuthorizations >= 1);
  assert.ok(summary.last24Hours.aiRequests >= 1);

  const events = getSecurityEvents(companyId, { limit: 10 });
  assert.ok(events.length >= 3);
  assert.ok(events.some((e) => e.eventType === "LOGIN_FAILURE"));
  assert.ok(events.some((e) => e.eventType === "AUTHORIZATION_FAILURE"));
});

// ============================================================================
// 34. EXPORT CONTROLS TESTS
// ============================================================================

test("34. Export Controls: Enforces server-side permissions by role and logs access events", () => {
  // 1. Viewer restricted to <= 50 records and blocked from audit reports
  const viewerAudit = canExport({
    role: "viewer",
    exportType: "AUDIT_REPORT",
    scope: "audit",
    recordCount: 10,
  });
  assert.equal(viewerAudit.allowed, false);

  const viewerLarge = canExport({
    role: "viewer",
    exportType: "CSV",
    scope: "invoices",
    recordCount: 100,
  });
  assert.equal(viewerLarge.allowed, false);

  const viewerValid = canExport({
    role: "viewer",
    exportType: "CSV",
    scope: "invoices",
    recordCount: 25,
  });
  assert.equal(viewerValid.allowed, true);
  assert.equal(viewerValid.requiresStepUpMfa, false);

  // 2. Finance permitted financial reports up to 5,000 records; bulk requires MFA
  const financeBulk = canExport({
    role: "finance",
    exportType: "CSV",
    scope: "invoices",
    recordCount: 500,
  });
  assert.equal(financeBulk.allowed, true);
  assert.equal(financeBulk.requiresStepUpMfa, true);

  // 3. Admin can export full audit report with step-up MFA
  const adminAudit = canExport({
    role: "admin",
    exportType: "AUDIT_REPORT",
    scope: "audit",
    recordCount: 80,
  });
  assert.equal(adminAudit.allowed, true);
  assert.equal(adminAudit.requiresStepUpMfa, true);

  // Execute actual export test
  const ledger = seed("test-co", testDate);
  const exported = executeExport(ledger, adminActor, {
    exportType: "CSV",
    scope: "invoices",
    format: "CSV",
    reason: "Monthly financial audit",
    mfaCode: "123456",
  });

  assert.ok(exported.filename.endsWith(".csv"));
  assert.equal(exported.mimeType, "text/csv");
  assert.ok(exported.recordCount > 0);
  assert.ok(exported.content.includes("invoice_number"));
});

// ============================================================================
// 35. MULTI-LAYER RATE LIMITS TESTS
// ============================================================================

test("35. Multi-Layer Rate Limits: Enforces sliding window limits and bounds AI tool calls", () => {
  const policy = {
    windowSeconds: 60,
    maxRequests: 3,
    identifierName: "TEST_RATE_LIMIT",
  };

  const key = "user-ratelimit-test";

  // Requests 1, 2, 3 succeed
  assert.equal(checkRateLimit(key, policy).allowed, true);
  assert.equal(checkRateLimit(key, policy).allowed, true);
  assert.equal(checkRateLimit(key, policy).allowed, true);

  // Request 4 exceeds limit and throws
  assert.throws(
    () => checkRateLimit(key, policy),
    /Rate limit exceeded for TEST_RATE_LIMIT/,
  );

  // Bounded AI tool calls (max 8)
  const tracker = { count: 0 };
  let count = 0;
  for (let i = 0; i < 8; i++) {
    const res = executeBoundedToolCall(tracker, () => {
      count++;
      return { ok: true };
    });
    assert.equal(res.ok, true);
  }
  assert.equal(count, 8);
  assert.equal(tracker.count, 8);

  // 9th call is blocked with controlled error message
  assert.throws(
    () => executeBoundedToolCall(tracker, () => ({ ok: true })),
    /I couldn't retrieve additional financial evidence for this answer\./,
  );
});
