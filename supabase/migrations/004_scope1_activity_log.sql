-- ============================================================
-- Migration 004: Scope 1 Direct Emissions — scope1_activity_log
-- Category 1 of SupplyMind AI Input Layer
-- IPCC AR6 emission factors applied at insert-time
-- ============================================================

CREATE TABLE IF NOT EXISTS public.scope1_activity_log (
  scope1_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id               UUID NOT NULL REFERENCES public.site_master(site_id),
  company_id            UUID NOT NULL REFERENCES public.company_master(company_id),

  -- Fuel identification
  fuel_type             TEXT NOT NULL, -- diesel | lpg | natural_gas | coal | fuel_oil | petrol | other
  fuel_quantity         NUMERIC NOT NULL,
  fuel_unit             TEXT NOT NULL DEFAULT 'litres', -- litres | kg | m3 | tonnes

  -- IPCC AR6 Emission Factors (kgCO2e per unit)
  emission_factor_kg    NUMERIC,       -- auto-populated from emission_factors table
  co2e_kg               NUMERIC GENERATED ALWAYS AS (fuel_quantity * emission_factor_kg) STORED,
  co2e_tonnes           NUMERIC GENERATED ALWAYS AS ((fuel_quantity * emission_factor_kg) / 1000) STORED,

  -- Combustion source
  combustion_source     TEXT,          -- boiler | kiln | furnace | vehicle | generator | other
  process_description   TEXT,

  -- Billing / evidence fields
  document_date         DATE,
  billing_period_start  DATE,
  billing_period_end    DATE,
  invoice_reference     TEXT,
  supplier_name         TEXT,

  -- Intake metadata
  source_channel        TEXT DEFAULT 'gmail', -- gmail | whatsapp | upload | manual
  file_url              TEXT,
  extracted_json        JSONB,
  raw_text              TEXT,
  confidence            NUMERIC,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.scope1_activity_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_scope1_site ON public.scope1_activity_log(site_id);
CREATE INDEX IF NOT EXISTS idx_scope1_company ON public.scope1_activity_log(company_id);
CREATE INDEX IF NOT EXISTS idx_scope1_fuel ON public.scope1_activity_log(fuel_type);
CREATE INDEX IF NOT EXISTS idx_scope1_date ON public.scope1_activity_log(document_date);

-- Seed IPCC AR6 emission factors into emission_factors table
INSERT INTO public.emission_factors (energy_type, emission_factor_kg, is_active)
VALUES
  ('diesel',      2.68, true),
  ('coal',        2.42, true),
  ('natural_gas', 2.04, true),
  ('lpg',         1.51, true),
  ('fuel_oil',    2.99, true),
  ('petrol',      2.31, true)
ON CONFLICT (energy_type) DO UPDATE
  SET emission_factor_kg = EXCLUDED.emission_factor_kg,
      is_active = true;

COMMENT ON TABLE public.scope1_activity_log IS
  'Scope 1 direct emissions from on-site fuel combustion. CO2e auto-calculated via IPCC AR6 factors.';
