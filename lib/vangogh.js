// lib/vangogh.js — Van Gogh sky mode: shared state, hooks, and the
// painterly letter-shadowing kit.
//
// Merlin, 2026-10-31: "Add shadowing to our letters accordingly."
// When the Van Gogh background is active, hub letters get hand-painted
// feeling shadows — warm umber outlines and soft impasto depth —
// instead of flat digital drop shadows. Default mode is untouched.
//
// Two rendering paths, one switch:
// - troika <Text> labels → components/VanGoghText.jsx (outline props)
// - canvas 2D sprite labels → paintVanGoghText() below
// - DOM hub UI → body.vgogh-sky-active + app/globals.css
//
// The module flag is the single source of truth. HomeScene syncs it
// from ui-settings (localStorage cache + UI_SETTINGS_EVENT); every
// label reads it through useVanGoghActive() so no prop drilling.

import { useEffect, useState } from 'react';

export const VANGOGH_BODY_CLASS = 'vgogh-sky-active';

// Warm dark umber — the shadow tone. Reads as hand-painted against
// both the cobalt blues and the glowing yellows of the sky.
export const VANGOGH_SHADOW_COLOR = '#2b1608';
export const VANGOGH_SHADOW_SOFT = 'rgba(90, 45, 12, 0.55)';

let _active = false;
const _subs = new Set();

export function setVanGoghActive(v) {
  v = !!v;
  if (v === _active) return;
  _active = v;
  _subs.forEach((fn) => {
    try { fn(v); } catch {}
  });
}

export function isVanGoghActive() {
  return _active;
}

export function onVanGoghChange(fn) {
  _subs.add(fn);
  return () => { _subs.delete(fn); };
}

/** React hook: re-renders the label when Van Gogh mode toggles. */
export function useVanGoghActive() {
  const [v, setV] = useState(() => isVanGoghActive());
  useEffect(() => onVanGoghChange(setV), []);
  return v;
}

/**
 * Paint canvas-2D text with a Van Gogh shadow. Draws the warm umber
 * outline + offset impasto layer first, then the face text.
 * No-op wrapper: when Van Gogh is off, draws plain text exactly
 * as before (same font/fill/position).
 *
 * opts: { font, fill, align, baseline, shadowStrength }
 */
export function paintVanGoghText(ctx, text, x, y, opts = {}) {
  const {
    font = '700 64px Georgia, serif',
    fill = '#ffe9a8',
    align = 'center',
    baseline = 'middle',
    shadowStrength = 1,
  } = opts;
  ctx.save();
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  if (isVanGoghActive()) {
    // 1. Warm dark outline — the painted edge.
    ctx.lineWidth = Math.max(2, 5 * shadowStrength);
    ctx.strokeStyle = VANGOGH_SHADOW_COLOR;
    ctx.globalAlpha = 0.92;
    ctx.strokeText(text, x, y);
    // 2. Offset impasto layer — depth like thick paint.
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = VANGOGH_SHADOW_SOFT;
    ctx.fillText(text, x + 2.5 * shadowStrength, y + 3.5 * shadowStrength);
    ctx.globalAlpha = 1;
  }
  // 3. Face text.
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/**
 * Troika outline props for Van Gogh mode. Spread onto drei <Text>;
 * returns {} when off so default styling is byte-identical.
 */
export function vanGoghTextProps(fontSize = 1) {
  if (!isVanGoghActive()) return {};
  return {
    outlineWidth: Math.max(0.015, fontSize * 0.045),
    outlineColor: VANGOGH_SHADOW_COLOR,
    outlineOpacity: 0.9,
  };
}
