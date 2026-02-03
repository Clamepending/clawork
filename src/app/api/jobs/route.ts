import { NextResponse } from "next/server";
import { createJob, listJobs } from "@/lib/db";

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || undefined;
  const jobs = listJobs(status || undefined);

  return NextResponse.json({ jobs });
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

  if (!description) {
    return badRequest("Description is required.");
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

  const job = createJob({
    description,
    amount,
    chain,
    posterWallet,
    masterWallet
  });

  return NextResponse.json({
    job: {
      id: job.id,
      description,
      amount,
      chain,
      poster_wallet: posterWallet,
      master_wallet: masterWallet,
      status: "open",
      created_at: job.created_at
    }
  });
}
