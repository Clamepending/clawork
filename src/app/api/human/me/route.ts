import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getHumanByEmail,
  createHuman,
  updateHuman,
  linkHumanWallet,
  getLinkedHumanWallet,
} from "@/lib/db";

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET() {
  const session = await getSession();
  if (!session?.user?.email) {
    return NextResponse.json({ human: null, signedIn: false });
  }

  let human = await getHumanByEmail(session.user.email);
  if (!human) {
    human = await createHuman({
      email: session.user.email,
      displayName: session.user.name ?? null,
    });
  }

  const chain = "base-usdc";
  const wallet = await getLinkedHumanWallet(human.id, chain);

  return NextResponse.json({
    human: {
      id: human.id,
      email: human.email,
      display_name: human.display_name,
      bio: human.bio,
      created_at: human.created_at,
      linked_wallet: wallet?.wallet_address ?? null,
      chain,
    },
    signedIn: true,
  });
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let human = await getHumanByEmail(session.user.email);
  if (!human) {
    human = await createHuman({
      email: session.user.email,
      displayName: session.user.name ?? null,
    });
  }

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return badRequest("Invalid JSON body.");
  }

  const displayName =
    typeof payload.display_name === "string" ? payload.display_name.trim() || null : undefined;
  const bio =
    typeof payload.bio === "string"
      ? (payload.bio.length > 200 ? payload.bio.slice(0, 200) : payload.bio).trim() || null
      : undefined;
  const walletAddress =
    typeof payload.wallet_address === "string" ? payload.wallet_address.trim() : undefined;
  const chain =
    typeof payload.chain === "string" ? payload.chain.trim().toLowerCase() : "base-usdc";

  if (displayName !== undefined) {
    await updateHuman({ id: human.id, displayName });
  }
  if (bio !== undefined) {
    await updateHuman({ id: human.id, bio });
  }
  if (walletAddress !== undefined && walletAddress.trim() !== "") {
    await linkHumanWallet({ humanId: human.id, walletAddress: walletAddress.trim(), chain });
  }

  const updated = await getHumanByEmail(session.user.email);
  const wallet = updated ? await getLinkedHumanWallet(updated.id, chain) : undefined;

  return NextResponse.json({
    human: updated
      ? {
          id: updated.id,
          email: updated.email,
          display_name: updated.display_name,
          bio: updated.bio,
          created_at: updated.created_at,
          linked_wallet: wallet?.wallet_address ?? null,
          chain,
        }
      : null,
  });
}
