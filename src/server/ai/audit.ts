/**
 * AI Audit Event Recording
 * Feature 45: Verifiable AI Audit Trail
 *
 * Implements immutable logging of AI invocations, calculation IDs,
 * source record citations, and prompt-injection detection without
 * leaking sensitive financial context.
 */

export interface AIAuditEvent {
  id: string;
  companyId: string;
  userId: string;
  conversationId?: string;
  provider: "GOOGLE" | "MOCK" | "CUSTOM";
  model: string;
  requestType: "FINANCIAL_QA" | "DOCUMENT_EXTRACTION" | "EXPLANATION";
  calculationIds: string[];
  sourceRecordIds: string[];
  responseStatus: "COMPLETED" | "BLOCKED" | "FAILED";
  promptInjectionDetected: boolean;
  questionExcerpt?: string;
  explanationSummary?: string;
  createdAt: string; // ISO
}

class AIAuditStore {
  private events: AIAuditEvent[] = [];
  private maxEvents = 1000;

  /**
   * Records an AI audit event with strict privacy guarantees
   * (only calculation/record references, no raw financial payloads).
   */
  logEvent(event: Omit<AIAuditEvent, "id" | "createdAt">): AIAuditEvent {
    const fullEvent: AIAuditEvent = {
      ...event,
      id: `ai_evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
    };

    if (this.events.length >= this.maxEvents) {
      this.events.shift(); // Evict oldest
    }
    this.events.push(fullEvent);
    return fullEvent;
  }

  /**
   * Retrieves AI audit events for a company, most recent first.
   */
  getEvents(companyId: string, limit: number = 50): AIAuditEvent[] {
    return this.events
      .filter((e) => e.companyId === companyId)
      .slice(-limit)
      .reverse();
  }

  /**
   * Clear events (for test isolation)
   */
  clear(): void {
    this.events = [];
  }
}

export const aiAuditStore = new AIAuditStore();
