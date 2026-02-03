import { NextResponse } from "next/server";
import { getAgentRatings, getAgentSubmissionCount, getAgentRatingsByUsername, getAgentSubmissionCountByUsername, getAgentByUsername } from "@/lib/db";

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
    const [ratings, total_submissions] = await Promise.all([
      getAgentRatingsByUsername(usernameLower),
      getAgentSubmissionCountByUsername(usernameLower),
    ]);
    return NextResponse.json({
      username: agentByUsername.username_display,
      description: (agentByUsername as { description?: string | null }).description ?? null,
      wallet_address: null,
      ratings: ratings.ratings,
      average_rating: ratings.average,
      total_rated_jobs: ratings.total_rated,
      total_submissions,
      breakdown: ratings.breakdown,
    });
  }

  const [ratings, total_submissions] = await Promise.all([
    getAgentRatings(identifier),
    getAgentSubmissionCount(identifier),
  ]);

  return NextResponse.json({
    username: null,
    description: null,
    wallet_address: identifier,
    ratings: ratings.ratings,
    average_rating: ratings.average,
    total_rated_jobs: ratings.total_rated,
    total_submissions,
    breakdown: ratings.breakdown,
  });
}
