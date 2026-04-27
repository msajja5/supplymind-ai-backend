-- ============================================================
-- Migration 005: Scope 2 Indirect Emissions — scope2_energy_log
-- Category 2 of SupplyMind AI Input Layer
-- Grid emission factors: India 0.82 | EU 0.233 | UK 0.207 | DE 0.364 | FR 0.052
-- ============================================================

CREATE TABLE IF NOT EXISTS public.scope2_energy_log (
  scope2_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id               UUID NOT NULL REFERENCES public.site_master(site_id),
  company_id            UUID NOT NULL REFERENCES public.company_master(company_id),

  -- Meter and billing
  meter_id              UUID REFERENCES public.meter_master(meter_id),
  meter_reference       TEXT,
  invoice_reference     TEXT,
  billing_period_start  DATE,
  billing_period_end    DATE,
  document_date         DATE,

  -- Consumption
  consumption_kwh       NUMERIC NOT NULL,

  -- Grid emission factor
  grid_region           TEXT NOT NULL DEFAULT 'india', -- india | eu | uk | germany | france | other
  grid_ef_kg_per_kwh    NUMERIC,       -- auto-set from grid_region if not provided
  co2e_kg               NUMERIC GENERATED ALWAYS AS (consumption_kwh * grid_ef_kg_per_kwh) STORED,
  co2e_tonnes           NUMERIC GENERATED ALWAYS AS ((consumption_kwh * grid_ef_kg_per_kwh) / 1000) STORED,

  -- Renewable generation
  has_renewable         BOOLEAN DEFAULT false,
  solar_kwp             NUMERIC,
  solar_monthly_kwh     NUMERIC,
  rec_certificate_ref   TEXT,
  net_metering_export_kwh NUMERIC,
  net_consumption_kwh   NUMERIC GENERATED ALWAYS AS
    (GREATEST(consumption_kwh - COALESCE(net_metering_export_kwh, 0), 0)) STORED,

  -- Intake metadata
  source_channel        TEXT DEFAULT 'gmail',
  file_url              TEXT,
  extracted_json        JSONB,
  raw_text              TEXT,
  confidence            NUMERIC,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.scope2_energy_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_scope2_site ON public.scope2_energy_log(site_id);
CREATE INDEX IF NOT EXISTS idx_scope2_company ON public.scope2_energy_log(company_id);
CREATE INDEX IF NOT EXISTS idx_scope2_grid ON public.scope2_energy_log(grid_region);
CREATE INDEX IF NOT EXISTS idx_scope2_date ON public.scope2_energy_log(document_date);

-- Grid EF reference table
CREATE TABLE IF NOT EXISTS public.grid_emission_factors (
  grid_region     TEXT PRIMARY KEY,
  ef_kg_per_kwh   NUMERIC NOT NULL,
  source          TEXT,
  valid_from      DATE,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.grid_emission_factors (grid_region, ef_kg_per_kwh, source)
VALUES
  ('india',   0.820, 'CEA India 2023'),
  ('eu',      0.233, 'EEA EU-27 2023'),
  ('uk',      0.207, 'DESNZ UK 2023'),
  ('germany', 0.364, 'UBA Germany 2023'),
  ('france',  0.052, 'RTE France 2023')
ON CONFLICT (grid_region) DO UPDATE
  SET ef_kg_per_kwh = EXCLUDED.ef_kg_per_kwh,
      is_active = true;

COMMENT ON TABLE public.scope2_energy_log IS
  'Scope 2 indirect emissions from purchased electricity. CO2e calculated from grid EF. Renewable deduction supported.';
