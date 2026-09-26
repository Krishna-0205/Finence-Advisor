import { test } from "node:test";
import assert from "node:assert/strict";
import { seed } from "../src/server/seed";
import type { Actor, Ledger } from "../src/domain/types";
import {
  encodeCursor,
  decodeCursor,
  paginateByCursor,
} from "../src/domain/platform/pagination";
import {
  AnalyticalCache,
  analyticalCache,
} from "../src/server/platform/cache";
import {
  enqueueJob,
  getJob,
  listJobs,
} from "../src/server/platform/jobs";
import {
  getNotifications,
  markNotificationAsRead,
  syncLedgerNotifications,
} from "../src/server/platform/notifications";
import {
  calculateSmartPriorities,
} from "../src/domain/platform/alert-prioritization";
import {
  generateWhyNowRecommendations,
} from "../src/domain/platform/recommendation-engine";
import {
  DEFAULT_FINANCIAL_POLICY,
  createCompanyPolicy,
} from "../src/domain/platform/policy-config";
import {
  getCompanyPolicy,
  updateCompanyPolicy,
} from "../src/server/platform/policy-store";
import {
  explainMetric,
} from "../src/domain/platform/explain-number";
import {
  calculateFinancialDataHealth,
  DATA_HEALTH_VERSION,
} from "../src/domain/platform/data-health";

const testCompany = "test-platform-co";
const testDate = "2026-09-24";

const adminActor: Actor = {
  user_id: "admin-platform",
  company_id: testCompany,
  name: "Platform Admin",
  role: "admin",
  mode: "demo",
};

const viewerActor: Actor = {
  user_id: "viewer-platform",
  company_id: testCompany,
  name: "Platform Viewer",
  role: "viewer",
  mode: "demo",
};

// ============================================================================
// Feature 36: Database Performance Layer (Pagination & Caching)
// ============================================================================

test("Feature 36 - Keyset Cursor Pagination", () => {
  const items = [
    { id: "inv-1", date: "2026-09-01", amount: 1000 },
    { id: "inv-2", date: "2026-09-02", amount: 2000 },
    { id: "inv-3", date: "2026-09-03", amount: 3000 },
    { id: "inv-4", date: "2026-09-04", amount: 4000 },
    { id: "inv-5", date: "2026-09-05", amount: 5000 },
  ];

  // First page with limit 2
  const page1 = paginateByCursor(items, { limit: 2 }, (i) => i.id);
  assert.equal(page1.items.length, 2);
  assert.equal(page1.hasMore, true);
  assert.ok(page1.nextCursor);

  // Decode cursor
  const decoded = decodeCursor(page1.nextCursor!);
  assert.equal(decoded, "inv-2");

  // Second page using nextCursor
  const page2 = paginateByCursor(
    items,
    { limit: 2, cursor: page1.nextCursor },
    (i) => i.id,
  );
  assert.equal(page2.items.length, 2);
  assert.equal(page2.items[0].id, "inv-3");
  assert.equal(page2.items[1].id, "inv-4");
  assert.equal(page2.hasMore, true);

  // Third page
  const page3 = paginateByCursor(
    items,
    { limit: 2, cursor: page2.nextCursor },
    (i) => i.id,
  );
  assert.equal(page3.items.length, 1);
  assert.equal(page3.items[0].id, "inv-5");
  assert.equal(page3.hasMore, false);
  assert.equal(page3.nextCursor, undefined);
});

test("Feature 36 - Analytical Caching System", async () => {
  const cache = new AnalyticalCache(10);

  let computationRuns = 0;
  const computeFn = () => {
    computationRuns++;
    return { calculatedMetric: 42000000 };
  };

  // First call computes
  const val1 = await cache.getOrCompute("metric_key_1", 500, computeFn);
  assert.equal(val1.calculatedMetric, 42000000);
  assert.equal(computationRuns, 1);

  // Second call returns cached value without recomputing
  const val2 = await cache.getOrCompute("metric_key_1", 500, computeFn);
  assert.equal(val2.calculatedMetric, 42000000);
  assert.equal(computationRuns, 1);

  // Invalidate by tag
  cache.set("tagged_key_1", { ok: true }, 500, ["invoices"]);
  assert.ok(cache.get("tagged_key_1"));
  cache.invalidateTag("invoices");
  assert.equal(cache.get("tagged_key_1"), undefined);
});

// ============================================================================
// Feature 37: Background Jobs (Idempotency & Async Worker)
// ============================================================================

test("Feature 37 - Background Job Idempotency and Execution", async () => {
  const idempotencyKey = "upload-job-uuid-12345";

  // Enqueue initial job
  const job1 = await enqueueJob({
    companyId: testCompany,
    type: "DOCUMENT_EXTRACTION",
    idempotencyKey,
    inputPayload: { filename: "invoice_august.pdf" },
  });

  assert.ok(job1.id);
  assert.equal(job1.type, "DOCUMENT_EXTRACTION");
  assert.equal(job1.idempotencyKey, idempotencyKey);
  assert.ok(["QUEUED", "PROCESSING", "COMPLETED"].includes(job1.status));

  // Second submission with SAME idempotency key returns exact same job
  const job2 = await enqueueJob({
    companyId: testCompany,
    type: "DOCUMENT_EXTRACTION",
    idempotencyKey,
    inputPayload: { filename: "invoice_august.pdf" },
  });

  assert.equal(job2.id, job1.id);
  assert.equal(job2.idempotencyKey, idempotencyKey);

  // Wait briefly for worker step progress
  await new Promise((resolve) => setTimeout(resolve, 80));
  const retrieved = getJob(testCompany, job1.id);
  assert.ok(retrieved);
  assert.ok(retrieved!.progress! >= 0);
});

// ============================================================================
// Feature 38: In-App & Email Notifications
// ============================================================================

test("Feature 38 - Notifications Delivery and Read Tracking", () => {
  const l = seed(testCompany);
  syncLedgerNotifications(l);

  const summary = getNotifications(testCompany, adminActor.user_id);
  assert.ok(summary.totalCount > 0);
  assert.ok(summary.notifications.length > 0);

  const firstNotif = summary.notifications[0];
  assert.ok(firstNotif.id);
  assert.ok(firstNotif.title);
  assert.ok(["INFO", "WARNING", "CRITICAL"].includes(firstNotif.severity));

  // Mark notification as read
  const marked = markNotificationAsRead(testCompany, firstNotif.id);
  assert.equal(marked, true);

  const updatedSummary = getNotifications(testCompany, adminActor.user_id);
  const updatedNotif = updatedSummary.notifications.find((n) => n.id === firstNotif.id);
  assert.ok(updatedNotif?.readAt);
});

// ============================================================================
// Feature 39: Smart Alert Prioritization
// ============================================================================

test("Feature 39 - Deterministic Smart Alert Prioritization (Today's Priorities)", () => {
  const l = seed(testCompany);
  const summary = calculateSmartPriorities(l, testDate);

  assert.ok(summary.generatedAt);
  assert.ok(summary.totalAlertsConsidered >= 0);
  assert.ok(Array.isArray(summary.topPriorities));
  assert.ok(summary.topPriorities.length <= 3);

  // Each priority item has a deterministic composite score
  for (const prio of summary.allPriorities) {
    assert.ok(prio.priorityScore >= 0 && prio.priorityScore <= 100);
    assert.ok(prio.financialImpactMinor >= 0);
    assert.ok(prio.urgencyScore >= 0 && prio.urgencyScore <= 100);
    assert.ok(prio.confidenceScore >= 0 && prio.confidenceScore <= 100);
    assert.ok(prio.actionRationale.length > 0);
    assert.ok(prio.actionText.length > 0);
  }

  // Priorities must be sorted descending by priorityScore
  for (let i = 0; i < summary.allPriorities.length - 1; i++) {
    assert.ok(
      summary.allPriorities[i].priorityScore >= summary.allPriorities[i + 1].priorityScore,
      "Priorities must be strictly ranked descending by priority score",
    );
  }
});

// ============================================================================
// Feature 40: "Why Now?" Recommendation Engine
// ============================================================================

test("Feature 40 - 'Why Now?' 4-Question Structured Recommendations", () => {
  const l = seed(testCompany);
  const recommendations = generateWhyNowRecommendations(l, testDate);

  assert.ok(Array.isArray(recommendations));
  assert.ok(recommendations.length > 0);

  for (const rec of recommendations) {
    // 4-question schema validation
    assert.ok(rec.whyThis && rec.whyThis.length > 10, "Must answer 'Why This?'");
    assert.ok(rec.whyNow && rec.whyNow.length > 10, "Must answer 'Why Now?'");
    assert.ok(
      rec.consequenceIfIgnored && rec.consequenceIfIgnored.length > 10,
      "Must answer 'What Happens If Ignored?'",
    );
    assert.ok(
      rec.suggestedAction && rec.suggestedAction.length > 5,
      "Must suggest actionable response",
    );

    // Evidence and lineage references
    assert.ok(Array.isArray(rec.evidence));
    assert.ok(Array.isArray(rec.calculationIds));
    assert.ok(Array.isArray(rec.sourceRecordIds));
  }
});

// ============================================================================
// Feature 41: Business Rules Configuration & Versioning
// ============================================================================

test("Feature 41 - Tenant Financial Policies and Immutable Versioning", () => {
  const initialPolicy = getCompanyPolicy(testCompany);
  assert.equal(initialPolicy.companyId, testCompany);
  assert.equal(initialPolicy.version, 1);
  assert.equal(initialPolicy.policyVersion, "finance-policy-v1.0");

  // Admin updates policy
  const updatedPolicy = updateCompanyPolicy(adminActor, {
    cashWarningMinor: 60000000, // ₹6L
    budgetWarningPercentage: 85,
  });

  assert.equal(updatedPolicy.version, 2);
  assert.equal(updatedPolicy.policyVersion, "finance-policy-v2.0");
  assert.equal(updatedPolicy.cashWarningMinor, 60000000);
  assert.equal(updatedPolicy.budgetWarningPercentage, 85);

  // Non-admin (viewer) cannot mutate policy
  assert.throws(
    () => {
      updateCompanyPolicy(viewerActor, { cashWarningMinor: 80000000 });
    },
    /Only Administrators can modify/,
  );
});

// ============================================================================
// Feature 42: "Explain This Number" 3-Level Signature Engine
// ============================================================================

test("Feature 42 - 'Explain This Number' 3-Level Explanation Hierarchy", () => {
  const l = seed(testCompany);

  // 1. Projected Cash Explanation
  const projectedExplanation = explainMetric(l, "PROJECTED_CASH", testDate);
  assert.equal(projectedExplanation.metricName, "PROJECTED_CASH");

  // Level 1: Simple
  assert.ok(projectedExplanation.formattedValue);
  assert.ok(projectedExplanation.level1Simple.length > 10);

  // Level 2: Calculation
  assert.ok(projectedExplanation.level2Calculation.formula);
  assert.ok(projectedExplanation.level2Calculation.terms.length >= 3);
  assert.equal(projectedExplanation.level3Evidence.calculationVersion, "cash-forecast-v1.0");

  // Level 3: Evidence Lineage
  assert.ok(projectedExplanation.level3Evidence.inflows.length >= 0);
  assert.ok(projectedExplanation.level3Evidence.outflows.length >= 0);
  assert.ok(projectedExplanation.level3Evidence.sourceRecordCount >= 0);

  // 2. Outstanding Payables Explanation
  const payablesExplanation = explainMetric(l, "OUTSTANDING_PAYABLES", testDate);
  assert.equal(payablesExplanation.metricName, "OUTSTANDING_PAYABLES");
  assert.ok(payablesExplanation.level2Calculation.terms.length > 0);
  assert.ok(payablesExplanation.level3Evidence.outflows.length >= 0);
});

// ============================================================================
// Feature 43: Financial Data Health Engine (5 Dimensions)
// ============================================================================

test("Feature 43 - Financial Data Health 5 Dimensions & Actionable Issues", () => {
  const l = seed(testCompany);
  const health = calculateFinancialDataHealth(l, testDate);

  assert.equal(health.calculationVersion, DATA_HEALTH_VERSION);
  assert.ok(health.overallScore >= 0 && health.overallScore <= 100);
  assert.ok(["EXCELLENT", "GOOD", "FAIR", "POOR"].includes(health.status));

  // Verify all 5 dimensions exist
  const dimensions = [
    health.completeness,
    health.consistency,
    health.freshness,
    health.integrity,
    health.reconciliation,
  ];

  for (const dim of dimensions) {
    assert.ok(dim.score >= 0 && dim.score <= 100);
    assert.ok(["HEALTHY", "WARNING", "CRITICAL"].includes(dim.status));
    assert.ok(dim.totalChecks >= 0);
    assert.ok(dim.passedChecks <= dim.totalChecks);
    assert.ok(dim.summary.length > 0);
  }

  // Issues list is structured and actionable
  assert.ok(Array.isArray(health.issues));
  for (const issue of health.issues) {
    assert.ok(issue.title.length > 0);
    assert.ok(issue.description.length > 0);
    assert.ok(issue.actionText.length > 0);
    assert.ok(issue.actionUrl.length > 0);
  }
});
