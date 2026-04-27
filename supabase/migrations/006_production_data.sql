-- ============================================================
-- Migration 006: Production Data — production_detail_log
-- Category 3 of SupplyMind AI Input Layer
-- Extends production_log with CBAM, raw material, scrap, intensity
-- ============================================================

CREATE TABLE IF NOT EXISTS public.production_detail_log (
  production_detail_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_log_id     UUID REFERENCES public.production_log(production_log_id),
  site_id               UUID NOT NULL REFERENCES public.site_master(site_id),
  company_id            UUID NOT NULL REFERENCES public.company_master(company_id),

  -- Output
  output_tonnes         NUMERIC NOT NULL,
  cn_product_code       TEXT,          -- CBAM CN code e.g. 7207, 2507
  production_period_start DATE,
  production_period_end   DATE,
  document_date           DATE,

  -- Raw material input table (stored as JSONB array)
  -- [{"material":"iron ore","type":"primary","kg_per_kg":0.9,"supplier_origin":"India"}]
  raw_materials         JSONB,

  -- Scrap and waste
  metal_scrap_recovery_rate NUMERIC,   -- percentage 0-100
  solid_waste_kg        NUMERIC,
  wastewater_m3         NUMERIC,

  -- Emission intensity (populated by trigger or Make)
  total_co2e_tonnes     NUMERIC,       -- sum of Scope1 + Scope2 for this period
  emission_intensity    NUMERIC GENERATED ALWAYS AS
    (CASE WHEN output_tonnes > 0 THEN total_co2e_tonnes / output_tonnes ELSE NULL END) STORED,
  -- unit: tCO2e / tonne of output

  -- Intake metadata
  source_channel        TEXT DEFAULT 'manual',
  file_url              TEXT,
  extracted_json        JSONB,
  raw_text              TEXT,
  confidence            NUMERIC,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.production_detail_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_prod_detail_site ON public.production_detail_log(site_id);
CREATE INDEX IF NOT EXISTS idx_prod_detail_cn ON public.production_detail_log(cn_product_code);
CREATE INDEX IF NOT EXISTS idx_prod_detail_date ON public.production_detail_log(document_date);

COMMENT ON TABLE public.production_detail_log IS
  'Extended production data for CBAM reporting: raw materials, scrap, emission intensity per output tonne.';
