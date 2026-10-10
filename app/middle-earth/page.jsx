'use client';

// MIDDLE-EARTH — open-world pocket universe. A tribute to J.R.R. Tolkien.
// Modes: menu | intro | world | tribute.
// world -> buildWorld(THREE, T, DATA, activeQuest): walk the whole journey
// west to east with beat detection (sequential checkpoints -> target)
// wired to data.js progress.

import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { buildWorld } from './world';
import * as T from './textures';
import * as DATA from './data';
import { createWalker, stepWalker, applyLook, walkerCamera } from '@/lib/world/walk-controls';
import { createKeyInput, attachDragLook } from '@/lib/world/walk-input';
import WalkJoystick from '@/components/world/WalkJoystick';

const BANNER_CLEAR = 'max(3.5rem, calc(env(safe-area-inset-top) + 3rem))';
const BOTTOM_CLEAR = 'max(1.5rem, calc(env(safe-area-inset-bottom) + 1rem))';
const GOLD = '#d8b25c';

const REGIONS = DATA.REGIONS || [];
const QUESTS = DATA.QUESTS || [];

function regionNameOf(x) {
  try {
    const r = DATA.regionOfX(x);
    if (r && r.name) return r.name;
  } catch { /* fall through */ }
  return '';
}

function regionBlurbOf(x) {
  try {
    const r = DATA.regionOfX(x);
    if (r && r.blurb) return r.blurb;
  } catch { /* fall through */ }
  return '';
}

function questDone(progress, id) {
  return !!(progress && progress.beatsDone && progress.beatsDone[id]);
}

function readProgress() {
  try {
    const p = DATA.loadProgress();
    return p || DATA.createProgress();
  } catch {
    return { beatsDone: {} };
  }
}

export default function MiddleEarthPage() {
  const canvasRef = useRef(null);
  const rendererRef = useRef(null); // created once per page lifetime
  const joyRef = useRef({ x: 0, y: 0 });
  const toastTimer = useRef(null);
  const regionRef = useRef(null);
  const beatOverlayRef = useRef(false);

  const [mode, setMode] = useState('menu'); // menu | intro | world | tribute
  const [questId, setQuestId] = useState(null);
  const [progress, setProgress] = useState(readProgress);
  const [toast, setToast] = useState('');
  const [beatState, setBeatState] = useState(null); // { reached, total }
  const [beatOverlay, setBeatOverlay] = useState(false);
  const [webglFail, setWebglFail] = useState(false);
  const [region, setRegion] = useState(() => ({
    name: regionNameOf(-262), blurb: regionBlurbOf(-262),
  }));

  const isTouch = typeof window !== 'undefined' && 'ontouchstart' in window;

  useEffect(() => { beatOverlayRef.current = beatOverlay; }, [beatOverlay]);

  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2600);
  }, []);

  const activeQuest = QUESTS.find((q) => q.id === questId) || null;
  const doneCount = QUESTS.filter((q) => questDone(progress, q.id)).length;
  const allDone = QUESTS.length > 0 && doneCount >= QUESTS.length;

  // ---------- menu actions ----------
  const nextIdx = QUESTS.findIndex((q, i) => {
    let unlocked = false;
    try { unlocked = DATA.isBeatUnlocked(progress, i); } catch { /* locked */ }
    return unlocked && !questDone(progress, q.id);
  });

  const beginJourney = useCallback(() => {
    if (nextIdx >= 0) {
      setBeatOverlay(false);
      setBeatState(null);
      setQuestId(QUESTS[nextIdx].id);
      setMode('intro');
    }
  }, [nextIdx]);

  const wander = useCallback(() => {
    setQuestId(null);
    setBeatOverlay(false);
    setBeatState(null);
    setMode('world');
  }, []);

  // ---------- one render loop, keyed by mode + quest ----------
  useEffect(() => {
    if (mode !== 'world') return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    let renderer = rendererRef.current;
    if (!renderer) {
      try {
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
      } catch (e) {
        setWebglFail(true);
        return;
      }
      rendererRef.current = renderer;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2500);
    camera.rotation.order = 'YXZ';

    const resize = () => {
      const w = canvas.clientWidth || window.innerWidth;
      const h = canvas.clientHeight || window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      renderer.setSize(w, h, false);
      renderer.setPixelRatio(dpr);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener('resize', resize);

    let raf = 0;
    let last = performance.now();
    let cleanup = null;

    const world = buildWorld(THREE, T, DATA, activeQuest);
    scene.add(world.group);
    scene.background = new THREE.Color(world.sky);
    scene.fog = new THREE.FogExp2(world.fog.color, world.fog.density);

    const detachers = [];
    const spawn = world.spawn || { x: -262, z: 44, yaw: -Math.PI / 2 };
    const walker = createWalker({ x: spawn.x, z: spawn.z, yaw: spawn.yaw || 0, pitch: 0 });
    const keys = createKeyInput();
    keys.attach();
    detachers.push(() => keys.detach());
    detachers.push(attachDragLook(canvas, {
      onLook: (dx, dy) => applyLook(walker, dx, dy),
    }));

    // ---------- beat detection: sequential checkpoints, then target ----------
    const q = activeQuest;
    const cps = (q && Array.isArray(q.checkpoints)) ? q.checkpoints : [];
    const tgt = q ? q.target : null;
    const total = cps.length + (tgt ? 1 : 0);
    setBeatState(q ? { reached: 0, total } : null);
    let reached = 0;
    let done = false;
    const isLast = !!q && QUESTS.indexOf(q) === QUESTS.length - 1;

    const complete = () => {
      if (done || cancelled || !q) return;
      done = true;
      let np = progress;
      try {
        np = DATA.completeBeat(progress, q.id);
        DATA.saveProgress(np);
      } catch { /* storage may be unavailable */ }
      setProgress(np);
      if (isLast) {
        setMode('tribute');
      } else {
        setBeatOverlay(true);
      }
    };

    const checkBeat = (x, z) => {
      if (done || !q) return;
      if (reached < cps.length) {
        const cp = cps[reached];
        if (Math.hypot(x - cp.x, z - cp.z) <= (cp.r || 6)) {
          if (world.beacon) world.beacon.markCheckpoint(reached);
          reached += 1;
          setBeatState({ reached, total });
          if (reached >= cps.length && !tgt) complete();
        }
        return;
      }
      if (tgt && Math.hypot(x - tgt.x, z - tgt.z) <= (tgt.r || 6)) {
        if (world.beacon) world.beacon.markTarget();
        setBeatState({ reached: total, total });
        complete();
      }
    };

    regionRef.current = null;

    const frame = (now) => {
      if (cancelled) return;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const t = now / 1000;

      const jump = keys.consumeJump();
      if (!beatOverlayRef.current) {
        stepWalker(walker, {
          fwd: keys.state.fwd + joyRef.current.y,
          strafe: keys.state.strafe + joyRef.current.x,
          sprint: keys.state.sprint, jump,
        }, dt, {
          groundHeight: world.groundHeight,
          colliders: world.colliders,
          bounds: world.bounds,
        });
      }
      const cam = walkerCamera(walker, {});
      camera.position.set(cam.x, cam.y, cam.z);
      camera.rotation.set(walker.pitch, walker.yaw, 0);
      checkBeat(walker.pos.x, walker.pos.z);

      const rn = regionNameOf(walker.pos.x);
      if (rn && rn !== regionRef.current) {
        if (regionRef.current) showToast('You have entered ' + rn);
        regionRef.current = rn;
        setRegion({ name: rn, blurb: regionBlurbOf(walker.pos.x) });
      }

      world.update(t, dt);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    cleanup = () => {
      detachers.forEach((d) => { try { d(); } catch (e) {} });
      try { world.dispose(); } catch (e) {}
      scene.remove(world.group);
    };

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      if (cleanup) cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, questId]);

  // ---------- derived view data ----------
  const questIdx = QUESTS.findIndex((q) => q.id === questId);
  const nextQuest = questIdx >= 0 ? QUESTS[questIdx + 1] : null;
  const introRegion = activeQuest
    ? REGIONS.find((r) => r.id === activeQuest.region)
    : null;

  const continueJourney = useCallback(() => {
    setBeatOverlay(false);
    if (nextQuest) {
      setQuestId(nextQuest.id);
      setMode('intro');
    } else {
      setQuestId(null);
    }
  }, [nextQuest]);

  const keepWandering = useCallback(() => {
    setBeatOverlay(false);
    setBeatState(null);
    setQuestId(null);
  }, []);

  const onJoy = useCallback((x, y) => { joyRef.current = { x, y }; }, []);

  return (
    <div style={styles.root}>
      <style>{'@keyframes meTributeFade { from { opacity: 0; } to { opacity: 1; } }'}</style>
      <canvas ref={canvasRef} style={styles.canvas} />

      {webglFail && (
        <div style={styles.overlay}>
          <div style={styles.panel}>
            <div style={styles.panelTitle}>3D isn't available on this device.</div>
          </div>
        </div>
      )}

      {/* ================= MENU ================= */}
      {mode === 'menu' && (
        <div style={styles.menu}>
          <div style={styles.menuInner}>
            <h1 style={styles.title}>Middle-earth</h1>
            <p style={styles.sub}>An open-world tribute · The journey west to east</p>
            <p style={styles.prog}>{doneCount} of {QUESTS.length} beats complete</p>
            {!allDone && (
              <button style={styles.btn} onClick={beginJourney}>Begin the journey</button>
            )}
            {allDone && (
              <button style={styles.btn} onClick={() => setMode('tribute')}>The tribute</button>
            )}
            <button style={{ ...styles.btn, ...styles.btnGhost }} onClick={wander}>Wander freely</button>
          </div>
        </div>
      )}

      {/* ================= INTRO ================= */}
      {mode === 'intro' && activeQuest && (
        <div style={styles.menu}>
          <div style={{ ...styles.menuInner, maxWidth: 520, textAlign: 'left' }}>
            {introRegion && <div style={styles.introRegion}>{introRegion.name}</div>}
            <h2 style={styles.introTitle}>{activeQuest.title}</h2>
            <p style={styles.introText}>{activeQuest.text}</p>
            <div style={styles.introObjective}>{activeQuest.objective}</div>
            <div style={styles.introRow}>
              <button style={styles.btn} onClick={() => setMode('world')}>Set out</button>
              <button style={{ ...styles.btn, ...styles.btnGhost }} onClick={() => setMode('menu')}>Back</button>
            </div>
          </div>
        </div>
      )}

      {/* ================= WORLD HUD ================= */}
      {mode === 'world' && (
        <div style={styles.hud}>
          <div style={styles.topBar}>
            <div>
              <div style={styles.regionName}>{region.name}</div>
              {region.blurb && <div style={styles.regionBlurb}>{region.blurb}</div>}
            </div>
            <button style={styles.smallBtn} onClick={() => setMode('menu')}>Leave</button>
          </div>

          <div style={styles.objective}>
            <div style={styles.objText}>
              {activeQuest ? activeQuest.objective : 'Wandering — the road goes ever on'}
            </div>
            {activeQuest && beatState && beatState.total > 0 && (
              <div style={styles.pips}>{beatState.reached} / {beatState.total}</div>
            )}
          </div>

          {isTouch && (
            <div style={styles.stickWrap}>
              <WalkJoystick onMove={onJoy} size={120} />
            </div>
          )}

          {/* beat complete */}
          {beatOverlay && activeQuest && (
            <div style={styles.overlay}>
              <div style={styles.panel}>
                <div style={styles.panelBeat}>Beat complete</div>
                <div style={styles.panelName}>{activeQuest.title}</div>
                <div style={styles.cardRow}>
                  <button style={styles.btn} onClick={continueJourney}>Continue the journey</button>
                  <button style={{ ...styles.btn, ...styles.btnGhost }} onClick={keepWandering}>Keep wandering</button>
                </div>
              </div>
            </div>
          )}

          {toast && <div style={styles.toast}>{toast}</div>}
        </div>
      )}

      {/* ================= TRIBUTE ================= */}
      {mode === 'tribute' && (
        <div style={styles.tribute}>
          <div style={styles.tributeInner}>
            <div style={styles.tributeText}>In tribute to J.R.R. Tolkien, who wrote for his son.</div>
            <button
              style={{ ...styles.btn, ...styles.btnGhost }}
              onClick={() => { setQuestId(null); setBeatOverlay(false); setBeatState(null); setMode('world'); }}
            >
              The road goes ever on — keep wandering
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  root: { position: 'fixed', inset: 0, background: '#05080a', overflow: 'hidden', color: '#eee' },
  canvas: { position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', touchAction: 'none' },
  hud: { position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 50 },
  // menu / intro
  menu: {
    position: 'absolute', inset: 0, zIndex: 60, display: 'flex',
    justifyContent: 'center', alignItems: 'center', padding: 24,
    background: 'radial-gradient(ellipse at 50% 30%, #0d1a12 0%, #05080a 60%, #000 100%)',
    overflowY: 'auto',
  },
  menuInner: { textAlign: 'center', maxWidth: 480, animation: 'meTributeFade 1.2s ease-out' },
  title: {
    fontSize: 'min(15vw, 64px)', fontWeight: 700, letterSpacing: 6, margin: '0 0 10px',
    color: GOLD, textShadow: '0 0 28px rgba(216,178,92,0.35)',
  },
  sub: { color: '#9fb4a8', fontSize: 14, letterSpacing: 2, margin: '0 0 16px' },
  prog: { color: '#6b7a70', fontSize: 13, letterSpacing: 1, margin: '0 0 28px' },
  btn: {
    display: 'inline-block', margin: '8px 6px 0', padding: '14px 30px',
    fontSize: 15, letterSpacing: 1, color: '#0a0c08', background: GOLD,
    border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700,
    pointerEvents: 'auto', minHeight: 48,
  },
  btnGhost: { background: 'transparent', color: GOLD, border: '1px solid ' + GOLD },
  smallBtn: {
    padding: '10px 18px', fontSize: 13, letterSpacing: 1, color: GOLD,
    background: 'rgba(8,12,10,0.55)', border: '1px solid rgba(216,178,92,0.5)',
    borderRadius: 8, cursor: 'pointer', pointerEvents: 'auto', minHeight: 44,
  },
  introRegion: { color: '#8fa598', fontSize: 12, letterSpacing: 4, marginBottom: 10, textTransform: 'uppercase' },
  introTitle: { color: GOLD, fontSize: 28, letterSpacing: 1, margin: '0 0 14px', fontWeight: 700 },
  introText: { color: '#cfd8d2', fontSize: 15, lineHeight: 1.9, margin: '0 0 18px' },
  introObjective: {
    color: GOLD, fontSize: 14, letterSpacing: 1, lineHeight: 1.6,
    borderLeft: '2px solid ' + GOLD, paddingLeft: 14, margin: '0 0 24px',
  },
  introRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  // world HUD
  topBar: {
    position: 'absolute', top: BANNER_CLEAR, left: 20, right: 20,
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    pointerEvents: 'none',
  },
  regionName: {
    color: '#fff', fontSize: 17, letterSpacing: 3, fontWeight: 700,
    textShadow: '0 0 12px rgba(0,0,0,0.9)',
  },
  regionBlurb: {
    color: '#8fa598', fontSize: 11, letterSpacing: 1, marginTop: 4, maxWidth: 220,
    textShadow: '0 0 8px rgba(0,0,0,0.9)',
  },
  objective: {
    position: 'absolute', top: 'calc(' + BANNER_CLEAR + ' + 46px)', left: '50%',
    transform: 'translateX(-50%)', textAlign: 'center', maxWidth: '88vw',
  },
  objText: {
    color: GOLD, fontSize: 13, letterSpacing: 1, lineHeight: 1.6,
    textShadow: '0 0 10px rgba(0,0,0,0.9)', background: 'rgba(5,8,6,0.55)',
    padding: '8px 16px', borderRadius: 10,
  },
  pips: { color: '#9fb4a8', fontSize: 12, letterSpacing: 3, marginTop: 6, textShadow: '0 0 8px rgba(0,0,0,0.9)' },
  stickWrap: {
    position: 'absolute', left: 20, bottom: BOTTOM_CLEAR, pointerEvents: 'auto',
  },
  toast: {
    position: 'absolute', left: '50%', bottom: 'calc(' + BOTTOM_CLEAR + ' + 170px)',
    transform: 'translateX(-50%)', background: 'rgba(8,12,10,0.9)',
    border: '1px solid rgba(216,178,92,0.4)', color: GOLD,
    padding: '10px 18px', borderRadius: 10, fontSize: 13, letterSpacing: 1,
    whiteSpace: 'nowrap', maxWidth: '92vw', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  overlay: {
    position: 'absolute', inset: 0, zIndex: 70, display: 'flex',
    justifyContent: 'center', alignItems: 'center', padding: 24,
    background: 'rgba(2,4,3,0.72)', pointerEvents: 'auto',
  },
  panel: {
    background: 'rgba(8,12,10,0.95)', border: '1px solid rgba(216,178,92,0.4)',
    borderRadius: 16, padding: 28, maxWidth: 460, width: '100%', textAlign: 'center',
  },
  panelName: { color: '#fff', fontSize: 22, fontWeight: 700, letterSpacing: 1, marginTop: 8 },
  panelBeat: { color: GOLD, fontSize: 15, letterSpacing: 2, fontWeight: 700, textTransform: 'uppercase' },
  panelTitle: { color: '#fff', fontSize: 18, letterSpacing: 1 },
  cardRow: { display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap', justifyContent: 'center' },
  // tribute
  tribute: {
    position: 'absolute', inset: 0, zIndex: 80, display: 'flex',
    justifyContent: 'center', alignItems: 'center', padding: 32, background: '#04060a',
  },
  tributeInner: { textAlign: 'center', maxWidth: 520, animation: 'meTributeFade 2.5s ease-out' },
  tributeText: {
    color: '#e8e2d2', fontSize: 20, lineHeight: 2, letterSpacing: 1, marginBottom: 36,
  },
};
