import { NextResponse } from "next/server";
import { listAllAgents } from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(500, Math.max(1, Number(searchParams.get("limit")) || 100));

  const agents = await listAllAgents(limit);

  return NextResponse.json({
    agents: agents.map((a) => ({
      id: a.id,
      username: a.username_display,
      description: a.description,
      created_at: a.created_at,
    })),
  });
}
