'use client';
import { useEffect, useRef, useState } from 'react';
import { fx } from '@/lib/fx';
import { useVortexTravel } from './VortexTravel';

// StoreFloatButton — a floating circular shortcut to the Omega Store (/store)
// pinned to the right edge of the hub viewport.
//
// The icon itself is a rolling preview: it fetches the live product list
// from /api/store/products (the exact same source the store cards render),
// takes the first 5 product images, and crossfades between them every 3s.
// No new assets, no new pipeline — the preview is always the real catalog.
//
// Honest fallbacks:
// - If the product fetch fails or returns no images, a static 🧥 glyph shows
//   (the same fallback the store cards use).
// - prefers-reduced-motion: no cycling, the first image stays put.
// - The button is a real <button> (keyboard accessible, aria-labelled) and
//   rides the vortex to the store. No pop-ups, no badges, no spam.
const PREVIEW_COUNT = 5;
const CYCLE_MS = 3000;

export default function StoreFloatButton() {
  // The floating shortcut rides the vortex like every other entry
  // point (Merlin, 2026-10-29).
  const { travel, overlay: vortexOverlay } = useVortexTravel();
  const [images, setImages] = useState([]);
  const [active, setActive] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    let alive = true;
    try {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        setReducedMotion(true);
      }
    } catch { /* matchMedia unavailable — motion stays on */ }

    fetch('/api/store/products', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!alive || !data || !Array.isArray(data.products)) return;
        const imgs = data.products
          .map((p) => p && p.image)
          .filter(Boolean)
          .slice(0, PREVIEW_COUNT);
        if (imgs.length > 0) setImages(imgs);
      })
      .catch(() => { /* offline store — static glyph fallback below */ });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (reducedMotion || images.length < 2) return;
    timerRef.current = setInterval(() => {
      setActive((i) => (i + 1) % images.length);
    }, CYCLE_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [reducedMotion, images.length]);

  return (
    <div
      className="fixed z-40 flex flex-col items-center gap-1 ui-element pointer-events-auto"
      style={{
        right: 'calc(env(safe-area-inset-right, 0px) + 12px)',
        // Below RIDE in the right-edge column (NIGHT GRID → RIDE → STORE).
        // RIDE sits at top: calc(50% - 34px), ~88px tall (68px + label).
        top: 'calc(50% + 66px)',
      }}
    >
      <button
        type="button"
        onClick={() => { fx.tap(); travel('/store', 'Omega Store'); }}
        aria-label="Open the Omega Store"
        title="Omega Store"
        className="relative w-[68px] h-[68px] rounded-full overflow-hidden border-2 border-amber-400/70 bg-zinc-950 shadow-[0_0_24px_rgba(212,175,55,0.35)] hover:border-amber-300 hover:shadow-[0_0_32px_rgba(212,175,55,0.55)] hover:scale-105 active:scale-95 transition-all"
      >
        {images.length > 0 ? (
          images.map((src, i) => (
            <img
              key={src}
              src={src}
              alt=""
              aria-hidden="true"
              draggable={false}
              className="absolute inset-0 w-full h-full object-cover transition-opacity duration-700"
              style={{ opacity: i === active ? 1 : 0 }}
            />
          ))
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-3xl" aria-hidden="true">
            🧥
          </span>
        )}
      </button>
      <span className="text-[8px] font-bold tracking-[0.25em] uppercase text-amber-300/90 bg-black/60 px-2 py-0.5 rounded-full border border-amber-500/25">
        Store
      </span>
      {vortexOverlay}
    </div>
  );
}
