/**
 * SupplyMind AI — Canonical Data Schema v2.1
 * The single source of truth for India→EU aerospace supply chain data
 */

export const SCHEMA_VERSION = 'supplymind_v2.1';

/**
 * Required fields for a valid SupplyMind record.
 * Any ingest source must map to these fields after transform.
 */
export const REQUIRED_FIELDS = [
  'supplier.tax_id',
  'supplier.country_iso2',
  'product.description',
  'product.quantity',
  'product.weight_kg',
  'financials.unit_price_eur',
  'logistics.dispatch_date',
];

/**
 * Full canonical schema definition with types and descriptions.
 */
export const SCHEMA = {
  passport_id:      { type: 'string',  required: true,  desc: 'UUID — auto-generated' },
  schema_version:   { type: 'string',  required: true,  desc: 'supplymind_v2.1' },
  generated_at:     { type: 'string',  required: true,  desc: 'ISO 8601 UTC timestamp' },

  supplier: {
    name:           { type: 'string',  required: true  },
    country_iso2:   { type: 'string',  required: true,  desc: 'ISO 3166-1 alpha-2, e.g. IN' },
    tax_id:         { type: 'string',  required: true,  desc: 'GST / PAN / DUNS' },
    esg_score:      { type: 'number',  required: false, desc: 'Computed 0-100' },
    certifications: { type: 'array',   required: false },
  },

  product: {
    description:         { type: 'string',  required: true  },
    part_number:         { type: 'string',  required: false },
    hs_code:             { type: 'string',  required: false, desc: 'WCO 6-digit; AI-classified if missing' },
    hs_confidence:       { type: 'number',  required: false, desc: '0.0 – 1.0' },
    material:            { type: 'string',  required: false },
    weight_kg:           { type: 'number',  required: true  },
    quantity:            { type: 'number',  required: true  },
    manufacturing_process: { type: 'string', required: false },
    dpp_id:              { type: 'string',  required: false, desc: 'EU Digital Product Passport link' },
  },

  financials: {
    unit_price_eur: { type: 'number', required: true  },
    total_value_eur:{ type: 'number', required: false },
    fx_rate_inr_eur:{ type: 'number', required: false },
  },

  emissions: {
    scope1_tco2e:       { type: 'number', required: false, desc: 'Direct combustion' },
    scope2_tco2e:       { type: 'number', required: false, desc: 'Grid electricity' },
    scope3_partial_tco2e: { type: 'number', required: false, desc: 'Upstream + logistics' },
    methodology:        { type: 'string', required: false, desc: 'GHG Protocol + IEA factors' },
  },

  compliance: {
    cbam_applicable:      { type: 'boolean', required: false },
    csrd_scope3_reportable:{ type: 'boolean', required: false },
    eu_dpp_required:      { type: 'boolean', required: false },
    certifications:       { type: 'array',   required: false },
  },

  logistics: {
    incoterm:             { type: 'string', required: false },
    port_of_loading:      { type: 'string', required: false },
    port_of_discharge:    { type: 'string', required: false },
    dispatch_date:        { type: 'string', required: true  },
    estimated_arrival_eu: { type: 'string', required: false },
  },

  integrity: {
    hash_sha256: { type: 'string', required: true },
    signed_by:   { type: 'string', required: true },
  },
};

/**
 * CBAM Annex I HS code prefixes (steel, aluminium, cement, fertiliser, electricity, hydrogen)
 * Aerospace HS 8803 is NOT in scope.
 */
export const CBAM_HS_PREFIXES = [
  '2523', // Cement
  '2601', '7201', '7202', '7203', '7204', '7205', '7206', '7207', // Iron/steel
  '7208', '7209', '7210', '7211', '7212', '7213', '7214', '7215', '7216', '7217',
  '7218', '7219', '7220', '7221', '7222', '7223', '7224', '7225', '7226', '7227', '7228', '7229',
  '7601', '7602', '7603', '7604', '7605', '7606', '7607', '7608', '7609', // Aluminium
  '2808', // Nitric acid (fertiliser)
  '3102', '3103', '3104', '3105', // Fertilisers
  '2716', // Electricity
  '2804', // Hydrogen
];
