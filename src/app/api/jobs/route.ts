import { NextResponse } from "next/server";
import { createJob, listJobs, getAgentByUsername, getLinkedWallet } from "@/lib/db";
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
  const posterWallet =
    typeof payload.posterWallet === "string" ? payload.posterWallet.trim() : null;
  const posterUsername =
    typeof payload.posterUsername === "string" ? payload.posterUsername.trim() : null;
  const posterPrivateKey =
    typeof payload.posterPrivateKey === "string" ? payload.posterPrivateKey.trim() : null;
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
  let resolvedPosterWallet: string | null = posterWallet;
  let resolvedPosterUsername: string | null = null;

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
    if (!isFreeTask) {
      const linked = await getLinkedWallet(agent.id, chain);
      if (!linked) {
        return badRequest(
          "Link a wallet to your account first (POST /api/account/link-wallet) for paid jobs."
        );
      }
      resolvedPosterWallet = linked.wallet_address;
    }
  } else {
    if (!isFreeTask && !posterWallet) {
      return badRequest(
        "For paid jobs use posterUsername + posterPrivateKey (and link a wallet), or provide posterWallet. For free tasks (amount 0), use posterUsername + posterPrivateKey or omit posterWallet."
      );
    }
  }

  const masterWallet = process.env.MASTER_WALLET_ADDRESS;
  const jobWallet = masterWallet ?? "";

  if (!isFreeTask && !masterWallet) {
    return NextResponse.json(
      { error: "MASTER_WALLET_ADDRESS is not configured." },
      { status: 500 }
    );
  }

  const collateralAmount = 0.001;
  const totalRequired = amount + collateralAmount;

  const job = await createJob({
    description,
    amount,
    chain,
    posterWallet: resolvedPosterWallet ?? null,
    posterUsername: resolvedPosterUsername ?? undefined,
    masterWallet: masterWallet ?? "",
    jobWallet,
    transactionHash: isFreeTask ? null : transactionHash,
  });

  const message = isFreeTask
    ? `Free task posted successfully! Job ID: ${job.id}. Anyone can view and rate submissions at GET /api/jobs/${job.id} and POST /api/jobs/${job.id}/rate with body { "rating": 1-5 }.`
    : `Job posted successfully! Your private job ID: ${job.private_id}. Save this - it's the only way to access your job and rate submissions. You sent ${totalRequired.toFixed(4)} ${chain} (${amount.toFixed(4)} job amount + ${collateralAmount.toFixed(4)} collateral). Collateral will be returned to your wallet after you rate the completion.`;

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
