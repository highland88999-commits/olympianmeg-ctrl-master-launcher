// lib/billboard-face.js — Shared honest ad-face painter for the Olympus
// billboard network. ONE painter: the ARGO street monuments and the hub
// god-tower ad panels both render their branded faces through here, so a
// slot looks the same everywhere.
//
// The faces are honestly labeled placeholders, never fake ads: PARTNER for
// affiliate partners, VIDEO · 19+ for video slots, AD SPACE for unsold
// inventory, MERLIN'S for his own native placements. When a slot carries a
// real image creative (creatives[0].imageUrl), callers draw it cover-fit
// with drawCoverFit instead — aspect preserved, center-cropped, never
// stretched.
//
// All drawing happens in the 1140×1350 logical space (the portrait face
// aspect 8.55/10.125); createBillboardFaceCanvas scales that onto whatever
// backing store the caller wants.

// Logical drawing space — every draw call below is written for this size.
export const FACE_LOGICAL_W = 1140;
export const FACE_LOGICAL_H = 1350;

function fitText(ctx, text, maxWidth, startSize) {
  let size = startSize;
  ctx.font = `800 ${size}px system-ui, sans-serif`;
  while (ctx.measureText(text).width > maxWidth && size > 28) {
    size -= 6;
    ctx.font = `800 ${size}px system-ui, sans-serif`;
  }
}

/**
 * Paint the honest branded face for a billboard slot onto ctx, in the
 * FACE_LOGICAL_W × FACE_LOGICAL_H logical space. The caller is responsible
 * for scaling the context (or the canvas) to its backing store first.
 */
export function paintBillboardFace(ctx, w, h, slot) {
  // Deep-space brand backdrop.
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#0a0f1e');
  g.addColorStop(0.55, '#0d1428');
  g.addColorStop(1, '#070b16');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // Starfield dust.
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  let seed = slot.key.length * 7919;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = 0; i < 120; i++) {
    ctx.globalAlpha = 0.12 + rnd() * 0.4;
    ctx.fillRect(rnd() * w, rnd() * h, 2, 2);
  }
  ctx.globalAlpha = 1;
  // Honest label, top-left.
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '600 34px system-ui, sans-serif';
  ctx.textAlign = 'left';
  const label =
    slot.kind === 'partner'
      ? 'PARTNER'
      : slot.kind === 'native'
        ? "MERLIN'S"
        : slot.kind === 'video'
          ? 'VIDEO · 19+'
          : 'AD SPACE';
  ctx.fillText(label, 56, 92);
  // Brand name.
  ctx.fillStyle = '#f5f2ea';
  ctx.font = '800 120px system-ui, sans-serif';
  ctx.textAlign = 'center';
  fitText(ctx, slot.name.toUpperCase(), w - 140, 120);
  ctx.fillText(slot.name.toUpperCase(), w / 2, h * 0.4, w - 140);
  // Tagline.
  ctx.fillStyle = 'rgba(245,242,234,0.75)';
  ctx.font = '400 52px system-ui, sans-serif';
  ctx.fillText(slot.tagline || '', w / 2, h * 0.4 + 110, w - 160);
  // Accent bar.
  ctx.fillStyle = slot.accent || '#ffd700';
  ctx.fillRect(0, h - 18, w, 18);
  // CTA hint.
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '700 44px system-ui, sans-serif';
  ctx.fillText(
    slot.trackingUrl ? 'TAP TO VISIT  →' : 'YOUR BRAND COULD BE HERE',
    w / 2,
    h - 70
  );
}

/**
 * Create a canvas with the slot's branded face painted on it, at the
 * requested backing-store size (default 380×450 — the hub tower panel face
 * at 100px per world unit). Returns the canvas; the caller wraps it in
 * whatever texture its renderer needs.
 */
export function createBillboardFaceCanvas(slot, w = 380, h = 450) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  // iOS can return null under canvas memory pressure — the caller treats
  // a null return as "no face texture" and falls back to a flat color.
  if (!ctx) return null;
  ctx.scale(w / FACE_LOGICAL_W, h / FACE_LOGICAL_H);
  paintBillboardFace(ctx, FACE_LOGICAL_W, FACE_LOGICAL_H, slot);
  return canvas;
}

/**
 * Draw an image cover-fit (aspect preserved, center-cropped) into a w×h
 * box. Partner assets come in every banner size; stretching would warp
 * logos.
 */
export function drawCoverFit(ctx, img, w, h) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const s = Math.max(w / iw, h / ih);
  const dw = iw * s;
  const dh = ih * s;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}
