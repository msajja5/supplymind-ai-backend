/**
 * SupplyMind AI — HS Code Classifier
 * Rule-based + keyword matching (production: replace with ML model or Zonos API)
 */

// CBAM Annex I HS prefixes (inline — avoids async import issue)
const CBAM_HS_PREFIXES = [
  '2601','2602','2603','2604','2605','2606','2607','2608','2609', // ores
  '7201','7202','7203','7204','7205','7206','7207','7208','7209', // iron/steel
  '7210','7211','7212','7213','7214','7215','7216','7217','7218', // steel
  '7219','7220','7221','7222','7223','7224','7225','7226','7227', // steel
  '7228','7229',                                                  // steel (titanium steel)
  '7301','7302','7303','7304','7305','7306','7307','7308','7309', // steel structures
  '7601','7602','7603','7604','7605','7606','7607','7608','7609', // aluminium
  '8101','8102','8103','8104','8105','8106','8107','8108','8109', // base metals (titanium)
  '2804','2814','2815','2818','2819','2820','2821','2834',        // chemicals
  '3102','3103','3104','3105',                                    // fertilisers
  '2507','2508','6901','6902','6903','6904','6905','6906',        // cement/ceramics
  '2716',                                                         // electricity
];

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
        code:        rule.code,
        description: rule.desc,
        confidence:  rule.confidence,
        cbam:        isCBAM(rule.code),
      };
    }
  }

  return {
    code:        '8479.89.99',
    description: 'Mechanical appliances NES',
    confidence:  0.50,
    cbam:        false,
  };
}

/**
 * Check if HS code falls under CBAM Annex I sectors.
 * Synchronous — uses inline prefix list.
 */
export function isCBAM(hsCode = '') {
  const prefix = hsCode.replace(/\./g, '').substring(0, 4);
  return CBAM_HS_PREFIXES.includes(prefix);
}
