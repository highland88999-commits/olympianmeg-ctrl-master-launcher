'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Game, TABLE_W, TABLE_H, MALLET_R, WIN_SCORE,
  DIFFICULTY_ORDER, DIFFICULTIES,
} from './physics.js';
import { drawScene } from './render.js';
import { fx, unlockFx, setFxEnabled, isFxEnabled } from '@/lib/fx';

// Air-hockey feedback routes through the central FX library (lib/fx.js):
// matched sound+haptic pairs, one launcher-wide "Sound & vibration" setting.
function createSound() {
  return {
    unlock() { unlockFx(); },
    toggleMute() { setFxEnabled(!isFxEnabled()); return !isFxEnabled(); },
    get muted() { return !isFxEnabled(); },
    hit() { fx.tap(); }, // mallet strikes puck: tiny tick
    wall() { fx.tap(); }, // rail bounce: tiny tick
    goal() { fx.checkpoint(); }, // player scores: soft chime + tick
    conceded() { fx.checkpoint(); }, // AI scores: same chime, no shame
    win() { fx.gameWin(); }, // match win: full fanfare
    lose() { fx.menuClose(); }, // defeat: soft settle, no buzz-shame
  };
}

export default function AirHockeyPage() {
  const canvasRef = useRef(null);
  const gameRef = useRef(null);
  const soundRef = useRef(null);
  const keysRef = useRef({});
  const [difficulty, setDifficulty] = useState('medium');
  const [started, setStarted] = useState(false);
  const [hud, setHud] = useState({ player: 0, ai: 0, winner: null });
  const [muted, setMuted] = useState(false);
  const reducedMotion = useRef(false);

  if (!gameRef.current) gameRef.current = new Game(difficulty);
  if (!soundRef.current && typeof window !== 'undefined') soundRef.current = createSound();

  const syncHud = useCallback(() => {
    const g = gameRef.current;
    setHud({ player: g.playerScore, ai: g.aiScore, winner: g.winner });
  }, []);

  const startGame = useCallback((diff) => {
    const g = gameRef.current;
    g.difficulty = diff;
    soundRef.current.unlock();
    fx.tap(); // match confirmed
    g.start();
    setStarted(true);
    syncHud();
  }, [syncHud]);

  // ---- main loop ----
  useEffect(() => {
    setMuted(!isFxEnabled()); // mute button reflects the global FX setting
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const game = gameRef.current;
    reducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let raf = 0;
    let last = performance.now();

    // Fit canvas to viewport while keeping table aspect.
    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const availW = Math.min(window.innerWidth, 560);
      const availH = window.innerHeight - 190; // leave room for HUD + controls
      const scale = Math.min(availW / TABLE_W, availH / TABLE_H);
      canvas.width = Math.floor(TABLE_W * scale * dpr);
      canvas.height = Math.floor(TABLE_H * scale * dpr);
      canvas.style.width = `${Math.floor(TABLE_W * scale)}px`;
      canvas.style.height = `${Math.floor(TABLE_H * scale)}px`;
      ctx.setTransform((canvas.width / TABLE_W), 0, 0, (canvas.height / TABLE_H), 0, 0);
    };
    fit();
    window.addEventListener('resize', fit);

    const toTable = (clientX, clientY) => {
      const r = canvas.getBoundingClientRect();
      return {
        x: ((clientX - r.left) / r.width) * TABLE_W,
        y: ((clientY - r.top) / r.height) * TABLE_H,
      };
    };

    // Pointer: drag player mallet (player half only).
    let dragging = false;
    const onDown = (e) => {
      const p = toTable(e.clientX, e.clientY);
      const d = Math.hypot(p.x - game.player.x, p.y - game.player.y);
      if (d < MALLET_R * 2.2 || p.y > TABLE_H / 2) {
        dragging = true;
        game.player.x = p.x;
        game.player.y = p.y;
        game.player.clampToBounds();
        canvas.setPointerCapture?.(e.pointerId);
      }
      e.preventDefault();
    };
    const onMove = (e) => {
      if (!dragging) return;
      const p = toTable(e.clientX, e.clientY);
      game.player.x = p.x;
      game.player.y = p.y;
      game.player.clampToBounds();
      e.preventDefault();
    };
    const onUp = () => { dragging = false; };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);

    // Keyboard: arrows/WASD nudge the mallet.
    const keySpeed = 520;
    const onKeyDown = (e) => { keysRef.current[e.key.toLowerCase()] = true; };
    const onKeyUp = (e) => { keysRef.current[e.key.toLowerCase()] = false; };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    const frame = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      // Keyboard mallet movement.
      const k = keysRef.current;
      let kx = 0, ky = 0;
      if (k['arrowleft'] || k['a']) kx -= 1;
      if (k['arrowright'] || k['d']) kx += 1;
      if (k['arrowup'] || k['w']) ky -= 1;
      if (k['arrowdown'] || k['s']) ky += 1;
      if (kx || ky) {
        const n = Math.hypot(kx, ky);
        game.player.x += (kx / n) * keySpeed * dt;
        game.player.y += (ky / n) * keySpeed * dt;
        game.player.clampToBounds();
      }
      game.player.trackVelocity(dt);

      game.update(dt);

      for (const ev of game.drainEvents()) {
        const s = soundRef.current;
        if (ev === 'hit') s.hit();
        else if (ev === 'wall') s.wall();
        else if (ev === 'goal') {
          if (game.lastScorer === 'player') s.goal(); else s.conceded();
          syncHud();
        }
        else if (ev === 'win') { s.win(); syncHud(); }
        else if (ev === 'lose') { s.lose(); syncHud(); }
      }

      drawScene(ctx, game);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', fit);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [syncHud]);

  const toggleMute = () => {
    const m = soundRef.current.toggleMute();
    setMuted(m);
  };

  const winner = hud.winner;

    return (
    <main className="min-h-screen bg-[#050b12] text-white flex flex-col items-center px-3 py-4 select-none">
      <header className="w-full max-w-[560px] flex items-center justify-between mb-2">
        <h1 className="text-xl font-black tracking-widest uppercase">
          Air <span className="text-cyan-400">Hockey</span>
        </h1>
        <button
          onClick={toggleMute}
          className="px-3 py-2 text-sm rounded border border-cyan-500/40 bg-black/50 hover:bg-cyan-500/20"
          aria-label={muted ? 'Unmute sound' : 'Mute sound'}
        >
          {muted ? '🔇 Muted' : '🔊 Sound'}
        </button>
      </header>

      {/* Scoreboard — plain English */}
      <div className="w-full max-w-[560px] flex items-stretch justify-between mb-2 text-center">
        <div className="flex-1 rounded bg-cyan-500/10 border border-cyan-500/30 py-2">
          <div className="text-[11px] uppercase tracking-widest text-cyan-300">You</div>
          <div className="text-3xl font-black">{hud.player}</div>
        </div>
        <div className="px-3 flex flex-col justify-center">
          <div className="text-xs text-zinc-500 uppercase">First to {WIN_SCORE}</div>
          <div className="text-xs text-zinc-500">{DIFFICULTIES[difficulty].label}</div>
        </div>
        <div className="flex-1 rounded bg-red-500/10 border border-red-500/30 py-2">
          <div className="text-[11px] uppercase tracking-widest text-red-300">Rival</div>
          <div className="text-3xl font-black">{hud.ai}</div>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        className="rounded-lg border border-cyan-500/20 shadow-[0_0_40px_rgba(0,229,255,0.12)]"
        style={{ touchAction: 'none', cursor: 'crosshair' }}
        aria-label="Air hockey table. Drag your mallet on your half of the table."
      />

      <p className="mt-2 text-xs text-zinc-500 text-center max-w-[560px]">
        Drag your blue mallet with a finger or mouse. Arrow keys or WASD work too.
        Guard your goal at the bottom — first to {WIN_SCORE} wins.
      </p>

      {/* Start / difficulty overlay */}
      {!started && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-xl border border-cyan-500/30 bg-[#0a1622] p-6 text-center">
            <h2 className="text-2xl font-black uppercase tracking-widest mb-1">
              Air <span className="text-cyan-400">Hockey</span>
            </h2>
            <p className="text-sm text-zinc-400 mb-4">Pick a rival, then defend your goal. First to {WIN_SCORE} takes the match.</p>
            <div className="flex gap-2 justify-center mb-5" role="radiogroup" aria-label="Difficulty">
              {DIFFICULTY_ORDER.map((d) => (
                <button
                  key={d}
                  role="radio"
                  aria-checked={difficulty === d}
                  onClick={() => { fx.tap(); setDifficulty(d); }}
                  className={`px-4 py-2 rounded font-bold uppercase text-sm tracking-wider border transition-all ${
                    difficulty === d
                      ? 'bg-cyan-500/30 border-cyan-400 text-white'
                      : 'bg-black/40 border-zinc-700 text-zinc-400 hover:border-cyan-500/50'
                  }`}
                >
                  {DIFFICULTIES[d].label}
                </button>
              ))}
            </div>
            <button
              onClick={() => startGame(difficulty)}
              className="w-full py-3 rounded-lg bg-cyan-500 text-black font-black uppercase tracking-widest text-lg hover:bg-cyan-400 transition-colors"
            >
              Start match
            </button>
          </div>
        </div>
      )}

      {/* End overlay */}
      {winner && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-xl border border-cyan-500/30 bg-[#0a1622] p-6 text-center">
            <h2 className={`text-3xl font-black uppercase tracking-widest mb-2 ${winner === 'player' ? 'text-cyan-400' : 'text-red-400'}`}>
              {winner === 'player' ? 'You win!' : 'Rival wins'}
            </h2>
            <p className="text-zinc-400 mb-5">
              Final score {hud.player} – {hud.ai} ({DIFFICULTIES[difficulty].label} rival)
            </p>
            <button
              onClick={() => { gameRef.current.start(); setHud({ player: 0, ai: 0, winner: null }); }}
              className="w-full py-3 rounded-lg bg-cyan-500 text-black font-black uppercase tracking-widest text-lg hover:bg-cyan-400 transition-colors mb-2"
            >
              Play again
            </button>
            <button
              onClick={() => { setStarted(false); setHud({ player: 0, ai: 0, winner: null }); gameRef.current.reset(); }}
              className="w-full py-2 rounded-lg border border-zinc-700 text-zinc-300 uppercase tracking-widest text-sm hover:border-cyan-500/50"
            >
              Change rival
            </button>
          </div>
        </div>
      )}
      <div aria-hidden="true" className="h-[max(5rem,env(safe-area-inset-bottom))]" />
    </main>
  );
}
