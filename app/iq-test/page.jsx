// Axiom Scramble pocket universe.
// Port of highland88999-commits/IQ-Test. A 3D neon edge-matching puzzle:
// tiles are scrambled across the board with random rotations. Tap a tile to
// rotate it, drag a tile onto another slot to swap. Restore every edge to win.
"use client";

import { useEffect, useRef, useState } from 'react';
import { BackButton } from '@/components/ui';
import { fx, unlockFx } from '@/lib/fx';
import {
  createGame,
  rotateTile,
  swapTiles,
  slotOfTile,
  isSolved,
  computeScore,
  formatTime,
  DIFFICULTIES,
} from './puzzle.js';
import { createIqScene } from './scene.js';

const BTN =
  'min-h-[44px] px-5 py-2 rounded-lg font-bold tracking-wide transition-colors';

/* ATHENA interior treatment: inline SVG glyph set (zero image weight).
   Geometry only — no logos, no faces, no text inside the glyphs. */
function IQGlyph({ size = 14, children }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round"
      strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}>
      {children}
    </svg>
  );
}
const GlyphTile = ({ size = 14 }) => (
  <IQGlyph size={size}>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <path d="M4 12 H20 M12 4 V20" />
  </IQGlyph>
);
const GlyphRestart = ({ size = 14 }) => (
  <IQGlyph size={size}>
    <path d="M20 11 A8 8 0 1 0 18 16" />
    <path d="M20 5 V11 H14" />
  </IQGlyph>
);
const GlyphSwap = ({ size = 12 }) => (
  <IQGlyph size={size}>
    <path d="M7 4 L3 8 L7 12 M3 8 H16 M17 12 L21 16 L17 20 M21 16 H8" />
  </IQGlyph>
);
const GlyphTimer = ({ size = 12 }) => (
  <IQGlyph size={size}>
    <circle cx="12" cy="13" r="8" />
    <path d="M12 9 V13 L15 15 M9 2 H15" />
  </IQGlyph>
);
const GlyphRotate = ({ size = 14 }) => (
  <IQGlyph size={size}>
    <path d="M21 12 A9 9 0 1 1 15 5" />
    <path d="M21 3 V9 H15" />
  </IQGlyph>
);
const GlyphTrophy = ({ size = 40 }) => (
  <IQGlyph size={size}>
    <path d="M8 4 H16 V9 A4 4 0 0 1 8 9 Z" />
    <path d="M8 5 H4 A3 3 0 0 0 8 11 M16 5 H20 A3 3 0 0 1 16 11" />
    <path d="M12 13 V17 M8 21 H16 M10 17 H14" />
  </IQGlyph>
);

export default function IqTestPage() {
  const canvasRef = useRef(null);
  const gameRef = useRef(null);
  const sceneRef = useRef(null);
  const startTimeRef = useRef(null);

  const [screen, setScreen] = useState('select'); // select | playing | won
  const [session, setSession] = useState(0);
  const [difficulty, setDifficulty] = useState('medium');
  const [moves, setMoves] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [started, setStarted] = useState(false);
  const [score, setScore] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    // unlock FX on first gesture (deep links may land here without the hub)
    const unlock = () => unlockFx();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  function startGame(diffKey) {
    const game = createGame(DIFFICULTIES[diffKey].n);
    gameRef.current = game;
    startTimeRef.current = null;
    setDifficulty(diffKey);
    setMoves(0);
    setSeconds(0);
    setStarted(false);
    setScore(0);
    setScreen('playing');
    setSession((s) => s + 1);
  }

  function markStarted() {
    if (!startTimeRef.current) {
      startTimeRef.current = Date.now();
      setStarted(true);
    }
  }

  function afterMove() {
    const game = gameRef.current;
    setMoves(game.moves);
    if (isSolved(game)) {
      const elapsed = startTimeRef.current
        ? Math.floor((Date.now() - startTimeRef.current) / 1000)
        : 0;
      setSeconds(elapsed);
      setScore(computeScore(difficulty, game.moves, elapsed));
      setScreen('won');
      sceneRef.current?.celebrate();
      fx.gameWin(); // puzzle solved: full fanfare
    }
  }

  // Scene lifecycle: created per session, survives into the win screen.
  useEffect(() => {
    if (screen === 'select' || session === 0) return;
    const game = gameRef.current;
    if (!game || !canvasRef.current) return;
    const scene = createIqScene(canvasRef.current, {
      n: game.n,
      tiles: game.tiles,
      reducedMotion,
    });
    sceneRef.current = scene;
    scene.layout(game.placement, game.rotations, true);

    scene.onTap((tileId) => {
      markStarted();
      rotateTile(game, tileId);
      scene.tapRotate(tileId);
      fx.tap(); // tile rotated: tiny tick
      afterMove();
    });

    scene.onDrop((tileId, slotIndex) => {
      const from = slotOfTile(game, tileId);
      if (from === slotIndex) {
        scene.snapBack(tileId);
        return;
      }
      markStarted();
      const otherId = game.placement[slotIndex];
      swapTiles(game, from, slotIndex);
      scene.moveTileToSlot(tileId, slotIndex);
      scene.moveTileToSlot(otherId, from);
      fx.tap(); // tiles swapped: tiny tick
      afterMove();
    });

    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // Timer display.
  useEffect(() => {
    if (screen !== 'playing' || !started) return;
    const id = setInterval(() => {
      if (startTimeRef.current) {
        setSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }
    }, 500);
    return () => clearInterval(id);
  }, [screen, started]);

  return (
    <div className="iqt-root relative w-screen h-[100dvh] overflow-hidden bg-[#05010a] text-white select-none">
      <style>{`
        /* ATHENA interior treatment — hero backdrop behind the 3D canvas
           (canvas keeps its own stacking; gradient scrim keeps content readable). */
        .iqt-bg-layer { position: fixed; inset: 0; z-index: 0; pointer-events: none;
          opacity: 0.6;
          background:
            linear-gradient(rgba(5,1,10,0.5), rgba(5,1,10,0.68)),
            url('/images/iq-test/iq-test-bg.webp') center / cover no-repeat,
            #05010a; }
        /* Panel tile: webp texture under the select / win cards. */
        .iqt-panel {
          background:
            linear-gradient(rgba(10,6,24,0.86), rgba(10,6,24,0.94)),
            url('/images/iq-test/iq-test-bg.webp') center / cover no-repeat,
            #0a0618;
        }
        .iqt-panel-win {
          background:
            linear-gradient(rgba(6,24,14,0.86), rgba(6,24,14,0.94)),
            url('/images/iq-test/iq-test-bg.webp') center / cover no-repeat,
            #06180e;
        }
        .iqt-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
        .iqt-hud span, .iqt-line { display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
      `}</style>
      <div aria-hidden="true" className="iqt-bg-layer" />

      {screen !== 'select' && (
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />
      )}

      {/* Title */}
      <div className="absolute top-4 left-4 z-10 pointer-events-none">
        <h1 className="text-xl font-black tracking-[0.2em] text-cyan-300 uppercase">
          Axiom Scramble
        </h1>
        <p className="text-xs text-fuchsia-300/80 tracking-wider mt-1">
          Unscramble the neon tiles — a puzzle score, not an IQ measure
        </p>
      </div>

      {/* Back */}
      <BackButton label="Back" />

      {screen === 'playing' && (
        <>
          {/* HUD */}
          <div className="absolute top-20 left-4 z-10 pointer-events-none">
            <div className="iqt-hud flex gap-4 text-sm font-mono">
              <span className="text-cyan-300"><GlyphSwap /> Moves: {moves}</span>
              <span className="text-cyan-300"><GlyphTimer /> Time: {formatTime(seconds)}</span>
            </div>
          </div>
          <button
            aria-label="Restart puzzle"
            onClick={() => startGame(difficulty)}
            className={`${BTN} iqt-btn absolute top-20 right-4 z-10 bg-white/10 border border-fuchsia-400/40 text-fuchsia-200 hover:bg-fuchsia-400/20`}
          >
            <GlyphRestart /> Restart
          </button>
          {/* Instructions */}
          <div className="absolute bottom-5 inset-x-0 z-10 text-center pointer-events-none px-4">
            <p className="text-sm text-white/70 tracking-wide">
              <span className="iqt-line"><GlyphRotate /> Tap a tile to rotate it · Drag a tile onto another tile to swap</span>
            </p>
            <p className="text-xs text-white/40 tracking-wide mt-1">
              Match every glowing edge to its neighbor to solve
            </p>
          </div>
        </>
      )}

      {/* Difficulty select */}
      {screen === 'select' && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-6 bg-black/60">
          <div className="iqt-panel w-full max-w-sm rounded-2xl border border-cyan-400/30 bg-[#0a0618]/95 p-6 shadow-[0_0_40px_rgba(0,242,255,0.15)]">
            <h2 className="text-2xl font-black tracking-[0.15em] text-cyan-300 uppercase text-center">
              Axiom Scramble
            </h2>
            <p className="text-sm text-white/70 text-center mt-2">
              The tiles are scrambled. Put every glowing edge back where it
              belongs. Tap rotates, drag swaps.
            </p>
            <p className="text-xs text-white/40 text-center mt-2">
              A puzzle score — not an IQ measure.
            </p>
            <div className="flex flex-col gap-3 mt-6">
              {Object.entries(DIFFICULTIES).map(([key, d]) => (
                <button
                  key={key}
                  onClick={() => startGame(key)}
                  className="iqt-btn min-h-[56px] px-5 rounded-xl font-bold tracking-wide border border-fuchsia-400/40 bg-fuchsia-500/10 text-fuchsia-100 hover:bg-fuchsia-500/25 transition-colors"
                >
                  <GlyphTile size={16} />
                  {d.label}
                  <span className="block text-xs font-normal text-white/50">
                    {d.n * d.n} tiles
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Win screen */}
      {screen === 'won' && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-6 bg-black/60">
          <div className="iqt-panel-win w-full max-w-sm rounded-2xl border border-emerald-400/40 bg-[#06180e]/95 p-6 text-center shadow-[0_0_40px_rgba(0,255,128,0.2)]">
            <div className="flex justify-center text-emerald-300 mb-2">
              <GlyphTrophy />
            </div>
            <h2 className="text-2xl font-black tracking-[0.15em] text-emerald-300 uppercase">
              Puzzle solved
            </h2>
            <p className="text-5xl font-black text-white mt-4">{score}</p>
            <p className="text-sm text-white/60 mt-1">points</p>
            <div className="flex justify-center gap-6 mt-4 text-sm font-mono text-cyan-200">
              <span>Moves: {moves}</span>
              <span>Time: {formatTime(seconds)}</span>
            </div>
            <div className="flex flex-col gap-3 mt-6">
              <button
                onClick={() => startGame(difficulty)}
                className={`${BTN} iqt-btn border border-emerald-400/50 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/30`}
              >
                <GlyphRestart /> Play again
              </button>
              <button
                onClick={() => setScreen('select')}
                className={`${BTN} iqt-btn border border-cyan-400/40 bg-white/5 text-cyan-100 hover:bg-cyan-400/20`}
              >
                <GlyphTile /> Change difficulty
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Safari bottom-bar clearance */}
      <div aria-hidden="true" className="player-clear" />
    </div>
  );
}
