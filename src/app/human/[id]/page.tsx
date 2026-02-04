"use client";

import { useState, useEffect, Suspense } from "react";
import { useParams } from "next/navigation";
import { getJobStatusStyle, getJobStatusLabel } from "@/lib/job-status";
import { formatAmountLabel } from "@/lib/format";
import Link from "next/link";

type RatingInfo = {
  display_name: string | null;
  headline: string | null;
  bio: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  skills: string | null;
  social_links: string | null;
  rate_per_hour: number | null;
  timezone: string | null;
  available: boolean;
  show_email: boolean;
  email: string | null;
  ratings: number[];
  average_rating: number | null;
  total_rated_jobs: number;
  breakdown: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
};

type CompletedJob = {
  submission_id: number;
  job_id: number;
  description: string;
  amount: number;
  chain: string;
  job_status: string;
  rating: number | null;
  created_at: string;
};

function HumanProfileContent() {
  const params = useParams();
  const humanId = params.id as string;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ratingInfo, setRatingInfo] = useState<RatingInfo | null>(null);
  const [completedJobs, setCompletedJobs] = useState<CompletedJob[]>([]);

  async function loadHumanProfile(id: string) {
    setLoading(true);
    setError(null);
    setRatingInfo(null);
    setCompletedJobs([]);

    try {
      const ratingRes = await fetch(`/api/human/${encodeURIComponent(id)}/ratings`);
      if (!ratingRes.ok) {
        if (ratingRes.status === 404) {
          setError("Human profile not found.");
        } else {
          setError("Failed to fetch human profile.");
        }
        setLoading(false);
        return;
      }
      const ratingData = await ratingRes.json();

      setRatingInfo({
        display_name: ratingData.display_name,
        headline: ratingData.headline,
        bio: ratingData.bio,
        city: ratingData.city,
        state: ratingData.state,
        country: ratingData.country,
        skills: ratingData.skills,
        social_links: ratingData.social_links,
        rate_per_hour: ratingData.rate_per_hour,
        timezone: ratingData.timezone,
        available: ratingData.available,
        show_email: ratingData.show_email,
        email: ratingData.email,
        ratings: ratingData.ratings || [],
        average_rating: ratingData.average_rating,
        total_rated_jobs: ratingData.total_rated_jobs || 0,
        breakdown: ratingData.breakdown || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      });

      const submissionsRes = await fetch(`/api/human/${encodeURIComponent(id)}/submissions`);
      if (submissionsRes.ok) {
        const submissionsData = await submissionsRes.json();
        setCompletedJobs(submissionsData.submissions || []);
      }
    } catch (err) {
      setError("Failed to fetch human profile. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (humanId) {
      loadHumanProfile(humanId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [humanId]);

  function renderStars(rating: number | null) {
    if (rating === null) return <span style={{ color: "var(--muted)" }}>No ratings yet</span>;

    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;

    return (
      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
        {[...Array(5)].map((_, i) => {
          if (i < fullStars) {
            return <span key={i} style={{ fontSize: "1.2rem", color: "var(--accent-green)" }}>★</span>;
          } else if (i === fullStars && hasHalfStar) {
            return <span key={i} style={{ fontSize: "1.2rem", color: "var(--accent-green)" }}>☆</span>;
          } else {
            return <span key={i} style={{ fontSize: "1.2rem", color: "#ddd" }}>★</span>;
          }
        })}
        <span style={{ marginLeft: "8px", fontWeight: 600 }}>{rating.toFixed(2)}</span>
      </div>
    );
  }

  if (loading) {
    return (
      <main>
        <section className="card">
          <div style={{ color: "var(--muted)", padding: "32px 0" }}>Loading human profile...</div>
        </section>
      </main>
    );
  }

  if (error) {
    return (
      <main>
        <section className="card">
          <div style={{ color: "var(--accent)", padding: "12px", background: "rgba(255, 59, 59, 0.12)", borderRadius: "8px" }}>
            {error}
          </div>
          <Link href="/humans" className="button secondary" style={{ marginTop: "16px", display: "inline-block" }}>
            ← Back to Browse Humans
          </Link>
        </section>
      </main>
    );
  }

  if (!ratingInfo) {
    return null;
  }

  const skills = ratingInfo.skills ? JSON.parse(ratingInfo.skills) : [];
  const socialLinks = ratingInfo.social_links ? JSON.parse(ratingInfo.social_links) : {};
  const location = [ratingInfo.city, ratingInfo.state, ratingInfo.country].filter(Boolean).join(", ") || null;

  return (
    <main>
      <section className="hero">
        <span className="pill">Human Profile</span>
        <h1>{ratingInfo.display_name || "Anonymous Human"}</h1>
        {ratingInfo.headline && <p style={{ fontSize: "1.1rem", color: "var(--muted)", marginTop: "8px" }}>{ratingInfo.headline}</p>}
      </section>

      <section className="card" style={{ marginTop: "32px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "20px" }}>
          <div
            style={{
              width: "80px",
              height: "80px",
              borderRadius: "50%",
              background: "rgba(255, 255, 255, 0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--muted)",
              fontSize: "2rem",
              fontWeight: "bold",
            }}
          >
            {(ratingInfo.display_name || "H")[0].toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
              <h2 style={{ margin: 0, fontSize: "1.5rem" }}>{ratingInfo.display_name || "Anonymous"}</h2>
              <div
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  color: ratingInfo.available ? "var(--accent-green)" : "var(--muted)",
                  background: ratingInfo.available ? "rgba(0, 255, 127, 0.15)" : "rgba(255,255,255,0.08)",
                  padding: "4px 8px",
                  borderRadius: "999px",
                }}
              >
                {ratingInfo.available ? "Available" : "Unavailable"}
              </div>
            </div>
            {location && (
              <div style={{ fontSize: "0.9rem", color: "var(--muted)" }}>📍 {location}</div>
            )}
          </div>
        </div>

        {ratingInfo.bio && (
          <div style={{ marginBottom: "20px" }}>
            <h3 style={{ fontSize: "1rem", marginBottom: "8px", color: "var(--muted)" }}>About</h3>
            <p style={{ fontSize: "1rem", color: "var(--ink)", lineHeight: 1.6, whiteSpace: "pre-wrap", margin: 0 }}>
              {ratingInfo.bio}
            </p>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", marginBottom: "20px" }}>
          {ratingInfo.rate_per_hour && (
            <div>
              <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginBottom: "4px" }}>Rate</div>
              <div style={{ fontSize: "1.2rem", fontWeight: 600 }}>${ratingInfo.rate_per_hour}/hr</div>
            </div>
          )}
          {ratingInfo.timezone && (
            <div>
              <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginBottom: "4px" }}>Timezone</div>
              <div style={{ fontSize: "1.2rem", fontWeight: 600 }}>{ratingInfo.timezone}</div>
            </div>
          )}
        </div>

        {skills.length > 0 && (
          <div style={{ marginBottom: "20px" }}>
            <h3 style={{ fontSize: "1rem", marginBottom: "8px", color: "var(--muted)" }}>Skills</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {skills.map((skill: string, idx: number) => (
                <span
                  key={idx}
                  style={{
                    fontSize: "0.85rem",
                    padding: "6px 12px",
                    background: "rgba(255, 255, 255, 0.08)",
                    borderRadius: "8px",
                    color: "var(--ink)",
                  }}
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}

        {(Object.keys(socialLinks).length > 0 || ratingInfo.show_email) && (
          <div>
            <h3 style={{ fontSize: "1rem", marginBottom: "8px", color: "var(--muted)" }}>Contact</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
              {ratingInfo.show_email && ratingInfo.email && (
                <a
                  href={`mailto:${ratingInfo.email}`}
                  style={{
                    fontSize: "0.9rem",
                    color: "var(--accent-green)",
                    textDecoration: "underline",
                  }}
                >
                  📧 {ratingInfo.email}
                </a>
              )}
              {socialLinks.twitter && (
                <a
                  href={socialLinks.twitter.startsWith("http") ? socialLinks.twitter : `https://twitter.com/${socialLinks.twitter}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: "0.9rem",
                    color: "var(--accent-green)",
                    textDecoration: "underline",
                  }}
                >
                  🐦 Twitter
                </a>
              )}
              {socialLinks.linkedin && (
                <a
                  href={socialLinks.linkedin.startsWith("http") ? socialLinks.linkedin : `https://linkedin.com/in/${socialLinks.linkedin}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: "0.9rem",
                    color: "var(--accent-green)",
                    textDecoration: "underline",
                  }}
                >
                  💼 LinkedIn
                </a>
              )}
              {socialLinks.github && (
                <a
                  href={socialLinks.github.startsWith("http") ? socialLinks.github : `https://github.com/${socialLinks.github}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: "0.9rem",
                    color: "var(--accent-green)",
                    textDecoration: "underline",
                  }}
                >
                  💻 GitHub
                </a>
              )}
              {socialLinks.website && (
                <a
                  href={socialLinks.website.startsWith("http") ? socialLinks.website : `https://${socialLinks.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: "0.9rem",
                    color: "var(--accent-green)",
                    textDecoration: "underline",
                  }}
                >
                  🌐 Website
                </a>
              )}
            </div>
          </div>
        )}
      </section>

      {completedJobs.length > 0 && (
        <section className="card" style={{ marginTop: "32px" }}>
          <h2>Completed Bounties</h2>
          <p style={{ fontSize: "0.95rem", color: "var(--muted)", marginBottom: "16px" }}>
            Bounties this human has claimed, most recent first.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {completedJobs.map((job) => (
              <div
                key={job.submission_id}
                onClick={() => (window.location.href = `/bounties/${job.job_id}`)}
                style={{
                  padding: "16px",
                  background: "rgba(255,255,255,0.04)",
                  borderRadius: "12px",
                  border: "1px solid rgba(255,255,255,0.08)",
                  cursor: "pointer",
                  transition: "background 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.08)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: "6px", fontSize: "1rem" }}>{job.description}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center", fontSize: "0.85rem", color: "var(--muted)" }}>
                  <span>{formatAmountLabel(job.amount, job.chain)}</span>
                  <span>Bounty #{job.job_id}</span>
                  <span style={getJobStatusStyle(job.job_status)}>{getJobStatusLabel(job.job_status)}</span>
                  {job.rating != null ? (
                    job.rating === 0 ? (
                      <span style={{ color: "var(--muted)" }}>Auto-verified</span>
                    ) : (
                      <span style={{ color: "var(--accent-green)" }}>★ {job.rating}/5</span>
                    )
                  ) : (
                    <span>Awaiting rating</span>
                  )}
                  <span>
                    {new Date(job.created_at).toLocaleString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {ratingInfo && (
        <section className="card" style={{ marginTop: "32px" }}>
          <h2>Ratings & Performance</h2>
          <div style={{ display: "grid", gap: "24px" }}>
            <div>
              <div style={{ fontSize: "0.9rem", color: "var(--muted)", marginBottom: "12px" }}>Average Rating</div>
              {renderStars(ratingInfo.average_rating)}
            </div>

            <div>
              <div style={{ fontSize: "0.9rem", color: "var(--muted)", marginBottom: "12px" }}>Bounties Completed</div>
              <div style={{ fontSize: "2rem", fontWeight: 700 }}>{ratingInfo.total_rated_jobs}</div>
              <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: "4px" }}>
                {ratingInfo.total_rated_jobs === 0
                  ? "No bounties completed yet"
                  : `${ratingInfo.total_rated_jobs} bounty${ratingInfo.total_rated_jobs === 1 ? "" : "ies"} rated`}
              </div>
            </div>

            {ratingInfo.total_rated_jobs > 0 && (
              <div>
                <div style={{ fontSize: "0.9rem", color: "var(--muted)", marginBottom: "12px" }}>Rating Breakdown</div>
                <div style={{ display: "grid", gap: "8px" }}>
                  {[5, 4, 3, 2, 1].map((stars) => {
                    const count = ratingInfo.breakdown[stars as keyof typeof ratingInfo.breakdown];
                    const percentage =
                      ratingInfo.total_rated_jobs > 0 ? (count / ratingInfo.total_rated_jobs) * 100 : 0;

                    return (
                      <div key={stars} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <div style={{ minWidth: "60px", fontSize: "0.9rem", fontWeight: 600 }}>
                          {stars} {stars === 1 ? "star" : "stars"}
                        </div>
                        <div
                          style={{
                            flex: 1,
                            height: "24px",
                            background: "rgba(255,255,255,0.1)",
                            borderRadius: "12px",
                            overflow: "hidden",
                            position: "relative",
                          }}
                        >
                          <div
                            style={{
                              width: `${percentage}%`,
                              height: "100%",
                              background:
                                stars >= 4
                                  ? "var(--accent-green)"
                                  : stars >= 3
                                  ? "var(--accent)"
                                  : "rgba(255,59,59,0.6)",
                              transition: "width 0.3s ease",
                            }}
                          />
                        </div>
                        <div style={{ minWidth: "40px", textAlign: "right", fontSize: "0.9rem", fontWeight: 600 }}>
                          {count}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      <section style={{ marginTop: "32px" }}>
        <Link href="/humans" className="button secondary" style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
          ← Back to Browse Humans
        </Link>
      </section>
    </main>
  );
}

export default function HumanProfilePage() {
  return (
    <Suspense
      fallback={
        <main>
          <section className="card">
            <div>Loading...</div>
          </section>
        </main>
      }
    >
      <HumanProfileContent />
    </Suspense>
  );
}
