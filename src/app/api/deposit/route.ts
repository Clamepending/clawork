import { NextResponse } from "next/server";
import { createDeposit, getDeposit, getWalletBalance, getWalletBalances } from "@/lib/db";

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

const REQUIRED_COLLATERAL = 0.1; // 0.1 SOL

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  if (!payload) {
    return badRequest("Invalid JSON body.");
  }

  const walletAddress =
    typeof payload.walletAddress === "string" ? payload.walletAddress.trim() : "";
  const amount = Number(payload.amount);
  const chain = typeof payload.chain === "string" ? payload.chain.trim().toLowerCase() : "";
  const transactionHash =
    typeof payload.transactionHash === "string" ? payload.transactionHash.trim() : null;

  if (!walletAddress) {
    return badRequest("Wallet address is required.");
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return badRequest("Amount must be a positive number.");
  }
  if (!chain) {
    return badRequest("Chain is required.");
  }

  const masterWallet = process.env.MASTER_WALLET_ADDRESS;
  if (!masterWallet) {
    return NextResponse.json(
      { error: "MASTER_WALLET_ADDRESS is not configured." },
      { status: 500 }
    );
  }

  // Check if deposit meets minimum collateral requirement
  if (amount < REQUIRED_COLLATERAL) {
    return badRequest(
      `Minimum collateral required is ${REQUIRED_COLLATERAL} ${chain}. Received ${amount}.`
    );
  }

  // Record the deposit
  const deposit = await createDeposit({
    walletAddress,
    amount,
    chain,
    transactionHash,
    status: "confirmed"
  });

  const existingDeposit = await getDeposit(walletAddress, chain);
  const balances = await getWalletBalances(walletAddress, chain);

  return NextResponse.json({
    deposit: {
      id: deposit.id,
      wallet_address: walletAddress,
      amount: existingDeposit?.amount || amount,
      balance: balances.balance,
      pending_balance: balances.pending_balance,
      verified_balance: balances.verified_balance,
      chain,
      transaction_hash: transactionHash,
      status: "confirmed",
      created_at: deposit.created_at
    },
    message: `Collateral deposit recorded. Your balances: ${balances.verified_balance.toFixed(4)} verified (withdrawable), ${balances.pending_balance.toFixed(4)} pending (awaiting rating), ${balances.balance.toFixed(4)} total ${chain}. You can claim jobs as long as your balance is at least 0.01 ${chain} (to cover potential penalties).`
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const walletAddress = searchParams.get("walletAddress") || undefined;
  const chain = searchParams.get("chain") || undefined;

  if (walletAddress && chain) {
    const { getDeposit, getWalletBalances } = await import("@/lib/db");
    const deposit = await getDeposit(walletAddress, chain);
    if (!deposit) {
      return NextResponse.json({ 
        deposit: null, 
        hasCollateral: false, 
        balance: 0,
        pending_balance: 0,
        verified_balance: 0
      });
    }
    const balances = await getWalletBalances(walletAddress, chain);
    return NextResponse.json({
      deposit,
      balance: balances.balance,
      pending_balance: balances.pending_balance,
      verified_balance: balances.verified_balance,
      hasCollateral: deposit.status === "confirmed" && deposit.amount >= REQUIRED_COLLATERAL,
      canClaimJobs: balances.balance >= 0.01 // Minimum balance = penalty amount
    });
  }

  const { listDeposits } = await import("@/lib/db");
  const deposits = await listDeposits(walletAddress);
  return NextResponse.json({ deposits });
}
