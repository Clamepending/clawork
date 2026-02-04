import { NextResponse } from "next/server";
import { getAgentByUsername, getLinkedWallet, getAgentBalances, processWithdrawalByAgent, createWithdrawal } from "@/lib/db";
import { verifyPrivateKey } from "@/lib/agent-auth";

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  if (!payload) {
    return badRequest("Invalid JSON body.");
  }

  const username =
    typeof payload.username === "string" ? payload.username.trim() : "";
  const accountSecretKey =
    typeof payload.accountSecretKey === "string" ? payload.accountSecretKey.trim() : "";
  // Allow legacy key name for backward compatibility
  const privateKey = accountSecretKey || (typeof payload.privateKey === "string" ? payload.privateKey.trim() : "");
  const destinationWallet =
    typeof payload.destinationWallet === "string" ? payload.destinationWallet.trim() : "";
  const amount = Number(payload.amount);
  const chain = typeof payload.chain === "string" ? payload.chain.trim().toLowerCase() : "";

  if (!username) {
    return badRequest("Username is required.");
  }
  if (!privateKey) {
    return badRequest("Account secret key (privateKey or accountSecretKey) is required.");
  }
  if (!destinationWallet) {
    return badRequest("Destination wallet (crypto address to receive funds) is required.");
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return badRequest("Amount must be a positive number.");
  }
  if (!chain) {
    return badRequest("Chain is required.");
  }

  const usernameLower = username.toLowerCase();
  const agent = await getAgentByUsername(usernameLower);
  if (!agent) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }
  if (!verifyPrivateKey(privateKey, agent.private_key_hash)) {
    return NextResponse.json({ error: "Invalid username or account secret key." }, { status: 401 });
  }

  const linked = await getLinkedWallet(agent.id, chain);
  if (!linked) {
    return badRequest(
      "No wallet linked for this chain. Link a wallet first (POST /api/account/link-wallet) to cash out."
    );
  }

  const walletAddress = linked.wallet_address;
  const balances = await getAgentBalances(agent.id, chain);
  if (balances.verified_balance < amount) {
    return NextResponse.json(
      {
        error: `Insufficient MoltyBounty balance. Verified: ${balances.verified_balance.toFixed(4)} USDC. Requested: ${amount}.`,
      },
      { status: 400 }
    );
  }

  const result = await processWithdrawalByAgent(agent.id, chain, amount);
  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: 400 }
    );
  }

  const withdrawal = await createWithdrawal({
    walletAddress,
    amount,
    chain,
    destinationWallet,
    transactionHash: null,
    status: "completed",
  });

  const balancesAfter = await getAgentBalances(agent.id, chain);

  return NextResponse.json({
    withdrawal: {
      id: withdrawal.id,
      wallet_address: walletAddress,
      amount,
      chain,
      destination_wallet: destinationWallet,
      transaction_hash: null,
      status: "completed",
      created_at: withdrawal.created_at,
    },
    balances: {
      balance: balancesAfter.balance,
      verified_balance: balancesAfter.verified_balance,
      pending_balance: balancesAfter.pending_balance,
    },
    message: `Withdrawal recorded. ${amount} USDC will be sent to ${destinationWallet}. Remaining balances: ${balancesAfter.verified_balance.toFixed(4)} verified, ${balancesAfter.pending_balance.toFixed(4)} pending, ${balancesAfter.balance.toFixed(4)} total USDC.`,
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const walletAddress = searchParams.get("walletAddress") || undefined;

  const { listWithdrawals } = await import("@/lib/db");
  const withdrawals = await listWithdrawals(walletAddress);

  return NextResponse.json({ withdrawals });
}
