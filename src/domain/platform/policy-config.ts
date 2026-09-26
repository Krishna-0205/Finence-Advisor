/**
 * Business Rules & Financial Policy Configuration
 * Feature 41: Tenant/Company Configuration Layer
 */

export interface ApprovalLimitsConfig {
  maxFinanceMinor: number; // e.g. ₹5,00,000 (50000000 paise)
  adminRequiredAboveMinor: number; // e.g. ₹5,00,000
}

export interface FinancialPolicy {
  companyId: string;
  cashWarningMinor: number;
  cashCriticalMinor: number;
  budgetWarningPercentage: number;
  budgetCriticalPercentage: number;
  duplicateThreshold: number; // 0 to 100
  overdueThresholdDays: number;
  aiRequestsPerMinute: number;
  approvalLimits: ApprovalLimitsConfig;
  version: number;
  effectiveFrom: string; // ISO
  policyVersion: string;
}

export const DEFAULT_FINANCIAL_POLICY: Omit<FinancialPolicy, "companyId"> = {
  cashWarningMinor: 50000000, // ₹5,00,000 (5L)
  cashCriticalMinor: 30000000, // ₹3,00,000 (3L)
  budgetWarningPercentage: 80, // 80%
  budgetCriticalPercentage: 90, // 90%
  duplicateThreshold: 85, // Score > 85 flags duplicate
  overdueThresholdDays: 30, // 30 days
  aiRequestsPerMinute: 10,
  approvalLimits: {
    maxFinanceMinor: 50000000, // ₹5,00,000
    adminRequiredAboveMinor: 50000000, // ₹5,00,000
  },
  version: 1,
  effectiveFrom: "2026-01-01T00:00:00.000Z",
  policyVersion: "finance-policy-v1.0",
};

/**
 * Validates and creates a versioned policy for a company.
 */
export function createCompanyPolicy(
  companyId: string,
  overrides?: Partial<FinancialPolicy>,
  previousVersion: number = 0,
): FinancialPolicy {
  const version = previousVersion + 1;
  return {
    ...DEFAULT_FINANCIAL_POLICY,
    ...overrides,
    companyId,
    version,
    effectiveFrom: new Date().toISOString(),
    policyVersion: `finance-policy-v${version}.0`,
  };
}
