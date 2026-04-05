/**
 * SupplyMind AI — Core Transform Tests
 */

import { classifyHS } from '../lib/hs-classifier.js';
import { computeEmissions } from '../lib/emissions.js';
import { validatePayload } from '../lib/validator.js';

describe('HS Code Classifier', () => {
  test('classifies titanium bracket as aerospace part', () => {
    const result = classifyHS('Titanium Structural Bracket A380 Fuselage', 'Ti-6Al-4V');
    expect(result.code).toBe('8803.30.00');
    expect(result.confidence).toBeGreaterThan(0.9);
    expect(result.cbam).toBe(false); // aerospace NOT in CBAM
  });

  test('classifies aluminium alloy component', () => {
    const result = classifyHS('Wing rib component', 'AL7075 aluminium alloy');
    expect(result.code).toBe('7616.99.10');
  });

  test('returns fallback for unknown product', () => {
    const result = classifyHS('Mystery part', '');
    expect(result.confidence).toBe(0.50);
  });
});

describe('Emission Calculator', () => {
  test('calculates scope1 for CNC machining', () => {
    const result = computeEmissions({
      weightKg: 0.847,
      quantity: 150,
      process: 'CNC Machining',
      stateCode: 'KA',
      destinationPort: 'Hamburg',
    });
    expect(result.scope1_tco2e).toBeCloseTo(0.356, 2);
    expect(result.scope2_tco2e).toBeGreaterThan(0);
    expect(result.scope3_partial_tco2e).toBeGreaterThan(0);
    expect(result.methodology).toContain('GHG Protocol');
  });
});

describe('Payload Validator', () => {
  test('passes a valid payload', () => {
    const payload = {
      supplier: { tax_id: '29AABCZ1234M1Z5', country_iso2: 'IN' },
      product: { description: 'Titanium Bracket', quantity: 150, weight_kg: 0.847 },
      financials: { unit_price_eur: 10.58 },
      logistics: { dispatch_date: '2026-04-12' },
    };
    const { valid, errors } = validatePayload(payload);
    expect(valid).toBe(true);
    expect(errors.length).toBe(0);
  });

  test('fails when required fields are missing', () => {
    const { valid, errors } = validatePayload({});
    expect(valid).toBe(false);
    expect(errors.length).toBeGreaterThan(0);
  });
});
