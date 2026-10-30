"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import RenewalPlanBadge from "@/components/RenewalPlanBadge";
import { IcClose, IcTower, IcCharge } from "@/app/artemis-ui/icons";
import {
  CITIES,
  LAND_DOTS,
  latLonToVec,
  projectPoint,
  rotYForLon,
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
  const [query, setQuery] = useState("");
  const flyLon = useRef(null); // camera eases here when set
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

    const pointers = new Map();
    const onDown = (e) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        s.dragging = true;
        s.lastX = e.clientX ?? 0;
        s.downX = e.clientX ?? 0;
      } else if (pointers.size === 2) {
        s.dragging = false; // pinch takes over
        const [a, b] = [...pointers.values()];
        s.pinchD = Math.hypot(a.x - b.x, a.y - b.y);
      }
    };
    const onMove = (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (s.pinchD > 0) {
          s.targetZoom = Math.min(2.4, Math.max(0.7, s.targetZoom * (d / s.pinchD)));
        }
        s.pinchD = d;
        return;
      }
      if (!s.dragging) return;
      const x = e.clientX ?? 0;
      s.targetRotY += (x - s.lastX) * 0.008;
      s.lastX = x;
    };
    const onUp = (e) => {
      const wasTap = pointers.size === 1 && Math.abs((e.clientX ?? 0) - (s.downX ?? 0)) < 6;
      pointers.delete(e.pointerId);
      if (pointers.size < 2) s.pinchD = 0;
      if (wasTap && s.dragging) handleClick(e);
      if (pointers.size === 0) s.dragging = false;
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

      // fly-to: ease the camera toward a searched city, then release
      if (flyLon.current != null && !s.reduced) {
        const target = rotYForLon(flyLon.current);
        let d = target - s.targetRotY;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        s.targetRotY += d * 0.07;
        if (Math.abs(d) < 0.015) flyLon.current = null;
      }
      if (!s.reduced) {
        s.rotY += (s.targetRotY - s.rotY) * 0.08;
        if (!s.dragging && flyLon.current == null) s.targetRotY += 0.0016;
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

      // dot-matrix continents
      ctx.fillStyle = "rgba(64,180,220,0.5)";
      const dotR = Math.max(0.6, R * 0.004);
      for (const dpt of LAND_DOTS) {
        const p = projectPoint(latLonToVec(dpt.lat, dpt.lon, 5), s.rotY, cx, cy, scale, 5);
        if (!p.visible) continue;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, dotR, 0, Math.PI * 2);
        ctx.fill();
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

      // network arcs between deployed nodes (atmospheric links)
      const builtCities = CITIES.filter((c) => built.has(c.name));
      if (builtCities.length > 1 && !s.reduced) {
        ctx.lineWidth = 1;
        for (let i = 0; i < builtCities.length; i++) {
          const a = builtCities[i];
          const b = builtCities[(i + 1) % builtCities.length];
          const pa = projectPoint(latLonToVec(a.lat, a.lon, 5), s.rotY, cx, cy, scale, 5);
          const pb = projectPoint(latLonToVec(b.lat, b.lon, 5), s.rotY, cx, cy, scale, 5);
          if (!pa.visible || !pb.visible) continue;
          const mx = (pa.sx + pb.sx) / 2;
          const my = (pa.sy + pb.sy) / 2;
          const dx = pb.sx - pa.sx;
          const dy = pb.sy - pa.sy;
          const lift = Math.min(60, Math.hypot(dx, dy) * 0.25);
          const pulse = 0.35 + 0.3 * Math.sin(t * 2 + i * 1.7);
          ctx.strokeStyle = `rgba(0,255,136,${pulse.toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(pa.sx, pa.sy);
          ctx.quadraticCurveTo(mx, my - lift, pb.sx, pb.sy);
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

  const runSearch = () => {
    const q = query.trim().toLowerCase();
    if (!q) return;
    const city = CITIES.find((c) => c.name.toLowerCase().includes(q));
    if (city) {
      selectCity(city);
      flyLon.current = city.lon;
      setQuery("");
    } else {
      setHint(`No node matching "${query.trim()}"`);
      setTimeout(() => setHint("Drag to spin · Scroll to zoom · Click a node"), 2200);
    }
  };

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
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none", opacity: 0.3,
        backgroundImage: "linear-gradient(to bottom, rgba(4,6,10,0.62), rgba(4,6,10,0.25) 50%, rgba(4,6,10,0.7)), url(/images/olympus-aetheris/bg.webp)",
        backgroundSize: "cover", backgroundPosition: "center" }} />
      <style>{`
        .aeth-hud { position:absolute; top:18px; left:18px; z-index:10; pointer-events:none; }
        .aeth-hud h1 { margin:0; font-weight:300; letter-spacing:3px; color:#00d4ff; font-size:1.3rem; }
        .aeth-hud p { margin:4px 0 0; font-size:0.8rem; opacity:0.65; }
        .aeth-panel { position:absolute; top:18px; right:18px; z-index:10; width:min(320px, 86vw);
          background-image:linear-gradient(rgba(4,12,20,0.88), rgba(4,12,20,0.88)), url(/images/olympus-aetheris/tile.webp);
          background-size:auto,160px; border:1px solid rgba(0,212,255,0.35); border-radius:10px;
          padding:16px; backdrop-filter: blur(8px); }
        .aeth-panel h2 { margin:0 0 6px; font-size:1.05rem; letter-spacing:1px; color:#00d4ff; }
        .aeth-row { display:flex; justify-content:space-between; font-size:0.82rem; padding:3px 0; opacity:0.9; }
        .aeth-btn { display:inline-flex; align-items:center; justify-content:center; gap:8px; width:100%; margin-top:12px; padding:12px; min-height:44px;
          background:rgba(0,212,255,0.12); border:1px solid #00d4ff; color:#fff; cursor:pointer;
          letter-spacing:2px; font-size:0.8rem; border-radius:6px; }
        .aeth-btn:hover { background:#00d4ff; color:#001318; }
        .aeth-btn:disabled { opacity:0.4; cursor:default; }
        .aeth-bar { height:14px; background:#071018; border:1px solid rgba(0,212,255,0.4); border-radius:7px;
          margin-top:10px; position:relative; overflow:hidden; }
        .aeth-fill { height:100%; background:linear-gradient(90deg,#00d4ff,#00ff88); transition:width 0.05s linear; }
        .aeth-band { position:absolute; top:0; bottom:0; background:rgba(0,255,136,0.25); border-left:1px solid #00ff88; border-right:1px solid #00ff88; }
        .aeth-msg { font-size:0.78rem; margin-top:10px; min-height:2.2em; color:#ffd94d; }
        .aeth-hint { position:absolute; bottom:calc(4.5rem+env(safe-area-inset-bottom)); left:50%; transform:translateX(-50%); z-index:10;
          font-size:0.75rem; opacity:0.6; pointer-events:none; text-align:center; width:90%; }
        .aeth-close { position:absolute; top:8px; right:10px; background:none; border:none; color:#9fd8ff;
          font-size:1.1rem; cursor:pointer; padding:8px; }
        @media (max-width:640px){ .aeth-panel{ top:auto; bottom:calc(4.5rem+env(safe-area-inset-bottom)); right:50%; transform:translateX(50%); } }
      `}</style>

      <canvas
        ref={canvasRef}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", touchAction: "none", cursor: "grab" }}
        aria-label="Interactive globe of Aetheris network nodes"
      />

      <div className="aeth-hud">
        <h1>OLYMPUS AETHERIS-7</h1>
        <p>Global Atmospheric Network · {built.size}/{CITIES.length} nodes online</p>
        <RenewalPlanBadge nodeId="node-2" />
        <div style={{ pointerEvents: "auto", marginTop: 10, display: "flex", gap: 6 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
            placeholder="Find a city…"
            aria-label="Find a city"
            style={{
              background: "rgba(4,12,20,0.85)", border: "1px solid rgba(0,212,255,0.4)",
              color: "#e8f6ff", borderRadius: 6, padding: "8px 10px", fontSize: "0.8rem",
              width: 150, outline: "none",
            }}
          />
          <button
            onClick={runSearch}
            aria-label="Search"
            style={{
              background: "rgba(0,212,255,0.15)", border: "1px solid #00d4ff", color: "#fff",
              borderRadius: 6, padding: "8px 12px", fontSize: "0.8rem", cursor: "pointer",
            }}
          >
            ⌕
          </button>
        </div>
      </div>

      {selected && weather && (
        <div className="aeth-panel" role="dialog" aria-label={`${selected.name} deployment panel`}>
          <button className="aeth-close" onClick={() => { setSelected(null); setGame(null); setGameMsg(""); }} aria-label="Close panel"><IcClose /></button>
          <h2>{selected.name.toUpperCase()}</h2>
          <div className="aeth-row"><span>Condition</span><span>{weather.name}</span></div>
          <div className="aeth-row"><span>Temperature</span><span>{weather.tempC} °C</span></div>
          <div className="aeth-row"><span>Wind</span><span>{weather.windKmh} km/h</span></div>
          <div className="aeth-row"><span>Local time</span><span>{isDayAtLon(selected.lon) ? "Day" : "Night"}</span></div>
          <div className="aeth-row"><span>Status</span><span style={{ color: built.has(selected.name) ? "#00ff88" : "#ffd94d" }}>
            {built.has(selected.name) ? "UNIT ONLINE" : "AWAITING DEPLOYMENT"}
          </span></div>

          {!built.has(selected.name) && !game && (
            <button className="aeth-btn" onClick={startDeploy}><IcTower /><span>DEPLOY AETHER UNIT</span></button>
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
                <IcCharge /><span>HOLD TO CHARGE — RELEASE IN BAND</span>
              </button>
            </>
          )}
          {gameMsg && <div className="aeth-msg">{gameMsg}</div>}
        </div>
      )}

      <div className="aeth-hint">{hint}</div>
      {/* Safari bottom-bar clearance */}
      <div aria-hidden="true" style={{ height: 'calc(4.5rem + env(safe-area-inset-bottom))' }} />
    </div>
  );
}
