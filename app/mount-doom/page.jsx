"use client";

import { useEffect, useRef, useState } from "react";
import { createScene, HOTSPOTS, ACCENT, timeLabel, timeString } from "./scene";

export default function MountDoomPage() {
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const [time, setTime] = useState(0.72);
  const [intensity, setIntensity] = useState(70);
  const [fly, setFly] = useState(false);
  const [hotspot, setHotspot] = useState(null);

  useEffect(() => {
    document.title = "Mount Doom — ARGUS Observatory";
    const s = createScene(canvasRef.current, { onHotspot: setHotspot });
    sceneRef.current = s;
    return () => s.destroy();
  }, []);

  useEffect(() => { sceneRef.current && sceneRef.current.setTime(time); }, [time]);
  useEffect(() => { sceneRef.current && sceneRef.current.setIntensity(intensity / 100); }, [intensity]);
  useEffect(() => { sceneRef.current && sceneRef.current.setFly(fly); }, [fly]);

  function select(h) {
    setHotspot(h);
    if (h) sceneRef.current && sceneRef.current.focus(h);
    else sceneRef.current && sceneRef.current.clearSelection();
  }

  const presets = [["Dawn", 0.26], ["Day", 0.5], ["Dusk", 0.72], ["Night", 0.95]];

  return (
    <main className="argus">
      <style>{`
        .argus { min-height: 100dvh; background: #05040a; color: #f5e9dd; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; display: flex; flex-direction: column; }
        .argus header { padding: 18px 20px 10px; }
        .argus .kicker { font-size: 11px; letter-spacing: 4px; color: ${ACCENT}; text-transform: uppercase; }
        .argus h1 { margin: 4px 0 2px; font-size: clamp(1.6rem, 5vw, 2.6rem); letter-spacing: 6px; font-weight: 800; }
        .argus .sub { color: #b9a894; font-size: 0.9rem; }
        .argus .stage { position: relative; margin: 10px 16px 0; border: 1px solid #3a2a22; border-radius: 14px; overflow: hidden; height: min(62dvh, 560px); min-height: 320px; background: #000; }
        .argus canvas { width: 100%; height: 100%; display: block; touch-action: none; cursor: grab; }
        .argus canvas:active { cursor: grabbing; }
        .argus .panel { position: absolute; left: 12px; bottom: 12px; right: 12px; max-width: 430px; background: rgba(8,5,4,0.92); border: 1px solid ${ACCENT}; border-radius: 10px; padding: 14px 16px; }
        .argus .panel h2 { margin: 0 0 6px; font-size: 1.05rem; letter-spacing: 2px; color: ${ACCENT}; }
        .argus .panel p { margin: 0 0 10px; font-size: 0.88rem; line-height: 1.5; color: #e8d9c6; }
        .argus .controls { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; padding: 14px 20px; }
        .argus .ctl { display: flex; align-items: center; gap: 10px; font-size: 0.8rem; letter-spacing: 1px; color: #cbb59d; }
        .argus input[type="range"] { width: 150px; accent-color: ${ACCENT}; }
        .argus button { min-height: 44px; min-width: 44px; padding: 10px 16px; border-radius: 8px; border: 1px solid #4a3628; background: #140d0a; color: #f5e9dd; font-size: 0.8rem; letter-spacing: 1px; cursor: pointer; }
        .argus button.on { background: ${ACCENT}; border-color: ${ACCENT}; color: #0a0503; font-weight: 700; }
        .argus .clock { font-variant-numeric: tabular-nums; color: #fff; font-weight: 700; }
        .argus .sites { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 20px 20px; }
        .argus .sites button { border-color: #333; background: #0d0b12; }
        @media (prefers-reduced-motion: reduce) { .argus canvas { cursor: default; } }
      `}</style>

      <header>
        <div className="kicker">ARGUS // Observatory</div>
        <h1>MOUNT DOOM</h1>
        <div className="sub">Orodruin — the fire-mountain. Drag to pan, scroll or pinch to zoom, tap a marker for intel.</div>
      </header>

      <div className="stage">
        <canvas ref={canvasRef} aria-label="Interactive panorama of Mount Doom" />
        {hotspot && (
          <div className="panel" role="dialog" aria-label={hotspot.title}>
            <h2>{hotspot.title}</h2>
            <p>{hotspot.body}</p>
            <button onClick={() => select(null)}>Close</button>
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
        {presets.map(([label, t]) => (
          <button key={label} onClick={() => setTime(t)}>{label}</button>
        ))}
        <div className="ctl">
          <span>ERUPTION</span>
          <input type="range" min="0" max="100" value={intensity}
            onChange={(e) => setIntensity(Number(e.target.value))} aria-label="Eruption intensity" />
        </div>
        <button className={fly ? "on" : ""} onClick={() => setFly(!fly)} aria-pressed={fly}>
          {fly ? "FLYTHROUGH ON" : "FLYTHROUGH"}
        </button>
      </div>

      <div className="sites" aria-label="Sites of interest">
        {HOTSPOTS.map((h) => (
          <button key={h.id} onClick={() => select(h)}>◆ {h.title}</button>
        ))}
      </div>
      {/* Safari bottom-bar clearance */}
      <div aria-hidden="true" className="h-[max(5rem,env(safe-area-inset-bottom))]" />
    </main>
  );
}
