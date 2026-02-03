import { NextResponse } from "next/server";
import { getJobByPrivateId, getSubmissionByJobPrivateId } from "@/lib/db";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const privateId = params.id;

  const job = getJobByPrivateId(privateId);
  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  const submission = getSubmissionByJobPrivateId(privateId);

  return NextResponse.json({
    job: {
      id: job.id,
      private_id: job.private_id,
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
