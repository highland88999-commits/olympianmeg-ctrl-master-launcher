"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { HOTSPOTS, SEASONS, ACCENT, timeLabel, timeString } from "@/lib/aethelgard/data";
import { IcSunrise, IcSun, IcSunset, IcMoon, IcWings, IcClose, IcMarker, IcSprout, IcSnowflake, IcRoute } from "@/app/artemis-ui/icons";

// R3F scene loads client-side only (WebGL).
const RainforestScene = dynamic(() => import("@/components/aethelgard/RainforestScene"), {
  ssr: false,
  loading: () => (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#7ddf9a", letterSpacing: 3, fontSize: 12 }}>
      GROWING THE RAINFOREST…
    </div>
  ),
});

const PRESET_ICONS = [IcSunrise, IcSun, IcSunset, IcMoon];
// rainforest moods: WET, DRY, BLOOM, MIST
const SEASON_ICONS = [IcSnowflake, IcSun, IcSprout, IcMoon];

export default function AethelgardPage() {
  const inputRef = useRef({ keys: { fwd: false, back: false, left: false, right: false, up: false, down: false } });
  const [time, setTime] = useState(0.32);
  const [season, setSeason] = useState(1);
  const [mode, setMode] = useState("orbit"); // orbit | walk | fly
  const [hotspot, setHotspot] = useState(null);
  const [focusReq, setFocusReq] = useState(null);

  useEffect(() => {
    document.title = "Aethelgard — Pocket Rainforest";
  }, []);

  function select(h) {
    setHotspot(h || null);
    if (h) setFocusReq({ id: h.id, nonce: Date.now() });
  }

  function onMarker(id) {
    const h = HOTSPOTS.find((x) => x.id === id) || null;
    select(h);
  }

  function toggleMode(m) {
    setMode((prev) => (prev === m ? "orbit" : m));
  }

  const presets = [["Dawn", 0.26], ["Day", 0.5], ["Dusk", 0.72], ["Night", 0.95]];

  return (
    <main className="argus">
      <div className="argus-bg" aria-hidden="true" />
      <style>{`
        .argus { min-height: 100dvh; background: #060a08; color: #eef2e6; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; display: flex; flex-direction: column; position: relative; }
        .argus-bg { position: fixed; inset: 0; z-index: 0; pointer-events: none; opacity: 0.38;
          background-image: linear-gradient(to bottom, rgba(6,10,8,0.6), rgba(6,10,8,0.2) 45%, rgba(6,10,8,0.8)), url(/images/aethelgard/bg.webp);
          background-size: cover; background-position: center; }
        .argus > *:not(.argus-bg) { position: relative; z-index: 1; }
        .argus header { padding: 18px 20px 10px; }
        .argus .kicker { font-size: 11px; letter-spacing: 4px; color: ${ACCENT}; text-transform: uppercase; }
        .argus h1 { margin: 4px 0 2px; font-size: clamp(1.6rem, 5vw, 2.6rem); letter-spacing: 6px; font-weight: 800; }
        .argus .sub { color: #a8b89a; font-size: 0.9rem; max-width: 60ch; }
        .argus .stage { position: relative; margin: 10px 16px 0; border: 1px solid #3a4432; border-radius: 14px; overflow: hidden; height: min(62dvh, 560px); min-height: 320px; background: #000; }
        .argus .stage canvas { touch-action: none; }
        .argus .panel { position: absolute; left: 12px; bottom: 12px; right: 12px; max-width: 430px; z-index: 5;
          background-image: linear-gradient(rgba(8,10,6,0.92), rgba(8,10,6,0.92)), url(/images/aethelgard/tile.webp);
          background-size: auto, 160px; border: 1px solid ${ACCENT}; border-radius: 10px; padding: 14px 16px; }
        .argus .panel h2 { margin: 0 0 6px; font-size: 1.05rem; letter-spacing: 2px; color: ${ACCENT}; }
        .argus .panel p { margin: 0 0 10px; font-size: 0.88rem; line-height: 1.5; color: #e2e8d4; }
        .argus .controls { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; padding: 14px 20px; }
        .argus .ctl { display: flex; align-items: center; gap: 10px; font-size: 0.8rem; letter-spacing: 1px; color: #a8b89a; }
        .argus input[type="range"] { width: 150px; accent-color: ${ACCENT}; }
        .argus button { min-height: 44px; min-width: 44px; padding: 10px 16px; border-radius: 8px; border: 1px solid #3a4432; background: #0c100a; color: #eef2e6; font-size: 0.8rem; letter-spacing: 1px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
        .argus button.on { background: ${ACCENT}; border-color: ${ACCENT}; color: #0d0a04; font-weight: 700; }
        .argus .clock { font-variant-numeric: tabular-nums; color: #fff; font-weight: 700; }
        .argus .sites { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 20px 20px; }
        .argus .sites button { border-color: #3a4432; background: #0c100a; }
        .argus .season-note { padding: 0 20px 20px; font-size: 0.82rem; color: #a8b89a; }
      `}</style>

      <header>
        <div className="kicker">ARGUS // Pocket Universe</div>
        <h1>AETHELGARD</h1>
        <div className="sub">A pocket rainforest universe. Drag to orbit, walk the forest floor, or fly the canopy — tap a marker for intel.</div>
      </header>

      <div className="stage">
        <RainforestScene
          mode={mode}
          timeOfDay={time}
          seasonIdx={season}
          inputRef={inputRef}
          focusReq={focusReq}
          onHotspot={onMarker}
          activeId={hotspot ? hotspot.id : null}
        />
        {hotspot && (
          <div className="panel" role="dialog" aria-label={hotspot.title}>
            <h2>{hotspot.title}</h2>
            <p>{hotspot.body}</p>
            <button onClick={() => select(null)} aria-label="Close site panel"><IcClose /><span>Close</span></button>
          </div>
        )}
      </div>

      <div className="controls">
        <div className="ctl">
          <span>TIME</span>
          <input type="range" min="0" max="1000" value={Math.round(time * 1000)}
            onChange={(e) => setTime(Number(e.target.value) / 1000)} aria-label="Time of day" />
          <span className="clock">{timeString(time)} · {timeLabel(time)}</span>
        </div>
        {presets.map(([label, t], i) => {
          const Icon = PRESET_ICONS[i % PRESET_ICONS.length];
          return (
            <button key={label} onClick={() => setTime(t)} aria-label={`Set time to ${label}`}>
              <Icon /><span>{label}</span>
            </button>
          );
        })}
        {SEASONS.map((s, i) => {
          const SIcon = SEASON_ICONS[i % SEASON_ICONS.length];
          return (
            <button key={s.id} className={season === i ? "on" : ""} onClick={() => setSeason(i)} aria-pressed={season === i} aria-label={`Set season to ${s.name}`}>
              <SIcon /><span>{s.name}</span>
            </button>
          );
        })}
        <button className={mode === "walk" ? "on" : ""} onClick={() => toggleMode("walk")} aria-pressed={mode === "walk"}>
          <IcRoute /><span>{mode === "walk" ? "WALKING" : "WALK"}</span>
        </button>
        <button className={mode === "fly" ? "on" : ""} onClick={() => toggleMode("fly")} aria-pressed={mode === "fly"}>
          <IcWings /><span>{mode === "fly" ? "FLYING" : "FLY"}</span>
        </button>
      </div>

      <div className="sites" aria-label="Sites of interest">
        {HOTSPOTS.map((h) => (
          <button key={h.id} onClick={() => select(h)} aria-label={`View ${h.title}`}><IcMarker /><span>{h.title}</span></button>
        ))}
      </div>
      <div className="season-note" aria-live="polite">{SEASONS[season].desc}</div>
      <div aria-hidden="true" className="player-clear" />
    </main>
  );
}
