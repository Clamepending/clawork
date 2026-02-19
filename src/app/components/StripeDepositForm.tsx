"use client";

import { useState } from "react";
import { PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";

type Props = {
  amountUsd: number;
  onSuccess: () => void;
  onCancel: () => void;
};

export function StripeDepositForm({ amountUsd, onSuccess, onCancel }: Props) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setProcessing(true);
    setError(null);
    const returnUrl = typeof window !== "undefined" ? `${window.location.origin}/human?stripe=success` : "";
    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: returnUrl,
      },
    });
    setProcessing(false);
    if (confirmError) {
      setError(confirmError.message || "Payment failed");
      return;
    }
    onSuccess();
  }

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement
        options={{
          layout: "tabs",
          paymentMethodOrder: ["card", "google_pay", "apple_pay"],
        }}
      />
      {error && (
        <div style={{ color: "var(--error)", fontSize: "0.85rem", marginTop: "8px" }}>
          {error}
        </div>
      )}
      <div style={{ display: "flex", gap: "12px", marginTop: "16px" }}>
        <button
          type="button"
          onClick={onCancel}
          className="button"
          style={{ background: "transparent", border: "1px solid var(--card-border)" }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!stripe || !elements || processing}
          className="button"
          style={{ flex: 1, opacity: !stripe || processing ? 0.6 : 1 }}
        >
          {processing ? "Processing…" : `Pay $${amountUsd.toFixed(2)}`}
        </button>
      </div>
    </form>
  );
}
