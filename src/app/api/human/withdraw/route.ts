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

  // Check master wallet configuration
  const masterWallet = process.env.MASTER_WALLET_ADDRESS;
  const masterWalletPrivateKey = process.env.MASTER_WALLET_PRIVATE_KEY;
  
  if (!masterWallet) {
    return NextResponse.json(
      { error: "Master wallet not configured. Withdrawals are temporarily unavailable." },
      { status: 500 }
    );
  }

  let transactionHash: string | null = null;
  let withdrawalStatus = "pending";

  // Send crypto on-chain if master wallet private key is configured
  if (chain === "base-usdc" && masterWalletPrivateKey) {
    try {
      const { createWalletClient, createPublicClient, http } = await import("viem");
      const { privateKeyToAccount } = await import("viem/accounts");
      const { base } = await import("viem/chains");
      
      const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
      const amountRaw = BigInt(Math.ceil(amount * 1e6));
      
      // Create wallet client with master wallet private key
      const account = privateKeyToAccount(masterWalletPrivateKey as `0x${string}`);
      const walletClient = createWalletClient({
        account,
        chain: base,
        transport: http("https://mainnet.base.org"),
      });

      // Check master wallet USDC balance
      const publicClient = createPublicClient({ chain: base, transport: http("https://mainnet.base.org") });
      const balanceRaw = await publicClient.readContract({
        address: USDC_BASE,
        abi: [
          {
            name: "balanceOf",
            type: "function",
            stateMutability: "view",
            inputs: [{ name: "account", type: "address" }],
            outputs: [{ type: "uint256" }],
          },
        ],
        functionName: "balanceOf",
        args: [masterWallet as `0x${string}`],
      });

      if (balanceRaw < amountRaw) {
        return NextResponse.json(
          {
            error: `Insufficient USDC in master wallet. Available: ${Number(balanceRaw) / 1e6} USDC. Requested: ${amount} USDC.`,
          },
          { status: 400 }
        );
      }

      // Send USDC transfer
      const hash = await walletClient.writeContract({
        address: USDC_BASE,
        abi: [
          {
            name: "transfer",
            type: "function",
            stateMutability: "nonpayable",
            inputs: [
              { name: "to", type: "address" },
              { name: "amount", type: "uint256" },
            ],
            outputs: [{ type: "bool" }],
          },
        ],
        functionName: "transfer",
        args: [destinationWallet as `0x${string}`, amountRaw],
      });

      transactionHash = hash;
      withdrawalStatus = "completed";
      console.log(`Successfully sent ${amount} USDC to ${destinationWallet}. Transaction hash: ${hash}`);
    } catch (error: any) {
      // Log error without exposing sensitive data
      const errorMessage = error?.message || error?.shortMessage || "Unknown error";
      console.error("Failed to send USDC on-chain:", errorMessage);
      console.error("Full error:", error);
      // Ensure we never expose the private key in error messages
      const safeErrorMessage = errorMessage.replace(/private.*key/gi, "[REDACTED]");
      return NextResponse.json(
        {
          error: `Failed to send USDC: ${safeErrorMessage}. Your balance has not been deducted.`,
        },
        { status: 500 }
      );
    }
  } else if (!masterWalletPrivateKey) {
    // If no private key configured, mark as pending for manual processing
    withdrawalStatus = "pending";
  }

  // Only deduct balance if transaction was successful or if we're recording a pending withdrawal
  if (transactionHash || withdrawalStatus === "pending") {
    const result = await processHumanWithdrawal(human.id, chain, amount);
    if (!result.success) {
      console.error("Failed to process human withdrawal:", result.error);
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    console.log(`Balance deducted for human ${human.id}: ${amount} USDC`);
  } else {
    console.error("No transaction hash and withdrawal status is not pending");
    return NextResponse.json(
      { error: "Failed to process withdrawal. Please try again." },
      { status: 500 }
    );
  }

  const withdrawal = await createWithdrawal({
    walletAddress,
    amount,
    chain,
    destinationWallet,
    transactionHash,
    status: withdrawalStatus,
  });

  const balancesAfter = await getHumanBalances(human.id, chain);

  const message = transactionHash
    ? `Withdrawal successful! ${amount} USDC sent to ${destinationWallet}. Transaction: ${transactionHash}. Remaining balances: ${balancesAfter.verified_balance.toFixed(4)} verified, ${balancesAfter.pending_balance.toFixed(4)} pending, ${balancesAfter.balance.toFixed(4)} total USDC.`
    : `Withdrawal recorded (pending manual processing). ${amount} USDC will be sent to ${destinationWallet}. Remaining balances: ${balancesAfter.verified_balance.toFixed(4)} verified, ${balancesAfter.pending_balance.toFixed(4)} pending, ${balancesAfter.balance.toFixed(4)} total USDC.`;

  return NextResponse.json({
    withdrawal: {
      id: withdrawal.id,
      wallet_address: walletAddress,
      amount,
      chain,
      destination_wallet: destinationWallet,
      transaction_hash: transactionHash,
      status: withdrawalStatus,
      created_at: withdrawal.created_at,
    },
    balances: {
      balance: balancesAfter.balance,
      verified_balance: balancesAfter.verified_balance,
      pending_balance: balancesAfter.pending_balance,
    },
    message,
  });
}
