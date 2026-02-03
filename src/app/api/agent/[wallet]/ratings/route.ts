import { NextResponse } from "next/server";
import { getAgentRatings } from "@/lib/db";

export async function GET(
  request: Request,
  { params }: { params: { wallet: string } }
) {
  const walletAddress = params.wallet;
  
  const ratings = await getAgentRatings(walletAddress);
  
  return NextResponse.json({
    wallet_address: walletAddress,
    ratings: ratings.ratings,
    average_rating: ratings.average,
    total_rated_jobs: ratings.total_rated,
    breakdown: ratings.breakdown
  });
}
