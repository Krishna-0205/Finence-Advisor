import type { Money } from "./money";

export const FORECAST_CONFIDENCE_LEVELS = [
  "HIGH",
  "MEDIUM",
  "LOW",
] as const;

export type ForecastConfidenceLevel =
  (typeof FORECAST_CONFIDENCE_LEVELS)[number];

export interface ForecastConfidence {
  level: ForecastConfidenceLevel;
  score: number; // 0-100

  evidence: {
    upcomingPayables: number;
    upcomingReceivables: number;
    historicalMonths: number;
    overdueReceivables: number;
    historicalCollectionReliability?: number;
    historicalPaymentReliability?: number;
    dataCompleteness?: number;
  };

  reasons: string[];
}

export interface ForecastAssumption {
  key: string;
  description: string;
  value: string;
}

export interface ForecastResult {
  companyId: string;
  asOf: string;
  horizonDays: number;

  projectedCash: Money;

  confidence: ForecastConfidence;

  assumptions: ForecastAssumption[];

  generatedAt: string;
}
