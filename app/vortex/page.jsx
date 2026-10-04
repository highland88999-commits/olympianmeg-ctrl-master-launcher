'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  synthesizeBlueprint,
  synthesisLog,
  compileStandaloneExport,
  exportFilename,
  normalizeTargetUrl,
} from './vortex-engine';

const TILE = '/images/apollo-shared/apollo-panel-tile.webp';
const BG = '/images/vortex/vortex-bg.webp';

// Inline SVG glyph system (zero image weight) — APOLLO amber/gold treatment.
const G = (props) => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    style={{ flex: 'none' }} {...props} />
);
const IconSkip = () => (<G><path d="M6 5v14l8-7z" fill="currentColor" stroke="none" /><path d="M16 5v14" /><path d="M19 5v14" opacity="0.4" /></G>);
const IconEnter = () => (<G><path d="M14 4h6v16h-6" /><path d="M10 8l4 4-4 4M14 12H3" /></G>);
const IconSpark = () => (<G><path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z" /></G>);
const IconCopy = () => (<G><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></G>);
const IconPlay = () => (<G><path d="M8 5v14l11-7z" fill="currentColor" stroke="none" /></G>);
const IconDownload = () => (<G><path d="M12 4v12M7 11l5 5 5-5" /><path d="M4 20h16" /></G>);
const IconRefresh = () => (<G><path d="M20 12a8 8 0 1 1-2.3-5.6" /><path d="M20 3v5h-5" /></G>);
const IconBack = () => (<G><path d="M15 5l-7 7 7 7" /></G>);
const IconKey = () => (<G><circle cx="8" cy="12" r="4.5" /><path d="M12.5 12H21M17 12v4M21 12v3" /></G>);
const IconExternal = () => (<G><path d="M14 4h6v6" /><path d="M20 4 11 13" /><path d="M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5" /></G>);

// ---------------------------------------------------------------------------
// Canvas-2D vortex flight. Same projection math as the standalone exporter:
// particles live in a tunnel of `depth`, the camera eases from z=50 toward
// the far end over `duration` seconds while the tunnel swirls.
// ---------------------------------------------------------------------------

function VortexFlight({ blueprint, duration, onDone }) {
  const canvasRef = useRef(null);
  const doneCbRef = useRef(onDone);
  doneCbRef.current = onDone;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const resize = () => {
      canvas.width = canvas.clientWidth || window.innerWidth;
      canvas.height = canvas.clientHeight || window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const DEPTH = blueprint.depth || 1800;
    const pal = blueprint.colorPalette;
    const N = Math.min(blueprint.particleCount, 16000);
    const parts = [];
    for (let i = 0; i < N; i++) {
      parts.push({ z: -Math.random() * DEPTH, phase: i * 0.003, c: pal[i % pal.length] });
    }
    const sparse = canvas.width < 700 ? 2 : 1;
    const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

    let raf = 0;
    let start = null;
    let finished = false;

    const finish = () => {
      if (!finished) {
        finished = true;
        if (doneCbRef.current) doneCbRef.current();
      }
    };

    const draw = (camZ, el) => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.fillStyle = '#020306';
      ctx.fillRect(0, 0, w, h);
      const f = h * 0.9;
      const cx = w / 2;
      const cy = h / 2;
      const dir = blueprint.rotationSpeed < 0 ? -1 : 1;
      const swirlRate = 1.1 + Math.min(1.5, Math.abs(blueprint.rotationSpeed) * 40);
      for (let k = 0; k < parts.length; k += sparse) {
        const p = parts[k];
        const dz = p.z - camZ;
        if (dz <= 0.5) continue;
        const radius =
          13 + Math.sin(el * 0.4 + p.z * blueprint.waveFrequency) * blueprint.expansionAmplitude;
        const th = p.phase + el * swirlRate * dir;
        const s = f / dz;
        const sx = cx + Math.cos(th) * radius * s;
        const sy = cy + Math.sin(th) * radius * s;
        if (sx < -60 || sx > w + 60 || sy < -60 || sy > h + 60) continue;
        let a = 1 - dz / DEPTH;
        if (a < 0) a = 0;
        if (a > 1) a = 1;
        ctx.globalAlpha = 0.2 + 0.8 * a;
        ctx.fillStyle = p.c;
        let r = blueprint.particleSize * s * 0.02;
        if (r < 0.5) r = 0.5;
        if (r > 9) r = 9;
        ctx.fillRect(sx - r / 2, sy - r / 2, r, r);
      }
      ctx.globalAlpha = 1;
    };

    const frame = (ts) => {
      if (start === null) start = ts;
      const el = (ts - start) / 1000;
      let t = el / duration;
      if (t > 1) t = 1;
      if (t >= 1) {
        finish();
        return;
      }
      const camZ = 50 + (-(DEPTH * 0.6) - 50) * easeInOut(t);
      draw(camZ, el);
      raf = requestAnimationFrame(frame);
    };

    if (reduceMotion) {
      draw(50, 1.2);
      finish();
    } else {
      raf = requestAnimationFrame(frame);
    }
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [canvasRef, blueprint, duration]);

  return <canvas ref={canvasRef} className="vortex-flight-canvas" aria-hidden="true" />;
}

// Cinematic intro flight parameters (procedural — no assets).
const CINEMATIC_BLUEPRINT = {
  particleCount: 9000,
  rotationSpeed: 0.014,
  waveFrequency: 0.006,
  expansionAmplitude: 2.4,
  colorPalette: ['#7b2ff7', '#00e5ff', '#ffffff'],
  particleSize: 0.09,
  depth: 1800,
};

// ---------------------------------------------------------------------------
// Portal intro — the cinematic wrapper, reborn as pure canvas (no CDN, no IP).
// ---------------------------------------------------------------------------

function PortalIntro({ onEnter }) {
  const [arrived, setArrived] = useState(false);
  return (
    <div className="vtx-screen vtx-portal">
      <VortexFlight blueprint={CINEMATIC_BLUEPRINT} duration={7} onDone={() => setArrived(true)} />
      <button type="button" className="vtx-skip" onClick={onEnter}>
        <IconSkip />SKIP INTRO
      </button>
      <div className={'vtx-portal-title' + (arrived ? ' vtx-visible' : '')}>
        <div className="vtx-kicker">ARGUS · OBSERVATORY</div>
        <h1>VORTEX</h1>
        <p className="vtx-sub">THE PORTAL FORGE — CINEMATIC GATEWAYS, SYNTHESIZED LOCALLY</p>
        <button type="button" className="vtx-btn vtx-btn-primary" onClick={onEnter}>
          <IconEnter />ENTER THE FORGE
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

const VAULT_KEY = 'vortex_vault_v1';

function loadVault() {
  try {
    const raw = window.localStorage.getItem(VAULT_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveVault(vault) {
  try {
    window.localStorage.setItem(VAULT_KEY, JSON.stringify(vault.slice(0, 24)));
  } catch {
    /* storage unavailable — the forge still works for this session */
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}

function downloadExport(blueprint) {
  const html = compileStandaloneExport(blueprint);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = exportFilename(blueprint);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ---------------------------------------------------------------------------
// The Forge — destination in, cinematic vortex out.
// ---------------------------------------------------------------------------

function Forge({ onPreview }) {
  const [url, setUrl] = useState('');
  const [phase, setPhase] = useState('idle'); // idle | streaming | ready
  const [lines, setLines] = useState([]);
  const [blueprint, setBlueprint] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const [vault, setVault] = useState([]);
  const [redeem, setRedeem] = useState('');
  const nonceRef = useRef(0);

  useEffect(() => {
    setVault(loadVault());
  }, []);

  const runSynthesis = useCallback(
    (targetUrl, nonce) => {
      setError('');
      setPhase('streaming');
      setLines([]);
      let bp;
      try {
        bp = synthesizeBlueprint(targetUrl, nonce);
      } catch {
        setError('That destination does not look like a valid web address.');
        setPhase('idle');
        return;
      }
      const log = synthesisLog(bp);
      const reduceMotion =
        window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduceMotion) {
        setLines(log);
        setBlueprint(bp);
        setPhase('ready');
        setVault((v) => {
          const next = [bp, ...v.filter((x) => x.id !== bp.id)];
          saveVault(next);
          return next;
        });
        return;
      }
      let i = 0;
      const tick = () => {
        i += 1;
        setLines(log.slice(0, i));
        if (i < log.length) {
          setTimeout(tick, 240);
        } else {
          setBlueprint(bp);
          setPhase('ready');
          setVault((v) => {
            const next = [bp, ...v.filter((x) => x.id !== bp.id)];
            saveVault(next);
            return next;
          });
        }
      };
      setTimeout(tick, 300);
    },
    []
  );

  const handleGenerate = () => {
    nonceRef.current = 0;
    runSynthesis(url, 0);
  };

  const handleResynthesize = () => {
    nonceRef.current += 1;
    runSynthesis(url, nonceRef.current);
  };

  const handleCopy = async (kind, text) => {
    const ok = await copyText(text);
    setCopied(ok ? kind : 'failed');
    setTimeout(() => setCopied(''), 2200);
  };

  const handleRedeem = () => {
    const code = redeem.trim().toUpperCase();
    const found = vault.find((b) => b.id === code);
    if (found) {
      setBlueprint(found);
      setUrl(found.targetUrl);
      setPhase('ready');
      setError('');
    } else {
      setError('No vortex with that code lives in this vault.');
    }
  };

  return (
    <div className="vtx-screen vtx-forge">
      <header className="vtx-forge-head">
        <div className="vtx-emblem" aria-hidden="true">
          <svg className="vtx-spiral" viewBox="0 0 200 200">
            <defs>
              <linearGradient id="vtxGold" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ffd700" />
                <stop offset="100%" stopColor="#fffbbf" />
              </linearGradient>
            </defs>
            <path
              id="vtxTextPath"
              d="M 100, 100 m -75, 0 a 75,75 0 1,1 150,0 a 75,75 0 1,1 -150,0"
              fill="transparent"
            />
            <text fill="url(#vtxGold)" fontFamily="monospace" fontSize="15" fontWeight="900" letterSpacing="4">
              <textPath href="#vtxTextPath" startOffset="0%">
                ⚡ VORTEX ⚡ PORTAL ⚡ FORGE ⚡
              </textPath>
            </text>
          </svg>
          <svg className="vtx-sigil" width="110" height="110" viewBox="0 0 100 100">
            <polygon points="50,15 15,90 85,90" fill="#1a1405" stroke="#cca300" strokeWidth="1.5" />
            <path d="M 32,62 Q 50,44 68,62 Q 50,80 32,62 Z" fill="#0b0e14" stroke="#ffd700" strokeWidth="1.2" />
            <circle cx="50" cy="62" r="7.5" fill="#00f2ff" stroke="#ffffff" strokeWidth="0.8" />
            <circle cx="50" cy="62" r="3.2" fill="#020306" />
            <path d="M 51,42 L 42,59 L 49,59 L 45,76 L 59,55 L 50,55 Z" fill="#ffd700" />
          </svg>
        </div>
        <div className="vtx-kicker">ARGUS · OBSERVATORY</div>
        <h2>THE PORTAL FORGE</h2>
        <p className="vtx-sub">FEED IT A DESTINATION. IT SYNTHESIZES A CINEMATIC VORTEX FLIGHT TO GET THERE.</p>
      </header>

      <div className="vtx-steps">
        <div className="vtx-step"><span>⚡</span> INPUT URL</div>
        <div className="vtx-step"><span>⚡</span> SYNTHESIZE</div>
        <div className="vtx-step"><span>⚡</span> SHARE CODE</div>
        <div className="vtx-step"><span>⚡</span> EXPORT HTML</div>
      </div>

      {phase !== 'ready' && (
        <div className="vtx-form">
          <label className="vtx-label" htmlFor="vtx-url">DESTINATION ADDRESS</label>
          <input
            id="vtx-url"
            className="vtx-input"
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck="false"
            placeholder="your-site.example"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleGenerate();
            }}
            disabled={phase === 'streaming'}
          />
          <button
            type="button"
            className="vtx-btn vtx-btn-primary"
            onClick={handleGenerate}
            disabled={phase === 'streaming' || !url.trim()}
          >
            <IconSpark />{phase === 'streaming' ? 'SYNTHESIZING…' : 'SYNTHESIZE VORTEX'}
          </button>
        </div>
      )}

      {error && <div className="vtx-error" role="alert">{error}</div>}

      {phase === 'streaming' && (
        <div className="vtx-terminal">
          <div className="vtx-terminal-label">✦ SYNTHESIS MATRIX ✦</div>
          <pre className="vtx-console" aria-live="polite">
            {lines.join('\n')}
            <span className="vtx-cursor">▌</span>
          </pre>
        </div>
      )}

      {phase === 'ready' && blueprint && (
        <div className="vtx-ready">
          <div className="vtx-archetype">
            <div className="vtx-archetype-name">{blueprint.archetypeName.toUpperCase()}</div>
            <div className="vtx-archetype-tag">{blueprint.tagline}</div>
            <div className="vtx-palette">
              {blueprint.colorPalette.map((c) => (
                <span key={c} className="vtx-swatch" style={{ background: c }} title={c} />
              ))}
            </div>
            <div className="vtx-specs">
              {blueprint.particleCount.toLocaleString('en-US')} PARTICLES · {blueprint.flightDuration}S FLIGHT ·
              SWIRL {blueprint.rotationSpeed}
            </div>
          </div>

          <div className="vtx-share">
            <div className="vtx-label">SHARE CODE</div>
            <div className="vtx-code-row">
              <code className="vtx-code">{blueprint.id}</code>
              <button
                type="button"
                className="vtx-btn vtx-btn-ghost"
                onClick={() => handleCopy('code', blueprint.id)}
              >
                <IconCopy />{copied === 'code' ? 'COPIED ✓' : 'COPY CODE'}
              </button>
            </div>
            <p className="vtx-note">
              The code re-opens this exact vortex from the vault on this device. The export below is a
              fully standalone page — no servers, no tracking.
            </p>
          </div>

          <div className="vtx-actions">
            <button type="button" className="vtx-btn vtx-btn-primary" onClick={() => onPreview(blueprint)}>
              <IconPlay />PREVIEW FLIGHT
            </button>
            <button type="button" className="vtx-btn vtx-btn-ghost" onClick={() => downloadExport(blueprint)}>
              <IconDownload />DOWNLOAD HTML
            </button>
            <button
              type="button"
              className="vtx-btn vtx-btn-ghost"
              onClick={() => handleCopy('export', compileStandaloneExport(blueprint))}
            >
              <IconCopy />{copied === 'export' ? 'COPIED ✓' : copied === 'failed' ? 'COPY FAILED' : 'COPY HTML'}
            </button>
            <button type="button" className="vtx-btn vtx-btn-ghost" onClick={handleResynthesize}>
              <IconRefresh />RESYNTHESIZE
            </button>
          </div>

          <button
            type="button"
            className="vtx-again"
            onClick={() => {
              setPhase('idle');
              setBlueprint(null);
              setLines([]);
              setUrl('');
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><IconBack />forge another</span>
          </button>
        </div>
      )}

      <div className="vtx-vault">
        <div className="vtx-label">VORTEX VAULT · {vault.length} SEALED</div>
        <div className="vtx-code-row">
          <input
            className="vtx-input vtx-input-small"
            type="text"
            placeholder="REDEEM CODE"
            value={redeem}
            onChange={(e) => setRedeem(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRedeem();
            }}
          />
          <button type="button" className="vtx-btn vtx-btn-ghost" onClick={handleRedeem}>
            <IconKey />REDEEM
          </button>
        </div>
        {vault.length > 0 && (
          <div className="vtx-vault-list">
            {vault.slice(0, 8).map((b) => (
              <button
                key={b.id}
                type="button"
                className="vtx-vault-item"
                onClick={() => onPreview(b)}
                title={b.targetUrl}
              >
                <span className="vtx-vault-code">{b.id}</span>
                <span className="vtx-vault-name">{b.archetypeName}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <footer className="vtx-foot">⚡ VORTEX ⚡ PORTAL FORGE ⚡ SYNTHESIZED ON-DEVICE ⚡</footer>
      <div aria-hidden="true" className="player-clear" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Preview — full-screen flight, then a user-confirmed destination launch.
// (No auto-loading iframe: the destination opens only on an explicit tap.)
// ---------------------------------------------------------------------------

function PreviewFlight({ blueprint, onBack }) {
  const [arrived, setArrived] = useState(false);
  const host = (() => {
    try {
      return new URL(blueprint.targetUrl).hostname;
    } catch {
      return blueprint.targetUrl;
    }
  })();

  const openDestination = () => {
    window.open(blueprint.targetUrl, '_blank', 'noopener');
  };

  return (
    <div className="vtx-screen vtx-portal">
      <VortexFlight
        key={blueprint.id + blueprint.nonce}
        blueprint={blueprint}
        duration={blueprint.flightDuration}
        onDone={() => setArrived(true)}
      />
      <button type="button" className="vtx-skip" onClick={onBack}>
        <IconBack />BACK TO FORGE
      </button>
      {arrived && (
        <div className="vtx-portal-title vtx-visible">
          <div className="vtx-kicker">FLIGHT COMPLETE · {blueprint.id}</div>
          <h1 className="vtx-h1-small">{blueprint.archetypeName.toUpperCase()}</h1>
          <p className="vtx-sub">DESTINATION ACQUIRED — {host.toUpperCase()}</p>
          <div className="vtx-actions vtx-actions-center">
            <button type="button" className="vtx-btn vtx-btn-primary" onClick={openDestination}>
              <IconExternal />OPEN DESTINATION
            </button>
            <button type="button" className="vtx-btn vtx-btn-ghost" onClick={onBack}>
              <IconBack />RETURN TO FORGE
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export default function VortexPage() {
  const [screen, setScreen] = useState('portal');
  const [blueprint, setBlueprint] = useState(null);

  const handlePreview = useCallback((bp) => {
    setBlueprint(bp);
    setScreen('preview');
  }, []);

  return (
    <main className="vtx-root">
      {screen === 'portal' && <PortalIntro onEnter={() => setScreen('forge')} />}
      {screen === 'forge' && <Forge onPreview={handlePreview} />}
      {screen === 'preview' && blueprint && (
        <PreviewFlight blueprint={blueprint} onBack={() => setScreen('forge')} />
      )}
      <style>{`
        .vtx-root { min-height: 100dvh; background-color: #020306; background-image: url(${BG}); background-size: cover; background-position: center; background-attachment: fixed; color: #e8f1f8;
          font-family: ui-monospace, Menlo, Consolas, monospace; }
        .vtx-screen { min-height: 100dvh; position: relative; }
        .vtx-portal { overflow: hidden; background-color: #020306; }
        .vtx-flight-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
        .vtx-skip { position: absolute; top: 16px; right: 16px; z-index: 10;
          background: rgba(2,6,8,0.6); border: 1px solid #33414f; color: #9fb2c5;
          font: 700 0.7rem ui-monospace, Menlo, monospace; letter-spacing: 2px;
          padding: 10px 16px; border-radius: 999px; cursor: pointer;
          display: inline-flex; align-items: center; gap: 8px; }
        .vtx-skip:hover { border-color: #00f2ff; color: #00f2ff; }
        .vtx-portal-title { position: absolute; inset: 0; z-index: 5; display: flex;
          flex-direction: column; align-items: center; justify-content: center; text-align: center;
          padding: 24px; opacity: 0; pointer-events: none; transition: opacity 1.2s ease;
          background: radial-gradient(ellipse at center, rgba(2,3,6,0.25) 0%, rgba(2,3,6,0.75) 100%); }
        .vtx-portal-title.vtx-visible { opacity: 1; pointer-events: auto; }
        .vtx-kicker { font-size: 0.72rem; letter-spacing: 5px; color: #8fa3b8; margin-bottom: 14px; }
        .vtx-portal-title h1 { font-size: clamp(3rem, 12vw, 6.5rem); margin: 0 0 10px; letter-spacing: 14px;
          color: #fff; text-shadow: 0 0 24px rgba(123,47,247,0.8), 0 0 60px rgba(0,229,255,0.5); }
        .vtx-h1-small { font-size: clamp(2rem, 8vw, 4rem) !important; letter-spacing: 8px !important; }
        .vtx-sub { font-size: clamp(0.7rem, 2.4vw, 0.9rem); letter-spacing: 3px; color: #9fb2c5;
          max-width: 560px; margin: 0 0 26px; line-height: 1.7; }
        .vtx-btn { font: 700 0.85rem ui-monospace, Menlo, monospace; letter-spacing: 2px;
          padding: 15px 34px; border-radius: 999px; border: none; cursor: pointer;
          display: inline-flex; align-items: center; justify-content: center; gap: 10px;
          transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease; }
        .vtx-btn-primary { background: linear-gradient(90deg, #ffd700, #fffbbf); color: #111;
          box-shadow: 0 0 22px rgba(255,215,0,0.28); }
        .vtx-btn-primary:hover { transform: scale(1.04); box-shadow: 0 0 32px rgba(255,215,0,0.45); }
        .vtx-btn-primary:disabled { opacity: 0.45; cursor: not-allowed; transform: none; }
        .vtx-btn-ghost { background: rgba(255,255,255,0.04); border: 1px solid #33414f; color: #c8d6e2;
          padding: 12px 24px; font-size: 0.75rem; }
        .vtx-btn-ghost:hover { border-color: #00f2ff; color: #00f2ff; }
        .vtx-forge { display: flex; flex-direction: column; align-items: center; padding: 28px 18px 40px;
          max-width: 640px; margin: 0 auto; }
        .vtx-forge-head { text-align: center; margin-bottom: 8px; }
        .vtx-emblem { position: relative; width: 190px; height: 190px; margin: 0 auto; }
        .vtx-spiral { position: absolute; inset: 0; width: 100%; height: 100%; animation: vtxSpin 26s linear infinite; }
        @keyframes vtxSpin { to { transform: rotate(360deg); } }
        .vtx-sigil { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); }
        .vtx-forge-head h2 { font-size: clamp(1.6rem, 6vw, 2.6rem); letter-spacing: 6px; margin: 6px 0 8px; color: #fff;
          text-shadow: 0 0 18px rgba(0,229,255,0.45); }
        .vtx-steps { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; width: 100%;
          max-width: 520px; margin: 18px 0 26px; }
        .vtx-step { border: 1px solid rgba(255,215,0,0.18); border-radius: 999px; padding: 12px 10px;
          text-align: center; font-size: 0.72rem; font-weight: 700; letter-spacing: 2px; color: #b3c5d7;
          background: rgba(255,255,255,0.02); }
        .vtx-step span { color: #ffd700; margin-right: 6px; }
        .vtx-form { width: 100%; max-width: 520px; display: flex; flex-direction: column; align-items: center; gap: 14px; }
        .vtx-label { font-size: 0.72rem; letter-spacing: 3px; color: #8fa3b8; }
        .vtx-input { width: 100%; padding: 16px 22px; background: rgba(255,255,255,0.03);
          border: 1px solid #2c3e50; border-radius: 999px; color: #fff; font-size: 1rem;
          font-family: inherit; text-align: center; outline: none; transition: border-color 0.2s, box-shadow 0.2s; }
        .vtx-input:focus { border-color: #00f2ff; box-shadow: 0 0 14px rgba(0,242,255,0.18); }
        .vtx-input-small { padding: 12px 18px; font-size: 0.9rem; }
        .vtx-error { margin-top: 14px; color: #ff6b81; font-size: 0.8rem; letter-spacing: 1px; text-align: center; }
        .vtx-terminal { width: 100%; max-width: 520px; margin-top: 22px; }
        .vtx-terminal-label { color: #e8b93c; font-size: 0.75rem; letter-spacing: 3px; text-align: center; margin-bottom: 10px; animation: vtxPulse 1.6s ease-in-out infinite; }
        @keyframes vtxPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.45; } }
        .vtx-console { background-color: #010305; background-image: url(${TILE}); background-size: 220px; border: 1px solid rgba(232,185,60,.35); border-radius: 12px; padding: 18px;
          min-height: 220px; color: #e6d6a8; font-size: 0.82rem; line-height: 1.65; white-space: pre-wrap;
          word-break: break-word; margin: 0; box-shadow: inset 0 0 25px #000; }
        .vtx-cursor { animation: vtxBlink 0.9s steps(1) infinite; color: #00ffaa; }
        @keyframes vtxBlink { 50% { opacity: 0; } }
        .vtx-ready { width: 100%; max-width: 520px; margin-top: 8px; display: flex; flex-direction: column; gap: 18px; }
        .vtx-archetype { text-align: center; border: 1px solid rgba(232,185,60,.35); border-radius: 14px; padding: 20px;
          background-color: rgba(6,4,2,0.7); background-image: url(${TILE}); background-size: 220px; }
        .vtx-archetype-name { font-size: 1.3rem; letter-spacing: 4px; color: #ffd700;
          text-shadow: 0 0 14px rgba(255,215,0,0.4); }
        .vtx-archetype-tag { color: #9fb2c5; font-size: 0.78rem; margin-top: 6px; letter-spacing: 1px; }
        .vtx-palette { display: flex; gap: 10px; justify-content: center; margin-top: 14px; }
        .vtx-swatch { width: 34px; height: 34px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.25); }
        .vtx-specs { margin-top: 12px; font-size: 0.7rem; letter-spacing: 2px; color: #8fa3b8; }
        .vtx-share { text-align: center; }
        .vtx-code-row { display: flex; gap: 10px; align-items: center; justify-content: center; margin-top: 10px;
          flex-wrap: wrap; }
        .vtx-code { font-size: 1.7rem; letter-spacing: 8px; color: #00f2ff;
          text-shadow: 0 0 14px rgba(0,242,255,0.5); padding: 8px 8px 8px 16px; }
        .vtx-note { font-size: 0.72rem; color: #6b7f92; line-height: 1.7; max-width: 440px; margin: 12px auto 0; }
        .vtx-actions { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
        .vtx-actions-center { margin-top: 8px; }
        .vtx-again { background: none; border: none; color: #6b7f92; font: inherit; font-size: 0.78rem;
          letter-spacing: 2px; cursor: pointer; margin-top: 4px; }
        .vtx-again:hover { color: #00f2ff; }
        .vtx-vault { width: 100%; max-width: 520px; margin-top: 30px; text-align: center; }
        .vtx-vault-list { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-top: 12px; }
        .vtx-vault-item { display: flex; flex-direction: column; gap: 2px; align-items: center;
          background: rgba(255,255,255,0.02); border: 1px solid #1f3044; border-radius: 10px;
          padding: 10px; cursor: pointer; color: #c8d6e2; font: inherit; }
        .vtx-vault-item:hover { border-color: #00f2ff; }
        .vtx-vault-code { color: #00f2ff; letter-spacing: 3px; font-size: 0.85rem; }
        .vtx-vault-name { font-size: 0.68rem; letter-spacing: 1px; color: #8fa3b8; }
        .vtx-foot { margin-top: 34px; font-size: 0.68rem; letter-spacing: 3px; color: #3d4f61; text-align: center; }
        @media (prefers-reduced-motion: reduce) {
          .vtx-spiral { animation: none; }
          .vtx-cursor { animation: none; }
          .vtx-portal-title { transition: none; }
          .vtx-terminal-label { animation: none; }
        }
      `}</style>
    </main>
  );
}
