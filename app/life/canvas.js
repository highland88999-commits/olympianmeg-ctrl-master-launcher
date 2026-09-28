// canvas.js — dependency-free 2D renderer for the Life orbital matrix.
//
// Concentric orbit rings with orbiting bodies, a glowing core, twinkling
// starfield, and a periodic alignment pulse. Glow stays local: the core and
// bodies carry small shadowBlur halos, nothing full-screen.

import {
  MONTH_SECONDS,
  clampZoom,
  clampTilt,
  monthProgress,
  alignmentActive,
  bodyAngle,
  stepMatrix,
} from './orbits.js';

const STATIC_TIME = MONTH_SECONDS * 0.35; // composition shown when motion is reduced

export function createOrbitalRenderer(canvas, state, opts = {}) {
  const ctx = canvas.getContext('2d');
  const reduced = !!opts.reducedMotion;
  const onHud = typeof opts.onHud === 'function' ? opts.onHud : () => {};

  let w = 0;
  let h = 0;
  let raf = 0;
  let running = false;
  let lastT = 0;
  let hudT = 0;

  const timeNow = () => (reduced ? STATIC_TIME : state.time);

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    w = Math.max(1, Math.round(rect.width));
    h = Math.max(1, Math.round(rect.height));
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawBackground(t) {
    ctx.fillStyle = '#020408';
    ctx.fillRect(0, 0, w, h);

    // Starfield with a gentle twinkle.
    const R = Math.max(w, h) * 0.55;
    const cx = w / 2;
    const cy = h / 2;
    for (const s of state.stars) {
      const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 1.8 + s.ph));
      ctx.globalAlpha = tw * 0.8;
      ctx.fillStyle = '#cfe6ff';
      ctx.fillRect(cx + s.x * R, cy + s.y * R, s.r, s.r);
    }
    ctx.globalAlpha = 1;

    // Faint procedural grid: concentric circles + radial spokes.
    const zoom = state.zoom;
    ctx.strokeStyle = 'rgba(0,229,255,0.055)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 8; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy, i * 72 * zoom, 0, 6.2832);
      ctx.stroke();
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * 6.2832 + state.rot * 0.2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 40 * zoom, cy + Math.sin(a) * 40 * zoom);
      ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      ctx.stroke();
    }
  }

  function project(angle, radius) {
    const cx = w / 2;
    const cy = h / 2;
    const k = Math.sin(state.tilt); // negative tilt => flattened ellipses
    return {
      x: cx + Math.cos(angle + state.rot) * radius * state.zoom,
      y: cy + Math.sin(angle + state.rot) * radius * state.zoom * k,
      depth: Math.sin(angle + state.rot), // for painter ordering
    };
  }

  function drawCore(t, aligning) {
    const cx = w / 2;
    const cy = h / 2;
    const r = 46 * state.zoom * (aligning ? 1 + 0.06 * Math.sin(t * 6) : 1);

    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.2);
    g.addColorStop(0, 'rgba(220,250,255,0.95)');
    g.addColorStop(0.35, 'rgba(0,200,230,0.55)');
    g.addColorStop(1, 'rgba(0,120,160,0)');
    ctx.save();
    ctx.shadowColor = 'rgba(0,229,255,0.8)';
    ctx.shadowBlur = 24;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 2.2, 0, 6.2832);
    ctx.fill();
    ctx.restore();

    // Equatorial band.
    ctx.strokeStyle = 'rgba(0,229,255,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 1.7, r * 1.7 * Math.abs(Math.sin(state.tilt)), 0, 0, 6.2832);
    ctx.stroke();
  }

  function drawOrbits(t) {
    const cx = w / 2;
    const cy = h / 2;
    const k = Math.abs(Math.sin(state.tilt));
    const aligning = alignmentActive(state) && !reduced;

    for (const orbit of state.orbits) {
      const r = orbit.radius * state.zoom;
      ctx.strokeStyle = `rgba(${orbit.color},0.38)`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, r * k, 0, 0, 6.2832);
      ctx.stroke();

      // Ring label at the eastern limb.
      ctx.fillStyle = `rgba(${orbit.color},0.55)`;
      ctx.font = '10px ui-monospace, Menlo, Consolas, monospace';
      ctx.fillText(orbit.name, cx + r + 6, cy + 3);
    }

    // Bodies, far-to-near.
    const dots = [];
    for (const orbit of state.orbits) {
      for (const body of orbit.bodies) {
        const a = bodyAngle(orbit, body, t);
        const p = project(a, orbit.radius);
        dots.push({ orbit, body, ...p });
      }
    }
    dots.sort((a, b) => a.depth - b.depth);

    for (const d of dots) {
      const s = d.body.size * state.zoom;
      ctx.save();
      ctx.shadowColor = `rgba(${d.orbit.color},0.9)`;
      ctx.shadowBlur = 10;
      ctx.fillStyle = `rgba(${d.orbit.color},0.35)`;
      ctx.beginPath();
      ctx.arc(d.x, d.y, s * 2.1, 0, 6.2832);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = aligning ? '#ffffff' : `rgba(${d.orbit.color},1)`;
      ctx.beginPath();
      ctx.arc(d.x, d.y, s, 0, 6.2832);
      ctx.fill();
      ctx.restore();
    }

    // Alignment pulse on the outer ring.
    if (aligning) {
      const outer = state.orbits[state.orbits.length - 1].radius * state.zoom;
      const pulse = 1 + 0.08 * Math.sin(t * 6);
      ctx.strokeStyle = `rgba(255,255,255,${0.35 + 0.25 * Math.sin(t * 6)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, outer * pulse, outer * pulse * k, 0, 0, 6.2832);
      ctx.stroke();
    }
  }

  function frame() {
    const t = timeNow();
    drawBackground(t);
    drawCore(t, alignmentActive(state) && !reduced);
    drawOrbits(t);
  }

  function pushHud() {
    const progress = reduced ? STATIC_TIME / MONTH_SECONDS : monthProgress(state);
    onHud({ progress, held: reduced });
  }

  function loop(t) {
    if (!running) return;
    const dt = Math.min(0.1, (t - lastT) / 1000 || 0.016);
    lastT = t;
    stepMatrix(state, dt);
    frame();
    hudT += dt;
    if (hudT > 0.25) {
      hudT = 0;
      pushHud();
    }
    raf = requestAnimationFrame(loop);
  }

  // --- input: drag tilts/rotates, wheel/pinch zooms --------------------------
  const pointers = new Map();
  let pinchDist = 0;

  function onPointerDown(e) {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
    if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e) {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (reduced) return;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist > 0) state.zoom = clampZoom(state.zoom * (d / pinchDist));
      pinchDist = d;
    } else {
      state.rot += dx * 0.005;
      state.tilt = clampTilt(state.tilt + dy * 0.003);
    }
  }
  function onPointerUp(e) {
    pointers.delete(e.pointerId);
    pinchDist = 0;
  }
  function onWheel(e) {
    if (reduced) return;
    e.preventDefault();
    state.zoom = clampZoom(state.zoom * Math.exp(-e.deltaY * 0.0012));
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
  function resetView() {
    state.tilt = -0.55;
    state.rot = 0;
    state.zoom = 1;
    frame();
    pushHud();
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('resize', onResize);

  resize();
  frame();
  pushHud();

  return {
    start,
    stop,
    resetView,
    dispose() {
      stop();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', onResize);
    },
  };
}
