'use client';

import { useReducer, useRef, useEffect } from 'react';
import { SCENES, journeyReducer, initialJourney, isFinalScene } from '../../lib/afterlife/journey.mjs';
import PassageLink from '@/components/styx/PassageLink';

// ---------- deterministic rng ----------
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

// ---------- procedural scene painters (canvas, zero external assets) ----------
function paintScene(ctx, w, h, scene, t, rand) {
  const pal = scene.palette;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, pal.sky[0]); g.addColorStop(1, pal.sky[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

  switch (scene.art) {
    case 'gate': {
      const cx = w / 2, base = h * 0.82, aw = w * 0.30, ah = h * 0.52;
      // shimmering inner light
      const pulse = 0.55 + Math.sin(t * 0.8) * 0.15;
      const lg = ctx.createRadialGradient(cx, base - ah * 0.5, 0, cx, base - ah * 0.5, aw * 1.8);
      lg.addColorStop(0, pal.glow); lg.addColorStop(1, 'transparent');
      ctx.globalAlpha = pulse; ctx.fillStyle = lg;
      ctx.fillRect(cx - aw * 1.8, base - ah - aw, aw * 3.6, ah + aw * 2.8);
      ctx.globalAlpha = 1;
      // pillars + arch
      ctx.strokeStyle = pal.glow; ctx.lineWidth = Math.max(4, w * 0.012);
      ctx.shadowColor = pal.glow; ctx.shadowBlur = 24;
      ctx.beginPath();
      ctx.moveTo(cx - aw, base); ctx.lineTo(cx - aw, base - ah);
      ctx.arc(cx, base - ah, aw, Math.PI, 0);
      ctx.lineTo(cx + aw, base); ctx.stroke();
      ctx.shadowBlur = 0;
      break;
    }
    case 'river': {
      const bands = 7;
      for (let b = 0; b < bands; b++) {
        const yBase = h * 0.30 + (b / bands) * h * 0.62;
        ctx.strokeStyle = pal.glow; ctx.globalAlpha = 0.10 + (b / bands) * 0.22;
        ctx.lineWidth = Math.max(2, h * 0.006);
        ctx.beginPath();
        for (let x = 0; x <= w; x += 6) {
          const y = yBase + Math.sin(x / w * Math.PI * 3 + t * 0.7 + b * 1.7) * h * 0.02;
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'fields': {
      // horizon glow
      const hy = h * 0.55;
      const hg = ctx.createLinearGradient(0, hy - h * 0.2, 0, hy + h * 0.1);
      hg.addColorStop(0, 'transparent'); hg.addColorStop(1, pal.glow + '33');
      ctx.fillStyle = hg; ctx.fillRect(0, hy - h * 0.2, w, h * 0.3);
      // swaying grass
      ctx.strokeStyle = pal.glow; ctx.globalAlpha = 0.5; ctx.lineWidth = Math.max(1, w * 0.002);
      const blades = 90;
      for (let i = 0; i < blades; i++) {
        const x = rand() * w, y0 = hy + rand() * (h - hy), len = h * (0.03 + rand() * 0.06);
        const sway = Math.sin(t * 1.2 + i) * w * 0.008;
        ctx.beginPath(); ctx.moveTo(x, y0);
        ctx.quadraticCurveTo(x + sway * 0.5, y0 - len * 0.6, x + sway, y0 - len); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'grove': {
      // trunks
      const trunks = 6;
      for (let i = 0; i < trunks; i++) {
        const x = (i / (trunks - 1)) * w + (rand() - 0.5) * w * 0.06;
        const tw = w * (0.015 + rand() * 0.02);
        ctx.fillStyle = '#0c1410';
        ctx.fillRect(x - tw / 2, h * 0.15, tw, h * 0.75);
        // canopy
        ctx.fillStyle = pal.glow; ctx.globalAlpha = 0.16 + rand() * 0.1;
        ctx.beginPath();
        ctx.ellipse(x, h * (0.15 + rand() * 0.12), w * (0.09 + rand() * 0.06), h * (0.06 + rand() * 0.05), 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      // drifting motes
      ctx.fillStyle = pal.glow;
      for (let i = 0; i < 24; i++) {
        const x = rand() * w, y = (rand() * h + t * 8 * (0.5 + rand())) % h;
        ctx.globalAlpha = 0.25 + 0.25 * Math.sin(t * 2 + i);
        ctx.beginPath(); ctx.arc(x, y, 1 + rand() * 1.6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'stars': {
      const n = 140;
      for (let i = 0; i < n; i++) {
        const x = rand() * w, y = rand() * h * 0.85, r = 0.4 + rand() * 1.4;
        ctx.globalAlpha = 0.25 + 0.6 * (0.5 + 0.5 * Math.sin(t * (0.6 + rand() * 1.4) + i));
        ctx.fillStyle = rand() > 0.85 ? pal.glow : '#ffffff';
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'dawn': {
      const cx = w / 2, sy = h * 0.62, sr = Math.min(w, h) * 0.16;
      const dg = ctx.createRadialGradient(cx, sy, 0, cx, sy, sr * 3.2);
      dg.addColorStop(0, pal.glow); dg.addColorStop(0.4, pal.glow + '66'); dg.addColorStop(1, 'transparent');
      ctx.fillStyle = dg;
      ctx.beginPath(); ctx.arc(cx, sy, sr * 3.2, 0, Math.PI * 2); ctx.fill();
      // rays
      ctx.strokeStyle = pal.glow; ctx.globalAlpha = 0.28; ctx.lineWidth = Math.max(2, w * 0.004);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + t * 0.05;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * sr * 1.3, sy + Math.sin(a) * sr * 1.3);
        ctx.lineTo(cx + Math.cos(a) * sr * 2.6, sy + Math.sin(a) * sr * 2.6);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'rest': {
      const cx = w / 2, cy = h * 0.42;
      const breathe = 0.5 + Math.sin(t * 0.6) * 0.12;
      const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.35);
      rg.addColorStop(0, pal.glow + 'aa'); rg.addColorStop(1, 'transparent');
      ctx.globalAlpha = breathe; ctx.fillStyle = rg;
      ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1;
      ctx.fillStyle = pal.glow;
      for (let i = 0; i < 30; i++) {
        const a = (i / 30) * Math.PI * 2 + t * 0.08;
        const rr = w * 0.16 + Math.sin(t * 0.5 + i) * w * 0.015;
        const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * 0.7;
        ctx.globalAlpha = 0.35 + 0.3 * Math.sin(t * 1.5 + i * 2);
        ctx.beginPath(); ctx.arc(x, y, 1.2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      break;
    }
    default: break;
  }
}

// ---------- scene canvas ----------
function SceneCanvas({ scene }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const reduced = typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
    let raf = 0, w = 0, h = 0, t0 = performance.now();
    const resize = () => {
      w = canvas.width = canvas.offsetWidth * 2;
      h = canvas.height = canvas.offsetHeight * 2;
    };
    const frame = (now) => {
      const t = reduced ? 0.5 : (now - t0) / 1000;
      const rand = mulberry32(hashStr(scene.id));
      paintScene(ctx, w, h, scene, t, rand);
      if (!reduced) raf = requestAnimationFrame(frame);
    };
    resize(); frame(performance.now());
    window.addEventListener('resize', resize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [scene]);
  return <canvas ref={ref} aria-hidden="true"
    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />;
}

// ---------- gatekeeper ----------
function Gatekeeper({ onBegin }) {
  return (
    <>
    <PassageLink />
    <div onClick={onBegin} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onBegin(); }}
      aria-label="Enter Elysium"
      style={{
        position: 'fixed', inset: 0, background: '#000', cursor: 'pointer', zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "Georgia, 'Times New Roman', serif",
      }}>
      <div style={{ textAlign: 'center', padding: '0 24px', maxWidth: 560 }}>
        <div style={{
          color: '#c5a059', letterSpacing: 6, fontSize: 'clamp(1.6rem, 7vw, 3rem)',
          border: '1px solid #c5a059', padding: '28px 36px',
          animation: 'elysiumGlow 4s ease-in-out infinite alternate',
        }}>ENTER ELYSIUM</div>
        <p style={{ color: '#8a7a55', marginTop: 26, fontSize: '0.95rem', lineHeight: 1.6, fontStyle: 'italic' }}>
          A contemplative piece — an imagined quiet.<br />Not a doctrine, just a place to rest.
        </p>
        <div style={{ color: '#c5a059', marginTop: 22, letterSpacing: 4, fontSize: '0.75rem' }}>
          TAP TO CONTINUE
        </div>
      </div>
      <style>{`
        @keyframes elysiumGlow {
          from { box-shadow: 0 0 12px rgba(197,160,89,.25); opacity: .85; }
          to   { box-shadow: 0 0 42px rgba(197,160,89,.55); opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes elysiumGlow {
            from { box-shadow: none; opacity: 1; }
            to   { box-shadow: none; opacity: 1; }
          }
        }
      `}</style>
    </div>
    {/* Safari bottom-bar clearance: blank space under the fixed gatekeeper viewport */}
    <div aria-hidden="true" style={{ height: 'calc(4.5rem + env(safe-area-inset-bottom))' }} />
    </>
  );
}

// ---------- journey view ----------
function Journey({ state, dispatch }) {
  const scene = SCENES[state.index];
  const final = isFinalScene(state);
  const tapNext = () => { if (!final) dispatch({ type: 'NEXT' }); };

  return (
    <>
    <div style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden',
      fontFamily: "Georgia, 'Times New Roman', serif" }}>
      <SceneCanvas scene={scene} />
      <button onClick={(e) => { e.stopPropagation(); dispatch({ type: 'PREV' }); }}
        aria-label="Go back"
        style={{ position: 'absolute', top: 16, left: 16, zIndex: 10,
          background: 'rgba(0,0,0,0.5)', color: '#c5a059', border: '1px solid #c5a059',
          borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: '1rem' }}>
        ←
      </button>
      <div style={{ position: 'absolute', top: 22, right: 20, zIndex: 10, display: 'flex', gap: 8 }}>
        {SCENES.map((s, i) => (
          <span key={s.id} aria-hidden="true"
            style={{ width: 8, height: 8, borderRadius: '50%',
              background: i === state.index ? '#c5a059' : 'rgba(197,160,89,0.25)' }} />
        ))}
      </div>

      <div onClick={tapNext} role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') tapNext(); }}
        aria-label={final ? 'Final scene' : 'Continue to next scene'}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 5,
          cursor: final ? 'default' : 'pointer', display: 'flex', justifyContent: 'center',
          padding: '24px 20px 40px' }}>
        <div style={{
          width: '100%', maxWidth: 520, border: '1px solid rgba(197,160,89,0.4)',
          background: 'rgba(5,5,5,0.72)', backdropFilter: 'blur(8px)', padding: '24px 26px',
          position: 'relative',
        }}>
          <div style={{ color: '#c5a059', letterSpacing: 4, fontSize: '0.7rem', marginBottom: 12 }}>
            {scene.title.toUpperCase()}
          </div>
          {scene.lines.map((line, i) => (
            <p key={i} style={{ color: '#efefef', fontSize: '1.25rem', lineHeight: 1.55, margin: i ? '10px 0 0' : '0 0 0' }}>
              {line}
            </p>
          ))}
          {final ? (
            <button onClick={(e) => { e.stopPropagation(); dispatch({ type: 'RESTART' }); }}
              style={{ marginTop: 22, background: 'transparent', color: '#c5a059',
                border: '1px solid #c5a059', borderRadius: 8, padding: '10px 22px',
                cursor: 'pointer', letterSpacing: 2, fontSize: '0.85rem' }}>
              WALK IT AGAIN
            </button>
          ) : (
            <div style={{ position: 'absolute', bottom: 10, right: 14,
              fontSize: '0.6rem', color: '#c5a059', letterSpacing: 2 }}>
              TAP TO CONTINUE
            </div>
          )}
        </div>
      </div>
    </div>
    {/* Safari bottom-bar clearance: blank space under the fixed journey viewport */}
    <div aria-hidden="true" style={{ height: 'calc(4.5rem + env(safe-area-inset-bottom))' }} />
    </>
  );
}

// ---------- root ----------
export default function ElysiumOdyssey() {
  const [state, dispatch] = useReducer(journeyReducer, undefined, initialJourney);
  return state.stage === 'gatekeeper'
    ? <Gatekeeper onBegin={() => dispatch({ type: 'BEGIN' })} />
    : <Journey state={state} dispatch={dispatch} />;
}
