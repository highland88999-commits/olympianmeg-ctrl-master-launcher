// DK Hero — canvas-2D renderer. Procedural starfield/nebula background
// (replaces the hotlinked video). Zero external requests.

export function makeStars(W, H, count) {
  const stars = [];
  let seed = 1234567;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = 0; i < count; i++) {
    stars.push({
      x: rand() * W,
      y: rand() * H,
      r: 0.5 + rand() * 1.6,
      tw: rand() * Math.PI * 2,
      sp: 0.5 + rand() * 2,
    });
  }
  return stars;
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawBackground(ctx, state, stars, t) {
  const { W, H, S } = state;
  // Deep space base
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#060913');
  bg.addColorStop(0.55, '#0b1026');
  bg.addColorStop(1, '#120a24');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Nebula blobs (localized, low alpha — lighting rule)
  const blobs = [
    { x: 0.18 * W, y: 0.24 * H, r: 0.32 * W, c: 'rgba(88,40,160,0.20)' },
    { x: 0.85 * W, y: 0.62 * H, r: 0.36 * W, c: 'rgba(20,90,140,0.18)' },
    { x: 0.55 * W, y: 0.9 * H, r: 0.28 * W, c: 'rgba(150,40,90,0.12)' },
  ];
  for (const b of blobs) {
    const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
    g.addColorStop(0, b.c);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
  }

  // Twinkling stars
  for (const s of stars) {
    const a = 0.35 + 0.65 * Math.abs(Math.sin(t * s.sp + s.tw));
    ctx.fillStyle = `rgba(220,235,255,${(a * 0.9).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r * S, 0, Math.PI * 2);
    ctx.fill();
  }

  // Soft light rays from the top (kept subtle per the lighting rule)
  ctx.save();
  ctx.translate(W / 2, -50);
  ctx.rotate(Math.sin(t * 0.25) * 0.08);
  const ray = ctx.createLinearGradient(0, 0, 0, H);
  ray.addColorStop(0, 'rgba(255,255,240,0.07)');
  ray.addColorStop(1, 'rgba(255,255,240,0)');
  ctx.fillStyle = ray;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-W * 0.18, H + 100);
  ctx.lineTo(W * 0.18, H + 100);
  ctx.fill();
  ctx.restore();
}

export function drawGirders(ctx, state) {
  const { W, S } = state;
  for (const g of state.girders) {
    const lw = Math.max(10, 15 * S);
    const grad = ctx.createLinearGradient(0, g.yLeft - lw / 2, 0, g.yLeft + lw / 2);
    grad.addColorStop(0, '#e63946');
    grad.addColorStop(0.5, '#a81c25');
    grad.addColorStop(1, '#5e0b12');
    ctx.lineWidth = lw;
    ctx.strokeStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, g.yLeft);
    ctx.lineTo(W, g.yRight);
    ctx.stroke();
    // Highlight edge
    ctx.lineWidth = 2 * S;
    ctx.strokeStyle = '#ff9999';
    ctx.beginPath();
    ctx.moveTo(0, g.yLeft - lw / 2 + 1);
    ctx.lineTo(W, g.yRight - lw / 2 + 1);
    ctx.stroke();
    // Rivets for readability
    ctx.fillStyle = '#ffb3b3';
    const stepX = 46 * S;
    for (let x = stepX / 2; x < W; x += stepX) {
      const y = g.yLeft + ((g.yRight - g.yLeft) / W) * x;
      ctx.beginPath();
      ctx.arc(x, y, 1.8 * S, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function drawLadders(ctx, state) {
  const { S } = state;
  ctx.strokeStyle = '#22d3ee';
  ctx.lineWidth = Math.max(3, 4 * S);
  for (const lad of state.ladders) {
    const off = 7 * S;
    for (const dx of [-off, off]) {
      ctx.beginPath();
      ctx.moveTo(lad.x + dx, lad.topY);
      ctx.lineTo(lad.x + dx, lad.bottomY);
      ctx.stroke();
    }
    // Rungs
    ctx.lineWidth = Math.max(2, 3 * S);
    const rungs = Math.max(2, Math.floor((lad.bottomY - lad.topY) / (16 * S)));
    for (let i = 0; i <= rungs; i++) {
      const y = lad.topY + ((lad.bottomY - lad.topY) * i) / rungs;
      ctx.beginPath();
      ctx.moveTo(lad.x - off, y);
      ctx.lineTo(lad.x + off, y);
      ctx.stroke();
    }
    ctx.lineWidth = Math.max(3, 4 * S);
  }
}

export function drawShip(ctx, state, t) {
  const { S } = state;
  const hover = Math.sin(t * 1.4) * 8 * S;
  const top = state.girders[state.girders.length - 1];
  const baseY = Math.min(top.yLeft, top.yRight) - 62 * S;
  const cx = state.ship.x;
  const cy = baseY + hover;

  // Engine glow (localized)
  ctx.save();
  ctx.shadowColor = '#00ffff';
  ctx.shadowBlur = 14 * S;
  ctx.fillStyle = '#00ffff';
  ctx.beginPath();
  ctx.ellipse(cx - 34 * S, cy + 8 * S, 20 * S, 6 * S, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Hull
  const hull = ctx.createLinearGradient(cx - 60 * S, cy - 20 * S, cx + 60 * S, cy + 20 * S);
  hull.addColorStop(0, '#f0f0f0');
  hull.addColorStop(0.5, '#a0a0a0');
  hull.addColorStop(1, '#404040');
  ctx.fillStyle = hull;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 58 * S, 19 * S, 0, 0, Math.PI * 2);
  ctx.fill();

  // Cockpit dome
  const dome = ctx.createLinearGradient(cx - 25 * S, cy - 35 * S, cx + 25 * S, cy);
  dome.addColorStop(0, '#00ffff');
  dome.addColorStop(1, '#004444');
  ctx.fillStyle = dome;
  ctx.beginPath();
  ctx.arc(cx, cy - 6 * S, 23 * S, Math.PI, 0);
  ctx.fill();

  // Cannon
  ctx.fillStyle = '#555';
  roundRectPath(ctx, cx + 34 * S, cy - 5 * S, 34 * S, 10 * S, 2 * S);
  ctx.fill();

  // Muzzle flash right after firing
  if (state.ship.flash > 0) {
    ctx.save();
    ctx.shadowColor = '#ffaa00';
    ctx.shadowBlur = 12 * S;
    ctx.fillStyle = '#ffaa00';
    ctx.beginPath();
    ctx.arc(cx + 72 * S, cy, 10 * S, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export function drawBarrels(ctx, state) {
  for (const b of state.barrels) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.rot || 0);
    const wood = ctx.createRadialGradient(-b.r / 3, -b.r / 3, 2, 0, 0, b.r);
    wood.addColorStop(0, '#d4a373');
    wood.addColorStop(1, '#8b5a2b');
    ctx.fillStyle = wood;
    ctx.beginPath();
    ctx.arc(0, 0, b.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#666';
    ctx.lineWidth = Math.max(1.5, 2.5 * state.S);
    ctx.beginPath();
    ctx.arc(0, 0, b.r - 3 * state.S, -Math.PI / 2.5, Math.PI / 2.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, b.r - 3 * state.S, Math.PI - Math.PI / 2.5, Math.PI + Math.PI / 2.5);
    ctx.stroke();
    ctx.restore();
  }
}

// Original hero: an astronaut climber in an orange suit (not plumber overalls).
export function drawHero(ctx, state, t) {
  const hero = state.hero;
  const { S } = state;
  const x = hero.x;
  const y = hero.y;
  const w = hero.w;
  const h = hero.h;

  ctx.save();
  if (state.status === 'dying') {
    ctx.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(t * 20));
  }

  // Backpack
  ctx.fillStyle = '#7a3b12';
  roundRectPath(ctx, x + (hero.facing === 1 ? -4 * S : w - 2 * S), y + 12 * S, 6 * S, 14 * S, 2 * S);
  ctx.fill();

  // Legs
  ctx.fillStyle = '#b35a1b';
  const legSwing = hero.climb || Math.abs(hero.vx) > 0 ? Math.sin(t * 10) * 2 * S : 0;
  roundRectPath(ctx, x + 4 * S, y + h - 12 * S, 6 * S, 12 * S + legSwing, 2 * S);
  ctx.fill();
  roundRectPath(ctx, x + w - 10 * S, y + h - 12 * S, 6 * S, 12 * S - legSwing, 2 * S);
  ctx.fill();

  // Torso (orange suit)
  const suit = ctx.createLinearGradient(x, 0, x + w, 0);
  suit.addColorStop(0, '#ff9a4d');
  suit.addColorStop(1, '#c2571a');
  ctx.fillStyle = suit;
  roundRectPath(ctx, x + 2 * S, y + 12 * S, w - 4 * S, 14 * S, 4 * S);
  ctx.fill();

  // Chest light
  ctx.fillStyle = '#ffe08a';
  ctx.beginPath();
  ctx.arc(x + w / 2, y + 18 * S, 2.6 * S, 0, Math.PI * 2);
  ctx.fill();

  // Helmet
  ctx.fillStyle = '#dfe6ee';
  ctx.beginPath();
  ctx.arc(x + w / 2, y + 6 * S, 8.5 * S, 0, Math.PI * 2);
  ctx.fill();
  // Visor (teal)
  ctx.fillStyle = '#0e7c86';
  ctx.beginPath();
  ctx.arc(
    x + w / 2 + hero.facing * 2.5 * S, y + 6 * S, 5.5 * S,
    hero.facing === 1 ? -Math.PI / 2.6 : Math.PI - Math.PI / 2.6,
    hero.facing === 1 ? Math.PI / 2.6 : Math.PI + Math.PI / 2.6
  );
  ctx.fill();

  ctx.restore();
}

export function drawScene(ctx, state, stars, t) {
  drawBackground(ctx, state, stars, t);
  drawGirders(ctx, state);
  drawLadders(ctx, state);
  drawShip(ctx, state, t);
  drawBarrels(ctx, state);
  drawHero(ctx, state, t);
}
