# SupplyMind AI — Input Layer v1

This document defines the 5 input categories, their flow, Supabase tables, and Make AI prompts.

---

## Architecture

```
INPUT SOURCES
  Gmail → Make AI Toolkit → Router → Supabase
  WhatsApp → Make AI Toolkit → Router → Supabase
  PDF/Image Upload → Make AI Toolkit → Router → Supabase
  Manual/Tally → Direct Supabase Insert

ALL INPUTS → company_raw_payloads (always, regardless of confidence)
```

---

## Common AI Output Schema

Every AI extraction must return this JSON:

```json
{
  "document_type": "scope1_fuel | scope2_electricity | scope2_water | production | installation | verification | unknown",
  "confidence": 0.0,
  "target_table": "scope1_activity_log | scope2_energy_log | water_log | production_detail_log | installation_master | verification_evidence | unknown",
  "mapped_fields": {},
  "raw_text": ""
}
```

---

## Category 1 — Scope 1 Direct Emissions
**Table:** `scope1_activity_log`  
**Trigger:** Fuel invoices, delivery notes, purchase records for diesel/LPG/gas/coal

### Make AI Prompt
```
You are extracting Scope 1 fuel combustion data for ESG reporting.
If the document mentions diesel, LPG, natural gas, coal, fuel oil, petrol, boiler, kiln, furnace, or generator, classify as scope1_fuel.
Extract: fuel_type, fuel_quantity, fuel_unit, combustion_source, document_date, billing_period_start, billing_period_end, invoice_reference, supplier_name.
Return valid JSON only. No markdown.
Example: {"document_type":"scope1_fuel","confidence":0.95,"target_table":"scope1_activity_log","mapped_fields":{"fuel_type":"diesel","fuel_quantity":"500","fuel_unit":"litres","combustion_source":"generator","document_date":"2024-01-15","invoice_reference":"INV-001","supplier_name":"HPCL"},"raw_text":"..."}
```

### IPCC AR6 Emission Factors
| Fuel | kgCO₂e/unit |
|------|-------------|
| Diesel | 2.68 |
| Coal | 2.42 |
| Natural Gas | 2.04 |
| LPG | 1.51 |
| Fuel Oil | 2.99 |
| Petrol | 2.31 |

---

## Category 2 — Scope 2 Indirect Emissions
**Table:** `scope2_energy_log`  
**Trigger:** Electricity bills, meter readings (Gmail/WhatsApp/upload)

### Make AI Prompt
```
You are extracting Scope 2 electricity consumption data for ESG reporting.
If the document mentions kWh, electricity, energy charges, meter, billing period, current reading, previous reading, classify as scope2_electricity.
If it mentions water charges, consumption litres, water board, classify as scope2_water (target: water_log).
Extract: meter_reference, invoice_reference, billing_period_start, billing_period_end, document_date, consumption_kwh, supplier_name, grid_region (default india).
Return valid JSON only. No markdown.
Example: {"document_type":"scope2_electricity","confidence":0.95,"target_table":"scope2_energy_log","mapped_fields":{"meter_reference":"14002901","invoice_reference":"1100157649-01/09/2013","billing_period_start":"2013-07-01","billing_period_end":"2013-09-01","document_date":"2013-09-10","consumption_kwh":"4100","grid_region":"india"},"raw_text":"..."}
```

### Grid Emission Factors
| Region | kgCO₂e/kWh |
|--------|------------|
| India | 0.820 |
| EU | 0.233 |
| UK | 0.207 |
| Germany | 0.364 |
| France | 0.052 |

---

## Category 3 — Production Data
**Table:** `production_detail_log`  
**Trigger:** Production sheets, daily logs, shift reports

### Make AI Prompt
```
You are extracting production data for CBAM/ESG reporting.
If the document mentions output, tonnes, production period, CN code, raw material, scrap, waste, classify as production.
Extract: output_tonnes, cn_product_code, production_period_start, production_period_end, raw_materials (array), metal_scrap_recovery_rate, solid_waste_kg, wastewater_m3.
Return valid JSON only. No markdown.
Example: {"document_type":"production","confidence":0.90,"target_table":"production_detail_log","mapped_fields":{"output_tonnes":"150","cn_product_code":"7207","production_period_start":"2024-01-01","production_period_end":"2024-01-31","raw_materials":[{"material":"iron ore","type":"primary","kg_per_kg":0.9,"supplier_origin":"India"}],"metal_scrap_recovery_rate":"85","solid_waste_kg":"200"},"raw_text":"..."}
```

---

## Category 4 — Installation Identity
**Table:** `installation_master`  
**Trigger:** Company registration docs, GST certificates, onboarding form (Tally)

### Make AI Prompt
```
You are extracting company installation identity data for ESG compliance.
If the document mentions GSTIN, PAN, CIN, factory address, industry type, GPS, auditor, classify as installation.
Extract: legal_name, gstin, pan, cin, industry_type, factory_address, city, state, pin_code, latitude, longitude, production_process, system_boundary, auditor_name, auditor_email, auditor_phone.
Return valid JSON only. No markdown.
```

---

## Category 5 — Third-Party Verification
**Table:** `verification_evidence`  
**Trigger:** Audit reports, verifier certificates, ISO14064 letters

### Make AI Prompt
```
You are extracting third-party verification evidence for ESG reporting.
If the document mentions verifier, auditor, assurance, ISO14064, ISAE3000, limited assurance, reasonable assurance, methodology, system boundary, classify as verification.
Extract: evidence_category, file_name, document_date, methodology (array), system_boundary_type, verifier_name, verifier_organisation, verification_date, assurance_level, verification_standard.
Return valid JSON only. No markdown.
```

---

## Make Routing Rules

| document_type | target_table | condition |
|---|---|---|
| scope1_fuel | scope1_activity_log | confidence >= 0.7 |
| scope2_electricity | scope2_energy_log | confidence >= 0.7 |
| scope2_water | water_log | confidence >= 0.7 |
| production | production_detail_log | confidence >= 0.7 |
| installation | installation_master | confidence >= 0.7 |
| verification | verification_evidence | confidence >= 0.7 |
| any | company_raw_payloads | always (parallel) |
| unknown | company_raw_payloads | confidence < 0.7 |

---

## Supabase Tables — Input Layer

| Table | Category | Migration |
|---|---|---|
| scope1_activity_log | Scope 1 | 004 |
| scope2_energy_log | Scope 2 | 005 |
| grid_emission_factors | Scope 2 ref | 005 |
| production_detail_log | Production | 006 |
| installation_master | Installation | 007 |
| verification_evidence | Verification | 008 |
| company_raw_payloads | All (always) | existing |

---

## Next Layer: Processing Layer
After input is stable:
1. Trigger: on insert to scope1/scope2 tables
2. Look up emission factor
3. Calculate CO2e
4. Aggregate into kpi_fact rows
5. Map to ESRS E1 / E3 / CBAM fields
