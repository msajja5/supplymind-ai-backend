/**
 * carbon-engine.js  v2
 * Full auto-carbon calculation with GREEN INPUT offsets:
 *   ☀️  Solar energy        → reduces Scope 2 (zero-carbon kWh)
 *   💧  Recycled water      → reduces Scope 3 water treatment
 *   ♻️  Recycled materials  → reduces Scope 1 process emissions
 *   💚  Renewable fuel      → reduces Scope 1 combustion
 *
 * Recalculates from scratch on every call — pass updated inputs to get new result.
 *
 * Standards: GHG Protocol Corporate Standard
 *            IEA/CEA 2024 (India grid), IPCC AR6
 *            CBAM (EU) 2023/956 @ €65/tCO2e
 *            SBTi 1.5°C sector pathways
 *            CSRD ESRS E1
 *            ISO 14064-1:2018
 */

// ── Grid emission factors (kgCO2e/kWh) — CEA 2024 ───────────────────────────
const GRID_KG_PER_KWH = {
  KA: 0.82, MH: 0.94, TN: 0.76, GJ: 1.01,
  DL: 0.88, RJ: 0.95, AP: 0.79, WB: 1.02,
  default: 0.88,
};

// Solar panel lifecycle factor (kgCO2e/kWh) — IPCC AR6 median
const SOLAR_LIFECYCLE_KG_PER_KWH = 0.041;

// ── Process Scope 1 factors (tCO2e/kg product) ──────────────────────────────
const PROCESS_SCOPE1 = {
  'Cotton Spinning':       0.0008, 'Weaving':               0.0006,
  'Dyeing & Finishing':    0.0022, 'Garment Manufacturing': 0.0012,
  'CNC Machining':         0.0028, 'Investment Casting':    0.0042,
  'Forging + Machining':   0.0031, 'Sheet Metal Forming':   0.0022,
  'Leather Tanning':       0.0035, 'Chemical Processing':   0.0055,
  'Food Processing':       0.0018, 'default':               0.0020,
};

// Recycled material Scope 1 reduction factor (% of virgin process emissions saved)
// e.g. recycled cotton saves 60% vs virgin cotton spinning
const RECYCLED_MATERIAL_SAVINGS = {
  'Cotton Spinning':       0.60, 'Garment Manufacturing': 0.45,
  'Sheet Metal Forming':   0.75, 'CNC Machining':         0.30,
  'default':               0.40,
};

// Energy intensity by process (kWh/kg product)
const PROCESS_KWH_PER_KG = {
  'Cotton Spinning': 2.5, 'Weaving': 1.8, 'Dyeing & Finishing': 4.2,
  'Garment Manufacturing': 1.2, 'CNC Machining': 3.8,
  'Investment Casting': 5.1, 'Forging + Machining': 3.2,
  'Sheet Metal Forming': 2.1, 'default': 2.5,
};

// Waste disposal factors (kgCO2e/kg)
const WASTE_FACTORS = {
  landfill: 0.58, incinerated: 1.12,
  recycled: 0.04, composted:   0.10, default: 0.40,
};

// Water (kgCO2e/m3 for municipal treatment)
const WATER_FACTOR_KG_PER_M3        = 0.344;
// Recycled/harvested water has ~85% lower footprint
const RECYCLED_WATER_FACTOR_KG_PER_M3 = 0.052;

// Transport (kgCO2e per tonne-km)
const TRANSPORT_FACTORS = {
  sea: 0.016, road: 0.096, air: 0.602, rail: 0.028, default: 0.016,
};

// CBAM
const CBAM_EUR_PER_TCO2E = 65;
const CBAM_HS_PREFIXES   = [
  '2507','2523','2601','2602','2603','2604','2605','2606','2607','2608',
  '2609','2610','2611','7201','7202','7203','7204','7205','7206','7207',
  '7208','7209','7210','7211','7212','7213','7214','7215','7216','7217',
  '7218','7219','7220','7221','7222','7223','7224','7225','7226','7227',
  '7228','7229','3102','3103','3104','3105','2804',
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const r4 = v => parseFloat(v.toFixed(4));
const r2 = v => parseFloat(v.toFixed(2));

export function isCBAMProduct(hsCode) {
  if (!hsCode) return false;
  return CBAM_HS_PREFIXES.some(p => String(hsCode).replace(/\./g,'').startsWith(p));
}

// ── Scope 1: Direct combustion + process ──────────────────────────────────────
export function calcScope1({
  weightKg = 0, quantity = 1, process = 'default',
  fuelLitres = 0, fuelType = 'diesel',
  recycledMaterialPct = 0,        // 0–100%: % of input that is recycled
}) {
  const baseFactor   = PROCESS_SCOPE1[process] ?? PROCESS_SCOPE1.default;
  const savingFactor = RECYCLED_MATERIAL_SAVINGS[process] ?? RECYCLED_MATERIAL_SAVINGS.default;
  const recycleFraction = Math.min(recycledMaterialPct / 100, 1);

  // Process emissions reduced by recycled content
  const processEmissions = weightKg * quantity * baseFactor * (1 - recycleFraction * savingFactor);

  // Fuel combustion (diesel=2.68, biodiesel=0.19, CNG=1.92 kgCO2e/litre)
  const FUEL_FACTORS = { diesel: 0.00268, biodiesel: 0.00019, cng: 0.00192, default: 0.00268 };
  const fuelFactor   = FUEL_FACTORS[fuelType] ?? FUEL_FACTORS.default;
  const fuelEmissions = fuelLitres * fuelFactor;

  const recycleSaving = weightKg * quantity * baseFactor * recycleFraction * savingFactor;

  return {
    process_tco2e:        r4(processEmissions),
    fuel_tco2e:           r4(fuelEmissions),
    total_tco2e:          r4(processEmissions + fuelEmissions),
    green_savings: {
      recycled_material_pct: recycledMaterialPct,
      saving_tco2e:          r4(recycleSaving),
      label: recycledMaterialPct > 0
        ? `♻️ ${recycledMaterialPct}% recycled input — saved ${r4(recycleSaving)} tCO2e`
        : null,
    },
    factor_used: baseFactor,
    method: 'GHG Protocol Scope 1 + IPCC AR6',
  };
}

// ── Scope 2: Purchased electricity (with solar offset) ──────────────────────
export function calcScope2({
  energyKwh = 0, stateCode = 'default',
  weightKg = 0, quantity = 1, process = 'default',
  solarKwh = 0,            // kWh generated by on-site solar
  solarExportKwh = 0,      // kWh exported back to grid (optional)
}) {
  const gridFactor  = GRID_KG_PER_KWH[stateCode] ?? GRID_KG_PER_KWH.default;

  // Total energy demand (measured or estimated)
  const totalKwh = energyKwh > 0
    ? energyKwh
    : (PROCESS_KWH_PER_KG[process] ?? PROCESS_KWH_PER_KG.default) * weightKg * quantity;

  // Solar covers part of demand — remaining drawn from grid
  const solarUsed    = Math.min(solarKwh, totalKwh);   // can't use more solar than demand
  const gridKwh      = Math.max(totalKwh - solarUsed, 0);

  // Grid emissions
  const gridTco2e    = (gridKwh * gridFactor) / 1000;

  // Solar lifecycle emissions (small but non-zero)
  const solarTco2e   = (solarUsed * SOLAR_LIFECYCLE_KG_PER_KWH) / 1000;

  // Net Scope 2
  const totalTco2e   = gridTco2e + solarTco2e;

  // Avoided emissions from solar
  const solarAvoided = (solarUsed * (gridFactor - SOLAR_LIFECYCLE_KG_PER_KWH)) / 1000;

  return {
    total_energy_kwh:  r2(totalKwh),
    grid_kwh:          r2(gridKwh),
    solar_kwh_used:    r2(solarUsed),
    grid_factor:       gridFactor,
    grid_tco2e:        r4(gridTco2e),
    solar_tco2e:       r4(solarTco2e),
    total_tco2e:       r4(totalTco2e),
    green_savings: {
      solar_pct:        totalKwh > 0 ? r2((solarUsed / totalKwh) * 100) : 0,
      avoided_tco2e:    r4(solarAvoided),
      label: solarKwh > 0
        ? `☀️ Solar covers ${r2((solarUsed/totalKwh)*100)}% — avoided ${r4(solarAvoided)} tCO2e`
        : null,
    },
    data_source: energyKwh > 0 ? 'measured' : 'estimated_from_process',
    method: 'GHG Protocol Scope 2 Location-Based + CEA 2024 + IPCC AR6 solar LCA',
  };
}

// ── Scope 3: Upstream + downstream ──────────────────────────────────────────────
export function calcScope3({
  weightKg = 0, quantity = 1,
  wasteKg = 0, wasteDisposal = 'default',
  waterLitres = 0,
  recycledWaterLitres = 0,        // harvested rainwater or recycled process water
  transportMode = 'sea', distanceKm = 0, destinationPort = 'Hamburg',
}) {
  // 3a. Freight
  const PORT_DISTANCES = { Hamburg: 12500, Rotterdam: 12200, Antwerp: 12300 };
  const dist         = distanceKm > 0 ? distanceKm : (PORT_DISTANCES[destinationPort] ?? 12500);
  const freightTco2e = ((weightKg * quantity) / 1000) * dist * TRANSPORT_FACTORS[transportMode] / 1000;

  // 3b. Waste disposal
  const wasteFactor  = WASTE_FACTORS[wasteDisposal] ?? WASTE_FACTORS.default;
  const wasteTco2e   = (wasteKg * wasteFactor) / 1000;

  // 3c. Water treatment — split between recycled and fresh
  const freshWater   = Math.max(waterLitres - recycledWaterLitres, 0);
  const freshTco2e   = ((freshWater   / 1000) * WATER_FACTOR_KG_PER_M3)       / 1000;
  const recycledTco2e= ((recycledWaterLitres / 1000) * RECYCLED_WATER_FACTOR_KG_PER_M3) / 1000;
  const waterTco2e   = freshTco2e + recycledTco2e;
  const waterSaving  = ((recycledWaterLitres / 1000) * (WATER_FACTOR_KG_PER_M3 - RECYCLED_WATER_FACTOR_KG_PER_M3)) / 1000;

  return {
    freight_tco2e:   r4(freightTco2e),
    waste_tco2e:     r4(wasteTco2e),
    water_tco2e:     r4(waterTco2e),
    total_tco2e:     r4(freightTco2e + wasteTco2e + waterTco2e),
    freight_km:      dist,
    transport_mode:  transportMode,
    green_savings: {
      recycled_water_litres: recycledWaterLitres,
      water_saving_tco2e:    r4(waterSaving),
      label: recycledWaterLitres > 0
        ? `💧 ${recycledWaterLitres}L recycled water — saved ${r4(waterSaving)} tCO2e`
        : null,
    },
    method: 'GHG Protocol Scope 3 Cat.1/4/5/9 + GLEC + ISO 14046 water footprint',
  };
}

// ── Master auto-calculate ────────────────────────────────────────────────────────────
/**
 * autoCalcCarbon(inputs)
 * Pass any combination of camera/WhatsApp/passport/green data.
 * Auto-selects best available source. Recalculates from scratch every call.
 *
 * GREEN INPUTS (all optional — auto-applied when provided):
 *   solarKwh             — on-site solar generated (kWh)
 *   recycledWaterLitres  — recycled/harvested water used (litres)
 *   recycledMaterialPct  — % recycled raw material input (0-100)
 *   fuelType             — 'diesel' | 'biodiesel' | 'cng'
 */
export function autoCalcCarbon(inputs = {}) {
  const {
    weightKg = 0, quantity = 1, process = 'default',
    energyKwh = 0, stateCode = 'KA',
    fuelLitres = 0, fuelType = 'diesel',
    wasteKg = 0,   wasteDisposal = 'default',
    waterLitres = 0,
    // ☀️ 💧 ♻️ Green inputs
    solarKwh = 0,
    recycledWaterLitres = 0,
    recycledMaterialPct = 0,
    // Logistics
    transportMode = 'sea', distanceKm = 0, destinationPort = 'Hamburg',
    // Product
    hsCode, unitPriceEur = 0,
  } = inputs;

  const s1 = calcScope1({ weightKg, quantity, process, fuelLitres, fuelType, recycledMaterialPct });
  const s2 = calcScope2({ energyKwh, stateCode, weightKg, quantity, process, solarKwh });
  const s3 = calcScope3({ weightKg, quantity, wasteKg, wasteDisposal, waterLitres, recycledWaterLitres, transportMode, distanceKm, destinationPort });

  const totalTco2e = r4(s1.total_tco2e + s2.total_tco2e + s3.total_tco2e);
  const totalKgProd = weightKg * quantity || 1;
  const totalEur    = unitPriceEur * quantity || 1;

  // Total green savings across all scopes
  const totalSavingTco2e = r4(
    (s1.green_savings.saving_tco2e    ?? 0) +
    (s2.green_savings.avoided_tco2e   ?? 0) +
    (s3.green_savings.water_saving_tco2e ?? 0)
  );
  const baselineTco2e = r4(totalTco2e + totalSavingTco2e);
  const greenReductionPct = baselineTco2e > 0
    ? r2((totalSavingTco2e / baselineTco2e) * 100)
    : 0;

  // Carbon intensities
  const intensities = {
    per_kg_product:  r4(totalTco2e * 1000 / totalKgProd),
    per_eur_revenue: r4(totalTco2e * 1000 / totalEur),
    per_kwh:         energyKwh > 0 ? r4((totalTco2e * 1000) / energyKwh) : null,
  };

  const cbamApplicable = isCBAMProduct(hsCode);
  const cbamCostEur    = cbamApplicable ? r2(totalTco2e * CBAM_EUR_PER_TCO2E) : 0;

  const SBT_THRESHOLD = 2.5;

  return {
    calculated_at: new Date().toISOString(),
    methodology:   'GHG Protocol + CEA 2024 + IPCC AR6 + GLEC + CBAM 2023/956 + ISO 14064',
    scope1: s1,
    scope2: s2,
    scope3: s3,
    totals: {
      scope1_tco2e:  s1.total_tco2e,
      scope2_tco2e:  s2.total_tco2e,
      scope3_tco2e:  s3.total_tco2e,
      total_tco2e:   totalTco2e,
      total_co2e_kg: r2(totalTco2e * 1000),
    },
    green_inputs: {
      solar_kwh:             solarKwh,
      recycled_water_litres: recycledWaterLitres,
      recycled_material_pct: recycledMaterialPct,
      fuel_type:             fuelType,
      total_saving_tco2e:    totalSavingTco2e,
      baseline_tco2e:        baselineTco2e,
      reduction_pct:         greenReductionPct,
      summary: [
        s1.green_savings.label,
        s2.green_savings.label,
        s3.green_savings.label,
      ].filter(Boolean),
    },
    intensities,
    cbam: {
      applicable:                cbamApplicable,
      hs_code:                   hsCode ?? null,
      cost_eur:                  cbamCostEur,
      carbon_price_eur_per_tco2e: CBAM_EUR_PER_TCO2E,
    },
    sbt: {
      aligned:             intensities.per_kg_product <= SBT_THRESHOLD,
      threshold_kg_per_kg: SBT_THRESHOLD,
      actual_kg_per_kg:    intensities.per_kg_product,
      pathway:             '1.5°C SBTi Apparel & Footwear sector',
    },
    csrd: {
      scope3_reportable:   totalTco2e > 0,
      material_category:   'Cat.1 Purchased goods + Cat.9 Downstream transport',
      disclosure_standard: 'ESRS E1',
    },
  };
}
