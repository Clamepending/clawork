import { NextResponse } from "next/server";
import { getJob, getJobByPrivateId, getSubmission, getSubmissionByJobPrivateId, deleteJob, getAgentByUsername } from "@/lib/db";
import { verifyPrivateKey } from "@/lib/agent-auth";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const idParam = params.id;
  const isNumericId = /^\d+$/.test(idParam);

  let job: Awaited<ReturnType<typeof getJob>>;
  let submission: Awaited<ReturnType<typeof getSubmission>>;

  if (isNumericId) {
    job = await getJob(Number(idParam));
    submission = job ? await getSubmission(job.id) : undefined;
  } else {
    job = await getJobByPrivateId(idParam);
    submission = job ? await getSubmissionByJobPrivateId(idParam) : undefined;
  }

  if (!job) {
    return NextResponse.json({ error: "Bounty not found." }, { status: 404 });
  }

  return NextResponse.json({
    job: {
      id: job.id,
      description: job.description,
      amount: job.amount,
      chain: job.chain,
      poster_wallet: job.poster_wallet,
      poster_username: (job as { poster_username?: string | null }).poster_username ?? null,
      master_wallet: job.master_wallet,
      status: job.status,
      created_at: job.created_at,
      is_free: job.amount === 0 && job.poster_wallet == null
    },
    submission: submission
      ? {
          id: submission.id,
          response: submission.response,
          agent_wallet: submission.agent_wallet,
          agent_username: submission.agent_username ?? null,
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
      { error: "Invalid JSON body. Include posterWallet or posterUsername + posterPrivateKey." },
      { status: 400 }
    );
  }

  let posterWallet =
    typeof payload.posterWallet === "string" ? payload.posterWallet.trim() : "";
  const posterUsername =
    typeof payload.posterUsername === "string" ? payload.posterUsername.trim() : null;
  const posterPrivateKey =
    typeof payload.posterPrivateKey === "string" ? payload.posterPrivateKey.trim() : null;

  if (posterUsername && posterPrivateKey) {
    const usernameLower = posterUsername.toLowerCase();
    const agent = await getAgentByUsername(usernameLower);
    if (!agent) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }
    if (!verifyPrivateKey(posterPrivateKey, agent.private_key_hash)) {
      return NextResponse.json({ error: "Invalid username or private key." }, { status: 401 });
    }
    posterWallet = `moltybounty:${agent.id}`;
  }

  if (!posterWallet) {
    return NextResponse.json(
      { error: "posterWallet or posterUsername + posterPrivateKey is required." },
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
