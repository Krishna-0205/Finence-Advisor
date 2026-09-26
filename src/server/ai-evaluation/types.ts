export type EvaluationCategory =
  | "factual"
  | "calculation"
  | "explanation"
  | "anomaly"
  | "budget"
  | "cash_flow"
  | "adversarial";

export type EvaluationExecutionMode =
  | "ENGINE_ONLY"
  | "ENGINE_THEN_AI"
  | "SIMULATION_ONLY"
  | "AI_READ_ONLY"
  | "SECURITY_TEST";

export interface EvaluationCase {
  id: string;
  category: EvaluationCategory;
  question: string;
  companyId: string;
  userId?: string;
  userRole?: "admin" | "finance" | "viewer" | "unauthorized";
  invoiceId?: string;
  executionMode?: EvaluationExecutionMode;

  expected: {
    metric?: string;
    expectedValueMinor?: bigint | number;
    expectedCurrency?: string;
    requiresCalculation?: boolean;
    requiresSimulation?: boolean;
    requiresEvidence?: boolean;
    mustNotMutateLedger?: boolean;
    mustDenyUnauthorizedAccess?: boolean;
    mustNotRevealOtherRecords?: boolean;
    forbiddenRecordIds?: string[];
    expectedCitations?: string[];
    expectedIntent?: string;
    minSourceRecords?: number;
  };
}

export interface VerifiedMetric {
  metric: string;
  valueMinor: bigint;
  currency: string;
  calculationId: string;
  calculationVersion: string;
}

export interface EvaluationResult {
  caseId: string;
  category: EvaluationCategory;
  executionMode: EvaluationExecutionMode;

  response?: Record<string, any> | string | null;

  numericalAccuracy?: number;
  sourceAttributionCorrect?: boolean;
  unsupportedClaims: string[];
  hallucinatedRecordIds: string[];
  permissionViolation: boolean;
  ledgerMutated: boolean;

  passed: boolean;
  failures: string[];
}

export interface CategorySummary {
  category: EvaluationCategory;
  total: number;
  passed: number;
  failed: number;
  passRate: number;
}

export interface EvaluationSuiteSummary {
  datasetVersion: string;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  passRate: number;
  categoryBreakdown: Record<EvaluationCategory, CategorySummary>;
  numericalAccuracyMean: number;
  hallucinationsCount: number;
  permissionViolationsCount: number;
  ledgerMutationsCount: number;
  durationMs: number;
  timestamp: string;
}
