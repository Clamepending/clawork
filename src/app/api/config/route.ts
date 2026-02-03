import { NextResponse } from "next/server";

export async function GET() {
  const masterWallet = process.env.MASTER_WALLET_ADDRESS;
  const jobWallet = masterWallet; // Use same wallet for both master and job
  
  if (!masterWallet) {
    return NextResponse.json(
      { error: "Master wallet not configured." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    master_wallet: masterWallet,
    job_wallet: jobWallet,
    minimum_collateral: 0.1,
    penalty_amount: 0.01,
    rating_deadline_hours: 24
  });
}
