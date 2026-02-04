import { NextResponse } from "next/server";
import { createSubmission, getJob, updateJobStatus, getAgentByUsername, getLinkedWallet } from "@/lib/db";
import { verifyPrivateKey } from "@/lib/agent-auth";

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const jobId = Number(params.id);
  if (!Number.isInteger(jobId)) {
    return badRequest("Invalid bounty id.");
  }

  const job = await getJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "Bounty not found." }, { status: 404 });
  }
  if (job.status !== "open") {
    return NextResponse.json({ error: "Bounty is not open." }, { status: 400 });
  }

  const payload = await request.json().catch(() => null);
  if (!payload) {
    return badRequest("Invalid JSON body.");
  }

  const responseText = typeof payload.response === "string" ? payload.response.trim() : "";
  const agentWallet =
    typeof payload.agentWallet === "string" ? payload.agentWallet.trim() : "";
  const agentUsername =
    typeof payload.agentUsername === "string" ? payload.agentUsername.trim() : null;
  const agentPrivateKey =
    typeof payload.agentPrivateKey === "string" ? payload.agentPrivateKey.trim() : null;

  if (!responseText) {
    return badRequest("Response is required.");
  }

  let resolvedAgentWallet = agentWallet;
  let resolvedAgentUsername: string | null = null;
  let agentId: number | null = null;

  if (agentUsername && agentPrivateKey) {
    const usernameLower = agentUsername.toLowerCase();
    const agent = await getAgentByUsername(usernameLower);
    if (!agent) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }
    if (!verifyPrivateKey(agentPrivateKey, agent.private_key_hash)) {
      return NextResponse.json({ error: "Invalid username or private key." }, { status: 401 });
    }
    resolvedAgentUsername = agent.username_display;
    agentId = agent.id;
    const linked = await getLinkedWallet(agent.id, job.chain);
    if (linked) {
      resolvedAgentWallet = linked.wallet_address;
    } else {
      // No wallet linked: use placeholder so balance is tracked by agent account
      resolvedAgentWallet = `moltybounty:${agent.id}`;
    }
  } else {
    if (!resolvedAgentWallet) {
      return badRequest(
        "Provide agentUsername + agentPrivateKey, or agentWallet (legacy)."
      );
    }
  }

  const submission = await createSubmission({
    jobId,
    response: responseText,
    agentWallet: resolvedAgentWallet,
    agentUsername: resolvedAgentUsername ?? undefined,
    agentId: agentId ?? undefined,
    jobAmount: job.amount,
    chain: job.chain,
  });

  await updateJobStatus(jobId, "claimed");

  return NextResponse.json({
    submission: {
      id: submission.id,
      job_id: jobId,
      response: responseText,
      agent_wallet: resolvedAgentWallet,
      agent_username: resolvedAgentUsername ?? null,
      status: "submitted",
      created_at: submission.created_at,
    },
  });
}
