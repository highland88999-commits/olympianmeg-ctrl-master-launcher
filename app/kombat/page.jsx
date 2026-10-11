'use client';

// KOMBAT ARENA — 43-fighter 2.5D fighting game.
// Character select (live 3D preview) -> versus splash -> fight -> result.
// Mobile-first: virtual joystick + thumb buttons, non-passive touch handling,
// safe-area clearance, desktop keyboard fallback.

import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { buildFighterRig, poseRig, updateEffects } from '../../lib/kombat/rig.js';
import { FIGHTERS, FRANCHISES, getFighter } from '../../lib/kombat/roster.js';
import { VISUALS } from '../../lib/kombat/visuals.js';
import { createKombatEngine } from './engine';
import { createBrawlEngine } from './brawl';
import { BRAWL_COUNTS, BRAWL_BEST_OF } from '../../lib/kombat/brawl-rules.js';
import { ARENA_META } from './arenas';

const DIFFS = [
  { id: 'easy', label: 'EASY', desc: 'Slow reactions, timid AI' },
  { id: 'normal', label: 'NORMAL', desc: 'A real fight' },
  { id: 'hard', label: 'HARD', desc: 'Fast, aggressive, blocks a lot' },
];

// ------------------------------------------------------------------
// Live 3D preview of one fighter (character select)
// ------------------------------------------------------------------
function PreviewCanvas({ fighterId }) {
  const mountRef = useRef(null);
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const params = VISUALS[fighterId];
    if (!params) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const w = mount.clientWidth || 300;
    const h = mount.clientHeight || 220;
    renderer.setSize(w, h);
    mount.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, w / h, 0.1, 50);
    camera.position.set(0, 1.55, 4.4);
    camera.lookAt(0, 1.0, 0);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x332211, 1.1));
    const keyL = new THREE.DirectionalLight(0xffffff, 1.3);
    keyL.position.set(3, 5, 4);
    scene.add(keyL);
    const rim = new THREE.DirectionalLight(0xff2fd6, 0.7);
    rim.position.set(-4, 3, -3);
    scene.add(rim);
    const rig = buildFighterRig(params);
    scene.add(rig);
    const clock = new THREE.Clock();
    let raf = 0;
    let t = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, clock.getDelta());
      t += dt;
      rig.rotation.y += dt * 0.55;
      poseRig(rig, 'idle', t);
      updateEffects(rig, dt);
      renderer.render(scene, camera);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [fighterId]);
  return <div ref={mountRef} className="h-full w-full" />;
}

// ------------------------------------------------------------------
// Fight screen: canvas + HUD + touch controls
// ------------------------------------------------------------------
function FightScreen({ config, onExit }) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const rootRef = useRef(null);
  const joyRef = useRef(null);
  const knobRef = useRef(null);
  const touchGuard = useRef(0); // ignore emulated mouse events after touch
  const [hud, setHud] = useState({ p1: 1, p2: 1, time: 60, round: 1, p1Rounds: 0, p2Rounds: 0, sp1cd: 0, sp2cd: 0, p1Name: '', p2Name: '' });
  const [banner, setBanner] = useState({ text: '', sub: '', key: 0 });
  const [finishHim, setFinishHim] = useState({ active: false, seconds: 0, mine: false });
  const [fatalityName, setFatalityName] = useState('');
  const [combo, setCombo] = useState(null);
  const bannerTimer = useRef(null);
  const comboTimer = useRef(null);
  const fatalityTimer = useRef(null);

  const showBanner = useCallback((text, sub) => {
    setBanner((b) => ({ text, sub, key: b.key + 1 }));
    clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => setBanner((b) => ({ ...b, text: '' })), 2600);
  }, []);

  // engine lifecycle
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = createKombatEngine(canvas, {
      playerId: config.playerId,
      cpuId: config.cpuId,
      difficulty: config.difficulty,
      playerSpecials: config.playerSpecials,
      cpuSpecials: config.cpuSpecials,
      arena: config.arenaIdx,
      hooks: {
        onHud: (h) => setHud(h),
        onAnnounce: (text, sub) => showBanner(text, sub || ''),
        onFinishHim: (active, seconds, mine) => setFinishHim({ active, seconds, mine: !!mine }),
        onFatality: (name) => {
          setFatalityName(name);
          clearTimeout(fatalityTimer.current);
          fatalityTimer.current = setTimeout(() => setFatalityName(''), 3400);
        },
        onCombo: (side, count) => {
          setCombo({ side, count, key: Date.now() });
          clearTimeout(comboTimer.current);
          comboTimer.current = setTimeout(() => setCombo(null), 1200);
        },
        onMatchEnd: (result) => onExit(result),
      },
    });
    engineRef.current = engine;
    engine.start();
    return () => {
      engine.dispose();
      engineRef.current = null;
      clearTimeout(bannerTimer.current);
      clearTimeout(comboTimer.current);
      clearTimeout(fatalityTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // non-passive touch handling on the whole fight surface: drags never scroll
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const prevent = (e) => { e.preventDefault(); };
    root.addEventListener('touchmove', prevent, { passive: false });
    root.addEventListener('touchstart', prevent, { passive: false });
    return () => {
      root.removeEventListener('touchmove', prevent);
      root.removeEventListener('touchstart', prevent);
    };
  }, []);

  // joystick: native touch tracking (move axis + quick flick = dash)
  useEffect(() => {
    const zone = joyRef.current;
    if (!zone) return;
    let touchId = null;
    let startX = 0;
    let lastTapT = 0;
    let lastTapDir = 0;
    const knob = knobRef.current;
    const setKnob = (dx) => {
      if (knob) knob.style.transform = `translate(${Math.max(-34, Math.min(34, dx))}px, 0)`;
    };
    const onStart = (e) => {
      const t = e.changedTouches[0];
      touchId = t.identifier;
      startX = t.clientX;
      setKnob(0);
    };
    const onMove = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== touchId) continue;
        const dx = t.clientX - startX;
        engineRef.current?.setMove(Math.max(-1, Math.min(1, dx / 45)));
        setKnob(dx);
      }
    };
    const onEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== touchId) continue;
        const dx = t.clientX - startX;
        const dir = Math.sign(dx);
        const now = performance.now();
        if (Math.abs(dx) > 26 && dir !== 0) {
          if (now - lastTapT < 320 && dir === lastTapDir) {
            engineRef.current?.press('dash');
            lastTapT = 0;
          } else {
            lastTapT = now;
            lastTapDir = dir;
          }
        }
        touchId = null;
        engineRef.current?.setMove(0);
        setKnob(0);
      }
    };
    zone.addEventListener('touchstart', onStart, { passive: true });
    zone.addEventListener('touchmove', onMove, { passive: true });
    zone.addEventListener('touchend', onEnd, { passive: true });
    zone.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      zone.removeEventListener('touchstart', onStart);
      zone.removeEventListener('touchmove', onMove);
      zone.removeEventListener('touchend', onEnd);
      zone.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  // desktop keyboard fallback
  useEffect(() => {
    const held = new Set();
    const applyMove = () => {
      const v = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0);
      engineRef.current?.setMove(v);
    };
    const onKeyDown = (e) => {
      if (e.repeat) return;
      const eng = engineRef.current;
      if (!eng) return;
      switch (e.code) {
        case 'KeyA': case 'ArrowLeft': held.add('left'); applyMove(); break;
        case 'KeyD': case 'ArrowRight': held.add('right'); applyMove(); break;
        case 'KeyJ': eng.press('light'); break;
        case 'KeyK': eng.press('heavy'); break;
        case 'KeyL': eng.setBlock(true); break;
        case 'KeyU': eng.press('sp1'); break;
        case 'KeyI': eng.press('sp2'); break;
        case 'ShiftLeft': case 'ShiftRight': eng.press('dash'); break;
        case 'KeyF': eng.press('fatality'); break;
        default: break;
      }
    };
    const onKeyUp = (e) => {
      switch (e.code) {
        case 'KeyA': case 'ArrowLeft': held.delete('left'); applyMove(); break;
        case 'KeyD': case 'ArrowRight': held.delete('right'); applyMove(); break;
        case 'KeyL': engineRef.current?.setBlock(false); break;
        default: break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  const pressStart = (fn) => (e) => {
    e.preventDefault();
    touchGuard.current = Date.now();
    fn();
  };
  const mouseDown = (fn) => () => {
    if (Date.now() - touchGuard.current > 600) fn();
  };

  const sp = [config.playerSpecials[0], config.playerSpecials[1]].map((i) => getFighter(config.playerId)?.specials[i]);

  const btnBase =
    'flex flex-col items-center justify-center rounded-full font-black text-white select-none ' +
    'active:scale-95 transition-transform border-2 shadow-lg';
  const cdStyle = (frac, color) =>
    frac > 0
      ? { background: `conic-gradient(rgba(0,0,0,0.72) ${Math.round(frac * 360)}deg, ${color} 0deg)` }
      : { background: color };

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 overflow-hidden bg-black"
      style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <style>{`
        @keyframes kombat-slam {
          0% { transform: scale(2.6) rotate(-4deg); opacity: 0; }
          14% { transform: scale(1) rotate(0deg); opacity: 1; }
          78% { transform: scale(1); opacity: 1; }
          100% { transform: scale(0.92); opacity: 0; }
        }
        @keyframes kombat-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }
        @keyframes kombat-flicker {
          0%, 100% { opacity: 1; } 50% { opacity: 0.55; }
        }
        .kombat-banner { animation: kombat-slam 2.6s ease-out forwards; }
        .kombat-pulse { animation: kombat-pulse 0.9s ease-in-out infinite; }
        .kombat-flicker { animation: kombat-flicker 0.5s linear infinite; }
        .kombat-outline {
          text-shadow: 0 2px 0 #000, 0 -2px 0 #000, 2px 0 0 #000, -2px 0 0 #000,
            0 0 22px rgba(255, 30, 30, 0.75);
        }
      `}</style>

      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* HUD */}
      <div
        className="absolute left-0 right-0 top-0 px-3"
        style={{ paddingTop: 'max(0.6rem, env(safe-area-inset-top))' }}
      >
        <div className="flex items-start gap-2">
          {/* player */}
          <div className="flex-1">
            <div className="mb-1 flex items-end justify-between">
              <span className="truncate text-[11px] font-black tracking-wide text-amber-300">{hud.p1Name}</span>
              <span className="text-[11px] text-amber-300">{'●'.repeat(hud.p1Rounds)}{'○'.repeat(2 - hud.p1Rounds)}</span>
            </div>
            <div className="h-4 -skew-x-12 overflow-hidden rounded-sm border border-amber-200/40 bg-red-950">
              <div className="h-full bg-gradient-to-b from-lime-300 to-lime-600 transition-[width] duration-150" style={{ width: `${hud.p1 * 100}%`, marginLeft: 'auto' }} />
            </div>
          </div>
          {/* timer */}
          <div className="flex w-14 shrink-0 flex-col items-center">
            <div className="flex h-11 w-11 rotate-45 items-center justify-center border-2 border-amber-200/60 bg-black/70">
              <span className="-rotate-45 text-lg font-black text-white">{hud.time}</span>
            </div>
            <span className="mt-1 text-[10px] font-bold tracking-widest text-white/70">R{hud.round}</span>
          </div>
          {/* cpu */}
          <div className="flex-1">
            <div className="mb-1 flex items-end justify-between">
              <span className="text-[11px] text-red-300">{'●'.repeat(hud.p2Rounds)}{'○'.repeat(2 - hud.p2Rounds)}</span>
              <span className="truncate text-[11px] font-black tracking-wide text-red-300">{hud.p2Name}</span>
            </div>
            <div className="h-4 skew-x-12 overflow-hidden rounded-sm border border-red-200/40 bg-red-950">
              <div className="h-full bg-gradient-to-b from-lime-300 to-lime-600 transition-[width] duration-150" style={{ width: `${hud.p2 * 100}%` }} />
            </div>
          </div>
        </div>
        <div className="mt-1 flex justify-end">
          <button
            aria-label="Quit fight"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/30 bg-black/60 text-sm text-white/80"
            style={{ touchAction: 'none' }}
            onTouchStart={pressStart(() => onExit(null))}
            onMouseDown={mouseDown(() => onExit(null))}
          >✕</button>
        </div>
      </div>

      {/* announcer banner */}
      {banner.text ? (
        <div key={banner.key} className="pointer-events-none absolute inset-x-0 top-[30%] flex flex-col items-center">
          <div className="kombat-banner kombat-outline px-4 text-center text-5xl font-black tracking-tight text-red-500 sm:text-6xl">
            {banner.text}
          </div>
          {banner.sub ? (
            <div className="kombat-banner mt-2 px-4 text-center text-sm font-bold tracking-widest text-amber-200" style={{ animationDelay: '0.12s' }}>
              {banner.sub}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* combo counter */}
      {combo ? (
        <div key={combo.key} className="pointer-events-none absolute left-4 top-[24%]">
          <div className="kombat-flicker text-2xl font-black text-amber-300 kombat-outline">{combo.count}-HIT COMBO</div>
        </div>
      ) : null}

      {/* FINISH HIM overlay */}
      {finishHim.active ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center bg-red-950/25">
          <div className="kombat-outline text-6xl font-black tracking-tight text-red-500 kombat-pulse">FINISH HIM!</div>
          <div className="mt-2 text-4xl font-black text-white">{finishHim.seconds}</div>
        </div>
      ) : null}

      {/* fatality cinematic card */}
      {fatalityName ? (
        <div className="pointer-events-none absolute inset-x-0 top-[38%] flex flex-col items-center bg-gradient-to-b from-transparent via-red-950/70 to-transparent py-6">
          <div className="kombat-outline text-6xl font-black tracking-tight text-red-500 kombat-slam">FATALITY!</div>
          <div className="mt-3 max-w-[90%] text-center text-lg font-black tracking-wide text-amber-200">{fatalityName}</div>
        </div>
      ) : null}

      {/* controls */}
      <div
        className="absolute inset-x-0 bottom-0 flex items-end justify-between px-3"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        {/* joystick */}
        <div
          ref={joyRef}
          className="relative flex h-36 w-36 items-center justify-center rounded-full border-2 border-white/25 bg-white/5"
          style={{ touchAction: 'none' }}
          aria-label="Move"
        >
          <div className="absolute text-[10px] font-bold tracking-widest text-white/40">MOVE</div>
          <div ref={knobRef} className="h-16 w-16 rounded-full border-2 border-amber-200/60 bg-amber-400/30 shadow-lg" />
        </div>

        {/* buttons */}
        <div className="flex flex-col items-end gap-2">
          {finishHim.active && finishHim.mine ? (
            <button
              className={`${btnBase} kombat-pulse h-20 w-20 border-red-300 bg-red-600 text-sm`}
              style={{ touchAction: 'none' }}
              onTouchStart={pressStart(() => engineRef.current?.press('fatality'))}
              onMouseDown={mouseDown(() => engineRef.current?.press('fatality'))}
            >FATALITY</button>
          ) : null}
          <div className="flex gap-2">
            <button
              aria-label="Punch"
              className={`${btnBase} h-16 w-16 border-orange-300 bg-orange-600 text-[11px]`}
              style={{ touchAction: 'none' }}
              onTouchStart={pressStart(() => engineRef.current?.press('light'))}
              onMouseDown={mouseDown(() => engineRef.current?.press('light'))}
            >PUNCH</button>
            <button
              aria-label="Kick"
              className={`${btnBase} h-16 w-16 border-red-300 bg-red-700 text-[11px]`}
              style={{ touchAction: 'none' }}
              onTouchStart={pressStart(() => engineRef.current?.press('heavy'))}
              onMouseDown={mouseDown(() => engineRef.current?.press('heavy'))}
            >KICK</button>
          </div>
          <div className="flex gap-2">
            <button
              aria-label="Special 1"
              title={sp[0]?.name}
              className={`${btnBase} relative h-14 w-14 overflow-hidden border-purple-300 text-[10px]`}
              style={{ touchAction: 'none', ...cdStyle(hud.sp1cd, '#7c3aed') }}
              onTouchStart={pressStart(() => engineRef.current?.press('sp1'))}
              onMouseDown={mouseDown(() => engineRef.current?.press('sp1'))}
            >
              <span className="relative z-10 leading-tight">SP1</span>
              <span className="relative z-10 max-w-[52px] truncate text-[8px] font-bold opacity-80">{sp[0]?.name}</span>
            </button>
            <button
              aria-label="Special 2"
              title={sp[1]?.name}
              className={`${btnBase} relative h-14 w-14 overflow-hidden border-purple-300 text-[10px]`}
              style={{ touchAction: 'none', ...cdStyle(hud.sp2cd, '#7c3aed') }}
              onTouchStart={pressStart(() => engineRef.current?.press('sp2'))}
              onMouseDown={mouseDown(() => engineRef.current?.press('sp2'))}
            >
              <span className="relative z-10 leading-tight">SP2</span>
              <span className="relative z-10 max-w-[52px] truncate text-[8px] font-bold opacity-80">{sp[1]?.name}</span>
            </button>
            <button
              aria-label="Block (hold)"
              className={`${btnBase} h-14 w-14 border-sky-300 bg-sky-700 text-[10px]`}
              style={{ touchAction: 'none' }}
              onTouchStart={pressStart(() => engineRef.current?.setBlock(true))}
              onTouchEnd={(e) => { e.preventDefault(); engineRef.current?.setBlock(false); }}
              onTouchCancel={() => engineRef.current?.setBlock(false)}
              onMouseDown={mouseDown(() => engineRef.current?.setBlock(true))}
              onMouseUp={mouseDown(() => engineRef.current?.setBlock(false))}
              onMouseLeave={() => engineRef.current?.setBlock(false)}
            >BLOCK</button>
            <button
              aria-label="Dash"
              className={`${btnBase} h-14 w-14 border-emerald-300 bg-emerald-700 text-[10px]`}
              style={{ touchAction: 'none' }}
              onTouchStart={pressStart(() => engineRef.current?.press('dash'))}
              onMouseDown={mouseDown(() => engineRef.current?.press('dash'))}
            >DASH</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Character select
// ------------------------------------------------------------------
function SelectScreen({ mode, setMode, onFight }) {
  const [pickMode, setPickMode] = useState('player'); // player | cpu
  const [playerId, setPlayerId] = useState(null);
  const [cpuId, setCpuId] = useState(null);
  const [highlightId, setHighlightId] = useState(FIGHTERS[0].id);
  const [difficulty, setDifficulty] = useState('normal');
  const [arenaIdx, setArenaIdx] = useState(0);
  const [specialIdxs, setSpecialIdxs] = useState([0, 1]);

  const highlight = getFighter(highlightId);
  const player = playerId ? getFighter(playerId) : null;

  const tapFighter = (id) => {
    setHighlightId(id);
    if (pickMode === 'player') {
      setPlayerId(id);
      setSpecialIdxs([0, 1]);
      setPickMode('cpu');
    } else {
      setCpuId(id);
    }
  };

  const toggleSpecial = (i) => {
    setSpecialIdxs((prev) => {
      if (prev.includes(i)) return prev.length > 1 ? prev.filter((x) => x !== i) : prev;
      if (prev.length >= 2) return [prev[1], i];
      return [...prev, i];
    });
  };

  const randomCpu = () => {
    const pool = FIGHTERS.filter((f) => f.id !== playerId);
    const pick = pool[Math.floor(Math.random() * pool.length)];
    setCpuId(pick.id);
    setHighlightId(pick.id);
  };

  const canFight = playerId && cpuId && specialIdxs.length === 2;
  const startFight = () => {
    if (!canFight) return;
    onFight({
      playerId,
      cpuId,
      difficulty,
      arenaIdx,
      playerSpecials: specialIdxs,
      cpuSpecials: (() => {
        const n = getFighter(cpuId).specials.length;
        const a = Math.floor(Math.random() * n);
        let b = Math.floor(Math.random() * n);
        if (b === a) b = (b + 1) % n;
        return [a, b];
      })(),
    });
  };

  const statBar = (label, v) => (
    <div className="flex items-center gap-2">
      <span className="w-16 text-[10px] font-bold tracking-wider text-white/60">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-red-500" style={{ width: `${v * 10}%` }} />
      </div>
      <span className="w-4 text-right text-[10px] font-bold text-white/70">{v}</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0a0a12] pb-40 text-white" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
      <div className="px-4">
        <div className="text-center">
          <h1 className="text-4xl font-black tracking-tight text-red-500" style={{ textShadow: '0 0 24px rgba(255,30,30,.5)' }}>KOMBAT ARENA</h1>
          <p className="mt-1 text-xs tracking-[0.3em] text-white/50">CHOOSE YOUR FIGHTER</p>
        </div>

        <div className="mt-4"><ModePills mode={mode} setMode={setMode} /></div>

        {/* preview */}
        <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-[#151524] to-[#0a0a12]">
          <div className="h-52"><PreviewCanvas fighterId={highlightId} /></div>
          <div className="px-4 pb-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-xl font-black text-amber-300">{highlight.name}</h2>
              <span className="text-[10px] font-bold tracking-widest text-white/40">{highlight.franchise.toUpperCase()}</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
              {statBar('POWER', highlight.stats.power)}
              {statBar('SPEED', highlight.stats.speed)}
              {statBar('TOUGH', highlight.stats.toughness)}
              {statBar('RANGE', highlight.stats.range)}
            </div>
            <p className="mt-2 text-[11px] text-white/50"><span className="font-black text-red-400">FATALITY:</span> {highlight.fatality.name}</p>
          </div>
        </div>

        {/* pick mode tabs */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          <button
            onClick={() => setPickMode('player')}
            className={`rounded-xl border-2 px-2 py-3 text-xs font-black tracking-wide ${pickMode === 'player' ? 'border-amber-300 bg-amber-400/15 text-amber-200' : 'border-white/10 bg-white/5 text-white/50'}`}
          >1 · YOUR FIGHTER{player ? ` ✓` : ''}</button>
          <button
            onClick={() => setPickMode('cpu')}
            className={`rounded-xl border-2 px-2 py-3 text-xs font-black tracking-wide ${pickMode === 'cpu' ? 'border-red-400 bg-red-500/15 text-red-200' : 'border-white/10 bg-white/5 text-white/50'}`}
          >2 · OPPONENT{cpuId ? ` ✓` : ''}</button>
          <button
            onClick={randomCpu}
            className="rounded-xl border-2 border-purple-400/60 bg-purple-500/15 px-2 py-3 text-xs font-black tracking-wide text-purple-200"
          >🎲 RANDOM</button>
        </div>
        <p className="mt-2 text-center text-[11px] text-white/40">
          {pickMode === 'player' ? 'Tap a fighter to choose yours — then pick your opponent.' : 'Tap a fighter for the CPU — or hit random.'}
        </p>

        {/* roster grid */}
        {FRANCHISES.map((fr) => (
          <div key={fr} className="mt-4">
            <h3 className="mb-2 text-[11px] font-black tracking-[0.25em] text-white/40">{fr.toUpperCase()}</h3>
            <div className="grid grid-cols-3 gap-1.5">
              {FIGHTERS.filter((f) => f.franchise === fr).map((f) => {
                const isP = f.id === playerId;
                const isC = f.id === cpuId;
                return (
                  <button
                    key={f.id}
                    onClick={() => tapFighter(f.id)}
                    className={`rounded-lg border-2 px-1 py-2.5 text-[11px] font-bold leading-tight transition-colors ${
                      isP ? 'border-amber-300 bg-amber-400/20 text-amber-100'
                      : isC ? 'border-red-400 bg-red-500/20 text-red-100'
                      : f.id === highlightId ? 'border-white/40 bg-white/10 text-white'
                      : 'border-white/10 bg-white/5 text-white/70'
                    }`}
                  >{f.name}</button>
                );
              })}
            </div>
          </div>
        ))}

        {/* difficulty */}
        <h3 className="mb-2 mt-6 text-[11px] font-black tracking-[0.25em] text-white/40">DIFFICULTY</h3>
        <div className="grid grid-cols-3 gap-2">
          {DIFFS.map((d) => (
            <button
              key={d.id}
              onClick={() => setDifficulty(d.id)}
              className={`rounded-xl border-2 px-2 py-3 ${difficulty === d.id ? 'border-amber-300 bg-amber-400/15' : 'border-white/10 bg-white/5'}`}
            >
              <div className={`text-sm font-black ${difficulty === d.id ? 'text-amber-200' : 'text-white/70'}`}>{d.label}</div>
              <div className="mt-0.5 text-[10px] text-white/40">{d.desc}</div>
            </button>
          ))}
        </div>

        {/* arena — horizontal scroll row for the 8 franchise stages */}
        <h3 className="mb-2 mt-6 text-[11px] font-black tracking-[0.25em] text-white/40">ARENA</h3>
        <div className="flex gap-2 overflow-x-auto pb-2" style={{ WebkitOverflowScrolling: 'touch' }}>
          {ARENA_META.map((a, i) => (
            <button
              key={a.name}
              onClick={() => setArenaIdx(i)}
              className={`min-w-[150px] flex-1 rounded-xl border-2 px-3 py-3 text-left ${arenaIdx === i ? 'border-cyan-300 bg-cyan-400/15' : 'border-white/10 bg-white/5'}`}
            >
              <div className={`text-sm font-black ${arenaIdx === i ? 'text-cyan-200' : 'text-white/70'}`}>{a.name}</div>
              <div className="text-[10px] text-white/40">{a.tag}</div>
              <div className="mt-1 text-[9px] font-bold uppercase tracking-widest text-white/30">{a.franchise}</div>
            </button>
          ))}
        </div>

        {/* specials */}
        {player ? (
          <>
            <h3 className="mb-2 mt-6 text-[11px] font-black tracking-[0.25em] text-white/40">YOUR SPECIAL MOVES — PICK 2</h3>
            <div className="grid grid-cols-1 gap-2">
              {player.specials.map((s, i) => {
                const on = specialIdxs.includes(i);
                return (
                  <button
                    key={i}
                    onClick={() => toggleSpecial(i)}
                    className={`rounded-xl border-2 px-3 py-2.5 text-left ${on ? 'border-purple-300 bg-purple-500/20' : 'border-white/10 bg-white/5'}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-black ${on ? 'text-purple-200' : 'text-white/70'}`}>{on ? '✓ ' : ''}{s.name}</span>
                      <span className="text-[10px] font-bold text-white/40">DMG {s.damage} · CD {s.cooldown}s</span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-white/45">{s.effect}</div>
                  </button>
                );
              })}
            </div>
          </>
        ) : null}
      </div>

      {/* fight bar */}
      <div
        className="fixed inset-x-0 bottom-0 border-t border-white/10 bg-[#0a0a12]/95 px-4 backdrop-blur"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))', paddingTop: '0.75rem' }}
      >
        <div className="mb-2 flex items-center justify-between text-[11px] font-bold text-white/60">
          <span className="truncate text-amber-300">{player ? player.name : '— pick your fighter —'}</span>
          <span className="mx-2 text-white/30">VS</span>
          <span className="truncate text-red-300">{cpuId ? getFighter(cpuId).name : '— pick opponent —'}</span>
        </div>
        <button
          onClick={startFight}
          disabled={!canFight}
          className={`w-full rounded-2xl py-4 text-xl font-black tracking-[0.2em] transition-all ${
            canFight ? 'bg-gradient-to-b from-red-500 to-red-700 text-white shadow-[0_0_30px_rgba(255,30,30,.45)] active:scale-[0.98]'
            : 'cursor-not-allowed bg-white/10 text-white/30'
          }`}
          style={{ touchAction: 'manipulation' }}
        >FIGHT!</button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Mode pills: DUEL vs BRAWL
// ------------------------------------------------------------------
function ModePills({ mode, setMode }) {
  const pill = (id, label, sub, active) => (
    <button
      key={id}
      onClick={() => setMode(id)}
      className={`rounded-xl border-2 px-2 py-3 ${active ? 'border-red-400 bg-red-500/15' : 'border-white/10 bg-white/5'}`}
      style={{ touchAction: 'manipulation' }}
    >
      <div className={`text-sm font-black tracking-widest ${active ? 'text-red-200' : 'text-white/60'}`}>{label}</div>
      <div className="mt-0.5 text-[10px] text-white/40">{sub}</div>
    </button>
  );
  return (
    <div className="mb-4 grid grid-cols-2 gap-2">
      {pill('duel', '⚔️ DUEL', '1 vs 1 · best of 3', mode === 'duel')}
      {pill('brawl', '💥 BRAWL', '2–16 fighters · free-for-all', mode === 'brawl')}
    </div>
  );
}

// ------------------------------------------------------------------
// Brawl setup: pick your fighter, fighter count, rounds, difficulty, arena
// ------------------------------------------------------------------
function BrawlSetupScreen({ mode, setMode, onFight }) {
  const [playerId, setPlayerId] = useState(null);
  const [highlightId, setHighlightId] = useState(FIGHTERS[0].id);
  const [count, setCount] = useState(8);
  const [bestOf, setBestOf] = useState(5);
  const [difficulty, setDifficulty] = useState('normal');
  const [arenaIdx, setArenaIdx] = useState(0);
  const [specialIdxs, setSpecialIdxs] = useState([0, 1]);

  const highlight = getFighter(highlightId);
  const player = playerId ? getFighter(playerId) : null;

  const tapFighter = (id) => {
    setHighlightId(id);
    setPlayerId(id);
    setSpecialIdxs([0, 1]);
  };

  const toggleSpecial = (i) => {
    setSpecialIdxs((prev) => {
      if (prev.includes(i)) return prev.length > 1 ? prev.filter((x) => x !== i) : prev;
      if (prev.length >= 2) return [prev[1], i];
      return [...prev, i];
    });
  };

  const startFight = () => {
    if (!playerId || specialIdxs.length !== 2) return;
    const pool = FIGHTERS.filter((f) => f.id !== playerId);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const cpuIds = pool.slice(0, count - 1).map((f) => f.id);
    const cpuSpecials = cpuIds.map((id) => {
      const n = getFighter(id).specials.length;
      const a = Math.floor(Math.random() * n);
      let b = Math.floor(Math.random() * n);
      if (b === a) b = (b + 1) % n;
      return [a, b];
    });
    onFight({
      mode: 'brawl',
      playerId,
      cpuIds,
      difficulty,
      arenaIdx,
      bestOf,
      playerSpecials: specialIdxs,
      cpuSpecials,
    });
  };

  const statBar = (label, v) => (
    <div className="flex items-center gap-2">
      <span className="w-16 text-[10px] font-bold tracking-wider text-white/60">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-red-500" style={{ width: `${v * 10}%` }} />
      </div>
      <span className="w-4 text-right text-[10px] font-bold text-white/70">{v}</span>
    </div>
  );

  const canFight = playerId && specialIdxs.length === 2;

  return (
    <div className="min-h-screen bg-[#0a0a12] pb-40 text-white" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
      <div className="px-4">
        <div className="text-center">
          <h1 className="text-4xl font-black tracking-tight text-red-500" style={{ textShadow: '0 0 24px rgba(255,30,30,.5)' }}>KOMBAT ARENA</h1>
          <p className="mt-1 text-xs tracking-[0.3em] text-white/50">BRAWL MODE · EVERY FIGHTER FOR THEMSELVES</p>
        </div>

        <div className="mt-4"><ModePills mode={mode} setMode={setMode} /></div>

        {/* preview */}
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-[#151524] to-[#0a0a12]">
          <div className="h-52"><PreviewCanvas fighterId={highlightId} /></div>
          <div className="px-4 pb-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-xl font-black text-amber-300">{highlight.name}</h2>
              <span className="text-[10px] font-bold tracking-widest text-white/40">{highlight.franchise.toUpperCase()}</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
              {statBar('POWER', highlight.stats.power)}
              {statBar('SPEED', highlight.stats.speed)}
              {statBar('TOUGH', highlight.stats.toughness)}
              {statBar('RANGE', highlight.stats.range)}
            </div>
            <p className="mt-2 text-[11px] text-white/50"><span className="font-black text-red-400">FATALITY:</span> {highlight.fatality.name}</p>
          </div>
        </div>

        <p className="mt-3 text-center text-[11px] text-white/40">Tap a fighter to choose yours — the arena fills the rest.</p>

        {/* roster grid */}
        {FRANCHISES.map((fr) => (
          <div key={fr} className="mt-4">
            <h3 className="mb-2 text-[11px] font-black tracking-[0.25em] text-white/40">{fr.toUpperCase()}</h3>
            <div className="grid grid-cols-3 gap-1.5">
              {FIGHTERS.filter((f) => f.franchise === fr).map((f) => {
                const isP = f.id === playerId;
                return (
                  <button
                    key={f.id}
                    onClick={() => tapFighter(f.id)}
                    className={`rounded-lg border-2 px-1 py-2.5 text-[11px] font-bold leading-tight transition-colors ${
                      isP ? 'border-amber-300 bg-amber-400/20 text-amber-100'
                      : f.id === highlightId ? 'border-white/40 bg-white/10 text-white'
                      : 'border-white/10 bg-white/5 text-white/70'
                    }`}
                  >{f.name}</button>
                );
              })}
            </div>
          </div>
        ))}

        {/* fighter count */}
        <h3 className="mb-2 mt-6 text-[11px] font-black tracking-[0.25em] text-white/40">FIGHTERS IN THE ARENA</h3>
        <div className="grid grid-cols-4 gap-2">
          {BRAWL_COUNTS.map((n) => (
            <button
              key={n}
              onClick={() => setCount(n)}
              className={`rounded-xl border-2 px-2 py-3 ${count === n ? 'border-red-400 bg-red-500/15' : 'border-white/10 bg-white/5'}`}
              style={{ touchAction: 'manipulation' }}
            >
              <div className={`text-xl font-black ${count === n ? 'text-red-200' : 'text-white/70'}`}>{n}</div>
              <div className="text-[9px] text-white/40">you + {n - 1} CPU</div>
            </button>
          ))}
        </div>

        {/* rounds */}
        <h3 className="mb-2 mt-6 text-[11px] font-black tracking-[0.25em] text-white/40">ROUNDS</h3>
        <div className="grid grid-cols-3 gap-2">
          {BRAWL_BEST_OF.map((b) => (
            <button
              key={b}
              onClick={() => setBestOf(b)}
              className={`rounded-xl border-2 px-2 py-3 ${bestOf === b ? 'border-amber-300 bg-amber-400/15' : 'border-white/10 bg-white/5'}`}
              style={{ touchAction: 'manipulation' }}
            >
              <div className={`text-sm font-black ${bestOf === b ? 'text-amber-200' : 'text-white/70'}`}>BEST OF {b}</div>
              <div className="mt-0.5 text-[10px] text-white/40">first to {Math.ceil(b / 2)}</div>
            </button>
          ))}
        </div>

        {/* difficulty */}
        <h3 className="mb-2 mt-6 text-[11px] font-black tracking-[0.25em] text-white/40">DIFFICULTY</h3>
        <div className="grid grid-cols-3 gap-2">
          {DIFFS.map((d) => (
            <button
              key={d.id}
              onClick={() => setDifficulty(d.id)}
              className={`rounded-xl border-2 px-2 py-3 ${difficulty === d.id ? 'border-amber-300 bg-amber-400/15' : 'border-white/10 bg-white/5'}`}
              style={{ touchAction: 'manipulation' }}
            >
              <div className={`text-sm font-black ${difficulty === d.id ? 'text-amber-200' : 'text-white/70'}`}>{d.label}</div>
              <div className="mt-0.5 text-[10px] text-white/40">{d.desc}</div>
            </button>
          ))}
        </div>

        {/* arena */}
        <h3 className="mb-2 mt-6 text-[11px] font-black tracking-[0.25em] text-white/40">ARENA · TRUE 3D</h3>
        <div className="flex gap-2 overflow-x-auto pb-2" style={{ WebkitOverflowScrolling: 'touch' }}>
          {ARENA_META.map((a, i) => (
            <button
              key={a.name}
              onClick={() => setArenaIdx(i)}
              className={`min-w-[150px] flex-1 rounded-xl border-2 px-3 py-3 text-left ${arenaIdx === i ? 'border-cyan-300 bg-cyan-400/15' : 'border-white/10 bg-white/5'}`}
              style={{ touchAction: 'manipulation' }}
            >
              <div className={`text-sm font-black ${arenaIdx === i ? 'text-cyan-200' : 'text-white/70'}`}>{a.name}</div>
              <div className="text-[10px] text-white/40">{a.tag}</div>
              <div className="mt-1 text-[9px] font-bold uppercase tracking-widest text-white/30">{a.franchise}</div>
            </button>
          ))}
        </div>

        {/* specials */}
        {player ? (
          <>
            <h3 className="mb-2 mt-6 text-[11px] font-black tracking-[0.25em] text-white/40">YOUR SPECIAL MOVES — PICK 2</h3>
            <div className="grid grid-cols-1 gap-2">
              {player.specials.map((s, i) => {
                const on = specialIdxs.includes(i);
                return (
                  <button
                    key={i}
                    onClick={() => toggleSpecial(i)}
                    className={`rounded-xl border-2 px-3 py-2.5 text-left ${on ? 'border-purple-300 bg-purple-500/20' : 'border-white/10 bg-white/5'}`}
                    style={{ touchAction: 'manipulation' }}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-black ${on ? 'text-purple-200' : 'text-white/70'}`}>{on ? '✓ ' : ''}{s.name}</span>
                      <span className="text-[10px] font-bold text-white/40">DMG {s.damage} · CD {s.cooldown}s</span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-white/45">{s.effect}</div>
                  </button>
                );
              })}
            </div>
          </>
        ) : null}
      </div>

      {/* fight bar */}
      <div
        className="fixed inset-x-0 bottom-0 border-t border-white/10 bg-[#0a0a12]/95 px-4 backdrop-blur"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))', paddingTop: '0.75rem' }}
      >
        <div className="mb-2 flex items-center justify-between text-[11px] font-bold text-white/60">
          <span className="truncate text-amber-300">{player ? player.name : '— pick your fighter —'}</span>
          <span className="mx-2 shrink-0 text-white/30">{count} FIGHTERS · BO{bestOf}</span>
        </div>
        <button
          onClick={startFight}
          disabled={!canFight}
          className={`w-full rounded-2xl py-4 text-xl font-black tracking-[0.2em] transition-all ${
            canFight ? 'bg-gradient-to-b from-red-500 to-red-700 text-white shadow-[0_0_30px_rgba(255,30,30,.45)] active:scale-[0.98]'
            : 'cursor-not-allowed bg-white/10 text-white/30'
          }`}
          style={{ touchAction: 'manipulation' }}
        >BRAWL!</button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Brawl fight screen: canvas + HUD + 2D touch controls
// ------------------------------------------------------------------
function BrawlFightScreen({ config, onExit }) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const rootRef = useRef(null);
  const joyRef = useRef(null);
  const knobRef = useRef(null);
  const touchGuard = useRef(0);
  const [hud, setHud] = useState({
    hp: 1, alive: 1, total: 1, time: 75, round: 1, bestOf: 3, winsNeeded: 2,
    playerRounds: 0, playerName: '', targetName: '', eliminated: false,
    sp1cd: 0, sp2cd: 0, phase: 'intro',
  });
  const [banner, setBanner] = useState({ text: '', sub: '', key: 0 });
  const [combo, setCombo] = useState(null);
  const [finishHim, setFinishHim] = useState({ active: false, seconds: 0, mine: false });
  const [fatalityName, setFatalityName] = useState('');
  const bannerTimer = useRef(null);
  const comboTimer = useRef(null);
  const fatalityTimer = useRef(null);

  const showBanner = useCallback((text, sub) => {
    setBanner((b) => ({ text, sub, key: b.key + 1 }));
    clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => setBanner((b) => ({ ...b, text: '' })), 2600);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = createBrawlEngine(canvas, {
      playerId: config.playerId,
      cpuIds: config.cpuIds,
      difficulty: config.difficulty,
      playerSpecials: config.playerSpecials,
      cpuSpecials: config.cpuSpecials,
      arena: config.arenaIdx,
      bestOf: config.bestOf,
      hooks: {
        onHud: (h) => setHud(h),
        onAnnounce: (text, sub) => showBanner(text, sub || ''),
        onFinishHim: (active, seconds, mine) => setFinishHim({ active, seconds, mine: !!mine }),
        onFatality: (name) => {
          setFatalityName(name);
          clearTimeout(fatalityTimer.current);
          fatalityTimer.current = setTimeout(() => setFatalityName(''), 3400);
        },
        onCombo: (side, count) => {
          setCombo({ side, count, key: Date.now() });
          clearTimeout(comboTimer.current);
          comboTimer.current = setTimeout(() => setCombo(null), 1200);
        },
        onMatchEnd: (result) => onExit(result),
      },
    });
    engineRef.current = engine;
    engine.start();
    return () => {
      engine.dispose();
      engineRef.current = null;
      clearTimeout(bannerTimer.current);
      clearTimeout(comboTimer.current);
      clearTimeout(fatalityTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // non-passive touch handling: drags never scroll
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const prevent = (e) => { e.preventDefault(); };
    root.addEventListener('touchmove', prevent, { passive: false });
    root.addEventListener('touchstart', prevent, { passive: false });
    return () => {
      root.removeEventListener('touchmove', prevent);
      root.removeEventListener('touchstart', prevent);
    };
  }, []);

  // joystick: 2D tracking (screen space) -> engine maps to world XZ
  useEffect(() => {
    const zone = joyRef.current;
    if (!zone) return;
    let touchId = null;
    let startX = 0, startY = 0;
    const knob = knobRef.current;
    const setKnob = (dx, dy) => {
      if (knob) {
        const cx = Math.max(-30, Math.min(30, dx));
        const cy = Math.max(-30, Math.min(30, dy));
        knob.style.transform = `translate(${cx}px, ${cy}px)`;
      }
    };
    const onStart = (e) => {
      const t = e.changedTouches[0];
      touchId = t.identifier;
      startX = t.clientX; startY = t.clientY;
      setKnob(0, 0);
    };
    const onMove = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== touchId) continue;
        const dx = t.clientX - startX;
        const dy = t.clientY - startY;
        engineRef.current?.setMove(dx / 45, dy / 45);
        setKnob(dx, dy);
      }
    };
    const onEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== touchId) continue;
        touchId = null;
        engineRef.current?.setMove(0, 0);
        setKnob(0, 0);
      }
    };
    zone.addEventListener('touchstart', onStart, { passive: true });
    zone.addEventListener('touchmove', onMove, { passive: true });
    zone.addEventListener('touchend', onEnd, { passive: true });
    zone.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      zone.removeEventListener('touchstart', onStart);
      zone.removeEventListener('touchmove', onMove);
      zone.removeEventListener('touchend', onEnd);
      zone.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  // desktop keyboard fallback (WASD/arrows move in screen space)
  useEffect(() => {
    const held = new Set();
    const applyMove = () => {
      const x = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0);
      const y = (held.has('down') ? 1 : 0) - (held.has('up') ? 1 : 0);
      engineRef.current?.setMove(x, y);
    };
    const onKeyDown = (e) => {
      if (e.repeat) return;
      const eng = engineRef.current;
      if (!eng) return;
      switch (e.code) {
        case 'KeyA': case 'ArrowLeft': held.add('left'); applyMove(); break;
        case 'KeyD': case 'ArrowRight': held.add('right'); applyMove(); break;
        case 'KeyW': case 'ArrowUp': held.add('up'); applyMove(); break;
        case 'KeyS': case 'ArrowDown': held.add('down'); applyMove(); break;
        case 'KeyJ': eng.press('light'); break;
        case 'KeyK': eng.press('heavy'); break;
        case 'KeyL': eng.setBlock(true); break;
        case 'KeyU': eng.press('sp1'); break;
        case 'KeyI': eng.press('sp2'); break;
        case 'ShiftLeft': case 'ShiftRight': eng.press('dash'); break;
        case 'Space': eng.press('jump'); break;
        case 'KeyF': eng.press('fatality'); break;
        default: break;
      }
    };
    const onKeyUp = (e) => {
      switch (e.code) {
        case 'KeyA': case 'ArrowLeft': held.delete('left'); applyMove(); break;
        case 'KeyD': case 'ArrowRight': held.delete('right'); applyMove(); break;
        case 'KeyW': case 'ArrowUp': held.delete('up'); applyMove(); break;
        case 'KeyS': case 'ArrowDown': held.delete('down'); applyMove(); break;
        case 'KeyL': engineRef.current?.setBlock(false); break;
        default: break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  const pressStart = (fn) => (e) => {
    e.preventDefault();
    touchGuard.current = Date.now();
    fn();
  };
  const mouseDown = (fn) => () => {
    if (Date.now() - touchGuard.current > 600) fn();
  };

  const sp = [config.playerSpecials[0], config.playerSpecials[1]].map((i) => getFighter(config.playerId)?.specials[i]);

  const btnBase =
    'flex flex-col items-center justify-center rounded-full font-black text-white select-none ' +
    'active:scale-95 transition-transform border-2 shadow-lg';
  const cdStyle = (frac, color) =>
    frac > 0
      ? { background: `conic-gradient(rgba(0,0,0,0.72) ${Math.round(frac * 360)}deg, ${color} 0deg)` }
      : { background: color };

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 overflow-hidden bg-black"
      style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <style>{`
        @keyframes kombat-slam {
          0% { transform: scale(2.6) rotate(-4deg); opacity: 0; }
          14% { transform: scale(1) rotate(0deg); opacity: 1; }
          78% { transform: scale(1); opacity: 1; }
          100% { transform: scale(0.92); opacity: 0; }
        }
        @keyframes kombat-flicker {
          0%, 100% { opacity: 1; } 50% { opacity: 0.55; }
        }
        .kombat-banner { animation: kombat-slam 2.6s ease-out forwards; }
        .kombat-flicker { animation: kombat-flicker 0.5s linear infinite; }
        @keyframes kombat-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }
        .kombat-pulse { animation: kombat-pulse 0.9s ease-in-out infinite; }
        .kombat-outline {
          text-shadow: 0 2px 0 #000, 0 -2px 0 #000, 2px 0 0 #000, -2px 0 0 #000,
            0 0 22px rgba(255, 30, 30, 0.75);
        }
      `}</style>

      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* HUD */}
      <div
        className="absolute left-0 right-0 top-0 px-3"
        style={{ paddingTop: 'max(0.6rem, env(safe-area-inset-top))' }}
      >
        <div className="flex items-start gap-2">
          {/* player */}
          <div className="flex-1">
            <div className="mb-1 flex items-end justify-between">
              <span className="truncate text-[11px] font-black tracking-wide text-amber-300">{hud.playerName}</span>
              <span className="text-[11px] text-amber-300">{'●'.repeat(hud.playerRounds)}{'○'.repeat(Math.max(0, hud.winsNeeded - hud.playerRounds))}</span>
            </div>
            <div className="h-4 -skew-x-12 overflow-hidden rounded-sm border border-amber-200/40 bg-red-950">
              <div className="h-full bg-gradient-to-b from-lime-300 to-lime-600 transition-[width] duration-150" style={{ width: `${hud.hp * 100}%`, marginLeft: 'auto' }} />
            </div>
          </div>
          {/* timer */}
          <div className="flex w-14 shrink-0 flex-col items-center">
            <div className="flex h-11 w-11 rotate-45 items-center justify-center border-2 border-amber-200/60 bg-black/70">
              <span className="-rotate-45 text-lg font-black text-white">{hud.time}</span>
            </div>
            <span className="mt-1 text-[10px] font-bold tracking-widest text-white/70">R{hud.round}</span>
          </div>
          {/* alive count */}
          <div className="flex flex-1 flex-col items-end">
            <span className="text-[11px] font-black tracking-wide text-red-300">ALIVE {hud.alive}/{hud.total}</span>
            <span className="mt-1 text-[10px] font-bold tracking-widest text-white/50">BEST OF {hud.bestOf}</span>
          </div>
        </div>
        {hud.targetName && !hud.eliminated ? (
          <div className="mt-1 text-center text-[11px] font-bold tracking-widest text-amber-200/90">🎯 {hud.targetName}</div>
        ) : null}
        {hud.eliminated ? (
          <div className="mt-1 text-center text-[11px] font-black tracking-[0.25em] text-red-400">ELIMINATED — SPECTATING</div>
        ) : null}
        <div className="mt-1 flex justify-end">
          <button
            aria-label="Quit fight"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/30 bg-black/60 text-sm text-white/80"
            style={{ touchAction: 'none' }}
            onTouchStart={pressStart(() => onExit(null))}
            onMouseDown={mouseDown(() => onExit(null))}
          >✕</button>
        </div>
      </div>

      {/* announcer banner */}
      {banner.text ? (
        <div key={banner.key} className="pointer-events-none absolute inset-x-0 top-[30%] flex flex-col items-center">
          <div className="kombat-banner kombat-outline px-4 text-center text-5xl font-black tracking-tight text-red-500 sm:text-6xl">
            {banner.text}
          </div>
          {banner.sub ? (
            <div className="kombat-banner mt-2 px-4 text-center text-sm font-bold tracking-widest text-amber-200" style={{ animationDelay: '0.12s' }}>
              {banner.sub}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* combo counter */}
      {combo ? (
        <div key={combo.key} className="pointer-events-none absolute left-4 top-[24%]">
          <div className="kombat-flicker text-2xl font-black text-amber-300 kombat-outline">{combo.count}-HIT COMBO</div>
        </div>
      ) : null}

      {/* FINISH HIM overlay */}
      {finishHim.active ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center bg-red-950/25">
          <div className="kombat-outline text-6xl font-black tracking-tight text-red-500 kombat-pulse">FINISH HIM!</div>
          <div className="mt-2 text-4xl font-black text-white">{finishHim.seconds}</div>
        </div>
      ) : null}

      {/* fatality cinematic card */}
      {fatalityName ? (
        <div className="pointer-events-none absolute inset-x-0 top-[38%] flex flex-col items-center bg-gradient-to-b from-transparent via-red-950/70 to-transparent py-6">
          <div className="kombat-outline text-6xl font-black tracking-tight text-red-500 kombat-slam">FATALITY!</div>
          <div className="mt-3 max-w-[90%] text-center text-lg font-black tracking-wide text-amber-200">{fatalityName}</div>
        </div>
      ) : null}

      {/* controls */}
      <div
        className="absolute inset-x-0 bottom-0 flex items-end justify-between px-3"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        {/* joystick (2D) */}
        <div
          ref={joyRef}
          className="relative flex h-36 w-36 items-center justify-center rounded-full border-2 border-white/25 bg-white/5"
          style={{ touchAction: 'none' }}
          aria-label="Move"
        >
          <div className="absolute text-[10px] font-bold tracking-widest text-white/40">MOVE</div>
          <div ref={knobRef} className="h-16 w-16 rounded-full border-2 border-amber-200/60 bg-amber-400/30 shadow-lg" />
        </div>

        {/* buttons */}
        <div className="flex flex-col items-end gap-2">
          {finishHim.active && finishHim.mine ? (
            <button
              className={`${btnBase} kombat-pulse h-20 w-20 border-red-300 bg-red-600 text-sm`}
              style={{ touchAction: 'none' }}
              onTouchStart={pressStart(() => engineRef.current?.press('fatality'))}
              onMouseDown={mouseDown(() => engineRef.current?.press('fatality'))}
            >FATALITY</button>
          ) : null}
          <div className="flex gap-2">
            <button
              aria-label="Punch"
              className={`${btnBase} h-16 w-16 border-orange-300 bg-orange-600 text-[11px]`}
              style={{ touchAction: 'none' }}
              onTouchStart={pressStart(() => engineRef.current?.press('light'))}
              onMouseDown={mouseDown(() => engineRef.current?.press('light'))}
            >PUNCH</button>
            <button
              aria-label="Kick"
              className={`${btnBase} h-16 w-16 border-red-300 bg-red-700 text-[11px]`}
              style={{ touchAction: 'none' }}
              onTouchStart={pressStart(() => engineRef.current?.press('heavy'))}
              onMouseDown={mouseDown(() => engineRef.current?.press('heavy'))}
            >KICK</button>
          </div>
          <div className="flex gap-2">
            <button
              aria-label="Special 1"
              title={sp[0]?.name}
              className={`${btnBase} relative h-14 w-14 overflow-hidden border-purple-300 text-[10px]`}
              style={{ touchAction: 'none', ...cdStyle(hud.sp1cd, '#7c3aed') }}
              onTouchStart={pressStart(() => engineRef.current?.press('sp1'))}
              onMouseDown={mouseDown(() => engineRef.current?.press('sp1'))}
            >
              <span className="relative z-10 leading-tight">SP1</span>
              <span className="relative z-10 max-w-[52px] truncate text-[8px] font-bold opacity-80">{sp[0]?.name}</span>
            </button>
            <button
              aria-label="Special 2"
              title={sp[1]?.name}
              className={`${btnBase} relative h-14 w-14 overflow-hidden border-purple-300 text-[10px]`}
              style={{ touchAction: 'none', ...cdStyle(hud.sp2cd, '#7c3aed') }}
              onTouchStart={pressStart(() => engineRef.current?.press('sp2'))}
              onMouseDown={mouseDown(() => engineRef.current?.press('sp2'))}
            >
              <span className="relative z-10 leading-tight">SP2</span>
              <span className="relative z-10 max-w-[52px] truncate text-[8px] font-bold opacity-80">{sp[1]?.name}</span>
            </button>
            <button
              aria-label="Block (hold)"
              className={`${btnBase} h-14 w-14 border-sky-300 bg-sky-700 text-[10px]`}
              style={{ touchAction: 'none' }}
              onTouchStart={pressStart(() => engineRef.current?.setBlock(true))}
              onTouchEnd={(e) => { e.preventDefault(); engineRef.current?.setBlock(false); }}
              onTouchCancel={() => engineRef.current?.setBlock(false)}
              onMouseDown={mouseDown(() => engineRef.current?.setBlock(true))}
              onMouseUp={mouseDown(() => engineRef.current?.setBlock(false))}
              onMouseLeave={() => engineRef.current?.setBlock(false)}
            >BLOCK</button>
            <button
              aria-label="Dash"
              className={`${btnBase} h-14 w-14 border-emerald-300 bg-emerald-700 text-[10px]`}
              style={{ touchAction: 'none' }}
              onTouchStart={pressStart(() => engineRef.current?.press('dash'))}
              onMouseDown={mouseDown(() => engineRef.current?.press('dash'))}
            >DASH</button>
            <button
              aria-label="Jump"
              className={`${btnBase} h-14 w-14 border-amber-300 bg-amber-600 text-[10px]`}
              style={{ touchAction: 'none' }}
              onTouchStart={pressStart(() => engineRef.current?.press('jump'))}
              onMouseDown={mouseDown(() => engineRef.current?.press('jump'))}
            >JUMP</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Page root: select -> versus -> fight -> result
// ------------------------------------------------------------------
export default function KombatPage() {
  const [mode, setMode] = useState('duel'); // duel | brawl
  const [phase, setPhase] = useState('select'); // select | versus | fight | result
  const [config, setConfig] = useState(null);
  const [result, setResult] = useState(null);
  const versusTimer = useRef(null);

  const beginFight = useCallback((cfg) => {
    setConfig(cfg);
    setResult(null);
    setPhase('versus');
    clearTimeout(versusTimer.current);
    versusTimer.current = setTimeout(() => setPhase('fight'), 1700);
  }, []);

  const handleExit = useCallback((res) => {
    clearTimeout(versusTimer.current);
    if (res) {
      setResult(res);
      setPhase('result');
    } else {
      setPhase('select');
    }
  }, []);

  useEffect(() => () => clearTimeout(versusTimer.current), []);

  if (phase === 'select') {
    return mode === 'brawl'
      ? <BrawlSetupScreen mode={mode} setMode={setMode} onFight={beginFight} />
      : <SelectScreen mode={mode} setMode={setMode} onFight={beginFight} />;
  }

  if (phase === 'versus' && config) {
    if (config.mode === 'brawl') {
      const p = getFighter(config.playerId);
      const arenaMeta = ARENA_META[config.arenaIdx];
      const homeTurf = p && arenaMeta && p.franchise === arenaMeta.franchise;
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a12] px-6 text-center text-white">
          <div className="text-sm font-black tracking-[0.35em] text-amber-300">{DIFFS.find((d) => d.id === config.difficulty)?.label}</div>
          <div className="mt-4 text-5xl font-black text-red-500" style={{ textShadow: '0 0 30px rgba(255,30,30,.6)' }}>BRAWL</div>
          <div className="mt-4 text-3xl font-black text-amber-200">{p.name}</div>
          <div className="mt-1 text-sm font-bold tracking-widest text-white/50">+ {config.cpuIds.length} CPU FIGHTERS</div>
          {homeTurf && (
            <div className="mt-2 inline-block rounded-full border border-emerald-400/60 bg-emerald-400/10 px-3 py-1 text-[10px] font-black tracking-[0.25em] text-emerald-300">
              HOME TURF
            </div>
          )}
          <div className="mt-6 text-xs tracking-[0.3em] text-white/40">{arenaMeta.name.toUpperCase()}</div>
          <div className="mt-2 text-[11px] text-white/30">Best of {config.bestOf} · 75 seconds · free-for-all</div>
        </div>
      );
    }
    const p = getFighter(config.playerId);
    const c = getFighter(config.cpuId);
    const arenaMeta = ARENA_META[config.arenaIdx];
    const homeTurf = p && arenaMeta && p.franchise === arenaMeta.franchise;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a12] px-6 text-center text-white">
        <div className="text-sm font-black tracking-[0.35em] text-amber-300">{DIFFS.find((d) => d.id === config.difficulty)?.label}</div>
        <div className="mt-4 text-3xl font-black text-amber-200">{p.name}</div>
        {homeTurf && (
          <div className="mt-2 inline-block rounded-full border border-emerald-400/60 bg-emerald-400/10 px-3 py-1 text-[10px] font-black tracking-[0.25em] text-emerald-300">
            HOME TURF
          </div>
        )}
        <div className="my-3 text-6xl font-black text-red-500" style={{ textShadow: '0 0 30px rgba(255,30,30,.6)' }}>VS</div>
        <div className="text-3xl font-black text-red-300">{c.name}</div>
        <div className="mt-6 text-xs tracking-[0.3em] text-white/40">{arenaMeta.name.toUpperCase()}</div>
        <div className="mt-2 text-[11px] text-white/30">Best of 3 · 60 seconds</div>
      </div>
    );
  }

  if (phase === 'fight' && config) {
    const key = config.mode === 'brawl'
      ? `brawl-${config.playerId}-${config.cpuIds.length}-${Date.now()}`
      : `${config.playerId}-${config.cpuId}-${Date.now()}`;
    return config.mode === 'brawl'
      ? <BrawlFightScreen key={key} config={config} onExit={handleExit} />
      : <FightScreen key={key} config={config} onExit={handleExit} />;
  }

  // result
  if (config?.mode === 'brawl') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a12] px-6 text-center text-white">
        {result ? (
          <>
            {result.fatality ? (
              <div className="text-5xl font-black text-red-500" style={{ textShadow: '0 0 30px rgba(255,30,30,.6)' }}>FATALITY!</div>
            ) : (
              <div className="text-5xl font-black text-red-500" style={{ textShadow: '0 0 30px rgba(255,30,30,.6)' }}>BRAWL KING</div>
            )}
            <div className="mt-4 text-3xl font-black">{result.championName}</div>
            <div className={`mt-1 text-sm font-bold tracking-widest ${result.isPlayer ? 'text-amber-300' : 'text-red-300'}`}>
              {result.isPlayer ? 'YOU WIN THE BRAWL' : 'CPU WINS THE BRAWL'}
            </div>
            <div className="mt-2 text-xs text-white/40">Your rounds {result.playerRounds} · Best of {result.bestOf}</div>
          </>
        ) : null}
        <div className="mt-8 grid w-full max-w-xs gap-2">
          <button
            onClick={() => beginFight(config)}
            className="rounded-2xl bg-gradient-to-b from-red-500 to-red-700 py-4 text-lg font-black tracking-widest text-white active:scale-[0.98]"
            style={{ touchAction: 'manipulation' }}
          >REMATCH</button>
          <button
            onClick={() => setPhase('select')}
            className="rounded-2xl border-2 border-white/20 bg-white/5 py-3.5 text-sm font-black tracking-widest text-white/80"
            style={{ touchAction: 'manipulation' }}
          >CHANGE SETUP</button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a12] px-6 text-center text-white">
      {result ? (
        <>
          {result.fatality ? (
            <div className="text-5xl font-black text-red-500" style={{ textShadow: '0 0 30px rgba(255,30,30,.6)' }}>FATALITY!</div>
          ) : null}
          {result.flawless && !result.fatality ? (
            <div className="text-4xl font-black text-amber-300">FLAWLESS VICTORY</div>
          ) : null}
          <div className="mt-4 text-3xl font-black">{result.winnerName}</div>
          <div className={`mt-1 text-sm font-bold tracking-widest ${result.isPlayer ? 'text-amber-300' : 'text-red-300'}`}>
            {result.isPlayer ? 'YOU WIN' : 'CPU WINS'}
          </div>
          <div className="mt-2 text-xs text-white/40">Rounds {result.p1Rounds} — {result.p2Rounds}</div>
        </>
      ) : null}
      <div className="mt-8 grid w-full max-w-xs gap-2">
        <button
          onClick={() => beginFight(config)}
          className="rounded-2xl bg-gradient-to-b from-red-500 to-red-700 py-4 text-lg font-black tracking-widest text-white active:scale-[0.98]"
          style={{ touchAction: 'manipulation' }}
        >REMATCH</button>
        <button
          onClick={() => setPhase('select')}
          className="rounded-2xl border-2 border-white/20 bg-white/5 py-3.5 text-sm font-black tracking-widest text-white/80"
          style={{ touchAction: 'manipulation' }}
        >CHANGE FIGHTERS</button>
      </div>
    </div>
  );
}
