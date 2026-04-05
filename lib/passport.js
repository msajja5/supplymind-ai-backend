/**
 * SupplyMind AI — ESG Passport Builder
 * Assembles the canonical ESG passport and signs with SHA-256 hash.
 */

import { createHash } from 'crypto';

// Safe schema import — won't crash if schema.js has issues
let SCHEMA_VERSION = 'supplymind_v2.1';
try {
  const schema = await import('./schema.js').catch(() => ({}));
  SCHEMA_VERSION = schema.SCHEMA_VERSION || SCHEMA_VERSION;
} catch {}

function generatePassportId() {
  const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `PP-${date}-${rand}`;
}

function hashPassport(content) {
  return createHash('sha256').update(JSON.stringify(content)).digest('hex');
}

function computeEsgScore({ certifications = [], cbam_applicable = false, wage_compliant = false }) {
  let score = 50;
  if (certifications.length > 0) score += 10;
  if (certifications.length > 2) score += 10;
  if (wage_compliant) score += 10;
  if (!cbam_applicable) score += 5;
  return Math.min(score, 100);
}

/**
 * buildPassport — full passport from transform pipeline data
 */
export function buildPassport(data) {
  const passportId  = generatePassportId();
  const generatedAt = new Date().toISOString();

  const certs = (data.compliance?.certifications ?? []).map(c => ({
    standard:   c.standard ?? c,
    code:       c.code ?? c,
    valid_until: c.valid_until ?? null,
    status: c.valid_until && new Date(c.valid_until) > new Date() ? 'VALID' : 'ACTIVE',
  }));

  const esgScore = computeEsgScore({
    certifications: certs,
    cbam_applicable: data.compliance?.cbam_applicable ?? false,
  });

  const body = {
    passport_id:    passportId,
    schema_version: SCHEMA_VERSION,
    generated_at:   generatedAt,
    supplier: { ...data.supplier, esg_score: esgScore, certifications: certs },
    product:    data.product,
    financials: data.financials,
    emissions:  data.emissions,
    compliance: {
      cbam_applicable:         data.compliance?.cbam_applicable ?? false,
      csrd_scope3_reportable:  true,
      eu_dpp_required:         false,
      certifications:          certs,
    },
    logistics: data.logistics,
  };

  return {
    ...body,
    integrity: {
      hash_sha256: hashPassport(body),
      signed_by:  'supplymind_ai_v2.1',
      signed_at:  generatedAt,
    },
  };
}

/**
 * generatePassport — lightweight alias used by WhatsApp + camera pipeline
 * Accepts flat ESG fields (from extractEsgFromText) and returns a passport
 */
export function generatePassport(fields = {}) {
  const passportId  = generatePassportId();
  const generatedAt = new Date().toISOString();

  const certs = fields.certifications || [];
  const esgScore = computeEsgScore({
    certifications: certs,
    cbam_applicable: fields.cbam_applicable || false,
    wage_compliant:  fields.wage_compliant  || false,
  });

  const body = {
    passport_id:    passportId,
    schema_version: SCHEMA_VERSION,
    generated_at:   generatedAt,
    source:         fields.source || 'api',
    supplier_id:    fields.supplier_id    || null,
    supplier_phone: fields.supplier_phone || null,
    company_name:   fields.company_name   || null,
    gstin:          fields.supplier_gstin || null,
    document_type:  fields.document_type  || null,
    product: {
      material:    fields.material    || null,
      weight_kg:   fields.weight_kg   || null,
      distance_km: fields.distance_km || null,
    },
    emissions: {
      total_co2e_kg: fields.total_co2e_kg || 0,
      scope:         fields.scope         || 'unknown',
      energy_kwh:    fields.energy_kwh    || null,
    },
    compliance: {
      cbam_applicable: fields.cbam_applicable || false,
      certifications:  certs,
      esg_score:       esgScore,
    },
  };

  return {
    ...body,
    integrity: {
      hash_sha256: hashPassport(body),
      signed_by:  'supplymind_ai_v2.1',
      signed_at:  generatedAt,
    },
  };
}
