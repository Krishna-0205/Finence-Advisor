import { test } from "node:test";
import assert from "node:assert/strict";
import { seed } from "../src/server/seed";
import { financialEngine } from "../src/server/finance";
import {
  buildLedgerCalculations,
  getMetricLineage,
  getCalculationSources,
  CALCULATION_VERSIONS,
} from "../src/server/finance/calculation-repository";
import { advisor, AI_READ_ONLY_TOOLS } from "../src/server/ai";
import {
  createReceivableDelayDriver,
  type DriverInput,
  calculateCashFlowDrivers,
} from "../src/server/finance/cash-flow-driver-engine";
import type { ReceivableDelayEvent } from "../src/domain/finance/cash-flow-drivers";

test("Lineage-Backed KPIs: Every metric carries calculation ID, formula, version, and source records", async () => {
  const asOf = "2026-09-22";
  const l = seed("test_lineage_co", asOf);
  const m = financialEngine(l, asOf);

  assert.ok(m.lineage_kpis);
  assert.ok(m.calculations);

  // 1. Payables Lineage
  const payablesLineage = m.lineage_kpis.payables;
  assert.equal(payablesLineage.value.minor, m.payables);
  assert.equal(payablesLineage.lineage.metric, "OUTSTANDING_PAYABLES");
  assert.equal(payablesLineage.lineage.calculationVersion, "payables-total-v3");
  assert.ok(payablesLineage.lineage.formula?.includes("SUM(invoice.amount"));
  assert.ok(payablesLineage.lineage.sourceRecordCount > 0);

  // Retrieve via repository
  const payCalc = await getMetricLineage("test_lineage_co", payablesLineage.lineage.calculationId);
  assert.equal(payCalc.metric, "OUTSTANDING_PAYABLES");
  assert.equal(payCalc.sourceRecords.length, payablesLineage.lineage.sourceRecordCount);

  // 2. Receivables Lineage
  const receivablesLineage = m.lineage_kpis.receivables;
  assert.equal(receivablesLineage.value.minor, m.receivables);
  assert.equal(receivablesLineage.lineage.calculationVersion, "receivables-total-v2");
  assert.ok(receivablesLineage.lineage.sourceRecordCount > 0);

  // 3. Cash Lineage
  const cashLineage = m.lineage_kpis.cash;
  assert.equal(cashLineage.value.minor, m.cash);
  assert.equal(cashLineage.lineage.calculationVersion, "cash-reconciled-v2");
  assert.ok(cashLineage.lineage.formula?.includes("opening_cash + SUM(receipts)"));

  // Check calculation sources
  const sources = await getCalculationSources("test_lineage_co", cashLineage.lineage.calculationId);
  assert.ok(sources.length > 0);
  assert.ok(sources.some((s) => s.recordType === "CASH_FLOW" && s.referenceNumber === "OPENING-BALANCE"));
});

test("ReceivableDelayEvent: Mathematically defensible delayed collections", () => {
  const delayEvent: ReceivableDelayEvent = {
    receivableId: "rec_1001",
    originalExpectedDate: "2026-06-10",
    revisedExpectedDate: "2026-06-27",
    amount: { currency: "INR", minor: 21000000 }, // ₹2.1L
    reason: "Customer requested extension to June 27",
  };

  const driverRecord = createReceivableDelayDriver(delayEvent);
  assert.equal(driverRecord.id, "rec_1001");
  assert.equal(driverRecord.type, "RECEIVABLE_DELAYS");
  assert.equal(driverRecord.amountMinor, -21000000n);

  const input: DriverInput = {
    periodStart: "2026-06-01",
    periodEnd: "2026-06-30",
    records: [
      driverRecord,
      {
        id: "pay_1",
        type: "SUPPLIER_PAYMENTS",
        amountMinor: -42000000n, // -₹4.2L
        currency: "INR",
      },
      {
        id: "opex_1",
        type: "OPERATING_EXPENSES",
        amountMinor: -13000000n, // -₹1.3L
        currency: "INR",
      },
    ],
  };

  const analysis = calculateCashFlowDrivers(input);
  assert.equal(analysis.primaryDriver, "SUPPLIER_PAYMENTS");
  assert.equal(analysis.drivers.length, 3);

  const delayDriver = analysis.drivers.find((d) => d.type === "RECEIVABLE_DELAYS")!;
  assert.ok(delayDriver);
  assert.equal(delayDriver.impact.minor, -21000000);
  assert.equal(delayDriver.sourceRecordCount, 1);
});

test("AI Security & Answer Lineage: Enforces read-only tool boundary and packages audit evidence", async () => {
  const l = seed("test_sec_co");

  // Verify read-only tools exist and only expose read queries
  assert.ok(AI_READ_ONLY_TOOLS.get_cash_position);
  assert.ok(AI_READ_ONLY_TOOLS.get_payables);
  assert.ok(AI_READ_ONLY_TOOLS.get_invoice);
  assert.ok(AI_READ_ONLY_TOOLS.get_vendor_history);
  assert.ok(AI_READ_ONLY_TOOLS.get_budget_status);
  assert.ok(AI_READ_ONLY_TOOLS.simulate_payment);

  // Test read-only tool returns verifiable calculation ID
  const cashPos = AI_READ_ONLY_TOOLS.get_cash_position(l);
  assert.equal(cashPos.metric, "CURRENT_CASH");
  assert.ok(cashPos.calculationId);
  assert.equal(cashPos.calculationVersion, "cash-reconciled-v2");

  // Verify advisor response includes structured evidence package with calculationId and versions
  const ans = await advisor(l, "Why is my cash position deteriorating?");
  assert.ok(ans.evidence);
  assert.ok(ans.evidence.length > 0);
  assert.ok(ans.evidence[0].calculationId);
  assert.ok(ans.evidence[0].calculationVersion);
  assert.ok(ans.evidence[0].dataAsOf);
});
