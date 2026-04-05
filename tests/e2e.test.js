/**
 * e2e.test.js — End-to-end validation suite
 * Tests every layer: store → seed → carbon engine → ESG scorer → merger → API
 *
 * Run: node --experimental-vm-modules node_modules/.bin/jest tests/e2e.test.js
 * Or:  npm test
 */

import { store }           from '../lib/store.js';
import { seedDummyData }   from '../lib/seed-dummy.js';
import { autoCalcCarbon }  from '../lib/carbon-engine.js';
import { calcESGScore }    from '../lib/esg-scorer.js';
import { mergeAndScore, mergeAllSuppliers } from '../lib/esg-merger.js';

// ──────────────────────────────────────────────────────────────────
beforeEach(() => store.reset());

// ── 1. Store layer ──────────────────────────────────────────────────────────
describe('Store', () => {
  test('saves and retrieves camera reading', () => {
    store.saveCameraReading({ reading_id: 'R1', supplier_id: 'S1', energy_kwh: 200 });
    expect(store.getAllCameraReadings()).toHaveLength(1);
    expect(store.getAllCameraReadings()[0].energy_kwh).toBe(200);
  });

  test('saves and retrieves supplier profile', () => {
    store.saveSupplierProfile('S1', { state_code: 'KA', solar_kwh_capacity: 100 });
    expect(store.getSupplierProfile('S1').solar_kwh_capacity).toBe(100);
  });

  test('merges supplier profile on update', () => {
    store.saveSupplierProfile('S1', { state_code: 'KA', solar_kwh_capacity: 100 });
    store.saveSupplierProfile('S1', { recycled_material_pct: 40 });
    const p = store.getSupplierProfile('S1');
    expect(p.solar_kwh_capacity).toBe(100);
    expect(p.recycled_material_pct).toBe(40);
  });

  test('reset clears all collections', () => {
    store.saveCameraReading({ reading_id: 'R1', supplier_id: 'S1' });
    store.reset();
    expect(store.getAllCameraReadings()).toHaveLength(0);
  });
});

// ── 2. Seed layer ──────────────────────────────────────────────────────────
describe('Seed', () => {
  test('seeds 3 suppliers with camera + WA data', () => {
    const r = seedDummyData();
    expect(r.seeded).toBe(true);
    expect(r.suppliers).toBe(3);
    expect(r.camera_readings).toBe(144); // 3 suppliers * 48 readings
    expect(r.wa_esg_entries).toBe(12);  // 3 * 4
  });

  test('is idempotent — second call skips', () => {
    seedDummyData();
    const r2 = seedDummyData();
    expect(r2.skipped).toBe(true);
  });
});

// ── 3. Carbon engine ─────────────────────────────────────────────────────────
describe('Carbon Engine', () => {
  const BASE = { weightKg: 250, quantity: 500, process: 'Garment Manufacturing', energyKwh: 3000, stateCode: 'KA' };

  test('calculates Scope 1/2/3 totals', () => {
    const c = autoCalcCarbon(BASE);
    expect(c.totals.total_tco2e).toBeGreaterThan(0);
    expect(c.scope1.total_tco2e).toBeGreaterThan(0);
    expect(c.scope2.total_tco2e).toBeGreaterThan(0);
    expect(c.scope3.total_tco2e).toBeGreaterThan(0);
  });

  test('solar reduces Scope 2 emissions', () => {
    const withoutSolar = autoCalcCarbon(BASE);
    const withSolar    = autoCalcCarbon({ ...BASE, solarKwh: 1500 });
    expect(withSolar.scope2.total_tco2e).toBeLessThan(withoutSolar.scope2.total_tco2e);
    expect(withSolar.green_inputs.solar_kwh).toBe(1500);
    expect(withSolar.green_inputs.reduction_pct).toBeGreaterThan(0);
  });

  test('recycled materials reduce Scope 1', () => {
    const without = autoCalcCarbon(BASE);
    const with50  = autoCalcCarbon({ ...BASE, recycledMaterialPct: 50 });
    expect(with50.scope1.total_tco2e).toBeLessThan(without.scope1.total_tco2e);
  });

  test('recycled water reduces Scope 3', () => {
    const without = autoCalcCarbon({ ...BASE, waterLitres: 5000 });
    const withRW  = autoCalcCarbon({ ...BASE, waterLitres: 5000, recycledWaterLitres: 3000 });
    expect(withRW.scope3.total_tco2e).toBeLessThan(without.scope3.total_tco2e);
  });

  test('CBAM not applicable for garments (HS 6109)', () => {
    const c = autoCalcCarbon({ ...BASE, hsCode: '6109' });
    expect(c.cbam.applicable).toBe(false);
    expect(c.cbam.cost_eur).toBe(0);
  });

  test('CBAM applicable for steel (HS 7208)', () => {
    const c = autoCalcCarbon({ ...BASE, hsCode: '7208' });
    expect(c.cbam.applicable).toBe(true);
    expect(c.cbam.cost_eur).toBeGreaterThan(0);
  });

  test('SBT alignment check — low intensity = aligned', () => {
    const c = autoCalcCarbon({ ...BASE, solarKwh: 2500, recycledMaterialPct: 80 });
    expect(typeof c.sbt.aligned).toBe('boolean');
  });

  test('intensities are numeric and non-negative', () => {
    const c = autoCalcCarbon(BASE);
    expect(c.intensities.per_kg_product).toBeGreaterThanOrEqual(0);
    expect(c.intensities.per_eur_revenue).toBeGreaterThanOrEqual(0);
  });
});

// ── 4. ESG Scorer ──────────────────────────────────────────────────────────
describe('ESG Scorer', () => {
  const camAgg = { energy_kwh: 9600, water_liters: 14400, waste_kg: 1440, worker_count: 30,
                   co2_ppm_sum: 28800, temperature_sum: 1344, anomalies: 3, count: 48,
                   co2_ppm_avg: 600, avg_temp_c: 28 };
  const waAgg  = { total_kwh: 3000, total_emissions: 400, doc_count: 4, verified_count: 3 };
  const carbon = autoCalcCarbon({ weightKg: 250, quantity: 500, energyKwh: 3000, stateCode: 'KA' });

  test('returns overall_score between 0 and 100', () => {
    const r = calcESGScore({ camAgg, waAgg, carbon });
    expect(r.overall_score).toBeGreaterThanOrEqual(0);
    expect(r.overall_score).toBeLessThanOrEqual(100);
  });

  test('returns E/S/G pillar scores', () => {
    const r = calcESGScore({ camAgg, waAgg, carbon });
    expect(r.pillars.environmental.score).toBeDefined();
    expect(r.pillars.social.score).toBeDefined();
    expect(r.pillars.governance.score).toBeDefined();
  });

  test('solar bonus increases E score', () => {
    const carbonNoSolar = autoCalcCarbon({ weightKg: 250, quantity: 500, energyKwh: 3000 });
    const carbonSolar   = autoCalcCarbon({ weightKg: 250, quantity: 500, energyKwh: 3000, solarKwh: 1500 });
    const r1 = calcESGScore({ camAgg, waAgg, carbon: carbonNoSolar });
    const r2 = calcESGScore({ camAgg, waAgg, carbon: carbonSolar });
    expect(r2.pillars.environmental.score).toBeGreaterThanOrEqual(r1.pillars.environmental.score);
  });

  test('band is one of A/B/C/D', () => {
    const r = calcESGScore({ camAgg, waAgg, carbon });
    expect(['A','B','C','D']).toContain(r.band);
  });

  test('flags is an array', () => {
    const r = calcESGScore({ camAgg, waAgg, carbon });
    expect(Array.isArray(r.flags)).toBe(true);
  });
});

// ── 5. E2E merger ──────────────────────────────────────────────────────────
describe('E2E Merger', () => {
  beforeEach(() => { store.reset(); seedDummyData(); });

  test('mergeAllSuppliers returns 3 reports', () => {
    const reports = mergeAllSuppliers();
    expect(reports).toHaveLength(3);
  });

  test('each report has esg_score, band, carbon, flags', () => {
    const reports = mergeAllSuppliers();
    for (const r of reports) {
      expect(r.esg_score).toBeGreaterThanOrEqual(0);
      expect(['A','B','C','D']).toContain(r.band);
      expect(r.carbon.totals.total_tco2e).toBeGreaterThan(0);
      expect(Array.isArray(r.flags)).toBe(true);
    }
  });

  test('SUP001 (green profile) scores higher than SUP003 (no green)', () => {
    const r1 = mergeAndScore('SUP001');
    const r3 = mergeAndScore('SUP003');
    expect(r1.esg_score).toBeGreaterThan(r3.esg_score);
  });

  test('SUP001 carbon reduction_pct > 0 (has solar + recycled)', () => {
    const r = mergeAndScore('SUP001');
    expect(r.carbon.green_inputs.reduction_pct).toBeGreaterThan(0);
  });

  test('SUP003 green_summary is empty (no green inputs)', () => {
    const r = mergeAndScore('SUP003');
    expect(r.carbon.green_inputs.summary.length).toBe(0);
  });

  test('data_sources reflects seeded counts', () => {
    const r = mergeAndScore('SUP001');
    expect(r.data_sources.camera_readings).toBe(48);
    expect(r.data_sources.whatsapp_docs).toBe(4);
  });
});

// ── 6. Data integrity ─────────────────────────────────────────────────────────
describe('Data Integrity', () => {
  beforeEach(() => { store.reset(); seedDummyData(); });

  test('no NaN values in carbon totals', () => {
    const r = mergeAndScore('SUP001');
    const { scope1_tco2e, scope2_tco2e, scope3_tco2e, total_tco2e } = r.carbon.totals;
    expect(isNaN(scope1_tco2e)).toBe(false);
    expect(isNaN(scope2_tco2e)).toBe(false);
    expect(isNaN(scope3_tco2e)).toBe(false);
    expect(isNaN(total_tco2e)).toBe(false);
  });

  test('esg_score is a finite number', () => {
    const r = mergeAndScore('SUP002');
    expect(Number.isFinite(r.esg_score)).toBe(true);
  });

  test('solar_pct is between 0 and 100', () => {
    const r = mergeAndScore('SUP001');
    expect(r.carbon.scope2.green_savings.solar_pct).toBeGreaterThanOrEqual(0);
    expect(r.carbon.scope2.green_savings.solar_pct).toBeLessThanOrEqual(100);
  });

  test('all suppliers have merged_at timestamp', () => {
    const reports = mergeAllSuppliers();
    for (const r of reports) {
      expect(r.merged_at).toBeTruthy();
      expect(new Date(r.merged_at).getTime()).not.toBeNaN();
    }
  });
});
