// Neon Racer — 2D canvas pseudo-3D renderer. No external assets.
// Neon look via layered strokes (no shadowBlur: keeps mobile GPUs happy).

import { FAR_Z, WORLD, isLightspeed, isInvulnerable } from './game.js';

const FOCAL = 60;

const COLORS = {
  bg: '#04040c',
  ship: '#00e5ff',
  shipDim: 'rgba(0,229,255,0.25)',
  asteroid: '#ff2d78',
  asteroidDim: 'rgba(255,45,120,0.22)',
  rock: '#0b0b14',
  shard: '#ffd23f',
  shardDim: 'rgba(255,210,63,0.25)',
  ring: '#ff3df0',
  ringDim: 'rgba(255,61,240,0.22)',
  bullet: '#d8fbff',
  text: '#9be9ff',
};

function makeLayer(count, depth, rng) {
  const stars = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      x: rng() * 2 - 1,
      y: rng() * 2 - 1,
      z: rng() * FAR_Z,
      depth,
    });
  }
  return stars;
}

export function createRenderer(canvas, opts = {}) {
  const reducedMotion = !!opts.reducedMotion;
  const ctx = canvas.getContext('2d');
  let w = 0;
  let h = 0;
  let unit = 40; // px per world unit at z = 0
  let cx = 0;
  let cy = 0;
  let bgGrad = null;
  let shake = 0;
  let disposed = false;

  // Deterministic starfield.
  let s = 1234567;
  const srng = () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const layers = [
    makeLayer(90, 0.35, srng),
    makeLayer(60, 0.6, srng),
    makeLayer(34, 1.0, srng),
  ];

  function resize() {
    if (disposed) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    w = Math.max(1, Math.floor(rect.width * dpr));
    h = Math.max(1, Math.floor(rect.height * dpr));
    canvas.width = w;
    canvas.height = h;
    cx = w / 2;
    cy = h / 2;
    unit = (Math.min(w, h) / 2 / 11.5) * dpr;
    bgGrad = ctx.createRadialGradient(cx, cy * 0.9, 10, cx, cy, Math.max(w, h) * 0.7);
    bgGrad.addColorStop(0, '#0a0a1c');
    bgGrad.addColorStop(0.55, '#050510');
    bgGrad.addColorStop(1, COLORS.bg);
  }

  function project(x, y, z) {
    const sc = FOCAL / Math.max(1, FOCAL + z);
    return { x: cx + x * sc * unit, y: cy - y * sc * unit, s: sc };
  }

  function neonStroke(color, dimColor, width) {
    ctx.strokeStyle = dimColor;
    ctx.lineWidth = width * 3.2;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  function drawStars(dt, warp) {
    const speedBase = reducedMotion ? 0 : 1;
    for (const layer of layers) {
      for (const st of layer) {
        st.z -= dt * (14 + layer.depth * 30) * (warp ? 6 : 1) * speedBase + dt * 2;
        if (st.z < 1) {
          st.z = FAR_Z;
          st.x = srng() * 2 - 1;
          st.y = srng() * 2 - 1;
        }
        const p = project(st.x * WORLD.x * 1.6, st.y * WORLD.y * 1.6, st.z);
        const a = 0.25 + layer.depth * 0.55;
        if (warp && !reducedMotion) {
          // Streak toward viewer.
          const p2 = project(st.x * WORLD.x * 1.6, st.y * WORLD.y * 1.6, st.z + 14);
          ctx.strokeStyle = `rgba(160,230,255,${a})`;
          ctx.lineWidth = Math.max(1, layer.depth * 2);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        } else {
          ctx.fillStyle = `rgba(200,235,255,${a})`;
          const r = Math.max(1, layer.depth * 1.8 * (w / 800));
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  function drawRing(r) {
    const p = project(r.x, r.y, r.z);
    if (p.s < 0.04) return;
    const rx = r.r * p.s * unit;
    const ry = rx * 0.46;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(r.spin * 0.15);
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    neonStroke(COLORS.ring, COLORS.ringDim, Math.max(1.5, 3 * p.s));
    // Inner ticks suggest a portal.
    ctx.strokeStyle = 'rgba(255,61,240,0.5)';
    ctx.lineWidth = Math.max(1, 1.5 * p.s);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + r.spin;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * rx * 0.82, Math.sin(a) * ry * 0.82);
      ctx.lineTo(Math.cos(a) * rx * 0.97, Math.sin(a) * ry * 0.97);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawShard(sh) {
    const p = project(sh.x, sh.y, sh.z);
    if (p.s < 0.05) return;
    const r = sh.r * p.s * unit;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(sh.spin);
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.7, 0);
    ctx.lineTo(0, r);
    ctx.lineTo(-r * 0.7, 0);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,210,63,0.16)';
    ctx.fill();
    neonStroke(COLORS.shard, COLORS.shardDim, Math.max(1.2, 2.4 * p.s));
    ctx.restore();
  }

  function drawAsteroid(a) {
    const p = project(a.x, a.y, a.z);
    if (p.s < 0.03) return;
    const R = a.r * p.s * unit;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(a.rot);
    ctx.beginPath();
    for (let i = 0; i < a.verts; i++) {
      const ang = (i / a.verts) * Math.PI * 2;
      const rr = R * a.radii[i];
      const px = Math.cos(ang) * rr;
      const py = Math.sin(ang) * rr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = COLORS.rock;
    ctx.fill();
    neonStroke(COLORS.asteroid, COLORS.asteroidDim, Math.max(1.2, 2.2 * p.s));
    // Crater detail.
    ctx.strokeStyle = 'rgba(255,45,120,0.28)';
    ctx.lineWidth = Math.max(1, 1.2 * p.s);
    ctx.beginPath();
    ctx.arc(-R * 0.25, R * 0.1, R * 0.28, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawBullet(b) {
    const p = project(b.x, b.y, b.z);
    const r = Math.max(1.5, b.r * p.s * unit);
    const p2 = project(b.x, b.y, b.z + 6);
    ctx.strokeStyle = 'rgba(216,251,255,0.55)';
    ctx.lineWidth = r;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.fillStyle = COLORS.bullet;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawShip(ship, now, invuln, warp) {
    const p = project(ship.x, ship.y, 0);
    const u = unit;
    if (invuln && !warp && Math.floor(now / 110) % 2 === 0) return; // blink
    ctx.save();
    ctx.translate(p.x, p.y);
    const tilt = (ship.tx - ship.x) * 0.06;
    ctx.rotate(tilt);
    const S = u * 0.85;
    // Engine flame.
    const flame = reducedMotion ? 0.5 : 0.45 + 0.18 * Math.sin(now / 60);
    ctx.beginPath();
    ctx.moveTo(-S * 0.28, S * 0.62);
    ctx.lineTo(0, S * (0.62 + flame));
    ctx.lineTo(S * 0.28, S * 0.62);
    ctx.closePath();
    ctx.fillStyle = warp ? 'rgba(255,61,240,0.75)' : 'rgba(255,159,28,0.7)';
    ctx.fill();
    // Hull.
    ctx.beginPath();
    ctx.moveTo(0, -S);
    ctx.lineTo(S * 0.72, S * 0.55);
    ctx.lineTo(S * 0.24, S * 0.34);
    ctx.lineTo(-S * 0.24, S * 0.34);
    ctx.lineTo(-S * 0.72, S * 0.55);
    ctx.closePath();
    ctx.fillStyle = '#0d1626';
    ctx.fill();
    neonStroke(COLORS.ship, COLORS.shipDim, Math.max(1.6, u * 0.045));
    // Cockpit.
    ctx.fillStyle = 'rgba(0,229,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(0, -S * 0.18, S * 0.13, S * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawParticles(particles) {
    for (const p of particles) {
      const pr = project(p.x, p.y, p.z);
      const t = 1 - p.age / p.life;
      if (t <= 0) continue;
      ctx.globalAlpha = t;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, Math.max(1, p.size * pr.s * unit * t), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function render(state, now, dt) {
    if (disposed || w === 0) return;
    const warp = state.phase === 'playing' && isLightspeed(state);
    ctx.save();
    if (shake > 0.2 && !reducedMotion) {
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
      shake *= 0.88;
    } else {
      shake = 0;
    }
    ctx.fillStyle = bgGrad;
    ctx.fillRect(-20, -20, w + 40, h + 40);

    drawStars(dt, warp);

    // Far-to-near painter's order.
    const drawables = [];
    for (const r of state.rings) drawables.push({ z: r.z, d: () => drawRing(r) });
    for (const s of state.shards) drawables.push({ z: s.z, d: () => drawShard(s) });
    for (const a of state.asteroids) drawables.push({ z: a.z, d: () => drawAsteroid(a) });
    for (const b of state.bullets) drawables.push({ z: b.z, d: () => drawBullet(b) });
    drawables.sort((p, q) => q.z - p.z);
    for (const it of drawables) it.d();

    drawParticles(state.particles);

    if (state.phase === 'playing' || state.phase === 'won') {
      drawShip(state.ship, now, isInvulnerable(state) && state.phase === 'playing', warp);
    }

    // Warp tint.
    if (warp && !reducedMotion) {
      const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, Math.max(w, h) * 0.6);
      g.addColorStop(0, 'rgba(255,61,240,0)');
      g.addColorStop(1, 'rgba(255,61,240,0.16)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();
  }

  function addShake(v) {
    if (!reducedMotion) shake = Math.min(14, shake + v);
  }

  function dispose() {
    disposed = true;
  }

  return { resize, render, addShake, dispose };
}
