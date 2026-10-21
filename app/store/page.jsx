'use client';
// /store — the launcher merch store.
// Products come live from Printful (GET /api/store/products) — Merlin's
// real "Omega Store" catalog; nothing is hardcoded. Apparel (hoodies etc.)
// is grouped first, everything else follows, unclassified items land under
// "More". Checkout is live: the buy CTA posts to POST /api/store/checkout,
// which re-prices server-side from Stripe and opens a real Stripe Checkout
// session (or debits gold when chosen). The Luge free-hoodie reward
// (/store?reward=luge) is separate: it claims through POST /api/luge/claim
// and never touches checkout, so it is unaffected.
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import {
  HermesBackdrop,
  HermesPanelTexture,
  HermesLoader,
  useAmbience,
  AmbienceToggle,
} from '@/components/hermes-ui/HermesUi';
import { CartIcon } from '@/lib/hermes-icons';
import ShareButton from '@/components/store/ShareButton';
import KaleidoStage from '@/components/store/KaleidoStage';
import {
  productShareUrl,
  categoryShareUrl,
  productAnchorId,
  categoryAnchorId,
  productShareTitle,
  productShareText,
  categoryShareTitle,
  categoryShareText,
} from '@/lib/store/share';

const SIZES = ['S', 'M', 'L', 'XL', '2XL', '3XL'];

function ProductCard({ product, onBuy, buying, gold, setGold, rewardMode, onRedeem, highlighted }) {
  const [size, setSize] = useState('L');
  const isApparel = product.kind === 'apparel';
  // Mockup image (2026-10-21): most list thumbnails are the degenerate
  // CDN root, so the card arrives imageless with imagePending set and
  // resolves the product's real Printful mockup lazily when it nears
  // the viewport (GET /api/store/product-image). Any image that fails
  // to load is hidden — a card shows the mockup or the plain
  // placeholder, never a broken-image glyph.
  const [imgSrc, setImgSrc] = useState(product.image || null);
  const [imgFailed, setImgFailed] = useState(false);
  const cardRef = useRef(null);
  useEffect(() => {
    setImgSrc(product.image || null);
    setImgFailed(false);
  }, [product.id, product.image]);
  useEffect(() => {
    if (imgSrc || !product.imagePending || !cardRef.current) return undefined;
    let alive = true;
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      fetch(`/api/store/product-image?id=${encodeURIComponent(product.id)}`)
        .then((r) => r.json())
        .then((d) => { if (alive && d && d.image) setImgSrc(d.image); })
        .catch(() => {});
    }, { rootMargin: '300px' });
    io.observe(cardRef.current);
    return () => { alive = false; io.disconnect(); };
  }, [imgSrc, product.id, product.imagePending]);
  // The buy CTA enables when the server reports checkoutReady (Stripe is
  // configured). Without it, the CTA stays honestly disabled — no order is
  // ever faked or placed. Reward redemption (Luge) bypasses checkout
  // entirely and is unaffected.
  const checkoutOpen = product.checkoutReady !== false;

  return (
    <div
      ref={cardRef}
      id={productAnchorId(product.id)}
      className={`flex scroll-mt-32 flex-col overflow-hidden rounded-2xl border bg-white/5 ${
        highlighted ? 'border-amber-300/70 ring-2 ring-amber-300/60' : 'border-white/10'
      }`}
    >
      {/* Kaleidoscope stage (Merlin, 2026-10-20): the product image sits
          inset on a slowly turning kaleidoscope in the product's own
          hue, instead of bleeding edge to edge. No-image products keep
          the placeholder, centred on the stage. */}
      <KaleidoStage hueKey={product.id || product.name}>
        {imgSrc && !imgFailed ? (
          <img
            src={imgSrc}
            alt={product.name}
            onError={() => setImgFailed(true)}
            className="aspect-square h-full w-full rounded-xl object-cover shadow-2xl"
            loading="lazy"
          />
        ) : (
          <div className="flex aspect-square h-full w-full items-center justify-center rounded-xl bg-black/40 text-5xl shadow-2xl">
            🧥
          </div>
        )}
      </KaleidoStage>
      <div className="relative flex flex-1 flex-col gap-3 p-4">
        <HermesPanelTexture opacity={0.06} />
        <div className="relative">
          <div className="flex items-start justify-between gap-2">
            <div className="font-semibold text-white">{product.name}</div>
            <ShareButton
              url={productShareUrl(product.id)}
              title={productShareTitle(product)}
              text={productShareText(product)}
              className="shrink-0"
            />
          </div>
          {product.description ? (
            <p className="mt-1 text-sm text-slate-400">{product.description}</p>
          ) : null}
        </div>
        {rewardMode ? (
          <div className="text-lg font-bold text-emerald-300">Free with your reward</div>
        ) : (
          <div className="text-lg font-bold text-amber-300">{product.priceLabel}</div>
        )}
        {isApparel && (rewardMode || checkoutOpen) && (
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
        {!rewardMode && checkoutOpen && (
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
          disabled={buying || (!rewardMode && !checkoutOpen)}
          onClick={() => (rewardMode ? onRedeem(product, isApparel ? size : '') : onBuy(product, isApparel ? size : ''))}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-300 px-4 py-3 font-semibold text-black transition hover:bg-amber-200 disabled:opacity-50"
        >
          <CartIcon size={16} />
          {rewardMode
            ? (buying ? 'Redeeming…' : 'Redeem free hoodie')
            : !checkoutOpen
              ? 'Checkout coming soon'
              : (buying ? 'Starting checkout…' : 'Buy now')}
        </button>
      </div>
    </div>
  );
}

// Category menu bar (Merlin, 2026-10-20): every product type gets its
// own pill in a horizontally scrollable bar at the top of the store,
// styled after the town-square (Agora) CategoryTabs — same container,
// pill shape and tab semantics, but in the store's amber accent.
// Picking a type isolates it: only that category's section renders.
// "All" restores the full stacked storefront. The bar sticks under the
// header (which is 61px tall) so it stays in reach while scrolling.
function CategoryBar({ tabs, selected, onSelect }) {
  return (
    <div className="sticky top-[61px] z-30 -mx-4 mb-6 bg-[#06070d]/90 px-4 pt-1 backdrop-blur">
      <div
        className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label="Product categories"
      >
        {tabs.map((t) => {
          const isActive = selected === t;
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onSelect(t)}
              className={`min-h-[44px] shrink-0 rounded-full px-4 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-amber-300 text-black'
                  : 'bg-white/5 text-zinc-300 hover:bg-white/10'
              }`}
            >
              {t}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StoreInner() {
  const params = useSearchParams();
  const [ambience, cycleAmbience] = useAmbience('store-bg', 'video');
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

  // Share deep links (Merlin, 2026-10-13): every product and category in
  // the store is shareable; the shared URL is /store?product=pf_<id> or
  // /store?category=<Name> (built by lib/store/share.js). When one lands
  // here, scroll the shared card/section into view and highlight it
  // briefly. A target missing from the catalog (say, a custom creation
  // the cached listing has not picked up yet) simply leaves the plain
  // storefront — no error, no dead end.
  const wantedProduct = params.get('product');
  const wantedCategory = params.get('category');
  const [highlightId, setHighlightId] = useState(null);
  // Category menu selection (Merlin, 2026-10-20): 'All' shows the whole
  // stacked storefront; any other value isolates that one category's
  // section. Deep links below drive it too — a shared category selects
  // itself in the menu, and a shared product selects its own category
  // first so its card is rendered when the scroll goes looking for it.
  const [selectedCategory, setSelectedCategory] = useState('All');

  useEffect(() => {
    if (!products || (!wantedProduct && !wantedCategory)) return;
    let targetId = null;
    if (wantedProduct) {
      targetId = productAnchorId(wantedProduct);
      const prod = products.find((p) => productAnchorId(p.id) === targetId);
      if (prod) setSelectedCategory(prod.category || 'More');
    } else if (wantedCategory) {
      targetId = categoryAnchorId(wantedCategory);
      if (products.some((p) => (p.category || 'More') === wantedCategory)) {
        setSelectedCategory(wantedCategory);
      }
    }
    if (!targetId) return;
    const scrollTimer = setTimeout(() => {
      const el = document.getElementById(targetId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setHighlightId(targetId);
      }
    }, 200);
    const clearTimer = setTimeout(() => setHighlightId(null), 3400);
    return () => { clearTimeout(scrollTimer); clearTimeout(clearTimer); };
  }, [products, wantedProduct, wantedCategory]);

  // Product-type categories (Merlin, 2026-10-11; full-catalog expansion
  // 2026-10-13; verified-type overhaul 2026-10-21): the store groups
  // products by their Printful catalog TYPE — every family gets its
  // own section, including the families the old name-keyword filing
  // buried (Blankets, Pillows & Pillow Cases, Candles, …). `category`
  // comes from categoryOf() in lib/store-printful.js; anything
  // unrecognized lands under "More".
  const CATEGORY_ORDER = [
    'Hoodies', 'T-Shirts', 'Sweatshirts', 'Sweaters', 'Jackets', 'Tank Tops',
    'Joggers', 'Pants', 'Leggings', 'Shorts', 'Dresses', 'Swimwear',
    'Sports Bras', 'Sports Jerseys', 'Pajamas', 'Polo Shirts', 'Headwear',
    'Baby Bodysuits', 'Shoes', 'Blankets', 'Pillows & Pillow Cases',
    'Candles', 'Mugs', 'Tumblers', 'Water Bottles', 'Glassware',
    'Tote Bags', 'Drawstring Bags', 'Crossbody Bags', 'Backpacks',
    'Posters', 'Framed Posters', 'Canvas', 'Stickers', 'Phone Cases',
    'Notebooks & Journals', 'Mouse Pads & Desk Mats', 'Puzzles',
    'Postcards', 'Gift Wrap & Bags', 'Calendars', 'Ornaments',
    'Flags & Pennants', 'Table Linens', 'Pet Accessories', 'Aprons',
    'Beach Towels', 'Socks', 'More',
  ];

  const groups = useMemo(() => {
    const list = products || [];
    const byCat = new Map();
    for (const p of list) {
      const cat = (p && p.category) || 'More';
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat).push(p);
    }
    const ordered = CATEGORY_ORDER.filter((c) => byCat.has(c)).map((c) => ({
      title: c,
      items: byCat.get(c),
    }));
    // Any category not in the fixed order still renders, at the end.
    for (const [cat, items] of byCat) {
      if (!CATEGORY_ORDER.includes(cat)) ordered.push({ title: cat, items });
    }
    return ordered;
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

  // The Luge reward pool is every hoodie by TYPE (2026-10-21: the
  // verified category, not a name match — graphic-titled hoodies like
  // "Glitch" are hoodies too).
  const hoodies = useMemo(
    () => (products || []).filter((p) => p.category === 'Hoodies'),
    [products]
  );

  const Section = ({ title, items }) => {
    if (!items.length) return null;
    const anchor = categoryAnchorId(title);
    return (
      <section id={anchor} className="mb-10 scroll-mt-32">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2
            className={`text-sm font-bold uppercase tracking-widest ${
              highlightId === anchor ? 'text-amber-300' : 'text-slate-400'
            }`}
          >
            {title}
          </h2>
          <ShareButton
            url={categoryShareUrl(title)}
            title={categoryShareTitle(title)}
            text={categoryShareText(title)}
          />
        </div>
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
              highlighted={highlightId === productAnchorId(p.id)}
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
      {/* Merchant-hall ambience: video loop → still → off (persisted, reduced-motion aware) */}
      {ambience === 'video' ? (
        <>
          <video
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            poster="/images/store/bg.webp"
            aria-hidden="true"
            className="pointer-events-none fixed inset-0 h-full w-full object-cover"
            style={{ zIndex: -20, opacity: 0.5 }}
          >
            <source src="/images/store/bg-loop.mp4" type="video/mp4" />
          </video>
          <div
            aria-hidden="true"
            className="pointer-events-none fixed inset-0"
            style={{
              zIndex: -19,
              background: 'linear-gradient(to bottom, rgba(3,5,10,0.72) 0%, rgba(3,5,10,0.35) 45%, rgba(3,5,10,0.88) 100%)',
            }}
          />
        </>
      ) : ambience === 'still' ? (
        <HermesBackdrop src="/images/store/bg.webp" imgOpacity={0.42} zIndex={-20} />
      ) : null}

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-amber-300/20 bg-[#06070d]/90 backdrop-blur">
        {/* merchant banner art behind the header row */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage: 'url(/images/store/bg.webp)',
            backgroundSize: 'cover',
            backgroundPosition: 'center 32%',
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/70"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-amber-300/70 to-transparent"
        />
        <div className="relative mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Link href="/" className="text-sm text-slate-300 hover:text-white">← Hub</Link>
          <h1 className="text-lg font-bold tracking-wide">Store</h1>
          <div className="ml-auto">
            <AmbienceToggle mode={ambience} onCycle={cycleAmbience} />
          </div>
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

        {!rewardMode && groups.length > 0 && (
          <CategoryBar
            tabs={['All', ...groups.map((g) => g.title)]}
            selected={selectedCategory}
            onSelect={setSelectedCategory}
          />
        )}

        {!rewardMode && (
          <Link
            href="/store/marketplace"
            className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-amber-300/25 bg-amber-300/5 px-4 py-3 text-sm text-slate-200 transition hover:border-amber-300/50"
          >
            <span>
              <span className="font-semibold text-amber-300">Creator Marketplace</span>
              {' '}— shop designs made by the community, or sell your own.
            </span>
            <span aria-hidden="true" className="shrink-0 text-amber-300">→</span>
          </Link>
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
            <HermesLoader label="Checking your progress" />
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
            <HermesLoader label="Loading the hoodies" />
          ) : hoodies.length === 0 ? (
            <p className="text-sm text-slate-400">No hoodies are listed in the store right now — check back soon.</p>
          ) : (
            <Section title="Pick your free hoodie" items={hoodies} />
          )
        ) : products === null ? (
          <HermesLoader label="Loading the store" />
        ) : products.length === 0 && !notice ? (
          <p className="text-sm text-slate-400">Nothing listed yet — check back soon.</p>
        ) : (
          <>
            {(selectedCategory === 'All'
              ? groups
              : groups.filter((g) => g.title === selectedCategory)
            ).map((g) => (
              <Section key={g.title} title={g.title} items={g.items} />
            ))}
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
    <Suspense fallback={<div className="min-h-dvh bg-[#06070d] text-white"><HermesLoader label="Loading the store" className="min-h-dvh" /></div>}>
      <StoreInner />
    </Suspense>
  );
}
