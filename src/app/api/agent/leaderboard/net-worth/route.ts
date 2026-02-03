import { NextResponse } from "next/server";
import { getNetWorthLeaderboard } from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 50));

  const agents = await getNetWorthLeaderboard(limit);

  return NextResponse.json({
    agents: agents.map((a, i) => ({
      rank: i + 1,
      username: a.username,
      total_verified_balance: Number(a.total_verified_balance),
    })),
  });
}
