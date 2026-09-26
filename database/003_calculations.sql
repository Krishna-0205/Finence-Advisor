-- Calculations and audit lineage for financial KPIs
CREATE TABLE IF NOT EXISTS public.financial_calculations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id text NOT NULL REFERENCES companies(id),
  metric TEXT NOT NULL,
  calculation_version TEXT NOT NULL,
  formula TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data_as_of TIMESTAMPTZ NOT NULL,
  result_json JSONB NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_financial_calculations_company_metric
ON public.financial_calculations (
  company_id,
  metric,
  generated_at DESC
);

CREATE TABLE IF NOT EXISTS public.financial_calculation_sources (
  calculation_id UUID NOT NULL REFERENCES financial_calculations(id) ON DELETE CASCADE,
  company_id text NOT NULL REFERENCES companies(id),
  source_record_type TEXT NOT NULL,
  source_record_id text NOT NULL,
  source_document_id text,
  amount_minor BIGINT,
  PRIMARY KEY (
    calculation_id,
    source_record_type,
    source_record_id
  )
);

CREATE INDEX IF NOT EXISTS idx_calculation_sources_source
ON public.financial_calculation_sources (
  company_id,
  source_record_type,
  source_record_id
);

ALTER TABLE public.financial_calculations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.financial_calculations FROM anon, authenticated;
GRANT SELECT ON public.financial_calculations TO authenticated;
CREATE POLICY company_read ON public.financial_calculations FOR SELECT TO authenticated USING(public.is_member(company_id));

ALTER TABLE public.financial_calculation_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.financial_calculation_sources FROM anon, authenticated;
GRANT SELECT ON public.financial_calculation_sources TO authenticated;
CREATE POLICY company_read ON public.financial_calculation_sources FOR SELECT TO authenticated USING(public.is_member(company_id));
