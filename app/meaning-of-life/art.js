// Procedural 2D canvas art for the three movements.
// Each renderer draws one frame at time t (seconds). Glow is kept local:
// small shadowBlur values only, dark backgrounds, dim palettes.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fillBackground(ctx, W, H, top, bottom) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

/* ---------------- GENESIS: a breathing core with expanding rings ---------------- */
export function drawGenesis(ctx, W, H, t) {
  fillBackground(ctx, W, H, "#060510", "#020204");
  const cx = W / 2;
  const cy = H * 0.52;
  const breath = 0.5 + 0.5 * Math.sin(t * 0.9);
  const coreR = 14 + breath * 10;

  // core with local glow
  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 3.2);
  core.addColorStop(0, "rgba(255, 214, 140, 0.95)");
  core.addColorStop(0.35, "rgba(240, 180, 110, 0.35)");
  core.addColorStop(1, "rgba(240, 180, 110, 0)");
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(cx, cy, coreR * 3.2, 0, Math.PI * 2);
  ctx.fill();

  // expanding rings
  for (let i = 0; i < 5; i += 1) {
    const phase = (t * 0.14 + i / 5) % 1;
    const r = 20 + phase * Math.min(W, H) * 0.55;
    ctx.strokeStyle = `rgba(220, 170, 100, ${0.3 * (1 - phase)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // seed sparks drifting outward
  const rng = mulberry32(11);
  for (let i = 0; i < 60; i += 1) {
    const ang = rng() * Math.PI * 2;
    const speed = 12 + rng() * 26;
    const d = (speed * t + rng() * 300) % (Math.min(W, H) * 0.5);
    const x = cx + Math.cos(ang) * d;
    const y = cy + Math.sin(ang) * d * 0.8;
    const fade = 1 - d / (Math.min(W, H) * 0.5);
    ctx.fillStyle = `rgba(255, 220, 160, ${0.55 * fade})`;
    ctx.fillRect(x, y, 1.6, 1.6);
  }
}

/* ---------------- INTERCONNECTION: a living web of nodes ---------------- */
const WEB_NODES = (() => {
  const rng = mulberry32(4242);
  const nodes = [];
  for (let i = 0; i < 26; i += 1) {
    nodes.push({ x: rng(), y: rng(), p: rng() * Math.PI * 2 });
  }
  return nodes;
})();

export function drawInterconnection(ctx, W, H, t) {
  fillBackground(ctx, W, H, "#041014", "#020507");
  const pts = WEB_NODES.map((n) => ({
    x: n.x * W + Math.sin(t * 0.35 + n.p) * 12,
    y: n.y * H + Math.cos(t * 0.28 + n.p) * 12,
  }));

  // edges between near neighbors
  ctx.lineWidth = 1;
  for (let i = 0; i < pts.length; i += 1) {
    for (let j = i + 1; j < pts.length; j += 1) {
      const dx = pts[i].x - pts[j].x;
      const dy = pts[i].y - pts[j].y;
      const d = Math.hypot(dx, dy);
      const max = Math.min(W, H) * 0.24;
      if (d < max) {
        const a = 0.28 * (1 - d / max);
        ctx.strokeStyle = `rgba(60, 200, 215, ${a})`;
        ctx.beginPath();
        ctx.moveTo(pts[i].x, pts[i].y);
        ctx.lineTo(pts[j].x, pts[j].y);
        ctx.stroke();
        // traveling spark on some edges
        if ((i * 7 + j) % 5 === 0) {
          const k = (t * 0.25 + (i + j) * 0.13) % 1;
          ctx.fillStyle = `rgba(160, 240, 250, ${0.8 * (1 - Math.abs(k - 0.5))})`;
          ctx.beginPath();
          ctx.arc(
            pts[i].x + (pts[j].x - pts[i].x) * k,
            pts[i].y + (pts[j].y - pts[i].y) * k,
            2,
            0,
            Math.PI * 2
          );
          ctx.fill();
        }
      }
    }
  }

  // nodes
  pts.forEach((p, i) => {
    const pulse = 2.4 + Math.sin(t * 1.4 + i * 1.3) * 1.1;
    ctx.fillStyle = "rgba(140, 230, 240, 0.9)";
    ctx.shadowBlur = 8;
    ctx.shadowColor = "rgba(60, 200, 215, 0.7)";
    ctx.beginPath();
    ctx.arc(p.x, p.y, pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  });
}

/* ---------------- TRANSCENDENCE: particles rising toward a veil ---------------- */
const RISERS = (() => {
  const rng = mulberry32(777);
  return Array.from({ length: 110 }, () => ({
    x: rng(),
    speed: 0.02 + rng() * 0.06,
    offset: rng(),
    size: 0.8 + rng() * 2.2,
    wob: rng() * Math.PI * 2,
  }));
})();

export function drawTranscendence(ctx, W, H, t) {
  fillBackground(ctx, W, H, "#0b0714", "#030208");

  // horizon veil glow (localized, top of frame)
  const veil = ctx.createLinearGradient(0, 0, 0, H * 0.45);
  veil.addColorStop(0, "rgba(150, 110, 220, 0.34)");
  veil.addColorStop(1, "rgba(150, 110, 220, 0)");
  ctx.fillStyle = veil;
  ctx.fillRect(0, 0, W, H * 0.45);

  // a soft band of light at the horizon
  const hy = H * 0.18;
  const band = ctx.createRadialGradient(W / 2, hy, 0, W / 2, hy, W * 0.4);
  band.addColorStop(0, "rgba(200, 170, 255, 0.5)");
  band.addColorStop(1, "rgba(200, 170, 255, 0)");
  ctx.fillStyle = band;
  ctx.beginPath();
  ctx.ellipse(W / 2, hy, W * 0.4, H * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();

  // rising particles
  RISERS.forEach((p) => {
    const progress = (t * p.speed + p.offset) % 1;
    const y = H * 0.95 - progress * H * 0.9;
    const x = p.x * W + Math.sin(t * 0.6 + p.wob) * 14 * (1 - progress * 0.5);
    const alpha = 0.75 * Math.sin(progress * Math.PI);
    ctx.fillStyle = `rgba(190, 165, 240, ${Math.max(0, alpha)})`;
    ctx.beginPath();
    ctx.arc(x, y, p.size, 0, Math.PI * 2);
    ctx.fill();
  });

  // faint stars
  const rng = mulberry32(99);
  for (let i = 0; i < 70; i += 1) {
    const x = rng() * W;
    const y = rng() * H * 0.6;
    const tw = 0.25 + 0.25 * Math.sin(t * 1.2 + i);
    ctx.fillStyle = `rgba(220, 210, 255, ${tw})`;
    ctx.fillRect(x, y, 1.2, 1.2);
  }
}

export const ART = {
  genesis: drawGenesis,
  interconnection: drawInterconnection,
  transcendence: drawTranscendence,
};
