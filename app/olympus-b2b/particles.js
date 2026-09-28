// Olympus B2B — particle field logic (pure, canvas-agnostic).

export function createParticles(count, width, height, rand = Math.random) {
  const pts = [];
  for (let i = 0; i < count; i += 1) {
    pts.push({
      x: rand() * width,
      y: rand() * height,
      vx: (rand() - 0.5) * 0.25,
      vy: (rand() - 0.5) * 0.25,
      r: 0.6 + rand() * 1.6,
      a: 0.15 + rand() * 0.35,
      hue: rand() < 0.85 ? 187 : 330, // cyan, rare magenta
    });
  }
  return pts;
}

export function stepParticles(pts, width, height, mx = 0, my = 0) {
  for (const p of pts) {
    p.x += p.vx + mx * 0.6;
    p.y += p.vy + my * 0.6;
    if (p.x < -8) p.x = width + 8;
    else if (p.x > width + 8) p.x = -8;
    if (p.y < -8) p.y = height + 8;
    else if (p.y > height + 8) p.y = -8;
  }
  return pts;
}

export function particleCountForWidth(width) {
  return width < 600 ? 120 : 260;
}
