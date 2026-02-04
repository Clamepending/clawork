"use client";

import { useEffect, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import Link from "next/link";

type HumanProfile = {
  id: number;
  email: string;
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
  created_at: string;
  linked_wallet: string | null;
  chain: string;
};

type SocialLinks = {
  twitter?: string;
  github?: string;
  instagram?: string;
  linkedin?: string;
  website?: string;
  youtube?: string;
};

export default function HumanDashboardPage() {
  const { data: session, status } = useSession();
  const [profile, setProfile] = useState<HumanProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"profile" | "messages">("profile");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);

  // Form state
  const [displayName, setDisplayName] = useState("");
  const [headline, setHeadline] = useState("");
  const [bio, setBio] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [country, setCountry] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState("");
  const [socialLinks, setSocialLinks] = useState<SocialLinks>({});
  const [ratePerHour, setRatePerHour] = useState(50);
  const [timezone, setTimezone] = useState("UTC");
  const [available, setAvailable] = useState(true);
  const [showEmail, setShowEmail] = useState(false);
  const [walletAddress, setWalletAddress] = useState("");

  useEffect(() => {
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
          setDisplayName(data.human.display_name || "");
          setHeadline(data.human.headline || "");
          setBio(data.human.bio || "");
          setCity(data.human.city || "");
          setState(data.human.state || "");
          setCountry(data.human.country || "");
          setSkills(data.human.skills ? JSON.parse(data.human.skills) : []);
          setSocialLinks(data.human.social_links ? JSON.parse(data.human.social_links) : {});
          setRatePerHour(data.human.rate_per_hour ?? 50);
          setTimezone(data.human.timezone || "UTC");
          setAvailable(data.human.available ?? true);
          setShowEmail(data.human.show_email ?? false);
          setWalletAddress(data.human.linked_wallet || "");
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [status, session]);

  function addSkill() {
    const skill = skillInput.trim();
    if (skill && !skills.includes(skill)) {
      setSkills([...skills, skill]);
      setSkillInput("");
    }
  }

  function removeSkill(skill: string) {
    setSkills(skills.filter((s) => s !== skill));
  }

  function updateSocialLink(platform: keyof SocialLinks, value: string) {
    setSocialLinks({ ...socialLinks, [platform]: value.trim() || undefined });
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch("/api/human/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: displayName || null,
          headline: headline || null,
          bio: bio.slice(0, 200) || null,
          city: city || null,
          state: state || null,
          country: country || null,
          skills: JSON.stringify(skills),
          social_links: JSON.stringify(socialLinks),
          rate_per_hour: ratePerHour || null,
          timezone: timezone || null,
          available,
          show_email: showEmail,
          wallet_address: walletAddress.trim() || undefined,
          chain: "base-usdc",
        }),
      });
      const data = await res.json();
      if (res.ok && data.human) {
        setProfile(data.human);
        setSaveMessage("Profile saved successfully!");
        setTimeout(() => setSaveMessage(null), 3000);
      } else {
        const errorMsg = data.error || `Failed to save (${res.status})`;
        console.error("Save error:", errorMsg, data);
        setSaveMessage(errorMsg);
      }
    } catch (error: any) {
      console.error("Save error:", error);
      setSaveMessage(`Failed to save: ${error.message || "Network error"}`);
    } finally {
      setSaving(false);
    }
  }

  const hasName = !!displayName;
  const hasSkills = skills.length > 0;
  const hasWallet = !!walletAddress;
  const profileComplete = hasName && hasSkills && hasWallet;

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
            Sign in with your Gmail to claim human bounties, link a wallet for payouts, and add your profile.
          </p>
          {configError && (
            <div style={{ marginBottom: "16px", padding: "12px", background: "rgba(255, 59, 59, 0.15)", border: "1px solid var(--accent)", borderRadius: "8px", fontSize: "0.9rem", color: "var(--accent)" }}>
              <strong>⚠️ Configuration Error:</strong> {configError}
            </div>
          )}
          <button
            type="button"
            className="button"
            onClick={() => {
              signIn("google", { callbackUrl: "/human", redirect: true }).catch((err) => {
                console.error("Sign-in error:", err);
                alert("Failed to sign in. Check browser console.");
              });
            }}
            disabled={!!configError}
            style={{ opacity: configError ? 0.6 : 1 }}
          >
            Sign in with Google
          </button>
        </section>
      </main>
    );
  }

  return (
    <main style={{ paddingTop: "24px" }}>
      {/* Complete Profile Banner */}
      {!profileComplete && (
        <div className="card" style={{ background: "rgba(255, 59, 59, 0.15)", border: "2px solid var(--accent)", marginBottom: "32px" }}>
          <h2 style={{ fontSize: "1.4rem", color: "var(--accent)", marginBottom: "12px", fontWeight: "bold" }}>
            Complete your profile
          </h2>
          <p style={{ color: "var(--ink)", marginBottom: "16px", fontSize: "0.95rem" }}>
            Finish these steps to start receiving bookings:
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ color: hasName ? "var(--accent-green)" : "var(--ink)" }}>
              {hasName ? "✔" : "•"} Add your name
            </div>
            <div style={{ color: hasSkills ? "var(--accent-green)" : "var(--ink)" }}>
              {hasSkills ? "✔" : "•"} Add at least one skill
            </div>
            <div style={{ color: hasWallet ? "var(--accent-green)" : "var(--ink)" }}>
              {hasWallet ? "✔" : "•"} Add a payment wallet
            </div>
          </div>
        </div>
      )}

      {/* Dashboard Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <h1 style={{ fontSize: "2rem", fontWeight: "bold", marginBottom: "4px", marginTop: 0 }}>Dashboard</h1>
          <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>Manage your stuff</p>
        </div>
        <button
          onClick={saveProfile}
          disabled={saving}
          className="button"
          style={{ fontSize: "0.95rem", padding: "12px 24px" }}
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "24px", background: "var(--card)", padding: "4px", borderRadius: "12px", width: "fit-content", border: "1px solid var(--card-border)" }}>
        {(["profile", "messages"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              background: activeTab === tab ? "var(--accent)" : "transparent",
              color: activeTab === tab ? "#fff" : "var(--ink)",
              border: "none",
              padding: "10px 20px",
              fontSize: "0.9rem",
              borderRadius: "8px",
              cursor: "pointer",
              textTransform: "capitalize",
              fontWeight: activeTab === tab ? 600 : 400,
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {saveMessage && (
        <div
          className="card"
          style={{
            marginBottom: "16px",
            background: saveMessage.includes("success") ? "rgba(0, 255, 127, 0.15)" : "rgba(255, 59, 59, 0.15)",
            border: `1px solid ${saveMessage.includes("success") ? "var(--accent-green)" : "var(--accent)"}`,
            color: saveMessage.includes("success") ? "var(--accent-green)" : "var(--accent)",
            fontSize: "0.9rem",
          }}
        >
          {saveMessage}
        </div>
      )}

      {/* Profile Tab Content */}
      {activeTab === "profile" && (
        <div className="card">
          {/* Avatar and Basic Info */}
          <div style={{ display: "flex", gap: "20px", marginBottom: "32px", alignItems: "flex-start" }}>
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
                fontSize: "0.9rem",
                border: "2px solid var(--card-border)",
              }}
            >
              Add
            </div>
            <div>
              <div style={{ fontSize: "1.2rem", fontWeight: "bold", marginBottom: "4px" }}>
                {displayName || session.user.name || "M O"}
              </div>
              <div style={{ color: "var(--muted)", fontSize: "0.9rem", marginBottom: "8px" }}>
                {session.user.email}
              </div>
              <div style={{ color: available ? "var(--accent-green)" : "var(--muted)", fontSize: "0.85rem" }}>
                {available ? "Available" : "Unavailable"}
              </div>
            </div>
          </div>

          <form onSubmit={saveProfile} className="form" style={{ gap: "24px" }}>
            {/* Name */}
            <label>
              <div className="label">Name</div>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
              />
            </label>

            {/* Headline */}
            <label>
              <div className="label">Headline</div>
              <input
                type="text"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                placeholder="What you do"
              />
            </label>

            {/* Bio */}
            <label>
              <div className="label">Bio</div>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value.slice(0, 200))}
                placeholder="Tell us about yourself..."
                rows={4}
                maxLength={200}
              />
              <div style={{ color: "var(--muted)", fontSize: "0.8rem", marginTop: "4px" }}>{bio.length}/200</div>
            </label>

            {/* Location */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" }}>
              <label>
                <div className="label">City</div>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="City"
                />
              </label>
              <label>
                <div className="label">State</div>
                <input
                  type="text"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  placeholder="State"
                />
              </label>
              <label>
                <div className="label">Country</div>
                <input
                  type="text"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="Country"
                />
              </label>
            </div>

            {/* Toggles */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "24px" }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                  <div>
                    <div style={{ fontWeight: "bold", color: "var(--ink)", fontSize: "0.95rem" }}>Available</div>
                    <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>Accepting bookings?</div>
                  </div>
                  <label style={{ cursor: "pointer", margin: 0 }}>
                    <input
                      type="checkbox"
                      checked={available}
                      onChange={(e) => setAvailable(e.target.checked)}
                      style={{ width: "48px", height: "24px" }}
                    />
                  </label>
                </div>
              </div>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                  <div>
                    <div style={{ fontWeight: "bold", color: "var(--ink)", fontSize: "0.95rem" }}>Show Email</div>
                    <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>Display email on profile?</div>
                  </div>
                  <label style={{ cursor: "pointer", margin: 0 }}>
                    <input
                      type="checkbox"
                      checked={showEmail}
                      onChange={(e) => setShowEmail(e.target.checked)}
                      style={{ width: "48px", height: "24px" }}
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* Skills */}
            <div>
              <div className="label" style={{ marginBottom: "8px" }}>Skills</div>
              <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
                <input
                  type="text"
                  value={skillInput}
                  onChange={(e) => setSkillInput(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addSkill();
                    }
                  }}
                  placeholder="Type a skill and press enter"
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  onClick={addSkill}
                  className="button secondary"
                  style={{ whiteSpace: "nowrap" }}
                >
                  Add
                </button>
              </div>
              {skills.length === 0 ? (
                <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>No skills added yet</div>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {skills.map((skill) => (
                    <div
                      key={skill}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "6px 12px",
                        background: "rgba(255, 255, 255, 0.08)",
                        borderRadius: "6px",
                        fontSize: "0.85rem",
                      }}
                    >
                      <span>{skill}</span>
                      <button
                        type="button"
                        onClick={() => removeSkill(skill)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--muted)",
                          cursor: "pointer",
                          fontSize: "1.2rem",
                          lineHeight: 1,
                          padding: 0,
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Social Links */}
            <div>
              <div className="label" style={{ marginBottom: "12px" }}>Social Links</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                    <span>🐦</span>
                    <input
                      type="text"
                      value={socialLinks.twitter || ""}
                      onChange={(e) => updateSocialLink("twitter", e.target.value)}
                      placeholder="twitter.com/username"
                    />
                  </div>
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                    <span>🐙</span>
                    <input
                      type="text"
                      value={socialLinks.github || ""}
                      onChange={(e) => updateSocialLink("github", e.target.value)}
                      placeholder="github.com/username"
                    />
                  </div>
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                    <span>📷</span>
                    <input
                      type="text"
                      value={socialLinks.instagram || ""}
                      onChange={(e) => updateSocialLink("instagram", e.target.value)}
                      placeholder="instagram.com/username"
                    />
                  </div>
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                    <span>💼</span>
                    <input
                      type="text"
                      value={socialLinks.linkedin || ""}
                      onChange={(e) => updateSocialLink("linkedin", e.target.value)}
                      placeholder="linkedin.com/in/username"
                    />
                  </div>
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                    <span>🌐</span>
                    <input
                      type="text"
                      value={socialLinks.website || ""}
                      onChange={(e) => updateSocialLink("website", e.target.value)}
                      placeholder="yoursite.com"
                    />
                  </div>
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                    <span>📺</span>
                    <input
                      type="text"
                      value={socialLinks.youtube || ""}
                      onChange={(e) => updateSocialLink("youtube", e.target.value)}
                      placeholder="youtube.com/@channel"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Rate and Timezone */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px" }}>
              <label>
                <div className="label">Rate ($/hr)</div>
                <input
                  type="number"
                  value={ratePerHour}
                  onChange={(e) => setRatePerHour(Number(e.target.value))}
                  min="0"
                  step="1"
                />
              </label>
              <label>
                <div className="label">Timezone</div>
                <input
                  type="text"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  placeholder="UTC"
                />
              </label>
            </div>

            {/* Wallet Section */}
            <div style={{ marginTop: "8px", paddingTop: "24px", borderTop: "1px solid var(--card-border)" }}>
              <div className="label" style={{ marginBottom: "12px", fontSize: "1rem", fontWeight: 600 }}>Payment Wallet</div>
              <label>
                <div className="label" style={{ marginBottom: "8px" }}>Wallet Address (Base chain, for USDC payouts)</div>
                <input
                  type="text"
                  value={walletAddress}
                  onChange={(e) => setWalletAddress(e.target.value)}
                  placeholder="0x..."
                  style={{ fontFamily: "monospace" }}
                />
              </label>
            </div>
          </form>
        </div>
      )}

      {/* Messages Tab */}
      {activeTab === "messages" && (
        <div className="card" style={{ textAlign: "center", color: "var(--muted)", padding: "60px 20px" }}>
          <div style={{ fontSize: "0.9rem", marginBottom: "8px", color: "var(--ink)" }}>Messages</div>
          <div style={{ fontSize: "0.85rem", marginBottom: "40px", color: "var(--muted)" }}>AI agents contacting you</div>
          <div style={{ fontSize: "3rem", opacity: 0.3, marginBottom: "20px" }}>💬</div>
          <div style={{ fontSize: "0.9rem", marginBottom: "8px" }}>No messages yet</div>
          <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>AI agents will contact you here</div>
        </div>
      )}

      {/* Stats Footer */}
      <div
        className="card"
        style={{
          display: "flex",
          justifyContent: "center",
          gap: "40px",
          marginTop: "32px",
          padding: "20px",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "1.2rem", color: "var(--accent)", fontWeight: "bold" }}>0</div>
          <div style={{ fontSize: "0.9rem", color: "var(--ink)" }}>Gigs</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "1.2rem", color: "var(--accent)", fontWeight: "bold" }}>—</div>
          <div style={{ fontSize: "0.9rem", color: "var(--ink)" }}>Rating</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "1.2rem", color: "var(--accent-green)", fontWeight: "bold" }}>0</div>
          <div style={{ fontSize: "0.9rem", color: "var(--ink)" }}>Reviews</div>
        </div>
      </div>
    </main>
  );
}
