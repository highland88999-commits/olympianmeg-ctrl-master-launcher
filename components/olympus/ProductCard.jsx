'use client';

// One product tile in the Olympus store grid. Plain <img> (remote CDN) with a
// local fallback if the image fails to load.

import { formatPrice, PRICE_CENTS } from '@/lib/olympus/products';

export default function ProductCard({ product, onOpen }) {
  return (
    <button
      onClick={() => onOpen(product)}
      className="group text-left rounded-xl border border-cyan-400/20 bg-cyan-400/5 overflow-hidden transition hover:border-cyan-300/60 hover:shadow-[0_0_18px_rgba(0,242,255,0.25)] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 min-h-[44px]"
      aria-label={`View ${product.name}`}
    >
      <div className="aspect-square bg-black/60 flex items-center justify-center overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={product.image}
          alt={product.name}
          loading="lazy"
          className="h-full w-full object-contain mix-blend-screen transition group-hover:scale-[1.03]"
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
      </div>
      <div className="p-3">
        <div className="text-[11px] uppercase tracking-widest text-cyan-300/70">{product.tag}</div>
        <div className="mt-1 text-sm font-semibold text-white leading-snug">{product.name}</div>
        <div className="mt-1 text-sm text-cyan-200">{formatPrice(PRICE_CENTS)}</div>
      </div>
    </button>
  );
}
