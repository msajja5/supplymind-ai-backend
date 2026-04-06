/**
 * store.js v3 — Dual-mode store
 *
 * • Production (SUPABASE_URL set): all reads/writes go to Supabase Postgres
 * • Dev / Test (no env vars):      falls back to in-memory arrays (same API)
 *
 * All methods are async-safe — callers can await them in both modes.
 */

import { supabase, isConnected } from './supabase.js';

// ── In-memory fallback ──────────────────────────────────────────────────────
const mem = {
  passports:         [],
  wa_messages:       [],
  wa_documents:      [],
  wa_extractions:    [],
  wa_esg_entries:    [],
  camera_readings:   [],
  ingest_log:        [],
  batches:           {},
  supplier_profiles: {},
};

// ── Generic Supabase helpers ────────────────────────────────────────────────
async function dbInsert(table, row) {
  const { error } = await supabase.from(table).insert(row);
  if (error) throw new Error(`[store:${table}] insert failed: ${error.message}`);
}

async function dbSelect(table, filters = {}) {
  let q = supabase.from(table).select('*');
  for (const [col, val] of Object.entries(filters)) q = q.eq(col, val);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) throw new Error(`[store:${table}] select failed: ${error.message}`);
  return data ?? [];
}

async function dbUpsert(table, row, onConflict = 'id') {
  const { error } = await supabase.from(table).upsert(row, { onConflict });
  if (error) throw new Error(`[store:${table}] upsert failed: ${error.message}`);
}

// ── Store public API ────────────────────────────────────────────────────────
export const store = {

  // ── Passports ─────────────────────────────────────────────────────────────
  async savePassport(p) {
    if (isConnected()) return dbInsert('passports', p);
    mem.passports.push(p);
  },
  async getPassport(id) {
    if (isConnected()) {
      const { data } = await supabase.from('passports').select('*').eq('passport_id', id).single();
      return data;
    }
    return mem.passports.find(p => p.passport_id === id);
  },
  async getAllPassports() {
    if (isConnected()) return dbSelect('passports');
    return mem.passports;
  },
  async countPassports() {
    if (isConnected()) {
      const { count } = await supabase.from('passports').select('*', { count: 'exact', head: true });
      return count ?? 0;
    }
    return mem.passports.length;
  },

  // ── WhatsApp ───────────────────────────────────────────────────────────────
  async saveWaMessage(msg) {
    if (isConnected()) return dbInsert('wa_messages', msg);
    mem.wa_messages.push(msg);
  },
  async getAllWaMessages() {
    if (isConnected()) return dbSelect('wa_messages');
    return mem.wa_messages;
  },
  async saveWaDocument(doc) {
    if (isConnected()) return dbInsert('wa_documents', doc);
    mem.wa_documents.push(doc);
  },
  async updateWaDocument(id, patch) {
    if (isConnected()) {
      const { error } = await supabase.from('wa_documents').update(patch).eq('document_id', id);
      if (error) throw new Error(error.message);
      return;
    }
    const i = mem.wa_documents.findIndex(d => d.document_id === id);
    if (i >= 0) Object.assign(mem.wa_documents[i], patch);
  },
  async getAllWaDocuments() {
    if (isConnected()) return dbSelect('wa_documents');
    return mem.wa_documents;
  },
  async saveWaExtraction(ext) {
    if (isConnected()) return dbInsert('wa_extractions', ext);
    mem.wa_extractions.push(ext);
  },
  async getAllWaExtractions() {
    if (isConnected()) return dbSelect('wa_extractions');
    return mem.wa_extractions;
  },
  async saveWaEsgEntry(entry) {
    if (isConnected()) return dbInsert('wa_esg_entries', entry);
    mem.wa_esg_entries.push(entry);
  },
  async getAllWaEsgEntries(supplierId) {
    if (isConnected()) return dbSelect('wa_esg_entries', supplierId ? { supplier_id: supplierId } : {});
    return supplierId ? mem.wa_esg_entries.filter(e => e.supplier_id === supplierId) : mem.wa_esg_entries;
  },

  // ── Camera / IoT ───────────────────────────────────────────────────────────
  async saveCameraReading(r) {
    if (isConnected()) return dbInsert('camera_readings', r);
    mem.camera_readings.push(r);
  },
  async getAllCameraReadings(supplierId) {
    if (isConnected()) return dbSelect('camera_readings', supplierId ? { supplier_id: supplierId } : {});
    return supplierId ? mem.camera_readings.filter(r => r.supplier_id === supplierId) : mem.camera_readings;
  },

  // ── Supplier profiles ──────────────────────────────────────────────────────
  async saveSupplierProfile(id, profile) {
    const row = { supplier_id: id, ...profile, updated_at: new Date().toISOString() };
    if (isConnected()) return dbUpsert('supplier_profiles', row, 'supplier_id');
    mem.supplier_profiles[id] = { ...(mem.supplier_profiles[id] ?? {}), ...profile, updated_at: row.updated_at };
  },
  async getSupplierProfile(id) {
    if (isConnected()) {
      const { data } = await supabase.from('supplier_profiles').select('*').eq('supplier_id', id).single();
      return data ?? {};
    }
    return mem.supplier_profiles[id] ?? {};
  },
  async getAllSupplierProfiles() {
    if (isConnected()) {
      const rows = await dbSelect('supplier_profiles');
      return Object.fromEntries(rows.map(r => [r.supplier_id, r]));
    }
    return mem.supplier_profiles;
  },
  async getAllSupplierIds() {
    if (isConnected()) {
      const cams = await dbSelect('camera_readings');
      const was  = await dbSelect('wa_esg_entries');
      return [...new Set([...cams.map(r => r.supplier_id), ...was.map(e => e.supplier_id)])];
    }
    return [...new Set([
      ...mem.camera_readings.map(r => r.supplier_id),
      ...mem.wa_esg_entries.map(e => e.supplier_id),
    ])];
  },

  // ── ESG report snapshots ───────────────────────────────────────────────────
  async saveEsgSnapshot(snapshot) {
    if (isConnected()) return dbInsert('esg_snapshots', snapshot);
    // mem: not tracked (transient in dev)
  },
  async getLatestEsgSnapshot(supplierId) {
    if (isConnected()) {
      const { data } = await supabase
        .from('esg_snapshots')
        .select('*')
        .eq('supplier_id', supplierId)
        .order('merged_at', { ascending: false })
        .limit(1)
        .single();
      return data ?? null;
    }
    return null;
  },
  async getEsgHistory(supplierId, limit = 30) {
    if (isConnected()) {
      const { data } = await supabase
        .from('esg_snapshots')
        .select('merged_at, esg_score, band, total_tco2e, green_reduction_pct')
        .eq('supplier_id', supplierId)
        .order('merged_at', { ascending: false })
        .limit(limit);
      return data ?? [];
    }
    return [];
  },

  // ── Audit log ──────────────────────────────────────────────────────────────
  async logEvent(event, batchId, channel, status, meta = {}) {
    const row = {
      event, batch_id: batchId, channel, status,
      meta: JSON.stringify(meta),
      logged_at: new Date().toISOString(),
    };
    if (isConnected()) return dbInsert('ingest_log', row);
    mem.ingest_log.push(row);
  },

  // ── Batches ────────────────────────────────────────────────────────────────
  async saveBatch(batch) {
    if (batch.batch_id) mem.batches[batch.batch_id] = batch;
    await this.logEvent('batch', batch.batch_id, batch.channel, batch.status, batch);
  },
  async getBatch(batchId) { return mem.batches[batchId] ?? null; },
  async getEvents(n = 10) {
    if (isConnected()) {
      const { data } = await supabase.from('ingest_log').select('*').order('logged_at', { ascending: false }).limit(n);
      return data ?? [];
    }
    return mem.ingest_log.slice(-n);
  },

  // ── Stats ──────────────────────────────────────────────────────────────────
  async stats() {
    if (isConnected()) {
      const tables = ['passports','wa_messages','wa_documents','wa_extractions',
                      'wa_esg_entries','camera_readings','supplier_profiles','ingest_log','esg_snapshots'];
      const counts = await Promise.all(
        tables.map(t => supabase.from(t).select('*', { count: 'exact', head: true }).then(r => [t, r.count ?? 0]))
      );
      return Object.fromEntries(counts);
    }
    return {
      passports:         mem.passports.length,
      wa_messages:       mem.wa_messages.length,
      wa_documents:      mem.wa_documents.length,
      wa_extractions:    mem.wa_extractions.length,
      wa_esg_entries:    mem.wa_esg_entries.length,
      camera_readings:   mem.camera_readings.length,
      supplier_profiles: Object.keys(mem.supplier_profiles).length,
      ingest_log:        mem.ingest_log.length,
    };
  },

  reset() {
    Object.keys(mem).forEach(k => { mem[k] = Array.isArray(mem[k]) ? [] : {}; });
  },
};
