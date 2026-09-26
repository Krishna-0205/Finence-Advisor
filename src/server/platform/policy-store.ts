import type { Actor } from "../../domain/types";
import {
  type FinancialPolicy,
  createCompanyPolicy,
  DEFAULT_FINANCIAL_POLICY,
} from "../../domain/platform/policy-config";
import { logSecurityEvent } from "../security/events";

const policyHistoryStore = new Map<string, FinancialPolicy[]>(); // companyId -> policies[]

/**
 * Gets the active financial policy for a company.
 */
export function getCompanyPolicy(companyId: string): FinancialPolicy {
  const history = policyHistoryStore.get(companyId);
  if (history && history.length > 0) {
    return history[history.length - 1];
  }

  // Create and cache default policy
  const def = createCompanyPolicy(companyId);
  policyHistoryStore.set(companyId, [def]);
  return def;
}

/**
 * Gets the entire immutable version history of policies for a company.
 */
export function getPolicyHistory(companyId: string): FinancialPolicy[] {
  return policyHistoryStore.get(companyId) || [getCompanyPolicy(companyId)];
}

/**
 * Updates a company's business rules policy, creating a new immutable version.
 */
export function updateCompanyPolicy(
  actor: Actor,
  updates: Partial<FinancialPolicy>,
): FinancialPolicy {
  if (actor.role !== "admin") {
    logSecurityEvent(actor.company_id, {
      userId: actor.user_id,
      userName: actor.name,
      eventType: "AUTHORIZATION_FAILURE",
      severity: "CRITICAL",
      title: "Unauthorized Policy Update Attempt",
      description: `User with role "${actor.role}" attempted to modify company financial policy rules.`,
    });
    throw new Error("Only Administrators can modify financial policy business rules.");
  }

  const current = getCompanyPolicy(actor.company_id);
  const nextPolicy = createCompanyPolicy(actor.company_id, updates, current.version);

  const history = policyHistoryStore.get(actor.company_id) || [];
  history.push(nextPolicy);
  policyHistoryStore.set(actor.company_id, history);

  logSecurityEvent(actor.company_id, {
    userId: actor.user_id,
    userName: actor.name,
    eventType: "MFA_SUCCESS",
    severity: "INFO",
    title: "Financial Business Rules Updated",
    description: `Policy updated to ${nextPolicy.policyVersion} (Cash Warning: ₹${(nextPolicy.cashWarningMinor / 100).toLocaleString()}, Budget Warning: ${nextPolicy.budgetWarningPercentage}%).`,
  });

  return nextPolicy;
}
