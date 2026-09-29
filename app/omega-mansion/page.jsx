'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { ROOMS, getRoom, roomIndex, nextRoom } from './rooms';

// Rebuilt from the Omega-Mansion repo ("Nexus Vortex – The Obsidian Estate").
// The source was a 3D interior skinned with remote video textures and
// wired to a telemetry database. This is a quiet explorable estate: six rooms,
// each drawn procedurally on canvas with its own animated feature
// (chandelier, telescope, vortex, shelves, plants, throne). No network.

const mono = { fontFamily: 'monospace' };

// Deterministic pseudo-random per room so features look hand-placed.
function roomRand(roomId) {
  let a = roomId.split('').reduce((x, c) => x + c.charCodeAt(0), 7);
  return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
}

function drawRoom(ctx, room, w, h, t, lookX, reducedMotion) {
  const p = room.palette;
  const rnd = roomRand(room.id);

  // walls
  const wg = ctx.createLinearGradient(0, 0, 0, h * 0.72);
  wg.addColorStop(0, p.wallTop);
  wg.addColorStop(1, p.wallBottom);
  ctx.fillStyle = wg;
  ctx.fillRect(0, 0, w, h * 0.72);

  // wainscot line
  ctx.strokeStyle = p.accent + '44';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, h * 0.55); ctx.lineTo(w, h * 0.55); ctx.stroke();

  // floor with perspective boards
  const fg = ctx.createLinearGradient(0, h * 0.72, 0, h);
  fg.addColorStop(0, p.floor);
  fg.addColorStop(1, '#000');
  ctx.fillStyle = fg;
  ctx.fillRect(0, h * 0.72, w, h * 0.28);
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 12; i++) {
    const x = (i / 12) * w;
    ctx.beginPath();
    ctx.moveTo(w / 2 + (x - w / 2) * 0.25 + lookX * 20, h * 0.72);
    ctx.lineTo(x + lookX * 60, h);
    ctx.stroke();
  }

  const cx = w / 2 + lookX * 30;
  const flick = reducedMotion ? 0.85 : 0.75 + 0.2 * Math.sin(t * 7.3) * Math.sin(t * 3.1);

  const glow = (x, y, r, color, alpha) => {
    const g = ctx.createRadialGradient(x, y, 2, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
  };

  switch (room.feature) {
    case 'chandelier': {
      const sway = reducedMotion ? 0 : Math.sin(t * 0.8) * 14;
      const chx = cx + sway, chy = h * 0.16;
      ctx.strokeStyle = '#3a2f1d';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(chx, chy); ctx.stroke();
      glow(chx, chy + 20, 130, p.glow, 0.35 * flick);
      ctx.fillStyle = p.accent;
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const bx = chx + Math.cos(a) * 46, by = chy + 22 + Math.sin(a) * 12;
        ctx.globalAlpha = 0.55 + 0.45 * flick;
        ctx.beginPath(); ctx.arc(bx, by, 4, 0, 6.29); ctx.fill();
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'telescope': {
      // round window with stars + moon
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, h * 0.3, Math.min(w, h) * 0.2, 0, 6.29); ctx.clip();
      const sg = ctx.createLinearGradient(0, 0, 0, h * 0.5);
      sg.addColorStop(0, '#01020a'); sg.addColorStop(1, '#0a1440');
      ctx.fillStyle = sg;
      ctx.fillRect(0, 0, w, h * 0.5);
      for (let i = 0; i < 60; i++) {
        ctx.fillStyle = '#dfeaff';
        ctx.globalAlpha = 0.3 + rnd() * 0.7;
        ctx.fillRect(rnd() * w, rnd() * h * 0.48, 1.6, 1.6);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#e8ecff';
      ctx.beginPath(); ctx.arc(cx + 60, h * 0.18, 26, 0, 6.29); ctx.fill();
      ctx.fillStyle = '#01020a';
      ctx.beginPath(); ctx.arc(cx + 70, h * 0.16, 24, 0, 6.29); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = p.accent;
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(cx, h * 0.3, Math.min(w, h) * 0.2, 0, 6.29); ctx.stroke();
      // telescope silhouette
      ctx.strokeStyle = '#1c2438';
      ctx.lineWidth = 10;
      ctx.beginPath(); ctx.moveTo(cx - 40, h * 0.66); ctx.lineTo(cx + 70, h * 0.34); ctx.stroke();
      break;
    }
    case 'vortex': {
      const vx = cx, vy = h * 0.38, R = Math.min(w, h) * 0.17;
      glow(vx, vy, R * 2.4, p.glow, 0.5);
      ctx.save();
      ctx.beginPath(); ctx.arc(vx, vy, R, 0, 6.29); ctx.clip();
      for (let i = 0; i < 90; i++) {
        const rr = rnd();
        const a = rnd() * 6.28 + (reducedMotion ? 0 : t * (2.2 - rr * 1.4));
        const hue = 280 + rnd() * 40;
        ctx.fillStyle = `hsla(${hue},95%,65%,0.8)`;
        ctx.beginPath();
        ctx.arc(vx + Math.cos(a) * rr * R, vy + Math.sin(a) * rr * R, 1.5 + rnd() * 2, 0, 6.29);
        ctx.fill();
      }
      ctx.restore();
      ctx.strokeStyle = p.accent;
      ctx.lineWidth = 3;
      ctx.shadowColor = p.glow; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.arc(vx, vy, R + 6, 0, 6.29); ctx.stroke();
      ctx.shadowBlur = 0;
      break;
    }
    case 'shelves': {
      for (let s = 0; s < 3; s++) {
        const sy = h * (0.14 + s * 0.17);
        ctx.fillStyle = '#241408';
        ctx.fillRect(w * 0.08, sy, w * 0.84, 10);
        for (let b = 0; b < 26; b++) {
          const hue = 20 + rnd() * 30;
          ctx.fillStyle = `hsl(${hue},45%,${22 + rnd() * 18}%)`;
          ctx.fillRect(w * 0.09 + b * (w * 0.82 / 26), sy - 34 - rnd() * 8, w * 0.82 / 26 - 3, 40);
        }
      }
      glow(cx, h * 0.62, 120, p.glow, 0.3 * flick);
      // fireplace
      ctx.fillStyle = '#1a0d05';
      ctx.fillRect(cx - 70, h * 0.58, 140, 90);
      ctx.fillStyle = `rgba(255,${110 + Math.floor(60 * flick)},40,${0.75 * flick})`;
      ctx.beginPath();
      ctx.moveTo(cx - 40, h * 0.58 + 80);
      ctx.quadraticCurveTo(cx - 20, h * 0.58 + 20, cx, h * 0.58 + 60);
      ctx.quadraticCurveTo(cx + 20, h * 0.58 + 20, cx + 40, h * 0.58 + 80);
      ctx.closePath(); ctx.fill();
      break;
    }
    case 'plants': {
      glow(cx, h * 0.5, 170, p.glow, 0.28);
      for (let i = 0; i < 12; i++) {
        const px = w * 0.1 + rnd() * w * 0.8;
        const ph = 60 + rnd() * 120;
        const lean = reducedMotion ? 0 : Math.sin(t * 1.1 + i) * 10;
        ctx.strokeStyle = `hsl(140,60%,${25 + rnd() * 15}%)`;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(px, h * 0.72);
        ctx.quadraticCurveTo(px + lean, h * 0.72 - ph * 0.6, px + lean * 1.6, h * 0.72 - ph);
        ctx.stroke();
        ctx.fillStyle = p.accent;
        ctx.globalAlpha = 0.8;
        ctx.beginPath(); ctx.arc(px + lean * 1.6, h * 0.72 - ph, 5, 0, 6.29); ctx.fill();
        ctx.globalAlpha = 1;
      }
      break;
    }
    case 'throne': {
      const tx = cx, ty = h * 0.6;
      glow(tx, ty - 60, 150, p.glow, 0.4 * flick);
      // long carpet
      ctx.fillStyle = '#1c0a1c';
      ctx.beginPath();
      ctx.moveTo(tx - 50, h); ctx.lineTo(tx - 90, ty + 40);
      ctx.lineTo(tx + 90, ty + 40); ctx.lineTo(tx + 50, h);
      ctx.closePath(); ctx.fill();
      // throne silhouette
      ctx.fillStyle = '#050508';
      ctx.strokeStyle = p.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(tx - 55, ty + 40); ctx.lineTo(tx - 55, ty - 110);
      ctx.lineTo(tx - 25, ty - 150); ctx.lineTo(tx + 25, ty - 150);
      ctx.lineTo(tx + 55, ty - 110); ctx.lineTo(tx + 55, ty + 40);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = p.accent;
      ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.arc(tx, ty - 130, 6, 0, 6.29); ctx.fill();
      ctx.globalAlpha = 1;
      break;
    }
    default:
      break;
  }

  // doorway hint
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(w - 46, h * 0.3, 34, h * 0.42);
  ctx.strokeStyle = p.accent + '66';
  ctx.strokeRect(w - 46, h * 0.3, 34, h * 0.42);
}

export default function MansionPage() {
  const [roomId, setRoomId] = useState(ROOMS[0].id);
  const [lookX, setLookX] = useState(0);
  const [reducedMotion] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const canvasRef = useRef(null);
  const dragRef = useRef(null);
  const room = getRoom(roomId);
  const idx = roomIndex(roomId);

  const go = useCallback((dir) => {
    setRoomId((id) => nextRoom(id, dir));
    setLookX(0);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf = 0;
    const resize = () => {
      const w = Math.min(920, window.innerWidth - 32);
      const h = Math.max(300, Math.min(520, w * 0.56));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = w * dpr; canvas.height = h * dpr;
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);
    let t = 0, last = performance.now();
    const frame = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (!reducedMotion) t += dt;
      const w = canvas.width / Math.min(window.devicePixelRatio || 1, 2);
      const h = canvas.height / Math.min(window.devicePixelRatio || 1, 2);
      drawRoom(ctx, getRoom(roomId), w, h, t, lookX, reducedMotion);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [roomId, lookX, reducedMotion]);

  const onPointerDown = (e) => { dragRef.current = { x: e.clientX, look: lookX }; };
  const onPointerMove = (e) => {
    if (!dragRef.current) return;
    const dx = (e.clientX - dragRef.current.x) / 300;
    setLookX(Math.max(-1, Math.min(1, dragRef.current.look + dx)));
  };
  const onPointerUp = () => { dragRef.current = null; };

  const navBtn = {
    ...mono, minHeight: '48px', padding: '12px 20px', cursor: 'pointer',
    background: 'rgba(0,0,0,0.55)', border: '1px solid ' + room.palette.accent,
    color: room.palette.accent, borderRadius: '8px', letterSpacing: '2px', fontSize: '0.85rem',
  };

  return (
    <main style={{ ...mono, minHeight: '100dvh', background: '#030309', color: '#e8e4ff', padding: '18px 16px 60px' }}>
      <div style={{ maxWidth: '920px', margin: '0 auto' }}>
        <header style={{ marginBottom: '14px' }}>
          <h1 style={{ margin: 0, fontSize: '1.5rem', letterSpacing: '5px', color: '#d9c8ff', textShadow: '0 0 16px rgba(177,140,255,0.5)' }}>
            THE OBSIDIAN ESTATE
          </h1>
          <div style={{ fontSize: '0.75rem', color: 'rgba(232,228,255,0.55)', letterSpacing: '1px', marginTop: '4px' }}>
            Six rooms · drag to look around · everything drawn on this device
          </div>
        </header>

        <div
          style={{ position: 'relative', borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(177,140,255,0.35)', touchAction: 'pan-y', cursor: 'grab' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          <canvas ref={canvasRef} style={{ display: 'block' }} aria-label={'Procedural view of ' + room.name} />
          <div style={{
            position: 'absolute', top: '12px', left: '14px', background: 'rgba(0,0,0,0.6)',
            border: '1px solid ' + room.palette.accent, borderRadius: '6px', padding: '8px 14px',
            color: room.palette.accent, letterSpacing: '3px', fontSize: '0.85rem', fontWeight: 'bold',
          }}>
            {room.name.toUpperCase()}
          </div>
          <div style={{
            position: 'absolute', top: '12px', right: '14px', background: 'rgba(0,0,0,0.6)',
            borderRadius: '6px', padding: '8px 12px', color: 'rgba(232,228,255,0.7)', fontSize: '0.78rem',
          }}>
            {idx + 1} / {ROOMS.length}
          </div>
        </div>

        <p style={{ fontSize: '0.92rem', lineHeight: 1.7, color: 'rgba(232,228,255,0.8)', minHeight: '3.2em' }}>
          {room.desc}
        </p>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
          <button onClick={() => go(-1)} style={{ ...navBtn, flex: 1 }} aria-label="Previous room">← PREV ROOM</button>
          <button onClick={() => go(1)} style={{ ...navBtn, flex: 1 }} aria-label="Next room">NEXT ROOM →</button>
        </div>

        <nav style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }} aria-label="Estate map">
          {ROOMS.map((r, i) => (
            <button
              key={r.id}
              onClick={() => { setRoomId(r.id); setLookX(0); }}
              style={{
                ...mono, minHeight: '44px', padding: '8px 12px', cursor: 'pointer', fontSize: '0.72rem',
                letterSpacing: '1px', borderRadius: '6px',
                background: r.id === roomId ? 'rgba(177,140,255,0.15)' : 'transparent',
                border: '1px solid ' + (r.id === roomId ? r.palette.accent : 'rgba(177,140,255,0.3)'),
                color: r.id === roomId ? r.palette.accent : 'rgba(232,228,255,0.6)',
              }}
              aria-current={r.id === roomId ? 'true' : undefined}
            >
              {i + 1}. {r.name.toUpperCase()}
            </button>
          ))}
        </nav>

        <footer style={{ marginTop: '30px', fontSize: '0.72rem', color: 'rgba(232,228,255,0.4)', letterSpacing: '1px' }}>
          THE OBSIDIAN ESTATE — offline rebuild. The original streamed video textures
          and reported visits to a telemetry database; this version draws every room locally.
        </footer>
        <div aria-hidden="true" style={{ height: 'calc(4.5rem + env(safe-area-inset-bottom))' }} />
      </div>
    </main>
  );
}
