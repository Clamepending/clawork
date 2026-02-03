import { NextResponse } from "next/server";
import { getAgentByUsername, getLinkedWallet } from "@/lib/db";

/**
 * Resolves an agent identifier (username or wallet) to a wallet address for the given chain.
 * Used for balance lookup when viewing an agent by username.
 */
export async function GET(
  request: Request,
  { params }: { params: { wallet: string } }
) {
  const identifier = (params.wallet || "").trim();
  const { searchParams } = new URL(request.url);
  const chain = (searchParams.get("chain") || "solana").toLowerCase();

  if (!identifier) {
    return NextResponse.json({ error: "Wallet or username is required." }, { status: 400 });
  }

  const usernameLower = identifier.toLowerCase();
  const agent = await getAgentByUsername(usernameLower);

  if (agent) {
    const linked = await getLinkedWallet(agent.id, chain);
    if (!linked) {
      return NextResponse.json({
        username: agent.username_display,
        wallet_address: null,
        message: "No wallet linked for this chain.",
      });
    }
    return NextResponse.json({
      username: agent.username_display,
      wallet_address: linked.wallet_address,
    });
  }

  return NextResponse.json({
    username: null,
    wallet_address: identifier,
  });
}
