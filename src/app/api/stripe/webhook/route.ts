import { NextResponse } from "next/server";
import Stripe from "stripe";
import { recordStripeHumanDepositIfNew, creditHumanVerified } from "@/lib/db";

const CHAIN = "base-usdc";

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("STRIPE_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const rawBody = await request.text();
  const sig = request.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Stripe webhook signature verification failed:", message);
    return NextResponse.json({ error: `Webhook signature verification failed: ${message}` }, { status: 400 });
  }

  if (event.type !== "payment_intent.succeeded") {
    return NextResponse.json({ received: true });
  }

  const pi = event.data.object as Stripe.PaymentIntent;
  const humanId = pi.metadata?.human_id ? parseInt(pi.metadata.human_id, 10) : null;
  const amountUsd = pi.metadata?.amount_usd ? parseFloat(pi.metadata.amount_usd) : null;
  const chain = (pi.metadata?.chain || CHAIN).trim().toLowerCase();

  if (humanId == null || !Number.isFinite(humanId) || amountUsd == null || !Number.isFinite(amountUsd) || amountUsd <= 0) {
    console.error("Invalid payment_intent metadata:", pi.metadata);
    return NextResponse.json({ received: true });
  }

  const isNew = await recordStripeHumanDepositIfNew(pi.id, humanId, amountUsd, chain);
  if (isNew) {
    await creditHumanVerified(humanId, chain, amountUsd);
  }

  return NextResponse.json({ received: true });
}
