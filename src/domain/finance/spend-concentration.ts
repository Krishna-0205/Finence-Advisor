import type { Ledger } from "../types";
import { today } from "../money";

export interface SpendItemDrillDown {
  id: string;
  invoiceNumber: string;
  vendorId: string;
  vendorName: string;
  categoryId: string;
  categoryName: string;
  amountMinor: number;
  date: string;
  dueDate: string;
  status: string;
}

export interface ConcentrationBucket {
  id: string;
  name: string;
  spendMinor: number;
  percentage: number;
  invoiceCount: number;
  invoices: SpendItemDrillDown[];
}

export interface DimensionConcentration {
  dimension: "VENDOR" | "CATEGORY" | "DEPARTMENT";
  dimensionLabel: string;
  totalSpendMinor: number;
  cr1: number; // Top 1 concentration ratio %
  cr3: number; // Top 3 concentration ratio %
  cr5: number; // Top 5 concentration ratio %
  hhi: number; // Herfindahl-Hirschman Index (0 - 10,000)
  riskLevel: "LOW" | "MODERATE" | "HIGH";
  buckets: ConcentrationBucket[];
}

export interface SpendConcentrationReport {
  asOf: string;
  totalSpendMinor: number;
  vendorConcentration: DimensionConcentration;
  categoryConcentration: DimensionConcentration;
  departmentConcentration: DimensionConcentration;
  topSupplierRisk: string | null;
  topCategoryRisk: string | null;
  calculationId: string;
  calculationVersion: string;
  generatedAt: string;
}

export const SPEND_CONCENTRATION_VERSION = "spend-concentration-v1";

/**
 * Calculates deterministic HHI and risk level:
 * HHI < 1,500: Low concentration
 * 1,500 <= HHI <= 2,500: Moderate concentration
 * HHI > 2,500: High concentration
 */
export function calculateHHI(shares: number[]): {
  hhi: number;
  riskLevel: "LOW" | "MODERATE" | "HIGH";
} {
  const hhi = Math.round(
    shares.reduce((sum, share) => sum + Math.pow(share, 2), 0),
  );
  let riskLevel: "LOW" | "MODERATE" | "HIGH" = "LOW";
  if (hhi > 2500) {
    riskLevel = "HIGH";
  } else if (hhi >= 1500) {
    riskLevel = "MODERATE";
  }
  return { hhi, riskLevel };
}

/**
 * Reusable deterministic analytics service for spend concentration across
 * Vendors, Categories, and Departments.
 */
export function calculateSpendConcentration(
  ledger: Ledger,
  asOf = today(),
): SpendConcentrationReport {
  const activeInvoices = ledger.invoices.filter((i) => i.status !== "REJECTED");
  const totalSpendMinor = activeInvoices.reduce((s, i) => s + i.total_minor, 0);

  const vendorMap = new Map(ledger.vendors.map((v) => [v.id, v]));
  const categoryMap = new Map(ledger.categories.map((c) => [c.id, c]));

  // 1. Group by Vendor
  const vendorBucketsMap = new Map<string, ConcentrationBucket>();
  // 2. Group by Category
  const categoryBucketsMap = new Map<string, ConcentrationBucket>();
  // 3. Group by Department (in our schema, vendor.category or category.name acts as department/cost center)
  const departmentBucketsMap = new Map<string, ConcentrationBucket>();

  for (const inv of activeInvoices) {
    const v = vendorMap.get(inv.vendor_id);
    const c = categoryMap.get(inv.category_id);
    const vendorName = v?.name || "Unknown Vendor";
    const categoryName = c?.name || "Uncategorized";
    const departmentName = v?.category || categoryName;

    const drillDownItem: SpendItemDrillDown = {
      id: inv.id,
      invoiceNumber: inv.invoice_number,
      vendorId: inv.vendor_id,
      vendorName,
      categoryId: inv.category_id,
      categoryName,
      amountMinor: inv.total_minor,
      date: inv.invoice_date,
      dueDate: inv.due_date,
      status: inv.status,
    };

    // Vendor bucket
    const vBucket = vendorBucketsMap.get(inv.vendor_id) || {
      id: inv.vendor_id,
      name: vendorName,
      spendMinor: 0,
      percentage: 0,
      invoiceCount: 0,
      invoices: [],
    };
    vBucket.spendMinor += inv.total_minor;
    vBucket.invoiceCount += 1;
    vBucket.invoices.push(drillDownItem);
    vendorBucketsMap.set(inv.vendor_id, vBucket);

    // Category bucket
    const cBucket = categoryBucketsMap.get(inv.category_id) || {
      id: inv.category_id,
      name: categoryName,
      spendMinor: 0,
      percentage: 0,
      invoiceCount: 0,
      invoices: [],
    };
    cBucket.spendMinor += inv.total_minor;
    cBucket.invoiceCount += 1;
    cBucket.invoices.push(drillDownItem);
    categoryBucketsMap.set(inv.category_id, cBucket);

    // Department bucket
    const dBucket = departmentBucketsMap.get(departmentName) || {
      id: `dept_${departmentName.toLowerCase().replace(/[^a-z0-9]/g, "_")}`,
      name: departmentName,
      spendMinor: 0,
      percentage: 0,
      invoiceCount: 0,
      invoices: [],
    };
    dBucket.spendMinor += inv.total_minor;
    dBucket.invoiceCount += 1;
    dBucket.invoices.push(drillDownItem);
    departmentBucketsMap.set(departmentName, dBucket);
  }

  function compileDimension(
    dimension: "VENDOR" | "CATEGORY" | "DEPARTMENT",
    label: string,
    bucketsMap: Map<string, ConcentrationBucket>,
  ): DimensionConcentration {
    const buckets = Array.from(bucketsMap.values()).map((b) => ({
      ...b,
      percentage:
        totalSpendMinor > 0
          ? Number(((b.spendMinor / totalSpendMinor) * 100).toFixed(1))
          : 0,
    }));

    // Sort descending by spend
    buckets.sort((a, b) => b.spendMinor - a.spendMinor);

    const shares = buckets.map((b) => b.percentage);
    const cr1 = shares.length > 0 ? Number(shares[0].toFixed(1)) : 0;
    const cr3 = Number(
      shares.slice(0, 3).reduce((sum, s) => sum + s, 0).toFixed(1),
    );
    const cr5 = Number(
      shares.slice(0, 5).reduce((sum, s) => sum + s, 0).toFixed(1),
    );

    const { hhi, riskLevel } = calculateHHI(shares);

    return {
      dimension,
      dimensionLabel: label,
      totalSpendMinor,
      cr1,
      cr3,
      cr5,
      hhi,
      riskLevel,
      buckets,
    };
  }

  const vendorConcentration = compileDimension("VENDOR", "Vendor Concentration", vendorBucketsMap);
  const categoryConcentration = compileDimension("CATEGORY", "Category Concentration", categoryBucketsMap);
  const departmentConcentration = compileDimension("DEPARTMENT", "Department Concentration", departmentBucketsMap);

  const topSupplier = vendorConcentration.buckets[0];
  const topSupplierRisk =
    topSupplier && topSupplier.percentage >= 30
      ? `Top supplier ${topSupplier.name} accounts for ${topSupplier.percentage}% of all spend (${(topSupplier.spendMinor / 100).toLocaleString("en-IN", { style: "currency", currency: "INR" })})`
      : null;

  const topCategory = categoryConcentration.buckets[0];
  const topCategoryRisk =
    topCategory && topCategory.percentage >= 40
      ? `Top category ${topCategory.name} represents ${topCategory.percentage}% of supplier commitments`
      : null;

  return {
    asOf,
    totalSpendMinor,
    vendorConcentration,
    categoryConcentration,
    departmentConcentration,
    topSupplierRisk,
    topCategoryRisk,
    calculationId: `calc_spend_concentration_${asOf.replace(/-/g, "")}`,
    calculationVersion: SPEND_CONCENTRATION_VERSION,
    generatedAt: new Date().toISOString(),
  };
}
