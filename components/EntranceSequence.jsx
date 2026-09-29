// components/EntranceSequence.jsx — Original cinematic intro for the Nexus
// master launcher. A G.I. Joe: Retaliation-STYLE homage built 100% from
// code: Canvas 2D noise/glitch/drop animation, original SVG silhouettes, and
// Web-Audio-synthesized sound. No footage, no audio files, no copyrighted
// material, no external requests.
//
// Storyboard (~11s):
//   static    → dark broadcast static, "TUNING IN…"
//   speech    → podium figure mid-address, "We don't launch it—"
//   glitch    → signal hijack tear, "SIGNAL HIJACKED"
//   commander → masked commander, "We DROP it."
//   drop      → satellite constellation drops into orbit rings around Earth
//               → white flash → seamless handoff to the orbit home scene
//
// Skippable: tap/click anywhere, the SKIP button, or Escape. An explicit
// skip persists `nexus_intro_skip_v1` in localStorage (see
// lib/entrance-sequence.js). The parent mounts this OVER the already-mounted
// orbit scene, so the handoff is a fade, never a blank screen.
//
// FX PASS: every phase change dispatches `window` CustomEvent
// 'nexus:entrance-phase' with detail { phase }. Hook sound/haptics there.

'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { createEntranceMachine, CAPTIONS } from '@/lib/entrance-sequence';
import { playPhaseSound, unlockEntranceAudio, stopAllEntranceAudio } from '@/lib/entrance-audio';

const DROP_DOT_COUNT = 10; // mirrors the 10 god-menu orbit bands

// Original podium figure silhouette (lectern + speaker, raised hand).
function PodiumFigure() {
  return (
    <svg viewBox="0 0 220 240" className="entrance-figure" aria-hidden="true">
      <defs>
        <linearGradient id="podiumBg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0b1220" />
          <stop offset="1" stopColor="#05070c" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="220" height="240" fill="url(#podiumBg)" />
      {/* backdrop glow bands */}
      <rect x="0" y="40" width="220" height="3" fill="#1e3a5f" opacity="0.7" />
      <rect x="0" y="52" width="220" height="2" fill="#16293f" opacity="0.6" />
      {/* speaker silhouette */}
      <g fill="#0d1117">
        <circle cx="110" cy="62" r="20" />
        <path d="M78 200 C78 130 92 96 110 96 C128 96 142 130 142 200 Z" />
        {/* raised arm */}
        <path d="M138 130 C160 110 168 92 172 70 L162 66 C156 86 146 102 130 118 Z" />
      </g>
      {/* rim light */}
      <path d="M92 58 C96 50 104 46 112 47" stroke="#3b82f6" strokeWidth="2.5" fill="none" opacity="0.8" />
      {/* lectern */}
      <path d="M70 200 L150 200 L138 240 L82 240 Z" fill="#111827" />
      <rect x="70" y="194" width="80" height="8" rx="2" fill="#1f2937" />
      <rect x="96" y="188" width="28" height="5" rx="1" fill="#374151" opacity="0.8" />
    </svg>
  );
}

// Original masked commander silhouette (hooded figure, glowing visor).
function CommanderFigure() {
  return (
    <svg viewBox="0 0 220 240" className="entrance-figure" aria-hidden="true">
      <defs>
        <linearGradient id="cmdBg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#140b0b" />
          <stop offset="1" stopColor="#050505" />
        </linearGradient>
        <filter id="visorGlow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="5" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <rect x="0" y="0" width="220" height="240" fill="url(#cmdBg)" />
      <rect x="0" y="36" width="220" height="3" fill="#5f1e1e" opacity="0.6" />
      {/* hood + shoulders */}
      <g fill="#0a0a0c">
        <path d="M110 18 C78 18 64 52 62 84 C60 118 70 150 66 200 L154 200 C150 150 160 118 158 84 C156 52 142 18 110 18 Z" />
      </g>
      {/* face shadow */}
      <ellipse cx="110" cy="72" rx="26" ry="30" fill="#000" />
      {/* visor slit */}
      <g className="visor-flicker">
        <rect x="88" y="64" width="44" height="9" rx="4.5" fill="#22d3ee" filter="url(#visorGlow)" />
      </g>
      {/* hood rim light */}
      <path d="M84 44 C92 32 104 28 114 30" stroke="#f87171" strokeWidth="2" fill="none" opacity="0.55" />
      {/* chest plate */}
      <path d="M92 200 L92 150 L128 150 L128 200 Z" fill="#111114" />
      <rect x="92" y="150" width="36" height="6" fill="#1c1c22" />
    </svg>
  );
}

export default function EntranceSequence({ onDone }) {
  const [phase, setPhase] = useState('static');
  const [fading, setFading] = useState(false);
  const machineRef = useRef(null);
  const phaseRef = useRef('static');
  const phaseStartRef = useRef(0);
  const canvasRef = useRef(null);
  const doneRef = useRef(false);
  const reducedRef = useRef(false);

  if (!machineRef.current && typeof window !== 'undefined') {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    reducedRef.current = !!reduced;
    machineRef.current = createEntranceMachine(window.localStorage, { fast: !!reduced });
    machineRef.current.start();
  }

  const finish = useCallback((reason) => {
    if (doneRef.current) return;
    doneRef.current = true;
    setFading(true);
    stopAllEntranceAudio();
    window.setTimeout(() => { onDone && onDone(reason); }, 650);
  }, [onDone]);

  const doSkip = useCallback(() => {
    if (doneRef.current) return;
    machineRef.current?.skip();
    window.dispatchEvent(new CustomEvent('nexus:entrance-phase', { detail: { phase: 'skipped' } }));
    finish('skipped');
  }, [finish]);

  // Phase timer driver: the machine owns order + pacing, we own the clock.
  useEffect(() => {
    const machine = machineRef.current;
    if (!machine) return;
    let timer = null;
    const step = () => {
      const snap = machine.advance();
      if (snap.status === 'done') {
        finish(snap.reason);
        return;
      }
      const next = snap.phase;
      phaseRef.current = next;
      phaseStartRef.current = performance.now();
      setPhase(next);
      playPhaseSound(next);
      window.dispatchEvent(new CustomEvent('nexus:entrance-phase', { detail: { phase: next } }));
      timer = window.setTimeout(step, machine.phaseDurationMs());
    };
    playPhaseSound('static');
    window.dispatchEvent(new CustomEvent('nexus:entrance-phase', { detail: { phase: 'static' } }));
    phaseStartRef.current = performance.now();
    timer = window.setTimeout(step, machine.phaseDurationMs());
    return () => { if (timer) window.clearTimeout(timer); };
  }, [finish]);

  // Escape skips too.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') doSkip(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doSkip]);

  // Canvas renderer: static noise / glitch bars / the satellite drop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf = 0;
    let noiseTick = 0;

    const noiseTile = document.createElement('canvas');
    noiseTile.width = 160;
    noiseTile.height = 90;
    const nctx = noiseTile.getContext('2d');
    const noiseImg = nctx.createImageData(160, 90);

    // deterministic starfield for the drop phase
    const stars = Array.from({ length: 90 }, (_, i) => ({
      x: ((i * 7919) % 1000) / 1000,
      y: ((i * 4799) % 1000) / 1000,
      r: 0.4 + ((i * 13) % 10) / 12,
    }));

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const drawNoise = (w, h, alpha) => {
      const d = noiseImg.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = (Math.random() * 255) | 0;
        d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255;
      }
      nctx.putImageData(noiseImg, 0, 0);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(noiseTile, 0, 0, w, h);
      ctx.restore();
    };

    const drawDrop = (w, h, p) => {
      // p: 0..1 progress through the drop phase
      ctx.fillStyle = '#020308';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#fff';
      for (const s of stars) {
        ctx.globalAlpha = 0.5;
        ctx.fillRect(s.x * w, s.y * h, s.r, s.r);
      }
      ctx.globalAlpha = 1;

      const ex = w / 2;
      const ey = h * 0.74;
      const er = Math.min(w, h) * 0.15;

      // atmosphere glow (localized, low bloom)
      const glow = ctx.createRadialGradient(ex, ey, er * 0.9, ex, ey, er * 1.7);
      glow.addColorStop(0, 'rgba(56,130,246,0.35)');
      glow.addColorStop(1, 'rgba(56,130,246,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(ex, ey, er * 1.7, 0, Math.PI * 2); ctx.fill();

      // Earth disc
      const earth = ctx.createRadialGradient(ex - er * 0.4, ey - er * 0.4, er * 0.2, ex, ey, er);
      earth.addColorStop(0, '#3b82f6');
      earth.addColorStop(0.7, '#1d4ed8');
      earth.addColorStop(1, '#0b1e4b');
      ctx.fillStyle = earth;
      ctx.beginPath(); ctx.arc(ex, ey, er, 0, Math.PI * 2); ctx.fill();

      // orbit rings
      const rings = [1.7, 2.15, 2.6];
      ctx.strokeStyle = 'rgba(34,211,238,0.4)';
      ctx.lineWidth = 1.5;
      for (const r of rings) {
        ctx.beginPath();
        ctx.ellipse(ex, ey, er * r, er * r * 0.36, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 10 satellites fall from above, then seat into orbit
      for (let i = 0; i < DROP_DOT_COUNT; i++) {
        const ring = rings[i % rings.length];
        const lane = (i / DROP_DOT_COUNT - 0.5) * w * 0.7;
        const fallP = Math.min(1, Math.max(0, (p - i * 0.018) / 0.38));
        const fallEase = fallP * fallP; // accelerating drop
        const targetAngle = (i / DROP_DOT_COUNT) * Math.PI * 2;
        const tx = ex + Math.cos(targetAngle) * er * ring;
        const ty = ey + Math.sin(targetAngle) * er * ring * 0.36;
        const x = (ex + lane) * (1 - fallEase) + tx * fallEase;
        const y = -30 + (ty + 30) * fallEase;

        let px = x, py = y;
        if (fallP >= 1) {
          const op = Math.min(1, (p - 0.42 - i * 0.018) / 0.5);
          const ang = targetAngle + op * 1.6;
          px = ex + Math.cos(ang) * er * ring;
          py = ey + Math.sin(ang) * er * ring * 0.36;
        }

        // trail
        ctx.strokeStyle = 'rgba(34,211,238,0.55)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px, py - 26 * (fallP < 1 ? 1 : 0.2));
        ctx.lineTo(px, py);
        ctx.stroke();

        ctx.fillStyle = '#a5f3fc';
        ctx.shadowColor = '#22d3ee';
        ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
      }

      // final white flash into the handoff
      if (p > 0.9) {
        const f = (p - 0.9) / 0.1;
        ctx.fillStyle = `rgba(255,255,255,${(f * f * 0.9).toFixed(3)})`;
        ctx.fillRect(0, 0, w, h);
      }
    };

    const frame = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const ph = phaseRef.current;
      noiseTick += 1;

      if (ph === 'static') {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);
        if (noiseTick % 2 === 0) drawNoise(w, h, 0.85);
      } else if (ph === 'glitch') {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);
        drawNoise(w, h, 1);
        if (!reducedRef.current) {
          // tear bars: horizontal slices ripped sideways
          for (let i = 0; i < 7; i++) {
            const y = Math.random() * h;
            const bh = 4 + Math.random() * 22;
            const off = (Math.random() - 0.5) * 90;
            ctx.fillStyle = i % 2 ? 'rgba(34,211,238,0.25)' : 'rgba(248,113,113,0.22)';
            ctx.fillRect(off, y, w, bh);
          }
        }
      } else if (ph === 'drop') {
        const elapsed = performance.now() - phaseStartRef.current;
        const dur = machineRef.current?.phaseDurationMs() || 3000;
        drawDrop(w, h, Math.min(1, elapsed / dur));
      } else {
        // speech / commander: dark stage with faint grain behind the SVG figure
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);
        if (noiseTick % 3 === 0) drawNoise(w, h, 0.12);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  const showFigure = phase === 'speech' || phase === 'commander';

  return (
    <div
      role="dialog"
      aria-label="Nexus intro cinematic"
      data-entrance-phase={phase}
      onClick={doSkip}
      onPointerDown={(e) => { e.stopPropagation(); unlockEntranceAudio(); }}
      onPointerUp={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
      className="fixed inset-0 z-[100] bg-black overflow-hidden select-none"
      style={{
        cursor: 'pointer',
        opacity: fading ? 0 : 1,
        transition: 'opacity 0.6s ease',
        touchAction: 'manipulation',
      }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" aria-hidden="true" />

      {/* scanlines + vignette: broadcast feel */}
      <div className="absolute inset-0 pointer-events-none entrance-scanlines" aria-hidden="true" />
      <div className="absolute inset-0 pointer-events-none entrance-vignette" aria-hidden="true" />

      {showFigure && (
        <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
          <div className={`entrance-figure-wrap ${phase === 'commander' ? 'entrance-commander-in' : 'entrance-speech-in'}`}>
            {phase === 'speech' ? <PodiumFigure /> : <CommanderFigure />}
          </div>
        </div>
      )}

      {/* lower-third caption */}
      {(phase === 'speech' || phase === 'commander' || phase === 'glitch') && (
        <div className="absolute left-0 right-0 flex justify-center pointer-events-none"
             style={{ bottom: 'calc(5.5rem + env(safe-area-inset-bottom))' }}>
          <div className="entrance-caption">
            <div className="entrance-caption-kicker">
              {phase === 'speech' ? 'TRANSMISSION' : phase === 'glitch' ? 'SIGNAL HIJACKED' : 'UNKNOWN SIGNAL'}
            </div>
            <div className="entrance-caption-line">
              {phase === 'glitch' ? '— — —' : CAPTIONS[phase]}
            </div>
          </div>
        </div>
      )}

      {phase === 'static' && (
        <div className="absolute left-0 right-0 flex justify-center pointer-events-none"
             style={{ bottom: 'calc(5.5rem + env(safe-area-inset-bottom))' }}>
          <div className="entrance-caption">
            <div className="entrance-caption-line entrance-caption-dim">{CAPTIONS.static}</div>
          </div>
        </div>
      )}

      {phase === 'drop' && (
        <div className="absolute left-0 right-0 flex justify-center pointer-events-none"
             style={{ bottom: 'calc(5.5rem + env(safe-area-inset-bottom))' }}>
          <div className="entrance-caption">
            <div className="entrance-caption-line entrance-caption-dim">{CAPTIONS.drop}</div>
          </div>
        </div>
      )}

      {/* skip control */}
      <button
        onClick={(e) => { e.stopPropagation(); doSkip(); }}
        className="absolute right-4 z-10 px-4 py-2 text-[11px] font-bold tracking-[0.2em] uppercase text-zinc-300 border border-zinc-700 rounded-full bg-black/60 backdrop-blur-sm hover:text-white hover:border-zinc-400"
        style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
        aria-label="Skip intro"
      >
        Skip ▸
      </button>
      <div className="absolute left-0 right-0 text-center pointer-events-none text-[10px] tracking-[0.3em] uppercase text-zinc-500"
           style={{ bottom: 'calc(1.4rem + env(safe-area-inset-bottom))' }}>
        tap anywhere to skip
      </div>

      <style jsx>{`
        .entrance-scanlines {
          background: repeating-linear-gradient(to bottom, rgba(255,255,255,0.025) 0 1px, transparent 1px 3px);
        }
        .entrance-vignette {
          background: radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.75) 100%);
        }
        .entrance-figure {
          width: min(58vw, 300px);
          height: auto;
          border: 1px solid rgba(255,255,255,0.08);
          box-shadow: 0 0 60px rgba(0,0,0,0.8);
        }
        .entrance-figure-wrap { animation: figure-in 0.7s ease both; }
        @keyframes figure-in {
          from { opacity: 0; transform: scale(1.06); filter: brightness(2); }
          to { opacity: 1; transform: scale(1); filter: brightness(1); }
        }
        .entrance-speech-in { animation: figure-in 0.7s ease both, bob 4s ease-in-out 0.7s infinite; }
        .entrance-commander-in { animation: figure-in 0.5s ease both, cmdr-pulse 3s ease-in-out 0.5s infinite; }
        @keyframes bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
        @keyframes cmdr-pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.015); } }
        .visor-flicker { animation: visor 2.4s steps(2) infinite; }
        @keyframes visor { 0%,92% { opacity: 1; } 93%,96% { opacity: 0.35; } 97%,100% { opacity: 1; } }
        .entrance-caption { text-align: center; padding: 0 1.5rem; animation: caption-in 0.5s ease both; }
        @keyframes caption-in { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
        .entrance-caption-kicker {
          font-size: 10px; letter-spacing: 0.35em; text-transform: uppercase;
          color: #67e8f9; margin-bottom: 0.5rem; opacity: 0.85;
        }
        .entrance-caption-line {
          font-size: clamp(1.6rem, 6vw, 2.6rem); font-weight: 800; letter-spacing: 0.04em;
          color: #fff; text-shadow: 0 0 18px rgba(34,211,238,0.45), 0 2px 6px rgba(0,0,0,0.9);
          line-height: 1.15;
        }
        .entrance-caption-dim { color: #d4d4d8; font-size: clamp(1.1rem, 4vw, 1.6rem); font-weight: 600; }
        @media (prefers-reduced-motion: reduce) {
          .entrance-figure-wrap, .entrance-speech-in, .entrance-commander-in, .visor-flicker, .entrance-caption {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
