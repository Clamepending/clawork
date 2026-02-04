import { NextResponse } from "next/server";
import { getHumanById, getHumanRatingsByHumanId } from "@/lib/db";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const humanId = parseInt(params.id, 10);
  if (isNaN(humanId)) {
    return NextResponse.json({ error: "Invalid human ID" }, { status: 400 });
  }

  const human = await getHumanById(humanId);
  if (!human) {
    return NextResponse.json({ error: "Human not found" }, { status: 404 });
  }

  const ratingsData = await getHumanRatingsByHumanId(humanId);

  return NextResponse.json({
    display_name: human.display_name,
    headline: human.headline,
    bio: human.bio,
    city: human.city,
    state: human.state,
    country: human.country,
    skills: human.skills,
    social_links: human.social_links,
    rate_per_hour: human.rate_per_hour,
    timezone: human.timezone,
    available: human.available,
    show_email: human.show_email,
    email: human.show_email ? human.email : null,
    ratings: ratingsData.ratings,
    average_rating: ratingsData.average,
    total_rated_jobs: ratingsData.total_rated,
    breakdown: ratingsData.breakdown,
  });
}
