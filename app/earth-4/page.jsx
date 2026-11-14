"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createWorld } from "./scene";
import { START_PLACE, formatLatLon } from "../../lib/earth4/geography.js";

/**
 * Earth 4 — True Earth size, fully explorable, true textures.
 * The real planet at real scale: real relief and coastline from
 * the repo's topology map, real satellite colours (plus ESRI
 * imagery up close), the real sun above your real lat/lon, and
 * real species spawning around you by GPS.
 *
 * UNDER CONSTRUCTION — this is a preview build. The world is
 * here to walk and check; coming out of construction is
 * Merlin's call after his phone check.
 *
 * Honest framing throughout: the species are real (Catalogue of
 * Life 2025), the shapes are placeholders, and the elevation
 * is a fit to the topology map (see the about section).
 */

const ACCENT = "#7ddf9a";

const ENV_LABEL = {
  terrestrial: "Land",
  freshwater: "Fresh water",
  marine: "Sea",
  amphibious: "Land & water",
};

function Glyph({ size = 16, children }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ flexShrink: 0 }}>{children}</svg>
  );
}
const IC = {
  walk: <><circle cx="13" cy="4" r="1.6" /><path d="M13 7l-3 5 2 3v6M10 12l-3 2M13 7l4 3 3 1M12 15l3 2 1 4" /></>,
  fly: <><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4z" /></>,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  up: <path d="M12 19V5M5 12l7-7 7 7" />,
  down: <path d="M12 5v14M5 12l7 7 7-7" />,
  jump: <><path d="M12 20v-8" /><path d="M8 12l4-4 4 4" /><path d="M5 20h14" /></>,
  pin: <><path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></>,
};

function Joystick({ onMove }) {
  const baseRef = useRef(null);
  const knobRef = useRef(null);
  const activeRef = useRef(null);

  const setKnob = (dx, dy) => {
    if (knobRef.current) knobRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
  };

  const handle = useCallback((e) => {
    const base = baseRef.current;
    if (!base || activeRef.current === null) return;
    const r = base.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const max = r.width / 2 - 14;
    const len = Math.hypot(dx, dy);
    if (len > max) { dx = (dx / len) * max; dy = (dy / len) * max; }
    setKnob(dx, dy);
    onMove(dx / max, -dy / max);
  }, [onMove]);

  return (
    <div
      ref={baseRef}
      className="e4-stick"
      onPointerDown={(e) => {
        activeRef.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        handle(e);
      }}
      onPointerMove={(e) => { if (activeRef.current === e.pointerId) handle(e); }}
      onPointerUp={(e) => {
        if (activeRef.current === e.pointerId) {
          activeRef.current = null; setKnob(0, 0); onMove(0, 0);
        }
      }}
      onPointerCancel={() => { activeRef.current = null; setKnob(0, 0); onMove(0, 0); }}
      aria-label="Move"
    >
      <div ref={knobRef} className="e4-knob" />
    </div>
  );
}

export default function Earth4Page() {
  const canvasRef = useRef(null);
  const worldRef = useRef(null);
  const [booted, setBooted] = useState(false);
  const [failed, setFailed] = useState(false);
  const [mode, setMode] = useState("walk");
  const [species, setSpecies] = useState(null);
  const [nearest, setNearest] = useState(null);
  const [count, setCount] = useState(0);
  const [place, setPlace] = useState({ lat: START_PLACE.lat, lon: START_PLACE.lon, name: START_PLACE.name });
  const [elev, setElev] = useState(null);
  const [clockLabel, setClockLabel] = useState(null);
  const [terrain, setTerrain] = useState({ heightmap: false, day: false, esri: false });
  const [gpsMsg, setGpsMsg] = useState(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    document.title = "Earth 4 — True Earth";
    let world = null;
    try {
      world = createWorld(canvasRef.current, {
        onReady: () => setBooted(true),
        onSpecies: (c) => setSpecies(c),
        onPlace: (p) => setPlace(p),
        onTerrain: (t) => setTerrain(t),
      });
    } catch (err) {
      console.error("[earth-4] world failed:", err);
      setFailed(true);
      return;
    }
    worldRef.current = world;

    const onKey = (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === " ") { world.jump(); e.preventDefault(); }
      if (k === "f") toggleFly();
      if (k === "escape") setSpecies(null);
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); world.destroy(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleFly = useCallback(() => {
    const w = worldRef.current;
    if (!w) return;
    const next = modeRef.current === "walk" ? "fly" : "walk";
    w.setMode(next);
    setMode(next);
  }, []);

  const onMove = useCallback((x, y) => {
    const w = worldRef.current;
    if (w) w.setMove(x, y);
  }, []);

  const setLift = (v) => { const w = worldRef.current; if (w) w.setLift(v); };

  // The walker readout: lat/lon, elevation, local solar time,
  // species nearby — refreshed twice a second.
  useEffect(() => {
    if (!booted) return;
    const id = window.setInterval(() => {
      const w = worldRef.current;
      if (!w) return;
      try {
        const p = w.getPosition();
        if (p) {
          setPlace((prev) => ({ ...prev, lat: p.lat, lon: p.lon }));
          setElev(p.elev);
        }
        setCount(w.getSpeciesCount());
        setNearest(w.getNearestSpecies());
        const dn = w.getDayNight();
        if (dn && dn.clock) setClockLabel(dn.clock);
        setTerrain(w.getTerrainStatus());
      } catch { /* the world is still booting */ }
    }, 500);
    return () => window.clearInterval(id);
  }, [booted]);

  const goToMyLocation = useCallback(() => {
    const w = worldRef.current;
    if (!w) return;
    if (!navigator.geolocation) {
      setGpsMsg("This device has no location to share — staying in Redwater.");
      return;
    }
    setGpsMsg("Asking your device where you are…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        w.setAnchor(pos.coords.latitude, pos.coords.longitude, "Your location");
        setSpecies(null);
        setGpsMsg(`You are now standing where you really are — ${formatLatLon(pos.coords.latitude, pos.coords.longitude)}.`);
      },
      () => setGpsMsg("Location not shared — staying where you are."),
      { timeout: 10000, maximumAge: 600000 },
    );
  }, []);

  const goHome = useCallback(() => {
    const w = worldRef.current;
    if (!w) return;
    w.setAnchor(START_PLACE.lat, START_PLACE.lon, START_PLACE.name);
    setSpecies(null);
    setGpsMsg(null);
  }, []);

  const sizeText = species
    ? (species.sizeSource === "listed"
      ? `≈ ${species.sizeM >= 1 ? `${species.sizeM.toFixed(2)} m` : `${Math.round(species.sizeM * 100)} cm`}`
      : "Size not listed in the dataset")
    : "";

  return (
    <main className="e4">
      <style>{`
        .e4 { min-height: 100dvh; background: #04120c; color: #eef7ee; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; display: flex; flex-direction: column; }
        .e4-hero { position: relative; padding: 20px 20px 12px; background: linear-gradient(180deg, #06281a 0%, #04120c 100%); }
        .e4 .kicker { font-size: 11px; letter-spacing: 4px; color: ${ACCENT}; text-transform: uppercase; }
        .e4 h1 { margin: 4px 0 2px; font-size: clamp(1.7rem, 6vw, 2.8rem); letter-spacing: 5px; font-weight: 800; }
        .e4 .sub { color: #a9c9b4; font-size: 0.92rem; max-width: 60ch; }
        .e4 .uc { margin-top: 8px; display: inline-block; font-size: 0.72rem; letter-spacing: 1px; color: #0b1f14; background: ${ACCENT}; border-radius: 999px; padding: 4px 12px; font-weight: 700; }
        .e4 .stage { position: relative; margin: 12px 16px 0; border: 1px solid #1e4030; border-radius: 14px; overflow: hidden; height: min(64dvh, 600px); min-height: 340px; background: #020a06; }
        .e4 canvas { width: 100%; height: 100%; display: block; touch-action: none; }
        .e4-boot { position: absolute; inset: 0; z-index: 6; display: flex; align-items: center; justify-content: center; gap: 10px; background: rgba(2,10,6,0.85); color: ${ACCENT}; font-size: 0.78rem; letter-spacing: 3px; text-transform: uppercase; animation: e4-pulse 1.6s ease-in-out infinite; }
        @keyframes e4-pulse { 0%,100% { opacity: 0.55; } 50% { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .e4-boot { animation: none; } }
        .e4-fail { position: absolute; inset: 0; z-index: 6; display: flex; align-items: center; justify-content: center; padding: 24px; text-align: center; color: #c9b8a6; font-size: 0.9rem; }
        .e4-hud { position: absolute; inset: 0; z-index: 5; pointer-events: none; }
        .e4-hud > * { pointer-events: auto; }
        .e4-stick { position: absolute; left: 14px; bottom: calc(14px + env(safe-area-inset-bottom)); width: 124px; height: 124px; border-radius: 50%; background: rgba(10,30,20,0.55); border: 1px solid rgba(125,223,154,0.45); touch-action: none; }
        .e4-knob { position: absolute; left: 50%; top: 50%; width: 52px; height: 52px; margin: -26px 0 0 -26px; border-radius: 50%; background: rgba(125,223,154,0.85); box-shadow: 0 4px 16px rgba(0,0,0,0.5); }
        .e4-btns { position: absolute; right: 14px; bottom: calc(14px + env(safe-area-inset-bottom)); display: flex; flex-direction: column; gap: 10px; align-items: flex-end; }
        .e4-btnrow { display: flex; gap: 10px; }
        .e4 button { min-height: 56px; min-width: 56px; padding: 10px 14px; border-radius: 12px; border: 1px solid rgba(125,223,154,0.5); background: rgba(8,26,17,0.82); color: #eef7ee; font-size: 0.75rem; letter-spacing: 1.5px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 7px; }
        .e4 button.on { background: ${ACCENT}; border-color: ${ACCENT}; color: #0b1f14; }
        .e4 button:active { transform: scale(0.96); }
        .e4-card { position: absolute; left: 12px; right: 12px; bottom: calc(152px + env(safe-area-inset-bottom)); max-width: 440px; background: rgba(4,16,10,0.94); border: 1px solid ${ACCENT}; border-radius: 12px; padding: 14px 16px 12px; box-shadow: 0 12px 40px rgba(0,0,0,0.6); }
        .e4-card h2 { margin: 0 0 2px; font-size: 1.02rem; letter-spacing: 1.5px; color: ${ACCENT}; font-style: italic; }
        .e4-card .tag { font-size: 0.72rem; letter-spacing: 2px; color: #8fb89a; text-transform: uppercase; margin-bottom: 6px; }
        .e4-card p { margin: 0 0 10px; font-size: 0.88rem; line-height: 1.55; color: #dcefe0; }
        .e4-card .vbadge { display: inline-block; font-size: 0.66rem; letter-spacing: 1.5px; text-transform: uppercase; border: 1px solid #c9a86a; color: #c9a86a; border-radius: 999px; padding: 2px 10px; margin-bottom: 10px; }
        .e4-card .crow { display: flex; gap: 8px; }
        .e4-card .cx { margin-left: auto; min-width: 44px; }
        .e4-placebar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 12px 16px 0; padding: 10px 14px; border: 1px solid rgba(125,223,154,0.4); border-radius: 12px; background: rgba(8,26,17,0.82); font-size: 0.82rem; }
        .e4-placebar .e4-placeinfo { flex: 1; min-width: 200px; color: #dcefe0; }
        .e4-placebar .e4-placeinfo strong { color: ${ACCENT}; letter-spacing: 1px; }
        .e4-placebar button { min-height: 44px; }
        .e4-gpsmsg { margin: 8px 16px 0; color: #c9a86a; font-size: 0.82rem; }
        .e4-about { padding: 0 20px calc(28px + env(safe-area-inset-bottom)); color: #9db8a6; font-size: 0.84rem; line-height: 1.6; max-width: 70ch; }
        .e4-about strong { color: #dcefe0; }
        .e4-about .e4-true { color: ${ACCENT}; font-weight: 700; }
      `}</style>

      <header className="e4-hero">
        <div className="kicker">True Earth · Fully explorable</div>
        <h1>EARTH 4</h1>
        <p className="sub">The real planet at real scale. Walk it — the ground, the sky and the wildlife are Earth's own.</p>
        <span className="uc">UNDER CONSTRUCTION — PREVIEW BUILD</span>
      </header>

      <div className="stage">
        <canvas ref={canvasRef} aria-label="Earth 4 3D world" />
        {!booted && !failed && <div className="e4-boot">Reading the real Earth…</div>}
        {failed && <div className="e4-fail">3D could not start on this device. Earth 4 needs WebGL.</div>}

        <div className="e4-hud">
          <Joystick onMove={onMove} />

          <div className="e4-btns">
            {mode === "fly" && (
              <div className="e4-btnrow">
                <button aria-label="Ascend"
                  onPointerDown={() => setLift(1)} onPointerUp={() => setLift(0)} onPointerLeave={() => setLift(0)}>
                  <Glyph>{IC.up}</Glyph>
                </button>
                <button aria-label="Descend"
                  onPointerDown={() => setLift(-1)} onPointerUp={() => setLift(0)} onPointerLeave={() => setLift(0)}>
                  <Glyph>{IC.down}</Glyph>
                </button>
              </div>
            )}
            <div className="e4-btnrow">
              {mode === "walk" && (
                <button aria-label="Jump" onPointerDown={() => worldRef.current && worldRef.current.jump()}>
                  <Glyph>{IC.jump}</Glyph>JUMP
                </button>
              )}
              <button className={mode === "fly" ? "on" : ""} onClick={toggleFly} aria-label="Toggle fly">
                <Glyph>{mode === "fly" ? IC.walk : IC.fly}</Glyph>{mode === "fly" ? "WALK" : "FLY"}
              </button>
            </div>
          </div>

          {species && (
            <div className="e4-card" role="dialog" aria-label={species.name}>
              <h2>{species.name}</h2>
              <div className="tag">{species.family ? `${species.family} · ` : ""}{species.class}{species.order ? ` · ${species.order}` : ""}</div>
              <span className="vbadge">Placeholder model — the species is real</span>
              <p>
                {ENV_LABEL[species.env] || species.env}
                {species.realm ? ` · ${species.realm}` : ""}
                {` · ${sizeText}`}
                {species.diet ? ` · eats ${species.diet.toLowerCase()}` : ""}
                {species.habitat ? ` · ${species.habitat}` : ""}
              </p>
              <div className="crow">
                <button className="cx" onClick={() => setSpecies(null)} aria-label="Close"><Glyph size={13}>{IC.x}</Glyph></button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* The walker readout: where you stand on the real Earth. */}
      <div className="e4-placebar" role="status">
        <span className="e4-placeinfo">
          {place.name ? (
            <>📍 <strong>{place.name}</strong> · </>
          ) : (
            <>📍 </>
          )}
          {formatLatLon(place.lat, place.lon)}
          {elev !== null && <> · {elev >= 0 ? `${Math.round(elev)} m up` : `${Math.round(-elev)} m down`}</>}
          {clockLabel && <> · 🕐 {clockLabel}</>}
          <br />
          🦋 {count} {count === 1 ? "creature" : "creatures"} nearby
          {nearest && <> · nearest: <i>{nearest.name}</i> ({Math.round(nearest.dist)} m)</>}
          <br />
          <span style={{ color: "#8fb89a" }}>
            {terrain.heightmap ? "✓ Real relief" : "… Real relief loading"}
            {" · "}
            {terrain.day ? "✓ True colours" : "… True colours loading"}
            {" · "}
            {terrain.esri ? "✓ Satellite detail" : "… Satellite detail loading"}
          </span>
        </span>
        <button onClick={goToMyLocation}>📍 WHERE I AM</button>
        <button onClick={goHome}>🏠 REDWATER</button>
      </div>
      {gpsMsg && <div className="e4-gpsmsg" role="status">{gpsMsg}</div>}

      <section className="e4-about">
        <p><strong>What is this?</strong> Earth 4 is the planet itself, at its true size. You start in
        Redwater, Alberta — walk 111 kilometres north and you really are one degree of latitude further
        north. The coastline you meet is Earth's coastline, the sun above you is the real sun above that
        place right now, and the creatures around you are real species from the Catalogue of Life 2025 —
        tap one to see what it is.</p>
        <p style={{ marginTop: 8 }}><span className="e4-true">What is genuinely true:</span> the distances
        (true metres, true lat/lon); the land/water mask and the shape of the relief (from the repo&apos;s
        topology map — Everest is the highest point); the ground colours (real satellite colours, plus
        real ESRI imagery up close); the day/night cycle (the shared law, run for where you stand); the
        species (real names from the world feed).</p>
        <p style={{ marginTop: 8 }}><strong>What is a stand-in:</strong> the animal shapes are placeholders
        (a bird is a flapping shape, a tree is a trunk and foliage) until the anatomy build map produces
        real models; the elevation in metres is a fit to the topology map, calibrated on Everest and
        Redwater — high plateaus read taller than surveyed, lowlands read at sea level. A surveyed
        elevation dataset is the upgrade. The sea is a wall on foot — no swimming at street level.</p>
        <p style={{ marginTop: 8 }}>Drag to look around, use the stick to move, FLY to soar. Press
        <strong> WHERE I AM</strong> to stand where your device really is.</p>
      </section>
    </main>
  );
}
