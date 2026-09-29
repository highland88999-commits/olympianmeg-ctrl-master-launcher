'use client';

/*
 * THE FLYING DUTCHMAN — a procedural ghost-ship experience.
 *
 * Adapts the source's three-stage structure as an atmospheric visual story:
 *   1. SIGNAL GATE — the entry curtain
 *   2. THE VOYAGE — full-screen night-sea cinematic in four chapters
 *      (replaces the source's YouTube battle embed)
 *   3. CAPTAIN'S LOG — glass terminal with oracle + three holo windows
 *      on a dock (replaces the Driver/Brand/Product ad funnel)
 *
 * The four hailuo MP4s do not ship; every visual is drawn procedurally
 * on canvas. No audio, no external requests.
 */

import { useEffect, useRef, useState } from 'react';
import {
  CHAPTERS, VOYAGE_LENGTH, chapterAt, waveY, shipScreenX, shipScale,
  lightningAt, FogSim, WispSim, LOG_WINDOWS,
} from './sea.js';

/* ---------------- procedural sea renderer ---------------- */

function drawShip(ctx, sx, sy, s, scene, t, calm) {
  ctx.save();
  ctx.translate(sx, sy);
  ctx.scale(s, s);
  ctx.globalAlpha = scene.shipOpacity;
  const glow = scene.glow;
  if (glow > 0) {
    ctx.shadowColor = `rgba(0,255,150,${0.7 * glow})`;
    ctx.shadowBlur = calm ? 0 : 40 * glow;
  }
  ctx.fillStyle = '#05070a';
  ctx.strokeStyle = glow > 0.3 ? 'rgba(0,255,170,0.5)' : '#0b0e14';
  ctx.lineWidth = 2;

  // Hull — long curved ghost hull
  ctx.beginPath();
  ctx.moveTo(-150, 0);
  ctx.quadraticCurveTo(-80, 34, 20, 30);
  ctx.quadraticCurveTo(110, 26, 150, -6);
  ctx.lineTo(138, -18);
  ctx.quadraticCurveTo(60, 8, -60, 6);
  ctx.quadraticCurveTo(-120, 4, -150, 0);
  ctx.closePath(); ctx.fill(); ctx.stroke();

  // Bowsprit
  ctx.beginPath(); ctx.moveTo(140, -12); ctx.lineTo(200, -34); ctx.lineWidth = 4; ctx.stroke();

  // Masts + yards + tattered sails
  const masts = [-95, -10, 75];
  for (const mx of masts) {
    ctx.beginPath(); ctx.moveTo(mx, 4); ctx.lineTo(mx, -150); ctx.lineWidth = 5; ctx.stroke();
    for (const yy of [-140, -105, -70]) {
      ctx.beginPath(); ctx.moveTo(mx - 42, yy); ctx.lineTo(mx + 42, yy); ctx.lineWidth = 3; ctx.stroke();
      // sail: billowed quad with a tattered lower edge
      ctx.beginPath();
      ctx.moveTo(mx - 40, yy);
      ctx.quadraticCurveTo(mx, yy + 26, mx + 40, yy);
      let px = mx + 40;
      for (let k = 0; k < 6; k++) {
        px -= 80 / 6;
        ctx.lineTo(px, yy + 26 - (k % 2 === 0 ? 10 : 2));
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(8,12,16,0.96)';
      ctx.fill();
      ctx.strokeStyle = glow > 0.3 ? 'rgba(0,255,170,0.35)' : '#11161d';
      ctx.lineWidth = 1.5; ctx.stroke();
    }
  }

  // Spectral deck lanterns
  if (glow > 0.2) {
    ctx.shadowColor = 'rgba(120,255,190,0.9)'; ctx.shadowBlur = calm ? 0 : 18;
    ctx.fillStyle = 'rgba(150,255,200,0.9)';
    for (const lx of [-110, -40, 30, 100]) {
      const flick = calm ? 1 : 0.7 + 0.3 * Math.sin(t * 7 + lx);
      ctx.globalAlpha = scene.shipOpacity * flick;
      ctx.beginPath(); ctx.arc(lx, -8, 4, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = scene.shipOpacity;
  }
  ctx.restore();
}

function createSeaRenderer() {
  // Seeded stars
  let seed = 424242; const rnd = () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const stars = Array.from({ length: 130 }, () => ({ x: rnd(), y: rnd() * 0.55, r: 0.4 + rnd() * 1.3, tw: rnd() * 6 }));

  return {
    draw(ctx, W, H, S) {
      const { t, scene, chapterLocal, chapterDur, fog, wisps, calm } = S;
      const horizon = H * 0.62;

      // Sky
      const sky = ctx.createLinearGradient(0, 0, 0, horizon);
      sky.addColorStop(0, '#01020a');
      sky.addColorStop(1, scene.lightning ? '#0a0d18' : '#060a16');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, horizon + 2);

      // Stars
      for (const st of stars) {
        const a = (0.25 + 0.55 * Math.abs(Math.sin(t * 0.7 + st.tw))) * scene.moon;
        ctx.fillStyle = `rgba(220,235,255,${a.toFixed(3)})`;
        ctx.fillRect(st.x * W, st.y * H, st.r, st.r);
      }

      // Moon
      const mx = W * 0.78, my = H * 0.16, mr = Math.min(W, H) * 0.055;
      ctx.save();
      ctx.globalAlpha = scene.moon;
      const mg = ctx.createRadialGradient(mx, my, mr * 0.4, mx, my, mr * 4);
      mg.addColorStop(0, 'rgba(230,240,255,0.5)');
      mg.addColorStop(1, 'rgba(230,240,255,0)');
      ctx.fillStyle = mg;
      ctx.fillRect(mx - mr * 4, my - mr * 4, mr * 8, mr * 8);
      ctx.fillStyle = '#e8f0ff';
      ctx.shadowColor = '#cfe0ff'; ctx.shadowBlur = calm ? 0 : 40;
      ctx.beginPath(); ctx.arc(mx, my, mr, 0, 7); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(160,180,210,0.5)';
      ctx.beginPath(); ctx.arc(mx - mr * 0.3, my - mr * 0.2, mr * 0.22, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(mx + mr * 0.25, my + mr * 0.3, mr * 0.15, 0, 7); ctx.fill();
      ctx.restore();

      // Fog banks
      for (const b of fog.banks) {
        const bx = b.x * W, by = b.y * H, bw = b.w * W;
        const fg = ctx.createRadialGradient(bx, by, 0, bx, by, bw);
        const a = b.alpha * (0.4 + scene.fog);
        fg.addColorStop(0, `rgba(150,170,200,${a.toFixed(3)})`);
        fg.addColorStop(1, 'rgba(150,170,200,0)');
        ctx.fillStyle = fg;
        ctx.fillRect(bx - bw, by - bw * 0.4, bw * 2, bw * 0.8);
      }

      // Wave layers, back to front
      const layers = [
        { y: 0.60, c: '#0a1220' },
        { y: 0.70, c: '#070d18' },
        { y: 0.82, c: '#040810' },
      ];
      layers.forEach((L, li) => {
        ctx.beginPath();
        ctx.moveTo(0, H);
        const base = H * L.y;
        for (let x = 0; x <= W; x += 14) {
          ctx.lineTo(x, base + waveY(x, t, scene.rough, li));
        }
        ctx.lineTo(W, H); ctx.closePath();
        ctx.fillStyle = L.c; ctx.fill();
        // moonlit crest line on the back layer
        if (li === 0) {
          ctx.strokeStyle = `rgba(200,220,255,${0.10 * scene.moon})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          for (let x = 0; x <= W; x += 14) {
            const y = base + waveY(x, t, scene.rough, li);
            if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      });

      // The ship
      const sc = shipScale(scene);
      const sx = shipScreenX(W, scene, chapterLocal, chapterDur);
      const sy = H * 0.66 + waveY(sx, t, scene.rough, 1) - 30 * sc;
      // spectral aura on the water
      if (scene.glow > 0 && scene.shipOpacity > 0) {
        const ag = ctx.createRadialGradient(sx, sy + 20, 0, sx, sy + 20, 260 * sc);
        ag.addColorStop(0, `rgba(0,255,170,${0.16 * scene.glow * scene.shipOpacity})`);
        ag.addColorStop(1, 'rgba(0,255,170,0)');
        ctx.fillStyle = ag;
        ctx.fillRect(sx - 260 * sc, sy - 240 * sc, 520 * sc, 520 * sc);
      }
      drawShip(ctx, sx, sy, sc, scene, t, calm);

      // Ghost wisps around the ship during the haunting
      if (scene.glow > 0.4 && scene.shipOpacity > 0.5) {
        for (const p of wisps.positions(t)) {
          const wx = sx + p.x * 130 * sc, wy = sy - 90 * sc + p.y * 90 * sc;
          ctx.save();
          ctx.globalAlpha = 0.55 * p.tw * scene.glow * scene.shipOpacity;
          ctx.fillStyle = '#9dffc8';
          ctx.shadowColor = '#4dff9d'; ctx.shadowBlur = calm ? 0 : 14;
          ctx.beginPath(); ctx.arc(wx, wy, 3.5, 0, 7); ctx.fill();
          ctx.restore();
        }
      }

      // Lightning during the curse (localized bolt + faint tint — never a washout)
      const bolt = lightningAt(t);
      if (scene.lightning && bolt.active && !calm) {
        const bx = W * (0.2 + 0.6 * ((t * 0.37) % 1));
        ctx.save();
        ctx.strokeStyle = `rgba(200,220,255,${0.85 * bolt.intensity})`;
        ctx.lineWidth = 2.5; ctx.shadowColor = '#aaccff'; ctx.shadowBlur = 18;
        ctx.beginPath();
        let lx = bx, ly = 0;
        ctx.moveTo(lx, ly);
        while (ly < horizon) { lx += (Math.random() - 0.5) * 60; ly += 40 + Math.random() * 40; ctx.lineTo(lx, ly); }
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = `rgba(170,190,255,${0.05 * bolt.intensity})`;
        ctx.fillRect(0, 0, W, H);
      }

      // Vignette
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    },
  };
}

/* ---------------- page ---------------- */

export default function DutchmanPage() {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const [stage, setStage] = useState('gate'); // gate | voyage | log
  const [calm, setCalm] = useState(false);
  const [chap, setChap] = useState({ index: 0, chapter: CHAPTERS[0], local: 0, progress: 0 });
  const [openWin, setOpenWin] = useState('voyage');

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) setCalm(true);
  }, []);

  useEffect(() => {
    if (stage !== 'voyage') return;
    const canvas = canvasRef.current, wrap = wrapRef.current;
    const ctx = canvas.getContext('2d');
    const renderer = createSeaRenderer();
    const fog = new FogSim();
    const wisps = new WispSim();
    const resize = () => {
      const r = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.floor(r.width * dpr);
      canvas.height = Math.floor(r.height * dpr);
      canvas.style.width = r.width + 'px'; canvas.style.height = r.height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);
    const t0 = performance.now();
    let raf = 0; let lastChap = -1;
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      const t = (now - t0) / 1000;
      const c = chapterAt(t);
      if (c.index !== lastChap) { lastChap = c.index; setChap(c); }
      else if (Math.floor(t * 4) !== Math.floor((t - 1 / 60) * 4)) setChap(c);
      fog.step(1 / 60);
      const r = wrap.getBoundingClientRect();
      renderer.draw(ctx, r.width, r.height, {
        t, scene: c.chapter.scene, chapterLocal: c.local, chapterDur: c.chapter.dur, fog, wisps, calm,
      });
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [stage, calm]);

  const gateBtn = {
    padding: '20px 48px', border: '1px solid #00d4ff', borderRadius: 100, background: 'transparent',
    color: '#00d4ff', letterSpacing: 10, fontSize: 13, cursor: 'pointer',
    textShadow: '0 0 10px #00d4ff',
    animation: calm ? 'none' : 'breathe 3s infinite',
    minHeight: 44,
  };

  return (
    <div ref={wrapRef} style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden', fontFamily: 'system-ui, sans-serif', color: '#fff' }}>
      <style>{`@keyframes breathe { 0%,100% { opacity: 0.4; } 50% { opacity: 1; } }`}</style>

      {/* STAGE 1 — SIGNAL GATE */}
      {stage === 'gate' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', gap: 22, justifyContent: 'center', alignItems: 'center', padding: 24, textAlign: 'center' }}>
          <div style={{ color: '#00d4ff', letterSpacing: 8, fontSize: 14 }}>🏴‍☠️ THE FLYING DUTCHMAN</div>
          <div style={{ color: '#8899aa', maxWidth: 460, fontSize: 14, lineHeight: 1.8 }}>
            A ghost story in four chapters, drawn live on this page.
            No video, no sound — just the sea, the moon, and the ship
            that never comes home.
          </div>
          <button style={gateBtn} onClick={() => setStage('voyage')}>HAIL THE SHIP</button>
          <div style={{ color: '#445566', fontSize: 12, fontStyle: 'italic' }}>“Part of the ship… part of the crew.”</div>
        </div>
      )}

      {/* STAGE 2 — THE VOYAGE */}
      {stage === 'voyage' && (
        <>
          <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0 }} />
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '28px 24px 88px', background: 'linear-gradient(to top, rgba(0,0,0,0.85), transparent)', pointerEvents: 'none' }}>
            <div style={{ color: '#00ff88', letterSpacing: 5, fontSize: 12, textShadow: '0 0 12px rgba(0,255,136,0.7)', marginBottom: 8 }}>
              {chap.chapter.numeral}. {chap.chapter.title}
            </div>
            <div style={{ color: '#cfe6ff', fontSize: 15, lineHeight: 1.7, maxWidth: 640, textShadow: '0 1px 8px #000' }}>
              {chap.chapter.caption}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              {CHAPTERS.map((c, i) => (
                <div key={c.id} style={{ height: 3, flex: 1, maxWidth: 90, background: i < chap.index ? '#00ff88' : i === chap.index ? 'rgba(0,255,136,0.9)' : 'rgba(255,255,255,0.15)', borderRadius: 2 }} />
              ))}
            </div>
          </div>
          <div style={{ position: 'absolute', top: 18, right: 18, display: 'flex', gap: 10, zIndex: 10 }}>
            <button onClick={() => setCalm((c) => !c)} aria-pressed={calm} style={{ minHeight: 44, padding: '10px 16px', background: 'rgba(0,10,15,0.5)', border: '1px solid rgba(0,212,255,0.5)', color: calm ? '#ffcc00' : '#bff', borderRadius: 8, fontSize: 12, letterSpacing: 1, cursor: 'pointer' }}>
              {calm ? '☁ CALM ON' : 'CALM OFF'}
            </button>
            <button onClick={() => setStage('log')} style={{ minHeight: 44, padding: '10px 18px', background: 'rgba(0,212,255,0.12)', border: '1px solid #00d4ff', color: '#00d4ff', borderRadius: 8, fontSize: 12, letterSpacing: 2, cursor: 'pointer' }}>
              CAPTAIN'S LOG →
            </button>
          </div>
        </>
      )}

      {/* STAGE 3 — CAPTAIN'S LOG */}
      {stage === 'log' && (
        <div style={{ position: 'absolute', inset: 0, overflowY: 'auto', background: 'radial-gradient(ellipse at 50% 120%, #06121f 0%, #000 70%)', padding: '28px 18px 40px' }}>
          <div style={{ textAlign: 'center', marginBottom: 8 }}>
            <div style={{ color: '#00ff88', letterSpacing: 5, fontSize: 18, textShadow: '0 0 14px rgba(0,255,136,0.6)' }}>CAPTAIN'S LOG</div>
            <div style={{ color: '#667788', fontSize: 12, fontStyle: 'italic', marginTop: 6 }}>recovered from a bottle, corked with wax, smelling of brine</div>
          </div>

          {/* Oracle — procedural moon instead of the source's video loop */}
          <div style={{ display: 'flex', justifyContent: 'center', margin: '18px 0 26px' }}>
            <div style={{
              width: 150, height: 150, borderRadius: '50%',
              border: '2px solid rgba(0,212,255,0.4)',
              background: 'radial-gradient(circle at 35% 35%, #f2f7ff 0%, #b9cbe8 45%, #3a4a6a 100%)',
              boxShadow: '0 0 40px rgba(0,212,255,0.35), inset -12px -12px 30px rgba(0,0,0,0.5)',
              opacity: 0.85,
            }} />
          </div>

          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', maxWidth: 860, margin: '0 auto' }}>
            {LOG_WINDOWS.map((w) => {
              const open = openWin === w.id;
              return (
                <div key={w.id} style={{
                  width: 'min(400px, 92vw)',
                  background: 'rgba(0,10,15,0.45)', border: `2px solid ${open ? '#bc13fe' : 'rgba(188,19,254,0.25)'}`,
                  borderRadius: 24, backdropFilter: 'blur(18px)', padding: 26,
                  boxShadow: open ? '0 0 25px rgba(188,19,254,0.35)' : 'none',
                  display: open ? 'block' : 'none',
                }}>
                  <div style={{ color: '#00ff88', letterSpacing: 4, fontSize: 15, textAlign: 'center', marginBottom: 16, textShadow: '0 0 12px rgba(0,255,136,0.6)' }}>{w.title}</div>
                  <div style={{ color: '#9fd8ff', fontFamily: 'monospace', fontSize: 14, lineHeight: 2 }}>
                    {w.body.map((line, i) => <div key={i}>{line}</div>)}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: 26, justifyContent: 'center', marginTop: 30 }}>
            {LOG_WINDOWS.map((w) => (
              <button key={w.id} onClick={() => setOpenWin(w.id)} aria-label={w.title}
                style={{
                  width: 65, height: 65, borderRadius: 18, fontSize: 28, cursor: 'pointer',
                  border: `2px solid ${openWin === w.id ? '#00ff88' : '#00d4ff'}`,
                  background: 'rgba(0,212,255,0.08)',
                  boxShadow: openWin === w.id ? '0 0 15px rgba(0,255,136,0.5)' : 'none',
                }}>
                {w.icon}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 26, flexWrap: 'wrap' }}>
            <button onClick={() => setStage('voyage')} style={{ minHeight: 44, padding: '10px 22px', background: 'transparent', border: '1px solid #00d4ff', color: '#00d4ff', borderRadius: 8, letterSpacing: 2, fontSize: 12, cursor: 'pointer' }}>
              ← RETURN TO THE SEA
            </button>
            <button onClick={() => setCalm((c) => !c)} aria-pressed={calm} style={{ minHeight: 44, padding: '10px 22px', background: 'transparent', border: '1px solid rgba(0,212,255,0.5)', color: calm ? '#ffcc00' : '#bff', borderRadius: 8, letterSpacing: 2, fontSize: 12, cursor: 'pointer' }}>
              {calm ? '☁ CALM ON' : 'CALM OFF'}
            </button>
          </div>
          <div style={{ textAlign: 'center', color: '#445566', fontSize: 12, fontStyle: 'italic', marginTop: 22 }}>
            “Part of the ship… part of the crew.”
          </div>
          {/* Safari bottom-bar clearance: lets the last log content rest above the browser bar */}
          <div aria-hidden="true" style={{ height: 'calc(4.5rem + env(safe-area-inset-bottom))' }} />
        </div>
      )}
    </div>
  );
}
