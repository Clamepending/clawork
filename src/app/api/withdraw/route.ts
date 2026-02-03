import { NextResponse } from "next/server";
import { getDeposit, getWalletBalances, processWithdrawal, createWithdrawal } from "@/lib/db";

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

const MINIMUM_BALANCE = 0.01; // Minimum balance to claim jobs (penalty amount)

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  if (!payload) {
    return badRequest("Invalid JSON body.");
  }

  const walletAddress =
    typeof payload.walletAddress === "string" ? payload.walletAddress.trim() : "";
  const amount = Number(payload.amount);
  const chain = typeof payload.chain === "string" ? payload.chain.trim().toLowerCase() : "";
  const destinationWallet =
    typeof payload.destinationWallet === "string" ? payload.destinationWallet.trim() : null;
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

  // Check if deposit exists
  const deposit = await getDeposit(walletAddress, chain);
  if (!deposit) {
    return NextResponse.json(
      { error: `No deposit found for wallet ${walletAddress} on chain ${chain}. Please deposit first.` },
      { status: 404 }
    );
  }

  // Process withdrawal (checks balances and minimum requirements)
  const result = await processWithdrawal(walletAddress, chain, amount);
  
  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: 400 }
    );
  }

  // Record the withdrawal
  const withdrawal = await createWithdrawal({
    walletAddress,
    amount,
    chain,
    destinationWallet,
    transactionHash,
    status: "completed"
  });

  // Get updated balances
  const balances = await getWalletBalances(walletAddress, chain);

  return NextResponse.json({
    withdrawal: {
      id: withdrawal.id,
      wallet_address: walletAddress,
      amount,
      chain,
      destination_wallet: destinationWallet,
      transaction_hash: transactionHash,
      status: "completed",
      created_at: withdrawal.created_at
    },
    balances: {
      balance: balances.balance,
      verified_balance: balances.verified_balance,
      pending_balance: balances.pending_balance
    },
    message: `Withdrawal processed successfully. ${amount} ${chain} withdrawn from verified balance. Remaining balances: ${balances.verified_balance.toFixed(4)} verified (withdrawable), ${balances.pending_balance.toFixed(4)} pending (awaiting rating), ${balances.balance.toFixed(4)} total ${chain}.`
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const walletAddress = searchParams.get("walletAddress") || undefined;

  const { listWithdrawals } = await import("@/lib/db");
  const withdrawals = await listWithdrawals(walletAddress);
  
  return NextResponse.json({ withdrawals });
}
