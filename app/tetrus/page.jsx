// app/tetrus/page.jsx
// TETRUS — an original 3D block-stacking game for the Olympus games
// constellation. Stack tetracubes in a true 3D pit above Tartarus,
// rotate them on every axis, seal full floors to free the golden lights
// of Kronos's swallowed children, and build his prison across 100
// depths — before the stones overflow and he breaks free.
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
  RotateCw,
  Sparkles,
  Layers,
  Hammer,
  ChevronsDown,
  Skull,
  Crown,
} from 'lucide-react';
import {
  createGame,
  stepGame,
  drainEvents,
  movePiece,
  rotatePiece,
  setSoftDrop,
  hardDrop,
  PIECES,
} from './engine';
import { storyForLevel, ACTS } from '@/lib/tetrus/levels';
import { createSound } from '@/lib/tetrus/sound';
import { buzz } from '@/lib/tetrus/haptics';
import { fetchLeaderboard, submitScore, getSavedName, saveName } from '@/lib/tetrus/leaderboard';

const TetrusCanvas = dynamic(() => import('@/components/tetrus/TetrusCanvas'), {
  ssr: false,
  loading: () => (
    <div className="tetrus-loading">Opening the pit of Tartarus…</div>
  ),
});

const STEP = 1 / 120;

function NextPiece({ id, small }) {
  const def = PIECES[id];
  if (!def) return null;
  const cells = def.cells;
  const xs = cells.map((c) => c[0]);
  const zs = cells.map((c) => c[2]);
  const minX = Math.min(...xs);
  const minZ = Math.min(...zs);
  const w = Math.max(...xs) - minX + 1;
  const d = Math.max(...zs) - minZ + 1;
  const filled = new Set(cells.map((c) => `${c[0] - minX},${c[2] - minZ}`));
  return (
    <div className={`tetrus-next ${small ? 'tetrus-next-small' : ''}`}>
      <div
        className="tetrus-next-grid"
        style={{ gridTemplateColumns: `repeat(${w}, 1fr)`, width: w * (small ? 11 : 15) }}
      >
        {Array.from({ length: w * d }, (_, i) => {
          const x = i % w;
          const z = Math.floor(i / w);
          const on = filled.has(`${x},${z}`);
          return (
            <span
              key={i}
              className="tetrus-next-cell"
              style={on ? { background: def.color, boxShadow: `0 0 6px ${def.color}` } : undefined}
            />
          );
        })}
      </div>
      {!small && <div className="tetrus-next-name">{def.name}</div>}
    </div>
  );
}

export default function TetrusPage() {
  const stateRef = useRef(null);
  const soundRef = useRef(null);
  const rafRef = useRef(0);
  const lastRef = useRef(0);
  const accRef = useRef(0);
  const pausedRef = useRef(false);
  const startedRef = useRef(false);
  const touchRef = useRef(null);
  const strainTimerRef = useRef(0);
  const submittedRef = useRef(false);
  const bannerTimerRef = useRef(0);

  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [startLevel, setStartLevel] = useState(1);
  const [hud, setHud] = useState(null);
  const [banner, setBanner] = useState(null); // { headline, text, key }
  const [flash, setFlash] = useState(null); // { text, key }
  const [board, setBoard] = useState({ source: 'local', entries: [], offline: true });
  const [name, setName] = useState('');
  const [submitState, setSubmitState] = useState('idle'); // idle | saving | saved

  const sound = useCallback(() => {
    if (!soundRef.current) soundRef.current = createSound();
    return soundRef.current;
  }, []);

  const showBanner = useCallback((headline, text) => {
    setBanner({ headline, text, key: Date.now() });
    window.clearTimeout(bannerTimerRef.current);
    bannerTimerRef.current = window.setTimeout(() => setBanner(null), 6000);
  }, []);

  const flashTimerRef = useRef(0);
  const showFlash = useCallback((text) => {
    setFlash({ text, key: Date.now() });
    window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => setFlash(null), 2800);
  }, []);

  const refreshBoard = useCallback(async () => {
    const res = await fetchLeaderboard(10);
    setBoard(res);
  }, []);

  useEffect(() => {
    setName(getSavedName());
    refreshBoard();
  }, [refreshBoard]);

  // ------------------------------------------------------------ game loop --
  useEffect(() => {
    if (!started) return undefined;
    lastRef.current = performance.now();
    const loop = (now) => {
      rafRef.current = requestAnimationFrame(loop);
      const s = stateRef.current;
      if (!s) return;
      let frame = (now - lastRef.current) / 1000;
      lastRef.current = now;
      if (frame > 0.25) frame = 0.25;
      if (!pausedRef.current) {
        accRef.current += frame;
        let guard = 0;
        while (accRef.current >= STEP && guard++ < 40) {
          stepGame(s, STEP);
          accRef.current -= STEP;
        }
        // Kronos strains against the lid, harder as the seal nears.
        strainTimerRef.current -= frame;
        if (s.status === 'playing' && strainTimerRef.current <= 0) {
          strainTimerRef.current = 6 + Math.random() * 6;
          if (Math.random() < 0.35 + s.cfg.strain * 0.5) {
            sound().strain();
            buzz('strain');
          }
        }
      }
      for (const ev of drainEvents(s)) {
        switch (ev.type) {
          case 'start':
            sound().start();
            break;
          case 'rotate':
            sound().rotate();
            buzz('rotate');
            break;
          case 'lock':
            sound().lock();
            buzz('lock');
            break;
          case 'hardDrop':
            sound().hardDrop();
            buzz('hardDrop');
            break;
          case 'clear':
            sound().clear(ev.layers, ev.combo);
            sound().childrenRise();
            buzz('clear');
            showFlash(
              ev.layers > 1
                ? `${ev.layers} floors sealed! +${ev.points.toLocaleString()}`
                : `Floor sealed! +${ev.points.toLocaleString()}`
            );
            break;
          case 'combo':
            sound().combo(ev.combo);
            buzz('combo');
            showFlash(`Combo x${ev.combo}! The lights rise faster…`);
            break;
          case 'levelClear':
            sound().levelClear();
            buzz('levelClear');
            showFlash(`Depth ${ev.level} sealed — the children rise!`);
            break;
          case 'levelStart': {
            const story = storyForLevel(ev.level);
            if (story.isActOpener) showBanner(story.headline, story.story);
            else showFlash(`Depth ${ev.level} — ${story.actTitle}`);
            break;
          }
          case 'gameover':
            sound().gameOver();
            buzz('gameOver');
            refreshBoard();
            break;
          case 'won':
            sound().won();
            buzz('levelClear');
            refreshBoard();
            break;
          default:
            break;
        }
      }
      // HUD sync (only re-render when something visible changed).
      const next = {
        status: s.status,
        score: s.score,
        level: s.level,
        layers: s.layers,
        layersThisLevel: s.layersThisLevel,
        layersGoal: s.cfg.layersGoal,
        childrenFreed: s.childrenFreed,
        combo: s.comboChain,
        queue: s.queue.slice(0, 3),
        actTitle: s.cfg.actTitle,
      };
      setHud((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [started, sound, showBanner, showFlash, refreshBoard]);

  // -------------------------------------------------------------- controls --
  const act = useCallback((fn) => {
    const s = stateRef.current;
    if (!s || pausedRef.current) return;
    sound().unlock();
    fn(s);
  }, [sound]);

  const doMove = useCallback((dx, dz) => act((s) => { if (movePiece(s, dx, dz)) sound().move(); }), [act, sound]);
  const doRotate = useCallback((axis, dir = 1) => act((s) => rotatePiece(s, axis, dir)), [act]);
  const doHardDrop = useCallback(() => act((s) => hardDrop(s)), [act]);
  const doSoft = useCallback((on) => {
    const s = stateRef.current;
    if (s) setSoftDrop(s, on);
  }, []);

  const togglePause = useCallback(() => {
    if (!startedRef.current) return;
    setPaused((p) => {
      pausedRef.current = !p;
      return !p;
    });
  }, []);

  useEffect(() => {
    const down = (e) => {
      if (!startedRef.current) return;
      const s = stateRef.current;
      if (!s) return;
      if (e.code === 'KeyP' || e.code === 'Escape') {
        e.preventDefault();
        togglePause();
        return;
      }
      if (pausedRef.current) return;
      switch (e.code) {
        case 'ArrowLeft': case 'KeyA': e.preventDefault(); doMove(-1, 0); break;
        case 'ArrowRight': case 'KeyD': e.preventDefault(); doMove(1, 0); break;
        case 'ArrowUp': case 'KeyW': e.preventDefault(); doMove(0, -1); break;
        case 'ArrowDown': case 'KeyS': e.preventDefault(); doMove(0, 1); break;
        case 'KeyQ': e.preventDefault(); doRotate('y', -1); break;
        case 'KeyE': e.preventDefault(); doRotate('y', 1); break;
        case 'KeyR': e.preventDefault(); doRotate('x', 1); break;
        case 'KeyF': e.preventDefault(); doRotate('z', 1); break;
        case 'ShiftLeft': case 'ShiftRight': doSoft(true); break;
        case 'Space': e.preventDefault(); if (!e.repeat) doHardDrop(); break;
        default: break;
      }
    };
    const up = (e) => {
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') doSoft(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [doMove, doRotate, doHardDrop, doSoft, togglePause]);

  // Touch: drag to slide the stone in the floor plane, tap to spin.
  const onTouchStart = (e) => {
    const t = e.touches[0];
    touchRef.current = { x: t.clientX, y: t.clientY, lx: t.clientX, ly: t.clientY, at: Date.now(), moved: 0 };
  };
  const onTouchMove = (e) => {
    const rec = touchRef.current;
    if (!rec) return;
    const t = e.touches[0];
    const STEP_PX = 26;
    let dx = t.clientX - rec.lx;
    let dy = t.clientY - rec.ly;
    while (Math.abs(dx) >= STEP_PX || Math.abs(dy) >= STEP_PX) {
      if (Math.abs(dx) >= Math.abs(dy)) {
        doMove(dx > 0 ? 1 : -1, 0);
        rec.lx += Math.sign(dx) * STEP_PX;
        rec.moved += STEP_PX;
        dx = t.clientX - rec.lx;
      } else {
        doMove(0, dy > 0 ? 1 : -1);
        rec.ly += Math.sign(dy) * STEP_PX;
        rec.moved += STEP_PX;
        dy = t.clientY - rec.ly;
      }
    }
  };
  const onTouchEnd = () => {
    const rec = touchRef.current;
    touchRef.current = null;
    if (!rec) return;
    if (Date.now() - rec.at < 250 && rec.moved < 12) doRotate('y', 1); // tap = spin
  };

  // --------------------------------------------------------------- run mgmt --
  const beginRun = useCallback((level) => {
    sound().unlock();
    stateRef.current = createGame(level);
    submittedRef.current = false;
    setSubmitState('idle');
    setPaused(false);
    pausedRef.current = false;
    startedRef.current = true;
    setStarted(true);
    setHud(null);
    const story = storyForLevel(level);
    showBanner(story.headline, story.story);
  }, [sound, showBanner]);

  const endRun = useCallback(() => {
    startedRef.current = false;
    setStarted(false);
    setPaused(false);
    pausedRef.current = false;
    stateRef.current = null;
    refreshBoard();
  }, [refreshBoard]);

  const toggleMute = useCallback(() => {
    const s = sound();
    s.unlock();
    const next = !muted;
    s.setMuted(next);
    setMuted(next);
  }, [muted, sound]);

  const submitRun = useCallback(async () => {
    const s = stateRef.current;
    if (!s || submittedRef.current) return;
    const clean = (name || 'Mason').trim().slice(0, 24) || 'Mason';
    saveName(clean);
    setSubmitState('saving');
    await submitScore({ username: clean, score: s.score, level: s.level, lines: s.layers });
    submittedRef.current = true;
    setSubmitState('saved');
    refreshBoard();
  }, [name, refreshBoard]);

  const status = hud?.status;
  const gameEnded = status === 'gameover' || status === 'won';
  const progress = hud ? Math.min(1, hud.layersThisLevel / Math.max(1, hud.layersGoal)) : 0;

  return (
    <div className="tetrus-page">
      <style>{TETRUS_CSS}</style>
      <header className="tetrus-topbar">
        <BackButton fallback="/games" label="Games" />
        <div className="tetrus-title-wrap">
          <h1 className="tetrus-logo">TETRUS</h1>
          <p className="tetrus-tagline">Build the prison of Tartarus. Trap Kronos.</p>
        </div>
        <div className="tetrus-top-actions">
          <button type="button" className="tetrus-icon-btn" onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'}>
            {muted ? <VolumeX size={19} /> : <Volume2 size={19} />}
          </button>
          {started && (
            <button type="button" className="tetrus-icon-btn" onClick={togglePause} aria-label={paused ? 'Resume' : 'Pause'}>
              {paused ? <Play size={19} /> : <Pause size={19} />}
            </button>
          )}
        </div>
      </header>

      {!started && (
        <main className="tetrus-intro">
          <div className="tetrus-intro-hero">
            <Skull className="tetrus-hero-icon" size={40} />
            <h2 className="tetrus-hero-title">The Devourer Stirs</h2>
            <p className="tetrus-hero-text">
              Kronos swallowed his children and ruled a golden age of fear. Zeus has chained him in
              Tartarus — but chains rust. You are the mason of Olympus: descend into the pit, stack
              the falling stones in three dimensions, and seal <strong>100 floors</strong> above him.
              Every floor you complete frees the golden lights of the children he devoured — watch
              them rise. If the stones overflow the pit, he breaks free, and the sky goes dark.
            </p>
            <div className="tetrus-howto">
              <div><Hammer size={16} /> <span>Slide stones with arrows, WASD or swipes</span></div>
              <div><RotateCw size={16} /> <span>Spin Q / E · Tilt R · Roll F · Tap on mobile</span></div>
              <div><Layers size={16} /> <span>Fill a whole floor to seal it and free the lights</span></div>
              <div><ChevronsDown size={16} /> <span>Space drops the stone · Shift soft-drops</span></div>
            </div>
            <label className="tetrus-level-pick-label" htmlFor="tetrus-start-level">
              Begin at the opening of an act:
            </label>
            <div className="tetrus-act-row">
              {ACTS.map((a, i) => {
                const lvl = i * 10 + 1;
                return (
                  <button
                    key={lvl}
                    type="button"
                    className={`tetrus-act-chip ${startLevel === lvl ? 'tetrus-act-chip-on' : ''}`}
                    onClick={() => setStartLevel(lvl)}
                  >
                    {lvl}
                  </button>
                );
              })}
            </div>
            <p className="tetrus-act-name">
              Act {Math.floor((startLevel - 1) / 10) + 1}: {ACTS[Math.floor((startLevel - 1) / 10)].title}
            </p>
            <button type="button" className="tetrus-begin-btn" onClick={() => beginRun(startLevel)}>
              <Hammer size={20} /> Begin the Descent
            </button>
          </div>
          <LeaderboardPanel board={board} />
        </main>
      )}

      {started && (
        <main className="tetrus-layout">
          <section className="tetrus-stage-col">
            <div className="tetrus-hud">
              <div className="tetrus-stat">
                <span className="tetrus-stat-label">Score</span>
                <span className="tetrus-stat-value">{(hud?.score || 0).toLocaleString()}</span>
              </div>
              <div className="tetrus-stat">
                <span className="tetrus-stat-label">Depth</span>
                <span className="tetrus-stat-value">{hud?.level || 1}<span className="tetrus-stat-dim">/100</span></span>
              </div>
              <div className="tetrus-stat">
                <span className="tetrus-stat-label">Floors</span>
                <span className="tetrus-stat-value">{hud?.layers || 0}</span>
              </div>
              <div className="tetrus-stat tetrus-stat-gold">
                <span className="tetrus-stat-label"><Sparkles size={11} /> Lights Freed</span>
                <span className="tetrus-stat-value">{hud?.childrenFreed || 0}</span>
              </div>
            </div>
            <div className="tetrus-progress-wrap">
              <div className="tetrus-progress-label">
                <span>Sealing depth {hud?.level || 1} — {hud?.actTitle || ''}</span>
                <span>{hud?.layersThisLevel || 0} / {hud?.layersGoal || 0} floors</span>
              </div>
              <div className="tetrus-progress">
                <div className="tetrus-progress-fill" style={{ width: `${progress * 100}%` }} />
              </div>
              {hud?.combo > 1 && <div className="tetrus-combo">COMBO x{hud.combo}</div>}
            </div>

            <div
              className="tetrus-stage"
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
            >
              <TetrusCanvas stateRef={stateRef} />
              {flash && (
                <div key={flash.key} className="tetrus-flash">{flash.text}</div>
              )}
              {banner && !gameEnded && (
                <button type="button" className="tetrus-banner" onClick={() => setBanner(null)}>
                  <span className="tetrus-banner-head">{banner.headline}</span>
                  <span className="tetrus-banner-text">{banner.text}</span>
                  <span className="tetrus-banner-hint">Tap to dismiss</span>
                </button>
              )}
              {status === 'ready' && !banner && (
                <div className="tetrus-center-msg">Depth {hud?.level || 1} — get ready, mason…</div>
              )}
              {status === 'levelclear' && (
                <div className="tetrus-center-msg tetrus-center-gold">Floor sealed! Descending…</div>
              )}
              {paused && !gameEnded && (
                <div className="tetrus-overlay">
                  <h3 className="tetrus-overlay-title">Paused</h3>
                  <p className="tetrus-overlay-text">Kronos waits. He is good at that.</p>
                  <button type="button" className="tetrus-begin-btn" onClick={togglePause}>
                    <Play size={18} /> Resume Building
                  </button>
                  <button type="button" className="tetrus-ghost-btn" onClick={endRun}>Abandon the Pit</button>
                </div>
              )}
              {gameEnded && (
                <div className="tetrus-overlay">
                  {status === 'won' ? (
                    <>
                      <Crown className="tetrus-hero-icon" size={38} />
                      <h3 className="tetrus-overlay-title tetrus-gold-text">KRONOS IS SEALED</h3>
                      <p className="tetrus-overlay-text">
                        The hundredth floor sings shut. Above Tartarus the children rise like dawn,
                        and the devourer dreams forever in the dark. Olympus endures — because a
                        mason built true.
                      </p>
                    </>
                  ) : (
                    <>
                      <Skull className="tetrus-hero-icon" size={38} />
                      <h3 className="tetrus-overlay-title">The Pit Overflows</h3>
                      <p className="tetrus-overlay-text">
                        The stones spill past the rim and Kronos rises laughing from the deep…
                        this time. The children’s lights gutter — but Olympus does not surrender
                        its mason. Build again.
                      </p>
                    </>
                  )}
                  <div className="tetrus-final-stats">
                    <div><span>Score</span><strong>{(hud?.score || 0).toLocaleString()}</strong></div>
                    <div><span>Depth</span><strong>{hud?.level || 1}</strong></div>
                    <div><span>Floors</span><strong>{hud?.layers || 0}</strong></div>
                    <div><span>Lights</span><strong>{hud?.childrenFreed || 0}</strong></div>
                  </div>
                  {submitState !== 'saved' ? (
                    <div className="tetrus-submit-row">
                      <input
                        className="tetrus-name-input"
                        value={name}
                        onChange={(e) => setName(e.target.value.slice(0, 24))}
                        placeholder="Your name for the ages"
                        maxLength={24}
                        aria-label="Display name"
                      />
                      <button
                        type="button"
                        className="tetrus-begin-btn tetrus-submit-btn"
                        onClick={submitRun}
                        disabled={submitState === 'saving'}
                      >
                        <Trophy size={17} /> {submitState === 'saving' ? 'Carving…' : 'Carve My Score'}
                      </button>
                    </div>
                  ) : (
                    <p className="tetrus-saved-note">Your score is carved into the bronze tablets.</p>
                  )}
                  <div className="tetrus-end-actions">
                    <button type="button" className="tetrus-begin-btn" onClick={() => beginRun(startLevel)}>
                      <RotateCcw size={18} /> Descend Again
                    </button>
                    <button type="button" className="tetrus-ghost-btn" onClick={endRun}>Back to the Surface</button>
                  </div>
                </div>
              )}
            </div>

            <div className="tetrus-controls">
              <div className="tetrus-pad">
                <button type="button" className="tetrus-ctl tetrus-ctl-up" onClick={() => doMove(0, -1)} aria-label="Move away"><ChevronUp size={22} /></button>
                <button type="button" className="tetrus-ctl tetrus-ctl-left" onClick={() => doMove(-1, 0)} aria-label="Move left"><ChevronLeft size={22} /></button>
                <button type="button" className="tetrus-ctl tetrus-ctl-down" onClick={() => doMove(0, 1)} aria-label="Move toward"><ChevronDown size={22} /></button>
                <button type="button" className="tetrus-ctl tetrus-ctl-right" onClick={() => doMove(1, 0)} aria-label="Move right"><ChevronRight size={22} /></button>
              </div>
              <div className="tetrus-actions">
                <button type="button" className="tetrus-ctl tetrus-ctl-wide" onClick={() => doRotate('y', 1)}>
                  <RotateCw size={17} /> Spin
                </button>
                <button type="button" className="tetrus-ctl tetrus-ctl-wide" onClick={() => doRotate('x', 1)}>Tilt</button>
                <button type="button" className="tetrus-ctl tetrus-ctl-wide" onClick={() => doRotate('z', 1)}>Roll</button>
                <button
                  type="button"
                  className="tetrus-ctl tetrus-ctl-wide"
                  onPointerDown={() => doSoft(true)}
                  onPointerUp={() => doSoft(false)}
                  onPointerLeave={() => doSoft(false)}
                >
                  Soft ▼
                </button>
                <button type="button" className="tetrus-ctl tetrus-ctl-drop" onClick={doHardDrop}>
                  <ChevronsDown size={17} /> Drop
                </button>
              </div>
            </div>
            <p className="tetrus-keys-hint">
              Arrows / WASD move · Q / E spin · R tilt · F roll · Shift soft-drop · Space drop · P pause · Swipe &amp; tap on touch
            </p>
          </section>

          <aside className="tetrus-side">
            <div className="tetrus-panel">
              <h3 className="tetrus-panel-title">Next Stones</h3>
              <div className="tetrus-next-row">
                {(hud?.queue || []).map((id, i) => (
                  <NextPiece key={`${id}-${i}`} id={id} small={i > 0} />
                ))}
                {(!hud?.queue || hud.queue.length === 0) && <p className="tetrus-panel-dim">The Cyclopes are forging…</p>}
              </div>
            </div>
            <LeaderboardPanel board={board} compact />
          </aside>
        </main>
      )}
    </div>
  );
}

function LeaderboardPanel({ board, compact }) {
  return (
    <div className={`tetrus-panel tetrus-board ${compact ? 'tetrus-board-compact' : ''}`}>
      <h3 className="tetrus-panel-title"><Trophy size={16} /> Bronze Tablets of the Masons</h3>
      <p className="tetrus-board-source">
        {board.offline ? 'On-device tablets — the global board is not connected yet.' : 'Global board — every mason, one pit.'}
      </p>
      {board.entries.length === 0 ? (
        <p className="tetrus-panel-dim">No scores carved yet. Be the first legend of the pit.</p>
      ) : (
        <ol className="tetrus-board-list">
          {board.entries.map((e, i) => (
            <li key={i} className="tetrus-board-row">
              <span className="tetrus-board-rank">{i + 1}</span>
              <span className="tetrus-board-name">{e.username}</span>
              <span className="tetrus-board-meta">D{e.level} · {e.lines} floors</span>
              <span className="tetrus-board-score">{Number(e.score).toLocaleString()}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

const TETRUS_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;900&family=Rajdhani:wght@500;600;700&display=swap');
.tetrus-page { min-height: 100vh; background: radial-gradient(1200px 700px at 50% -10%, #241243 0%, #0a0618 45%, #030208 100%); color: #f3e9d2; font-family: 'Rajdhani', system-ui, sans-serif; padding: 14px 14px 40px; box-sizing: border-box; }
.tetrus-page * { box-sizing: border-box; }
.tetrus-topbar { display: flex; align-items: flex-start; gap: 12px; max-width: 1120px; margin: 0 auto 10px; }
.tetrus-title-wrap { flex: 1; text-align: center; }
.tetrus-logo { font-family: 'Orbitron', sans-serif; font-weight: 900; font-size: clamp(30px, 6vw, 46px); letter-spacing: 0.22em; margin: 0; background: linear-gradient(180deg, #ffe9a8 0%, #f5b93f 45%, #9a6a1c 80%, #ffdf7e 100%); -webkit-background-clip: text; background-clip: text; color: transparent; text-shadow: 0 0 34px rgba(245,185,63,0.25); }
.tetrus-tagline { margin: 2px 0 0; color: #b8a888; font-size: 15px; letter-spacing: 0.08em; }
.tetrus-top-actions { display: flex; gap: 8px; }
.tetrus-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 10px; border: 1px solid #6e5320; background: linear-gradient(180deg, #1d1430, #0d0820); color: #f5b93f; cursor: pointer; }
.tetrus-icon-btn:active { transform: scale(0.94); }
.tetrus-loading { display: flex; height: 100%; align-items: center; justify-content: center; color: #f5b93f; font-family: 'Orbitron', sans-serif; letter-spacing: 0.1em; }
/* intro */
.tetrus-intro { max-width: 720px; margin: 8px auto 0; display: flex; flex-direction: column; gap: 18px; }
.tetrus-intro-hero { border: 1px solid #6e5320; border-radius: 18px; padding: 26px 22px; background: linear-gradient(180deg, rgba(36,22,64,0.85), rgba(8,5,20,0.92)); box-shadow: 0 0 0 1px rgba(245,185,63,0.12), 0 18px 50px rgba(0,0,0,0.55), inset 0 0 60px rgba(255,122,26,0.05); text-align: center; }
.tetrus-hero-icon { color: #ff9d2e; filter: drop-shadow(0 0 12px rgba(255,157,46,0.65)); }
.tetrus-hero-title { font-family: 'Orbitron', sans-serif; font-size: clamp(22px, 5vw, 32px); letter-spacing: 0.12em; margin: 10px 0 8px; color: #ffe9a8; }
.tetrus-hero-text { color: #d9cba6; font-size: 17px; line-height: 1.55; margin: 0 auto 16px; max-width: 56ch; }
.tetrus-howto { display: grid; gap: 7px; text-align: left; max-width: 460px; margin: 0 auto 18px; color: #cbbd97; font-size: 15.5px; }
.tetrus-howto div { display: flex; align-items: center; gap: 9px; }
.tetrus-howto svg { color: #22d3ee; flex-shrink: 0; }
.tetrus-level-pick-label { display: block; color: #b8a888; font-size: 14px; letter-spacing: 0.06em; margin-bottom: 7px; }
.tetrus-act-row { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; }
.tetrus-act-chip { min-width: 42px; padding: 7px 0; border-radius: 9px; border: 1px solid #4a3a17; background: #140d26; color: #cbbd97; font-family: 'Orbitron', sans-serif; font-size: 14px; cursor: pointer; }
.tetrus-act-chip-on { border-color: #f5b93f; color: #ffe9a8; background: #2a1c08; box-shadow: 0 0 12px rgba(245,185,63,0.35); }
.tetrus-act-name { color: #f5b93f; font-size: 15px; margin: 9px 0 16px; letter-spacing: 0.05em; }
.tetrus-begin-btn { display: inline-flex; align-items: center; gap: 9px; padding: 13px 26px; border-radius: 12px; border: 1px solid #ffdf7e; background: linear-gradient(180deg, #f5b93f, #b97e17); color: #1d1204; font-family: 'Orbitron', sans-serif; font-weight: 700; font-size: 16px; letter-spacing: 0.08em; cursor: pointer; box-shadow: 0 6px 24px rgba(245,185,63,0.35), inset 0 1px 0 rgba(255,255,255,0.5); }
.tetrus-begin-btn:active { transform: scale(0.97); }
.tetrus-begin-btn:disabled { opacity: 0.6; }
.tetrus-ghost-btn { display: inline-flex; align-items: center; gap: 8px; padding: 11px 20px; border-radius: 12px; border: 1px solid #4a3a17; background: transparent; color: #cbbd97; font-family: 'Rajdhani', sans-serif; font-weight: 600; font-size: 15px; cursor: pointer; }
/* panels + board */
.tetrus-panel { border: 1px solid #4a3a17; border-radius: 16px; padding: 16px 18px; background: linear-gradient(180deg, rgba(29,20,48,0.9), rgba(9,6,22,0.94)); box-shadow: inset 0 0 40px rgba(0,0,0,0.4); }
.tetrus-panel-title { font-family: 'Orbitron', sans-serif; font-size: 15px; letter-spacing: 0.14em; color: #ffe9a8; margin: 0 0 10px; display: flex; align-items: center; gap: 8px; }
.tetrus-panel-title svg { color: #f5b93f; }
.tetrus-panel-dim { color: #9a8c6d; font-size: 15px; margin: 0; }
.tetrus-board-source { color: #9a8c6d; font-size: 13.5px; margin: -4px 0 10px; letter-spacing: 0.03em; }
.tetrus-board-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.tetrus-board-row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 10px; background: rgba(245,185,63,0.05); border: 1px solid rgba(245,185,63,0.1); }
.tetrus-board-rank { font-family: 'Orbitron', sans-serif; color: #f5b93f; width: 22px; text-align: center; font-size: 14px; }
.tetrus-board-name { flex: 1; font-weight: 600; color: #f3e9d2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tetrus-board-meta { color: #9a8c6d; font-size: 13px; }
.tetrus-board-score { font-family: 'Orbitron', sans-serif; color: #ffe9a8; font-size: 14px; }
/* play layout */
.tetrus-layout { max-width: 1120px; margin: 0 auto; display: grid; gap: 16px; grid-template-columns: 1fr; }
@media (min-width: 920px) { .tetrus-layout { grid-template-columns: minmax(0, 1fr) 300px; align-items: start; } }
.tetrus-stage-col { min-width: 0; }
.tetrus-side { display: grid; gap: 16px; }
.tetrus-hud { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 10px; }
.tetrus-stat { border: 1px solid #4a3a17; border-radius: 12px; padding: 8px 10px; background: linear-gradient(180deg, rgba(29,20,48,0.9), rgba(9,6,22,0.94)); text-align: center; }
.tetrus-stat-label { display: flex; align-items: center; justify-content: center; gap: 4px; font-size: 11.5px; letter-spacing: 0.14em; text-transform: uppercase; color: #9a8c6d; }
.tetrus-stat-value { font-family: 'Orbitron', sans-serif; font-size: clamp(17px, 4.4vw, 24px); color: #ffe9a8; }
.tetrus-stat-dim { color: #9a8c6d; font-size: 0.62em; }
.tetrus-stat-gold .tetrus-stat-value { color: #ffd968; text-shadow: 0 0 14px rgba(255,217,104,0.6); }
.tetrus-progress-wrap { margin-bottom: 10px; position: relative; }
.tetrus-progress-label { display: flex; justify-content: space-between; color: #b8a888; font-size: 13.5px; letter-spacing: 0.04em; margin-bottom: 5px; gap: 10px; }
.tetrus-progress { height: 9px; border-radius: 6px; background: #17102a; border: 1px solid #4a3a17; overflow: hidden; }
.tetrus-progress-fill { height: 100%; background: linear-gradient(90deg, #22d3ee, #f5b93f, #ffd968); box-shadow: 0 0 12px rgba(245,185,63,0.7); transition: width 0.3s ease; }
.tetrus-combo { position: absolute; right: 0; top: -24px; font-family: 'Orbitron', sans-serif; color: #22d3ee; font-size: 13px; letter-spacing: 0.12em; text-shadow: 0 0 10px rgba(34,211,238,0.8); }
.tetrus-stage { position: relative; width: 100%; aspect-ratio: 4 / 4.6; max-height: 68vh; border-radius: 18px; overflow: hidden; border: 1px solid #6e5320; background: #030208; box-shadow: 0 0 0 1px rgba(245,185,63,0.12), 0 22px 60px rgba(0,0,0,0.65), inset 0 0 80px rgba(255,90,31,0.05); touch-action: none; }
@media (min-width: 920px) { .tetrus-stage { aspect-ratio: 4 / 4.2; max-height: 74vh; } }
.tetrus-stage canvas { display: block; }
.tetrus-flash { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); padding: 8px 18px; border-radius: 999px; background: rgba(10,6,24,0.85); border: 1px solid #f5b93f; color: #ffd968; font-family: 'Orbitron', sans-serif; font-size: clamp(12px, 3.4vw, 15px); letter-spacing: 0.08em; pointer-events: none; animation: tetrus-flash-in 0.25s ease; white-space: nowrap; max-width: 94%; overflow: hidden; text-overflow: ellipsis; }
@keyframes tetrus-flash-in { from { opacity: 0; transform: translateX(-50%) translateY(-8px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
.tetrus-banner { position: absolute; left: 12px; right: 12px; bottom: 12px; text-align: left; border: 1px solid #f5b93f; border-radius: 14px; background: rgba(8,5,20,0.92); padding: 14px 16px; cursor: pointer; color: #f3e9d2; display: grid; gap: 5px; box-shadow: 0 10px 34px rgba(0,0,0,0.6); }
.tetrus-banner-head { font-family: 'Orbitron', sans-serif; color: #ffe9a8; font-size: 15px; letter-spacing: 0.1em; }
.tetrus-banner-text { font-size: 15px; line-height: 1.5; color: #d9cba6; }
.tetrus-banner-hint { font-size: 12px; color: #9a8c6d; letter-spacing: 0.06em; }
.tetrus-center-msg { position: absolute; top: 42%; left: 50%; transform: translate(-50%, -50%); font-family: 'Orbitron', sans-serif; font-size: clamp(15px, 4.4vw, 22px); letter-spacing: 0.1em; color: #bfefff; text-shadow: 0 0 18px rgba(34,211,238,0.8); pointer-events: none; text-align: center; padding: 0 12px; }
.tetrus-center-gold { color: #ffd968; text-shadow: 0 0 18px rgba(255,217,104,0.85); }
.tetrus-overlay { position: absolute; inset: 0; background: rgba(3,2,10,0.86); backdrop-filter: blur(3px); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 22px; text-align: center; overflow-y: auto; }
.tetrus-overlay-title { font-family: 'Orbitron', sans-serif; font-size: clamp(20px, 5.4vw, 30px); letter-spacing: 0.12em; color: #ffe9a8; margin: 0; }
.tetrus-gold-text { background: linear-gradient(180deg, #fff3c4, #f5b93f 60%, #c99636); -webkit-background-clip: text; background-clip: text; color: transparent; }
.tetrus-overlay-text { color: #d9cba6; font-size: 16px; line-height: 1.55; max-width: 52ch; margin: 0; }
.tetrus-final-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; width: 100%; max-width: 460px; }
.tetrus-final-stats div { border: 1px solid #4a3a17; border-radius: 10px; padding: 8px 4px; background: rgba(245,185,63,0.05); display: grid; gap: 2px; }
.tetrus-final-stats span { font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: #9a8c6d; }
.tetrus-final-stats strong { font-family: 'Orbitron', sans-serif; color: #ffe9a8; font-size: 17px; }
.tetrus-submit-row { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; width: 100%; max-width: 460px; }
.tetrus-name-input { flex: 1 1 180px; padding: 12px 14px; border-radius: 12px; border: 1px solid #6e5320; background: #0d0820; color: #f3e9d2; font-family: 'Rajdhani', sans-serif; font-size: 16px; font-weight: 600; outline: none; }
.tetrus-name-input:focus { border-color: #f5b93f; box-shadow: 0 0 0 3px rgba(245,185,63,0.2); }
.tetrus-submit-btn { padding: 12px 18px; font-size: 14px; }
.tetrus-saved-note { color: #ffd968; font-size: 15.5px; margin: 0; }
.tetrus-end-actions { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
/* controls */
.tetrus-controls { display: flex; gap: 14px; align-items: stretch; margin-top: 12px; }
.tetrus-pad { display: grid; grid-template-columns: repeat(3, 52px); grid-template-rows: repeat(2, 52px); gap: 6px; }
.tetrus-ctl { display: inline-flex; align-items: center; justify-content: center; gap: 6px; border-radius: 12px; border: 1px solid #6e5320; background: linear-gradient(180deg, #241839, #0d0820); color: #ffe9a8; font-family: 'Rajdhani', sans-serif; font-weight: 700; font-size: 15px; cursor: pointer; user-select: none; -webkit-user-select: none; touch-action: manipulation; }
.tetrus-ctl:active { background: linear-gradient(180deg, #3a2a08, #1d1430); transform: scale(0.95); }
.tetrus-ctl-up { grid-column: 2; grid-row: 1; }
.tetrus-ctl-left { grid-column: 1; grid-row: 2; }
.tetrus-ctl-down { grid-column: 2; grid-row: 2; }
.tetrus-ctl-right { grid-column: 3; grid-row: 2; }
.tetrus-actions { flex: 1; display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.tetrus-ctl-wide { padding: 10px 6px; min-height: 52px; }
.tetrus-ctl-drop { grid-column: span 2; border-color: #ff9d2e; color: #ffd968; background: linear-gradient(180deg, #3a2408, #170d02); }
.tetrus-keys-hint { color: #8a7c5c; font-size: 13.5px; text-align: center; margin: 10px 0 0; letter-spacing: 0.03em; }
@media (max-width: 560px) { .tetrus-actions { grid-template-columns: repeat(3, 1fr); } .tetrus-ctl-drop { grid-column: span 3; } .tetrus-final-stats { grid-template-columns: repeat(2, 1fr); } }
/* next pieces */
.tetrus-next-row { display: flex; gap: 16px; align-items: flex-start; }
.tetrus-next { display: grid; gap: 7px; justify-items: center; }
.tetrus-next-grid { display: grid; gap: 3px; }
.tetrus-next-cell { width: 100%; aspect-ratio: 1; border-radius: 3px; background: rgba(245,185,63,0.07); display: block; }
.tetrus-next-name { font-size: 12.5px; color: #cbbd97; letter-spacing: 0.04em; text-align: center; }
.tetrus-next-small { opacity: 0.75; }
.tetrus-board-compact .tetrus-board-row { padding: 6px 8px; }
`;
