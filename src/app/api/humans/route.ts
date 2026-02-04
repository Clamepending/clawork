import { NextResponse } from "next/server";
import { listAllHumans } from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(500, Math.max(1, Number(searchParams.get("limit")) || 100));
  const availableOnly = searchParams.get("available_only") === "true";

  const humans = await listAllHumans(limit, availableOnly);

  return NextResponse.json({
    humans: humans.map((h) => ({
      id: h.id,
      display_name: h.display_name,
      headline: h.headline,
      bio: h.bio,
      city: h.city,
      state: h.state,
      country: h.country,
      skills: h.skills,
      social_links: h.social_links,
      rate_per_hour: h.rate_per_hour,
      timezone: h.timezone,
      available: h.available,
      show_email: h.show_email,
      email: h.show_email ? h.email : null,
      created_at: h.created_at,
    })),
  });
}
