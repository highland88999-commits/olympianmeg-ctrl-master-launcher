// Persymphony — arena registry.
// Each arena: id, name, tagline, palette, motif (for the music engine),
// and paint(ctx, w, h, t, lv, fx) where lv = {bass, mid, treble} in 0..1
// (live audio levels, or a gentle idle synthetic when silent) and
// fx = { mood } in 0..1.
// Painters are pure functions of their arguments: no Math.random, no DOM,
// no network. Deterministic for any fixed t (hash-based pseudo-random).

function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// ---- Nebula ---------------------------------------------------------------
function paintNebula(ctx, w, h, t, lv) {
  ctx.fillStyle = '#050510';
  ctx.fillRect(0, 0, w, h);
  const blobs = [
    { x: 0.3, y: 0.4, r: 0.5, c: '88,60,180' },
    { x: 0.7, y: 0.62, r: 0.45, c: '180,60,140' },
    { x: 0.52, y: 0.2, r: 0.35, c: '40,120,200' },
  ];
  const m = Math.max(w, h);
  for (let i = 0; i < blobs.length; i++) {
    const b = blobs[i];
    const x = (b.x + Math.sin(t * 0.1 * (i + 1) + i * 2) * 0.08) * w;
    const y = (b.y + Math.cos(t * 0.13 * (i + 1) + i) * 0.08) * h;
    const r = b.r * m * (0.9 + lv.bass * 0.35);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${b.c},${(0.32 + lv.mid * 0.22).toFixed(3)})`);
    g.addColorStop(1, `rgba(${b.c},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  for (let i = 0; i < 140; i++) {
    const sx = hash(i * 3 + 1) * w;
    const sy = hash(i * 3 + 2) * h;
    const tw = 0.3 + 0.7 * Math.abs(Math.sin(t * (0.5 + hash(i) * 2) + i));
    const a = tw * (0.3 + lv.treble * 0.55);
    ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
    const s = hash(i * 3 + 3) > 0.92 ? 2 : 1;
    ctx.fillRect(sx, sy, s, s);
  }
}

// ---- Digital Rain ----------------------------------------------------------
const GLYPHS = 'アイウエオカキクケコサシスセソ0123456789ABCDEF$#*+=<>';
function paintDigitalRain(ctx, w, h, t, lv) {
  ctx.fillStyle = 'rgba(2,8,2,0.28)';
  ctx.fillRect(0, 0, w, h);
  const cols = Math.max(12, Math.floor(w / 34));
  ctx.font = '15px monospace';
  ctx.textAlign = 'center';
  const speed = 130 * (0.6 + lv.mid * 1.4);
  for (let c = 0; c < cols; c++) {
    const x = ((c + 0.5) / cols) * w;
    const headY = ((t * speed + c * 137.3) % (h * 1.25)) - h * 0.12;
    for (let r = 0; r < 14; r++) {
      const y = headY - r * 17;
      if (y < -20 || y > h + 20) continue;
      const ch = GLYPHS[Math.floor(hash(c * 91.7 + r * 13.1) * GLYPHS.length)];
      const fade = 1 - r / 14;
      if (r === 0) {
        ctx.fillStyle = `rgba(220,255,230,${(0.75 + lv.treble * 0.25).toFixed(3)})`;
      } else {
        ctx.fillStyle = `rgba(40,${Math.floor(180 + lv.mid * 60)},90,${(fade * 0.85).toFixed(3)})`;
      }
      ctx.fillText(ch, x, y);
    }
  }
}

// ---- Storm Engine -----------------------------------------------------------
function paintStorm(ctx, w, h, t, lv) {
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#060a14');
  bg.addColorStop(1, '#0d1424');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  // rain streaks
  ctx.strokeStyle = 'rgba(140,170,220,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 90; i++) {
    const x = hash(i * 7.3) * w;
    const y = (hash(i * 3.1) * h + t * (500 + hash(i) * 400)) % h;
    ctx.moveTo(x, y);
    ctx.lineTo(x - 4, y + 16);
  }
  ctx.stroke();
  // lightning: fires on heavy bass or on a slow idle cycle
  const idleBolt = (t % 4.7) < 0.09;
  if (lv.bass > 0.55 || idleBolt) {
    const bx = w * (0.2 + hash(Math.floor(t * 2)) * 0.6);
    let x = bx;
    let y = 0;
    ctx.strokeStyle = 'rgba(200,230,255,0.95)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const segs = 9;
    for (let s = 0; s < segs; s++) {
      x += (hash(s * 31.7 + Math.floor(t * 3)) - 0.5) * w * 0.08;
      y += (h * 0.72) / segs;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = `rgba(190,215,255,${(0.16 + lv.bass * 0.2).toFixed(3)})`;
    ctx.fillRect(0, 0, w, h);
  }
  // low clouds
  ctx.fillStyle = 'rgba(20,28,48,0.8)';
  for (let i = 0; i < 5; i++) {
    const cx = ((hash(i * 17) * w + t * 12 * (i % 2 ? 1 : -1)) % (w * 1.2) + w * 1.2) % (w * 1.2) - w * 0.1;
    ctx.beginPath();
    ctx.arc(cx, h * (0.12 + hash(i * 5) * 0.1), w * 0.16, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ---- Burning Fractal ---------------------------------------------------------
function branch(ctx, x, y, len, ang, depth, t, lv) {
  if (depth === 0 || len < 4) return;
  const x2 = x + Math.cos(ang) * len;
  const y2 = y + Math.sin(ang) * len;
  const heat = depth / 7;
  ctx.strokeStyle = `rgba(255,${Math.floor(70 + heat * 130)},${Math.floor(25 + heat * 45)},${(0.45 + heat * 0.5).toFixed(3)})`;
  ctx.lineWidth = Math.max(1, depth * 0.9);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  const sway = Math.sin(t * 1.3 + depth * 1.7) * 0.07 * (1 + lv.mid);
  const nl = len * (0.72 + lv.bass * 0.08);
  branch(ctx, x2, y2, nl, ang - 0.42 + sway, depth - 1, t, lv);
  branch(ctx, x2, y2, nl, ang + 0.42 + sway, depth - 1, t, lv);
}

function paintFractal(ctx, w, h, t, lv) {
  ctx.fillStyle = '#0a0505';
  ctx.fillRect(0, 0, w, h);
  // ground glow
  const g = ctx.createRadialGradient(w / 2, h, 0, w / 2, h, w * 0.5);
  g.addColorStop(0, `rgba(200,60,20,${(0.25 + lv.bass * 0.25).toFixed(3)})`);
  g.addColorStop(1, 'rgba(200,60,20,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  branch(ctx, w / 2, h * 1.02, Math.min(w, h) * 0.2, -Math.PI / 2, 7, t, lv);
  // embers
  for (let i = 0; i < 30; i++) {
    const ex = hash(i * 11.3) * w;
    const ey = h - ((t * (40 + hash(i) * 80) + hash(i * 5.7) * h) % (h * 1.1));
    const a = 0.25 + lv.treble * 0.5;
    ctx.fillStyle = `rgba(255,${Math.floor(120 + hash(i * 3) * 100)},40,${a.toFixed(3)})`;
    ctx.fillRect(ex, ey, 2, 2);
  }
}

// ---- Canyon ------------------------------------------------------------------
function paintCanyon(ctx, w, h, t, lv) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#1a0f2e');
  sky.addColorStop(0.55, '#4a1f3d');
  sky.addColorStop(1, '#0d0a14');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  // sun
  const sx = w * 0.68;
  const sy = h * 0.34;
  const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, w * 0.16);
  sg.addColorStop(0, `rgba(255,200,140,${(0.85 + lv.mid * 0.15).toFixed(3)})`);
  sg.addColorStop(0.35, 'rgba(255,150,90,0.5)');
  sg.addColorStop(1, 'rgba(255,150,90,0)');
  ctx.fillStyle = sg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#ffd9a8';
  ctx.beginPath();
  ctx.arc(sx, sy, w * 0.045, 0, Math.PI * 2);
  ctx.fill();
  // parallax ridge layers
  const layers = [
    { c: '#2b1638', y: 0.58, amp: 0.035, sp: 0.05 },
    { c: '#1c0f26', y: 0.68, amp: 0.05, sp: 0.09 },
    { c: '#100a18', y: 0.8, amp: 0.06, sp: 0.14 },
  ];
  for (let L = 0; L < layers.length; L++) {
    const lay = layers[L];
    ctx.fillStyle = lay.c;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) {
      const y =
        h * lay.y +
        Math.sin(x * 0.008 + L * 2.3 + t * lay.sp) * h * lay.amp +
        Math.sin(x * 0.021 + L * 5.1) * h * lay.amp * 0.4;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
  }
}

// ---- Mega City -----------------------------------------------------------------
function paintMegaCity(ctx, w, h, t, lv) {
  ctx.fillStyle = '#04060f';
  ctx.fillRect(0, 0, w, h);
  // stars
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = `rgba(255,255,255,${(0.2 + hash(i * 3) * 0.4).toFixed(3)})`;
    ctx.fillRect(hash(i * 7.1) * w, hash(i * 3.7) * h * 0.45, 1, 1);
  }
  const n = 12;
  const bw = w / n;
  for (let i = 0; i < n; i++) {
    const bh = h * (0.28 + hash(i * 13.7) * 0.38);
    const x = i * bw;
    const y = h - bh;
    ctx.fillStyle = '#0a0f1e';
    ctx.fillRect(x + 1, y, bw - 2, bh);
    // windows
    const colsN = 4;
    const rowsN = Math.floor(bh / 22);
    for (let cxi = 0; cxi < colsN; cxi++) {
      for (let ryi = 0; ryi < rowsN; ryi++) {
        const lit = hash(i * 57.3 + cxi * 13.1 + ryi * 7.7 + Math.floor(t * 1.5) * 3.3);
        if (lit < 0.22 + lv.mid * 0.45) {
          const flick = 0.55 + 0.45 * Math.sin(t * 7 + i + cxi * 2 + ryi * 3);
          ctx.fillStyle = `rgba(255,${Math.floor(190 * flick + 40)},110,${(0.5 + lv.mid * 0.4).toFixed(3)})`;
        } else {
          ctx.fillStyle = 'rgba(30,40,70,0.5)';
        }
        ctx.fillRect(x + 5 + cxi * ((bw - 10) / colsN), y + 8 + ryi * 22, (bw - 14) / colsN, 10);
      }
    }
    // antenna beacon on some towers
    if (hash(i * 3.3) > 0.6) {
      const blink = (Math.sin(t * 3 + i * 2) > 0.4) ? 1 : 0.15;
      ctx.fillStyle = `rgba(255,80,80,${blink.toFixed(2)})`;
      ctx.fillRect(x + bw / 2 - 1, y - 8, 2, 8);
    }
  }
  // sweeping searchlight
  const lx = w * 0.5;
  const ang = Math.sin(t * 0.4) * 0.7;
  ctx.save();
  ctx.translate(lx, h);
  ctx.rotate(ang);
  const beam = ctx.createLinearGradient(0, 0, 0, -h);
  beam.addColorStop(0, `rgba(120,200,255,${(0.16 + lv.treble * 0.12).toFixed(3)})`);
  beam.addColorStop(1, 'rgba(120,200,255,0)');
  ctx.fillStyle = beam;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-w * 0.05, -h);
  ctx.lineTo(w * 0.05, -h);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ---- Neural Web -----------------------------------------------------------------
function paintNeural(ctx, w, h, t, lv) {
  ctx.fillStyle = '#04070d';
  ctx.fillRect(0, 0, w, h);
  const N = 26;
  const px = [];
  const py = [];
  for (let i = 0; i < N; i++) {
    px.push(hash(i * 9.17) * w);
    py.push(hash(i * 4.71) * h);
  }
  const linkR = Math.max(w, h) * 0.2;
  ctx.lineWidth = 1;
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const dx = px[i] - px[j];
      const dy = py[i] - py[j];
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < linkR) {
        ctx.strokeStyle = `rgba(60,140,220,${(0.22 * (1 - d / linkR)).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(px[i], py[i]);
        ctx.lineTo(px[j], py[j]);
        ctx.stroke();
      }
    }
  }
  // pulses travel along random links, speed follows the mids
  const speed = 0.25 + lv.mid * 0.9;
  for (let k = 0; k < 10; k++) {
    const a = Math.floor(hash(k * 37.7) * N);
    let b = Math.floor(hash(k * 11.3 + 5) * N);
    if (b === a) b = (b + 1) % N;
    const p = (t * speed + hash(k * 3.3)) % 1;
    const x = lerp(px[a], px[b], p);
    const y = lerp(py[a], py[b], p);
    const g = ctx.createRadialGradient(x, y, 0, x, y, 9);
    g.addColorStop(0, `rgba(140,220,255,${(0.7 + lv.treble * 0.3).toFixed(3)})`);
    g.addColorStop(1, 'rgba(140,220,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 9, y - 9, 18, 18);
  }
  // nodes breathe with the treble
  for (let i = 0; i < N; i++) {
    const r = 2.5 + lv.treble * 2.5 + Math.sin(t * 2 + i) * 0.8;
    ctx.fillStyle = 'rgba(120,200,255,0.9)';
    ctx.beginPath();
    ctx.arc(px[i], py[i], Math.max(1, r), 0, Math.PI * 2);
    ctx.fill();
  }
}

// ---- Pearl -----------------------------------------------------------------------
function paintPearl(ctx, w, h, t, lv, fx) {
  ctx.fillStyle = '#0b0d12';
  ctx.fillRect(0, 0, w, h);
  const cx = w / 2;
  const cy = h / 2;
  const maxR = Math.min(w, h) * 0.42;
  // iridescent orb
  for (let r = maxR; r > 12; r -= 13) {
    const hue = (285 + t * 8 + r * 0.5 + (fx.mood || 0.6) * 40) % 360;
    ctx.strokeStyle = `hsla(${Math.floor(hue)},70%,68%,0.28)`;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cx + Math.sin(t * 0.5 + r) * 4, cy + Math.cos(t * 0.4 + r) * 4, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = `rgba(240,235,255,${(0.5 + lv.mid * 0.3).toFixed(3)})`;
  ctx.beginPath();
  ctx.arc(cx, cy, 10 + lv.bass * 8, 0, Math.PI * 2);
  ctx.fill();
  // ripple rings on the beat
  for (let i = 0; i < 3; i++) {
    const rr = ((t * 55 + i * 90) % (maxR * 1.6)) + 14;
    const a = Math.max(0, 0.5 - rr / (maxR * 1.6) * 0.5) * (0.5 + lv.bass * 0.5);
    ctx.strokeStyle = `rgba(200,220,255,${a.toFixed(3)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.stroke();
  }
  // floating motes
  for (let i = 0; i < 40; i++) {
    const mx = (hash(i * 7.9) * w + Math.sin(t * 0.3 + i) * 20 + w) % w;
    const my = (hash(i * 3.4) * h + Math.cos(t * 0.25 + i * 2) * 20 + h) % h;
    ctx.fillStyle = `rgba(220,225,255,${(0.15 + lv.treble * 0.3).toFixed(3)})`;
    ctx.fillRect(mx, my, 2, 2);
  }
}

// ---- Singularity -------------------------------------------------------------------
function paintSingularity(ctx, w, h, t, lv) {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, w, h);
  const cx = w / 2;
  const cy = h / 2;
  const maxR = Math.min(w, h) * 0.44;
  const holeR = maxR * 0.22;
  // accretion disk particles spiral inward
  for (let i = 0; i < 220; i++) {
    const rBase = holeR + hash(i * 13.13) * (maxR - holeR);
    const fall = (t * (26 + hash(i * 7.7) * 30) + hash(i * 3.3) * (rBase - holeR)) % (rBase - holeR);
    const r = rBase - fall;
    const heat = 1 - (r - holeR) / (maxR - holeR); // 1 near the hole
    const ang = hash(i * 5.15) * Math.PI * 2 + t * (0.25 + (1 - heat) * 1.4);
    const x = cx + Math.cos(ang) * r;
    const y = cy + Math.sin(ang) * r * 0.62; // tilted disk
    const rr = Math.floor(lerp(255, 255, heat));
    const gg = Math.floor(lerp(120, 230, heat));
    const bb = Math.floor(lerp(40, 180, heat));
    ctx.fillStyle = `rgba(${rr},${gg},${bb},${(0.35 + heat * 0.45 + lv.mid * 0.15).toFixed(3)})`;
    const s = heat > 0.8 ? 2 : 1;
    ctx.fillRect(x, y, s, s);
  }
  // the hole + photon ring
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(cx, cy, holeR, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `rgba(255,240,220,${(0.75 + lv.treble * 0.25).toFixed(3)})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, holeR + 3, 0, Math.PI * 2);
  ctx.stroke();
}

export const ARENAS = [
  {
    id: 'nebula',
    name: 'Nebula',
    tagline: 'Drifting gas clouds and slow starlight.',
    palette: ['#050510', '#583cb4', '#b43c8c', '#2878c8'],
    paint: paintNebula,
    motif: { seed: 1001, root: 45, scale: 'dorian', density: 0.35, wave: 'sine', bassEvery: 8 },
  },
  {
    id: 'digital-rain',
    name: 'Digital Rain',
    tagline: 'Falling code in the green dark.',
    palette: ['#020802', '#28b45a', '#dcffe6', '#0a2a14'],
    paint: paintDigitalRain,
    motif: { seed: 1077, root: 57, scale: 'phrygian', density: 0.6, wave: 'square', bassEvery: 4 },
  },
  {
    id: 'storm-engine',
    name: 'Storm Engine',
    tagline: 'Lightning answers the bass.',
    palette: ['#060a14', '#8caadc', '#c8e6ff', '#141c30'],
    paint: paintStorm,
    motif: { seed: 1153, root: 40, scale: 'minor', density: 0.5, wave: 'sawtooth', bassEvery: 2 },
  },
  {
    id: 'burning-fractal',
    name: 'Burning Fractal',
    tagline: 'A fire-tree that grows with the beat.',
    palette: ['#0a0505', '#ff5019', '#ffb428', '#c83c14'],
    paint: paintFractal,
    motif: { seed: 1231, root: 52, scale: 'pentatonic', density: 0.55, wave: 'triangle', bassEvery: 8 },
  },
  {
    id: 'canyon',
    name: 'Canyon',
    tagline: 'Sunset ridges rolling past.',
    palette: ['#1a0f2e', '#4a1f3d', '#ffd9a8', '#100a18'],
    paint: paintCanyon,
    motif: { seed: 1307, root: 48, scale: 'major', density: 0.45, wave: 'triangle', bassEvery: 4 },
  },
  {
    id: 'mega-city',
    name: 'Mega City',
    tagline: 'A skyline that flickers with the music.',
    palette: ['#04060f', '#ffbe6e', '#78c8ff', '#0a0f1e'],
    paint: paintMegaCity,
    motif: { seed: 1381, root: 43, scale: 'minor', density: 0.65, wave: 'square', bassEvery: 4 },
  },
  {
    id: 'neural-web',
    name: 'Neural Web',
    tagline: 'Thoughts travelling as light.',
    palette: ['#04070d', '#3c8cdc', '#8cdcff', '#0a1420'],
    paint: paintNeural,
    motif: { seed: 1459, root: 55, scale: 'dorian', density: 0.5, wave: 'sine', bassEvery: 8 },
  },
  {
    id: 'pearl',
    name: 'Pearl',
    tagline: 'Quiet ripples in deep water.',
    palette: ['#0b0d12', '#b9a7e6', '#f0ebff', '#2a2438'],
    paint: paintPearl,
    motif: { seed: 1531, root: 60, scale: 'major', density: 0.3, wave: 'sine', bassEvery: 8 },
  },
  {
    id: 'singularity',
    name: 'Singularity',
    tagline: 'Everything falls inward.',
    palette: ['#000000', '#ff781e', '#ffe6b4', '#3a1c08'],
    paint: paintSingularity,
    motif: { seed: 1607, root: 38, scale: 'phrygian', density: 0.6, wave: 'sawtooth', bassEvery: 2 },
  },
];

export function getArena(id) {
  return ARENAS.find((a) => a.id === id) || ARENAS[0];
}
