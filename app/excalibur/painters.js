// painters.js — procedural canvas-2D texture painters for the Excalibur module.
// Pure functions: (ctx, w, h) => void. No imports, no network, no DOM access
// beyond the ctx handed in — so they run in Node tests with a mock context.
// The scene wraps the painted canvases in THREE.CanvasTexture.

function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Night-sky nebula backdrop for the sky sphere.
export function paintSky(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#020208');
  g.addColorStop(0.55, '#06121f');
  g.addColorStop(0.8, '#0a2b33');
  g.addColorStop(1, '#041014');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const rand = seededRandom(20260927);
  const blobs = [
    [0.25, 0.35, 0.28, '0,255,255', 0.1],
    [0.7, 0.5, 0.32, '255,0,255', 0.08],
    [0.5, 0.78, 0.25, '90,40,255', 0.1],
    [0.85, 0.2, 0.2, '0,180,255', 0.07],
  ];
  for (const [bx, by, br, rgb, a] of blobs) {
    const rg = ctx.createRadialGradient(w * bx, h * by, 0, w * bx, h * by, w * br);
    rg.addColorStop(0, `rgba(${rgb},${a})`);
    rg.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, w, h);
  }

  for (let i = 0; i < 420; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const r = rand() * 1.4 + 0.3;
    const a = (0.25 + rand() * 0.75).toFixed(2);
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Flowing energy bands for the sword blade (mirrored-repeat wrapped, offset animated).
export function paintEnergy(ctx, w, h) {
  ctx.fillStyle = '#021a1a';
  ctx.fillRect(0, 0, w, h);

  const rand = seededRandom(777);
  for (let i = 0; i < 16; i++) {
    const x = rand() * w;
    const bw = 2 + rand() * 10;
    const bright = rand() > 0.5;
    const g = ctx.createLinearGradient(x, 0, x + bw, 0);
    if (bright) {
      g.addColorStop(0, 'rgba(0,242,255,0)');
      g.addColorStop(0.5, 'rgba(220,255,255,0.85)');
      g.addColorStop(1, 'rgba(0,242,255,0)');
    } else {
      g.addColorStop(0, 'rgba(0,180,180,0)');
      g.addColorStop(0.5, 'rgba(0,220,220,0.4)');
      g.addColorStop(1, 'rgba(0,180,180,0)');
    }
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, bw, h);
  }

  // Horizontal shimmer bands so the flow reads as moving energy.
  for (let i = 0; i < 8; i++) {
    const y = rand() * h;
    const bh = 3 + rand() * 8;
    ctx.fillStyle = `rgba(160,255,255,${(0.08 + rand() * 0.12).toFixed(2)})`;
    ctx.fillRect(0, y, w, bh);
  }
}

// Dark metallic hex-plate floor.
export function paintFloor(ctx, w, h) {
  ctx.fillStyle = '#0a0a0e';
  ctx.fillRect(0, 0, w, h);

  const rand = seededRandom(4242);
  const r = 30;
  const dx = r * 1.5;
  const dy = r * Math.sqrt(3);
  ctx.strokeStyle = 'rgba(120,200,220,0.16)';
  ctx.lineWidth = 2;

  let row = 0;
  for (let y = -r; y < h + r; y += dy / 2, row++) {
    for (let x = -r; x < w + r; x += dx) {
      const cx = x + (row % 2 === 0 ? 0 : dx / 2);
      const cy = y;
      ctx.beginPath();
      for (let k = 0; k <= 6; k++) {
        const a = (Math.PI / 3) * k + Math.PI / 6;
        const px = cx + r * 0.92 * Math.cos(a);
        const py = cy + r * 0.92 * Math.sin(a);
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }
  }

  // Speckle for a worn-metal feel.
  for (let i = 0; i < 900; i++) {
    const a = (0.03 + rand() * 0.08).toFixed(2);
    ctx.fillStyle = `rgba(180,220,230,${a})`;
    ctx.fillRect(rand() * w, rand() * h, 1.5, 1.5);
  }
}
