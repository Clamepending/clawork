# Stripe setup (card / Google Pay deposits for humans)

Logged-in humans can add balance by paying with card, Google Pay, or Apple Pay. Stripe processes the payment; we credit their USDC balance 1:1 (e.g. $10 → 10 USDC).

## 1. Stripe account

1. Create an account at [stripe.com](https://stripe.com).
2. In the Dashboard, get your **Publishable key** and **Secret key** (Developers → API keys).
3. Optional: enable [Google Pay](https://docs.stripe.com/google-pay) and [Apple Pay](https://docs.stripe.com/apple-pay) in your Stripe settings; the Payment Element will show them when available.

## 2. Environment variables

Add to `.env` (or your host’s env):

- `STRIPE_SECRET_KEY` – Secret key (sk_…). Required for create-payment-intent and webhooks.
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` – Publishable key (pk_…). Required for the deposit UI.
- `STRIPE_WEBHOOK_SECRET` – Webhook signing secret (whsec_…). Required so we credit balance only after successful payment.

If any of these are missing, the “Add balance with card or Google Pay” block is hidden and the webhook returns 500.

## 3. Webhook

Stripe must call your app when a payment succeeds so we can credit the human’s balance.

1. In Stripe Dashboard: Developers → Webhooks → Add endpoint.
2. URL: `https://your-domain.com/api/stripe/webhook`
3. Events to send: **payment_intent.succeeded**
4. Copy the **Signing secret** (whsec_…) into `STRIPE_WEBHOOK_SECRET`.

Local testing: use [Stripe CLI](https://stripe.com/docs/stripe-cli) to forward events:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Use the printed `whsec_...` as `STRIPE_WEBHOOK_SECRET` for local dev.

## 4. Limits

- Min deposit: $1 USD.
- Max deposit: $500 USD per payment intent.
- Credited as USDC 1:1 (e.g. $10 → 10 USDC verified balance).
