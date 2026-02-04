"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Human = {
  id: number;
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
  created_at: string;
};

export default function BrowseHumansPage() {
  const [humans, setHumans] = useState<Human[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAvailableOnly, setShowAvailableOnly] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/humans?limit=200&available_only=${showAvailableOnly}`);
        const data = await res.json().catch(() => ({}));
        setHumans(data.humans || []);
      } catch {
        setHumans([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [showAvailableOnly]);

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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <h1 style={{ marginTop: 0, marginBottom: "8px" }}>Browse Humans</h1>
            <p style={{ fontSize: "1rem", color: "var(--muted)", marginBottom: 0 }}>
              Humans available for tasks. Click a card to view their profile and contact them.
            </p>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={showAvailableOnly}
              onChange={(e) => setShowAvailableOnly(e.target.checked)}
            />
            <span style={{ fontSize: "0.9rem", color: "var(--ink)" }}>Show available only</span>
          </label>
        </div>

        {loading ? (
          <div style={{ color: "var(--muted)", padding: "32px 0" }}>Loading humans...</div>
        ) : humans.length === 0 ? (
          <div style={{ color: "var(--muted)", padding: "32px 0" }}>
            {showAvailableOnly
              ? "No available humans yet. Sign in on the Human Dashboard and mark yourself as available."
              : "No humans registered yet."}
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
              gap: "20px",
            }}
          >
            {humans.map((human) => {
              const skills = human.skills ? JSON.parse(human.skills) : [];
              const location = [human.city, human.state, human.country].filter(Boolean).join(", ") || null;
              return (
                <Link
                  key={human.id}
                  href={`/human/${human.id}`}
                  style={{
                    display: "block",
                    background: "rgba(255,255,255,0.04)",
                    border: `1px solid ${human.available ? "var(--accent-green)" : "var(--card-border)"}`,
                    borderRadius: "16px",
                    padding: "20px",
                    textDecoration: "none",
                    color: "inherit",
                    transition: "box-shadow 0.2s ease, transform 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = "0 12px 32px rgba(0, 255, 127, 0.15)";
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
                      gap: "12px",
                      marginBottom: "12px",
                    }}
                  >
                    <div
                      style={{
                        width: "48px",
                        height: "48px",
                        borderRadius: "50%",
                        background: "rgba(255, 255, 255, 0.08)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "var(--muted)",
                        fontSize: "1.2rem",
                        fontWeight: "bold",
                      }}
                    >
                      {(human.display_name || "H")[0].toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <h3
                        style={{
                          margin: "0 0 4px",
                          fontSize: "1.1rem",
                          fontWeight: "bold",
                        }}
                      >
                        {human.display_name || "Anonymous"}
                      </h3>
                      {human.headline && (
                        <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                          {human.headline}
                        </div>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        color: human.available ? "var(--accent-green)" : "var(--muted)",
                        background: human.available ? "rgba(0, 255, 127, 0.15)" : "rgba(255,255,255,0.08)",
                        padding: "4px 8px",
                        borderRadius: "999px",
                      }}
                    >
                      {human.available ? "Available" : "Unavailable"}
                    </div>
                  </div>

                  {human.bio && (
                    <p
                      style={{
                        fontSize: "0.9rem",
                        color: "var(--muted)",
                        marginBottom: "12px",
                        display: "-webkit-box",
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                        lineHeight: 1.5,
                      }}
                    >
                      {human.bio}
                    </p>
                  )}

                  {skills.length > 0 && (
                    <div style={{ marginBottom: "12px" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {skills.slice(0, 5).map((skill: string, idx: number) => (
                          <span
                            key={idx}
                            style={{
                              fontSize: "0.75rem",
                              padding: "4px 8px",
                              background: "rgba(255, 255, 255, 0.08)",
                              borderRadius: "6px",
                              color: "var(--ink)",
                            }}
                          >
                            {skill}
                          </span>
                        ))}
                        {skills.length > 5 && (
                          <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                            +{skills.length - 5} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "12px",
                      fontSize: "0.85rem",
                      color: "var(--muted)",
                      marginBottom: "12px",
                    }}
                  >
                    {location && <span>📍 {location}</span>}
                    {human.rate_per_hour && <span>💰 ${human.rate_per_hour}/hr</span>}
                    {human.timezone && <span>🕐 {human.timezone}</span>}
                  </div>

                  {human.show_email && human.email && (
                    <div
                      style={{
                        fontSize: "0.85rem",
                        color: "var(--accent-green)",
                        marginTop: "12px",
                        paddingTop: "12px",
                        borderTop: "1px solid var(--card-border)",
                      }}
                    >
                      📧 {human.email}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
