'use client';

// Olympus — Grand Multiverse Store.
// Two views: the store (product grid, cart, checkout) and the solar system
// (interactive 3D viewport — tap a planet for its story). The store is real:
// cart persists on-device, card checkout runs through a server API route when
// Stripe is connected, and order requests are saved for manual fulfillment.

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { PRODUCTS } from '@/lib/olympus/products';
import { addLine, removeLine, setQty, countItems, enrichCart, serialize, deserialize } from '@/lib/olympus/cart';
import { getProduct, PRICE_CENTS } from '@/lib/olympus/products';
import { saveOrderRequest } from '@/lib/olympus/storage';
import ProductCard from '@/components/olympus/ProductCard';
import { fx } from '@/lib/fx';
import ProductModal from '@/components/olympus/ProductModal';
import CartDrawer from '@/components/olympus/CartDrawer';
import CheckoutPanel from '@/components/olympus/CheckoutPanel';
import GoldCheckoutOption from '@/components/economy/GoldCheckoutOption';
import { supabase } from '@/lib/supabase';
import AmbienceBackdrop, { useAmbience, bgModeLabel } from '@/components/ambience/AmbienceBackdrop';

// Inline SVG glyph system (zero image weight) — PLUTUS batch.
const PATHS = {
  bag: 'M18 6h-2c0-2.21-1.79-4-4-4S8 3.79 8 6H6c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6-2c1.1 0 2 .9 2 2h-4c0-1.1.9-2 2-2zm3 7c0 1.66-1.34 3-3 3s-3-1.34-3-3H8c0 2.76 2.24 5 5 5s5-2.24 5-5h-2z',
  planet: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm7.93 9h-3.02a15.7 15.7 0 0 0-1.74-5.61A8.02 8.02 0 0 1 19.93 11zM12 4.07A15.9 15.9 0 0 1 14.9 11H9.1A15.9 15.9 0 0 1 12 4.07zM4.07 13h3.02c.2 2.16.86 4.05 1.74 5.61A8.02 8.02 0 0 1 4.07 13zm3.02-2H4.07a8.02 8.02 0 0 1 4.76-5.61A15.7 15.7 0 0 0 7.09 11zm2.9 2h4.02a15.9 15.9 0 0 1-2.01 6.93A15.9 15.9 0 0 1 9.99 13zm5.92 5.61a15.7 15.7 0 0 0 1.74-5.61h3.02a8.02 8.02 0 0 1-4.76 5.61z',
  cart: 'M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1 1 0 0 0 20 4H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z',
  arrow: 'M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z',
  close: 'M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z',
  spark: 'M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4L12 2z',
};

function Glyph({ d, className }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className || 'w-4 h-4 shrink-0'}>
      <path d={d} />
    </svg>
  );
}

const SolarSystem = dynamic(() => import('@/components/olympus/SolarSystem'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-sm tracking-widest text-cyan-300/70">
      <div className="w-8 h-8 rounded-full border-2 border-cyan-300/25 border-t-cyan-300 animate-spin" aria-hidden="true" />
      CHARTING THE SOLAR SYSTEM…
    </div>
  ),
});

const CART_KEY = 'olympus_cart_v1';

function CheckoutNotice() {
  const params = useSearchParams();
  const result = params.get('checkout');
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    // Honest confirmation: celebrates the Stripe redirect return, not the
    // settled payment (the webhook settles that). Modest, never fanfare.
    if (result === 'success') fx.checkoutConfirm();
    else if (result) fx.checkoutCancelled();
  }, [result]);
  if (!result || dismissed) return null;
  const ok = result === 'success';
  return (
    <div className={`mx-auto mt-4 max-w-2xl rounded-xl border px-4 py-3 text-sm ${ok ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-200' : 'border-amber-400/50 bg-amber-400/10 text-amber-200'}`}>
      <div className="flex items-start justify-between gap-3">
        <p>
          {ok
            ? 'Payment complete — thank you! A confirmation email is on its way.'
            : 'Checkout was cancelled. Your cart is still here whenever you are ready.'}
        </p>
        <button onClick={() => setDismissed(true)} aria-label="Dismiss" className="p-1 text-lg leading-none shrink-0">
          <Glyph d={PATHS.close} className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default function OlympusPage() {
  const [view, setView] = useState('store'); // 'store' | 'solar'
  const [cart, setCart] = useState([]);
  const [activeProduct, setActiveProduct] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutMode, setCheckoutMode] = useState(null); // null | 'card' | 'request'
  const [useGold, setUseGold] = useState(false);
  const [goldNotice, setGoldNotice] = useState(null);
  const [cardAvailable, setCardAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState('');
  const [orderDone, setOrderDone] = useState(false);
  const [planet, setPlanet] = useState(null);
  const [bgMode, cycleBg] = useAmbience('olympus-bg');

  // Load cart from this device.
  useEffect(() => {
    setCart(deserialize(localStorage.getItem(CART_KEY) || '[]'));
  }, []);

  // Persist cart on this device.
  useEffect(() => {
    try { localStorage.setItem(CART_KEY, serialize(cart)); } catch { /* storage full/blocked */ }
  }, [cart]);

  // Ask the server whether card payments are connected.
  useEffect(() => {
    fetch('/api/olympus/checkout')
      .then((r) => (r.ok ? r.json() : { cardPayments: false }))
      .then((d) => setCardAvailable(!!d.cardPayments))
      .catch(() => setCardAvailable(false));
  }, []);

  const { lines, totalCents } = useMemo(() => enrichCart(cart, getProduct, PRICE_CENTS), [cart]);
  const itemCount = countItems(cart);

  const handleAdd = useCallback((productId, size) => {
    setCart((c) => addLine(c, { productId, size, qty: 1 }));
    setActiveProduct(null);
    setCartOpen(true);
  }, []);

  const startCheckout = (mode) => {
    setServerError('');
    setCheckoutMode(mode);
    setCartOpen(false);
  };

  const submitOrderRequest = async (customer) => {
    setBusy(true);
    setServerError('');
    const result = await saveOrderRequest({ customer, lines, totalCents });
    setBusy(false);
    if (!result.ok) {
      setServerError(result.error);
      return;
    }
    setCart([]);
    setCheckoutMode(null);
    setOrderDone(true);
  };

  const startCardCheckout = async () => {
    setBusy(true);
    setServerError('');
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (useGold) {
        let session = null;
        try {
          ({ data: { session } } = await supabase.auth.getSession());
        } catch {
          session = null;
        }
        if (!session) {
          throw new Error('Sign in from the launcher to use your gold.');
        }
        headers.Authorization = `Bearer ${session.access_token}`;
      }
      const res = await fetch('/api/olympus/checkout', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          mode: 'card',
          items: cart.map((l) => ({ id: l.productId, size: l.size, qty: l.qty })),
          useGold,
          idemKey: crypto.randomUUID(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not start card checkout.');
      }
      if (data.type === 'gold') {
        setCart([]);
        setCheckoutMode(null);
        setUseGold(false);
        setGoldNotice(data.notice || 'Paid with gold.');
        return;
      }
      if (!data.url) throw new Error('Could not start card checkout.');
      window.location.href = data.url;
    } catch (err) {
      setServerError(err.message || 'Could not start card checkout.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh bg-[#01020a] text-white relative">
      <AmbienceBackdrop basePath="/images/olympus" bgMode={bgMode} />
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-cyan-300/20 bg-[#01020a]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold tracking-[0.25em] text-cyan-300">OLYMPUS</h1>
            <p className="text-[11px] uppercase tracking-widest text-slate-400">Grand Multiverse Store</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="flex rounded-full border border-cyan-300/30 p-1 text-xs font-semibold" role="tablist" aria-label="View">
              {[
                ['store', 'Store', 'bag'],
                ['solar', 'Solar system', 'planet'],
              ].map(([v, label, icon]) => (
                <button
                  key={v}
                  role="tab"
                  aria-selected={view === v}
                  onClick={() => setView(v)}
                  className={`min-h-[40px] rounded-full px-4 transition inline-flex items-center gap-2 ${view === v ? 'bg-cyan-300 text-black' : 'text-cyan-200'}`}
                >
                  <Glyph d={PATHS[icon]} />
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={cycleBg}
              aria-label={`Ambient background is ${bgMode}. Activate to change.`}
              title="Ambient background: video, still, or off"
              className="flex min-h-[40px] items-center gap-1.5 rounded-full border border-cyan-300/30 px-3 text-xs font-semibold text-cyan-200/80 hover:text-cyan-100"
            >
              <Glyph d={PATHS.spark} />
              <span className="hidden sm:inline">{bgModeLabel(bgMode)}</span>
            </button>
            <button
              onClick={() => setCartOpen(true)}
              aria-label={`Open cart, ${itemCount} items`}
              className="relative flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-full border border-cyan-300/40 px-3 text-sm font-semibold text-cyan-200"
            >
              <Glyph d={PATHS.cart} />
              Cart
              {itemCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-cyan-300 px-1 text-xs font-bold text-black">
                  {itemCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <Suspense fallback={null}>
        <CheckoutNotice />
      </Suspense>

      {view === 'solar' ? (
        <section className="relative h-[calc(100dvh-73px)]" aria-label="Interactive solar system">
          <SolarSystem onSelectPlanet={setPlanet} selectedPlanet={planet} />
          <div className="pointer-events-none absolute left-4 top-4 max-w-[240px] rounded-xl border border-cyan-300/25 bg-black/60 p-3 backdrop-blur">
            <p className="text-xs leading-relaxed text-slate-300">
              Drag to look around. Tap any planet to learn its story.
            </p>
          </div>
          {planet && (
            <div className="absolute bottom-6 left-1/2 w-[92%] max-w-md -translate-x-1/2 rounded-2xl border border-cyan-300/40 bg-[#05070f]/95 p-5 backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-xl font-bold text-cyan-200">{planet.name}</h2>
                <button
                  onClick={() => setPlanet(null)}
                  aria-label="Close planet info"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-cyan-300/40 text-xl text-cyan-200"
                >
                  ×
                </button>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-slate-200">{planet.fact}</p>
              <button
                onClick={() => { setPlanet(null); setView('store'); }}
                className="mt-4 min-h-[44px] w-full rounded-xl bg-cyan-300 text-sm font-bold text-black inline-flex items-center justify-center gap-2"
              >
                <Glyph d={PATHS.arrow} />
                Browse the store
              </button>
            </div>
          )}
        </section>
      ) : (
        <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 relative">
          <div className="mb-6 overflow-hidden rounded-2xl border border-cyan-300/25 relative">
            <img
              src="/images/olympus/header.webp"
              alt=""
              aria-hidden="true"
              className="h-40 sm:h-48 w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#01020a] via-[#01020a]/45 to-transparent" aria-hidden="true" />
            <div className="absolute bottom-0 left-0 right-0 p-4 text-center">
              <h2 className="text-2xl font-bold tracking-wide text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">Wear the multiverse</h2>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-slate-200 drop-shadow-[0_1px_6px_rgba(0,0,0,0.9)]">
                Original graphic apparel from the Olympus archive. Pick a design,
                choose a size, and check out — or send an order request and we will
                confirm everything by email.
              </p>
            </div>
          </div>

          {orderDone && (
            <div className="mx-auto mb-6 max-w-2xl rounded-xl border border-emerald-400/50 bg-emerald-400/10 px-4 py-4 text-sm text-emerald-200">
              <p className="font-semibold">Order request sent — thank you!</p>
              <p className="mt-1">We will email you shortly to confirm your items and arrange payment.</p>
              <button onClick={() => setOrderDone(false)} className="mt-2 underline inline-flex items-center gap-1.5">
                <Glyph d={PATHS.close} className="w-3.5 h-3.5" />
                Dismiss
              </button>
            </div>
          )}

          {goldNotice && (
            <div className="mx-auto mb-6 max-w-2xl rounded-xl border border-yellow-400/50 bg-yellow-400/10 px-4 py-4 text-sm text-yellow-200">
              <p className="font-semibold">🪙 {goldNotice}</p>
              <button onClick={() => setGoldNotice(null)} className="mt-2 underline inline-flex items-center gap-1.5">
                <Glyph d={PATHS.close} className="w-3.5 h-3.5" />
                Dismiss
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 sm:gap-4">
            {PRODUCTS.map((p) => (
              <ProductCard key={p.id} product={p} onOpen={setActiveProduct} />
            ))}
          </div>

          <p className="mt-10 text-center text-xs text-slate-500">
            All items CAD $95.00. Ships after email confirmation.
          </p>

          {/* Safari bottom-bar clearance */}
          <div aria-hidden="true" className="player-clear" />
        </main>
      )}

      <ProductModal product={activeProduct} onClose={() => setActiveProduct(null)} onAdd={handleAdd} />

      <CartDrawer
        open={cartOpen}
        lines={lines}
        totalCents={totalCents}
        cardAvailable={cardAvailable}
        onClose={() => setCartOpen(false)}
        onQty={(id, size, qty) => setCart((c) => setQty(c, id, size, qty))}
        onRemove={(id, size) => setCart((c) => removeLine(c, id, size))}
        onCheckout={startCheckout}
      />

      {checkoutMode && (
        <CheckoutPanel
          mode={checkoutMode}
          totalCents={totalCents}
          itemCount={itemCount}
          busy={busy}
          serverError={serverError}
          onSubmitRequest={submitOrderRequest}
          onStartCard={startCardCheckout}
          onBack={() => { setCheckoutMode(null); setServerError(''); }}
          goldChecked={useGold}
          onGoldToggle={setUseGold}
        />
      )}
    </div>
  );
}
