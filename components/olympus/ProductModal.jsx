'use client';

// Product detail modal: big image, description, size picker, add-to-cart.
// Rendered as plain text throughout (no innerHTML) — product data is safe.

import { useState } from 'react';
import { formatPrice, PRICE_CENTS, SIZES } from '@/lib/olympus/products';

export default function ProductModal({ product, onClose, onAdd }) {
  const [size, setSize] = useState(null);
  const [error, setError] = useState('');

  if (!product) return null;

  const handleAdd = () => {
    if (!size) {
      setError('Please pick a size first.');
      return;
    }
    onAdd(product.id, size);
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={product.name}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-cyan-300/40 bg-[#05070f] p-5 max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-cyan-300/70">{product.tag}</div>
            <h2 className="mt-1 text-xl font-bold text-white">{product.name}</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-cyan-300/40 text-2xl text-cyan-200"
          >
            ×
          </button>
        </div>

        <div className="mt-4 flex justify-center rounded-xl bg-black/60 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={product.image}
            alt={product.name}
            className="max-h-64 object-contain mix-blend-screen"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        </div>

        <p className="mt-4 text-sm leading-relaxed text-slate-300">{product.blurb}</p>
        <p className="mt-2 text-lg font-semibold text-cyan-200">{formatPrice(PRICE_CENTS)}</p>

        <div className="mt-4">
          <div className="text-xs uppercase tracking-widest text-slate-400">Size</div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {SIZES.map((s) => (
              <button
                key={s}
                onClick={() => { setSize(s); setError(''); }}
                aria-pressed={size === s}
                className={`min-h-[44px] rounded-lg border text-sm font-semibold transition ${
                  size === s
                    ? 'border-cyan-300 bg-cyan-300 text-black'
                    : 'border-cyan-300/40 bg-transparent text-white hover:border-cyan-300'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

        <button
          onClick={handleAdd}
          className="mt-5 min-h-[48px] w-full rounded-xl bg-cyan-300 text-base font-bold text-black transition hover:bg-white"
        >
          Add to cart
        </button>
      </div>
    </div>
  );
}
