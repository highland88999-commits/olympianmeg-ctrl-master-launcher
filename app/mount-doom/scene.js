/*
 * Mount Doom — ARGUS Observatory scene.
 * Photorealistic canvas-2D volcanic panorama. Zero network calls.
 *
 * Rendering strategy: every texture (basalt rock, crusty lava, smoke puffs,
 * ember glows, film grain) is procedurally generated ONCE at init from a
 * seeded RNG, then composited per frame as bounded drawImage/gradient calls —
 * photographic detail without melting phone GPUs. Emissive elements (lava,
 * embers, crater bloom) use additive 'lighter' blending; smoke uses layered
 * alpha sprites for a volumetric read.
 *
 * Pure helpers (top of file) are covered by headless tests — their
 * signatures and outputs must not change.
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
  { t: 0.0, top: "#04050d", mid: "#0b0a1e", bot: "#1a1226", star: 1, sun: 0, moon: 1 },
  { t: 0.2, top: "#04050d", mid: "#0b0a1e", bot: "#1a1226", star: 1, sun: 0, moon: 1 },
  { t: 0.25, top: "#2c2358", mid: "#8a4a6e", bot: "#ff9a5a", star: 0.15, sun: 0.7, moon: 0 },
  { t: 0.35, top: "#3f8fd6", mid: "#8fc7ef", bot: "#e8f4ff", star: 0, sun: 1, moon: 0 },
  { t: 0.6, top: "#3f8fd6", mid: "#8fc7ef", bot: "#e8f4ff", star: 0, sun: 1, moon: 0 },
  { t: 0.7, top: "#2c2358", mid: "#a04a5e", bot: "#ff6a4a", star: 0.15, sun: 0.7, moon: 0 },
  { t: 0.78, top: "#04050d", mid: "#0b0a1e", bot: "#1a1226", star: 1, sun: 0, moon: 1 },
  { t: 1.0, top: "#04050d", mid: "#0b0a1e", bot: "#1a1226", star: 1, sun: 0, moon: 1 },
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
  { id: "summit", x: 800, y: 300, title: "The Summit", body: "Orodruin's crown at 4,500 ft. The air shimmers here; the crater mouth glows even at noon." },
  { id: "crater", x: 800, y: 400, title: "Crater Forge", body: "The open vent. Molten rock wells up from the deep mantle and spills over the crater rim." },
  { id: "river", x: 1010, y: 620, title: "River of Fire", body: "A lava channel cuts down the eastern flank, feeding the ash plains below. Flow rate rises with eruption intensity." },
  { id: "ash", x: 380, y: 700, title: "Ashen Fields", body: "Grey wastes west of the cone. Fine ash falls like snow and swallows every footstep." },
  { id: "gate", x: 1260, y: 720, title: "Orodruin Gate", body: "The only safe approach: a basalt causeway winding up from the eastern plains to the forge." },
];

export const ACCENT = "#ff5a1f";

// ---------------- procedural texture foundry ----------------
// Everything below is generated once at init from a seeded RNG so the
// mountain looks identical on every load. Per-frame cost is drawImage.

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

// Tileable value noise in [0,1].
function valueNoise(rng, size, octaves) {
  const out = new Float32Array(size * size);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const cells = 4 * (1 << o);
    const grid = new Float32Array((cells + 1) * (cells + 1));
    for (let i = 0; i < grid.length; i++) grid[i] = rng();
    const step = size / cells;
    for (let y = 0; y < size; y++) {
      const gy = y / step, y0 = Math.floor(gy) % cells, fy = gy - Math.floor(gy);
      const sy = fy * fy * (3 - 2 * fy);
      for (let x = 0; x < size; x++) {
        const gx = x / step, x0 = Math.floor(gx) % cells, fx = gx - Math.floor(gx);
        const sx = fx * fx * (3 - 2 * fx);
        const a = grid[y0 * (cells + 1) + x0];
        const b = grid[y0 * (cells + 1) + x0 + 1];
        const c = grid[(y0 + 1) * (cells + 1) + x0];
        const d = grid[(y0 + 1) * (cells + 1) + x0 + 1];
        out[y * size + x] += (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy) * amp;
      }
    }
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

// Dark basalt rock face.
function buildRockTile(rng) {
  const S = 256;
  const c = makeCanvas(S, S);
  const x = c.getContext("2d");
  const n = valueNoise(rng, S, 4);
  const img = x.createImageData(S, S);
  for (let i = 0; i < S * S; i++) {
    const v = n[i];
    const ridge = Math.pow(Math.abs(v - 0.5) * 2, 0.7);
    const base = 26 + ridge * 46 + v * 22;
    img.data[i * 4] = base * 1.06;
    img.data[i * 4 + 1] = base * 0.82;
    img.data[i * 4 + 2] = base * 0.74;
    img.data[i * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  // strata bands + speckle
  x.globalAlpha = 0.16;
  for (let i = 0; i < 9; i++) {
    x.fillStyle = i % 2 ? "#000" : "#5a463c";
    const y = rng() * S;
    x.fillRect(0, y, S, 3 + rng() * 9);
  }
  x.globalAlpha = 0.5;
  for (let i = 0; i < 260; i++) {
    const g = 20 + rng() * 60;
    x.fillStyle = "rgb(" + (g | 0) + "," + ((g * 0.85) | 0) + "," + ((g * 0.8) | 0) + ")";
    x.fillRect(rng() * S, rng() * S, 1 + rng() * 2, 1 + rng() * 2);
  }
  x.globalAlpha = 1;
  return c;
}

// Crusty lava: dark plates over a bright molten base, with glowing cracks.
function buildLavaTile(rng) {
  const W2 = 256, H2 = 128;
  const c = makeCanvas(W2, H2);
  const x = c.getContext("2d");
  const g = x.createLinearGradient(0, 0, 0, H2);
  g.addColorStop(0, "#ff9a1f");
  g.addColorStop(0.45, "#e8480c");
  g.addColorStop(1, "#7a1502");
  x.fillStyle = g;
  x.fillRect(0, 0, W2, H2);
  // dark crust plates
  const n = valueNoise(rng, 128, 3);
  x.globalAlpha = 0.88;
  for (let py = 0; py < H2; py += 2) {
    for (let px = 0; px < W2; px += 2) {
      const v = n[((py >> 1) % 128) * 128 + ((px >> 1) % 128)];
      if (v > 0.52) {
        const d = 8 + (v - 0.52) * 60;
        x.fillStyle = "rgb(" + (d | 0) + "," + ((d * 0.42) | 0) + "," + ((d * 0.3) | 0) + ")";
        x.fillRect(px, py, 2, 2);
      }
    }
  }
  x.globalAlpha = 1;
  // bright cracks: random walks
  x.lineCap = "round";
  for (let i = 0; i < 16; i++) {
    let px = rng() * W2, py = rng() * H2;
    x.strokeStyle = "rgba(255,220,120,0.9)";
    x.shadowColor = "#ffb01f";
    x.shadowBlur = 8;
    x.lineWidth = 1.6 + rng() * 1.6;
    x.beginPath();
    x.moveTo(px, py);
    for (let k = 0; k < 7; k++) {
      px += (rng() - 0.5) * 46;
      py += (rng() - 0.5) * 26;
      x.lineTo(px, py);
    }
    x.stroke();
  }
  x.shadowBlur = 0;
  return c;
}

// Soft volumetric smoke puff. warm=true gets a lava-lit underbelly.
function buildSmokeSprite(rng, warm) {
  const S = 160;
  const c = makeCanvas(S, S);
  const x = c.getContext("2d");
  for (let i = 0; i < 22; i++) {
    const a = rng() * Math.PI * 2;
    const d = rng() * S * 0.26;
    const px = S / 2 + Math.cos(a) * d;
    const py = S / 2 + Math.sin(a) * d * 0.8;
    const r = S * (0.1 + rng() * 0.2);
    const gg = x.createRadialGradient(px, py, 0, px, py, r);
    gg.addColorStop(0, "rgba(255,255,255," + (0.10 + rng() * 0.10) + ")");
    gg.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = gg;
    x.beginPath();
    x.arc(px, py, r, 0, 6.29);
    x.fill();
  }
  // shape the puff: fade edges into a round sprite
  x.globalCompositeOperation = "destination-in";
  const m = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  m.addColorStop(0, "rgba(0,0,0,1)");
  m.addColorStop(0.7, "rgba(0,0,0,0.85)");
  m.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = m;
  x.fillRect(0, 0, S, S);
  x.globalCompositeOperation = "source-over";
  if (warm) {
    // lava light from below
    x.globalCompositeOperation = "source-atop";
    const w = x.createLinearGradient(0, S * 0.35, 0, S);
    w.addColorStop(0, "rgba(255,120,30,0)");
    w.addColorStop(1, "rgba(255,110,25,0.55)");
    x.fillStyle = w;
    x.fillRect(0, 0, S, S);
    x.globalCompositeOperation = "source-over";
  }
  return c;
}

// Hot ember glow dot.
function buildEmberSprite() {
  const S = 48;
  const c = makeCanvas(S, S);
  const x = c.getContext("2d");
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, "rgba(255,246,220,1)");
  g.addColorStop(0.25, "rgba(255,210,63,0.95)");
  g.addColorStop(0.55, "rgba(255,110,20,0.5)");
  g.addColorStop(1, "rgba(255,80,10,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  return c;
}

// Monochrome film grain tile.
function buildGrainTile(rng) {
  const S = 128;
  const c = makeCanvas(S, S);
  const x = c.getContext("2d");
  const img = x.createImageData(S, S);
  for (let i = 0; i < S * S; i++) {
    const v = (rng() * 255) | 0;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return c;
}

// ---------------- static world geometry (seeded) ----------------
const wrng = mulberry32(0xd00d);
const STARS = Array.from({ length: 170 }, () => ({ x: wrng() * WORLD_W, y: wrng() * 560, r: 0.4 + wrng() * 1.5, p: wrng() * 6.28 }));
const FAR_RIDGE = [];
for (let i = 0; i <= 28; i++) FAR_RIDGE.push({ x: (i / 28) * WORLD_W, y: 468 - wrng() * 150 });
const MID_RIDGE = [];
for (let i = 0; i <= 22; i++) MID_RIDGE.push({ x: (i / 22) * WORLD_W, y: 560 - wrng() * 100 });
const CLOUDS = Array.from({ length: 7 }, () => ({
  x: wrng() * WORLD_W, y: 110 + wrng() * 260,
  s: 260 + wrng() * 320, v: 5 + wrng() * 12, a: 0.10 + wrng() * 0.10,
}));
const CRACKS = [];
for (let i = 0; i < 10; i++) {
  const pts = [];
  let x = 60 + wrng() * 1480;
  let y = 730;
  pts.push([x, y]);
  for (let k = 0; k < 6; k++) { x += (wrng() - 0.5) * 200; y += 18 + wrng() * 28; pts.push([x, y]); }
  CRACKS.push(pts);
}
// Crater/cone landmarks (world coords)
const CRATER = { x: 800, y: 352 };

function conePath(x) {
  x.beginPath();
  x.moveTo(CRATER.x - 440, 770);
  x.lineTo(CRATER.x - 100, 398);
  x.lineTo(CRATER.x - 64, 346);
  x.lineTo(CRATER.x - 42, 354);
  x.lineTo(CRATER.x + 42, 354);
  x.lineTo(CRATER.x + 64, 346);
  x.lineTo(CRATER.x + 100, 398);
  x.lineTo(CRATER.x + 440, 770);
  x.closePath();
}

// Deterministic eruption flicker: layered sines read as flame noise.
function flick(t) {
  return 0.82 + 0.11 * Math.sin(t * 7.3) + 0.07 * Math.sin(t * 13.7 + 1.7);
}
// Dusk/dawn horizon burn factor for time t in [0,1).
function duskBurn(t) {
  const d = (a, b) => { const w = Math.abs(a - b) % 1; return Math.min(w, 1 - w); };
  const m = Math.min(d(t, 0.26), d(t, 0.72));
  return Math.exp(-(m * m) / (2 * 0.028 * 0.028));
}

export function createScene(canvas, opts) {
  const onHotspot = (opts && opts.onHotspot) || function () {};
  const ctx = canvas.getContext("2d");
  const reduced = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // --- one-time texture bake ---
  const trng = mulberry32(0xb16b00b5);
  const rockTile = buildRockTile(trng);
  const lavaTile = buildLavaTile(trng);
  const smokeCool = [buildSmokeSprite(trng, false), buildSmokeSprite(trng, false), buildSmokeSprite(trng, false)];
  const smokeWarm = [buildSmokeSprite(trng, true), buildSmokeSprite(trng, true)];
  const emberSprite = buildEmberSprite();
  const grainTile = buildGrainTile(trng);

  let W = 0, H = 0, dpr = 1;
  const state = {
    time: 0.72,
    intensity: 0.7,
    cam: defaultCamera(),
    selected: null,
    fly: false,
    t: 0,
  };
  const prng = mulberry32((Math.random() * 0xffffffff) >>> 0);
  const embers = [];
  const smoke = [];
  const ashFall = Array.from({ length: 70 }, () => ({
    x: prng(), y: prng(), vy: 0.02 + prng() * 0.05, sway: prng() * 6.28, r: 0.8 + prng() * 1.8,
  }));
  const bombs = [];
  let bombTimer = 1.2;

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
  function wy2sy(wy) {
    return (wy - state.cam.y) * state.cam.z + H / 2;
  }
  // Enter world-space rendering (factor-1 layers): draw in world coords.
  function worldTransform() {
    ctx.setTransform(dpr * state.cam.z, 0, 0, dpr * state.cam.z,
      dpr * (W / 2 - state.cam.x * state.cam.z), dpr * (H / 2 - state.cam.y * state.cam.z));
  }
  function screenTransform() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function spawnEmber(x, y, spread, up) {
    embers.push({
      x: x + (prng() - 0.5) * spread,
      y: y,
      px: x, py: y,
      vx: (prng() - 0.5) * 70,
      vy: -(up * (0.6 + prng() * 0.9)),
      life: 1,
      decay: 0.22 + prng() * 0.45,
      s: 5 + prng() * 11,
    });
  }

  function spawnSmoke() {
    smoke.push({
      x: CRATER.x + (prng() - 0.5) * 70,
      y: CRATER.y - 10,
      vx: 8 + prng() * 14,
      vy: -(46 + prng() * 40) * (0.5 + state.intensity * 0.8),
      life: 0,
      max: 5 + prng() * 4,
      s: 46 + prng() * 40,
      grow: 16 + prng() * 14,
      sprite: prng() < 0.5 ? 0 : 1,
    });
  }

  function drawRidge(pts, factor, baseColor, hazeColor, hazeAmt) {
    ctx.beginPath();
    ctx.moveTo(-60, H + 60);
    for (const p of pts) ctx.lineTo(layerX(p.x, factor), wy2sy(p.y));
    ctx.lineTo(W + 60, H + 60);
    ctx.closePath();
    ctx.fillStyle = mixHex(baseColor, hazeColor, hazeAmt);
    ctx.fill();
  }

  function draw(now) {
    const dt = Math.min(0.05, (now - (draw.last || now)) / 1000);
    draw.last = now;
    if (!reduced) state.t += dt;
    const t = state.t;
    const inten = state.intensity;
    const fl = reduced ? 0.86 : flick(t);

    // --- fly mode: eased cinematic drift (pauses while the user drags) ---
    if (state.fly && !reduced && !dragging) {
      const tx = WORLD_W / 2 + Math.sin(t * 0.1) * 430;
      const ty = 450 + Math.sin(t * 0.073 + 1.3) * 70;
      const tz = 1.12 + Math.sin(t * 0.05) * 0.32;
      const k = 1 - Math.exp(-dt * 1.4);
      state.cam.x += (tx - state.cam.x) * k;
      state.cam.y += (ty - state.cam.y) * k;
      state.cam.z += (tz - state.cam.z) * k;
      state.cam = clampCamera(state.cam);
    }

    const sky = skyAt(state.time);
    const nightF = sky.moon;
    const duskF = duskBurn(state.time);
    const cz = state.cam.z;

    // --- sky ---
    screenTransform();
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, sky.top);
    g.addColorStop(0.55, sky.mid);
    g.addColorStop(1, sky.bot);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // dusk/dawn horizon burn
    if (duskF > 0.03) {
      const hy = wy2sy(470);
      const bg = ctx.createLinearGradient(0, hy - H * 0.22, 0, hy + H * 0.1);
      bg.addColorStop(0, "rgba(255,120,40,0)");
      bg.addColorStop(0.65, "rgba(255,110,35," + (0.42 * duskF) + ")");
      bg.addColorStop(1, "rgba(255,70,20,0)");
      ctx.fillStyle = bg;
      ctx.fillRect(0, hy - H * 0.22, W, H * 0.32);
    }

    // stars
    if (sky.star > 0.02) {
      for (const s of STARS) {
        const tw = 0.6 + 0.4 * Math.sin(t * 2 + s.p);
        ctx.globalAlpha = sky.star * tw * 0.9;
        ctx.fillStyle = "#cfe4ff";
        ctx.fillRect(layerX(s.x, 0.15), wy2sy(s.y), s.r, s.r);
      }
      ctx.globalAlpha = 1;
    }

    // sun with atmospheric glow
    const sp = clamp((state.time - 0.25) / 0.5, 0, 1);
    if (sky.sun > 0.02 && sp > 0 && sp < 1) {
      const sx = W * 0.12 + sp * W * 0.76;
      const sy = H * 0.72 - Math.sin(sp * Math.PI) * H * 0.55;
      const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, 150);
      glow.addColorStop(0, "rgba(255,214,140," + (0.85 * sky.sun) + ")");
      glow.addColorStop(0.4, "rgba(255,180,110," + (0.28 * sky.sun) + ")");
      glow.addColorStop(1, "rgba(255,180,110,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(sx - 150, sy - 150, 300, 300);
      ctx.fillStyle = "#fff3d6";
      ctx.beginPath();
      ctx.arc(sx, sy, 20 * sky.sun + 6, 0, 6.29);
      ctx.fill();
    }
    // moon
    if (sky.moon > 0.02) {
      const mp = (state.time < 0.25 ? state.time + 1 : state.time) - 0.75;
      const mx = W * 0.7 - mp * W * 0.5;
      const my = H * 0.18;
      const mg = ctx.createRadialGradient(mx, my, 0, mx, my, 60);
      mg.addColorStop(0, "rgba(210,225,255," + (0.35 * sky.moon) + ")");
      mg.addColorStop(1, "rgba(210,225,255,0)");
      ctx.fillStyle = mg;
      ctx.fillRect(mx - 60, my - 60, 120, 120);
      ctx.fillStyle = "rgba(224,233,255," + (0.92 * sky.moon) + ")";
      ctx.beginPath();
      ctx.arc(mx, my, 17, 0, 6.29);
      ctx.fill();
    }

    const dark = 1 - sky.sun * 0.55;

    // --- ridges with aerial perspective ---
    drawRidge(FAR_RIDGE, 0.25, "#241a2e", sky.bot, 0.5);
    // volcanic sky-wash at night: faint red aura behind the cone
    if (nightF > 0.05 && inten > 0.05) {
      const csx = layerX(CRATER.x, 0.55), csy = wy2sy(420);
      const wash = ctx.createRadialGradient(csx, csy, 0, csx, csy, 420 * cz);
      wash.addColorStop(0, "rgba(255,90,20," + (0.16 * inten * nightF * fl) + ")");
      wash.addColorStop(1, "rgba(255,90,20,0)");
      ctx.fillStyle = wash;
      ctx.fillRect(csx - 420 * cz, csy - 420 * cz, 840 * cz, 840 * cz);
    }
    drawRidge(MID_RIDGE, 0.55, "#1c141f", sky.bot, 0.3);
    // horizon haze band
    const hz = ctx.createLinearGradient(0, wy2sy(430), 0, wy2sy(560));
    hz.addColorStop(0, "rgba(0,0,0,0)");
    hz.addColorStop(1, "rgba(20,12,16,0.35)");
    ctx.fillStyle = hz;
    ctx.fillRect(0, wy2sy(430), W, wy2sy(560) - wy2sy(430));

    // --- drifting ash clouds: layered smoke sprites ---
    for (const a of CLOUDS) {
      if (!reduced) {
        a.x += a.v * dt;
        if (a.x - a.s > WORLD_W) a.x = -a.s;
      }
      const sx = layerX(a.x, 0.7), sy = wy2sy(a.y);
      const s = a.s * cz;
      ctx.globalAlpha = a.a * (0.7 + 0.3 * sky.moon + 0.4 * duskF);
      ctx.drawImage(smokeCool[a.v > 9 ? 1 : 0], sx - s / 2, sy - s * 0.36, s, s * 0.72);
      ctx.drawImage(smokeCool[2], sx - s / 4, sy - s * 0.3, s * 0.7, s * 0.5);
    }
    ctx.globalAlpha = 1;

    // ================= volcano (world space) =================
    worldTransform();
    const wz = 1; // world units; screen scale already in transform

    // cone body: basalt texture clipped to silhouette
    ctx.save();
    conePath(ctx);
    ctx.clip();
    const bbX0 = CRATER.x - 460, bbY0 = 330, bbX1 = CRATER.x + 460, bbY1 = 780;
    for (let ty = bbY0; ty < bbY1; ty += 256) {
      for (let tx = bbX0; tx < bbX1; tx += 256) {
        ctx.drawImage(rockTile, tx, ty, 256, 256);
      }
    }
    // darken with altitude shading: deep base, slightly lighter mid-slope
    let shade = ctx.createLinearGradient(0, 330, 0, 780);
    shade.addColorStop(0, "rgba(0,0,0,0.42)");
    shade.addColorStop(0.45, "rgba(0,0,0,0.12)");
    shade.addColorStop(1, "rgba(0,0,0,0.5)");
    ctx.fillStyle = shade;
    ctx.fillRect(bbX0, bbY0, bbX1 - bbX0, bbY1 - bbY0);
    // daylight: warm kiss on the west slope; night: near-black east
    const slope = ctx.createLinearGradient(bbX0, 0, bbX1, 0);
    slope.addColorStop(0, "rgba(255,170,110," + (0.14 * sky.sun) + ")");
    slope.addColorStop(0.55, "rgba(0,0,0,0)");
    slope.addColorStop(1, "rgba(0,0,0," + (0.34 * (0.4 + 0.6 * dark)) + ")");
    ctx.fillStyle = slope;
    ctx.fillRect(bbX0, bbY0, bbX1 - bbX0, bbY1 - bbY0);
    // lava rim-light bleeding down from the crater
    const rim = ctx.createRadialGradient(CRATER.x, CRATER.y, 10, CRATER.x, CRATER.y, 300);
    rim.addColorStop(0, "rgba(255,130,40," + (0.6 * fl * (0.35 + 0.65 * inten)) + ")");
    rim.addColorStop(1, "rgba(255,130,40,0)");
    ctx.fillStyle = rim;
    ctx.fillRect(CRATER.x - 300, CRATER.y - 300, 600, 600);
    ctx.restore();

    // crater bloom: stacked additive glows (the photographic "blowout")
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const glowA = 0.35 + 0.65 * inten;
    let bloom = ctx.createRadialGradient(CRATER.x, CRATER.y, 0, CRATER.x, CRATER.y, 340);
    bloom.addColorStop(0, "rgba(255,96,22," + (0.34 * fl * glowA) + ")");
    bloom.addColorStop(1, "rgba(255,96,22,0)");
    ctx.fillStyle = bloom;
    ctx.fillRect(CRATER.x - 340, CRATER.y - 340, 680, 680);
    bloom = ctx.createRadialGradient(CRATER.x, CRATER.y, 0, CRATER.x, CRATER.y, 170);
    bloom.addColorStop(0, "rgba(255,140,40," + (0.5 * fl * glowA) + ")");
    bloom.addColorStop(1, "rgba(255,140,40,0)");
    ctx.fillStyle = bloom;
    ctx.fillRect(CRATER.x - 170, CRATER.y - 170, 340, 340);
    ctx.restore();

    // lava pool: scrolling crust texture + white-hot core
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(CRATER.x, CRATER.y + 2, 48, 11, 0, 0, 6.29);
    ctx.clip();
    const scroll = reduced ? 0 : (t * 26) % 256;
    for (let tx = -256; tx < 256; tx += 256) {
      ctx.drawImage(lavaTile, CRATER.x - 128 + tx + scroll - 128, CRATER.y - 62, 256, 128);
    }
    ctx.restore();
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const core = ctx.createRadialGradient(CRATER.x, CRATER.y + 2, 0, CRATER.x, CRATER.y + 2, 46);
    core.addColorStop(0, "rgba(255,244,200," + (0.85 * fl) + ")");
    core.addColorStop(0.5, "rgba(255,180,60," + (0.5 * fl) + ")");
    core.addColorStop(1, "rgba(255,120,20,0)");
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.ellipse(CRATER.x, CRATER.y + 2, 48, 11, 0, 0, 6.29);
    ctx.fill();
    ctx.restore();
    // dark crater lip
    ctx.strokeStyle = "rgba(10,4,2,0.85)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(CRATER.x, CRATER.y + 2, 50, 12, 0, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();

    // lava river: layered glowing channel down the east flank
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(CRATER.x + 58, CRATER.y + 22);
    ctx.bezierCurveTo(950, 500, 905, 640, 1012, 762);
    // wide heat spill
    ctx.strokeStyle = "rgba(255,70,12," + (0.30 * fl * glowA) + ")";
    ctx.lineWidth = 34;
    ctx.shadowColor = "#ff5a1f";
    ctx.shadowBlur = 34;
    ctx.stroke();
    // mid channel
    ctx.shadowBlur = 18;
    ctx.strokeStyle = "rgba(255,106,26," + (0.75 * fl) + ")";
    ctx.lineWidth = 13;
    ctx.stroke();
    // bright flowing core
    ctx.shadowBlur = 10;
    ctx.strokeStyle = "rgba(255,214,110," + (0.95 * fl) + ")";
    ctx.lineWidth = 4.5;
    ctx.setLineDash([30, 22]);
    ctx.lineDashOffset = reduced ? 0 : -t * 110;
    ctx.stroke();
    ctx.restore();

    // --- smoke column (volumetric, lava-lit at the base) ---
    if (!reduced) {
      const want = Math.floor(10 + inten * 26);
      if (smoke.length < want && prng() < 0.6) spawnSmoke();
      ctx.save();
      for (let i = smoke.length - 1; i >= 0; i--) {
        const p = smoke[i];
        p.life += dt;
        if (p.life >= p.max) { smoke.splice(i, 1); continue; }
        p.vy *= 1 - 0.12 * dt;
        p.x += (p.vx + Math.sin(t * 1.7 + p.life * 2) * 14) * dt;
        p.y += p.vy * dt;
        const f = p.life / p.max;
        const size = p.s + p.grow * p.life;
        const warm = f < 0.38;
        const spr = warm ? smokeWarm[p.sprite % 2] : smokeCool[(p.sprite + 1) % 3];
        ctx.globalAlpha = Math.sin(f * Math.PI) * (0.34 + 0.3 * inten) * (0.35 + 0.65 * (1 - nightF * 0.4));
        const dw = size, dh = size * 0.8;
        ctx.drawImage(spr, p.x - dw / 2, p.y - dh / 2, dw, dh);
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    } else {
      // static plume for reduced motion
      for (let i = 0; i < 8; i++) {
        const f = i / 8;
        const size = 60 + f * 110;
        ctx.globalAlpha = Math.sin(f * Math.PI) * 0.3;
        ctx.drawImage(f < 0.4 ? smokeWarm[0] : smokeCool[0],
          CRATER.x + f * 90 - size / 2, CRATER.y - 20 - f * 260 - size * 0.4, size, size * 0.8);
      }
      ctx.globalAlpha = 1;
    }

    // --- lava bombs at high intensity ---
    if (!reduced && inten > 0.55) {
      bombTimer -= dt;
      if (bombTimer <= 0) {
        bombTimer = 0.9 + prng() * 1.6;
        bombs.push({
          x: CRATER.x + (prng() - 0.5) * 40, y: CRATER.y,
          vx: (prng() - 0.5) * 300, vy: -(320 + prng() * 320),
          life: 2.4, s: 6 + prng() * 7,
        });
      }
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = bombs.length - 1; i >= 0; i--) {
        const b = bombs[i];
        b.life -= dt;
        b.vy += 520 * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.life <= 0 || b.y > 700) {
          for (let k = 0; k < 6; k++) spawnEmber(b.x, Math.min(b.y, 690), 60, 160);
          bombs.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = clamp(b.life, 0, 1);
        const s = b.s * 3;
        ctx.drawImage(emberSprite, b.x - s / 2, b.y - s / 2, s, s);
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    // --- embers: additive glow sprites with trails ---
    if (!reduced) {
      const want = Math.floor(inten * 70);
      while (embers.length < want && prng() < 0.5) spawnEmber(CRATER.x, CRATER.y - 6, 90, 190);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = embers.length - 1; i >= 0; i--) {
        const e = embers[i];
        e.px = e.x; e.py = e.y;
        e.x += e.vx * dt + Math.sin(t * 3 + e.py * 0.05) * 12 * dt;
        e.y += e.vy * dt;
        e.vy -= 26 * dt;
        e.life -= e.decay * dt;
        if (e.life <= 0 || e.y < 30) { embers.splice(i, 1); continue; }
        const a = clamp(e.life, 0, 1);
        // trail
        ctx.globalAlpha = a * 0.35;
        ctx.strokeStyle = e.life > 0.5 ? "#ffd23f" : "#ff7a1f";
        ctx.lineWidth = e.s * 0.28;
        ctx.beginPath();
        ctx.moveTo(e.px, e.py);
        ctx.lineTo(e.x, e.y);
        ctx.stroke();
        // head glow
        ctx.globalAlpha = a;
        const s = e.s * (0.7 + 0.6 * e.life);
        ctx.drawImage(emberSprite, e.x - s / 2, e.y - s / 2, s, s);
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    // --- foreground: textured rock shelf with glowing cracks ---
    ctx.save();
    ctx.beginPath();
    ctx.rect(CRATER.x - 900, 718, 1800, 200);
    ctx.clip();
    for (let ty = 700; ty < 940; ty += 256) {
      for (let tx = CRATER.x - 900; tx < CRATER.x + 900; tx += 256) {
        ctx.drawImage(rockTile, tx, ty, 256, 256);
      }
    }
    const fgShade = ctx.createLinearGradient(0, 718, 0, 920);
    fgShade.addColorStop(0, "rgba(0,0,0,0.55)");
    fgShade.addColorStop(1, "rgba(0,0,0,0.82)");
    ctx.fillStyle = fgShade;
    ctx.fillRect(CRATER.x - 900, 718, 1800, 202);
    // cracks glow brighter near the cone, flickering with the eruption
    ctx.save();
    ctx.strokeStyle = "rgba(255,96,31,0.9)";
    ctx.lineWidth = 2.2;
    ctx.shadowColor = "#ff5a1f";
    ctx.shadowBlur = 12;
    for (const c of CRACKS) {
      ctx.beginPath();
      c.forEach(([px, py], i) => {
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      });
      const nearCone = clamp(1 - Math.abs(c[0][0] - CRATER.x) / 900, 0.15, 1);
      ctx.globalAlpha = (0.3 + 0.7 * fl * glowA) * nearCone * (0.4 + 0.6 * (1 - dark * 0.5));
      ctx.stroke();
    }
    ctx.restore();
    ctx.restore();
    ctx.globalAlpha = 1;

    // ================= back to screen space =================
    screenTransform();

    // --- fine ash fall across the foreground ---
    if (!reduced) {
      ctx.fillStyle = "#9a8f88";
      for (const a of ashFall) {
        a.y += a.vy * dt;
        if (a.y > 1.02) { a.y = -0.02; a.x = prng(); }
        const sx = a.x * W + Math.sin(t * 1.3 + a.sway) * 14;
        const sy = a.y * H;
        ctx.globalAlpha = 0.28;
        ctx.beginPath();
        ctx.arc(sx, sy, a.r, 0, 6.29);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // --- hotspots: expanding halo affordances ---
    HOTSPOTS.forEach((h, idx) => {
      const s = worldToScreen(h.x, h.y, state.cam, W, H);
      const sel = state.selected && state.selected.id === h.id;
      if (!reduced) {
        for (let r = 0; r < 2; r++) {
          const ph = (t * 0.55 + idx * 0.22 + r * 0.5) % 1;
          const rr = (10 + ph * 30) * cz * 0.9 + 4;
          ctx.globalAlpha = (1 - ph) * (sel ? 0.85 : 0.5);
          ctx.strokeStyle = ACCENT;
          ctx.lineWidth = sel ? 2.5 : 1.6;
          ctx.beginPath();
          ctx.arc(s.x, s.y, rr, 0, 6.29);
          ctx.stroke();
        }
      } else {
        ctx.globalAlpha = 0.7;
        ctx.strokeStyle = ACCENT;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 16 * cz * 0.9 + 4, 0, 6.29);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = sel ? "#fff" : ACCENT;
      ctx.lineWidth = sel ? 3 : 2;
      ctx.beginPath();
      ctx.arc(s.x, s.y, (sel ? 15 : 11) * cz * 0.9 + 4, 0, 6.29);
      ctx.stroke();
      ctx.fillStyle = sel ? "#fff" : ACCENT;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 4.5, 0, 6.29);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    // --- vignette + photographic grain ---
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.5)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 0.055;
    const gox = reduced ? 0 : (t * 13) % 128;
    const goy = reduced ? 0 : (t * 7) % 128;
    for (let gy = -128; gy < H + 128; gy += 128) {
      for (let gx = -128; gx < W + 128; gx += 128) {
        ctx.drawImage(grainTile, gx + gox - 128, gy + goy - 128);
      }
    }
    ctx.globalAlpha = 1;
  }

  // ---- interaction ----
  let raf = 0;
  let dragging = false, moved = false, lx = 0, ly = 0;
  let pinchD = 0;

  function loop(now) {
    draw(now);
    raf = requestAnimationFrame(loop);
  }

  function pick(sx, sy) {
    const r = canvas.getBoundingClientRect();
    const w = screenToWorld(sx - r.left, sy - r.top, state.cam, W, H);
    return hotspotAt(HOTSPOTS, w.x, w.y, 46 / state.cam.z);
  }

  function onDown(x, y) { dragging = true; moved = false; lx = x; ly = y; }
  function onMove(x, y) {
    if (!dragging) return;
    const dx = x - lx, dy = y - ly;
    if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
    state.cam.x -= dx / state.cam.z;
    state.cam.y -= dy / state.cam.z;
    state.cam = clampCamera(state.cam);
    lx = x; ly = y;
  }
  function onUp(x, y) {
    dragging = false;
    if (!moved) {
      const h = pick(x, y);
      state.selected = h;
      onHotspot(h);
    }
  }

  canvas.addEventListener("pointerdown", (e) => { canvas.setPointerCapture(e.pointerId); onDown(e.clientX, e.clientY); });
  canvas.addEventListener("pointermove", (e) => onMove(e.clientX, e.clientY));
  canvas.addEventListener("pointerup", (e) => onUp(e.clientX, e.clientY));
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
    setIntensity(v) { state.intensity = clamp(v, 0, 1); if (reduced) draw(performance.now()); },
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
