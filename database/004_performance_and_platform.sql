-- Database Performance Layer & Production Platform Infrastructure
-- Features 36, 37, 38, 41

-- 1. Strategic Composite Indexes for Access Patterns
CREATE INDEX IF NOT EXISTS idx_invoices_company_status
ON public.invoices (company_id, status);

CREATE INDEX IF NOT EXISTS idx_invoices_company_due_date
ON public.invoices (company_id, due_date);

CREATE INDEX IF NOT EXISTS idx_payments_company_date
ON public.payments (company_id, payment_date);

CREATE INDEX IF NOT EXISTS idx_receivables_company_status_due
ON public.receivables (company_id, status, due_date);

CREATE INDEX IF NOT EXISTS idx_audit_company_time
ON public.audit_logs (company_id, created_at DESC);

-- 2. Materialized Views for Analytical Aggregations
-- Monthly Vendor Spend Materialized View
CREATE MATERIALIZED VIEW IF NOT EXISTS public.monthly_vendor_spend AS
SELECT
  company_id,
  vendor_id,
  date_trunc('month', invoice_date) AS month,
  COUNT(id) AS invoice_count,
  SUM(total_minor) AS spend_minor
FROM public.invoices
WHERE status NOT IN ('REJECTED', 'DRAFT')
GROUP BY company_id, vendor_id, date_trunc('month', invoice_date);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_vendor_spend
ON public.monthly_vendor_spend (company_id, vendor_id, month);

-- Monthly Category Spend Materialized View
CREATE MATERIALIZED VIEW IF NOT EXISTS public.monthly_category_spend AS
SELECT
  company_id,
  category_id,
  date_trunc('month', invoice_date) AS month,
  COUNT(id) AS invoice_count,
  SUM(total_minor) AS spend_minor
FROM public.invoices
WHERE status NOT IN ('REJECTED', 'DRAFT')
GROUP BY company_id, category_id, date_trunc('month', invoice_date);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_category_spend
ON public.monthly_category_spend (company_id, category_id, month);

-- 3. Background Jobs Table (Feature 37)
CREATE TABLE IF NOT EXISTS public.background_jobs (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  type TEXT NOT NULL CHECK(type IN ('DOCUMENT_EXTRACTION','CSV_IMPORT','REPORT_GENERATION','ANOMALY_RECALCULATION','DAILY_SNAPSHOT','NOTIFICATION')),
  status TEXT NOT NULL CHECK(status IN ('QUEUED','PROCESSING','COMPLETED','FAILED','CANCELLED')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK(progress >= 0 AND progress <= 100),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  idempotency_key TEXT NOT NULL,
  result_json JSONB,
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  UNIQUE(company_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_background_jobs_company_status
ON public.background_jobs (company_id, status, created_at DESC);

-- 4. Notifications Table (Feature 38)
CREATE TABLE IF NOT EXISTS public.notifications (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  user_id TEXT,
  type TEXT NOT NULL CHECK(type IN ('INVOICE_OVERDUE','BUDGET_WARNING','DUPLICATE_RISK','LOW_CASH','RECEIVABLE_OVERDUE','APPROVAL_REQUIRED')),
  severity TEXT NOT NULL CHECK(severity IN ('INFO','WARNING','CRITICAL')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_company_user
ON public.notifications (company_id, user_id, read_at, created_at DESC);

-- 5. Business Rules / Financial Policies Table (Feature 41)
CREATE TABLE IF NOT EXISTS public.financial_policies (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  version INTEGER NOT NULL DEFAULT 1,
  policy_version TEXT NOT NULL,
  policy_json JSONB NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, version)
);

CREATE INDEX IF NOT EXISTS idx_financial_policies_company_version
ON public.financial_policies (company_id, version DESC);

-- RLS Policies
ALTER TABLE public.background_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.background_jobs FROM anon, authenticated;
GRANT SELECT ON public.background_jobs TO authenticated;
CREATE POLICY company_read ON public.background_jobs FOR SELECT TO authenticated USING(public.is_member(company_id));

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notifications FROM anon, authenticated;
GRANT SELECT ON public.notifications TO authenticated;
CREATE POLICY company_read ON public.notifications FOR SELECT TO authenticated USING(public.is_member(company_id));

ALTER TABLE public.financial_policies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.financial_policies FROM anon, authenticated;
GRANT SELECT ON public.financial_policies TO authenticated;
CREATE POLICY company_read ON public.financial_policies FOR SELECT TO authenticated USING(public.is_member(company_id));
