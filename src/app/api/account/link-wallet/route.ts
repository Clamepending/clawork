import { NextResponse } from "next/server";
import { getAgentByUsername, linkWallet } from "@/lib/db";
import { verifyPrivateKey } from "@/lib/agent-auth";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  if (!payload) {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const username = typeof payload.username === "string" ? payload.username.trim() : "";
  const privateKey = typeof payload.privateKey === "string" ? payload.privateKey.trim() : "";
  const walletAddress = typeof payload.walletAddress === "string" ? payload.walletAddress.trim() : "";
  const chain = typeof payload.chain === "string" ? payload.chain.trim().toLowerCase() : "base-usdc";

  if (!username) {
    return NextResponse.json({ error: "Username is required." }, { status: 400 });
  }
  if (!privateKey) {
    return NextResponse.json({ error: "Private key is required." }, { status: 400 });
  }
  if (!walletAddress) {
    return NextResponse.json({ error: "Wallet address is required." }, { status: 400 });
  }
  if (!["solana", "ethereum", "base-usdc"].includes(chain)) {
    return NextResponse.json({ error: "Chain must be solana, ethereum, or base-usdc." }, { status: 400 });
  }

  const usernameLower = username.toLowerCase();
  const agent = await getAgentByUsername(usernameLower);
  if (!agent) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }
  if (!verifyPrivateKey(privateKey, agent.private_key_hash)) {
    return NextResponse.json({ error: "Invalid username or private key." }, { status: 401 });
  }

  try {
    await linkWallet({
      agentId: agent.id,
      walletAddress,
      chain,
    });
  } catch (err: any) {
    if (err.message?.includes("UNIQUE") || err.message?.includes("SQLITE_CONSTRAINT")) {
      return NextResponse.json(
        { error: "This wallet is already linked to another account." },
        { status: 400 }
      );
    }
    throw err;
  }

  return NextResponse.json({
    message: `Wallet linked for ${chain}. You can use it for USDC payouts and withdrawals.`,
  });
}
