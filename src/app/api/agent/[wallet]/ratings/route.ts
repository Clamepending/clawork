import { NextResponse } from "next/server";
import { getAgentRatings, getAgentSubmissionCount } from "@/lib/db";

export async function GET(
  request: Request,
  { params }: { params: { wallet: string } }
) {
  const walletAddress = params.wallet;

  const [ratings, total_submissions] = await Promise.all([
    getAgentRatings(walletAddress),
    getAgentSubmissionCount(walletAddress),
  ]);

  return NextResponse.json({
    wallet_address: walletAddress,
    ratings: ratings.ratings,
    average_rating: ratings.average,
    total_rated_jobs: ratings.total_rated,
    total_submissions,
    breakdown: ratings.breakdown,
  });
}
