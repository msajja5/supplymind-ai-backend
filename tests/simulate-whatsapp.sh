#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# simulate-whatsapp.sh
# Simulate WhatsApp messages to local server WITHOUT Meta API key
# Run: bash tests/simulate-whatsapp.sh
# Requires: curl + local server running on PORT 3000
# ─────────────────────────────────────────────────────────────────────────────

BASE="http://localhost:${PORT:-3000}"
TS=$(date +%s)
PHONE="+919988776655"

echo ""
echo "============================================================"
echo " SupplyMind AI — WhatsApp Simulator"
echo " Hitting: $BASE"
echo "============================================================"

# ── Step 1: Health check ──────────────────────────────────────────────────────
echo ""
echo "[1/6] Health check..."
curl -s $BASE/api/health | python3 -m json.tool 2>/dev/null || curl -s $BASE/api/health

# ── Step 2: Webhook verification ─────────────────────────────────────────────
echo ""
echo "[2/6] Webhook verification..."
curl -s "$BASE/api/ingest/whatsapp?hub.mode=subscribe&hub.verify_token=supplymind_verify_2026&hub.challenge=CHALLENGE_ABC"
echo ""

# ── Step 3: Simulate invoice PDF ─────────────────────────────────────────────
echo ""
echo "[3/6] Simulating invoice PDF from supplier..."
curl -s -X POST $BASE/api/ingest/whatsapp \
  -H "Content-Type: application/json" \
  -d "{
    \"entry\": [{
      \"changes\": [{
        \"value\": {
          \"messages\": [{
            \"id\": \"WA-SIM-INV-$TS\",
            \"from\": \"$PHONE\",
            \"type\": \"document\",
            \"timestamp\": \"$TS\",
            \"document\": {
              \"id\": \"FAKE-MEDIA-INV-001\",
              \"mime_type\": \"application/pdf\",
              \"filename\": \"invoice_zenith_april_2026.pdf\"
            }
          }]
        }
      }]
    }]
  }"
echo ""

# ── Step 4: Simulate utility bill ────────────────────────────────────────────
echo ""
echo "[4/6] Simulating electricity bill PDF..."
curl -s -X POST $BASE/api/ingest/whatsapp \
  -H "Content-Type: application/json" \
  -d "{
    \"entry\": [{
      \"changes\": [{
        \"value\": {
          \"messages\": [{
            \"id\": \"WA-SIM-UTIL-$TS\",
            \"from\": \"$PHONE\",
            \"type\": \"document\",
            \"timestamp\": \"$TS\",
            \"document\": {
              \"id\": \"FAKE-MEDIA-UTIL-001\",
              \"mime_type\": \"application/pdf\",
              \"filename\": \"electricity_bill_march_2026.pdf\"
            }
          }]
        }
      }]
    }]
  }"
echo ""

# ── Step 5: Simulate salary slip ─────────────────────────────────────────────
echo ""
echo "[5/6] Simulating salary slip PDF..."
curl -s -X POST $BASE/api/ingest/whatsapp \
  -H "Content-Type: application/json" \
  -d "{
    \"entry\": [{
      \"changes\": [{
        \"value\": {
          \"messages\": [{
            \"id\": \"WA-SIM-SAL-$TS\",
            \"from\": \"$PHONE\",
            \"type\": \"document\",
            \"timestamp\": \"$TS\",
            \"document\": {
              \"id\": \"FAKE-MEDIA-SAL-001\",
              \"mime_type\": \"application/pdf\",
              \"filename\": \"salary_payslip_march_2026.pdf\"
            }
          }]
        }
      }]
    }]
  }"
echo ""

# ── Step 6: Check all tables ──────────────────────────────────────────────────
echo ""
echo "[6/6] Checking pipeline status..."
curl -s $BASE/api/whatsapp-status | python3 -m json.tool 2>/dev/null || curl -s $BASE/api/whatsapp-status

echo ""
echo "============================================================"
echo " Done! Check: $BASE/api/whatsapp-status"
echo "============================================================"
echo ""
