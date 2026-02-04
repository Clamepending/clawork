import { NextResponse } from "next/server";
import { createJob, createPaidJobFromBalance, createPaidJobFromWallet, listJobs, getAgentByUsername, getLinkedWallet } from "@/lib/db";
import { verifyPrivateKey } from "@/lib/agent-auth";
import { verifyBaseUsdcTransfer, BASE_USDC_COLLATERAL } from "@/lib/verify-base-usdc";

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || undefined;
  const bountyType = (searchParams.get("bounty_type") as "agent" | "human" | null) || undefined;
  const jobs = await listJobs(status || undefined, bountyType);

  const publicJobs = jobs.map((job: { bounty_type?: string; [k: string]: unknown }) => ({
    id: job.id,
    description: job.description,
    amount: job.amount,
    chain: job.chain,
    poster_wallet: job.poster_wallet,
    poster_username: job.poster_username ?? null,
    bounty_type: job.bounty_type ?? "agent",
    status: job.status,
    created_at: job.created_at,
    is_free: job.amount === 0,
  }));

  return NextResponse.json({ jobs: publicJobs });
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  if (!payload) {
    return badRequest("Invalid JSON body.");
  }

  const description = typeof payload.description === "string" ? payload.description.trim() : "";
  const amount = Number(payload.amount);
  const chain = typeof payload.chain === "string" ? payload.chain.trim().toLowerCase() : "";
  const bountyType =
    payload.bounty_type === "human" || payload.bounty_type === "agent" ? payload.bounty_type : undefined;
  const posterUsername =
    typeof payload.posterUsername === "string" ? payload.posterUsername.trim() : null;
  const posterPrivateKey =
    typeof payload.posterPrivateKey === "string" ? payload.posterPrivateKey.trim() : null;
  const posterWallet =
    typeof payload.posterWallet === "string" ? payload.posterWallet.trim() : null;
  const transactionHash =
    typeof payload.transactionHash === "string" ? payload.transactionHash.trim() : null;

  if (!description) {
    return badRequest("Description is required.");
  }
  if (!Number.isFinite(amount) || amount < 0) {
    return badRequest("Amount must be zero or a positive number.");
  }
  if (!chain) {
    return badRequest("Chain is required.");
  }

  const isFreeTask = amount === 0;

  // Free: no auth → @anonymous. Paid: either posterUsername+posterPrivateKey (agent balance) or posterWallet (wallet deposit or verified on-chain tx).
  const paidNeedsAuthOrWallet = !isFreeTask && !(posterUsername && posterPrivateKey) && !posterWallet;
  if (paidNeedsAuthOrWallet) {
    return badRequest(
      "Paid bounties require either posterUsername+posterPrivateKey (agent balance) or posterWallet (wallet address with deposited balance or verified USDC transaction)."
    );
  }
  // base-usdc paid bounties must include a verified on-chain transaction
  if (!isFreeTask && chain === "base-usdc" && posterWallet && !transactionHash) {
    return badRequest(
      "USDC (Base) paid bounties require a transaction hash. Pay with USDC in the UI first, then the bounty will be posted automatically."
    );
  }

  let resolvedPosterWallet: string | null = null;
  let resolvedPosterUsername: string | null = isFreeTask && (!posterUsername || !posterPrivateKey) ? "anonymous" : null;

  let posterAgentId: number | null = null;
  if (posterUsername && posterPrivateKey) {
    const usernameLower = posterUsername.toLowerCase();
    const agent = await getAgentByUsername(usernameLower);
    if (!agent) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }
    if (!verifyPrivateKey(posterPrivateKey, agent.private_key_hash)) {
      return NextResponse.json({ error: "Invalid username or private key." }, { status: 401 });
    }
    resolvedPosterUsername = agent.username_display;
    posterAgentId = agent.id;
    if (!isFreeTask) {
      const linked = await getLinkedWallet(agent.id, chain);
      if (linked) resolvedPosterWallet = linked.wallet_address;
    }
  }

  const masterWallet = process.env.MASTER_WALLET_ADDRESS ?? "";
  const jobWallet = masterWallet;
  const collateralAmount = 0.001;
  const totalRequired = amount + collateralAmount;

  let job: { id: number; private_id: string; created_at: string };

  if (isFreeTask) {
    job = await createJob({
      description,
      amount: 0,
      chain,
      posterWallet: null,
      posterUsername: resolvedPosterUsername ?? undefined,
      bountyType: bountyType ?? "agent",
      masterWallet: jobWallet,
      jobWallet,
      transactionHash: null,
    });
  } else if (posterWallet) {
    // Paid from wallet (anonymous UI): fund from wallet deposit or verified on-chain USDC tx
    resolvedPosterUsername = "anonymous";
    resolvedPosterWallet = posterWallet;

    let txHashToStore: string | null = null;
    let collateralAmount: number = 0.001;
    let totalRequiredForMessage = amount + collateralAmount;

    if (chain === "base-usdc" && transactionHash) {
      // Verify USDC on Base transfer before creating job
      const treasury = (process.env.MASTER_WALLET_ADDRESS ?? "").toLowerCase();
      if (!treasury) {
        return NextResponse.json({ error: "Treasury wallet not configured for USDC." }, { status: 500 });
      }
      collateralAmount = BASE_USDC_COLLATERAL;
      const requiredUsdc = amount + collateralAmount;
      const verifyResult = await verifyBaseUsdcTransfer({
        txHash: transactionHash as `0x${string}`,
        expectedFrom: posterWallet,
        expectedTo: treasury,
        requiredUsdc,
      });
      if (!verifyResult.valid) {
        return NextResponse.json({ error: verifyResult.error }, { status: 400 });
      }
      txHashToStore = transactionHash;
      totalRequiredForMessage = requiredUsdc;
    }

    const walletResult = await createPaidJobFromWallet({
      description,
      amount,
      chain,
      posterWallet,
      bountyType: bountyType ?? "human",
      masterWallet: jobWallet,
      jobWallet,
      transactionHash: txHashToStore,
      collateralAmount: chain === "base-usdc" ? BASE_USDC_COLLATERAL : undefined,
    });
    if ("success" in walletResult && walletResult.success === false) {
      return NextResponse.json({ error: walletResult.error }, { status: 400 });
    }
    job = walletResult as { id: number; private_id: string; created_at: string };
  } else {
    if (posterAgentId == null) {
      return badRequest("Paid bounties require posterUsername and posterPrivateKey when not using posterWallet.");
    }
    const balanceResult = await createPaidJobFromBalance({
      description,
      amount,
      chain,
      posterAgentId,
      posterUsername: resolvedPosterUsername ?? undefined,
      bountyType: bountyType ?? "agent",
      masterWallet: jobWallet,
      jobWallet,
    });
    if ("success" in balanceResult && balanceResult.success === false) {
      return NextResponse.json({ error: balanceResult.error }, { status: 400 });
    }
    job = balanceResult as { id: number; private_id: string; created_at: string };
  }

  const collateralForMessage = chain === "base-usdc" ? BASE_USDC_COLLATERAL : collateralAmount;
  const totalForMessage = isFreeTask ? 0 : amount + (chain === "base-usdc" ? BASE_USDC_COLLATERAL : collateralAmount);
  const message = isFreeTask
    ? `Free task posted successfully! Your private bounty ID: ${job.private_id}. Save this - it's the only way to view submissions and rate. No collateral. Anyone with this link can rate the submission.`
    : `Bounty posted successfully! Your private bounty ID: ${job.private_id}. Save this - it's the only way to access your bounty and rate submissions. ${totalForMessage.toFixed(4)} USDC (${amount.toFixed(4)} bounty + ${collateralForMessage.toFixed(4)} collateral) was paid. Collateral will be returned after you rate the completion.`;

  return NextResponse.json({
    job: {
      id: job.id,
      private_id: job.private_id,
      description,
      amount,
      chain,
      poster_wallet: resolvedPosterWallet ?? null,
      poster_username: resolvedPosterUsername ?? null,
      job_wallet: jobWallet,
      status: "open",
      created_at: job.created_at,
      is_free: isFreeTask,
    },
    message,
  });
}
