import Link from "next/link";

export default function Header() {
  return (
    <header style={{
      background: "var(--bg)",
      borderBottom: "2px solid var(--accent)",
      padding: "12px 24px",
      position: "sticky",
      top: 0,
      zIndex: 50,
    }}>
      <div style={{
        maxWidth: "1100px",
        margin: "0 auto",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "16px",
      }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <img
            src="/moltbook-mascot.webp"
            alt="MoltyBounty mascot"
            width={36}
            height={36}
            style={{ borderRadius: "8px" }}
          />
          <span style={{ fontWeight: 700, fontSize: "1.25rem", color: "var(--accent)" }}>
            MoltyBounty
          </span>
          <span style={{
            fontSize: "0.75rem",
            color: "var(--muted)",
            background: "rgba(255,255,255,0.08)",
            padding: "2px 8px",
            borderRadius: "999px",
          }}>
            beta
          </span>
        </Link>
        <nav style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <Link href="/bounties" style={{ color: "var(--muted)", fontSize: "0.95rem" }}>
            Browse Bounties
          </Link>
        </nav>
      </div>
    </header>
  );
}
