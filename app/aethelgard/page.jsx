"use client";

import { useEffect, useRef, useState } from "react";
import { createScene, HOTSPOTS, SEASONS, ACCENT, timeLabel, timeString } from "./scene";

export default function AethelgardPage() {
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const [time, setTime] = useState(0.32);
  const [season, setSeason] = useState(1);
  const [fly, setFly] = useState(false);
  const [hotspot, setHotspot] = useState(null);

  useEffect(() => {
    document.title = "Aethelgard — ARGUS Observatory";
    const s = createScene(canvasRef.current, { onHotspot: setHotspot });
    sceneRef.current = s;
    return () => s.destroy();
  }, []);

  useEffect(() => { sceneRef.current && sceneRef.current.setTime(time); }, [time]);
  useEffect(() => { sceneRef.current && sceneRef.current.setSeason(season); }, [season]);
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
        .argus { min-height: 100dvh; background: #060a08; color: #eef2e6; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; display: flex; flex-direction: column; }
        .argus header { padding: 18px 20px 10px; }
        .argus .kicker { font-size: 11px; letter-spacing: 4px; color: ${ACCENT}; text-transform: uppercase; }
        .argus h1 { margin: 4px 0 2px; font-size: clamp(1.6rem, 5vw, 2.6rem); letter-spacing: 6px; font-weight: 800; }
        .argus .sub { color: #a8b89a; font-size: 0.9rem; max-width: 60ch; }
        .argus .stage { position: relative; margin: 10px 16px 0; border: 1px solid #3a4432; border-radius: 14px; overflow: hidden; height: min(62dvh, 560px); min-height: 320px; background: #000; }
        .argus canvas { width: 100%; height: 100%; display: block; touch-action: none; cursor: grab; }
        .argus canvas:active { cursor: grabbing; }
        .argus .panel { position: absolute; left: 12px; bottom: 12px; right: 12px; max-width: 430px; background: rgba(8,10,6,0.93); border: 1px solid ${ACCENT}; border-radius: 10px; padding: 14px 16px; }
        .argus .panel h2 { margin: 0 0 6px; font-size: 1.05rem; letter-spacing: 2px; color: ${ACCENT}; }
        .argus .panel p { margin: 0 0 10px; font-size: 0.88rem; line-height: 1.5; color: #e2e8d4; }
        .argus .controls { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; padding: 14px 20px; }
        .argus .ctl { display: flex; align-items: center; gap: 10px; font-size: 0.8rem; letter-spacing: 1px; color: #a8b89a; }
        .argus input[type="range"] { width: 150px; accent-color: ${ACCENT}; }
        .argus button { min-height: 44px; min-width: 44px; padding: 10px 16px; border-radius: 8px; border: 1px solid #3a4432; background: #0c100a; color: #eef2e6; font-size: 0.8rem; letter-spacing: 1px; cursor: pointer; }
        .argus button.on { background: ${ACCENT}; border-color: ${ACCENT}; color: #0d0a04; font-weight: 700; }
        .argus .clock { font-variant-numeric: tabular-nums; color: #fff; font-weight: 700; }
        .argus .sites { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 20px 20px; }
        .argus .sites button { border-color: #3a4432; background: #0c100a; }
        .argus .season-note { padding: 0 20px 20px; font-size: 0.82rem; color: #a8b89a; }
      `}</style>

      <header>
        <div className="kicker">ARGUS // Observatory</div>
        <h1>AETHELGARD</h1>
        <div className="sub">A walled realm beneath the Old Forest. Drag to pan, scroll or pinch to zoom, tap a marker for intel.</div>
      </header>

      <div className="stage">
        <canvas ref={canvasRef} aria-label="Interactive panorama of Aethelgard" />
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
        {SEASONS.map((s, i) => (
          <button key={s.id} className={season === i ? "on" : ""} onClick={() => setSeason(i)} aria-pressed={season === i}>
            {s.name}
          </button>
        ))}
        <button className={fly ? "on" : ""} onClick={() => setFly(!fly)} aria-pressed={fly}>
          {fly ? "FLYTHROUGH ON" : "FLYTHROUGH"}
        </button>
      </div>

      <div className="sites" aria-label="Sites of interest">
        {HOTSPOTS.map((h) => (
          <button key={h.id} onClick={() => select(h)}>◆ {h.title}</button>
        ))}
      </div>
      <div className="season-note" aria-live="polite">{SEASONS[season].desc}</div>
      <div aria-hidden="true" className="player-clear" />
    </main>
  );
}
