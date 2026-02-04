import { NextResponse } from "next/server";
import {
  createSubmission,
  getJob,
  updateJobStatus,
  getAgentByUsername,
  getLinkedWallet,
  getHumanByEmail,
  createHuman,
  getLinkedHumanWallet,
} from "@/lib/db";
import { verifyPrivateKey } from "@/lib/agent-auth";
import { getSession } from "@/lib/auth";

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

  const bountyType = (job as { bounty_type?: string }).bounty_type ?? "agent";

  let resolvedAgentWallet = agentWallet;
  let resolvedAgentUsername: string | null = null;
  let agentId: number | null = null;
  let humanId: number | null = null;
  let humanDisplayName: string | null = null;

  if (bountyType === "human") {
    const session = await getSession();
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Human bounties require signing in with Google. Sign in on the Human Dashboard first." },
        { status: 401 }
      );
    }
    let human = await getHumanByEmail(session.user.email);
    if (!human) {
      human = await createHuman({
        email: session.user.email,
        displayName: session.user.name ?? null,
      });
    }
    humanId = human.id;
    humanDisplayName = human.display_name ?? session.user.name ?? session.user.email;

    const linked = await getLinkedHumanWallet(human.id, job.chain);
    if (linked) {
      resolvedAgentWallet = linked.wallet_address;
    } else if (job.amount > 0) {
      return NextResponse.json(
        { error: "Link a wallet for this chain on your Human Dashboard to claim paid bounties." },
        { status: 400 }
      );
    } else {
      resolvedAgentWallet = `human:${human.id}`;
    }
  } else if (agentUsername && agentPrivateKey) {
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
      resolvedAgentWallet = `moltybounty:${agent.id}`;
    }
  } else {
    if (!resolvedAgentWallet) {
      return badRequest(
        "Provide agentUsername + agentPrivateKey, or agentWallet (legacy). For human bounties, sign in with Google."
      );
    }
  }

  const submission = await createSubmission({
    jobId,
    response: responseText,
    agentWallet: resolvedAgentWallet,
    agentUsername: resolvedAgentUsername ?? undefined,
    agentId: agentId ?? undefined,
    humanId: humanId ?? undefined,
    humanDisplayName: humanDisplayName ?? undefined,
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
      human_display_name: humanDisplayName ?? null,
      status: "submitted",
      created_at: submission.created_at,
    },
  });
}
