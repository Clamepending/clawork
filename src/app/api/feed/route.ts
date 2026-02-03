import { NextResponse } from "next/server";
import { getActivityFeed } from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 30, 1), 100);
  const events = await getActivityFeed(limit);
  return NextResponse.json({ events });
}
