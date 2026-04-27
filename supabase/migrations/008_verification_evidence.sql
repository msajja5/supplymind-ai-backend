-- ============================================================
-- Migration 008: Third-Party Verification — verification_evidence
-- Category 5 of SupplyMind AI Input Layer
-- ============================================================

CREATE TABLE IF NOT EXISTS public.verification_evidence (
  evidence_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES public.company_master(company_id),
  site_id               UUID REFERENCES public.site_master(site_id),

  -- Evidence category
  evidence_category     TEXT NOT NULL,
  -- scope1_fuel | scope2_electricity | scope2_water | production | installation | other

  -- Evidence file
  file_url              TEXT,
  file_name             TEXT,
  file_type             TEXT,          -- pdf | jpg | png | xlsx
  document_date         DATE,

  -- Calculation methodology
  methodology           TEXT[],
  -- values: ipcc_tier1 | ipcc_tier2 | measured | mass_balance | supplier_specific

  -- System boundary
  system_boundary_type  TEXT,          -- gate-to-gate | cradle-to-gate | cradle-to-grave

  -- Verification details
  verifier_name         TEXT,
  verifier_organisation TEXT,
  verification_date     DATE,
  assurance_level       TEXT,          -- limited | reasonable | none
  verification_standard TEXT,          -- ISO14064 | ISAE3000 | GHG Protocol

  -- Linked records (optional)
  scope1_id             UUID REFERENCES public.scope1_activity_log(scope1_id),
  scope2_id             UUID REFERENCES public.scope2_energy_log(scope2_id),
  production_detail_id  UUID REFERENCES public.production_detail_log(production_detail_id),

  -- Intake metadata
  source_channel        TEXT DEFAULT 'upload',
  extracted_json        JSONB,
  raw_text              TEXT,
  confidence            NUMERIC,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.verification_evidence ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_evidence_company ON public.verification_evidence(company_id);
CREATE INDEX IF NOT EXISTS idx_evidence_category ON public.verification_evidence(evidence_category);
CREATE INDEX IF NOT EXISTS idx_evidence_date ON public.verification_evidence(document_date);

COMMENT ON TABLE public.verification_evidence IS
  'Third-party verification evidence: file uploads, methodology, verifier details, assurance level per category.';
