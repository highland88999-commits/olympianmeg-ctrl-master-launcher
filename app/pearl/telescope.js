// Procedural telescope eyepiece renderer for The Pearl.
// Draws each target kind entirely from code — no images, no remote data.
import { mulberry32, hashSeed } from './stars.js';

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 8;

export function clampZoom(z) {
  if (!Number.isFinite(z)) return MIN_ZOOM;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

// Eyepiece frame: dark surround, circular field, crosshair reticle.
function drawEyepiece(ctx, w, h, t) {
  const cx = w / 2;
  const cy = h / 2;
  const R = Math.min(w, h) * 0.44;

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);

  // faint background stars
  const rng = mulberry32(1234);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  for (let i = 0; i < 120; i++) {
    const x = rng() * w;
    const y = rng() * h;
    if ((x - cx) ** 2 + (y - cy) ** 2 < R * R) {
      ctx.fillRect(x, y, 1.4, 1.4);
    }
  }

  // glass tint
  const g = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R);
  g.addColorStop(0, 'rgba(8,10,24,1)');
  g.addColorStop(0.85, 'rgba(4,6,16,1)');
  g.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();

  // reticle
  ctx.strokeStyle = 'rgba(140,180,220,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy);
  ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.25, 0, Math.PI * 2);
  ctx.stroke();

  // rim
  ctx.strokeStyle = '#1c2b45';
  ctx.lineWidth = Math.max(6, w * 0.02);
  ctx.beginPath();
  ctx.arc(cx, cy, R + ctx.lineWidth / 2, 0, Math.PI * 2);
  ctx.stroke();

  return { cx, cy, R };
}

function drawSpiral(ctx, cx, cy, R, zoom, seed, t) {
  const rng = mulberry32(seed);
  const arms = 2;
  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.35 * zoom);
  core.addColorStop(0, 'rgba(255,250,235,0.95)');
  core.addColorStop(0.4, 'rgba(220,210,190,0.45)');
  core.addColorStop(1, 'rgba(220,210,190,0)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.35 * zoom, 0, Math.PI * 2);
  ctx.fill();

  const rot = t * 0.05;
  for (let i = 0; i < 900 * zoom; i++) {
    const arm = i % arms;
    const a = rng() * Math.PI * 4 + rot + (arm * Math.PI);
    const rr = Math.pow(rng(), 0.6) * R * 0.42 * zoom;
    // logarithmic-ish spiral mapping
    const ang = a + rr * 0.012;
    const x = cx + Math.cos(ang) * rr;
    const y = cy + Math.sin(ang) * rr * 0.85;
    const b = 0.25 + rng() * 0.75;
    ctx.fillStyle = `rgba(${200 + rng() * 55 | 0},${200 + rng() * 40 | 0},${220 + rng() * 35 | 0},${b * 0.8})`;
    const s = 0.8 + rng() * 2.2;
    ctx.fillRect(x, y, s, s);
  }
}

function drawNebula(ctx, cx, cy, R, zoom, seed, t, hue) {
  const rng = mulberry32(seed);
  for (let i = 0; i < 46; i++) {
    const a = rng() * Math.PI * 2;
    const d = Math.pow(rng(), 0.7) * R * 0.38 * zoom;
    const x = cx + Math.cos(a) * d;
    const y = cy + Math.sin(a) * d * 0.8;
    const rad = (10 + rng() * 60) * zoom;
    const pulse = 0.75 + 0.25 * Math.sin(t * 0.8 + i);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `hsla(${hue + rng() * 30 - 15},70%,60%,${0.28 * pulse})`);
    g.addColorStop(1, `hsla(${hue},70%,50%,0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  // bright young cluster
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  for (let i = 0; i < 26; i++) {
    const a = rng() * Math.PI * 2;
    const d = rng() * R * 0.08 * zoom;
    ctx.fillRect(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 2, 2);
  }
}

function drawRinged(ctx, cx, cy, R, zoom, seed) {
  const rng = mulberry32(seed);
  const pr = R * 0.16 * zoom;
  // rings (behind + front)
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.35);
  ctx.scale(1, 0.32);
  const ring = ctx.createRadialGradient(0, 0, pr * 1.25, 0, 0, pr * 2.3);
  ring.addColorStop(0, 'rgba(0,0,0,0)');
  ring.addColorStop(0.25, 'rgba(210,190,160,0.85)');
  ring.addColorStop(0.5, 'rgba(160,140,120,0.35)');
  ring.addColorStop(0.7, 'rgba(220,200,170,0.7)');
  ring.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = ring;
  ctx.beginPath();
  ctx.arc(0, 0, pr * 2.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // planet disc
  const pg = ctx.createRadialGradient(cx - pr * 0.3, cy - pr * 0.3, pr * 0.1, cx, cy, pr);
  pg.addColorStop(0, '#e8d9b8');
  pg.addColorStop(0.7, '#c8a06a');
  pg.addColorStop(1, '#8f6b45');
  ctx.fillStyle = pg;
  ctx.beginPath();
  ctx.arc(cx, cy, pr, 0, Math.PI * 2);
  ctx.fill();
  void rng;
}

function drawGasGiant(ctx, cx, cy, R, zoom, seed) {
  const rng = mulberry32(seed);
  const pr = R * 0.2 * zoom;
  const bands = ['#d8b58f', '#b98a5e', '#e8d3ae', '#a5714b', '#dcc39a', '#96603c'];
  for (let i = 0; i < bands.length; i++) {
    ctx.fillStyle = bands[i];
    const y0 = cy - pr + (i * 2 * pr) / bands.length;
    ctx.fillRect(cx - pr, y0, pr * 2, (2 * pr) / bands.length + 1);
  }
  // clip to disc
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, pr, 0, Math.PI * 2);
  ctx.clip();
  const shade = ctx.createRadialGradient(cx - pr * 0.4, cy - pr * 0.4, pr * 0.2, cx, cy, pr * 1.4);
  shade.addColorStop(0, 'rgba(255,255,255,0.25)');
  shade.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = shade;
  ctx.fillRect(cx - pr, cy - pr, pr * 2, pr * 2);
  // Great Red Spot
  ctx.fillStyle = 'rgba(190,90,60,0.9)';
  ctx.beginPath();
  ctx.ellipse(cx + pr * 0.3, cy + pr * 0.35, pr * 0.28, pr * 0.16, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  void rng;
}

function drawMoon(ctx, cx, cy, R, zoom, seed) {
  const rng = mulberry32(seed);
  const pr = R * 0.22 * zoom;
  const g = ctx.createRadialGradient(cx - pr * 0.35, cy - pr * 0.35, pr * 0.2, cx, cy, pr);
  g.addColorStop(0, '#d8d8d8');
  g.addColorStop(1, '#8a8a8a');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, pr, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 40; i++) {
    const a = rng() * Math.PI * 2;
    const d = Math.sqrt(rng()) * pr * 0.85;
    const x = cx + Math.cos(a) * d;
    const y = cy + Math.sin(a) * d;
    const cr = (1 + rng() * 5) * zoom * 0.5;
    ctx.fillStyle = 'rgba(90,90,90,0.55)';
    ctx.beginPath();
    ctx.arc(x, y, cr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(200,200,200,0.35)';
    ctx.beginPath();
    ctx.arc(x - cr * 0.25, y - cr * 0.25, cr * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawRemnant(ctx, cx, cy, R, zoom, seed, t) {
  const rng = mulberry32(seed);
  // filament web
  for (let i = 0; i < 130; i++) {
    const a = rng() * Math.PI * 2;
    const r0 = rng() * R * 0.05 * zoom;
    const r1 = (0.1 + rng() * 0.3) * R * zoom;
    ctx.strokeStyle = `rgba(${200 + rng() * 55 | 0},${120 + rng() * 60 | 0},${140 + rng() * 60 | 0},${0.25 + rng() * 0.4})`;
    ctx.lineWidth = 0.8 + rng() * 1.6;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    const mid = (r0 + r1) / 2;
    ctx.quadraticCurveTo(
      cx + Math.cos(a + 0.4) * mid, cy + Math.sin(a + 0.4) * mid,
      cx + Math.cos(a + 0.7) * r1, cy + Math.sin(a + 0.7) * r1
    );
    ctx.stroke();
  }
  // pulsar blink
  const blink = 0.5 + 0.5 * Math.sin(t * 12);
  const pg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 14 * zoom);
  pg.addColorStop(0, `rgba(255,255,255,${0.4 + blink * 0.6})`);
  pg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = pg;
  ctx.beginPath();
  ctx.arc(cx, cy, 14 * zoom, 0, Math.PI * 2);
  ctx.fill();
}

// Main entry: render the eyepiece view for a target.
// ctx: 2d canvas context. t: seconds (for subtle animation).
export function drawTelescopeView(ctx, target, w, h, zoom, t) {
  const z = clampZoom(zoom);
  const { cx, cy, R } = drawEyepiece(ctx, w, h, t);
  const seed = hashSeed(target.id);

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.clip();

  switch (target.kind) {
    case 'spiral':
      drawSpiral(ctx, cx, cy, R, z, seed, t);
      break;
    case 'nebula':
      drawNebula(ctx, cx, cy, R, z, seed, t, target.id === 'eagle-nebula' ? 210 : 280);
      break;
    case 'ringed':
      drawRinged(ctx, cx, cy, R, z, seed);
      break;
    case 'gasgiant':
      drawGasGiant(ctx, cx, cy, R, z, seed);
      break;
    case 'moon':
      drawMoon(ctx, cx, cy, R, z, seed);
      break;
    case 'remnant':
      drawRemnant(ctx, cx, cy, R, z, seed, t);
      break;
    default:
      drawSpiral(ctx, cx, cy, R, z, seed, t);
  }

  ctx.restore();

  // target label inside the field
  ctx.fillStyle = 'rgba(160,200,240,0.75)';
  ctx.font = '13px "Courier New", monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`${target.catalog} · ${target.name.toUpperCase()}`, cx - R * 0.92, cy + R * 0.88);
  ctx.textAlign = 'right';
  ctx.fillText(`MAG ×${z.toFixed(1)}`, cx + R * 0.92, cy + R * 0.88);
}
