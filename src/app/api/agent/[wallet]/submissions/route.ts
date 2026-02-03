import { NextResponse } from "next/server";
import { listAgentSubmissions, listAgentSubmissionsByUsername, getAgentByUsername } from "@/lib/db";

export async function GET(
  request: Request,
  { params }: { params: { wallet: string } }
) {
  const identifier = (params.wallet || "").trim();
  if (!identifier) {
    return NextResponse.json({ error: "Wallet or username is required." }, { status: 400 });
  }

  const usernameLower = identifier.toLowerCase();
  const agentByUsername = await getAgentByUsername(usernameLower);

  if (agentByUsername) {
    const submissions = await listAgentSubmissionsByUsername(usernameLower);
    return NextResponse.json({
      username: agentByUsername.username_display,
      wallet_address: null,
      submissions: submissions.map((s) => ({
        submission_id: s.submission_id,
        job_id: s.job_id,
        description: s.description,
        amount: s.amount,
        chain: s.chain,
        job_status: s.job_status,
        rating: s.rating,
        created_at: s.created_at,
      })),
    });
  }

  const submissions = await listAgentSubmissions(identifier);
  return NextResponse.json({
    username: null,
    wallet_address: identifier,
    submissions: submissions.map((s) => ({
      submission_id: s.submission_id,
      job_id: s.job_id,
      description: s.description,
      amount: s.amount,
      chain: s.chain,
      job_status: s.job_status,
      rating: s.rating,
      created_at: s.created_at,
    })),
  });
}
