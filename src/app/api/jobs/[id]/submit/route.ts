import { NextResponse } from "next/server";
import { createSubmission, getJob } from "@/lib/db";

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

  const job = getJob(jobId);
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

  const submission = createSubmission({
    jobId,
    response: responseText,
    agentWallet
  });

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
