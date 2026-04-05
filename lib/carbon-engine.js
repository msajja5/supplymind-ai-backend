/**
 * carbon-engine.js
 * Auto-calculates full carbon footprint from any available data source:
 *   - Camera readings  (energy_kwh, co2_sensor_ppm, waste_kg)
 *   - WhatsApp entries (electricity bills, water, waste manifests)
 *   - Passport records (product weight, logistics)
 *
 * Standards: GHG Protocol Corporate Standard
 *            IEA/CEA 2024 grid factors
 *            CBAM Regulation (EU) 2023/956
 *            CSRD ESRS E1
 */

// ── Emission factors ──────────────────────────────────────────────────────────

// India state-level grid intensity (kgCO2e/kWh) — CEA 2024
const GRID_KG_PER_KWH = {
  KA: 0.82, MH: 0.94, TN: 0.76, GJ: 1.01,
  DL: 0.88, RJ: 0.95, AP: 0.79, WB: 1.02,
  default: 0.88,
};

// Manufacturing process Scope 1 factors (tCO2e/kg product)
const PROCESS_SCOPE1 = {
  'Cotton Spinning':          0.0008,
  'Weaving':                  0.0006,
  'Dyeing & Finishing':       0.0022,
  'Garment Manufacturing':    0.0012,
  'CNC Machining':            0.0028,
  'Investment Casting':       0.0042,
  'Forging + Machining':      0.0031,
  'Sheet Metal Forming':      0.0022,
  'Leather Tanning':          0.0035,
  'Chemical Processing':      0.0055,
  'Food Processing':          0.0018,
  'default':                  0.0020,
};

// Energy intensity by process (kWh/kg product)
const PROCESS_KWH_PER_KG = {
  'Cotton Spinning':       2.5,  'Weaving': 1.8,
  'Dyeing & Finishing':    4.2,  'Garment Manufacturing': 1.2,
  'CNC Machining':         3.8,  'Investment Casting': 5.1,
  'Forging + Machining':   3.2,  'Sheet Metal Forming': 2.1,
  'default':               2.5,
};

// Waste emission factors (kgCO2e/kg waste) by disposal type
const WASTE_FACTORS = {
  landfill:    0.58,
  incinerated: 1.12,
  recycled:    0.04,
  composted:   0.10,
  default:     0.40,
};

// Water treatment emission factor (kgCO2e/m3)
const WATER_FACTOR_KG_PER_M3 = 0.344;

// Transport (kgCO2e per tonne-km)
const TRANSPORT_FACTORS = {
  sea: 0.016, road: 0.096, air: 0.602, rail: 0.028, default: 0.016,
};

// EU CBAM carbon price (EUR/tCO2e) — 2024 average
const CBAM_EUR_PER_TCO2E = 65;

// HS codes subject to CBAM Phase 1
const CBAM_HS_PREFIXES = ['2507','2523','2601','2602','2603','2604','2605',
  '2606','2607','2608','2609','2610','2611','7201','7202','7203','7204',
  '7205','7206','7207','7208','7209','7210','7211','7212','7213','7214',
  '7215','7216','7217','7218','7219','7220','7221','7222','7223','7224',
  '7225','7226','7227','7228','7229','3102','3103','3104','3105','2804'];

// ── Helper ───────────────────────────────────────────────────────────────────

const r4 = v => parseFloat(v.toFixed(4));
const r2 = v => parseFloat(v.toFixed(2));

export function isCBAMProduct(hsCode) {
  if (!hsCode) return false;
  const hs = String(hsCode).replace(/\./g, '');
  return CBAM_HS_PREFIXES.some(p => hs.startsWith(p));
}

// ── Scope 1: Direct combustion + process emissions ──────────────────────────────

export function calcScope1({ weightKg = 0, quantity = 1, process = 'default', fuelLitres = 0 }) {
  const processFactor = PROCESS_SCOPE1[process] ?? PROCESS_SCOPE1.default;
  const processEmissions = weightKg * quantity * processFactor;           // tCO2e
  const fuelEmissions    = fuelLitres * 0.00268;                          // diesel: 2.68 kgCO2e/litre
  return {
    process_tco2e: r4(processEmissions),
    fuel_tco2e:    r4(fuelEmissions),
    total_tco2e:   r4(processEmissions + fuelEmissions),
    factor_used:   processFactor,
    method:        'GHG Protocol Scope 1 + IPCC AR6',
  };
}

// ── Scope 2: Purchased electricity ─────────────────────────────────────────────────

export function calcScope2({ energyKwh = 0, stateCode = 'default', weightKg = 0, quantity = 1, process = 'default' }) {
  const gridFactor = GRID_KG_PER_KWH[stateCode] ?? GRID_KG_PER_KWH.default;

  // Use measured energy if available, else estimate from process
  const kwh = energyKwh > 0
    ? energyKwh
    : (PROCESS_KWH_PER_KG[process] ?? PROCESS_KWH_PER_KG.default) * weightKg * quantity;

  const tco2e = (kwh * gridFactor) / 1000;   // kgCO2e → tCO2e
  return {
    energy_kwh:    r2(kwh),
    grid_factor:   gridFactor,
    total_tco2e:   r4(tco2e),
    data_source:   energyKwh > 0 ? 'measured' : 'estimated_from_process',
    method:        'GHG Protocol Scope 2 Location-Based + CEA 2024',
  };
}

// ── Scope 3: Upstream + downstream ───────────────────────────────────────────────

export function calcScope3({
  weightKg = 0, quantity = 1,
  wasteKg = 0, wasteDisposal = 'default',
  waterLitres = 0,
  transportMode = 'sea', distanceKm = 0, destinationPort = 'Hamburg',
}) {
  // 3a. Freight transport
  const PORT_DISTANCES = { Hamburg: 12500, Rotterdam: 12200, Antwerp: 12300 };
  const dist = distanceKm > 0 ? distanceKm : (PORT_DISTANCES[destinationPort] ?? 12500);
  const freightTco2e = ((weightKg * quantity) / 1000) * dist * TRANSPORT_FACTORS[transportMode] / 1000;

  // 3b. Waste disposal
  const wasteFactor  = WASTE_FACTORS[wasteDisposal] ?? WASTE_FACTORS.default;
  const wasteTco2e   = (wasteKg * wasteFactor) / 1000;

  // 3c. Water treatment
  const waterTco2e   = ((waterLitres / 1000) * WATER_FACTOR_KG_PER_M3) / 1000;

  return {
    freight_tco2e:  r4(freightTco2e),
    waste_tco2e:    r4(wasteTco2e),
    water_tco2e:    r4(waterTco2e),
    total_tco2e:    r4(freightTco2e + wasteTco2e + waterTco2e),
    freight_km:     dist,
    transport_mode: transportMode,
    method:         'GHG Protocol Scope 3 Cat.1/4/5/9 + GLEC Framework',
  };
}

// ── Master auto-calculate ────────────────────────────────────────────────────────────
/**
 * autoCalcCarbon(inputs)
 * Accepts any combination of camera/WhatsApp/passport data.
 * Auto-selects best available data for each scope.
 * Returns full carbon breakdown + intensity ratios + CBAM cost.
 */
export function autoCalcCarbon(inputs = {}) {
  const {
    // Product
    weightKg = 0, quantity = 1, process,
    // Energy (camera or WhatsApp bill)
    energyKwh = 0, stateCode = 'KA',
    // Fuel (Scope 1 direct)
    fuelLitres = 0,
    // Waste (camera or manifest)
    wasteKg = 0, wasteDisposal = 'default',
    // Water (camera or invoice)
    waterLitres = 0,
    // Logistics
    transportMode = 'sea', distanceKm = 0, destinationPort = 'Hamburg',
    // Product metadata
    hsCode, unitPriceEur = 0,
  } = inputs;

  const s1 = calcScope1({ weightKg, quantity, process, fuelLitres });
  const s2 = calcScope2({ energyKwh, stateCode, weightKg, quantity, process });
  const s3 = calcScope3({ weightKg, quantity, wasteKg, wasteDisposal, waterLitres, transportMode, distanceKm, destinationPort });

  const totalTco2e = r4(s1.total_tco2e + s2.total_tco2e + s3.total_tco2e);
  const totalKg    = weightKg * quantity || 1;
  const totalEur   = unitPriceEur * quantity || 1;

  // CBAM applicability & cost
  const cbamApplicable = isCBAMProduct(hsCode);
  const cbamCostEur    = cbamApplicable ? r2(totalTco2e * CBAM_EUR_PER_TCO2E) : 0;

  // Carbon intensities
  const intensities = {
    per_kg_product:   r4(totalTco2e * 1000 / totalKg),    // kgCO2e/kg
    per_eur_revenue:  r4(totalTco2e * 1000 / totalEur),   // kgCO2e/EUR
    per_kwh:          energyKwh > 0 ? r4((totalTco2e * 1000) / energyKwh) : null,
  };

  // Science-Based Target alignment check (1.5°C pathway: <2.5 kgCO2e/kg for textiles)
  const SBT_THRESHOLD_KG_PER_KG = 2.5;
  const sbtAligned = intensities.per_kg_product <= SBT_THRESHOLD_KG_PER_KG;

  return {
    calculated_at:   new Date().toISOString(),
    methodology:     'GHG Protocol + IEA/CEA 2024 + GLEC + CBAM 2023/956',
    scope1:          s1,
    scope2:          s2,
    scope3:          s3,
    totals: {
      scope1_tco2e:  s1.total_tco2e,
      scope2_tco2e:  s2.total_tco2e,
      scope3_tco2e:  s3.total_tco2e,
      total_tco2e:   totalTco2e,
      total_co2e_kg: r2(totalTco2e * 1000),
    },
    intensities,
    cbam: {
      applicable:      cbamApplicable,
      hs_code:         hsCode ?? null,
      cost_eur:        cbamCostEur,
      carbon_price_eur_per_tco2e: CBAM_EUR_PER_TCO2E,
    },
    sbt: {
      aligned:         sbtAligned,
      threshold_kg_per_kg: SBT_THRESHOLD_KG_PER_KG,
      actual_kg_per_kg:    intensities.per_kg_product,
      pathway:         '1.5°C SBTi Apparel & Footwear sector',
    },
    csrd: {
      scope3_reportable: totalTco2e > 0,
      material_category: 'Cat.1 Purchased goods + Cat.9 Downstream transport',
      disclosure_standard: 'ESRS E1',
    },
  };
}
