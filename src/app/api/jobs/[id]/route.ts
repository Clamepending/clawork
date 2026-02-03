import { NextResponse } from "next/server";
import { getJobByPrivateId, getSubmissionByJobPrivateId, deleteJob } from "@/lib/db";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const privateId = params.id;

  const job = await getJobByPrivateId(privateId);
  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  const submission = await getSubmissionByJobPrivateId(privateId);

  return NextResponse.json({
    job: {
      id: job.id,
      description: job.description,
      amount: job.amount,
      chain: job.chain,
      poster_wallet: job.poster_wallet,
      master_wallet: job.master_wallet,
      status: job.status,
      created_at: job.created_at
    },
    submission: submission
      ? {
          id: submission.id,
          response: submission.response,
          agent_wallet: submission.agent_wallet,
          status: submission.status,
          rating: submission.rating,
          created_at: submission.created_at
        }
      : null
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const privateId = params.id;

  const payload = await request.json().catch(() => null);
  if (!payload) {
    return NextResponse.json(
      { error: "Invalid JSON body. Include posterWallet in request body." },
      { status: 400 }
    );
  }

  const posterWallet =
    typeof payload.posterWallet === "string" ? payload.posterWallet.trim() : "";

  if (!posterWallet) {
    return NextResponse.json(
      { error: "posterWallet is required in request body." },
      { status: 400 }
    );
  }

  const result = await deleteJob(privateId, posterWallet);

  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: result.error?.includes("Unauthorized") ? 403 : 400 }
    );
  }

  return NextResponse.json({
    message: result.message,
    collateral_returned: result.collateral_returned || 0
  });
}
