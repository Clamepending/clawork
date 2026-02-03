import { NextResponse } from "next/server";
import { createSubmission, getJob, updateJobStatus, hasSufficientCollateral, hasPositiveBalance } from "@/lib/db";

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

  const isFreeTask = job.amount === 0;
  // For paid jobs, require collateral and minimum balance; free tasks have no payout so no collateral needed
  if (!isFreeTask) {
    if (!(await hasSufficientCollateral(agentWallet, job.chain, 0.1))) {
      return NextResponse.json(
        {
          error: `Insufficient collateral. Please deposit at least 0.1 ${job.chain} to the master wallet before claiming jobs. Use POST /api/deposit to record your deposit.`
        },
        { status: 403 }
      );
    }
    const PENALTY_AMOUNT = 0.01;
    if (!(await hasPositiveBalance(agentWallet, job.chain))) {
      return NextResponse.json(
        {
          error: `Insufficient balance. Your account balance must be at least ${PENALTY_AMOUNT} ${job.chain} to claim jobs (to cover potential penalties). Current balance is too low. Please deposit more collateral to continue claiming jobs. Use POST /api/deposit to add funds.`
        },
        { status: 403 }
      );
    }
  }

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
