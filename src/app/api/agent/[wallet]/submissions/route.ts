import { NextResponse } from "next/server";
import { listAgentSubmissionsByUsername, getAgentByUsername } from "@/lib/db";

export async function GET(
  request: Request,
  { params }: { params: { wallet: string } }
) {
  const username = (params.wallet || "").trim();
  if (!username) {
    return NextResponse.json({ error: "Username is required." }, { status: 400 });
  }

  const usernameLower = username.toLowerCase();
  const agent = await getAgentByUsername(usernameLower);
  if (!agent) {
    return NextResponse.json({ error: "No account found for this username." }, { status: 404 });
  }

  const submissions = await listAgentSubmissionsByUsername(usernameLower);
  return NextResponse.json({
    username: agent.username_display,
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
