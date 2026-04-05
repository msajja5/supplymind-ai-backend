/**
 * SupplyMind AI — Emission Calculator
 * Scope 1/2/3 calculation per GHG Protocol + IEA emission factors
 */

const PROCESS_FACTORS = {
  'CNC Machining':             0.0028,
  'CNC Machining + Anodizing': 0.0035,
  'Investment Casting':        0.0042,
  'Forging + Machining':       0.0031,
  'Sheet Metal Forming':       0.0022,
  'Additive Manufacturing':    0.0018,
  'default':                   0.0030,
};

const INDIA_GRID_FACTORS = {
  KA: 0.82, MH: 0.94, TN: 0.76, GJ: 1.01, DL: 0.88, default: 0.88,
};

const ENERGY_PER_KG = {
  'CNC Machining': 1.8, 'Investment Casting': 3.2,
  'Forging + Machining': 2.1, 'Sheet Metal Forming': 1.4, 'default': 2.0,
};

// Transport emission factors (kgCO2e per tonne-km)
const TRANSPORT_FACTORS = {
  road:   0.096,
  sea:    0.016,
  air:    0.602,
  rail:   0.028,
  default: 0.096,
};

// India electricity grid factor (kgCO2/kWh)
const GRID_FACTOR = 0.82;

export function calcScope1(weightKg, quantity, process = 'default') {
  const factor = PROCESS_FACTORS[process] ?? PROCESS_FACTORS.default;
  return parseFloat((weightKg * quantity * factor).toFixed(4));
}

export function calcScope2(weightKg, quantity, process = 'default', stateCode = 'default') {
  const gridFactor  = INDIA_GRID_FACTORS[stateCode] ?? INDIA_GRID_FACTORS.default;
  const energyKwh   = ENERGY_PER_KG[process] ?? ENERGY_PER_KG.default;
  return parseFloat((weightKg * quantity * energyKwh * gridFactor / 1000).toFixed(4));
}

export function calcScope3Partial(weightKg, quantity, destinationPort = 'Hamburg') {
  const distanceKm = { Hamburg: 12500, Rotterdam: 12200, Antwerp: 12300 };
  const dist = distanceKm[destinationPort] ?? 12500;
  const freightTco2 = (weightKg * quantity / 1000) * dist * 0.016 / 1000;
  return parseFloat(freightTco2.toFixed(4));
}

/**
 * computeEmissions — full scope 1+2+3 for a batch record
 */
export function computeEmissions({ weightKg, quantity, process, stateCode, destinationPort }) {
  return {
    scope1_tco2e:         calcScope1(weightKg, quantity, process),
    scope2_tco2e:         calcScope2(weightKg, quantity, process, stateCode),
    scope3_partial_tco2e: calcScope3Partial(weightKg, quantity, destinationPort),
    methodology: 'GHG Protocol Corporate Standard + IEA/CEA 2024 emission factors',
  };
}

/**
 * calculateEmissions — used by WhatsApp/camera pipeline
 * Accepts extracted ESG fields and returns total_co2e_kg + scope
 */
export function calculateEmissions(fields = {}) {
  const { transport_mode, distance_km, weight_kg, energy_kwh } = fields;

  // Scope 2 — electricity
  if (energy_kwh && energy_kwh > 0) {
    const co2e = parseFloat((energy_kwh * GRID_FACTOR).toFixed(2));
    return { total_co2e_kg: co2e, scope: 'scope_2', method: 'electricity_grid' };
  }

  // Scope 3 — transport
  if (distance_km && distance_km > 0) {
    const mode   = (transport_mode || 'road').toLowerCase();
    const factor = TRANSPORT_FACTORS[mode] ?? TRANSPORT_FACTORS.default;
    const wt     = (weight_kg || 1000) / 1000;           // convert kg → tonnes
    const co2e   = parseFloat((wt * distance_km * factor).toFixed(2));
    return { total_co2e_kg: co2e, scope: 'scope_3', method: `transport_${mode}` };
  }

  // Nothing to calculate
  return { total_co2e_kg: 0, scope: 'unknown', method: 'no_data' };
}
