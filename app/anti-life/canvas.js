// canvas.js — dependency-free 2D renderer for the Anti-Life art piece.
//
// Side-view stylized world with parallax ridges, withering trees, crumbling
// towers, and cyan life-motes that turn to falling ash. Glow is kept local:
// only neon signs and embers use shadowBlur, and both are count-capped.

import {
  CELL_WIDTH,
  cellEntities,
  witherAt,
  collapseAt,
  hashCell,
  mulberry32,
  palette,
  ashfallActive,
  applyPan,
  stepState,
} from './decay.js';

const STATIC_DECAY = 0.3; // frame shown when reduced motion is requested

export function createAntiLifeRenderer(canvas, state, opts = {}) {
  const ctx = canvas.getContext('2d');
  const reduced = !!opts.reducedMotion;
  const onHud = typeof opts.onHud === 'function' ? opts.onHud : () => {};

  let w = 0;
  let h = 0;
  let raf = 0;
  let running = false;
  let lastT = 0;
  let hudT = 0;
  let vignette = null;
  let neonCount = 0;
  const cellCache = new Map();

  // Stars: fixed seeds so they don't crawl between frames.
  const stars = [];
  {
    const rng = mulberry32(0x5eed);
    for (let i = 0; i < 110; i++) {
      stars.push({ x: rng(), y: rng() * 0.55, r: 0.6 + rng() * 1.4, ph: rng() * 6.28 });
    }
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    w = Math.max(1, Math.round(rect.width));
    h = Math.max(1, Math.round(rect.height));
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    vignette = ctx.createRadialGradient(
      w / 2, h / 2, Math.min(w, h) * 0.42,
      w / 2, h / 2, Math.max(w, h) * 0.78
    );
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.55)');
  }

  function groundY(x) {
    const horizon = h * 0.62;
    return horizon + Math.sin(x * 0.004) * 14 + Math.sin(x * 0.0013 + 2) * 22;
  }

  function entitiesFor(cell) {
    let e = cellCache.get(cell);
    if (!e) {
      e = cellEntities(state.seed, cell);
      if (cellCache.size > 120) cellCache.clear();
      cellCache.set(cell, e);
    }
    return e;
  }

  function drawSky(pal, decay) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, pal.skyTop);
    g.addColorStop(0.62, pal.skyBottom);
    g.addColorStop(0.621, pal.groundTop);
    g.addColorStop(1, pal.groundBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Stars fade as the sky dies.
    const alpha = Math.max(0, 0.85 - decay * 0.65);
    if (alpha > 0.02) {
      ctx.fillStyle = pal.star;
      for (const s of stars) {
        const tw = 0.55 + 0.45 * Math.sin(state.time * 1.6 + s.ph);
        ctx.globalAlpha = alpha * tw;
        ctx.fillRect(s.x * w, s.y * h, s.r, s.r);
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawRidge(parallax, color, base, amp1, amp2) {
    const horizon = h * 0.62;
    const off = state.cameraX * parallax;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let sx = 0; sx <= w; sx += 16) {
      const wx = sx + off;
      const y =
        horizon - base - amp1 * Math.sin(wx * 0.006 + parallax * 9) - amp2 * Math.sin(wx * 0.017 + 1.7);
      ctx.lineTo(sx, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
  }

  function drawGround() {
    const g = ctx.createLinearGradient(0, h * 0.55, 0, h);
    g.addColorStop(0, currentPal.groundTop);
    g.addColorStop(1, currentPal.groundBottom);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let sx = 0; sx <= w; sx += 24) {
      ctx.lineTo(sx, groundY(sx + state.cameraX - w / 2));
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
  }

  let currentPal = null;

  function drawTree(x, t, decay) {
    const pal = currentPal;
    const sx = x - state.cameraX + w / 2;
    if (sx < -80 || sx > w + 80) return;
    const gy = groundY(x);
    const wth = witherAt(Math.abs(x - state.cameraX), decay);
    const s = t.size * (1 - 0.35 * wth);
    const trunkH = 26 * s;
    const lean = t.lean * (1 + wth * 1.6);

    ctx.strokeStyle = pal.trunk;
    ctx.lineWidth = Math.max(1.5, 5 * s);
    ctx.beginPath();
    ctx.moveTo(sx, gy);
    ctx.lineTo(sx + lean * 20, gy - trunkH);
    ctx.stroke();

    // Canopy: three stacked triangles that narrow and droop as they wither.
    ctx.fillStyle = pal.canopy;
    const topX = sx + lean * 20;
    let cy = gy - trunkH;
    for (let i = 0; i < 3; i++) {
      const tw = (34 - i * 8) * s * (1 - 0.3 * wth);
      const th = 30 * s * (1 - 0.45 * wth);
      const droop = wth * 10 * (i + 1);
      ctx.beginPath();
      ctx.moveTo(topX - tw / 2, cy + droop * 0.4);
      ctx.lineTo(topX + tw / 2, cy + droop * 0.4);
      ctx.lineTo(topX + lean * 8, cy - th + droop);
      ctx.closePath();
      ctx.fill();
      cy -= th * 0.62;
    }
  }

  function drawBuilding(x, b, decay) {
    const pal = currentPal;
    const sx = x - state.cameraX + w / 2;
    if (sx + b.w < -40 || sx > w + 40) return;
    const gy = groundY(x);
    const col = collapseAt(Math.abs(x - state.cameraX), decay);
    const bh = b.h * (1 - 0.62 * col);

    ctx.fillStyle = pal.building;
    ctx.fillRect(sx, gy - bh, b.w, bh);
    ctx.strokeStyle = pal.buildingEdge;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(sx + 0.75, gy - bh + 0.75, b.w - 1.5, bh - 1.5);

    // Jagged ruin line when collapsing.
    if (col > 0.15) {
      ctx.fillStyle = pal.building;
      const teeth = Math.max(2, Math.floor(b.w / 14));
      ctx.beginPath();
      ctx.moveTo(sx, gy - bh);
      for (let i = 0; i <= teeth; i++) {
        const px = sx + (b.w * i) / teeth;
        const py = gy - bh - ((hashCell(state.seed, Math.floor(x) + i) % 100) / 100) * 22 * col;
        ctx.lineTo(px, py);
      }
      ctx.lineTo(sx + b.w, gy - bh);
      ctx.closePath();
      ctx.fill();
    }

    // Windows: the lit fraction drains with decay.
    const cols = Math.max(1, Math.floor(b.w / 18));
    const rows = Math.max(1, Math.floor(bh / 26));
    const litChance = Math.max(0, 0.85 - decay * 1.05);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const wx = sx + 6 + (c * (b.w - 12)) / cols;
        const wy = gy - bh + 8 + (r * (bh - 16)) / rows;
        const hh = (hashCell(state.seed, Math.floor(x * 7) + r * 131 + c * 17) % 1000) / 1000;
        ctx.fillStyle = hh < litChance ? pal.windowLit : pal.windowDark;
        ctx.fillRect(wx, wy, (b.w - 12) / cols - 5, (bh - 16) / rows - 7);
      }
    }

    // Neon sign: one small local glow per tower, capped per frame.
    if (decay < 0.7 && neonCount < 22) {
      neonCount++;
      const hue = b.neon > 0.5 ? '0,229,255' : '255,0,160';
      ctx.save();
      ctx.shadowColor = `rgba(${hue},0.9)`;
      ctx.shadowBlur = 12;
      ctx.fillStyle = `rgba(${hue},${0.75 - decay})`;
      ctx.fillRect(sx + b.w * 0.2, gy - bh - 8, b.w * 0.6, 5);
      ctx.restore();
    }
  }

  function drawParticles(decay) {
    const pal = currentPal;
    const bandW = w + 240;
    for (const p of state.particles) {
      let sx = (p.x - state.cameraX + w / 2 + 120) % bandW;
      if (sx < 0) sx += bandW;
      sx -= 120;
      if (sx < -10 || sx > w + 10 || p.y < -40 || p.y > h + 40) continue;
      ctx.fillStyle = pal.mote;
      ctx.globalAlpha = 0.75 - decay * 0.25;
      const r = p.size * (0.8 + decay * 0.5);
      ctx.beginPath();
      ctx.arc(sx, p.y, r, 0, 6.2832);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Embers rise only in the ashfall stage — small count, local glow.
    if (ashfallActive(decay)) {
      const rng = mulberry32((state.seed ^ Math.floor(state.time * 2)) >>> 0);
      ctx.save();
      ctx.shadowColor = 'rgba(255,150,80,0.9)';
      ctx.shadowBlur = 8;
      ctx.fillStyle = pal.ember;
      for (let i = 0; i < 36; i++) {
        const ex = rng() * w;
        const ey = h - ((rng() * h + state.time * 60) % (h * 1.1));
        ctx.globalAlpha = 0.5 + rng() * 0.4;
        ctx.fillRect(ex, ey, 2.4, 2.4);
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  function frame() {
    const decay = reduced ? STATIC_DECAY : state.decay;
    currentPal = palette(decay);
    neonCount = 0;

    drawSky(currentPal, decay);
    drawRidge(0.22, currentPal.ridgeFar, 70, 34, 16);
    drawRidge(0.45, currentPal.ridgeNear, 34, 20, 10);
    drawGround();

    const firstCell = Math.floor((state.cameraX - w / 2 - 220) / CELL_WIDTH);
    const lastCell = Math.floor((state.cameraX + w / 2 + 220) / CELL_WIDTH);
    for (let c = firstCell; c <= lastCell; c++) {
      const e = entitiesFor(c);
      const ox = c * CELL_WIDTH;
      for (const t of e.trees) drawTree(ox + t.dx, t, decay);
      for (const b of e.buildings) drawBuilding(ox + b.dx, b, decay);
    }

    drawParticles(decay);

    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);
  }

  function pushHud() {
    const decay = reduced ? STATIC_DECAY : state.decay;
    onHud({ decay, ashfall: ashfallActive(decay), held: reduced });
  }

  function loop(t) {
    if (!running) return;
    const dt = Math.min(0.1, (t - lastT) / 1000 || 0.016);
    lastT = t;
    stepState(state, dt, { w, h });
    frame();
    hudT += dt;
    if (hudT > 0.2) {
      hudT = 0;
      pushHud();
    }
    raf = requestAnimationFrame(loop);
  }

  // --- input: drag to pan -------------------------------------------------
  let dragging = false;
  let lastX = 0;

  function onPointerDown(e) {
    dragging = true;
    lastX = e.clientX;
    if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e) {
    if (!dragging || reduced) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    // Drag right => the camera travels left through the world.
    applyPan(state, -dx * 1.4);
  }
  function onPointerUp() {
    dragging = false;
  }

  function onResize() {
    resize();
    if (reduced) {
      frame();
      pushHud();
    }
  }

  function start() {
    if (running || reduced) return;
    running = true;
    lastT = performance.now();
    raf = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  function reset(newSeed) {
    state.seed = newSeed >>> 0;
    state.decay = 0;
    state.cameraX = 0;
    state.time = 0;
    cellCache.clear();
    const rng = mulberry32((state.seed ^ 0x51ab3c) >>> 0);
    for (const p of state.particles) {
      p.x = (rng() - 0.5) * 2400;
      p.y = rng() * 900 - 100;
    }
    frame();
    pushHud();
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('resize', onResize);

  resize();
  frame();
  pushHud();

  return {
    start,
    stop,
    reset,
    dispose() {
      stop();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('resize', onResize);
    },
  };
}
