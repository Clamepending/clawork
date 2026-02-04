import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export async function GET() {
  const hasGoogleId = !!process.env.GOOGLE_CLIENT_ID;
  const hasGoogleSecret = !!process.env.GOOGLE_CLIENT_SECRET;
  const hasSecret = !!process.env.NEXTAUTH_SECRET;
  const hasUrl = !!process.env.NEXTAUTH_URL;

  const session = await getSession();

  return NextResponse.json({
    configured: {
      google_client_id: hasGoogleId,
      google_client_secret: hasGoogleSecret,
      nextauth_secret: hasSecret,
      nextauth_url: hasUrl,
    },
    session: session ? { email: session.user?.email, name: session.user?.name } : null,
    message: !hasGoogleId || !hasGoogleSecret
      ? "⚠️ Google OAuth not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env"
      : !hasSecret
      ? "⚠️ NEXTAUTH_SECRET not set. Add it to .env (use: openssl rand -base64 32)"
      : !hasUrl
      ? "⚠️ NEXTAUTH_URL not set. Add it to .env (e.g., http://localhost:3000)"
      : "✅ NextAuth is configured correctly",
  });
}
