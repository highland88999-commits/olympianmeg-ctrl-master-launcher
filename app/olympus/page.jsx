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
import ProductModal from '@/components/olympus/ProductModal';
import CartDrawer from '@/components/olympus/CartDrawer';
import CheckoutPanel from '@/components/olympus/CheckoutPanel';

const SolarSystem = dynamic(() => import('@/components/olympus/SolarSystem'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm tracking-widest text-cyan-300/70">
      CHARTING THE SOLAR SYSTEM…
    </div>
  ),
});

const CART_KEY = 'olympus_cart_v1';

function CheckoutNotice() {
  const params = useSearchParams();
  const result = params.get('checkout');
  const [dismissed, setDismissed] = useState(false);
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
        <button onClick={() => setDismissed(true)} aria-label="Dismiss" className="text-lg leading-none">×</button>
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
  const [cardAvailable, setCardAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState('');
  const [orderDone, setOrderDone] = useState(false);
  const [planet, setPlanet] = useState(null);

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
      const res = await fetch('/api/olympus/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'card',
          items: cart.map((l) => ({ id: l.productId, size: l.size, qty: l.qty })),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.error || 'Could not start card checkout.');
      }
      window.location.href = data.url;
    } catch (err) {
      setServerError(err.message || 'Could not start card checkout.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh bg-[#01020a] text-white">
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
                ['store', 'Store'],
                ['solar', 'Solar system'],
              ].map(([v, label]) => (
                <button
                  key={v}
                  role="tab"
                  aria-selected={view === v}
                  onClick={() => setView(v)}
                  className={`min-h-[40px] rounded-full px-4 transition ${view === v ? 'bg-cyan-300 text-black' : 'text-cyan-200'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setCartOpen(true)}
              aria-label={`Open cart, ${itemCount} items`}
              className="relative flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-cyan-300/40 px-3 text-sm font-semibold text-cyan-200"
            >
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
                className="mt-4 min-h-[44px] w-full rounded-xl bg-cyan-300 text-sm font-bold text-black"
              >
                Browse the store
              </button>
            </div>
          )}
        </section>
      ) : (
        <main className="mx-auto max-w-6xl px-4 pb-24 pt-6">
          <div className="mb-6 text-center">
            <h2 className="text-2xl font-bold tracking-wide text-white">Wear the multiverse</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-slate-400">
              Original graphic apparel from the Olympus archive. Pick a design,
              choose a size, and check out — or send an order request and we will
              confirm everything by email.
            </p>
          </div>

          {orderDone && (
            <div className="mx-auto mb-6 max-w-2xl rounded-xl border border-emerald-400/50 bg-emerald-400/10 px-4 py-4 text-sm text-emerald-200">
              <p className="font-semibold">Order request sent — thank you!</p>
              <p className="mt-1">We will email you shortly to confirm your items and arrange payment.</p>
              <button onClick={() => setOrderDone(false)} className="mt-2 underline">Dismiss</button>
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
        />
      )}
    </div>
  );
}
