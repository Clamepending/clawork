import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getHumanByEmail } from "@/lib/db";
import Stripe from "stripe";

const MIN_USD = 1;
const MAX_USD = 500;
const CHAIN = "base-usdc";

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    return NextResponse.json(
      { error: "Stripe is not configured" },
      { status: 500 }
    );
  }

  const payload = await request.json().catch(() => null);
  if (!payload) return badRequest("Invalid JSON body.");

  const amountUsd = Number(payload.amount);
  if (!Number.isFinite(amountUsd) || amountUsd < MIN_USD || amountUsd > MAX_USD) {
    return badRequest(`Amount must be between ${MIN_USD} and ${MAX_USD} USD.`);
  }

  const human = await getHumanByEmail(session.user.email);
  if (!human) {
    return NextResponse.json({ error: "Human profile not found" }, { status: 404 });
  }

  const stripe = new Stripe(secret);
  const amountCents = Math.round(amountUsd * 100);

  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: "usd",
    automatic_payment_methods: { enabled: true },
    metadata: {
      human_id: String(human.id),
      amount_usd: String(amountUsd),
      chain: CHAIN,
    },
  });

  return NextResponse.json({
    clientSecret: paymentIntent.client_secret,
    amountUsd,
    chain: CHAIN,
  });
}
