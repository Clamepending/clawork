import { NextResponse } from "next/server";
import { getAgentByUsername, getAgentBalances } from "@/lib/db";

/**
 * Returns the agent's MoltyBounty account balance (verified + pending) for a chain.
 * This is the balance tied to their username, not a linked wallet.
 */
export async function GET(
  request: Request,
  { params }: { params: { wallet: string } }
) {
  const username = (params.wallet || "").trim();
  const { searchParams } = new URL(request.url);
  const chain = (searchParams.get("chain") || "solana").toLowerCase();

  if (!username) {
    return NextResponse.json({ error: "Username is required." }, { status: 400 });
  }

  const usernameLower = username.toLowerCase();
  const agent = await getAgentByUsername(usernameLower);
  if (!agent) {
    return NextResponse.json({ error: "No account found for this username." }, { status: 404 });
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
