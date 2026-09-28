/*
 * Mega City — ARGUS Observatory scene.
 * Hand-rolled canvas 2D cyber-metropolis panorama. Zero network calls.
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
  { t: 0.0, top: "#02030a", mid: "#0a1030", bot: "#1c2a55", star: 1, sun: 0, moon: 1 },
  { t: 0.2, top: "#02030a", mid: "#0a1030", bot: "#1c2a55", star: 1, sun: 0, moon: 1 },
  { t: 0.25, top: "#3a2a6e", mid: "#8a5a8e", bot: "#e09a7a", star: 0.15, sun: 0.7, moon: 0 },
  { t: 0.35, top: "#3a8ad0", mid: "#8ac0ee", bot: "#e8f4ff", star: 0, sun: 1, moon: 0 },
  { t: 0.6, top: "#3a8ad0", mid: "#8ac0ee", bot: "#e8f4ff", star: 0, sun: 1, moon: 0 },
  { t: 0.7, top: "#3a2a6e", mid: "#9a5a8e", bot: "#f07a5a", star: 0.15, sun: 0.7, moon: 0 },
  { t: 0.78, top: "#02030a", mid: "#0a1030", bot: "#1c2a55", star: 1, sun: 0, moon: 1 },
  { t: 1.0, top: "#02030a", mid: "#0a1030", bot: "#1c2a55", star: 1, sun: 0, moon: 1 },
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

// District registry: pure data, tested.
export const DISTRICTS = [
  { id: "harbor", name: "NEON HARBOR", color: "#00f2ff", desc: "Dockside markets under a permanent neon haze." },
  { id: "spire", name: "SPIRE DISTRICT", color: "#a259ff", desc: "The kilometer-high towers where the city plans itself." },
  { id: "bazaar", name: "DATA BAZAAR", color: "#ff3366", desc: "Open-air stalls trading bandwidth, salvage and secrets." },
  { id: "skyway", name: "SKYWAY RING", color: "#ffcc33", desc: "Elevated maglev ring circling the downtown core." },
  { id: "under", name: "FOUNDRY UNDERCITY", color: "#ff7a1f", desc: "Steam, sparks and the machines that feed the towers." },
];

export function districtById(id) {
  return DISTRICTS.find((d) => d.id === id) || null;
}

// ---------------- module data ----------------
export const HOTSPOTS = [
  { id: "harbor", x: 300, y: 600, title: "Neon Harbor", body: "Dockside markets under a permanent neon haze. Ferries run all night to the outer platforms." },
  { id: "spire", x: 800, y: 380, title: "Spire District", body: "Kilometer-high towers where the city plans itself. Observation decks open at dawn." },
  { id: "bazaar", x: 1100, y: 640, title: "Data Bazaar", body: "Open-air stalls trading bandwidth, salvage and secrets. Cash only, questions none." },
  { id: "skyway", x: 1320, y: 400, title: "Skyway Ring", body: "The elevated maglev ring circling the downtown core — a full loop takes eleven minutes." },
  { id: "under", x: 560, y: 740, title: "Foundry Undercity", body: "Steam, sparks and the machines that feed the towers. The city breathes down here." },
];

export const ACCENT = "#00f2ff";

// ---------------- scene ----------------
const rng = mulberry32(0xc17);
const STARS = Array.from({ length: 130 }, () => ({ x: rng() * WORLD_W, y: rng() * 420, r: 0.4 + rng() * 1.3, p: rng() * 6.28 }));

function buildLayer(count, baseY, minH, maxH, minW, maxW, seed) {
  const r = mulberry32(seed);
  const out = [];
  let x = -60;
  while (x < WORLD_W + 60) {
    const w = minW + r() * (maxW - minW);
    const h = minH + r() * (maxH - minH);
    out.push({ x, w, h, lit: r(), hue: r(), antenna: r() > 0.7, sign: r() > 0.78 });
    x += w + 6 + r() * 40;
  }
  return out;
}
const LAYER_FAR = buildLayer(0, 700, 160, 320, 60, 120, 11);
const LAYER_MID = buildLayer(0, 740, 220, 430, 70, 140, 22);
const LAYER_NEAR = buildLayer(0, 790, 120, 260, 90, 180, 33);

const CARS = Array.from({ length: 18 }, (_, i) => ({ x: (i / 18) * WORLD_W, lane: i % 2, v: 60 + (i % 5) * 25, c: i % 3 }));
const TRAIN = { x: 0 };

export function createScene(canvas, opts) {
  const onHotspot = (opts && opts.onHotspot) || function () {};
  const ctx = canvas.getContext("2d");
  const reduced = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let W = 0, H = 0, dpr = 1;
  const state = { time: 0.95, traffic: true, cam: defaultCamera(), selected: null, fly: false, t: 0 };

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
  function w2s(wx, wy) { return worldToScreen(wx, wy, state.cam, W, H); }

  function drawBuilding(b, baseY, factor, color, winAlpha) {
    const x = layerX(b.x, factor);
    const yBase = syOf(baseY);
    const z = state.cam.z;
    const w = b.w * z, h = b.h * z;
    ctx.fillStyle = color;
    ctx.fillRect(x, yBase - h, w, h);
    if (b.antenna) {
      ctx.fillRect(x + w / 2 - 1.5 * z, yBase - h - 26 * z, 3 * z, 26 * z);
      ctx.fillStyle = "#ff4040";
      ctx.beginPath();
      ctx.arc(x + w / 2, yBase - h - 28 * z, 3 * z, 0, 6.29);
      ctx.fill();
      ctx.fillStyle = color;
    }
    // windows: seeded grid
    const r = mulberry32((b.x * 13 + b.h * 7) | 0);
    const cols = Math.max(2, Math.floor(w / (10 * z)));
    const rows = Math.max(3, Math.floor(h / (14 * z)));
    for (let ci = 0; ci < cols; ci++) {
      for (let ri = 0; ri < rows; ri++) {
        if (r() < b.lit * winAlpha) {
          const huePick = r();
          ctx.fillStyle = huePick > 0.85 ? "#ffd76a" : huePick > 0.6 ? "#9fd4ff" : "#ffe9b8";
          ctx.globalAlpha = 0.55 + r() * 0.45;
          ctx.fillRect(x + 4 * z + ci * (w - 8 * z) / cols, yBase - h + 6 * z + ri * (h - 12 * z) / rows, (w - 8 * z) / cols * 0.55, (h - 12 * z) / rows * 0.5);
        }
      }
    }
    ctx.globalAlpha = 1;
    if (b.sign && winAlpha > 0.4) {
      const sc = ["#00f2ff", "#ff3366", "#a259ff", "#ffcc33"][(b.h | 0) % 4];
      const sg = ctx.createRadialGradient(x + w / 2, yBase - h * 0.75, 0, x + w / 2, yBase - h * 0.75, 44 * z);
      sg.addColorStop(0, sc + "cc");
      sg.addColorStop(1, sc + "00");
      ctx.fillStyle = sg;
      ctx.fillRect(x + w / 2 - 44 * z, yBase - h * 0.75 - 44 * z, 88 * z, 88 * z);
      ctx.fillStyle = sc;
      ctx.fillRect(x + w / 2 - 22 * z, yBase - h * 0.75 - 4 * z, 44 * z, 8 * z);
    }
  }

  function draw(now) {
    const dt = Math.min(0.05, (now - (draw.last || now)) / 1000);
    draw.last = now;
    if (!reduced) state.t += dt;
    if (state.fly && !reduced) {
      state.cam.x = WORLD_W / 2 + Math.sin(state.t * 0.1) * 420;
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
        ctx.globalAlpha = sky.star * (0.6 + 0.4 * Math.sin(state.t * 2 + s.p)) * 0.9;
        ctx.fillStyle = "#d8e8ff";
        ctx.fillRect(layerX(s.x, 0.15), syOf(s.y), s.r, s.r);
      }
      ctx.restore();
    }
    const sp = clamp((state.time - 0.25) / 0.5, 0, 1);
    if (sky.sun > 0.02 && sp > 0 && sp < 1) {
      const sx = W * 0.12 + sp * W * 0.76;
      const syy = H * 0.68 - Math.sin(sp * Math.PI) * H * 0.45;
      ctx.fillStyle = "rgba(255,244,214," + (0.9 * sky.sun) + ")";
      ctx.beginPath();
      ctx.arc(sx, syy, 20, 0, 6.29);
      ctx.fill();
    }
    if (sky.moon > 0.02) {
      ctx.fillStyle = "rgba(225,235,255," + (0.85 * sky.moon) + ")";
      ctx.beginPath();
      ctx.arc(W * 0.8, H * 0.16, 16, 0, 6.29);
      ctx.fill();
    }

    const dark = 1 - sky.sun * 0.55;
    const z = state.cam.z;
    const winAlpha = 0.35 + 0.65 * dark;

    // city glow on horizon (localized)
    const hg = ctx.createRadialGradient(W / 2, syOf(640), 0, W / 2, syOf(640), W * 0.5);
    hg.addColorStop(0, "rgba(0,180,220," + (0.22 * dark) + ")");
    hg.addColorStop(1, "rgba(0,180,220,0)");
    ctx.fillStyle = hg;
    ctx.fillRect(0, 0, W, H);

    for (const b of LAYER_FAR) drawBuilding(b, 700, 0.35, mixHex("#2a3350", "#0a0e1c", dark), winAlpha * 0.7);
    for (const b of LAYER_MID) drawBuilding(b, 740, 0.65, mixHex("#1c2338", "#070a14", dark), winAlpha * 0.85);
    for (const b of LAYER_NEAR) drawBuilding(b, 790, 1, mixHex("#141a2a", "#05070d", dark), winAlpha);

    // street level
    ctx.fillStyle = mixHex("#0c0f18", "#030405", dark);
    ctx.fillRect(0, syOf(790), W, H - syOf(790) + 2);
    // lane lines
    ctx.strokeStyle = "rgba(255,220,120,0.4)";
    ctx.lineWidth = 2;
    ctx.setLineDash([18 * z, 22 * z]);
    const laneY = syOf(830);
    ctx.beginPath();
    ctx.moveTo(0, laneY);
    ctx.lineTo(W, laneY);
    ctx.stroke();
    ctx.setLineDash([]);

    // traffic
    if (state.traffic && !reduced) {
      for (const c of CARS) {
        c.x += (c.lane === 0 ? c.v : -c.v) * dt;
        if (c.x > WORLD_W + 40) c.x = -40;
        if (c.x < -40) c.x = WORLD_W + 40;
        const s = w2s(c.x, 818 + c.lane * 26);
        ctx.fillStyle = c.lane === 0 ? "#ffd76a" : "#ff5a5a";
        ctx.globalAlpha = 0.95;
        ctx.fillRect(s.x - 8 * z, s.y - 2.5 * z, 16 * z, 5 * z);
      }
      ctx.globalAlpha = 1;
    }

    // skyway monorail + train
    const railY = syOf(470);
    ctx.strokeStyle = mixHex("#3a4a66", "#131a28", dark);
    ctx.lineWidth = 5 * z;
    ctx.beginPath();
    ctx.moveTo(0, railY);
    ctx.lineTo(W, railY);
    ctx.stroke();
    for (let px = 100; px < WORLD_W; px += 220) {
      const s = w2s(px, 560);
      ctx.fillRect(s.x - 3 * z, railY, 6 * z, s.y - railY);
    }
    if (!reduced) {
      TRAIN.x += 140 * dt;
      if (TRAIN.x > WORLD_W + 120) TRAIN.x = -120;
    }
    const ts = w2s(TRAIN.x, 470);
    const tg = ctx.createRadialGradient(ts.x, ts.y, 0, ts.x, ts.y, 40 * z);
    tg.addColorStop(0, "rgba(0,242,255," + (0.5 * dark + 0.15) + ")");
    tg.addColorStop(1, "rgba(0,242,255,0)");
    ctx.fillStyle = tg;
    ctx.fillRect(ts.x - 40 * z, ts.y - 40 * z, 80 * z, 80 * z);
    ctx.fillStyle = "#d8f6ff";
    ctx.fillRect(ts.x - 44 * z, ts.y - 8 * z, 88 * z, 14 * z);

    // undercity steam vents
    if (!reduced && dark > 0.4) {
      ctx.save();
      ctx.globalAlpha = 0.14;
      ctx.fillStyle = "#8a93ad";
      for (let i = 0; i < 5; i++) {
        const vx = 420 + i * 90;
        const s = w2s(vx, 740 - ((state.t * 30 + i * 60) % 120));
        ctx.beginPath();
        ctx.ellipse(s.x, s.y, 30 * z, 14 * z, 0, 0, 6.29);
        ctx.fill();
      }
      ctx.restore();
    }

    // hotspots
    for (const h of HOTSPOTS) {
      const s = w2s(h.x, h.y);
      const sel = state.selected && state.selected.id === h.id;
      const pr = reduced ? 12 : 10 + 4 * Math.sin(state.t * 4);
      ctx.beginPath();
      ctx.arc(s.x, s.y, (sel ? 16 : pr) * z * 0.9 + 4, 0, 6.29);
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
    vg.addColorStop(1, "rgba(0,0,0,0.45)");
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
    setTraffic(v) { state.traffic = !!v; if (reduced) draw(performance.now()); },
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
