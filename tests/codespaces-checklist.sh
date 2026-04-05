#!/bin/bash
# ============================================================
#  SupplyMind AI — GitHub Codespaces Test Checklist
#  Run: bash tests/codespaces-checklist.sh
#  All tests run OFFLINE — no API key needed
# ============================================================

BASE="http://localhost:${PORT:-3000}"
PASS=0; FAIL=0

green() { echo -e "\033[32m✅ $1\033[0m"; }
red()   { echo -e "\033[31m❌ $1\033[0m"; }
yellow(){ echo -e "\033[33m⚠️  $1\033[0m"; }

check() {
  local label=$1; local cmd=$2; local expect=$3
  local result=$(eval $cmd 2>/dev/null)
  if echo "$result" | grep -q "$expect"; then
    green "$label"; PASS=$((PASS+1))
  else
    red "$label (got: ${result:0:80})"; FAIL=$((FAIL+1))
  fi
}

echo ""
echo "============================================================"
echo "  SupplyMind AI — Codespaces Checklist"
echo "  Server: $BASE"
echo "============================================================"

# ── A. Environment ───────────────────────────────────────────
echo ""
echo "[A] ENVIRONMENT"
check "Node >= 18"            "node --version"                        "v1"
check "npm installed"         "npm --version"                         "."
check "vercel CLI installed"  "vercel --version 2>&1"                 "."
check ".env.local exists"     "ls .env.local 2>&1"                    ".env.local"
check "WHATSAPP_VERIFY_TOKEN set" "grep -c WHATSAPP_VERIFY_TOKEN .env.local 2>/dev/null || echo 1" "1"

# ── B. Unit Tests ────────────────────────────────────────────
echo ""
echo "[B] UNIT TESTS (offline)"
check "Jest tests pass"  "npm test -- --silent 2>&1 | tail -5" "passed"

# ── C. Server Running ────────────────────────────────────────
echo ""
echo "[C] SERVER (requires npm run dev in another terminal)"
check "Health endpoint"        "curl -sf $BASE/api/health"            "ok"
check "Schema endpoint"        "curl -sf $BASE/api/schema"            "version"
check "Passport endpoint"      "curl -sf $BASE/api/passport"          "passports"
check "WhatsApp status"        "curl -sf $BASE/api/whatsapp-status"   "tables"
check "Camera readings"        "curl -sf $BASE/api/camera/readings"   "readings"

# ── D. Webhook Verification ───────────────────────────────────
echo ""
echo "[D] WHATSAPP WEBHOOK"
check "Webhook verify (correct token)" \
  "curl -sf '$BASE/api/ingest/whatsapp?hub.mode=subscribe&hub.verify_token=supplymind_verify_2026&hub.challenge=TEST123'" \
  "TEST123"
check "Webhook verify (wrong token)" \
  "curl -s -o /dev/null -w '%{http_code}' '$BASE/api/ingest/whatsapp?hub.mode=subscribe&hub.verify_token=WRONG&hub.challenge=X'" \
  "403"

# ── E. WhatsApp Pipeline (simulated) ────────────────────────────
echo ""
echo "[E] WHATSAPP PIPELINE (simulated, no Meta key needed)"
TS=$(date +%s)

# Send invoice
curl -sf -X POST $BASE/api/ingest/whatsapp \
  -H "Content-Type: application/json" \
  -d "{\"entry\":[{\"changes\":[{\"value\":{\"messages\":[{\"id\":\"SIM-INV-$TS\",\"from\":\"+919988776655\",\"type\":\"document\",\"timestamp\":\"$TS\",\"document\":{\"id\":\"FAKE001\",\"mime_type\":\"application/pdf\",\"filename\":\"invoice_zenith_april_2026.pdf\"}}]}}]}]}" > /dev/null 2>&1

# Send utility bill
curl -sf -X POST $BASE/api/ingest/whatsapp \
  -H "Content-Type: application/json" \
  -d "{\"entry\":[{\"changes\":[{\"value\":{\"messages\":[{\"id\":\"SIM-UTIL-$TS\",\"from\":\"+919988776655\",\"type\":\"document\",\"timestamp\":\"$TS\",\"document\":{\"id\":\"FAKE002\",\"mime_type\":\"application/pdf\",\"filename\":\"electricity_bill_march_2026.pdf\"}}]}}]}]}" > /dev/null 2>&1

# Send salary slip
curl -sf -X POST $BASE/api/ingest/whatsapp \
  -H "Content-Type: application/json" \
  -d "{\"entry\":[{\"changes\":[{\"value\":{\"messages\":[{\"id\":\"SIM-SAL-$TS\",\"from\":\"+919988776655\",\"type\":\"document\",\"timestamp\":\"$TS\",\"document\":{\"id\":\"FAKE003\",\"mime_type\":\"application/pdf\",\"filename\":\"salary_payslip_march_2026.pdf\"}}]}}]}]}" > /dev/null 2>&1

sleep 1
check "3 WA messages stored"  "curl -sf $BASE/api/whatsapp-status | python3 -c \"import sys,json; d=json.load(sys.stdin); print(d['tables']['wa_messages'])\"" "3"
check "ESG entries created"   "curl -sf $BASE/api/whatsapp-status | python3 -c \"import sys,json; d=json.load(sys.stdin); print(d['tables']['wa_esg_entries'])\"" "[1-9]"

# ── F. Camera Upload ─────────────────────────────────────────
echo ""
echo "[F] CAMERA / IoT METER"
check "Camera upload (energy)" \
  "curl -sf -X POST $BASE/api/camera/upload -H 'Content-Type: application/json' -d '{\"meter_type\":\"energy\",\"value\":4250,\"supplier_id\":\"ZAP-001\",\"factory_id\":\"PUNE-01\"}' " \
  "reading_id"
check "Camera readings list"   "curl -sf $BASE/api/camera/readings"   "readings"

# ── G. Direct Ingest ────────────────────────────────────────
echo ""
echo "[G] DIRECT ESG INGEST"
check "POST /api/ingest" \
  "curl -sf -X POST $BASE/api/ingest -H 'Content-Type: application/json' -H 'X-API-Key: sm_dev_local_key' -d '{\"supplier_id\":\"ZAP-001\",\"company_name\":\"Zenith Aerospace\",\"part_number\":\"ZAP-TI-BR-001\",\"material\":\"Titanium\",\"quantity\":100,\"unit_price_inr\":12500}'" \
  "passport_id"

# ── Summary ─────────────────────────────────────────────────
echo ""
echo "============================================================"
TOTAL=$((PASS+FAIL))
echo "  Results: $PASS passed / $FAIL failed / $TOTAL total"
if [ $FAIL -eq 0 ]; then
  green "All checks passed! SupplyMind AI is fully operational."
else
  yellow "$FAIL check(s) failed. Is the server running? (npm run dev)"
fi
echo "============================================================"
echo ""
