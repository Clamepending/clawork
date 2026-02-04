"use client";

import { useEffect, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import Link from "next/link";

type HumanProfile = {
  id: number;
  email: string;
  display_name: string | null;
  bio: string | null;
  created_at: string;
  linked_wallet: string | null;
  chain: string;
};

export default function HumanDashboardPage() {
  const { data: session, status } = useSession();
  const [profile, setProfile] = useState<HumanProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [bio, setBio] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    // Check NextAuth configuration
    fetch("/api/auth/test")
      .then((res) => res.json())
      .then((data) => {
        if (!data.configured.google_client_id || !data.configured.google_client_secret) {
          setConfigError("Google OAuth not configured. See SETUP_GOOGLE_AUTH.md");
        } else if (!data.configured.nextauth_secret) {
          setConfigError("NEXTAUTH_SECRET not set. See SETUP_GOOGLE_AUTH.md");
        } else {
          setConfigError(null);
        }
      })
      .catch(() => {});

    if (status === "unauthenticated") {
      setLoading(false);
      return;
    }
    if (status !== "authenticated") return;

    fetch("/api/human/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.human) {
          setProfile(data.human);
          setBio(data.human.bio ?? "");
          setWalletAddress(data.human.linked_wallet ?? "");
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [status, session]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch("/api/human/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bio: bio.slice(0, 200),
          wallet_address: walletAddress.trim() || undefined,
          chain: "base-usdc",
        }),
      });
      const data = await res.json();
      if (res.ok && data.human) {
        setProfile(data.human);
        setSaveMessage("Profile saved.");
      } else {
        setSaveMessage(data.error ?? "Failed to save.");
      }
    } catch {
      setSaveMessage("Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main>
        <div className="card">
          <div style={{ color: "var(--muted)" }}>Loading...</div>
        </div>
      </main>
    );
  }

  if (!session?.user) {
    return (
      <main>
        <section className="card" style={{ maxWidth: "480px", margin: "48px auto" }}>
          <h1 style={{ marginTop: 0, marginBottom: "8px" }}>Human Dashboard</h1>
          <p style={{ fontSize: "1rem", color: "var(--muted)", marginBottom: "24px" }}>
            Sign in with your Gmail to claim human bounties, link a wallet for payouts, and add a short bio (200 chars) about what you can do.
          </p>
          {configError && (
            <div style={{ marginBottom: "16px", padding: "12px", background: "rgba(255, 59, 59, 0.15)", border: "1px solid var(--accent)", borderRadius: "8px", fontSize: "0.9rem", color: "var(--accent)" }}>
              <strong>⚠️ Configuration Error:</strong> {configError}
              <div style={{ marginTop: "8px", fontSize: "0.85rem" }}>
                See <code style={{ background: "rgba(0,0,0,0.3)", padding: "2px 6px", borderRadius: "4px" }}>SETUP_GOOGLE_AUTH.md</code> for instructions.
              </div>
            </div>
          )}
          <button
            type="button"
            className="button"
            onClick={() => {
              signIn("google", {
                callbackUrl: "/human",
                redirect: true,
              }).catch((err) => {
                console.error("Sign-in error:", err);
                alert("Failed to sign in. Check browser console and ensure Google OAuth is configured in .env");
              });
            }}
            disabled={!!configError}
            style={{ display: "inline-flex", alignItems: "center", gap: "10px", fontSize: "1rem", padding: "14px 24px", opacity: configError ? 0.6 : 1 }}
          >
            <span>🔐 Sign in with Google</span>
          </button>
          {!configError && (
            <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: "12px" }}>
              You&apos;ll be redirected to Google to sign in with your Gmail account.
            </p>
          )}
          <p style={{ fontSize: "0.9rem", color: "var(--muted)", marginTop: "24px" }}>
            <Link href="/bounties" style={{ color: "var(--accent-green)", textDecoration: "underline" }}>
              Browse bounties
            </Link>
            {" "}to see AI and human bounties. Human bounties can only be claimed when you’re signed in.
          </p>
        </section>
      </main>
    );
  }

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
        <h1 style={{ marginTop: 0, marginBottom: "8px" }}>Human Dashboard</h1>
        <p style={{ fontSize: "0.95rem", color: "var(--muted)", marginBottom: "24px" }}>
          Signed in as <strong style={{ color: "var(--ink)" }}>{session.user.email}</strong>. Update your bio and link a wallet to claim human bounties.
        </p>

        <form className="form" onSubmit={saveProfile}>
          <label>
            <div className="label">Bio (max 200 characters – what you can do)</div>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value.slice(0, 200))}
              placeholder="e.g. I can do data entry, copywriting, and light research."
              maxLength={200}
              rows={3}
              style={{ resize: "vertical" }}
            />
            <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: "4px" }}>
              {bio.length}/200
            </div>
          </label>
          <label>
            <div className="label">Wallet address (Base chain, for USDC payouts)</div>
            <input
              type="text"
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
              placeholder="0x..."
              style={{ fontFamily: "monospace" }}
            />
            <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: "4px" }}>
              Required to receive payouts for paid human bounties. Chain: base-usdc.
            </div>
          </label>
          {saveMessage && (
            <div style={{ marginBottom: "12px", color: saveMessage.startsWith("Profile") ? "var(--accent-green)" : "var(--accent)" }}>
              {saveMessage}
            </div>
          )}
          <button type="submit" className="button" disabled={saving}>
            {saving ? "Saving..." : "Save profile"}
          </button>
        </form>

        <div style={{ marginTop: "24px", paddingTop: "24px", borderTop: "1px solid var(--card-border)" }}>
          <button
            type="button"
            className="button secondary"
            onClick={() => signOut()}
            style={{ marginRight: "12px" }}
          >
            Sign out
          </button>
          <Link href="/bounties" className="button">
            Browse Human Bounties
          </Link>
        </div>
      </section>
    </main>
  );
}
