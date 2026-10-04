"use client";

import { useEffect, useRef, useState } from "react";
import { createScene, HOTSPOTS, ACCENT, timeLabel, timeString } from "./scene";

const NOISE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 0.72 0 0 0 0 0.42 0 0 0 0.07 0'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E";

function Glyph({ size = 15, children }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ flexShrink: 0 }}>{children}</svg>
  );
}

const IC = {
  flame: <path d="M12 2c1 4-4 6-4 11a4 4 0 0 0 8 0c0-2-1-3-1-3s3 1 3 5a6 6 0 0 1-12 0C6 8 12 6 12 2z" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  fly: <><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4z" /></>,
  pin: <><path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></>,
  x: <path d="M6 6l12 12M18 6L6 18" />,
};

export default function MountDoomPage() {
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const [time, setTime] = useState(0.72);
  const [intensity, setIntensity] = useState(70);
  const [fly, setFly] = useState(false);
  const [hotspot, setHotspot] = useState(null);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    document.title = "Mount Doom — ARGUS Observatory";
    const s = createScene(canvasRef.current, { onHotspot: setHotspot });
    sceneRef.current = s;
    setBooted(true);
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
        .argus { min-height: 100dvh; background: #05040a; color: #f5e9dd; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; display: flex; flex-direction: column; position: relative; }
        .argus-bg { position: fixed; inset: 0; z-index: 0; pointer-events: none; }
        .argus-bg img { width: 100%; height: 100%; object-fit: cover; opacity: 0.22; }
        .argus-scrim { position: fixed; inset: 0; z-index: 0; pointer-events: none;
          background: linear-gradient(180deg, rgba(5,4,10,0.72) 0%, rgba(5,4,10,0.4) 35%, rgba(5,4,10,0.9) 100%); }
        .argus > header, .argus > .stage, .argus > .controls, .argus > .sites { position: relative; z-index: 1; }
        .argus header { padding: 0; }
        .argus-hero { position: absolute; inset: 0; overflow: hidden; }
        .argus-hero img { width: 100%; height: 100%; object-fit: cover; opacity: 0.5; }
        .argus-hero::after { content: ''; position: absolute; inset: 0;
          background: linear-gradient(180deg, rgba(5,4,10,0.45) 0%, rgba(5,4,10,0.92) 100%); }
        .argus-hero-wrap { position: relative; padding: 18px 20px 14px; }
        .argus .kicker { font-size: 11px; letter-spacing: 4px; color: ${ACCENT}; text-transform: uppercase; }
        .argus h1 { margin: 4px 0 2px; font-size: clamp(1.6rem, 5vw, 2.6rem); letter-spacing: 6px; font-weight: 800; }
        .argus .sub { color: #b9a894; font-size: 0.9rem; }
        .argus .stage { position: relative; margin: 10px 16px 0; border: 1px solid #3a2a22; border-radius: 14px; overflow: hidden; height: min(62dvh, 560px); min-height: 320px; background: #000; }
        .argus canvas { width: 100%; height: 100%; display: block; touch-action: none; cursor: grab; }
        .argus canvas:active { cursor: grabbing; }
        .argus .panel { position: absolute; left: 12px; bottom: 12px; right: 12px; max-width: 430px; background-color: rgba(8,5,4,0.92); background-image: url("${NOISE}"); background-size: 140px 140px; border: 1px solid ${ACCENT}; border-radius: 10px; padding: 14px 16px; }
        .argus .panel h2 { margin: 0 0 6px; font-size: 1.05rem; letter-spacing: 2px; color: ${ACCENT}; }
        .argus .panel p { margin: 0 0 10px; font-size: 0.88rem; line-height: 1.5; color: #e8d9c6; }
        .argus .controls { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; padding: 14px 20px; }
        .argus .ctl { display: flex; align-items: center; gap: 10px; font-size: 0.8rem; letter-spacing: 1px; color: #cbb59d; }
        .argus input[type="range"] { width: 150px; accent-color: ${ACCENT}; }
        .argus button { min-height: 44px; min-width: 44px; padding: 10px 16px; border-radius: 8px; border: 1px solid #4a3628; background: #140d0a; color: #f5e9dd; font-size: 0.8rem; letter-spacing: 1px; cursor: pointer; }
        .argus button.on { background: ${ACCENT}; border-color: ${ACCENT}; color: #0a0503; font-weight: 700; }
        .argus .controls button, .argus .sites button, .argus .panel button { display: inline-flex; align-items: center; gap: 8px; justify-content: center; }
        .argus .controls { background-color: rgba(8,5,4,0.55); background-image: url("${NOISE}"); background-size: 140px 140px; border-top: 1px solid rgba(255,90,31,0.2); border-bottom: 1px solid rgba(255,90,31,0.2); }
        .argus-boot { position: absolute; inset: 0; z-index: 5; display: flex; align-items: center; justify-content: center; gap: 10px;
          background: rgba(5,3,4,0.85); color: #fdba74; font-size: 0.8rem; letter-spacing: 3px; text-transform: uppercase;
          animation: doom-pulse 1.6s ease-in-out infinite; }
        @keyframes doom-pulse { 0%,100% { opacity: 0.6; } 50% { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .argus-boot { animation: none; } }
        .argus .clock { font-variant-numeric: tabular-nums; color: #fff; font-weight: 700; }
        .argus .sites { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 20px 20px; }
        .argus .sites button { border-color: #333; background: #0d0b12; }
        @media (prefers-reduced-motion: reduce) { .argus canvas { cursor: default; } }
      `}</style>

      <div className="argus-bg" aria-hidden="true"><img src="/images/mount-doom/mountdoom-bg.webp" alt="" /></div>
      <div className="argus-scrim" aria-hidden="true" />

      <header style={{ position: 'relative', overflow: 'hidden' }}>
        <div className="argus-hero" aria-hidden="true"><img src="/images/mount-doom/mountdoom-bg.webp" alt="" /></div>
        <div className="argus-hero-wrap">
        <div className="kicker">ARGUS // Observatory</div>
        <h1>MOUNT DOOM</h1>
        <div className="sub">Orodruin — the fire-mountain. Drag to pan, scroll or pinch to zoom, tap a marker for intel.</div>
        </div>
      </header>

      <div className="stage">
        <canvas ref={canvasRef} aria-label="Interactive panorama of Mount Doom" />
        {!booted && (
          <div className="argus-boot" role="status">
            <Glyph size={18}>{IC.flame}</Glyph> Waking the mountain…
          </div>
        )}
        {hotspot && (
          <div className="panel" role="dialog" aria-label={hotspot.title}>
            <h2>{hotspot.title}</h2>
            <p>{hotspot.body}</p>
            <button onClick={() => select(null)}><Glyph size={14}>{IC.x}</Glyph>Close</button>
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
          <button key={label} onClick={() => setTime(t)}><Glyph size={14}>{IC.clock}</Glyph>{label}</button>
        ))}
        <div className="ctl">
          <span>ERUPTION</span>
          <input type="range" min="0" max="100" value={intensity}
            onChange={(e) => setIntensity(Number(e.target.value))} aria-label="Eruption intensity" />
        </div>
        <button className={fly ? "on" : ""} onClick={() => setFly(!fly)} aria-pressed={fly}>
          <Glyph size={14}>{IC.fly}</Glyph>{fly ? "FLYTHROUGH ON" : "FLYTHROUGH"}
        </button>
      </div>

      <div className="sites" aria-label="Sites of interest">
        {HOTSPOTS.map((h) => (
          <button key={h.id} onClick={() => select(h)}><Glyph size={14}>{IC.pin}</Glyph>{h.title}</button>
        ))}
      </div>
      {/* Safari bottom-bar clearance */}
      <div aria-hidden="true" className="player-clear" />
    </main>
  );
}
