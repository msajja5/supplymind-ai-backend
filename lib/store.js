/**
 * In-memory store for local development
 * In production: replace each save* call with a Supabase insert
 *
 * Tables mirrored:
 *   passports         — ESG passports
 *   wa_messages       — raw WhatsApp messages
 *   wa_documents      — media documents from WhatsApp
 *   wa_extractions    — extracted ESG fields
 *   wa_esg_entries    — ESG pillar entries (E/S/G)
 *   camera_readings   — IoT/camera meter readings
 *   ingest_log        — audit log
 */

const db = {
  passports:      [],
  wa_messages:    [],
  wa_documents:   [],
  wa_extractions: [],
  wa_esg_entries: [],
  camera_readings:[],
  ingest_log:     [],
};

export const store = {
  // ── Passports ──────────────────────────────────────────────────────────────
  savePassport(passport)     { db.passports.push(passport); },
  getPassport(id)            { return db.passports.find(p => p.passport_id === id); },
  getAllPassports()           { return db.passports; },

  // ── WhatsApp messages ──────────────────────────────────────────────────────
  saveWaMessage(msg)         { db.wa_messages.push(msg); },
  getAllWaMessages()          { return db.wa_messages; },

  // ── WhatsApp documents ─────────────────────────────────────────────────────
  saveWaDocument(doc)        { db.wa_documents.push(doc); },
  updateWaDocument(id, patch){
    const i = db.wa_documents.findIndex(d => d.document_id === id);
    if (i >= 0) Object.assign(db.wa_documents[i], patch);
  },
  getAllWaDocuments()         { return db.wa_documents; },

  // ── WhatsApp extractions ───────────────────────────────────────────────────
  saveWaExtraction(ext)      { db.wa_extractions.push(ext); },
  getAllWaExtractions()       { return db.wa_extractions; },

  // ── ESG entries ────────────────────────────────────────────────────────────
  saveWaEsgEntry(entry)      { db.wa_esg_entries.push(entry); },
  getAllWaEsgEntries()        { return db.wa_esg_entries; },

  // ── Camera readings ────────────────────────────────────────────────────────
  saveCameraReading(reading) { db.camera_readings.push(reading); },
  getAllCameraReadings()      { return db.camera_readings; },

  // ── Audit log ──────────────────────────────────────────────────────────────
  logEvent(event, batchId, channel, status, meta = {}) {
    db.ingest_log.push({
      event,
      batch_id:   batchId,
      channel,
      status,
      meta:       JSON.stringify(meta),
      logged_at:  new Date().toISOString(),
    });
  },

  // ── Legacy (backward compat) ───────────────────────────────────────────────
  saveBatch(batch) {
    db.ingest_log.push({ event: 'batch', ...batch, logged_at: new Date().toISOString() });
  },

  // ── Stats ──────────────────────────────────────────────────────────────────
  stats() {
    return {
      passports:       db.passports.length,
      wa_messages:     db.wa_messages.length,
      wa_documents:    db.wa_documents.length,
      wa_extractions:  db.wa_extractions.length,
      wa_esg_entries:  db.wa_esg_entries.length,
      camera_readings: db.camera_readings.length,
      ingest_log:      db.ingest_log.length,
    };
  },

  // ── Reset (for tests) ──────────────────────────────────────────────────────
  reset() {
    Object.keys(db).forEach(k => { db[k] = []; });
  },
};
