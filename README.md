# SupplyMind AI — Backend Data Infrastructure

> Real-time supplier data pipeline · India → EU Aerospace Supply Chain  
> Stack: **Node.js + Vercel Serverless Functions + GitHub Actions CI/CD**

---

## Architecture

```
Supplier (India)          SupplyMind Backend (Vercel)         EU Buyer
─────────────────         ──────────────────────────          ────────
Tally ERP export   ──▶   /api/ingest        ──▶  Transform   ──▶  /api/passport/{id}
WhatsApp Bot       ──▶   /api/ingest/whatsapp     Validate        /api/deliver
Email Attachment   ──▶   /api/ingest/email         Enrich
REST API           ──▶   /api/ingest               ESG Passport
Manual CSV         ──▶   /api/ingest/csv           Hash & Sign
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/ingest` | Receive raw supplier data (JSON/CSV) |
| `POST` | `/api/ingest/whatsapp` | WhatsApp media + OCR trigger |
| `POST` | `/api/ingest/email` | Email attachment parser |
| `POST` | `/api/transform` | Run AI transform on a batch |
| `GET`  | `/api/passport/:id` | Retrieve ESG passport by ID |
| `POST` | `/api/deliver` | Push passport to EU buyer API |
| `GET`  | `/api/health` | Pipeline health + source status |
| `GET`  | `/api/schema` | Return SupplyMind canonical schema v2.1 |

## Quick Start

```bash
npm install
npm run dev          # Vercel dev server at http://localhost:3000
```

## Environment Variables

Copy `.env.example` → `.env.local` and fill in:

```
SUPPLYMIND_API_KEY=
ECB_FX_API_URL=https://api.frankfurter.app/latest
BUYER_API_URL=
BUYER_API_KEY=
WHATSAPP_VERIFY_TOKEN=
OCR_API_KEY=
```

## Data Flow

1. **Ingest** — raw supplier payload received (any source)
2. **Validate** — schema check, dedup, unit normalisation
3. **Transform** — AI HS code classification, FX conversion, emission factor calc
4. **ESG Passport** — SupplyMind schema v2.1 document generated + SHA-256 signed
5. **Deliver** — pushed to EU buyer endpoint via REST webhook

## Folder Structure

```
api/
  ingest/
    index.js        ← main ingest endpoint
    whatsapp.js     ← WhatsApp webhook handler
    email.js        ← email attachment parser
    csv.js          ← CSV bulk upload
  transform.js      ← AI transform + enrich
  passport.js       ← ESG passport CRUD
  deliver.js        ← buyer API delivery
  health.js         ← pipeline health check
  schema.js         ← canonical schema endpoint
lib/
  schema.js         ← SupplyMind data model v2.1
  hs-classifier.js  ← HS code AI classification
  emissions.js      ← Scope 1/2/3 emission calculator
  fx.js             ← INR→EUR FX converter
  validator.js      ← payload validation
  passport.js       ← passport builder + hash signer
  store.js          ← in-memory store (swap for DB)
vercel.json
package.json
.env.example
```

## Deployment

```bash
npm i -g vercel
vercel --prod
```

Or push to `main` — GitHub Actions runs tests then Vercel auto-deploys.

## Compliance

- **CBAM**: HS code Annex I sector check on every record
- **CSRD**: Scope 1/2/3 emission tagging per GHG Protocol
- **GDPR/DPDP**: No PII stored beyond supplier tax ID; all data hash-signed
- **AS9100D**: Certificate validity API check on ingest
