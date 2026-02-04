#!/usr/bin/env bash
# Comprehensive edge-case tests: accounts, posting, claiming, rating, access control.
# Usage: BASE_URL=http://localhost:3000 ./test-edge-cases.sh

set -e
BASE="${BASE_URL:-http://localhost:3000}"
SUF=$(date +%s)
POSTER_USER="EdgePoster_$SUF"
CLAIMER_USER="EdgeClaimer_$SUF"
PASS=0
FAIL=0

pass() { echo "  ✓ $1"; ((PASS++)) || true; }
fail() { echo "  ✗ $1"; ((FAIL++)) || true; }

# --- Accounts ---
echo ""
echo "=== ACCOUNTS ==="

# Create valid account
R=$(curl -s -X POST "$BASE/api/account/create" -H "Content-Type: application/json" -d "{\"username\":\"$POSTER_USER\",\"description\":\"Poster\"}")
if echo "$R" | jq -e '.username and .privateKey' >/dev/null 2>&1; then pass "Create account (valid)"; else fail "Create account (valid)"; fi
POSTER_KEY=$(echo "$R" | jq -r '.privateKey')

# Short username
R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/account/create" -H "Content-Type: application/json" -d '{"username":"ab"}')
CODE=$(echo "$R" | tail -1)
if [ "$CODE" = "400" ]; then pass "Create account (short username → 400)"; else fail "Create account (short username → 400), got $CODE"; fi

# Create claimer account
R=$(curl -s -X POST "$BASE/api/account/create" -H "Content-Type: application/json" -d "{\"username\":\"$CLAIMER_USER\",\"description\":\"Claimer\"}")
CLAIMER_KEY=$(echo "$R" | jq -r '.privateKey')
if echo "$R" | jq -e '.username' >/dev/null 2>&1; then pass "Create claimer account"; else fail "Create claimer account"; fi

# --- Config & list ---
echo ""
echo "=== CONFIG & JOBS LIST ==="
R=$(curl -s "$BASE/api/config")
if echo "$R" | jq -e '.minimum_collateral' >/dev/null 2>&1; then pass "GET /api/config"; else fail "GET /api/config"; fi
R=$(curl -s "$BASE/api/jobs")
if echo "$R" | jq -e '.jobs | type == "array"' >/dev/null 2>&1; then pass "GET /api/jobs"; else fail "GET /api/jobs"; fi

# --- Post free bounty as human (no credentials) ---
echo ""
echo "=== POST FREE BOUNTY (human, no credentials) ==="
R=$(curl -s -X POST "$BASE/api/jobs" -H "Content-Type: application/json" -d '{"description":"Edge test free human bounty","amount":0,"chain":"solana"}')
FREE_JOB_ID=$(echo "$R" | jq -r '.job.id')
FREE_PRIVATE=$(echo "$R" | jq -r '.job.private_id')
if echo "$R" | jq -e '.job.poster_username == "human" and .job.amount == 0' >/dev/null 2>&1; then pass "Post free bounty as human → @human"; else fail "Post free bounty as human"; fi

# --- Post free bounty as agent ---
echo ""
echo "=== POST FREE BOUNTY (agent) ==="
R=$(curl -s -X POST "$BASE/api/jobs" -H "Content-Type: application/json" -d "{\"description\":\"Edge free by agent\",\"amount\":0,\"chain\":\"solana\",\"posterUsername\":\"$POSTER_USER\",\"posterPrivateKey\":\"$POSTER_KEY\"}")
FREE_AGENT_PRIVATE=$(echo "$R" | jq -r '.job.private_id')
FREE_AGENT_JOB_ID=$(echo "$R" | jq -r '.job.id')
if echo "$R" | jq -e '.job.poster_username and .job.amount == 0' >/dev/null 2>&1; then pass "Post free bounty as agent"; else fail "Post free bounty as agent"; fi

# --- Claim free (human) bounty with agent ---
echo ""
echo "=== CLAIM FREE BOUNTY ==="
R=$(curl -s -X POST "$BASE/api/jobs/$FREE_JOB_ID/submit" -H "Content-Type: application/json" -d "{\"response\":\"Edge claim text\",\"agentUsername\":\"$CLAIMER_USER\",\"agentPrivateKey\":\"$CLAIMER_KEY\"}")
if echo "$R" | jq -e '.submission.id and .submission.agent_username' >/dev/null 2>&1; then pass "Claim free bounty with agent"; else fail "Claim free bounty"; fi

# --- Access: GET free job by numeric id → response visible ---
echo ""
echo "=== ACCESS: FREE BOUNTY BY NUMERIC ID (response public) ==="
R=$(curl -s "$BASE/api/jobs/$FREE_JOB_ID")
if echo "$R" | jq -e '.submission != null and .submission.response != null and .submission.response != ""' >/dev/null 2>&1; then pass "GET free job by numeric id shows response"; else fail "GET free job by numeric id should show response"; fi

# --- Rate free bounty (human poster, no auth) ---
echo ""
echo "=== RATE FREE BOUNTY (human poster) ==="
R=$(curl -s -X POST "$BASE/api/jobs/$FREE_PRIVATE/rate" -H "Content-Type: application/json" -d '{"rating":4}')
if echo "$R" | jq -e '.submission.rating == 4' >/dev/null 2>&1; then pass "Rate free bounty without poster auth"; else fail "Rate free bounty"; fi

# --- Rate via numeric id → 400 ---
echo ""
echo "=== RATE VIA NUMERIC ID (must fail) ==="
R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/jobs/$FREE_JOB_ID/rate" -H "Content-Type: application/json" -d '{"rating":5}')
CODE=$(echo "$R" | tail -1)
if [ "$CODE" = "400" ]; then pass "Rate via numeric id → 400"; else fail "Rate via numeric id should be 400, got $CODE"; fi

# --- Rate already-rated → 409 ---
echo ""
echo "=== RATE ALREADY RATED (immutable) ==="
R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/jobs/$FREE_PRIVATE/rate" -H "Content-Type: application/json" -d '{"rating":5}')
CODE=$(echo "$R" | tail -1)
if [ "$CODE" = "409" ]; then pass "Rate again → 409 immutable"; else fail "Rate again should be 409, got $CODE"; fi

# --- Post paid bounty as agent (need balance: credit or use wallet) ---
echo ""
echo "=== POST PAID BOUNTY (agent) ==="
# Agent needs balance; post with wallet for human flow (no balance check) to get a paid job for testing claim/rate
R=$(curl -s -X POST "$BASE/api/jobs" -H "Content-Type: application/json" -d '{"description":"Edge paid human bounty","amount":0.02,"chain":"solana","posterWallet":"EdgeHumanWallet02"}')
PAID_JOB_ID=$(echo "$R" | jq -r '.job.id')
PAID_PRIVATE=$(echo "$R" | jq -r '.job.private_id')
if echo "$R" | jq -e '.job.id and .job.amount == 0.02' >/dev/null 2>&1; then pass "Post paid bounty (human wallet)"; else fail "Post paid bounty"; fi

# --- Claim paid bounty ---
echo ""
echo "=== CLAIM PAID BOUNTY ==="
R=$(curl -s -X POST "$BASE/api/jobs/$PAID_JOB_ID/submit" -H "Content-Type: application/json" -d "{\"response\":\"Paid bounty completion\",\"agentUsername\":\"$CLAIMER_USER\",\"agentPrivateKey\":\"$CLAIMER_KEY\"}")
if echo "$R" | jq -e '.submission.id' >/dev/null 2>&1; then pass "Claim paid bounty"; else fail "Claim paid bounty"; fi

# --- Access: GET paid job by numeric id → claimer + rating visible, response null ---
echo ""
echo "=== ACCESS: PAID BOUNTY BY NUMERIC ID (no response) ==="
R=$(curl -s "$BASE/api/jobs/$PAID_JOB_ID")
if echo "$R" | jq -e '.submission != null and .submission.agent_username != null and .submission.response == null' >/dev/null 2>&1; then pass "GET paid job by numeric id: claimer visible, response null"; else fail "GET paid job by numeric id"; fi

# --- Rate paid bounty (human poster) 1 star ---
echo ""
echo "=== RATE PAID BOUNTY 1 STAR (human poster) ==="
R=$(curl -s -X POST "$BASE/api/jobs/$PAID_PRIVATE/rate" -H "Content-Type: application/json" -d '{"rating":1}')
if echo "$R" | jq -e '.submission.rating == 1' >/dev/null 2>&1; then pass "Rate paid bounty 1 star (no payout)"; else fail "Rate paid 1 star"; fi

# --- Access: GET paid job by private_id → full submission ---
echo ""
echo "=== ACCESS: PAID BOUNTY BY PRIVATE ID (full response) ==="
R=$(curl -s "$BASE/api/jobs/$PAID_PRIVATE")
if echo "$R" | jq -e '.submission != null and .submission.response != null' >/dev/null 2>&1; then pass "GET paid job by private_id shows response"; else fail "GET paid by private_id should show response"; fi

# --- Claim already-claimed job → 400 ---
echo ""
echo "=== CLAIM ALREADY CLAIMED (must fail) ==="
R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/jobs/$PAID_JOB_ID/submit" -H "Content-Type: application/json" -d "{\"response\":\"Second claim\",\"agentUsername\":\"$POSTER_USER\",\"agentPrivateKey\":\"$POSTER_KEY\"}")
CODE=$(echo "$R" | tail -1)
if [ "$CODE" = "400" ]; then pass "Claim already claimed → 400"; else fail "Claim already claimed should be 400, got $CODE"; fi

# --- Claim agent's free bounty (for invalid-rating test) ---
curl -s -X POST "$BASE/api/jobs/$FREE_AGENT_JOB_ID/submit" -H "Content-Type: application/json" -d "{\"response\":\"Claim for rating tests\",\"agentUsername\":\"$CLAIMER_USER\",\"agentPrivateKey\":\"$CLAIMER_KEY\"}" >/dev/null

# --- Invalid rating value → 400 ---
echo ""
echo "=== INVALID RATING (must fail) ==="
R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/jobs/$FREE_AGENT_PRIVATE/rate" -H "Content-Type: application/json" -d "{\"rating\":0,\"posterUsername\":\"$POSTER_USER\",\"posterPrivateKey\":\"$POSTER_KEY\"}")
CODE=$(echo "$R" | tail -1)
if [ "$CODE" = "400" ]; then pass "Rate 0 → 400"; else fail "Rate 0 should be 400, got $CODE"; fi
R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/jobs/$FREE_AGENT_PRIVATE/rate" -H "Content-Type: application/json" -d "{\"rating\":6,\"posterUsername\":\"$POSTER_USER\",\"posterPrivateKey\":\"$POSTER_KEY\"}")
CODE=$(echo "$R" | tail -1)
if [ "$CODE" = "400" ]; then pass "Rate 6 → 400"; else fail "Rate 6 should be 400, got $CODE"; fi

# --- Claim closed job → 400 ---
echo ""
echo "=== CLAIM CLOSED JOB (must fail) ==="
R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/jobs/$PAID_JOB_ID/submit" -H "Content-Type: application/json" -d "{\"response\":\"Late claim\",\"agentUsername\":\"$POSTER_USER\",\"agentPrivateKey\":\"$POSTER_KEY\"}")
CODE=$(echo "$R" | tail -1)
if [ "$CODE" = "400" ]; then pass "Claim closed job → 400"; else fail "Claim closed job should be 400, got $CODE"; fi

# --- 404 job ---
echo ""
echo "=== 404 EDGES ==="
R=$(curl -s -w "\n%{http_code}" "$BASE/api/jobs/999999")
CODE=$(echo "$R" | tail -1)
if [ "$CODE" = "404" ]; then pass "GET nonexistent job → 404"; else fail "GET nonexistent job, got $CODE"; fi
R=$(curl -s -w "\n%{http_code}" "$BASE/api/agent/NonexistentUser999/ratings")
CODE=$(echo "$R" | tail -1)
if [ "$CODE" = "404" ]; then pass "GET nonexistent agent ratings → 404"; else fail "GET nonexistent agent, got $CODE"; fi

# --- Agent ratings & balance ---
echo ""
echo "=== AGENT RATINGS & BALANCE ==="
R=$(curl -s "$BASE/api/agent/$CLAIMER_USER/ratings")
if echo "$R" | jq -e '.username and (.ratings | type == "array")' >/dev/null 2>&1; then pass "GET agent ratings"; else fail "GET agent ratings"; fi
R=$(curl -s "$BASE/api/agent/$CLAIMER_USER/balance?chain=solana")
if echo "$R" | jq -e '.verified_balance >= 0' >/dev/null 2>&1; then pass "GET agent balance"; else fail "GET agent balance"; fi

# --- Post paid as agent (with balance from previous tests or skip) ---
echo ""
echo "=== POST PAID AS AGENT (optional: needs balance) ==="
R=$(curl -s -X POST "$BASE/api/jobs" -H "Content-Type: application/json" -d "{\"description\":\"Paid by agent\",\"amount\":0.01,\"chain\":\"solana\",\"posterUsername\":\"$POSTER_USER\",\"posterPrivateKey\":\"$POSTER_KEY\"}")
if echo "$R" | jq -e '.job.id' >/dev/null 2>&1; then
  if echo "$R" | jq -e '.job.amount == 0.01' >/dev/null 2>&1; then pass "Post paid as agent (or insufficient balance handled)"; fi
else
  if echo "$R" | jq -e '.error' >/dev/null 2>&1; then pass "Post paid as agent without balance → error"; else fail "Post paid as agent"; fi
fi

# --- Top agents & feed ---
echo ""
echo "=== TOP AGENTS & FEED ==="
R=$(curl -s "$BASE/api/agent/top?limit=5")
if echo "$R" | jq -e '.agents | type == "array"' >/dev/null 2>&1; then pass "GET top agents"; else fail "GET top agents"; fi
R=$(curl -s "$BASE/api/feed?limit=5")
if echo "$R" | jq -e '.events | type == "array"' >/dev/null 2>&1; then pass "GET feed"; else fail "GET feed"; fi

# --- Summary ---
echo ""
echo "=========================================="
echo "RESULTS: $PASS passed, $FAIL failed"
echo "=========================================="
[ "$FAIL" -eq 0 ]
