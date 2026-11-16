"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { timeOfDay01, getDayNightPlace, requestDayNightPlace } from "@/lib/day-night";
import { IcSunrise, IcSun, IcSunset, IcMoon, IcClose, IcRoute, IcBolt, IcCloudRain } from "@/app/artemis-ui/icons";
import { JUPITER2_SEED, LIGHTNING_MONSTER_COUNT, DEMOBAT_COUNT } from "@/lib/jupiter2/profile";
import { LIGHTNING_MONSTER_MODELS, DEMOBAT_MODEL_ID, modelUrlFor } from "@/lib/jupiter2/models";
import { prefetchHawkins } from "@/lib/hawkins/loader";
import { preloadGlb } from "@/app/hollow-earth/model-loader";

// R3F scene loads client-side only (WebGL).
const Jupiter2Scene = dynamic(() => import("@/components/jupiter2/Jupiter2Scene"), {
  ssr: false,
  loading: () => (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#e8a35c", letterSpacing: 3, fontSize: 12 }}>
      ENTERING THE STORM…
    </div>
  ),
});

const ACCENT = "#e8a35c";
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

export default function Jupiter2Page() {
  const inputRef = useRef({ keys: { fwd: false, back: false, left: false, right: false, up: false, down: false, boost: false } });
  const jumpRef = useRef(false);
  const [time, setTime] = useState(0.32);
  // Day/night (the shared law, same as Mars): the clock runs on REAL
  // time by default — timeOfDay01 for the walker's place (real
  // location when granted, Sydney when not), refreshed every 10 s.
  // The slider and presets still work: touching either one takes
  // the clock manual, and REAL TIME hands it back.
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
  const [mode, setMode] = useState("walk"); // walk | orbit — Jupiter 2 is street level first
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    document.title = "Jupiter 2 — Inside the Storm";
  }, []);

  // Warm the creature downloads before the scene mounts, so the
  // first monsters and bats appear from cache, not cold fetch.
  useEffect(() => {
    prefetchHawkins(DEMOBAT_MODEL_ID);
    LIGHTNING_MONSTER_MODELS.forEach((m) => preloadGlb(modelUrlFor(m.key)));
  }, []);

  function select(sel) {
    setSelected(sel || null);
  }

  function toggleMode(m) {
    setMode((prev) => (prev === m ? "walk" : m));
  }

  const presets = [["Dawn", 0.26], ["Day", 0.5], ["Dusk", 0.72], ["Night", 0.95]];

  return (
    <main className="jupiter2">
      <div className="jupiter2-bg" aria-hidden="true" />
      <style>{`
        .jupiter2 { min-height: 100dvh; background: #120806; color: #f6e8da; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; display: flex; flex-direction: column; position: relative; }
        .jupiter2-bg { position: fixed; inset: 0; z-index: 0; pointer-events: none;
          background: radial-gradient(120% 90% at 50% 0%, #3a2410 0%, #22100a 45%, #120806 100%); }
        .jupiter2 > *:not(.jupiter2-bg) { position: relative; z-index: 1; }
        .jupiter2 header { padding: 18px 20px 10px; }
        .jupiter2 .kicker { font-size: 11px; letter-spacing: 4px; color: ${ACCENT}; text-transform: uppercase; }
        .jupiter2 h1 { margin: 4px 0 2px; font-size: clamp(1.6rem, 5vw, 2.6rem); letter-spacing: 6px; font-weight: 800; }
        .jupiter2 .sub { color: #c99a78; font-size: 0.9rem; max-width: 60ch; }
        .jupiter2 .stage { position: relative; margin: 10px 16px 0; border: 1px solid #5a3220; border-radius: 14px; overflow: hidden; height: min(62dvh, 560px); min-height: 320px; background: #000; }
        .jupiter2 .stage canvas { touch-action: none; }
        .jupiter2 .panel { position: absolute; left: 12px; bottom: 12px; right: 12px; max-width: 430px; z-index: 5;
          background: linear-gradient(rgba(16,7,3,0.93), rgba(16,7,3,0.93)); border: 1px solid ${ACCENT}; border-radius: 10px; padding: 14px 16px; }
        .jupiter2 .panel h2 { margin: 0 0 6px; font-size: 1.05rem; letter-spacing: 2px; color: ${ACCENT}; }
        .jupiter2 .panel p { margin: 0 0 6px; font-size: 0.88rem; line-height: 1.5; color: #f0dcc8; }
        .jupiter2 .panel .meta { font-size: 0.78rem; letter-spacing: 1px; color: #c99a78; text-transform: uppercase; }
        .jupiter2 .controls { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; padding: 14px 20px; }
        .jupiter2 .ctl { display: flex; align-items: center; gap: 10px; font-size: 0.8rem; letter-spacing: 1px; color: #c99a78; }
        .jupiter2 input[type="range"] { width: 150px; accent-color: ${ACCENT}; }
        .jupiter2 button { min-height: 44px; min-width: 44px; padding: 10px 16px; border-radius: 8px; border: 1px solid #5a3220; background: #1c0d06; color: #f6e8da; font-size: 0.8rem; letter-spacing: 1px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
        .jupiter2 button.on { background: ${ACCENT}; border-color: ${ACCENT}; color: #160a04; font-weight: 700; }
        .jupiter2 .clock { font-variant-numeric: tabular-nums; color: #fff; font-weight: 700; }
        .jupiter2 .world { margin: 0 16px 20px; border: 1px solid #5a3220; border-radius: 14px; padding: 16px 18px; background: rgba(20,9,4,0.72); }
        .jupiter2 .world h3 { margin: 0 0 4px; font-size: 0.95rem; letter-spacing: 3px; color: ${ACCENT}; }
        .jupiter2 .world .biome { color: #e8b48a; font-size: 0.85rem; letter-spacing: 1px; margin-bottom: 10px; }
        .jupiter2 .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
        .jupiter2 .chip { border: 1px solid #5a3220; border-radius: 999px; padding: 5px 12px; font-size: 0.75rem; letter-spacing: 1px; color: #f0dcc8; background: #1c0d06; }
        .jupiter2 .chip b { color: ${ACCENT}; }
        .jupiter2 .vitals { font-size: 0.82rem; color: #c99a78; letter-spacing: 1px; line-height: 1.7; }
        .jupiter2 .species { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; }
        .jupiter2 .species .row { display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: baseline; border-top: 1px solid #3a2013; padding-top: 8px; font-size: 0.85rem; }
        .jupiter2 .species .name { font-weight: 700; color: #ffe3cc; }
        .jupiter2 .species .niche { color: ${ACCENT}; font-size: 0.75rem; letter-spacing: 1px; text-transform: uppercase; }
        .jupiter2 .species .diet { color: #c99a78; font-size: 0.8rem; }
      `}</style>

      <header>
        <div className="kicker">ARES // OLYMPUS SURFACE PROGRAM</div>
        <h1>JUPITER 2</h1>
        <div className="sub">Inside the storm — you stand on the cloud deck at street level, wind and driving rain around you, lightning cracking overhead. Summon your speeder, watch the lightning monsters on the deck and the demobats above, and follow the green beacon to the oblivion lever.</div>
      </header>

      <div className="stage">
        <Jupiter2Scene
          timeOfDay={time}
          mode={mode}
          inputRef={inputRef}
          onSelect={select}
          selectedId={selected ? selected.id : null}
          jumpRef={jumpRef}
        />
        {/* Jump (Merlin, Nov 15, 2026 — same gravity logic as the
            Moon): walk mode only, hidden while a creature panel is
            open (the panel owns the bottom of the stage). A press
            while riding is swallowed by the scene. Bottom-right,
            the Moon's button, Jupiter colours. */}
        {mode === 'walk' && !selected && (
          <button
            aria-label="Jump"
            onPointerDown={() => { jumpRef.current = true; }}
            style={{
              position: 'absolute', right: 12, bottom: 12, zIndex: 6,
              width: 76, height: 76, borderRadius: '50%',
              border: '2px solid #e8a35c', background: 'rgba(232,163,92,0.25)',
              color: '#e8a35c', fontWeight: 800, fontSize: 15, cursor: 'pointer', touchAction: 'none',
            }}
          >
            JUMP
          </button>
        )}
        {selected && (
          <div className="panel" role="dialog" aria-label={selected.name}>
            <h2>{selected.name}</h2>
            <div className="meta">{selected.niche} · {selected.stage} · {selected.activity}</div>
            <p>Diet: {selected.diet}</p>
            <p>{selected.habit}</p>
            <button onClick={() => select(null)} aria-label="Close creature panel"><IcClose /><span>Close</span></button>
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
        <button className={mode === "orbit" ? "on" : ""} onClick={() => toggleMode("orbit")} aria-pressed={mode === "orbit"}>
          <IcCloudRain /><span>{mode === "orbit" ? "ORBITING" : "ORBIT"}</span>
        </button>
      </div>

      <section className="world" aria-label="World profile">
        <h3>JUPITER 2 — THE STORM DECK</h3>
        <div className="biome">Gas-giant storm surface · Seed {JUPITER2_SEED}</div>
        <div className="chips">
          <span className="chip">LIGHTNING MONSTERS <b>{LIGHTNING_MONSTER_COUNT}</b></span>
          <span className="chip">DEMOBATS <b>{DEMOBAT_COUNT}</b></span>
          <span className="chip">SPEEDER <b>SUMMONABLE</b></span>
          <span className="chip">OBLIVION LEVER <b>GREEN BEACON</b></span>
        </div>
        <div className="vitals">
          GRAVITY 2.53 G · SURFACE −108 °C · ATMOSPHERE 1.0 atm at the cloud deck<br />
          WALK 6 m/s · SPEEDER 28 m/s (BOOST ×1.5) · STORM VISIBILITY SHORT BY DESIGN — FOLLOW THE GREEN BEACON
        </div>
        <div className="species">
          <div className="row">
            <span className="name">Lightning Monster</span>
            <span className="niche">Surface</span>
            <span className="diet">Feeds on storm charge — drinks lightning, grazes the charged cloud deck.</span>
          </div>
          <div className="row">
            <span className="name">Demobat</span>
            <span className="niche">Air</span>
            <span className="diet">Feeds on storm moths and wind-borne charge in the upper storm.</span>
          </div>
          <div className="row">
            <span className="name">Oblivion Lever</span>
            <span className="niche">Green beacon</span>
            <span className="diet"><IcBolt /> Pulling it warns first — only an explicit confirm arms oblivion.</span>
          </div>
        </div>
      </section>
    </main>
  );
}
