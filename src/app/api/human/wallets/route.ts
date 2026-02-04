import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getHumanByEmail, listHumanSavedWallets, addHumanSavedWallet, deleteHumanSavedWallet } from "@/lib/db";

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const chain = searchParams.get("chain") || undefined;

  const human = await getHumanByEmail(session.user.email);
  if (!human) {
    return NextResponse.json({ error: "Human profile not found" }, { status: 404 });
  }

  const wallets = await listHumanSavedWallets(human.id, chain);

  return NextResponse.json({ wallets });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  if (!payload) {
    return badRequest("Invalid JSON body.");
  }

  const walletAddress = typeof payload.walletAddress === "string" ? payload.walletAddress.trim() : "";
  const chain = typeof payload.chain === "string" ? payload.chain.trim().toLowerCase() : "base-usdc";
  const label = typeof payload.label === "string" ? payload.label.trim() || null : null;

  if (!walletAddress) {
    return badRequest("Wallet address is required.");
  }

  const human = await getHumanByEmail(session.user.email);
  if (!human) {
    return NextResponse.json({ error: "Human profile not found" }, { status: 404 });
  }

  try {
    await addHumanSavedWallet({
      humanId: human.id,
      walletAddress,
      chain,
      label,
    });

    const wallets = await listHumanSavedWallets(human.id, chain);
    return NextResponse.json({ wallets, message: "Wallet saved successfully" });
  } catch (error: any) {
    console.error("Error saving wallet:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to save wallet" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const walletId = Number(searchParams.get("id"));

  if (!Number.isFinite(walletId) || walletId <= 0) {
    return badRequest("Valid wallet ID is required.");
  }

  const human = await getHumanByEmail(session.user.email);
  if (!human) {
    return NextResponse.json({ error: "Human profile not found" }, { status: 404 });
  }

  try {
    await deleteHumanSavedWallet(human.id, walletId);
    return NextResponse.json({ message: "Wallet deleted successfully" });
  } catch (error: any) {
    console.error("Error deleting wallet:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to delete wallet" },
      { status: 500 }
    );
  }
}
