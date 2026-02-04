#!/bin/bash

# System test using only @master_bounty and @master_test.
# Usage: MASTER_BOUNTY_PRIVATE_KEY=... MASTER_TEST_PRIVATE_KEY=... [BASE_URL=http://localhost:3000] ./test-system.sh

set -e

BASE_URL="${BASE_URL:-http://localhost:3000}"
POSTER_USER="master_bounty"
CLAIMER_USER="master_test"
POSTER_KEY="${MASTER_BOUNTY_PRIVATE_KEY:?Set MASTER_BOUNTY_PRIVATE_KEY}"
CLAIMER_KEY="${MASTER_TEST_PRIVATE_KEY:?Set MASTER_TEST_PRIVATE_KEY}"

echo "=========================================="
echo "SYSTEM TEST (@master_bounty / @master_test)"
echo "=========================================="
echo ""

api_call() {
    local method=$1
    local endpoint=$2
    local data=$3
    if [ -z "$data" ]; then
        curl -s -X "$method" "${BASE_URL}${endpoint}"
    else
        curl -s -X "$method" "${BASE_URL}${endpoint}" \
            -H "Content-Type: application/json" \
            -d "$data"
    fi
}

# Agent balance (username-based)
get_agent_balance() {
    api_call "GET" "/api/agent/${CLAIMER_USER}/balance?chain=solana" | jq '{balance, verified_balance, pending_balance}'
}

echo "=== TEST 1: Human posts free job ==="
JOB1=$(api_call "POST" "/api/jobs" '{"description":"System test job 1","amount":0,"chain":"solana"}')
JOB1_ID=$(echo "$JOB1" | jq -r '.job.id')
JOB1_PRIVATE=$(echo "$JOB1" | jq -r '.job.private_id')
echo "Job ID: $JOB1_ID"
echo ""

echo "=== TEST 2: master_test claims job ==="
api_call "POST" "/api/jobs/${JOB1_ID}/submit" "{\"response\":\"Completed work\",\"agentUsername\":\"$CLAIMER_USER\",\"agentPrivateKey\":\"$CLAIMER_KEY\"}" | jq '{submission_id: .submission.id}'
echo ""

echo "=== TEST 3: Human rates 5 stars ==="
api_call "POST" "/api/jobs/${JOB1_PRIVATE}/rate" '{"rating":5}' | jq '{message: .message, agent_balances: .agent_balances}'
echo ""

echo "=== TEST 4: master_bounty posts free job ==="
JOB2=$(api_call "POST" "/api/jobs" "{\"description\":\"System test job 2\",\"amount\":0,\"chain\":\"solana\",\"posterUsername\":\"$POSTER_USER\",\"posterPrivateKey\":\"$POSTER_KEY\"}")
JOB2_ID=$(echo "$JOB2" | jq -r '.job.id')
JOB2_PRIVATE=$(echo "$JOB2" | jq -r '.job.private_id')
echo "Job ID: $JOB2_ID"
echo ""

echo "=== TEST 5: master_test claims second job ==="
api_call "POST" "/api/jobs/${JOB2_ID}/submit" "{\"response\":\"Completed work 2\",\"agentUsername\":\"$CLAIMER_USER\",\"agentPrivateKey\":\"$CLAIMER_KEY\"}" > /dev/null
echo ""

echo "=== TEST 6: master_bounty rates 5 stars ==="
api_call "POST" "/api/jobs/${JOB2_PRIVATE}/rate" "{\"rating\":5,\"posterUsername\":\"$POSTER_USER\",\"posterPrivateKey\":\"$POSTER_KEY\"}" | jq '{submission: .submission.rating}'
echo ""

echo "=== TEST 7: master_test ratings ==="
api_call "GET" "/api/agent/${CLAIMER_USER}/ratings" | jq '{average_rating, total_rated_jobs, breakdown}'
echo ""

echo "=== TEST 8: master_test balance ==="
get_agent_balance
echo ""

echo "=== TEST SUMMARY ==="
echo "Final @master_test balance:"
get_agent_balance
echo ""
echo "Final @master_test ratings:"
api_call "GET" "/api/agent/${CLAIMER_USER}/ratings" | jq '{average_rating, total_rated_jobs}'
