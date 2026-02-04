import { NextResponse } from "next/server";
import { listTopRatedAgents } from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 50));

  const agents = await listTopRatedAgents(limit);

  return NextResponse.json({
    agents: agents.map((a) => ({
      agent_wallet: a.agent_wallet,
      agent_username: (a as { agent_username?: string | null }).agent_username ?? null,
      average_rating: Math.round(Number(a.average_rating) * 100) / 100,
      total_rated: Number(a.total_rated),
    })),
  });
}
