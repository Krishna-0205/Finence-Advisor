import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculateForecastConfidence,
  getConfidenceLevel,
  type ConfidenceInput,
} from "../src/server/finance/forecast-confidence";
import {
  calculateScenarioForecast,
  calculateAllScenarios,
  generateForecastResult,
  getStandardForecastResult,
  type ScenarioForecastInput,
  type ForecastTransaction,
} from "../src/server/finance/scenario-forecast-engine";
import { FORECAST_SCENARIO_DEFINITIONS } from "../src/domain/finance/forecast-scenario";
import { seed } from "../src/server/seed";
import { financialEngine } from "../src/server/finance";

test("Forecast Confidence: Calculates deterministic, auditable score and evidence", () => {
  // Case 1: High quality historical depth, large sample, high reliability
  const highInput: ConfidenceInput = {
    upcomingPayables: 25,
    upcomingReceivables: 15,
    historicalMonths: 12,
    overdueReceivables: 0,
    collectionReliability: 0.95,
    paymentReliability: 0.98,
    dataCompleteness: 1.0,
  };

  const highConf = calculateForecastConfidence(highInput);
  assert.equal(highConf.level, "HIGH");
  assert.ok(highConf.score >= 75);
  assert.equal(highConf.evidence.upcomingPayables, 25);
  assert.equal(highConf.evidence.upcomingReceivables, 15);
  assert.equal(highConf.evidence.historicalMonths, 12);
  assert.equal(highConf.evidence.overdueReceivables, 0);
  assert.ok(highConf.reasons.some((r) => r.includes("12 months of historical financial data")));

  // Case 2: Limited history and low sample size
  const lowInput: ConfidenceInput = {
    upcomingPayables: 3,
    upcomingReceivables: 2,
    historicalMonths: 1, // -30
    overdueReceivables: 2, // 2/2 = 1.0 overdue ratio -> -25
    collectionReliability: 0.70, // -4.5
    paymentReliability: 0.80, // -2
    dataCompleteness: 0.80, // -4
  };

  const lowConf = calculateForecastConfidence(lowInput);
  assert.equal(lowConf.level, "LOW");
  assert.ok(lowConf.score < 50);
  assert.ok(lowConf.reasons.some((r) => r.includes("Limited historical financial data")));
  assert.ok(lowConf.reasons.some((r) => r.includes("overdue receivables")));
  assert.ok(lowConf.reasons.some((r) => r.includes("materially elevated")));
});

test("Forecast Scenarios: Deterministic Base, Conservative, and Optimistic models", () => {
  const asOf = "2026-09-22";
  const horizonDays = 30; // Cutoff: 2026-10-22

  const transactions: ForecastTransaction[] = [
    // Receivable due 2026-10-15 (within horizon)
    // Delayed by 14 days in Conservative -> 2026-10-29 (pushed beyond 30-day cutoff!)
    {
      id: "rec_1",
      reference: "REC-101",
      amount: { currency: "INR", minor: 50000000 }, // ₹5.0L
      expectedDate: "2026-10-15",
      type: "RECEIVABLE",
    },
    // Payable due 2026-10-10 (within horizon)
    {
      id: "inv_1",
      reference: "INV-101",
      amount: { currency: "INR", minor: 20000000 }, // ₹2.0L
      expectedDate: "2026-10-10",
      type: "PAYABLE",
      discretionary: false,
    },
    // Discretionary expense due 2026-10-05
    {
      id: "inv_2",
      reference: "INV-102",
      amount: { currency: "INR", minor: 10000000 }, // ₹1.0L
      expectedDate: "2026-10-05",
      type: "OPERATING_EXPENSE",
      discretionary: true,
    },
  ];

  const input: ScenarioForecastInput = {
    companyId: "test_co",
    asOf,
    horizonDays,
    openingCash: { currency: "INR", minor: 100000000 }, // ₹10.0L
    transactions,
  };

  const scenarios = calculateAllScenarios(input);

  // BASE scenario:
  // Inflow = 50000000 (rec_1 collected on 2026-10-15)
  // Outflow = 20000000 + 10000000 = 30000000
  // Net = +20000000
  // Projected Cash = 100000000 + 20000000 = 120000000 (₹12.0L)
  assert.equal(scenarios.BASE.projectedCash.minor, 120000000);
  assert.equal(scenarios.BASE.inflow.minor, 50000000);
  assert.equal(scenarios.BASE.outflow.minor, 30000000);

  // CONSERVATIVE scenario:
  // rec_1 delayed 14 days to 2026-10-29 (> 2026-10-22) -> NOT collected in horizon! Inflow = 0
  // inv_1 accelerated 7 days to 2026-10-03 -> still in horizon (20000000)
  // inv_2 discretionary adjusted +10% -> 10000000 * 1.10 = 11000000
  // Total outflow = 20000000 + 11000000 = 31000000
  // Projected Cash = 100000000 + 0 - 31000000 = 69000000 (₹6.9L)
  assert.equal(scenarios.CONSERVATIVE.projectedCash.minor, 69000000);
  assert.equal(scenarios.CONSERVATIVE.inflow.minor, 0);
  assert.equal(scenarios.CONSERVATIVE.outflow.minor, 31000000);
  assert.equal(scenarios.CONSERVATIVE.assumptions.receivableDelayDays, 14);
  assert.equal(scenarios.CONSERVATIVE.assumptions.discretionaryExpenseAdjustment, 0.10);

  // OPTIMISTIC scenario:
  // rec_1 on time -> Inflow = 50000000
  // inv_1 delayed 7 days to 2026-10-17 -> still in horizon (20000000)
  // inv_2 discretionary adjusted -10% -> 10000000 * 0.90 = 9000000
  // Total outflow = 20000000 + 9000000 = 29000000
  // Projected Cash = 100000000 + 50000000 - 29000000 = 121000000 (₹12.1L)
  assert.equal(scenarios.OPTIMISTIC.projectedCash.minor, 121000000);
  assert.equal(scenarios.OPTIMISTIC.inflow.minor, 50000000);
  assert.equal(scenarios.OPTIMISTIC.outflow.minor, 29000000);
  assert.equal(scenarios.OPTIMISTIC.assumptions.discretionaryExpenseAdjustment, -0.10);

  // Relationship check: Conservative < Base <= Optimistic
  assert.ok(scenarios.CONSERVATIVE.projectedCash.minor < scenarios.BASE.projectedCash.minor);
  assert.ok(scenarios.BASE.projectedCash.minor <= scenarios.OPTIMISTIC.projectedCash.minor);
});

test("Ledger Integration & Lineage: Full audit trail from ledger records to forecast", () => {
  const l = seed("test_company", "2026-09-22");
  const asOf = "2026-09-22";

  const multiResult = generateForecastResult(l, asOf, 30);
  assert.equal(multiResult.companyId, "test_company");
  assert.equal(multiResult.horizonDays, 30);
  assert.ok(multiResult.confidence.score > 0);
  assert.ok(["HIGH", "MEDIUM", "LOW"].includes(multiResult.confidence.level));

  // Verify lineage
  assert.ok(multiResult.lineage.sourceRecordCount > 0);
  assert.equal(
    multiResult.lineage.sourceRecordCount,
    multiResult.lineage.payablesCount + multiResult.lineage.receivablesCount,
  );
  assert.ok(multiResult.lineage.formula.includes("Projected Cash = Current Cash"));

  // Verify financialEngine returns forecast
  const m = financialEngine(l, asOf);
  assert.ok(m.forecast);
  assert.equal(m.forecast.companyId, "test_company");
  assert.equal(m.forecast.currentCash.minor, m.cash);
  assert.equal(m.forecast.scenarios.BASE.projectedCash.minor, m.projections[1].cash);

  // Standard domain result format
  const standardResult = getStandardForecastResult(l, asOf, 30);
  assert.equal(standardResult.companyId, "test_company");
  assert.equal(standardResult.projectedCash.minor, m.forecast.scenarios.BASE.projectedCash.minor);
  assert.equal(standardResult.confidence.level, multiResult.confidence.level);
});
