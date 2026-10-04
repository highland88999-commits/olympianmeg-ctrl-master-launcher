"use client";

import { useEffect, useRef, useState } from "react";
import { IcPause, IcPlay, IcCloudRain } from "@/app/artemis-ui/icons";
import {
  mulberry32, createVortex, stepVortex, vortexScreenPos,
  createLava, stepLava, lavaScreenPos,
  createPlume, stepPlume, createRain, stepRain,
  makeBolt, stepBolts, createClouds, stepClouds,
} from "./engine";

/**
 * Tornado — a volcanic storm simulator. Particle vortex columns tear across
 * a lava-lit caldera while ash, lightning and rain batter the field.
 * Controls: wind, vortex count, rain, lightning frequency, pause.
 * All canvas 2D, zero external requests.
 */
export default function TornadoPage() {
  const canvasRef = useRef(null);
  const [wind, setWind] = useState(0.5);
  const [vortexCount, setVortexCount] = useState(3);
  const [rainOn, setRainOn] = useState(true);
  const [lightning, setLightning] = useState(0.5);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    document.title = "Tornado";
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  const cfgRef = useRef({ wind, vortexCount, rainOn, lightning, paused });
  cfgRef.current = { wind, vortexCount, rainOn, lightning, paused };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = 800, H = 600;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const rng = mulberry32(20260701);
    const groundY = H - 60;

    // volcano silhouette (procedural ridge)
    const ridge = [];
    const rrng = mulberry32(7);
    for (let x = 0; x <= W; x += 20) {
      const base = groundY - 40 - rrng() * 30;
      ridge.push({ x, y: base });
    }
    // central cone
    const cone = { cx: W * 0.62, top: 150, bottom: groundY, r: 120 };

    let vortices = [];
    for (let i = 0; i < 6; i++) {
      vortices.push(createVortex(rng, 60 + i * 130 + rng() * 60, 0, i % 2));
    }
    const lava = createLava(rng, 260, cone.top, cone.bottom, cone.r);
    const plume = createPlume(rng, 130);
    const rain = createRain(rng, 420, W, H);
    const clouds = createClouds(rng, 7, W);
    let bolts = [];
    let flash = 0;
    let boltTimer = 0;

    let raf = 0;
    let last = performance.now();
    let t = 0;

    function draw(now) {
      raf = requestAnimationFrame(draw);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const cfg = cfgRef.current;
      const active = !cfg.paused && !reduced;
      if (active) t += dt;
      const windX = (cfg.wind - 0.5) * 4;

      if (active) {
        const n = cfg.vortexCount;
        for (let i = 0; i < vortices.length; i++) {
          if (i < n) {
            stepVortex(vortices[i], dt, t, windX);
            if (vortices[i].x > W + 100) vortices[i].x = -100;
            if (vortices[i].x < -100) vortices[i].x = W + 100;
          }
        }
        stepLava(lava, dt);
        stepPlume(plume, dt, windX, rng);
        if (cfg.rainOn) stepRain(rain, dt, W, H, windX);
        stepClouds(clouds, dt, W, windX);
        bolts = stepBolts(bolts, dt);
        boltTimer -= dt;
        if (boltTimer <= 0 && rng() < cfg.lightning) {
          bolts.push(makeBolt(rng, W, 40));
          flash = 1;
          boltTimer = 0.4 + rng() * 2.2;
        }
        if (flash > 0) flash -= dt * 3;
      }

      // sky
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "#05060e");
      sky.addColorStop(0.55, "#0d0a18");
      sky.addColorStop(1, "#1a0c10");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      // clouds (dark, back layer)
      for (const c of clouds) {
        ctx.fillStyle = flash > 0 ? `rgba(90,40,50,${0.5 + flash * 0.4})` : "rgba(16,22,36,0.85)";
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, c.w / 2, c.h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // lightning bolts
      for (const b of bolts) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = `rgba(255,120,120,${Math.max(0, b.life)})`;
        ctx.lineWidth = 2.5;
        ctx.shadowColor = "rgba(255,60,60,0.9)";
        ctx.shadowBlur = 14;
        ctx.beginPath();
        b.pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.stroke();
        ctx.restore();
      }
      if (flash > 0) {
        ctx.fillStyle = `rgba(255,120,120,${flash * 0.12})`;
        ctx.fillRect(0, 0, W, H);
      }

      // volcano cone
      ctx.fillStyle = "#0c0c12";
      ctx.beginPath();
      ctx.moveTo(cone.cx - cone.r, cone.bottom);
      ctx.lineTo(cone.cx - cone.r * 0.14, cone.top);
      ctx.lineTo(cone.cx + cone.r * 0.14, cone.top);
      ctx.lineTo(cone.cx + cone.r, cone.bottom);
      ctx.closePath();
      ctx.fill();
      // crater glow (localized)
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const cg = ctx.createRadialGradient(cone.cx, cone.top, 0, cone.cx, cone.top, 70);
      cg.addColorStop(0, "rgba(255,80,20,0.5)");
      cg.addColorStop(1, "rgba(255,80,20,0)");
      ctx.fillStyle = cg;
      ctx.beginPath(); ctx.arc(cone.cx, cone.top, 70, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      // lava streams
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const d of lava.drops) {
        const p = lavaScreenPos(d, lava, cone.cx, t);
        const a = 0.5 + 0.5 * Math.sin(t * 6 + d.angle * 3);
        ctx.fillStyle = `rgba(255,${60 + Math.round(60 * a)},20,0.85)`;
        ctx.beginPath(); ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();

      // ash plume
      for (const p of plume) {
        const a = Math.max(0, p.life / p.maxLife) * 0.55;
        ctx.fillStyle = p.spark
          ? `rgba(255,140,40,${a + 0.2})`
          : `rgba(40,40,48,${a})`;
        ctx.beginPath();
        ctx.arc(cone.cx + p.x, cone.top - p.y, p.size * (1 + (1 - p.life / p.maxLife)), 0, Math.PI * 2);
        ctx.fill();
      }

      // ground ridge
      ctx.fillStyle = "#08080d";
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (const r of ridge) ctx.lineTo(r.x, r.y);
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();
      // lava veins on ground (localized additive dots)
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 60; i++) {
        const vx = (i * 173.3) % W;
        const vy = groundY + 8 + ((i * 97.7) % 34);
        const pulse = 0.35 + 0.3 * Math.sin(t * 2 + i);
        ctx.fillStyle = `rgba(255,70,20,${pulse * 0.5})`;
        ctx.beginPath(); ctx.arc(vx, vy, 1.6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();

      // vortices
      const n = cfg.vortexCount;
      for (let i = 0; i < n; i++) {
        const v = vortices[i];
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        for (const p of v.particles) {
          const s = vortexScreenPos(p, v, t);
          const sy = groundY - s.y;
          if (sy < -20 || sy > groundY + 20) continue;
          const depthShade = 1 - s.y / 340;
          ctx.fillStyle = v.seedTint
            ? `rgba(150,150,160,${0.16 + depthShade * 0.3})`
            : `rgba(160,120,80,${0.16 + depthShade * 0.3})`;
          ctx.beginPath(); ctx.arc(s.x, sy, p.size, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }

      // rain
      if (cfg.rainOn) {
        ctx.strokeStyle = "rgba(140,220,255,0.4)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (const d of rain) {
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x - windX * 4, d.y - d.len);
        }
        ctx.stroke();
      }

      // vignette
      const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.8);
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, "rgba(0,0,0,0.55)");
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
    }
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  return (
    <div style={styles.page}>
      <div aria-hidden="true" style={styles.bgLayer} />
      <div style={styles.shell}>
        <header style={styles.head}>
          <h1 style={styles.title}>TORNADO</h1>
          <p style={styles.sub}>volcanic storm simulator</p>
        </header>
        <div style={styles.canvasWrap}>
          <canvas ref={canvasRef} style={styles.canvas} aria-label="Tornado storm simulation" />
        </div>
        <div style={styles.panel}>
          <label style={styles.field}>
            <span style={styles.label}>WIND {wind.toFixed(2)}</span>
            <input type="range" min={0} max={1} step={0.01} value={wind} onChange={(e) => setWind(parseFloat(e.target.value))} style={styles.slider} />
          </label>
          <label style={styles.field}>
            <span style={styles.label}>VORTICES {vortexCount}</span>
            <input type="range" min={1} max={6} step={1} value={vortexCount} onChange={(e) => setVortexCount(parseInt(e.target.value, 10))} style={styles.slider} />
          </label>
          <label style={styles.field}>
            <span style={styles.label}>LIGHTNING {lightning.toFixed(2)}</span>
            <input type="range" min={0} max={1} step={0.01} value={lightning} onChange={(e) => setLightning(parseFloat(e.target.value))} style={styles.slider} />
          </label>
          <div style={styles.btnRow}>
            <button onClick={() => setRainOn(!rainOn)} style={{ ...styles.btn, ...(rainOn ? styles.btnOn : {}) }} aria-pressed={rainOn}>
              <IcCloudRain /><span>RAIN</span>
            </button>
            <button onClick={() => setPaused(!paused)} style={styles.btn} aria-label={paused ? "Resume simulation" : "Pause simulation"}>
              {paused ? <IcPlay /> : <IcPause />}<span>{paused ? "RESUME" : "PAUSE"}</span>
            </button>
          </div>
        </div>
        <div aria-hidden="true" style={{ height: 'calc(4.5rem + env(safe-area-inset-bottom))' }} />
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: "100dvh", background: "#000", display: "flex", justifyContent: "center", padding: "20px 12px", fontFamily: "ui-monospace, Menlo, monospace", position: "relative" },
  bgLayer: { position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", opacity: 0.4,
    backgroundImage: "linear-gradient(to bottom, rgba(0,0,0,0.55), rgba(0,0,0,0.2) 45%, rgba(0,0,0,0.75)), url(/images/tornado/bg.webp)",
    backgroundSize: "cover", backgroundPosition: "center" },
  shell: { width: "min(640px, 100%)", position: "relative", zIndex: 1 },
  head: { textAlign: "center", marginBottom: 12 },
  title: { margin: 0, color: "#ff5522", letterSpacing: 10, fontSize: "clamp(1.8rem,7vw,2.6rem)", textShadow: "0 0 24px rgba(255,60,20,0.6)" },
  sub: { color: "#8a93a8", letterSpacing: 4, fontSize: "0.75rem", margin: "6px 0 0", textTransform: "uppercase" },
  canvasWrap: { border: "1px solid rgba(255,80,20,0.25)", borderRadius: 12, overflow: "hidden" },
  canvas: { display: "block", width: "100%", height: "auto", aspectRatio: "800 / 600" },
  panel: { marginTop: 14, backgroundImage: "linear-gradient(rgba(12,8,10,0.86), rgba(12,8,10,0.86)), url(/images/tornado/tile.webp)", backgroundSize: "auto, 180px", border: "1px solid rgba(255,80,20,0.2)", borderRadius: 12, padding: 16, display: "grid", gap: 12 },
  field: { display: "grid", gap: 6 },
  label: { color: "#ffb08a", fontSize: "0.72rem", letterSpacing: 2 },
  slider: { width: "100%", accentColor: "#ff5522" },
  btnRow: { display: "flex", gap: 10 },
  btn: { display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 18px", fontSize: "0.75rem", cursor: "pointer", background: "transparent", color: "#ffb08a", border: "1px solid rgba(255,80,20,0.4)", letterSpacing: 2, borderRadius: 6, fontFamily: "inherit", fontWeight: "bold" },
  btnOn: { background: "rgba(255,80,20,0.18)", color: "#ff8855", borderColor: "#ff5522" },
};
