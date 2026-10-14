// Raptor Rush — 2D canvas renderer. Renders the game state produced
// by game.js. The canyon runs dead-ahead: the horizon sits at the
// top, the track scrolls toward the player at the bottom, and
// entities shrink toward the horizon (simple linear perspective).
//
// WAVE 5 (characters-everywhere): the runner itself is embodied.
// Each selectable raptor's sprite is a top-down render of its real
// hosted GLB (lib/characters/raptor-runners.js) — a static asset,
// drawn head-up in place of the procedural sprite. With no pick
// (or while the sprite loads), the original procedural raptor
// below draws exactly as it always has; picking Swift/Claw/Fang
// also pre-tints that fallback to the runner's own palette, so the
// runner reads as itself from the first frame. Visual swap only —
// raptorBox and every other logic body are untouched.

import {
  WORLD_W,
  WORLD_H,
  TRACK_X0,
  TRACK_X1,
  RAPTOR_Y,
  OBSTACLE_TYPES,
  raptorBox,
  obstacleBox,
  rabbitBox,
  escalationAt,
} from './game';

// Fallback-procedural palettes per runner (body / dark / belly),
// matched to each GLB's top-down colours. The unpicked default is
// the original green.
const RUNNER_PALETTES = {
  'raptor-swift': { body: '#43d17c', dark: '#1e7a44', belly: '#b8f0cd' },
  'raptor-claw': { body: '#c93b3b', dark: '#6e1d1d', belly: '#e8a598' },
  'raptor-fang': { body: '#7da453', dark: '#48682c', belly: '#cfe0ae' },
};
const NATIVE_PALETTE = RUNNER_PALETTES['raptor-swift'];

// Perspective scale for a world y: 0.45 at the horizon, 1.0 at the player.
export function depthScale(y) {
  const t = Math.max(0, Math.min(1, y / WORLD_H));
  return 0.45 + 0.55 * t;
}

function makeSky(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d');
  const grad = x.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#0b0620');
  grad.addColorStop(0.28, '#241239');
  grad.addColorStop(0.42, '#4a1c34'); // horizon glow band
  grad.addColorStop(0.5, '#1a0f28');
  grad.addColorStop(1, '#0a0512');
  x.fillStyle = grad;
  x.fillRect(0, 0, w, h);
  // Stars (fade out below the horizon).
  for (let i = 0; i < 130; i++) {
    const sx = (i * 733) % w;
    const sy = (i * 389) % Math.floor(h * 0.3);
    const tw = 0.4 + ((i * 17) % 10) / 14;
    x.fillStyle = `rgba(200,220,255,${tw})`;
    x.fillRect(sx, sy, 2, 2);
  }
  // Low sun on the horizon.
  const sun = x.createRadialGradient(w * 0.5, h * 0.42, 4, w * 0.5, h * 0.42, 130);
  sun.addColorStop(0, 'rgba(255,130,60,0.6)');
  sun.addColorStop(1, 'rgba(255,130,60,0)');
  x.fillStyle = sun;
  x.fillRect(0, 0, w, h);
  return c;
}

// A canyon wall strip that tiles vertically (height h, drawn as wallHeight
// tiles). Deterministic jagged rock silhouette on one side.
function makeWallStrip(w, h, color, seed, mirror) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = color;
  x.beginPath();
  x.moveTo(0, h);
  let py = 0;
  let i = 0;
  while (py < h) {
    const segH = 70 + ((seed * (i + 3) * 137) % 110);
    const jag = 24 + ((seed * (i + 7) * 251) % 54);
    const edge = mirror ? w - jag : jag;
    x.lineTo(edge, py + segH * 0.3);
    x.lineTo(edge - (mirror ? -1 : 1) * ((seed * (i + 11) * 97) % 30), py + segH * 0.6);
    py += segH;
    i++;
  }
  x.lineTo(0, h);
  x.lineTo(w, h);
  x.lineTo(mirror ? w : 0, h);
  x.lineTo(mirror ? w : 0, 0);
  x.closePath();
  x.fill();
  // Rock strata lines.
  x.strokeStyle = 'rgba(255,150,110,0.14)';
  x.lineWidth = 3;
  for (let ly = 20; ly < h; ly += 46) {
    x.beginPath();
    x.moveTo(0, ly);
    x.lineTo(w, ly + ((seed * ly * 13) % 18) - 9);
    x.stroke();
  }
  return c;
}

export function createRenderer(canvas, opts = {}) {
  const ctx = canvas.getContext('2d');
  const reducedMotion = !!opts.reducedMotion;
  let scale = 1;
  let offX = 0;
  let offY = 0;
  let runPhase = 0;

  // --- Wave 5 runner embodiment -----------------------------------
  // Sprites load lazily via opts.spriteLoader (the page passes a
  // loader; tests/headless may pass null, which keeps the native
  // procedural runner forever). currentRunner is a RAPTOR_RUNNERS
  // record or null (native). spriteReady flips true when the picked
  // runner's PNG has decoded; until then the procedural raptor —
  // pre-tinted to the runner's palette — stands in.
  const spriteLoader = opts.spriteLoader || null;
  let currentRunner = null;
  let spriteImg = null;
  let spriteReady = false;

  function setRunner(runner) {
    currentRunner = runner || null;
    spriteImg = null;
    spriteReady = false;
    if (currentRunner && spriteLoader) {
      const img = spriteLoader(currentRunner.sprite);
      if (img) {
        spriteImg = img;
        if (img.complete && img.naturalWidth > 0) spriteReady = true;
        else if (typeof img.addEventListener === 'function') {
          img.addEventListener('load', () => { spriteReady = true; });
          img.addEventListener('error', () => { spriteReady = false; });
        }
      }
    }
  }
  if (opts.runner) setRunner(opts.runner);

  const sky = makeSky(WORLD_W, WORLD_H);
  const wallL = makeWallStrip(TRACK_X0, 480, '#241428', 7, false);
  const wallR = makeWallStrip(WORLD_W - TRACK_X1, 480, '#241428', 13, true);
  const wallFarL = makeWallStrip(TRACK_X0, 480, '#170c1e', 21, false);
  const wallFarR = makeWallStrip(WORLD_W - TRACK_X1, 480, '#170c1e', 29, true);

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const vw = canvas.clientWidth || window.innerWidth;
    const vh = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.floor(vw * dpr);
    canvas.height = Math.floor(vh * dpr);
    scale = Math.max(vw / WORLD_W, vh / WORLD_H) * dpr;
    offX = (canvas.width - WORLD_W * scale) / 2;
    offY = (canvas.height - WORLD_H * scale) / 2;
  }

  // --- raptor art, facing UP (running into the screen) --------------------
  // Reuses the side-view raptor pose from the canyon sprint days, rotated
  // -90 degrees so it sprints dead-ahead.
  function drawRaptorSprite(g, s) {
    const blink = g.invincible > 0 && Math.floor(g.time * 14) % 2 === 0;
    if (blink) return; // hit flash
    const pal = (currentRunner && RUNNER_PALETTES[currentRunner.kombatId]) || NATIVE_PALETTE;
    const body = pal.body;
    const dark = pal.dark;
    const belly = pal.belly;
    const bob = reducedMotion ? 0 : Math.sin(runPhase) * 3;

    // Tail sweeps back (down the screen).
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(-26 * s, (-58 + bob) * s);
    ctx.lineTo(-72 * s, (-40 + bob * 0.5) * s);
    ctx.lineTo(-26 * s, (-44 + bob) * s);
    ctx.closePath();
    ctx.fill();
    // Legs pumping.
    ctx.strokeStyle = dark;
    ctx.lineWidth = 9 * s;
    ctx.lineCap = 'round';
    const l1 = Math.sin(runPhase) * 16 * s;
    const l2 = Math.sin(runPhase + Math.PI) * 16 * s;
    ctx.beginPath();
    ctx.moveTo(-6 * s, (-34 + bob) * s);
    ctx.lineTo((-6 + l1) * s, 0);
    ctx.moveTo(10 * s, (-34 + bob) * s);
    ctx.lineTo((10 + l2) * s, 0);
    ctx.stroke();
    // Body.
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(2 * s, (-52 + bob) * s, 34 * s, 22 * s, -0.12, 0, Math.PI * 2);
    ctx.fill();
    // Belly.
    ctx.fillStyle = belly;
    ctx.beginPath();
    ctx.ellipse(6 * s, (-44 + bob) * s, 22 * s, 12 * s, -0.1, 0, Math.PI * 2);
    ctx.fill();
    // Back stripes.
    ctx.fillStyle = dark;
    for (let i = 0; i < 3; i++) {
      ctx.fillRect((-16 + i * 14) * s, (-72 + bob) * s, 6 * s, 10 * s);
    }
    // Neck + head reach forward (up the screen).
    ctx.fillStyle = body;
    ctx.save();
    ctx.translate(26 * s, (-62 + bob) * s);
    ctx.rotate(-0.1);
    ctx.beginPath();
    ctx.ellipse(8 * s, -12 * s, 10 * s, 16 * s, 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(20 * s, -20 * s, 14 * s, 8 * s, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Eye.
    ctx.fillStyle = '#0c2b1a';
    ctx.beginPath();
    ctx.arc(38 * s, (-80 + bob) * s, 3.2 * s, 0, Math.PI * 2);
    ctx.fill();
    // Tiny arms.
    ctx.strokeStyle = dark;
    ctx.lineWidth = 5 * s;
    ctx.beginPath();
    ctx.moveTo(24 * s, (-48 + bob) * s);
    ctx.lineTo(34 * s, (-38 + bob) * s);
    ctx.stroke();
  }

  function drawRaptor(g) {
    const box = raptorBox(g);
    const s = depthScale(RAPTOR_Y);
    const cx = box.x + box.w / 2;
    const feetY = RAPTOR_Y;
    // Hit flash applies to every embodiment, sprite included.
    const blink = g.invincible > 0 && Math.floor(g.time * 14) % 2 === 0;
    if (currentRunner && spriteReady && spriteImg && !blink) {
      // Top-down GLB render, head up-screen (the asset is authored
      // head-up, so no rotation). Sized to the hitbox's footprint
      // with the model's real proportions: the sprite canvas is
      // square, the body length spans the hitbox height, anchored
      // so the head sits at the hitbox's top edge.
      const bob = reducedMotion ? 0 : Math.sin(runPhase) * 3 * s;
      const w = 116 * s;
      const h = 116 * s;
      ctx.save();
      ctx.translate(cx, feetY + bob);
      ctx.drawImage(spriteImg, -w / 2, -h, w, h);
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.translate(cx, feetY);
    ctx.rotate(-Math.PI / 2); // face up-screen (dead-ahead)
    ctx.scale(s, s);
    drawRaptorSprite(g, 1);
    ctx.restore();
  }

  function drawObstacle(o) {
    const b = obstacleBox(o);
    const s = depthScale(o.y);
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    if (o.type === 'spire') {
      const grad = ctx.createLinearGradient(0, -b.h / 2, 0, b.h / 2);
      grad.addColorStop(0, '#9a5678');
      grad.addColorStop(1, '#3d1c30');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(-b.w / 2, b.h / 2);
      ctx.lineTo(0, -b.h / 2);
      ctx.lineTo(b.w / 2, b.h / 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,150,180,0.25)';
      ctx.beginPath();
      ctx.moveTo(0, -b.h / 2);
      ctx.lineTo(b.w * 0.22, b.h / 2);
      ctx.lineTo(0, b.h / 2);
      ctx.closePath();
      ctx.fill();
    } else if (o.type === 'boulder') {
      const grad = ctx.createLinearGradient(0, -b.h / 2, 0, b.h / 2);
      grad.addColorStop(0, '#7a6a9a');
      grad.addColorStop(1, '#2c2340');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(0, 0, b.w / 2, b.h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(200,180,255,0.2)';
      ctx.beginPath();
      ctx.ellipse(-b.w * 0.12, -b.h * 0.16, b.w * 0.2, b.h * 0.18, -0.4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Rockfall: jagged chunk, pulses a warning glow.
      const pulse = reducedMotion ? 0 : (Math.sin(o.y * 0.05) * 0.5 + 0.5) * 0.25;
      ctx.fillStyle = `rgba(255,80,60,${0.15 + pulse})`;
      ctx.beginPath();
      ctx.arc(0, 0, b.w * 0.75, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4a3348';
      ctx.beginPath();
      const n = 7;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const rr = (b.w / 2) * (0.8 + ((i * 37) % 10) / 25);
        const px = Math.cos(a) * rr;
        const py = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,170,140,0.25)';
      ctx.beginPath();
      ctx.ellipse(-b.w * 0.12, -b.h * 0.15, b.w * 0.16, b.h * 0.14, -0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawRabbit(rb) {
    const b = rabbitBox(rb);
    const s = depthScale(rb.y);
    const cx = b.x + b.w / 2;
    const baseY = b.y + b.h; // rabbitBox already bakes in the hop
    ctx.save();
    ctx.translate(cx, baseY);
    ctx.scale(s, s);
    ctx.fillStyle = '#e8f4ff';
    // Body.
    ctx.beginPath();
    ctx.ellipse(0, -12, 14, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    // Head.
    ctx.beginPath();
    ctx.arc(12, -20, 8, 0, Math.PI * 2);
    ctx.fill();
    // Ears flop while hopping.
    const earSway = reducedMotion ? 0 : Math.sin(rb.hopPhase * 2) * 0.15;
    ctx.save();
    ctx.translate(12, -26);
    ctx.rotate(-0.2 + earSway);
    ctx.beginPath();
    ctx.ellipse(0, -8, 3.4, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(17, -26);
    ctx.rotate(0.15 + earSway);
    ctx.beginPath();
    ctx.ellipse(0, -8, 3.4, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Eye + tail.
    ctx.fillStyle = '#123';
    ctx.beginPath();
    ctx.arc(15, -21, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-14, -12, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  let g_time = 0;

  function draw(g, dt) {
    g_time = g.time;
    if (!reducedMotion) runPhase += dt * (6 + g.speed / 90);
    const esc = escalationAt(g.time);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, offX, offY);

    // Sky + horizon.
    ctx.drawImage(sky, 0, 0);

    // Canyon walls scroll DOWN toward the player (the world rushes past).
    const par = reducedMotion ? 0 : g.distancePx;
    const tileH = 480;
    const off = -(par * 0.9) % tileH;
    for (let wy = off - tileH; wy < WORLD_H + tileH; wy += tileH) {
      ctx.drawImage(wallFarL, TRACK_X0 - 130, wy, TRACK_X0, tileH);
      ctx.drawImage(wallL, 0, wy, TRACK_X0, tileH);
      ctx.drawImage(wallFarR, TRACK_X1, wy, TRACK_X0, tileH);
      ctx.drawImage(wallR, TRACK_X1 + TRACK_X0, wy, TRACK_X0, tileH);
    }

    // Track bed.
    const trackGrad = ctx.createLinearGradient(0, 0, 0, WORLD_H);
    trackGrad.addColorStop(0, '#1c1024');
    trackGrad.addColorStop(0.45, '#241426');
    trackGrad.addColorStop(1, '#140a1a');
    ctx.fillStyle = trackGrad;
    ctx.fillRect(TRACK_X0, 0, TRACK_X1 - TRACK_X0, WORLD_H);

    // Lane dashes scrolling toward the player.
    ctx.fillStyle = 'rgba(120,255,180,0.13)';
    const laneW = (TRACK_X1 - TRACK_X0) / 4;
    const dashOff = reducedMotion ? 0 : -(g.distancePx % 120);
    for (let l = 1; l < 4; l++) {
      const lx = TRACK_X0 + laneW * l;
      for (let dy2 = dashOff - 120; dy2 < WORLD_H + 120; dy2 += 120) {
        ctx.fillRect(lx - 2, dy2, 4, 52);
      }
    }
    // Wall-edge glow.
    ctx.fillStyle = 'rgba(255,140,90,0.35)';
    ctx.fillRect(TRACK_X0 - 3, 0, 3, WORLD_H);
    ctx.fillRect(TRACK_X1, 0, 3, WORLD_H);

    // Escalation: the track glows hotter as intensity rises.
    if (esc.level > 0) {
      const heat = Math.min(esc.level, 6);
      const hg = ctx.createLinearGradient(0, 0, 0, WORLD_H);
      hg.addColorStop(0, `rgba(255,60,30,${0.05 * heat})`);
      hg.addColorStop(1, 'rgba(255,60,30,0)');
      ctx.fillStyle = hg;
      ctx.fillRect(TRACK_X0, 0, TRACK_X1 - TRACK_X0, WORLD_H);
    }

    // Entities: far ones first so near ones draw on top.
    const drawables = [
      ...g.rabbits.map((r) => ({ y: r.y, draw: () => drawRabbit(r) })),
      ...g.obstacles.map((o) => ({ y: o.y, draw: () => drawObstacle(o) })),
    ];
    drawables.sort((a, b) => a.y - b.y);
    for (const d of drawables) d.draw();
    drawRaptor(g);

    // Dust.
    for (const p of g.dust) {
      const a = Math.max(p.life / p.maxLife, 0);
      ctx.fillStyle = `rgba(190,160,140,${0.55 * a})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5 * a + 1, 0, Math.PI * 2);
      ctx.fill();
    }

    // Vignette.
    const vg = ctx.createRadialGradient(
      WORLD_W / 2, WORLD_H * 0.55, WORLD_H * 0.3,
      WORLD_W / 2, WORLD_H * 0.55, WORLD_H * 0.75
    );
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vg;
    ctx.fillRect(-80, -80, WORLD_W + 160, WORLD_H + 160);
  }

  function dispose() {
    // All art is generated in-memory; nothing to release beyond GC.
    spriteImg = null;
    spriteReady = false;
  }

  return { draw, resize, dispose, setRunner };
}
