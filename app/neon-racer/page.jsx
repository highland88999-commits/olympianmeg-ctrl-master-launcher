'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { grantAchievement } from '@/lib/achievements/award';
import AchievementBanner from '@/components/achievements/AchievementBanner';
import {
  createGame,
  startGame,
  setShipTarget,
  fireBullet,
  updateGame,
  drainEvents,
  timeLeft,
  MISSION_SECONDS,
  WORLD,
} from './game';
import { createRenderer } from './render';
import { fx, unlockFx, setFxEnabled, isFxEnabled } from '@/lib/fx';
// Race feedback routes through the central FX library (lib/fx.js): matched
// sound+haptic pairs, one launcher-wide "Sound & vibration" setting.
// (The old bespoke ./audio.js synth is retired — left in place, unused.)

function cssUnit(cw, ch) {
  return Math.min(cw, ch) / 2 / 11.5;
}

export default function NeonRacerPage() {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const gameRef = useRef(null);
  const rendererRef = useRef(null);
  // audioRef removed: race feedback now goes through lib/fx
  const keysRef = useRef(new Set());
  const dragRef = useRef(null);
  const reducedMotionRef = useRef(false);

  const scoreRef = useRef(null);
  const shieldsRef = useRef(null);
  const timeRef = useRef(null);
  const levelRef = useRef(null);
  const lastShieldsRef = useRef(-1);

  // Shield glyph (inline SVG, cyan) — the HUD shields read as neon
  // hardware now, not emoji. Matches the NrIcon set below.
  const SHIELD_SVG =
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="display:inline-block;vertical-align:-4px;margin-right:2px"><path d="M12 2 L20 5 V11 C20 16 16.5 20.5 12 22 C7.5 20.5 4 16 4 11 V5 Z"/></svg>';

  const [phase, setPhase] = useState('ready'); // ready | playing | won | lost
  const [finalScore, setFinalScore] = useState(0);
  const [muted, setMuted] = useState(false);

  const [celebrateKey, setCelebrateKey] = useState(null); // achievement celebration
  const shardsTakenRef = useRef(0);
  const ringsUsedRef = useRef(0);

  // Fire-and-forget achievement grant. Signed-in users only (guests earn
  // nothing server-side); the banner shows only when the server confirms
  // a fresh award (awarded=false means already held — no repeat celebration).
  const getToken = async () => {
    try {
      const { data } = await supabase.auth.getSession();
      return data?.session?.access_token || null;
    } catch { return null; }
  };
  const award = (key) => {
    grantAchievement(key, getToken).then((r) => {
      if (r && r.awarded) setCelebrateKey((cur) => cur ?? key);
    }).catch(() => {});
  };

  // --- DIONYSUS interior treatment: ambient menu backdrop (video only off-gameplay) ---
  const NR_BG = '/images/neon-racer/bg.webp';
  const NR_VIDEO = '/images/neon-racer/bg-loop.mp4';
  const NR_STILL = '/images/neon-racer/bg-still.jpg';
  const [ambience, setAmbience] = useState('video');
  const reducedMotionInit = useRef(false);
  useEffect(() => {
    try {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setAmbience('still'); reducedMotionInit.current = true; return; }
      const saved = window.localStorage.getItem('neon-racer-bg');
      if (saved === 'still' || saved === 'off' || saved === 'video') setAmbience(saved);
    } catch { /* storage unavailable */ }
  }, []);
  const cycleAmbience = () => {
    setAmbience((a) => {
      const next = a === 'video' ? 'still' : a === 'still' ? 'off' : 'video';
      try { window.localStorage.setItem('neon-racer-bg', next); } catch { /* noop */ }
      return next;
    });
  };

  // Inline SVG glyphs (zero image weight).
  const GLYPHS = {
    play: 'M8 5v14l11-7z',
    replay: 'M12 5V1L7 6l5 5V7c3.3 0 6 2.7 6 6s-2.7 6-6 6-6-2.7-6-6H4c0 4.4 3.6 8 8 8s8-3.6 8-8-3.6-8-8-8z',
    soundOn: 'M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z',
    soundOff: 'M3 9v6h4l5 5V4L7 9H3zm13.6 3 2.5-2.5-1.4-1.4-2.5 2.5-2.5-2.5-1.4 1.4L13.8 12l-2.5 2.5 1.4 1.4 2.5-2.5 2.5 2.5 1.4-1.4z',
  };
  const NrIcon = ({ name, size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="shrink-0">
      <path d={GLYPHS[name]} />
    </svg>
  );

  // --- game loop -----------------------------------------------------------
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    reducedMotionRef.current =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const game = createGame((Date.now() ^ (Math.random() * 1e9)) >>> 0);
    gameRef.current = game;
    const renderer = createRenderer(canvas, { reducedMotion: reducedMotionRef.current });
    rendererRef.current = renderer;
    setMuted(!isFxEnabled()); // mute button reflects the global FX setting
    renderer.resize();

    let raf = 0;
    let last = performance.now();
    let lastPhase = game.phase;

    const screenToWorld = (px, py) => {
      const rect = container.getBoundingClientRect();
      const u = cssUnit(rect.width, rect.height);
      return {
        x: (px - rect.left - rect.width / 2) / u,
        y: (rect.height / 2 - (py - rect.top)) / u,
      };
    };

    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      if (game.phase === 'playing') {
        // Keyboard steering.
        const keys = keysRef.current;
        const spd = 16 * dt;
        let dx = 0;
        let dy = 0;
        if (keys.has('arrowleft') || keys.has('a')) dx -= spd;
        if (keys.has('arrowright') || keys.has('d')) dx += spd;
        if (keys.has('arrowup') || keys.has('w')) dy += spd;
        if (keys.has('arrowdown') || keys.has('s')) dy -= spd;
        if (dx || dy) setShipTarget(game, game.ship.tx + dx, game.ship.ty + dy);

        updateGame(game, dt);

        for (const ev of drainEvents(game)) {
          if (ev.type === 'pickup') shardsTakenRef.current += 1;
          else if (ev.type === 'warp') ringsUsedRef.current += 1;
          if (ev.type === 'shoot') fx.shoot(); // laser: light zap + tick
          else if (ev.type === 'explosion') fx.hit(); // ship destroyed: impact
          else if (ev.type === 'pickup') fx.coin(); // pickup: bright chirp
          else if (ev.type === 'warp') fx.checkpoint(); // warp gate: soft chime
          else if (ev.type === 'hit') {
            fx.hit(); // player hit: dull thud
            renderer.addShake(9);
          } else if (ev.type === 'win') fx.gameWin(); // run complete: fanfare
          else if (ev.type === 'lose') {
            fx.death(); // ship lost: long rumble
            renderer.addShake(12);
          }
        }

        if (game.phase !== lastPhase) {
          lastPhase = game.phase;
          setFinalScore(game.score);
          setPhase(game.phase);
          if (game.phase === 'won') {
            award('neon-racer-first-flight');
            if (ringsUsedRef.current >= 5) award('neon-racer-wormrider');
            // Star Surfer (100 shards) is wired but unearnable as shipped:
            // shards spawn every 2.2–3.8s over a 90s mission (max ~41).
            // It fires if the count ever reaches 100.
            if (shardsTakenRef.current >= 100) award('neon-racer-star-surfer');
          }
        }

        // HUD (direct DOM — no re-render churn).
        if (scoreRef.current) scoreRef.current.textContent = String(game.score);
        if (shieldsRef.current && lastShieldsRef.current !== game.shields) {
          lastShieldsRef.current = game.shields;
          shieldsRef.current.innerHTML = game.shields > 0
            ? SHIELD_SVG.repeat(game.shields)
            : '—';
        }
        if (timeRef.current) timeRef.current.textContent = `${Math.ceil(timeLeft(game))}s`;
        if (levelRef.current) levelRef.current.textContent = `SPEED ${game.level}`;
      }

      renderer.render(game, now, dt);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // --- input -------------------------------------------------------------
    const onPointerDown = (e) => {
      if (game.phase !== 'playing') return;
      const w = screenToWorld(e.clientX, e.clientY);
      dragRef.current = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false };
      setShipTarget(game, w.x, w.y);
      container.setPointerCapture && container.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e) => {
      const drag = dragRef.current;
      if (!drag || game.phase !== 'playing') return;
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 10) drag.moved = true;
      const w = screenToWorld(e.clientX, e.clientY);
      setShipTarget(game, w.x, w.y);
    };
    const onPointerUp = (e) => {
      const drag = dragRef.current;
      dragRef.current = null;
      if (!drag || game.phase !== 'playing') return;
      // Quick tap without dragging = shoot.
      if (!drag.moved && performance.now() - drag.t < 350) fireBullet(game);
    };
    const onKeyDown = (e) => {
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      keysRef.current.add(k === ' ' ? 'space' : k);
      if (k === ' ' && game.phase === 'playing') fireBullet(game);
    };
    const onKeyUp = (e) => {
      const k = e.key.toLowerCase();
      keysRef.current.delete(k === ' ' ? 'space' : k);
    };
    const onResize = () => renderer.resize();

    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerup', onPointerUp);
    container.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerup', onPointerUp);
      container.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      gameRef.current = null;
      rendererRef.current = null;
    };
  }, []);

  const begin = () => {
    const game = gameRef.current;
    if (!game) return;
    unlockFx(); // starting is a gesture: make sure FX is live
    fx.tap(); // run confirmed
    shardsTakenRef.current = 0;
    ringsUsedRef.current = 0;
    startGame(game);
    setFinalScore(0);
    setPhase('playing');
  };

  const toggleMute = () => {
    const next = !isFxEnabled();
    setFxEnabled(next);
    setMuted(!next);
  };

  return (
    <div className="fixed inset-0 bg-black text-white overflow-hidden select-none">
      <div ref={containerRef} className="absolute inset-0" style={{ touchAction: 'none' }}>
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />

        {/* HUD */}
        {phase !== 'ready' && (
          <div className="absolute left-0 right-0 z-10 pointer-events-none" style={{ top: 'max(3.5rem, calc(env(safe-area-inset-top) + 3rem))' }}>
            <div className="flex items-start justify-between px-4 pt-4">
              <div>
                <div className="text-[11px] tracking-widest text-cyan-300/70 uppercase">Score</div>
                <div ref={scoreRef} className="text-3xl font-black text-cyan-300 tabular-nums" style={{ textShadow: '0 0 12px rgba(0,229,255,.6)' }}>0</div>
                <div ref={levelRef} className="text-xs tracking-widest text-fuchsia-300/80 mt-1">SPEED 1</div>
              </div>
              <div className="text-center">
                <div className="text-[11px] tracking-widest text-cyan-300/70 uppercase">Time left</div>
                <div ref={timeRef} className="text-3xl font-black text-white tabular-nums">{MISSION_SECONDS}s</div>
              </div>
              <div className="text-right">
                <div className="text-[11px] tracking-widest text-cyan-300/70 uppercase">Shields</div>
                <div ref={shieldsRef} className="text-2xl leading-8 text-cyan-300" style={{ textShadow: '0 0 12px rgba(0,229,255,.6)' }} dangerouslySetInnerHTML={{ __html: SHIELD_SVG.repeat(3) }} />
              </div>
            </div>
          </div>
        )}

        {/* Mute */}
        {phase === 'playing' && (
          <button
            onClick={toggleMute}
            aria-label={muted ? 'Unmute sound' : 'Mute sound'}
            className="absolute bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 z-20 w-11 h-11 rounded-full border border-cyan-400/40 bg-black/60 text-cyan-300 flex items-center justify-center"
          >
            <NrIcon name={muted ? 'soundOff' : 'soundOn'} size={20} />
          </button>
        )}

        {/* Intro overlay — lighter than before so the idling CGI ship
            and nebula read through behind the title (the redesign). */}
        {phase === 'ready' && (
          <div className="absolute inset-0 z-30 bg-black/65 flex flex-col items-center justify-center text-center px-6 overflow-hidden">
            {/* Ambient menu backdrop: deep-space drift. Video → Still → Off. Never over gameplay. */}
            <div aria-hidden="true" className="absolute inset-0 pointer-events-none">
              {ambience === 'video' && (
                <video
                  src={NR_VIDEO}
                  autoPlay loop muted playsInline preload="metadata" poster={NR_STILL}
                  className="absolute inset-0 w-full h-full object-cover opacity-60"
                  aria-hidden="true"
                />
              )}
              {ambience === 'still' && (
                <div className="absolute inset-0 bg-cover bg-center opacity-60" style={{ backgroundImage: `url(${NR_STILL})` }} />
              )}
              {ambience === 'off' && (
                <div className="absolute inset-0 bg-cover bg-center opacity-45" style={{ backgroundImage: `url(${NR_BG})` }} />
              )}
              <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/70" />
            </div>
            <button
              onClick={cycleAmbience}
              aria-label={`Ambience: ${ambience}. Activate to change.`}
              title={`Ambience: ${ambience} (Video → Still → Off)`}
              className="absolute top-4 right-4 z-20 min-h-[44px] px-3 rounded-full bg-black/60 border border-white/20 text-[10px] font-bold tracking-widest uppercase text-zinc-300 hover:border-fuchsia-400/60"
            >
              {ambience === 'video' ? 'Video' : ambience === 'still' ? 'Still' : 'Off'}
            </button>
            <div className="relative z-10 flex flex-col items-center">
            <div className="text-xs tracking-[0.4em] text-fuchsia-400 uppercase mb-3">Deep Space Survival</div>
            <h1 className="text-5xl font-black tracking-widest text-cyan-300 mb-4" style={{ textShadow: '0 0 24px rgba(0,229,255,.7)' }}>NEON RACER</h1>
            <p className="text-zinc-300 max-w-sm text-sm leading-6 mb-2">
              Drag to steer your ship. Tap to shoot. Thread the pink rings for light-speed.
              Grab gold shards for points. Dodge the rocks.
            </p>
            <p className="text-zinc-400 text-sm mb-6">Survive {MISSION_SECONDS} seconds. You have 3 shields.</p>
            <button
              onClick={begin}
              className="px-10 py-4 border-2 border-fuchsia-500 text-fuchsia-400 text-xl font-bold tracking-widest hover:bg-fuchsia-500/20 transition-colors flex items-center gap-3"
              style={{ boxShadow: '0 0 18px rgba(255,61,240,.5)' }}
            >
              <NrIcon name="play" size={22} />
              ENGINE START
            </button>
            <p className="text-zinc-600 text-xs mt-4">Keyboard: arrows or WASD to steer, space to shoot</p>
            </div>
          </div>
        )}

        {/* Win overlay — lighter so the CGI scene reads behind it. */}
        {phase === 'won' && (
          <div className="absolute inset-0 z-30 bg-black/70 flex flex-col items-center justify-center text-center px-6 overflow-hidden">
            {ambience !== 'off' && (
              <div aria-hidden="true" className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-0 bg-cover bg-center opacity-40" style={{ backgroundImage: `url(${ambience === 'video' ? NR_STILL : NR_BG})` }} />
                <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/75" />
              </div>
            )}
            <div className="relative z-10 flex flex-col items-center">
            <h1 className="text-4xl font-black tracking-widest text-cyan-300 mb-2" style={{ textShadow: '0 0 24px rgba(0,229,255,.7)' }}>MISSION COMPLETE</h1>
            <p className="text-zinc-300 mb-1">You survived the run.</p>
            <p className="text-5xl font-black text-amber-300 my-4 tabular-nums">{finalScore}</p>
            <button
              onClick={begin}
              className="px-10 py-4 border-2 border-cyan-400 text-cyan-300 text-xl font-bold tracking-widest hover:bg-cyan-400/20 transition-colors flex items-center gap-3"
              style={{ boxShadow: '0 0 18px rgba(0,229,255,.5)' }}
            >
              <NrIcon name="replay" size={22} />
              FLY AGAIN
            </button>
            </div>
          </div>
        )}

        {/* Lose overlay — lighter so the CGI scene reads behind it. */}
        {phase === 'lost' && (
          <div className="absolute inset-0 z-30 bg-black/70 flex flex-col items-center justify-center text-center px-6 overflow-hidden">
            {ambience !== 'off' && (
              <div aria-hidden="true" className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-0 bg-cover bg-center opacity-40" style={{ backgroundImage: `url(${ambience === 'video' ? NR_STILL : NR_BG})` }} />
                <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/75" />
              </div>
            )}
            <div className="relative z-10 flex flex-col items-center">
            <h1 className="text-4xl font-black tracking-widest text-red-400 mb-2" style={{ textShadow: '0 0 24px rgba(255,49,49,.7)' }}>SHIELDS DEPLETED</h1>
            <p className="text-zinc-300 mb-1">The void claims another racer.</p>
            <p className="text-5xl font-black text-amber-300 my-4 tabular-nums">{finalScore}</p>
            <button
              onClick={begin}
              className="px-10 py-4 border-2 border-red-400 text-red-300 text-xl font-bold tracking-widest hover:bg-red-400/20 transition-colors flex items-center gap-3"
              style={{ boxShadow: '0 0 18px rgba(255,49,49,.5)' }}
            >
              <NrIcon name="replay" size={22} />
              TRY AGAIN
            </button>
            </div>
          </div>
        )}
      </div>
      {/* Safari bottom-bar clearance */}
      <div aria-hidden="true" className="player-clear" />
      <AchievementBanner
        achievementKey={celebrateKey}
        show={!!celebrateKey}
        onDismiss={() => setCelebrateKey(null)}
      />
    </div>
  );
}
