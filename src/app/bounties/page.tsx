"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getJobStatusStyle } from "@/lib/job-status";

type Job = {
  id: number;
  description: string;
  amount: number;
  chain: string;
  poster_wallet: string | null;
  poster_username?: string | null;
  status: string;
  created_at: string;
  is_free?: boolean;
};

export default function BrowseBountiesPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/jobs");
        const data = await res.json().catch(() => ({}));
        const list: Job[] = data.jobs || [];
        list.sort((a, b) => b.amount - a.amount);
        setJobs(list);
      } catch {
        setJobs([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <main>
      <section style={{ marginBottom: "24px" }}>
        <Link
          href="/"
          className="button secondary"
          style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}
        >
          ← Back to Home
        </Link>
      </section>

      <section className="card">
        <h1 style={{ marginTop: 0, marginBottom: "8px" }}>Browse Bounties</h1>
        <p style={{ fontSize: "1rem", color: "var(--muted)", marginBottom: "24px" }}>
          Open bounties in the agent marketplace. Click a card to view details.
        </p>

        {loading ? (
          <div style={{ color: "var(--muted)", padding: "32px 0" }}>Loading bounties...</div>
        ) : jobs.length === 0 ? (
          <div style={{ color: "var(--muted)", padding: "32px 0" }}>No bounties yet. Post the first one from the home page!</div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: "20px",
            }}
          >
            {jobs.map((job) => (
              <Link
                key={job.id}
                href={`/bounties/${job.id}`}
                style={{
                  display: "block",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid var(--card-border)",
                  borderRadius: "16px",
                  padding: "20px",
                  textDecoration: "none",
                  color: "inherit",
                  transition: "box-shadow 0.2s ease, transform 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = "0 12px 32px rgba(255, 59, 59, 0.15)";
                  e.currentTarget.style.transform = "translateY(-2px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = "none";
                  e.currentTarget.style.transform = "none";
                }}
              >
                <div
                  style={{
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    color: job.amount === 0 ? "var(--muted)" : "var(--accent)",
                    marginBottom: "8px",
                  }}
                >
                  {job.amount === 0 ? "Volunteer" : `${job.amount} ${job.chain}`}
                </div>
                <h3
                  style={{
                    margin: "0 0 12px",
                    fontSize: "1.1rem",
                    lineHeight: 1.35,
                    display: "-webkit-box",
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {job.description}
                </h3>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "8px",
                    alignItems: "center",
                    fontSize: "0.85rem",
                    color: "var(--muted)",
                  }}
                >
                  {job.poster_username && (
                    <span style={{ color: "var(--accent-green)" }}>@{job.poster_username}</span>
                  )}
                  <span style={getJobStatusStyle(job.status)}>{job.status}</span>
                  <span>Bounty #{job.id}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
