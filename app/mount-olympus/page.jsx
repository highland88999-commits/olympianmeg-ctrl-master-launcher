"use client";

import { useEffect, useRef, useState } from "react";
import { createScene, HOTSPOTS, ACCENT, timeLabel, timeString } from "./scene";
import { IcSunrise, IcSun, IcSunset, IcMoon, IcWings, IcClose, IcMarker } from "@/app/artemis-ui/icons";

const PRESET_ICONS = [IcSunrise, IcSun, IcSunset, IcMoon];

export default function MountOlympusPage() {
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const [time, setTime] = useState(0.3);
  const [snowfall, setSnowfall] = useState(40);
  const [fly, setFly] = useState(false);
  const [hotspot, setHotspot] = useState(null);

  useEffect(() => {
    document.title = "Mount Olympus — ARGUS Observatory";
    const s = createScene(canvasRef.current, { onHotspot: setHotspot });
    sceneRef.current = s;
    return () => s.destroy();
  }, []);

  useEffect(() => { sceneRef.current && sceneRef.current.setTime(time); }, [time]);
  useEffect(() => { sceneRef.current && sceneRef.current.setSnowfall(snowfall / 100); }, [snowfall]);
  useEffect(() => { sceneRef.current && sceneRef.current.setFly(fly); }, [fly]);

  function select(h) {
    setHotspot(h);
    if (h) sceneRef.current && sceneRef.current.focus(h);
    else sceneRef.current && sceneRef.current.clearSelection();
  }

  const presets = [["Dawn", 0.26], ["Day", 0.5], ["Dusk", 0.72], ["Night", 0.95]];

  return (
    <main className="argus">
      <div className="argus-bg" aria-hidden="true" />
      <style>{`
        .argus { min-height: 100dvh; background: #04060e; color: #eef3fa; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; display: flex; flex-direction: column; position: relative; }
        .argus-bg { position: fixed; inset: 0; z-index: 0; pointer-events: none; opacity: 0.38;
          background-image: linear-gradient(to bottom, rgba(4,6,14,0.6), rgba(4,6,14,0.2) 45%, rgba(4,6,14,0.8)), url(/images/mount-olympus/bg.webp);
          background-size: cover; background-position: center; }
        .argus > *:not(.argus-bg) { position: relative; z-index: 1; }
        .argus header { padding: 18px 20px 10px; }
        .argus .kicker { font-size: 11px; letter-spacing: 4px; color: ${ACCENT}; text-transform: uppercase; }
        .argus h1 { margin: 4px 0 2px; font-size: clamp(1.6rem, 5vw, 2.6rem); letter-spacing: 6px; font-weight: 800; }
        .argus .sub { color: #9fb0cc; font-size: 0.9rem; }
        .argus .stage { position: relative; margin: 10px 16px 0; border: 1px solid #2a3a55; border-radius: 14px; overflow: hidden; height: min(62dvh, 560px); min-height: 320px; background: #000; }
        .argus canvas { width: 100%; height: 100%; display: block; touch-action: none; cursor: grab; }
        .argus canvas:active { cursor: grabbing; }
        .argus .panel { position: absolute; left: 12px; bottom: 12px; right: 12px; max-width: 430px;
          background-image: linear-gradient(rgba(6,10,20,0.92), rgba(6,10,20,0.92)), url(/images/mount-olympus/tile.webp);
          background-size: auto, 160px; border: 1px solid ${ACCENT}; border-radius: 10px; padding: 14px 16px; }
        .argus .panel h2 { margin: 0 0 6px; font-size: 1.05rem; letter-spacing: 2px; color: ${ACCENT}; }
        .argus .panel p { margin: 0 0 10px; font-size: 0.88rem; line-height: 1.5; color: #dbe6f5; }
        .argus .controls { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; padding: 14px 20px; }
        .argus .ctl { display: flex; align-items: center; gap: 10px; font-size: 0.8rem; letter-spacing: 1px; color: #9fb0cc; }
        .argus input[type="range"] { width: 150px; accent-color: ${ACCENT}; }
        .argus button { min-height: 44px; min-width: 44px; padding: 10px 16px; border-radius: 8px; border: 1px solid #33455f; background: #0b1220; color: #eef3fa; font-size: 0.8rem; letter-spacing: 1px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
        .argus button.on { background: ${ACCENT}; border-color: ${ACCENT}; color: #0a0800; font-weight: 700; }
        .argus .clock { font-variant-numeric: tabular-nums; color: #fff; font-weight: 700; }
        .argus .sites { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 20px 20px; }
        .argus .sites button { border-color: #2a3a55; background: #0a0f1c; }
      `}</style>

      <header>
        <div className="kicker">ARGUS // Observatory</div>
        <h1>MOUNT OLYMPUS</h1>
        <div className="sub">The home of the gods, 2,918 m above the Aegean. Drag to pan, scroll or pinch to zoom, tap a marker for intel.</div>
      </header>

      <div className="stage">
        <canvas ref={canvasRef} aria-label="Interactive panorama of Mount Olympus" />
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
        <div className="ctl">
          <span>SNOWFALL</span>
          <input type="range" min="0" max="100" value={snowfall}
            onChange={(e) => setSnowfall(Number(e.target.value))} aria-label="Snowfall amount" />
        </div>
        <button className={fly ? "on" : ""} onClick={() => setFly(!fly)} aria-pressed={fly}>
          <IcWings /><span>{fly ? "FLYTHROUGH ON" : "FLYTHROUGH"}</span>
        </button>
      </div>

      <div className="sites" aria-label="Sites of interest">
        {HOTSPOTS.map((h) => (
          <button key={h.id} onClick={() => select(h)} aria-label={`View ${h.title}`}><IcMarker /><span>{h.title}</span></button>
        ))}
      </div>
      {/* Safari bottom-bar clearance */}
      <div aria-hidden="true" className="player-clear" />
    </main>
  );
}
