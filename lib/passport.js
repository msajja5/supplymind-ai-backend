/**
 * SupplyMind AI — ESG Passport Builder
 * Assembles the canonical ESG passport and signs with SHA-256 hash.
 */

import { createHash } from 'crypto';
import { SCHEMA_VERSION } from './schema.js';

/**
 * Generate a simple passport ID.
 */
function generatePassportId() {
  const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `ESG-IN-${date}-${rand}`;
}

/**
 * Compute SHA-256 hash of the passport content for integrity verification.
 */
function hashPassport(content) {
  return createHash('sha256').update(JSON.stringify(content)).digest('hex');
}

/**
 * Compute ESG score from available data (0–100).
 */
function computeEsgScore({ certifications = [], emissions = {}, transparency = false }) {
  let score = 50; // Base score
  if (certifications.length > 0) score += 10;
  if (certifications.length > 2) score += 10;
  if (emissions.scope1_tco2e !== undefined) score += 10;
  if (emissions.scope2_tco2e !== undefined) score += 5;
  if (emissions.scope3_partial_tco2e !== undefined) score += 5;
  if (transparency) score += 10;
  return Math.min(score, 100);
}

/**
 * Build a complete ESG passport from transformed data.
 * @param {object} data — output of transform step
 * @returns {object} — signed ESG passport
 */
export function buildPassport(data) {
  const passportId = generatePassportId();
  const generatedAt = new Date().toISOString();

  const certs = (data.compliance?.certifications ?? []).map(c => ({
    standard: c.standard ?? c,
    code: c.code ?? c,
    valid_until: c.valid_until ?? null,
    status: c.valid_until && new Date(c.valid_until) > new Date() ? 'VALID' : 'EXPIRED',
  }));

  const esgScore = computeEsgScore({
    certifications: certs,
    emissions: data.emissions ?? {},
    transparency: !!(data.emissions?.scope1_tco2e),
  });

  const body = {
    passport_id: passportId,
    schema_version: SCHEMA_VERSION,
    generated_at: generatedAt,
    supplier: {
      ...data.supplier,
      esg_score: esgScore,
      certifications: certs,
    },
    product: data.product,
    financials: data.financials,
    emissions: data.emissions,
    compliance: {
      cbam_applicable: data.compliance?.cbam_applicable ?? false,
      csrd_scope3_reportable: true,
      eu_dpp_required: false,
      certifications: certs,
    },
    logistics: data.logistics,
  };

  const hash = hashPassport(body);

  return {
    ...body,
    integrity: {
      hash_sha256: hash,
      signed_by: 'supplymind_ai_v2.1',
      signed_at: generatedAt,
    },
  };
}
