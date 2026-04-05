/**
 * PDF / Document ESG Extractor
 * No API key needed — pure regex + heuristics
 */

// ── Document type classifier ───────────────────────────────────────────────────
export function classifyDocument(filename = '', text = '') {
  const s = (filename + ' ' + text).toLowerCase();
  // Order matters: more specific patterns first
  if (/delivery.?challan|challan|e.?way.?bill|eway|lorry.?receipt|lr.?no/i.test(s)) return 'delivery_challan';
  if (/purchase.?order|p\.?o\.?\s*no|po.?ref/i.test(s))                            return 'purchase_order';
  if (/salary|payslip|pay.?slip|wage|epf|esi/i.test(s))                             return 'salary_slip';
  if (/electricity|utility|msedcl|bescom|tpddl|kwh|unit.?consumed/i.test(s))       return 'utility_bill';
  // Invoice last — broadest pattern, catches INV- prefix filenames too
  if (/^inv[-_]|invoice|inv.?no|gstin|igst|cgst|sgst|bill.?to|tax.?invoice/i.test(s)) return 'invoice';
  return 'unknown';
}

// ── Main extractor ──────────────────────────────────────────────────────────
export function extractEsgFromText(text = '', docType = 'unknown') {
  const fields = { document_type: docType, _confidence: 0.5 };
  const t = text;

  const gstinMatch = t.match(/GSTIN[:\s]*([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1})/i);
  if (gstinMatch) { fields.supplier_gstin = gstinMatch[1]; fields._confidence += 0.1; }

  const grandTotalMatch = t.match(/grand.?total[:\s]*(?:INR|Rs\.?)?[\s]*([\d,]+(?:\.\d{1,2})?)/i);
  if (grandTotalMatch) fields.total_amount_inr = parseFloat(grandTotalMatch[1].replace(/,/g,''));

  const invoiceNoMatch = t.match(/inv(?:oice)?.?no[.:\s]*([A-Z0-9\-\/]+)/i);
  if (invoiceNoMatch) fields.invoice_number = invoiceNoMatch[1].trim();

  const hsnMatches = [...t.matchAll(/(?:HSN|hs.?code)[:\s]*([0-9]{4,8})/gi)];
  if (hsnMatches.length) {
    fields.hsn_codes = [...new Set(hsnMatches.map(m => m[1]))];
    fields._confidence += 0.05;
  }

  const cbamMaterials = ['titanium','steel','aluminium','aluminum','iron','cement','fertiliser','electricity'];
  fields.cbam_applicable = cbamMaterials.some(m => new RegExp(m,'i').test(t));
  if (fields.cbam_applicable) fields._confidence += 0.05;

  const distMatch   = t.match(/distance[:\s]*([\d,]+)\s*km/i);
  const modeMatch   = t.match(/transport(?:.?mode)?[:\s]*(road|rail|air|sea|truck|ship)/i);
  const weightMatch = t.match(/(?:gross.?weight|total.?weight)[:\s]*([\d,]+(?:\.\d+)?)\s*kg/i);
  const fuelMatch   = t.match(/fuel[:\s]*(diesel|petrol|cng|electric|lng)/i);

  if (distMatch)   { fields.distance_km    = parseFloat(distMatch[1].replace(/,/,'')); fields._confidence += 0.1; }
  if (modeMatch)   { fields.transport_mode  = modeMatch[1].toLowerCase(); }
  if (weightMatch) { fields.weight_kg       = parseFloat(weightMatch[1].replace(/,/,'')); }
  if (fuelMatch)   { fields.fuel_type       = fuelMatch[1].toLowerCase(); }

  const kwhMatch = t.match(/(?:units.?consumed|energy.?consumed|kwh)[:\s]*([\d,]+(?:\.\d+)?)/i);
  if (kwhMatch) { fields.energy_kwh = parseFloat(kwhMatch[1].replace(/,/,'')); fields._confidence += 0.15; }

  const waterMatch = t.match(/water.?consumption[:\s]*([\d,]+(?:\.\d+)?)\s*m3/i);
  if (waterMatch) fields.water_m3 = parseFloat(waterMatch[1].replace(/,/,''));

  const billingPeriodMatch = t.match(/billing.?period[:\s]*([A-Za-z]+\s*\d{4})/i);
  if (billingPeriodMatch) fields.billing_period = billingPeriodMatch[1].trim();

  const empMatch  = t.match(/no\.?.?of.?employees[:\s]*([\d]+)/i);
  const wageMatch = t.match(/(?:total.?wages|gross.?salary|net.?pay)[:\s]*(?:INR|Rs\.?)?[\s]*([\d,]+)/i);
  const mwMatch   = t.match(/minimum.?wage[:\s]*(complied|yes|no|compliant)/i);
  const lnMatch   = t.match(/(?:LTIR|lost.?time.?injury)[:\s]*([\d.]+)/i);

  if (empMatch)  { fields.employee_count = parseInt(empMatch[1]); fields._confidence += 0.1; }
  if (wageMatch) { fields.total_wages    = parseFloat(wageMatch[1].replace(/,/,'')); }
  if (mwMatch)   { fields.wage_compliant = /complied|yes|compliant/i.test(mwMatch[1]); }
  if (lnMatch)   { fields.ltir           = parseFloat(lnMatch[1]); }

  const epfMatch = t.match(/EPF[:\s]*(?:INR|Rs\.?)?[\s]*([\d,]+)/i);
  if (epfMatch) fields.epf_contribution = parseFloat(epfMatch[1].replace(/,/,''));

  const certPatterns = ['ISO14001','ISO9001','SA8000','AS9100','IATF16949','ISO45001','FSSC22000'];
  fields.certifications = certPatterns.filter(c => new RegExp(c.replace(/[0-9]/g,'[0-9]*'),'i').test(t));
  if (fields.certifications.length) fields._confidence += 0.05 * fields.certifications.length;

  fields.esg_categories = [];
  if (fields.energy_kwh || fields.distance_km || fields.cbam_applicable) fields.esg_categories.push('environmental');
  if (fields.employee_count || fields.wage_compliant != null)             fields.esg_categories.push('social');
  if (fields.supplier_gstin || fields.certifications?.length)             fields.esg_categories.push('governance');

  fields._confidence = Math.min(1.0, fields._confidence);
  return fields;
}

export function extractFromFilename(filename) {
  const docType = classifyDocument(filename, '');
  return { document_type: docType, filename, _confidence: 0.3, source: 'filename_only' };
}
