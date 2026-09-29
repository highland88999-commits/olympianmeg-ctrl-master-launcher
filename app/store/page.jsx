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
import { supabase } from '@/lib/supabase/client';

const SIZES = ['S', 'M', 'L', 'XL', '2XL', '3XL'];

function ProductCard({ product, onBuy, buying, gold, setGold, rewardMode, onRedeem }) {
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
        {rewardMode ? (
          <div className="text-lg font-bold text-emerald-300">Free with your reward</div>
        ) : (
          <div className="text-lg font-bold text-amber-300">{product.priceLabel}</div>
        )}
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
        {!rewardMode && (
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={gold}
              onChange={(e) => setGold(e.target.checked)}
              className="h-4 w-4 accent-amber-300"
            />
            Pay with gold (100 gold = $1)
          </label>
        )}
        <button
          type="button"
          disabled={buying}
          onClick={() => (rewardMode ? onRedeem(product, isApparel ? size : '') : onBuy(product, isApparel ? size : ''))}
          className="w-full rounded-xl bg-amber-300 px-4 py-3 font-semibold text-black transition hover:bg-amber-200 disabled:opacity-50"
        >
          {rewardMode ? (buying ? 'Redeeming…' : 'Redeem free hoodie') : (buying ? 'Starting checkout…' : 'Buy now')}
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
  // Reward mode: /store?reward=luge — the Luge free-hoodie redemption.
  // No prices, no checkout, no charge: a $0 reward order is recorded
  // server-side by POST /api/luge/claim after eligibility is re-verified.
  const rewardMode = params.get('reward') === 'luge';
  const [rewardEligibility, setRewardEligibility] = useState(null);

  useEffect(() => {
    if (!rewardMode) return;
    let alive = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          if (alive) setRewardEligibility({ error: 'auth' });
          return;
        }
        const res = await fetch('/api/luge/eligibility', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const data = await res.json();
        if (alive) setRewardEligibility(data && data.ok ? data : { error: 'api' });
      } catch {
        if (alive) setRewardEligibility({ error: 'api' });
      }
    })();
    return () => { alive = false; };
  }, [rewardMode]);

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

  // Reward-mode redemption: posts the chosen size to /api/luge/claim, which
  // re-verifies eligibility server-side and records a $0 order. Never
  // touches the Stripe checkout — nothing is charged.
  const onRedeem = useCallback(async (product, size) => {
    setError('');
    setBuyingId(product.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/luge/claim', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ size }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || 'Could not record your claim. Please try again.');
        return;
      }
      setNotice(`Hoodie claimed — size ${data.size}. No charge was made. Merlin confirms every claim by hand before anything ships.`);
      setRewardEligibility((prev) => (prev ? { ...prev, eligible: false, alreadyRedeemed: true } : prev));
    } catch {
      setError('Could not reach the claim service. Check your connection and try again.');
    } finally {
      setBuyingId(null);
    }
  }, []);

  const hoodies = useMemo(
    () => (products || []).filter((p) => p.kind === 'apparel' && /hoodie/i.test(p.name || '')),
    [products]
  );

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
              rewardMode={rewardMode}
              onRedeem={onRedeem}
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

        {rewardMode && (
          <div className="mb-6 rounded-xl border border-amber-400/50 bg-amber-400/10 px-4 py-4">
            <div className="text-sm font-bold uppercase tracking-widest text-amber-300">🏂 Luge reward — your free hoodie</div>
            <p className="mt-1 text-sm text-slate-300">
              Complete all 20 courses with the Complete Arsenal in your garage and this hoodie is free —
              no charge, one per rider. This reward is separate from the Valkyrie referral program.
            </p>
          </div>
        )}

        {rewardMode ? (
          rewardEligibility === null ? (
            <p className="text-sm text-slate-400">Checking your progress…</p>
          ) : rewardEligibility.error === 'auth' ? (
            <div className="rounded-xl border border-white/15 bg-white/5 px-4 py-4 text-sm text-slate-300">
              Sign in to redeem your hoodie.{' '}
              <Link href="/luge" className="text-amber-300 underline">Head to Luge</Link>{' '}
              to sign in with your account, then come back here.
            </div>
          ) : rewardEligibility.error ? (
            <p className="text-sm text-slate-400">Could not check your progress right now. Please try again later.</p>
          ) : !rewardEligibility.provisioned ? (
            <p className="text-sm text-slate-300">{rewardEligibility.notice}</p>
          ) : rewardEligibility.alreadyRedeemed ? (
            <div className="rounded-xl border border-white/15 bg-white/5 px-4 py-4 text-sm text-slate-300">
              This account already claimed its free hoodie — one per rider.
              Merlin confirms every claim by hand before anything ships.
            </div>
          ) : !rewardEligibility.eligible ? (
            <div className="rounded-xl border border-white/15 bg-white/5 px-4 py-4 text-sm text-slate-300">
              <p className="mb-2">The hoodie unlocks when you conquer every course with the full Arsenal:</p>
              <ul className="list-inside list-disc space-y-1">
                <li>Courses conquered: {rewardEligibility.coursesCompleted} of {rewardEligibility.coursesTotal}</li>
                <li>Premium sleds owned: {rewardEligibility.premiumOwned} of {rewardEligibility.premiumTotal}</li>
              </ul>
              <p className="mt-3">
                <Link href="/luge" className="text-amber-300 underline">Back to Luge</Link>{' '}
                to keep racing.
              </p>
            </div>
          ) : products === null ? (
            <p className="text-sm text-slate-400">Loading the hoodies…</p>
          ) : hoodies.length === 0 ? (
            <p className="text-sm text-slate-400">No hoodies are listed in the store right now — check back soon.</p>
          ) : (
            <Section title="Pick your free hoodie" items={hoodies} />
          )
        ) : products === null ? (
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
          {rewardMode
            ? 'Your free Luge reward — no charge. Printed on demand when Merlin confirms your claim by hand.'
            : 'Printed on demand and made when you order. Gold balances apply at checkout.'}
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
