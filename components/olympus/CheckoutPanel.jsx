'use client';

// Checkout panel: collects name + email for an order request (the no-card
// path), or kicks off Stripe card checkout (the card path). All validation
// messages are plain English.

import { useState } from 'react';
import { formatPrice } from '@/lib/olympus/products';
import { validateOrderRequest } from '@/lib/olympus/orders';
import GoldCheckoutOption from '@/components/economy/GoldCheckoutOption';

export default function CheckoutPanel({ mode, totalCents, itemCount, busy, serverError, onSubmitRequest, onStartCard, onBack, goldChecked, onGoldToggle }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState([]);

  const submitRequest = () => {
    const check = validateOrderRequest({ name, email, notes }, new Array(itemCount).fill(1));
    if (!check.ok) {
      setErrors(check.errors);
      return;
    }
    setErrors([]);
    onSubmitRequest(check.customer);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 p-4" role="dialog" aria-modal="true" aria-label="Checkout">
      <div className="w-full max-w-md rounded-2xl border border-cyan-300/40 bg-[#05070f] p-5 max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">
            {mode === 'card' ? 'Pay by card' : 'Order request'}
          </h2>
          <button
            onClick={onBack}
            aria-label="Back to cart"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-cyan-300/40 text-2xl text-cyan-200"
          >
            ×
          </button>
        </div>

        <p className="mt-2 text-sm text-slate-300">
          {itemCount} item{itemCount === 1 ? '' : 's'} · Total {formatPrice(totalCents)}
        </p>

        {mode === 'card' ? (
          <div className="mt-4">
            <p className="text-sm leading-relaxed text-slate-300">
              You will be taken to a secure payment page to complete your purchase.
              Your cart is re-checked on our server before anything is charged.
            </p>
            <div className="mt-4">
              <GoldCheckoutOption
                totalCents={totalCents}
                checked={goldChecked}
                onToggle={onGoldToggle}
                style={{ borderColor: 'rgba(103,232,249,0.35)' }}
              />
            </div>
            {serverError && <p className="mt-3 text-sm text-red-400">{serverError}</p>}
            <button
              onClick={onStartCard}
              disabled={busy}
              className="mt-5 min-h-[48px] w-full rounded-xl bg-cyan-300 text-base font-bold text-black transition hover:bg-white disabled:opacity-50"
            >
              {busy ? 'Starting secure checkout…' : 'Continue to secure payment'}
            </button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <p className="text-sm leading-relaxed text-slate-300">
              Send your order as a request — no payment now. We will email you to
              confirm details and arrange payment.
            </p>
            <label className="block">
              <span className="text-xs uppercase tracking-widest text-slate-400">Your name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Appleseed"
                autoComplete="name"
                className="mt-1 min-h-[48px] w-full rounded-xl border border-cyan-300/30 bg-black/50 px-4 text-base text-white placeholder:text-slate-600 focus:border-cyan-300 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-widest text-slate-400">Email</span>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@example.com"
                type="email"
                autoComplete="email"
                inputMode="email"
                className="mt-1 min-h-[48px] w-full rounded-xl border border-cyan-300/30 bg-black/50 px-4 text-base text-white placeholder:text-slate-600 focus:border-cyan-300 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-widest text-slate-400">Notes (optional)</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything we should know — gift wrap, delivery timing…"
                rows={3}
                className="mt-1 w-full rounded-xl border border-cyan-300/30 bg-black/50 px-4 py-3 text-base text-white placeholder:text-slate-600 focus:border-cyan-300 focus:outline-none"
              />
            </label>
            {errors.length > 0 && (
              <ul className="space-y-1">
                {errors.map((e) => (
                  <li key={e} className="text-sm text-red-400">{e}</li>
                ))}
              </ul>
            )}
            {serverError && <p className="text-sm text-red-400">{serverError}</p>}
            <button
              onClick={submitRequest}
              disabled={busy}
              className="min-h-[48px] w-full rounded-xl bg-cyan-300 text-base font-bold text-black transition hover:bg-white disabled:opacity-50"
            >
              {busy ? 'Sending…' : 'Send order request'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
