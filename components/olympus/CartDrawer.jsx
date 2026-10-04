'use client';

// Slide-in cart drawer: line items with quantity steppers, totals,
// and the two checkout paths (card via Stripe when connected, order request).

import { formatPrice } from '@/lib/olympus/products';

export default function CartDrawer({ open, lines, totalCents, cardAvailable, onClose, onQty, onRemove, onCheckout }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Shopping cart">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <aside className="absolute right-0 top-0 flex h-full w-[88%] max-w-sm flex-col border-l border-cyan-300/40 bg-[#05070f]">
        <div className="flex items-center justify-between border-b border-cyan-300/20 p-4">
          <h2 className="text-lg font-bold text-white">Your cart</h2>
          <button
            onClick={onClose}
            aria-label="Close cart"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-cyan-300/40 text-2xl text-cyan-200"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {lines.length === 0 ? (
            <div className="mt-8 rounded-xl border border-dashed border-cyan-300/30 p-6 text-center">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="w-8 h-8 mx-auto text-cyan-300/40">
                <path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1 1 0 0 0 20 4H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z" />
              </svg>
              <p className="mt-2 text-sm text-slate-400">
                Your cart is empty. Tap any design to add it.
              </p>
            </div>
          ) : (
            <ul className="space-y-4">
              {lines.map((l) => (
                <li key={`${l.productId}__${l.size}`} className="flex gap-3 rounded-xl border border-cyan-300/15 bg-black/40 p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={l.image}
                    alt=""
                    aria-hidden="true"
                    className="h-16 w-16 shrink-0 rounded-lg bg-black object-contain mix-blend-screen"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-white">{l.name}</div>
                    <div className="mt-0.5 text-xs text-slate-400">Size {l.size} · {formatPrice(l.unitCents)} each</div>
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        onClick={() => onQty(l.productId, l.size, l.qty - 1)}
                        aria-label={`Decrease quantity of ${l.name}`}
                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-300/40 text-lg text-cyan-200"
                      >
                        −
                      </button>
                      <span className="w-8 text-center text-sm text-white" aria-live="polite">{l.qty}</span>
                      <button
                        onClick={() => onQty(l.productId, l.size, l.qty + 1)}
                        aria-label={`Increase quantity of ${l.name}`}
                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-300/40 text-lg text-cyan-200"
                      >
                        +
                      </button>
                      <button
                        onClick={() => onRemove(l.productId, l.size)}
                        className="ml-auto px-2 py-2 text-xs uppercase tracking-wider text-red-400"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {lines.length > 0 && (
          <div className="border-t border-cyan-300/20 p-4">
            <div className="flex items-center justify-between text-base">
              <span className="text-slate-300">Total</span>
              <span className="font-bold text-cyan-200">{formatPrice(totalCents)}</span>
            </div>
            <button
              onClick={() => onCheckout('card')}
              disabled={!cardAvailable}
              title={cardAvailable ? 'Pay by card' : 'Card payments are not connected yet'}
              className="mt-3 min-h-[48px] w-full rounded-xl bg-cyan-300 text-base font-bold text-black transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {cardAvailable ? 'Pay by card' : 'Card payments coming soon'}
            </button>
            <button
              onClick={() => onCheckout('request')}
              className="mt-2 min-h-[48px] w-full rounded-xl border border-cyan-300/60 text-base font-semibold text-cyan-200 transition hover:bg-cyan-300/10"
            >
              Send as order request
            </button>
            <p className="mt-2 text-center text-xs text-slate-500">
              No card needed for an order request — we confirm by email.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}
