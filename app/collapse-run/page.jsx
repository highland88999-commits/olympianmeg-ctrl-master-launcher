'use client';

// Collapse Run (working title — Merlin names it before ship, 2026-10-29).
// A collapsing-floor endless runner: 3s countdown, tiled platform caves
// ~3s behind you, dodge obstructions, solids pause you 1s then vanish,
// sprint button, distance recorded, 100 levels each with its own color
// texture. When the floor catches you, you fall INTO A VORTEX and warp
// to the next realm (next level) — distance kept. Reach level 100 and
// the vortex sucks you UP: victory.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  createGame, stepGame, landFromWarp, resetRun,
  COUNTDOWN_MS, MAX_LEVEL, LEVEL_EVERY_M,
} from './engine.js';
import { paletteForLevel } from './textures.js';
import { createRunRenderer } from './run3d.js';
import { pickVortexWraps } from '@/lib/vortex/wraps';
import VortexTubeRide from '@/app/nexus-vortex/components/VortexTubeRide.jsx';
import { CHARACTERS } from '@/lib/characters/roster';
import {
  LANDING_PERSPECTIVE_KEY, LANDING_CHARACTER_KEY, LANDING_DEFAULT_PERSPECTIVE,
} from '@/lib/fintrac-explanation';

const BEST_KEY = 'collapse-run-best';
const WARP_MS = 3500;

export default function CollapseRunPage() {
  const router = useRouter();
  const mountRef = useRef(null);
  const gameRef = useRef(null);
  const rendererRef = useRef(null);
  const inputRef = useRef({ steer: 0, sprint: false });
  const skinsRef = useRef(null);
  const [phase, setPhase] = useState('countdown'); // countdown | running | warping | ascending | victory
  const [hud, setHud] = useState({ distance: 0, level: 1, best: 0, speed: 0, newBest: false });
  const [countdown, setCountdown] = useState(3);
  const [levelName, setLevelName] = useState('');
  const [riderPrefs, setRiderPrefs] = useState({
    perspective: LANDING_DEFAULT_PERSPECTIVE, characterPreview: null,
  });
  const [webglFailed, setWebglFailed] = useState(false);
  const lastLevelRef = useRef(1);
  const loopRaf = useRef(0);

  // One game loop for the whole page: countdown, running, hitpause.
  // Warp/ascending/victory pause it; warpDone/runAgain restart it.
  const startLoop = useCallback(() => {
    const g = gameRef.current;
    const renderer = rendererRef.current;
    if (!g || !renderer) return;
    cancelAnimationFrame(loopRaf.current);
    let last = performance.now();
    let lastCount = Math.ceil(g.countdownT);
    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      if (g.phase === 'countdown' || g.phase === 'running' || g.phase === 'hitpause') {
        stepGame(g, dt, inputRef.current);
        renderer.update(g, dt, t);
        const c = Math.ceil(g.countdownT);
        if (g.phase === 'countdown' && c !== lastCount && c > 0) { lastCount = c; setCountdown(c); }
        if (g.phase === 'running') setPhase('running');
        if (g.level !== lastLevelRef.current) {
          lastLevelRef.current = g.level;
          const pal = paletteForLevel(g.level);
          renderer.setPalette(pal);
          setLevelName(pal.name);
          setTimeout(() => setLevelName(''), 2500);
        }
        if (g.phase === 'warping' || g.phase === 'ascending') {
          skinsRef.current = pickVortexWraps(skinsRef.current);
          setPhase(g.phase);
          return; // loop rests until warpDone restarts it
        }
        setHud({
          distance: Math.floor(g.distance), level: g.level,
          best: g.best, speed: g.speed, newBest: g.newBest,
        });
        try {
          const lb = parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0;
          if (g.best > lb) localStorage.setItem(BEST_KEY, String(g.best));
        } catch { /* private mode */ }
        loopRaf.current = requestAnimationFrame(loop);
      }
    };
    loopRaf.current = requestAnimationFrame(loop);
  }, []);

  // Best distance: local fast path, account record when signed in.
  useEffect(() => {
    try {
      const b = parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0;
      gameRef.current = createGame(undefined, b);
    } catch {
      gameRef.current = createGame();
    }
    setHud((h) => ({ ...h, best: gameRef.current.best }));
  }, []);

  // Landing prefs for the vortex warp (3rd person shows the character).
  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const res = await fetch('/api/ui-state', {
          headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
        });
        if (!res.ok) return;
        const body = await res.json().catch(() => null);
        const prefs = (body && body.preferences) || {};
        const perspective =
          prefs[LANDING_PERSPECTIVE_KEY] === '1st' || prefs[LANDING_PERSPECTIVE_KEY] === '3rd'
            ? prefs[LANDING_PERSPECTIVE_KEY] : LANDING_DEFAULT_PERSPECTIVE;
        const character = CHARACTERS.find((c) => c.id === prefs[LANDING_CHARACTER_KEY]) || null;
        setRiderPrefs({ perspective, characterPreview: character ? character.preview : null });
      } catch { /* defaults stand */ }
    })();
  }, []);

  // Main loop.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mount = mountRef.current;
    const g = gameRef.current;
    if (!mount || !g) return;

    let renderer = null;
    try {
      renderer = createRunRenderer(mount, paletteForLevel(1));
    } catch {
      setWebglFailed(true);
      return;
    }
    rendererRef.current = renderer;
    if (riderPrefs.characterPreview) renderer.setCharacter(riderPrefs.characterPreview);
    startLoop();
    return () => {
      cancelAnimationFrame(loopRaf.current);
      renderer.dispose();
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The runner wears the user's selected character (prefs load async).
  useEffect(() => {
    if (riderPrefs.characterPreview) {
      rendererRef.current?.setCharacter(riderPrefs.characterPreview);
    }
  }, [riderPrefs.characterPreview]);

  const warpDone = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    if (g.phase === 'ascending') {
      setPhase('victory');
      return;
    }
    landFromWarp(g);
    lastLevelRef.current = g.level;
    const pal = paletteForLevel(g.level);
    rendererRef.current?.setPalette(pal);
    setLevelName(pal.name);
    setTimeout(() => setLevelName(''), 2500);
    setPhase('running');
    startLoop();
  }, [startLoop]);

  const runAgain = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    resetRun(g);
    lastLevelRef.current = 1;
    rendererRef.current?.setPalette(paletteForLevel(1));
    setPhase('countdown');
    setCountdown(3);
    setHud({ distance: 0, level: 1, best: g.best, speed: 0, newBest: false });
    startLoop();
  }, [startLoop]);

  // Steering: drag anywhere (pointer), arrows/AD on desktop.
  useEffect(() => {
    const onMove = (e) => {
      if (phase !== 'running') return;
      const x = e.clientX ?? (e.touches && e.touches[0] && e.touches[0].clientX);
      if (x == null) return;
      inputRef.current.steer = Math.max(-1, Math.min(1, (x / window.innerWidth) * 2 - 1)) * 1.4;
    };
    const onKey = (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') inputRef.current.steer = -1;
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') inputRef.current.steer = 1;
    };
    const onKeyUp = () => { inputRef.current.steer = 0; };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [phase]);

  const setSprint = (on) => { inputRef.current.sprint = on; };

  if (webglFailed) {
    return (
      <main style={styles.page}>
        <div style={styles.center}>
          <p style={styles.kicker}>Collapse Run</p>
          <p style={styles.sub}>This game needs WebGL, which your browser has disabled.</p>
          <button type="button" style={styles.cta} onClick={() => router.push('/')}>Back to hub</button>
        </div>
      </main>
    );
  }

  const inWarp = phase === 'warping' || phase === 'ascending';

  return (
    <main style={styles.page}>
      <div ref={mountRef} style={styles.canvas} aria-label="Collapse Run 3D" />

      {/* HUD */}
      {(phase === 'running' || phase === 'countdown') && (
        <div style={styles.hud} aria-live="polite">
          <div>
            <div style={styles.hudLabel}>Distance</div>
            <div style={styles.hudBig}>{hud.distance}m</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={styles.hudLabel}>Level {hud.level}/{MAX_LEVEL}</div>
            <div style={styles.hudMid}>{Math.floor(hud.distance % LEVEL_EVERY_M)}/{LEVEL_EVERY_M}m</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={styles.hudLabel}>Best</div>
            <div style={styles.hudBig}>{hud.best}m{hud.newBest && hud.distance > 0 ? ' ★' : ''}</div>
          </div>
        </div>
      )}

      {/* Level banner */}
      {levelName && (
        <div style={styles.banner} aria-hidden="true">
          <p style={styles.bannerK}>Realm {hud.level}</p>
          <p style={styles.bannerN}>{levelName}</p>
        </div>
      )}

      {/* Countdown */}
      {phase === 'countdown' && (
        <div style={styles.center}>
          <p style={{ ...styles.count, }} key={countdown}>{countdown}</p>
          <p style={styles.sub}>The floor caves behind you. Don't let it catch you.</p>
        </div>
      )}

      {/* Sprint button */}
      {phase === 'running' && (
        <button
          type="button"
          aria-label="Sprint (hold)"
          onPointerDown={() => setSprint(true)}
          onPointerUp={() => setSprint(false)}
          onPointerLeave={() => setSprint(false)}
          onPointerCancel={() => setSprint(false)}
          style={styles.sprint}
        >
          SPRINT
        </button>
      )}

      {/* Vortex warp on fall / ascent on victory */}
      {inWarp && skinsRef.current && (
        <VortexTubeRide
          outsideSkin={skinsRef.current.outside}
          insideSkin={skinsRef.current.inside}
          destinationName={phase === 'ascending' ? 'The Summit' : `Realm ${gameRef.current?.level || ''}`}
          durationMs={WARP_MS}
          onDone={warpDone}
          characterPreview={riderPrefs.characterPreview}
          perspective={riderPrefs.perspective}
        />
      )}

      {/* Victory */}
      {phase === 'victory' && (
        <div style={styles.center}>
          <p style={styles.kicker}>The Summit</p>
          <h1 style={styles.h1}>You climbed all 100 realms</h1>
          <p style={styles.sub}>
            {hud.distance}m run{hud.newBest ? ' — a new best!' : '.'}
          </p>
          <button type="button" style={styles.cta} onClick={runAgain}>Run again</button>
          <p style={styles.hint}>
            <button type="button" onClick={() => router.push('/')} style={styles.linkBtn}>
              Back to hub
            </button>
          </p>
        </div>
      )}

      {/* Steering hint */}
      {phase === 'running' && (
        <p style={styles.steerHint}>Drag or tilt to steer — hold SPRINT to outrun the collapse</p>
      )}
    </main>
  );
}

const styles = {
  page: {
    position: 'fixed', inset: 0, background: '#000', color: '#E0E0E0',
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', overflow: 'hidden',
    userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'none',
  },
  canvas: { position: 'absolute', inset: 0 },
  hud: {
    position: 'absolute', top: 0, left: 0, right: 0,
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: 'calc(12px + env(safe-area-inset-top)) 16px 0',
    pointerEvents: 'none', textShadow: '0 2px 8px #000',
  },
  hudLabel: { fontSize: '10px', letterSpacing: '3px', textTransform: 'uppercase', color: '#ffd700' },
  hudBig: { fontSize: '1.5rem', fontWeight: 800, color: '#fff' },
  hudMid: { fontSize: '0.85rem', color: '#9aa' },
  center: {
    position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '24px',
    background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.25) 20%, rgba(0,0,0,0.75) 100%)',
  },
  count: { fontSize: 'clamp(4rem, 20vw, 8rem)', fontWeight: 900, color: '#ffd700', margin: 0, textShadow: '0 0 40px rgba(255,215,0,0.5)' },
  kicker: { letterSpacing: '6px', textTransform: 'uppercase', color: '#ffd700', fontSize: '12px', margin: '0 0 10px' },
  h1: { fontSize: 'clamp(1.6rem, 6vw, 2.6rem)', margin: '0 0 12px', color: '#fff' },
  sub: { color: '#9aa', fontSize: '1rem', margin: '0 0 24px', lineHeight: 1.6 },
  hint: { color: '#555', fontSize: '0.8rem', marginTop: '16px' },
  cta: {
    minHeight: '52px', padding: '0 36px', background: 'transparent', border: '2px solid #ffd700',
    color: '#ffd700', borderRadius: '999px', cursor: 'pointer', fontSize: '1.05rem',
    letterSpacing: '2px', textTransform: 'uppercase',
  },
  linkBtn: {
    background: 'none', border: 'none', color: '#9aa', fontSize: '0.85rem',
    cursor: 'pointer', textDecoration: 'underline', padding: '4px',
  },
  banner: {
    position: 'absolute', top: '18%', left: 0, right: 0, textAlign: 'center',
    pointerEvents: 'none', textShadow: '0 2px 12px #000',
  },
  bannerK: { color: '#ffd700', letterSpacing: '6px', textTransform: 'uppercase', fontSize: '11px', margin: '0 0 6px' },
  bannerN: { color: '#fff', fontSize: 'clamp(1.4rem, 5vw, 2.2rem)', fontWeight: 800, margin: 0, letterSpacing: '2px' },
  sprint: {
    position: 'absolute', right: '18px', bottom: 'calc(90px + env(safe-area-inset-bottom))',
    width: '92px', height: '92px', borderRadius: '50%',
    background: 'radial-gradient(circle at 35% 30%, #ffdf6b, #c9962e)',
    border: '3px solid #ffd700', color: '#201400', fontWeight: 900, fontSize: '0.8rem',
    letterSpacing: '1px', cursor: 'pointer', touchAction: 'none',
    boxShadow: '0 0 24px rgba(255,215,0,0.45)',
  },
  steerHint: {
    position: 'absolute', bottom: 'calc(18px + env(safe-area-inset-bottom))', left: 0, right: 0,
    textAlign: 'center', color: '#666', fontSize: '0.75rem', pointerEvents: 'none',
  },
};
