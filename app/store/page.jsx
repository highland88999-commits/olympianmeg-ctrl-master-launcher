'use client';
// /store — the launcher merch store.
// Products come live from Stripe (GET /api/store/products); nothing is
// hardcoded. Apparel (hoodies etc.) is grouped first, everything else
// follows, unclassified items land under "More". Checkout goes through
// POST /api/store/checkout, which re-prices server-side and applies the
// gold Mint the same way the other launchers do.
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

const SIZES = ['S', 'M', 'L', 'XL', '2XL', '3XL'];

function ProductCard({ product, onBuy, buying, gold, setGold }) {
  const [size, setSize] = useState('L');
  const isApparel = product.kind === 'apparel';

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5">
      {product.image ? (
        <img
          src={product.image}
          alt={product.name}
          className="aspect-square w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex aspect-square w-full items-center justify-center bg-black/40 text-5xl">
          🧥
        </div>
      )}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <div className="font-semibold text-white">{product.name}</div>
          {product.description ? (
            <p className="mt-1 text-sm text-slate-400">{product.description}</p>
          ) : null}
        </div>
        <div className="text-lg font-bold text-amber-300">{product.priceLabel}</div>
        {isApparel && (
          <label className="text-sm text-slate-300">
            Size
            <select
              value={size}
              onChange={(e) => setSize(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-white/15 bg-black/50 px-3 py-2 text-white"
            >
              {SIZES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
        )}
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={gold}
            onChange={(e) => setGold(e.target.checked)}
            className="h-4 w-4 accent-amber-300"
          />
          Pay with gold (100 gold = $1)
        </label>
        <button
          type="button"
          disabled={buying}
          onClick={() => onBuy(product, isApparel ? size : '')}
          className="w-full rounded-xl bg-amber-300 px-4 py-3 font-semibold text-black transition hover:bg-amber-200 disabled:opacity-50"
        >
          {buying ? 'Starting checkout…' : 'Buy now'}
        </button>
      </div>
    </div>
  );
}

function StoreInner() {
  const params = useSearchParams();
  const [products, setProducts] = useState(null);
  const [notice, setNotice] = useState('');
  const [buyingId, setBuyingId] = useState(null);
  const [useGold, setUseGold] = useState(false);
  const [error, setError] = useState('');

  const checkoutState = params.get('checkout');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/store/products', { cache: 'no-store' });
        const data = await res.json();
        if (!alive) return;
        setProducts(data.products || []);
        if (!data.configured) setNotice(data.notice || 'The store is not connected yet.');
      } catch {
        if (alive) {
          setProducts([]);
          setNotice('Could not reach the store right now. Please try again later.');
        }
      }
    })();
    return () => { alive = false; };
  }, []);

  const groups = useMemo(() => {
    const list = products || [];
    const apparel = list.filter((p) => p.kind === 'apparel');
    const rest = list.filter((p) => p.kind !== 'apparel' && p.kind !== 'other');
    const more = list.filter((p) => p.kind === 'other');
    return { apparel, rest, more };
  }, [products]);

  const onBuy = useCallback(async (product, size) => {
    setError('');
    setBuyingId(product.id);
    try {
      const res = await fetch('/api/store/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product.id,
          productName: product.name,
          size,
          useGold,
          idemKey: crypto.randomUUID(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not start checkout. Please try again.');
        return;
      }
      if (data.type === 'gold') {
        setNotice(data.notice || 'Paid with gold — your order is recorded.');
        return;
      }
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError('Could not start checkout. Please try again.');
      }
    } catch {
      setError('Could not reach the store. Check your connection and try again.');
    } finally {
      setBuyingId(null);
    }
  }, [useGold]);

  const Section = ({ title, items }) => {
    if (!items.length) return null;
    return (
      <section className="mb-10">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-slate-400">{title}</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              onBuy={onBuy}
              buying={buyingId === p.id}
              gold={useGold}
              setGold={setUseGold}
            />
          ))}
        </div>
      </section>
    );
  };

  return (
    <div
      className="min-h-dvh bg-[#06070d] text-white"
      style={{ paddingBottom: 'max(5.5rem, calc(env(safe-area-inset-bottom) + 4.5rem))' }}
    >
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#06070d]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Link href="/" className="text-sm text-slate-300 hover:text-white">← Hub</Link>
          <h1 className="text-lg font-bold tracking-wide">Store</h1>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {checkoutState === 'success' && (
          <div className="mb-6 rounded-xl border border-emerald-400/50 bg-emerald-400/10 px-4 py-4 text-sm text-emerald-200">
            Payment received — your order is confirmed. Watch for a shipping update soon.
          </div>
        )}
        {checkoutState === 'cancelled' && (
          <div className="mb-6 rounded-xl border border-yellow-400/50 bg-yellow-400/10 px-4 py-4 text-sm text-yellow-200">
            Checkout was cancelled — no charge was made.
          </div>
        )}
        {notice && (
          <div className="mb-6 rounded-xl border border-white/15 bg-white/5 px-4 py-4 text-sm text-slate-300">
            {notice}
          </div>
        )}
        {error && (
          <div className="mb-6 rounded-xl border border-red-400/50 bg-red-400/10 px-4 py-4 text-sm text-red-200">
            {error}
          </div>
        )}

        {products === null ? (
          <p className="text-sm text-slate-400">Loading the store…</p>
        ) : products.length === 0 && !notice ? (
          <p className="text-sm text-slate-400">Nothing listed yet — check back soon.</p>
        ) : (
          <>
            <Section title="Apparel" items={groups.apparel} />
            <Section title="More from the universe" items={groups.rest} />
            <Section title="More" items={groups.more} />
          </>
        )}

        <p className="mt-8 text-xs text-slate-500">
          Printed on demand and made when you order. Gold balances apply at checkout.
        </p>
      </main>
    </div>
  );
}

export default function StorePage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-[#06070d] text-white p-8">Loading the store…</div>}>
      <StoreInner />
    </Suspense>
  );
}
