export const FORECAST_SCENARIOS = [
  "BASE",
  "CONSERVATIVE",
  "OPTIMISTIC",
] as const;

export type ForecastScenario =
  (typeof FORECAST_SCENARIOS)[number];

export interface ForecastScenarioDefinition {
  scenario: ForecastScenario;
  description: string;

  assumptions: {
    receivableCollectionAdjustment: number;
    payableTimingAdjustmentDays: number;
    discretionaryExpenseAdjustment: number;
  };
}

export const FORECAST_SCENARIO_DEFINITIONS: ForecastScenarioDefinition[] = [
  {
    scenario: "BASE",
    description:
      "Expected payment and collection dates based on contractual obligations.",
    assumptions: {
      receivableCollectionAdjustment: 0,
      payableTimingAdjustmentDays: 0,
      discretionaryExpenseAdjustment: 0,
    },
  },

  {
    scenario: "CONSERVATIVE",
    description:
      "Receivables delayed 14 days, payables accelerated 7 days, and discretionary expenses increased by 10%.",
    assumptions: {
      receivableCollectionAdjustment: -14,
      payableTimingAdjustmentDays: -7,
      discretionaryExpenseAdjustment: 0.10,
    },
  },

  {
    scenario: "OPTIMISTIC",
    description:
      "Collections on time, non-critical vendor disbursements deferred 7 days, and discretionary expenses reduced by 10%.",
    assumptions: {
      receivableCollectionAdjustment: 0,
      payableTimingAdjustmentDays: 7,
      discretionaryExpenseAdjustment: -0.10,
    },
  },
];
