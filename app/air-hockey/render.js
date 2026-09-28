// Air Hockey — 2D canvas renderer. Procedural drawing only, no images.
import {
  TABLE_W, TABLE_H, PUCK_R, MALLET_R, GOAL_W,
} from './physics.js';

const CX = TABLE_W / 2;

export function drawTable(ctx, game) {
  // Felt
  const g = ctx.createLinearGradient(0, 0, 0, TABLE_H);
  g.addColorStop(0, '#0d2436');
  g.addColorStop(0.5, '#0a1a29');
  g.addColorStop(1, '#0d2436');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, TABLE_W, TABLE_H);

  // Air holes: subtle dotted grid
  ctx.fillStyle = 'rgba(140, 200, 255, 0.10)';
  for (let y = 24; y < TABLE_H; y += 36) {
    for (let x = 24; x < TABLE_W; x += 36) {
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Center line + circle
  ctx.strokeStyle = 'rgba(0, 229, 255, 0.55)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, TABLE_H / 2);
  ctx.lineTo(TABLE_W, TABLE_H / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(CX, TABLE_H / 2, 52, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(0, 229, 255, 0.5)';
  ctx.beginPath();
  ctx.arc(CX, TABLE_H / 2, 4, 0, Math.PI * 2);
  ctx.fill();

  // Goals: glowing mouths on top/bottom edges
  const gw = GOAL_W / 2;
  for (const y of [0, TABLE_H]) {
    const gg = ctx.createLinearGradient(0, y === 0 ? 0 : TABLE_H, 0, y === 0 ? 26 : TABLE_H - 26);
    gg.addColorStop(0, 'rgba(255, 90, 90, 0.85)');
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

  // Rails (skip the goal mouths)
  ctx.strokeStyle = '#1e3a52';
  ctx.lineWidth = 10;
  ctx.strokeRect(0, 0, TABLE_W, TABLE_H);
  ctx.strokeStyle = '#00e5ff';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, TABLE_W, TABLE_H);
}

export function drawMallet(ctx, m, color, glow) {
  ctx.save();
  ctx.shadowColor = glow;
  ctx.shadowBlur = 18;
  // base
  ctx.fillStyle = color;
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
  // handle knob
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.arc(m.x, m.y, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawPuck(ctx, puck) {
  ctx.save();
  ctx.shadowColor = '#ffffff';
  ctx.shadowBlur = 12;
  ctx.fillStyle = '#f4f7ff';
  ctx.beginPath();
  ctx.arc(puck.x, puck.y, PUCK_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.arc(puck.x, puck.y, PUCK_R - 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawScene(ctx, game) {
  ctx.clearRect(0, 0, TABLE_W, TABLE_H);
  drawTable(ctx, game);
  drawMallet(ctx, game.ai, '#c62f3d', '#ff5a5a');
  drawMallet(ctx, game.player, '#0f9db8', '#00e5ff');
  if (game.state !== 'menu') drawPuck(ctx, game.puck);

  // Countdown digits
  if (game.state === 'countdown') {
    const n = Math.ceil(game.countdown);
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = '900 120px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(n), CX, TABLE_H / 2);
    ctx.restore();
  }

  // "Goal!" flash
  if (game.state === 'scored') {
    ctx.save();
    ctx.fillStyle = game.lastScorer === 'player' ? '#00e5ff' : '#ff5a5a';
    ctx.font = '900 64px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(game.lastScorer === 'player' ? 'GOAL!' : 'RIVAL SCORES', CX, TABLE_H / 2);
    ctx.restore();
  }
}
