import type { Ledger, Invoice, Payment } from "../types";
import { today } from "../money";
import { evaluateFreshness, getLastTransactionTimestamp, type DataFreshness } from "./freshness";

export type ReconciliationStatus =
  | "RECONCILED"
  | "PARTIALLY_RECONCILED"
  | "UNMATCHED"
  | "OVERPAID"
  | "DUPLICATE"
  | "EXCEPTION";

export type ExceptionType =
  | "OVERPAYMENT"
  | "MISSING_PAYMENT"
  | "DUPLICATE_PAYMENT"
  | "UNMATCHED_PAYMENT"
  | "AMOUNT_MISMATCH";

export interface ReconciliationException {
  id: string;
  type: ExceptionType;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  title: string;
  description: string;
  differenceMinor: number;
  sourceRecordIds: string[];
  invoiceId?: string;
  paymentId?: string;
  timestamp: string;
}

export interface ReconciliationResult {
  entityType: "INVOICE" | "PAYMENT" | "RECEIVABLE";
  entityId: string;
  referenceNumber: string;
  vendorOrCustomerName: string;
  expectedMinor: number;
  matchedMinor: number;
  outstandingMinor: number;
  status: ReconciliationStatus;
  exceptions: ReconciliationException[];
  calculationId: string;
  calculationVersion: string;
  dataAsOf: string;
  documentId?: string;
}

export interface ReconciliationSummary {
  totalInvoicesCount: number;
  reconciledCount: number;
  partialCount: number;
  exceptionsCount: number;
  unmatchedPaymentsCount: number;
  overpaymentsCount: number;
  duplicatePaymentsCount: number;
  mismatchCount: number;
  totalExpectedMinor: number;
  totalMatchedMinor: number;
  totalDiscrepancyMinor: number;
  results: ReconciliationResult[];
  unmatchedPayments: Payment[];
  calculationId: string;
  calculationVersion: string;
  dataAsOf: string;
  freshness: DataFreshness;
}

export const RECONCILIATION_VERSION = "reconciliation-v1.0";

/**
 * Deterministically reconciles financial records (Invoices vs Payments vs Credits)
 * based on the core equation: Outstanding = Invoice Amount − Valid Payments − Credits/Adjustments
 */
export function calculateReconciliation(
  ledger: Ledger,
  asOf = today(),
): ReconciliationSummary {
  const calculationId = `calc_rec_${asOf.replace(/[^0-9]/g, "")}_${ledger.revision}`;
  const now = new Date().toISOString();
  const lastTxAt = getLastTransactionTimestamp(ledger);
  const freshness = evaluateFreshness(
    "BANK_RECONCILIATION",
    now,
    asOf,
    lastTxAt,
  );

  // Group payments by invoice_id
  const paymentsByInvoice = new Map<string, Payment[]>();
  const allInvoiceIds = new Set(ledger.invoices.map((i) => i.id));
  const unmatchedPayments: Payment[] = [];

  for (const p of ledger.payments) {
    if (p.payment_date <= asOf && p.status === "COMPLETED") {
      if (allInvoiceIds.has(p.invoice_id)) {
        const list = paymentsByInvoice.get(p.invoice_id) || [];
        list.push(p);
        paymentsByInvoice.set(p.invoice_id, list);
      } else {
        unmatchedPayments.push(p);
      }
    }
  }

  const results: ReconciliationResult[] = [];
  let reconciledCount = 0;
  let partialCount = 0;
  let exceptionsCount = 0;
  let overpaymentsCount = 0;
  let duplicatePaymentsCount = 0;
  let mismatchCount = 0;
  let totalExpectedMinor = 0;
  let totalMatchedMinor = 0;
  let totalDiscrepancyMinor = 0;

  for (const inv of ledger.invoices) {
    if (inv.status === "REJECTED") continue;

    const vendor = ledger.vendors.find((v) => v.id === inv.vendor_id);
    const payments = paymentsByInvoice.get(inv.id) || [];
    const matchedMinor = payments.reduce((sum, p) => sum + p.amount_minor, 0);
    const expectedMinor = inv.total_minor;
    const outstandingMinor = Math.max(0, expectedMinor - matchedMinor);

    totalExpectedMinor += expectedMinor;
    totalMatchedMinor += Math.min(matchedMinor, expectedMinor);

    const exceptions: ReconciliationException[] = [];

    // 1. Overpayment Exception (Payments > Invoice Amount)
    if (matchedMinor > expectedMinor) {
      const diff = matchedMinor - expectedMinor;
      totalDiscrepancyMinor += diff;
      overpaymentsCount++;
      exceptions.push({
        id: `exc_over_${inv.id}`,
        type: "OVERPAYMENT",
        severity: "CRITICAL",
        title: "Overpayment Detected",
        description: `Total payments (₹${(matchedMinor / 100).toLocaleString()}) exceed invoice total (₹${(expectedMinor / 100).toLocaleString()}) by ₹${(diff / 100).toLocaleString()}.`,
        differenceMinor: diff,
        sourceRecordIds: [inv.id, ...payments.map((p) => p.id)],
        invoiceId: inv.id,
        timestamp: now,
      });
    }

    // 2. Duplicate Payment Signals
    const seenRefs = new Set<string>();
    for (let i = 0; i < payments.length; i++) {
      for (let j = i + 1; j < payments.length; j++) {
        const p1 = payments[i];
        const p2 = payments[j];
        const isDuplicate =
          (p1.reference && p1.reference === p2.reference) ||
          (p1.amount_minor === p2.amount_minor &&
            Math.abs(Date.parse(p1.payment_date) - Date.parse(p2.payment_date)) <=
              86400000 * 3);

        if (isDuplicate) {
          duplicatePaymentsCount++;
          const pairKey = `${p1.id}_${p2.id}`;
          if (!seenRefs.has(pairKey)) {
            seenRefs.add(pairKey);
            exceptions.push({
              id: `exc_dup_${p1.id}_${p2.id}`,
              type: "DUPLICATE_PAYMENT",
              severity: "HIGH",
              title: "Possible Duplicate Payment",
              description: `Payments ${p1.reference || p1.id} and ${p2.reference || p2.id} share identical amounts or references.`,
              differenceMinor: p2.amount_minor,
              sourceRecordIds: [inv.id, p1.id, p2.id],
              invoiceId: inv.id,
              paymentId: p2.id,
              timestamp: now,
            });
          }
        }
      }
    }

    // 3. Missing Payment Exception (Approved/Scheduled and past due date with 0 payment)
    if (
      inv.due_date < asOf &&
      matchedMinor === 0 &&
      ["APPROVED", "SCHEDULED"].includes(inv.status)
    ) {
      exceptions.push({
        id: `exc_missing_${inv.id}`,
        type: "MISSING_PAYMENT",
        severity: "MEDIUM",
        title: "Payment Past Due & Missing",
        description: `Approved invoice #${inv.invoice_number} was due on ${inv.due_date} but has received 0 payments.`,
        differenceMinor: expectedMinor,
        sourceRecordIds: [inv.id],
        invoiceId: inv.id,
        timestamp: now,
      });
    }

    // 4. Line item calculation / Subtotal + Tax mismatch
    if (inv.subtotal_minor + inv.tax_minor !== inv.total_minor) {
      mismatchCount++;
      const calcDiff = Math.abs(
        inv.total_minor - (inv.subtotal_minor + inv.tax_minor),
      );
      exceptions.push({
        id: `exc_mismatch_${inv.id}`,
        type: "AMOUNT_MISMATCH",
        severity: "HIGH",
        title: "Invoice Total Mismatch",
        description: `Subtotal + tax (₹${((inv.subtotal_minor + inv.tax_minor) / 100).toLocaleString()}) does not match invoice total (₹${(inv.total_minor / 100).toLocaleString()}).`,
        differenceMinor: calcDiff,
        sourceRecordIds: [inv.id],
        invoiceId: inv.id,
        timestamp: now,
      });
    }

    // Determine status
    let status: ReconciliationStatus = "RECONCILED";
    if (exceptions.some((e) => e.type === "OVERPAYMENT")) {
      status = "OVERPAID";
      exceptionsCount++;
    } else if (exceptions.some((e) => e.type === "DUPLICATE_PAYMENT")) {
      status = "DUPLICATE";
      exceptionsCount++;
    } else if (exceptions.length > 0) {
      status = "EXCEPTION";
      exceptionsCount++;
    } else if (matchedMinor > 0 && matchedMinor < expectedMinor) {
      status = "PARTIALLY_RECONCILED";
      partialCount++;
    } else if (matchedMinor >= expectedMinor) {
      status = "RECONCILED";
      reconciledCount++;
    } else {
      // Unpaid within terms
      status = "RECONCILED";
      reconciledCount++;
    }

    results.push({
      entityType: "INVOICE",
      entityId: inv.id,
      referenceNumber: inv.invoice_number,
      vendorOrCustomerName: vendor?.name || "Unknown Vendor",
      expectedMinor,
      matchedMinor,
      outstandingMinor,
      status,
      exceptions,
      calculationId,
      calculationVersion: RECONCILIATION_VERSION,
      dataAsOf: asOf,
      documentId: inv.file_id,
    });
  }

  // Handle unmatched payments
  for (const p of unmatchedPayments) {
    exceptionsCount++;
    totalDiscrepancyMinor += p.amount_minor;
    results.push({
      entityType: "PAYMENT",
      entityId: p.id,
      referenceNumber: p.reference,
      vendorOrCustomerName: "Unlinked / Orphan Payment",
      expectedMinor: 0,
      matchedMinor: p.amount_minor,
      outstandingMinor: 0,
      status: "UNMATCHED",
      exceptions: [
        {
          id: `exc_unmatched_${p.id}`,
          type: "UNMATCHED_PAYMENT",
          severity: "HIGH",
          title: "Unmatched Payment",
          description: `Payment of ₹${(p.amount_minor / 100).toLocaleString()} (ref: ${p.reference}) has no identified invoice in the ledger.`,
          differenceMinor: p.amount_minor,
          sourceRecordIds: [p.id],
          paymentId: p.id,
          timestamp: now,
        },
      ],
      calculationId,
      calculationVersion: RECONCILIATION_VERSION,
      dataAsOf: asOf,
    });
  }

  return {
    totalInvoicesCount: ledger.invoices.filter((i) => i.status !== "REJECTED").length,
    reconciledCount,
    partialCount,
    exceptionsCount,
    unmatchedPaymentsCount: unmatchedPayments.length,
    overpaymentsCount,
    duplicatePaymentsCount,
    mismatchCount,
    totalExpectedMinor,
    totalMatchedMinor,
    totalDiscrepancyMinor,
    results,
    unmatchedPayments,
    calculationId,
    calculationVersion: RECONCILIATION_VERSION,
    dataAsOf: asOf,
    freshness,
  };
}
