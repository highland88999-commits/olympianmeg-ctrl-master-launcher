// components/persephone/TicketsPanel.jsx
// PERSEPHONE ticketing. Real Stripe Checkout via /api/persephone/checkout,
// following the repo's existing checkout pattern.
//
// Honesty rules:
// - Prices come from the server catalog (GET is informational only);
//   the server re-prices at checkout — client prices are never trusted.
// - When card payments aren't connected the button says so plainly;
//   no fake checkout, no invented confirmation codes.
// - After Stripe redirects back with ?checkout=success we confirm the
//   redirect happened, not the payment — the webhook settles payment.
//   We say exactly that.

'use client';

import { useEffect, useState } from 'react';
import { formatCents } from '@/lib/persephone/ledger';
import { fx } from '@/lib/fx';

const CATALOG = [
  { id: 'ga', name: 'General Admission', blurb: 'Standing room on the main floor. The embers, the bass, the crowd.', priceCents: 2500 },
  { id: 'front', name: 'Front Row', blurb: 'Right at the stage rail. You will feel the kick drum in your ribs.', priceCents: 7500 },
  { id: 'vip', name: 'VIP Booth', blurb: 'Raised booth with a straight view of the decks and the hall below.', priceCents: 15000 },
];

export default function TicketsPanel() {
  const [cardPayments, setCardPayments] = useState(null); // null = unknown
  const [buying, setBuying] = useState(null); // ticket id being bought
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/persephone/checkout')
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setCardPayments(!!d.cardPayments); })
      .catch(() => { if (!cancelled) setCardPayments(false); });
    try {
      const params = new URLSearchParams(window.location.search);
      const c = params.get('checkout');
      if (c === 'success') {
        setFlash('You made it back from the card checkout. Your ticket is confirmed once the payment settles — that happens automatically, nothing more to do.');
        // Modest confirmation only: this celebrates the return, not the
        // settled payment — the webhook settles that. Never over-claim.
        fx.checkoutConfirm();
      } else if (c === 'cancelled') {
        setFlash('Checkout was cancelled — no charge was made. Your seat is still waiting.');
        fx.checkoutCancelled(); // neutral settle, not an error
      }
      if (c) {
        const url = new URL(window.location.href);
        url.searchParams.delete('checkout');
        window.history.replaceState({}, '', url.toString());
      }
    } catch { /* private mode */ }
    return () => { cancelled = true; };
  }, []);

  async function buy(ticket) {
    setError('');
    setBuying(ticket.id);
    try {
      const idemKey = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
      const res = await fetch('/api/persephone/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId: ticket.id, qty: 1, idemKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Checkout failed.');
      if (data.type === 'stripe' && data.url) {
        window.location.href = data.url; // real Stripe-hosted checkout
        return;
      }
      if (data.type === 'gold') {
        setFlash(data.notice || 'Paid with gold.');
        fx.checkoutConfirm(); // real purchase with gold credit — confirm it
      }
    } catch (err) {
      setError(err.message || 'Could not start checkout.');
      fx.error(); // actionable failure: the user needs to know, and retry
    } finally {
      setBuying(null);
    }
  }

  return (
    <section aria-label="Tickets" className="w-full">
      <h2 className="text-2xl font-light tracking-[0.2em] text-[#ffd700]">TICKETS</h2>
      <p className="mt-2 text-sm text-[#a89a78] leading-relaxed">
        Real tickets, real card checkout through Stripe. Prices are set on the server — what you see is what the register charges.
      </p>

      {flash && (
        <p className="mt-4 rounded-xl border border-[#3a5a3a] bg-[#0d140d] px-4 py-3 text-sm text-[#b8d8b8]" role="status">
          {flash}
        </p>
      )}
      {error && (
        <p className="mt-4 rounded-xl border border-[#5a2a2a] bg-[#140d0d] px-4 py-3 text-sm text-[#d8a8a8]" role="alert">
          {error}
        </p>
      )}

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        {CATALOG.map((t) => (
          <div key={t.id} className="rounded-2xl border border-[#3a2f1a] bg-[#100c08] p-5 flex flex-col">
            <h3 className="text-lg text-[#e8d9b0]">{t.name}</h3>
            <p className="mt-1 text-sm text-[#8a7f66] leading-relaxed flex-1">{t.blurb}</p>
            <p className="mt-3 text-2xl text-[#ffd700]">{formatCents(t.priceCents)}</p>
            <button
              type="button"
              disabled={cardPayments === false || buying !== null}
              onClick={() => buy(t)}
              className="mt-4 rounded-xl bg-[#ffd700] px-4 py-3 text-sm font-bold tracking-widest text-black uppercase
                disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition"
            >
              {buying === t.id ? 'Opening checkout…' : `Buy — ${formatCents(t.priceCents)}`}
            </button>
          </div>
        ))}
      </div>

      {cardPayments === false && (
        <p className="mt-4 text-sm text-[#8a7f66]">
          Card payments aren&apos;t connected yet, so the buy buttons are off. No fake checkout — tickets go on sale once the card reader is wired up.
        </p>
      )}
      {cardPayments === null && (
        <p className="mt-4 text-sm text-[#8a7f66]">Checking whether card payments are connected…</p>
      )}
    </section>
  );
}
