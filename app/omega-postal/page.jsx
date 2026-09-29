'use client';

/*
 * Nexus Vortex – The Postal Hub. Rebuilt from the single-file original as
 * a self-contained module. Stripped: OMEGA MIND telemetry uplink, ipify
 * lookup, central_telemetry inserts, connected_repos registration,
 * jsdelivr three.js importmap, and the catbox.moe / file.garden video
 * textures (replaced with procedural gradient textures drawn on canvas).
 * The sorting tower, rings, and mail swarm are rendered in canvas 2D with
 * a simple projection — no WebGL library, zero external requests.
 */

import { useEffect, useRef, useState } from 'react';

const TITLE = 'Nexus Vortex – The Postal Hub';
const MAIL_COUNT = 160;

const CSS = `
.op-wrap { position: fixed; inset: 0; background: #010103; overflow: hidden; font-family: ui-monospace, Menlo, Consolas, monospace; }
.op-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.op-ui { position: fixed; inset: 0; z-index: 20; display: flex; align-items: center; justify-content: center; text-align: center; color: #00ffff; }
.op-landing { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; transition: opacity 1.2s ease-out; cursor: pointer; }
.op-title { font-size: clamp(1.5rem, 5vw, 3rem); letter-spacing: 6px; padding: 0 20px; text-shadow: 0 0 25px #00ffff, 0 0 60px #ff00ff; z-index: 2; color: #ffffff; animation: opFloat 4.5s ease-in-out infinite; }
.op-ticker { font-size: clamp(0.85rem, 2.5vw, 1.15rem); letter-spacing: 4px; color: #ff00ff; margin-top: 18px; z-index: 2; animation: opTicker 1.6s linear infinite; }
.op-hint { position: absolute; bottom: 12%; font-size: clamp(1rem, 3vw, 1.5rem); letter-spacing: 5px; text-shadow: 0 0 15px #00ffff; opacity: 0; transition: opacity 1.5s ease-in; z-index: 3; pointer-events: none; }
.op-hud { position: absolute; left: 12px; bottom: 12px; z-index: 30; background: rgba(1,1,8,0.8); border: 1px solid rgba(0,255,255,0.4); border-radius: 6px; padding: 12px 14px; color: #9ff; font-size: 0.8rem; line-height: 1.7; max-width: min(320px, 80vw); }
.op-hud b { color: #fff; }
.op-controls { position: absolute; right: 12px; bottom: 12px; z-index: 30; display: flex; flex-direction: column; gap: 8px; }
.op-btn { background: rgba(1,1,8,0.8); border: 1px solid #00ffff; color: #00ffff; font-family: inherit; font-size: 0.8rem; letter-spacing: 2px; padding: 12px 16px; cursor: pointer; border-radius: 4px; min-height: 44px; }
.op-btn:hover { background: rgba(0,255,255,0.15); }
.op-slider { display: flex; align-items: center; gap: 8px; color: #9ff; font-size: 0.75rem; background: rgba(1,1,8,0.8); border: 1px solid rgba(0,255,255,0.4); border-radius: 4px; padding: 10px 12px; }
@keyframes opTicker { 0%,100% { opacity: 0.35; } 50% { opacity: 1; } }
@keyframes opFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-12px); } }
`;

export default function OmegaPostalPage() {
  const canvasRef = useRef(null);
  const stateRef = useRef({ phase: 'LANDING' });
  const burstRef = useRef(null);
  const [phase, setPhase] = useState('LANDING');
  const [sorted, setSorted] = useState(0);
  const [volume, setVolume] = useState(160);

  useEffect(() => {
    document.title = TITLE;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let raf = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Mail swarm.
    const mails = [];
    for (let i = 0; i < MAIL_COUNT; i++) {
      const r = Math.random();
      mails.push({
        angle: Math.random() * Math.PI * 2,
        radius: 90 + Math.random() * 40,
        y: Math.random() * 700,
        speedY: 2 + Math.random() * 4,
        speedA: 0.01 + Math.random() * 0.02,
        state: 'SORTING',
        dirX: 0, dirZ: 0,
        color: r < 0.4 ? '#00ffff' : r < 0.8 ? '#ff00ff' : '#ffd700',
        burst: false,
      });
    }
    burstRef.current = () => {
      for (let i = 0; i < 20; i++) {
        const m = mails[(Math.random() * mails.length) | 0];
        m.state = 'DISPATCHED';
        const a = Math.random() * Math.PI * 2;
        m.dirX = Math.cos(a) * (15 + Math.random() * 10);
        m.dirZ = Math.sin(a) * (15 + Math.random() * 10);
        m.burst = true;
      }
    };

    const rings = [
      { radius: 180, y: 150, color: '#00ffff', speed: 0.5 },
      { radius: 150, y: 300, color: '#ff00ff', speed: -0.5 },
      { radius: 120, y: 450, color: '#00ffff', speed: 0.5 },
      { radius: 100, y: 600, color: '#ffd700', speed: -0.5 },
    ];

    let orbitAngle = 0;
    let zoom = 0; // 0 = orbiting, 1 = at intake
    let t = 0;
    let sortedCount = 0;

    // Simple projection: world (x,y,z) -> screen.
    const project = (x, y, z, cam, w, h) => {
      const dx = x - cam.x;
      const dy = y - cam.y;
      const dz = z - cam.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      const f = 900 / dist;
      return { x: w / 2 + dx * f, y: h / 2 - dy * f, s: f, dist };
    };

    const drawSky = (w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      const day = new Date().getHours() >= 5 && new Date().getHours() < 20;
      if (day) {
        g.addColorStop(0, '#1a1030');
        g.addColorStop(0.6, '#3a1a4a');
        g.addColorStop(1, '#0a0510');
      } else {
        g.addColorStop(0, '#000208');
        g.addColorStop(0.6, '#0a0a24');
        g.addColorStop(1, '#040410');
      }
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      // Stars.
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 120; i++) {
        const sx = (i * 173.3) % w;
        const sy = (i * 97.7) % (h * 0.6);
        ctx.globalAlpha = 0.3 + ((i * 37) % 10) / 14;
        ctx.fillRect(sx, sy, 2, 2);
      }
      ctx.globalAlpha = 1;
    };

    const draw = () => {
      t += 0.016;
      const w = canvas.width;
      const h = canvas.height;
      drawSky(w, h);
      const S = stateRef.current.phase;

      // Camera.
      let cam;
      if (S === 'ORBITING') {
        orbitAngle += 0.0018;
        cam = { x: Math.sin(orbitAngle) * 900, y: 250 + Math.sin(t * 0.8) * 60, z: Math.cos(orbitAngle) * 900 };
      } else {
        // Zoom into intake base.
        zoom = Math.min(1, zoom + 0.008);
        const e = zoom * zoom * (3 - 2 * zoom);
        cam = {
          x: Math.sin(orbitAngle) * 900 * (1 - e),
          y: 250 + (0 - 250) * e,
          z: Math.cos(orbitAngle) * 900 * (1 - e) + 300 * e,
        };
        if (zoom >= 1 && S === 'ZOOMING') {
          stateRef.current.phase = 'INSIDE';
          setPhase('INSIDE');
        }
      }
      if (S === 'INSIDE') {
        cam = { x: Math.sin(t * 0.05) * 60, y: 40 + Math.sin(t * 0.3) * 10, z: 320 };
      }

      // Floor grid.
      ctx.strokeStyle = 'rgba(0,255,255,0.18)';
      ctx.lineWidth = 1;
      for (let gx = -2000; gx <= 2000; gx += 200) {
        const a = project(gx, 0, -2000, cam, w, h);
        const b = project(gx, 0, 2000, cam, w, h);
        if (a.s > 0.01 && b.s > 0.01) {
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
      for (let gz = -2000; gz <= 2000; gz += 200) {
        const a = project(-2000, 0, gz, cam, w, h);
        const b = project(2000, 0, gz, cam, w, h);
        if (a.s > 0.01 && b.s > 0.01) {
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }

      // Tower (projected cylinder silhouette).
      const base = project(0, 0, 0, cam, w, h);
      const top = project(0, 700, 0, cam, w, h);
      if (base.s > 0.01) {
        const tw = 120 * base.s;
        const grad = ctx.createLinearGradient(base.x - tw, 0, base.x + tw, 0);
        grad.addColorStop(0, '#0a0a12');
        grad.addColorStop(0.5, '#23233a');
        grad.addColorStop(1, '#0a0a12');
        ctx.fillStyle = grad;
        ctx.fillRect(base.x - tw, top.y, tw * 2, base.y - top.y);
        ctx.strokeStyle = 'rgba(0,255,255,0.5)';
        ctx.strokeRect(base.x - tw, top.y, tw * 2, base.y - top.y);
      }

      // Sorting rings.
      for (const ring of rings) {
        const c = project(0, ring.y, 0, cam, w, h);
        if (c.s <= 0.01) continue;
        const rx = ring.radius * c.s;
        const ry = rx * 0.32;
        const rot = t * ring.speed;
        ctx.strokeStyle = ring.color;
        ctx.lineWidth = 3;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
        for (let n = 0; n < 4; n++) {
          const a = rot + (n * Math.PI) / 2;
          const nx = c.x + Math.cos(a) * rx;
          const ny = c.y + Math.sin(a) * ry;
          ctx.fillStyle = ring.color;
          ctx.shadowColor = ring.color;
          ctx.shadowBlur = 12;
          ctx.fillRect(nx - 5, ny - 5, 10, 10);
          ctx.shadowBlur = 0;
        }
        ctx.globalAlpha = 1;
      }

      // Mail swarm.
      const activeCount = Math.round(volume);
      for (let i = 0; i < activeCount; i++) {
        const m = mails[i];
        if (m.state === 'SORTING') {
          m.angle += m.speedA;
          m.y += m.speedY;
          if (m.y > 750) {
            m.state = 'DISPATCHED';
            m.dirX = Math.cos(m.angle) * (15 + Math.random() * 10);
            m.dirZ = Math.sin(m.angle) * (15 + Math.random() * 10);
            sortedCount++;
            if (sortedCount % 25 === 0) setSorted(sortedCount);
          }
        } else {
          m.x = (m.x || Math.cos(m.angle) * m.radius) + m.dirX;
          m.z = (m.z || Math.sin(m.angle) * m.radius) + m.dirZ;
          m.y += m.speedY * 0.6;
          if (Math.abs(m.x) > 1000 || Math.abs(m.z) > 1000) {
            m.state = 'SORTING';
            m.y = 10;
            m.radius = 180;
            m.x = undefined;
            m.z = undefined;
          }
        }
        const wx = m.x !== undefined ? m.x : Math.cos(m.angle) * m.radius;
        const wz = m.z !== undefined ? m.z : Math.sin(m.angle) * m.radius;
        const p = project(wx, m.y, wz, cam, w, h);
        if (p.s <= 0.01 || p.dist > 6000) continue;
        const size = Math.max(2, 9 * p.s);
        ctx.fillStyle = m.color;
        ctx.shadowColor = m.color;
        ctx.shadowBlur = 8;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(t * 2 + i);
        ctx.fillRect(-size / 2, -size / 2, size, size);
        ctx.restore();
        ctx.shadowBlur = 0;
      }
      setSorted((s) => (sortedCount !== s ? sortedCount : s));

      raf = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [volume]);

  const advance = () => {
    const S = stateRef.current.phase;
    if (S === 'LANDING') {
      stateRef.current.phase = 'ORBITING';
      setPhase('ORBITING');
    } else if (S === 'ORBITING') {
      stateRef.current.phase = 'ZOOMING';
      setPhase('ZOOMING');
    }
  };

  return (
    <>
    <div className="op-wrap">
      <style>{CSS}</style>
      <canvas ref={canvasRef} className="op-canvas" aria-hidden="true" />

      {phase === 'LANDING' && (
        <div className="op-ui">
          <div className="op-landing" onClick={advance}>
            <div className="op-title">NEXUS POSTAL HUB</div>
            <div className="op-ticker">TAP TO INITIALIZE</div>
          </div>
        </div>
      )}

      {phase === 'ORBITING' && (
        <div className="op-hint" style={{ opacity: 1, left: 0, right: 0, textAlign: 'center' }} onClick={advance}>
          TAP TO ENTER TERMINAL
        </div>
      )}

      {phase === 'INSIDE' && (
        <>
          <div className="op-hud">
            <b>NEXUS POSTAL HUB — SIM FEED</b><br />
            Packages sorted: <b>{sorted.toLocaleString()}</b><br />
            Sorting rings: <b>4 active</b><br />
            Dispatch antennas: <b>4 online</b><br />
            Mail volume: <b>{volume}</b> parcels in flight<br />
            <span style={{ opacity: 0.55, fontSize: '0.72em' }}>Decorative simulation — numbers are the animation&apos;s own counters.</span>
          </div>
          <div className="op-controls">
            <label className="op-slider">
              Volume
              <input
                type="range"
                min="20"
                max="160"
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                aria-label="Mail volume"
              />
            </label>
            <button type="button" className="op-btn" onClick={() => burstRef.current && burstRef.current()}>
              DISPATCH BURST
            </button>
          </div>
        </>
      )}

      {(phase === 'ORBITING' || phase === 'ZOOMING') && (
        <div className="op-hud" onClick={phase === 'ORBITING' ? advance : undefined}>
          <b>NEXUS POSTAL HUB</b><br />
          {phase === 'ORBITING' ? 'Tap the hint to dive into the intake terminal.' : 'Zooming to intake…'}
        </div>
      )}
    </div>
    {/* Safari bottom-bar clearance: blank space under the fixed game viewport */}
    <div aria-hidden="true" className="h-[calc(4.5rem+env(safe-area-inset-bottom))]" />
    </>
  );
}
