// painters.js — procedural canvas-2D texture painters for the Ice Monster module.
// Pure functions: (ctx, w, h) => void. No imports, no network, no DOM access
// beyond the ctx handed in — so they run in Node tests with a mock context.
// The scene wraps the painted canvases in THREE.CanvasTexture.
//
// They replace the original's hotlinked remote assets (the landing image, the
// floor video texture, and the monster skin image): zero network requests.

function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Cold polar night sky: deep indigo, faint aurora ribbons, sparse stars.
export function paintArcticSky(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#01020a');
  g.addColorStop(0.45, '#031224');
  g.addColorStop(0.72, '#082a44');
  g.addColorStop(0.9, '#0a3d52');
  g.addColorStop(1, '#072030');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const rand = seededRandom(90071);
  const auroras = [
    [0.2, 0.24, 0.45, '120,255,190', 0.09],
    [0.62, 0.18, 0.6, '70,210,255', 0.08],
    [0.9, 0.3, 0.35, '160,255,220', 0.06],
  ];
  for (const [ax, ay, aw, rgb, a] of auroras) {
    ctx.save();
    ctx.translate(w * ax, h * ay);
    ctx.rotate(-0.3);
    const rg = ctx.createLinearGradient(0, -h * 0.14, 0, h * 0.14);
    rg.addColorStop(0, `rgba(${rgb},0)`);
    rg.addColorStop(0.5, `rgba(${rgb},${a})`);
    rg.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = rg;
    ctx.fillRect(-w * aw, -h * 0.14, w * aw * 2, h * 0.28);
    ctx.restore();
  }

  for (let i = 0; i < 380; i++) {
    const x = rand() * w;
    const y = rand() * h * 0.7;
    const r = rand() * 1.4 + 0.3;
    const a = (0.25 + rand() * 0.75).toFixed(2);
    ctx.fillStyle = rand() > 0.75 ? `rgba(190,230,255,${a})` : `rgba(255,255,255,${a})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Glacier floor: pale blue ice with jagged pressure cracks.
export function paintGlacierIce(ctx, w, h) {
  const rand = seededRandom(55113);
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#9fd8e8');
  g.addColorStop(0.5, '#7cc4dc');
  g.addColorStop(1, '#a8e2f2');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Soft mottling.
  for (let i = 0; i < 220; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const r = 6 + rand() * 30;
    const a = (0.03 + rand() * 0.07).toFixed(3);
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, `rgba(255,255,255,${a})`);
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Jagged cracks: random-walk polylines in deep blue.
  ctx.lineWidth = 2;
  for (let i = 0; i < 26; i++) {
    let x = rand() * w;
    let y = rand() * h;
    let ang = rand() * Math.PI * 2;
    ctx.strokeStyle = `rgba(20,70,110,${(0.25 + rand() * 0.3).toFixed(2)})`;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const segs = 6 + Math.floor(rand() * 8);
    for (let s = 0; s < segs; s++) {
      ang += (rand() - 0.5) * 1.4;
      const len = 12 + rand() * 42;
      x += Math.cos(ang) * len;
      y += Math.sin(ang) * len;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

// Frost behemoth skin: slate ice with pale frost blooms and dark fissures.
export function paintBehemothSkin(ctx, w, h) {
  const rand = seededRandom(314159);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#5e7f92');
  g.addColorStop(0.55, '#47626f');
  g.addColorStop(1, '#33454f');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Frost blooms: pale cyan clusters.
  for (let i = 0; i < 160; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const r = 4 + rand() * 22;
    const a = (0.05 + rand() * 0.12).toFixed(3);
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, `rgba(190,240,255,${a})`);
    rg.addColorStop(1, 'rgba(190,240,255,0)');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Dark fissures: short angular strokes.
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 40; i++) {
    let x = rand() * w;
    let y = rand() * h;
    let ang = rand() * Math.PI * 2;
    ctx.strokeStyle = `rgba(10,25,35,${(0.2 + rand() * 0.25).toFixed(2)})`;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 4; s++) {
      ang += (rand() - 0.5) * 1.6;
      const len = 8 + rand() * 26;
      x += Math.cos(ang) * len;
      y += Math.sin(ang) * len;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

// Soft radial mist blob: sprite texture for breath particles.
export function paintMistSprite(ctx, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) / 2;
  const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  rg.addColorStop(0, 'rgba(230,250,255,0.85)');
  rg.addColorStop(0.4, 'rgba(200,240,255,0.35)');
  rg.addColorStop(1, 'rgba(200,240,255,0)');
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, w, h);
}
