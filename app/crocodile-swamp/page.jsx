// app/crocodile-swamp/page.jsx
// CROCODILE SWAMP — a Florida survival chase in the ZEUS games
// constellation. Canoe the swamp. When the crocodile spots you, run: it
// will bump you off your boat, and after a 10-second swim it hunts you on
// water and land until it eats you. Survive long, travel far, top the
// global board. Synthesized sound + haptics, honest offline leaderboard.
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { BackButton } from '@/components/ui';
import {
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Trophy,
  Volume2,
  VolumeX,
  RotateCcw,
  Waves,
  Timer,
  Route,
  TriangleAlert,
} from 'lucide-react';
import { createGame, stepGame, drainEvents, setInput, SWIM_WINDOW } from './engine';
import { createSound } from '@/lib/crocodile-swamp/sound';
import { buzz } from '@/lib/crocodile-swamp/haptics';
import { fetchLeaderboard, submitScore, getSavedName, saveName } from '@/lib/crocodile-swamp/leaderboard';

const SwampCanvas = dynamic(() => import('@/components/crocodile-swamp/SwampCanvas'), {
  ssr: false,
  loading: () => (
    <div className="cs-loading">Wading into the swamp…</div>
  ),
});

const STEP = 1 / 120;
const KEY_DIRS = {
  ArrowUp: [0, -1], KeyW: [0, -1],
  ArrowDown: [0, 1], KeyS: [0, 1],
  ArrowLeft: [-1, 0], KeyA: [-1, 0],
  ArrowRight: [1, 0], KeyD: [1, 0],
};

const PHASE_COPY = {
  paddling: { label: 'PADDLING', cls: 'cs-phase-calm' },
  swim: { label: 'SWIM!', cls: 'cs-phase-swim' },
  hunted: { label: 'HUNTED', cls: 'cs-phase-hunt' },
};

function fmtTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function CrocodileSwampPage() {
  const stateRef = useRef(null);
  const soundRef = useRef(null);
  const rafRef = useRef(0);
  const lastRef = useRef(0);
  const accRef = useRef(0);
  const pausedRef = useRef(false);
  const keysRef = useRef(new Set());
  const holdRef = useRef([0, 0]);
  const paddleTickRef = useRef(0);

  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [hud, setHud] = useState({ score: 0, time: 0, distance: 0, phase: 'paddling', swim: 0, status: 'ready', crocMode: 'lurk' });
  const [boardOpen, setBoardOpen] = useState(false);
  const [board, setBoard] = useState(null);
  const [boardLoading, setBoardLoading] = useState(false);
  const [name, setName] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitNote, setSubmitNote] = useState('');

  if (!stateRef.current) stateRef.current = createGame();
  if (!soundRef.current) soundRef.current = createSound();

  const syncHud = useCallback(() => {
    const s = stateRef.current;
    setHud({
      score: s.score,
      time: s.time,
      distance: s.distance,
      phase: s.phase,
      swim: s.swimTimer,
      status: s.status,
      crocMode: s.croc.mode,
    });
  }, []);

  const handleEvents = useCallback((events) => {
    const snd = soundRef.current;
    for (const e of events) {
      switch (e.type) {
        case 'start': snd.start(); break;
        case 'spotted': snd.spotted(); buzz('spotted'); break;
        case 'bump': snd.bump(); buzz('bump'); break;
        case 'landfall': snd.landfall(); buzz('landfall'); break;
        case 'hunt': snd.hunt(); buzz('hunt'); break;
        case 'caught': snd.caught(); buzz('caught'); break;
        default: break;
      }
    }
  }, []);

  const applyInput = useCallback(() => {
    let x = holdRef.current[0];
    let z = holdRef.current[1];
    for (const code of keysRef.current) {
      const d = KEY_DIRS[code];
      if (d) { x += d[0]; z += d[1]; }
    }
    setInput(stateRef.current, x, z);
  }, []);

  useEffect(() => {
    if (!started) return undefined;
    let hudTick = 0;
    const loop = (now) => {
      rafRef.current = requestAnimationFrame(loop);
      if (!lastRef.current) lastRef.current = now;
      let dt = (now - lastRef.current) / 1000;
      lastRef.current = now;
      if (dt > 0.25) dt = 0.25;
      if (pausedRef.current) return;
      applyInput();
      accRef.current += dt;
      const s = stateRef.current;
      let guard = 0;
      while (accRef.current >= STEP && guard++ < 40) {
        stepGame(s, STEP);
        accRef.current -= STEP;
      }
      const events = drainEvents(s);
      if (events.length) handleEvents(events);
      // Gentle paddle splashes while moving in the canoe.
      if (s.status === 'playing' && s.phase === 'paddling' && (s.input.x || s.input.z)) {
        if (++paddleTickRef.current % 55 === 0) soundRef.current.paddle();
      }
      if (++hudTick % 6 === 0) syncHud();
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafRef.current);
      lastRef.current = 0;
      accRef.current = 0;
    };
  }, [started, handleEvents, syncHud, applyInput]);

  useEffect(() => {
    const down = (e) => {
      if (KEY_DIRS[e.code]) {
        e.preventDefault();
        soundRef.current.unlock();
        keysRef.current.add(e.code);
      }
      if (e.code === 'Space') {
        e.preventDefault();
        setPaused((p) => { pausedRef.current = !p; return !p; });
      }
    };
    const up = (e) => keysRef.current.delete(e.code);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useEffect(() => {
    const onVis = () => {
      if (document.hidden) {
        pausedRef.current = true;
        setPaused(true);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  useEffect(() => {
    setName(getSavedName());
  }, []);

  const startRun = useCallback(() => {
    soundRef.current.unlock();
    stateRef.current = createGame();
    keysRef.current.clear();
    holdRef.current = [0, 0];
    setSubmitted(false);
    setSubmitNote('');
    pausedRef.current = false;
    setPaused(false);
    setStarted(true);
    syncHud();
  }, [syncHud]);

  const togglePause = useCallback(() => {
    setPaused((p) => { pausedRef.current = !p; return !p; });
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((m) => { soundRef.current.setMuted(!m); return !m; });
  }, []);

  const openBoard = useCallback(async () => {
    setBoardOpen(true);
    setBoardLoading(true);
    const result = await fetchLeaderboard(10);
    setBoard(result);
    setBoardLoading(false);
  }, []);

  const onSubmitScore = useCallback(async () => {
    const s = stateRef.current;
    const displayName = (name || 'Paddler').trim() || 'Paddler';
    saveName(displayName);
    const result = await submitScore({
      username: displayName,
      score: s.score,
      seconds: Math.floor(s.time),
      distance: Math.floor(s.distance),
    });
    setSubmitted(true);
    setSubmitNote(
      result.source === 'global'
        ? 'Posted to the global board.'
        : 'Global board is offline — saved on this device and queued to sync.'
    );
    const fresh = await fetchLeaderboard(10);
    setBoard(fresh);
  }, [name]);

  const hold = (x, z) => ({
    onTouchStart: (e) => { e.preventDefault(); soundRef.current.unlock(); holdRef.current = [x, z]; },
    onTouchEnd: () => { holdRef.current = [0, 0]; },
    onMouseDown: () => { holdRef.current = [x, z]; },
    onMouseUp: () => { holdRef.current = [0, 0]; },
    onMouseLeave: () => { holdRef.current = [0, 0]; },
  });

  const gameOver = hud.status === 'gameover';
  const phase = PHASE_COPY[hud.phase] || PHASE_COPY.paddling;

  return (
    <main className="cs-shell">
      <style>{CS_CSS}</style>
      <div className="cs-wrap">
        <div className="cs-topbar">
          <BackButton />
          <h1 className="cs-title">CROCODILE&nbsp;SWAMP</h1>
          <div className="cs-actions">
            <button type="button" onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'} className="cs-icon-btn">
              {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <button type="button" onClick={togglePause} aria-label={paused ? 'Resume' : 'Pause'} className="cs-icon-btn">
              {paused ? <Play size={16} /> : <Pause size={16} />}
            </button>
            <button type="button" onClick={openBoard} aria-label="Leaderboard" className="cs-icon-btn cs-icon-btn-gold">
              <Trophy size={16} />
            </button>
          </div>
        </div>

        {/* HUD */}
        <div className="cs-hud">
          <span className="cs-stat"><Timer size={14} /> {fmtTime(hud.time)}</span>
          <span className="cs-stat"><Route size={14} /> {Math.floor(hud.distance)}m</span>
          <span className="cs-stat cs-stat-score">Score {hud.score.toLocaleString()}</span>
          <span className={`cs-phase ${phase.cls}`}>{phase.label}</span>
        </div>
        {hud.phase === 'swim' && (
          <div className="cs-swimbar" role="progressbar" aria-valuenow={Math.ceil(hud.swim)} aria-valuemin={0} aria-valuemax={SWIM_WINDOW}>
            <div className="cs-swimbar-fill" style={{ width: `${Math.max(0, (hud.swim / SWIM_WINDOW) * 100)}%` }} />
            <span className="cs-swimbar-label"><TriangleAlert size={13} /> SWIM — {Math.ceil(hud.swim)}s before it hunts</span>
          </div>
        )}
        {hud.phase === 'paddling' && hud.crocMode === 'charge' && (
          <p className="cs-warning"><TriangleAlert size={13} /> IT SEES YOU — PADDLE!</p>
        )}

        {/* Play field */}
        <div className="cs-field">
          <SwampCanvas stateRef={stateRef} />

          {!started && (
            <div className="cs-overlay">
              <p className="cs-kicker">FLORIDA RULES</p>
              <h2 className="cs-overlay-title">DON'T FEED THE WILDLIFE</h2>
              <p className="cs-story">
                Canoe the swamp and enjoy the quiet — until the <b className="cs-gold">crocodile</b> spots you.
                It will charge and <b>bump you clean off your boat</b>. Then you get{' '}
                <b className="cs-cyan">10 seconds to swim away</b> before it hunts you on water{' '}
                <i>and</i> land, until it eats you. Survive long. Travel far.
              </p>
              <button type="button" onClick={startRun} className="cs-btn-primary">
                LAUNCH THE CANOE
              </button>
              <p className="cs-hint">Hold the arrows, WASD, or swipe your thumb. Big buttons work too.</p>
            </div>
          )}

          {started && paused && !gameOver && (
            <div className="cs-overlay cs-overlay-thin">
              <p className="cs-overlay-title-sm">PAUSED</p>
              <p className="cs-hint">The crocodile waits. It is good at that.</p>
              <button type="button" onClick={togglePause} className="cs-btn-primary cs-btn-sm">
                Keep paddling
              </button>
            </div>
          )}

          {started && hud.status === 'ready' && !paused && (
            <div className="cs-ready-banner">GET READY — MIND THE WATER</div>
          )}

          {gameOver && (
            <div className="cs-overlay">
              <p className="cs-kicker cs-kicker-red">THE SWAMP WINS</p>
              <h2 className="cs-overlay-title">EATEN.</h2>
              <p className="cs-final-line">
                Survived <b>{fmtTime(hud.time)}</b> · Travelled <b>{Math.floor(hud.distance)}m</b> · Score{' '}
                <b className="cs-gold">{hud.score.toLocaleString()}</b>
              </p>
              {!submitted ? (
                <div className="cs-submit">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value.slice(0, 24))}
                    placeholder="Your name for the board"
                    className="cs-input"
                  />
                  <button type="button" onClick={onSubmitScore} className="cs-btn-gold">
                    Post my score
                  </button>
                </div>
              ) : (
                <p className="cs-note-ok">{submitNote}</p>
              )}
              <div className="cs-row">
                <button type="button" onClick={startRun} className="cs-btn-primary cs-btn-sm">
                  <RotateCcw size={14} /> Paddle again
                </button>
                <button type="button" onClick={openBoard} className="cs-btn-ghost cs-btn-sm">
                  Leaderboard
                </button>
              </div>
            </div>
          )}
        </div>

        {/* On-screen D-pad (big, friendly, thumb-sized, hold to move) */}
        <div className="cs-dpad">
          <span />
          <button type="button" aria-label="Paddle up" className="cs-dpad-btn" {...hold(0, -1)}><ChevronUp size={30} /></button>
          <span />
          <button type="button" aria-label="Paddle left" className="cs-dpad-btn" {...hold(-1, 0)}><ChevronLeft size={30} /></button>
          <button type="button" aria-label="Paddle down" className="cs-dpad-btn" {...hold(0, 1)}><ChevronDown size={30} /></button>
          <button type="button" aria-label="Paddle right" className="cs-dpad-btn" {...hold(1, 0)}><ChevronRight size={30} /></button>
        </div>

        <p className="cs-foot">
          <Waves size={13} className="cs-foot-icon" />
          The canoe is faster than the crocodile — in a straight line. It knows the shortcuts.
          The bank is safety, but only sort of: it hunts on land too.
        </p>
        <p className="cs-foot cs-foot-dim">
          More games in the <Link href="/" className="cs-link">hub</Link>.
        </p>
      </div>

      {/* Leaderboard modal */}
      {boardOpen && (
        <div className="cs-modal-backdrop" role="dialog" aria-label="Leaderboard" onClick={() => setBoardOpen(false)}>
          <div className="cs-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cs-modal-head">
              <h2 className="cs-modal-title"><Trophy size={16} /> SURVIVORS' BOARD</h2>
              <button type="button" onClick={() => setBoardOpen(false)} className="cs-btn-ghost cs-btn-xs">Close</button>
            </div>
            <p className="cs-modal-sub">
              {boardLoading
                ? 'Loading…'
                : board?.source === 'global'
                  ? 'Global board — longest survivors, greatest escapes.'
                  : 'Global board is offline right now. Showing this device’s board; scores queue and sync later.'}
            </p>
            {board && board.entries.length === 0 && !boardLoading && (
              <p className="cs-modal-empty">No runs yet. The swamp is undefeated.</p>
            )}
            <ol className="cs-board">
              {(board?.entries || []).map((e, i) => (
                <li key={`${e.username}-${i}`} className="cs-board-row">
                  <span className="cs-board-rank">{i + 1}.</span>
                  <span className="cs-board-name">{e.username}</span>
                  <span className="cs-board-meta">{fmtTime(e.seconds)} · {e.distance}m</span>
                  <span className="cs-board-score">{Number(e.score).toLocaleString()}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </main>
  );
}

const CS_CSS = `
.cs-shell{min-height:100vh;background:radial-gradient(1200px 600px at 50% -10%,#0a2e1a 0%,#04140a 55%,#020a05 100%);color:#e7f5e9;font-family:ui-sans-serif,system-ui,sans-serif}
.cs-wrap{margin:0 auto;display:flex;max-width:48rem;flex-direction:column;padding:1rem 1rem 2.5rem}
.cs-topbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem;gap:.5rem}
.cs-title{font-family:'Orbitron',ui-sans-serif,system-ui,sans-serif;font-size:1.05rem;font-weight:800;letter-spacing:.28em;color:#7dfcd3;text-shadow:0 0 18px rgba(45,255,190,.45);text-align:center}
.cs-actions{display:flex;align-items:center;gap:.5rem}
.cs-icon-btn{display:flex;align-items:center;justify-content:center;border-radius:9999px;border:1px solid rgba(125,252,211,.25);background:rgba(4,32,20,.6);padding:.5rem;color:#c9f5df;transition:all .15s}
.cs-icon-btn:hover{border-color:#2dffbe;color:#2dffbe;box-shadow:0 0 14px rgba(45,255,190,.35)}
.cs-icon-btn-gold:hover{border-color:#ffd23f;color:#ffd23f;box-shadow:0 0 14px rgba(255,210,63,.35)}
.cs-hud{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.5rem;border-radius:1rem;border:1px solid rgba(125,252,211,.16);background:rgba(2,20,12,.82);padding:.55rem 1rem;font-family:ui-monospace,monospace;font-size:.85rem;box-shadow:inset 0 0 24px rgba(45,255,190,.05)}
.cs-stat{display:inline-flex;align-items:center;gap:.35rem;color:#b7e8cd}
.cs-stat-score{color:#ffd23f;font-weight:700}
.cs-phase{font-family:'Orbitron',sans-serif;font-size:.68rem;font-weight:800;letter-spacing:.2em;padding:.3rem .7rem;border-radius:9999px;border:1px solid}
.cs-phase-calm{color:#7dfcd3;border-color:rgba(45,255,190,.4);background:rgba(45,255,190,.08)}
.cs-phase-swim{color:#7dd3fc;border-color:rgba(125,211,252,.5);background:rgba(125,211,252,.1);animation:cs-pulse 0.8s ease-in-out infinite alternate}
.cs-phase-hunt{color:#fda4af;border-color:rgba(253,164,175,.55);background:rgba(244,63,94,.12);animation:cs-pulse 0.5s ease-in-out infinite alternate}
@keyframes cs-pulse{from{transform:scale(1)}to{transform:scale(1.07)}}
.cs-swimbar{position:relative;margin-top:.5rem;height:1.6rem;border-radius:9999px;border:1px solid rgba(125,211,252,.45);background:rgba(2,16,28,.85);overflow:hidden}
.cs-swimbar-fill{height:100%;background:linear-gradient(90deg,#0369a1,#38bdf8);transition:width .2s linear;box-shadow:0 0 16px rgba(56,189,248,.55)}
.cs-swimbar-label{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:.35rem;font-size:.72rem;font-weight:700;letter-spacing:.08em;color:#e0f2fe}
.cs-warning{margin-top:.5rem;display:flex;align-items:center;justify-content:center;gap:.35rem;font-size:.78rem;font-weight:700;letter-spacing:.12em;color:#fda4af;animation:cs-pulse .45s ease-in-out infinite alternate}
.cs-field{position:relative;width:100%;aspect-ratio:4/3;overflow:hidden;border-radius:1.25rem;border:1px solid rgba(45,255,190,.22);background:#04140a;box-shadow:0 0 0 1px rgba(0,0,0,.6),0 0 42px rgba(45,255,190,.10),inset 0 0 60px rgba(0,0,0,.55);margin-top:.75rem}
@media (max-width:640px){.cs-field{aspect-ratio:1/1.08}}
.cs-loading{display:flex;height:100%;width:100%;align-items:center;justify-content:center;color:#7dfcd3;font-family:'Orbitron',sans-serif;letter-spacing:.2em;font-size:.8rem}
.cs-overlay{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.9rem;background:linear-gradient(180deg,rgba(2,12,7,.82),rgba(2,12,7,.68));backdrop-filter:blur(3px);padding:1.5rem;text-align:center}
.cs-overlay-thin{background:rgba(2,12,7,.6)}
.cs-kicker{font-family:'Orbitron',sans-serif;font-size:.65rem;font-weight:800;letter-spacing:.4em;color:#7dfcd3}
.cs-kicker-red{color:#fda4af}
.cs-overlay-title{font-family:'Orbitron',sans-serif;font-size:clamp(1.3rem,5vw,1.9rem);font-weight:900;letter-spacing:.14em;color:#f0fff6;text-shadow:0 0 24px rgba(45,255,190,.4)}
.cs-overlay-title-sm{font-family:'Orbitron',sans-serif;font-size:1.05rem;font-weight:800;letter-spacing:.3em;color:#7dfcd3}
.cs-story{max-width:26rem;font-size:.9rem;line-height:1.65;color:#cfe9d8}
.cs-gold{color:#ffd23f}.cs-cyan{color:#7dd3fc}
.cs-final-line{font-size:.95rem;color:#d9f2e2}
.cs-hint{font-size:.75rem;color:#7ba98d}
.cs-btn-primary{display:inline-flex;align-items:center;gap:.5rem;border-radius:9999px;background:linear-gradient(180deg,#4dffc4,#16c784);padding:.8rem 2rem;font-family:'Orbitron',sans-serif;font-size:.82rem;font-weight:900;letter-spacing:.16em;color:#02120a;box-shadow:0 0 28px rgba(45,255,190,.45),inset 0 1px 0 rgba(255,255,255,.5);transition:all .15s;border:1px solid rgba(125,252,211,.6)}
.cs-btn-primary:hover{filter:brightness(1.08)}
.cs-btn-primary:active{transform:scale(.96)}
.cs-btn-gold{display:inline-flex;align-items:center;gap:.5rem;border-radius:9999px;background:linear-gradient(180deg,#ffe27a,#f5b921);padding:.6rem 1.4rem;font-family:'Orbitron',sans-serif;font-size:.75rem;font-weight:900;letter-spacing:.12em;color:#221a02;box-shadow:0 0 22px rgba(255,210,63,.4);transition:all .15s;border:1px solid rgba(255,226,122,.7)}
.cs-btn-gold:active{transform:scale(.96)}
.cs-btn-ghost{display:inline-flex;align-items:center;gap:.5rem;border-radius:9999px;border:1px solid rgba(185,230,203,.35);background:rgba(4,26,16,.5);padding:.6rem 1.4rem;font-size:.82rem;font-weight:700;color:#d9f2e2;transition:all .15s}
.cs-btn-ghost:hover{border-color:#2dffbe;color:#2dffbe}
.cs-btn-sm{padding:.6rem 1.3rem;font-size:.75rem}
.cs-btn-xs{padding:.3rem .8rem;font-size:.7rem}
.cs-row{display:flex;gap:.6rem;flex-wrap:wrap;justify-content:center}
.cs-submit{display:flex;flex-direction:column;align-items:center;gap:.55rem}
.cs-input{width:16rem;max-width:100%;border-radius:.75rem;border:1px solid rgba(125,252,211,.3);background:rgba(0,0,0,.65);padding:.6rem .8rem;text-align:center;font-size:.9rem;color:#fff;outline:none}
.cs-input:focus{border-color:#2dffbe;box-shadow:0 0 14px rgba(45,255,190,.3)}
.cs-note-ok{font-size:.8rem;color:#6ee7a0}
.cs-ready-banner{pointer-events:none;position:absolute;top:1rem;left:0;right:0;text-align:center;font-family:'Orbitron',sans-serif;font-size:.8rem;font-weight:800;letter-spacing:.3em;color:#a7f3d0;text-shadow:0 0 16px rgba(45,255,190,.6)}
.cs-dpad{margin:1rem auto 0;display:grid;width:13rem;grid-template-columns:repeat(3,1fr);gap:.5rem}
@media (min-width:768px){.cs-dpad{opacity:.85}}
.cs-dpad-btn{display:flex;height:4rem;width:4rem;align-items:center;justify-content:center;border-radius:1.1rem;border:1px solid rgba(45,255,190,.35);background:rgba(45,255,190,.08);color:#a7f3d0;touch-action:none;user-select:none;-webkit-user-select:none;transition:all .1s}
.cs-dpad-btn:active{background:rgba(45,255,190,.3);transform:scale(.95)}
.cs-foot{margin-top:1rem;display:flex;align-items:flex-start;justify-content:center;gap:.4rem;text-align:center;font-size:.78rem;line-height:1.6;color:#8fb89e}
.cs-foot-icon{flex:none;margin-top:.15rem;color:#2dffbe}
.cs-foot-dim{color:#5f7d6a;margin-top:.35rem}
.cs-link{color:#2dffbe;text-decoration:underline}
.cs-modal-backdrop{position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.82);padding:1rem}
.cs-modal{width:100%;max-width:28rem;border-radius:1.25rem;border:1px solid rgba(255,210,63,.3);background:linear-gradient(180deg,#071a10,#04140a);padding:1.25rem;box-shadow:0 0 44px rgba(255,210,63,.14)}
.cs-modal-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:.3rem}
.cs-modal-title{display:flex;align-items:center;gap:.5rem;font-family:'Orbitron',sans-serif;font-size:.85rem;font-weight:800;letter-spacing:.22em;color:#ffd23f}
.cs-modal-sub{font-size:.75rem;color:#8fb89e;margin-bottom:.8rem}
.cs-modal-empty{padding:1rem 0;text-align:center;font-size:.88rem;color:#b7e8cd}
.cs-board{display:flex;flex-direction:column;gap:.35rem;list-style:none}
.cs-board-row{display:flex;align-items:center;gap:.5rem;border-radius:.7rem;background:rgba(45,255,190,.05);border:1px solid rgba(125,252,211,.08);padding:.5rem .8rem;font-family:ui-monospace,monospace;font-size:.85rem}
.cs-board-rank{color:#7ba98d;width:1.6rem}
.cs-board-name{flex:1;color:#f0fff6;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cs-board-meta{color:#8fb89e;font-size:.75rem}
.cs-board-score{font-weight:800;color:#2dffbe}
`;
