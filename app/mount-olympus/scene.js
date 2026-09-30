/*
 * Mount Olympus — ARGUS Observatory scene.
 * Hand-rolled canvas 2D alpine panorama. Zero network calls.
 * Pure helpers (top of file) are covered by headless tests.
 */

// ---------------- pure core ----------------
export const WORLD_W = 1600;
export const WORLD_H = 900;

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r, g, b) {
  const p = (v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0");
  return "#" + p(r) + p(g) + p(b);
}

export function mixHex(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t));
}

export function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let z = Math.imul(s ^ (s >>> 15), 1 | s);
    z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) ^ z;
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

const SKY_KEYS = [
  { t: 0.0, top: "#03040c", mid: "#0a0f24", bot: "#182238", star: 1, sun: 0, moon: 1 },
  { t: 0.2, top: "#03040c", mid: "#0a0f24", bot: "#182238", star: 1, sun: 0, moon: 1 },
  { t: 0.25, top: "#31437a", mid: "#a06a8e", bot: "#ffc98a", star: 0.15, sun: 0.7, moon: 0 },
  { t: 0.35, top: "#2f7fd0", mid: "#7fc0ee", bot: "#eef7ff", star: 0, sun: 1, moon: 0 },
  { t: 0.6, top: "#2f7fd0", mid: "#7fc0ee", bot: "#eef7ff", star: 0, sun: 1, moon: 0 },
  { t: 0.7, top: "#31437a", mid: "#b0607e", bot: "#ff8a6a", star: 0.15, sun: 0.7, moon: 0 },
  { t: 0.78, top: "#03040c", mid: "#0a0f24", bot: "#182238", star: 1, sun: 0, moon: 1 },
  { t: 1.0, top: "#03040c", mid: "#0a0f24", bot: "#182238", star: 1, sun: 0, moon: 1 },
];

export function skyAt(t) {
  t = ((t % 1) + 1) % 1;
  let i = 0;
  while (i < SKY_KEYS.length - 2 && t >= SKY_KEYS[i + 1].t) i++;
  const A = SKY_KEYS[i];
  const B = SKY_KEYS[i + 1];
  const f = clamp((t - A.t) / (B.t - A.t || 1), 0, 1);
  const s = f * f * (3 - 2 * f);
  return {
    top: mixHex(A.top, B.top, s),
    mid: mixHex(A.mid, B.mid, s),
    bot: mixHex(A.bot, B.bot, s),
    star: lerp(A.star, B.star, s),
    sun: lerp(A.sun, B.sun, s),
    moon: lerp(A.moon, B.moon, s),
  };
}

export function timeLabel(t) {
  const h = Math.floor((((t % 1) + 1) % 1) * 24);
  if (h >= 5 && h < 8) return "DAWN";
  if (h >= 8 && h < 17) return "DAY";
  if (h >= 17 && h < 20) return "DUSK";
  return "NIGHT";
}

export function timeString(t) {
  const mins = Math.floor((((t % 1) + 1) % 1) * 24 * 60);
  return String(Math.floor(mins / 60)).padStart(2, "0") + ":" + String(mins % 60).padStart(2, "0");
}

export function defaultCamera() {
  return { x: WORLD_W / 2, y: WORLD_H / 2, z: 1 };
}

export function clampCamera(cam) {
  const z = clamp(cam.z, 0.6, 3);
  const hx = 700 / z;
  const hy = 520 / z;
  return {
    x: clamp(cam.x, WORLD_W / 2 - hx, WORLD_W / 2 + hx),
    y: clamp(cam.y, WORLD_H / 2 - hy, WORLD_H / 2 + hy),
    z,
  };
}

export function worldToScreen(wx, wy, cam, W, H) {
  return { x: (wx - cam.x) * cam.z + W / 2, y: (wy - cam.y) * cam.z + H / 2 };
}

export function screenToWorld(sx, sy, cam, W, H) {
  return { x: (sx - W / 2) / cam.z + cam.x, y: (sy - H / 2) / cam.z + cam.y };
}

export function hotspotAt(list, wx, wy, r) {
  const rr = r == null ? 40 : r;
  for (const h of list) {
    const dx = h.x - wx;
    const dy = h.y - wy;
    if (dx * dx + dy * dy <= rr * rr) return h;
  }
  return null;
}

// ---------------- module data ----------------
export const HOTSPOTS = [
  { id: "mytikas", x: 800, y: 268, title: "Mytikas — 2,918 m", body: "The highest summit of Olympus and of Greece. The gods' proverbial seat above the clouds." },
  { id: "throne", x: 660, y: 430, title: "Throne of Zeus", body: "A wind-carved rock throne on the high shoulder. Storms gather here first and leave last." },
  { id: "skolio", x: 1160, y: 392, title: "Skolio Ridge", body: "The long knife-edge ridge east of Mytikas, walked by shepherds for three thousand years." },
  { id: "temple", x: 1090, y: 600, title: "Temple of Apollo", body: "A marble sanctuary on the lower slopes, aligned so dawn strikes the altar on the solstice." },
  { id: "spring", x: 420, y: 668, title: "Muses' Spring", body: "Cold water rising from the rock. Travellers drink here before the long ascent." },
];

export const ACCENT = "#ffd700";

// ---------------- scene ----------------
const rng = mulberry32(0x0114);
const STARS = Array.from({ length: 150 }, () => ({ x: rng() * WORLD_W, y: rng() * 540, r: 0.4 + rng() * 1.4, p: rng() * 6.28 }));
const FAR = [];
for (let i = 0; i <= 26; i++) FAR.push({ x: (i / 26) * WORLD_W, y: 430 - rng() * 150 });
const MID = [];
for (let i = 0; i <= 22; i++) MID.push({ x: (i / 22) * WORLD_W, y: 540 - rng() * 110 });
const CLOUDS = Array.from({ length: 6 }, () => ({ x: rng() * WORLD_W, y: 180 + rng() * 220, w: 220 + rng() * 260, h: 34 + rng() * 30, v: 8 + rng() * 12 }));
const PINES = [];
for (let i = 0; i < 60; i++) PINES.push({ x: rng() * WORLD_W, y: 730 + rng() * 140, s: 0.7 + rng() * 0.9 });

function snowPeak(ctx, px, py, halfW, snowH, dark) {
  ctx.fillStyle = mixHex("#fdfdff", "#b9c6dd", dark * 0.7);
  ctx.beginPath();
  ctx.moveTo(px - halfW, py + snowH);
  ctx.lineTo(px, py);
  ctx.lineTo(px + halfW, py + snowH);
  ctx.closePath();
  ctx.fill();
}

export function createScene(canvas, opts) {
  const onHotspot = (opts && opts.onHotspot) || function () {};
  const ctx = canvas.getContext("2d");
  const reduced = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let W = 0, H = 0, dpr = 1;
  const state = { time: 0.3, snowfall: 0.4, cam: defaultCamera(), selected: null, fly: false, t: 0 };
  const flakes = [];
  let flakeSeed = 777;

  function resize() {
    dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    const r = canvas.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener("resize", resize);

  function layerX(wx, factor) {
    const cx = WORLD_W / 2 + (state.cam.x - WORLD_W / 2) * factor;
    return (wx - cx) * state.cam.z + W / 2;
  }
  function syOf(wy) { return (wy - state.cam.y) * state.cam.z + H / 2; }

  function spawnFlake() {
    const r = mulberry32((flakeSeed = (flakeSeed * 1103515245 + 12345) & 0x7fffffff));
    flakes.push({ x: r() * WORLD_W, y: -20, vy: 30 + r() * 70, vx: -20 + r() * 40, r: 1 + r() * 2.4, p: r() * 6.28 });
  }

  function drawRidge(pts, factor, color) {
    ctx.beginPath();
    ctx.moveTo(-50, H + 50);
    for (const p of pts) ctx.lineTo(layerX(p.x, factor), syOf(p.y));
    ctx.lineTo(W + 50, H + 50);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  function drawTemple(wx, wy, s) {
    const x = layerX(wx, 1), y = syOf(wy), z = state.cam.z * s;
    ctx.fillStyle = "#e8dcc0";
    // steps
    ctx.fillRect(x - 70 * z, y, 140 * z, 10 * z);
    ctx.fillRect(x - 60 * z, y - 10 * z, 120 * z, 10 * z);
    // columns
    for (let i = 0; i < 6; i++) {
      const cx = x - 50 * z + i * 20 * z;
      ctx.fillRect(cx - 3 * z, y - 62 * z, 6 * z, 52 * z);
    }
    // architrave + pediment
    ctx.fillRect(x - 62 * z, y - 72 * z, 124 * z, 10 * z);
    ctx.beginPath();
    ctx.moveTo(x - 66 * z, y - 72 * z);
    ctx.lineTo(x, y - 104 * z);
    ctx.lineTo(x + 66 * z, y - 72 * z);
    ctx.closePath();
    ctx.fill();
  }

  function draw(now) {
    const dt = Math.min(0.05, (now - (draw.last || now)) / 1000);
    draw.last = now;
    if (!reduced) state.t += dt;
    if (state.fly && !reduced) {
      state.cam.x = WORLD_W / 2 + Math.sin(state.t * 0.1) * 400;
      state.cam.z = 1.05 + Math.sin(state.t * 0.06) * 0.3;
      state.cam = clampCamera(state.cam);
    }

    const sky = skyAt(state.time);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, sky.top);
    g.addColorStop(0.55, sky.mid);
    g.addColorStop(1, sky.bot);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    if (sky.star > 0.02) {
      ctx.save();
      for (const s of STARS) {
        const tw = 0.6 + 0.4 * Math.sin(state.t * 2 + s.p);
        ctx.globalAlpha = sky.star * tw * 0.9;
        ctx.fillStyle = "#d8e8ff";
        ctx.fillRect(layerX(s.x, 0.15), syOf(s.y), s.r, s.r);
      }
      ctx.restore();
    }

    const sp = clamp((state.time - 0.25) / 0.5, 0, 1);
    if (sky.sun > 0.02 && sp > 0 && sp < 1) {
      const sx = W * 0.12 + sp * W * 0.76;
      const syy = H * 0.7 - Math.sin(sp * Math.PI) * H * 0.5;
      const glow = ctx.createRadialGradient(sx, syy, 0, sx, syy, 80);
      glow.addColorStop(0, "rgba(255,236,190," + (0.9 * sky.sun) + ")");
      glow.addColorStop(1, "rgba(255,236,190,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(sx - 80, syy - 80, 160, 160);
      ctx.fillStyle = "#fff6e0";
      ctx.beginPath();
      ctx.arc(sx, syy, 20, 0, 6.29);
      ctx.fill();
    }
    if (sky.moon > 0.02) {
      ctx.fillStyle = "rgba(225,235,255," + (0.9 * sky.moon) + ")";
      ctx.beginPath();
      ctx.arc(W * 0.78, H * 0.18, 17, 0, 6.29);
      ctx.fill();
    }

    const dark = 1 - sky.sun * 0.55;

    // ridges
    drawRidge(FAR, 0.25, mixHex("#7d8ba8", "#131a2b", dark));
    drawRidge(MID, 0.55, mixHex("#5d6a88", "#0d1220", dark));

    // clouds between peaks
    ctx.save();
    for (const c of CLOUDS) {
      if (!reduced) {
        c.x += c.v * dt;
        if (c.x - c.w > WORLD_W) c.x = -c.w;
      }
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = mixHex("#ffffff", "#8a93ad", dark * 0.6);
      ctx.beginPath();
      ctx.ellipse(layerX(c.x, 0.7), syOf(c.y), c.w * state.cam.z * 0.5, c.h * state.cam.z * 0.5, 0, 0, 6.29);
      ctx.fill();
    }
    ctx.restore();

    // main massif: Mytikas
    const z = state.cam.z;
    const mx = layerX(800, 1);
    ctx.beginPath();
    ctx.moveTo(mx - 330 * z, syOf(760));
    ctx.lineTo(mx - 120 * z, syOf(480));
    ctx.lineTo(mx - 30 * z, syOf(280));
    ctx.lineTo(mx + 20 * z, syOf(250));
    ctx.lineTo(mx + 110 * z, syOf(430));
    ctx.lineTo(mx + 330 * z, syOf(760));
    ctx.closePath();
    ctx.fillStyle = mixHex("#4c586f", "#141a28", dark);
    ctx.fill();
    snowPeak(ctx, mx, syOf(250), 105 * z, 150 * z, dark);
    snowPeak(ctx, layerX(660, 1), syOf(400), 70 * z, 90 * z, dark);
    // gold glint on summit at dawn/dusk (localized)
    if (sky.sun > 0.3 && sky.sun < 0.95) {
      const gg = ctx.createRadialGradient(mx, syOf(250), 0, mx, syOf(250), 70 * z);
      gg.addColorStop(0, "rgba(255,215,120," + (0.5 * sky.sun) + ")");
      gg.addColorStop(1, "rgba(255,215,120,0)");
      ctx.fillStyle = gg;
      ctx.fillRect(mx - 70 * z, syOf(250) - 70 * z, 140 * z, 140 * z);
    }

    // temple on the shoulder
    drawTemple(1090, 640, 1);

    // spring glade
    const spx = layerX(420, 1), spy = syOf(700);
    ctx.fillStyle = mixHex("#3f7f5a", "#12271a", dark);
    ctx.beginPath();
    ctx.ellipse(spx, spy, 120 * z, 30 * z, 0, 0, 6.29);
    ctx.fill();
    ctx.fillStyle = mixHex("#9fd4ff", "#2a4a66", dark);
    ctx.beginPath();
    ctx.ellipse(spx, spy - 6 * z, 46 * z, 10 * z, 0, 0, 6.29);
    ctx.fill();

    // foreground pines
    ctx.fillStyle = mixHex("#1d3a28", "#060d08", dark);
    for (const p of PINES) {
      const px = layerX(p.x, 1), py = syOf(p.y), s = p.s * z;
      ctx.beginPath();
      ctx.moveTo(px, py - 64 * s);
      ctx.lineTo(px - 20 * s, py);
      ctx.lineTo(px + 20 * s, py);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(px - 3 * s, py, 6 * s, 12 * s);
    }
    ctx.fillStyle = mixHex("#101a12", "#040805", dark);
    ctx.fillRect(0, syOf(830), W, H - syOf(830) + 2);

    // snowfall
    if (!reduced && state.snowfall > 0.01) {
      const want = Math.floor(state.snowfall * 220);
      while (flakes.length < want) spawnFlake();
      ctx.fillStyle = "#ffffff";
      for (let i = flakes.length - 1; i >= 0; i--) {
        const f = flakes[i];
        f.y += f.vy * dt; f.x += (f.vx + Math.sin(state.t * 2 + f.p) * 20) * dt;
        if (f.y > WORLD_H + 20) { flakes.splice(i, 1); continue; }
        const s = worldToScreen(f.x, f.y, state.cam, W, H);
        ctx.globalAlpha = 0.75;
        ctx.beginPath();
        ctx.arc(s.x, s.y, f.r, 0, 6.29);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      while (flakes.length > want) flakes.pop();
    }

    // hotspots
    for (const h of HOTSPOTS) {
      const s = worldToScreen(h.x, h.y, state.cam, W, H);
      const sel = state.selected && state.selected.id === h.id;
      const pr = reduced ? 12 : 10 + 4 * Math.sin(state.t * 4);
      ctx.beginPath();
      ctx.arc(s.x, s.y, (sel ? 16 : pr) * state.cam.z * 0.9 + 4, 0, 6.29);
      ctx.strokeStyle = ACCENT;
      ctx.globalAlpha = sel ? 1 : 0.75;
      ctx.lineWidth = sel ? 3 : 2;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = sel ? "#fff" : ACCENT;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 4.5, 0, 6.29);
      ctx.fill();
    }

    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.4)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }

  let raf = 0, dragging = false, moved = false, lx = 0, ly = 0, pinchD = 0;

  function loop(now) { draw(now); raf = requestAnimationFrame(loop); }

  function pick(sx, sy) {
    const r = canvas.getBoundingClientRect();
    const w = screenToWorld(sx - r.left, sy - r.top, state.cam, W, H);
    return hotspotAt(HOTSPOTS, w.x, w.y, 46 / state.cam.z);
  }

  canvas.addEventListener("pointerdown", (e) => { canvas.setPointerCapture(e.pointerId); dragging = true; moved = false; lx = e.clientX; ly = e.clientY; });
  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - lx, dy = e.clientY - ly;
    if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
    state.cam.x -= dx / state.cam.z;
    state.cam.y -= dy / state.cam.z;
    state.cam = clampCamera(state.cam);
    lx = e.clientX; ly = e.clientY;
  });
  canvas.addEventListener("pointerup", (e) => {
    dragging = false;
    if (!moved) {
      const h = pick(e.clientX, e.clientY);
      state.selected = h;
      onHotspot(h);
    }
  });
  canvas.addEventListener("pointercancel", () => { dragging = false; });
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    state.cam.z = clamp(state.cam.z * (e.deltaY < 0 ? 1.12 : 0.89), 0.6, 3);
    state.cam = clampCamera(state.cam);
  }, { passive: false });
  canvas.addEventListener("touchmove", (e) => {
    if (e.touches.length === 2) {
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      if (pinchD > 0) state.cam.z = clamp(state.cam.z * (d / pinchD), 0.6, 3);
      pinchD = d;
    }
  }, { passive: true });
  canvas.addEventListener("touchend", () => { pinchD = 0; });

  const api = {
    setTime(t) { state.time = t; if (reduced) draw(performance.now()); },
    setSnowfall(v) { state.snowfall = clamp(v, 0, 1); if (reduced) draw(performance.now()); },
    setFly(v) { state.fly = !!v && !reduced; },
    focus(h) {
      state.cam.x = h.x; state.cam.y = h.y - 60;
      state.cam.z = Math.max(state.cam.z, 1.5);
      state.cam = clampCamera(state.cam);
      state.selected = h;
    },
    clearSelection() { state.selected = null; },
    render() { draw(performance.now()); },
    destroy() { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); },
  };

  if (reduced) draw(performance.now());
  else loop(performance.now());
  return api;
}
