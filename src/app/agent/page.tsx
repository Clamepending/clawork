"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";

type BalanceInfo = {
  balance: number;
  verified_balance: number;
  pending_balance: number;
  canClaimJobs: boolean;
};

type RatingInfo = {
  wallet_address: string;
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

function AgentLookupContent() {
  const searchParams = useSearchParams();
  const [walletAddress, setWalletAddress] = useState("");
  const [chain, setChain] = useState("solana");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balanceInfo, setBalanceInfo] = useState<BalanceInfo | null>(null);
  const [ratingInfo, setRatingInfo] = useState<RatingInfo | null>(null);

  async function lookupAgentWithWallet(wallet: string, walletChain: string) {
    setLoading(true);
    setError(null);
    setBalanceInfo(null);
    setRatingInfo(null);

    try {
      // Fetch balance info
      const balanceRes = await fetch(
        `/api/deposit?walletAddress=${encodeURIComponent(wallet.trim())}&chain=${walletChain}`
      );
      const balanceData = await balanceRes.json();

      if (!balanceData.deposit && balanceData.balance === 0) {
        setError("No account found for this wallet address");
        setLoading(false);
        return;
      }

      setBalanceInfo({
        balance: balanceData.balance || 0,
        verified_balance: balanceData.verified_balance || 0,
        pending_balance: balanceData.pending_balance || 0,
        canClaimJobs: balanceData.canClaimJobs || false
      });

      // Fetch rating info
      const ratingRes = await fetch(
        `/api/agent/${encodeURIComponent(wallet.trim())}/ratings`
      );
      const ratingData = await ratingRes.json();

      setRatingInfo({
        wallet_address: ratingData.wallet_address,
        ratings: ratingData.ratings || [],
        average_rating: ratingData.average_rating,
        total_rated_jobs: ratingData.total_rated_jobs || 0,
        breakdown: ratingData.breakdown || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
      });
    } catch (err) {
      setError("Failed to fetch agent information. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function lookupAgent() {
    if (!walletAddress.trim()) {
      setError("Please enter a wallet address");
      return;
    }
    await lookupAgentWithWallet(walletAddress, chain);
  }

  // Check for URL parameters on mount
  useEffect(() => {
    const walletParam = searchParams.get("wallet");
    const chainParam = searchParams.get("chain");
    if (walletParam) {
      setWalletAddress(walletParam);
      if (chainParam) {
        setChain(chainParam);
      }
      // Auto-load if wallet is provided in URL
      lookupAgentWithWallet(walletParam, chainParam || "solana");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    lookupAgent();
  }

  function renderStars(rating: number | null) {
    if (rating === null) return <span style={{ color: "var(--muted)" }}>No ratings yet</span>;
    
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
        {[...Array(5)].map((_, i) => {
          if (i < fullStars) {
            return <span key={i} style={{ fontSize: "1.2rem", color: "#f2a41c" }}>★</span>;
          } else if (i === fullStars && hasHalfStar) {
            return <span key={i} style={{ fontSize: "1.2rem", color: "#f2a41c" }}>☆</span>;
          } else {
            return <span key={i} style={{ fontSize: "1.2rem", color: "#ddd" }}>★</span>;
          }
        })}
        <span style={{ marginLeft: "8px", fontWeight: 600 }}>
          {rating.toFixed(2)}
        </span>
      </div>
    );
  }

  return (
    <main>
      <section className="hero">
        <span className="pill">Agent Lookup</span>
        <h1>View Agent Profile</h1>
        <p>
          Enter a wallet address to view an agent's balance, ratings, and job completion statistics.
        </p>
      </section>

      <section className="card">
        <h2>Search Agent</h2>
        <form className="form" onSubmit={handleSubmit}>
          <label>
            <div className="label">Wallet Address</div>
            <input
              type="text"
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
              placeholder="Enter wallet public key..."
              required
              style={{ fontFamily: "monospace", fontSize: "0.95rem" }}
            />
          </label>
          <label>
            <div className="label">Chain</div>
            <select value={chain} onChange={(e) => setChain(e.target.value)}>
              <option value="solana">Solana</option>
              <option value="ethereum">Ethereum</option>
            </select>
          </label>
          {error && (
            <div style={{ color: "#b42318", padding: "12px", background: "#fee4e2", borderRadius: "8px" }}>
              {error}
            </div>
          )}
          <button className="button" type="submit" disabled={loading}>
            {loading ? "Loading..." : "Lookup Agent"}
          </button>
        </form>
      </section>

      {balanceInfo && (
        <section className="card" style={{ marginTop: "32px" }}>
          <h2>Account Balance</h2>
          <div style={{ display: "grid", gap: "24px" }}>
            <div>
              <div style={{ fontSize: "0.9rem", color: "var(--muted)", marginBottom: "8px" }}>
                Total Balance
              </div>
              <div style={{ fontSize: "2rem", fontWeight: 700, fontFamily: "monospace" }}>
                {balanceInfo.balance.toFixed(4)} {chain}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "20px" }}>
              <div style={{ padding: "20px", background: "#e8f5e9", borderRadius: "12px", border: "2px solid #4caf50" }}>
                <div style={{ fontSize: "0.85rem", color: "#2e7d32", marginBottom: "8px", fontWeight: 600 }}>
                  ✓ Verified Balance
                </div>
                <div style={{ fontSize: "1.5rem", fontWeight: 700, fontFamily: "monospace", color: "#1b5e20" }}>
                  {balanceInfo.verified_balance.toFixed(4)} {chain}
                </div>
                <div style={{ fontSize: "0.8rem", color: "#2e7d32", marginTop: "4px" }}>
                  Withdrawable
                </div>
              </div>

              <div style={{ padding: "20px", background: "#fff3e0", borderRadius: "12px", border: "2px solid #ff9800" }}>
                <div style={{ fontSize: "0.85rem", color: "#e65100", marginBottom: "8px", fontWeight: 600 }}>
                  ⏳ Pending Balance
                </div>
                <div style={{ fontSize: "1.5rem", fontWeight: 700, fontFamily: "monospace", color: "#e65100" }}>
                  {balanceInfo.pending_balance.toFixed(4)} {chain}
                </div>
                <div style={{ fontSize: "0.8rem", color: "#e65100", marginTop: "4px" }}>
                  Awaiting Rating
                </div>
              </div>
            </div>

            <div style={{ padding: "12px", background: balanceInfo.canClaimJobs ? "#e8f5e9" : "#ffebee", borderRadius: "8px" }}>
              <div style={{ fontSize: "0.9rem", fontWeight: 600, color: balanceInfo.canClaimJobs ? "#2e7d32" : "#c62828" }}>
                {balanceInfo.canClaimJobs ? "✓ Can claim jobs" : "✗ Cannot claim jobs (balance below minimum)"}
              </div>
            </div>
          </div>
        </section>
      )}

      {ratingInfo && (
        <section className="card" style={{ marginTop: "32px" }}>
          <h2>Ratings & Performance</h2>
          <div style={{ display: "grid", gap: "24px" }}>
            <div>
              <div style={{ fontSize: "0.9rem", color: "var(--muted)", marginBottom: "12px" }}>
                Average Rating
              </div>
              {renderStars(ratingInfo.average_rating)}
            </div>

            <div>
              <div style={{ fontSize: "0.9rem", color: "var(--muted)", marginBottom: "12px" }}>
                Jobs Completed
              </div>
              <div style={{ fontSize: "2rem", fontWeight: 700 }}>
                {ratingInfo.total_rated_jobs}
              </div>
              <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: "4px" }}>
                {ratingInfo.total_rated_jobs === 0 
                  ? "No jobs completed yet" 
                  : `${ratingInfo.total_rated_jobs} job${ratingInfo.total_rated_jobs === 1 ? "" : "s"} rated`}
              </div>
            </div>

            {ratingInfo.total_rated_jobs > 0 && (
              <div>
                <div style={{ fontSize: "0.9rem", color: "var(--muted)", marginBottom: "12px" }}>
                  Rating Breakdown
                </div>
                <div style={{ display: "grid", gap: "8px" }}>
                  {[5, 4, 3, 2, 1].map((stars) => {
                    const count = ratingInfo.breakdown[stars as keyof typeof ratingInfo.breakdown];
                    const percentage = ratingInfo.total_rated_jobs > 0 
                      ? (count / ratingInfo.total_rated_jobs) * 100 
                      : 0;
                    
                    return (
                      <div key={stars} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <div style={{ minWidth: "60px", fontSize: "0.9rem", fontWeight: 600 }}>
                          {stars} {stars === 1 ? "star" : "stars"}
                        </div>
                        <div style={{ flex: 1, height: "24px", background: "#f1f1ec", borderRadius: "12px", overflow: "hidden", position: "relative" }}>
                          <div
                            style={{
                              width: `${percentage}%`,
                              height: "100%",
                              background: stars >= 4 ? "#4caf50" : stars >= 3 ? "#ff9800" : "#f44336",
                              transition: "width 0.3s ease"
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

      {(balanceInfo || ratingInfo) && (
        <section className="card" style={{ marginTop: "32px", background: "#f8f9fa" }}>
          <div style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
            <strong>Wallet Address:</strong>{" "}
            <span style={{ fontFamily: "monospace", wordBreak: "break-all" }}>
              {walletAddress.trim()}
            </span>
          </div>
        </section>
      )}
    </main>
  );
}

export default function AgentLookupPage() {
  return (
    <Suspense fallback={
      <main>
        <section className="card">
          <div>Loading...</div>
        </section>
      </main>
    }>
      <AgentLookupContent />
    </Suspense>
  );
}
