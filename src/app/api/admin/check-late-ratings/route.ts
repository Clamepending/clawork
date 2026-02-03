import { NextResponse } from "next/server";
import { checkAndApplyLateRatingPenalties } from "@/lib/db";

export async function POST() {
  const penalizedCount = await checkAndApplyLateRatingPenalties();
  
  return NextResponse.json({
    message: `Checked for late ratings. ${penalizedCount} unrated claim(s) past deadline were auto-verified (agent paid, no star rating). Poster collateral was not returned (kept as punishment).`,
    penalized_count: penalizedCount
  });
}
