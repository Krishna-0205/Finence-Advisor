import { createHash } from "node:crypto";
import type { Ledger, Invoice, Payment, Receivable, Receipt, Budget, Vendor, Category, Actor } from "../../domain/types";
import { financialEngine } from "../finance";

export interface EvaluationFixture {
  companyId: string;
  user: {
    id: string;
    role: "ADMIN" | "FINANCE" | "VIEWER";
  };
  ledger: Ledger;
  isolatedTenantLedger: Ledger;
  users: {
    admin: Actor;
    finance: Actor;
    viewer: Actor;
    unauthorized: Actor;
  };
  invoices: Invoice[];
  payments: Payment[];
  receivables: Receivable[];
  receipts: Receipt[];
  budgets: Budget[];
  vendors: Vendor[];
  categories: Category[];
  expectedMetrics: {
    outstandingPayablesMinor: bigint;
    expectedReceivablesMinor: bigint;
    cashMinor: bigint;
  };
}

const FIXTURE_DATE = "2026-09-22";

export function createEvaluationFixture(): EvaluationFixture {
  const companyId = "company-test-001";
  const otherCompanyId = "company-test-002";
  const at = new Date("2026-09-22T08:00:00Z").toISOString();

  const vendors: Vendor[] = [
    { id: "v0", company_id: companyId, name: "CloudMatrix", email: "cloudmatrix@example.test", category: "Technology", created_at: at },
    { id: "v1", company_id: companyId, name: "OfficeHub", email: "officehub@example.test", category: "Operations", created_at: at },
    { id: "v2", company_id: companyId, name: "TechServe", email: "techserve@example.test", category: "Technology", created_at: at },
    { id: "v3", company_id: companyId, name: "LogiPro", email: "logipro@example.test", category: "Logistics", created_at: at },
  ];

  const categories: Category[] = [
    { id: "c0", company_id: companyId, name: "Technology", created_at: at },
    { id: "c1", company_id: companyId, name: "Operations", created_at: at },
    { id: "c2", company_id: companyId, name: "Logistics", created_at: at },
  ];

  const invoices: Invoice[] = [
    {
      id: "inv-1042",
      company_id: companyId,
      vendor_id: "v0",
      category_id: "c0",
      invoice_number: "CM-1042",
      invoice_date: "2026-09-01",
      due_date: "2026-09-18",
      subtotal_minor: 9600000,
      tax_minor: 0,
      total_minor: 9600000,
      currency_code: "INR",
      status: "APPROVED",
      source: "MANUAL",
      description: "Cloud infrastructure compute and storage",
      approved_at: at,
      approved_by: "demo-finance",
      created_at: at,
    },
    {
      id: "inv-1043",
      company_id: companyId,
      vendor_id: "v0",
      category_id: "c0",
      invoice_number: "CM-1042",
      invoice_date: "2026-09-02",
      due_date: "2026-10-02",
      subtotal_minor: 9600000,
      tax_minor: 0,
      total_minor: 9600000,
      currency_code: "INR",
      status: "PENDING_REVIEW",
      source: "MANUAL",
      description: "Cloud infrastructure duplicate claim",
      created_at: at,
    },
    {
      id: "inv-1044",
      company_id: companyId,
      vendor_id: "v1",
      category_id: "c1",
      invoice_number: "OH-0821",
      invoice_date: "2026-09-01",
      due_date: "2026-09-20",
      subtotal_minor: 8500000,
      tax_minor: 0,
      total_minor: 8500000,
      currency_code: "INR",
      status: "APPROVED",
      source: "MANUAL",
      description: "Office renewal quarterly",
      approved_at: at,
      approved_by: "demo-finance",
      created_at: at,
    },
    {
      id: "inv-1045",
      company_id: companyId,
      vendor_id: "v2",
      category_id: "c0",
      invoice_number: "TS-3910",
      invoice_date: "2026-09-05",
      due_date: "2026-09-28",
      subtotal_minor: 4200000,
      tax_minor: 0,
      total_minor: 4200000,
      currency_code: "INR",
      status: "SCHEDULED",
      scheduled_payment_date: "2026-09-28",
      source: "MANUAL",
      description: "Technical consulting services",
      approved_at: at,
      approved_by: "demo-finance",
      created_at: at,
    },
  ];

  const payments: Payment[] = [
    {
      id: "p-h0",
      company_id: companyId,
      invoice_id: "inv-1042",
      amount_minor: 2000000,
      payment_date: "2026-09-10",
      currency_code: "INR",
      reference: "BANK-H0",
      status: "COMPLETED",
      created_at: at,
    },
  ];

  const receivables: Receivable[] = [
    {
      id: "rec-01",
      company_id: companyId,
      customer_name: "Apex Global",
      reference_number: "REC-2026-01",
      issue_date: "2026-08-15",
      due_date: "2026-09-15",
      amount_minor: 4500000,
      received_minor: 1000000,
      currency_code: "INR",
      created_at: at,
    },
    {
      id: "rec-02",
      company_id: companyId,
      customer_name: "Zeta Corp",
      reference_number: "REC-2026-02",
      issue_date: "2026-08-30",
      due_date: "2026-09-30",
      amount_minor: 2300000,
      received_minor: 0,
      currency_code: "INR",
      created_at: at,
    },
  ];

  const receipts: Receipt[] = [
    {
      id: "rcpt-01",
      company_id: companyId,
      receivable_id: "rec-01",
      amount_minor: 1000000,
      receipt_date: "2026-09-12",
      reference: "RCPT-BANK-01",
      created_at: at,
    },
  ];

  const budgets: Budget[] = [
    {
      id: "b0",
      company_id: companyId,
      category_id: "c0",
      period_start: "2026-09-01",
      period_end: "2026-09-30",
      budget_minor: 48000000,
      currency_code: "INR",
      created_at: at,
    },
    {
      id: "b1",
      company_id: companyId,
      category_id: "c1",
      period_start: "2026-09-01",
      period_end: "2026-09-30",
      budget_minor: 18000000,
      currency_code: "INR",
      created_at: at,
    },
    {
      id: "b2",
      company_id: companyId,
      category_id: "c2",
      period_start: "2026-09-01",
      period_end: "2026-09-30",
      budget_minor: 14000000,
      currency_code: "INR",
      created_at: at,
    },
  ];

  const ledger: Ledger = {
    company: {
      id: companyId,
      name: "NovaTech Solutions Pvt. Ltd.",
      currency_code: "INR",
      opening_cash_minor: 100000000, // ₹10,00,000
      opening_date: "2026-05-01",
    },
    vendors,
    categories,
    invoices,
    payments,
    receivables,
    receipts,
    budgets,
    audit_logs: [],
    recommendations: [],
    imports: [],
    alerts: [],
    revision: 1,
  };

  const isolatedTenantLedger: Ledger = {
    company: {
      id: otherCompanyId,
      name: "Secret Corp Isolated Ltd.",
      currency_code: "INR",
      opening_cash_minor: 500000000,
      opening_date: "2026-01-01",
    },
    vendors: [
      { id: "v-sec-1", company_id: otherCompanyId, name: "Confidential Vendor", email: "secret@sec.test", category: "Secret", created_at: at },
    ],
    categories: [{ id: "c-sec-1", company_id: otherCompanyId, name: "Secret", created_at: at }],
    invoices: [
      {
        id: "inv-secret-999",
        company_id: otherCompanyId,
        vendor_id: "v-sec-1",
        category_id: "c-sec-1",
        invoice_number: "SECRET-999",
        invoice_date: "2026-09-01",
        due_date: "2026-09-20",
        subtotal_minor: 99900000,
        tax_minor: 0,
        total_minor: 99900000,
        currency_code: "INR",
        status: "APPROVED",
        source: "MANUAL",
        description: "Strictly confidential project",
        created_at: at,
      },
    ],
    payments: [],
    receivables: [],
    receipts: [],
    budgets: [],
    audit_logs: [],
    recommendations: [],
    imports: [],
    alerts: [],
    revision: 1,
  };

  const users = {
    admin: {
      user_id: "user-admin-01",
      company_id: companyId,
      name: "Admin Tester",
      role: "admin" as const,
      mode: "demo" as const,
    },
    finance: {
      user_id: "user-finance-01",
      company_id: companyId,
      name: "Finance Officer",
      role: "finance" as const,
      mode: "demo" as const,
    },
    viewer: {
      user_id: "user-viewer-01",
      company_id: companyId,
      name: "Auditor Viewer",
      role: "viewer" as const,
      mode: "demo" as const,
    },
    unauthorized: {
      user_id: "user-attacker-01",
      company_id: "company-unauth-999",
      name: "External Attacker",
      role: "viewer" as const,
      mode: "demo" as const,
    },
  };

  // Pre-calculate authoritative metrics from Financial Engine
  const metrics = financialEngine(ledger, FIXTURE_DATE);

  return {
    companyId,
    user: {
      id: "user-finance-01",
      role: "FINANCE",
    },
    ledger,
    isolatedTenantLedger,
    users,
    invoices,
    payments,
    receivables,
    receipts,
    budgets,
    vendors,
    categories,
    expectedMetrics: {
      outstandingPayablesMinor: BigInt(metrics.payables),
      expectedReceivablesMinor: BigInt(metrics.receivables),
      cashMinor: BigInt(metrics.cash),
    },
  };
}

/**
 * Returns a pristine deep-cloned evaluation fixture.
 */
export function getFreshFixture(): EvaluationFixture {
  return createEvaluationFixture();
}

/**
 * Computes a deterministic cryptographic hash of a ledger state.
 * Any mutation (addition, deletion, edit) changes this hash.
 */
export function hashLedger(ledger: Ledger): string {
  const content = JSON.stringify(ledger, Object.keys(ledger).sort());
  return createHash("sha256").update(content).digest("hex");
}
