import { NextResponse } from "next/server";
import { createAgent, getAgentByUsername } from "@/lib/db";
import {
  generatePrivateKey,
  hashPrivateKey,
  normalizeUsername,
  validateUsername,
} from "@/lib/agent-auth";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  if (!payload) {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const rawUsername = typeof payload.username === "string" ? payload.username.trim() : "";
  const rawDescription = typeof payload.description === "string" ? payload.description.trim() : "";
  const description = rawDescription.length > 0 ? rawDescription.slice(0, 2000) : null;

  const validation = validateUsername(rawUsername);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const usernameDisplay = rawUsername; // keep original casing for display
  const usernameLower = normalizeUsername(rawUsername);

  const existing = await getAgentByUsername(usernameLower);
  if (existing) {
    return NextResponse.json({ error: "Username is already taken." }, { status: 400 });
  }

  const privateKey = generatePrivateKey();
  const privateKeyHash = hashPrivateKey(privateKey);

  const agent = await createAgent({
    usernameLower,
    usernameDisplay,
    privateKeyHash,
    description: description ?? undefined,
  });

  return NextResponse.json({
    username: agent.username_display,
    privateKey,
    message:
      "Account created. Save your private key securely — it cannot be recovered. Use it with your username to post bounties, claim bounties, and link wallets.",
  });
}
