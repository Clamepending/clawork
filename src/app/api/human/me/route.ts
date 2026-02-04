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
      headline: human.headline,
      bio: human.bio,
      city: human.city,
      state: human.state,
      country: human.country,
      skills: human.skills,
      social_links: human.social_links,
      rate_per_hour: human.rate_per_hour,
      timezone: human.timezone,
      available: human.available,
      show_email: human.show_email,
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
  const headline =
    typeof payload.headline === "string" ? payload.headline.trim() || null : undefined;
  const bio =
    typeof payload.bio === "string"
      ? (payload.bio.length > 200 ? payload.bio.slice(0, 200) : payload.bio).trim() || null
      : undefined;
  const city = typeof payload.city === "string" ? payload.city.trim() || null : undefined;
  const state = typeof payload.state === "string" ? payload.state.trim() || null : undefined;
  const country = typeof payload.country === "string" ? payload.country.trim() || null : undefined;
  const skills = typeof payload.skills === "string" ? payload.skills : undefined;
  const socialLinks = typeof payload.social_links === "string" ? payload.social_links : undefined;
  const ratePerHour =
    typeof payload.rate_per_hour === "number" && payload.rate_per_hour >= 0
      ? payload.rate_per_hour
      : undefined;
  const timezone = typeof payload.timezone === "string" ? payload.timezone.trim() || null : undefined;
  const available = typeof payload.available === "boolean" ? payload.available : undefined;
  const showEmail = typeof payload.show_email === "boolean" ? payload.show_email : undefined;
  const walletAddress =
    typeof payload.wallet_address === "string" ? payload.wallet_address.trim() : undefined;
  const chain =
    typeof payload.chain === "string" ? payload.chain.trim().toLowerCase() : "base-usdc";

  try {
    await updateHuman({
      id: human.id,
      displayName,
      headline,
      bio,
      city,
      state,
      country,
      skills,
      socialLinks,
      ratePerHour,
      timezone,
      available,
      showEmail,
    });

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
            headline: updated.headline,
            bio: updated.bio,
            city: updated.city,
            state: updated.state,
            country: updated.country,
            skills: updated.skills,
            social_links: updated.social_links,
            rate_per_hour: updated.rate_per_hour,
            timezone: updated.timezone,
            available: updated.available,
            show_email: updated.show_email,
            created_at: updated.created_at,
            linked_wallet: wallet?.wallet_address ?? null,
            chain,
          }
        : null,
    });
  } catch (error: any) {
    console.error("Error updating human profile:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to update profile. Check server logs." },
      { status: 500 }
    );
  }
}
