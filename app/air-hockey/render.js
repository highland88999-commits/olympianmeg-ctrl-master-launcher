// Air Hockey — 2D canvas renderer. Procedural drawing only, no images.
import {
  TABLE_W, TABLE_H, PUCK_R, MALLET_R, GOAL_W,
} from './physics.js';

const CX = TABLE_W / 2;

// CGI pass (2026-11-14): the table, mallets and puck are lit like a real
// arena piece — animated light sweep, pulsing air holes, goal glow that
// answers the puck, domed mallets with motion trails, a spinning puck with
// a visible spin marker, and a goal-flash ring. Rules live in physics.js;
// this file only draws. drawScene's 4th arg is seconds (0 = frozen, for
// reduced motion and for the old callers/tests that pass no time).

// Puck spin accumulates from puck speed across frames (single game at a
// time, so module state is safe here).
let puckSpin = 0;
let puckLastT = -1;

export function drawTable(ctx, game, visual = 'classic', t = 0) {
  const kaleido = visual === 'kaleidoscope';

  // Felt — or Merlin's translucent surface over his kaleidoscope
  // (his build: black, transparent, opacity 0.75).
  if (kaleido) {
    ctx.fillStyle = 'rgba(2, 6, 12, 0.72)';
    ctx.fillRect(0, 0, TABLE_W, TABLE_H);
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, TABLE_H);
    g.addColorStop(0, '#0d2436');
    g.addColorStop(0.5, '#0a1a29');
    g.addColorStop(1, '#0d2436');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, TABLE_W, TABLE_H);
  }

  // Animated light sweep drifting across the felt.
  const sweepX = ((t * 60) % (TABLE_W + 480)) - 240;
  const sg = ctx.createLinearGradient(sweepX - 90, 0, sweepX + 90, 0);
  sg.addColorStop(0, 'rgba(255,255,255,0)');
  sg.addColorStop(0.5, 'rgba(255,255,255,0.05)');
  sg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sg;
  ctx.fillRect(0, 0, TABLE_W, TABLE_H);

  // Air holes: subtle dotted grid, gently pulsing like the air is on.
  for (let y = 24; y < TABLE_H; y += 36) {
    for (let x = 24; x < TABLE_W; x += 36) {
      ctx.fillStyle = `rgba(140, 200, 255, ${0.07 + 0.05 * (0.5 + 0.5 * Math.sin(t * 2 + x * 0.05 + y * 0.04))})`;
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Center line + circle (circle breathes with the arena light)
  ctx.strokeStyle = `rgba(0, 229, 255, ${0.45 + 0.15 * Math.sin(t * 2)})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, TABLE_H / 2);
  ctx.lineTo(TABLE_W, TABLE_H / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(CX, TABLE_H / 2, 52 + 3 * Math.sin(t * 2), 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(0, 229, 255, 0.5)';
  ctx.beginPath();
  ctx.arc(CX, TABLE_H / 2, 4, 0, Math.PI * 2);
  ctx.fill();

  // Goals: glowing mouths on top/bottom edges — they flare as the puck
  // closes in.
  const gw = GOAL_W / 2;
  const puck = game.puck;
  for (const y of [0, TABLE_H]) {
    const dist = puck ? Math.hypot(puck.x - CX, puck.y - y) : 9999;
    const flare = Math.max(0, 1 - dist / 160);
    const gg = ctx.createLinearGradient(0, y === 0 ? 0 : TABLE_H, 0, y === 0 ? 26 : TABLE_H - 26);
    gg.addColorStop(0, `rgba(255, 90, 90, ${0.6 + 0.35 * flare})`);
    gg.addColorStop(1, 'rgba(255, 90, 90, 0)');
    ctx.fillStyle = gg;
    ctx.fillRect(CX - gw, y === 0 ? 0 : TABLE_H - 26, GOAL_W, 26);
    ctx.strokeStyle = '#ff5a5a';
    ctx.lineWidth = 5;
    ctx.beginPath();
    if (y === 0) {
      ctx.moveTo(CX - gw, 0); ctx.lineTo(CX - gw, 16);
      ctx.moveTo(CX + gw, 0); ctx.lineTo(CX + gw, 16);
    } else {
      ctx.moveTo(CX - gw, TABLE_H); ctx.lineTo(CX - gw, TABLE_H - 16);
      ctx.moveTo(CX + gw, TABLE_H); ctx.lineTo(CX + gw, TABLE_H - 16);
    }
    ctx.stroke();
  }

  // Rails (skip the goal mouths). Kaleidoscope mode wears Merlin's deep blue
  // frame from his version (0x1e40af); classic keeps the launcher's rails.
  // Metallic sheen: a pale inner rail line + corner bolts.
  ctx.strokeStyle = kaleido ? '#1e40af' : '#1e3a52';
  ctx.lineWidth = 10;
  ctx.strokeRect(0, 0, TABLE_W, TABLE_H);
  ctx.strokeStyle = 'rgba(226, 232, 240, 0.35)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(5, 5, TABLE_W - 10, TABLE_H - 10);
  ctx.fillStyle = '#94a3b8';
  for (const [bx, by] of [[8, 8], [TABLE_W - 8, 8], [8, TABLE_H - 8], [TABLE_W - 8, TABLE_H - 8]]) {
    ctx.beginPath();
    ctx.arc(bx, by, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = kaleido ? '#00ffcc' : `rgba(0, 229, 255, ${0.55 + 0.25 * Math.sin(t * 2)})`;
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, TABLE_W, TABLE_H);
}

export function drawMallet(ctx, m, color, glow, t = 0) {
  void t;
  ctx.save();
  // Motion trail: fading ghosts along the mallet's velocity.
  const vx = m.vx || 0;
  const vy = m.vy || 0;
  for (let k = 2; k >= 1; k--) {
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.10 / k;
    ctx.beginPath();
    ctx.arc(m.x - vx * 0.014 * k, m.y - vy * 0.014 * k, MALLET_R * (1 - k * 0.06), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Drop shadow, offset like a low arena light.
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(m.x + 4, m.y + 6, MALLET_R * 0.95, MALLET_R * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = glow;
  ctx.shadowBlur = 18;
  // Domed base: radial light from the top-left, darker rim.
  const dome = ctx.createRadialGradient(m.x - 8, m.y - 10, 2, m.x, m.y, MALLET_R);
  dome.addColorStop(0, 'rgba(255,255,255,0.55)');
  dome.addColorStop(0.35, color);
  dome.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = dome;
  ctx.beginPath();
  ctx.arc(m.x, m.y, MALLET_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  // inner ring
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(m.x, m.y, MALLET_R - 8, 0, Math.PI * 2);
  ctx.stroke();
  // handle knob, domed too
  const knob = ctx.createRadialGradient(m.x - 2, m.y - 3, 1, m.x, m.y, 7);
  knob.addColorStop(0, '#ffffff');
  knob.addColorStop(1, 'rgba(148,163,184,0.9)');
  ctx.fillStyle = knob;
  ctx.beginPath();
  ctx.arc(m.x, m.y, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawPuck(ctx, puck, t = 0) {
  // Spin accumulates from puck speed; frozen when t stands still.
  const dt = puckLastT < 0 ? 0 : Math.max(0, Math.min(0.1, t - puckLastT));
  puckLastT = t;
  const speed = Math.hypot(puck.vx || 0, puck.vy || 0);
  puckSpin += speed * dt * 0.02;

  ctx.save();
  // Drop shadow, shrinking as the puck rides the air cushion.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(puck.x + 3, puck.y + 4, PUCK_R * 0.9, PUCK_R * 0.75, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = '#ffffff';
  ctx.shadowBlur = 12;
  // Domed puck: bright top-left, darker rim.
  const dome = ctx.createRadialGradient(puck.x - 4, puck.y - 5, 1, puck.x, puck.y, PUCK_R);
  dome.addColorStop(0, '#ffffff');
  dome.addColorStop(0.6, '#f4f7ff');
  dome.addColorStop(1, '#9fb0c8');
  ctx.fillStyle = dome;
  ctx.beginPath();
  ctx.arc(puck.x, puck.y, PUCK_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  // Spin marker: a red dot orbiting the face so the spin reads.
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.arc(puck.x + Math.cos(puckSpin) * 6, puck.y + Math.sin(puckSpin) * 6, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(puck.x, puck.y, PUCK_R - 5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function drawScene(ctx, game, visual = 'classic', t = 0) {
  ctx.clearRect(0, 0, TABLE_W, TABLE_H);
  drawTable(ctx, game, visual, t);
  drawMallet(ctx, game.ai, '#c62f3d', '#ff5a5a', t);
  drawMallet(ctx, game.player, '#0f9db8', '#00e5ff', t);
  if (game.state !== 'menu') drawPuck(ctx, game.puck, t);

  // Countdown digits
  if (game.state === 'countdown') {
    const n = Math.ceil(game.countdown);
    ctx.save();
    ctx.shadowColor = 'rgba(0, 229, 255, 0.8)';
    ctx.shadowBlur = 24;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = '900 120px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(n), CX, TABLE_H / 2);
    ctx.restore();
  }

  // "Goal!" flash — expanding ring + sparks, driven by the scored timer.
  if (game.state === 'scored') {
    const progress = Math.max(0, Math.min(1, 1 - game.scoredTimer / 1.4));
    const goalColor = game.lastScorer === 'player' ? '#00e5ff' : '#ff5a5a';
    ctx.save();
    ctx.strokeStyle = goalColor;
    ctx.globalAlpha = (1 - progress) * 0.7;
    ctx.lineWidth = 6 * (1 - progress) + 1;
    ctx.beginPath();
    ctx.arc(CX, TABLE_H / 2, 40 + progress * 170, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = (1 - progress) * 0.9;
    ctx.fillStyle = goalColor;
    for (let i = 0; i < 12; i++) {
      const a = i * 2.399;
      const r = 30 + progress * 190;
      ctx.beginPath();
      ctx.arc(CX + Math.cos(a) * r, TABLE_H / 2 + Math.sin(a) * r, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.save();
    ctx.fillStyle = goalColor;
    ctx.font = '900 64px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(game.lastScorer === 'player' ? 'GOAL!' : 'RIVAL SCORES', CX, TABLE_H / 2);
    ctx.restore();
  }
}
