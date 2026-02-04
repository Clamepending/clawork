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
  const [withdrawSuccess, setWithdrawSuccess] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositing, setDepositing] = useState(false);
  const [depositMessage, setDepositMessage] = useState<string | null>(null);
  const [masterWallet, setMasterWallet] = useState<string | null>(null);

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
          // Pre-fill destination wallet with linked wallet
          setWithdrawDestination(data.human.linked_wallet || "");
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


  // Fetch master wallet
  useEffect(() => {
    if (!masterWallet) {
      fetch("/api/config")
        .then((res) => res.json())
        .then((data) => data.master_wallet && setMasterWallet(data.master_wallet))
        .catch(() => {});
    }
  }, [masterWallet]);

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
                  
                  {/* Deposit Form */}
                  {masterWallet && (
                    <div style={{ marginBottom: "16px", padding: "12px", background: "rgba(255,255,255,0.04)", borderRadius: "8px", border: "1px solid var(--card-border)" }}>
                      <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginBottom: "8px", fontWeight: 600 }}>Deposit</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginBottom: "8px" }}>
                        Send USDC to: <span style={{ fontFamily: "monospace" }}>{masterWallet.slice(0, 8)}...{masterWallet.slice(-6)}</span>
                      </div>
                      <input
                        type="number"
                        value={depositAmount}
                        onChange={(e) => setDepositAmount(e.target.value)}
                        placeholder="Amount (min 0.1 USDC)"
                        min="0.1"
                        step="0.0001"
                        style={{ 
                          fontFamily: "monospace",
                          borderRadius: "8px",
                          padding: "8px 12px",
                          width: "100%",
                          marginBottom: "8px",
                          fontSize: "0.85rem",
                          background: "rgba(0, 0, 0, 0.2)",
                          border: "1px solid var(--card-border)"
                        }}
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          const amount = parseFloat(depositAmount);
                          if (!amount || amount < 0.1) {
                            setDepositMessage("Minimum deposit is 0.1 USDC");
                            setTimeout(() => setDepositMessage(null), 3000);
                            return;
                          }
                          if (!masterWallet) {
                            setDepositMessage("Master wallet not configured");
                            setTimeout(() => setDepositMessage(null), 3000);
                            return;
                          }
                          setDepositing(true);
                          setDepositMessage(null);
                          let transactionHash: string | null = null;
                          
                          try {
                            const ethereum = (window as unknown as { ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
                            if (!ethereum) {
                              setDepositMessage("Wallet not available.");
                              setDepositing(false);
                              return;
                            }
                            
                            // First check if already connected
                            let accounts = (await ethereum.request({ method: "eth_accounts" })) as string[];
                            if (accounts.length === 0) {
                              // Not connected, request connection (this will trigger popup)
                              accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as string[];
                              if (!accounts || accounts.length === 0) {
                                setDepositMessage("No accounts returned. Please approve the connection in your wallet.");
                                setDepositing(false);
                                return;
                              }
                            }
                            
                            // Use the *currently selected* account (Phantom and others can switch accounts after connect)
                            const phantomSelected = (window as unknown as { phantom?: { ethereum?: { selectedAddress?: string } } }).phantom?.ethereum?.selectedAddress;
                            const currentPayer = (phantomSelected && accounts.includes(phantomSelected) ? phantomSelected : accounts[0]);
                            
                            if (!currentPayer) {
                              setDepositMessage("No wallet account. Reconnect your wallet.");
                              setDepositing(false);
                              return;
                            }
                            
                            if (currentPayer.toLowerCase() === masterWallet.toLowerCase()) {
                              setDepositMessage("The currently selected wallet is the treasury address. In Phantom, switch to the other account (the one with USDC) and try again.");
                              setDepositing(false);
                              return;
                            }
                            
                            // Ensure wallet is on Base so balance check and transfer use the right chain
                            try {
                              await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x2105" }] });
                            } catch {
                              // User may reject or Base not added; continue and let transfer fail with clear error if needed
                            }
                            
                            // Send USDC
                            const { createWalletClient, createPublicClient, custom, http } = await import("viem");
                            const { base } = await import("viem/chains");
                            const walletClient = createWalletClient({
                              chain: base,
                              transport: custom(ethereum as { request: (...args: unknown[]) => Promise<unknown> }),
                            });
                            const account = { address: currentPayer as `0x${string}`, type: "json-rpc" as const };
                            const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
                            const amountRaw = BigInt(Math.ceil(amount * 1e6));
                            
                            // Check native USDC balance on Base (app uses native USDC, not bridged USDbC)
                            const publicClient = createPublicClient({ chain: base, transport: http("https://mainnet.base.org") });
                            const balanceRaw = await publicClient.readContract({
                              address: USDC_BASE,
                              abi: [{ name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] }],
                              functionName: "balanceOf",
                              args: [currentPayer as `0x${string}`],
                            });
                            
                            if (balanceRaw < amountRaw) {
                              const balanceUsdc = Number(balanceRaw) / 1e6;
                              setDepositMessage(
                                `Insufficient native USDC on Base. Selected account has ${balanceUsdc.toFixed(2)} USDC. In Phantom, switch to the account that holds USDC, or get native USDC on Base (0x8335…).`
                              );
                              setDepositing(false);
                              return;
                            }
                            
                            // Send USDC transfer (this will trigger wallet popup for approval)
                            const hash = await walletClient.writeContract({
                              address: USDC_BASE,
                              abi: [{ name: "transfer", type: "function", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] }],
                              functionName: "transfer",
                              args: [masterWallet as `0x${string}`, amountRaw],
                              account,
                            });
                            
                            transactionHash = hash;
                            
                            // Record deposit with transaction hash
                            const res = await fetch("/api/human/deposit", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                walletAddress: currentPayer,
                                amount,
                                chain: "base-usdc",
                                transactionHash: hash,
                              }),
                            });
                            const data = await res.json();
                            if (res.ok) {
                              setDepositMessage(`Deposit successful! Transaction: ${hash.slice(0, 10)}...`);
                              setDepositAmount("");
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
                              setDepositMessage(data.error || "Deposit recording failed");
                            }
                          } catch (e: any) {
                            const err = e as { code?: number; message?: string; shortMessage?: string; walk?: (fn: (e: unknown) => boolean) => unknown };
                            let msg = err?.shortMessage ?? err?.message ?? "USDC transfer failed.";
                            
                            // Handle user rejection of connection
                            if (err?.code === 4001 || err?.code === -32603) {
                              msg = "Connection rejected. Please approve the connection in your wallet popup.";
                            } else if (msg.includes("Unexpected error") || msg.includes("reverted")) {
                              msg =
                                "USDC transfer reverted. This can happen if Circle has restricted your wallet or the recipient (compliance/blacklist). Try a different wallet, or check your USDC balance and that you're on Base.";
                            }
                            setDepositMessage(msg);
                          } finally {
                            setDepositing(false);
                          }
                        }}
                        disabled={depositing || !depositAmount || parseFloat(depositAmount) < 0.1}
                        className="button"
                        style={{ 
                          width: "100%",
                          opacity: depositing || !depositAmount || parseFloat(depositAmount) < 0.1 ? 0.6 : 1 
                        }}
                      >
                        {depositing ? "Confirm in wallet…" : masterWallet ? `Send USDC to: ${masterWallet.slice(0, 8)}…${masterWallet.slice(-6)}` : `Deposit ${depositAmount || "0"} USDC`}
                      </button>
                    </div>
                  )}

                  {/* Withdraw Form */}
                  {balances && balances.verified_balance > 0 && (
                    <div style={{ marginBottom: "16px", padding: "12px", background: "rgba(255,255,255,0.04)", borderRadius: "8px", border: "1px solid var(--card-border)" }}>
                      <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginBottom: "8px", fontWeight: 600 }}>Withdraw</div>
                      <input
                        type="number"
                        value={withdrawAmount}
                        onChange={(e) => setWithdrawAmount(e.target.value)}
                        placeholder={`Max: ${balances.verified_balance.toFixed(4)} USDC`}
                        min="0"
                        max={balances.verified_balance}
                        step="0.0001"
                        style={{ 
                          fontFamily: "monospace",
                          borderRadius: "8px",
                          padding: "8px 12px",
                          width: "100%",
                          marginBottom: "8px",
                          fontSize: "0.85rem",
                          background: "rgba(0, 0, 0, 0.2)",
                          border: "1px solid var(--card-border)"
                        }}
                      />
                      <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginBottom: "8px" }}>Destination Wallet</div>
                      <input
                        type="text"
                        value={withdrawDestination}
                        onChange={(e) => setWithdrawDestination(e.target.value)}
                        placeholder={walletAddress || "0x..."}
                        style={{ 
                          fontFamily: "monospace",
                          borderRadius: "8px",
                          padding: "8px 12px",
                          width: "100%",
                          marginBottom: "8px",
                          fontSize: "0.85rem",
                          background: "rgba(0, 0, 0, 0.2)",
                          border: "1px solid var(--card-border)"
                        }}
                      />
                      {walletAddress && withdrawDestination !== walletAddress && (
                        <button
                          type="button"
                          onClick={() => setWithdrawDestination(walletAddress)}
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--accent)",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            textDecoration: "underline",
                            padding: 0,
                            marginBottom: "8px",
                          }}
                        >
                          Use linked wallet
                        </button>
                      )}
                      <button
                        type="button"
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
                              setWithdrawDestination(walletAddress || "");
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
                        className="button"
                        style={{ 
                          width: "100%",
                          opacity: withdrawing || !withdrawAmount || !withdrawDestination ? 0.6 : 1,
                          background: withdrawSuccess ? "var(--accent-green)" : undefined,
                          borderColor: withdrawSuccess ? "var(--accent-green)" : undefined,
                          color: withdrawSuccess ? "var(--bg)" : undefined
                        }}
                      >
                        {withdrawing ? "Processing..." : withdrawSuccess ? "Success!" : "Withdraw"}
                      </button>
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

      {/* Messages */}
      {(withdrawMessage || depositMessage) && (
        <div
          className="card"
          style={{
            marginBottom: "16px",
            padding: "16px",
            background: (withdrawMessage?.includes("success") || depositMessage?.includes("success") || withdrawMessage?.includes("recorded") || depositMessage?.includes("recorded") || depositMessage?.includes("Transaction:"))
              ? "rgba(255, 59, 59, 0.15)"
              : "rgba(255, 59, 59, 0.15)",
            border: `2px solid var(--accent)`,
            color: "var(--accent)",
            fontSize: "0.95rem",
            fontWeight: 600,
            position: "sticky",
            top: "20px",
            zIndex: 100,
            maxWidth: "100%",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>{withdrawMessage || depositMessage}</span>
            <button
              onClick={() => {
                setWithdrawMessage(null);
                setDepositMessage(null);
              }}
              style={{
                background: "none",
                border: "none",
                color: "var(--accent)",
                fontSize: "1.2rem",
                cursor: "pointer",
                padding: "0 8px",
                marginLeft: "12px",
              }}
            >
              ×
            </button>
          </div>
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
