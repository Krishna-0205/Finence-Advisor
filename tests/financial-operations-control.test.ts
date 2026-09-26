import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculateCustomerPaymentBehaviors,
  getBehavioralExpectedCollectionDate,
  CUSTOMER_BEHAVIOR_VERSION,
} from "../src/domain/finance/customer-behavior";
import {
  calculateVendorIntelligence,
  VENDOR_INTELLIGENCE_VERSION,
  DEFAULT_CONCENTRATION_THRESHOLD,
} from "../src/domain/finance/vendor-intelligence";
import {
  calculateSpendConcentration,
  calculateHHI,
  SPEND_CONCENTRATION_VERSION,
} from "../src/domain/finance/spend-concentration";
import {
  getAgingBucket,
  differenceInDays,
  COLLECTIONS_VERSION,
} from "../src/domain/finance/collections";
import { calculateReceivablesIntelligence } from "../src/server/finance/collections-intelligence";
import { financialEngine } from "../src/server/finance";
import { advisor } from "../src/server/ai";
import { seed } from "../src/server/seed";

const TEST_DATE = "2026-09-22";

test("19. Customer Payment Behavior: Calculates payment timing, delay, on-time rate, and forecast adjustment", () => {
  const ledger = seed();
  const behaviors = calculateCustomerPaymentBehaviors(ledger, TEST_DATE);

  assert.ok(behaviors);
  const aster = behaviors["cust_aster_technologies"];
  assert.ok(aster, "Aster Technologies behavior profile should exist");

  // Aster Technologies has 3 historical paid invoices with 34 days payment and 30 days contracted terms
  assert.equal(aster.contractedPaymentDays, 30);
  assert.equal(aster.averagePaymentDays, 34);
  assert.equal(aster.averageDelayDays, 4);
  assert.equal(aster.onTimePercentage, 0);
  assert.equal(aster.latePercentage, 100);
  assert.equal(aster.paidInvoiceCount, 3);
  assert.ok(aster.outstandingMinor > 0);
  assert.ok(aster.largestReceivableMinor >= 20000000);
  assert.equal(aster.calculationVersion, CUSTOMER_BEHAVIOR_VERSION);

  // Meridian Labs has on-time payment behavior
  const meridian = behaviors["cust_meridian_labs"];
  assert.ok(meridian, "Meridian Labs behavior profile should exist");
  assert.equal(meridian.contractedPaymentDays, 30);
  assert.equal(meridian.averagePaymentDays, 30);
  assert.equal(meridian.averageDelayDays, 0);
  assert.equal(meridian.onTimePercentage, 100);
  assert.equal(meridian.latePercentage, 0);

  // Forecast collection adjustment
  const sampleReceivable = ledger.receivables.find((r) => r.customer_name === "Aster Technologies")!;
  const adjustedDate = getBehavioralExpectedCollectionDate(sampleReceivable, aster);
  // Adjusted date should be due_date + 4 days delay
  const expectedAdjustment = 4;
  const dayDiff = differenceInDays(adjustedDate, sampleReceivable.due_date);
  assert.equal(dayDiff, expectedAdjustment);
});

test("20. Vendor Intelligence: Calculates cost trends, payment frequency, terms, and duplicate signals", () => {
  const ledger = seed();
  const vendorReport = calculateVendorIntelligence(ledger, TEST_DATE);

  assert.ok(vendorReport);
  assert.equal(vendorReport.calculationVersion, VENDOR_INTELLIGENCE_VERSION);
  assert.ok(vendorReport.totalSupplierSpendMinor > 0);

  const cloudMesh = vendorReport.vendors.find((v) => v.vendorName === "CloudMatrix" || v.vendorName === "CloudMesh");
  assert.ok(cloudMesh, "CloudMesh vendor intelligence should exist");

  // Check price trend exists and has multiple price history points
  assert.ok(cloudMesh.priceHistory.length >= 3, "CloudMesh should have price history points");
  assert.ok(cloudMesh.priceTrendPercentage > 0, "CloudMesh should show upward price trend");
  assert.ok(cloudMesh.averageInvoiceMinor > 0);
  assert.ok(cloudMesh.invoiceFrequency >= 4);
  assert.ok(cloudMesh.paymentTermsDays > 0);

  // Check duplicate signals from risk engine (inv-1042 and inv-1043 duplicate CM-1042)
  assert.ok(cloudMesh.duplicateSignalCount >= 1, "CloudMesh should flag duplicate signals");
  assert.ok(
    cloudMesh.duplicateSignals.some((s) => s.invoiceNumber === "CM-1042"),
    "Duplicate signal should reference CM-1042",
  );

  // Check underlying invoices list is populated
  assert.ok(cloudMesh.underlyingInvoices.length >= 4);
  assert.ok(cloudMesh.underlyingInvoices.some((i) => i.invoiceNumber === "CM-1042"));
});

test("20A. Vendor Concentration: Identifies single-supplier dependency against policy threshold", () => {
  const ledger = seed();
  const vendorReport = calculateVendorIntelligence(ledger, TEST_DATE, 30);

  assert.equal(vendorReport.policyThresholdPercentage, 30);
  assert.ok(vendorReport.vendors.length > 0);

  // Total concentration across all vendors should sum approximately to 100%
  const totalShare = vendorReport.vendors.reduce(
    (sum, v) => sum + v.spendConcentrationPercentage,
    0,
  );
  assert.ok(totalShare >= 98 && totalShare <= 102, `Total concentration share should be ~100%, got ${totalShare}`);

  // Top vendor should have highest spend
  assert.equal(vendorReport.topVendor?.vendorId, vendorReport.vendors[0].vendorId);

  // High concentration vendors (>30%) should be identified
  assert.ok(
    vendorReport.highConcentrationVendors.length > 0,
    "Should flag high concentration vendors exceeding 30%",
  );
  assert.ok(
    vendorReport.highConcentrationVendors.every((v) => v.spendConcentrationPercentage >= 30),
  );
});

test("21. Spend Concentration Analysis: Multi-dimensional concentration across Vendor, Category, and Department", () => {
  const ledger = seed();
  const spendReport = calculateSpendConcentration(ledger, TEST_DATE);

  assert.ok(spendReport);
  assert.equal(spendReport.calculationVersion, SPEND_CONCENTRATION_VERSION);
  assert.ok(spendReport.totalSpendMinor > 0);

  // Vendor Concentration
  const vConc = spendReport.vendorConcentration;
  assert.equal(vConc.dimension, "VENDOR");
  assert.ok(vConc.cr1 > 0);
  assert.ok(vConc.cr3 >= vConc.cr1);
  assert.ok(vConc.cr5 >= vConc.cr3);
  assert.ok(vConc.hhi > 0);
  assert.ok(["LOW", "MODERATE", "HIGH"].includes(vConc.riskLevel));
  assert.ok(vConc.buckets.length > 0);

  // Category Concentration
  const cConc = spendReport.categoryConcentration;
  assert.equal(cConc.dimension, "CATEGORY");
  assert.ok(cConc.cr1 > 0);
  assert.ok(cConc.hhi > 0);
  assert.ok(cConc.buckets.some((b) => b.name === "Technology"));

  // Department Concentration
  const dConc = spendReport.departmentConcentration;
  assert.equal(dConc.dimension, "DEPARTMENT");
  assert.ok(dConc.cr1 > 0);
  assert.ok(dConc.hhi > 0);

  // HHI calculation helper test
  const testShares = [40, 30, 20, 10]; // 1600 + 900 + 400 + 100 = 3000 -> HIGH
  const { hhi, riskLevel } = calculateHHI(testShares);
  assert.equal(hhi, 3000);
  assert.equal(riskLevel, "HIGH");
});

test("22. Collections & Aging: Buckets overdue receivables and highlights overdue > 60 days with recommendation", () => {
  const ledger = seed();
  const collections = calculateReceivablesIntelligence(ledger, TEST_DATE);

  assert.ok(collections);
  assert.equal(collections.calculationVersion, COLLECTIONS_VERSION);

  // Check aging buckets are present
  assert.ok(collections.aging.CURRENT);
  assert.ok(collections.aging.DAYS_1_30);
  assert.ok(collections.aging.DAYS_31_60);
  assert.ok(collections.aging.DAYS_61_90);
  assert.ok(collections.aging.DAYS_90_PLUS);

  // Customer X is overdue by 70 days (which is > 60 days)
  assert.ok(
    collections.overdue60DaysPlusMinor >= 3400000,
    "Overdue 60+ days should include Customer X (₹3.4L)",
  );
  assert.ok(
    collections.overdue60DaysSummary.includes("overdue by more than 60 days"),
    `Summary should mention 60 days overdue, got: ${collections.overdue60DaysSummary}`,
  );
  assert.ok(
    collections.summaryRecommendation.includes("Customer X"),
    `Recommendation should prioritize Customer X, got: ${collections.summaryRecommendation}`,
  );

  // Priority customer should be Customer X due to highest overdue delay
  assert.equal(collections.primaryPriorityCustomer, "Customer X");
});

test("Financial Operations Control: Integrated into financialEngine", () => {
  const ledger = seed();
  const metrics = financialEngine(ledger, TEST_DATE);

  assert.ok(metrics.customer_payment_behaviors);
  assert.ok(metrics.vendor_intelligence);
  assert.ok(metrics.spend_concentration);
  assert.ok(metrics.receivables_intelligence);

  // Projections should incorporate behavioral expected collection dates
  assert.ok(metrics.projections.length === 4);
  for (const proj of metrics.projections) {
    assert.ok(typeof proj.inflow === "number");
    assert.ok(typeof proj.outflow === "number");
  }
});

test("AI Advisor: Answers operational questions without hallucinations or numeric output", async () => {
  const ledger = seed();

  // Test Customer Payment Behavior query
  const q1 = await advisor(ledger, "What is Customer A's historical payment behavior and collection delay?");
  assert.ok(q1.explanation.length > 0);
  assert.ok(!/[0-9₹$€]/.test(q1.explanation), "Explanation must not hallucinate raw numerals");
  assert.ok(q1.citations.length > 0);

  // Test Vendor Concentration query
  const q2 = await advisor(ledger, "What is our supplier vendor concentration risk?");
  assert.ok(q2.explanation.length > 0);
  assert.ok(!/[0-9₹$€]/.test(q2.explanation), "Explanation must not hallucinate raw numerals");
  assert.ok(q2.citations.length > 0);

  // Test Spend Concentration / Budget Variance query ("Why is IT spending above plan?")
  const q3 = await advisor(ledger, "Why is IT spending above plan?");
  assert.ok(q3.explanation.length > 0);
  assert.ok(!/[0-9₹$€]/.test(q3.explanation), "Explanation must not hallucinate raw numerals");
  assert.ok(q3.citations.length > 0);

  // Test Collections Aging query
  const q4 = await advisor(ledger, "What is the overdue receivables aging status?");
  assert.ok(q4.explanation.length > 0);
  assert.ok(!/[0-9₹$€]/.test(q4.explanation), "Explanation must not hallucinate raw numerals");
});
