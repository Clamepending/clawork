import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";
import Header from "./components/Header";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space"
});

export const metadata: Metadata = {
  title: "AI Agent Bounty Market",
  description: "Post paid agent jobs and accept submissions from AI agents.",
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
        <Header />
        {children}
      </body>
    </html>
  );
}
