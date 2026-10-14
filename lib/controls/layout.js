// lib/controls/layout.js
//
// Pad placement: where each pad rests in the controller layer, per
// layout. Layouts are variations of Merlin's arrangement ONLY —
// Signature (as drawn), Low (hugging the bottom edge), Ghost
// (smaller, fainter at rest), Mirrored (left/right swapped), Custom
// (the user's own drag placements, restored exactly — the stability
// rule: where set, it never changes on its own).
//
// Pure: returns plain style numbers the layer applies. Headless-
// testable. Coordinates: bottom/side insets in px; custom positions
// are pad-CENTER percentages of the layer (x: 0..100 left->right,
// y: 0..100 top->bottom).

import { LAYOUT_TRAITS } from './settings.js';

// Labels ring OUTSIDE the rim, so pads inset far enough that the
// outermost labels never clip the screen edge.
export const LABEL_GUTTER = 34;

/**
 * Resolve one pad's placement.
 * @param settings  sanitized controller settings
 * @param pad       { id, baseSize, anchor: { side, bottom } }
 * @returns { size, style, idleOpacity, custom }
 *   style is either corner-anchored ({ left|right, bottom }) or
 *   custom-centered ({ leftPct, topPct }) — the layer renders both.
 */
export function resolvePadPlacement(settings, pad) {
  const traits = LAYOUT_TRAITS[settings.layout] || LAYOUT_TRAITS.signature;
  const size = Math.round(pad.baseSize * settings.padScale * traits.scaleMul);

  if (settings.layout === 'custom') {
    const pos = settings.custom?.[pad.id];
    if (pos) {
      return {
        size: Math.round(size * (pos.scale || 1)),
        idleOpacity: traits.idleOpacity,
        custom: true,
        style: { leftPct: pos.x, topPct: pos.y },
      };
    }
    // no placement saved for this pad yet -> Signature anchor
  }

  const side = traits.mirror
    ? (pad.anchor.side === 'left' ? 'right' : 'left')
    : pad.anchor.side;
  const bottom = Math.max(6, pad.anchor.bottom + traits.bottomShift);
  const style = { bottom };
  style[side] = LABEL_GUTTER;
  return { size, idleOpacity: traits.idleOpacity, custom: false, style };
}

/** Convert a pointer position (layer px) to layer-percent center coords. */
export function toLayerPercent(clientX, clientY, layerRect) {
  const x = ((clientX - layerRect.left) / Math.max(1, layerRect.width)) * 100;
  const y = ((clientY - layerRect.top) / Math.max(1, layerRect.height)) * 100;
  return {
    x: Math.min(98, Math.max(2, x)),
    y: Math.min(98, Math.max(2, y)),
  };
}
