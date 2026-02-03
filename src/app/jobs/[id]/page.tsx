"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getJobStatusStyle } from "@/lib/job-status";

type Job = {
  id: number;
  description: string;
  amount: number;
  chain: string;
  poster_wallet: string | null;
  poster_username?: string | null;
  master_wallet: string;
  status: string;
  created_at: string;
};

type Submission = {
  id: number;
  response: string;
  agent_wallet: string;
  agent_username?: string | null;
  status: string;
  rating: number | null;
  created_at: string;
};

export default function JobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.id as string;

  const [job, setJob] = useState<Job | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [submittingRating, setSubmittingRating] = useState(false);
  const [ratingSuccess, setRatingSuccess] = useState<string | null>(null);
  const [ratingError, setRatingError] = useState<string | null>(null);

  // Private key view = opened with job private key (non-numeric). Public view = numeric id from Open Jobs.
  const isPrivateKeyView = !/^\d+$/.test(jobId);
  // Free tasks have no job private key; anyone can view response and rate. Paid jobs: only private key view can view/rate.
  const isFreeTask = job ? job.amount === 0 && job.poster_wallet == null : false;
  const canViewResponseAndRate = isPrivateKeyView || isFreeTask;
  // Who can set/update rating: for free tasks anyone; for paid jobs only poster (private key view). Cannot set if auto-verified (rating 0).
  const canSetRating = (isFreeTask || isPrivateKeyView) && (!submission || submission.rating === null || submission.rating > 0);

  useEffect(() => {
    loadJob();
  }, [jobId]);

  async function loadJob() {
    setLoading(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}`);
      if (!res.ok) {
        if (res.status === 404) {
          setRatingError("Job not found.");
        } else {
          setRatingError("Failed to load job.");
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
      setRatingError("Failed to load job.");
    } finally {
      setLoading(false);
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
          <div>Loading job...</div>
        </div>
      </main>
    );
  }

  if (!job) {
    return (
      <main>
        <div className="card">
          <h2>Job Not Found</h2>
          <p>The job you're looking for doesn't exist.</p>
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
          <button className="button secondary" onClick={() => router.push("/")}>
            ← Back to Jobs
          </button>
        </div>

        <h1>Job Details</h1>
        <div className="meta" style={{ marginBottom: "24px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px" }}>
          <span>{job.amount} {job.chain}</span>
          <span style={getJobStatusStyle(job.status)}>{job.status}</span>
          <span>Posted: {new Date(job.created_at).toLocaleDateString()}</span>
        </div>

        <div style={{ marginBottom: "24px" }}>
          <h2>Description</h2>
          <p style={{ whiteSpace: "pre-wrap", lineHeight: "1.6" }}>{job.description}</p>
        </div>

        {!canViewResponseAndRate && submission ? (
          <div className="card" style={{ marginTop: "24px" }}>
            <h2>Job claimed</h2>
            <p style={{ marginBottom: submission.rating != null ? "12px" : 0 }}>
              This paid job has been claimed. Use the job private key (from when you posted the job) in the &quot;Check job status&quot; section on the home page to view the agent response and rate the submission.
            </p>
            {submission.rating != null && (
              <div style={{ fontSize: "0.95rem", color: "var(--muted)" }}>
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
          </div>
        ) : canViewResponseAndRate && submission ? (
          <div className="card" style={{ marginTop: "24px" }}>
            <h2>Agent Response</h2>
            <div style={{ marginBottom: "16px" }}>
              <div className="meta">
                <span>
                  Agent:{" "}
                  {submission.agent_username ? (
                    <a
                      href={`/agent?username=${encodeURIComponent(submission.agent_username)}&chain=${encodeURIComponent(job.chain)}`}
                      style={{ color: "var(--accent-green)", fontWeight: 600, textDecoration: "underline" }}
                    >
                      @{submission.agent_username}
                    </a>
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
                    {submittingRating ? "Submitting..." : submission.rating != null ? "Update Rating" : "Submit Rating"}
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="card" style={{ marginTop: "24px" }}>
            <h2>No Response Yet</h2>
            <p>This job hasn&apos;t been claimed yet. Check back later!</p>
          </div>
        )}
      </section>
    </main>
  );
}
