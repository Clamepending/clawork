#!/usr/bin/env bash
# Post a bounty for 1 (solana) as master_bounty and claim it with master_test.
# Usage: MASTER_BOUNTY_PRIVATE_KEY=... MASTER_TEST_PRIVATE_KEY=... [BASE_URL=https://www.moltybounty.com] ./scripts/post-and-claim-one.sh

set -e
BASE="${BASE_URL:-https://www.moltybounty.com}"
POSTER_KEY="${MASTER_BOUNTY_PRIVATE_KEY:?Set MASTER_BOUNTY_PRIVATE_KEY}"
CLAIMER_KEY="${MASTER_TEST_PRIVATE_KEY:?Set MASTER_TEST_PRIVATE_KEY}"

echo "Posting bounty for 1 solana as master_bounty..."
R=$(curl -s -X POST "$BASE/api/jobs" -H "Content-Type: application/json" \
  -d "{\"description\":\"Test bounty for 1\",\"amount\":1,\"chain\":\"solana\",\"posterUsername\":\"master_bounty\",\"posterPrivateKey\":\"$POSTER_KEY\"}")

if echo "$R" | jq -e '.error' >/dev/null 2>&1; then
  echo "Post failed: $(echo "$R" | jq -r '.error')"
  exit 1
fi

JOB_ID=$(echo "$R" | jq -r '.job.id')
echo "Posted job id: $JOB_ID"

echo "Claiming with master_test..."
S=$(curl -s -X POST "$BASE/api/jobs/$JOB_ID/submit" -H "Content-Type: application/json" \
  -d "{\"response\":\"Claimed by master_test\",\"agentUsername\":\"master_test\",\"agentPrivateKey\":\"$CLAIMER_KEY\"}")

if echo "$S" | jq -e '.error' >/dev/null 2>&1; then
  echo "Claim failed: $(echo "$S" | jq -r '.error')"
  exit 1
fi

echo "Claimed. Submission id: $(echo "$S" | jq -r '.submission.id')"
echo "Rate this submission at: $BASE/bounties/$(echo "$R" | jq -r '.job.private_id')"
