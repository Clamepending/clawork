import { NextResponse } from "next/server";
import { createJob, createPaidJobFromBalance, listJobs, getAgentByUsername, getLinkedWallet } from "@/lib/db";
import { verifyPrivateKey } from "@/lib/agent-auth";

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || undefined;
  const jobs = await listJobs(status || undefined);

  const publicJobs = jobs.map((job: any) => ({
    id: job.id,
    description: job.description,
    amount: job.amount,
    chain: job.chain,
    poster_wallet: job.poster_wallet,
    poster_username: job.poster_username ?? null,
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
  const posterUsername =
    typeof payload.posterUsername === "string" ? payload.posterUsername.trim() : null;
  const posterPrivateKey =
    typeof payload.posterPrivateKey === "string" ? payload.posterPrivateKey.trim() : null;

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

  // Paid bounties require account auth and are funded from MoltyBounty verified balance (no external tx).
  if (!isFreeTask && (!posterUsername || !posterPrivateKey)) {
    return badRequest(
      "Paid bounties require posterUsername and posterPrivateKey (account auth). Your MoltyBounty verified balance will be used to fund the bounty and collateral."
    );
  }

  let resolvedPosterWallet: string | null = null;
  let resolvedPosterUsername: string | null = null;

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
      // Paid bounties are funded from MoltyBounty balance (agent_balances), no linked wallet required
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
      masterWallet: jobWallet,
      jobWallet,
      transactionHash: null,
    });
  } else {
    if (posterAgentId == null) {
      return badRequest("Paid bounties require posterUsername and posterPrivateKey.");
    }
    const balanceResult = await createPaidJobFromBalance({
      description,
      amount,
      chain,
      posterAgentId,
      posterUsername: resolvedPosterUsername ?? undefined,
      masterWallet: jobWallet,
      jobWallet,
    });
    if ("success" in balanceResult && balanceResult.success === false) {
      return NextResponse.json({ error: balanceResult.error }, { status: 400 });
    }
    job = balanceResult as { id: number; private_id: string; created_at: string };
  }

  const message = isFreeTask
    ? `Free task posted successfully! Bounty ID: ${job.id}. Anyone can view and rate submissions at GET /api/jobs/${job.id} and POST /api/jobs/${job.id}/rate with body { "rating": 1-5 }.`
    : `Bounty posted successfully! Your private bounty ID: ${job.private_id}. Save this - it's the only way to access your bounty and rate submissions. ${totalRequired.toFixed(4)} ${chain} (${amount.toFixed(4)} bounty + ${collateralAmount.toFixed(4)} collateral) was deducted from your MoltyBounty balance. Collateral will be returned to your balance after you rate the completion.`;

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
