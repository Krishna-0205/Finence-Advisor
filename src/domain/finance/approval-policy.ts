import type { Invoice, MaterialChange } from "../types";

export interface InvoiceApprovalState {
  createdBy: string;
  reviewedBy?: string;
  approvedBy?: string;
  rejectedBy?: string;
  createdAt: string;
  reviewedAt?: string;
  approvedAt?: string;
  rejectedAt?: string;
}

export class ApprovalPolicyError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApprovalPolicyError";
  }
}

export interface ApprovalPolicyContext {
  companyId: string;
  invoiceId: string;
  amountMinor: bigint | number;
  createdBy: string;
  currentUserId: string;
  actorRoles: string[];
  reviewedBy?: string;
  materialChanges?: MaterialChange[];
}

export const APPROVAL_POLICY_VERSION = "approval-policy-v1.2";

/**
 * Enforces Segregation of Duties (Maker-Checker Control):
 * A user who created or materially modified an invoice cannot be the sole approver of that invoice.
 */
export function evaluateSeparationOfDuties(
  context: ApprovalPolicyContext,
): { allowed: boolean; reason?: string; code?: string } {
  if (context.createdBy && context.createdBy === context.currentUserId) {
    return {
      allowed: false,
      reason: "Invoice creator cannot approve the same invoice.",
      code: "MAKER_CANNOT_APPROVE",
    };
  }

  if (context.materialChanges && context.materialChanges.length > 0) {
    const lastModifier = context.materialChanges[context.materialChanges.length - 1].changed_by;
    if (lastModifier === context.currentUserId) {
      return {
        allowed: false,
        reason: "User who materially modified the invoice cannot approve it.",
        code: "MODIFIER_CANNOT_APPROVE",
      };
    }
  }

  return {
    allowed: true,
  };
}

/**
 * Asserts that the approval policy is satisfied.
 * Throws ApprovalPolicyError if Segregation of Duties is violated.
 */
export function assertApprovalPolicy(context: ApprovalPolicyContext): void {
  const result = evaluateSeparationOfDuties(context);
  if (!result.allowed) {
    throw new ApprovalPolicyError(
      result.code || "SEPARATION_OF_DUTIES_VIOLATION",
      result.reason || "The invoice creator cannot approve the same invoice.",
    );
  }
}

/**
 * Detects whether an edit constitutes a material change requiring re-review.
 * Material fields: amount, vendor, bank/currency details, due date.
 */
export function isMaterialChange(
  previous: Partial<Invoice>,
  next: Partial<Invoice>,
): { isMaterial: boolean; changedFields: string[] } {
  const changedFields: string[] = [];

  if (
    previous.total_minor !== undefined &&
    next.total_minor !== undefined &&
    previous.total_minor !== next.total_minor
  ) {
    changedFields.push("total_minor");
  }

  if (
    previous.vendor_id !== undefined &&
    next.vendor_id !== undefined &&
    previous.vendor_id !== next.vendor_id
  ) {
    changedFields.push("vendor_id");
  }

  if (
    previous.due_date !== undefined &&
    next.due_date !== undefined &&
    previous.due_date !== next.due_date
  ) {
    changedFields.push("due_date");
  }

  if (
    previous.currency_code !== undefined &&
    next.currency_code !== undefined &&
    previous.currency_code !== next.currency_code
  ) {
    changedFields.push("currency_code");
  }

  return {
    isMaterial: changedFields.length > 0,
    changedFields,
  };
}

/**
 * Legal transition state machine for invoice lifecycle.
 */
export const INVOICE_TRANSITIONS: Record<string, readonly string[]> = {
  DRAFT: ["PENDING_REVIEW"],
  EXTRACTED: ["PENDING_REVIEW"],
  PENDING_REVIEW: ["REVIEWED", "APPROVED", "REJECTED", "INVESTIGATION"],
  REVIEWED: ["APPROVED", "REJECTED", "INVESTIGATION"],
  APPROVED: ["SCHEDULED", "PAID", "INVESTIGATION"],
  SCHEDULED: ["DUE", "PAID", "CANCELLED"],
  DUE: ["PAID"],
  REJECTED: [],
  PAID: [],
  INVESTIGATION: ["PENDING_REVIEW", "REVIEWED", "APPROVED", "REJECTED"],
} as const;

export function canTransition(from: string, to: string): boolean {
  if (from === to) return true;
  const allowed = INVOICE_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

export interface TransitionInvoiceOptions {
  invoice: Invoice;
  to: string;
  actorId: string;
  actorRole?: string;
  reason?: string;
  enforceSod?: boolean;
}

/**
 * Transitions an invoice according to the state machine and SoD policy.
 */
export function transitionInvoice(options: TransitionInvoiceOptions): {
  invoice: Invoice;
  policyVersion: string;
} {
  const { invoice, to, actorId, actorRole, reason, enforceSod = true } = options;
  const from = invoice.status;

  if (!canTransition(from, to)) {
    throw new ApprovalPolicyError(
      "INVALID_STATE_TRANSITION",
      `Illegal transition from ${from} to ${to}.`,
    );
  }

  const at = new Date().toISOString();
  const next: Invoice = { ...invoice };

  if (to === "APPROVED") {
    if (enforceSod && next.created_by) {
      assertApprovalPolicy({
        companyId: next.company_id,
        invoiceId: next.id,
        amountMinor: next.total_minor,
        createdBy: next.created_by,
        currentUserId: actorId,
        actorRoles: actorRole ? [actorRole] : [],
        reviewedBy: next.reviewed_by,
        materialChanges: next.material_changes,
      });
    }
    next.approved_at = at;
    next.approved_by = actorId;
  } else if (to === "REVIEWED") {
    next.reviewed_at = at;
    next.reviewed_by = actorId;
  } else if (to === "REJECTED") {
    next.rejected_at = at;
    next.rejected_by = actorId;
  }

  next.status = to as Invoice["status"];

  return {
    invoice: next,
    policyVersion: APPROVAL_POLICY_VERSION,
  };
}
