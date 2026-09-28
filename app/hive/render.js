// render.js — 2D canvas renderer for the Hive module.
// Restrained glow only: solid strokes, small shadowBlur on lit cells.
// No external assets, no network.

import { hexToPixel, pixelToHex, hexKey, MODES } from './hive';

const BG = '#020608';
const EDGE_DIM = 'rgba(0, 180, 220, 0.28)';
const EDGE_BRIGHT = 'rgba(0, 240, 255, 0.95)';
const FILL_DIM = '#07141c';
const STREAM_COLOR = 'rgba(255, 122, 26, 0.9)';
const DRONE_COLOR = 'rgba(0, 240, 255, 0.9)';

function hexCorners(cx, cy, size) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    pts.push([cx + size * Math.cos(a), cy + size * Math.sin(a)]);
  }
  return pts;
}

function pathHex(ctx, cx, cy, size) {
  const pts = hexCorners(cx, cy, size);
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < 6; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

export function createHiveRenderer(canvas, hive, options = {}) {
  const ctx = canvas.getContext('2d');
  const reducedMotion = !!options.reducedMotion;
  const onEvent = typeof options.onEvent === 'function' ? options.onEvent : null;
  let raf = 0;
  let running = false;
  let w = 0;
  let h = 0;
  let dpr = 1;
  let size = 20; // hex size in css px
  let ox = 0;    // grid origin (css px)
  let oy = 0;
  let streams = []; // { aKey, bKey, t, speed }
  let drones = [];  // { angle, radius, speed, size }
  let rings = [];   // tap ripple visuals { x, y, born }
  let awakenWave = 0; // timestamp of last awaken wave, 0 = none
  const rnd = mulberry32(1337);

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    w = Math.max(1, rect.width);
    h = Math.max(1, rect.height);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Fit the hex grid: grid spans roughly (2*radius+1) hex widths.
    const span = (hive.radius * 2 + 1) * Math.sqrt(3);
    size = Math.min(w / span, h / (span * 0.95)) * 0.92;
    ox = w / 2;
    oy = h / 2;
    seedActors();
  }

  function seedActors() {
    streams = [];
    drones = [];
    const keys = [...hive.cells.keys()];
    const n = MODES[hive.mode].streamCount;
    for (let i = 0; i < n; i++) {
      const a = keys[Math.floor(rnd() * keys.length)];
      streams.push({ aKey: a, bKey: null, t: rnd(), speed: 0.25 + rnd() * 0.5 });
    }
    const dn = MODES[hive.mode].droneCount;
    const orbitR = size * (hive.radius + 1.6) * 1.02;
    for (let i = 0; i < dn; i++) {
      drones.push({
        angle: (i / dn) * Math.PI * 2,
        radius: orbitR * (0.92 + rnd() * 0.16),
        speed: (0.25 + rnd() * 0.3) * (rnd() < 0.5 ? 1 : -1),
        size: 2 + rnd() * 2.5,
      });
    }
  }

  function cellCenter(key) {
    const cell = hive.cells.get(key);
    if (!cell) return null;
    const p = hexToPixel(cell.q, cell.r, size);
    return { x: ox + p.x, y: oy + p.y };
  }

  function drawBackground() {
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, w, h);
    // Faint radial core glow behind the grid.
    const g = ctx.createRadialGradient(ox, oy, 0, ox, oy, size * hive.radius * 1.4);
    g.addColorStop(0, 'rgba(0, 120, 160, 0.10)');
    g.addColorStop(1, 'rgba(0, 120, 160, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  function drawCells(now) {
    const breathe = reducedMotion ? 0 : Math.sin(now / 1400) * 0.5 + 0.5;
    for (const cell of hive.cells.values()) {
      const p = hexToPixel(cell.q, cell.r, size);
      const cx = ox + p.x;
      const cy = oy + p.y;
      const e = Math.min(1, cell.energy);
      pathHex(ctx, cx, cy, size * 0.94);
      const fillMix = e;
      ctx.fillStyle = fillMix > 0.01
        ? `rgb(${7 + fillMix * 20}, ${20 + fillMix * 90}, ${28 + fillMix * 110})`
        : FILL_DIM;
      ctx.fill();
      if (e > 0.03 && !reducedMotion) {
        ctx.shadowColor = 'rgba(0, 230, 255, 0.8)';
        ctx.shadowBlur = 6 + e * 10; // restrained glow, lit cells only
      } else {
        ctx.shadowBlur = 0;
      }
      ctx.strokeStyle = e > 0.03 ? EDGE_BRIGHT : EDGE_DIM;
      ctx.lineWidth = e > 0.03 ? 1.6 : 1;
      ctx.stroke();
      ctx.shadowBlur = 0;
      // Ambient breathing shimmer on edges (skipped for reduced motion).
      if (!reducedMotion && e <= 0.03 && breathe > 0.985) {
        ctx.strokeStyle = 'rgba(0, 200, 240, 0.5)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }

  function drawStreams(dt) {
    if (streams.length === 0) return;
    const keys = [...hive.cells.keys()];
    for (const s of streams) {
      // Pick a destination neighbor on arrival.
      if (!s.bKey || s.t >= 1) {
        const a = hive.cells.get(s.aKey);
        if (!a) { s.aKey = keys[Math.floor(rnd() * keys.length)]; continue; }
        const nbs = [];
        // neighbor keys via logic directions
        const dirs = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
        for (const [dq, dr] of dirs) {
          const k = hexKey(a.q + dq, a.r + dr);
          if (hive.cells.has(k)) nbs.push(k);
        }
        if (nbs.length === 0) continue;
        s.aKey = s.bKey || s.aKey;
        s.bKey = nbs[Math.floor(rnd() * nbs.length)];
        s.t = 0;
      }
      const A = cellCenter(s.aKey);
      const B = cellCenter(s.bKey);
      if (!A || !B) { s.t = 1; continue; }
      s.t = Math.min(1, s.t + dt * s.speed);
      const x = A.x + (B.x - A.x) * s.t;
      const y = A.y + (B.y - A.y) * s.t;
      ctx.fillStyle = STREAM_COLOR;
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, Math.PI * 2);
      ctx.fill();
      // Light the destination cell slightly as the packet arrives.
      if (s.t > 0.85) {
        const cell = hive.cells.get(s.bKey);
        if (cell) cell.energy = Math.min(1, cell.energy + dt * 1.2);
      }
    }
  }

  function drawDrones(now, dt) {
    if (drones.length === 0) return;
    for (const d of drones) {
      if (!reducedMotion) d.angle += d.speed * dt;
      const x = ox + Math.cos(d.angle) * d.radius;
      const y = oy + Math.sin(d.angle) * d.radius * 0.82;
      ctx.fillStyle = DRONE_COLOR;
      ctx.shadowColor = 'rgba(0, 230, 255, 0.7)';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(x, y, d.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  function drawRings(now) {
    rings = rings.filter((r) => now - r.born < 700);
    for (const r of rings) {
      const t = (now - r.born) / 700;
      ctx.strokeStyle = `rgba(0, 230, 255, ${0.7 * (1 - t)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(r.x, r.y, size * (0.4 + t * 1.6), 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawAwakenWave(now) {
    if (!awakenWave) return;
    const t = (now - awakenWave) / 1600;
    if (t >= 1) { awakenWave = 0; return; }
    const maxR = Math.max(w, h) * 0.75;
    ctx.strokeStyle = `rgba(255, 150, 60, ${0.8 * (1 - t)})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(ox, oy, maxR * t, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = `rgba(0, 230, 255, ${0.5 * (1 - t)})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(ox, oy, maxR * t * 0.85, 0, Math.PI * 2);
    ctx.stroke();
  }

  function draw(now, dt) {
    drawBackground();
    drawCells(now);
    drawStreams(reducedMotion ? 0 : dt);
    drawDrones(now, reducedMotion ? 0 : dt);
    drawRings(now);
    drawAwakenWave(now);
  }

  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - (frame._last || now)) / 1000);
    frame._last = now;
    const events = hive.step(now);
    for (const e of events) {
      if (e.type === 'awaken' && !reducedMotion) awakenWave = now;
      if (onEvent) onEvent(e);
    }
    draw(now, dt);
    raf = requestAnimationFrame(frame);
  }

  return {
    resize,
    // Convert a CSS-pixel point to a hex key, or null.
    pick(x, y) {
      const [q, r] = pixelToHex(x - ox, y - oy, size);
      const key = hexKey(q, r);
      return hive.cells.has(key) ? key : null;
    },
    tap(x, y, now) {
      const key = this.pick(x, y);
      if (!key) return false;
      hive.energize(key, now);
      const c = cellCenter(key);
      if (c && !reducedMotion) rings.push({ x: c.x, y: c.y, born: now });
      else drawStatic();
      return true;
    },
    setMode(mode) {
      hive.setMode(mode);
      seedActors();
      if (reducedMotion) drawStatic();
    },
    start() {
      if (running) return;
      running = true;
      frame._last = 0;
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
    drawStatic() {
      const now = performance.now();
      const events = hive.step(now);
      if (onEvent) for (const e of events) onEvent(e);
      draw(now, 0);
    },
    get meter() {
      return hive.meter;
    },
  };
}
