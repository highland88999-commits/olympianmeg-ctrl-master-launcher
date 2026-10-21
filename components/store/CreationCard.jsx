'use client';
// components/store/CreationCard.jsx
// One user creation, as sold in the Creator Marketplace and on creator
// storefronts. Same card language as the /store product cards (image,
// name, price, Buy now) with three creation-specific behaviours:
//
//   - The image and name link to the product's page within the store —
//     its canonical deep link (/store?product=pf_<id>), which scrolls
//     to and highlights the product's catalog card.
//   - Buy now goes through POST /api/store/custom/buy, the
//     record-priced route — NEVER the generic catalog checkout, which
//     prices flat and doesn't know the creator markup baked into this
//     creation's recorded price. The amount is always re-derived
//     server-side from the creation record; the client sends only the
//     product key and (for multi-variant creations) the chosen size.
//   - A ShareButton sits beside the name, sharing the product's
//     canonical store URL (lib/store/share.js), like every other
//     product in the store.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { HermesPanelTexture } from '@/components/hermes-ui/HermesUi';
import { CartIcon } from '@/lib/hermes-icons';
import ShareButton from '@/components/store/ShareButton';
import KaleidoStage from '@/components/store/KaleidoStage';
import { productShareTitle, productShareText } from '@/lib/store/share';

export default function CreationCard({ creation, showCreator = true }) {
  const [sizes, setSizes] = useState(null);
  const [size, setSize] = useState('');
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState('');
  // A stored image URL that fails to load falls back to the
  // placeholder — never a broken-image glyph (2026-10-21).
  const [imgFailed, setImgFailed] = useState(false);

  const productId = creation && creation.id;

  // Honest sizes: exactly what Printful reports for this design, via
  // the same variants endpoint the store page's picker uses. More than
  // one live size -> a picker (the buy route requires one); a single
  // size (or an endpoint hiccup) -> no picker, the buy route fulfills
  // the one variant and re-validates server-side regardless.
  useEffect(() => {
    if (!productId) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/store/variants?productId=${encodeURIComponent(productId)}`, {
          cache: 'no-store',
        });
        const data = await res.json().catch(() => ({}));
        if (!alive) return;
        const list = Array.isArray(data.sizes) ? data.sizes : [];
        setSizes(list);
        if (list.length > 1) setSize(list.includes('L') ? 'L' : list[0]);
      } catch {
        if (alive) setSizes([]);
      }
    })();
    return () => { alive = false; };
  }, [productId]);

  if (!creation) return null;
  const needsSize = Array.isArray(sizes) && sizes.length > 1;

  const onBuy = async () => {
    setError('');
    setBuying(true);
    try {
      const headers = { 'Content-Type': 'application/json' };
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session && session.access_token) {
          headers.Authorization = `Bearer ${session.access_token}`;
        }
      } catch { /* guest purchase at the store price is fine */ }
      const res = await fetch('/api/store/custom/buy', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          productId,
          ...(needsSize && size ? { size } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error || 'Could not start checkout. Please try again.');
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
      setBuying(false);
    }
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5">
      <Link href={creation.storePath} aria-label={`View ${creation.name} in the store`}>
        {/* Kaleidoscope stage (Merlin, 2026-10-20): same treatment as the
            catalog cards — image inset on a kaleidoscope in the
            creation's own hue; placeholder centred when imageless. */}
        <KaleidoStage hueKey={creation.id || creation.name}>
          {creation.image && !imgFailed ? (
            <img
              src={creation.image}
              alt={creation.name}
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
      </Link>
      <div className="relative flex flex-1 flex-col gap-3 p-4">
        <HermesPanelTexture opacity={0.06} />
        <div className="relative">
          <div className="flex items-start justify-between gap-2">
            <Link href={creation.storePath} className="font-semibold text-white hover:underline">
              {creation.name}
            </Link>
            <ShareButton
              url={creation.storeUrl}
              title={productShareTitle(creation)}
              text={productShareText({ name: creation.name, priceLabel: creation.priceLabel })}
              className="shrink-0"
            />
          </div>
          <p className="mt-1 text-sm text-slate-400">{creation.templateName}</p>
          {showCreator && creation.creatorPath ? (
            <p className="mt-1 text-sm text-slate-400">
              by{' '}
              <Link href={creation.creatorPath} className="text-amber-300 hover:underline">
                {creation.creatorLabel}
              </Link>
            </p>
          ) : null}
        </div>
        <div className="text-lg font-bold text-amber-300">{creation.priceLabel}</div>
        {needsSize && (
          <label className="text-sm text-slate-300">
            Size
            <select
              value={size}
              onChange={(e) => setSize(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-white/15 bg-black/50 px-3 py-2 text-white"
            >
              {sizes.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
        )}
        {error && <p className="text-sm text-red-300">{error}</p>}
        <button
          type="button"
          disabled={buying}
          onClick={onBuy}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-300 px-4 py-3 font-semibold text-black transition hover:bg-amber-200 disabled:opacity-50"
        >
          <CartIcon size={16} />
          {buying ? 'Starting checkout…' : 'Buy now'}
        </button>
      </div>
    </div>
  );
}
