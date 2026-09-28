// Raptor Rush — 2D canvas renderer. All art is procedural (no assets, no network).
// Renders the game state produced by game.js.

import {
  WORLD_W,
  WORLD_H,
  GROUND_Y,
  RAPTOR_X,
  OBSTACLE_TYPES,
  raptorBox,
  obstacleBox,
  rabbitBox,
} from './game';

function makeSky(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d');
  const grad = x.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#0b0620');
  grad.addColorStop(0.55, '#1c0f33');
  grad.addColorStop(0.8, '#3a1630');
  grad.addColorStop(1, '#0a0512');
  x.fillStyle = grad;
  x.fillRect(0, 0, w, h);
  // Stars.
  for (let i = 0; i < 110; i++) {
    const sx = (i * 733) % w;
    const sy = (i * 389) % Math.floor(h * 0.6);
    const tw = 0.4 + ((i * 17) % 10) / 14;
    x.fillStyle = `rgba(200,220,255,${tw})`;
    x.fillRect(sx, sy, 2, 2);
  }
  // Low sun.
  const sun = x.createRadialGradient(w * 0.72, h * 0.62, 4, w * 0.72, h * 0.62, 120);
  sun.addColorStop(0, 'rgba(255,120,60,0.55)');
  sun.addColorStop(1, 'rgba(255,120,60,0)');
  x.fillStyle = sun;
  x.fillRect(0, 0, w, h);
  return c;
}

function makeMesaLayer(w, h, color, seed, baseY, amp) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = color;
  x.beginPath();
  x.moveTo(0, h);
  let px = 0;
  let i = 0;
  while (px < w) {
    const segW = 90 + ((seed * (i + 3) * 137) % 130);
    const peak = baseY - ((seed * (i + 7) * 251) % amp);
    x.lineTo(px + segW * 0.25, peak);
    x.lineTo(px + segW * 0.55, peak);
    x.lineTo(px + segW * 0.8, baseY - ((seed * (i + 11) * 97) % (amp * 0.5)));
    px += segW;
    i++;
  }
  x.lineTo(w, h);
  x.closePath();
  x.fill();
  return c;
}

export function createRenderer(canvas, opts = {}) {
  const ctx = canvas.getContext('2d');
  const reducedMotion = !!opts.reducedMotion;
  let scale = 1;
  let offX = 0;
  let offY = 0;
  let runPhase = 0;

  const sky = makeSky(WORLD_W, WORLD_H);
  const far = makeMesaLayer(WORLD_W, WORLD_H, '#150b26', 7, 430, 150);
  const near = makeMesaLayer(WORLD_W, WORLD_H, '#1e1030', 13, 470, 80);

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

  function drawRaptor(g) {
    const box = raptorBox(g);
    const sliding = g.raptor.sliding > 0;
    const air = g.raptor.y > 1;
    const cx = box.x + box.w / 2;
    const feetY = GROUND_Y - g.raptor.y;
    const blink = g.invincible > 0 && Math.floor(g.time * 14) % 2 === 0;
    if (blink) return; // hit flash

    ctx.save();
    ctx.translate(cx, feetY);

    const body = '#43d17c';
    const dark = '#1e7a44';
    const belly = '#b8f0cd';

    if (sliding) {
      // Low lunge pose.
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.ellipse(0, -22, 46, 18, 0, 0, Math.PI * 2);
      ctx.fill();
      // Tail sweeping back.
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.moveTo(-40, -26);
      ctx.lineTo(-78, -14);
      ctx.lineTo(-40, -14);
      ctx.closePath();
      ctx.fill();
      // Head low and forward.
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.ellipse(44, -30, 16, 11, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0c2b1a';
      ctx.beginPath();
      ctx.arc(48, -32, 2.6, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const bob = air ? 0 : reducedMotion ? 0 : Math.sin(runPhase) * 3;
      // Tail.
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.moveTo(-26, -58 + bob);
      ctx.lineTo(-72, -40 + bob * 0.5);
      ctx.lineTo(-26, -44 + bob);
      ctx.closePath();
      ctx.fill();
      // Legs.
      ctx.strokeStyle = dark;
      ctx.lineWidth = 9;
      ctx.lineCap = 'round';
      const l1 = air ? -14 : Math.sin(runPhase) * 16;
      const l2 = air ? 10 : Math.sin(runPhase + Math.PI) * 16;
      ctx.beginPath();
      ctx.moveTo(-6, -34 + bob);
      ctx.lineTo(-6 + l1, 0);
      ctx.moveTo(10, -34 + bob);
      ctx.lineTo(10 + l2, 0);
      ctx.stroke();
      // Body.
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.ellipse(2, -52 + bob, 34, 22, -0.12, 0, Math.PI * 2);
      ctx.fill();
      // Belly.
      ctx.fillStyle = belly;
      ctx.beginPath();
      ctx.ellipse(6, -44 + bob, 22, 12, -0.1, 0, Math.PI * 2);
      ctx.fill();
      // Back stripes.
      ctx.fillStyle = dark;
      for (let s = 0; s < 3; s++) {
        ctx.fillRect(-16 + s * 14, -72 + bob, 6, 10);
      }
      // Neck + head.
      ctx.fillStyle = body;
      ctx.save();
      ctx.translate(26, -62 + bob);
      ctx.rotate(air ? -0.25 : -0.1);
      ctx.beginPath();
      ctx.ellipse(8, -12, 10, 16, 0.25, 0, Math.PI * 2);
      ctx.fill();
      // Snout.
      ctx.beginPath();
      ctx.ellipse(20, -20, 14, 8, 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // Eye.
      ctx.fillStyle = '#0c2b1a';
      ctx.beginPath();
      ctx.arc(38, -80 + bob, 3.2, 0, Math.PI * 2);
      ctx.fill();
      // Tiny arms.
      ctx.strokeStyle = dark;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(24, -48 + bob);
      ctx.lineTo(34, -38 + bob);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawObstacle(o) {
    const b = obstacleBox(o);
    const t = OBSTACLE_TYPES[o.type];
    ctx.save();
    if (o.type === 'spire') {
      const grad = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
      grad.addColorStop(0, '#8a4b6b');
      grad.addColorStop(1, '#3d1c30');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y + b.h);
      ctx.lineTo(b.x + b.w * 0.5, b.y);
      ctx.lineTo(b.x + b.w, b.y + b.h);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,150,180,0.25)';
      ctx.beginPath();
      ctx.moveTo(b.x + b.w * 0.5, b.y);
      ctx.lineTo(b.x + b.w * 0.72, b.y + b.h);
      ctx.lineTo(b.x + b.w * 0.5, b.y + b.h);
      ctx.closePath();
      ctx.fill();
    } else if (o.type === 'boulder') {
      const grad = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
      grad.addColorStop(0, '#6b5a8a');
      grad.addColorStop(1, '#2c2340');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(200,180,255,0.2)';
      ctx.beginPath();
      ctx.ellipse(b.x + b.w * 0.38, b.y + b.h * 0.34, b.w * 0.2, b.h * 0.18, -0.4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Hanging vines from a branch stub.
      ctx.fillStyle = '#241a12';
      ctx.fillRect(b.x - 6, b.y - 14, b.w + 12, 16);
      ctx.strokeStyle = '#2f8f4e';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      const strands = 5;
      for (let s = 0; s < strands; s++) {
        const vx = b.x + 8 + (s / (strands - 1)) * (b.w - 16);
        const sway = reducedMotion ? 0 : Math.sin(g_time * 3 + s * 1.7) * 6;
        ctx.beginPath();
        ctx.moveTo(vx, b.y);
        ctx.quadraticCurveTo(vx + sway, b.y + b.h * 0.55, vx + sway * 1.6, b.y + b.h);
        ctx.stroke();
      }
      // Leaves.
      ctx.fillStyle = '#3fae5f';
      for (let s = 0; s < strands; s++) {
        const vx = b.x + 8 + (s / (strands - 1)) * (b.w - 16);
        ctx.beginPath();
        ctx.ellipse(vx, b.y + b.h * 0.5, 7, 4, 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawRabbit(rb) {
    const b = rabbitBox(rb);
    const cx = b.x + b.w / 2;
    const baseY = b.y + b.h;
    ctx.save();
    ctx.translate(cx, baseY);
    ctx.fillStyle = '#e8f4ff';
    // Body.
    ctx.beginPath();
    ctx.ellipse(0, -12, 14, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    // Head.
    ctx.beginPath();
    ctx.arc(12, -20, 8, 0, Math.PI * 2);
    ctx.fill();
    // Ears.
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

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, offX, offY);

    // Sky + parallax mesas.
    ctx.drawImage(sky, 0, 0);
    const par = reducedMotion ? 0 : g.distancePx;
    const farOff = -(par * 0.08) % WORLD_W;
    const nearOff = -(par * 0.2) % WORLD_W;
    ctx.drawImage(far, farOff, 0);
    ctx.drawImage(far, farOff + WORLD_W, 0);
    ctx.drawImage(near, nearOff, 0);
    ctx.drawImage(near, nearOff + WORLD_W, 0);

    // Ground.
    const groundGrad = ctx.createLinearGradient(0, GROUND_Y, 0, WORLD_H);
    groundGrad.addColorStop(0, '#2a1a2e');
    groundGrad.addColorStop(1, '#120a18');
    ctx.fillStyle = groundGrad;
    ctx.fillRect(-80, GROUND_Y, WORLD_W + 160, WORLD_H - GROUND_Y);
    // Ground texture ticks scrolling with the world.
    ctx.fillStyle = 'rgba(255,180,120,0.16)';
    const tickOff = reducedMotion ? 0 : -(g.distancePx % 96);
    for (let tx = tickOff - 96; tx < WORLD_W + 96; tx += 96) {
      ctx.fillRect(tx, GROUND_Y + 18, 44, 5);
      ctx.fillRect(tx + 52, GROUND_Y + 44, 30, 4);
    }
    ctx.fillStyle = 'rgba(255,140,90,0.5)';
    ctx.fillRect(-80, GROUND_Y, WORLD_W + 160, 3);

    // Entities behind raptor, then raptor, then dust on top.
    for (const rb of g.rabbits) drawRabbit(rb);
    for (const o of g.obstacles) drawObstacle(o);
    drawRaptor(g);

    for (const p of g.dust) {
      const a = Math.max(p.life / p.maxLife, 0);
      ctx.fillStyle = `rgba(190,160,140,${0.55 * a})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5 * a + 1, 0, Math.PI * 2);
      ctx.fill();
    }

    // Subtle vignette so the edges stay dark and readable.
    const vg = ctx.createRadialGradient(
      WORLD_W / 2, WORLD_H / 2, WORLD_H * 0.35,
      WORLD_W / 2, WORLD_H / 2, WORLD_H * 0.85
    );
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.42)');
    ctx.fillStyle = vg;
    ctx.fillRect(-80, -80, WORLD_W + 160, WORLD_H + 160);
  }

  function dispose() {
    // All art is generated in-memory; nothing to release beyond GC.
  }

  return { draw, resize, dispose };
}
