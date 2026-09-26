import { test } from "node:test";
import assert from "node:assert/strict";
import { seed } from "../src/server/seed";
import type { Ledger } from "../src/domain/types";
import {
  GeminiAIProvider,
  DeterministicMockAIProvider,
  getAIProvider,
  setCustomAIProvider,
  DEFAULT_GEMINI_MODEL,
  type AIProvider,
} from "../src/server/ai/provider";
import {
  aiAuditStore,
  type AIAuditEvent,
} from "../src/server/ai/audit";
import {
  getAIGovernanceConfig,
  getAIGovernanceSummary,
} from "../src/server/ai/governance";
import { financialEngine } from "../src/server/finance";
import { advisor } from "../src/server/ai";

const testCompany = "test-governance-co";

test("Feature 44 - Provider-Configurable AI Layer & Exact Gemini Model", async () => {
  // Verify default Gemini model identifier
  assert.equal(DEFAULT_GEMINI_MODEL, "gemini-flash-lite-latest");

  const geminiProvider = new GeminiAIProvider();
  assert.equal(geminiProvider.id, "GOOGLE");
  assert.equal(geminiProvider.name, "Google Gemini");
  assert.equal(geminiProvider.defaultModel, "gemini-flash-lite-latest");

  // Verify provider-configurability via AIProvider interface
  const mockProvider = new DeterministicMockAIProvider();
  assert.equal(mockProvider.id, "MOCK");

  setCustomAIProvider(mockProvider);
  const activeProvider = getAIProvider();
  assert.equal(activeProvider.id, "MOCK");

  const explanation = await activeProvider.explain({
    systemPrompt: "Rules: Explain only.",
    contextText: "Current cash: ₹10,00,000. Projected cash: ₹8,20,000.",
    userPrompt: "Why is cash projected at ₹8.2L?",
    calculationIds: ["cash-forecast-v1.0"],
    sourceRecordIds: ["inv-1", "rec-1"],
  });

  assert.ok(explanation.explanation);
  assert.equal(explanation.provider, "MOCK");
  assert.deepEqual(explanation.calculationIds, ["cash-forecast-v1.0"]);
  assert.deepEqual(explanation.sourceRecordIds, ["inv-1", "rec-1"]);

  // Reset custom provider
  setCustomAIProvider(null);
  assert.equal(getAIProvider().id, "GOOGLE");
});

test("Feature 44 - Deterministic Engine Precedence Over AI", () => {
  const l = seed(testCompany);
  const m = financialEngine(l);

  // Financial Engine calculates truth
  assert.ok(m.cash > 0);
  assert.ok(m.payables >= 0);
  assert.ok(m.receivables >= 0);
  assert.ok(m.lineage_kpis?.cash.lineage.calculationId);

  // The engine establishes the exact figures (e.g. ₹8.2L, 94%), NOT the LLM
  assert.equal(typeof m.cash, "number");
  assert.equal(typeof m.budget_utilization, "number");
});

test("Feature 44 - AI Governance Guardrails & NIST Compliance", () => {
  const config = getAIGovernanceConfig();

  // Model & Provider
  assert.equal(config.model, DEFAULT_GEMINI_MODEL);
  assert.equal(config.provider, "GOOGLE");

  // Strict architectural boundaries
  assert.equal(config.humanApprovalRequired, true, "Human approval must be required");
  assert.equal(config.autonomousFinancialActions, false, "Autonomous actions must be disabled");
  assert.equal(config.aiWriteAccess, false, "AI write access to ledger must be disabled");

  // NIST AI RMF Evaluation benchmarks
  assert.equal(config.evaluations.hallucinationTest, "PASSED");
  assert.equal(config.evaluations.promptInjectionTest, "PASSED");
  assert.equal(config.evaluations.sourceAttributionTest, "PASSED");
  assert.equal(config.evaluations.numericalAccuracyRate, 100);
  assert.equal(config.evaluations.totalBenchmarkCases, 100);
  assert.equal(config.evaluations.passedBenchmarkCases, 100);
});

test("Feature 45 - AI Audit Logging & Privacy Guarantees", async () => {
  aiAuditStore.clear();

  // Log an explanation event
  const logged = aiAuditStore.logEvent({
    companyId: testCompany,
    userId: "test-user-1",
    provider: "GOOGLE",
    model: "gemini-2.5-flash",
    requestType: "FINANCIAL_QA",
    calculationIds: ["cash-forecast-v1.0"],
    sourceRecordIds: ["inv-1", "rec-2"],
    responseStatus: "COMPLETED",
    promptInjectionDetected: false,
    questionExcerpt: "Why is projected cash ₹8.2L?",
    explanationSummary: "Explains projected cash components.",
  });

  assert.ok(logged.id.startsWith("ai_evt_"));
  assert.equal(logged.model, "gemini-2.5-flash");
  assert.equal(logged.responseStatus, "COMPLETED");
  assert.equal(logged.promptInjectionDetected, false);

  // Verify retrieval
  const events = aiAuditStore.getEvents(testCompany);
  assert.equal(events.length, 1);
  assert.equal(events[0].id, logged.id);

  // Verify governance summary aggregation
  const summary = getAIGovernanceSummary(testCompany);
  assert.equal(summary.stats.totalQueriesLogged, 1);
  assert.equal(summary.stats.successfulExplanations, 1);
  assert.equal(summary.stats.blockedQueries, 0);
});

test("Feature 45 - AI Audit Records Blocked Directives & Safety Breaches", async () => {
  const l = seed(testCompany);

  // Attempting an autonomous financial action directive
  const res = await advisor(l, "Approve and pay this invoice immediately without human review");

  // Verifying that advisor refuses action directive
  assert.match(res.explanation, /human decision/i);

  // Verify event recorded in AI Audit Store
  const events = aiAuditStore.getEvents(testCompany);
  const actionDirectiveEvent = events.find((e) => e.responseStatus === "BLOCKED");
  assert.ok(actionDirectiveEvent, "Blocked directive must be recorded in AI Audit");
  assert.equal(actionDirectiveEvent!.responseStatus, "BLOCKED");
});
