"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  CITIES,
  latLonToVec,
  projectPoint,
  isDayAtLon,
  simulatedWeather,
  newChargeGame,
  chargeStep,
  chargeRelease,
} from "./engine";

/**
 * Olympus Aetheris — atmospheric mastery network console.
 * Rebuilt from the original three.js globe: hand-rolled canvas-2D globe,
 * simulated weather (no external API), and an interactive deploy mini-game.
 * All telemetry, keys, and CDN dependencies from the source were dropped.
 */
export default function OlympusAetherisPage() {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const [selected, setSelected] = useState(null); // city object or null
  const [weather, setWeather] = useState(null);
  const [built, setBuilt] = useState(() => new Set());
  const [game, setGame] = useState(null);
  const [gameMsg, setGameMsg] = useState("");
  const [hint, setHint] = useState("Drag to spin · Scroll to zoom · Click a node");
  const sim = useRef({
    rotY: 0.6,
    targetRotY: 0.6,
    zoom: 1,
    targetZoom: 1,
    dragging: false,
    lastX: 0,
    stars: [],
    reduced: false,
  });

  // load built cities from localStorage (device-local, no telemetry)
  useEffect(() => {
    document.title = "Olympus Aetheris";
    try {
      const raw = localStorage.getItem("aetheris-built");
      if (raw) setBuilt(new Set(JSON.parse(raw)));
    } catch {}
    sim.current.reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    const s = sim.current;
    for (let i = 0; i < 220; i++) {
      s.stars.push({
        x: Math.random(),
        y: Math.random(),
        r: Math.random() * 1.3 + 0.3,
        tw: Math.random() * Math.PI * 2,
      });
    }
  }, []);

  const persistBuilt = (next) => {
    setBuilt(next);
    try {
      localStorage.setItem("aetheris-built", JSON.stringify([...next]));
    } catch {}
  };

  const selectCity = useCallback((city) => {
    setSelected(city);
    setWeather(simulatedWeather(city.name));
    setGame(null);
    setGameMsg("");
  }, []);

  // ---------- canvas render ----------
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    const s = sim.current;
    let raf = 0;
    let t = 0;

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = r.width * dpr;
      canvas.height = r.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const onDown = (e) => {
      s.dragging = true;
      s.lastX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    };
    const onMove = (e) => {
      if (!s.dragging) return;
      const x = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
      s.targetRotY += (x - s.lastX) * 0.008;
      s.lastX = x;
    };
    const onUp = (e) => {
      if (s.dragging) {
        // treat as click if barely moved
        const x = e.clientX ?? 0;
        if (Math.abs(x - s.lastX) < 4) handleClick(e);
      }
      s.dragging = false;
    };
    const onWheel = (e) => {
      e.preventDefault();
      s.targetZoom = Math.min(
        2.4,
        Math.max(0.7, s.targetZoom * (e.deltaY > 0 ? 0.92 : 1.09))
      );
    };

    const handleClick = (e) => {
      const r = canvas.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      const { cx, cy, R } = frame(r.width, r.height);
      const scale = (R / 5) * s.zoom;
      let best = null;
      let bestD = 14;
      for (const city of CITIES) {
        const v = latLonToVec(city.lat, city.lon, 5);
        const p = projectPoint(v, s.rotY, cx, cy, scale, 5);
        if (!p.visible) continue;
        const d = Math.hypot(p.sx - mx, p.sy - my);
        if (d < bestD) {
          bestD = d;
          best = city;
        }
      }
      if (best) selectCity(best);
    };

    const frame = (w, h) => {
      const R = Math.min(w, h) * 0.36 * s.zoom;
      return { cx: w / 2, cy: h / 2, R };
    };

    canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    const draw = () => {
      t += 1 / 60;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const { cx, cy, R } = frame(w, h);
      const now = new Date();

      if (!s.reduced) {
        s.rotY += (s.targetRotY - s.rotY) * 0.08;
        if (!s.dragging) s.targetRotY += 0.0016;
      } else {
        s.rotY = s.targetRotY;
      }
      s.zoom += (s.targetZoom - s.zoom) * 0.1;
      const scale = (R / 5) * s.zoom;

      ctx.fillStyle = "#04060a";
      ctx.fillRect(0, 0, w, h);

      // starfield
      for (const st of s.stars) {
        const a = 0.25 + 0.55 * Math.abs(Math.sin(t * 0.7 + st.tw));
        ctx.globalAlpha = a;
        ctx.fillStyle = "#9fd8ff";
        ctx.fillRect(st.x * w, st.y * h, st.r, st.r);
      }
      ctx.globalAlpha = 1;

      // globe body
      const g = ctx.createRadialGradient(
        cx - R * 0.35,
        cy - R * 0.35,
        R * 0.1,
        cx,
        cy,
        R
      );
      g.addColorStop(0, "#123a52");
      g.addColorStop(0.55, "#0a1f30");
      g.addColorStop(1, "#050d16");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();

      // lat/lon graticule
      ctx.strokeStyle = "rgba(0,212,255,0.16)";
      ctx.lineWidth = 1;
      for (let lat = -60; lat <= 60; lat += 30) {
        ctx.beginPath();
        let started = false;
        for (let lon = -180; lon <= 180; lon += 6) {
          const p = projectPoint(latLonToVec(lat, lon, 5), s.rotY, cx, cy, scale, 5);
          if (!p.visible) {
            started = false;
            continue;
          }
          if (!started) {
            ctx.moveTo(p.sx, p.sy);
            started = true;
          } else ctx.lineTo(p.sx, p.sy);
        }
        ctx.stroke();
      }
      for (let lon = 0; lon < 360; lon += 30) {
        ctx.beginPath();
        let started = false;
        for (let lat = -90; lat <= 90; lat += 6) {
          const p = projectPoint(latLonToVec(lat, lon, 5), s.rotY, cx, cy, scale, 5);
          if (!p.visible) {
            started = false;
            continue;
          }
          if (!started) {
            ctx.moveTo(p.sx, p.sy);
            started = true;
          } else ctx.lineTo(p.sx, p.sy);
        }
        ctx.stroke();
      }

      // night shading: dark gradient over the night hemisphere
      const sunLon = 180 - (now.getUTCHours() + now.getUTCMinutes() / 60) * 15;
      const sunVec = latLonToVec(0, sunLon, 5);
      const sp = projectPoint(sunVec, s.rotY, cx, cy, scale, 5);
      const night = ctx.createRadialGradient(
        cx * 2 - sp.sx,
        cy * 2 - sp.sy,
        R * 0.2,
        cx,
        cy,
        R * 1.15
      );
      night.addColorStop(0, "rgba(0,0,8,0.55)");
      night.addColorStop(1, "rgba(0,0,8,0)");
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = night;
      ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
      ctx.restore();

      // rim atmosphere (localized glow)
      ctx.strokeStyle = "rgba(0,212,255,0.35)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, R + 1, 0, Math.PI * 2);
      ctx.stroke();

      // city nodes
      for (const city of CITIES) {
        const p = projectPoint(latLonToVec(city.lat, city.lon, 5), s.rotY, cx, cy, scale, 5);
        if (!p.visible) continue;
        const isBuilt = built.has(city.name);
        const day = isDayAtLon(city.lon, now);
        const isSel = selected && selected.name === city.name;
        const r = isSel ? 6 : 3.5;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
        ctx.fillStyle = isBuilt ? "#00ff88" : day ? "#ffd94d" : "#6db8ff";
        ctx.fill();
        if (isSel) {
          ctx.strokeStyle = "#00d4ff";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, r + 4, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // pulse ring on selected
      if (selected && !s.reduced) {
        const p = projectPoint(
          latLonToVec(selected.lat, selected.lon, 5),
          s.rotY,
          cx,
          cy,
          scale,
          5
        );
        if (p.visible) {
          const pr = 8 + ((t * 22) % 18);
          ctx.strokeStyle = `rgba(0,212,255,${1 - pr / 26})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, pr, 0, Math.PI * 2);
          ctx.stroke();
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
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [selected, built, selectCity]);

  // ---------- deploy mini-game ----------
  useEffect(() => {
    if (!game) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      setGame((g) => (g ? chargeStep(g, g.holding, dt) : g));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [game !== null]);

  const startDeploy = () => {
    setGame({ ...newChargeGame(Date.now() % 100000), holding: false });
    setGameMsg("Hold DEPLOY to charge — release inside the resonance band.");
  };
  const releaseDeploy = () => {
    if (!game) return;
    const result = chargeRelease(game);
    if (result === "deployed" && selected) {
      const next = new Set(built);
      next.add(selected.name);
      persistBuilt(next);
      setGame(null);
      setGameMsg(`${selected.name} node online. Aether unit deployed.`);
      setHint(`${next.size} of ${CITIES.length} nodes deployed`);
    } else if (result === "overcharged") {
      setGame({ ...newChargeGame(Date.now() % 100000), holding: false });
      setGameMsg("Overcharged — resonance collapsed. Try again.");
    } else {
      setGameMsg("Charge too low — hold longer and release in the band.");
    }
  };

  return (
    <div
      ref={wrapRef}
      style={{
        position: "relative",
        width: "100%",
        minHeight: "100dvh",
        background: "#04060a",
        color: "#e8f6ff",
        fontFamily: "system-ui, sans-serif",
        overflow: "hidden",
      }}
    >
      <style>{`
        .aeth-hud { position:absolute; top:18px; left:18px; z-index:10; pointer-events:none; }
        .aeth-hud h1 { margin:0; font-weight:300; letter-spacing:3px; color:#00d4ff; font-size:1.3rem; }
        .aeth-hud p { margin:4px 0 0; font-size:0.8rem; opacity:0.65; }
        .aeth-panel { position:absolute; top:18px; right:18px; z-index:10; width:min(320px, 86vw);
          background:rgba(4,12,20,0.88); border:1px solid rgba(0,212,255,0.35); border-radius:10px;
          padding:16px; backdrop-filter: blur(8px); }
        .aeth-panel h2 { margin:0 0 6px; font-size:1.05rem; letter-spacing:1px; color:#00d4ff; }
        .aeth-row { display:flex; justify-content:space-between; font-size:0.82rem; padding:3px 0; opacity:0.9; }
        .aeth-btn { display:block; width:100%; margin-top:12px; padding:12px; min-height:44px;
          background:rgba(0,212,255,0.12); border:1px solid #00d4ff; color:#fff; cursor:pointer;
          letter-spacing:2px; font-size:0.8rem; border-radius:6px; }
        .aeth-btn:hover { background:#00d4ff; color:#001318; }
        .aeth-btn:disabled { opacity:0.4; cursor:default; }
        .aeth-bar { height:14px; background:#071018; border:1px solid rgba(0,212,255,0.4); border-radius:7px;
          margin-top:10px; position:relative; overflow:hidden; }
        .aeth-fill { height:100%; background:linear-gradient(90deg,#00d4ff,#00ff88); transition:width 0.05s linear; }
        .aeth-band { position:absolute; top:0; bottom:0; background:rgba(0,255,136,0.25); border-left:1px solid #00ff88; border-right:1px solid #00ff88; }
        .aeth-msg { font-size:0.78rem; margin-top:10px; min-height:2.2em; color:#ffd94d; }
        .aeth-hint { position:absolute; bottom:16px; left:50%; transform:translateX(-50%); z-index:10;
          font-size:0.75rem; opacity:0.6; pointer-events:none; text-align:center; width:90%; }
        .aeth-close { position:absolute; top:8px; right:10px; background:none; border:none; color:#9fd8ff;
          font-size:1.1rem; cursor:pointer; padding:8px; }
        @media (max-width:640px){ .aeth-panel{ top:auto; bottom:44px; right:50%; transform:translateX(50%); } }
      `}</style>

      <canvas
        ref={canvasRef}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", touchAction: "none", cursor: "grab" }}
        aria-label="Interactive globe of Aetheris network nodes"
      />

      <div className="aeth-hud">
        <h1>OLYMPUS AETHERIS-7</h1>
        <p>Global Atmospheric Network · {built.size}/{CITIES.length} nodes online</p>
      </div>

      {selected && weather && (
        <div className="aeth-panel" role="dialog" aria-label={`${selected.name} deployment panel`}>
          <button className="aeth-close" onClick={() => { setSelected(null); setGame(null); setGameMsg(""); }} aria-label="Close panel">×</button>
          <h2>{selected.name.toUpperCase()}</h2>
          <div className="aeth-row"><span>Condition</span><span>{weather.name}</span></div>
          <div className="aeth-row"><span>Temperature</span><span>{weather.tempC} °C</span></div>
          <div className="aeth-row"><span>Wind</span><span>{weather.windKmh} km/h</span></div>
          <div className="aeth-row"><span>Local time</span><span>{isDayAtLon(selected.lon) ? "Day" : "Night"}</span></div>
          <div className="aeth-row"><span>Status</span><span style={{ color: built.has(selected.name) ? "#00ff88" : "#ffd94d" }}>
            {built.has(selected.name) ? "UNIT ONLINE" : "AWAITING DEPLOYMENT"}
          </span></div>

          {!built.has(selected.name) && !game && (
            <button className="aeth-btn" onClick={startDeploy}>DEPLOY AETHER UNIT</button>
          )}
          {game && (
            <>
              <div className="aeth-bar">
                <div className="aeth-fill" style={{ width: `${game.charge * 100}%` }} />
                <div className="aeth-band" style={{ left: `${game.bandLo * 100}%`, width: `${(game.bandHi - game.bandLo) * 100}%` }} />
              </div>
              <button
                className="aeth-btn"
                onPointerDown={() => setGame((g) => g && { ...g, holding: true })}
                onPointerUp={releaseDeploy}
                onPointerLeave={() => setGame((g) => g && { ...g, holding: false })}
              >
                HOLD TO CHARGE — RELEASE IN BAND
              </button>
            </>
          )}
          {gameMsg && <div className="aeth-msg">{gameMsg}</div>}
        </div>
      )}

      <div className="aeth-hint">{hint}</div>
    </div>
  );
}
