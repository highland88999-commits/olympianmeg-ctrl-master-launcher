// Omega Pinball — canvas renderer. Kaleidoscope neon theme with restrained,
// localized glow (shadowBlur only on the ball, bumpers and lit targets).
// No external assets; the mandala backdrop is drawn procedurally once to an
// offscreen canvas.

import { TABLE_W, TABLE_H, TOP_ARC, GATE, flipperTip } from './physics.js';

const COLORS = {
  bg0: '#07070f',
  bg1: '#0d0a1e',
  cyan: '#00ffcc',
  magenta: '#ff2fd6',
  gold: '#ffc233',
  violet: '#7a5cff',
  wall: '#3ae0ff',
  dimWall: 'rgba(58, 224, 255, 0.55)',
};

function makeBackdrop() {
  const s = 900;
  const c = document.createElement('canvas');
  c.width = s;
  c.height = s;
  const g = c.getContext('2d');
  g.translate(s / 2, s / 2);
  const petals = 12;
  for (let ring = 0; ring < 4; ring++) {
    const r0 = 60 + ring * 90;
    for (let i = 0; i < petals; i++) {
      const a = (i / petals) * Math.PI * 2 + ring * 0.26;
      const hue = (i * 30 + ring * 45) % 360;
      g.save();
      g.rotate(a);
      const grad = g.createRadialGradient(r0, 0, 4, r0, 0, 90);
      grad.addColorStop(0, `hsla(${hue}, 100%, 60%, 0.16)`);
      grad.addColorStop(1, 'hsla(0, 0%, 0%, 0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(r0, 0, 90, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  }
  // Fine mandala lines
  g.strokeStyle = 'rgba(122, 92, 255, 0.10)';
  g.lineWidth = 1;
  for (let ring = 1; ring <= 6; ring++) {
    g.beginPath();
    g.arc(0, 0, ring * 70, 0, Math.PI * 2);
    g.stroke();
  }
  return c;
}

export function createRenderer(canvas, opts = {}) {
  const ctx = canvas.getContext('2d');
  const reducedMotion = !!opts.reducedMotion;
  const backdrop = makeBackdrop();
  let rot = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(rect.width / TABLE_W, rect.height / TABLE_H);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    return { dpr, scale, rect };
  }

  function roundSeg(x1, y1, x2, y2, r, color, glow) {
    ctx.strokeStyle = color;
    ctx.lineWidth = r * 2;
    ctx.lineCap = 'round';
    if (glow) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 14; // localized neon glow, not a full-scene bloom
    }
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  function render(game, dt) {
    const { dpr, scale, rect } = resize();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Letterbox the 400x800 table into the element.
    const ox = (rect.width - TABLE_W * scale) / 2;
    const oy = (rect.height - TABLE_H * scale) / 2;
    ctx.clearRect(0, 0, rect.width, rect.height);

    // Background
    const bgGrad = ctx.createLinearGradient(0, 0, 0, rect.height);
    bgGrad.addColorStop(0, COLORS.bg1);
    bgGrad.addColorStop(1, COLORS.bg0);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, rect.width, rect.height);

    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);

    // Kaleidoscope mandala backdrop (slow drift; static when reduced motion)
    if (!reducedMotion) rot += dt * 0.05;
    ctx.save();
    ctx.translate(TABLE_W / 2, TABLE_H * 0.42);
    ctx.rotate(rot);
    ctx.globalAlpha = 0.5;
    ctx.drawImage(backdrop, -450, -450);
    ctx.restore();
    ctx.globalAlpha = 1;

    // Playfield floor tint
    ctx.fillStyle = 'rgba(10, 12, 28, 0.72)';
    ctx.fillRect(0, 0, TABLE_W, TABLE_H);

    // Top arc
    ctx.strokeStyle = COLORS.dimWall;
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(TOP_ARC.cx, TOP_ARC.cy, TOP_ARC.r, TOP_ARC.a0, TOP_ARC.a1);
    ctx.stroke();

    // Walls
    for (const w of game.walls) {
      roundSeg(w.ax, w.ay, w.bx, w.by, 5, COLORS.dimWall, false);
    }

    // Lane gate marker
    if (game.gateArmed) {
      ctx.strokeStyle = COLORS.gold;
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.moveTo(GATE.x0, GATE.y);
      ctx.lineTo(GATE.x1, GATE.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Slingshots
    for (const s of game.slings) {
      const c = s.flash > 0 ? COLORS.gold : COLORS.magenta;
      roundSeg(s.ax, s.ay, s.bx, s.by, 7, c, s.flash > 0);
    }

    // Rollover targets
    for (const t of game.targets) {
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      if (t.lit) {
        ctx.shadowColor = COLORS.gold;
        ctx.shadowBlur = 16;
        ctx.fillStyle = COLORS.gold;
      } else {
        ctx.fillStyle = 'rgba(255, 194, 51, 0.18)';
      }
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = t.lit ? '#fff2cf' : 'rgba(255,194,51,0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();
      // star tick
      ctx.strokeStyle = t.lit ? '#5a3c00' : 'rgba(255,194,51,0.6)';
      ctx.beginPath();
      ctx.moveTo(t.x - 5, t.y);
      ctx.lineTo(t.x + 5, t.y);
      ctx.moveTo(t.x, t.y - 5);
      ctx.lineTo(t.x, t.y + 5);
      ctx.stroke();
    }

    // Bumpers
    for (const b of game.bumpers) {
      const hot = b.flash > 0;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      if (hot) {
        ctx.shadowColor = COLORS.cyan;
        ctx.shadowBlur = 22;
      }
      const g = ctx.createRadialGradient(b.x, b.y, 2, b.x, b.y, b.r);
      g.addColorStop(0, hot ? '#ffffff' : '#123a44');
      g.addColorStop(0.55, hot ? COLORS.cyan : '#0e5a66');
      g.addColorStop(1, '#08232b');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = hot ? '#eafffb' : COLORS.cyan;
      ctx.lineWidth = 3;
      ctx.stroke();
      // inner ring
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 0.45, 0, Math.PI * 2);
      ctx.strokeStyle = hot ? '#ffffff' : 'rgba(0,255,204,0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Flippers
    for (const side of ['left', 'right']) {
      const f = game.flippers[side];
      const tip = flipperTip(f);
      const c = f.pressed ? COLORS.magenta : COLORS.violet;
      roundSeg(f.pivot.x, f.pivot.y, tip.x, tip.y, 9, c, f.pressed);
      ctx.beginPath();
      ctx.arc(f.pivot.x, f.pivot.y, 7, 0, Math.PI * 2);
      ctx.fillStyle = '#0b0b16';
      ctx.fill();
      ctx.strokeStyle = c;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Plunger lane: charge gauge
    if (game.mode === 'serve') {
      const ch = game.plunger.charge;
      const gx = 360;
      const gy0 = 770;
      const gh = 120 * ch;
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(gx - 14, gy0 - 120, 28, 120);
      const pg = ctx.createLinearGradient(0, gy0, 0, gy0 - 120);
      pg.addColorStop(0, COLORS.magenta);
      pg.addColorStop(1, COLORS.gold);
      ctx.fillStyle = pg;
      ctx.fillRect(gx - 14, gy0 - gh, 28, gh);
    }

    // Ball (only when live)
    if (game.mode === 'play' || game.mode === 'serve') {
      const b = game.ball;
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 18;
      const g = ctx.createRadialGradient(b.x - 3, b.y - 3, 1, b.x, b.y, b.r + 2);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.6, '#ffd7f4');
      g.addColorStop(1, COLORS.magenta);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Tracking reticle — the ball is 8 units wide (~20px on a TV) and its
      // glow alone washes out against the backdrop art, so until now there
      // was no visible marker to aim/time flips by. A crisp crosshair ring
      // rides the ball in serve + play: dark under-stroke for contrast on
      // bright art, white ring + ticks on top, no shadowBlur dependence.
      // Static radius under reduced motion; gentle pulse otherwise.
      const pulse = reducedMotion ? 0 : Math.sin((game.time || 0) * 6) * 1.2;
      const rr = b.r + 7 + pulse;
      ctx.lineWidth = 3.4;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.65)';
      ctx.beginPath();
      ctx.arc(b.x, b.y, rr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(b.x, b.y, rr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 2.4;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        ctx.beginPath();
        ctx.moveTo(b.x + dx * (rr + 1.5), b.y + dy * (rr + 1.5));
        ctx.lineTo(b.x + dx * (rr + 6.5), b.y + dy * (rr + 6.5));
        ctx.stroke();
      }
    }

    // Event flashes (floating score text)
    ctx.textAlign = 'center';
    for (const e of game.fx || []) {
      if (e.text) {
        ctx.font = 'bold 20px system-ui, sans-serif';
        ctx.fillStyle = e.color || '#ffffff';
        ctx.shadowColor = e.color || '#ffffff';
        ctx.shadowBlur = 10;
        ctx.fillText(e.text, e.x, e.y);
        ctx.shadowBlur = 0;
      }
    }

    ctx.restore();
  }

  return { render, resize };
}
