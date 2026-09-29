'use client';

import { useEffect, useRef, useState } from 'react';
import { FEEDS, getFeed, makeRng, feedParams } from './feeds.js';

const CSS = `
.wx-mono { font-family: ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, Consolas, monospace; }
.wx-frame {
  position: relative; border-radius: 16px; overflow: hidden;
  background: rgba(15, 15, 25, 0.45); backdrop-filter: blur(12px);
  border: 1px solid rgba(0, 255, 255, 0.4);
  box-shadow: 0 0 20px rgba(0,255,255,0.25), inset 0 0 20px rgba(255,0,255,0.12), 0 0 50px rgba(0,255,255,0.08);
  transition: box-shadow 0.3s ease-in-out;
}
.wx-frame:hover {
  box-shadow: 0 0 28px rgba(0,255,255,0.38), inset 0 0 26px rgba(255,0,255,0.22), 0 0 70px rgba(0,255,255,0.14);
}
.wx-frame::before, .wx-frame::after {
  content: ''; position: absolute; width: 40px; height: 40px; pointer-events: none; z-index: 3;
}
.wx-frame::before { top: -1px; left: -1px; border-top: 2px solid #00ffff; border-left: 2px solid #00ffff; border-top-left-radius: 16px; }
.wx-frame::after { bottom: -1px; right: -1px; border-bottom: 2px solid #ff00ff; border-right: 2px solid #ff00ff; border-bottom-right-radius: 16px; }
.wx-scan { position: relative; }
.wx-scan::after {
  content: ''; position: absolute; inset: 0; pointer-events: none; z-index: 2;
  background: linear-gradient(to bottom, transparent 50%, rgba(0,0,0,0.14) 51%);
  background-size: 100% 4px;
}
`;

// ---------- dim procedural background ----------
function Backdrop() {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    let w, h, stars, raf;
    const resize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
      stars = Array.from({ length: 130 }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        r: Math.random() * 1.2 + 0.3, s: Math.random() * 0.15 + 0.03,
      }));
    };
    resize();
    window.addEventListener('resize', resize);
    const tick = () => {
      ctx.fillStyle = '#050508';
      ctx.fillRect(0, 0, w, h);
      for (const st of stars) {
        st.y += st.s; if (st.y > h) st.y = 0;
        ctx.fillStyle = 'rgba(90,140,180,0.35)';
        ctx.beginPath(); ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2); ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={ref} className="fixed inset-0 w-full h-full" style={{ zIndex: -1 }} aria-hidden />;
}

// ---------- feed renderers (all local canvas) ----------
function runRenderer(canvas, feedId, params, seed, pausedRef) {
  const ctx = canvas.getContext('2d');
  let w, h, raf;
  let last = performance.now();
  const rng = makeRng(seed ^ 0x9e3779b9);

  const resize = () => {
    const r = canvas.getBoundingClientRect();
    w = canvas.width = Math.max(2, Math.floor(r.width));
    h = canvas.height = Math.max(2, Math.floor(r.height));
  };
  resize();
  window.addEventListener('resize', resize);

  // per-feed state
  let stars = [];
  let streak = null;
  let lastStreak = 0;
  let spores = [];
  if (feedId === 'drift') {
    stars = Array.from({ length: params.stars }, () => ({
      x: rng() * w, y: rng() * h, r: rng() * 1.6 + 0.4, s: params.driftSpeed * (0.4 + rng()),
    }));
  }
  if (feedId === 'spore') {
    spores = Array.from({ length: params.count }, () => ({
      x: rng() * w, y: rng() * h, r: rng() * 2.6 + 0.8,
      vy: params.riseSpeed * (0.5 + rng()), ph: rng() * Math.PI * 2, hue: 35 + rng() * 40,
    }));
  }

  const tick = (now) => {
    raf = requestAnimationFrame(tick);
    if (pausedRef.current) { last = now; return; }
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now / 1000;

    if (feedId === 'drift') {
      ctx.fillStyle = '#04060c'; ctx.fillRect(0, 0, w, h);
      for (const st of stars) {
        st.x -= st.s; if (st.x < 0) st.x = w;
        ctx.fillStyle = params.color;
        ctx.globalAlpha = 0.7;
        ctx.beginPath(); ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (!streak && now - lastStreak > params.streakEveryMs) {
        streak = { x: rng() * w * 0.7 + w * 0.15, y: rng() * h * 0.4, life: 1 };
        lastStreak = now;
      }
      if (streak) {
        streak.life -= dt * 1.4; streak.x -= dt * 900; streak.y += dt * 320;
        if (streak.life <= 0) streak = null;
        else {
          const g = ctx.createLinearGradient(streak.x, streak.y, streak.x + 130, streak.y - 46);
          g.addColorStop(0, 'rgba(160,240,255,' + (0.9 * streak.life).toFixed(3) + ')');
          g.addColorStop(1, 'rgba(160,240,255,0)');
          ctx.strokeStyle = g; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(streak.x, streak.y); ctx.lineTo(streak.x + 130, streak.y - 46); ctx.stroke();
        }
      }
    } else if (feedId === 'plasma') {
      const { cols, rows, speed, scale, hueBase } = params;
      const cw = w / cols, ch = h / rows;
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const v = Math.sin(i * scale * 8 + t * speed)
            + Math.sin(j * scale * 8 - t * speed * 0.7)
            + Math.sin((i + j) * scale * 4 + t * speed * 0.5);
          const hue = (hueBase + v * 28 + 360) % 360;
          ctx.fillStyle = 'hsl(' + hue.toFixed(1) + ', 85%, ' + (8 + (v + 3) * 6).toFixed(1) + '%)';
          ctx.fillRect(i * cw, j * ch, cw + 0.5, ch + 0.5);
        }
      }
    } else if (feedId === 'scope') {
      ctx.fillStyle = '#020604'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(57,255,20,0.12)'; ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (let y = 0; y < h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      ctx.strokeStyle = params.traceColor; ctx.lineWidth = 2;
      ctx.shadowColor = params.traceColor; ctx.shadowBlur = 8;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 3) {
        let y = 0;
        for (let k = 1; k <= params.waves; k++) {
          y += Math.sin(x * 0.012 * k + t * params.speed * k + k * 1.7) / k;
        }
        y = h / 2 + y * h * params.amplitude;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    } else if (feedId === 'spore') {
      ctx.fillStyle = 'rgba(4,3,8,0.16)'; ctx.fillRect(0, 0, w, h);
      for (const p of spores) {
        p.y -= p.vy; p.ph += dt;
        if (p.y < -10) { p.y = h + 10; p.x = rng() * w; }
        const x = p.x + Math.sin(p.ph) * params.sway * 22;
        const g = ctx.createRadialGradient(x, p.y, 0, x, p.y, p.r * 4);
        g.addColorStop(0, 'hsla(' + p.hue.toFixed(0) + ', 100%, 65%, 0.9)');
        g.addColorStop(1, 'hsla(' + p.hue.toFixed(0) + ', 100%, 50%, 0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, p.y, p.r * 4, 0, Math.PI * 2); ctx.fill();
      }
    }
  };
  raf = requestAnimationFrame(tick);
  return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
}

export default function WasteExtractionPage() {
  const [feedId, setFeedId] = useState('drift');
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));
  const [paused, setPaused] = useState(false);
  const [signal, setSignal] = useState(97);
  const canvasRef = useRef(null);
  const pausedRef = useRef(false);
  const feed = getFeed(feedId) || FEEDS[0];
  const params = feedParams(feed.id, seed);

  useEffect(() => { pausedRef.current = paused; }, [paused]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !params) return;
    return runRenderer(canvas, feed.id, params, seed, pausedRef);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedId, seed]);

  useEffect(() => {
    const id = setInterval(() => {
      setSignal(94 + Math.floor(Math.random() * 6));
    }, 2000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="wx-mono min-h-dvh text-white flex flex-col" style={{ background: '#050505' }}>
      <style>{CSS}</style>
      <Backdrop />

      <header className="px-4 sm:px-6 py-4 text-center">
        <div className="text-xl sm:text-2xl font-bold tracking-[0.3em]" style={{ textShadow: '0 0 12px rgba(0,255,255,0.55)' }}>
          HOLOFRAME NEXUS
        </div>
        <div className="text-[10px] tracking-[0.35em] text-cyan-300/60 mt-1">WASTE EXTRACTION // SIGNAL VIEWPORT</div>
      </header>

      <main className="flex-1 flex flex-col items-center px-4 pb-10 w-full max-w-5xl mx-auto">
        <div className="wx-frame wx-scan w-full" style={{ aspectRatio: '16 / 9' }}>
          <canvas ref={canvasRef} className="w-full h-full block" aria-label={feed.name + ' feed'} />
          <div className="absolute top-3 left-4 z-[3] text-[10px] tracking-[0.25em] text-cyan-200/90 bg-black/50 px-2 py-1 rounded">
            FEED: {feed.name}
          </div>
          <div className="absolute top-3 right-4 z-[3] text-[10px] tracking-[0.25em] text-emerald-200/90 bg-black/50 px-2 py-1 rounded">
            SIM SIGNAL {signal}% {paused ? '• HELD' : '• LOOPING'}
          </div>
        </div>

        <p className="mt-4 text-xs text-white/55 text-center max-w-xl">{feed.desc}</p>

        {/* control deck */}
        <div className="mt-5 w-full max-w-3xl rounded-xl border border-white/10 bg-black/60 backdrop-blur p-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {FEEDS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFeedId(f.id)}
                className={'px-3 py-2.5 rounded border text-[11px] font-bold tracking-widest transition ' +
                  (feed.id === f.id
                    ? 'border-cyan-300 bg-cyan-300/15 text-cyan-100'
                    : 'border-white/15 text-white/55 hover:border-cyan-300/50 hover:text-cyan-200')}
              >
                {f.name}
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <button onClick={() => setPaused((p) => !p)}
              className="px-4 py-2 rounded border border-fuchsia-400/60 text-fuchsia-200 text-xs font-bold tracking-widest hover:bg-fuchsia-400/10">
              {paused ? '▶ RESUME' : '❚❚ HOLD'}
            </button>
            <button onClick={() => setSeed(Math.floor(Math.random() * 1e9))}
              className="px-4 py-2 rounded border border-white/20 text-white/70 text-xs font-bold tracking-widest hover:bg-white/5">
              ↻ RESEED FIELD
            </button>
            <span className="text-[10px] text-white/35 tracking-widest">SEED {String(seed).slice(0, 10)}</span>
          </div>
        </div>

        <p className="mt-5 text-[11px] text-white/30 text-center max-w-lg">
          An ambient viewport. Every frame is drawn on this device in real time — no video files, no streams, nothing leaves the browser.
        </p>
        <div aria-hidden="true" className="h-[calc(4.5rem+env(safe-area-inset-bottom))]" />
      </main>
    </div>
  );
}
