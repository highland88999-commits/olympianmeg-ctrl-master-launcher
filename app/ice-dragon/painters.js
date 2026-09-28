// painters.js — procedural canvas-2D texture painters for the Ice Dragon module.
// Pure functions: (ctx, w, h) => void. No imports, no network, no DOM access
// beyond the ctx handed in — so they run in Node tests with a mock context.
// The scene wraps the painted canvases in THREE.CanvasTexture.
//
// They replace the original's hotlinked remote assets (the landing image,
// floor video texture, and dragon skin image): zero network requests.

function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Cold polar sky: deep blue night, aurora bands, stars.
export function paintArcticSky(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#02040c');
  g.addColorStop(0.45, '#041a2e');
  g.addColorStop(0.72, '#0a3350');
  g.addColorStop(0.88, '#0d4a63');
  g.addColorStop(1, '#08222e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Aurora bands: soft diagonal ribbons of green/teal.
  const rand = seededRandom(11027);
  const auroras = [
    [0.15, 0.28, 0.5, '0,255,180', 0.10],
    [0.55, 0.2, 0.65, '80,220,255', 0.09],
    [0.85, 0.34, 0.4, '140,255,200', 0.07],
  ];
  for (const [ax, ay, aw, rgb, a] of auroras) {
    ctx.save();
    ctx.translate(w * ax, h * ay);
    ctx.rotate(-0.35);
    const rg = ctx.createLinearGradient(0, -h * 0.16, 0, h * 0.16);
    rg.addColorStop(0, `rgba(${rgb},0)`);
    rg.addColorStop(0.5, `rgba(${rgb},${a})`);
    rg.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = rg;
    ctx.fillRect(-w * aw, -h * 0.16, w * aw * 2, h * 0.32);
    ctx.restore();
  }

  // Stars, denser toward the top.
  for (let i = 0; i < 420; i++) {
    const x = rand() * w;
    const y = rand() * h * 0.72;
    const r = rand() * 1.5 + 0.3;
    const a = (0.25 + rand() * 0.75).toFixed(2);
    const tint = rand();
    ctx.fillStyle =
      tint > 0.8 ? `rgba(200,235,255,${a})` : `rgba(255,255,255,${a})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Moon: small pale disc with a soft halo.
  const mx = w * 0.78;
  const my = h * 0.2;
  const mr = w * 0.035;
  const halo = ctx.createRadialGradient(mx, my, mr, mx, my, mr * 4);
  halo.addColorStop(0, 'rgba(220,240,255,0.35)');
  halo.addColorStop(1, 'rgba(220,240,255,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(mx - mr * 4, my - mr * 4, mr * 8, mr * 8);
  ctx.fillStyle = '#e8f4ff';
  ctx.beginPath();
  ctx.arc(mx, my, mr, 0, Math.PI * 2);
  ctx.fill();
}

// Glacier floor: pale blue ice with cracks and sparkles.
export function paintIce(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#0a2e44');
  g.addColorStop(0.5, '#0d4262');
  g.addColorStop(1, '#0a2e44');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const rand = seededRandom(31337);

  // Frozen pressure ridges: lighter streaks.
  for (let i = 0; i < 90; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const len = 30 + rand() * 130;
    const ang = rand() * Math.PI;
    const a = (0.04 + rand() * 0.1).toFixed(2);
    ctx.strokeStyle = `rgba(180,230,255,${a})`;
    ctx.lineWidth = 1 + rand() * 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    ctx.stroke();
  }

  // Cracks: darker branching lines.
  for (let i = 0; i < 26; i++) {
    let x = rand() * w;
    let y = rand() * h;
    let ang = rand() * Math.PI * 2;
    ctx.strokeStyle = `rgba(6,20,32,${(0.35 + rand() * 0.3).toFixed(2)})`;
    ctx.lineWidth = 1 + rand() * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 7; s++) {
      ang += (rand() - 0.5) * 1.2;
      const len = 12 + rand() * 40;
      x += Math.cos(ang) * len;
      y += Math.sin(ang) * len;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Sparkles in the ice.
  for (let i = 0; i < 260; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const r = rand() * 1.8 + 0.4;
    ctx.fillStyle = `rgba(230,250,255,${(0.3 + rand() * 0.6).toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Dragon skin: pale crystalline scales on deep ice blue.
export function paintScales(ctx, w, h) {
  ctx.fillStyle = '#0b3a55';
  ctx.fillRect(0, 0, w, h);

  const rand = seededRandom(2718);
  const rows = 14;
  const cols = 22;
  const cw = w / cols;
  const ch = h / rows;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const off = row % 2 === 0 ? 0 : cw / 2;
      const x = col * cw + off;
      const y = row * ch;
      const shade = 0.75 + rand() * 0.5;
      const r = Math.round(90 * shade);
      const gg = Math.round(170 * shade);
      const b = Math.round(215 * shade);
      ctx.fillStyle = `rgb(${r},${gg},${b})`;
      ctx.beginPath();
      // Scale: rounded-bottom hexagon-ish arc.
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + cw / 2, y, x + cw, y + ch * 0.35);
      ctx.lineTo(x + cw, y + ch * 0.8);
      ctx.quadraticCurveTo(x + cw / 2, y + ch * 1.15, x, y + ch * 0.8);
      ctx.closePath();
      ctx.fill();
      // Highlight on the scale's upper-left edge.
      ctx.strokeStyle = `rgba(220,245,255,${(0.25 + rand() * 0.25).toFixed(2)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y + ch * 0.1);
      ctx.quadraticCurveTo(x + cw / 2, y, x + cw * 0.8, y + ch * 0.25);
      ctx.stroke();
    }
  }
}

// Wing membrane: frosty blue, slightly translucent-looking, with vein ridges.
export function paintFrost(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#9fd8ef');
  g.addColorStop(0.6, '#5aa8cc');
  g.addColorStop(1, '#2c6d93');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const rand = seededRandom(4242);

  // Veins radiating from the wing root.
  for (let i = 0; i < 14; i++) {
    const x0 = 0;
    const y0 = h * (0.15 + (i / 14) * 0.7);
    const x1 = w;
    const y1 = h * ((i / 14) * 0.5 + 0.2);
    const cx = w * 0.5;
    const cy = (y0 + y1) / 2 - h * 0.12;
    ctx.strokeStyle = `rgba(15,60,90,${(0.35 + rand() * 0.25).toFixed(2)})`;
    ctx.lineWidth = 2 + rand() * 3;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(cx, cy, x1, y1);
    ctx.stroke();
  }

  // Frost speckle.
  for (let i = 0; i < 320; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const r = rand() * 2 + 0.4;
    ctx.fillStyle = `rgba(240,252,255,${(0.15 + rand() * 0.4).toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}
