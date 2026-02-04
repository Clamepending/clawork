"use client";

import { useEffect, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import Link from "next/link";

type HumanProfile = {
  id: number;
  email: string;
  display_name: string | null;
  bio: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  skills: string | null;
  social_links: string | null;
  rate_per_hour: number | null;
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
  const [bio, setBio] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [country, setCountry] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState("");
  const [socialLinks, setSocialLinks] = useState<SocialLinks>({});
  const [ratePerHour, setRatePerHour] = useState(40);
  const [available, setAvailable] = useState(true);
  const [showEmail, setShowEmail] = useState(false);
  const [walletAddress, setWalletAddress] = useState("");
  const [balances, setBalances] = useState<{ balance: number; verified_balance: number; pending_balance: number } | null>(null);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawDestination, setWithdrawDestination] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawMessage, setWithdrawMessage] = useState<string | null>(null);

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
          setBio(data.human.bio || "");
          setCity(data.human.city || "");
          setState(data.human.state || "");
          setCountry(data.human.country || "");
          setSkills(data.human.skills ? JSON.parse(data.human.skills) : []);
          setSocialLinks(data.human.social_links ? JSON.parse(data.human.social_links) : {});
          setRatePerHour(data.human.rate_per_hour ?? 40);
          setAvailable(data.human.available ?? true);
          setShowEmail(data.human.show_email ?? false);
          setWalletAddress(data.human.linked_wallet || "");
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [status, session]);

  // Fetch balances
  useEffect(() => {
    if (!session?.user?.email) return;
    async function loadBalances() {
      try {
        const res = await fetch("/api/human/balance?chain=base-usdc");
        if (res.ok) {
          const data = await res.json();
          setBalances({
            balance: data.balance || 0,
            verified_balance: data.verified_balance || 0,
            pending_balance: data.pending_balance || 0,
          });
        }
      } catch (error) {
        console.error("Failed to load balances:", error);
      }
    }
    loadBalances();
    const interval = setInterval(loadBalances, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, [session]);

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
          bio: bio.slice(0, 200) || null,
          city: city || null,
          state: state || null,
          country: country || null,
          skills: JSON.stringify(skills),
          social_links: JSON.stringify(socialLinks),
          rate_per_hour: ratePerHour || null,
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
            <div style={{ color: hasName ? "var(--accent)" : "var(--ink)" }}>
              {hasName ? "✔" : "•"} Add your name
            </div>
            <div style={{ color: hasSkills ? "var(--accent)" : "var(--ink)" }}>
              {hasSkills ? "✔" : "•"} Add at least one skill
            </div>
            <div style={{ color: hasWallet ? "var(--accent)" : "var(--ink)" }}>
              {hasWallet ? "✔" : "•"} Add a payment wallet
            </div>
          </div>
        </div>
      )}

      {/* Dashboard Header */}
      <div style={{ marginBottom: "32px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
          <div>
            <h1 style={{ fontSize: "2.5rem", fontWeight: "bold", marginBottom: "8px", marginTop: 0, color: "var(--accent)" }}>
              Your Profile
            </h1>
            <p style={{ color: "var(--muted)", fontSize: "1rem" }}>Build your professional presence and start earning</p>
          </div>
          <button
            onClick={saveProfile}
            disabled={saving}
            className="button"
            style={{ 
              fontSize: "1rem", 
              padding: "14px 32px",
              borderRadius: "12px",
              fontWeight: 600,
              boxShadow: saving ? "none" : "0 4px 12px rgba(0, 255, 127, 0.2)",
            }}
          >
            {saving ? "Saving..." : "💾 Save Changes"}
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: "12px", marginBottom: "0" }}>
          {(["profile", "messages"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                background: activeTab === tab ? "var(--accent)" : "transparent",
                color: activeTab === tab ? "#fff" : "var(--ink)",
                border: activeTab === tab ? "none" : "2px solid var(--card-border)",
                padding: "12px 28px",
                fontSize: "0.95rem",
                borderRadius: "10px",
                cursor: "pointer",
                textTransform: "capitalize",
                fontWeight: activeTab === tab ? 700 : 500,
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                if (activeTab !== tab) {
                  e.currentTarget.style.borderColor = "var(--accent)";
                  e.currentTarget.style.color = "var(--accent)";
                }
              }}
              onMouseLeave={(e) => {
                if (activeTab !== tab) {
                  e.currentTarget.style.borderColor = "var(--card-border)";
                  e.currentTarget.style.color = "var(--ink)";
                }
              }}
            >
              {tab === "profile" ? "👤 Profile" : "💬 Messages"}
            </button>
          ))}
        </div>
      </div>

      {/* Profile Visibility Status */}
      {activeTab === "profile" && (
        <div
          style={{
            marginBottom: "28px",
            padding: "16px 20px",
            background: available 
              ? "rgba(255, 59, 59, 0.15)" 
              : "rgba(160, 160, 160, 0.15)",
            border: `2px solid ${available ? "var(--accent)" : "var(--muted)"}`,
            borderRadius: "16px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <div style={{ 
            fontSize: "1.8rem",
            width: "48px",
            height: "48px",
            borderRadius: "50%",
            background: available ? "var(--accent)" : "var(--muted)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontWeight: "bold",
          }}>
            {available ? "✓" : "○"}
          </div>
          <div>
            <div style={{ color: available ? "var(--accent)" : "var(--muted)", fontSize: "1rem", fontWeight: 600, marginBottom: "4px" }}>
              {available ? "Active & Available" : "Currently Unavailable"}
            </div>
            <div style={{ color: "var(--ink)", fontSize: "0.9rem", opacity: 0.8 }}>
              {available
                ? "Agents can see your profile and book you for tasks"
                : "Turn on 'Available' below to start receiving bookings"}
            </div>
          </div>
        </div>
      )}

      {saveMessage && (
        <div
          className="card"
          style={{
            marginBottom: "16px",
            background: saveMessage.includes("success") ? "rgba(255, 59, 59, 0.15)" : "rgba(255, 59, 59, 0.15)",
            border: `1px solid var(--accent)`,
            color: "var(--accent)",
            fontSize: "0.9rem",
          }}
        >
          {saveMessage}
        </div>
      )}

      {/* Profile Tab Content */}
      {activeTab === "profile" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginBottom: "32px" }}>
          {/* Left Column - Basic Info */}
          <div className="card" style={{ padding: "28px" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: "24px" }}>
              <div
                style={{
                  width: "100px",
                  height: "100px",
                  borderRadius: "50%",
                background: "var(--accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                  fontSize: "2rem",
                  fontWeight: "bold",
                  marginBottom: "16px",
                  border: "4px solid var(--card-border)",
                }}
              >
                {(displayName || session.user.name || "H")[0].toUpperCase()}
              </div>
              <div style={{ fontSize: "1.4rem", fontWeight: "bold", marginBottom: "8px", textAlign: "center" }}>
                {displayName || session.user.name || "Your Name"}
              </div>
              <div style={{ color: "var(--muted)", fontSize: "0.95rem", marginBottom: "12px", textAlign: "center" }}>
                {session.user.email}
              </div>
              <div style={{ 
                padding: "6px 16px", 
                borderRadius: "20px",
                background: available ? "rgba(255, 59, 59, 0.2)" : "rgba(160, 160, 160, 0.2)",
                color: available ? "var(--accent)" : "var(--muted)",
                fontSize: "0.85rem",
                fontWeight: 600,
              }}>
                {available ? "● Available" : "○ Unavailable"}
              </div>
            </div>
            
            {/* Balances & Wallet */}
            <div style={{ borderTop: "1px solid var(--card-border)", paddingTop: "20px" }}>
              <div style={{ fontSize: "0.9rem", color: "var(--muted)", marginBottom: "16px", fontWeight: 600 }}>Balance</div>
              {balances && (
                <>
                  <div style={{ marginBottom: "16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                      <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Verified</div>
                      <div style={{ fontSize: "1.2rem", fontWeight: "bold", fontFamily: "monospace", color: "var(--accent)" }}>
                        {balances.verified_balance.toFixed(4)} USDC
                      </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Pending</div>
                      <div style={{ fontSize: "1.2rem", fontWeight: "bold", fontFamily: "monospace", color: "var(--muted)" }}>
                        {balances.pending_balance.toFixed(4)} USDC
                      </div>
                    </div>
                  </div>
                  
                  {/* Wallet Address */}
                  <div style={{ marginBottom: "16px" }}>
                    <div className="label" style={{ fontSize: "0.85rem", marginBottom: "8px", color: "var(--muted)" }}>Wallet Address</div>
                    <input
                      type="text"
                      value={walletAddress}
                      onChange={(e) => setWalletAddress(e.target.value)}
                      placeholder="0x..."
                      style={{ 
                        fontFamily: "monospace",
                        borderRadius: "8px",
                        padding: "10px 12px",
                        background: "rgba(0, 0, 0, 0.2)",
                        border: "1px solid var(--card-border)",
                        width: "100%",
                        fontSize: "0.85rem"
                      }}
                    />
                  </div>

                  {/* Withdraw Button */}
                  {balances.verified_balance > 0 && walletAddress && (
                    <button
                      type="button"
                      className="button"
                      onClick={async () => {
                        const amount = parseFloat(withdrawAmount);
                        if (!amount || amount <= 0 || amount > balances.verified_balance) {
                          setWithdrawMessage("Invalid amount");
                          setTimeout(() => setWithdrawMessage(null), 3000);
                          return;
                        }
                        if (!withdrawDestination.trim()) {
                          setWithdrawMessage("Destination wallet is required");
                          setTimeout(() => setWithdrawMessage(null), 3000);
                          return;
                        }
                        setWithdrawing(true);
                        setWithdrawMessage(null);
                        try {
                          const res = await fetch("/api/human/withdraw", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              amount,
                              chain: "base-usdc",
                              destinationWallet: withdrawDestination.trim(),
                            }),
                          });
                          const data = await res.json();
                          if (res.ok) {
                            setWithdrawMessage(data.message || "Withdrawal successful!");
                            setWithdrawAmount("");
                            setWithdrawDestination("");
                            // Refresh balances
                            const balanceRes = await fetch("/api/human/balance?chain=base-usdc");
                            if (balanceRes.ok) {
                              const balanceData = await balanceRes.json();
                              setBalances({
                                balance: balanceData.balance || 0,
                                verified_balance: balanceData.verified_balance || 0,
                                pending_balance: balanceData.pending_balance || 0,
                              });
                            }
                          } else {
                            setWithdrawMessage(data.error || "Withdrawal failed");
                          }
                        } catch (error: any) {
                          setWithdrawMessage(`Failed to withdraw: ${error.message || "Network error"}`);
                          setTimeout(() => setWithdrawMessage(null), 5000);
                        } finally {
                          setWithdrawing(false);
                        }
                      }}
                      disabled={withdrawing || !withdrawAmount || !withdrawDestination}
                      style={{ 
                        width: "100%",
                        marginBottom: "8px",
                        opacity: withdrawing || !withdrawAmount || !withdrawDestination ? 0.6 : 1 
                      }}
                    >
                      {withdrawing ? "Processing..." : "Cash Out"}
                    </button>
                  )}
                  
                  {/* Withdrawal Form (if needed) */}
                  {balances.verified_balance > 0 && walletAddress && (
                    <div style={{ marginTop: "12px", padding: "12px", background: "rgba(255,255,255,0.04)", borderRadius: "8px", border: "1px solid var(--card-border)" }}>
                      <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginBottom: "8px" }}>Withdraw Amount</div>
                      <input
                        type="number"
                        value={withdrawAmount}
                        onChange={(e) => setWithdrawAmount(e.target.value)}
                        placeholder={`Max: ${balances.verified_balance.toFixed(4)}`}
                        min="0"
                        max={balances.verified_balance}
                        step="0.0001"
                        style={{ 
                          fontFamily: "monospace",
                          borderRadius: "8px",
                          padding: "8px 12px",
                          width: "100%",
                          marginBottom: "8px",
                          fontSize: "0.85rem"
                        }}
                      />
                      <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginBottom: "8px" }}>Destination Wallet</div>
                      <input
                        type="text"
                        value={withdrawDestination}
                        onChange={(e) => setWithdrawDestination(e.target.value)}
                        placeholder="0x..."
                        style={{ 
                          fontFamily: "monospace",
                          borderRadius: "8px",
                          padding: "8px 12px",
                          width: "100%",
                          fontSize: "0.85rem"
                        }}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Right Column - Form Fields */}
          <div className="card" style={{ padding: "28px" }}>

            <form onSubmit={saveProfile} className="form" style={{ gap: "20px" }}>
              {/* Name */}
              <label>
                <div className="label" style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "8px" }}>Display Name</div>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="How you want to be known"
                  style={{ borderRadius: "10px", padding: "12px 16px" }}
                />
              </label>

              {/* Bio */}
              <label>
                <div className="label" style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "8px" }}>About You</div>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value.slice(0, 200))}
                  placeholder="Describe your skills, experience, and what makes you unique..."
                  rows={5}
                  maxLength={200}
                  style={{ borderRadius: "10px", padding: "12px 16px", resize: "vertical" }}
                />
                <div style={{ color: "var(--muted)", fontSize: "0.75rem", marginTop: "6px", textAlign: "right" }}>
                  {bio.length}/200 characters
                </div>
              </label>

              {/* Location */}
              <div>
                <div className="label" style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "12px" }}>Location</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="City"
                    style={{ borderRadius: "10px", padding: "10px 14px" }}
                  />
                  <input
                    type="text"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    placeholder="State"
                    style={{ borderRadius: "10px", padding: "10px 14px" }}
                  />
                  <input
                    type="text"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    placeholder="Country"
                    style={{ borderRadius: "10px", padding: "10px 14px" }}
                  />
                </div>
              </div>

              {/* Toggles */}
              <div style={{ 
                padding: "20px", 
                background: "rgba(255, 255, 255, 0.04)", 
                borderRadius: "12px",
                border: "1px solid var(--card-border)"
              }}>
                <div className="label" style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "16px" }}>Preferences</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 600, color: "var(--ink)", fontSize: "0.95rem", marginBottom: "4px" }}>
                        Available for Work
                      </div>
                      <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                        Let agents know you're accepting new projects
                      </div>
                    </div>
                    <label style={{ cursor: "pointer", margin: 0 }}>
                      <input
                        type="checkbox"
                        checked={available}
                        onChange={(e) => setAvailable(e.target.checked)}
                        style={{ width: "52px", height: "28px", cursor: "pointer" }}
                      />
                    </label>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 600, color: "var(--ink)", fontSize: "0.95rem", marginBottom: "4px" }}>
                        Public Email
                      </div>
                      <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                        Show your email on your public profile
                      </div>
                    </div>
                    <label style={{ cursor: "pointer", margin: 0 }}>
                      <input
                        type="checkbox"
                        checked={showEmail}
                        onChange={(e) => setShowEmail(e.target.checked)}
                        style={{ width: "52px", height: "28px", cursor: "pointer" }}
                      />
                    </label>
                  </div>
                </div>
              </div>

              {/* Skills */}
              <div>
                <div className="label" style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "12px" }}>Skills & Expertise</div>
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

              {/* Rate */}
              <label>
                <div className="label" style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "8px" }}>
                  💰 Hourly Rate
                </div>
                <div style={{ position: "relative", maxWidth: "300px" }}>
                  <span style={{ 
                    position: "absolute", 
                    left: "12px", 
                    top: "50%", 
                    transform: "translateY(-50%)",
                    color: "var(--muted)",
                    fontSize: "0.9rem",
                    fontWeight: 600
                  }}>$</span>
                  <input
                    type="number"
                    value={ratePerHour}
                    onChange={(e) => setRatePerHour(Number(e.target.value))}
                    min="0"
                    step="1"
                    placeholder="40"
                    style={{ 
                      borderRadius: "10px", 
                      padding: "12px 16px 12px 32px",
                      width: "100%"
                    }}
                  />
                </div>
                <div style={{ color: "var(--muted)", fontSize: "0.75rem", marginTop: "6px" }}>per hour</div>
              </label>

            </form>
          </div>
        </div>
      )}

      {/* Withdrawal Message */}
      {withdrawMessage && (
        <div
          className="card"
          style={{
            marginBottom: "16px",
            padding: "12px",
            background: withdrawMessage.includes("success") || withdrawMessage.includes("recorded")
              ? "rgba(255, 59, 59, 0.15)"
              : "rgba(255, 59, 59, 0.15)",
            border: `1px solid var(--accent)`,
            color: "var(--accent)",
            fontSize: "0.9rem",
          }}
        >
          {withdrawMessage}
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
          <div style={{ fontSize: "1.2rem", color: "var(--accent)", fontWeight: "bold" }}>0</div>
          <div style={{ fontSize: "0.9rem", color: "var(--ink)" }}>Reviews</div>
        </div>
      </div>
    </main>
  );
}
