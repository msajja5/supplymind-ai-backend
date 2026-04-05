/**
 * esg-scorer.js  v2
 * E/S/G pillar scoring with GREEN INPUT bonuses:
 *   ☀️ Solar usage        → +E bonus
 *   💧 Recycled water     → +E bonus
 *   ♻️ Recycled materials → +E bonus
 *
 * Recalculates from scratch on every call — just pass updated inputs.
 * Weights: E=50%, S=30%, G=20% (CSRD ESRS E1/S1/G1)
 */

const r1  = v => parseFloat(v.toFixed(1));
const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

// ── Industry benchmarks (Indian MSME exporters, IFC 2024) ──────────────────────
const BENCH = {
  energy_kwh_per_reading:   300,
  water_litres_per_reading: 700,
  waste_kg_per_reading:     40,
  co2_ppm_safe:             600,    // OSHA
  anomaly_rate_safe:        0.05,
  intensity_good:           2.5,    // SBTi 1.5°C
  intensity_bad:            8.0,
  temp_max_safe:            27,     // OSHA factory temp
};

// ── Green bonus calculator ──────────────────────────────────────────────────────
/**
 * calcGreenBonus — returns additive bonus (0–20 points) to Environmental score.
 * Each green input independently contributes, capped at 20 total.
 */
function calcGreenBonus({ carbon }) {
  const gi = carbon?.green_inputs ?? {};
  const bonuses = [];
  let total = 0;

  // ☀️ Solar: up to +8 points (100% solar = full 8)
  if (gi.solar_kwh > 0) {
    const solarPct = carbon?.scope2?.green_savings?.solar_pct ?? 0;
    const bonus    = r1((solarPct / 100) * 8);
    total += bonus;
    bonuses.push({ source: 'solar', bonus, label: `☀️ Solar ${solarPct}% → +${bonus} pts` });
  }

  // 💧 Recycled water: up to +6 points
  if (gi.recycled_water_litres > 0) {
    const totalWater = gi.recycled_water_litres + (carbon?.scope3?.water_tco2e ?? 0) * 1000 / 0.344 || 1;
    const waterPct   = Math.min((gi.recycled_water_litres / totalWater) * 100, 100);
    const bonus      = r1((waterPct / 100) * 6);
    total += bonus;
    bonuses.push({ source: 'recycled_water', bonus, label: `💧 Recycled water ${r1(waterPct)}% → +${bonus} pts` });
  }

  // ♻️ Recycled materials: up to +6 points
  if (gi.recycled_material_pct > 0) {
    const bonus = r1((gi.recycled_material_pct / 100) * 6);
    total += bonus;
    bonuses.push({ source: 'recycled_materials', bonus, label: `♻️ ${gi.recycled_material_pct}% recycled input → +${bonus} pts` });
  }

  return { total: r1(Math.min(total, 20)), breakdown: bonuses };
}

// ── E — Environmental ──────────────────────────────────────────────────────────────
function scoreEnvironmental({ camAgg, waAgg, carbon }) {
  const n = camAgg.count || 1;

  const avgEnergy = camAgg.energy_kwh / n;
  const energyE   = clamp(100 - ((avgEnergy - 120) / (BENCH.energy_kwh_per_reading - 120)) * 40);

  const avgWater  = camAgg.water_liters / n;
  const waterE    = clamp(100 - ((avgWater - 200)  / (BENCH.water_litres_per_reading - 200)) * 40);

  const avgWaste  = camAgg.waste_kg / n;
  const wasteE    = clamp(100 - ((avgWaste - 5)    / (BENCH.waste_kg_per_reading - 5)) * 40);

  const ci        = carbon?.intensities?.per_kg_product ?? BENCH.intensity_bad;
  const carbonE   = clamp(100 - ((ci - BENCH.intensity_good) / (BENCH.intensity_bad - BENCH.intensity_good)) * 100);

  const ppm       = camAgg.co2_ppm_avg ?? 500;
  const airE      = clamp(100 - ((ppm - 400) / (BENCH.co2_ppm_safe - 400)) * 50);

  // Base E score
  const baseE = (energyE * 0.25) + (waterE * 0.15) + (wasteE * 0.15) + (carbonE * 0.35) + (airE * 0.10);

  // Green bonus (additive, max 20 pts)
  const greenBonus = calcGreenBonus({ carbon });
  const E = clamp(r1(baseE + greenBonus.total));

  return {
    score: E,
    base_score:   r1(baseE),
    green_bonus:  greenBonus,
    sub: {
      energy_efficiency:  r1(energyE),
      water_efficiency:   r1(waterE),
      waste_management:   r1(wasteE),
      carbon_intensity:   r1(carbonE),
      air_quality:        r1(airE),
    },
    flags: [
      ...(ci > BENCH.intensity_bad       ? ['🔴 Carbon intensity above sector threshold'] : []),
      ...(avgWaste > 60                  ? ['⚠️ Waste generation above benchmark']        : []),
      ...(ppm > BENCH.co2_ppm_safe       ? ['🔴 CO2 ppm exceeds OSHA safe limit']          : []),
      ...(greenBonus.total === 0         ? ['💡 Add solar/recycled inputs to boost E score'] : []),
    ],
  };
}

// ── S — Social ──────────────────────────────────────────────────────────────────
function scoreSocial({ camAgg }) {
  const n           = camAgg.count || 1;
  const anomalyRate = camAgg.anomalies / n;
  const safetyS     = clamp(100 - (anomalyRate / BENCH.anomaly_rate_safe) * 30);

  const avgTemp = camAgg.avg_temp_c ?? 28;
  const tempS   = clamp(avgTemp <= BENCH.temp_max_safe ? 100 : 100 - ((avgTemp - BENCH.temp_max_safe) * 10));

  const peakWorkers = camAgg.worker_count ?? 20;
  const laborS      = clamp(peakWorkers >= 10 ? 80 : 50);

  const S = r1((safetyS * 0.50) + (tempS * 0.30) + (laborS * 0.20));
  return {
    score: S,
    sub: { worker_safety: r1(safetyS), temperature: r1(tempS), labor_conditions: r1(laborS) },
    flags: [
      ...(anomalyRate > 0.15 ? ['🔴 High anomaly rate — worker safety risk']      : []),
      ...(avgTemp > 32       ? ['⚠️ Factory temperature exceeds safe threshold'] : []),
    ],
  };
}

// ── G — Governance ──────────────────────────────────────────────────────────────
function scoreGovernance({ waAgg, passports }) {
  const docRatio   = Math.min((waAgg.doc_count ?? 0) / 5, 1);
  const docG       = clamp(docRatio * 100);
  const verifyRate = waAgg.doc_count > 0 ? waAgg.verified_count / waAgg.doc_count : 0;
  const verifyG    = clamp(verifyRate * 100);
  const passportG  = passports.length > 0 ? 90 : 30;
  const freshnessG = 80;

  const G = r1((docG * 0.30) + (verifyG * 0.30) + (passportG * 0.25) + (freshnessG * 0.15));
  return {
    score: G,
    sub: { doc_completeness: r1(docG), verification_rate: r1(verifyG), passport_issuance: r1(passportG), data_freshness: r1(freshnessG) },
    flags: [
      ...(waAgg.doc_count === 0            ? ['🔴 No documents submitted']              : []),
      ...(passports.length === 0           ? ['⚠️ No ESG passport issued yet']           : []),
      ...(verifyRate < 0.5 && waAgg.doc_count > 0 ? ['⚠️ <50% documents verified']     : []),
    ],
  };
}

// ── Band ───────────────────────────────────────────────────────────────────────────
function getBand(score) {
  if (score >= 80) return { band: 'A', label: 'Excellent — EU ready',  audit_ready: true,  csrd_compliant: true  };
  if (score >= 65) return { band: 'B', label: 'Good — minor gaps',     audit_ready: true,  csrd_compliant: false };
  if (score >= 50) return { band: 'C', label: 'Moderate — needs work', audit_ready: false, csrd_compliant: false };
  return               { band: 'D', label: 'Poor — not audit ready', audit_ready: false, csrd_compliant: false };
}

// ── Master scorer ────────────────────────────────────────────────────────────────
export function calcESGScore({ camAgg, waAgg, carbon, passports = [] }) {
  const n = camAgg.count || 1;
  const enriched = {
    ...camAgg,
    avg_temp_c:  camAgg.avg_temp_c  ?? (camAgg.temperature_sum ? camAgg.temperature_sum / n : 28),
    co2_ppm_avg: camAgg.co2_ppm_avg ?? 500,
  };

  const E = scoreEnvironmental({ camAgg: enriched, waAgg, carbon });
  const S = scoreSocial({ camAgg: enriched });
  const G = scoreGovernance({ waAgg, passports });

  // CSRD weighting
  const overall = clamp(r1((E.score * 0.50) + (S.score * 0.30) + (G.score * 0.20)));
  const band    = getBand(overall);

  return {
    overall_score:  overall,
    pillars: { environmental: E, social: S, governance: G },
    band:           band.band,
    label:          band.label,
    audit_ready:    band.audit_ready,
    csrd_compliant: band.csrd_compliant,
    flags:          [...E.flags, ...S.flags, ...G.flags],
    green_summary:  E.green_bonus.breakdown,
    scored_at:      new Date().toISOString(),
    weights:        { E: '50%', S: '30%', G: '20%', standard: 'CSRD ESRS E1/S1/G1' },
  };
}
