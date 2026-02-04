import { NextResponse } from "next/server";
import { getJob, getJobByPrivateId, getSubmission, getSubmissionByJobPrivateId, updateSubmissionRating, updateJobStatus, getWalletBalances, returnPosterCollateral, getAgentByUsername, RATING_IMMUTABLE_ERROR } from "@/lib/db";
import { verifyPrivateKey } from "@/lib/agent-auth";

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const idParam = params.id;
  const payload = await request.json().catch(() => null);
  if (!payload) {
    return badRequest("Invalid JSON body.");
  }

  const rating = Number(payload.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return badRequest("Rating must be an integer between 1 and 5.");
  }

  const isNumericId = /^\d+$/.test(idParam);
  let job: Awaited<ReturnType<typeof getJob>>;
  let submission: Awaited<ReturnType<typeof getSubmission>>;
  const posterWallet: string | null = typeof payload.posterWallet === "string" ? payload.posterWallet.trim() || null : null;
  const posterUsername = typeof payload.posterUsername === "string" ? payload.posterUsername.trim() || null : null;
  const posterPrivateKey = typeof payload.posterPrivateKey === "string" ? payload.posterPrivateKey.trim() || null : null;

  if (isNumericId) {
    return badRequest(
      "Rating is only allowed via the bounty private key (from when you posted). Use GET /api/jobs/{private_id} and POST /api/jobs/{private_id}/rate with posterUsername + posterPrivateKey."
    );
  } else {
    job = await getJobByPrivateId(idParam);
    if (!job) {
      return NextResponse.json({ error: "Bounty not found." }, { status: 404 });
    }
    const isFreeBounty = job.amount === 0;
    const isAnonymousPoster = (job.poster_username || "").toLowerCase() === "anonymous";
    // Free bounties or @anonymous poster: anyone with the private link can rate. Other paid bounties: require poster auth.
    if (!isFreeBounty && !isAnonymousPoster) {
      if (posterUsername && posterPrivateKey) {
        const usernameLower = posterUsername.toLowerCase();
        const agent = await getAgentByUsername(usernameLower);
        if (!agent) {
          return NextResponse.json({ error: "Account not found." }, { status: 404 });
        }
        if (!verifyPrivateKey(posterPrivateKey, agent.private_key_hash)) {
          return NextResponse.json({ error: "Invalid username or private key." }, { status: 401 });
        }
        const jobPosterLower = (job.poster_username || "").toLowerCase();
        if (jobPosterLower !== agent.username_lower) {
          return NextResponse.json({ error: "Unauthorized. Only the poster can rate this bounty." }, { status: 403 });
        }
      } else if (posterWallet) {
        if (job.poster_wallet !== posterWallet) {
          return NextResponse.json({ error: "Unauthorized. Only the poster can rate this bounty." }, { status: 403 });
        }
      } else {
        return badRequest("posterWallet or posterUsername+posterPrivateKey is required to rate this paid bounty.");
      }
    }
    submission = await getSubmissionByJobPrivateId(idParam);
  }

  if (!submission) {
    return NextResponse.json(
      { error: "No submission found for this bounty." },
      { status: 404 }
    );
  }

  // Ratings are immutable once submitted (including auto-verified rating 0)
  if (submission.rating !== null) {
    return NextResponse.json(
      { error: "This submission has already been rated. Ratings are immutable and cannot be changed." },
      { status: 409 }
    );
  }

  const isFreeTask = job.amount === 0;

  // Check for late rating (only relevant for paid jobs with poster)
  const now = new Date();
  const deadline = submission.rating_deadline ? new Date(submission.rating_deadline) : null;
  const isLate = deadline ? now > deadline : false;
  const hoursLate = isLate && deadline ? Math.floor((now.getTime() - deadline.getTime()) / (1000 * 60 * 60)) : 0;

  try {
    await updateSubmissionRating(submission.id, rating, job.amount, submission.agent_wallet, job.chain, job.poster_wallet);
  } catch (err) {
    if (err instanceof Error && err.message === RATING_IMMUTABLE_ERROR) {
      return NextResponse.json(
        { error: "This submission has already been rated. Ratings are immutable and cannot be changed." },
        { status: 409 }
      );
    }
    throw err;
  }

  let collateralReturned = false;
  if (!isFreeTask && !isLate) {
    collateralReturned = await returnPosterCollateral(job.id, job.chain);
  }

  await updateJobStatus(job.id, "completed");

  const balances = await getWalletBalances(submission.agent_wallet, job.chain);
  const updatedSubmission = await getSubmission(job.id);

  if (isFreeTask) {
    return NextResponse.json({
      message: "Rating submitted successfully. This was a free task; no payouts or collateral.",
      submission: {
        id: updatedSubmission!.id,
        rating: updatedSubmission!.rating,
        job_id: job.id
      },
      is_late: isLate,
      hours_late: hoursLate
    });
  }

  let rewardMessage = "";
  let lateMessage = "";
  if (rating >= 2) {
    rewardMessage = ` Agent received ${job.amount} USDC payout (moved from pending to verified balance).`;
  } else {
    rewardMessage = ` Agent received no payout (rating below 2).`;
  }
  if (isLate) {
    lateMessage = ` Rating submitted ${hoursLate} hours late. Poster did not get collateral back (forfeit for rating late).`;
  }
  const collateralMessage = collateralReturned
    ? ` Poster's 0.001 USDC collateral has been returned to ${job.poster_wallet}.`
    : "";

  return NextResponse.json({
    message: `Rating submitted successfully.${rewardMessage}${lateMessage}${collateralMessage} Agent balances: ${balances.verified_balance.toFixed(4)} verified, ${balances.pending_balance.toFixed(4)} pending, ${balances.balance.toFixed(4)} total USDC.`,
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
