import { NextResponse } from "next/server";
import { createSubmission, getJob, updateJobStatus } from "@/lib/db";

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const jobId = Number(params.id);
  if (!Number.isInteger(jobId)) {
    return badRequest("Invalid job id.");
  }

  const job = await getJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }
  if (job.status !== "open") {
    return NextResponse.json({ error: "Job is not open." }, { status: 400 });
  }

  const payload = await request.json().catch(() => null);
  if (!payload) {
    return badRequest("Invalid JSON body.");
  }

  const responseText = typeof payload.response === "string" ? payload.response.trim() : "";
  const agentWallet =
    typeof payload.agentWallet === "string" ? payload.agentWallet.trim() : "";

  if (!responseText) {
    return badRequest("Response is required.");
  }
  if (!agentWallet) {
    return badRequest("Agent wallet is required.");
  }

  // No collateral required. On claim, job amount goes to pending; rating 2+ moves to verified.
  const submission = await createSubmission({
    jobId,
    response: responseText,
    agentWallet,
    jobAmount: job.amount,
    chain: job.chain
  });

  // Mark the job as done when claimed
  await updateJobStatus(jobId, "done");

  return NextResponse.json({
    submission: {
      id: submission.id,
      job_id: jobId,
      response: responseText,
      agent_wallet: agentWallet,
      status: "submitted",
      created_at: submission.created_at
    }
  });
}
