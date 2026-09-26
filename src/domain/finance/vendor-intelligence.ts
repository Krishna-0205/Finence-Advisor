import type { Ledger, Invoice, Payment, Vendor } from "../types";
import { today, differenceInDays } from "../money";
import { risks } from "../../server/risk";

export interface VendorPricePoint {
  id: string;
  invoiceNumber: string;
  date: string;
  amountMinor: number;
}

export interface VendorDuplicateSignal {
  invoiceId: string;
  invoiceNumber: string;
  title: string;
  reason: string;
  severity: string;
}

export interface VendorUnderlyingInvoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  totalMinor: number;
  status: string;
  description: string;
  paidMinor: number;
}

export interface VendorIntelligence {
  vendorId: string;
  vendorName: string;
  category: string;

  averageInvoiceMinor: number;
  priceTrendPercentage: number;
  invoiceFrequency: number; // e.g. count of invoices in past 90 days or total
  paymentTermsDays: number;
  onTimePaymentPercentage: number;
  duplicateSignalCount: number;
  totalSpendMinor: number;
  spendConcentrationPercentage: number; // vendor spend / total supplier spend * 100

  priceHistory: VendorPricePoint[];
  duplicateSignals: VendorDuplicateSignal[];
  underlyingInvoices: VendorUnderlyingInvoice[];

  calculationId: string;
  calculationVersion: string;
  dataAsOf: string;
}

export interface VendorConcentrationReport {
  asOf: string;
  totalSupplierSpendMinor: number;
  policyThresholdPercentage: number; // Default 30% or 40%
  vendors: VendorIntelligence[];
  highConcentrationVendors: VendorIntelligence[];
  topVendor: VendorIntelligence | null;
  calculationId: string;
  calculationVersion: string;
}

export const VENDOR_INTELLIGENCE_VERSION = "vendor-intelligence-v1";
export const DEFAULT_CONCENTRATION_THRESHOLD = 30; // 30% concentration policy threshold

/**
 * Deterministically calculates vendor intelligence and supplier concentration
 * from ledger invoices, payments, and risk signals.
 */
export function calculateVendorIntelligence(
  ledger: Ledger,
  asOf = today(),
  policyThreshold = DEFAULT_CONCENTRATION_THRESHOLD,
): VendorConcentrationReport {
  const allRisks = risks(ledger, asOf);
  const totalSupplierSpendMinor = ledger.invoices
    .filter((i) => i.status !== "REJECTED")
    .reduce((sum, i) => sum + i.total_minor, 0);

  // Group payments by invoice_id
  const paymentsByInvoice = new Map<string, Payment[]>();
  for (const p of ledger.payments) {
    if (p.status === "COMPLETED" && p.payment_date <= asOf) {
      const list = paymentsByInvoice.get(p.invoice_id) || [];
      list.push(p);
      paymentsByInvoice.set(p.invoice_id, list);
    }
  }

  // Group invoices by vendor
  const invoicesByVendor = new Map<string, Invoice[]>();
  for (const inv of ledger.invoices) {
    if (inv.status !== "REJECTED") {
      const list = invoicesByVendor.get(inv.vendor_id) || [];
      list.push(inv);
      invoicesByVendor.set(inv.vendor_id, list);
    }
  }

  const vendorsList: VendorIntelligence[] = [];

  for (const v of ledger.vendors) {
    const invoices = (invoicesByVendor.get(v.id) || []).slice();
    // Sort invoices chronologically by invoice_date
    invoices.sort((a, b) => a.invoice_date.localeCompare(b.invoice_date));

    const invoiceCount = invoices.length;
    const totalSpendMinor = invoices.reduce((sum, i) => sum + i.total_minor, 0);
    const averageInvoiceMinor =
      invoiceCount > 0 ? Math.round(totalSpendMinor / invoiceCount) : 0;

    // Price trend calculation
    const priceHistory: VendorPricePoint[] = invoices.map((i) => ({
      id: i.id,
      invoiceNumber: i.invoice_number,
      date: i.invoice_date,
      amountMinor: i.total_minor,
    }));

    let priceTrendPercentage = 0;
    if (priceHistory.length >= 2) {
      const earliest = priceHistory[0].amountMinor;
      const latest = priceHistory[priceHistory.length - 1].amountMinor;
      if (earliest > 0) {
        priceTrendPercentage = Math.round(((latest - earliest) / earliest) * 100);
      }
    }

    // Payment terms (contracted terms between invoice_date and due_date)
    let totalTerms = 0;
    let termsCount = 0;
    for (const inv of invoices) {
      const terms = differenceInDays(inv.due_date, inv.invoice_date);
      if (terms > 0) {
        totalTerms += terms;
        termsCount += 1;
      }
    }
    const paymentTermsDays =
      termsCount > 0 ? Math.round(totalTerms / termsCount) : 30;

    // On-time payment percentage
    let paidInvoicesCount = 0;
    let onTimePaidCount = 0;
    for (const inv of invoices) {
      const payments = paymentsByInvoice.get(inv.id) || [];
      const totalPaid = payments.reduce((sum, p) => sum + p.amount_minor, 0);
      if (totalPaid >= inv.total_minor && payments.length > 0) {
        paidInvoicesCount += 1;
        const lastPaymentDate = payments
          .map((p) => p.payment_date)
          .sort()
          .reverse()[0];
        if (lastPaymentDate <= inv.due_date) {
          onTimePaidCount += 1;
        }
      }
    }
    const onTimePaymentPercentage =
      paidInvoicesCount > 0
        ? Math.round((onTimePaidCount / paidInvoicesCount) * 100)
        : 100;

    // Duplicate signals from anomaly/risk engine
    const duplicateSignals: VendorDuplicateSignal[] = [];
    for (const inv of invoices) {
      const invRisk = allRisks.find((r) => r.invoice_id === inv.id);
      if (invRisk) {
        for (const sig of invRisk.signals) {
          if (
            sig.type.includes("duplicate") ||
            sig.title.toLowerCase().includes("duplicate") ||
            sig.type.includes("frequency")
          ) {
            duplicateSignals.push({
              invoiceId: inv.id,
              invoiceNumber: inv.invoice_number,
              title: sig.title,
              reason: sig.reason,
              severity: sig.severity,
            });
          }
        }
      }
    }

    // Spend concentration percentage
    const spendConcentrationPercentage =
      totalSupplierSpendMinor > 0
        ? Number(((totalSpendMinor / totalSupplierSpendMinor) * 100).toFixed(1))
        : 0;

    const underlyingInvoices: VendorUnderlyingInvoice[] = invoices.map((inv) => {
      const payments = paymentsByInvoice.get(inv.id) || [];
      const paidMinor = payments.reduce((sum, p) => sum + p.amount_minor, 0);
      return {
        id: inv.id,
        invoiceNumber: inv.invoice_number,
        invoiceDate: inv.invoice_date,
        dueDate: inv.due_date,
        totalMinor: inv.total_minor,
        status: inv.status,
        description: inv.description,
        paidMinor,
      };
    });

    vendorsList.push({
      vendorId: v.id,
      vendorName: v.name,
      category: v.category,
      averageInvoiceMinor,
      priceTrendPercentage,
      invoiceFrequency: invoiceCount,
      paymentTermsDays,
      onTimePaymentPercentage,
      duplicateSignalCount: duplicateSignals.length,
      totalSpendMinor,
      spendConcentrationPercentage,
      priceHistory,
      duplicateSignals,
      underlyingInvoices,
      calculationId: `calc_vendor_intel_${v.id}`,
      calculationVersion: VENDOR_INTELLIGENCE_VERSION,
      dataAsOf: asOf,
    });
  }

  // Sort descending by total spend
  vendorsList.sort((a, b) => b.totalSpendMinor - a.totalSpendMinor);

  const highConcentrationVendors = vendorsList.filter(
    (v) => v.spendConcentrationPercentage >= policyThreshold,
  );

  return {
    asOf,
    totalSupplierSpendMinor,
    policyThresholdPercentage: policyThreshold,
    vendors: vendorsList,
    highConcentrationVendors,
    topVendor: vendorsList[0] || null,
    calculationId: `calc_vendor_concentration_${asOf.replace(/-/g, "")}`,
    calculationVersion: VENDOR_INTELLIGENCE_VERSION,
  };
}
