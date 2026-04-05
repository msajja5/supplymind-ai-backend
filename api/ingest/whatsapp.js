/**
 * WhatsApp Cloud API Webhook Handler
 * GET  /api/ingest/whatsapp  — Meta webhook verification
 * POST /api/ingest/whatsapp  — Receive messages (image/document/text)
 *
 * Full pipeline:
 *   1. Receive WhatsApp message
 *   2. Download media from Meta CDN
 *   3. Classify document type (invoice/utility/salary/PO/delivery)
 *   4. Extract ESG fields via regex (no OCR API key needed)
 *   5. Calculate CO2e, ESG score
 *   6. Save to Supabase (wa_messages → wa_documents → wa_extractions → wa_esg_entries)
 *   7. Trigger passport generation
 */

import { store } from '../../lib/store.js';
import { extractEsgFromText, classifyDocument } from '../../lib/pdf-extractor.js';
import { calculateEmissions } from '../../lib/emissions.js';
import { generatePassport } from '../../lib/passport.js';

const META_API = 'https://graph.facebook.com/v19.0';

// ── Download media bytes from Meta CDN ────────────────────────────────────────
async function downloadMedia(mediaId, accessToken) {
  try {
    // Step 1: get media URL
    const urlRes = await fetch(`${META_API}/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!urlRes.ok) throw new Error(`Media URL fetch failed: ${urlRes.status}`);
    const { url } = await urlRes.json();

    // Step 2: download media bytes
    const mediaRes = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!mediaRes.ok) throw new Error(`Media download failed: ${mediaRes.status}`);

    const buffer = await mediaRes.arrayBuffer();
    return Buffer.from(buffer);
  } catch (err) {
    console.warn('[WhatsApp] Media download failed (using mock):', err.message);
    return null;
  }
}

// ── Send reply message back to supplier ───────────────────────────────────────
async function sendWhatsAppReply(to, text, phoneNumberId, accessToken) {
  try {
    await fetch(`${META_API}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text },
      }),
    });
  } catch (err) {
    console.warn('[WhatsApp] Reply send failed:', err.message);
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {

  // ── GET: Meta webhook verification ────────────────────────────────────────
  if (req.method === 'GET') {
    const mode      = req.query['hub.mode'];
    const token     = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === (process.env.WHATSAPP_VERIFY_TOKEN || 'supplymind_verify_2026')) {
      console.log('[WhatsApp] Webhook verified ✓');
      return res.status(200).send(challenge);
    }
    return res.status(403).json({ error: 'Verification failed — check WHATSAPP_VERIFY_TOKEN' });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Always return 200 quickly so Meta does not retry
  res.status(200).json({ received: true });

  try {
    const body    = req.body;
    const entry   = body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value   = changes?.value;
    const messages = value?.messages || [];

    if (!messages.length) return;

    const accessToken   = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    for (const message of messages) {
      const msgId    = message.id;
      const from     = message.from;           // supplier phone
      const type     = message.type;           // image | document | text
      const ts       = new Date().toISOString();
      const batchId  = `WA-${Date.now()}`;

      console.log(`[WhatsApp] Message from ${from} | type=${type} | id=${msgId}`);

      // ── 1. Save raw message to wa_messages ──────────────────────────────
      const waMsg = {
        message_id: msgId,
        from_phone: from,
        message_type: type,
        received_at: ts,
        raw_payload: JSON.stringify(message),
        status: 'received',
      };
      store.saveWaMessage(waMsg);

      // ── 2. Handle media (image / document) ─────────────────────────────
      if (type === 'image' || type === 'document') {
        const mediaObj = message[type];
        const mediaId  = mediaObj?.id;
        const filename = mediaObj?.filename || `${type}_${msgId}.pdf`;
        const mimeType = mediaObj?.mime_type || 'application/octet-stream';

        // Save to wa_documents
        const waDoc = {
          document_id: `DOC-${msgId}`,
          message_id:  msgId,
          from_phone:  from,
          filename,
          mime_type:   mimeType,
          media_id:    mediaId,
          received_at: ts,
          status:      'processing',
        };
        store.saveWaDocument(waDoc);

        // Download media (works only when WHATSAPP_ACCESS_TOKEN is set)
        let mediaBuffer = null;
        if (accessToken && mediaId) {
          mediaBuffer = await downloadMedia(mediaId, accessToken);
        }

        // ── 3. Extract ESG data ───────────────────────────────────────────
        let extractedText = '';
        if (mediaBuffer) {
          // Convert PDF buffer to text using pdfparse (if available)
          try {
            const { default: pdfParse } = await import('pdf-parse');
            const parsed = await pdfParse(mediaBuffer);
            extractedText = parsed.text;
          } catch {
            extractedText = `[Media downloaded: ${mediaBuffer.length} bytes — OCR not configured]`;
          }
        } else {
          // Use filename to simulate extraction for local testing
          extractedText = `FILENAME: ${filename}\nMEDIA_ID: ${mediaId || 'LOCAL_TEST'}\nFROM: ${from}`;
        }

        const docType    = classifyDocument(filename, extractedText);
        const esgFields  = extractEsgFromText(extractedText, docType);
        const emissions  = calculateEmissions(esgFields);

        // Save to wa_extractions
        const extraction = {
          extraction_id:   `EXT-${msgId}`,
          document_id:     `DOC-${msgId}`,
          message_id:      msgId,
          from_phone:      from,
          document_type:   docType,
          extracted_at:    ts,
          raw_text_length: extractedText.length,
          esg_fields:      JSON.stringify(esgFields),
          emissions:       JSON.stringify(emissions),
          confidence:      esgFields._confidence || 0.6,
          status:          'extracted',
        };
        store.saveWaExtraction(extraction);

        // ── 4. Save ESG entries (E / S / G pillars) ───────────────────────
        const esgEntries = buildEsgEntries(msgId, from, docType, esgFields, emissions, ts);
        esgEntries.forEach(e => store.saveWaEsgEntry(e));

        // ── 5. Generate ESG passport if enough data ───────────────────────
        if (esgFields.supplier_gstin || esgFields.total_amount_inr) {
          try {
            const passport = generatePassport({
              source: 'whatsapp',
              supplier_phone: from,
              document_type: docType,
              ...esgFields,
              ...emissions,
            });
            store.savePassport(passport);
            console.log(`[WhatsApp] Passport generated: ${passport.passport_id}`);
          } catch (e) {
            console.warn('[WhatsApp] Passport generation skipped:', e.message);
          }
        }

        // ── 6. Send confirmation back to supplier ─────────────────────────
        if (accessToken && phoneNumberId) {
          const esgScore = esgEntries[0]?.esg_score_contribution || 0;
          const reply = [
            `✅ *SupplyMind AI received your ${docType.replace('_',' ')}*`,
            `📄 File: ${filename}`,
            `🌍 CO2e: ${emissions.total_co2e_kg?.toFixed(1) || 'calculating'} kg`,
            `📊 ESG Score contribution: ${esgScore}/100`,
            `🔗 View passport: https://aisupplymind.lovable.app`,
          ].join('\n');
          await sendWhatsAppReply(from, reply, phoneNumberId, accessToken);
        }

        // Update document status
        store.updateWaDocument(`DOC-${msgId}`, { status: 'processed' });

      } else if (type === 'text') {
        const textBody = message.text?.body || '';
        console.log(`[WhatsApp] Text message: ${textBody}`);
        store.saveWaExtraction({
          extraction_id: `EXT-TEXT-${msgId}`,
          message_id: msgId,
          from_phone: from,
          document_type: 'text_message',
          extracted_at: ts,
          esg_fields: JSON.stringify({ raw_text: textBody }),
          status: 'text_only',
        });
      }

      store.logEvent('whatsapp_processed', batchId, 'channel/whatsapp', 'success', { type, from });
    }
  } catch (err) {
    console.error('[WhatsApp] Processing error:', err);
    store.logEvent('whatsapp_error', null, 'channel/whatsapp', 'error', { error: err.message });
  }
}

// ── Build E/S/G pillar entries from extracted fields ─────────────────────────
function buildEsgEntries(msgId, from, docType, fields, emissions, ts) {
  const entries = [];
  const base = { message_id: msgId, from_phone: from, document_type: docType, recorded_at: ts };

  // Environmental
  if (emissions.total_co2e_kg != null || fields.energy_kwh != null) {
    entries.push({
      ...base,
      entry_id: `ESG-E-${msgId}`,
      esg_pillar: 'environmental',
      metric_name: 'carbon_emissions',
      metric_value: emissions.total_co2e_kg || 0,
      metric_unit: 'kg CO2e',
      energy_kwh: fields.energy_kwh || null,
      co2e_kg: emissions.total_co2e_kg || 0,
      scope: emissions.scope || 'scope_3',
      esg_score_contribution: emissions.total_co2e_kg < 500 ? 85 : emissions.total_co2e_kg < 1000 ? 65 : 40,
    });
  }

  // Social
  if (fields.employee_count != null || fields.total_wages != null) {
    entries.push({
      ...base,
      entry_id: `ESG-S-${msgId}`,
      esg_pillar: 'social',
      metric_name: 'labour_compliance',
      metric_value: fields.wage_compliant ? 1 : 0,
      metric_unit: 'boolean',
      employee_count: fields.employee_count || null,
      total_wages_inr: fields.total_wages || null,
      wage_compliance: fields.wage_compliant || false,
      esg_score_contribution: fields.wage_compliant ? 90 : 50,
    });
  }

  // Governance
  if (fields.supplier_gstin || fields.certifications?.length) {
    entries.push({
      ...base,
      entry_id: `ESG-G-${msgId}`,
      esg_pillar: 'governance',
      metric_name: 'compliance_certifications',
      metric_value: (fields.certifications || []).length,
      metric_unit: 'count',
      supplier_gstin: fields.supplier_gstin || null,
      certifications: JSON.stringify(fields.certifications || []),
      cbam_applicable: fields.cbam_applicable || false,
      esg_score_contribution: Math.min(100, 60 + (fields.certifications?.length || 0) * 10),
    });
  }

  // Fallback — always have at least one entry
  if (!entries.length) {
    entries.push({
      ...base,
      entry_id: `ESG-GEN-${msgId}`,
      esg_pillar: 'general',
      metric_name: 'document_received',
      metric_value: 1,
      metric_unit: 'count',
      esg_score_contribution: 50,
    });
  }

  return entries;
}
