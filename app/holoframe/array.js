// app/holoframe/array.js
// Pure 3D monitor-array layout math for the /holoframe module.
// No DOM, no network. CommonJS so Node headless tests can require() it.

'use strict';

const BASE_W = 1200;
const BASE_H = 800;
const MAX_SCALE = 1.1;

// Fit the holographic frame into the viewport without upscaling past MAX_SCALE.
function responsiveScale(vw, vh) {
  const w = Math.max(1, Number(vw) || 1);
  const h = Math.max(1, Number(vh) || 1);
  return Math.min((w * 0.8) / BASE_W, (h * 0.8) / BASE_H, MAX_SCALE);
}

// radius grows with monitor count so carousel screens never overlap.
function carouselRadius(count) {
  return Math.max(1200, Math.max(1, count) * 350);
}

// layoutMonitors(mode, count, angle, scale) -> [{ x, y, z, rotY, scale }, ...]
// mode: 'single' | 'carousel' | 'stacked'. Unknown modes fall back to 'single'.
function layoutMonitors(mode, count, angle, scale) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  const a = Number(angle) || 0;
  const s = Number(scale) > 0 ? Number(scale) : 1;
  const out = [];

  if (mode === 'carousel' && n > 0) {
    const radius = carouselRadius(n);
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2 + a;
      out.push({
        x: Math.sin(t) * radius,
        y: 0,
        z: Math.cos(t) * radius,
        rotY: t,
        scale: s,
      });
    }
    return out;
  }

  if (mode === 'stacked') {
    const spacing = BASE_H * s + 100;
    for (let i = 0; i < n; i++) {
      out.push({ x: 0, y: -(i * spacing), z: 0, rotY: 0, scale: s * 0.9 });
    }
    return out;
  }

  // 'single' (and fallback)
  for (let i = 0; i < n; i++) {
    out.push(i === 0
      ? { x: 0, y: 0, z: 0, rotY: 0, scale: s }
      : { x: 0, y: 0, z: -3000, rotY: 0, scale: 0 });
  }
  return out;
}

function statusLabel(i) {
  return 'NODE ARRAY [' + String(i + 1).padStart(2, '0') + ']';
}

const MODES = ['single', 'carousel', 'stacked'];

module.exports = { BASE_W, BASE_H, MAX_SCALE, responsiveScale, carouselRadius, layoutMonitors, statusLabel, MODES };
