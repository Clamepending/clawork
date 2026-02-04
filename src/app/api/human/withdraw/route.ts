import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getHumanByEmail, getLinkedHumanWallet, getHumanBalances, processHumanWithdrawal, createWithdrawal } from "@/lib/db";

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  if (!payload) {
    return badRequest("Invalid JSON body.");
  }

  const amount = Number(payload.amount);
  const chain = typeof payload.chain === "string" ? payload.chain.trim().toLowerCase() : "base-usdc";
  const destinationWallet = typeof payload.destinationWallet === "string" ? payload.destinationWallet.trim() : "";

  if (!Number.isFinite(amount) || amount <= 0) {
    return badRequest("Amount must be a positive number.");
  }
  if (!destinationWallet) {
    return badRequest("Destination wallet is required.");
  }

  const human = await getHumanByEmail(session.user.email);
  if (!human) {
    return NextResponse.json({ error: "Human profile not found" }, { status: 404 });
  }

  const linked = await getLinkedHumanWallet(human.id, chain);
  if (!linked) {
    return badRequest("No wallet linked for this chain. Link a wallet first on your Human Dashboard.");
  }

  const walletAddress = linked.wallet_address;
  const balances = await getHumanBalances(human.id, chain);
  if (balances.verified_balance < amount) {
    return NextResponse.json(
      {
        error: `Insufficient verified balance. Available: ${balances.verified_balance.toFixed(4)} USDC. Requested: ${amount}.`,
      },
      { status: 400 }
    );
  }

  const result = await processHumanWithdrawal(human.id, chain, amount);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const withdrawal = await createWithdrawal({
    walletAddress,
    amount,
    chain,
    destinationWallet,
    transactionHash: null,
    status: "completed",
  });

  const balancesAfter = await getHumanBalances(human.id, chain);

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
