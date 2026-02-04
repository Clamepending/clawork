import { NextResponse } from "next/server";
import { getHumanById, listHumanSubmissionsByHumanId } from "@/lib/db";

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

  const submissions = await listHumanSubmissionsByHumanId(humanId);

  return NextResponse.json({
    submissions: submissions.map((s) => ({
      submission_id: s.submission_id,
      job_id: s.job_id,
      description: s.description,
      amount: s.amount,
      chain: s.chain,
      job_status: s.job_status,
      rating: s.rating,
      created_at: s.created_at,
    })),
  });
}
