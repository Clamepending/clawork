#!/bin/bash

# Comprehensive system test script
# Tests all edge cases and use cases for the clawork system

set -e

BASE_URL="http://localhost:3000"
AGENT_WALLET="TestAgentSystem12345678901234567890"
POSTER_WALLET="TestPosterSystem12345678901234567890"

echo "=========================================="
echo "COMPREHENSIVE SYSTEM TEST"
echo "=========================================="
echo ""

# Helper function to make API calls
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

# Helper to get balance
get_balance() {
    local wallet=$1
    api_call "GET" "/api/deposit?walletAddress=${wallet}&chain=solana" | jq '{total: .balance, pending: .pending_balance, verified: .verified_balance}'
}

echo "=== TEST 1: Agent deposits collateral ==="
RESPONSE=$(api_call "POST" "/api/deposit" "{\"walletAddress\":\"${AGENT_WALLET}\",\"amount\":0.15,\"chain\":\"solana\",\"transactionHash\":\"deposit_001\"}")
echo "$RESPONSE" | jq '{wallet: .deposit.wallet_address, total: .deposit.balance, pending: .deposit.pending_balance, verified: .deposit.verified_balance}'
echo ""

echo "=== TEST 2: Poster posts job ==="
JOB_RESPONSE=$(api_call "POST" "/api/jobs" "{\"description\":\"System test job 1\",\"amount\":0.5,\"chain\":\"solana\",\"posterWallet\":\"${POSTER_WALLET}\",\"transactionHash\":\"post_001\"}")
JOB_PRIVATE_ID=$(echo "$JOB_RESPONSE" | jq -r '.job.private_id')
JOB_ID=$(echo "$JOB_RESPONSE" | jq -r '.job.id')
echo "Job ID: $JOB_ID"
echo "Private ID: $JOB_PRIVATE_ID"
echo ""

echo "=== TEST 3: Agent claims job ==="
SUBMIT_RESPONSE=$(api_call "POST" "/api/jobs/${JOB_ID}/submit" "{\"response\":\"Completed work\",\"agentWallet\":\"${AGENT_WALLET}\"}")
echo "$SUBMIT_RESPONSE" | jq '{submission_id: .submission.id}'
echo ""
echo "Agent balance after claiming:"
get_balance "$AGENT_WALLET"
echo "Expected: total=0.65, pending=0.5, verified=0"
echo ""

echo "=== TEST 4: Poster rates 5 stars ==="
RATE_RESPONSE=$(api_call "POST" "/api/jobs/${JOB_PRIVATE_ID}/rate" "{\"rating\":5}")
echo "$RATE_RESPONSE" | jq '{message: .message, agent_balances: .agent_balances}'
echo ""
echo "Agent balance after 5-star rating:"
get_balance "$AGENT_WALLET"
echo "Expected: total=0.65, pending=0, verified=0.5"
echo ""

echo "=== TEST 5: Poster posts second job ==="
JOB2_RESPONSE=$(api_call "POST" "/api/jobs" "{\"description\":\"System test job 2\",\"amount\":0.3,\"chain\":\"solana\",\"posterWallet\":\"${POSTER_WALLET}\",\"transactionHash\":\"post_002\"}")
JOB2_PRIVATE_ID=$(echo "$JOB2_RESPONSE" | jq -r '.job.private_id')
JOB2_ID=$(echo "$JOB2_RESPONSE" | jq -r '.job.id')
echo "Job ID: $JOB2_ID"
echo ""

echo "=== TEST 6: Agent claims second job ==="
api_call "POST" "/api/jobs/${JOB2_ID}/submit" "{\"response\":\"Completed work 2\",\"agentWallet\":\"${AGENT_WALLET}\"}" > /dev/null
echo "Agent balance after claiming:"
get_balance "$AGENT_WALLET"
echo "Expected: total=0.95, pending=0.3, verified=0.5"
echo ""

echo "=== TEST 7: Poster rates 1 star ==="
api_call "POST" "/api/jobs/${JOB2_PRIVATE_ID}/rate" "{\"rating\":1}" > /dev/null
echo "Agent balance after 1-star rating:"
get_balance "$AGENT_WALLET"
echo "Expected: total=0.64 (0.65 - 0.01 penalty), pending=0, verified=0.5"
echo ""

echo "=== TEST 8: Check agent ratings ==="
RATINGS=$(api_call "GET" "/api/agent/${AGENT_WALLET}/ratings")
echo "$RATINGS" | jq '{average_rating, total_rated_jobs, breakdown}'
echo ""

echo "=== TEST 9: Poster collateral returns ==="
POSTER_BALANCE=$(api_call "GET" "/api/deposit?walletAddress=${POSTER_WALLET}&chain=solana")
echo "Poster balance:"
echo "$POSTER_BALANCE" | jq '{total: .balance, verified: .verified_balance}'
echo "Expected: total=0.002 (2 x 0.001 collateral returns)"
echo ""

echo "=== TEST 10: Test zero balance blocking ==="
echo "Current agent balance:"
get_balance "$AGENT_WALLET"
echo ""

echo "Posting small job to test claiming:"
JOB3_RESPONSE=$(api_call "POST" "/api/jobs" "{\"description\":\"Small test\",\"amount\":0.01,\"chain\":\"solana\",\"posterWallet\":\"${POSTER_WALLET}\",\"transactionHash\":\"post_003\"}")
JOB3_ID=$(echo "$JOB3_RESPONSE" | jq -r '.job.id')
echo "Trying to claim job:"
CLAIM_RESPONSE=$(api_call "POST" "/api/jobs/${JOB3_ID}/submit" "{\"response\":\"Test\",\"agentWallet\":\"${AGENT_WALLET}\"}")
echo "$CLAIM_RESPONSE" | jq '{submission_id: .submission.id, error: .error}'
echo ""

echo "=== TEST SUMMARY ==="
echo "Final agent balance:"
get_balance "$AGENT_WALLET"
echo ""
echo "Final poster balance:"
api_call "GET" "/api/deposit?walletAddress=${POSTER_WALLET}&chain=solana" | jq '{total: .balance, verified: .verified_balance}'
echo ""
echo "Agent ratings:"
api_call "GET" "/api/agent/${AGENT_WALLET}/ratings" | jq '{average_rating, total_rated_jobs, breakdown}'
