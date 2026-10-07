// components/auction/CardBidForm.jsx — Stripe Elements card form for auction bids.
// Flow: bid-intent API → confirmCardPayment → bid API with payment_intent_id.
// The card is AUTHORIZED (held), not charged — captured only if the bid wins.

'use client';

import { useState } from 'react';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { getStripe } from '@/lib/world-engine/stripe';

const stripePromise = getStripe();

const CARD_STYLE = {
  style: {
    base: {
      color: '#fff',
      fontSize: '16px',
      fontFamily: 'ui-monospace, monospace',
      '::placeholder': { color: '#71717a' },
    },
    invalid: { color: '#fca5a5' },
  },
};

function InnerForm({ listingId, amountCents, onDone, onCancel }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setMsg(null);
    if (!stripe || !elements) {
      setMsg({ kind: 'error', text: 'Card entry is still loading — one moment.' });
      return;
    }
    setBusy(true);
    try {
      // 1. Create the PaymentIntent (server validates bid + amount)
      const intentRes = await fetch('/api/auction/bid-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id: listingId, amount_cents: amountCents }),
      });
      const intentData = await intentRes.json().catch(() => ({}));
      if (!intentRes.ok || !intentData.ok) {
        setMsg({ kind: 'error', text: intentData.error || 'Could not start the card payment.' });
        return;
      }
      // 2. Confirm with the card
      const card = elements.getElement(CardElement);
      const { error: confirmErr, paymentIntent } = await stripe.confirmCardPayment(
        intentData.client_secret,
        { payment_method: { card } }
      );
      if (confirmErr) {
        setMsg({ kind: 'error', text: confirmErr.message || 'The card was declined.' });
        return;
      }
      if (!paymentIntent || paymentIntent.status !== 'requires_capture') {
        setMsg({ kind: 'error', text: 'The authorization did not complete. Try again.' });
        return;
      }
      // 3. Record the bid with the confirmed intent
      onDone(intentData.payment_intent_id);
    } catch {
      setMsg({ kind: 'error', text: 'Could not reach the auction house. Try again.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-3 rounded border border-amber-500/30 bg-black/40 p-4">
      <p className="text-xs uppercase tracking-widest text-zinc-400 mb-3">Card details</p>
      <div className="rounded border border-zinc-700 bg-black/60 px-3 py-3">
        <CardElement options={CARD_STYLE} />
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
        Your card is authorized (held), not charged. The hold is captured only if
        you win; released if you are outbid.
      </p>
      {msg && (
        <p className={`mt-2 text-sm ${msg.kind === 'ok' ? 'text-emerald-300' : 'text-red-300'}`}>
          {msg.text}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={busy || !stripe}
          className="flex-1 py-2.5 rounded bg-amber-500/25 border border-amber-400/60 text-amber-100 text-sm font-bold uppercase tracking-widest hover:bg-amber-500/40 disabled:opacity-50 transition-colors"
        >
          {busy ? 'Authorizing…' : 'Authorize & bid'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="px-4 py-2.5 rounded border border-zinc-700 text-zinc-400 text-sm font-bold uppercase tracking-widest hover:border-zinc-500 hover:text-zinc-200 transition-colors"
        >
          Back
        </button>
      </div>
    </form>
  );
}

export default function CardBidForm(props) {
  return (
    <Elements stripe={stripePromise}>
      <InnerForm {...props} />
    </Elements>
  );
}
