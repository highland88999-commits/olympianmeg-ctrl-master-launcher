"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { generateMarsProfile } from "@/lib/mars/engine";
import { timeOfDay01, getDayNightPlace, requestDayNightPlace, dayNightFor } from "@/lib/day-night";
import { MARS2_SEED, MARS2_WORLD_NAME } from "@/lib/mars2/world";
import { ROVER_NAME, ROVER_TOP_SPEED_MPS, WALK_SPEED_MPS, roverSpeedKmh } from "@/lib/mars2/rovers";
import { IcSunrise, IcSun, IcSunset, IcMoon, IcRoute } from "@/app/artemis-ui/icons";
import OrbButton, { OrbLabel } from "@/components/world/OrbButton";

// MARS 2 — the successor world (Merlin, Nov 15, 2026). One-word
// spec: ROVERS. Fixed seed, no seed picker, no exobiology — walk
// the red dunes or summon the ARES-2 survey rover and drive them.
// Day/night runs the shared law (lib/day-night.js): real time by
// default, the slider and presets take it manual, REAL TIME hands
// it back. The menu registries are owned by the coordinator;
// this page is the route itself (/mars-2).

// R3F scene loads client-side only (WebGL).
const Mars2Scene = dynamic(() => import("@/components/mars2/Mars2Scene"), {
  ssr: false,
  loading: () => (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#ffa658", letterSpacing: 3, fontSize: 12 }}>
      SYNTHESIZING MARS 2…
    </div>
  ),
});

const ACCENT = "#e07840";
const PRESET_ICONS = [IcSunrise, IcSun, IcSunset, IcMoon];

// Same clock helpers the other surface pages use (t: 0..1 of a day).
function timeLabel(t) {
  const h = Math.floor((((t % 1) + 1) % 1) * 24);
  if (h >= 5 && h < 8) return "DAWN";
  if (h >= 8 && h < 17) return "DAY";
  if (h >= 17 && h < 20) return "DUSK";
  return "NIGHT";
}
function timeString(t) {
  const mins = Math.floor((((t % 1) + 1) % 1) * 24 * 60);
  return String(Math.floor(mins / 60)).padStart(2, "0") + ":" + String(mins % 60).padStart(2, "0");
}

export default function Mars2Page() {
  const inputRef = useRef({ keys: { fwd: false, back: false, left: false, right: false, up: false, down: false } });
  const jumpRef = useRef(false);
  const [time, setTime] = useState(0.32);
  // Day/night (Merlin, 2026-11-14): the clock runs on REAL time
  // by default — the shared law's timeOfDay01 for the walker's
  // place (real location when granted, Sydney when not),
  // refreshed every 10 s. The slider and presets still work:
  // touching either one takes the clock manual, and REAL TIME
  // hands it back.
  const [liveTime, setLiveTime] = useState(true);
  const liveTimeRef = useRef(true);
  const setManualTime = (t) => {
    liveTimeRef.current = false;
    setLiveTime(false);
    setTime(t);
  };
  const resumeLiveTime = () => {
    liveTimeRef.current = true;
    setLiveTime(true);
  };

  useEffect(() => {
    requestDayNightPlace();
    if (!liveTime) return undefined;
    const applyRealTime = () => {
      try {
        const place = getDayNightPlace();
        setTime(timeOfDay01(Date.now(), place.lat, place.lon));
      } catch {}
    };
    applyRealTime();
    const id = setInterval(applyRealTime, 10000);
    return () => clearInterval(id);
  }, [liveTime]);
  const [mode, setMode] = useState("orbit"); // orbit | walk | drive
  const [roverCmd, setRoverCmd] = useState(null); // { action: 'summon' | 'dismount', nonce }
  const [rover, setRover] = useState({ active: false, speedKmh: 0 });

  const profile = useMemo(() => generateMarsProfile(MARS2_SEED), []);

  useEffect(() => {
    document.title = "Mars 2 — Rovers";
  }, []);

  function toggleMode(m) {
    setMode((prev) => (prev === m ? "orbit" : m));
  }

  function summonRover() {
    setRoverCmd({ action: "summon", nonce: Date.now() });
    setMode("drive");
  }

  function dismountRover() {
    setRoverCmd({ action: "dismount", nonce: Date.now() });
    setMode("walk");
  }

  const presets = [["Dawn", 0.26], ["Day", 0.5], ["Dusk", 0.72], ["Night", 0.95]];
  const clock = useMemo(() => {
    try {
      const place = getDayNightPlace();
      return dayNightFor(Date.now(), place.lat, place.lon).clock;
    } catch {
      return "";
    }
  }, [time]);

  return (
    <main className="mars2">
      <div className="mars2-bg" aria-hidden="true" />
      <style>{`
        .mars2 { min-height: 100dvh; background: #120806; color: #f6e8da; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; display: flex; flex-direction: column; position: relative; }
        .mars2-bg { position: fixed; inset: 0; z-index: 0; pointer-events: none;
          background: radial-gradient(120% 90% at 50% 0%, #3a1c0d 0%, #22100a 45%, #120806 100%); }
        .mars2 > *:not(.mars2-bg) { position: relative; z-index: 1; }
        .mars2 header { padding: 18px 20px 10px; }
        .mars2 .kicker { font-size: 11px; letter-spacing: 4px; color: ${ACCENT}; text-transform: uppercase; }
        .mars2 h1 { margin: 4px 0 2px; font-size: clamp(1.6rem, 5vw, 2.6rem); letter-spacing: 6px; font-weight: 800; }
        .mars2 .sub { color: #c99a78; font-size: 0.9rem; max-width: 60ch; }
        .mars2 .stage { position: relative; margin: 10px 16px 0; border: 1px solid #5a3220; border-radius: 14px; overflow: hidden; height: min(62dvh, 560px); min-height: 320px; background: #000; }
        .mars2 .stage canvas { touch-action: none; }
        .mars2 .roverbar { position: absolute; left: 12px; top: 12px; z-index: 5;
          background: linear-gradient(rgba(16,7,3,0.93), rgba(16,7,3,0.93)); border: 1px solid ${ACCENT}; border-radius: 10px; padding: 10px 14px;
          font-size: 0.8rem; letter-spacing: 1px; color: #f0dcc8; }
        .mars2 .roverbar b { color: ${ACCENT}; }
        .mars2 .controls { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; padding: 14px 20px; }
        .mars2 .ctl { display: flex; align-items: center; gap: 10px; font-size: 0.8rem; letter-spacing: 1px; color: #c99a78; }
        .mars2 input[type="range"] { width: 150px; accent-color: ${ACCENT}; }
        .mars2 button { min-height: 44px; min-width: 44px; padding: 10px 16px; border-radius: 8px; border: 1px solid #5a3220; background: #1c0d06; color: #f6e8da; font-size: 0.8rem; letter-spacing: 1px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
        .mars2 button.on { background: ${ACCENT}; border-color: ${ACCENT}; color: #160a04; font-weight: 700; }
        .mars2 button.rover { border-color: ${ACCENT}; }
        .mars2 .clock { font-variant-numeric: tabular-nums; color: #fff; font-weight: 700; }
        .mars2 .world { margin: 0 16px 20px; border: 1px solid #5a3220; border-radius: 14px; padding: 16px 18px; background: rgba(20,9,4,0.72); }
        .mars2 .world h3 { margin: 0 0 4px; font-size: 0.95rem; letter-spacing: 3px; color: ${ACCENT}; }
        .mars2 .world .biome { color: #e8b48a; font-size: 0.85rem; letter-spacing: 1px; margin-bottom: 10px; }
        .mars2 .vitals { font-size: 0.82rem; color: #c99a78; letter-spacing: 1px; line-height: 1.7; }
      `}</style>

      <header>
        <div className="kicker">ARES // OLYMPUS SURFACE PROGRAM</div>
        <h1>MARS 2</h1>
        <div className="sub">{MARS2_WORLD_NAME} — the successor world. Same red Mars, a new reason to be here: rovers. Walk the dunes, or summon the {ROVER_NAME} and drive them — Olympus Mons on the horizon, dust devils crossing the flats, the ARES outpost waiting at the end of the track.</div>
      </header>

      <div className="stage">
        <Mars2Scene
          profile={profile}
          worldKey={MARS2_SEED}
          timeOfDay={time}
          mode={mode}
          inputRef={inputRef}
          roverCmd={roverCmd}
          onRoverChange={setRover}
          jumpRef={jumpRef}
        />
        {/* Jump (Merlin, Nov 15, 2026 — same gravity logic as the
            Moon): walk mode only — the rover has no jump. Bottom-
            right, the Moon's button, Mars colours. A circle orb,
            like every other game control. */}
        {mode === 'walk' && (
          <OrbButton ariaLabel="Jump" size={76} accent="#e07840"
            onPointerDown={() => { jumpRef.current = true; }}
            style={{ position: 'absolute', right: 12, bottom: 12, zIndex: 6 }}>
            <span style={{ fontSize: 15 }}>JUMP</span>
          </OrbButton>
        )}
        <div className="roverbar" aria-live="polite">
          {rover.active ? (
            <span><b>◉ ROVER ACTIVE</b> · {rover.speedKmh.toFixed(0)} km/h · top {roverSpeedKmh(ROVER_TOP_SPEED_MPS).toFixed(0)} km/h — stick / WASD to drive</span>
          ) : (
            <span><b>○ ON FOOT</b> · walk {WALK_SPEED_MPS.toFixed(0)} m/s — summon the rover to drive</span>
          )}
        </div>
      </div>

      {/* Under-screen controls — circle orbs only (Merlin, Nov 16 —
          standing law). The TIME slider stays a slider: a continuous
          range input has no orb form, and its thumb is already a
          circle. Mars 2 has no fullscreen mode, so there is no
          maximize orb to place top-right — adding fullscreen would
          be new function, not a shape change. */}
      <div className="controls">
        <div className="ctl">
          <span>TIME</span>
          <input type="range" min="0" max="1000" value={Math.round(time * 1000)}
            onChange={(e) => setManualTime(Number(e.target.value) / 1000)} aria-label="Time of day" />
          <span className="clock">{timeString(time)} · {timeLabel(time)}{liveTime ? " · LIVE" : " · MANUAL"}{clock ? ` · ${clock}` : ""}</span>
        </div>
        {presets.map(([label, t], i) => {
          const Icon = PRESET_ICONS[i % PRESET_ICONS.length];
          return (
            <OrbButton key={label} accent="#e07840" onClick={() => setManualTime(t)} ariaLabel={`Set time to ${label}`}>
              <Icon /><OrbLabel>{label.toUpperCase()}</OrbLabel>
            </OrbButton>
          );
        })}
        <OrbButton accent="#e07840" active={liveTime} onClick={resumeLiveTime} aria-pressed={liveTime} ariaLabel="Follow real time">
          <IcSun /><OrbLabel>LIVE</OrbLabel>
        </OrbButton>
      </div>

      <div className="controls" style={{ paddingTop: 0 }}>
        <OrbButton accent="#e07840" active={mode === "walk"} onClick={() => toggleMode("walk")} aria-pressed={mode === "walk"} ariaLabel={mode === "walk" ? "Walking" : "Walk"}>
          <IcRoute /><OrbLabel>WALK</OrbLabel>
        </OrbButton>
        {rover.active ? (
          <OrbButton accent="#e07840" onClick={dismountRover} ariaLabel="Dismount rover">
            <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>⬇</span>
            <OrbLabel>OUT</OrbLabel>
          </OrbButton>
        ) : (
          <OrbButton accent="#e07840" onClick={summonRover} ariaLabel="Summon rover">
            <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>⬆</span>
            <OrbLabel>RIDE</OrbLabel>
          </OrbButton>
        )}
        <OrbButton accent="#e07840" active={mode === "orbit"} onClick={() => setMode("orbit")} aria-pressed={mode === "orbit"} ariaLabel={mode === "orbit" ? "Orbiting" : "Orbit"}>
          <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>◍</span>
          <OrbLabel>ORBIT</OrbLabel>
        </OrbButton>
      </div>

      <section className="world" aria-label="World profile">
        <h3>{MARS2_WORLD_NAME}</h3>
        <div className="biome">Dune Sea · Seed {MARS2_SEED} · Successor to Mars 1</div>
        <div className="vitals">
          ROVER {ROVER_NAME} · TOP {roverSpeedKmh(ROVER_TOP_SPEED_MPS).toFixed(0)} KM/H · 6 WHEELS · CAMERA MAST · HIGH-GAIN DISH<br />
          WALK {WALK_SPEED_MPS.toFixed(0)} M/S ON FOOT · OLYMPUS MONS ON THE HORIZON · DUST DEVILS · ARES OUTPOST · DAY / NIGHT ON THE REAL CLOCK
        </div>
      </section>
    </main>
  );
}
