// face.js — the procedural face in the portal.
//
// The mirror's face is drawn fresh on a <canvas> from a seeded model: an
// ethereal, stylized visage (soft silhouette, closed eyes, flowing veil of
// hair, drifting motes). It deliberately does NOT attempt photorealism — it is
// procedural art, and the UI says so plainly.
//
// Split in two so the model is testable without a canvas:
//   createFaceModel(seed) -> plain data (deterministic for a given seed)
//   drawFace(ctx, model, w, h, time, materialize) -> paints one frame
//
// `materialize` 0..1 controls the emergence: the face fades in out of mist.
// `time` (seconds) drives the gentle breathing/drift animation. For
// prefers-reduced-motion, callers render once with time=0, materialize=1.

import { hashSeed, mulberry32, pick } from "./reflection-engine.js";

const TAU = Math.PI * 2;

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

const PALETTES = [
  {
    name: "moon",
    bgTop: "#0a0d1c", bgBottom: "#03040a",
    aura: ["#3d6ea8", "#6fb7ff", "#cfe9ff"],
    faceLight: "#dfeefc", faceShadow: "#5f7ba6",
    line: "rgba(230,242,255,0.85)", soft: "rgba(160,200,240,0.35)",
    hair: "rgba(190,215,245,0.28)", accent: "#ffd9a0", lip: "rgba(235,170,180,0.75)",
  },
  {
    name: "dusk",
    bgTop: "#120a1e", bgBottom: "#050308",
    aura: ["#5b3f9e", "#a07fe8", "#e8c8ff"],
    faceLight: "#ecdcf8", faceShadow: "#6f5b96",
    line: "rgba(240,228,255,0.85)", soft: "rgba(190,160,235,0.35)",
    hair: "rgba(215,190,245,0.28)", accent: "#ffc8e0", lip: "rgba(240,175,195,0.75)",
  },
  {
    name: "ember",
    bgTop: "#170e06", bgBottom: "#070402",
    aura: ["#8a5a2b", "#e8a75f", "#ffe2b8"],
    faceLight: "#f8ecd8", faceShadow: "#96765a",
    line: "rgba(255,240,220,0.85)", soft: "rgba(235,190,140,0.35)",
    hair: "rgba(245,220,185,0.28)", accent: "#cfe9ff", lip: "rgba(240,180,160,0.75)",
  },
];

// All positions are fractions of canvas width/height, so any canvas size works.
export function createFaceModel(seed) {
  const rng = mulberry32(hashSeed("mirror-face|" + (seed >>> 0)));
  const palette = pick(rng, PALETTES);

  const strands = [];
  for (let i = 0; i < 26; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    strands.push({
      side,
      // start near the crown of the head, flow outward and down
      x0: 0.5 + side * (0.05 + rng() * 0.16),
      y0: 0.14 + rng() * 0.16,
      len: 0.35 + rng() * 0.45,
      curl: (rng() - 0.5) * 0.5,
      width: 1 + rng() * 3.5,
      alpha: 0.10 + rng() * 0.25,
      drift: rng() * TAU,
    });
  }

  const motes = [];
  for (let i = 0; i < 34; i++) {
    motes.push({
      x: rng(), y: rng(),
      r: 0.6 + rng() * 2.2,
      phase: rng() * TAU,
      speed: 0.008 + rng() * 0.03,
      alpha: 0.25 + rng() * 0.55,
    });
  }

  return {
    seed: seed >>> 0,
    paletteName: palette.name,
    palette,
    head: { cx: 0.5, cy: 0.47, rx: 0.285, ry: 0.385 },
    browY: 0.40,
    eyeY: 0.445, eyeDX: 0.112, eyeW: 0.082,
    noseTopY: 0.47, noseY: 0.545,
    lipY: 0.615, lipW: 0.075,
    circletY: 0.335,
    strands,
    motes,
  };
}

function ellipsePath(ctx, cx, cy, rx, ry) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
}

export function drawFace(ctx, model, w, h, time, materialize) {
  const mat = clamp01(materialize);
  const t = time || 0;
  const P = model.palette;
  const breathe = 1 + 0.035 * Math.sin(t * 0.8);
  const shimmer = 0.5 + 0.5 * Math.sin(t * 1.3);

  const X = (f) => f * w;
  const Y = (f) => f * h;
  const S = Math.min(w, h);

  // --- backdrop -----------------------------------------------------------
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, P.bgTop);
  bg.addColorStop(1, P.bgBottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // --- aura: layered breathing glows --------------------------------------
  const hx = X(model.head.cx), hy = Y(model.head.cy);
  const auraCols = P.aura;
  for (let i = 0; i < 3; i++) {
    const r = S * (0.52 - i * 0.11) * breathe;
    const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, r);
    g.addColorStop(0, auraCols[i] + "");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = (0.16 - i * 0.04) * mat * (0.8 + 0.2 * shimmer);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.globalAlpha = 1;

  if (mat <= 0.001) return;

  // --- veil of hair (behind the face) --------------------------------------
  ctx.lineCap = "round";
  for (const s of model.strands) {
    const sway = Math.sin(t * 0.6 + s.drift) * 0.02;
    const x0 = X(s.x0), y0 = Y(s.y0);
    const x1 = x0 + s.side * X(0.10 + s.curl * 0.2) + X(sway);
    const y1 = y0 + Y(s.len * 0.55);
    const x2 = x1 + s.side * X(0.06 + s.curl * 0.3);
    const y2 = y0 + Y(s.len);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.bezierCurveTo(x1, y1 * 0.9 + y0 * 0.1, x2, y1, x2 + X(sway), y2);
    ctx.strokeStyle = P.hair;
    ctx.globalAlpha = s.alpha * mat;
    ctx.lineWidth = s.width;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // --- face silhouette ------------------------------------------------------
  const frx = X(model.head.rx), fry = Y(model.head.ry);
  const fg = ctx.createRadialGradient(
    hx - frx * 0.25, hy - fry * 0.3, S * 0.02,
    hx, hy, Math.max(frx, fry) * 1.05
  );
  fg.addColorStop(0, P.faceLight);
  fg.addColorStop(0.55, P.faceLight);
  fg.addColorStop(1, P.faceShadow);
  ctx.globalAlpha = 0.92 * mat;
  ctx.fillStyle = fg;
  ellipsePath(ctx, hx, hy, frx, fry);
  ctx.fill();
  ctx.globalAlpha = 1;

  // soft rim light
  ctx.globalAlpha = 0.5 * mat;
  ctx.strokeStyle = P.soft;
  ctx.lineWidth = Math.max(1.5, S * 0.006);
  ellipsePath(ctx, hx, hy, frx, fry);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // --- circlet --------------------------------------------------------------
  const cy = Y(model.circletY);
  ctx.globalAlpha = 0.9 * mat;
  ctx.strokeStyle = P.accent;
  ctx.lineWidth = Math.max(1.5, S * 0.005);
  ctx.beginPath();
  ctx.ellipse(hx, cy, frx * 0.92, fry * 0.32, 0, Math.PI * 1.08, Math.PI * 1.92);
  ctx.stroke();
  // circlet gem
  const gemG = ctx.createRadialGradient(hx, cy - fry * 0.28, 0, hx, cy - fry * 0.28, S * 0.03);
  gemG.addColorStop(0, "#ffffff");
  gemG.addColorStop(0.4, P.accent);
  gemG.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gemG;
  ctx.beginPath();
  ctx.arc(hx, cy - fry * 0.28, S * 0.03, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;

  // --- brows: soft arcs ------------------------------------------------------
  ctx.strokeStyle = P.line;
  ctx.globalAlpha = 0.55 * mat;
  ctx.lineWidth = Math.max(1.5, S * 0.006);
  for (const side of [-1, 1]) {
    const bx = hx + side * X(model.eyeDX);
    ctx.beginPath();
    ctx.moveTo(bx - X(model.eyeW) * 0.62, Y(model.browY) + Y(0.008));
    ctx.quadraticCurveTo(bx, Y(model.browY) - Y(0.016), bx + X(model.eyeW) * 0.62, Y(model.browY) + Y(0.006));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // --- closed eyes: gentle downward arcs + lash ticks -------------------------
  ctx.strokeStyle = P.line;
  ctx.lineWidth = Math.max(2, S * 0.008);
  for (const side of [-1, 1]) {
    const ex = hx + side * X(model.eyeDX);
    const ey = Y(model.eyeY);
    const ew = X(model.eyeW);
    ctx.globalAlpha = 0.9 * mat;
    ctx.beginPath();
    ctx.moveTo(ex - ew * 0.55, ey - Y(0.004));
    ctx.quadraticCurveTo(ex, ey + Y(0.022), ex + ew * 0.55, ey - Y(0.004));
    ctx.stroke();
    // lashes
    ctx.globalAlpha = 0.5 * mat;
    ctx.lineWidth = Math.max(1, S * 0.0035);
    for (let l = 0; l < 4; l++) {
      const lx = ex - ew * 0.4 + (l / 3) * ew * 0.8;
      const ly = ey + Y(0.004) + Math.abs(l - 1.5) * Y(-0.002) + Y(0.012) * (1 - Math.abs(l - 1.5) / 2);
      ctx.beginPath();
      ctx.moveTo(lx, ly - Y(0.006));
      ctx.lineTo(lx + side * X(0.004), ly + Y(0.008));
      ctx.stroke();
    }
    // faint glow beneath the lid
    ctx.globalAlpha = 0.25 * mat * (0.6 + 0.4 * shimmer);
    ctx.strokeStyle = P.accent;
    ctx.lineWidth = Math.max(1.5, S * 0.005);
    ctx.beginPath();
    ctx.moveTo(ex - ew * 0.5, ey + Y(0.026));
    ctx.quadraticCurveTo(ex, ey + Y(0.038), ex + ew * 0.5, ey + Y(0.026));
    ctx.stroke();
    ctx.strokeStyle = P.line;
  }
  ctx.globalAlpha = 1;

  // --- nose: one soft line ------------------------------------------------------
  ctx.globalAlpha = 0.4 * mat;
  ctx.strokeStyle = P.soft;
  ctx.lineWidth = Math.max(1.5, S * 0.005);
  ctx.beginPath();
  ctx.moveTo(hx + X(0.004), Y(model.noseTopY));
  ctx.quadraticCurveTo(hx + X(0.014), Y((model.noseTopY + model.noseY) / 2), hx - X(0.004), Y(model.noseY));
  ctx.stroke();
  ctx.globalAlpha = 1;

  // --- lips: softly parted ---------------------------------------------------------
  const ly = Y(model.lipY), lw = X(model.lipW);
  ctx.globalAlpha = 0.75 * mat;
  ctx.strokeStyle = P.lip;
  ctx.lineWidth = Math.max(2, S * 0.007);
  // upper lip (cupid's bow)
  ctx.beginPath();
  ctx.moveTo(hx - lw * 0.6, ly);
  ctx.quadraticCurveTo(hx - lw * 0.2, ly - Y(0.014), hx, ly - Y(0.004));
  ctx.quadraticCurveTo(hx + lw * 0.2, ly - Y(0.014), hx + lw * 0.6, ly);
  ctx.stroke();
  // lower lip, fuller
  ctx.beginPath();
  ctx.moveTo(hx - lw * 0.6, ly);
  ctx.quadraticCurveTo(hx, ly + Y(0.026), hx + lw * 0.6, ly);
  ctx.stroke();
  // parted glow
  const lg = ctx.createRadialGradient(hx, ly + Y(0.004), 0, hx, ly + Y(0.004), lw * 0.5);
  lg.addColorStop(0, "rgba(255,255,255,0.5)");
  lg.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalAlpha = 0.35 * mat;
  ctx.fillStyle = lg;
  ctx.fillRect(hx - lw, ly - Y(0.02), lw * 2, Y(0.05));
  ctx.globalAlpha = 1;

  // --- cheek light ------------------------------------------------------------------
  for (const side of [-1, 1]) {
    const cxp = hx + side * X(0.16), cyp = Y(0.53);
    const cg = ctx.createRadialGradient(cxp, cyp, 0, cxp, cyp, S * 0.09);
    cg.addColorStop(0, P.accent);
    cg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = 0.10 * mat;
    ctx.fillStyle = cg;
    ctx.fillRect(cxp - S * 0.1, cyp - S * 0.1, S * 0.2, S * 0.2);
  }
  ctx.globalAlpha = 1;

  // --- drifting motes -----------------------------------------------------------------
  for (const m of model.motes) {
    const my = ((m.y - t * m.speed) % 1 + 1) % 1;
    const tw = 0.5 + 0.5 * Math.sin(t * 2 + m.phase);
    ctx.globalAlpha = m.alpha * tw * mat;
    ctx.fillStyle = P.faceLight;
    ctx.beginPath();
    ctx.arc(X(m.x), Y(my), m.r, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // --- emergence mist (only while materializing) ---------------------------------------
  const k = 1 - mat;
  if (k > 0.001) {
    ctx.globalAlpha = 0.5 * k;
    ctx.strokeStyle = "rgba(220,235,255,0.5)";
    ctx.lineWidth = Math.max(2, S * 0.01);
    for (let i = 0; i < 8; i++) {
      const ang = t * 0.7 + (i / 8) * TAU;
      const rr = S * (0.30 + 0.10 * Math.sin(t * 0.9 + i));
      ctx.beginPath();
      ctx.arc(hx + Math.cos(ang) * S * 0.05, hy + Math.sin(ang) * S * 0.05, rr, ang, ang + Math.PI * 0.9);
      ctx.stroke();
    }
    const veil = ctx.createRadialGradient(hx, hy, 0, hx, hy, S * 0.55);
    veil.addColorStop(0, "rgba(10,14,26,0)");
    veil.addColorStop(1, `rgba(10,14,26,${0.75 * k})`);
    ctx.fillStyle = veil;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }

  // --- vignette --------------------------------------------------------------------------
  const vg = ctx.createRadialGradient(w / 2, h / 2, S * 0.28, w / 2, h / 2, S * 0.72);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
}
