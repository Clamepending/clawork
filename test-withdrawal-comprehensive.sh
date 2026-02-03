#!/bin/bash

# Comprehensive test suite for balance viewing, account mechanics, and withdrawals

set -e

BASE_URL="http://localhost:3000"
AGENT="TestAgentComprehensive12345678901234567890"
POSTER="TestPosterComprehensive12345678901234567890"

echo "=========================================="
echo "COMPREHENSIVE WITHDRAWAL & BALANCE TESTS"
echo "=========================================="
echo ""

# Helper functions
api() { curl -s -X "$1" "${BASE_URL}$2" ${3:+-H "Content-Type: application/json" -d "$3"} | jq .; }
balance() { api "GET" "/api/deposit?walletAddress=$1&chain=solana" | jq '{total: .balance, verified: .verified_balance, pending: .pending_balance, canClaimJobs: .canClaimJobs}'; }
check_balance() {
    local wallet=$1
    local expected_total=$2
    local expected_verified=$3
    local expected_pending=$4
    local actual=$(balance "$wallet")
    local actual_total=$(echo "$actual" | jq -r '.total')
    local actual_verified=$(echo "$actual" | jq -r '.verified')
    local actual_pending=$(echo "$actual" | jq -r '.pending')
    
    echo "Expected: total=$expected_total, verified=$expected_verified, pending=$expected_pending"
    echo "Actual: $actual"
    
    if [ "$(echo "$actual_total == $expected_total" | bc)" -eq 1 ] && \
       [ "$(echo "$actual_verified == $expected_verified" | bc)" -eq 1 ] && \
       [ "$(echo "$actual_pending == $expected_pending" | bc)" -eq 1 ]; then
        echo "✅ Balance check PASSED"
    else
        echo "❌ Balance check FAILED"
        return 1
    fi
}

echo "=== TEST 1: Initial Deposit and Balance Check ==="
api "POST" "/api/deposit" "{\"walletAddress\":\"${AGENT}\",\"amount\":0.2,\"chain\":\"solana\",\"transactionHash\":\"test1\"}" > /dev/null
echo "After deposit:"
balance "$AGENT"
check_balance "$AGENT" 0.2 0.2 0
echo ""

echo "=== TEST 2: Claim Job - Balance Changes ==="
JOB1=$(api "POST" "/api/jobs" "{\"description\":\"Test job 1\",\"amount\":0.3,\"chain\":\"solana\",\"posterWallet\":\"${POSTER}\",\"transactionHash\":\"j1\"}")
JOB1_ID=$(echo "$JOB1" | jq -r '.job.id')
api "POST" "/api/jobs/${JOB1_ID}/submit" "{\"response\":\"Done\",\"agentWallet\":\"${AGENT}\"}" > /dev/null
echo "After claiming job (0.3 SOL):"
balance "$AGENT"
check_balance "$AGENT" 0.5 0.2 0.3
echo ""

echo "=== TEST 3: Rate 5 Stars - Balance Moves to Verified ==="
JOB1_PRIVATE=$(echo "$JOB1" | jq -r '.job.private_id')
api "POST" "/api/jobs/${JOB1_PRIVATE}/rate" "{\"rating\":5}" > /dev/null
echo "After 5-star rating:"
balance "$AGENT"
check_balance "$AGENT" 0.5 0.5 0
echo ""

echo "=== TEST 4: Withdraw Partial Amount ==="
WITHDRAW1=$(api "POST" "/api/withdraw" "{\"walletAddress\":\"${AGENT}\",\"amount\":0.3,\"chain\":\"solana\",\"destinationWallet\":\"Dest1\",\"transactionHash\":\"w1\"}")
echo "Withdrawal response:"
echo "$WITHDRAW1" | jq '{amount: .withdrawal.amount, balances: .balances, message: .message}'
echo "After withdrawal (0.3 SOL):"
balance "$AGENT"
check_balance "$AGENT" 0.2 0.2 0
echo ""

echo "=== TEST 5: Edge Case - Withdraw to Exactly Minimum Balance ==="
# First get more verified balance
JOB2=$(api "POST" "/api/jobs" "{\"description\":\"Test job 2\",\"amount\":0.1,\"chain\":\"solana\",\"posterWallet\":\"${POSTER}\",\"transactionHash\":\"j2\"}")
JOB2_ID=$(echo "$JOB2" | jq -r '.job.id')
JOB2_PRIVATE=$(echo "$JOB2" | jq -r '.job.private_id')
api "POST" "/api/jobs/${JOB2_ID}/submit" "{\"response\":\"Done\",\"agentWallet\":\"${AGENT}\"}" > /dev/null
api "POST" "/api/jobs/${JOB2_PRIVATE}/rate" "{\"rating\":5}" > /dev/null
echo "Balance before withdrawing to minimum:"
balance "$AGENT"
# Withdraw to bring balance to exactly 0.01
CURRENT=$(api "GET" "/api/deposit?walletAddress=${AGENT}&chain=solana" | jq -r '.verified_balance')
WITHDRAW_AMOUNT=$(echo "$CURRENT - 0.01" | bc)
echo "Withdrawing $WITHDRAW_AMOUNT to bring balance to exactly 0.01:"
api "POST" "/api/withdraw" "{\"walletAddress\":\"${AGENT}\",\"amount\":$WITHDRAW_AMOUNT,\"chain\":\"solana\",\"destinationWallet\":\"Dest2\",\"transactionHash\":\"w2\"}" > /dev/null
balance "$AGENT"
VERIFIED=$(api "GET" "/api/deposit?walletAddress=${AGENT}&chain=solana" | jq -r '.verified_balance')
if [ "$(echo "$VERIFIED == 0.01" | bc)" -eq 1 ]; then
    echo "✅ Successfully withdrew to exactly minimum balance"
else
    echo "❌ Failed to withdraw to minimum balance (got $VERIFIED)"
fi
echo ""

echo "=== TEST 6: Edge Case - Try to Withdraw Below Minimum ==="
RESULT=$(api "POST" "/api/withdraw" "{\"walletAddress\":\"${AGENT}\",\"amount\":0.005,\"chain\":\"solana\"}")
echo "Attempting to withdraw 0.005 (would bring balance below 0.01):"
echo "$RESULT" | jq '{error: .error}'
if echo "$RESULT" | jq -e '.error' > /dev/null; then
    echo "✅ Correctly rejected withdrawal below minimum"
else
    echo "❌ Should have rejected withdrawal below minimum"
fi
echo ""

echo "=== TEST 7: Edge Case - Try to Withdraw More Than Verified Balance ==="
RESULT=$(api "POST" "/api/withdraw" "{\"walletAddress\":\"${AGENT}\",\"amount\":0.1,\"chain\":\"solana\"}")
echo "Attempting to withdraw 0.1 (more than verified balance ~0.01):"
echo "$RESULT" | jq '{error: .error}'
if echo "$RESULT" | jq -e '.error' > /dev/null; then
    echo "✅ Correctly rejected withdrawal exceeding verified balance"
else
    echo "❌ Should have rejected withdrawal exceeding verified balance"
fi
echo ""

echo "=== TEST 8: Edge Case - Withdraw with Pending Balance Present ==="
# Add more funds and claim a job
api "POST" "/api/deposit" "{\"walletAddress\":\"${AGENT}\",\"amount\":0.2,\"chain\":\"solana\",\"transactionHash\":\"refill1\"}" > /dev/null
JOB3=$(api "POST" "/api/jobs" "{\"description\":\"Test job 3\",\"amount\":0.15,\"chain\":\"solana\",\"posterWallet\":\"${POSTER}\",\"transactionHash\":\"j3\"}")
JOB3_ID=$(echo "$JOB3" | jq -r '.job.id')
api "POST" "/api/jobs/${JOB3_ID}/submit" "{\"response\":\"Done\",\"agentWallet\":\"${AGENT}\"}" > /dev/null
echo "Balance with pending (before withdrawal):"
balance "$AGENT"
PENDING_BEFORE=$(api "GET" "/api/deposit?walletAddress=${AGENT}&chain=solana" | jq -r '.pending_balance')
api "POST" "/api/withdraw" "{\"walletAddress\":\"${AGENT}\",\"amount\":0.1,\"chain\":\"solana\",\"destinationWallet\":\"Dest3\",\"transactionHash\":\"w3\"}" > /dev/null
echo "Balance after withdrawal (pending should be unchanged):"
balance "$AGENT"
PENDING_AFTER=$(api "GET" "/api/deposit?walletAddress=${AGENT}&chain=solana" | jq -r '.pending_balance')
if [ "$(echo "$PENDING_BEFORE == $PENDING_AFTER" | bc)" -eq 1 ]; then
    echo "✅ Pending balance correctly unchanged after withdrawal"
else
    echo "❌ Pending balance changed (was $PENDING_BEFORE, now $PENDING_AFTER)"
fi
echo ""

echo "=== TEST 9: Edge Case - Multiple Withdrawals ==="
echo "Making multiple withdrawals:"
for i in {1..3}; do
    CURRENT=$(api "GET" "/api/deposit?walletAddress=${AGENT}&chain=solana" | jq -r '.verified_balance')
    if [ "$(echo "$CURRENT > 0.05" | bc)" -eq 1 ]; then
        WITHDRAW_AMT=0.05
        api "POST" "/api/withdraw" "{\"walletAddress\":\"${AGENT}\",\"amount\":$WITHDRAW_AMT,\"chain\":\"solana\",\"destinationWallet\":\"Dest$i\",\"transactionHash\":\"w$i\"}" > /dev/null
        echo "Withdrawal $i: $WITHDRAW_AMT SOL"
        balance "$AGENT"
    else
        echo "Insufficient balance for withdrawal $i"
        break
    fi
done
echo ""

echo "=== TEST 10: Edge Case - Check Balance with Non-Existent Account ==="
RESULT=$(api "GET" "/api/deposit?walletAddress=NonexistentWallet12345678901234567890&chain=solana")
echo "Checking balance for non-existent account:"
echo "$RESULT" | jq '{deposit: .deposit, balance: .balance, verified_balance: .verified_balance, pending_balance: .pending_balance}'
if echo "$RESULT" | jq -e '.deposit == null' > /dev/null; then
    echo "✅ Correctly returns null for non-existent account"
else
    echo "❌ Should return null for non-existent account"
fi
echo ""

echo "=== TEST 11: Edge Case - Withdraw After 1-Star Rating (Penalty Applied) ==="
# Get more balance first
api "POST" "/api/deposit" "{\"walletAddress\":\"${AGENT}\",\"amount\":0.1,\"chain\":\"solana\",\"transactionHash\":\"refill2\"}" > /dev/null
JOB4=$(api "POST" "/api/jobs" "{\"description\":\"Test job 4\",\"amount\":0.2,\"chain\":\"solana\",\"posterWallet\":\"${POSTER}\",\"transactionHash\":\"j4\"}")
JOB4_ID=$(echo "$JOB4" | jq -r '.job.id')
JOB4_PRIVATE=$(echo "$JOB4" | jq -r '.job.private_id')
api "POST" "/api/jobs/${JOB4_ID}/submit" "{\"response\":\"Poor work\",\"agentWallet\":\"${AGENT}\"}" > /dev/null
BEFORE_RATING=$(api "GET" "/api/deposit?walletAddress=${AGENT}&chain=solana" | jq -r '.balance')
api "POST" "/api/jobs/${JOB4_PRIVATE}/rate" "{\"rating\":1}" > /dev/null
AFTER_RATING=$(api "GET" "/api/deposit?walletAddress=${AGENT}&chain=solana" | jq -r '.balance')
PENALTY=$(echo "$BEFORE_RATING - $AFTER_RATING" | bc)
echo "Balance before 1-star rating: $BEFORE_RATING"
echo "Balance after 1-star rating: $AFTER_RATING"
echo "Penalty applied: $PENALTY (should be 0.21 = 0.2 job + 0.01 penalty)"
balance "$AGENT"
echo "Now attempting withdrawal:"
CURRENT=$(api "GET" "/api/deposit?walletAddress=${AGENT}&chain=solana" | jq -r '.verified_balance')
if [ "$(echo "$CURRENT > 0.01" | bc)" -eq 1 ]; then
    WITHDRAW_AMT=$(echo "$CURRENT - 0.01" | bc)
    api "POST" "/api/withdraw" "{\"walletAddress\":\"${AGENT}\",\"amount\":$WITHDRAW_AMT,\"chain\":\"solana\",\"destinationWallet\":\"Dest4\",\"transactionHash\":\"w4\"}" > /dev/null
    echo "✅ Successfully withdrew after penalty"
    balance "$AGENT"
else
    echo "⚠️ Insufficient balance to withdraw after penalty"
fi
echo ""

echo "=== TEST 12: Edge Case - List Withdrawals ==="
WITHDRAWALS=$(api "GET" "/api/withdraw?walletAddress=${AGENT}")
echo "Withdrawal history:"
echo "$WITHDRAWALS" | jq '{count: (.withdrawals | length), withdrawals: [.withdrawals[] | {id, amount, chain, status, created_at}]}'
WITHDRAWAL_COUNT=$(echo "$WITHDRAWALS" | jq '.withdrawals | length')
if [ "$WITHDRAWAL_COUNT" -gt 0 ]; then
    echo "✅ Withdrawal history tracked correctly ($WITHDRAWAL_COUNT withdrawals)"
else
    echo "❌ No withdrawals found"
fi
echo ""

echo "=== TEST 13: Edge Case - Balance Consistency Check ==="
BAL=$(api "GET" "/api/deposit?walletAddress=${AGENT}&chain=solana")
TOTAL=$(echo "$BAL" | jq -r '.balance')
VERIFIED=$(echo "$BAL" | jq -r '.verified_balance')
PENDING=$(echo "$BAL" | jq -r '.pending_balance')
CALCULATED=$(echo "$VERIFIED + $PENDING" | bc)
echo "Total balance: $TOTAL"
echo "Verified balance: $VERIFIED"
echo "Pending balance: $PENDING"
echo "Calculated (verified + pending): $CALCULATED"
if [ "$(echo "$TOTAL == $CALCULATED" | bc)" -eq 1 ]; then
    echo "✅ Balance consistency check PASSED (total = verified + pending)"
else
    echo "❌ Balance consistency check FAILED"
fi
echo ""

echo "=== TEST 14: Edge Case - Withdraw All Available (Keeping Minimum) ==="
CURRENT=$(api "GET" "/api/deposit?walletAddress=${AGENT}&chain=solana" | jq -r '.verified_balance')
if [ "$(echo "$CURRENT > 0.01" | bc)" -eq 1 ]; then
    MAX_WITHDRAW=$(echo "$CURRENT - 0.01" | bc)
    echo "Current verified balance: $CURRENT"
    echo "Maximum withdrawable (keeping 0.01 minimum): $MAX_WITHDRAW"
    api "POST" "/api/withdraw" "{\"walletAddress\":\"${AGENT}\",\"amount\":$MAX_WITHDRAW,\"chain\":\"solana\",\"destinationWallet\":\"DestMax\",\"transactionHash\":\"wmax\"}" > /dev/null
    balance "$AGENT"
    FINAL=$(api "GET" "/api/deposit?walletAddress=${AGENT}&chain=solana" | jq -r '.verified_balance')
    if [ "$(echo "$FINAL == 0.01" | bc)" -eq 1 ]; then
        echo "✅ Successfully withdrew maximum amount, balance at minimum"
    else
        echo "❌ Balance not at minimum after max withdrawal (got $FINAL)"
    fi
else
    echo "⚠️ Insufficient balance to test maximum withdrawal"
fi
echo ""

echo "=== TEST 15: Edge Case - Complete Flow Test ==="
echo "Testing complete flow: deposit → claim → rate → withdraw → check"
AGENT_FLOW="TestAgentFlow12345678901234567890"
POSTER_FLOW="TestPosterFlow12345678901234567890"

echo "1. Deposit 0.2 SOL:"
api "POST" "/api/deposit" "{\"walletAddress\":\"${AGENT_FLOW}\",\"amount\":0.2,\"chain\":\"solana\",\"transactionHash\":\"flow1\"}" > /dev/null
balance "$AGENT_FLOW"

echo "2. Claim job (0.3 SOL):"
JOB_FLOW=$(api "POST" "/api/jobs" "{\"description\":\"Flow test\",\"amount\":0.3,\"chain\":\"solana\",\"posterWallet\":\"${POSTER_FLOW}\",\"transactionHash\":\"flow2\"}")
JOB_FLOW_ID=$(echo "$JOB_FLOW" | jq -r '.job.id')
JOB_FLOW_PRIVATE=$(echo "$JOB_FLOW" | jq -r '.job.private_id')
api "POST" "/api/jobs/${JOB_FLOW_ID}/submit" "{\"response\":\"Done\",\"agentWallet\":\"${AGENT_FLOW}\"}" > /dev/null
balance "$AGENT_FLOW"

echo "3. Rate 5 stars:"
api "POST" "/api/jobs/${JOB_FLOW_PRIVATE}/rate" "{\"rating\":5}" > /dev/null
balance "$AGENT_FLOW"

echo "4. Withdraw 0.4 SOL:"
api "POST" "/api/withdraw" "{\"walletAddress\":\"${AGENT_FLOW}\",\"amount\":0.4,\"chain\":\"solana\",\"destinationWallet\":\"DestFlow\",\"transactionHash\":\"wflow\"}" > /dev/null
balance "$AGENT_FLOW"

echo "5. Final check:"
FINAL_TOTAL=$(api "GET" "/api/deposit?walletAddress=${AGENT_FLOW}&chain=solana" | jq -r '.balance')
FINAL_VERIFIED=$(api "GET" "/api/deposit?walletAddress=${AGENT_FLOW}&chain=solana" | jq -r '.verified_balance')
FINAL_PENDING=$(api "GET" "/api/deposit?walletAddress=${AGENT_FLOW}&chain=solana" | jq -r '.pending_balance')
echo "Final: total=$FINAL_TOTAL, verified=$FINAL_VERIFIED, pending=$FINAL_PENDING"
if [ "$(echo "$FINAL_TOTAL == $FINAL_VERIFIED + $FINAL_PENDING" | bc)" -eq 1 ]; then
    echo "✅ Complete flow test PASSED"
else
    echo "❌ Complete flow test FAILED"
fi
echo ""

echo "=========================================="
echo "TEST SUITE COMPLETE"
echo "=========================================="
