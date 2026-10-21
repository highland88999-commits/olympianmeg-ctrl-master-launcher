'use client';
// components/store/KaleidoStage.jsx
// The kaleidoscope stage behind a store card's product image (Merlin,
// 2026-10-20: every store card wears a kaleidoscope behind its
// product). One shared implementation for the catalog cards on /store
// (page.jsx ProductCard) and the Creator Marketplace cards
// (CreationCard.jsx): the .kaleido-stage CSS in app/globals.css does
// the visual work; this component only derives the per-product hue and
// provides the inset frame the image sits in — padded, rounded,
// shadowed — so the kaleidoscope stays visible AROUND the product
// instead of hiding underneath a full-bleed photo.
//
// The hue is a stable hash of the product/creation key: no randomness
// in render, so the same product always wears the same kaleidoscope,
// across cards, pages and reloads.

// djb-style string hash folded into [0, 360). Pure + deterministic.
export function kaleidoHue(key) {
  const s = String(key == null ? '' : key);
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}

export default function KaleidoStage({ hueKey, children }) {
  return (
    <div
      className="kaleido-stage aspect-square w-full"
      style={{ '--khue': kaleidoHue(hueKey) }}
    >
      <div className="relative z-[1] flex h-full w-full items-center justify-center p-3">
        {children}
      </div>
    </div>
  );
}
