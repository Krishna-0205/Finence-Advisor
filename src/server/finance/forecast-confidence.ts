import type {
  ForecastConfidence,
  ForecastConfidenceLevel,
} from "../../domain/finance/forecast";

export interface ConfidenceInput {
  upcomingPayables: number;
  upcomingReceivables: number;
  historicalMonths: number;
  overdueReceivables: number;

  collectionReliability: number; // 0-1
  paymentReliability: number;    // 0-1
  dataCompleteness: number;      // 0-1
  dataFreshness?: "FRESH" | "AGING" | "STALE";
}

export function calculateForecastConfidence(
  input: ConfidenceInput,
): ForecastConfidence {
  let score = 100;

  // Historical depth
  if (input.historicalMonths < 3) {
    score -= 30;
  } else if (input.historicalMonths < 6) {
    score -= 15;
  } else if (input.historicalMonths < 12) {
    score -= 5;
  }

  // Forecast sample size
  const transactionCount =
    input.upcomingPayables +
    input.upcomingReceivables;

  if (transactionCount < 10) {
    score -= 25;
  } else if (transactionCount < 25) {
    score -= 10;
  }

  // Overdue receivables increase uncertainty
  const overdueRatio =
    input.upcomingReceivables > 0
      ? input.overdueReceivables /
        input.upcomingReceivables
      : 0;

  if (overdueRatio >= 0.5) {
    score -= 25;
  } else if (overdueRatio >= 0.25) {
    score -= 15;
  } else if (overdueRatio > 0) {
    score -= 5;
  }

  // Historical behavior
  score -= (1 - input.collectionReliability) * 15;
  score -= (1 - input.paymentReliability) * 10;

  // Missing financial data
  score -= (1 - input.dataCompleteness) * 20;

  // Data freshness impact
  if (input.dataFreshness === "STALE") {
    score -= 20;
  } else if (input.dataFreshness === "AGING") {
    score -= 10;
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const level = getConfidenceLevel(score);

  return {
    level,
    score,
    evidence: {
      upcomingPayables: input.upcomingPayables,
      upcomingReceivables: input.upcomingReceivables,
      historicalMonths: input.historicalMonths,
      overdueReceivables: input.overdueReceivables,
      historicalCollectionReliability:
        input.collectionReliability,
      historicalPaymentReliability:
        input.paymentReliability,
      dataCompleteness: input.dataCompleteness,
    },
    reasons: buildReasons(input, level),
  };
}

export function getConfidenceLevel(
  score: number,
): ForecastConfidenceLevel {
  if (score >= 75) return "HIGH";
  if (score >= 50) return "MEDIUM";
  return "LOW";
}

export function buildReasons(
  input: ConfidenceInput,
  level: ForecastConfidenceLevel,
): string[] {
  const reasons: string[] = [];

  if (input.historicalMonths >= 6) {
    reasons.push(
      `${input.historicalMonths} months of historical financial data`,
    );
  } else {
    reasons.push(
      "Limited historical financial data",
    );
  }

  reasons.push(
    `${input.upcomingPayables} upcoming payables`,
  );

  reasons.push(
    `${input.upcomingReceivables} upcoming receivables`,
  );

  if (input.overdueReceivables > 0) {
    reasons.push(
      `${input.overdueReceivables} overdue receivables`,
    );
  }

  if (input.dataCompleteness < 0.9) {
    reasons.push(
      "Some expected financial data is missing",
    );
  }

  if (input.dataFreshness === "STALE") {
    reasons.push(
      "Financial data is stale; recent collections and transactions may not be reflected",
    );
  } else if (input.dataFreshness === "AGING") {
    reasons.push(
      "Financial data freshness is aging; recent collections may adjust the forecast",
    );
  }

  if (level === "LOW") {
    reasons.push(
      "Forecast uncertainty is materially elevated",
    );
  }

  return reasons;
}
