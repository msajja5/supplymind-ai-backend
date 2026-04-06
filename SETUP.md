# SupplyMind AI — Backend Setup & Deployment

## Stack
- **Runtime**: Node.js 20 (ESM)
- **API**: Vercel Serverless Functions
- **Database**: Supabase (Postgres + RLS)
- **Dev mode**: In-memory store (no DB needed)

---

## 1. Clone & Install
```bash
git clone https://github.com/msajja5/supplymind-ai-backend
cd supplymind-ai-backend
npm install
```

## 2. Environment Variables
```bash
cp .env.example .env
# Fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
```

## 3. Supabase Setup (one-time)
1. Go to [supabase.com](https://supabase.com) → New project
2. Open **SQL Editor** → paste contents of `supabase/migrations/001_initial_schema.sql` → Run
3. Copy `Project URL` and `service_role` key from **Settings → API**
4. Paste into `.env`

## 4. Run Locally
```bash
npm run dev
# Server at http://localhost:3000
```

## 5. Test (memory mode — no Supabase needed)
```bash
npm run test:e2e
npm run validate
```

## 6. Deploy to Vercel
```bash
# One-time login
vercel login
vercel link

# Add secrets to Vercel dashboard or CLI:
vercel env add SUPABASE_URL
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add NODE_ENV   # set to 'production'

# Deploy
vercel --prod
```

## 7. GitHub CI Auto-Deploy
Add these 3 secrets in GitHub → Settings → Secrets → Actions:
```
VERCEL_TOKEN        ← vercel.com/account/tokens
VERCEL_ORG_ID       ← cat .vercel/project.json | jq .orgId
VERCEL_PROJECT_ID   ← cat .vercel/project.json | jq .projectId
```
Every push to `main` → tests run → auto-deploys if green.

---

## API Routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | DB ping, store stats, version |
| GET | `/api/esg-report` | All suppliers ESG report |
| GET | `/api/esg-report?supplier=SUP001` | Single supplier |
| GET | `/api/esg-report?history=SUP001` | ESG score history |
| POST | `/api/esg-report` | Seed dummy data (dev only) |
| GET | `/api/supplier-profile?id=SUP001` | Get green profile |
| POST | `/api/supplier-profile` | Update green profile + recalc |
| GET | `/api/passport` | List passports |
| POST | `/api/passport` | Create passport |

## Database Tables
```
supplier_profiles   — green config per supplier
camera_readings     — IoT/camera data (30min cycles)
wa_esg_entries      — WhatsApp bill/doc data
wa_messages         — raw WhatsApp messages
wa_documents        — document attachments
wa_extractions      — AI-extracted fields
passports           — ESG product passports
esg_snapshots       — time-series ESG history
ingest_log          — audit trail
```
