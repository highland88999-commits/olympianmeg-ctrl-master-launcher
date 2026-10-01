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
  initialMinimized, toggleMinimized,
  visibleCharacters, minimizedCharacters, toggleMenu,
} from './ui.js';

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
    const S = {
      world: { globalTime: 0, simulatedMinutes: 0, isStormActive: false },
      playing: true, speed: 1, calm: false, t: 0,
      flash: 0, flashColor: '#ff003c', flashX: 0, flashZ: 0, shake: 0,
      henryColor: '#00f2ff',
      cam: { x: 0, z: 0, yaw: Math.PI / 4, zoom: 0.55, cx: 0, cy: 0 },
      camMode: 'city',
      buildings: buildCity(1337),
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

    // Pan / zoom
    let drag = null;
    const onDown = (e) => { drag = { x: e.clientX, y: e.clientY, cx: S.cam.x, cz: S.cam.z }; };
    const onMove = (e) => {
      if (!drag) return;
      const s = S.cam.zoom;
      S.cam.x = drag.cx - (e.clientX - drag.x) / (0.866 * s);
      S.cam.z = drag.cz - (e.clientY - drag.y) / (0.5 * s);
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

      // Follow camera
      if (S.camMode === 'follow') {
        const hx = S.henryCar.x, hz = S.henryCar.z;
        S.cam.x += (hx - S.cam.x) * 0.06;
        S.cam.z += (hz - S.cam.z) * 0.06;
      } else if (S.camMode === 'city') {
        S.cam.x += (0 - S.cam.x) * 0.03;
        S.cam.z += (0 - S.cam.z) * 0.03;
      }

      // Agents
      S.traffic.step(S.cam.x, S.cam.z);
      const carActive = S.henryCar.step(S.world.simulatedMinutes);
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

      // Render
      const RS = {
        cam: S.cam, buildings: S.buildings, ads: S.ads, trees: S.trees,
        traffic: S.traffic, ash: S.ash, world: S.world, calm: S.calm, t: S.t,
        shake: S.shake, flash: S.flash, flashColor: S.flashColor,
        flashX: S.flashX, flashZ: S.flashZ, henryColor: S.henryColor,
        henryCar: { visible: carActive, x: S.henryCar.x, z: S.henryCar.z, dir: S.henryCar.dir },
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
    border: '1px solid rgba(0,242,255,0.4)', color: '#bff', fontSize: 13,
    letterSpacing: 1, cursor: 'pointer', borderRadius: 6,
  };

  return (
    <>
    <div ref={wrapRef} style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden', fontFamily: 'system-ui, sans-serif' }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, touchAction: 'none' }} />

      {/* START OVERLAY */}
      {!ready && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 500, display: 'flex', flexDirection: 'column', gap: 18, justifyContent: 'center', alignItems: 'center', background: '#010204', padding: 24, textAlign: 'center' }}>
          <div style={{ color: '#00f2ff', letterSpacing: 6, fontSize: 15 }}>TRUMAN</div>
          <div style={{ color: '#889', maxWidth: 440, fontSize: 14, lineHeight: 1.7 }}>
            A simulated city watched over by a local Matrix Brain. Henry lives here —
            apartment, car, commute, and the monthly axiom storm. Everything runs in
            your browser. Nothing leaves this page.
          </div>
          <button onClick={() => setReady(true)} style={{ ...btn, padding: '15px 44px', fontSize: 15, letterSpacing: 4 }}>
            ENTER THE SIMULATION
          </button>
          <div style={{ color: '#556', fontSize: 12 }}>Calm mode is on by default if your system prefers reduced motion.</div>
        </div>
      )}

      {ready && (
        <>
          {/* HUD */}
          <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 100, background: 'rgba(2,5,10,0.72)', padding: '14px 18px', borderLeft: '3px solid #00f2ff', color: '#00f2ff', fontSize: 13, letterSpacing: 2, pointerEvents: 'none', backdropFilter: 'blur(6px)' }}>
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
                    position: 'relative', width: 210, textAlign: 'left', background: isSel ? 'rgba(0,15,30,0.55)' : 'rgba(2,5,10,0.35)',
                    backdropFilter: 'blur(8px)', border: `1px solid ${isSel ? c.color : 'rgba(255,255,255,0.12)'}`,
                    borderRight: `4px solid ${c.color}`, padding: 16, paddingRight: 52, cursor: 'pointer', color: '#fff',
                    transform: isSel ? 'translateX(-10px)' : 'none', transition: 'all 0.3s', minHeight: 44,
                  }}>
                    <button aria-label={`Minimize ${c.name} panel`} onClick={(e) => { e.stopPropagation(); setMinimized((m) => toggleMinimized(m, c.id)); }} style={{
                      position: 'absolute', top: 4, right: 4, width: 44, height: 44, background: 'transparent',
                      border: 'none', color: 'rgba(255,255,255,0.65)', fontSize: 22, lineHeight: 1, cursor: 'pointer',
                    }}>
                      –
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
              background: 'rgba(2,10,18,0.85)', border: '2px solid #00f2ff',
              color: '#00f2ff', fontSize: 22, cursor: 'pointer',
              boxShadow: '0 0 16px rgba(0,242,255,0.35)', backdropFilter: 'blur(6px)',
            }}
          >
            {menuOpen ? '✕' : '⚙'}
          </button>

          {/* CONTROL SHEET — all controls, grouped as before; compact panel so the canvas stays interactive around it */}
          {menuOpen && (
            <div style={{
              position: 'absolute', zIndex: 120, right: 16, left: 16,
              bottom: 'calc(5rem + env(safe-area-inset-bottom) + 80px)',
              maxWidth: 340, marginLeft: 'auto',
              maxHeight: 'calc(100dvh - 240px)', overflowY: 'auto',
              background: 'rgba(2,8,14,0.94)', border: '1px solid rgba(0,242,255,0.35)',
              borderRadius: 12, padding: 14, backdropFilter: 'blur(8px)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ color: '#00f2ff', fontSize: 12, letterSpacing: 3 }}>CONTROLS</span>
                <button aria-label="Close controls" onClick={() => setMenuOpen(false)} style={{
                  width: 44, height: 44, background: 'transparent', border: '1px solid rgba(0,242,255,0.4)',
                  borderRadius: 6, color: '#bff', fontSize: 16, cursor: 'pointer',
                }}>
                  ✕
                </button>
              </div>

              <div style={{ color: 'rgba(0,242,255,0.6)', fontSize: 10, letterSpacing: 2, marginBottom: 6 }}>TIME</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                <button style={btn} onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause time' : 'Resume time'}>
                  {playing ? '❚❚ PAUSE' : '▶ RUN'}
                </button>
                {SPEEDS.map((s) => (
                  <button key={s} style={{ ...btn, borderColor: speed === s ? '#00f2ff' : 'rgba(0,242,255,0.4)', color: speed === s ? '#fff' : '#bff' }} onClick={() => setSpeed(s)}>
                    {s}×
                  </button>
                ))}
              </div>

              <div style={{ color: 'rgba(0,242,255,0.6)', fontSize: 10, letterSpacing: 2, marginBottom: 6 }}>EVENT</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                <button style={btn} onClick={jumpToStorm}>⚡ JUMP TO STORM</button>
                <button style={{ ...btn, borderColor: calm ? '#ffd700' : 'rgba(0,242,255,0.4)', color: calm ? '#ffd700' : '#bff' }} onClick={() => setCalm((c) => !c)} aria-pressed={calm}>
                  {calm ? '☁ CALM MODE ON' : 'CALM MODE OFF'}
                </button>
              </div>

              <div style={{ color: 'rgba(0,242,255,0.6)', fontSize: 10, letterSpacing: 2, marginBottom: 6 }}>CAMERA</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {['city', 'follow', 'apartment'].map((m) => (
                  <button key={m} style={{ ...btn, borderColor: camMode === m ? '#00f2ff' : 'rgba(0,242,255,0.4)', color: camMode === m ? '#fff' : '#bff' }} onClick={() => setCamMode(m)}>
                    {m === 'city' ? 'CITY' : m === 'follow' ? "FOLLOW HENRY'S CAR" : "HENRY'S APARTMENT"}
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
