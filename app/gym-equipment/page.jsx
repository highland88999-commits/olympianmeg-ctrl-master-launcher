'use client';

/*
 * INNODIGYM | QUANTUM ARCADE — concept showcase for the P1 Plus digital
 * strength system. Rebuilt from the single-file original as a self-contained
 * module. Stripped: OMEGA MIND telemetry uplink, ipify lookup,
 * central_telemetry inserts, connected_repos registration, jsdelivr/unpkg
 * three.js importmap, Google Fonts, and the catbox.moe hosted video.
 * The scene is canvas 2D (tiered "quantum platform" particle field with
 * a procedural product display) — no external requests at all.
 * The body-wide click-through to innodigym.com was removed; taps now
 * trigger the in-scene "sync burst" instead.
 */

import { useEffect, useRef, useState } from 'react';
import { fx, unlockFx } from '@/lib/fx';

const TITLE = 'INNODIGYM | QUANTUM ARCADE';
const PREFS_KEY = 'quantum-arcade.prefs.v1';

// --- DIONYSUS interior treatment ---
const QA_BG = '/images/gym-equipment/bg.webp';
const QA_TILE = '/images/shared/magenta-marble-tile.webp';
const QA_GLYPHS = {
  motion: 'M2 12h4l3-8 4 16 3-8h6',
  list: 'M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z',
  x: 'M6 6l12 12M18 6 6 18',
};
function QaIcon({ name, size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d={QA_GLYPHS[name]} />
    </svg>
  );
}
const qaPanelTile = {
  backgroundImage: `url(${QA_TILE})`,
  backgroundSize: '128px 128px',
  backgroundBlendMode: 'overlay',
};

const SPECS = [
  { label: 'Digital Strength', value: 'Up to 75 lbs per side' },
  { label: 'Form Factor', value: 'Adjustable bench + folding rack' },
  { label: 'Training Modes', value: 'Standard, eccentric, chains & more' },
  { label: 'Footprint', value: 'Under 4 sq ft folded' },
];

const CSS = `
.qa-wrap { position: fixed; inset: 0; background: #000; overflow: hidden; font-family: system-ui, 'Segoe UI', Arial, sans-serif; cursor: pointer; }
.qa-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.qa-header { position: absolute; top: 20px; width: 100%; text-align: center; z-index: 20; pointer-events: none; }
.qa-brand { color: #00f2ff; font-size: clamp(1.8rem, 6vw, 2.5rem); font-weight: 900; letter-spacing: 6px; text-shadow: 0 0 15px #00f2ff; margin-bottom: 5px; }
.qa-sub { color: #f0f; font-size: clamp(0.75rem, 3vw, 1rem); letter-spacing: 5px; opacity: 0.8; }
.qa-footer { position: absolute; bottom: max(30px, env(safe-area-inset-bottom)); width: 100%; text-align: center; z-index: 20; pointer-events: none; }
.qa-prompt { color: #fff; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: clamp(0.65rem, 2.5vw, 0.8rem); letter-spacing: 2px; animation: qaPulse 1s infinite alternate; }
.qa-impact { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center; align-items: center; z-index: 30; pointer-events: none; }
.qa-impact span { display: none; color: #fff; font-size: clamp(2.5rem, 10vw, 5rem); font-weight: 900; text-transform: uppercase; text-shadow: 0 0 20px #00f2ff, 0 0 40px #f0f; animation: qaShake 0.15s infinite; }
.qa-impact span.show { display: block; }
.qa-impact span.kapow { color: #ffff00; text-shadow: 0 0 30px #f00; }
.qa-panel { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 40; background: rgba(2,8,16,0.94); border: 1px solid #00f2ff; border-radius: 8px; padding: 24px; padding-bottom: max(24px, env(safe-area-inset-bottom)); width: min(420px, 90vw); max-height: 80vh; overflow-y: auto; color: #e8fdff; }
.qa-panel h2 { color: #00f2ff; letter-spacing: 3px; margin: 0 0 16px; font-size: 1.2rem; }
.qa-disclaimer { background: rgba(255,170,0,0.08); border: 1px solid rgba(255,170,0,0.5); color: #ffd9a0;
  font-size: 0.75rem; letter-spacing: 1px; padding: 10px 12px; border-radius: 4px; margin: 0 0 12px; line-height: 1.5; }
.qa-panel dl { margin: 0; }
.qa-panel dt { color: #f0f; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 2px; margin-top: 12px; }
.qa-panel dd { margin: 4px 0 0; font-size: 1rem; }
.qa-btn { background: transparent; border: 1px solid #00f2ff; color: #00f2ff; font-family: inherit; font-size: 0.85rem; letter-spacing: 2px; padding: 12px 20px; margin-top: 20px; margin-right: 10px; cursor: pointer; border-radius: 4px; min-height: 44px; }
.qa-btn:hover { background: rgba(0,242,255,0.12); }
.qa-toggle { position: absolute; top: 12px; right: 12px; z-index: 40; background: rgba(0,0,0,0.6); border: 1px solid rgba(0,242,255,0.5); color: #00f2ff; font-family: inherit; font-size: 0.75rem; padding: 10px 12px; cursor: pointer; border-radius: 4px; min-height: 44px; }
@keyframes qaPulse { from { opacity: 0.3; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
@keyframes qaShake { 0% { transform: translate(2px, -2px); } 50% { transform: translate(-2px, 2px); } 100% { transform: translate(0, 0); } }
`;

export default function GymEquipmentPage() {
  const canvasRef = useRef(null);
  const burstRef = useRef(null);
  const impactRef = useRef({ shop: null, kapow: null });
  const [panelOpen, setPanelOpen] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    document.title = TITLE;
    // unlock FX on first gesture (deep links may land here without the hub)
    const unlock = () => unlockFx();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    try {
      const prefs = JSON.parse(window.localStorage.getItem(PREFS_KEY) || '{}');
      if (prefs.reduced) setReduced(true);
    } catch { /* motion prefs default to full */ }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let raf = 0;
    let running = true;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Tiered "quantum platform" particle field.
    const COUNT = 2400;
    const parts = [];
    for (let i = 0; i < COUNT; i++) {
      const tier = Math.floor(Math.random() * 8) - 4;
      parts.push({
        ox: (Math.random() - 0.5) * 15,
        oy: tier * 1.2,
        oz: (Math.random() - 0.5) * 10,
        bx: 0, by: 0, // burst offsets
      });
    }
    burstRef.current = () => {
      for (const p of parts) {
        const a = Math.random() * Math.PI * 2;
        const d = 1 + Math.random() * 4;
        p.bx = Math.cos(a) * d;
        p.by = Math.sin(a) * d;
      }
    };

    // Impact-text auto sequence (SHOP NOW! -> KAPOW!).
    const showImpact = (which, ms) => {
      const { shop, kapow } = impactRef.current;
      if (shop) shop.classList.remove('show');
      if (kapow) kapow.classList.remove('show');
      const el = which === 'shop' ? shop : kapow;
      if (el) {
        el.classList.add('show');
        setTimeout(() => el.classList.remove('show'), ms);
      }
    };
    let seqTimer = 0;
    const runSequence = () => {
      seqTimer = setTimeout(() => {
        showImpact('shop', 2000);
        setTimeout(() => showImpact('kapow', 1500), 2000);
      }, 7500);
    };
    runSequence();

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);

      const time = performance.now() * 0.001;
      const cx = w / 2;
      const cy = h / 2;
      const scale = Math.min(w, h) / 14;

      ctx.fillStyle = '#00f2ff';
      ctx.globalAlpha = 0.7;
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        // Rigid arcade "stepped" drift across platforms.
        const xShift = ((time * 2 + p.ox + 7.5) % 15) - 7.5;
        const stepped = Math.floor(xShift * 5) / 5;
        const jx = reduced ? 0 : Math.sin(time * 10 + i) * 0.02;
        // Decay burst offsets.
        p.bx *= 0.96;
        p.by *= 0.96;
        const sx = cx + (stepped + p.bx) * scale;
        const sy = cy + (p.oy + jx + p.by) * scale * 0.8 - p.oz * 8;
        ctx.fillRect(sx, sy, 2, 2);
      }
      ctx.globalAlpha = 1;

      // Procedural product display: animated light panel in the center.
      const pw = Math.min(w * 0.5, 360);
      const ph = pw * 0.56;
      const px = cx - pw / 2;
      const py = cy - ph / 2 + (reduced ? 0 : Math.sin(time * 0.5) * 8);
      const grad = ctx.createLinearGradient(px, py, px + pw, py + ph);
      grad.addColorStop(0, '#0a1a2a');
      grad.addColorStop(0.5, '#0f2f45');
      grad.addColorStop(1, '#0a1a2a');
      ctx.fillStyle = grad;
      ctx.fillRect(px, py, pw, ph);
      ctx.strokeStyle = '#00f2ff';
      ctx.lineWidth = 2;
      ctx.strokeRect(px, py, pw, ph);
      // Scanline sweep.
      const sweep = (time * 0.4) % 1;
      ctx.fillStyle = 'rgba(0,242,255,0.18)';
      ctx.fillRect(px, py + sweep * ph, pw, 3);
      // Equipment silhouette: bench + uprights.
      ctx.strokeStyle = '#00f2ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(px + pw * 0.15, py + ph * 0.75);
      ctx.lineTo(px + pw * 0.85, py + ph * 0.75); // bench
      ctx.moveTo(px + pw * 0.2, py + ph * 0.75);
      ctx.lineTo(px + pw * 0.2, py + ph * 0.3); // left upright
      ctx.moveTo(px + pw * 0.8, py + ph * 0.75);
      ctx.lineTo(px + pw * 0.8, py + ph * 0.3); // right upright
      ctx.moveTo(px + pw * 0.2, py + ph * 0.3);
      ctx.lineTo(px + pw * 0.8, py + ph * 0.3); // crossbar
      ctx.stroke();
      ctx.fillStyle = '#ff00ff';
      ctx.font = `${Math.round(pw * 0.07)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('INNODIGYM P1 PLUS', cx, py + ph * 0.95);

      raf = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      clearTimeout(seqTimer);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const onTap = (e) => {
    if (e.target.closest('.qa-panel') || e.target.closest('.qa-toggle')) return;
    if (burstRef.current) burstRef.current();
    fx.tap(); // particle burst: tiny tick
  };

  const toggleMotion = () => {
    setReduced((r) => {
      const next = !r;
      try { window.localStorage.setItem(PREFS_KEY, JSON.stringify({ reduced: next })); } catch { /* noop */ }
      return next;
    });
  };

  return (
    <div className="qa-wrap" onClick={onTap}>
      <style>{CSS}</style>
      {/* Ambient backdrop behind the canvas (shows at boot, before first frame) */}
      <div aria-hidden="true" className="qa-canvas" style={{ backgroundImage: `url(${QA_BG})`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.5 }} />
      <canvas ref={canvasRef} className="qa-canvas" aria-hidden="true" />

      <div className="qa-header">
        <div className="qa-brand">INNODIGYM</div>
        <div className="qa-sub">P1 PLUS // DIGITAL STRENGTH</div>
      </div>

      <div className="qa-impact">
        <span ref={(el) => { impactRef.current.shop = el; }}>BURST!</span>
        <span ref={(el) => { impactRef.current.kapow = el; }} className="kapow">KAPOW!</span>
      </div>

      <div className="qa-footer">
        <div className="qa-prompt">/// TAP ANYWHERE FOR A BURST ///</div>
      </div>

      <button type="button" className="qa-toggle" onClick={toggleMotion} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <QaIcon name="motion" />
        {reduced ? 'Motion: Calm' : 'Motion: Full'}
      </button>
      <button
        type="button"
        className="qa-toggle"
        style={{ top: 68, display: 'inline-flex', alignItems: 'center', gap: 8 }}
        onClick={() => { setPanelOpen(true); fx.menuOpen(); }}
      >
        <QaIcon name="list" />
        View Specs
      </button>

      {panelOpen && (
        <div className="qa-panel" role="dialog" aria-label="INNODIGYM P1 Plus specifications" style={qaPanelTile}>
          <h2>P1 PLUS // SPEC SHEET</h2>
          <p className="qa-disclaimer">CONCEPT SHOWCASE — not a real product. The specs below are illustrative; nothing on this page is for sale and no sync with any device occurs.</p>
          <dl>
            {SPECS.map((s) => (
              <div key={s.label}>
                <dt>{s.label}</dt>
                <dd>{s.value}</dd>
              </div>
            ))}
          </dl>
          <button type="button" className="qa-btn" onClick={() => { setPanelOpen(false); fx.menuClose(); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <QaIcon name="x" />
            Close
          </button>
        </div>
      )}
    </div>
  );
}
