import type { Ledger, Receivable, Receipt } from "../types";
import { today, addDays, differenceInDays } from "../money";

export interface CustomerObservedInvoice {
  id: string;
  referenceNumber: string;
  issueDate: string;
  dueDate: string;
  paymentDate: string;
  amountMinor: number;
  paymentDays: number; // paymentDate - issueDate
  delayDays: number;   // paymentDate - dueDate (<= 0 is on-time, > 0 is late)
  isLate: boolean;
}

export interface CustomerPaymentBehavior {
  customerId: string;
  customerName: string;

  averagePaymentDays: number;
  contractedPaymentDays: number;

  averageDelayDays: number;

  onTimePercentage: number;
  latePercentage: number;

  outstandingMinor: number;
  largestReceivableMinor: number;

  invoiceCount: number;
  paidInvoiceCount: number;

  observedInvoices: CustomerObservedInvoice[];

  calculationId: string;
  calculationVersion: string;
  dataAsOf: string;
}

export const CUSTOMER_BEHAVIOR_VERSION = "customer-behavior-v1";

/**
 * Calculates deterministic customer payment behavior metrics based on
 * actual receivable and receipt history.
 */
export function calculateCustomerPaymentBehaviors(
  ledger: Ledger,
  asOf = today(),
): Record<string, CustomerPaymentBehavior> {
  const result: Record<string, CustomerPaymentBehavior> = {};

  // Group receivables by customer
  const customerReceivables = new Map<string, Receivable[]>();
  for (const r of ledger.receivables) {
    const list = customerReceivables.get(r.customer_name) || [];
    list.push(r);
    customerReceivables.set(r.customer_name, list);
  }

  // Map receipts by receivable_id
  const receiptsByReceivable = new Map<string, Receipt[]>();
  for (const rec of ledger.receipts) {
    if (rec.receipt_date <= asOf) {
      const list = receiptsByReceivable.get(rec.receivable_id) || [];
      list.push(rec);
      receiptsByReceivable.set(rec.receivable_id, list);
    }
  }

  for (const [customerName, receivables] of customerReceivables.entries()) {
    const customerId = `cust_${customerName.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
    const observedInvoices: CustomerObservedInvoice[] = [];

    let totalContractedDays = 0;
    let contractedCount = 0;
    let totalOutstanding = 0;
    let largestReceivable = 0;

    let onTimeCount = 0;
    let lateCount = 0;

    for (const r of receivables) {
      if (r.amount_minor > largestReceivable) {
        largestReceivable = r.amount_minor;
      }

      // Calculate contracted terms from issue_date to due_date
      if (r.issue_date && r.due_date) {
        const terms = differenceInDays(r.due_date, r.issue_date);
        if (terms > 0) {
          totalContractedDays += terms;
          contractedCount += 1;
        }
      }

      const matchingReceipts = receiptsByReceivable.get(r.id) || [];
      const totalReceived = matchingReceipts.reduce((sum, rc) => sum + rc.amount_minor, 0);
      const remaining = Math.max(0, r.amount_minor - totalReceived);
      totalOutstanding += remaining;

      // Check if fully paid
      if (totalReceived >= r.amount_minor && matchingReceipts.length > 0) {
        // Last receipt date is the completion payment date
        const latestReceiptDate = matchingReceipts
          .map((rc) => rc.receipt_date)
          .sort()
          .reverse()[0];

        const paymentDays = Math.max(
          0,
          differenceInDays(latestReceiptDate, r.issue_date),
        );
        const delayDays = differenceInDays(latestReceiptDate, r.due_date);
        const isLate = delayDays > 0;

        if (isLate) {
          lateCount += 1;
        } else {
          onTimeCount += 1;
        }

        observedInvoices.push({
          id: r.id,
          referenceNumber: r.reference_number || r.id,
          issueDate: r.issue_date,
          dueDate: r.due_date,
          paymentDate: latestReceiptDate,
          amountMinor: r.amount_minor,
          paymentDays,
          delayDays,
          isLate,
        });
      }
    }

    const paidInvoiceCount = observedInvoices.length;
    const averagePaymentDays =
      paidInvoiceCount > 0
        ? Math.round(
            observedInvoices.reduce((sum, inv) => sum + inv.paymentDays, 0) /
              paidInvoiceCount,
          )
        : contractedCount > 0
          ? Math.round(totalContractedDays / contractedCount)
          : 30;

    const contractedPaymentDays =
      paidInvoiceCount > 0
        ? Math.round(
            observedInvoices.reduce(
              (sum, inv) => sum + differenceInDays(inv.dueDate, inv.issueDate),
              0,
            ) / paidInvoiceCount,
          )
        : contractedCount > 0
          ? Math.round(totalContractedDays / contractedCount)
          : 30;

    const averageDelayDays =
      paidInvoiceCount > 0
        ? Math.round(
            observedInvoices.reduce((sum, inv) => sum + inv.delayDays, 0) /
              paidInvoiceCount,
          )
        : 0;

    const onTimePercentage =
      paidInvoiceCount > 0
        ? Math.round((onTimeCount / paidInvoiceCount) * 100)
        : 100;

    const latePercentage =
      paidInvoiceCount > 0
        ? Math.round((lateCount / paidInvoiceCount) * 100)
        : 0;

    result[customerId] = {
      customerId,
      customerName,
      averagePaymentDays,
      contractedPaymentDays,
      averageDelayDays,
      onTimePercentage,
      latePercentage,
      outstandingMinor: totalOutstanding,
      largestReceivableMinor: largestReceivable,
      invoiceCount: receivables.length,
      paidInvoiceCount,
      observedInvoices,
      calculationId: `calc_cust_behavior_${customerId}`,
      calculationVersion: CUSTOMER_BEHAVIOR_VERSION,
      dataAsOf: asOf,
    };
  }

  return result;
}

/**
 * Derives the behavioral expected collection date for a receivable.
 * If customer historically pays late (e.g. +4 days), collection date is adjusted:
 * expectedDate = dueDate + max(0, averageDelayDays).
 */
export function getBehavioralExpectedCollectionDate(
  receivable: Receivable,
  behavior?: CustomerPaymentBehavior,
): string {
  if (receivable.expected_collection_date) {
    return receivable.expected_collection_date;
  }
  if (!behavior || behavior.averageDelayDays <= 0) {
    return receivable.due_date;
  }
  return addDays(receivable.due_date, Math.max(0, Math.round(behavior.averageDelayDays)));
}
