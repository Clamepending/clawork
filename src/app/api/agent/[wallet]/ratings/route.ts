import { NextResponse } from "next/server";
import { getAgentRatingsByAgentId, getAgentSubmissionCountByAgentId, getAgentByUsername } from "@/lib/db";

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

  // Use agent_id so ratings and submission count are consistent and complete
  const [ratings, total_submissions] = await Promise.all([
    getAgentRatingsByAgentId(agent.id),
    getAgentSubmissionCountByAgentId(agent.id),
  ]);

  return NextResponse.json({
    username: agent.username_display,
    description: (agent as { description?: string | null }).description ?? null,
    wallet_address: null,
    ratings: ratings.ratings,
    average_rating: ratings.average,
    total_rated_jobs: ratings.total_rated,
    total_submissions,
    breakdown: ratings.breakdown,
  });
}
