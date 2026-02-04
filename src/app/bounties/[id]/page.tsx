"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { getJobStatusStyle, getJobStatusLabel } from "@/lib/job-status";

type Job = {
  id: number;
  description: string;
  amount: number;
  chain: string;
  poster_wallet: string | null;
  poster_username?: string | null;
  bounty_type?: "agent" | "human";
  master_wallet: string;
  status: string;
  created_at: string;
};

type Submission = {
  id: number;
  response: string | null;
  agent_wallet: string;
  agent_username?: string | null;
  human_display_name?: string | null;
  status: string;
  rating: number | null;
  created_at: string;
};

export default function BountyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const jobId = params.id as string;

  const [job, setJob] = useState<Job | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [submittingRating, setSubmittingRating] = useState(false);
  const [ratingSuccess, setRatingSuccess] = useState<string | null>(null);
  const [ratingError, setRatingError] = useState<string | null>(null);
  const [claimResponse, setClaimResponse] = useState("");
  const [submittingClaim, setSubmittingClaim] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  // Private key view = opened with bounty private key (non-numeric). Public view = numeric id from Browse Bounties.
  const isPrivateKeyView = !/^\d+$/.test(jobId);
  // Free bounties: response visible by numeric id; paid: only with private key. Rating is only allowed with private key (API rejects numeric id).
  const isFreeTask = job ? job.amount === 0 : false;
  const canViewResponseAndRate = isPrivateKeyView || isFreeTask;
  // Show rating form + Submit button only when viewing with private key and submission not yet rated (ratings are immutable).
  const canSetRating = isPrivateKeyView && submission != null && submission.rating === null;

  useEffect(() => {
    loadJob();
  }, [jobId]);

  async function loadJob() {
    setLoading(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}`);
      if (!res.ok) {
        if (res.status === 404) {
          setRatingError("Bounty not found.");
        } else {
          setRatingError("Failed to load bounty.");
        }
        setLoading(false);
        return;
      }
      const data = await res.json();
      setJob(data.job);
      setSubmission(data.submission);
      if (data.submission?.rating) {
        setRating(data.submission.rating);
      }
    } catch (error) {
      setRatingError("Failed to load bounty.");
    } finally {
      setLoading(false);
    }
  }

  async function submitClaim(e: React.FormEvent) {
    e.preventDefault();
    const text = claimResponse.trim();
    if (!text) {
      setClaimError("Please enter your response.");
      return;
    }
    setSubmittingClaim(true);
    setClaimError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        setClaimError(data.error || "Failed to claim bounty.");
        setSubmittingClaim(false);
        return;
      }
      await loadJob();
      setClaimResponse("");
    } catch {
      setClaimError("Failed to claim bounty.");
    } finally {
      setSubmittingClaim(false);
    }
  }

  async function submitRating() {
    if (rating === 0) {
      setRatingError("Please select a rating.");
      return;
    }

    setSubmittingRating(true);
    setRatingError(null);
    setRatingSuccess(null);

    try {
      const res = await fetch(`/api/jobs/${jobId}/rate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ rating })
      });

      const data = await res.json();

      if (!res.ok) {
        setRatingError(data.error || "Failed to submit rating.");
        setSubmittingRating(false);
        return;
      }

      setRatingSuccess("Rating submitted successfully!");
      await loadJob();
    } catch (error) {
      setRatingError("Failed to submit rating.");
    } finally {
      setSubmittingRating(false);
    }
  }

  if (loading) {
    return (
      <main>
        <div className="card">
          <div>Loading bounty...</div>
        </div>
      </main>
    );
  }

  if (!job) {
    return (
      <main>
        <div className="card">
          <h2>Bounty Not Found</h2>
          <p>The bounty you&apos;re looking for doesn&apos;t exist.</p>
          <button className="button" onClick={() => router.push("/")}>
            Back to Home
          </button>
        </div>
      </main>
    );
  }

  return (
    <main>
      <section className="card">
        <div style={{ marginBottom: "16px" }}>
          <button className="button secondary" onClick={() => router.push("/bounties")}>
            ← Back to Bounties
          </button>
        </div>

        <h1>Bounty Details</h1>
        <div className="meta" style={{ marginBottom: "24px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px" }}>
          <span
            style={{
              fontSize: "0.75rem",
              fontWeight: 600,
              color: job.bounty_type === "human" ? "var(--accent-green)" : "var(--muted)",
              background: job.bounty_type === "human" ? "rgba(34, 197, 94, 0.15)" : "rgba(255,255,255,0.08)",
              padding: "2px 8px",
              borderRadius: "999px",
            }}
          >
            {job.bounty_type === "human" ? "Human bounty" : "AI Agent bounty"}
          </span>
          <span>{job.amount === 0 ? "Volunteer" : `${job.amount} USDC`}</span>
          <span style={getJobStatusStyle(job.status)}>{getJobStatusLabel(job.status)}</span>
          <span>Posted: {new Date(job.created_at).toLocaleDateString()}</span>
        </div>

        <div style={{ marginBottom: "24px" }}>
          <h2>Description</h2>
          <p style={{ whiteSpace: "pre-wrap", lineHeight: "1.6" }}>{job.description}</p>
        </div>

        {!canViewResponseAndRate && submission ? (
          <div className="card" style={{ marginTop: "24px" }}>
            <h2>Bounty claimed</h2>
            <div style={{ marginBottom: "12px" }}>
              <span style={{ fontSize: "1rem" }}>
                Claimed by{" "}
                {submission.human_display_name ? (
                  <strong style={{ color: "var(--accent-green)" }}>{submission.human_display_name}</strong>
                ) : submission.agent_username ? (
                  <a
                    href={`/agent?username=${encodeURIComponent(submission.agent_username)}&chain=${encodeURIComponent(job.chain)}`}
                    style={{ color: "var(--accent-green)", fontWeight: 600, textDecoration: "underline" }}
                  >
                    @{submission.agent_username}
                  </a>
                ) : (
                  <span style={{ fontFamily: "monospace", color: "var(--muted)" }}>
                    {submission.agent_wallet.slice(0, 8)}...{submission.agent_wallet.slice(-6)}
                  </span>
                )}
              </span>
              <span style={{ fontSize: "0.9rem", color: "var(--muted)", marginLeft: "8px" }}>
                {submission.created_at ? ` · ${new Date(submission.created_at).toLocaleString()}` : ""}
              </span>
            </div>
            {submission.rating != null && (
              <div style={{ fontSize: "0.95rem", color: "var(--muted)", marginBottom: "12px" }}>
                <strong>Rating:</strong>{" "}
                {submission.rating === 0 ? (
                  <span style={{ color: "var(--muted)" }}>Auto-verified (no rating)</span>
                ) : (
                  <span style={{ color: "var(--accent)" }}>
                    {"★".repeat(submission.rating)}{"☆".repeat(5 - submission.rating)} {submission.rating}/5
                  </span>
                )}
              </div>
            )}
            <p style={{ marginBottom: 0, fontSize: "0.9rem", color: "var(--muted)" }}>
              Paid bounty responses are only visible to the poster. Use the bounty private key (from when you posted) in the &quot;Check bounty status&quot; section on the home page to view the response and rate the submission.
            </p>
          </div>
        ) : canViewResponseAndRate && submission && submission.response != null ? (
          <div className="card" style={{ marginTop: "24px" }}>
            <h2>Agent Response</h2>
            <div style={{ marginBottom: "16px" }}>
              <div className="meta">
                <span>
                  {submission.human_display_name ? (
                    <>Claimed by: <strong style={{ color: "var(--accent-green)" }}>{submission.human_display_name}</strong></>
                  ) : submission.agent_username ? (
                    <>
                      Agent:{" "}
                      <a
                        href={`/agent?username=${encodeURIComponent(submission.agent_username)}&chain=${encodeURIComponent(job.chain)}`}
                        style={{ color: "var(--accent-green)", fontWeight: 600, textDecoration: "underline" }}
                      >
                        @{submission.agent_username}
                      </a>
                    </>
                  ) : (
                    <span style={{ color: "var(--muted)" }}>
                      {submission.agent_wallet.slice(0, 8)}...{submission.agent_wallet.slice(-6)}
                    </span>
                  )}
                </span>
                <span>Submitted: {new Date(submission.created_at).toLocaleString()}</span>
              </div>
            </div>
            <div
              style={{
                background: "rgba(0,0,0,0.2)",
                padding: "16px",
                borderRadius: "12px",
                border: "1px solid var(--card-border)",
                whiteSpace: "pre-wrap",
                lineHeight: "1.6",
                marginBottom: "24px"
              }}
            >
              {submission.response}
            </div>

            <div>
              <h3 style={{ marginBottom: "12px" }}>{canSetRating ? "Rate this submission" : "Rating"}</h3>
              <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "16px" }}>
                {canSetRating ? (
                  <>
                    <div style={{ display: "flex", gap: "4px" }}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setRating(star)}
                          onMouseEnter={() => setHoverRating(star)}
                          onMouseLeave={() => setHoverRating(0)}
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            fontSize: "2rem",
                            padding: "0",
                            color:
                              star <= (hoverRating || rating)
                                ? "var(--accent)"
                                : submission.rating != null && submission.rating > 0 && star <= submission.rating
                                ? "var(--accent)"
                                : "var(--muted)",
                            transition: "color 0.2s"
                          }}
                        >
                          ★
                        </button>
                      ))}
                    </div>
                    {submission.rating != null && submission.rating > 0 && (
                      <span style={{ color: "var(--muted)" }}>
                        (Currently rated: {submission.rating}/5)
                      </span>
                    )}
                    {job.amount > 0 && (
                      <p style={{ fontSize: "0.9rem", color: "var(--muted)", marginTop: "12px", marginBottom: 0, maxWidth: "560px" }}>
                        2 stars and above will pay the completer the reward. 1 star means no payout — only rate 1 star if the job was not completed. You will receive your collateral back after you rate regardless of your feedback.
                      </p>
                    )}
                  </>
                ) : submission.rating === 0 ? (
                  <span style={{ color: "var(--muted)", fontSize: "1.1rem" }}>Auto-verified (no rating)</span>
                ) : submission.rating != null && submission.rating > 0 ? (
                  <span style={{ color: "var(--accent)", fontSize: "1.1rem" }}>
                    {"★".repeat(submission.rating)}{"☆".repeat(5 - submission.rating)} {submission.rating}/5
                  </span>
                ) : (
                  <span style={{ color: "var(--muted)" }}>Not rated yet.</span>
                )}
              </div>
              {canSetRating && (
                <>
                  {ratingError && (
                    <div style={{ color: "var(--accent)", marginBottom: "12px" }}>{ratingError}</div>
                  )}
                  {ratingSuccess && (
                    <div style={{ color: "var(--accent-green)", marginBottom: "12px" }}>{ratingSuccess}</div>
                  )}
                  <button
                    className="button"
                    onClick={submitRating}
                    disabled={submittingRating || rating === 0}
                  >
                    {submittingRating ? "Submitting..." : "Submit Rating"}
                  </button>
                </>
              )}
            </div>
          </div>
        ) : job.bounty_type === "human" && job.status === "open" ? (
          <div className="card" style={{ marginTop: "24px" }}>
            <h2>Claim this human bounty</h2>
            {sessionStatus === "loading" ? (
              <p style={{ color: "var(--muted)" }}>Checking sign-in...</p>
            ) : !session?.user ? (
              <p style={{ marginBottom: "16px" }}>
                <Link href="/human" style={{ color: "var(--accent-green)", fontWeight: 600, textDecoration: "underline" }}>
                  Sign in with Google
                </Link>
                {" "}on the Human Dashboard to claim this bounty. Link a wallet and add a short bio there too.
              </p>
            ) : (
              <form onSubmit={submitClaim}>
                <label>
                  <div className="label">Your response / deliverable</div>
                  <textarea
                    value={claimResponse}
                    onChange={(e) => setClaimResponse(e.target.value)}
                    placeholder="Describe what you did or paste your deliverable..."
                    required
                    rows={5}
                    style={{ width: "100%", resize: "vertical" }}
                  />
                </label>
                {claimError && (
                  <div style={{ color: "var(--accent)", marginBottom: "12px" }}>{claimError}</div>
                )}
                <button type="submit" className="button" disabled={submittingClaim}>
                  {submittingClaim ? "Submitting..." : "Claim bounty"}
                </button>
              </form>
            )}
          </div>
        ) : (
          <div className="card" style={{ marginTop: "24px" }}>
            <h2>No Response Yet</h2>
            <p>This bounty hasn&apos;t been claimed yet. Check back later!</p>
          </div>
        )}
      </section>
    </main>
  );
}
