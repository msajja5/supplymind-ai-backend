#!/usr/bin/env node
/**
 * SupplyMind AI — Full Test Runner
 * Zero config, zero dependencies beyond Node 18
 * Run: node tests/run-all-tests.mjs
 */

import { classifyDocument, extractEsgFromText } from '../lib/pdf-extractor.js';
import { store } from '../lib/store.js';
import { calculateEmissions } from '../lib/emissions.js';
import http from 'http';

let pass = 0, fail = 0;
const results = [];

function test(label, fn) {
  try {
    fn();
    console.log(`  \x1b[32m✅ ${label}\x1b[0m`);
    pass++;
    results.push({ label, status: 'PASS' });
  } catch(e) {
    console.log(`  \x1b[31m❌ ${label}\x1b[0m`);
    console.log(`     → ${e.message}`);
    fail++;
    results.push({ label, status: 'FAIL', error: e.message });
  }
}

function assert(val, msg) {
  if (!val) throw new Error(msg || `Expected truthy, got: ${JSON.stringify(val)}`);
}

function eq(a, b) {
  if (a !== b) throw new Error(`Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

async function fetchLocal(path, method = 'GET', body = null) {
  return new Promise((resolve) => {
    const opts = {
      hostname: 'localhost', port: 3000,
      path, method,
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'sm_dev_local_key' },
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', (e) => resolve({ status: 0, error: e.message }));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function section(title) {
  console.log(`\n\x1b[36m─── ${title} ───\x1b[0m`);
}

console.log('\n\x1b[1m============================================================');
console.log('  SupplyMind AI — Full Test Suite');
console.log('  Node', process.version);
console.log('============================================================\x1b[0m');

store.reset();

// ────────────────────────────────────────────────────────────
section('A. Document Classification');
test('invoice by filename (INV- prefix)',  () => eq(classifyDocument('INV-ZAP-2026.pdf',''), 'invoice'));
test('invoice by text',                   () => eq(classifyDocument('doc.pdf','GSTIN tax invoice bill-to'), 'invoice'));
test('utility_bill by filename',          () => eq(classifyDocument('electricity_bill.pdf',''), 'utility_bill'));
test('utility_bill by text (kWh)',        () => eq(classifyDocument('doc.pdf','units consumed 4250 kwh'), 'utility_bill'));
test('salary_slip by filename',           () => eq(classifyDocument('salary_payslip.pdf',''), 'salary_slip'));
test('salary_slip by text',               () => eq(classifyDocument('doc.pdf','no. of employees 45 epf'), 'salary_slip'));
test('purchase_order by filename',        () => eq(classifyDocument('purchase_order.pdf',''), 'purchase_order'));
test('delivery_challan by filename',      () => eq(classifyDocument('delivery_challan.pdf',''), 'delivery_challan'));
test('delivery_challan by text',          () => eq(classifyDocument('doc.pdf','e-way bill lr no challan'), 'delivery_challan'));
test('unknown fallback',                  () => eq(classifyDocument('random.pdf',''), 'unknown'));

section('B. ESG Field Extraction — Invoice');
const invoiceText = `
  TAX INVOICE  INV-ZAP-2026-0847
  GSTIN: 27AABCZ1234F1Z5
  Grand Total: INR 23,02,180
  HSN Code: 7228.50
  Transport Mode: Road  Distance: 560 km  Fuel: Diesel
  Gross Weight: 1850 kg
  CBAM Applicable: Yes - Titanium Steel
  ISO14001 Certificate: ENV-2024-PUN
`;
const inv = extractEsgFromText(invoiceText, 'invoice');
test('extracts GSTIN',           () => eq(inv.supplier_gstin, '27AABCZ1234F1Z5'));
test('extracts grand total',     () => eq(inv.total_amount_inr, 2302180));
test('extracts distance_km',     () => eq(inv.distance_km, 560));
test('extracts transport_mode',  () => eq(inv.transport_mode, 'road'));
test('extracts weight_kg',       () => eq(inv.weight_kg, 1850));
test('detects CBAM (titanium)',  () => assert(inv.cbam_applicable));
test('detects ISO14001',         () => assert(inv.certifications.includes('ISO14001')));
test('env category set',         () => assert(inv.esg_categories.includes('environmental')));
test('gov category set',         () => assert(inv.esg_categories.includes('governance')));
test('confidence > 0.6',         () => assert(inv._confidence > 0.6));

section('C. ESG Field Extraction — Utility Bill');
const utilText = `
  ELECTRICITY BILL Consumer No: 123456789
  Billing Period: March 2026
  Units Consumed: 4,250 kWh
  Water Consumption: 12.5 m3
`;
const util = extractEsgFromText(utilText, 'utility_bill');
test('extracts energy_kwh',      () => eq(util.energy_kwh, 4250));
test('extracts billing_period',  () => assert(util.billing_period?.includes('March')));
test('env category set',         () => assert(util.esg_categories.includes('environmental')));

section('D. ESG Field Extraction — Salary Slip');
const salText = `
  SALARY SLIP March 2026
  No. of Employees: 45
  Total Wages: INR 27,10,000
  Minimum Wage: Complied
  LTIR: 0.0
  EPF: 3,25,200
  SA8000 Certified
`;
const sal = extractEsgFromText(salText, 'salary_slip');
test('extracts employee_count',  () => eq(sal.employee_count, 45));
test('wage_compliant = true',    () => assert(sal.wage_compliant === true));
test('extracts LTIR',            () => eq(sal.ltir, 0.0));
test('detects SA8000',           () => assert(sal.certifications.includes('SA8000')));
test('social category set',      () => assert(sal.esg_categories.includes('social')));

section('E. Emissions Calculation');
const emRoad = calculateEmissions({ transport_mode: 'road', distance_km: 560, weight_kg: 1850 });
test('road CO2e > 0',               () => assert(emRoad.total_co2e_kg > 0));
test('road scope = scope_3',        () => eq(emRoad.scope, 'scope_3'));
test('road CO2e ~99 kg',            () => assert(emRoad.total_co2e_kg > 50 && emRoad.total_co2e_kg < 200));
const emEnergy = calculateEmissions({ energy_kwh: 4250 });
test('electricity CO2e ~3485',      () => assert(emEnergy.total_co2e_kg > 3000 && emEnergy.total_co2e_kg < 4000));
test('electricity scope = scope_2', () => eq(emEnergy.scope, 'scope_2'));
const emEmpty = calculateEmissions({});
test('empty input = 0 CO2e',        () => eq(emEmpty.total_co2e_kg, 0));

section('F. In-Memory Store (all 7 tables)');
store.reset();
test('saves wa_message',         () => { store.saveWaMessage({ message_id: 'MSG-001' }); eq(store.getAllWaMessages().length, 1); });
test('saves wa_document',        () => { store.saveWaDocument({ document_id: 'DOC-001' }); eq(store.getAllWaDocuments().length, 1); });
test('updates wa_document',      () => { store.updateWaDocument('DOC-001', { status: 'processed' }); eq(store.getAllWaDocuments()[0].status, 'processed'); });
test('saves wa_extraction',      () => { store.saveWaExtraction({ extraction_id: 'EXT-001' }); eq(store.getAllWaExtractions().length, 1); });
test('saves wa_esg_entry E',     () => { store.saveWaEsgEntry({ entry_id: 'ESG-E-001', esg_pillar: 'environmental' }); });
test('saves wa_esg_entry S',     () => { store.saveWaEsgEntry({ entry_id: 'ESG-S-001', esg_pillar: 'social' }); });
test('saves wa_esg_entry G',     () => { store.saveWaEsgEntry({ entry_id: 'ESG-G-001', esg_pillar: 'governance' }); });
test('all 3 ESG pillars stored', () => { const p = store.getAllWaEsgEntries().map(e => e.esg_pillar); assert(p.includes('environmental') && p.includes('social') && p.includes('governance')); });
test('saves camera_reading',     () => { store.saveCameraReading({ reading_id: 'CAM-001', meter_type: 'energy', reading_value: 4250 }); eq(store.getAllCameraReadings().length, 1); });
test('saves passport',           () => { store.savePassport({ passport_id: 'PP-001', esg_score: 85 }); eq(store.countPassports(), 1); });
test('stats counts all tables',  () => { const s = store.stats(); assert(s.wa_messages >= 1 && s.wa_esg_entries >= 3 && s.camera_readings >= 1); });
test('reset clears all',         () => { store.reset(); const s = store.stats(); eq(Object.values(s).reduce((a,b)=>a+b,0), 0); });

section('G. Server API Tests (requires: node server.js in Terminal 1)');
const TS = Date.now();

const g1 = await fetchLocal('/api/health');
test('GET /api/health returns 200',          () => eq(g1.status, 200));
test('health.status = healthy',              () => eq(g1.body?.status, 'healthy'));

const g2 = await fetchLocal('/api/schema');
test('GET /api/schema returns 200',          () => eq(g2.status, 200));

const g3 = await fetchLocal('/api/whatsapp-status');
test('GET /api/whatsapp-status returns 200', () => eq(g3.status, 200));
test('whatsapp-status has tables key',       () => assert(g3.body?.tables != null));

const g4 = await fetchLocal('/api/ingest/whatsapp?hub.mode=subscribe&hub.verify_token=supplymind_verify_2026&hub.challenge=HELLO_SUPPLYMIND');
test('Webhook verify correct token',         () => assert(String(g4.body).includes('HELLO_SUPPLYMIND') || g4.status === 200));

const g5 = await fetchLocal('/api/ingest/whatsapp?hub.mode=subscribe&hub.verify_token=WRONG_TOKEN&hub.challenge=X');
test('Webhook verify wrong token → 403',    () => eq(g5.status, 403));

const waInv = await fetchLocal('/api/ingest/whatsapp', 'POST', {
  entry: [{ changes: [{ value: { messages: [{ id: `SIM-INV-${TS}`, from: '+919988776655', type: 'document', timestamp: `${TS}`, document: { id: 'FAKE-INV-001', mime_type: 'application/pdf', filename: 'invoice_zenith_april_2026.pdf' } }] } }] }]
});
test('POST invoice PDF → 200',               () => eq(waInv.status, 200));

const waUtil = await fetchLocal('/api/ingest/whatsapp', 'POST', {
  entry: [{ changes: [{ value: { messages: [{ id: `SIM-UTIL-${TS}`, from: '+919988776655', type: 'document', timestamp: `${TS}`, document: { id: 'FAKE-UTIL-001', mime_type: 'application/pdf', filename: 'electricity_bill_march_2026.pdf' } }] } }] }]
});
test('POST electricity bill → 200',           () => eq(waUtil.status, 200));

const waSal = await fetchLocal('/api/ingest/whatsapp', 'POST', {
  entry: [{ changes: [{ value: { messages: [{ id: `SIM-SAL-${TS}`, from: '+919988776655', type: 'document', timestamp: `${TS}`, document: { id: 'FAKE-SAL-001', mime_type: 'application/pdf', filename: 'salary_payslip_march_2026.pdf' } }] } }] }]
});
test('POST salary slip → 200',                () => eq(waSal.status, 200));

await new Promise(r => setTimeout(r, 500));

const status2 = await fetchLocal('/api/whatsapp-status');
test('3 wa_messages stored',                 () => assert(status2.body?.tables?.wa_messages >= 3));
test('ESG entries created',                  () => assert(status2.body?.tables?.wa_esg_entries >= 1));

const cam = await fetchLocal('/api/camera/upload', 'POST', {
  meter_type: 'energy', value: 4250, supplier_id: 'ZAP-001', factory_id: 'PUNE-01'
});
test('POST /api/camera/upload → 201',        () => assert(cam.status === 200 || cam.status === 201));
test('camera response has reading_id',        () => assert(cam.body?.reading_id != null));
test('camera CO2e calculated',                () => assert(cam.body?.co2e_kg > 0));

// /api/ingest is a BATCH endpoint — returns batch_id (not passport_id)
// passport is created in step 2: /api/transform
const ing = await fetchLocal('/api/ingest', 'POST', {
  supplier_id: 'ZAP-001', company_name: 'Zenith Aerospace',
  part_number: 'ZAP-TI-001', material: 'Titanium',
  quantity: 100, unit_price_inr: 12500
});
test('POST /api/ingest → 202 accepted',        () => assert(ing.status === 202 || ing.status === 200));
test('POST /api/ingest returns batch_id',     () => assert(ing.body?.batch_id != null));
test('POST /api/ingest success=true',         () => assert(ing.body?.success === true));

// Summary
const total = pass + fail;
const pct   = Math.round((pass/total)*100);
console.log(`\n\x1b[1m============================================================`);
console.log(`  RESULTS: ${pass} passed / ${fail} failed / ${total} total (${pct}%)`);
if (fail === 0) {
  console.log(`  \x1b[32m⭐ ALL TESTS PASSED — SupplyMind AI is ready for production!\x1b[0m`);
} else {
  console.log(`  \x1b[33m⚠️  ${fail} test(s) failed\x1b[0m`);
  results.filter(r => r.status === 'FAIL').forEach(r => console.log(`     • ${r.label}: ${r.error}`));
}
console.log('\x1b[0m============================================================\n');
process.exit(fail > 0 ? 1 : 0);
