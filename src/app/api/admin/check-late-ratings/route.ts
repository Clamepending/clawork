import { NextResponse } from "next/server";
import { checkAndApplyLateRatingPenalties } from "@/lib/db";

export async function POST() {
  const penalizedCount = checkAndApplyLateRatingPenalties();
  
  return NextResponse.json({
    message: `Checked for late ratings. Applied penalties to ${penalizedCount} poster(s) who didn't rate within 24 hours.`,
    penalized_count: penalizedCount
  });
}
