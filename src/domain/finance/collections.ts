import type { Receivable, Receipt } from "../types";
import { addDays, today } from "../money";
import type { CustomerPaymentBehavior } from "./customer-behavior";

export type AgingBucket =
  | "CURRENT"
  | "DAYS_1_30"
  | "DAYS_31_60"
  | "DAYS_61_90"
  | "DAYS_90_PLUS";

export interface ReceivableAgingItem {
  id: string;
  referenceNumber: string;
  customerName: string;
  dueDate: string;
  expectedCollectionDate: string;
  amountMinor: number;
  receivedMinor: number;
  outstandingMinor: number;
  daysOverdue: number;
  bucket: AgingBucket;
  status: "OPEN" | "PARTIALLY_COLLECTED" | "COLLECTED" | "OVERDUE";
  calculationId: string;
}

export interface AgingBucketSummary {
  bucket: AgingBucket;
  label: string;
  amountMinor: number;
  count: number;
  items: ReceivableAgingItem[];
}

export interface CustomerCollectionSummary {
  customerId: string;
  customerName: string;
  totalOutstandingMinor: number;
  overdueMinor: number;
  oldestDaysOverdue: number;
  receivableCount: number;
  overdueCount: number;
  averageHistoricalDelayDays: number;
  priorityScore: number;
  behavior?: CustomerPaymentBehavior;
}

export interface CollectionSignal {
  customerId: string;
  customerName: string;
  outstandingMinor: number;
  overdueMinor: number;
  oldestDaysOverdue: number;
  overdueInvoiceCount: number;
  averageHistoricalDelayDays: number;
  priorityScore: number;
  recommendation: string;
  calculationId: string;
  calculationVersion: string;
}

export interface ReceivablesIntelligenceReport {
  asOf: string;
  totalOutstandingMinor: number;
  expectedThisWeekMinor: number;
  totalOverdueMinor: number;
  overdue60DaysPlusMinor: number;
  overdue60DaysSummary: string; // e.g. "₹3.4L receivables are overdue by more than 60 days."

  aging: Record<AgingBucket, AgingBucketSummary>;
  customers: CustomerCollectionSummary[];
  signals: CollectionSignal[];
  primaryPriorityCustomer: string | null;
  summaryRecommendation: string; // e.g. "Prioritize collection from Customer X."

  collectionReliabilityPercent: number;
  delayedReceivablesCount: number;

  calculationId: string;
  calculationVersion: string;
  generatedAt: string;
}

export const COLLECTIONS_VERSION = "collections-intelligence-v1";

/**
 * Calculates deterministic difference in days between two YYYY-MM-DD date strings.
 */
export function differenceInDays(asOf: string, dueDate: string): number {
  const d1 = new Date(asOf + "T12:00:00Z");
  const d2 = new Date(dueDate + "T12:00:00Z");
  return Math.round((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Returns the deterministic aging bucket according to days overdue.
 */
export function getAgingBucket(dueDate: string, asOf = today()): AgingBucket {
  const daysOverdue = differenceInDays(asOf, dueDate);

  if (daysOverdue <= 0) {
    return "CURRENT";
  }
  if (daysOverdue <= 30) {
    return "DAYS_1_30";
  }
  if (daysOverdue <= 60) {
    return "DAYS_31_60";
  }
  if (daysOverdue <= 90) {
    return "DAYS_61_90";
  }
  return "DAYS_90_PLUS";
}
