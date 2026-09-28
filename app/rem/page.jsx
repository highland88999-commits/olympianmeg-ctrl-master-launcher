'use client';

import { useReducer, useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { PROVINCES, provinceBySlug, filterMunicipalities } from '../../lib/rem/provinces.mjs';
import { remReducer, initialState } from '../../lib/rem/nav.mjs';

// ---------- deterministic seeded rng ----------
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- starfield canvas ----------
function Starfield({ density = 160, speed = 0.25, calm = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const reduced = typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
    const still = calm || reduced;
    let stars = [], raf = 0, w = 0, h = 0;
    const resize = () => {
      w = canvas.width = canvas.offsetWidth;
      h = canvas.height = canvas.offsetHeight;
      const rand = mulberry32(42);
      stars = Array.from({ length: density }, () => ({
        x: rand() * w, y: rand() * h, r: 0.4 + rand() * 1.2, v: rand() * speed,
      }));
    };
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#ffffff';
      for (const s of stars) {
        ctx.globalAlpha = 0.35 + (s.r / 1.6) * 0.45;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
        if (!still) { s.y += s.v; if (s.y > h) s.y = 0; }
      }
      ctx.globalAlpha = 1;
      if (!still) raf = requestAnimationFrame(draw);
    };
    resize(); draw();
    window.addEventListener('resize', resize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [density, speed, calm]);
  return <canvas ref={ref} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden="true" />;
}

// ---------- procedural province card art ----------
function ProvinceArt({ province }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.offsetWidth * 2;
    const h = canvas.height = canvas.offsetHeight * 2;
    const rand = mulberry32(hashStr(province.slug));
    const [c1, c2] = province.theme;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#050510');
    g.addColorStop(0.55, '#0a0a1e');
    g.addColorStop(1, '#050510');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // stars
    for (let i = 0; i < 40; i++) {
      ctx.globalAlpha = 0.25 + rand() * 0.6;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(rand() * w, rand() * h * 0.6, 0.6 + rand() * 1.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // sun disc in theme color
    const sx = w * (0.25 + rand() * 0.5), sy = h * (0.35 + rand() * 0.15), sr = w * 0.13;
    const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr * 2.2);
    sg.addColorStop(0, c1); sg.addColorStop(0.55, c1 + '55'); sg.addColorStop(1, 'transparent');
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.arc(sx, sy, sr * 2.2, 0, Math.PI * 2); ctx.fill();
    // horizon
    ctx.strokeStyle = c2; ctx.lineWidth = Math.max(2, w * 0.008);
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 8) {
      const y = h * 0.78 + Math.sin(x / w * Math.PI * 3 + rand() * 0.2) * h * 0.05;
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }, [province]);
  return <canvas ref={ref} aria-hidden="true"
    style={{ width: '100%', height: '100%', display: 'block' }} />;
}

// ---------- intro ----------
function IntroScreen({ onEnter }) {
  return (
    <div onClick={onEnter} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onEnter(); }}
      aria-label="Enter R.E.M."
      style={{
        position: 'fixed', inset: 0, background: '#000', cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 50,
      }}>
      <Starfield density={200} speed={0.3} />
      <div style={{ position: 'relative', textAlign: 'center', padding: '0 24px' }}>
        <div style={{
          fontSize: 'clamp(3rem, 10vw, 6rem)', fontWeight: 900, letterSpacing: '10px',
          color: '#f0f', textShadow: '0 0 30px #f0f, 0 0 70px #0ff',
          animation: 'remPulse 3s ease-in-out infinite alternate',
        }}>ENTER R.E.M.</div>
        <div style={{ marginTop: 24, color: '#9fd', fontSize: 'clamp(1rem, 3.5vw, 1.4rem)', letterSpacing: '4px' }}>
          A JOURNEY ACROSS THE PROVINCES
        </div>
        <div style={{ marginTop: 32, fontSize: '3rem', color: '#0ff', animation: 'remBounce 2s ease-in-out infinite' }}
          aria-hidden="true">▾</div>
      </div>
      <style>{`
        @keyframes remPulse { from { opacity: .65; } to { opacity: 1; } }
        @keyframes remBounce { 0%,100% { transform: translateY(0);} 50% { transform: translateY(-14px);} }
        @media (prefers-reduced-motion: reduce) {
          @keyframes remPulse { from { opacity: 1; } to { opacity: 1; } }
          @keyframes remBounce { 0%,100% { transform: translateY(0);} 50% { transform: translateY(0);} }
        }
      `}</style>
    </div>
  );
}

// ---------- province selector ----------
function Selector({ onSelect }) {
  return (
    <div style={{ position: 'relative', minHeight: '100vh', background: '#030310', color: '#fff',
      fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif", overflowX: 'hidden' }}>
      <Starfield density={120} speed={0.15} calm />
      <div style={{ position: 'relative', maxWidth: 1000, margin: '0 auto', padding: '56px 20px 80px' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: '0.85rem', letterSpacing: 8, color: '#0ff' }}>NEXUS VORTEX</div>
          <h1 style={{ fontSize: 'clamp(2rem, 6vw, 3.2rem)', letterSpacing: 6, margin: '10px 0',
            color: '#f0f', textShadow: '0 0 24px #f0f' }}>R.E.M.</h1>
          <p style={{ color: '#9fc', letterSpacing: 2 }}>CHOOSE A PROVINCE OR TERRITORY</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 20 }}>
          {PROVINCES.map((p) => (
            <button key={p.slug} onClick={() => onSelect(p.slug)}
              style={{
                background: 'rgba(0,0,0,0.65)', border: `1px solid ${p.theme[1]}66`, borderRadius: 16,
                overflow: 'hidden', cursor: 'pointer', padding: 0, textAlign: 'left', color: '#fff',
                transition: 'transform .3s ease, box-shadow .3s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.03)'; e.currentTarget.style.boxShadow = `0 0 40px ${p.theme[0]}55`; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}>
              <div style={{ height: 120 }}><ProvinceArt province={p} /></div>
              <div style={{ padding: '14px 16px 18px' }}>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, letterSpacing: 1, color: p.theme[1] }}>{p.name}</div>
                <div style={{ fontSize: '0.85rem', color: '#bbb', marginTop: 4 }}>{p.blurb}</div>
                <div style={{ marginTop: 10, fontSize: '0.75rem', color: '#888', letterSpacing: 1 }}>
                  CAPITAL: {p.capital} · {p.locations.length} COMMUNITIES
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- province detail ----------
function ProvinceView({ province, onBack }) {
  const [term, setTerm] = useState('');
  const [c1, c2] = province.theme;
  const results = useMemo(() => filterMunicipalities(province, term), [province, term]);
  const shown = term.trim() ? results : province.locations;
  const listRef = useRef(null);

  const renderList = useCallback(() => shown.slice(0, 400), [shown]);

  return (
    <div style={{ position: 'relative', minHeight: '100vh', background: '#03030f', color: '#fff',
      fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif" }}>
      <Starfield density={110} speed={0.15} calm />
      <div style={{ position: 'relative', maxWidth: 760, margin: '0 auto', padding: '28px 18px 90px' }}>
        <button onClick={onBack}
          style={{ background: 'rgba(0,0,0,0.5)', color: c2, border: `1px solid ${c2}`,
            padding: '10px 18px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, marginBottom: 22 }}>
          ← ALL PROVINCES
        </button>
        <h1 style={{ textAlign: 'center', color: c2, textShadow: `0 0 16px ${c2}`,
          letterSpacing: 3, fontSize: 'clamp(1.5rem, 5vw, 2.2rem)', margin: '0 0 6px' }}>
          {province.name.toUpperCase()}
        </h1>
        <p style={{ textAlign: 'center', color: '#aaa', fontSize: '0.9rem', margin: '0 0 20px', letterSpacing: 1 }}>
          CAPITAL {province.capital.toUpperCase()} · {province.locations.length} COMMUNITIES
        </p>
        <div style={{ position: 'sticky', top: 0, zIndex: 5, padding: '12px 0',
          background: 'linear-gradient(to bottom, #03030f 70%, transparent)' }}>
          <input value={term} onChange={(e) => setTerm(e.target.value)}
            placeholder={`SEARCH ${province.code} COMMUNITIES (name or type)…`}
            aria-label="Search communities"
            style={{ width: '100%', padding: '14px 16px', background: 'rgba(0,0,0,0.65)',
              border: `2px solid ${c1}`, borderRadius: 12, color: '#fff', fontSize: '1rem', outline: 'none',
              boxSizing: 'border-box' }} />
        </div>
        <div ref={listRef}>
          {shown.length === 0 && (
            <p style={{ textAlign: 'center', color: '#888', marginTop: 40 }}>No communities match “{term}”.</p>
          )}
          {renderList().map((l, i) => (
            <div key={`${l.name}-${i}`} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '12px 8px', borderBottom: '1px solid rgba(255,255,255,0.08)',
            }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '1.05rem' }}>{l.name}</div>
                {l.region && <div style={{ fontSize: '0.75rem', color: c2, marginTop: 2 }}>{l.region}</div>}
                <span style={{ fontSize: '0.65rem', padding: '2px 8px', borderRadius: 10,
                  background: `${c1}1a`, color: c1, border: `1px solid ${c1}`,
                  textTransform: 'uppercase', marginTop: 4, display: 'inline-block' }}>{l.type}</span>
              </div>
            </div>
          ))}
          {shown.length > 400 && (
            <p style={{ textAlign: 'center', color: '#777', marginTop: 20, fontSize: '0.85rem' }}>
              Showing the first 400 of {shown.length} — refine your search to narrow it down.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- root ----------
export default function RemExplorer() {
  const [state, dispatch] = useReducer(remReducer, undefined, initialState);
  const province = state.view === 'province' ? provinceBySlug(state.slug) : null;

  return (
    <>
      {state.view === 'intro' && <IntroScreen onEnter={() => dispatch({ type: 'ENTER' })} />}
      {state.view === 'selector' && (
        <Selector onSelect={(slug) => dispatch({ type: 'SELECT_PROVINCE', slug })} />
      )}
      {state.view === 'province' && province && (
        <ProvinceView key={province.slug} province={province}
          onBack={() => dispatch({ type: 'BACK' })} />
      )}
      {state.view === 'province' && !province && (
        <div style={{ padding: 60, color: '#fff', background: '#000', minHeight: '100vh' }}>
          <p>Unknown province.</p>
          <button onClick={() => dispatch({ type: 'RESET' })} style={{ color: '#0ff' }}>Start over</button>
        </div>
      )}
    </>
  );
}
