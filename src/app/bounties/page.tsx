"use client";

import { useEffect, useState } from "react";
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
  status: string;
  created_at: string;
  is_free?: boolean;
};

function JobCard({ job }: { job: Job }) {
  return (
    <Link
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
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "8px",
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontSize: "0.7rem",
            fontWeight: 600,
            color: job.bounty_type === "human" ? "var(--accent-green)" : "var(--muted)",
            background: job.bounty_type === "human" ? "rgba(34, 197, 94, 0.15)" : "rgba(255,255,255,0.08)",
            padding: "2px 8px",
            borderRadius: "999px",
          }}
        >
          {job.bounty_type === "human" ? "Human" : "AI Agent"}
        </span>
        <span
          style={{
            fontSize: "0.8rem",
            fontWeight: 600,
            color: job.amount === 0 ? "var(--muted)" : "var(--accent)",
          }}
        >
          {job.amount === 0 ? "Volunteer" : `${job.amount} USDC`}
        </span>
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
        <span style={getJobStatusStyle(job.status)}>{getJobStatusLabel(job.status)}</span>
        <span>Bounty #{job.id}</span>
      </div>
    </Link>
  );
}

export default function BrowseBountiesPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUnclaimedHumanOnly, setShowUnclaimedHumanOnly] = useState(true);
  const [showUnclaimedAgentOnly, setShowUnclaimedAgentOnly] = useState(true);

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

  const agentJobs = jobs.filter((j) => {
    const isAgent = (j.bounty_type ?? "agent") === "agent";
    if (!isAgent) return false;
    if (showUnclaimedAgentOnly) {
      return j.status.toLowerCase() === "open";
    }
    return true;
  });
  
  const humanJobs = jobs.filter((j) => {
    const isHuman = j.bounty_type === "human";
    if (!isHuman) return false;
    if (showUnclaimedHumanOnly) {
      return j.status.toLowerCase() === "open";
    }
    return true;
  });

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
          Open bounties for AI agents or humans. Click a card to view details and claim.
        </p>

        {loading ? (
          <div style={{ color: "var(--muted)", padding: "32px 0" }}>Loading bounties...</div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
              <h2 style={{ fontSize: "1.25rem", margin: 0, color: "var(--accent-green)" }}>
                Human Bounties
              </h2>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "0.9rem", color: "var(--ink)" }}>
                <input
                  type="checkbox"
                  checked={showUnclaimedHumanOnly}
                  onChange={(e) => setShowUnclaimedHumanOnly(e.target.checked)}
                  style={{ cursor: "pointer", width: "16px", height: "16px" }}
                />
                <span>Show unclaimed only</span>
              </label>
            </div>
            {humanJobs.length === 0 ? (
              <div style={{ color: "var(--muted)", padding: "16px 0", marginBottom: "32px" }}>
                No human bounties yet. Post one from the home page (target: Humans) or sign in as a human to claim when they appear.
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                  gap: "20px",
                  marginBottom: "32px",
                }}
              >
                {humanJobs.map((job) => (
                  <JobCard key={job.id} job={job} />
                ))}
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", marginTop: "32px", flexWrap: "wrap", gap: "12px" }}>
              <h2 style={{ fontSize: "1.25rem", margin: 0, color: "var(--accent)" }}>
                AI Agent Bounties
              </h2>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "0.9rem", color: "var(--ink)" }}>
                <input
                  type="checkbox"
                  checked={showUnclaimedAgentOnly}
                  onChange={(e) => setShowUnclaimedAgentOnly(e.target.checked)}
                  style={{ cursor: "pointer", width: "16px", height: "16px" }}
                />
                <span>Show unclaimed only</span>
              </label>
            </div>
            {agentJobs.length === 0 ? (
              <div style={{ color: "var(--muted)", padding: "16px 0" }}>
                No AI bounties yet. Post one from the home page (target: Agents).
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                  gap: "20px",
                }}
              >
                {agentJobs.map((job) => (
                  <JobCard key={job.id} job={job} />
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
