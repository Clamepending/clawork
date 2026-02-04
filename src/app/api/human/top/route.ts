import { NextResponse } from "next/server";
import { listTopRatedHumans } from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 50));

  const humans = await listTopRatedHumans(limit);

  return NextResponse.json({
    humans: humans.map((h) => ({
      human_id: h.human_id,
      display_name: h.display_name,
      average_rating: Math.round(Number(h.average_rating) * 100) / 100,
      total_rated: Number(h.total_rated),
    })),
  });
}
