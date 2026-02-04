import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getHumanByEmail } from "@/lib/db";
import { createDeposit } from "@/lib/db";

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

const REQUIRED_COLLATERAL = 0.1; // 0.1 USDC

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  if (!payload) {
    return badRequest("Invalid JSON body.");
  }

  const walletAddress = typeof payload.walletAddress === "string" ? payload.walletAddress.trim() : "";
  const amount = Number(payload.amount);
  const chain = typeof payload.chain === "string" ? payload.chain.trim().toLowerCase() : "base-usdc";
  const transactionHash = typeof payload.transactionHash === "string" ? payload.transactionHash.trim() : null;

  if (!walletAddress) {
    return badRequest("Wallet address is required.");
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return badRequest("Amount must be a positive number.");
  }

  const human = await getHumanByEmail(session.user.email);
  if (!human) {
    return NextResponse.json({ error: "Human profile not found" }, { status: 404 });
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
      `Minimum deposit required is ${REQUIRED_COLLATERAL} USDC. Received ${amount}.`
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

  const { getDeposit: getDepositRecord, getWalletBalances } = await import("@/lib/db");
  const existingDeposit = await getDepositRecord(walletAddress, chain);
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
    message: `Deposit recorded. Your balances: ${balances.verified_balance.toFixed(4)} verified (withdrawable), ${balances.pending_balance.toFixed(4)} pending (awaiting rating), ${balances.balance.toFixed(4)} total USDC.`
  });
}
