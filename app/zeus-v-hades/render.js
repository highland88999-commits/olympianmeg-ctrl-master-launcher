'use strict';

// Canvas renderer for the Neon Soul Race. Draws the 3-lane underworld track,
// obstacles, pickups, the player's lightning chariot, and a side progress
// rail showing Zeus vs Hades. Glow is restrained: small shadowBlur only on
// the glowing actors, never full-screen washes.

import { LANES, RACE_DISTANCE } from './race.js';

const VISIBLE_AHEAD = 260; // meters of track visible ahead of the player

const COLORS = {
  bg0: '#05010d',
  bg1: '#0d0221',
  road: '#0a0a1a',
  laneLine: 'rgba(0, 240, 255, 0.35)',
  edgeL: '#00f0ff',
  edgeR: '#ff0066',
  soul: '#00f0ff',
  bolt: '#ffe700',
  player: '#7df9ff',
  rival: '#ff2f7e',
  pillar: '#ff0066',
  spire: '#c300ff',
  ember: '#ff9500',
  text: '#e8fbff',
};

export function createRenderer(canvas, race, opts = {}) {
  const ctx = canvas.getContext('2d');
  const reducedMotion = !!opts.reducedMotion;
  let raf = 0;
  let w = 0;
  let h = 0;
  let dpr = 1;
  let smoothLaneX = 1; // interpolated lane position for the chariot
  let shakeT = 0;
  let lastT = 0;
  let embers = [];

  function seedEmbers() {
    embers = [];
    // Deterministic ambient embers from the race seed.
    let s = (race.seed ^ 0x9e3779b9) >>> 0;
    const rnd = () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = 0; i < 46; i++) {
      embers.push({ x: rnd(), y: rnd(), r: 0.6 + rnd() * 1.8, v: 0.02 + rnd() * 0.06, tw: rnd() * 6.28 });
    }
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = Math.max(1, Math.floor(rect.width * dpr));
    h = Math.max(1, Math.floor(rect.height * dpr));
    canvas.width = w;
    canvas.height = h;
  }

  const laneX = (i) => {
    const roadW = Math.min(w * 0.78, 560 * dpr);
    const cx = w / 2;
    return cx + (i - (LANES - 1) / 2) * (roadW / LANES);
  };
  const playerScreenY = () => h * 0.78;
  const pxPerM = () => (h * 0.7) / VISIBLE_AHEAD;
  const worldToY = (s) => playerScreenY() - (s - race.player.distance) * pxPerM();

  function drawBackground(t) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, COLORS.bg0);
    g.addColorStop(1, COLORS.bg1);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Ambient drifting embers (static when reduced motion).
    for (const e of embers) {
      const yy = reducedMotion ? e.y * h : ((e.y + t * e.v) % 1) * h;
      const tw = reducedMotion ? 0.5 : 0.25 + 0.35 * Math.abs(Math.sin(t * 1.4 + e.tw));
      ctx.fillStyle = `rgba(255, ${Math.floor(120 + 80 * tw)}, 40, ${0.25 + tw * 0.4})`;
      ctx.beginPath();
      ctx.arc(e.x * w, yy, e.r * dpr, 0, 6.283);
      ctx.fill();
    }
  }

  function drawRoad() {
    const top = 0;
    const bottom = h;
    ctx.fillStyle = COLORS.road;
    const roadW = Math.min(w * 0.78, 560 * dpr);
    ctx.fillRect(w / 2 - roadW / 2, top, roadW, bottom - top);

    // Neon edges: cyan (Zeus) left, magenta (Hades) right.
    ctx.fillStyle = COLORS.edgeL;
    ctx.fillRect(w / 2 - roadW / 2 - 2 * dpr, top, 2 * dpr, bottom);
    ctx.fillStyle = COLORS.edgeR;
    ctx.fillRect(w / 2 + roadW / 2, top, 2 * dpr, bottom);

    // Scrolling dashed lane dividers.
    const ppm = pxPerM();
    const dash = 26 * dpr;
    const gap = 20 * dpr;
    const offset = (race.player.distance * ppm) % (dash + gap);
    ctx.strokeStyle = COLORS.laneLine;
    ctx.lineWidth = 2 * dpr;
    ctx.setLineDash([dash, gap]);
    ctx.lineDashOffset = -offset;
    ctx.beginPath();
    for (let i = 1; i < LANES; i++) {
      const x = w / 2 - roadW / 2 + (roadW / LANES) * i;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawPickup(pk) {
    const y = worldToY(pk.s);
    if (y < -30 || y > h + 30) return;
    const x = laneX(pk.lane);
    ctx.save();
    if (pk.kind === 'soul') {
      ctx.shadowColor = COLORS.soul;
      ctx.shadowBlur = 10 * dpr;
      ctx.fillStyle = COLORS.soul;
      ctx.beginPath();
      ctx.arc(x, y, 7 * dpr, 0, 6.283);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#eaffff';
      ctx.beginPath();
      ctx.arc(x, y, 2.6 * dpr, 0, 6.283);
      ctx.fill();
    } else {
      // Lightning bolt pickup.
      ctx.shadowColor = COLORS.bolt;
      ctx.shadowBlur = 10 * dpr;
      ctx.fillStyle = COLORS.bolt;
      const s = 11 * dpr;
      ctx.beginPath();
      ctx.moveTo(x + s * 0.15, y - s);
      ctx.lineTo(x - s * 0.45, y + s * 0.1);
      ctx.lineTo(x - s * 0.02, y + s * 0.1);
      ctx.lineTo(x - s * 0.15, y + s);
      ctx.lineTo(x + s * 0.45, y - s * 0.1);
      ctx.lineTo(x + s * 0.02, y - s * 0.1);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  function drawObstacle(o) {
    const y = worldToY(o.s);
    if (y < -60 || y > h + 60) return;
    const x = laneX(o.lane);
    const u = dpr;
    ctx.save();
    if (o.kind === 'pillar') {
      // Hellfire pillar: magenta flame column.
      const hw = 16 * u;
      const hh = 44 * u;
      const g = ctx.createLinearGradient(0, y - hh, 0, y + hh * 0.3);
      g.addColorStop(0, 'rgba(255,0,102,0)');
      g.addColorStop(0.55, 'rgba(255,0,102,0.85)');
      g.addColorStop(1, 'rgba(255,47,126,1)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - hw, y + hh * 0.3);
      ctx.quadraticCurveTo(x - hw * 0.4, y - hh * 0.4, x, y - hh);
      ctx.quadraticCurveTo(x + hw * 0.4, y - hh * 0.4, x + hw, y + hh * 0.3);
      ctx.closePath();
      ctx.fill();
    } else if (o.kind === 'spire') {
      // Rock spire: dark crystal with violet edge.
      const hw = 15 * u;
      const hh = 40 * u;
      ctx.fillStyle = '#160a2e';
      ctx.strokeStyle = COLORS.spire;
      ctx.lineWidth = 2 * u;
      ctx.beginPath();
      ctx.moveTo(x - hw, y + hh * 0.4);
      ctx.lineTo(x, y - hh);
      ctx.lineTo(x + hw, y + hh * 0.4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      // Falling ember: bright orange orb with small halo.
      ctx.shadowColor = COLORS.ember;
      ctx.shadowBlur = 8 * u;
      ctx.fillStyle = COLORS.ember;
      ctx.beginPath();
      ctx.arc(x, y, 8 * u, 0, 6.283);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  function drawPlayer(t) {
    smoothLaneX += (race.player.lane - smoothLaneX) * 0.22;
    const laneW = laneX(1) - laneX(0);
    const x = laneX(0) + smoothLaneX * laneW;
    const y = playerScreenY();
    const u = dpr;
    const boosting = race.player.boostTime > 0;
    const blink = race.player.invulnTime > 0 && !boosting && Math.floor(t * 12) % 2 === 0;
    ctx.save();
    if (blink) ctx.globalAlpha = 0.35;

    // Boost trail.
    if (boosting) {
      ctx.strokeStyle = 'rgba(0,240,255,0.5)';
      ctx.lineWidth = 3 * u;
      for (let k = 1; k <= 3; k++) {
        ctx.beginPath();
        ctx.moveTo(x - 8 * u, y + k * 14 * u);
        ctx.lineTo(x + 8 * u, y + k * 14 * u);
        ctx.stroke();
      }
    }

    // Lightning chariot: sleek cyan dart.
    ctx.shadowColor = COLORS.edgeL;
    ctx.shadowBlur = 12 * u;
    ctx.fillStyle = '#0e3a4a';
    ctx.strokeStyle = COLORS.player;
    ctx.lineWidth = 2 * u;
    const s = 16 * u;
    ctx.beginPath();
    ctx.moveTo(x, y - s * 1.4);
    ctx.lineTo(x + s * 0.75, y + s * 0.5);
    ctx.lineTo(x, y + s * 0.1);
    ctx.lineTo(x - s * 0.75, y + s * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    // Core light.
    ctx.fillStyle = '#eaffff';
    ctx.beginPath();
    ctx.arc(x, y - s * 0.35, 3.4 * u, 0, 6.283);
    ctx.fill();
    ctx.restore();
  }

  function drawRail() {
    // Side progress rail: Zeus (cyan) vs Hades (magenta) to the finish.
    const rx = w - 26 * dpr;
    const top = h * 0.12;
    const bot = h * 0.82;
    const rh = bot - top;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(rx - 3 * dpr, top, 6 * dpr, rh);
    // Finish flag.
    ctx.fillStyle = COLORS.text;
    ctx.font = `${12 * dpr}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('🏁', rx, top - 8 * dpr);

    const dot = (dist, color, label) => {
      const yy = bot - Math.min(1, dist / RACE_DISTANCE) * rh;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8 * dpr;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(rx, yy, 6 * dpr, 0, 6.283);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = color;
      ctx.font = `${9 * dpr}px sans-serif`;
      ctx.fillText(label, rx, yy - 10 * dpr);
    };
    dot(race.rival.distance, COLORS.rival, 'H');
    dot(race.player.distance, COLORS.edgeL, 'Z');
    ctx.restore();
  }

  function frame(now) {
    const t = now / 1000;
    const dt = Math.min(0.05, t - (lastT || t));
    lastT = t;

    ctx.save();
    if (shakeT > 0 && !reducedMotion) {
      const m = shakeT * 8 * dpr;
      ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
      shakeT = Math.max(0, shakeT - dt * 3);
    }

    drawBackground(t);
    drawRoad();
    for (const pk of race.pickups) drawPickup(pk);
    for (const o of race.obstacles) drawObstacle(o);
    drawPlayer(t);
    drawRail();
    ctx.restore();

    raf = requestAnimationFrame(frame);
  }

  return {
    resize,
    shake() {
      if (!reducedMotion) shakeT = 1;
    },
    start() {
      seedEmbers();
      resize();
      window.addEventListener('resize', resize);
      raf = requestAnimationFrame(frame);
    },
    dispose() {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    },
  };
}
