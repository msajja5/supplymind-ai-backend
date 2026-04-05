# SupplyMind AI — Local Setup & WhatsApp Integration Guide

## Quick Start (5 minutes)

```bash
# 1. Clone and install
git clone https://github.com/msajja5/supplymind-ai-backend
cd supplymind-ai-backend
npm install

# 2. Copy env file
cp .env.example .env.local
# Edit .env.local with your credentials (see below)

# 3. Start local server
npm run dev
# Server runs on http://localhost:3000

# 4. Run all tests (no API key needed)
npm test

# 5. Simulate WhatsApp messages locally
npm run simulate
```

---

## Environment Variables to Fill

Open `.env.local` and fill these:

### Required for local testing (no external API)
```env
SUPPLYMIND_API_KEY=sm_dev_local_key
WHATSAPP_VERIFY_TOKEN=supplymind_verify_2026
```

### Required for real WhatsApp (from Meta Developer Console)
```env
WHATSAPP_ACCESS_TOKEN=EAAxxxxx...          # From Meta App → WhatsApp → API Setup
WHATSAPP_PHONE_NUMBER_ID=1234567890        # From same page
WHATSAPP_BUSINESS_ACCOUNT_ID=9876543210   # From same page
```

### Required for Supabase persistence
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJxxx...
```

---

## WhatsApp Setup (Meta Developer Console)

### Step 1 — Create Meta App
1. Go to https://developers.facebook.com → My Apps → Create App
2. Type: **Business** → Name: `SupplyMindDev`
3. Dashboard → Add Product → **WhatsApp** → Set Up

### Step 2 — Get Test Credentials
In WhatsApp → API Setup:
- Copy **Phone Number ID** → `WHATSAPP_PHONE_NUMBER_ID`
- Copy **Access Token** → `WHATSAPP_ACCESS_TOKEN` (expires 24h)
- For permanent token: Business Settings → System Users → Generate Token

### Step 3 — Add Your Test Phone
- "To" field → Manage phone number list → Add your number
- Verify with OTP on WhatsApp
- Up to 5 numbers free in dev mode

### Step 4 — Set Webhook (needs ngrok)
```bash
# Start ngrok tunnel
npm run ngrok
# Copy URL: https://abc123.ngrok-free.app
```
In Meta Console → WhatsApp → Configuration → Webhook:
```
Callback URL:  https://abc123.ngrok-free.app/api/ingest/whatsapp
Verify Token:  supplymind_verify_2026
```
Subscribe to: **messages** ✓

### Step 5 — Test Real WhatsApp
Send any of these PDFs from your phone to the test number:
- `sample_esg_invoice.pdf`
- `sample_esg_utility_bill.pdf`
- `sample_esg_salary_slip.pdf`

Then check: http://localhost:3000/api/whatsapp-status

---

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/health` | GET | Health check |
| `/api/ingest/whatsapp` | GET | Meta webhook verification |
| `/api/ingest/whatsapp` | POST | Receive WhatsApp messages |
| `/api/whatsapp-status` | GET | All table counts + ESG summary |
| `/api/camera/upload` | POST | Upload meter image |
| `/api/camera/readings` | GET | List camera readings |
| `/api/ingest` | POST | Direct ESG data ingest |
| `/api/passport` | GET | List passports |
| `/api/transform` | POST | Transform + calculate ESG |

---

## Testing Without WhatsApp

```bash
# Simulate invoice PDF
bash tests/simulate-whatsapp.sh

# Or curl manually
curl -X POST http://localhost:3000/api/ingest/whatsapp \
  -H "Content-Type: application/json" \
  -d '{"entry":[{"changes":[{"value":{"messages":[{"id":"TEST-001","from":"+919988776655","type":"document","timestamp":"1743870000","document":{"id":"FAKE-MEDIA-ID","mime_type":"application/pdf","filename":"invoice_zenith_april_2026.pdf"}}]}}]}]}'

# Check result
curl http://localhost:3000/api/whatsapp-status
```

---

## Free Usage Limits

| Mode | Messages | Cost | How |
|---|---|---|---|
| Dev / Test mode | 1,000/month to 5 numbers | FREE | Just create Meta app |
| Service conversations | Unlimited | FREE since Nov 2024 | Customer messages first |
| Tier 1 (verified) | 1,000 users/day | FREE (service conv.) | Business verification |
