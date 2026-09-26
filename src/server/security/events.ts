import { randomUUID } from "node:crypto";
import type { SecurityEvent, SecuritySummary, SecurityEventType } from "../../domain/finance/security";

// In-memory persistent security event store (supports per-company security stream)
const securityEventStore = new Map<string, SecurityEvent[]>();

/**
 * Logs a security event into the dedicated security audit trail.
 */
export function logSecurityEvent(
  companyId: string,
  event: Omit<SecurityEvent, "id" | "occurredAt" | "companyId">,
): SecurityEvent {
  const fullEvent: SecurityEvent = {
    id: `sec_${randomUUID()}`,
    companyId,
    occurredAt: new Date().toISOString(),
    ...event,
  };

  const list = securityEventStore.get(companyId) || [];
  list.unshift(fullEvent);
  // Keep up to 1000 events per company
  if (list.length > 1000) list.length = 1000;
  securityEventStore.set(companyId, list);

  return fullEvent;
}

/**
 * Retrieves security events for a company, with optional filtering.
 */
export function getSecurityEvents(
  companyId: string,
  filter?: {
    type?: SecurityEventType;
    severity?: SecurityEvent["severity"];
    limit?: number;
  },
): SecurityEvent[] {
  const list = securityEventStore.get(companyId) || [];
  let filtered = list;

  if (filter?.type) {
    filtered = filtered.filter((e) => e.eventType === filter.type);
  }
  if (filter?.severity) {
    filtered = filtered.filter((e) => e.severity === filter.severity);
  }

  const limit = filter?.limit || 100;
  return filtered.slice(0, limit);
}

/**
 * Computes the 24-hour security summary dashboard metrics.
 */
export function getSecuritySummary(companyId: string): SecuritySummary {
  const events = getSecurityEvents(companyId, { limit: 500 });
  const cutoffMs = Date.now() - 24 * 3600 * 1000;
  const recent = events.filter((e) => Date.parse(e.occurredAt) >= cutoffMs);

  const summary: SecuritySummary["last24Hours"] = {
    failedLogins: 0,
    failedAuthorizations: 0,
    mfaFailures: 0,
    bulkExports: 0,
    largeImports: 0,
    aiRequests: 0,
    rateLimits: 0,
    totalEvents: recent.length,
  };

  for (const e of recent) {
    switch (e.eventType) {
      case "LOGIN_FAILURE":
        summary.failedLogins++;
        break;
      case "AUTHORIZATION_FAILURE":
        summary.failedAuthorizations++;
        break;
      case "MFA_FAILURE":
        summary.mfaFailures++;
        break;
      case "BULK_EXPORT":
        summary.bulkExports++;
        break;
      case "LARGE_IMPORT":
        summary.largeImports++;
        break;
      case "AI_REQUEST":
        summary.aiRequests++;
        break;
      case "RATE_LIMIT":
        summary.rateLimits++;
        break;
    }
  }

  return {
    last24Hours: summary,
    events: recent.slice(0, 50),
  };
}
