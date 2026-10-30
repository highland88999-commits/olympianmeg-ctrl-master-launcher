'use client';

// Quidditch — Seeker Duel (Merlin, 2026-10-30).
// You are the Seeker on a broom over a night stadium. Beat the rival
// Seeker to the Golden Snitch: catch it (+150) and you win; the rival
// catching it first loses you the match. Two Bludgers periodically lock
// on and home in on you — a hit stuns you for 2s (red arrow warns you).
// Bot Chasers play an ambient Quaffle game (+10 per goal) for flavor.
// Drag to steer (horizontal = turn, vertical = climb/dive); hold DIVE
// for a speed burst with a cooldown.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  createGame, stepGame, resetGame, dist3, COUNTDOWN_MS,
} from './engine.js';
import { createQuidditchRenderer } from './quidditch3d.js';
import { CHARACTERS } from '@/lib/characters/roster';
import {
  LANDING_CHARACTER_KEY,
} from '@/lib/fintrac-explanation';

const SNITCH_NEAR_M = 15;

export default function QuidditchPage() {
  const router = useRouter();
  const mountRef = useRef(null);
  const gameRef = useRef(null);
  const rendererRef = useRef(null);
  const inputRef = useRef({ yaw: 0, pitch: 0, dive: false });
  const dragRef = useRef(null); // { x0, y0 } while steering
  const [phase, setPhase] = useState('countdown'); // countdown | playing | won | lost
  const [hud, setHud] = useState({
    speed: 0, you: 0, rival: 0, time: 0,
    snitchDist: 999, stunned: false, diveCd: 0, diveReady: true,
  });
  const [countdown, setCountdown] = useState(3);
  const [characterPreview, setCharacterPreview] = useState(null);
  const [webglFailed, setWebglFailed] = useState(false);
  const loopRaf = useRef(0);

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
      if (g.phase === 'countdown' || g.phase === 'playing') {
        stepGame(g, dt, inputRef.current);
        renderer.update(g, dt, t);
        const c = Math.ceil(g.countdownT);
        if (g.phase === 'countdown' && c !== lastCount && c > 0) { lastCount = c; setCountdown(c); }
        if (g.phase === 'playing' && phase !== 'playing') setPhase('playing');
        if (g.phase === 'won' || g.phase === 'lost') {
          setPhase(g.phase);
          setHud((h) => ({ ...h, you: g.score.you, rival: g.score.rival, time: g.time }));
          return; // loop rests until rematch restarts it
        }
        setHud({
          speed: Math.round(g.player.speed * 3.6), // km/h for flavor
          you: g.score.you,
          rival: g.score.rival,
          time: g.time,
          snitchDist: dist3(g.player.pos, g.snitch.pos),
          stunned: g.player.stunT > 0,
          diveCd: Math.max(0, g.player.diveCd),
          diveReady: g.player.diveCd <= 0 && g.player.diveT <= 0,
        });
        loopRaf.current = requestAnimationFrame(loop);
      }
    };
    loopRaf.current = requestAnimationFrame(loop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => {
    gameRef.current = createGame();
  }, []);

  // Rider's selected character rides the broom.
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
        const character = CHARACTERS.find((c) => c.id === prefs[LANDING_CHARACTER_KEY]) || null;
        if (character) setCharacterPreview(character.preview);
      } catch { /* badge stays hidden, capsule rides */ }
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
      renderer = createQuidditchRenderer(mount);
    } catch {
      setWebglFailed(true);
      return;
    }
    rendererRef.current = renderer;
    if (characterPreview) renderer.setCharacter(characterPreview);
    startLoop();
    return () => {
      cancelAnimationFrame(loopRaf.current);
      renderer.dispose();
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (characterPreview) rendererRef.current?.setCharacter(characterPreview);
  }, [characterPreview]);

  const rematch = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    resetGame(g);
    inputRef.current = { yaw: 0, pitch: 0, dive: false };
    setPhase('countdown');
    setCountdown(3);
    setHud({
      speed: 0, you: 0, rival: 0, time: 0,
      snitchDist: 999, stunned: false, diveCd: 0, diveReady: true,
    });
    startLoop();
  }, [startLoop]);

  // Steering: drag anywhere — horizontal turns, vertical climbs/dives.
  // Arrows/WASD on desktop. DIVE is the hold button.
  useEffect(() => {
    const onDown = (e) => {
      if (phase !== 'playing') return;
      const x = e.clientX ?? (e.touches && e.touches[0] && e.touches[0].clientX);
      const y = e.clientY ?? (e.touches && e.touches[0] && e.touches[0].clientY);
      if (x == null || y == null) return;
      dragRef.current = { x0: x, y0: y };
    };
    const onMove = (e) => {
      const d = dragRef.current;
      if (!d || phase !== 'playing') return;
      const x = e.clientX ?? (e.touches && e.touches[0] && e.touches[0].clientX);
      const y = e.clientY ?? (e.touches && e.touches[0] && e.touches[0].clientY);
      if (x == null || y == null) return;
      const dx = (x - d.x0) / (window.innerWidth * 0.28);
      const dy = (d.y0 - y) / (window.innerHeight * 0.28); // up-drag = climb
      inputRef.current.yaw = Math.max(-1, Math.min(1, dx));
      inputRef.current.pitch = Math.max(-1, Math.min(1, dy));
    };
    const onUp = () => {
      dragRef.current = null;
      inputRef.current.yaw = 0;
      inputRef.current.pitch = 0;
    };
    const onKey = (e) => {
      const k = e.key.toLowerCase();
      if (k === 'arrowleft' || k === 'a') inputRef.current.yaw = -1;
      if (k === 'arrowright' || k === 'd') inputRef.current.yaw = 1;
      if (k === 'arrowup' || k === 'w') inputRef.current.pitch = 1;
      if (k === 'arrowdown' || k === 's') inputRef.current.pitch = -1;
      if (k === 'shift') inputRef.current.dive = true;
    };
    const onKeyUp = (e) => {
      const k = e.key.toLowerCase();
      if (['arrowleft', 'arrowright', 'a', 'd'].includes(k)) inputRef.current.yaw = 0;
      if (['arrowup', 'arrowdown', 'w', 's'].includes(k)) inputRef.current.pitch = 0;
      if (k === 'shift') inputRef.current.dive = false;
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [phase]);

  const setDive = (on) => { inputRef.current.dive = on; };

  if (webglFailed) {
    return (
      <main style={styles.page}>
        <div style={styles.center}>
          <p style={styles.kicker}>Quidditch</p>
          <p style={styles.sub}>This game needs WebGL, which your browser has disabled.</p>
          <button type="button" style={styles.cta} onClick={() => router.push('/')}>Back to hub</button>
        </div>
      </main>
    );
  }

  const snitchNear = hud.snitchDist < SNITCH_NEAR_M && phase === 'playing';
  const mm = Math.floor(hud.time / 60);
  const ss = Math.floor(hud.time % 60).toString().padStart(2, '0');

  return (
    <main style={styles.page}>
      <div ref={mountRef} style={styles.canvas} aria-label="Quidditch 3D" />

      {/* HUD */}
      {(phase === 'playing' || phase === 'countdown') && (
        <div style={styles.hud} aria-live="polite">
          <div>
            <div style={styles.hudLabel}>You</div>
            <div style={styles.hudBig}>{hud.you}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={styles.hudLabel}>{mm}:{ss}</div>
            <div style={styles.hudMid}>{hud.speed} km/h</div>
            {snitchNear && (
              <div style={styles.snitchPulse} aria-label="Snitch near">
                ★ SNITCH NEAR ★
              </div>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={styles.hudLabel}>Rival</div>
            <div style={styles.hudBig}>{hud.rival}</div>
          </div>
        </div>
      )}

      {/* Countdown */}
      {phase === 'countdown' && (
        <div style={styles.center}>
          <p style={styles.count} key={countdown}>{countdown}</p>
          <p style={styles.sub}>Catch the Golden Snitch before the rival Seeker does.<br />Watch for Bludgers.</p>
        </div>
      )}

      {/* Stun flash */}
      {phase === 'playing' && hud.stunned && (
        <div style={styles.stunFlash} aria-live="assertive">STUNNED!</div>
      )}

      {/* DIVE button */}
      {phase === 'playing' && (
        <button
          type="button"
          aria-label="Dive burst (hold)"
          onPointerDown={() => setDive(true)}
          onPointerUp={() => setDive(false)}
          onPointerLeave={() => setDive(false)}
          onPointerCancel={() => setDive(false)}
          style={{ ...styles.dive, ...(hud.diveReady ? null : styles.diveCooling) }}
        >
          {hud.diveReady ? 'DIVE' : `${Math.ceil(hud.diveCd)}s`}
        </button>
      )}

      {/* Victory */}
      {phase === 'won' && (
        <div style={styles.center}>
          <p style={styles.kicker}>Golden Snitch caught</p>
          <h1 style={styles.h1}>You win the match!</h1>
          <p style={styles.sub}>Final score — You {hud.you} · Rival {hud.rival}</p>
          <button type="button" style={styles.cta} onClick={rematch}>Rematch</button>
          <p style={styles.hint}>
            <button type="button" onClick={() => router.push('/')} style={styles.linkBtn}>
              Back to hub
            </button>
          </p>
        </div>
      )}

      {/* Defeat */}
      {phase === 'lost' && (
        <div style={styles.center}>
          <p style={styles.kicker}>Snitch taken</p>
          <h1 style={styles.h1}>The rival Seeker got it first</h1>
          <p style={styles.sub}>Final score — You {hud.you} · Rival {hud.rival}</p>
          <button type="button" style={styles.cta} onClick={rematch}>Rematch</button>
          <p style={styles.hint}>
            <button type="button" onClick={() => router.push('/')} style={styles.linkBtn}>
              Back to hub
            </button>
          </p>
        </div>
      )}

      {/* Steering hint */}
      {phase === 'playing' && (
        <p style={styles.steerHint}>Drag to steer — up climbs, down dives · hold DIVE for a burst</p>
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
  hudLabel: { fontSize: '10px', letterSpacing: '3px', textTransform: 'uppercase', color: '#ffd75e' },
  hudBig: { fontSize: '1.5rem', fontWeight: 800, color: '#fff' },
  hudMid: { fontSize: '0.85rem', color: '#9aa' },
  snitchPulse: {
    marginTop: '6px', fontSize: '0.8rem', fontWeight: 900, letterSpacing: '2px',
    color: '#ffd75e', animation: 'quidditchPulse 0.7s ease-in-out infinite alternate',
  },
  center: {
    position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '24px',
    background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.25) 20%, rgba(0,0,0,0.75) 100%)',
  },
  count: { fontSize: 'clamp(4rem, 20vw, 8rem)', fontWeight: 900, color: '#ffd75e', margin: 0, textShadow: '0 0 40px rgba(255,215,94,0.5)' },
  kicker: { letterSpacing: '6px', textTransform: 'uppercase', color: '#ffd75e', fontSize: '12px', margin: '0 0 10px' },
  h1: { fontSize: 'clamp(1.6rem, 6vw, 2.6rem)', margin: '0 0 12px', color: '#fff' },
  sub: { color: '#9aa', fontSize: '1rem', margin: '0 0 24px', lineHeight: 1.6 },
  hint: { color: '#555', fontSize: '0.8rem', marginTop: '16px' },
  cta: {
    minHeight: '52px', padding: '0 36px', background: 'transparent', border: '2px solid #ffd75e',
    color: '#ffd75e', borderRadius: '999px', cursor: 'pointer', fontSize: '1.05rem',
    letterSpacing: '2px', textTransform: 'uppercase',
  },
  linkBtn: {
    background: 'none', border: 'none', color: '#9aa', fontSize: '0.85rem',
    cursor: 'pointer', textDecoration: 'underline', padding: '4px',
  },
  dive: {
    position: 'absolute', right: '18px', bottom: 'calc(90px + env(safe-area-inset-bottom))',
    width: '92px', height: '92px', borderRadius: '50%',
    background: 'radial-gradient(circle at 35% 30%, #ffe9a3, #c9962e)',
    border: '3px solid #ffd75e', color: '#201400', fontWeight: 900, fontSize: '0.85rem',
    letterSpacing: '1px', cursor: 'pointer', touchAction: 'none',
    boxShadow: '0 0 24px rgba(255,215,94,0.45)',
  },
  diveCooling: {
    background: 'radial-gradient(circle at 35% 30%, #4a4a55, #23232b)',
    border: '3px solid #555', color: '#999', boxShadow: 'none',
  },
  stunFlash: {
    position: 'absolute', top: '22%', left: 0, right: 0, textAlign: 'center',
    fontSize: 'clamp(1.8rem, 8vw, 3rem)', fontWeight: 900, letterSpacing: '4px',
    color: '#ff4d5e', textShadow: '0 0 24px rgba(255,77,94,0.8)', pointerEvents: 'none',
  },
  steerHint: {
    position: 'absolute', bottom: 'calc(18px + env(safe-area-inset-bottom))', left: 0, right: 0,
    textAlign: 'center', color: '#666', fontSize: '0.75rem', pointerEvents: 'none',
  },
};

// Pulse keyframes for the snitch proximity meter (injected once).
if (typeof document !== 'undefined' && !document.getElementById('quidditch-pulse-css')) {
  const el = document.createElement('style');
  el.id = 'quidditch-pulse-css';
  el.textContent = '@keyframes quidditchPulse { from { opacity: 0.55; transform: scale(0.96); } to { opacity: 1; transform: scale(1.05); } }';
  document.head.appendChild(el);
}
