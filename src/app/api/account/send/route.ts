import { NextResponse } from "next/server";
import {
  getAgentByUsername,
  debitAgentVerified,
  creditAgentVerified,
  getAgentBalances,
} from "@/lib/db";
import { verifyPrivateKey } from "@/lib/agent-auth";

/**
 * Agent-to-agent send: transfer verified balance from one agent to another.
 * Database-only (no on-chain). Requires sender username + private key.
 */
export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  if (!payload) {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const fromUsername =
    typeof payload.fromUsername === "string" ? payload.fromUsername.trim() : "";
  const fromPrivateKey =
    typeof payload.fromPrivateKey === "string" ? payload.fromPrivateKey.trim() : "";
  const toUsername =
    typeof payload.toUsername === "string" ? payload.toUsername.trim() : "";
  const amount = Number(payload.amount);
  const chain =
    typeof payload.chain === "string"
      ? payload.chain.trim().toLowerCase()
      : "base-usdc";

  if (!fromUsername || !fromPrivateKey) {
    return NextResponse.json(
      { error: "fromUsername and fromPrivateKey are required." },
      { status: 400 }
    );
  }
  if (!toUsername) {
    return NextResponse.json(
      { error: "toUsername is required." },
      { status: 400 }
    );
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { error: "amount must be a positive number." },
      { status: 400 }
    );
  }

  const fromLower = fromUsername.toLowerCase();
  const toLower = toUsername.toLowerCase();
  if (fromLower === toLower) {
    return NextResponse.json(
      { error: "Sender and recipient must be different." },
      { status: 400 }
    );
  }

  const fromAgent = await getAgentByUsername(fromLower);
  if (!fromAgent) {
    return NextResponse.json({ error: "Sender account not found." }, { status: 404 });
  }
  if (!verifyPrivateKey(fromPrivateKey, fromAgent.private_key_hash)) {
    return NextResponse.json(
      { error: "Invalid sender username or private key." },
      { status: 401 }
    );
  }

  const toAgent = await getAgentByUsername(toLower);
  if (!toAgent) {
    return NextResponse.json({ error: "Recipient account not found." }, { status: 404 });
  }

  const debitResult = await debitAgentVerified(fromAgent.id, chain, amount);
  if (!debitResult.success) {
    return NextResponse.json(
      { error: debitResult.error ?? "Debit failed." },
      { status: 400 }
    );
  }

  try {
    await creditAgentVerified(toAgent.id, chain, amount);
  } catch (e) {
    await creditAgentVerified(fromAgent.id, chain, amount);
    return NextResponse.json(
      { error: "Transfer failed; sender balance restored." },
      { status: 500 }
    );
  }

  const fromBalances = await getAgentBalances(fromAgent.id, chain);
  const toBalances = await getAgentBalances(toAgent.id, chain);

  return NextResponse.json({
    message: `Sent ${amount} USDC to @${toAgent.username_display}.`,
    amount,
    chain,
    from: {
      username: fromAgent.username_display,
      balance: fromBalances.balance,
      verified_balance: fromBalances.verified_balance,
    },
    to: {
      username: toAgent.username_display,
      balance: toBalances.balance,
      verified_balance: toBalances.verified_balance,
    },
  });
}
