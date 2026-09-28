/*
 * Aethelgard — ARGUS Observatory scene.
 * Hand-rolled canvas 2D medieval realm panorama. Zero network calls.
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
  { t: 0.0, top: "#02040c", mid: "#0a1226", bot: "#1a2438", star: 1, sun: 0, moon: 1 },
  { t: 0.2, top: "#02040c", mid: "#0a1226", bot: "#1a2438", star: 1, sun: 0, moon: 1 },
  { t: 0.25, top: "#3a3a72", mid: "#a06a8e", bot: "#ffc98a", star: 0.15, sun: 0.7, moon: 0 },
  { t: 0.35, top: "#3a8ad0", mid: "#8ac0ee", bot: "#eef7ff", star: 0, sun: 1, moon: 0 },
  { t: 0.6, top: "#3a8ad0", mid: "#8ac0ee", bot: "#eef7ff", star: 0, sun: 1, moon: 0 },
  { t: 0.7, top: "#3a3a72", mid: "#a05a7e", bot: "#ff8a6a", star: 0.15, sun: 0.7, moon: 0 },
  { t: 0.78, top: "#02040c", mid: "#0a1226", bot: "#1a2438", star: 1, sun: 0, moon: 1 },
  { t: 1.0, top: "#02040c", mid: "#0a1226", bot: "#1a2438", star: 1, sun: 0, moon: 1 },
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

// Seasons: pure data, tested.
export const SEASONS = [
  { id: "spring", name: "SPRING", hill: "#4a7f3f", tree: "#3f8a45", snow: 0, desc: "Blossom on the orchards, lambs on the lower meadows." },
  { id: "summer", name: "SUMMER", hill: "#3f7f36", tree: "#2f7a38", snow: 0, desc: "High sun over the tourney fields; the river runs low." },
  { id: "autumn", name: "AUTUMN", hill: "#7f6a36", tree: "#a05a28", snow: 0, desc: "Harvest in the outer fields; the Old Forest turns to copper." },
  { id: "winter", name: "WINTER", hill: "#7a8a96", tree: "#2a3a42", snow: 1, desc: "Snow on the walls, ice in the moat. The keep fires never go out." },
];

export function seasonAt(i) {
  return SEASONS[((i % SEASONS.length) + SEASONS.length) % SEASONS.length];
}

export function nextSeason(i) {
  return (i + 1) % SEASONS.length;
}

// ---------------- module data ----------------
export const HOTSPOTS = [
  { id: "keep", x: 800, y: 400, title: "The Keep", body: "Seat of the Aethelgard line. The great hall seats three hundred; the vault below holds the realm's charters." },
  { id: "gate", x: 800, y: 660, title: "Gatehouse", body: "Twin towers over the only bridge. The portcullis drops in nine seconds — timed every new moon." },
  { id: "west", x: 470, y: 560, title: "West Watchtower", body: "The beacon chain starts here. One fire lit means riders; two means war." },
  { id: "market", x: 1090, y: 700, title: "Market Row", body: "Forty stalls outside the walls: smiths, weavers, spice boats from the southern coast." },
  { id: "forest", x: 230, y: 620, title: "The Old Forest", body: "Older than the walls, older than the name. The rangers say the trees remember every king." },
];

export const ACCENT = "#c9a06a";

// ---------------- scene ----------------
const rng = mulberry32(0xae7);
const STARS = Array.from({ length: 140 }, () => ({ x: rng() * WORLD_W, y: rng() * 480, r: 0.4 + rng() * 1.3, p: rng() * 6.28 }));
const CLOUDS = Array.from({ length: 5 }, () => ({ x: rng() * WORLD_W, y: 140 + rng() * 200, w: 200 + rng() * 220, h: 30 + rng() * 26, v: 8 + rng() * 10 }));
const BIRDS = Array.from({ length: 7 }, (_, i) => ({ x: rng() * WORLD_W, y: 200 + rng() * 200, v: 40 + rng() * 40, p: rng() * 6.28 }));
const TREES = [];
for (let i = 0; i < 46; i++) TREES.push({ x: 40 + rng() * 420, y: 560 + rng() * 220, s: 0.7 + rng() * 0.8 });
for (let i = 0; i < 22; i++) TREES.push({ x: 1180 + rng() * 380, y: 580 + rng() * 200, s: 0.6 + rng() * 0.7 });
const TENTS = [];
for (let i = 0; i < 6; i++) TENTS.push({ x: 990 + i * 44, c: ["#a03a3a", "#3a6aa0", "#a08a3a", "#3a8a5a", "#7a3aa0", "#a05a2a"][i] });

export function createScene(canvas, opts) {
  const onHotspot = (opts && opts.onHotspot) || function () {};
  const ctx = canvas.getContext("2d");
  const reduced = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let W = 0, H = 0, dpr = 1;
  const state = { time: 0.32, season: 1, cam: defaultCamera(), selected: null, fly: false, t: 0 };

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

  function banner(x, y, z, color, wave) {
    ctx.fillStyle = "#4a3a28";
    ctx.fillRect(x - 2 * z, y - 46 * z, 4 * z, 46 * z);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + 2 * z, y - 46 * z);
    const wob = reduced ? 0 : Math.sin(wave) * 5 * z;
    ctx.lineTo(x + 34 * z, y - 38 * z + wob);
    ctx.lineTo(x + 2 * z, y - 28 * z);
    ctx.closePath();
    ctx.fill();
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
    const season = seasonAt(state.season);
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
      const syy = H * 0.68 - Math.sin(sp * Math.PI) * H * 0.5;
      ctx.fillStyle = "rgba(255,244,214," + (0.9 * sky.sun) + ")";
      ctx.beginPath();
      ctx.arc(sx, syy, 20, 0, 6.29);
      ctx.fill();
    }
    if (sky.moon > 0.02) {
      ctx.fillStyle = "rgba(225,235,255," + (0.85 * sky.moon) + ")";
      ctx.beginPath();
      ctx.arc(W * 0.78, H * 0.16, 16, 0, 6.29);
      ctx.fill();
    }

    const dark = 1 - sky.sun * 0.55;
    const z = state.cam.z;
    const hillC = mixHex(season.hill, "#0d1410", dark);
    const treeC = mixHex(season.tree, "#0a120c", dark);
    const stoneC = mixHex("#8a7f6a", "#241f16", dark);
    const stoneD = mixHex("#6a6050", "#1a1610", dark);

    // far hills
    ctx.fillStyle = mixHex("#3a4a3a", "#0a0e0a", dark);
    ctx.beginPath();
    ctx.moveTo(-50, H + 50);
    for (let i = 0; i <= 18; i++) ctx.lineTo(layerX((i / 18) * WORLD_W, 0.25), syOf(520 - 70 * Math.abs(Math.sin(i * 1.3 + 2))));
    ctx.lineTo(W + 50, H + 50);
    ctx.closePath();
    ctx.fill();

    // clouds
    ctx.save();
    for (const c of CLOUDS) {
      if (!reduced) {
        c.x += c.v * dt;
        if (c.x - c.w > WORLD_W) c.x = -c.w;
      }
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = mixHex("#ffffff", "#7a8494", dark * 0.65);
      ctx.beginPath();
      ctx.ellipse(layerX(c.x, 0.6), syOf(c.y), c.w * z * 0.5, c.h * z * 0.5, 0, 0, 6.29);
      ctx.fill();
    }
    ctx.restore();

    // meadow
    ctx.fillStyle = hillC;
    ctx.beginPath();
    ctx.moveTo(-50, H + 50);
    for (let i = 0; i <= 20; i++) ctx.lineTo(layerX((i / 20) * WORLD_W, 0.7), syOf(640 - 40 * Math.sin(i * 0.9)));
    ctx.lineTo(W + 50, H + 50);
    ctx.closePath();
    ctx.fill();
    if (season.snow) {
      ctx.fillStyle = mixHex("#eef2f6", "#9aa4ae", dark * 0.6);
      ctx.globalAlpha = 0.75;
      ctx.fillRect(0, syOf(600), W, H - syOf(600));
      ctx.globalAlpha = 1;
    }

    // Old Forest trees
    for (const t of TREES) {
      const s = w2s(t.x, t.y);
      const sc = t.s * z;
      ctx.fillStyle = treeC;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y - 70 * sc);
      ctx.lineTo(s.x - 24 * sc, s.y);
      ctx.lineTo(s.x + 24 * sc, s.y);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(s.x, s.y - 96 * sc);
      ctx.lineTo(s.x - 18 * sc, s.y - 40 * sc);
      ctx.lineTo(s.x + 18 * sc, s.y - 40 * sc);
      ctx.closePath();
      ctx.fill();
      if (season.snow) {
        ctx.fillStyle = "rgba(240,244,248,0.8)";
        ctx.beginPath();
        ctx.moveTo(s.x, s.y - 96 * sc);
        ctx.lineTo(s.x - 12 * sc, s.y - 56 * sc);
        ctx.lineTo(s.x + 12 * sc, s.y - 56 * sc);
        ctx.closePath();
        ctx.fill();
      }
    }

    // city walls with battlements
    const wallY = syOf(600);
    ctx.fillStyle = stoneC;
    for (const wx of [520, 1080]) {
      const s = w2s(wx, 600);
      ctx.fillRect(s.x - 26 * z, wallY - 130 * z, 52 * z, 130 * z);
      for (let k = 0; k < 4; k++) ctx.fillRect(s.x - 26 * z + k * 14 * z, wallY - 146 * z, 8 * z, 16 * z);
      banner(s.x, wallY - 146 * z, z, "#a03a3a", state.t * 3 + wx);
    }
    // wall spans
    const wl = w2s(546, 600), wr = w2s(1054, 600);
    ctx.fillStyle = stoneD;
    ctx.fillRect(wl.x, wallY - 96 * z, wr.x - wl.x, 96 * z);
    for (let wx = 546; wx < 1054; wx += 34) {
      const s = w2s(wx, 600);
      ctx.fillRect(s.x, wallY - 110 * z, 18 * z, 14 * z);
    }

    // gatehouse
    const gs = w2s(800, 660);
    ctx.fillStyle = stoneC;
    ctx.fillRect(gs.x - 44 * z, gs.y - 120 * z, 88 * z, 120 * z);
    for (let k = 0; k < 5; k++) ctx.fillRect(gs.x - 44 * z + k * 19 * z, gs.y - 138 * z, 11 * z, 18 * z);
    ctx.fillStyle = "#0a0806";
    ctx.beginPath();
    ctx.arc(gs.x, gs.y - 44 * z, 22 * z, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(gs.x - 22 * z, gs.y - 44 * z, 44 * z, 44 * z);
    banner(gs.x, gs.y - 138 * z, z, "#c9a06a", state.t * 3);

    // the keep
    const ks = w2s(800, 470);
    ctx.fillStyle = stoneC;
    ctx.fillRect(ks.x - 90 * z, ks.y - 170 * z, 180 * z, 170 * z);
    for (const tx of [-90, 90]) {
      ctx.fillRect(ks.x + tx * z - 26 * z, ks.y - 230 * z, 52 * z, 230 * z);
      ctx.beginPath();
      ctx.moveTo(ks.x + tx * z - 32 * z, ks.y - 230 * z);
      ctx.lineTo(ks.x + tx * z, ks.y - 280 * z);
      ctx.lineTo(ks.x + tx * z + 32 * z, ks.y - 230 * z);
      ctx.closePath();
      ctx.fillStyle = mixHex("#a03a3a", "#4a1a1a", dark);
      ctx.fill();
      ctx.fillStyle = stoneC;
    }
    // keep windows
    ctx.fillStyle = dark > 0.5 ? "#ffd76a" : "#2a2018";
    for (let wy = 0; wy < 3; wy++)
      for (let wx = -2; wx <= 2; wx++)
        ctx.fillRect(ks.x + wx * 32 * z - 6 * z, ks.y - 150 * z + wy * 44 * z, 12 * z, 20 * z);
    banner(ks.x, ks.y - 230 * z, z, "#c9a06a", state.t * 4);

    // torch glow at night (localized)
    if (dark > 0.45) {
      for (const [tx, ty] of [[474, 470], [1126, 470], [756, 620], [844, 620]]) {
        const s = w2s(tx, ty);
        const tg = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 44 * z);
        tg.addColorStop(0, "rgba(255,170,60," + (0.55 * dark) + ")");
        tg.addColorStop(1, "rgba(255,170,60,0)");
        ctx.fillStyle = tg;
        ctx.fillRect(s.x - 44 * z, s.y - 44 * z, 88 * z, 88 * z);
        ctx.fillStyle = "#ffca6a";
        ctx.beginPath();
        ctx.arc(s.x, s.y, 4 * z, 0, 6.29);
        ctx.fill();
      }
    }

    // market tents
    for (const tn of TENTS) {
      const s = w2s(tn.x, 740);
      ctx.fillStyle = tn.c;
      ctx.beginPath();
      ctx.moveTo(s.x - 26 * z, s.y);
      ctx.lineTo(s.x, s.y - 44 * z);
      ctx.lineTo(s.x + 26 * z, s.y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.beginPath();
      ctx.moveTo(s.x, s.y - 44 * z);
      ctx.lineTo(s.x + 26 * z, s.y);
      ctx.lineTo(s.x, s.y);
      ctx.closePath();
      ctx.fill();
    }

    // birds
    if (!reduced) {
      ctx.strokeStyle = mixHex("#222", "#aab", dark * 0.5);
      ctx.lineWidth = 2;
      for (const b of BIRDS) {
        b.x += b.v * dt;
        if (b.x > WORLD_W + 30) b.x = -30;
        const s = w2s(b.x, b.y + Math.sin(state.t * 2 + b.p) * 14);
        const w2 = 8 + 3 * Math.sin(state.t * 10 + b.p);
        ctx.beginPath();
        ctx.moveTo(s.x - w2, s.y);
        ctx.quadraticCurveTo(s.x, s.y - 5, s.x, s.y);
        ctx.quadraticCurveTo(s.x, s.y - 5, s.x + w2, s.y);
        ctx.stroke();
      }
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
    setSeason(i) { state.season = i; if (reduced) draw(performance.now()); },
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
