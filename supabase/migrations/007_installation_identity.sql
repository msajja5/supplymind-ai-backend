-- ============================================================
-- Migration 007: Installation Identity — installation_master
-- Category 4 of SupplyMind AI Input Layer
-- Extends company_master/site_master with GSTIN, GPS, auditor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.installation_master (
  installation_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES public.company_master(company_id),
  site_id               UUID REFERENCES public.site_master(site_id),

  -- Company identity
  legal_name            TEXT NOT NULL,
  gstin                 TEXT,          -- 15-digit GST Identification Number
  pan                   TEXT,          -- 10-digit PAN
  cin                   TEXT,          -- 21-digit CIN
  industry_type         TEXT,          -- e.g. manufacturing | services | energy
  nace_code             TEXT,

  -- Factory address
  factory_address       TEXT,
  city                  TEXT,
  state                 TEXT,
  pin_code              TEXT,
  country               TEXT DEFAULT 'India',

  -- GPS location
  latitude              NUMERIC,
  longitude             NUMERIC,
  gps_captured_via      TEXT DEFAULT 'manual', -- browser | manual

  -- Process and system boundary
  production_process    TEXT,
  system_boundary       TEXT,          -- e.g. gate-to-gate | cradle-to-gate

  -- Auditor contact
  auditor_name          TEXT,
  auditor_email         TEXT,
  auditor_phone         TEXT,

  -- Intake metadata
  source_channel        TEXT DEFAULT 'tally',
  extracted_json        JSONB,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.installation_master ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_install_company ON public.installation_master(company_id);
CREATE INDEX IF NOT EXISTS idx_install_gstin ON public.installation_master(gstin);

COMMENT ON TABLE public.installation_master IS
  'Installation identity: GSTIN, PAN, CIN, GPS, auditor contact. One row per factory/facility.';
