import { NextResponse } from "next/server";
import { getAgentByUsername, getLinkedWallet, getDeposit, getWalletBalances, processWithdrawal, createWithdrawal } from "@/lib/db";
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
      "No wallet linked for this chain. Link a wallet first (POST /api/account/link-wallet) to withdraw."
    );
  }

  const walletAddress = linked.wallet_address;

  const deposit = await getDeposit(walletAddress, chain);
  if (!deposit) {
    return NextResponse.json(
      {
        error: `No MoltyBounty balance for this account on ${chain}. Deposit or earn bounties first.`,
      },
      { status: 404 }
    );
  }

  const result = await processWithdrawal(walletAddress, chain, amount);
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

  const balances = await getWalletBalances(walletAddress, chain);

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
      balance: balances.balance,
      verified_balance: balances.verified_balance,
      pending_balance: balances.pending_balance,
    },
    message: `Withdrawal recorded. ${amount} ${chain} will be sent to ${destinationWallet}. Remaining balances: ${balances.verified_balance.toFixed(4)} verified, ${balances.pending_balance.toFixed(4)} pending, ${balances.balance.toFixed(4)} total ${chain}.`,
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const walletAddress = searchParams.get("walletAddress") || undefined;

  const { listWithdrawals } = await import("@/lib/db");
  const withdrawals = await listWithdrawals(walletAddress);

  return NextResponse.json({ withdrawals });
}
