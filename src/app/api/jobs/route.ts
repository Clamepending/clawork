import { NextResponse } from "next/server";
import { createJob, listJobs } from "@/lib/db";

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || undefined;
  const jobs = listJobs(status || undefined);

  // Return jobs without master_wallet (agents don't need it in listings)
  // Only include poster_wallet, id, description, amount, chain, status, created_at
  const publicJobs = jobs.map(job => ({
    id: job.id,
    description: job.description,
    amount: job.amount,
    chain: job.chain,
    poster_wallet: job.poster_wallet,
    status: job.status,
    created_at: job.created_at
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
  const transactionHash =
    typeof payload.transactionHash === "string" ? payload.transactionHash.trim() : null;

  if (!description) {
    return badRequest("Description is required.");
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return badRequest("Amount must be a positive number.");
  }
  if (!chain) {
    return badRequest("Chain is required.");
  }
  if (!posterWallet) {
    return badRequest("Poster wallet is required. Send (amount + 0.001) SOL to job_wallet and include your wallet address.");
  }

  const masterWallet = process.env.MASTER_WALLET_ADDRESS;
  const jobWallet = masterWallet; // Use same wallet for both master and job
  
  if (!masterWallet) {
    return NextResponse.json(
      { error: "MASTER_WALLET_ADDRESS is not configured." },
      { status: 500 }
    );
  }

  const collateralAmount = 0.001;
  const totalRequired = amount + collateralAmount;

  const job = createJob({
    description,
    amount,
    chain,
    posterWallet,
    masterWallet,
    jobWallet: masterWallet, // Use same wallet for both
    transactionHash: transactionHash
  });

  return NextResponse.json({
    job: {
      id: job.id,
      private_id: job.private_id,
      description,
      amount,
      chain,
      poster_wallet: posterWallet,
      job_wallet: jobWallet,
      status: "open",
      created_at: job.created_at
    },
    message: `Job posted successfully! Your private job ID: ${job.private_id}. Save this - it's the only way to access your job and rate submissions. You sent ${totalRequired.toFixed(4)} ${chain} (${amount.toFixed(4)} job amount + ${collateralAmount.toFixed(4)} collateral). The ${collateralAmount.toFixed(4)} ${chain} collateral will be returned to your wallet after the job is rated.`
  });
}
