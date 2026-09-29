"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  CYCLE,
  EVENT_WINDOWS,
  phaseAt,
  nextEventIn,
  meteorShowerActive,
  bodyPositions,
  spawnMeteors,
  meteorStep,
} from "./engine";

/**
 * Olympus Eclipse — orbital event diorama.
 * Rebuilt from the original three.js scene as hand-rolled canvas 2D:
 * a 90-second choreographed cycle (total solar eclipse → lunar eclipse →
 * blood moon) plus meteor-shower bursts, scrubbable timeline, pan/zoom.
 * Stripped from the source: referral-gated lander, fake cart, Google Maps
 * iframe, telemetry scripts, hardcoded keys, CDN three.js.
 */
const SPEEDS = [1, 4, 16];

export default function OlympusEclipsePage() {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speedIdx, setSpeedIdx] = useState(0);
  const [meteorsOn, setMeteorsOn] = useState(true);
  const [alert, setAlert] = useState(null);
  const sim = useRef({
    t: 0,
    playing: true,
    speed: 1,
    meteorsOn: true,
    camX: 0,
    camY: 0,
    zoom: 1,
    targetZoom: 1,
    dragging: false,
    lastX: 0,
    lastY: 0,
    meteors: [],
    reduced: false,
    lastAlert: null,
  });

  useEffect(() => {
    document.title = "Olympus Eclipse";
    sim.current.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (sim.current.reduced) {
      sim.current.playing = false;
      setPlaying(false);
    }
  }, []);

  const syncSim = () => {
    const s = sim.current;
    s.playing = playing;
    s.speed = SPEEDS[speedIdx];
    s.meteorsOn = meteorsOn;
  };
  useEffect(syncSim, [playing, speedIdx, meteorsOn]);

  const jumpToNext = useCallback(() => {
    sim.current.t += nextEventIn(sim.current.t) + 0.01;
    setT(sim.current.t % CYCLE);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    const s = sim.current;
    let raf = 0;
    let last = performance.now();
    let stars = [];

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = r.width * dpr;
      canvas.height = r.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      stars = [];
      for (let i = 0; i < 240; i++)
        stars.push({ x: Math.random(), y: Math.random(), r: Math.random() * 1.2 + 0.3, a: 0.2 + Math.random() * 0.6 });
    };
    resize();
    window.addEventListener("resize", resize);

    const onDown = (e) => {
      s.dragging = true;
      s.lastX = e.clientX;
      s.lastY = e.clientY;
    };
    const onMove = (e) => {
      if (!s.dragging) return;
      s.camX += (e.clientX - s.lastX) / s.zoom;
      s.camY += (e.clientY - s.lastY) / s.zoom;
      s.lastX = e.clientX;
      s.lastY = e.clientY;
    };
    const onUp = () => (s.dragging = false);
    const onWheel = (e) => {
      e.preventDefault();
      s.targetZoom = Math.min(2.5, Math.max(0.6, s.targetZoom * (e.deltaY > 0 ? 0.93 : 1.08)));
    };
    canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    const draw = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;

      if (s.playing && !s.reduced) s.t += dt * s.speed;
      s.zoom += (s.targetZoom - s.zoom) * 0.12;

      const info = phaseAt(s.t);
      if (info.activeEvent?.label !== s.lastAlert) {
        s.lastAlert = info.activeEvent?.label || null;
        setAlert(info.activeEvent?.label || null);
      }
      if (Math.floor(s.t * 2) !== Math.floor((s.t - dt * s.speed) * 2)) setT(s.t % CYCLE);

      // meteors
      const shower = s.meteorsOn && meteorShowerActive(s.t);
      if (shower && s.meteors.length === 0) s.meteors = spawnMeteors(70, w, h);
      if (!shower && s.meteors.length > 0) s.meteors = [];
      if (s.meteors.length) s.meteors = meteorStep(s.meteors, dt, w, h);

      ctx.fillStyle = "#02030a";
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.translate(w / 2 + s.camX * s.zoom, h / 2 + s.camY * s.zoom);
      ctx.scale(s.zoom, s.zoom);
      ctx.translate(-w / 2, -h / 2);

      for (const st of stars) {
        ctx.globalAlpha = st.a;
        ctx.fillStyle = "#cfe6ff";
        ctx.fillRect(st.x * w, st.y * h, st.r, st.r);
      }
      ctx.globalAlpha = 1;

      const P = bodyPositions(s.t, w, h);
      const dim = info.corona > 0.3 || info.moonShadow > 0.3 ? 0.35 : 1;

      // meteors (behind bodies)
      for (const m of s.meteors) {
        const grad = ctx.createLinearGradient(m.x, m.y, m.x - m.len * 0.35, m.y - m.len);
        grad.addColorStop(0, `rgba(0,255,170,${0.8 * m.life})`);
        grad.addColorStop(1, "rgba(0,255,170,0)");
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(m.x - m.len * 0.35, m.y - m.len);
        ctx.stroke();
      }

      // orbit path
      ctx.strokeStyle = "rgba(120,160,220,0.18)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(P.sun.x, P.sun.y, P.earthOrbitR, P.earthOrbitR * 0.72, 0, 0, Math.PI * 2);
      ctx.stroke();

      // sun — localized glow only
      const sunGrad = ctx.createRadialGradient(P.sun.x, P.sun.y, P.sun.r * 0.2, P.sun.x, P.sun.y, P.sun.r);
      sunGrad.addColorStop(0, "#fff6d8");
      sunGrad.addColorStop(0.75, "#ffb347");
      sunGrad.addColorStop(1, "#ff7b1c");
      ctx.globalAlpha = dim;
      ctx.fillStyle = sunGrad;
      ctx.beginPath();
      ctx.arc(P.sun.x, P.sun.y, P.sun.r, 0, Math.PI * 2);
      ctx.fill();
      // corona ring during totality
      if (info.corona > 0.01) {
        ctx.globalAlpha = info.corona;
        ctx.strokeStyle = "#ffe9b0";
        ctx.lineWidth = 2 + info.corona * 5;
        ctx.beginPath();
        ctx.arc(P.sun.x, P.sun.y, P.sun.r * (1.08 + info.corona * 0.12), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // earth — procedural marble: gradient + noise continents
      const eGrad = ctx.createRadialGradient(
        P.ex - P.earthR * 0.4, P.ey - P.earthR * 0.4, P.earthR * 0.1,
        P.ex, P.ey, P.earthR
      );
      eGrad.addColorStop(0, "#3d7bc2");
      eGrad.addColorStop(0.6, "#1c4d8f");
      eGrad.addColorStop(1, "#0a2347");
      ctx.globalAlpha = dim;
      ctx.fillStyle = eGrad;
      ctx.beginPath();
      ctx.arc(P.ex, P.ey, P.earthR, 0, Math.PI * 2);
      ctx.fill();
      // continents: deterministic blobs clipped to the disc
      ctx.save();
      ctx.beginPath();
      ctx.arc(P.ex, P.ey, P.earthR, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = "rgba(46,139,87,0.85)";
      const blobs = [[-0.4, -0.2, 0.42], [0.35, 0.25, 0.34], [0.05, -0.45, 0.26], [-0.15, 0.4, 0.3]];
      for (const [bx, by, br] of blobs) {
        ctx.beginPath();
        ctx.arc(P.ex + bx * P.earthR, P.ey + by * P.earthR, br * P.earthR, 0, Math.PI * 2);
        ctx.fill();
      }
      // night side shading from sun direction
      const toSun = Math.atan2(P.sun.y - P.ey, P.sun.x - P.ex);
      const nightGrad = ctx.createLinearGradient(
        P.ex + Math.cos(toSun) * P.earthR, P.ey + Math.sin(toSun) * P.earthR,
        P.ex - Math.cos(toSun) * P.earthR, P.ey - Math.sin(toSun) * P.earthR
      );
      nightGrad.addColorStop(0, "rgba(0,0,10,0)");
      nightGrad.addColorStop(1, "rgba(0,0,10,0.55)");
      ctx.fillStyle = nightGrad;
      ctx.fillRect(P.ex - P.earthR, P.ey - P.earthR, P.earthR * 2, P.earthR * 2);
      ctx.restore();
      // atmosphere rim (localized)
      ctx.globalAlpha = dim;
      ctx.strokeStyle = "rgba(0,242,255,0.5)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(P.ex, P.ey, P.earthR + 1, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // moon
      const mGrad = ctx.createRadialGradient(
        P.mx - P.moonR * 0.3, P.my - P.moonR * 0.3, P.moonR * 0.1,
        P.mx, P.my, P.moonR
      );
      const blood = info.bloodTint;
      mGrad.addColorStop(0, blood > 0.3 ? "#e8a08a" : "#e8e8e8");
      mGrad.addColorStop(1, blood > 0.3 ? "#a83c28" : "#8a8a8a");
      ctx.globalAlpha = Math.max(0.25, 1 - info.moonShadow * 0.75);
      ctx.fillStyle = mGrad;
      ctx.beginPath();
      ctx.arc(P.mx, P.my, P.moonR, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.restore();
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
  }, []);

  const info = phaseAt(t);
  const countdown = nextEventIn(t);

  return (
    <div
      ref={wrapRef}
      style={{ position: "relative", width: "100%", minHeight: "100dvh", background: "#02030a", color: "#e8f6ff", fontFamily: "'Courier New', monospace", overflow: "hidden" }}
    >
      <style>{`
        .ecl-hud{position:absolute;top:16px;left:16px;z-index:10;pointer-events:none}
        .ecl-hud h1{margin:0;font-size:1rem;letter-spacing:5px;color:#00f2ff;text-shadow:0 0 12px rgba(0,242,255,.6)}
        .ecl-alert{position:absolute;top:18%;left:50%;transform:translateX(-50%);z-index:10;pointer-events:none;
          border:1px solid #00f2ff;background:rgba(0,242,255,.08);color:#00f2ff;padding:12px 18px;
          font-weight:bold;letter-spacing:3px;font-size:.8rem;text-align:center;max-width:88vw}
        .ecl-alert.blood{border-color:#ff0033;color:#ff0033;background:rgba(255,0,51,.08)}
        .ecl-alert.meteor{border-color:#00ffaa;color:#00ffaa;background:rgba(0,255,170,.08)}
        .ecl-bar{position:absolute;bottom:0;left:0;right:0;z-index:10;background:rgba(2,6,14,.92);
          border-top:1px solid rgba(0,242,255,.3);padding:12px 16px;display:flex;flex-wrap:wrap;
          padding-bottom:calc(4.5rem+env(safe-area-inset-bottom));
          gap:10px;align-items:center;justify-content:center}
        .ecl-btn{background:rgba(0,0,0,.5);border:1px solid #00f2ff;color:#00f2ff;padding:10px 16px;
          cursor:pointer;font-size:.7rem;letter-spacing:2px;font-family:inherit;min-height:44px;border-radius:4px}
        .ecl-btn:hover{background:#00f2ff;color:#000}
        .ecl-btn.on{background:#00f2ff;color:#000}
        .ecl-track{flex:1 1 220px;min-width:180px;height:10px;background:#06121f;border:1px solid rgba(0,242,255,.3);
          border-radius:5px;position:relative;cursor:pointer}
        .ecl-fill{height:100%;background:#00f2ff;border-radius:5px}
        .ecl-tick{position:absolute;top:-3px;width:2px;height:14px;background:#ff0033}
        .ecl-count{font-size:.72rem;opacity:.75;min-width:170px;text-align:center}
      `}</style>

      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", touchAction: "none", cursor: "grab" }} aria-label="Eclipse cycle diorama" />

      <div className="ecl-hud"><h1>OLYMPIAN · ORBITAL EVENTS</h1></div>

      {alert && (
        <div className={`ecl-alert ${alert.includes("BLOOD") ? "blood" : ""}`}>{alert}</div>
      )}
      {!alert && meteorShowerActive(t) && meteorsOn && (
        <div className="ecl-alert meteor">METEOR SHOWER DETECTED</div>
      )}

      <div className="ecl-bar">
        <button className="ecl-btn" onClick={() => setPlaying((p) => !p)}>{playing ? "PAUSE" : "PLAY"}</button>
        <button className="ecl-btn" onClick={() => setSpeedIdx((i) => (i + 1) % SPEEDS.length)}>×{SPEEDS[speedIdx]}</button>
        <button className="ecl-btn" onClick={jumpToNext}>NEXT EVENT</button>
        <button className={`ecl-btn ${meteorsOn ? "on" : ""}`} onClick={() => setMeteorsOn((m) => !m)}>METEORS</button>
        <div
          className="ecl-track"
          role="slider"
          aria-label="Cycle timeline"
          aria-valuenow={Math.round(t)}
          aria-valuemin={0}
          aria-valuemax={CYCLE}
          tabIndex={0}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const frac = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
            sim.current.t = frac * CYCLE;
            setT(frac * CYCLE);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
              const d = e.key === "ArrowRight" ? 2 : -2;
              sim.current.t = (sim.current.t + d + CYCLE) % CYCLE;
              setT(sim.current.t);
            }
          }}
        >
          <div className="ecl-fill" style={{ width: `${(t / CYCLE) * 100}%` }} />
          {EVENT_WINDOWS.map((w) => (
            <div key={w.label} className="ecl-tick" style={{ left: `${(w.start / CYCLE) * 100}%` }} title={w.label} />
          ))}
        </div>
        <div className="ecl-count">
          {info.activeEvent ? "EVENT ACTIVE" : `NEXT EVENT IN ${Math.ceil(countdown)}S`}
          {" · "}{info.phase.toUpperCase()} PHASE
        </div>
      </div>
      {/* Safari bottom-bar clearance */}
      <div aria-hidden="true" style={{ height: 'calc(4.5rem + env(safe-area-inset-bottom))' }} />
    </div>
  );
}
