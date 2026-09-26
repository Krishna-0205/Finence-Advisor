import type { Ledger, Receivable } from "../../domain/types";
import { today, addDays, money } from "../../domain/money";
import { remainingReceivable } from "../finance";
import {
  type AgingBucket,
  type AgingBucketSummary,
  type ReceivableAgingItem,
  type CustomerCollectionSummary,
  type CollectionSignal,
  type ReceivablesIntelligenceReport,
  getAgingBucket,
  differenceInDays,
  COLLECTIONS_VERSION,
} from "../../domain/finance/collections";
import {
  calculateCustomerPaymentBehaviors,
  getBehavioralExpectedCollectionDate,
} from "../../domain/finance/customer-behavior";

export function calculateReceivablesIntelligence(
  ledger: Ledger,
  asOf = today(),
): ReceivablesIntelligenceReport {
  const customerBehaviors = calculateCustomerPaymentBehaviors(ledger, asOf);

  const agingBuckets: Record<AgingBucket, AgingBucketSummary> = {
    CURRENT: { bucket: "CURRENT", label: "Current", amountMinor: 0, count: 0, items: [] },
    DAYS_1_30: { bucket: "DAYS_1_30", label: "1–30 days", amountMinor: 0, count: 0, items: [] },
    DAYS_31_60: { bucket: "DAYS_31_60", label: "31–60 days", amountMinor: 0, count: 0, items: [] },
    DAYS_61_90: { bucket: "DAYS_61_90", label: "61–90 days", amountMinor: 0, count: 0, items: [] },
    DAYS_90_PLUS: { bucket: "DAYS_90_PLUS", label: "90+ days", amountMinor: 0, count: 0, items: [] },
  };

  const customerMap = new Map<
    string,
    {
      customerId: string;
      customerName: string;
      totalOutstandingMinor: number;
      overdueMinor: number;
      oldestDaysOverdue: number;
      receivableCount: number;
      overdueCount: number;
      delays: number[];
    }
  >();

  let totalOutstandingMinor = 0;
  let expectedThisWeekMinor = 0;
  let totalOverdueMinor = 0;
  let overdue60DaysPlusMinor = 0;
  let onTimeOrCollectedCount = 0;
  let delayedCount = 0;

  const weekEnd = addDays(asOf, 7);

  for (const r of ledger.receivables) {
    const outstanding = remainingReceivable(ledger, r.id, asOf);
    if (outstanding <= 0) {
      onTimeOrCollectedCount += 1;
      continue;
    }

    totalOutstandingMinor += outstanding;
    const daysOverdue = differenceInDays(asOf, r.due_date);
    const bucket = getAgingBucket(r.due_date, asOf);
    const isOverdue = daysOverdue > 0;

    if (isOverdue) {
      delayedCount += 1;
      totalOverdueMinor += outstanding;
      if (daysOverdue > 60) {
        overdue60DaysPlusMinor += outstanding;
      }
    } else {
      onTimeOrCollectedCount += 1;
    }

    const customerId = `cust_${r.customer_name.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
    const behavior = customerBehaviors[customerId];
    const expectedDate = getBehavioralExpectedCollectionDate(r, behavior);

    if (expectedDate >= asOf && expectedDate <= weekEnd) {
      expectedThisWeekMinor += outstanding;
    }

    const item: ReceivableAgingItem = {
      id: r.id,
      referenceNumber: r.reference_number || r.id,
      customerName: r.customer_name,
      dueDate: r.due_date,
      expectedCollectionDate: expectedDate,
      amountMinor: r.amount_minor,
      receivedMinor: r.amount_minor - outstanding,
      outstandingMinor: outstanding,
      daysOverdue: Math.max(0, daysOverdue),
      bucket,
      status: isOverdue ? "OVERDUE" : (r.amount_minor > outstanding ? "PARTIALLY_COLLECTED" : "OPEN"),
      calculationId: `calc_recv_aging_${r.id}`,
    };

    agingBuckets[bucket].amountMinor += outstanding;
    agingBuckets[bucket].count += 1;
    agingBuckets[bucket].items.push(item);

    // Group by customer
    const cEntry = customerMap.get(r.customer_name) || {
      customerId,
      customerName: r.customer_name,
      totalOutstandingMinor: 0,
      overdueMinor: 0,
      oldestDaysOverdue: 0,
      receivableCount: 0,
      overdueCount: 0,
      delays: [],
    };

    cEntry.totalOutstandingMinor += outstanding;
    cEntry.receivableCount += 1;
    if (isOverdue) {
      cEntry.overdueMinor += outstanding;
      cEntry.overdueCount += 1;
      cEntry.oldestDaysOverdue = Math.max(cEntry.oldestDaysOverdue, daysOverdue);
      cEntry.delays.push(daysOverdue);
    }
    customerMap.set(r.customer_name, cEntry);
  }

  const customers: CustomerCollectionSummary[] = [];
  const signals: CollectionSignal[] = [];

  for (const c of customerMap.values()) {
    const behavior = customerBehaviors[c.customerId];
    const avgDelay = behavior?.averageDelayDays ?? (
      c.delays.length > 0
        ? Math.round(c.delays.reduce((s, d) => s + d, 0) / c.delays.length)
        : 0
    );

    // Deterministic priority score: weighted overdue amount and delay
    const priorityScore =
      Math.round((c.overdueMinor / 100) * (c.oldestDaysOverdue / 30));

    const custSummary: CustomerCollectionSummary = {
      customerId: c.customerId,
      customerName: c.customerName,
      totalOutstandingMinor: c.totalOutstandingMinor,
      overdueMinor: c.overdueMinor,
      oldestDaysOverdue: c.oldestDaysOverdue,
      receivableCount: c.receivableCount,
      overdueCount: c.overdueCount,
      averageHistoricalDelayDays: avgDelay,
      priorityScore,
      behavior,
    };
    customers.push(custSummary);

    if (c.overdueCount > 0) {
      signals.push({
        customerId: c.customerId,
        customerName: c.customerName,
        outstandingMinor: c.totalOutstandingMinor,
        overdueMinor: c.overdueMinor,
        oldestDaysOverdue: c.oldestDaysOverdue,
        overdueInvoiceCount: c.overdueCount,
        averageHistoricalDelayDays: avgDelay,
        priorityScore,
        recommendation: `Prioritize collection from ${c.customerName}: ${money(c.totalOutstandingMinor)} outstanding, ${c.oldestDaysOverdue} days oldest delay, ${c.overdueCount} overdue invoice${c.overdueCount > 1 ? "s" : ""}.`,
        calculationId: `calc_signal_${c.customerId}`,
        calculationVersion: COLLECTIONS_VERSION,
      });
    }
  }

  customers.sort((a, b) => b.priorityScore - a.priorityScore);
  signals.sort((a, b) => b.priorityScore - a.priorityScore);

  const totalReceivables = ledger.receivables.length;
  const collectionReliabilityPercent =
    totalReceivables > 0
      ? Math.round((onTimeOrCollectedCount / totalReceivables) * 100)
      : 100;

  const topCustomer = signals[0]?.customerName || null;
  const overdue60DaysSummary =
    overdue60DaysPlusMinor > 0
      ? `${money(overdue60DaysPlusMinor)} receivables are overdue by more than 60 days.`
      : "No receivables are overdue by more than 60 days.";
  const summaryRecommendation = topCustomer
    ? `Prioritize collection from ${topCustomer}.`
    : "Receivables are currently performing on schedule.";

  return {
    asOf,
    totalOutstandingMinor,
    expectedThisWeekMinor,
    totalOverdueMinor,
    overdue60DaysPlusMinor,
    overdue60DaysSummary,
    aging: agingBuckets,
    customers,
    signals,
    primaryPriorityCustomer: topCustomer,
    summaryRecommendation,
    collectionReliabilityPercent,
    delayedReceivablesCount: delayedCount,
    calculationId: `calc_recv_intel_${asOf.replace(/-/g, "")}`,
    calculationVersion: COLLECTIONS_VERSION,
    generatedAt: new Date().toISOString(),
  };
}
