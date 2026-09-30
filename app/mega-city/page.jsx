"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createScene, HOTSPOTS, DISTRICTS, ACCENT, timeLabel, timeString,
  DESCENT_START_CAM, GROUND_CAM, STATION_CAM,
} from "./scene";
import { fx, unlockFx } from "@/lib/fx";

const DESCENT_MS = 3400;
const START_ALT_M = 12400;

export default function MegaCityPage() {
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const router = useRouter();
  const [time, setTime] = useState(0.95);
  const [traffic, setTraffic] = useState(true);
  const [fly, setFly] = useState(false);
  const [hotspot, setHotspot] = useState(null);
  // Entry: spacecraft-style descent to ground level. Tap to skip.
  const [descending, setDescending] = useState(true);
  const [alt, setAlt] = useState(START_ALT_M);
  const [touchdown, setTouchdown] = useState(false);
  // Exit: simple zoom-out back to stationing.
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    document.title = "Mega City — ARGUS Observatory";
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const s = createScene(canvasRef.current, { onHotspot: setHotspot });
    sceneRef.current = s;
    unlockFx();
    if (reduced) {
      // Reduced motion: start on the ground, no descent flight.
      s.snapCamera(GROUND_CAM);
      setDescending(false);
      setAlt(0);
    } else {
      s.snapCamera(DESCENT_START_CAM);
      fx.landing();
      const t0 = performance.now();
      let raf = 0;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        cancelAnimationFrame(raf);
        setAlt(0);
        setTouchdown(true);
        setTimeout(() => { setDescending(false); setTouchdown(false); }, 1500);
      };
      const tick = () => {
        const k = Math.min(1, (performance.now() - t0) / DESCENT_MS);
        setAlt(Math.round(START_ALT_M * (1 - k)));
        if (k < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      s.tweenCamera(GROUND_CAM, DESCENT_MS, finish);
      // If the user grabs the camera mid-descent, the tween cancels itself —
      // treat that as a skip too.
      const watch = setInterval(() => {
        if (s.tweenProgress() === null && !done) { clearInterval(watch); finish(); }
      }, 300);
      return () => { clearInterval(watch); done = true; cancelAnimationFrame(raf); s.destroy(); };
    }
    return () => s.destroy();
  }, []);

  useEffect(() => { sceneRef.current && sceneRef.current.setTime(time); }, [time]);
  useEffect(() => { sceneRef.current && sceneRef.current.setTraffic(traffic); }, [traffic]);
  useEffect(() => { sceneRef.current && sceneRef.current.setFly(fly); }, [fly]);

  function select(h) {
    setHotspot(h);
    if (h) sceneRef.current && sceneRef.current.focus(h);
    else sceneRef.current && sceneRef.current.clearSelection();
  }

  function skipDescent() {
    const s = sceneRef.current;
    if (!s || !descending) return;
    fx.tap();
    s.snapCamera(GROUND_CAM);
    setAlt(0);
    setTouchdown(false);
    setDescending(false);
  }

  function exitToStation() {
    if (exiting) return;
    const s = sceneRef.current;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    fx.tap();
    if (!s || reduced) { router.push("/"); return; }
    setExiting(true);
    s.tweenCamera(STATION_CAM, 1100, () => router.push("/"));
  }

  const presets = [["Dawn", 0.26], ["Day", 0.5], ["Dusk", 0.72], ["Night", 0.95]];

  return (
    <main className="argus">
      <style>{`
        .argus { min-height: 100dvh; background: #03040c; color: #e6f4ff; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; display: flex; flex-direction: column; }
        .argus header { padding: 18px 20px 10px; }
        .argus .kicker { font-size: 11px; letter-spacing: 4px; color: ${ACCENT}; text-transform: uppercase; }
        .argus h1 { margin: 4px 0 2px; font-size: clamp(1.6rem, 5vw, 2.6rem); letter-spacing: 6px; font-weight: 800; }
        .argus .sub { color: #8fa8c8; font-size: 0.9rem; max-width: 60ch; }
        .argus .stage { position: relative; margin: 10px 16px 0; border: 1px solid #1e3a55; border-radius: 14px; overflow: hidden; height: min(62dvh, 560px); min-height: 320px; background: #000; }
        .argus canvas { width: 100%; height: 100%; display: block; touch-action: none; cursor: grab; }
        .argus canvas:active { cursor: grabbing; }
        .argus .stage.descending canvas { animation: descendShake 0.4s linear infinite; }
        @keyframes descendShake { 0% { transform: translateY(0); } 50% { transform: translateY(2px); } 100% { transform: translateY(0); } }
        .argus .veil { position: absolute; inset: 0; display: flex; align-items: flex-start; justify-content: center; padding-top: 18px; background: transparent; border: 0; cursor: pointer; z-index: 5; }
        .argus .chip { background: rgba(3,8,16,0.82); border: 1px solid ${ACCENT}; border-radius: 12px; padding: 12px 22px; text-align: center; box-shadow: 0 0 24px rgba(0,242,255,0.25); }
        .argus .chip .lbl { font-size: 0.72rem; letter-spacing: 4px; color: ${ACCENT}; font-weight: 700; }
        .argus .chip .alt { font-size: 1.5rem; font-weight: 800; letter-spacing: 2px; color: #fff; font-variant-numeric: tabular-nums; margin-top: 4px; }
        .argus .chip .skip { margin-top: 8px; font-size: 0.68rem; letter-spacing: 3px; color: #8fa8c8; }
        .argus .chip .skipBtn { margin-top: 6px; min-height: 44px; padding: 8px 18px; border-radius: 8px; border: 1px solid ${ACCENT}; background: transparent; color: ${ACCENT}; font-size: 0.75rem; letter-spacing: 2px; cursor: pointer; }
        .argus .exitVeil { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(2,4,10,0.45); z-index: 6; }
        .argus .panel { position: absolute; left: 12px; bottom: 12px; right: 12px; max-width: 430px; background: rgba(4,8,18,0.93); border: 1px solid ${ACCENT}; border-radius: 10px; padding: 14px 16px; z-index: 4; }
        .argus .panel h2 { margin: 0 0 6px; font-size: 1.05rem; letter-spacing: 2px; color: ${ACCENT}; }
        .argus .panel p { margin: 0 0 10px; font-size: 0.88rem; line-height: 1.5; color: #d4e8fa; }
        .argus .controls { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; padding: 14px 20px; }
        .argus .ctl { display: flex; align-items: center; gap: 10px; font-size: 0.8rem; letter-spacing: 1px; color: #8fa8c8; }
        .argus input[type="range"] { width: 150px; accent-color: ${ACCENT}; }
        .argus button { min-height: 44px; min-width: 44px; padding: 10px 16px; border-radius: 8px; border: 1px solid #1e3a55; background: #060b16; color: #e6f4ff; font-size: 0.8rem; letter-spacing: 1px; cursor: pointer; }
        .argus button.on { background: ${ACCENT}; border-color: ${ACCENT}; color: #001318; font-weight: 700; }
        .argus button.stationBtn { border-color: ${ACCENT}; color: ${ACCENT}; font-weight: 700; }
        .argus .clock { font-variant-numeric: tabular-nums; color: #fff; font-weight: 700; }
        .argus .sites { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 20px 8px; }
        .argus .sites button { border-color: #1e3a55; background: #060b16; }
        .argus .districts { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 20px 20px; }
        .argus .dist { flex: 1 1 180px; border: 1px solid #1e3a55; border-left: 4px solid var(--dc); border-radius: 8px; padding: 10px 12px; background: #060b16; text-align: left; }
        .argus .dist h3 { margin: 0 0 4px; font-size: 0.8rem; letter-spacing: 2px; color: var(--dc); }
        .argus .dist p { margin: 0; font-size: 0.78rem; color: #9db4d2; line-height: 1.4; }
        @media (prefers-reduced-motion: reduce) { .argus .stage.descending canvas { animation: none; } }
      `}</style>

      <header>
        <div className="kicker">ARGUS // Observatory</div>
        <h1>MEGA CITY</h1>
        <div className="sub">Nine million lights and one long night. Drag to pan, scroll or pinch to zoom, tap a marker for intel.</div>
      </header>

      <div className={`stage${descending && !touchdown ? " descending" : ""}`}>
        <canvas ref={canvasRef} aria-label="Interactive panorama of Mega City" />
        {descending && (
          <div className="veil" onClick={skipDescent}>
            <div className="chip" role="status" aria-live="polite">
              <div className="lbl">{touchdown ? "● TOUCHDOWN" : "▼ DESCENDING"}</div>
              <div className="alt">{touchdown ? "WELCOME TO MEGA CITY" : `ALT ${alt.toLocaleString("en-US")} M`}</div>
              {!touchdown && (
                <div>
                  <div className="skip">TAP ANYWHERE TO SKIP</div>
                  <button className="skipBtn" onClick={(e) => { e.stopPropagation(); skipDescent(); }}>SKIP</button>
                </div>
              )}
            </div>
          </div>
        )}
        {exiting && (
          <div className="exitVeil">
            <div className="chip" role="status" aria-live="polite">
              <div className="lbl">▲ RETURNING TO STATION…</div>
            </div>
          </div>
        )}
        {hotspot && (
          <div className="panel" role="dialog" aria-label={hotspot.title}>
            <h2>{hotspot.title}</h2>
            <p>{hotspot.body}</p>
            <button onClick={() => select(null)}>Close</button>
          </div>
        )}
      </div>

      <div className="controls">
        <button className="stationBtn" onClick={exitToStation} aria-label="Return to station">◀ STATION</button>
        <div className="ctl">
          <span>TIME</span>
          <input type="range" min="0" max="1000" value={Math.round(time * 1000)}
            onChange={(e) => setTime(Number(e.target.value) / 1000)} aria-label="Time of day" />
          <span className="clock">{timeString(time)} · {timeLabel(time)}</span>
        </div>
        {presets.map(([label, t]) => (
          <button key={label} onClick={() => setTime(t)}>{label}</button>
        ))}
        <button className={traffic ? "on" : ""} onClick={() => setTraffic(!traffic)} aria-pressed={traffic}>
          TRAFFIC {traffic ? "ON" : "OFF"}
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

      <div className="districts" aria-label="Districts">
        {DISTRICTS.map((d) => (
          <button key={d.id} className="dist" style={{ "--dc": d.color }} onClick={() => {
            const h = HOTSPOTS.find((x) => x.id === d.id);
            if (h) select(h);
          }}>
            <h3>{d.name}</h3>
            <p>{d.desc}</p>
          </button>
        ))}
      </div>
      {/* Safari bottom-bar clearance */}
      <div aria-hidden="true" className="player-clear" />
    </main>
  );
}
