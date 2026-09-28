// IQ Test — "Axiom Scramble" pocket universe.
// Port of highland88999-commits/IQ-Test. A 3D neon edge-matching puzzle:
// tiles are scrambled across the board with random rotations. Tap a tile to
// rotate it, drag a tile onto another slot to swap. Restore every edge to win.
"use client";

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
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

export default function IqTestPage() {
  const router = useRouter();
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
    <div className="relative w-screen h-[100dvh] overflow-hidden bg-[#05010a] text-white select-none">
      {screen !== 'select' && (
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />
      )}

      {/* Title */}
      <div className="absolute top-4 left-4 z-10 pointer-events-none">
        <h1 className="text-xl font-black tracking-[0.2em] text-cyan-300 uppercase">
          IQ Test
        </h1>
        <p className="text-xs text-fuchsia-300/80 tracking-wider mt-1">
          Axiom Scramble — unscramble the neon tiles
        </p>
      </div>

      {/* Back */}
      <button
        aria-label="Back to launcher"
        onClick={() => router.push('/')}
        className={`${BTN} absolute top-4 right-4 z-10 bg-white/10 border border-cyan-400/40 text-cyan-200 hover:bg-cyan-400/20`}
      >
        ← Back
      </button>

      {screen === 'playing' && (
        <>
          {/* HUD */}
          <div className="absolute top-20 left-4 z-10 pointer-events-none">
            <div className="flex gap-4 text-sm font-mono">
              <span className="text-cyan-300">Moves: {moves}</span>
              <span className="text-cyan-300">Time: {formatTime(seconds)}</span>
            </div>
          </div>
          <button
            aria-label="Restart puzzle"
            onClick={() => startGame(difficulty)}
            className={`${BTN} absolute top-20 right-4 z-10 bg-white/10 border border-fuchsia-400/40 text-fuchsia-200 hover:bg-fuchsia-400/20`}
          >
            Restart
          </button>
          {/* Instructions */}
          <div className="absolute bottom-5 inset-x-0 z-10 text-center pointer-events-none px-4">
            <p className="text-sm text-white/70 tracking-wide">
              Tap a tile to rotate it · Drag a tile onto another tile to swap
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
          <div className="w-full max-w-sm rounded-2xl border border-cyan-400/30 bg-[#0a0618]/95 p-6 shadow-[0_0_40px_rgba(0,255,255,0.15)]">
            <h2 className="text-2xl font-black tracking-[0.15em] text-cyan-300 uppercase text-center">
              IQ Test
            </h2>
            <p className="text-sm text-white/70 text-center mt-2">
              The tiles are scrambled. Put every glowing edge back where it
              belongs. Tap rotates, drag swaps.
            </p>
            <div className="flex flex-col gap-3 mt-6">
              {Object.entries(DIFFICULTIES).map(([key, d]) => (
                <button
                  key={key}
                  onClick={() => startGame(key)}
                  className="min-h-[56px] px-5 rounded-xl font-bold tracking-wide border border-fuchsia-400/40 bg-fuchsia-500/10 text-fuchsia-100 hover:bg-fuchsia-500/25 transition-colors"
                >
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
          <div className="w-full max-w-sm rounded-2xl border border-emerald-400/40 bg-[#06180e]/95 p-6 text-center shadow-[0_0_40px_rgba(0,255,128,0.2)]">
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
                className={`${BTN} border border-emerald-400/50 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/30`}
              >
                Play again
              </button>
              <button
                onClick={() => setScreen('select')}
                className={`${BTN} border border-cyan-400/40 bg-white/5 text-cyan-100 hover:bg-cyan-400/20`}
              >
                Change difficulty
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
