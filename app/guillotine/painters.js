// painters.js — procedural canvas-2D texture painters for the Guillotine module.
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

// Dusk sky: amber horizon under a teal nebula, with stars.
export function paintSky(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#05030a');
  g.addColorStop(0.5, '#0a1420');
  g.addColorStop(0.72, '#3a2412'); // amber dusk band
  g.addColorStop(0.82, '#120b06');
  g.addColorStop(1, '#060504');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const rand = seededRandom(20260928);
  const blobs = [
    [0.3, 0.3, 0.26, '0,220,255', 0.09],
    [0.68, 0.42, 0.3, '255,68,204', 0.07],
    [0.5, 0.62, 0.24, '255,160,80', 0.08],
    [0.86, 0.18, 0.2, '120,80,255', 0.07],
  ];
  for (const [bx, by, br, rgb, a] of blobs) {
    const rg = ctx.createRadialGradient(w * bx, h * by, 0, w * bx, h * by, w * br);
    rg.addColorStop(0, `rgba(${rgb},${a})`);
    rg.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, w, h);
  }

  for (let i = 0; i < 380; i++) {
    const x = rand() * w;
    const y = rand() * h * 0.7;
    const r = rand() * 1.4 + 0.3;
    const a = (0.25 + rand() * 0.75).toFixed(2);
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Flowing magenta energy bands for the blade (mirrored-repeat wrapped).
export function paintEnergy(ctx, w, h) {
  ctx.fillStyle = '#1a0212';
  ctx.fillRect(0, 0, w, h);

  const rand = seededRandom(9090);
  for (let i = 0; i < 16; i++) {
    const x = rand() * w;
    const bw = 2 + rand() * 10;
    const bright = rand() > 0.5;
    const g = ctx.createLinearGradient(x, 0, x + bw, 0);
    if (bright) {
      g.addColorStop(0, 'rgba(255,68,204,0)');
      g.addColorStop(0.5, 'rgba(255,220,245,0.85)');
      g.addColorStop(1, 'rgba(255,68,204,0)');
    } else {
      g.addColorStop(0, 'rgba(200,40,140,0)');
      g.addColorStop(0.5, 'rgba(230,90,180,0.4)');
      g.addColorStop(1, 'rgba(200,40,140,0)');
    }
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, bw, h);
  }

  for (let i = 0; i < 8; i++) {
    const y = rand() * h;
    const bh = 3 + rand() * 8;
    ctx.fillStyle = `rgba(255,170,220,${(0.08 + rand() * 0.12).toFixed(2)})`;
    ctx.fillRect(0, y, w, bh);
  }
}

// Dark metallic hex-plate floor.
export function paintFloor(ctx, w, h) {
  ctx.fillStyle = '#0b0a0d';
  ctx.fillRect(0, 0, w, h);

  const rand = seededRandom(31337);
  const r = 30;
  const dx = r * 1.5;
  const dy = r * Math.sqrt(3);
  ctx.strokeStyle = 'rgba(230,170,190,0.14)';
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

  for (let i = 0; i < 900; i++) {
    const a = (0.03 + rand() * 0.08).toFixed(2);
    ctx.fillStyle = `rgba(220,190,200,${a})`;
    ctx.fillRect(rand() * w, rand() * h, 1.5, 1.5);
  }
}

// Warm wood grain for the deck, log, and stand.
export function paintWood(ctx, w, h) {
  ctx.fillStyle = '#3a2413';
  ctx.fillRect(0, 0, w, h);

  const rand = seededRandom(5050);
  // Long grain streaks.
  for (let i = 0; i < 60; i++) {
    const y = rand() * h;
    const dark = rand() > 0.45;
    ctx.strokeStyle = dark ? 'rgba(20,10,4,0.35)' : 'rgba(140,95,50,0.28)';
    ctx.lineWidth = 1 + rand() * 2.5;
    ctx.beginPath();
    ctx.moveTo(-10, y);
    for (let x = 0; x <= w; x += 32) {
      ctx.lineTo(x, y + Math.sin(x * 0.02 + i) * (4 + rand() * 8));
    }
    ctx.stroke();
  }
  // Knots.
  for (let i = 0; i < 7; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const r = 6 + rand() * 14;
    const rg = ctx.createRadialGradient(x, y, 1, x, y, r);
    rg.addColorStop(0, 'rgba(25,12,5,0.7)');
    rg.addColorStop(0.6, 'rgba(60,35,15,0.4)');
    rg.addColorStop(1, 'rgba(60,35,15,0)');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}
