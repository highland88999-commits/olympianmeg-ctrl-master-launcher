'use client';

// STAR WARS — open-world galaxy pocket universe.
// Modes: menu | crawl | map | zone.
// map  -> galaxy.js spiral map (tap a planet to select, Travel to launch).
// zone -> buildZone(THREE, PLANETS[id], T): walk or fly per planet kind,
//         with beat detection (checkpoints -> target) wired to data.js progress.

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { guardCanvasContext } from '../../lib/scene-context-guard.js';
import { buildGalaxy } from './galaxy';
import { buildZone } from './zone';
import * as T from './textures';
import {
  CHAPTERS, PLANETS, createProgress, chapterIndexOf,
  isChapterUnlocked, isPlanetUnlocked, completeBeat, chapterBeatsDone,
  loadProgress, saveProgress,
} from './data';
import { createWalker, stepWalker, applyLook, walkerCamera } from '@/lib/world/walk-controls';
import { createKeyInput, attachDragLook } from '@/lib/world/walk-input';
import WalkJoystick from '@/components/world/WalkJoystick';

const BANNER_CLEAR = 'max(3.5rem, calc(env(safe-area-inset-top) + 3rem))';
const BOTTOM_CLEAR = 'max(1.5rem, calc(env(safe-area-inset-bottom) + 1rem))';
// The planet card floats well clear of the global Concourse Orb
// (bottom-right) so its buttons never hide behind it.
const CARD_CLEAR = 'max(7.5rem, calc(env(safe-area-inset-bottom) + 6.5rem))';

/* Deterministic CSS starfield + nebula wash for the DOM screens
 * (menu / crawl) — the canvas only renders in map and zone modes. */
function StarBackdrop() {
  const stars = useMemo(() => {
    let a = 987654321;
    const rnd = () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return Array.from({ length: 110 }, (_, i) => ({
      key: i,
      left: (rnd() * 100).toFixed(2) + '%',
      top: (rnd() * 100).toFixed(2) + '%',
      size: rnd() < 0.85 ? 1.5 : 2.6,
      delay: (rnd() * 5).toFixed(2) + 's',
      dur: (3 + rnd() * 4).toFixed(2) + 's',
    }));
  }, []);
  return (
    <div style={styles.starWrap} aria-hidden="true">
      <div style={{ ...styles.nebula, ...styles.nebulaA }} />
      <div style={{ ...styles.nebula, ...styles.nebulaB }} />
      {stars.map((s) => (
        <span key={s.key} style={{
          position: 'absolute', left: s.left, top: s.top,
          width: s.size, height: s.size, borderRadius: '50%',
          background: '#dfe8ff',
          animation: `swTwinkle ${s.dur} ease-in-out ${s.delay} infinite`,
        }} />
      ))}
    </div>
  );
}

// A beat counts as done. data.js stores it as progress.beatsDone[planetId].
function beatDone(progress, planetId) {
  if (!progress) return false;
  if (progress.beatsDone && progress.beatsDone[planetId]) return true;
  // fallbacks for other plausible shapes
  if (progress.beats && progress.beats[planetId]) return true;
  if (Array.isArray(progress.done) && progress.done.includes(planetId)) return true;
  return false;
}

const SAGA = (CHAPTERS || [])
  .flatMap((c) => c.planets || [])
  .filter((id) => PLANETS && PLANETS[id]);

export default function StarWarsPage() {
  const canvasRef = useRef(null);
  const rendererRef = useRef(null); // created once per page lifetime
  const contextGuardRef = useRef(null); // one context-loss guard for that renderer
  const joyRef = useRef({ x: 0, y: 0 });
  const toastTimer = useRef(null);
  const introRef = useRef(false);

  const [mode, setMode] = useState('menu'); // menu | crawl | map | zone
  const [planetId, setPlanetId] = useState(null);
  const [progress, setProgress] = useState(() => {
    try {
      const p = loadProgress();
      return p || createProgress();
    } catch {
      return createProgress();
    }
  });
  const [selectedId, setSelectedId] = useState(null);
  const [toast, setToast] = useState('');
  const [intro, setIntro] = useState(false);
  const [beatState, setBeatState] = useState(null); // { reached, total }
  const [beatOverlay, setBeatOverlay] = useState(false);
  const [webglFail, setWebglFail] = useState(false);
  const [crawlIdx, setCrawlIdx] = useState(0);

  const isTouch = typeof window !== 'undefined' && 'ontouchstart' in window;

  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2600);
  }, []);

  useEffect(() => { introRef.current = intro; }, [intro]);

  const doneCount = SAGA.filter((id) => beatDone(progress, id)).length;

  // ---------- menu actions ----------
  const beginSaga = useCallback(() => {
    const idx = (CHAPTERS || []).findIndex((c, i) => {
      if (!isChapterUnlocked(progress, i)) return false;
      const { done, total } = chapterBeatsDone(progress, i);
      return done < total;
    });
    if (idx >= 0) {
      setCrawlIdx(idx);
      setMode('crawl');
    } else {
      setMode('map');
    }
  }, [progress]);

  const travelTo = useCallback((id) => {
    setSelectedId(null);
    setBeatOverlay(false);
    setBeatState(null);
    setPlanetId(id);
    setIntro(true);
    setMode('zone');
  }, []);

  // ---------- one render loop, keyed by mode + planet ----------
  useEffect(() => {
    if (mode !== 'map' && mode !== 'zone') return;
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
      // Context-loss guard (fleet rollout 2026-10-15): one guard for the
      // page-lifetime renderer — transient losses heal in place, a loss
      // that stays gone surfaces the FEED LOST fallback, and frame()
      // freezes while the context is lost. The renderer lives for the
      // page's lifetime and is never disposed, so neither is the guard.
      contextGuardRef.current = guardCanvasContext(canvas, { label: 'STAR WARS' });
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

    // ================= MAP =================
    if (mode === 'map') {
      scene.add(new THREE.AmbientLight(0xffffff, 0.9));
      const dir = new THREE.DirectionalLight(0xffffff, 1.2);
      dir.position.set(40, 60, 20);
      scene.add(dir);

      const galaxy = buildGalaxy(THREE, canvas, PLANETS, CHAPTERS, progress,
        (id) => {
          if (isPlanetUnlocked(progress, id)) {
            setSelectedId(id);
          } else {
            // The blocking chapter is the earliest unlocked-but-incomplete one.
            const blocking = (CHAPTERS || []).find((c, i) => {
              if (!isChapterUnlocked(progress, i)) return false;
              try {
                const { done, total } = chapterBeatsDone(progress, i);
                return done < total;
              } catch { return false; }
            });
            const ci = chapterIndexOf(id);
            const ch = blocking || CHAPTERS[ci];
            showToast(ch ? `Finish ${ch.title} first` : 'Finish the previous episode first');
          }
        },
        camera
      );
      scene.add(galaxy.group);
      camera.position.set(0, 30, 52);
      camera.lookAt(0, 0, 0);

      const frame = (now) => {
        if (cancelled) return;
        if (contextGuardRef.current && contextGuardRef.current.isLost()) { raf = requestAnimationFrame(frame); return; } // frozen while the context is gone
        const dt = Math.min((now - last) / 1000, 0.05);
        last = now;
        galaxy.update(now / 1000, dt);
        renderer.render(scene, camera);
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
      cleanup = () => galaxy.dispose();
    }

    // ================= ZONE =================
    if (mode === 'zone' && planetId && PLANETS[planetId]) {
      const def = PLANETS[planetId];
      const zone = buildZone(THREE, def, T);
      scene.add(zone.group);
      if (def.sky) scene.background = new THREE.Color(def.sky);
      if (def.fog) scene.fog = new THREE.FogExp2(new THREE.Color(def.fog), def.fogDensity || 0.015);

      const detachers = [];
      const spawn = zone.spawn || { x: 0, z: 0, yaw: 0 };
      const isFly = def.kind === 'fly';

      // Page-owned beat markers (checkpoints gray->green, target amber->green).
      const markers = [];
      const addMarker = (pt, color) => {
        const mesh = new THREE.Mesh(
          new THREE.TorusGeometry(pt.r || 2, 0.28, 8, 40),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 })
        );
        const y = isFly ? (spawn.y != null ? spawn.y : 12) : zone.groundHeight(pt.x, pt.z) + 0.5;
        mesh.position.set(pt.x, y, pt.z);
        mesh.rotation.x = -Math.PI / 2;
        scene.add(mesh);
        markers.push(mesh);
        return mesh;
      };
      const cpMarkers = (zone.checkpoints || []).map((pt) => addMarker(pt, 0xffcc44));
      const targetMarker = zone.target ? addMarker(zone.target, 0xff6644) : null;

      const total = (zone.checkpoints || []).length + (zone.target ? 1 : 0);
      setBeatState({ reached: 0, total });
      let reached = 0;
      let done = false;

      const complete = () => {
        if (done || cancelled) return;
        done = true;
        const np = completeBeat(progress, planetId);
        try { saveProgress(np); } catch (e) { /* storage may be unavailable */ }
        setProgress(np);
        setBeatOverlay(true);
      };

      const checkBeat = (x, z) => {
        if (done) return;
        const cps = zone.checkpoints || [];
        if (reached < cps.length) {
          const cp = cps[reached];
          if (Math.hypot(x - cp.x, z - cp.z) <= (cp.r || 2)) {
            if (cpMarkers[reached]) cpMarkers[reached].material.color.set(0x44ff77);
            reached += 1;
            setBeatState({ reached, total });
            if (reached >= cps.length && !zone.target) complete();
          }
          return;
        }
        if (zone.target) {
          const t = zone.target;
          if (Math.hypot(x - t.x, z - t.z) <= (t.r || 2)) {
            if (targetMarker) targetMarker.material.color.set(0x44ff77);
            setBeatState({ reached: total, total });
            complete();
          }
        }
      };

      let keys = null;
      let walker = null;
      const flight = { x: spawn.x, y: spawn.y != null ? spawn.y : 12, z: spawn.z, yaw: spawn.yaw || 0, pitch: 0 };

      if (!isFly) {
        walker = createWalker({ x: spawn.x, z: spawn.z, yaw: spawn.yaw || 0, pitch: 0 });
        keys = createKeyInput();
        keys.attach();
        detachers.push(() => keys.detach());
        detachers.push(attachDragLook(canvas, {
          onLook: (dx, dy) => applyLook(walker, dx, dy),
        }));
      } else {
        detachers.push(attachDragLook(canvas, {
          onLook: (dx, dy) => applyLook(flight, dx, dy),
        }));
      }

      const frame = (now) => {
        if (cancelled) return;
        if (contextGuardRef.current && contextGuardRef.current.isLost()) { raf = requestAnimationFrame(frame); return; } // frozen while the context is gone
        const dt = Math.min((now - last) / 1000, 0.05);
        last = now;
        const t = now / 1000;

        if (!isFly && walker) {
          if (!introRef.current) {
            const jump = keys.consumeJump();
            stepWalker(walker, {
              fwd: keys.state.fwd + joyRef.current.y,
              strafe: keys.state.strafe + joyRef.current.x,
              sprint: keys.state.sprint, jump,
            }, dt, {
              groundHeight: zone.groundHeight,
              colliders: zone.colliders,
              bounds: zone.bounds,
            });
          }
          const cam = walkerCamera(walker, {});
          camera.position.set(cam.x, cam.y, cam.z);
          camera.rotation.set(walker.pitch, walker.yaw, 0);
          checkBeat(walker.pos.x, walker.pos.z);
        } else if (isFly) {
          if (!introRef.current) {
            const jr = joyRef.current;
            flight.yaw -= jr.x * 1.4 * dt;
            flight.pitch = Math.max(-1.2, Math.min(1.2, flight.pitch + jr.y * 1.0 * dt));
            const cp = Math.cos(flight.pitch), sp = Math.sin(flight.pitch);
            const fx = -Math.sin(flight.yaw) * cp;
            const fy = sp;
            const fz = -Math.cos(flight.yaw) * cp;
            const speed = 26;
            flight.x += fx * speed * dt;
            flight.y += fy * speed * dt;
            flight.z += fz * speed * dt;
            flight.y = Math.max(-30, Math.min(40, flight.y));
            const gh = zone.groundHeight(flight.x, flight.z);
            if (flight.y < gh + 1.5) flight.y = gh + 1.5;
            for (const c of zone.colliders || []) {
              const dx = flight.x - c.x, dz = flight.z - c.z;
              const d = Math.hypot(dx, dz);
              if (d < c.r && d > 1e-4) {
                const back = c.r - d;
                flight.x -= fx * back;
                flight.z -= fz * back;
              }
            }
            if (zone.bounds && zone.bounds.kind === 'circle') {
              const d = Math.hypot(flight.x, flight.z);
              if (d > zone.bounds.max) {
                flight.x *= zone.bounds.max / d;
                flight.z *= zone.bounds.max / d;
              }
            }
          }
          camera.position.set(flight.x, flight.y, flight.z);
          camera.rotation.set(flight.pitch, flight.yaw, 0);
          checkBeat(flight.x, flight.z);
        }

        zone.update(t, dt);
        for (const m of markers) m.rotation.z += dt * 0.6;
        renderer.render(scene, camera);
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);

      cleanup = () => {
        detachers.forEach((d) => { try { d(); } catch (e) {} });
        markers.forEach((m) => {
          scene.remove(m);
          m.geometry.dispose();
          m.material.dispose();
        });
        try { zone.dispose(); } catch (e) {}
        scene.remove(zone.group);
      };
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      if (cleanup) cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, planetId]);

  // ---------- derived view data ----------
  const activeChapterIdx = (CHAPTERS || []).findIndex((c, i) => {
    if (!isChapterUnlocked(progress, i)) return false;
    try {
      const { done, total } = chapterBeatsDone(progress, i);
      return done < total;
    } catch { return false; }
  });
  const activeChapter = activeChapterIdx >= 0 ? CHAPTERS[activeChapterIdx] : null;
  const chapterProg = activeChapterIdx >= 0
    ? (() => { try { return chapterBeatsDone(progress, activeChapterIdx); } catch { return null; } })()
    : null;

  const crawl = CHAPTERS[crawlIdx] || { ep: '', title: '', crawl: '', planets: [] };
  const sel = selectedId ? PLANETS[selectedId] : null;
  const def = planetId ? PLANETS[planetId] : null;

  const nextId = (() => {
    const i = SAGA.indexOf(planetId);
    return i >= 0 ? SAGA[i + 1] : null;
  })();
  const nextAvailable = nextId && isPlanetUnlocked(progress, nextId) && !beatDone(progress, nextId);

  const onJoy = useCallback((x, y) => { joyRef.current = { x, y }; }, []);

  return (
    <div style={styles.root}>
      <style>{'@keyframes swTwinkle{0%,100%{opacity:.22}50%{opacity:.95}}'}</style>
      <canvas ref={canvasRef} style={styles.canvas} />

      {/* Exit to lobby — always visible, top left, in every mode */}
      <a href="/" style={styles.exitBtn} aria-label="Exit to lobby">← Exit to Lobby</a>

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
          <StarBackdrop />
          <div style={styles.menuInner}>
            <h1 style={styles.swTitle}>Star Wars</h1>
            <p style={styles.swSub}>An open-world saga · Episodes I–IX</p>
            <p style={styles.swProg}>{doneCount} of {SAGA.length} worlds explored</p>
            <button style={styles.btn} onClick={beginSaga}>Begin the saga</button>
            <button style={{ ...styles.btn, ...styles.btnGhost }} onClick={() => setMode('map')}>Galaxy map</button>
          </div>
        </div>
      )}

      {/* ================= CRAWL ================= */}
      {mode === 'crawl' && (
        <div style={styles.menu}>
          <StarBackdrop />
          <div style={{ ...styles.menuInner, maxWidth: 640, textAlign: 'left' }}>
            <div style={styles.crawlEp}>{crawl.ep}</div>
            <h2 style={styles.crawlTitle}>{crawl.title}</h2>
            <p style={styles.crawlText}>{crawl.crawl}</p>
            <div style={styles.beatList}>
              {(crawl.planets || []).map((id) => {
                const p = PLANETS[id];
                if (!p) return null;
                return (
                  <div key={id} style={styles.beatRow}>
                    <span style={styles.beatPlanet}>{p.name}</span>
                    <span style={styles.beatTitle}>{p.beat ? p.beat.title : ''}</span>
                  </div>
                );
              })}
            </div>
            <button style={styles.btn} onClick={() => setMode('map')}>Travel to the galaxy map</button>
          </div>
        </div>
      )}

      {/* ================= MAP HUD ================= */}
      {mode === 'map' && (
        <div style={styles.hud}>
          <div style={styles.mapTop}>
            <div>
              <div style={styles.mapTitle}>Galaxy map</div>
              {activeChapter && chapterProg && (
                <div style={styles.mapProg}>
                  {activeChapter.title} · {chapterProg.done}/{chapterProg.total} worlds
                </div>
              )}
              {!activeChapter && <div style={styles.mapProg}>Saga complete</div>}
            </div>
            <button style={styles.smallBtn} onClick={() => { setSelectedId(null); setMode('menu'); }}>Back</button>
          </div>

          {sel && (
            <div style={styles.card}>
              <div style={styles.cardName}>{sel.name}</div>
              <div style={styles.cardMeta}>{sel.biome}</div>
              {sel.beat && <div style={styles.cardBeat}>{sel.beat.title}</div>}
              <div style={styles.cardRow}>
                <button style={styles.btn} onClick={() => travelTo(selectedId)}>Travel</button>
                <button style={{ ...styles.btn, ...styles.btnGhost }} onClick={() => setSelectedId(null)}>Close</button>
              </div>
            </div>
          )}

          {toast && <div style={styles.toast}>{toast}</div>}
        </div>
      )}

      {/* ================= ZONE HUD ================= */}
      {mode === 'zone' && def && (
        <div style={styles.hud}>
          <div style={styles.zoneTop}>
            <div style={styles.zoneName}>{def.name}</div>
            <button style={styles.smallBtn} onClick={() => { setIntro(false); setMode('map'); }}>Map</button>
          </div>

          {def.beat && beatState && (
            <div style={styles.objective}>
              <div style={styles.objText}>{def.beat.objective}</div>
              {beatState.total > 0 && (
                <div style={styles.pips}>{beatState.reached}/{beatState.total}</div>
              )}
            </div>
          )}

          {isTouch && (
            <div style={styles.stickWrap}>
              <WalkJoystick onMove={onJoy} size={120} />
            </div>
          )}

          {/* beat intro */}
          {intro && def.beat && (
            <div style={styles.overlay}>
              <div style={styles.panel}>
                <div style={styles.panelName}>{def.name}</div>
                <div style={styles.panelMeta}>{def.biome}</div>
                <div style={styles.panelBeat}>{def.beat.title}</div>
                <p style={styles.panelText}>{def.beat.text}</p>
                <button style={styles.btn} onClick={() => setIntro(false)}>Start exploring</button>
              </div>
            </div>
          )}

          {/* beat complete */}
          {beatOverlay && def.beat && (
            <div style={styles.overlay}>
              <div style={styles.panel}>
                <div style={styles.panelBeat}>Beat complete</div>
                <div style={styles.panelName}>{def.beat.title}</div>
                <div style={styles.cardRow}>
                  <button style={styles.btn} onClick={() => { setBeatOverlay(false); setMode('map'); }}>Galaxy map</button>
                  {nextAvailable && (
                    <button style={{ ...styles.btn, ...styles.btnGhost }} onClick={() => travelTo(nextId)}>Next world</button>
                  )}
                </div>
              </div>
            </div>
          )}

          {toast && <div style={styles.toast}>{toast}</div>}
        </div>
      )}
    </div>
  );
}

const styles = {
  root: { position: 'fixed', inset: 0, background: '#020208', overflow: 'hidden', color: '#eee' },
  canvas: { position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', touchAction: 'none' },
  hud: { position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 50 },
  // menu / crawl
  menu: {
    position: 'absolute', inset: 0, zIndex: 60, display: 'flex',
    justifyContent: 'center', alignItems: 'center', padding: 24,
    background: 'radial-gradient(ellipse at 50% 30%, #0b1030 0%, #04040c 60%, #000 100%)',
    overflowY: 'auto',
  },
  menuInner: { textAlign: 'center', maxWidth: 480, position: 'relative', zIndex: 1 },
  starWrap: { position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' },
  nebula: { position: 'absolute', borderRadius: '50%', filter: 'blur(46px)' },
  nebulaA: {
    width: '72vw', height: '72vw', left: '-14vw', top: '-20vh', opacity: 0.5,
    background: 'radial-gradient(circle, rgba(64,44,168,0.5) 0%, rgba(64,44,168,0) 68%)',
  },
  nebulaB: {
    width: '64vw', height: '64vw', right: '-12vw', bottom: '-16vh', opacity: 0.42,
    background: 'radial-gradient(circle, rgba(24,84,150,0.5) 0%, rgba(24,84,150,0) 68%)',
  },
  swTitle: {
    fontSize: 'min(18vw, 84px)', fontWeight: 700, letterSpacing: 14, margin: '0 0 10px',
    color: '#ffe81f',
    textShadow: '0 0 16px rgba(255,232,31,0.35), 0 0 46px rgba(255,196,32,0.32), 0 0 110px rgba(122,84,255,0.28)',
  },
  swSub: { color: '#9fb4d8', fontSize: 15, letterSpacing: 2, margin: '0 0 18px' },
  swProg: { color: '#66779a', fontSize: 13, letterSpacing: 1, margin: '0 0 30px' },
  btn: {
    display: 'inline-block', margin: '8px 6px 0', padding: '14px 30px',
    fontSize: 15, letterSpacing: 2, color: '#0a0a12', background: '#ffe81f',
    border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700,
    pointerEvents: 'auto',
    boxShadow: '0 6px 26px rgba(255,232,31,0.28), inset 0 1px 0 rgba(255,255,255,0.55)',
  },
  btnGhost: {
    background: 'rgba(255,232,31,0.06)', color: '#ffe81f',
    border: '1px solid rgba(255,232,31,0.75)',
    boxShadow: '0 4px 18px rgba(0,0,0,0.45)',
  },
  smallBtn: {
    padding: '10px 18px', fontSize: 13, letterSpacing: 1, color: '#ffe81f',
    background: 'rgba(10,10,20,0.55)', border: '1px solid rgba(255,232,31,0.5)',
    borderRadius: 8, cursor: 'pointer', pointerEvents: 'auto',
  },
  crawlEp: { color: '#7fa0d8', fontSize: 13, letterSpacing: 4, marginBottom: 8 },
  crawlTitle: { color: '#ffe81f', fontSize: 30, letterSpacing: 2, margin: '0 0 16px', fontWeight: 700 },
  crawlText: { color: '#c9d6ee', fontSize: 15, lineHeight: 1.9, whiteSpace: 'pre-wrap', margin: '0 0 22px' },
  beatList: { margin: '0 0 26px', borderTop: '1px solid rgba(255,255,255,0.12)' },
  beatRow: {
    display: 'flex', justifyContent: 'space-between', gap: 12,
    padding: '10px 2px', borderBottom: '1px solid rgba(255,255,255,0.08)',
    fontSize: 13,
  },
  beatPlanet: { color: '#9fb4d8', letterSpacing: 1 },
  beatTitle: { color: '#ffe81f', textAlign: 'right' },
  exitBtn: {
    position: 'absolute', top: BANNER_CLEAR, left: 20, zIndex: 90,
    display: 'inline-flex', alignItems: 'center', minHeight: 44,
    padding: '10px 16px', fontSize: 13, letterSpacing: 1, fontWeight: 700,
    color: '#ffe81f', background: 'rgba(10,10,20,0.72)',
    border: '1px solid rgba(255,232,31,0.55)', borderRadius: 8,
    textDecoration: 'none', pointerEvents: 'auto', cursor: 'pointer',
  },
  // map HUD
  mapTop: {
    position: 'absolute', top: 'calc(' + BANNER_CLEAR + ' + 44px)', left: 12, right: 12,
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    pointerEvents: 'none', padding: '12px 10px 30px', borderRadius: 14,
    // scrim: 3D planet labels drifting behind the header can no
    // longer clash with the title / progress lines
    background: 'linear-gradient(180deg, rgba(2,2,10,0.8) 0%, rgba(2,2,10,0.45) 62%, rgba(2,2,10,0) 100%)',
  },
  mapTitle: { color: '#ffe81f', fontSize: 17, letterSpacing: 3, fontWeight: 700 },
  mapProg: { color: '#9fb4d8', fontSize: 12, letterSpacing: 1, marginTop: 6 },
  card: {
    position: 'absolute', left: 16, right: 16, bottom: CARD_CLEAR,
    // near-opaque + blur: planet labels behind the card (the "YAVIN 4"
    // bleed-through) can no longer ghost through it
    background: 'rgba(6,8,18,0.97)', backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,232,31,0.45)',
    borderRadius: 14, padding: 18, pointerEvents: 'auto', maxWidth: 440, margin: '0 auto',
    boxShadow: '0 18px 50px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,0,0,0.4)',
  },
  cardName: { color: '#fff', fontSize: 20, fontWeight: 700, letterSpacing: 1 },
  cardMeta: { color: '#9fb4d8', fontSize: 12, letterSpacing: 2, marginTop: 4, textTransform: 'uppercase' },
  cardBeat: { color: '#ffe81f', fontSize: 14, marginTop: 10 },
  cardRow: { display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' },
  toast: {
    position: 'absolute', left: '50%', bottom: 'calc(' + CARD_CLEAR + ' + 190px)',
    transform: 'translateX(-50%)', background: 'rgba(10,10,20,0.94)',
    border: '1px solid rgba(255,232,31,0.4)', color: '#ffe81f',
    padding: '10px 18px', borderRadius: 10, fontSize: 13, letterSpacing: 1,
    whiteSpace: 'nowrap', maxWidth: '92vw', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  // zone HUD
  zoneTop: {
    position: 'absolute', top: 'calc(' + BANNER_CLEAR + ' + 54px)', left: 20, right: 20,
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    pointerEvents: 'none',
  },
  zoneName: { color: '#fff', fontSize: 17, letterSpacing: 3, fontWeight: 700, textShadow: '0 0 12px rgba(0,0,0,0.9)' },
  objective: {
    position: 'absolute', top: 'calc(' + BANNER_CLEAR + ' + 100px)', left: '50%',
    transform: 'translateX(-50%)', textAlign: 'center', maxWidth: '88vw',
  },
  objText: {
    color: '#ffe81f', fontSize: 13, letterSpacing: 1, lineHeight: 1.6,
    textShadow: '0 0 10px rgba(0,0,0,0.9)', background: 'rgba(5,5,12,0.55)',
    padding: '8px 16px', borderRadius: 10,
  },
  pips: { color: '#9fb4d8', fontSize: 12, letterSpacing: 3, marginTop: 6, textShadow: '0 0 8px rgba(0,0,0,0.9)' },
  stickWrap: {
    position: 'absolute', left: 20, bottom: BOTTOM_CLEAR, pointerEvents: 'auto',
  },
  overlay: {
    position: 'absolute', inset: 0, zIndex: 70, display: 'flex',
    justifyContent: 'center', alignItems: 'center', padding: 24,
    background: 'rgba(2,2,10,0.72)', pointerEvents: 'auto',
  },
  panel: {
    background: 'rgba(8,10,24,0.95)', border: '1px solid rgba(255,232,31,0.4)',
    borderRadius: 16, padding: 28, maxWidth: 460, width: '100%', textAlign: 'center',
  },
  panelName: { color: '#fff', fontSize: 24, fontWeight: 700, letterSpacing: 2 },
  panelMeta: { color: '#9fb4d8', fontSize: 12, letterSpacing: 3, marginTop: 6, textTransform: 'uppercase' },
  panelBeat: { color: '#ffe81f', fontSize: 16, letterSpacing: 1, marginTop: 14, fontWeight: 700 },
  panelTitle: { color: '#fff', fontSize: 18, letterSpacing: 1 },
  panelText: { color: '#c9d6ee', fontSize: 14, lineHeight: 1.8, margin: '14px 0 20px' },
};
