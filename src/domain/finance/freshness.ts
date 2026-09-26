import type { Ledger } from "../types";

export interface DataFreshness {
  generatedAt: string;
  dataAsOf: string;
  lastTransactionAt?: string;
  ageSeconds: number;
  status: "FRESH" | "AGING" | "STALE";
  badgeText: string;
}

export interface FreshnessPolicy {
  metric: string;
  freshWithinSeconds: number;
  agingWithinSeconds: number;
}

export const DEFAULT_FRESHNESS_POLICIES: Record<string, FreshnessPolicy> = {
  REAL_TIME_CASH: {
    metric: "REAL_TIME_CASH",
    freshWithinSeconds: 300, // 5 minutes
    agingWithinSeconds: 1800, // 30 minutes
  },
  BANK_RECONCILIATION: {
    metric: "BANK_RECONCILIATION",
    freshWithinSeconds: 900, // 15 minutes
    agingWithinSeconds: 3600, // 1 hour
  },
  DAILY_BUDGET: {
    metric: "DAILY_BUDGET",
    freshWithinSeconds: 14400, // 4 hours
    agingWithinSeconds: 43200, // 12 hours
  },
  MONTHLY_REPORT: {
    metric: "MONTHLY_REPORT",
    freshWithinSeconds: 86400, // 24 hours
    agingWithinSeconds: 259200, // 3 days
  },
  FORECAST: {
    metric: "FORECAST",
    freshWithinSeconds: 3600, // 1 hour
    agingWithinSeconds: 86400, // 24 hours
  },
};

/**
 * Extracts the latest transaction timestamp from a ledger.
 */
export function getLastTransactionTimestamp(ledger: Ledger): string | undefined {
  const dates: string[] = [];

  for (const p of ledger.payments) {
    if (p.payment_date) dates.push(p.payment_date);
    if (p.created_at) dates.push(p.created_at);
  }

  for (const r of ledger.receipts) {
    if (r.receipt_date) dates.push(r.receipt_date);
    if (r.created_at) dates.push(r.created_at);
  }

  for (const i of ledger.invoices) {
    if (i.invoice_date) dates.push(i.invoice_date);
    if (i.created_at) dates.push(i.created_at);
  }

  if (dates.length === 0) return undefined;
  dates.sort();
  return dates[dates.length - 1];
}

/**
 * Formats elapsed duration into human-readable text (e.g., "2 min ago", "just now").
 */
export function formatAgeText(seconds: number): string {
  if (seconds < 60) return "just now";
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr${hours > 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

/**
 * Evaluates the freshness of a metric against a policy.
 */
export function evaluateFreshness(
  metricName: string,
  generatedAt: string,
  dataAsOf: string,
  lastTransactionAt?: string,
  customPolicy?: FreshnessPolicy,
): DataFreshness {
  const policy =
    customPolicy ||
    DEFAULT_FRESHNESS_POLICIES[metricName] ||
    DEFAULT_FRESHNESS_POLICIES.REAL_TIME_CASH;

  const nowMs = Date.parse(generatedAt) || Date.now();
  const refTimeMs = lastTransactionAt
    ? Date.parse(lastTransactionAt)
    : Date.parse(dataAsOf) || nowMs;

  const ageSeconds = Math.max(0, Math.floor((nowMs - refTimeMs) / 1000));

  let status: DataFreshness["status"] = "FRESH";
  let badgeText = `✓ Updated ${formatAgeText(ageSeconds)}`;

  if (ageSeconds > policy.agingWithinSeconds) {
    status = "STALE";
    badgeText = `⚠ Data may be stale (${formatAgeText(ageSeconds)})`;
  } else if (ageSeconds > policy.freshWithinSeconds) {
    status = "AGING";
    badgeText = `⚡ Updated ${formatAgeText(ageSeconds)}`;
  }

  return {
    generatedAt,
    dataAsOf,
    lastTransactionAt,
    ageSeconds,
    status,
    badgeText,
  };
}
