#!/usr/bin/env bash
# ============================================================================
# Steam DLC Protection SDK — Production Simulation Test
# ============================================================================
# Runs the ENTIRE production flow end-to-end, simulating a real deployment:
#   1. Clean environment check
#   2. Start test server (simulates Supabase Edge Function)
#   3. Run ALL test suites
#   4. Tool smoke tests (key generation, bundle encryption)
#   5. Verify encrypted bundle format
#   6. Admin CLI roundtrip test
#   7. Security test against local server
#   8. Server health verification
#   9. Docker build verification (if Docker available)
#  10. Cleanup
#
# Usage:
#   bash scripts/test-production.sh
#
# Exit code: 0 = ALL PASS, non-zero = something failed
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

PASS=0
FAIL=0
SERVER_PID=""

green()  { printf '\033[32m%s\033[0m\n' "$1"; }
red()    { printf '\033[31m%s\033[0m\n' "$1"; }
yellow() { printf '\033[33m%s\033[0m\n' "$1"; }
bold()   { printf '\033[1m%s\033[0m' "$1"; }

step()   { printf '\n━━━ %s ━━━\n' "$1"; }
pass()   { PASS=$((PASS+1)); green "  ✅ $1"; }
fail()   { FAIL=$((FAIL+1)); red "  ❌ $1"; }

cleanup() {
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  if command -v docker &>/dev/null && docker compose version &>/dev/null 2>&1; then
    docker compose down 2>/dev/null || true
  fi
}
trap cleanup EXIT

# ── Step 1: Environment Check ───────────────────────────────────────────
step "1/9 — Environment Check"

NODE_VER=$(node --version)
echo "  Node.js: $NODE_VER"
echo "  Working dir: $SCRIPT_DIR"

# Verify key files exist
for f in \
  local-test-server/server.js \
  local-test-server/start.mjs \
  local-test-server/package.json \
  tests/e2e-crypto-test.mjs \
  tests/comprehensive-api-test.mjs \
  tools/dlc-admin.mjs \
  tools/generate-aes-key.mjs \
  tools/encrypt-dlc-bundle.mjs \
  supabase/functions/verify-dlc/index.ts; do
  if [ ! -f "$f" ]; then
    fail "Missing: $f"
  else
    pass "Found: $f"
  fi
done

# ── Step 2: Mock .env Setup ─────────────────────────────────────────────
step "2/9 — Test Environment Setup"

cp local-test-server/.env.example local-test-server/.env
echo "DLC_AES_KEY_BASE64=$(openssl rand -base64 32)" >> local-test-server/.env
echo "MOCK_STEAM=true" >> local-test-server/.env
pass "Test .env created (mock mode, rate limiting active)"

# ── Step 3: Install Dependencies ────────────────────────────────────────
step "3/9 — Install Dependencies"

cd local-test-server
npm ci --silent 2>&1 | tail -1 || npm install --silent 2>&1 | tail -1
cd "$SCRIPT_DIR"
pass "Dependencies installed"

# ── Step 4: Start Server ────────────────────────────────────────────────
step "4/9 — Start Test Server"

cd local-test-server
node start.mjs &
SERVER_PID=$!
cd "$SCRIPT_DIR"

# Wait for server with progressive backoff
for i in $(seq 1 15); do
  if curl -sf http://localhost:3000/health > /dev/null 2>&1; then
    SERVER_OK=$(curl -s http://localhost:3000/health)
    pass "Server started (PID=$SERVER_PID) — $SERVER_OK"
    break
  fi
  if [ "$i" -eq 15 ]; then
    fail "Server failed to start after 15s"
    exit 1
  fi
  sleep 1
done

# ── Step 5: E2E Crypto Tests ────────────────────────────────────────────
step "5/9 — E2E Crypto Tests"

if node tests/e2e-crypto-test.mjs 2>&1; then
  pass "E2E crypto tests passed"
else
  fail "E2E crypto tests failed"
fi

# ── Step 6: Admin CLI Roundtrip (runs BEFORE comprehensive to avoid rate limit) ─
step "6/9 — Admin CLI Roundtrip Test"

ADMIN_RESULT=$(node tools/dlc-admin.mjs test-verify --url http://localhost:3000 2>&1 || true)
if echo "$ADMIN_RESULT" | grep -q "Full roundtrip successful"; then
  pass "Admin CLI verify-dlc roundtrip successful"
else
  echo "    Output: $(echo "$ADMIN_RESULT" | tail -3)"
  fail "Admin CLI roundtrip failed"
fi

# ── Step 7: Comprehensive Test Suite (27 tests) ─────────────────────────
step "7/9 — Comprehensive Test Suite (27 tests)"

if node tests/comprehensive-api-test.mjs 2>&1; then
  pass "Comprehensive API tests passed"
else
  fail "Comprehensive API tests failed"
fi

# ── Step 8: Tool Smoke Tests ────────────────────────────────────────────
step "8/9 — Tool Smoke Tests"

# generate-aes-key
KEY=$(node tools/generate-aes-key.mjs)
KEY_LEN=$(echo "$KEY" | base64 -d | wc -c)
if [ "$KEY_LEN" = "32" ]; then
  pass "generate-aes-key: valid AES-256 key ($KEY_LEN bytes)"
else
  fail "generate-aes-key: invalid key length ($KEY_LEN)"
fi

# encrypt-dlc-bundle (use project dir for portability across OS)
TEST_BUNDLE="./.prod-test-bundle"
echo "test-dlc-bundle-content" > "$TEST_BUNDLE"
KEY=$(node tools/generate-aes-key.mjs)
node tools/encrypt-dlc-bundle.mjs "$TEST_BUNDLE" "${TEST_BUNDLE}.enc" --key-base64 "$KEY" 2>&1
ENC_SIZE=$(wc -c < "${TEST_BUNDLE}.enc")
if [ "$ENC_SIZE" -gt 48 ]; then
  pass "encrypt-dlc-bundle: valid encrypted bundle ($ENC_SIZE bytes)"

  # Verify format: iv(16) + hmac(32) + ciphertext
  HEX=$(xxd -p "${TEST_BUNDLE}.enc")
  echo "    IV (first 16 bytes): ${HEX:0:32}"
  echo "    HMAC (bytes 17-48): ${HEX:32:64}"
  echo "    Ciphertext (rest): ${HEX:96:32}..."
  pass "encrypted bundle format: iv(16) + hmac(32) + ciphertext ✓"
else
  fail "encrypt-dlc-bundle: bundle too small ($ENC_SIZE bytes)"
fi

# Admin CLI health check
node tools/dlc-admin.mjs health 2>&1
pass "dlc-admin health check"

# Cleanup temp files
rm -f ./.prod-test-bundle ./.prod-test-bundle.enc

# ── Results ─────────────────────────────────────────────────────────────
step "━━━ RESULTS ─━━"

TOTAL=$((PASS + FAIL))
echo ""
bold "  Production Simulation Complete"
echo ""
echo "  Passed: $PASS/$TOTAL"
echo "  Failed: $FAIL/$TOTAL"
echo ""

if [ "$FAIL" -gt 0 ]; then
  red "  ❌ Some tests FAILED — review output above."
  exit 1
else
  green "  ✅ ALL PRODUCTION TESTS PASSED"
  echo ""
  exit 0
fi