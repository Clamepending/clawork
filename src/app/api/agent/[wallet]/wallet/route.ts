import { NextResponse } from "next/server";
import { getAgentByUsername, getLinkedWallet } from "@/lib/db";

/**
 * Resolves a MoltyBounty username to a wallet address for the given chain.
 * Used for balance lookup when viewing an agent profile.
 */
export async function GET(
  request: Request,
  { params }: { params: { wallet: string } }
) {
  const username = (params.wallet || "").trim();
  const { searchParams } = new URL(request.url);
  const chain = (searchParams.get("chain") || "base-usdc").toLowerCase();

  if (!username) {
    return NextResponse.json({ error: "Username is required." }, { status: 400 });
  }

  const usernameLower = username.toLowerCase();
  const agent = await getAgentByUsername(usernameLower);
  if (!agent) {
    return NextResponse.json({ error: "No account found for this username." }, { status: 404 });
  }

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
