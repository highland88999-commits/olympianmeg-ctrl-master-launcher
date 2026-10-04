'use client';

/*
 * TRUMAN — a real-time 3D simulated world.
 *
 * Rebuilt from the Truman repo (client/src/*.jsx + server/index.js):
 *   - CityGrid    → procedural cyan-grid city with instanced skyscrapers
 *   - TrafficMatrix → 200 neon cars on lane-aligned grid traffic
 *   - HologramAds → floating billboards (source streamed a video from
 *                     files.catbox.moe — external, dropped; procedural
 *                     neon ad panels instead)
 *   - Environment → forest biome, ocean plane, storm ash particles,
 *                   celestial body synced to brain time
 *   - Apartment   → Henry's penthouse at y=200 (cutaway view)
 *   - Workplaces  → Wok & Grill (east), Synthwave Bar (core)
 *   - HenryCar    → black car, active 08:00–12:00 simulated
 *   - CharacterSelector → Henry Cahill / Valkyrie / Rasputin cards
 *   - StormMechanics → lightning in axiom colors, camera shake
 *
 * DROPPED from source: the realtime-socket link to the external matrix brain host,
 * the 3D scene bundles from CDN, the catbox video.
 * The Matrix Brain protocol now runs locally in world.js — zero network.
 */

import { useEffect, useRef, useState } from 'react';
import {
  MINUTES_IN_MONTH, STORM_DURATION, SIM_SPEED,
  tickWorld, minutesUntilStorm, formatClock,
  globalTimeForMinute, buildCity, buildAds, buildTrees,
  TrafficSim, HenryCarSim, AshSim,
} from './world.js';
import { createRenderer, drawApartment, AXIOM_COLORS } from './render.js';
import {
  buildColliders, stepBody, stepDebris, separateCars,
} from './physics.js';
import {
  initialMinimized, toggleMinimized,
  visibleCharacters, minimizedCharacters, toggleMenu,
} from './ui.js';
import AphroIcon from '@/components/aphrodite/icons';
import { aphroPanel } from '@/components/aphrodite/ambience';

const CHARACTERS = [
  { id: 'henry', name: 'HENRY CAHILL', role: 'MULTIVERSE ARCHITECT', status: 'DEPLOYING…', color: '#00f2ff' },
  { id: 'valkyrie', name: 'VALKYRIE', role: 'NETWORK OPERATOR', status: 'ROUTING TRAFFIC…', color: '#ff00ff' },
  { id: 'rasputin', name: 'RASPUTIN', role: 'LOGIC OVERSEER', status: 'OBSERVING MATRIX…', color: '#ffd700' },
];

const SPEEDS = [1, 16, 120];

export default function TrumanPage() {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [calm, setCalm] = useState(false);
  const [camMode, setCamMode] = useState('city'); // city | apartment | follow
  const [selected, setSelected] = useState('henry');
  const [minimized, setMinimized] = useState(initialMinimized);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hud, setHud] = useState({ simulatedMinutes: 0, isStormActive: false, globalTime: 0 });
  const sim = useRef(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setCalm(true);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const ctx = canvas.getContext('2d');
    const renderer = createRenderer();

    // World state (all mutable sim state lives here, outside React)
    const _buildings = buildCity(1337);
    const S = {
      world: { globalTime: 0, simulatedMinutes: 0, isStormActive: false },
      playing: true, speed: 1, calm: false, t: 0,
      flash: 0, flashColor: '#ff003c', flashX: 0, flashZ: 0, shake: 0,
      henryColor: '#00f2ff',
      cam: { x: 0, z: 0, yaw: Math.PI / 4, zoom: 0.55, cx: 0, cy: 0 },
      camMode: 'city',
      // Physics: precomputed building colliders + camera as a colliding body
      buildings: _buildings,
      colliders: buildColliders(_buildings),
      camTargetX: 0, camTargetZ: 0,
      camBody: { x: 0, z: 0, vx: 0, vz: 0, radius: 12, restitution: 0, friction: 0.5 },
      debris: [],
      ads: buildAds(),
      trees: buildTrees(4242),
      traffic: new TrafficSim(777),
      henryCar: new HenryCarSim(),
      ash: new AshSim(5150),
    };
    sim.current = S;

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.floor(r.width * dpr);
      canvas.height = Math.floor(r.height * dpr);
      canvas.style.width = r.width + 'px';
      canvas.style.height = r.height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      S.W = r.width; S.H = r.height;
      S.cam.cx = r.width / 2; S.cam.cy = r.height * 0.42;
    };
    resize();
    window.addEventListener('resize', resize);

    // Pan / zoom — drag sets a camera TARGET; the loop chases it with
    // critically-damped-style smoothing, then collides the camera as a
    // physics body so it can never be dragged inside a tower.
    let drag = null;
    const onDown = (e) => { drag = { x: e.clientX, y: e.clientY, cx: S.camTargetX, cz: S.camTargetZ }; };
    const onMove = (e) => {
      if (!drag) return;
      const s = S.cam.zoom;
      S.camTargetX = drag.cx - (e.clientX - drag.x) / (0.866 * s);
      S.camTargetZ = drag.cz - (e.clientY - drag.y) / (0.5 * s);
      S.camMode = 'city';
    };
    const onUp = () => { drag = null; };
    const onWheel = (e) => {
      e.preventDefault();
      S.cam.zoom = Math.min(2.2, Math.max(0.18, S.cam.zoom * (e.deltaY > 0 ? 0.92 : 1.09)));
    };
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    let raf = 0;
    let lastHud = 0;
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      const dt = 1 / 60;
      S.t += dt;

      // Brain ticks (speed multiplier = sub-ticks per frame)
      if (S.playing) {
        for (let i = 0; i < S.speed; i++) S.world = tickWorld(S.world.globalTime);
      }

      // Follow / city camera with physics: the camera is a body (radius 12)
      // that slides/deflects around buildings instead of clipping through.
      const cb = S.camBody;
      if (S.camMode === 'follow') {
        const hx = S.henryCar.x, hz = S.henryCar.z;
        S.cam.x += (hx - S.cam.x) * 0.06;
        S.cam.z += (hz - S.cam.z) * 0.06;
        // Push-out only: keep the follow cam out of solid geometry
        cb.x = S.cam.x; cb.z = S.cam.z; cb.vx = 0; cb.vz = 0;
        stepBody(cb, S.colliders, dt);
        S.cam.x = cb.x; S.cam.z = cb.z;
      } else if (S.camMode === 'city') {
        // City mode still drifts back to origin; the drag target chases
        // with smoothing (velocity = (target - pos) * 8, decayed each frame)
        S.camTargetX += (0 - S.camTargetX) * 0.03;
        S.camTargetZ += (0 - S.camTargetZ) * 0.03;
        cb.vx = (S.camTargetX - S.cam.x) * 8;
        cb.vz = (S.camTargetZ - S.cam.z) * 8;
        cb.x = S.cam.x; cb.z = S.cam.z;
        stepBody(cb, S.colliders, dt);
        S.cam.x = cb.x; S.cam.z = cb.z;
      }

      // Agents
      S.traffic.step(S.cam.x, S.cam.z);
      separateCars(S.traffic.cars, 50); // uniform-grid soft separation, radius 4
      // Henry's car: run at half speed this frame if it was blocked last frame
      const hBase = S.henryCar.speed;
      if (S.henryCar._blocked) S.henryCar.speed = hBase * 0.5;
      const carActive = S.henryCar.step(S.world.simulatedMinutes);
      S.henryCar.speed = hBase;
      // Henry vs traffic: positional deflect so he nudges instead of overlapping
      let hBlocked = false;
      if (carActive) {
        const hc = S.henryCar, HR = 12;
        for (const c of S.traffic.cars) {
          const dx = hc.x - c.x, dz = hc.z - c.z;
          const d2 = dx * dx + dz * dz;
          if (d2 < HR * HR && d2 > 1e-6) {
            const d = Math.sqrt(d2), shove = HR - d;
            hc.x += (dx / d) * shove; hc.z += (dz / d) * shove;
            hBlocked = true;
          }
        }
      }
      S.henryCar._blocked = hBlocked;
      S.ash.step(S.world.isStormActive, S.t);

      // Storm mechanics (source: StormMechanics in app.jsx)
      const storm = S.world.isStormActive;
      if (storm && !S.calm && Math.random() > 0.92 && S.flash <= 0.1) {
        S.flashColor = AXIOM_COLORS[Math.floor(Math.random() * AXIOM_COLORS.length)];
        S.flash = 1.0; S.shake = 20;
        S.flashX = S.cam.x + (Math.random() - 0.5) * 600;
        S.flashZ = S.cam.z + (Math.random() - 0.5) * 600;
      }
      if (S.shake > 0) S.shake *= 0.85;
      if (S.flash > 0) { S.flash *= 0.85; if (S.flash < 0.01) S.flash = 0; }

      // Storm debris (physics): spawn chunks near the camera while storming,
      // step with gravity + wind, despawn once they settle on the ground.
      // Calm mode: half the chunks, no wind, gentle bounces.
      if (storm) {
        const target = S.calm ? 20 : 40;
        while (S.debris.length < target) {
          S.debris.push({
            x: S.cam.x + (Math.random() - 0.5) * 800,
            y: 100 + Math.random() * 200,
            z: S.cam.z + (Math.random() - 0.5) * 800,
            vx: (Math.random() - 0.5) * 20,
            vy: -(10 + Math.random() * 20),
            vz: (Math.random() - 0.5) * 20,
            bounces: 0, settled: false,
          });
        }
        const wAmp = S.calm ? 0 : 1;
        const windX = Math.sin(S.t * 1.3) * 9 * wAmp;
        const windZ = Math.cos(S.t * 0.9) * 9 * wAmp;
        const rest = S.calm ? 0.15 : 0.35;
        for (let i = S.debris.length - 1; i >= 0; i--) {
          const p = S.debris[i];
          stepDebris(p, dt, windX, windZ, rest);
          if (p.settled) { S.debris[i] = S.debris[S.debris.length - 1]; S.debris.pop(); }
        }
      } else if (S.debris.length) {
        S.debris.length = 0;
      }

      // Render
      const RS = {
        cam: S.cam, buildings: S.buildings, ads: S.ads, trees: S.trees,
        traffic: S.traffic, ash: S.ash, world: S.world, calm: S.calm, t: S.t,
        shake: S.shake, flash: S.flash, flashColor: S.flashColor,
        flashX: S.flashX, flashZ: S.flashZ, henryColor: S.henryColor,
        henryCar: { visible: carActive, x: S.henryCar.x, z: S.henryCar.z, dir: S.henryCar.dir },
        debris: S.debris,
      };
      if (S.camMode === 'apartment') drawApartment(ctx, S.W, S.H, RS);
      else renderer.draw(ctx, S.W, S.H, RS);

      // HUD sync (4x/sec is plenty)
      if (now - lastHud > 250) {
        lastHud = now;
        setHud({ ...S.world });
      }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, [ready]);

  // Keep the mutable sim in sync with React controls
  useEffect(() => { if (sim.current) { sim.current.playing = playing; sim.current.speed = speed; } }, [playing, speed]);
  useEffect(() => { if (sim.current) sim.current.calm = calm; }, [calm]);
  useEffect(() => { if (sim.current) sim.current.camMode = camMode; }, [camMode]);
  useEffect(() => {
    const c = CHARACTERS.find((ch) => ch.id === selected);
    if (sim.current && c) sim.current.henryColor = c.color;
  }, [selected]);

  const jumpToStorm = () => {
    if (sim.current) {
      // Land mid-storm: the storm occupies the final 30 simulated minutes
      // of the month (minutes 43170–43200 per the Matrix Brain math).
      const target = MINUTES_IN_MONTH - STORM_DURATION + 15;
      sim.current.world = {
        globalTime: globalTimeForMinute(target),
        simulatedMinutes: target,
        isStormActive: true,
      };
    }
  };

  const clock = formatClock(hud.simulatedMinutes);
  const monthProgress = ((hud.simulatedMinutes / MINUTES_IN_MONTH) * 100).toFixed(2);
  const tMinus = minutesUntilStorm(hud.simulatedMinutes);
  const char = CHARACTERS.find((c) => c.id === selected);

  const btn = {
    minWidth: 44, minHeight: 44, padding: '10px 16px', background: 'rgba(0,20,30,0.7)',
    border: '1px solid rgba(244,114,182,0.45)', color: '#ffd9e8', fontSize: 13,
    letterSpacing: 1, cursor: 'pointer', borderRadius: 6,
    display: 'inline-flex', alignItems: 'center', gap: 8,
  };

  return (
    <>
    <div ref={wrapRef} style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden', fontFamily: 'system-ui, sans-serif' }}>
      {/* APHRODITE page art: sits behind the sim canvas and shows through the
          translucent HUD panels + before the first frame paints. */}
      <img src="/images/aphrodite/truman-bg.webp" alt="" aria-hidden="true"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.5, pointerEvents: 'none' }} />
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, touchAction: 'none' }} />

      {/* START OVERLAY */}
      {!ready && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 500, display: 'flex', flexDirection: 'column', gap: 18, justifyContent: 'center', alignItems: 'center', padding: 24, textAlign: 'center', overflow: 'hidden' }}>
          <img src="/images/aphrodite/truman-bg.webp" alt="" aria-hidden="true"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.55, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(2,0,6,0.55), rgba(2,0,6,0.88))', pointerEvents: 'none' }} />
          <div style={{ position: 'relative', color: '#f9a8d4', letterSpacing: 6, fontSize: 15 }}>TRUMAN</div>
          <div style={{ position: 'relative', color: '#c9b8c4', maxWidth: 440, fontSize: 14, lineHeight: 1.7 }}>
            A simulated city watched over by a local Matrix Brain. Henry lives here —
            apartment, car, commute, and the monthly axiom storm. Everything runs in
            your browser. Nothing leaves this page.
          </div>
          <button onClick={() => setReady(true)} style={{ ...btn, position: 'relative', padding: '15px 44px', fontSize: 15, letterSpacing: 4, borderColor: '#f9a8d4', color: '#ffe4ef' }}>
            <AphroIcon name="play" size={18} /> ENTER THE SIMULATION
          </button>
          <div style={{ position: 'relative', color: '#8a7584', fontSize: 12 }}>Calm mode is on by default if your system prefers reduced motion.</div>
        </div>
      )}

      {ready && (
        <>
          {/* HUD */}
          <div style={{
            position: 'absolute', top: 16, left: 16, zIndex: 100, padding: '14px 18px',
            borderLeft: '3px solid #f472b6', color: '#ffd9e8', fontSize: 13, letterSpacing: 2,
            pointerEvents: 'none', backdropFilter: 'blur(6px)',
            ...aphroPanel({ backgroundColor: 'rgba(14,3,10,0.78)' }),
          }}>
            <div style={{ fontSize: 15, fontWeight: 'bold', color: '#fff', marginBottom: 6 }}>TRUMAN // LOCAL BRAIN</div>
            <div>ZONE: <span style={{ color: '#f0f', fontWeight: 'bold' }}>CITYSCAPE</span></div>
            <div>SYS: <span style={{ color: hud.isStormActive ? '#ff003c' : '#00ff00', fontWeight: 'bold' }}>{hud.isStormActive ? 'CRITICAL BREACH' : 'CLEAR'}</span></div>
            <div>LINK: <span style={{ color: '#ffd700', fontWeight: 'bold' }}>LOCAL SIM</span></div>
            <div style={{ color: '#0f6', fontSize: 11, marginTop: 8 }}>MONTH CYCLE: {monthProgress}%</div>
            <div style={{ color: hud.isStormActive ? '#f0f' : '#ff003c', fontSize: 11, marginTop: 3 }}>
              {hud.isStormActive ? 'AXIOM EVENT IN PROGRESS' : `NEXT AXIOM EVENT: T-MINUS ${Math.round(tMinus)} MIN`}
            </div>
            <div style={{ color: '#fff', fontSize: 13, marginTop: 8, letterSpacing: 3 }}>{clock.label}</div>
          </div>

          {/* STORM WARNING */}
          <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 100, color: '#ff003c', fontSize: 14, fontWeight: 'bold', letterSpacing: 4, textAlign: 'right', pointerEvents: 'none', opacity: hud.isStormActive ? 1 : 0, transition: 'opacity 0.3s' }}>
            !!! AXIOM BREACH !!!<br />
            <span style={{ fontSize: 10, color: '#fff' }}>SHELTER IN PLACE</span>
          </div>

          {/* CHARACTER PANELS — each card minimizes into a floating icon */}
          {visibleCharacters(CHARACTERS, minimized).length > 0 && (
            <div style={{ position: 'absolute', top: 0, right: 8, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 18, zIndex: 100 }}>
              {visibleCharacters(CHARACTERS, minimized).map((c) => {
                const isSel = selected === c.id;
                return (
                  <div key={c.id} role="button" tabIndex={0} onClick={() => setSelected(c.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelected(c.id); }} style={{
                    position: 'relative', width: 210, textAlign: 'left',
                    ...aphroPanel({ backgroundColor: isSel ? 'rgba(30,8,20,0.6)' : 'rgba(10,3,8,0.4)' }),
                    backdropFilter: 'blur(8px)', border: `1px solid ${isSel ? c.color : 'rgba(244,114,182,0.18)'}`,
                    borderRight: `4px solid ${c.color}`, padding: 16, paddingRight: 52, cursor: 'pointer', color: '#fff',
                    transform: isSel ? 'translateX(-10px)' : 'none', transition: 'all 0.3s', minHeight: 44,
                  }}>
                    <button aria-label={`Minimize ${c.name} panel`} onClick={(e) => { e.stopPropagation(); setMinimized((m) => toggleMinimized(m, c.id)); }} style={{
                      position: 'absolute', top: 4, right: 4, width: 44, height: 44, background: 'transparent',
                      border: 'none', color: 'rgba(255,255,255,0.65)', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <AphroIcon name="minus" size={20} />
                    </button>
                    <div style={{ fontSize: 15, letterSpacing: 2, textShadow: `0 0 10px ${c.color}`, marginBottom: 6 }}>{c.name}</div>
                    <div style={{ color: c.color, fontSize: 11, letterSpacing: 1, marginBottom: 4 }}>ROLE: {c.role}</div>
                    <div style={{ color: '#aaa', fontSize: 10 }}>STAT: <span style={{ color: '#fff' }}>{c.status}</span></div>
                    {isSel && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${c.color}66`, fontSize: 10, color: '#00ffaa', lineHeight: 1.6 }}>
                        &gt; LINKING OBSERVER…<br />
                        &gt; FOCUS: {c.name}<br />
                        <span style={{ color: '#fff' }}>[ WATCHING ]</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* MINIMIZED CHARACTER ICONS — floating stack, top-right below the storm banner */}
          {minimizedCharacters(CHARACTERS, minimized).length > 0 && (
            <div style={{ position: 'absolute', top: 120, right: 16, zIndex: 100, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
              {minimizedCharacters(CHARACTERS, minimized).map((c) => (
                <button key={c.id} aria-label={`Restore ${c.name} panel`} onClick={() => setMinimized((m) => toggleMinimized(m, c.id))} style={{
                  width: 44, height: 44, borderRadius: '50%', background: 'rgba(2,5,10,0.75)',
                  border: `2px solid ${c.color}`, color: c.color, fontSize: 16, fontWeight: 'bold',
                  cursor: 'pointer', boxShadow: `0 0 12px ${c.color}55`, backdropFilter: 'blur(6px)',
                }}>
                  {c.name.charAt(0)}
                </button>
              ))}
            </div>
          )}

          {/* CONTROL MENU — collapses into a single floating action icon (bottom-right) */}
          <button
            aria-label={menuOpen ? 'Close controls' : 'Open controls'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => toggleMenu(o))}
            style={{
              position: 'absolute', zIndex: 120, right: 16,
              bottom: 'calc(5rem + env(safe-area-inset-bottom) + 12px)',
              width: 56, height: 56, borderRadius: '50%',
              background: 'rgba(20,6,14,0.85)', border: '2px solid #f472b6',
              color: '#f9a8d4', cursor: 'pointer',
              boxShadow: '0 0 16px rgba(244,114,182,0.35)', backdropFilter: 'blur(6px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <AphroIcon name={menuOpen ? 'x' : 'gear'} size={24} />
          </button>

          {/* CONTROL SHEET — all controls, grouped as before; compact panel so the canvas stays interactive around it */}
          {menuOpen && (
            <div style={{
              position: 'absolute', zIndex: 120, right: 16, left: 16,
              bottom: 'calc(5rem + env(safe-area-inset-bottom) + 80px)',
              maxWidth: 340, marginLeft: 'auto',
              maxHeight: 'calc(100dvh - 240px)', overflowY: 'auto',
              border: '1px solid rgba(244,114,182,0.35)',
              borderRadius: 12, padding: 14, backdropFilter: 'blur(8px)',
              ...aphroPanel({ backgroundColor: 'rgba(16,4,12,0.94)' }),
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ color: '#f9a8d4', fontSize: 12, letterSpacing: 3 }}>CONTROLS</span>
                <button aria-label="Close controls" onClick={() => setMenuOpen(false)} style={{
                  width: 44, height: 44, background: 'transparent', border: '1px solid rgba(244,114,182,0.4)',
                  borderRadius: 6, color: '#ffd9e8', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <AphroIcon name="x" size={18} />
                </button>
              </div>

              <div style={{ color: 'rgba(249,168,212,0.6)', fontSize: 10, letterSpacing: 2, marginBottom: 6 }}>TIME</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                <button style={btn} onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause time' : 'Resume time'}>
                  <AphroIcon name={playing ? 'pause' : 'play'} size={15} /> {playing ? 'PAUSE' : 'RUN'}
                </button>
                {SPEEDS.map((s) => (
                  <button key={s} style={{ ...btn, borderColor: speed === s ? '#f472b6' : 'rgba(244,114,182,0.4)', color: speed === s ? '#fff' : '#ffd9e8' }} onClick={() => setSpeed(s)}>
                    {s}×
                  </button>
                ))}
              </div>

              <div style={{ color: 'rgba(249,168,212,0.6)', fontSize: 10, letterSpacing: 2, marginBottom: 6 }}>EVENT</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                <button style={btn} onClick={jumpToStorm}><AphroIcon name="bolt" size={15} /> JUMP TO STORM</button>
                <button style={{ ...btn, borderColor: calm ? '#ffd700' : 'rgba(244,114,182,0.4)', color: calm ? '#ffd700' : '#ffd9e8' }} onClick={() => setCalm((c) => !c)} aria-pressed={calm}>
                  <AphroIcon name="cloud" size={15} /> {calm ? 'CALM MODE ON' : 'CALM MODE OFF'}
                </button>
              </div>

              <div style={{ color: 'rgba(249,168,212,0.6)', fontSize: 10, letterSpacing: 2, marginBottom: 6 }}>CAMERA</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[
                  { id: 'city', label: 'CITY', icon: 'city' },
                  { id: 'follow', label: "FOLLOW HENRY'S CAR", icon: 'crosshair' },
                  { id: 'apartment', label: "HENRY'S APARTMENT", icon: 'home' },
                ].map((m) => (
                  <button key={m.id} style={{ ...btn, borderColor: camMode === m.id ? '#f472b6' : 'rgba(244,114,182,0.4)', color: camMode === m.id ? '#fff' : '#ffd9e8' }} onClick={() => setCamMode(m.id)}>
                    <AphroIcon name={m.icon} size={15} /> {m.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* LOCAL-SIM BADGE */}
          <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 100, color: 'rgba(255,255,255,0.5)', fontSize: 11, letterSpacing: 2, pointerEvents: 'none', background: 'rgba(0,0,0,0.4)', padding: '6px 14px', borderRadius: 20 }}>
            MATRIX BRAIN: LOCAL SIMULATION · {SIM_SPEED}× · NO NETWORK
          </div>
        </>
      )}
    </div>
    {/* Safari bottom-bar clearance: blank space under the fixed sim viewport */}
    <div aria-hidden="true" className="player-clear" />
    </>
  );
}
