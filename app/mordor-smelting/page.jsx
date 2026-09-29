"use client";

import { useEffect, useRef, useState } from "react";
import { createScene, HOTSPOTS, STAGES, ACCENT, timeLabel, timeString } from "./scene";

export default function MordorSmeltingPage() {
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const [time, setTime] = useState(0.95);
  const [cycle, setCycle] = useState(true);
  const [fly, setFly] = useState(false);
  const [hotspot, setHotspot] = useState(null);
  const [stage, setStage] = useState(STAGES[0]);

  useEffect(() => {
    document.title = "Mordor Smelting — ARGUS Observatory";
    const s = createScene(canvasRef.current, { onHotspot: setHotspot });
    sceneRef.current = s;
    return () => s.destroy();
  }, []);

  useEffect(() => { sceneRef.current && sceneRef.current.setTime(time); }, [time]);
  useEffect(() => { sceneRef.current && sceneRef.current.setCycle(cycle); }, [cycle]);
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
        .argus { min-height: 100dvh; background: #070408; color: #f2e4ec; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; display: flex; flex-direction: column; }
        .argus header { padding: 18px 20px 10px; }
        .argus .kicker { font-size: 11px; letter-spacing: 4px; color: ${ACCENT}; text-transform: uppercase; }
        .argus h1 { margin: 4px 0 2px; font-size: clamp(1.6rem, 5vw, 2.6rem); letter-spacing: 6px; font-weight: 800; }
        .argus .sub { color: #b89aa8; font-size: 0.9rem; max-width: 60ch; }
        .argus .stage { position: relative; margin: 10px 16px 0; border: 1px solid #3d2430; border-radius: 14px; overflow: hidden; height: min(62dvh, 560px); min-height: 320px; background: #000; }
        .argus canvas { width: 100%; height: 100%; display: block; touch-action: none; cursor: grab; }
        .argus canvas:active { cursor: grabbing; }
        .argus .panel { position: absolute; left: 12px; bottom: 12px; right: 12px; max-width: 430px; background: rgba(10,5,9,0.93); border: 1px solid ${ACCENT}; border-radius: 10px; padding: 14px 16px; }
        .argus .panel h2 { margin: 0 0 6px; font-size: 1.05rem; letter-spacing: 2px; color: ${ACCENT}; }
        .argus .panel p { margin: 0 0 10px; font-size: 0.88rem; line-height: 1.5; color: #eedde6; }
        .argus .controls { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; padding: 14px 20px; }
        .argus .ctl { display: flex; align-items: center; gap: 10px; font-size: 0.8rem; letter-spacing: 1px; color: #c79fb2; }
        .argus input[type="range"] { width: 150px; accent-color: ${ACCENT}; }
        .argus button { min-height: 44px; min-width: 44px; padding: 10px 16px; border-radius: 8px; border: 1px solid #4a2a38; background: #160a10; color: #f2e4ec; font-size: 0.8rem; letter-spacing: 1px; cursor: pointer; }
        .argus button.on { background: ${ACCENT}; border-color: ${ACCENT}; color: #0d0408; font-weight: 700; }
        .argus .clock { font-variant-numeric: tabular-nums; color: #fff; font-weight: 700; }
        .argus .sites { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 20px 8px; }
        .argus .sites button { border-color: #3d2430; background: #100810; }
        .argus .pipeline { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 20px 20px; align-items: stretch; }
        .argus .pstep { flex: 1 1 200px; border: 1px solid #3d2430; border-radius: 10px; padding: 12px 14px; background: #0d070c; cursor: pointer; text-align: left; }
        .argus .pstep h3 { margin: 0 0 4px; font-size: 0.85rem; letter-spacing: 2px; color: ${ACCENT}; }
        .argus .pstep p { margin: 0; font-size: 0.8rem; color: #c9aebc; line-height: 1.45; }
        .argus .pstep.sel { border-color: ${ACCENT}; background: #1a0c14; }
      `}</style>

      <header>
        <div className="kicker">ARGUS // Observatory</div>
        <h1>MORDOR SMELTING</h1>
        <div className="sub">The coastal foundry that turns the world's waste into Karbonite. Drag to pan, scroll or pinch to zoom, tap a marker for intel.</div>
      </header>

      <div className="stage">
        <canvas ref={canvasRef} aria-label="Interactive panorama of the Mordor smelting facility" />
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
        <button className={cycle ? "on" : ""} onClick={() => setCycle(!cycle)} aria-pressed={cycle}>
          SMELT CYCLE {cycle ? "ON" : "OFF"}
        </button>
        <button className={fly ? "on" : ""} onClick={() => setFly(!fly)} aria-pressed={fly}>
          {fly ? "FLYTHROUGH ON" : "FLYTHROUGH"}
        </button>
      </div>

      <div className="sites" aria-label="Sites of interest">
        {HOTSPOTS.map((h) => (
          <button key={h.id} onClick={() => select(h)}>◆ {h.title}</button>
        ))}
      </div>

      <div className="pipeline" aria-label="Smelting pipeline">
        {STAGES.map((s) => (
          <button key={s.id} className={"pstep" + (stage.id === s.id ? " sel" : "")} onClick={() => setStage(s)}>
            <h3>{s.label}</h3>
            <p>{s.desc}</p>
          </button>
        ))}
      </div>
      {/* Safari bottom-bar clearance */}
      <div aria-hidden="true" className="h-[calc(4.5rem+env(safe-area-inset-bottom))]" />
    </main>
  );
}
