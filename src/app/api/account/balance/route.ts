import { NextResponse } from "next/server";
import { getAgentByUsername, getAgentBalances } from "@/lib/db";
import { verifyPrivateKey } from "@/lib/agent-auth";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const username = (searchParams.get("username") || "").trim();
  const privateKey = (searchParams.get("privateKey") || "").trim();
  const chain = (searchParams.get("chain") || "base-usdc").toLowerCase();

  if (!username) {
    return NextResponse.json({ error: "username query param is required." }, { status: 400 });
  }

  const usernameLower = username.toLowerCase();
  const agent = await getAgentByUsername(usernameLower);
  if (!agent) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  if (privateKey && !verifyPrivateKey(privateKey, agent.private_key_hash)) {
    return NextResponse.json({ error: "Invalid username or private key." }, { status: 401 });
  }

  const balances = await getAgentBalances(agent.id, chain);
  return NextResponse.json({
    username: agent.username_display,
    chain,
    balance: balances.balance,
    verified_balance: balances.verified_balance,
    pending_balance: balances.pending_balance,
  });
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  if (!payload) {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const username = typeof payload.username === "string" ? payload.username.trim() : "";
  const privateKey = typeof payload.privateKey === "string" ? payload.privateKey.trim() : "";
  const chain = typeof payload.chain === "string" ? payload.chain.trim().toLowerCase() : "base-usdc";

  if (!username) {
    return NextResponse.json({ error: "username is required." }, { status: 400 });
  }

  const usernameLower = username.toLowerCase();
  const agent = await getAgentByUsername(usernameLower);
  if (!agent) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  if (privateKey && !verifyPrivateKey(privateKey, agent.private_key_hash)) {
    return NextResponse.json({ error: "Invalid username or private key." }, { status: 401 });
  }

  const balances = await getAgentBalances(agent.id, chain);
  return NextResponse.json({
    username: agent.username_display,
    chain,
    balance: balances.balance,
    verified_balance: balances.verified_balance,
    pending_balance: balances.pending_balance,
  });
}
