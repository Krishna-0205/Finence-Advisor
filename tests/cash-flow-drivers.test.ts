import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculateCashFlowDrivers,
  generateLedgerDriverAnalysis,
  extractLedgerDriverRecords,
  CALCULATION_VERSION,
  type DriverInput,
  type DriverRecord,
} from "../src/server/finance/cash-flow-driver-engine";
import {
  CASH_FLOW_DRIVER_TYPES,
  type CashFlowDriverType,
} from "../src/domain/finance/cash-flow-drivers";
import { seed } from "../src/server/seed";
import { financialEngine } from "../src/server/finance";

test("Cash-Flow Drivers: Deterministic calculation and ranking by absolute impact", () => {
  const periodStart = new Date("2026-09-01");
  const periodEnd = new Date("2026-09-30");

  const records: DriverRecord[] = [
    {
      id: "pay_1",
      type: "SUPPLIER_PAYMENTS",
      amountMinor: -50000000n, // ₹5.0L outflow
      currency: "INR",
    },
    {
      id: "pay_2",
      type: "SUPPLIER_PAYMENTS",
      amountMinor: -30000000n, // ₹3.0L outflow (Total SUPPLIER_PAYMENTS = -8.0L)
      currency: "INR",
    },
    {
      id: "rec_delay_1",
      type: "RECEIVABLE_DELAYS",
      amountMinor: -40000000n, // ₹4.0L shortfall due to delay
      currency: "INR",
    },
    {
      id: "opex_1",
      type: "OPERATING_EXPENSES",
      amountMinor: -15000000n, // ₹1.5L outflow
      currency: "INR",
    },
    {
      id: "inv_1",
      type: "INVESTING",
      amountMinor: -25000000n, // ₹2.5L outflow
      currency: "INR",
    },
  ];

  const input: DriverInput = {
    periodStart,
    periodEnd,
    records,
  };

  const analysis = calculateCashFlowDrivers(input);

  // Total impact: -50M + -30M + -40M + -15M + -25M = -160M (-₹16.0L)
  assert.equal(analysis.totalCashChange.minor, -160000000);
  assert.equal(analysis.calculationVersion, CALCULATION_VERSION);
  assert.equal(analysis.primaryDriver, "SUPPLIER_PAYMENTS");

  // Sorted by absolute impact:
  // 1. SUPPLIER_PAYMENTS: |-80M| = 80M
  // 2. RECEIVABLE_DELAYS: |-40M| = 40M
  // 3. INVESTING: |-25M| = 25M
  // 4. OPERATING_EXPENSES: |-15M| = 15M
  assert.equal(analysis.drivers.length, 4);
  assert.equal(analysis.drivers[0].type, "SUPPLIER_PAYMENTS");
  assert.equal(analysis.drivers[0].impact.minor, -80000000);
  assert.equal(analysis.drivers[0].contributionPercent, 50); // 80M / 160M = 50%
  assert.equal(analysis.drivers[0].sourceRecordCount, 2);
  assert.deepEqual(analysis.drivers[0].sourceRecordIds, ["pay_1", "pay_2"]);

  assert.equal(analysis.drivers[1].type, "RECEIVABLE_DELAYS");
  assert.equal(analysis.drivers[1].impact.minor, -40000000);
  assert.equal(analysis.drivers[1].contributionPercent, 25); // 40M / 160M = 25%

  assert.equal(analysis.drivers[2].type, "INVESTING");
  assert.equal(analysis.drivers[2].impact.minor, -25000000);
  assert.equal(analysis.drivers[2].contributionPercent, 15.62); // 25M / 160M = 15.62%

  assert.equal(analysis.drivers[3].type, "OPERATING_EXPENSES");
  assert.equal(analysis.drivers[3].impact.minor, -15000000);
  assert.equal(analysis.drivers[3].contributionPercent, 9.37); // 15M / 160M = 9.37%
});

test("Cash-Flow Drivers: Handles zero totalImpact gracefully", () => {
  const analysis = calculateCashFlowDrivers({
    periodStart: new Date(),
    periodEnd: new Date(),
    records: [],
  });

  assert.equal(analysis.totalCashChange.minor, 0);
  assert.equal(analysis.primaryDriver, null);
  assert.equal(analysis.drivers.length, 0);
});

test("Data Lineage & Drill-Down: Exact audit trail from ledger to cash movements", () => {
  const asOf = "2026-09-22";
  const l = seed("test_lineage_co", asOf);

  const analysis = generateLedgerDriverAnalysis(l, l.company.opening_date, asOf, asOf);

  assert.ok(analysis.drivers.length > 0);
  assert.ok(analysis.calculationVersion === CALCULATION_VERSION);
  assert.ok(analysis.lineage);

  // Lineage fields check
  assert.equal(analysis.lineage.metricKey, "total_cash_change");
  assert.ok(analysis.lineage.formula.includes("Net change = Sum of verified driver impacts"));
  assert.equal(analysis.lineage.dataTimestamp, asOf);
  assert.ok(analysis.lineage.generatedAt);
  assert.equal(analysis.lineage.sourceRecordCount, analysis.records.length);
  assert.equal(analysis.lineage.sourceRecordIds.length, analysis.records.length);

  // Drill-down items verification: every record has ID, date, amount, direction, and driverType
  for (const record of analysis.records) {
    assert.ok(record.id);
    assert.ok(record.reference);
    assert.ok(record.date);
    assert.ok(record.amount.minor >= 0);
    assert.ok(["INFLOW", "OUTFLOW", "NEUTRAL"].includes(record.direction));
    assert.ok(record.driverType);
  }

  // Verify financialEngine integration
  const m = financialEngine(l, asOf);
  assert.ok(m.cash_flow_drivers);
  assert.equal(m.cash_flow_drivers.calculationVersion, CALCULATION_VERSION);
  assert.ok(m.cash_flow_drivers.lineage.sourceRecordCount > 0);
});
