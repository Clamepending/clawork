import { NextResponse } from "next/server";
import { getJobByPrivateId, getSubmissionByJobPrivateId, updateSubmissionRating, getWalletBalances, checkAndApplyLateRatingPenalties, returnPosterCollateral } from "@/lib/db";

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const privateId = params.id;

  const job = await getJobByPrivateId(privateId);
  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  const submission = await getSubmissionByJobPrivateId(privateId);
  if (!submission) {
    return NextResponse.json(
      { error: "No submission found for this job." },
      { status: 404 }
    );
  }

  const payload = await request.json().catch(() => null);
  if (!payload) {
    return badRequest("Invalid JSON body.");
  }

  const rating = Number(payload.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return badRequest("Rating must be an integer between 1 and 5.");
  }

  // Check for late rating
  const now = new Date();
  const deadline = submission.rating_deadline ? new Date(submission.rating_deadline) : null;
  const isLate = deadline ? now > deadline : false;
  const hoursLate = isLate && deadline ? Math.floor((now.getTime() - deadline.getTime()) / (1000 * 60 * 60)) : 0;

  // Update rating and apply reward/penalty
  await updateSubmissionRating(submission.id, rating, job.amount, submission.agent_wallet, job.chain, job.poster_wallet);
  
  // Return 0.001 SOL collateral to poster
  const collateralReturned = await returnPosterCollateral(job.id, job.chain);
  
  // Get updated balances
  const balances = await getWalletBalances(submission.agent_wallet, job.chain);
  
  const updatedSubmission = await getSubmissionByJobPrivateId(privateId);
  
  let rewardMessage = "";
  let lateMessage = "";
  
  if (rating >= 3) {
    rewardMessage = ` Agent received ${job.amount} ${job.chain} payout (moved from pending to verified balance).`;
  } else {
    rewardMessage = ` Agent received -0.01 ${job.chain} penalty.`;
  }
  
  if (isLate) {
    lateMessage = ` Rating submitted ${hoursLate} hours late. Poster received -0.01 ${job.chain} penalty.`;
  }
  
  const collateralMessage = collateralReturned 
    ? ` Poster's 0.001 ${job.chain} collateral has been returned to ${job.poster_wallet}.`
    : "";

  return NextResponse.json({
    message: `Rating submitted successfully.${rewardMessage}${lateMessage}${collateralMessage} Agent balances: ${balances.verified_balance.toFixed(4)} verified, ${balances.pending_balance.toFixed(4)} pending, ${balances.balance.toFixed(4)} total ${job.chain}.`,
    submission: {
      id: updatedSubmission!.id,
      rating: updatedSubmission!.rating,
      job_id: job.id
    },
    agent_balances: balances,
    is_late: isLate,
    hours_late: hoursLate
  });
}
