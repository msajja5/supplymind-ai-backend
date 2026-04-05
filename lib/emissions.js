/**
 * SupplyMind AI — Emission Calculator
 * Scope 1/2/3 calculation per GHG Protocol + IEA emission factors
 */

// Emission factors by manufacturing process (kgCO₂e per kg of material processed)
const PROCESS_FACTORS = {
  'CNC Machining':          0.0028,  // kgCO₂e/kg · electro-mechanical
  'CNC Machining + Anodizing': 0.0035,
  'Investment Casting':     0.0042,
  'Forging + Machining':    0.0031,
  'Sheet Metal Forming':    0.0022,
  'Additive Manufacturing': 0.0018,
  'default':                0.0030,
};

// India electricity grid emission factor by state (kgCO₂/kWh) — CEA 2024
const INDIA_GRID_FACTORS = {
  KA: 0.82,  // Karnataka
  MH: 0.94,  // Maharashtra
  TN: 0.76,  // Tamil Nadu
  GJ: 1.01,  // Gujarat
  DL: 0.88,  // Delhi
  default: 0.88,
};

// Specific energy consumption (kWh/kg) by process
const ENERGY_PER_KG = {
  'CNC Machining': 1.8,
  'Investment Casting': 3.2,
  'Forging + Machining': 2.1,
  'Sheet Metal Forming': 1.4,
  'default': 2.0,
};

/**
 * Calculate Scope 1 emissions (direct combustion at supplier facility).
 */
export function calcScope1(weightKg, quantity, process = 'default') {
  const factor = PROCESS_FACTORS[process] ?? PROCESS_FACTORS.default;
  return parseFloat((weightKg * quantity * factor).toFixed(4));
}

/**
 * Calculate Scope 2 emissions (grid electricity used in manufacturing).
 */
export function calcScope2(weightKg, quantity, process = 'default', stateCode = 'default') {
  const gridFactor = INDIA_GRID_FACTORS[stateCode] ?? INDIA_GRID_FACTORS.default;
  const energyKwh = ENERGY_PER_KG[process] ?? ENERGY_PER_KG.default;
  return parseFloat((weightKg * quantity * energyKwh * gridFactor / 1000).toFixed(4));
}

/**
 * Estimate Scope 3 (partial) — upstream material + sea freight to EU.
 */
export function calcScope3Partial(weightKg, quantity, destinationPort = 'Hamburg') {
  // Sea freight emission factor: 0.016 kgCO₂e/tonne-km
  const distanceKm = { Hamburg: 12500, Rotterdam: 12200, Antwerp: 12300 };
  const dist = distanceKm[destinationPort] ?? 12500;
  const freightTco2 = (weightKg * quantity / 1000) * dist * 0.016 / 1000;
  return parseFloat(freightTco2.toFixed(4));
}

/**
 * Main entry: compute all scopes for a batch record.
 */
export function computeEmissions({ weightKg, quantity, process, stateCode, destinationPort }) {
  return {
    scope1_tco2e: calcScope1(weightKg, quantity, process),
    scope2_tco2e: calcScope2(weightKg, quantity, process, stateCode),
    scope3_partial_tco2e: calcScope3Partial(weightKg, quantity, destinationPort),
    methodology: 'GHG Protocol Corporate Standard + IEA/CEA 2024 emission factors',
  };
}
