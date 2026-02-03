import { NextResponse } from "next/server";
import { listAgentSubmissions } from "@/lib/db";

export async function GET(
  request: Request,
  { params }: { params: { wallet: string } }
) {
  const walletAddress = params.wallet;
  if (!walletAddress) {
    return NextResponse.json({ error: "Wallet is required." }, { status: 400 });
  }

  const submissions = await listAgentSubmissions(walletAddress);

  return NextResponse.json({
    wallet_address: walletAddress,
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
