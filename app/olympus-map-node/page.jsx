"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  GRID_N,
  HIGHWAYS,
  POIS,
  ORIGIN,
  nodeId,
  nodeXY,
  findRoute,
  describeRoute,
  driveStep,
  speedKmh,
} from "./engine";

/**
 * Nav Core — holographic navigation console.
 * Rebuilt from the original Google-Maps nav app as a fully self-contained
 * procedural street grid: pick a destination, get a computed route, and run
 * a turn-by-turn drive simulation with HUD, speedometer, and local voice.
 * Stripped from the source: Google Maps JS API + hardcoded API key,
 * device-location tracking, OMEGA MIND telemetry + silent uplink.
 */
export default function OlympusMapNodePage() {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const [dest, setDest] = useState(null); // {x,y} grid coords
  const [route, setRoute] = useState(null); // node path
  const [instructions, setInstructions] = useState([]);
  const [driving, setDriving] = useState(false);
  const [banner, setBanner] = useState("SELECT DESTINATION");
  const [speed, setSpeed] = useState(0);
  const [eta, setEta] = useState("");
  const [voice, setVoice] = useState(false);
  const sim = useRef({
    dest: null,
    path: null,
    legs: [],
    drive: null,
    driving: false,
    reduced: false,
    panX: 0,
    panY: 0,
    lastInstr: -1,
  });

  useEffect(() => {
    document.title = "Nav Core";
    sim.current.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  const speak = useCallback(
    (text) => {
      if (!voice) return;
      try {
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
      } catch {}
    },
    [voice]
  );

  const planRoute = useCallback(
    (d) => {
      const s = sim.current;
      const goal = nodeId(d.x, d.y);
      const path = findRoute(ORIGIN, goal);
      s.dest = d;
      s.path = path;
      setDest(d);
      setRoute(path);
      if (path) {
        const legs = describeRoute(path);
        s.legs = legs;
        setInstructions(legs);
        setBanner(legs[0] ? legs[0].text : "YOU HAVE ARRIVED");
      } else {
        setInstructions([]);
        setBanner("NO ROUTE");
      }
    },
    []
  );

  const startDrive = useCallback(() => {
    const s = sim.current;
    if (!s.path || s.path.length < 2) return;
    if (s.reduced) {
      // reduced motion: jump straight to arrival
      s.drive = { seg: s.path.length - 1, frac: 0, x: s.dest.x, y: s.dest.y, done: true };
      setBanner("YOU HAVE ARRIVED");
      speak("You have arrived.");
      return;
    }
    s.drive = { seg: 0, frac: 0, x: 0, y: 0, done: false };
    const o = nodeXY(ORIGIN);
    s.drive.x = o.x;
    s.drive.y = o.y;
    s.driving = true;
    s.lastInstr = -1;
    setDriving(true);
    setBanner(s.legs[0]?.text || "NAVIGATING");
    speak("Navigation started. " + (s.legs[0]?.text || ""));
  }, [speak]);

  const stopDrive = useCallback(() => {
    const s = sim.current;
    s.driving = false;
    s.drive = null;
    setDriving(false);
    setSpeed(0);
    setEta("");
    setBanner("SELECT DESTINATION");
    try {
      window.speechSynthesis.cancel();
    } catch {}
  }, []);

  // ---------- canvas ----------
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    const s = sim.current;
    let raf = 0;
    let last = performance.now();

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = r.width * dpr;
      canvas.height = r.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    let dragging = false;
    let lx = 0;
    let ly = 0;
    let moved = 0;
    const onDown = (e) => {
      dragging = true;
      moved = 0;
      lx = e.clientX;
      ly = e.clientY;
    };
    const onMove = (e) => {
      if (!dragging) return;
      const dx = e.clientX - lx;
      const dy = e.clientY - ly;
      moved += Math.abs(dx) + Math.abs(dy);
      s.panX += dx;
      s.panY += dy;
      lx = e.clientX;
      ly = e.clientY;
    };
    const onUp = (e) => {
      dragging = false;
      if (moved < 6 && !s.driving) {
        // tap = drop destination pin
        const r = canvas.getBoundingClientRect();
        const { ox, oy, cell } = frame(r.width, r.height);
        const gx = Math.round((e.clientX - r.left - ox) / cell);
        const gy = Math.round((e.clientY - r.top - oy) / cell);
        if (gx >= 0 && gy >= 0 && gx < GRID_N && gy < GRID_N) planRoute({ x: gx, y: gy });
      }
    };
    canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);

    const frame = (w, h) => {
      const cell = Math.min(w, h) / (GRID_N + 1.5);
      const ox = (w - cell * (GRID_N - 1)) / 2 + s.panX;
      const oy = (h - cell * (GRID_N - 1)) / 2 + s.panY;
      return { ox, oy, cell };
    };

    const draw = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const { ox, oy, cell } = frame(w, h);
      const X = (gx) => ox + gx * cell;
      const Y = (gy) => oy + gy * cell;

      ctx.fillStyle = "#020608";
      ctx.fillRect(0, 0, w, h);

      // streets
      for (let y = 0; y < GRID_N; y++) {
        for (let x = 0; x < GRID_N - 1; x++) {
          const hw = HIGHWAYS.rows.includes(y);
          ctx.strokeStyle = hw ? "rgba(0,255,170,0.5)" : "rgba(0,242,255,0.28)";
          ctx.lineWidth = hw ? 2.5 : 1.2;
          ctx.beginPath();
          ctx.moveTo(X(x), Y(y));
          ctx.lineTo(X(x + 1), Y(y));
          ctx.stroke();
        }
      }
      for (let x = 0; x < GRID_N; x++) {
        for (let y = 0; y < GRID_N - 1; y++) {
          const hw = HIGHWAYS.cols.includes(x);
          ctx.strokeStyle = hw ? "rgba(0,255,170,0.5)" : "rgba(0,242,255,0.28)";
          ctx.lineWidth = hw ? 2.5 : 1.2;
          ctx.beginPath();
          ctx.moveTo(X(x), Y(y));
          ctx.lineTo(X(x), Y(y + 1));
          ctx.stroke();
        }
      }
      // intersections
      ctx.fillStyle = "rgba(0,242,255,0.5)";
      for (let y = 0; y < GRID_N; y++)
        for (let x = 0; x < GRID_N; x++) ctx.fillRect(X(x) - 1, Y(y) - 1, 2, 2);

      // route polyline
      if (s.path && s.path.length > 1) {
        ctx.strokeStyle = "#ff0033";
        ctx.lineWidth = 4;
        ctx.shadowColor = "#ff0033";
        ctx.shadowBlur = 10;
        ctx.beginPath();
        s.path.forEach((id, i) => {
          const { x, y } = nodeXY(id);
          if (i === 0) ctx.moveTo(X(x), Y(y));
          else ctx.lineTo(X(x), Y(y));
        });
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // origin marker
      const o = nodeXY(ORIGIN);
      ctx.fillStyle = "#00ffaa";
      ctx.beginPath();
      ctx.arc(X(o.x), Y(o.y), 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#02120a";
      ctx.font = "bold 8px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("◈", X(o.x), Y(o.y) + 0.5);

      // POIs
      ctx.textAlign = "center";
      for (const p of POIS) {
        const isDest = s.dest && s.dest.x === p.x && s.dest.y === p.y;
        ctx.fillStyle = isDest ? "#ffd94d" : "rgba(0,242,255,0.8)";
        ctx.beginPath();
        ctx.arc(X(p.x), Y(p.y), isDest ? 8 : 5, 0, Math.PI * 2);
        ctx.fill();
      }

      // destination pin
      if (s.dest) {
        const px = X(s.dest.x);
        const py = Y(s.dest.y);
        const bob = s.reduced ? 0 : Math.sin(now / 300) * 3;
        ctx.fillStyle = "#ffd94d";
        ctx.beginPath();
        ctx.arc(px, py - 14 + bob, 7, Math.PI * 0.15, Math.PI * 0.85, true);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(px - 6, py - 12 + bob);
        ctx.lineTo(px, py + 2);
        ctx.lineTo(px + 6, py - 12 + bob);
        ctx.closePath();
        ctx.fill();
      }

      // drive simulation
      if (s.driving && s.drive && s.path) {
        const prevInstr = s.lastInstr;
        const step = driveStep(s.drive, s.path, dt, 1.6);
        s.drive = step;
        setSpeed(speedKmh(1.6));
        // which instruction are we on?
        let acc = 0;
        let li = 0;
        for (let i = 0; i < s.legs.length; i++) {
          acc += s.legs[i].blocks;
          if (step.seg < acc) {
            li = i;
            break;
          }
          li = i;
        }
        if (li !== prevInstr) {
          s.lastInstr = li;
          const txt = li + 1 < s.legs.length ? s.legs[li + 1]?.text : "YOU HAVE ARRIVED";
          setBanner(step.done ? "YOU HAVE ARRIVED" : s.legs[li]?.text || "");
          if (!step.done && li + 1 < s.legs.length) speak(s.legs[li + 1].text);
          else if (step.done) speak("You have arrived.");
        }
        const remainingBlocks = s.path.length - 1 - step.seg - step.frac;
        const etaS = Math.max(0, Math.round(remainingBlocks / 1.6));
        setEta(`ETA ${Math.floor(etaS / 60)}:${String(etaS % 60).padStart(2, "0")}`);
        // vehicle
        const vx = X(step.x);
        const vy = Y(step.y);
        ctx.fillStyle = "#ffffff";
        ctx.shadowColor = "#00f2ff";
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(vx, vy, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        if (step.done) {
          s.driving = false;
          setDriving(false);
          setSpeed(0);
        }
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [planRoute, speak]);

  return (
    <div
      ref={wrapRef}
      style={{ position: "relative", width: "100%", minHeight: "100dvh", background: "#020608", color: "#e8f6ff", fontFamily: "'Courier New', monospace", overflow: "hidden" }}
    >
      <style>{`
        .nav-top{position:absolute;top:14px;left:50%;transform:translateX(-50%);z-index:10;width:min(430px,92vw)}
        .nav-search{display:flex;background:rgba(0,26,51,.85);border:1px solid #00f2ff;border-radius:8px;overflow:hidden;box-shadow:0 0 15px rgba(0,242,255,.2)}
        .nav-search select{flex:1;background:transparent;border:none;color:#fff;padding:14px;font-family:inherit;font-size:.85rem;outline:none;min-height:44px}
        .nav-search select option{background:#05101a}
        .nav-banner{position:absolute;top:76px;left:50%;transform:translateX(-50%);z-index:10;width:min(430px,92vw);
          background:#0f9d58;color:#fff;padding:14px;border-radius:10px;font-weight:bold;text-align:center;font-size:.85rem;
          box-shadow:0 8px 20px rgba(0,0,0,.5);display:${driving ? "block" : "none"}}
        .nav-dash{position:absolute;bottom:18px;left:18px;right:18px;z-index:10;display:flex;gap:10px;align-items:stretch;justify-content:center;flex-wrap:wrap}
        .nav-speed{width:84px;height:84px;background:rgba(0,0,0,.8);border:2px solid #00f2ff;border-radius:50%;
          display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:0 0 15px rgba(0,242,255,.5)}
        .nav-speed b{font-size:1.4rem} .nav-speed span{font-size:.6rem;color:#00f2ff}
        .nav-sim{font-size:.55rem!important;color:#9fd8ff!important;letter-spacing:2px;opacity:.75}
        .nav-btn{background:rgba(0,26,51,.9);border:1px solid #00f2ff;color:#00f2ff;padding:12px 18px;border-radius:8px;
          font-family:inherit;font-weight:bold;letter-spacing:1px;cursor:pointer;min-height:48px;font-size:.75rem}
        .nav-btn:hover{background:#00f2ff;color:#000}
        .nav-btn.danger{background:rgba(80,0,10,.9);border-color:#ff0033;color:#ff8095}
        .nav-btn.danger:hover{background:#ff0033;color:#fff}
        .nav-btn.on{background:#00f2ff;color:#000}
        .nav-eta{align-self:center;font-size:.8rem;color:#00ffaa;font-weight:bold;min-width:90px;text-align:center}
        .nav-title{position:absolute;top:14px;left:16px;z-index:9;color:#00f2ff;letter-spacing:4px;font-size:.85rem;text-shadow:0 0 10px rgba(0,242,255,.6)}
        .nav-legend{position:absolute;bottom:120px;left:16px;z-index:9;font-size:.65rem;opacity:.7;line-height:1.7}
      `}</style>

      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", touchAction: "none" }} aria-label="Holographic street grid" />

      <div className="nav-title">OLYMPUS NAV ENGINE</div>

      {!driving && (
        <div className="nav-top">
          <div className="nav-search">
            <select
              aria-label="Destination"
              value={dest ? `${dest.x},${dest.y}` : ""}
              onChange={(e) => {
                const [x, y] = e.target.value.split(",").map(Number);
                planRoute({ x, y });
              }}
            >
              <option value="">SELECT DESTINATION…</option>
              {POIS.filter((p) => !(p.x === 5 && p.y === 5)).map((p) => (
                <option key={p.name} value={`${p.x},${p.y}`}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="nav-banner">{banner}</div>

      <div className="nav-legend">
        <div><span style={{ color: "#00ffaa" }}>●</span> ORIGIN — ARGUS OBSERVATORY</div>
        <div><span style={{ color: "#ffd94d" }}>●</span> DESTINATION</div>
        <div><span style={{ color: "#00ffaa" }}>━</span> EXPRESSWAY</div>
        <div><span style={{ color: "#ff0033" }}>━</span> ROUTE</div>
      </div>

      <div className="nav-dash">
        {driving ? (
          <>
            <div className="nav-speed" title="Drive simulation — speeds are illustrative, not real"><b>{speed}</b><span>KM/H</span><span className="nav-sim">SIM</span></div>
            <div className="nav-eta">{eta}</div>
            <button className={`nav-btn ${voice ? "on" : ""}`} onClick={() => setVoice((v) => !v)}>VOICE {voice ? "ON" : "OFF"}</button>
            <button className="nav-btn danger" onClick={stopDrive}>EXIT NAV</button>
          </>
        ) : (
          <>
            {route && route.length > 1 && (
              <button className="nav-btn" onClick={startDrive}>INITIATE DRIVING MODE</button>
            )}
            {dest && (
              <div className="nav-eta" style={{ color: "#9fd8ff" }}>
                {instructions.length} TURNS · {(route?.length ?? 1) - 1} BLOCKS
              </div>
            )}
          </>
        )}
      </div>
      {/* Safari bottom-bar clearance */}
      <div aria-hidden="true" style={{ height: 'max(5rem, env(safe-area-inset-bottom))' }} />
    </div>
  );
}
