/**
 * SupplyMind AI — Payload Validator
 * Validates inbound supplier payloads against the canonical schema.
 */

import { REQUIRED_FIELDS } from './schema.js';

/**
 * Get nested value from object using dot-notation key.
 */
function getNestedValue(obj, path) {
  return path.split('.').reduce((acc, key) => acc?.[key], obj);
}

/**
 * Validate a transformed payload against required schema fields.
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
export function validatePayload(payload) {
  const errors = [];
  const warnings = [];

  // Required fields check
  for (const field of REQUIRED_FIELDS) {
    const val = getNestedValue(payload, field);
    if (val === undefined || val === null || val === '') {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Type checks
  if (payload.product?.quantity !== undefined && typeof payload.product.quantity !== 'number') {
    errors.push('product.quantity must be a number');
  }
  if (payload.product?.weight_kg !== undefined && typeof payload.product.weight_kg !== 'number') {
    errors.push('product.weight_kg must be a number');
  }
  if (payload.financials?.unit_price_eur !== undefined && typeof payload.financials.unit_price_eur !== 'number') {
    errors.push('financials.unit_price_eur must be a number');
  }

  // Business rule warnings
  if (!payload.product?.hs_code) {
    warnings.push('hs_code not provided — will be AI-classified');
  }
  if (!payload.emissions?.scope1_tco2e) {
    warnings.push('Scope 1 emissions not provided — will be estimated from process factors');
  }
  if (!payload.compliance?.certifications?.length) {
    warnings.push('No certifications provided — ESG score will be reduced');
  }

  // Cert expiry check
  const certs = payload.compliance?.certifications ?? [];
  const today = new Date();
  for (const cert of certs) {
    if (cert.valid_until) {
      const expiry = new Date(cert.valid_until);
      if (expiry < today) {
        warnings.push(`Certificate ${cert.code} expired on ${cert.valid_until} — escalating`);
      } else if ((expiry - today) < 30 * 24 * 3600 * 1000) {
        warnings.push(`Certificate ${cert.code} expires within 30 days — renewal recommended`);
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Normalize raw supplier payload (any source) into pre-transform structure.
 */
export function normalizeRaw(raw, source = 'unknown') {
  // Handle Tally ERP export format
  if (source === 'tally_erp') {
    return {
      supplier: { tax_id: raw.supplier_gst, country_iso2: 'IN', name: raw.supplier_name },
      product: {
        description: raw.item_name,
        part_number: raw.part_no,
        quantity: parseFloat(raw.quantity),
        weight_kg: parseFloat(raw.weight_kg_per_unit),
        material: raw.material,
        manufacturing_process: raw.manufacturing_process,
        certifications_raw: raw.certifications_raw ?? [],
      },
      financials: { unit_price_inr: parseFloat(raw.unit_price_inr) },
      logistics: { dispatch_date: raw.dispatch_date },
      _source: source,
      _raw_batch_id: raw.batch_id,
    };
  }

  // Generic / API direct format — pass through
  return { ...raw, _source: source };
}
