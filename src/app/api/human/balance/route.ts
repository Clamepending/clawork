import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getHumanByEmail, getHumanBalances } from "@/lib/db";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const chain = searchParams.get("chain") || "base-usdc";

  const human = await getHumanByEmail(session.user.email);
  if (!human) {
    return NextResponse.json({ error: "Human profile not found" }, { status: 404 });
  }

  const balances = await getHumanBalances(human.id, chain);

  return NextResponse.json({
    balance: balances.balance,
    verified_balance: balances.verified_balance,
    pending_balance: balances.pending_balance,
    chain,
  });
}
