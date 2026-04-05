/**
 * SupplyMind AI — HS Code Classifier
 * Rule-based + keyword matching (production: replace with ML model or Zonos API)
 */

const HS_RULES = [
  // Aerospace components
  { keywords: ['bracket', 'fuselage', 'wing', 'airframe', 'aircraft', 'a380', 'a320', 'b737'], code: '8803.30.00', desc: 'Aircraft parts NES', confidence: 0.94 },
  { keywords: ['turbine blade', 'compressor blade', 'jet engine', 'turbofan'], code: '8411.99.00', desc: 'Jet engine parts', confidence: 0.92 },
  { keywords: ['landing gear', 'undercarriage'], code: '8803.20.00', desc: 'Landing gear parts', confidence: 0.91 },
  { keywords: ['avionics', 'flight computer', 'navigation'], code: '8526.91.00', desc: 'Radio navigation instruments', confidence: 0.88 },
  // Materials
  { keywords: ['titanium', 'ti-6al-4v', 'ti64'], code: '8108.90.00', desc: 'Titanium articles NES', confidence: 0.90 },
  { keywords: ['aluminium alloy', 'aluminum alloy', 'al7075', 'al2024'], code: '7616.99.10', desc: 'Aluminium articles NES', confidence: 0.89 },
  { keywords: ['stainless steel', 'inconel', 'superalloy'], code: '7326.90.98', desc: 'Steel articles NES', confidence: 0.87 },
  { keywords: ['carbon fibre', 'carbon fiber', 'cfrp', 'composite'], code: '6815.10.00', desc: 'Carbon fibre articles', confidence: 0.91 },
  // Fasteners
  { keywords: ['fastener', 'bolt', 'screw', 'rivet', 'nut'], code: '7318.15.90', desc: 'Steel screws/fasteners NES', confidence: 0.85 },
];

/**
 * Classify a product into an HS code.
 * @param {string} description - product name/description
 * @param {string} material - material specification
 * @returns {{ code: string, description: string, confidence: number, cbam: boolean }}
 */
export function classifyHS(description = '', material = '') {
  const text = `${description} ${material}`.toLowerCase();

  for (const rule of HS_RULES) {
    if (rule.keywords.some(kw => text.includes(kw))) {
      return {
        code: rule.code,
        description: rule.desc,
        confidence: rule.confidence,
        cbam: isCBAM(rule.code),
      };
    }
  }

  // Default fallback
  return {
    code: '8479.89.99',
    description: 'Mechanical appliances NES',
    confidence: 0.50,
    cbam: false,
  };
}

/**
 * Check if HS code falls under CBAM Annex I sectors.
 */
export function isCBAM(hsCode = '') {
  const { CBAM_HS_PREFIXES } = await import('./schema.js').catch(() => ({ CBAM_HS_PREFIXES: [] }));
  const prefix = hsCode.replace('.', '').substring(0, 4);
  return CBAM_HS_PREFIXES.includes(prefix);
}
