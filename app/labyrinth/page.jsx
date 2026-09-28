'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  STAGES,
  createStage,
  tryMove,
  tokensRemaining,
  elapsedSeconds,
  formatTime,
} from './maze';
import { createLabyrinthScene } from './scene';

const DIRS = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

export default function LabyrinthPage() {
  const mountRef = useRef(null);
  const gameRef = useRef(null);
  const sceneRef = useRef(null);
  const reducedMotionRef = useRef(false);

  const [stageIndex, setStageIndex] = useState(0);
  const [buildId, setBuildId] = useState(0);
  const [phase, setPhase] = useState('intro'); // intro | playing | stageDone | victory
  const [moves, setMoves] = useState(0);
  const [tokensLeft, setTokensLeft] = useState(STAGES[0].tokens);
  const [seconds, setSeconds] = useState(0);
  const [exitOpen, setExitOpen] = useState(false);

  // Build a fresh stage (logic only).
  const buildGame = useCallback((idx) => {
    gameRef.current = createStage(idx);
    setMoves(0);
    setTokensLeft(STAGES[idx].tokens);
    setSeconds(0);
    setExitOpen(false);
    setBuildId((b) => b + 1);
  }, []);

  useEffect(() => {
    buildGame(0);
    reducedMotionRef.current =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // (Re)create the 3D scene whenever a new game is built.
  useEffect(() => {
    if (!mountRef.current || !gameRef.current) return;
    const scene = createLabyrinthScene(mountRef.current, gameRef.current, {
      reducedMotion: reducedMotionRef.current,
    });
    sceneRef.current = scene;
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, [buildId]);

  const refreshHud = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    setMoves(g.moves);
    setTokensLeft(tokensRemaining(g));
    setExitOpen(g.exit.open);
    setSeconds(elapsedSeconds(g));
    if (g.won) {
      setSeconds(elapsedSeconds(g));
      if (stageIndex >= STAGES.length - 1) setPhase('victory');
      else setPhase('stageDone');
    }
  }, [stageIndex]);

  const doMove = useCallback(
    (dx, dy) => {
      const g = gameRef.current;
      if (!g || g.won || phase !== 'playing') return;
      if (tryMove(g, dx, dy)) {
        sceneRef.current?.sync();
        refreshHud();
      }
    },
    [phase, refreshHud]
  );

  // Timer tick while playing.
  useEffect(() => {
    if (phase !== 'playing') return;
    const id = setInterval(() => {
      const g = gameRef.current;
      if (g && !g.won) setSeconds(elapsedSeconds(g));
    }, 500);
    return () => clearInterval(id);
  }, [phase]);

  // Keyboard controls.
  useEffect(() => {
    const onKey = (e) => {
      const map = {
        ArrowUp: 'up', KeyW: 'up',
        ArrowDown: 'down', KeyS: 'down',
        ArrowLeft: 'left', KeyA: 'left',
        ArrowRight: 'right', KeyD: 'right',
      };
      const dir = map[e.code];
      if (dir) {
        e.preventDefault();
        const [dx, dy] = DIRS[dir];
        doMove(dx, dy);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doMove]);

  // Swipe controls on the canvas container.
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    let sx = 0;
    let sy = 0;
    const onDown = (e) => {
      sx = e.clientX;
      sy = e.clientY;
    };
    const onUp = (e) => {
      const dx = e.clientX - sx;
      const dy = e.clientY - sy;
      if (Math.hypot(dx, dy) < 24) return;
      if (Math.abs(dx) > Math.abs(dy)) doMove(dx > 0 ? 1 : -1, 0);
      else doMove(0, dy > 0 ? 1 : -1);
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
    };
  }, [doMove]);

  const startStage = (idx) => {
    buildGame(idx);
    setStageIndex(idx);
    setPhase('playing');
  };

  const stage = STAGES[stageIndex];

  const dpadBtn =
    'w-14 h-14 rounded-full bg-violet-950/80 border border-violet-500/60 text-violet-200 text-xl font-bold active:bg-violet-700/70 select-none touch-none flex items-center justify-center';

  return (
    <div className="fixed inset-0 bg-black text-white overflow-hidden">
      <div ref={mountRef} className="absolute inset-0" style={{ touchAction: 'none' }} />

      {/* HUD */}
      {phase === 'playing' && (
        <div className="absolute top-0 left-0 right-0 z-10 pointer-events-none">
          <div className="flex items-center justify-between px-4 pt-4">
            <div>
              <div className="text-xs tracking-widest text-violet-300 uppercase">{stage.name}</div>
              <div className="text-[11px] text-zinc-400 mt-0.5">The eye is watching</div>
            </div>
            <div className="text-right text-sm">
              <div className="text-zinc-300">Moves <span className="text-white font-bold">{moves}</span></div>
              <div className="text-zinc-300">Time <span className="text-white font-bold">{formatTime(seconds)}</span></div>
            </div>
          </div>
          <div className="mt-2 mx-4">
            <div className="text-xs text-zinc-300">
              {exitOpen ? (
                <span className="text-green-400 font-bold">The way out is open — reach the green portal</span>
              ) : (
                <>Collect the purple tokens: <span className="text-violet-300 font-bold">{tokensLeft} left</span></>
              )}
            </div>
          </div>
        </div>
      )}

      {/* D-pad */}
      {phase === 'playing' && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10">
          <div className="grid grid-cols-3 gap-2">
            <div />
            <button aria-label="Move up" className={dpadBtn} onPointerDown={() => doMove(0, -1)}>▲</button>
            <div />
            <button aria-label="Move left" className={dpadBtn} onPointerDown={() => doMove(-1, 0)}>◀</button>
            <button aria-label="Move down" className={dpadBtn} onPointerDown={() => doMove(0, 1)}>▼</button>
            <button aria-label="Move right" className={dpadBtn} onPointerDown={() => doMove(1, 0)}>▶</button>
          </div>
          <div className="text-center text-[11px] text-zinc-500 mt-2">Tap the pad, swipe, or use arrow keys</div>
        </div>
      )}

      {/* Intro overlay */}
      {phase === 'intro' && (
        <Overlay>
          <h1 className="text-3xl font-black tracking-widest text-violet-200">LABYRINTH</h1>
          <p className="text-sm text-zinc-300 mt-3 max-w-xs">
            A dark maze, a watching eye. Collect the {stage.tokens} purple tokens,
            then escape through the green portal.
          </p>
          <p className="text-xs text-zinc-500 mt-2">Three stages. The maze grows darker as you go.</p>
          <BigButton onClick={() => startStage(0)}>Enter the maze</BigButton>
        </Overlay>
      )}

      {/* Stage complete */}
      {phase === 'stageDone' && (
        <Overlay>
          <h2 className="text-2xl font-black tracking-widest text-green-300">STAGE CLEAR</h2>
          <p className="text-sm text-zinc-300 mt-3">
            {stage.name} escaped in {moves} moves, {formatTime(seconds)}.
          </p>
          <BigButton onClick={() => startStage(stageIndex + 1)}>
            Enter {STAGES[stageIndex + 1].name}
          </BigButton>
        </Overlay>
      )}

      {/* Victory */}
      {phase === 'victory' && (
        <Overlay>
          <h2 className="text-2xl font-black tracking-widest text-violet-200">THE EYE BLINKS</h2>
          <p className="text-sm text-zinc-300 mt-3 max-w-xs">
            All three stages escaped in {moves} moves, {formatTime(seconds)} on the final stage.
            The labyrinth lets you go — for now.
          </p>
          <BigButton onClick={() => startStage(0)}>Walk it again</BigButton>
        </Overlay>
      )}
    </div>
  );
}

function Overlay({ children }) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/80 px-6">
      <div className="text-center border border-violet-500/40 rounded-2xl bg-black/70 px-8 py-8 max-w-sm">
        {children}
      </div>
    </div>
  );
}

function BigButton({ children, onClick }) {
  return (
    <button
      onClick={onClick}
      className="mt-6 min-h-[48px] px-8 rounded-full bg-violet-700 hover:bg-violet-600 text-white font-bold tracking-widest uppercase text-sm transition-colors"
    >
      {children}
    </button>
  );
}
