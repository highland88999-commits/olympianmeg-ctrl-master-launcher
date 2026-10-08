// app/undulatus/render.js — Canvas 2D rendering for UNDULATUS.
// Layered sine-wave cloud sea, power lines, tree silhouettes, storm, player.
// Kept lean for 60fps on iPhone Safari: capped DPR, pre-rendered sprites,
// modest segment counts, no per-frame shadowBlur in hot paths.

import { surfaceY, treeTop, TUNE } from './game.js';

let playerSprite = null;
let spriteDpr = 0;

function makePlayerSprite(dpr) {
  // A small sky-swimmer: elongated glider body with a soft glow, pre-rendered.
  const S = 64;
  const c = document.createElement('canvas');
  c.width = S * dpr;
  c.height = S * dpr;
  const x = c.getContext('2d');
  x.scale(dpr, dpr);
  // glow
  const g = x.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(190,235,255,0.85)');
  g.addColorStop(0.45, 'rgba(140,205,250,0.35)');
  g.addColorStop(1, 'rgba(140,205,250,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  // body: teardrop pointing right
  x.fillStyle = '#f4fbff';
  x.beginPath();
  x.moveTo(S * 0.82, S * 0.5);
  x.quadraticCurveTo(S * 0.55, S * 0.3, S * 0.3, S * 0.42);
  x.quadraticCurveTo(S * 0.18, S * 0.5, S * 0.3, S * 0.58);
  x.quadraticCurveTo(S * 0.55, S * 0.7, S * 0.82, S * 0.5);
  x.fill();
  // fin
  x.fillStyle = '#bfe3ff';
  x.beginPath();
  x.moveTo(S * 0.42, S * 0.5);
  x.quadraticCurveTo(S * 0.3, S * 0.22, S * 0.24, S * 0.16);
  x.quadraticCurveTo(S * 0.38, S * 0.26, S * 0.48, S * 0.44);
  x.fill();
  x.beginPath();
  x.moveTo(S * 0.42, S * 0.5);
  x.quadraticCurveTo(S * 0.3, S * 0.78, S * 0.24, S * 0.84);
  x.quadraticCurveTo(S * 0.38, S * 0.74, S * 0.48, S * 0.56);
  x.fill();
  // eye
  x.fillStyle = '#12324a';
  x.beginPath();
  x.arc(S * 0.66, S * 0.46, S * 0.045, 0, Math.PI * 2);
  x.fill();
  return c;
}

function wavePath(x, w, h, worldX, t, yFn, step) {
  x.beginPath();
  for (let sx = -20; sx <= w + 20; sx += step) {
    const wx = worldX + (sx - w * TUNE.playerScreenXFrac);
    const y = yFn(wx, t, h);
    if (sx === -20) x.moveTo(sx, y);
    else x.lineTo(sx, y);
  }
}

function drawCloudSea(x, s) {
  const { w, h, worldX, t } = s;
  const px = w * TUNE.playerScreenXFrac;

  // Base fill: the sea body.
  wavePath(x, w, h, worldX, t, surfaceY, 14);
  x.lineTo(w + 20, h + 20);
  x.lineTo(-20, h + 20);
  x.closePath();
  const g = x.createLinearGradient(0, h * 0.35, 0, h);
  g.addColorStop(0, '#f7fbff');
  g.addColorStop(0.35, '#dbe9f7');
  g.addColorStop(1, '#a9c3e2');
  x.fillStyle = g;
  x.fill();

  // Undulatus ripple texture: layered strokes riding the same wave field.
  const ripples = [
    { amp: 0.55, alpha: 0.16, width: 7, off: 26 },
    { amp: 0.8, alpha: 0.1, width: 12, off: 52 },
    { amp: 1.15, alpha: 0.07, width: 18, off: 88 },
  ];
  for (const r of ripples) {
    x.beginPath();
    for (let sx = -20; sx <= w + 20; sx += 18) {
      const wx = worldX + (sx - px);
      const y =
        surfaceY(wx, t, h) * r.amp +
        h * TUNE.surfaceBaseFrac * (1 - r.amp) +
        r.off;
      if (sx === -20) x.moveTo(sx, y);
      else x.lineTo(sx, y);
    }
    x.strokeStyle = `rgba(255,255,255,${r.alpha})`;
    x.lineWidth = r.width;
    x.lineCap = 'round';
    x.stroke();
  }

  // Crest highlight: bright line where the wave faces the sun.
  wavePath(x, w, h, worldX, t, surfaceY, 10);
  x.strokeStyle = 'rgba(255,255,255,0.75)';
  x.lineWidth = 2.5;
  x.stroke();
}

function drawFarClouds(x, s) {
  const { w, h, worldX, t } = s;
  const px = w * TUNE.playerScreenXFrac;
  const layers = [
    { yFrac: 0.18, amp: 26, alpha: 0.5, par: 0.25, hue: '255,255,255' },
    { yFrac: 0.32, amp: 34, alpha: 0.35, par: 0.45, hue: '235,244,255' },
  ];
  for (const L of layers) {
    x.beginPath();
    for (let sx = -20; sx <= w + 20; sx += 26) {
      const wx = worldX * L.par + (sx - px);
      const y =
        h * L.yFrac +
        L.amp * Math.sin(wx * 0.006 - t * 0.5) +
        L.amp * 0.5 * Math.sin(wx * 0.014 + t * 0.3);
      if (sx === -20) x.moveTo(sx, y);
      else x.lineTo(sx, y);
    }
    x.strokeStyle = `rgba(${L.hue},${L.alpha})`;
    x.lineWidth = 26;
    x.lineCap = 'round';
    x.stroke();
  }
}

function drawWires(x, s) {
  const { w, worldX } = s;
  const px = w * TUNE.playerScreenXFrac;
  x.lineCap = 'round';
  for (const wr of s.wires) {
    const sx = px + (wr.wx - worldX);
    if (sx < -80 || sx > w + 80) continue;
    // sag: gentle catenary-ish curve
    const sag = (yBase) => {
      x.beginPath();
      x.moveTo(-40, yBase + 26);
      x.quadraticCurveTo(w / 2, yBase + 46, w + 40, yBase + 26);
      x.stroke();
    };
    // gap glow — the safe thread zone
    const gapH = wr.gapBottom - wr.gapTop;
    const gg = x.createLinearGradient(0, wr.gapTop, 0, wr.gapBottom);
    gg.addColorStop(0, 'rgba(120,200,255,0)');
    gg.addColorStop(0.5, wr.zapped ? 'rgba(255,120,120,0.14)' : 'rgba(120,200,255,0.13)');
    gg.addColorStop(1, 'rgba(120,200,255,0)');
    x.fillStyle = gg;
    x.fillRect(sx - 34, wr.gapTop, 68, gapH);

    x.strokeStyle = wr.zapped ? '#5a2b2b' : '#232a33';
    x.lineWidth = 3;
    sag(wr.gapTop);
    x.lineWidth = 3;
    sag(wr.gapBottom);

    // occasional pole rising from the sea
    const poleWx = Math.floor(wr.wx / 900) * 900;
    const poleSx = px + (poleWx - worldX);
    if (poleSx > -40 && poleSx < w + 40) {
      const topY = Math.min(wr.gapTop, wr.gapBottom) - 90;
      const baseY = s.h * 0.98;
      x.strokeStyle = '#1d242e';
      x.lineWidth = 7;
      x.beginPath();
      x.moveTo(poleSx, baseY);
      x.lineTo(poleSx, topY);
      x.stroke();
      // crossarm
      x.lineWidth = 5;
      x.beginPath();
      x.moveTo(poleSx - 26, topY + 44);
      x.lineTo(poleSx + 26, topY + 44);
      x.stroke();
    }
  }
}

function drawThermals(x, s) {
  const { w } = s;
  const px = w * TUNE.playerScreenXFrac;
  for (const th of s.thermals) {
    const sx = px + (th.wx - s.worldX);
    if (sx < -120 || sx > w + 120) continue;
    const top = s.h * 0.08;
    const bot = s.h * 0.72;
    const g = x.createLinearGradient(0, top, 0, bot);
    g.addColorStop(0, 'rgba(255,205,110,0)');
    g.addColorStop(0.55, 'rgba(255,195,95,0.32)');
    g.addColorStop(1, 'rgba(255,180,70,0.12)');
    x.fillStyle = g;
    x.fillRect(sx - th.w / 2, top, th.w, bot - top);
    // shimmering edges
    x.strokeStyle = 'rgba(255,210,120,0.35)';
    x.lineWidth = 2;
    x.setLineDash([10, 14]);
    x.lineDashOffset = -s.t * 60;
    x.beginPath();
    x.moveTo(sx - th.w / 2, top);
    x.lineTo(sx - th.w / 2, bot);
    x.moveTo(sx + th.w / 2, top);
    x.lineTo(sx + th.w / 2, bot);
    x.stroke();
    x.setLineDash([]);
  }
}

function drawTrees(x, s) {
  const { w, h, worldX } = s;
  x.fillStyle = '#1b2830';
  x.beginPath();
  x.moveTo(-20, h + 20);
  const step = 26;
  for (let sx = -20; sx <= w + 20; sx += step) {
    const wx = worldX + (sx - w * TUNE.playerScreenXFrac);
    const top = treeTop(wx, h);
    // pine silhouette: two jag peaks per step
    x.lineTo(sx + step * 0.25, top - 26 - 8 * Math.abs(Math.sin(wx * 0.3)));
    x.lineTo(sx + step * 0.5, top);
    x.lineTo(sx + step * 0.75, top - 18 - 6 * Math.abs(Math.sin(wx * 0.23 + 1)));
    x.lineTo(sx + step, top);
  }
  x.lineTo(w + 20, h + 20);
  x.closePath();
  x.fill();
  // soft top edge
  x.strokeStyle = 'rgba(60,90,105,0.5)';
  x.lineWidth = 2;
  x.beginPath();
  for (let sx = -20; sx <= w + 20; sx += step) {
    const wx = worldX + (sx - w * TUNE.playerScreenXFrac);
    const top = treeTop(wx, h);
    if (sx === -20) x.moveTo(sx, top);
    else x.lineTo(sx, top);
  }
  x.stroke();
}

function drawStorm(x, s) {
  const { w, h, worldX } = s;
  const px = w * TUNE.playerScreenXFrac;
  const active = s.stormMode > 0;
  const approaching = s.stormWallX != null;

  if (approaching) {
    const wallSx = px + (s.stormWallX - worldX);
    if (wallSx < w + 300) {
      const g = x.createLinearGradient(wallSx, 0, w + 100, 0);
      g.addColorStop(0, 'rgba(40,52,72,0)');
      g.addColorStop(1, 'rgba(40,52,72,0.85)');
      x.fillStyle = g;
      x.fillRect(Math.max(0, wallSx), 0, w - Math.max(0, wallSx) + 100, h);
    }
  }
  if (active) {
    // dark wash over everything
    x.fillStyle = 'rgba(28,36,54,0.42)';
    x.fillRect(0, 0, w, h);
    // rain streaks — cheap lines
    x.strokeStyle = 'rgba(180,200,225,0.35)';
    x.lineWidth = 1.5;
    x.beginPath();
    for (let i = 0; i < 46; i++) {
      const rx = ((i * 197.3 + s.t * 900) % (w + 40)) - 20;
      const ry = ((i * 311.7 + s.t * 1400) % (h + 40)) - 20;
      x.moveTo(rx, ry);
      x.lineTo(rx - 6, ry + 22);
    }
    x.stroke();
  }
}

function drawBolts(x, s) {
  const px = s.w * TUNE.playerScreenXFrac;
  for (const b of s.bolts) {
    if (!b.struck) {
      // telegraph: soft warning band at the locked height
      const a = Math.max(0, 1 - b.timer / TUNE.boltTelegraph);
      x.fillStyle = `rgba(255,90,90,${0.1 + a * 0.16})`;
      x.fillRect(0, b.y - TUNE.boltBandHalf, s.w, TUNE.boltBandHalf * 2);
    } else if (b.flash > 0) {
      // horizontal jagged strike across the band
      x.strokeStyle = `rgba(255,246,200,${b.flash})`;
      x.lineWidth = 4;
      x.beginPath();
      const y0 = b.y;
      x.moveTo(-20, y0);
      for (let sx = 0; sx <= s.w + 20; sx += 34) {
        x.lineTo(sx, y0 + (Math.random() - 0.5) * 44);
      }
      x.stroke();
      x.strokeStyle = `rgba(255,255,255,${b.flash * 0.9})`;
      x.lineWidth = 1.5;
      x.stroke();
    }
  }
}

function drawParticles(x, s) {
  for (const p of s.particles) {
    const k = 1 - p.life / p.maxLife;
    if (p.kind === 'gold') {
      x.fillStyle = `rgba(255,205,110,${k * 0.9})`;
    } else if (p.kind === 'zap') {
      x.fillStyle = `rgba(255,140,120,${k})`;
    } else if (p.kind === 'thread') {
      x.fillStyle = `rgba(150,215,255,${k * 0.9})`;
    } else {
      x.fillStyle = `rgba(220,240,255,${k * 0.7})`;
    }
    x.beginPath();
    x.arc(p.x, p.y, p.size * k + 0.5, 0, Math.PI * 2);
    x.fill();
  }
}

function drawPlayer(x, s, dpr) {
  if (!playerSprite || spriteDpr !== dpr) {
    playerSprite = makePlayerSprite(dpr);
    spriteDpr = dpr;
  }
  const px = s.w * TUNE.playerScreenXFrac;
  const S = 64;
  // banking tilt from vertical velocity
  const tilt = Math.max(-0.5, Math.min(0.5, s.vy / 1400));
  x.save();
  x.translate(px, s.py);
  x.rotate(tilt);
  // flow aura
  if (s.flow > 0.4) {
    x.strokeStyle = `rgba(140,220,255,${(s.flow - 0.4) * 1.2})`;
    x.lineWidth = 2.5;
    x.beginPath();
    x.arc(0, 0, 26 + Math.sin(s.t * 9) * 3, 0, Math.PI * 2);
    x.stroke();
  }
  x.drawImage(playerSprite, -S / 2, -S / 2, S, S);
  x.restore();
}

export function drawGame(ctx, s, dpr) {
  const { w, h } = s;

  // sky
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  const stormy = s.stormMode > 0 ? 1 : 0;
  if (stormy) {
    sky.addColorStop(0, '#5d7186');
    sky.addColorStop(0.6, '#7d8ea3');
    sky.addColorStop(1, '#9aa9bc');
  } else {
    sky.addColorStop(0, '#6ea8dd');
    sky.addColorStop(0.55, '#a9c9ec');
    sky.addColorStop(1, '#dcebfb');
  }
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  drawFarClouds(ctx, s);
  drawStorm(ctx, s);
  drawCloudSea(ctx, s);
  drawThermals(ctx, s);
  drawWires(ctx, s);
  drawTrees(ctx, s);
  drawBolts(ctx, s);
  drawParticles(ctx, s);
  drawPlayer(ctx, s, dpr);

  // thermal golden wash
  if (s.thermalGlow > 0) {
    ctx.fillStyle = `rgba(255,195,100,${s.thermalGlow * 0.16})`;
    ctx.fillRect(0, 0, w, h);
  }
  // zap flash
  if (s.flash > 0) {
    ctx.fillStyle = `rgba(255,235,235,${s.flash * 0.35})`;
    ctx.fillRect(0, 0, w, h);
  }
  // slow-mo vignette
  if (s.slowmo > 0) {
    const v = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.85);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(20,30,50,0.35)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
  }
}

export function invalidateSprites() {
  playerSprite = null;
}
