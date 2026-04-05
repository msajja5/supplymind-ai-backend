/**
 * esg-scorer.js
 * Pillar-level ESG scoring: Environmental (E), Social (S), Governance (G)
 * Auto-calculates from merged camera + WhatsApp + carbon data.
 *
 * Output: esg_score (0-100), pillar scores E/S/G, band, audit_ready, flags
 */

const r1 = v => parseFloat(v.toFixed(1));
const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

// ── Benchmarks (industry average for Indian MSME exporters) ──────────────────────
const BENCH = {
  energy_kwh_per_reading:  300,   // avg per camera cycle
  water_litres_per_reading: 700,
  waste_kg_per_reading:     40,
  co2_ppm_safe:            600,   // OSHA safe threshold
  anomaly_rate_safe:       0.05,  // 5%
  intensity_good:          2.5,   // kgCO2e/kg product (SBT 1.5°C)
  intensity_bad:           8.0,
};

// ── E — Environmental ───────────────────────────────────────────────────────────────
function scoreEnvironmental({ camAgg, waAgg, carbon }) {
  const n = camAgg.count || 1;

  // Energy efficiency (lower = better)
  const avgEnergy = camAgg.energy_kwh / n;
  const energyE   = clamp(100 - ((avgEnergy - 120) / (BENCH.energy_kwh_per_reading - 120)) * 40);

  // Water efficiency
  const avgWater  = camAgg.water_liters / n;
  const waterE    = clamp(100 - ((avgWater - 200) / (BENCH.water_litres_per_reading - 200)) * 40);

  // Waste management
  const avgWaste  = camAgg.waste_kg / n;
  const wasteE    = clamp(100 - ((avgWaste - 5) / (BENCH.waste_kg_per_reading - 5)) * 40);

  // Carbon intensity vs SBT benchmark
  const ci        = carbon?.intensities?.per_kg_product ?? BENCH.intensity_bad;
  const carbonE   = clamp(100 - ((ci - BENCH.intensity_good) / (BENCH.intensity_bad - BENCH.intensity_good)) * 100);

  // CO2 air quality (sensor ppm)
  const ppm       = camAgg.co2_ppm_avg ?? 500;
  const airE      = clamp(100 - ((ppm - 400) / (BENCH.co2_ppm_safe - 400)) * 50);

  const E = r1((energyE * 0.25) + (waterE * 0.15) + (wasteE * 0.15) + (carbonE * 0.35) + (airE * 0.10));

  return {
    score:    E,
    sub: {
      energy_efficiency:  r1(energyE),
      water_efficiency:   r1(waterE),
      waste_management:   r1(wasteE),
      carbon_intensity:   r1(carbonE),
      air_quality:        r1(airE),
    },
    flags: [
      ...(ci > BENCH.intensity_bad ? ['🔴 Carbon intensity above sector threshold'] : []),
      ...(avgWaste > 60            ? ['⚠️ Waste generation above benchmark']        : []),
      ...(ppm > BENCH.co2_ppm_safe ? ['🔴 CO2 concentration exceeds OSHA safe limit'] : []),
    ],
  };
}

// ── S — Social ──────────────────────────────────────────────────────────────────
function scoreSocial({ camAgg }) {
  const n = camAgg.count || 1;

  // Worker safety (anomaly rate)
  const anomalyRate = camAgg.anomalies / n;
  const safetyS     = clamp(100 - (anomalyRate / BENCH.anomaly_rate_safe) * 30);

  // Temperature compliance (OSHA: 18-27°C for workers)
  const avgTemp = camAgg.avg_temp_c ?? 28;
  const tempS   = clamp(avgTemp <= 27 ? 100 : 100 - ((avgTemp - 27) * 10));

  // Worker density (proxy for fair labor conditions)
  const peakWorkers = camAgg.worker_count ?? 20;
  const laborS      = clamp(peakWorkers >= 10 ? 80 : 50);

  const S = r1((safetyS * 0.50) + (tempS * 0.30) + (laborS * 0.20));

  return {
    score: S,
    sub: {
      worker_safety:    r1(safetyS),
      temperature:      r1(tempS),
      labor_conditions: r1(laborS),
    },
    flags: [
      ...(anomalyRate > 0.15 ? ['🔴 High anomaly rate — worker safety risk'] : []),
      ...(avgTemp > 32       ? ['⚠️ Factory temperature exceeds safe threshold'] : []),
    ],
  };
}

// ── G — Governance ───────────────────────────────────────────────────────────────
function scoreGovernance({ waAgg, passports }) {
  // Document completeness
  const docRatio   = waAgg.doc_count > 0 ? Math.min(waAgg.doc_count / 5, 1) : 0;
  const docG       = clamp(docRatio * 100);

  // Verification rate
  const verifyRate = waAgg.doc_count > 0 ? waAgg.verified_count / waAgg.doc_count : 0;
  const verifyG    = clamp(verifyRate * 100);

  // Passport issuance (digital traceability)
  const passportG  = passports.length > 0 ? 90 : 30;

  // Data freshness (most recent reading < 24h = 100, >72h = 50)
  const freshnessG = 80; // default; real impl checks timestamps

  const G = r1((docG * 0.30) + (verifyG * 0.30) + (passportG * 0.25) + (freshnessG * 0.15));

  return {
    score: G,
    sub: {
      doc_completeness:   r1(docG),
      verification_rate:  r1(verifyG),
      passport_issuance:  r1(passportG),
      data_freshness:     r1(freshnessG),
    },
    flags: [
      ...(waAgg.doc_count === 0 ? ['🔴 No documents submitted — governance score penalised'] : []),
      ...(passports.length === 0 ? ['⚠️ No ESG passport issued yet'] : []),
      ...(verifyRate < 0.5 && waAgg.doc_count > 0 ? ['⚠️ Less than 50% documents verified'] : []),
    ],
  };
}

// ── Band + audit status ────────────────────────────────────────────────────────────
function getBand(score) {
  if (score >= 80) return { band: 'A', label: 'Excellent — EU ready',  audit_ready: true,  csrd_compliant: true  };
  if (score >= 65) return { band: 'B', label: 'Good — minor gaps',     audit_ready: true,  csrd_compliant: false };
  if (score >= 50) return { band: 'C', label: 'Moderate — needs work', audit_ready: false, csrd_compliant: false };
  return               { band: 'D', label: 'Poor — not audit ready', audit_ready: false, csrd_compliant: false };
}

// ── Master ESG scorer ────────────────────────────────────────────────────────────
/**
 * calcESGScore({ camAgg, waAgg, carbon, passports })
 * Returns full E/S/G breakdown + overall score + audit status.
 */
export function calcESGScore({ camAgg, waAgg, carbon, passports = [] }) {
  // Enrich camAgg with derived averages
  const n = camAgg.count || 1;
  const enriched = {
    ...camAgg,
    avg_temp_c:  camAgg.avg_temp_c ?? camAgg.temperature_sum ? camAgg.temperature_sum / n : 28,
    co2_ppm_avg: camAgg.co2_ppm_avg ?? 500,
  };

  const E = scoreEnvironmental({ camAgg: enriched, waAgg, carbon });
  const S = scoreSocial({ camAgg: enriched });
  const G = scoreGovernance({ waAgg, passports });

  // Weighted overall: E=50%, S=30%, G=20% (CSRD weighting)
  const overall = r1((E.score * 0.50) + (S.score * 0.30) + (G.score * 0.20));
  const band    = getBand(overall);

  const allFlags = [...E.flags, ...S.flags, ...G.flags];

  return {
    overall_score:   overall,
    pillars: {
      environmental: E,
      social:        S,
      governance:    G,
    },
    band:            band.band,
    label:           band.label,
    audit_ready:     band.audit_ready,
    csrd_compliant:  band.csrd_compliant,
    flags:           allFlags,
    scored_at:       new Date().toISOString(),
    weights:         { E: '50%', S: '30%', G: '20%', standard: 'CSRD ESRS E1/S1/G1' },
  };
}
