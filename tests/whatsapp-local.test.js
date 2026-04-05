/**
 * Local WhatsApp pipeline tests — no API key needed
 * Run: node --experimental-vm-modules node_modules/.bin/jest tests/whatsapp-local.test.js
 * Or:  npm test
 */

import { classifyDocument, extractEsgFromText } from '../lib/pdf-extractor.js';
import { store } from '../lib/store.js';
import { calculateEmissions } from '../lib/emissions.js';

beforeEach(() => store.reset());

// ── Document classification ────────────────────────────────────────────────────
describe('classifyDocument', () => {
  test('invoice',          () => expect(classifyDocument('INV-ZAP-2026.pdf','')).toBe('invoice'));
  test('utility bill',     () => expect(classifyDocument('electricity_bill.pdf','units consumed 4250 kwh')).toBe('utility_bill'));
  test('salary slip',      () => expect(classifyDocument('salary_payslip.pdf','no. of employees 45')).toBe('salary_slip'));
  test('purchase order',   () => expect(classifyDocument('purchase_order.pdf','')).toBe('purchase_order'));
  test('delivery challan', () => expect(classifyDocument('delivery_challan.pdf','e-way bill')).toBe('delivery_challan'));
  test('unknown fallback', () => expect(classifyDocument('random.pdf','')).toBe('unknown'));
});

// ── ESG field extraction: Invoice ─────────────────────────────────────────────
describe('extractEsgFromText — invoice', () => {
  const text = `
    TAX INVOICE  INV-ZAP-2026-0847
    GSTIN: 27AABCZ1234F1Z5
    Grand Total: INR 23,02,180
    HSN Code: 7228.50
    Transport Mode: Road  Distance: 560 km  Fuel: Diesel
    Gross Weight: 1850 kg
    CBAM Applicable: Yes - Titanium/Steel
    ISO14001 Certificate: ENV-2024-PUN
  `;

  const fields = extractEsgFromText(text, 'invoice');

  test('extracts GSTIN',          () => expect(fields.supplier_gstin).toBe('27AABCZ1234F1Z5'));
  test('extracts grand total',    () => expect(fields.total_amount_inr).toBe(2302180));
  test('extracts HSN code',       () => expect(fields.hsn_codes).toContain('7228'));
  test('extracts distance',       () => expect(fields.distance_km).toBe(560));
  test('extracts transport mode', () => expect(fields.transport_mode).toBe('road'));
  test('extracts weight',         () => expect(fields.weight_kg).toBe(1850));
  test('detects CBAM',            () => expect(fields.cbam_applicable).toBe(true));
  test('detects ISO14001',        () => expect(fields.certifications).toContain('ISO14001'));
  test('env category set',        () => expect(fields.esg_categories).toContain('environmental'));
  test('gov category set',        () => expect(fields.esg_categories).toContain('governance'));
});

// ── ESG field extraction: Utility bill ────────────────────────────────────────
describe('extractEsgFromText — utility_bill', () => {
  const text = `
    ELECTRICITY BILL  Consumer No: 123456789
    Billing Period: March 2026
    Units Consumed: 4,250 kWh
    Water Consumption: 12.5 m3
  `;

  const fields = extractEsgFromText(text, 'utility_bill');

  test('extracts energy_kwh',     () => expect(fields.energy_kwh).toBe(4250));
  test('extracts billing period', () => expect(fields.billing_period).toMatch(/March 2026/i));
  test('env category set',        () => expect(fields.esg_categories).toContain('environmental'));
});

// ── ESG field extraction: Salary slip ─────────────────────────────────────────
describe('extractEsgFromText — salary_slip', () => {
  const text = `
    SALARY SLIP March 2026
    No. of Employees: 45
    Total Wages: INR 27,10,000
    Minimum Wage: Complied
    LTIR: 0.0
    EPF: 3,25,200
    SA8000 Certified
  `;

  const fields = extractEsgFromText(text, 'salary_slip');

  test('extracts employee_count', () => expect(fields.employee_count).toBe(45));
  test('extracts wage compliance',() => expect(fields.wage_compliant).toBe(true));
  test('extracts LTIR',           () => expect(fields.ltir).toBe(0.0));
  test('detects SA8000',          () => expect(fields.certifications).toContain('SA8000'));
  test('social category set',     () => expect(fields.esg_categories).toContain('social'));
});

// ── Emissions calculation ─────────────────────────────────────────────────────
describe('calculateEmissions', () => {
  test('road transport CO2e', () => {
    const em = calculateEmissions({ transport_mode: 'road', distance_km: 560, weight_kg: 1850 });
    expect(em.total_co2e_kg).toBeCloseTo(99.5, 0); // 0.096 * 560 * 1.85
    expect(em.scope).toBe('scope_3');
  });

  test('electricity CO2e', () => {
    const em = calculateEmissions({ energy_kwh: 4250 });
    expect(em.total_co2e_kg).toBeCloseTo(3485, 0); // 4250 * 0.82
    expect(em.scope).toBe('scope_2');
  });

  test('zero if no data', () => {
    const em = calculateEmissions({});
    expect(em.total_co2e_kg).toBe(0);
  });
});

// ── Store CRUD ────────────────────────────────────────────────────────────────
describe('store', () => {
  test('saves and retrieves wa_messages', () => {
    store.saveWaMessage({ message_id: 'MSG-001', from_phone: '+919988776655', message_type: 'document' });
    expect(store.getAllWaMessages()).toHaveLength(1);
  });

  test('saves and retrieves wa_esg_entries', () => {
    store.saveWaEsgEntry({ entry_id: 'ESG-E-001', esg_pillar: 'environmental', co2e_kg: 267.8 });
    store.saveWaEsgEntry({ entry_id: 'ESG-S-001', esg_pillar: 'social', employee_count: 45 });
    const entries = store.getAllWaEsgEntries();
    expect(entries).toHaveLength(2);
    const pillars = entries.map(e => e.esg_pillar);
    expect(pillars).toContain('environmental');
    expect(pillars).toContain('social');
  });

  test('stats counts all tables', () => {
    store.saveWaMessage({ message_id: 'X' });
    store.saveCameraReading({ reading_id: 'CAM-001', meter_type: 'energy', reading_value: 4250 });
    const s = store.stats();
    expect(s.wa_messages).toBe(1);
    expect(s.camera_readings).toBe(1);
  });
});
