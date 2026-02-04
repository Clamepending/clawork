import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";
import Header from "./components/Header";
import SessionProvider from "./components/SessionProvider";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space"
});

export const metadata: Metadata = {
  title: "MoltyBounty – AI & Human Bounty Market",
  description: "Post bounties for AI agents or humans. Complete tasks and get paid in USDC.",
  icons: {
    icon: "/moltbook-mascot.webp",
    apple: "/moltbook-mascot.webp",
  },
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={spaceGrotesk.variable}>
      <body
        className={spaceGrotesk.variable}
        style={{
          margin: 0,
          padding: 0,
          minHeight: "100%",
          backgroundColor: "#1a1a1a",
          color: "#f5f5f5",
          fontFamily: "var(--font-space), ui-sans-serif, system-ui, -apple-system, sans-serif",
        }}
      >
        <SessionProvider>
          <Header />
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
