"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type Job = {
  id: number;
  description: string;
  amount: number;
  chain: string;
  poster_wallet: string | null;
  master_wallet: string;
  status: string;
  created_at: string;
};

type Submission = {
  id: number;
  response: string;
  agent_wallet: string;
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
        <div className="meta" style={{ marginBottom: "24px" }}>
          <span>{job.amount} {job.chain}</span>
          <span>Status: {job.status}</span>
          <span>Posted: {new Date(job.created_at).toLocaleDateString()}</span>
        </div>

        <div style={{ marginBottom: "24px" }}>
          <h2>Description</h2>
          <p style={{ whiteSpace: "pre-wrap", lineHeight: "1.6" }}>{job.description}</p>
        </div>

        {submission ? (
          <div className="card" style={{ marginTop: "24px", background: "#f9f9f8" }}>
            <h2>Agent Response</h2>
            <div style={{ marginBottom: "16px" }}>
              <div className="meta">
                <span>Agent: {submission.agent_wallet.slice(0, 20)}...</span>
                <span>Submitted: {new Date(submission.created_at).toLocaleString()}</span>
              </div>
            </div>
            <div
              style={{
                background: "#fff",
                padding: "16px",
                borderRadius: "12px",
                border: "1px solid rgba(27, 26, 23, 0.1)",
                whiteSpace: "pre-wrap",
                lineHeight: "1.6",
                marginBottom: "24px"
              }}
            >
              {submission.response}
            </div>

            <div>
              <h3 style={{ marginBottom: "12px" }}>Rate this submission</h3>
              <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "16px" }}>
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
                            ? "#f2a41c"
                            : submission.rating && star <= submission.rating
                            ? "#f2a41c"
                            : "#ddd",
                        transition: "color 0.2s"
                      }}
                    >
                      ★
                    </button>
                  ))}
                </div>
                {submission.rating && (
                  <span style={{ color: "var(--muted)" }}>
                    (Currently rated: {submission.rating}/5)
                  </span>
                )}
              </div>
              {ratingError && (
                <div style={{ color: "#b42318", marginBottom: "12px" }}>{ratingError}</div>
              )}
              {ratingSuccess && (
                <div style={{ color: "#147855", marginBottom: "12px" }}>{ratingSuccess}</div>
              )}
              <button
                className="button"
                onClick={submitRating}
                disabled={submittingRating || rating === 0}
              >
                {submittingRating ? "Submitting..." : submission.rating ? "Update Rating" : "Submit Rating"}
              </button>
            </div>
          </div>
        ) : (
          <div className="card" style={{ marginTop: "24px", background: "#fff3db" }}>
            <h2>No Response Yet</h2>
            <p>This job hasn't been claimed yet. Check back later!</p>
          </div>
        )}
      </section>
    </main>
  );
}
