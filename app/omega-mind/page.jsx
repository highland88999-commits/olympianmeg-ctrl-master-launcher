'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  buildNetwork, fireThought, stepPulses, pulsePosition,
  dreamResponse, summarizeThought,
  saveThought, loadThoughts, deleteThought, LAYERS,
} from './mind';

// Rebuilt from the Omega-Mind repo. The source was a chat client for a cloud
// AI model with a telemetry backend and a sign-in gate. None of that ships
// here: this is an interactive neural-network visualization plus a private
// thought journal. "Dreams" are assembled locally from templates and labeled
// as simulated. Thoughts never leave this device.

const mono = { fontFamily: 'monospace' };

function MindCanvas({ net, pulsesRef, reducedMotion }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf = 0;
    const resize = () => {
      const w = Math.min(920, window.innerWidth - 32);
      const h = Math.max(300, Math.min(460, w * 0.5));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = w * dpr; canvas.height = h * dpr;
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);
    let t = 0, last = performance.now();
    const pad = 46;
    const frame = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (!reducedMotion) t += dt;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.width / dpr, h = canvas.height / dpr;
      const X = (nx) => pad + nx * (w - pad * 2);
      const Y = (ny) => pad * 0.6 + ny * (h - pad * 1.2);

      ctx.fillStyle = '#050011';
      ctx.fillRect(0, 0, w, h);

      // faint grid
      ctx.strokeStyle = 'rgba(138,43,226,0.07)';
      ctx.lineWidth = 1;
      for (let gx = 0; gx <= 10; gx++) {
        ctx.beginPath(); ctx.moveTo((gx / 10) * w, 0); ctx.lineTo((gx / 10) * w, h); ctx.stroke();
      }
      for (let gy = 0; gy <= 6; gy++) {
        ctx.beginPath(); ctx.moveTo(0, (gy / 6) * h); ctx.lineTo(w, (gy / 6) * h); ctx.stroke();
      }

      // edges
      for (const e of net.edges) {
        const a = net.byId[e.from], b = net.byId[e.to];
        ctx.strokeStyle = `rgba(0,243,255,${0.05 + e.weight * 0.10})`;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(X(a.x), Y(a.y)); ctx.lineTo(X(b.x), Y(b.y)); ctx.stroke();
      }

      // pulses
      pulsesRef.current = stepPulses(pulsesRef.current, reducedMotion ? 0 : dt * 1000);
      for (const p of pulsesRef.current) {
        if (p.delay > 0) continue;
        const pos = pulsePosition(p, net.byId);
        const px = X(pos.x), py = Y(pos.y);
        const fade = Math.sin(pos.prog * Math.PI);
        const g = ctx.createRadialGradient(px, py, 1, px, py, 26);
        g.addColorStop(0, `hsla(${pos.hue},100%,70%,${0.9 * fade})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(px - 26, py - 26, 52, 52);
        ctx.fillStyle = `hsla(${pos.hue},100%,80%,${fade})`;
        ctx.beginPath(); ctx.arc(px, py, 4, 0, 6.29); ctx.fill();
        // light up the traveled edge
        const n = p.path.length;
        const seg = Math.min(n - 2, Math.floor(Math.min(1, p.t / p.duration) * (n - 1)));
        const a = net.byId[p.path[seg]], b = net.byId[p.path[seg + 1]];
        ctx.strokeStyle = `hsla(${pos.hue},100%,65%,${0.5 * fade})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(X(a.x), Y(a.y)); ctx.lineTo(X(b.x), Y(b.y)); ctx.stroke();
      }

      // nodes
      for (const n of net.nodes) {
        const nx = X(n.x), ny = Y(n.y);
        const breathe = reducedMotion ? 0 : Math.sin(t * 2 + n.x * 9 + n.y * 7) * 1.5;
        const active = pulsesRef.current.some((p) => p.delay <= 0 && p.path.includes(n.id));
        ctx.fillStyle = active ? '#aef7ff' : n.layer === 0 ? '#00f2ff' : n.layer === net.layers.length - 1 ? '#ff7ae0' : '#8a2be2';
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = active ? 16 : 7; // localized glow
        ctx.beginPath(); ctx.arc(nx, ny, 5 + breathe * 0.4, 0, 6.29); ctx.fill();
        ctx.shadowBlur = 0;
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [net, pulsesRef, reducedMotion]);
  return <canvas ref={ref} style={{ display: 'block', borderRadius: '10px', border: '1px solid rgba(0,243,255,0.3)' }} aria-label="Interactive neural network visualization" />;
}

/* ATHENA interior treatment: inline SVG glyph set for the THINK / FORGET
   buttons (zero image weight). */
function OmGlyph({ size = 15, children }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round"
      strokeLinejoin="round" aria-hidden="true" style={{ flex: "none" }}>
      {children}
    </svg>
  );
}
const GlyphPulse = () => (<OmGlyph><path d="M3 12h4l2-5 4 10 2-5h6" /></OmGlyph>);
const GlyphTrash = () => (
  <OmGlyph size={13}>
    <path d="M4 7h16 M9.5 7V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7" />
    <path d="M6.2 7l.9 12.2a1.5 1.5 0 0 0 1.5 1.3h6.8a1.5 1.5 0 0 0 1.5-1.3L17.8 7" />
  </OmGlyph>
);

const OMEGA_CSS = `
.om-bg { position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background: linear-gradient(rgba(5,0,17,0.88), rgba(5,0,17,0.93)), url('/images/omega-mind/bg.webp') center / cover no-repeat, #050011; }
`;

export default function MindPage() {
  const [net] = useState(() => buildNetwork());
  const pulsesRef = useRef([]);
  const [input, setInput] = useState('');
  const [dream, setDream] = useState(null);
  const [thoughts, setThoughts] = useState([]);
  const [reducedMotion] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    try { setThoughts(loadThoughts(localStorage)); } catch { /* ignore */ }
  }, []);

  const store = {
    getItem: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    setItem: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
  };

  const think = useCallback((e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    pulsesRef.current = [...pulsesRef.current, ...fireThought(net, text)];
    setDream({ ...dreamResponse(text), thought: text });
    try {
      saveThought(store, text);
      setThoughts(loadThoughts(store));
    } catch { /* ignore */ }
    setInput('');
  }, [input, net]);

  const remove = (id) => {
    try { setThoughts(deleteThought(store, id)); } catch { /* ignore */ }
  };

  return (
    <main style={{ ...mono, minHeight: '100dvh', background: '#050011', color: '#e8f6ff', padding: '18px 16px 60px' }}>
      <style>{OMEGA_CSS}</style>
      <div className="om-bg" aria-hidden="true" />
      <div style={{ maxWidth: '920px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
        <header style={{ marginBottom: '14px' }}>
          <h1 style={{ margin: 0, fontSize: '1.5rem', letterSpacing: '5px', color: '#00f2ff', textShadow: '0 0 16px rgba(0,243,255,0.55)' }}>
            OMEGA MIND
          </h1>
          <div style={{ fontSize: '0.75rem', color: 'rgba(232,246,255,0.55)', letterSpacing: '1px', marginTop: '4px' }}>
            A neural lattice you can talk to — local simulation, private journal
          </div>
        </header>

        <MindCanvas net={net} pulsesRef={pulsesRef} reducedMotion={reducedMotion} />
        <p style={{ fontSize: '0.75rem', color: 'rgba(232,246,255,0.5)', letterSpacing: '1px' }}>
          {LAYERS.join(' → ')} nodes · {net.edges.length} synapses · pulses are purely decorative
        </p>

        <form onSubmit={think} style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Share a thought with the lattice…"
            aria-label="Share a thought"
            maxLength={280}
            style={{
              ...mono, flex: 1, background: '#000', border: '1px solid rgba(0,243,255,0.4)',
              borderRadius: '8px', color: '#e8f6ff', padding: '12px 14px', fontSize: '0.95rem', minHeight: '48px',
            }}
          />
          <button
            type="submit"
            style={{ ...mono, minHeight: '48px', padding: '12px 22px', background: 'rgba(0,243,255,0.12)', border: '1px solid #00f2ff', color: '#00f2ff', borderRadius: '8px', cursor: 'pointer', letterSpacing: '2px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <GlyphPulse />
            <span>THINK</span>
          </button>
        </form>

        {dream && (
          <div style={{ marginTop: '16px', border: '1px solid rgba(255,122,224,0.45)', borderRadius: '10px', padding: '16px', background: 'rgba(20,4,24,0.6)' }}>
            <div style={{ fontSize: '0.68rem', letterSpacing: '2px', color: '#ff7ae0', marginBottom: '8px' }}>
              {dream.label}
            </div>
            <div style={{ fontSize: '0.95rem', lineHeight: 1.7, color: '#f2e8ff' }}>{dream.text}</div>
          </div>
        )}

        <h2 style={{ fontSize: '1rem', letterSpacing: '3px', color: '#00f2ff', marginTop: '26px' }}>
          THOUGHT JOURNAL <span style={{ color: 'rgba(232,246,255,0.45)', fontSize: '0.75rem' }}>({thoughts.length} · this device only)</span>
        </h2>
        {thoughts.length === 0 ? (
          <p style={{ color: 'rgba(232,246,255,0.5)', fontSize: '0.88rem' }}>
            Nothing filed yet. Your thoughts stay in this browser — there is no account and no cloud.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '10px' }}>
            {thoughts.map((th) => {
              const s = summarizeThought(th.text);
              return (
                <li key={th.id} style={{ border: '1px solid rgba(0,243,255,0.25)', borderRadius: '8px', padding: '12px 14px', background: 'rgba(0,0,0,0.4)' }}>
                  <div style={{ fontSize: '0.92rem', lineHeight: 1.6 }}>{th.text}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                    <span style={{ fontSize: '0.7rem', color: 'rgba(232,246,255,0.45)' }}>
                      {new Date(th.at).toLocaleString()} · {s.words} words
                    </span>
                    <button
                      onClick={() => remove(th.id)}
                      style={{ ...mono, background: 'transparent', border: '1px solid rgba(255,90,120,0.6)', color: '#ff8aa0', borderRadius: '4px', cursor: 'pointer', padding: '6px 10px', minHeight: '36px', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                      aria-label="Forget this thought"
                    >
                      <GlyphTrash />
                      <span>FORGET</span>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <footer style={{ marginTop: '30px', fontSize: '0.72rem', color: 'rgba(232,246,255,0.4)', letterSpacing: '1px' }}>
          OMEGA MIND — offline rebuild. The original sent every message to a cloud AI and
          logged activity to a telemetry database behind a sign-in gate; this version
          simulates responses locally and keeps your journal in this browser.
        </footer>
        <div aria-hidden="true" style={{ height: 'calc(4.5rem + env(safe-area-inset-bottom))' }} />
      </div>
    </main>
  );
}
