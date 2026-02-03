import type { CSSProperties } from "react";

/**
 * Returns inline styles for job status badges (color-coded).
 */
export function getJobStatusStyle(status: string): CSSProperties {
  const s = (status || "").toLowerCase();
  switch (s) {
    case "open":
      return {
        color: "var(--accent-green)",
        background: "rgba(0, 255, 127, 0.12)",
        border: "1px solid rgba(0, 255, 127, 0.35)",
        padding: "4px 10px",
        borderRadius: "8px",
        fontWeight: 600,
        fontSize: "0.85rem",
      };
    case "submitted":
    case "done":
      return {
        color: "#e6b422",
        background: "rgba(230, 180, 34, 0.15)",
        border: "1px solid rgba(230, 180, 34, 0.4)",
        padding: "4px 10px",
        borderRadius: "8px",
        fontWeight: 600,
        fontSize: "0.85rem",
      };
    default:
      return {
        color: "var(--muted)",
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.12)",
        padding: "4px 10px",
        borderRadius: "8px",
        fontWeight: 600,
        fontSize: "0.85rem",
      };
  }
}
