"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { generateMarsProfile } from "@/lib/mars/engine";
import { timeOfDay01, getDayNightPlace, requestDayNightPlace } from "@/lib/day-night";
import { IcSunrise, IcSun, IcSunset, IcMoon, IcWings, IcClose, IcRoute, IcRefresh, IcMeteor } from "@/app/artemis-ui/icons";

// R3F scene loads client-side only (WebGL).
const MarsScene = dynamic(() => import("@/components/mars/MarsScene"), {
  ssr: false,
  loading: () => (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#ffa658", letterSpacing: 3, fontSize: 12 }}>
      SYNTHESIZING MARS…
    </div>
  ),
});

const ACCENT = "#e07840";
const PRESET_ICONS = [IcSunrise, IcSun, IcSunset, IcMoon];
const ELEMENT_LABELS = [
  ["earth", "EARTH"], ["air", "AIR"], ["fire", "FIRE"],
  ["water", "WATER"], ["mercury", "MERCURY"], ["aether", "AETHER"],
];
const NICHE_ORDER = ["airborne", "grazer", "carnivore", "waterBorne", "mercuryBorne"];

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

export default function MarsPage() {
  const inputRef = useRef({ keys: { fwd: false, back: false, left: false, right: false, up: false, down: false } });
  const [time, setTime] = useState(0.32);
  // Day/night (Merlin, 2026-11-14): the clock runs on REAL time
  // by default — the shared law's timeOfDay01 for the walker's
  // place (real location when granted, Sydney when not),
  // refreshed every 10 s (time moves slowly). The slider and
  // presets still work exactly as before: touching either one
  // takes the clock manual, and REAL TIME hands it back.
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
  const [mode, setMode] = useState("orbit"); // orbit | walk | fly
  const [seed, setSeed] = useState("MARS-PRIME");
  const [seedInput, setSeedInput] = useState("MARS-PRIME");
  const [selected, setSelected] = useState(null);
  const [focusReq, setFocusReq] = useState(null);

  const profile = useMemo(() => generateMarsProfile(seed), [seed]);

  useEffect(() => {
    document.title = "Mars — Seeded Exobiology Surface";
  }, []);

  function select(sel) {
    setSelected(sel || null);
    if (sel && mode === "orbit") {
      setFocusReq({ pos: sel.pos, nonce: Date.now() });
    }
  }

  function toggleMode(m) {
    setMode((prev) => (prev === m ? "orbit" : m));
  }

  function applySeed() {
    const clean = seedInput.trim();
    if (clean) setSeed(clean.toUpperCase());
  }

  function randomSeed() {
    const s = "MARS-" + Math.floor(1000 + Math.random() * 9000);
    setSeedInput(s);
    setSeed(s);
    setSelected(null);
  }

  const presets = [["Dawn", 0.26], ["Day", 0.5], ["Dusk", 0.72], ["Night", 0.95]];
  const c = profile.counts;

  return (
    <main className="mars">
      <div className="mars-bg" aria-hidden="true" />
      <style>{`
        .mars { min-height: 100dvh; background: #120806; color: #f6e8da; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; display: flex; flex-direction: column; position: relative; }
        .mars-bg { position: fixed; inset: 0; z-index: 0; pointer-events: none;
          background: radial-gradient(120% 90% at 50% 0%, #3a1c0d 0%, #22100a 45%, #120806 100%); }
        .mars > *:not(.mars-bg) { position: relative; z-index: 1; }
        .mars header { padding: 18px 20px 10px; }
        .mars .kicker { font-size: 11px; letter-spacing: 4px; color: ${ACCENT}; text-transform: uppercase; }
        .mars h1 { margin: 4px 0 2px; font-size: clamp(1.6rem, 5vw, 2.6rem); letter-spacing: 6px; font-weight: 800; }
        .mars .sub { color: #c99a78; font-size: 0.9rem; max-width: 60ch; }
        .mars .stage { position: relative; margin: 10px 16px 0; border: 1px solid #5a3220; border-radius: 14px; overflow: hidden; height: min(62dvh, 560px); min-height: 320px; background: #000; }
        .mars .stage canvas { touch-action: none; }
        .mars .panel { position: absolute; left: 12px; bottom: 12px; right: 12px; max-width: 430px; z-index: 5;
          background: linear-gradient(rgba(16,7,3,0.93), rgba(16,7,3,0.93)); border: 1px solid ${ACCENT}; border-radius: 10px; padding: 14px 16px; }
        .mars .panel h2 { margin: 0 0 6px; font-size: 1.05rem; letter-spacing: 2px; color: ${ACCENT}; }
        .mars .panel p { margin: 0 0 6px; font-size: 0.88rem; line-height: 1.5; color: #f0dcc8; }
        .mars .panel .meta { font-size: 0.78rem; letter-spacing: 1px; color: #c99a78; text-transform: uppercase; }
        .mars .controls { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; padding: 14px 20px; }
        .mars .ctl { display: flex; align-items: center; gap: 10px; font-size: 0.8rem; letter-spacing: 1px; color: #c99a78; }
        .mars input[type="range"] { width: 150px; accent-color: ${ACCENT}; }
        .mars input[type="text"] { min-height: 44px; padding: 10px 14px; border-radius: 8px; border: 1px solid #5a3220; background: #1c0d06; color: #f6e8da; font-size: 0.85rem; letter-spacing: 2px; text-transform: uppercase; width: 200px; }
        .mars button { min-height: 44px; min-width: 44px; padding: 10px 16px; border-radius: 8px; border: 1px solid #5a3220; background: #1c0d06; color: #f6e8da; font-size: 0.8rem; letter-spacing: 1px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
        .mars button.on { background: ${ACCENT}; border-color: ${ACCENT}; color: #160a04; font-weight: 700; }
        .mars .clock { font-variant-numeric: tabular-nums; color: #fff; font-weight: 700; }
        .mars .world { margin: 0 16px 20px; border: 1px solid #5a3220; border-radius: 14px; padding: 16px 18px; background: rgba(20,9,4,0.72); }
        .mars .world h3 { margin: 0 0 4px; font-size: 0.95rem; letter-spacing: 3px; color: ${ACCENT}; }
        .mars .world .biome { color: #e8b48a; font-size: 0.85rem; letter-spacing: 1px; margin-bottom: 10px; }
        .mars .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
        .mars .chip { border: 1px solid #5a3220; border-radius: 999px; padding: 5px 12px; font-size: 0.75rem; letter-spacing: 1px; color: #f0dcc8; background: #1c0d06; }
        .mars .chip b { color: ${ACCENT}; }
        .mars .vitals { font-size: 0.82rem; color: #c99a78; letter-spacing: 1px; line-height: 1.7; }
        .mars .species { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; }
        .mars .species .row { display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: baseline; border-top: 1px solid #3a2013; padding-top: 8px; font-size: 0.85rem; }
        .mars .species .name { font-weight: 700; color: #ffe3cc; }
        .mars .species .niche { color: ${ACCENT}; font-size: 0.75rem; letter-spacing: 1px; text-transform: uppercase; }
        .mars .species .diet { color: #c99a78; font-size: 0.8rem; }
      `}</style>

      <header>
        <div className="kicker">ARES // OLYMPUS SURFACE PROGRAM</div>
        <h1>MARS</h1>
        <div className="sub">{profile.worldName} — {profile.biomeClass}. One seed grows the whole region: terrain, brine and quicksilver basins, flora, and five niches of seeded life. Drag to orbit, walk the regolith, or fly the basin — tap a creature for its exobiology.</div>
      </header>

      <div className="stage">
        <MarsScene
          profile={profile}
          worldKey={seed}
          timeOfDay={time}
          mode={mode}
          inputRef={inputRef}
          focusReq={focusReq}
          onSelect={select}
          selectedId={selected ? selected.id : null}
        />
        {selected && (
          <div className="panel" role="dialog" aria-label={selected.name}>
            <h2>{selected.name}</h2>
            <div className="meta">{selected.niche}</div>
            <p>Element: {selected.element}</p>
            <p>Diet: {selected.diet}</p>
            <button onClick={() => select(null)} aria-label="Close organism panel"><IcClose /><span>Close</span></button>
          </div>
        )}
      </div>

      <div className="controls">
        <div className="ctl">
          <span>TIME</span>
          <input type="range" min="0" max="1000" value={Math.round(time * 1000)}
            onChange={(e) => setManualTime(Number(e.target.value) / 1000)} aria-label="Time of day" />
          <span className="clock">{timeString(time)} · {timeLabel(time)}{liveTime ? " · LIVE" : " · MANUAL"}</span>
        </div>
        {presets.map(([label, t], i) => {
          const Icon = PRESET_ICONS[i % PRESET_ICONS.length];
          return (
            <button key={label} onClick={() => setManualTime(t)} aria-label={`Set time to ${label}`}>
              <Icon /><span>{label}</span>
            </button>
          );
        })}
        <button className={liveTime ? "on" : ""} onClick={resumeLiveTime} aria-pressed={liveTime} aria-label="Follow real time">
          <IcSun /><span>REAL TIME</span>
        </button>
        <button className={mode === "walk" ? "on" : ""} onClick={() => toggleMode("walk")} aria-pressed={mode === "walk"}>
          <IcRoute /><span>{mode === "walk" ? "WALKING" : "WALK"}</span>
        </button>
        <button className={mode === "fly" ? "on" : ""} onClick={() => toggleMode("fly")} aria-pressed={mode === "fly"}>
          <IcWings /><span>{mode === "fly" ? "FLYING" : "FLY"}</span>
        </button>
      </div>

      <div className="controls" style={{ paddingTop: 0 }}>
        <div className="ctl">
          <span>SEED</span>
          <input type="text" value={seedInput}
            onChange={(e) => setSeedInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") applySeed(); }}
            aria-label="World seed" />
        </div>
        <button onClick={applySeed} aria-label="Apply seed"><IcMeteor /><span>APPLY</span></button>
        <button onClick={randomSeed} aria-label="Random seed"><IcRefresh /><span>RANDOM</span></button>
      </div>

      <section className="world" aria-label="World profile">
        <h3>{profile.worldName}</h3>
        <div className="biome">{profile.biomeClass} · Seed {profile.seed}</div>
        <div className="chips">
          {ELEMENT_LABELS.map(([key, label]) => (
            <span key={key} className="chip">{label} <b>{profile.elements[key]}%</b></span>
          ))}
        </div>
        <div className="vitals">
          GRAVITY {profile.gravity} · SURFACE {profile.surfaceTemp} · ATMOSPHERE {profile.atmosPressure}<br />
          FLORA {c.flora} · AIRBORNE {c.airborne} · GRAZERS {c.grazers} · CARNIVORES {c.carnivores} · HYDRO {c.waterBorne} · FERRO {c.mercuryBorne}
        </div>
        <div className="species">
          {NICHE_ORDER.map((niche) => {
            const s = profile.speciesCatalog[niche];
            return (
              <div key={niche} className="row">
                <span className="name">{s.name}</span>
                <span className="niche">{s.niche}</span>
                <span className="diet">{s.diet}</span>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
