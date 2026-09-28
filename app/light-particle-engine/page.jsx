"use client";

import { useEffect, useRef, useState } from "react";
import {
  mulberry32,
  spawnParticle,
  stepParticle,
  particleColor,
} from "./engine.js";

/**
 * Light Particle Engine — interactive 2D particle laboratory.
 * Emitters, force fields, color modes, pause/step. Zero network.
 */
export default function LightParticleEnginePage() {
  const canvasRef = useRef(null);
  const simRef = useRef(null);
  const [emitterType, setEmitterType] = useState("fountain");
  const [fieldKind, setFieldKind] = useState("well");
  const [colorMode, setColorMode] = useState("prism");
  const [rate, setRate] = useState(220);
  const [speed, setSpeed] = useState(260);
  const [life, setLife] = useState(2.2);
  const [paused, setPaused] = useState(false);
  const [stats, setStats] = useState({ count: 0, fps: 0 });
  const [seed, setSeed] = useState(1337);

  const paramsRef = useRef({ emitterType, fieldKind, colorMode, rate, speed, life, paused, seed });
  useEffect(() => {
    paramsRef.current = { emitterType, fieldKind, colorMode, rate, speed, life, paused, seed };
  }, [emitterType, fieldKind, colorMode, rate, speed, life, paused, seed]);

  useEffect(() => {
    document.title = "Light Particle Engine";
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(r.width * dpr));
      canvas.height = Math.max(1, Math.floor(r.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);

    let rng = mulberry32(paramsRef.current.seed);
    const sim = {
      particles: [],
      field: { x: 0, y: 0, placed: false },
      t: 0,
      emitAcc: 0,
      frames: 0,
      lastFpsT: performance.now(),
      running: true,
      stepOnce: false,
    };
    simRef.current = sim;

    function emitterAt(w, h) {
      const p = paramsRef.current;
      return {
        type: p.emitterType,
        x: w / 2,
        y: p.emitterType === "fountain" ? h * 0.85 : h / 2,
        speed: p.speed,
        life: p.life,
        spread: 0.7,
        radius: Math.min(w, h) * 0.18,
        clockwise: true,
        hueSpread: 60,
        size: 2.4,
      };
    }

    function activeFields(w, h) {
      const p = paramsRef.current;
      const f = sim.field.placed ? sim.field : { x: w / 2, y: h / 2 };
      if (p.fieldKind === "none") return [{ kind: "gravity", strength: 120 }];
      if (p.fieldKind === "turbulence") return [{ kind: "turbulence", strength: 0.55, scale: 1 }];
      if (p.fieldKind === "wind") return [{ kind: "wind", dx: 1, dy: 0.1, strength: 90 }];
      return [{ kind: p.fieldKind, x: f.x, y: f.y, strength: 9e6 }];
    }

    function burst(n) {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      for (let i = 0; i < n; i++) {
        sim.particles.push(spawnParticle(emitterAt(w, h), rng, 190));
      }
    }

    function advance(dt) {
      const p = paramsRef.current;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      sim.t += dt;
      sim.emitAcc += p.rate * dt;
      const emitter = emitterAt(w, h);
      while (sim.emitAcc >= 1 && sim.particles.length < 4000) {
        sim.emitAcc -= 1;
        sim.particles.push(spawnParticle(emitter, rng, 190));
      }
      const fields = activeFields(w, h);
      const alive = [];
      for (const pt of sim.particles) {
        if (stepParticle(pt, fields, sim.t, dt)) alive.push(pt);
      }
      sim.particles = alive;
    }

    function draw() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      const p = paramsRef.current;
      ctx.fillStyle = "#020409";
      ctx.fillRect(0, 0, w, h);

      // faint grid floor for depth
      ctx.strokeStyle = "rgba(60,80,120,0.12)";
      ctx.lineWidth = 1;
      for (let gx = 0; gx < w; gx += 64) {
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke();
      }
      for (let gy = 0; gy < h; gy += 64) {
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke();
      }

      if (sim.field.placed) {
        const f = sim.field;
        const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, 46);
        const c = p.fieldKind === "repulsor" ? "255,120,80" : "90,200,255";
        g.addColorStop(0, `rgba(${c},0.5)`);
        g.addColorStop(1, `rgba(${c},0)`);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(f.x, f.y, 46, 0, Math.PI * 2); ctx.fill();
      }

      for (const pt of sim.particles) {
        const c = particleColor(pt, p.colorMode);
        const fade = Math.max(0, pt.life / pt.maxLife);
        const r = pt.size * (0.5 + fade * 0.8);
        // localized glow: small radial gradient per particle
        const g = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, r * 3);
        g.addColorStop(0, `hsla(${c.hue},${c.sat}%,${c.light}%,${0.9 * fade})`);
        g.addColorStop(1, `hsla(${c.hue},${c.sat}%,${c.light}%,0)`);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(pt.x, pt.y, r * 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `hsla(${c.hue},100%,88%,${0.95 * fade})`;
        ctx.beginPath(); ctx.arc(pt.x, pt.y, r * 0.8, 0, Math.PI * 2); ctx.fill();
      }
    }

    function frame(now) {
      if (!sim.running) return;
      const p = paramsRef.current;
      const dt = Math.min(0.05, (now - (frame.last || now)) / 1000);
      frame.last = now;
      if (!p.paused || sim.stepOnce) {
        sim.stepOnce = false;
        advance(dt);
      }
      draw();
      sim.frames += 1;
      if (now - sim.lastFpsT > 500) {
        const fps = Math.round((sim.frames * 1000) / (now - sim.lastFpsT));
        sim.frames = 0;
        sim.lastFpsT = now;
        setStats({ count: sim.particles.length, fps });
      }
      if (!reduced) requestAnimationFrame(frame);
    }

    if (reduced) {
      advance(0.016);
      draw();
      setStats({ count: sim.particles.length, fps: 0 });
    } else {
      requestAnimationFrame(frame);
    }

    function onPointerDown(e) {
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      if (e.shiftKey) {
        sim.field = { x, y, placed: true };
      } else {
        burst(120);
      }
    }
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("dblclick", () => { sim.particles = []; sim.emitAcc = 0; });

    sim.reseed = (s) => { rng = mulberry32(s); sim.particles = []; sim.emitAcc = 0; sim.t = 0; };
    sim.burst = burst;
    sim.step = () => { sim.stepOnce = true; advance(1 / 60); draw(); };
    sim.clear = () => { sim.particles = []; sim.emitAcc = 0; };

    return () => {
      sim.running = false;
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onPointerDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const btn = {
    background: "rgba(10,18,32,0.9)", color: "#7fd8ff", border: "1px solid rgba(127,216,255,0.4)",
    borderRadius: 8, padding: "10px 12px", fontSize: 13, cursor: "pointer", fontFamily: "inherit",
  };
  const sel = { ...btn, width: "100%" };
  const lbl = { fontSize: 11, letterSpacing: 1.5, color: "#5f7fa6", textTransform: "uppercase" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#020409", color: "#cfeaff", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", overflow: "hidden" }}>
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", touchAction: "none", cursor: "crosshair" }} />
      <div style={{ position: "absolute", top: 12, left: 12, zIndex: 2, background: "rgba(3,8,18,0.82)", border: "1px solid rgba(127,216,255,0.25)", borderRadius: 10, padding: 12, fontSize: 12 }}>
        <div style={{ fontSize: 13, letterSpacing: 2, color: "#7fd8ff", marginBottom: 4 }}>LIGHT PARTICLE ENGINE</div>
        <div style={{ color: "#5f7fa6", fontSize: 11 }}>tap: burst · shift+tap: move field · double-tap: clear</div>
        <div style={{ color: "#5f7fa6", fontSize: 11, marginTop: 4 }}>
          particles {stats.count} · {stats.fps} fps
        </div>
      </div>
      <div style={{ position: "absolute", right: 12, bottom: 12, zIndex: 2, background: "rgba(3,8,18,0.82)", border: "1px solid rgba(127,216,255,0.25)", borderRadius: 10, padding: 14, width: 230, display: "grid", gap: 10, maxHeight: "70vh", overflowY: "auto" }}>
        <div><div style={lbl}>Emitter</div>
          <select style={sel} value={emitterType} onChange={(e) => setEmitterType(e.target.value)}>
            <option value="point">Point</option><option value="fountain">Fountain</option>
            <option value="ring">Ring</option><option value="vortex">Vortex</option>
          </select></div>
        <div><div style={lbl}>Force field</div>
          <select style={sel} value={fieldKind} onChange={(e) => setFieldKind(e.target.value)}>
            <option value="well">Gravity well</option><option value="repulsor">Repulsor</option>
            <option value="turbulence">Turbulence</option><option value="wind">Wind</option>
            <option value="none">None (drift)</option>
          </select></div>
        <div><div style={lbl}>Color</div>
          <select style={sel} value={colorMode} onChange={(e) => setColorMode(e.target.value)}>
            <option value="prism">Prism</option><option value="ember">Ember</option>
            <option value="ice">Ice</option><option value="mono">Mono</option>
          </select></div>
        {[
          ["Rate", rate, setRate, 0, 800, " p/s"],
          ["Speed", speed, setSpeed, 40, 600, ""],
          ["Life", life, setLife, 0.5, 6, " s"],
        ].map(([label, v, setV, min, max, unit]) => (
          <div key={label}>
            <div style={{ ...lbl, display: "flex", justifyContent: "space-between" }}>
              <span>{label}</span><span>{Number(v).toFixed(1)}{unit}</span>
            </div>
            <input type="range" min={min} max={max} step="any" value={v} style={{ width: "100%" }}
              onChange={(e) => setV(Number(e.target.value))} aria-label={label} />
          </div>
        ))}
        <div><div style={lbl}>Seed</div>
          <input type="number" value={seed} style={{ ...sel }} onChange={(e) => { const s = Number(e.target.value) || 0; setSeed(s); simRef.current?.reseed(s); }} /></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button style={btn} onClick={() => setPaused(!paused)}>{paused ? "Resume" : "Pause"}</button>
          <button style={btn} onClick={() => simRef.current?.step()}>Step</button>
          <button style={btn} onClick={() => simRef.current?.burst(300)}>Burst</button>
          <button style={btn} onClick={() => simRef.current?.clear()}>Clear</button>
        </div>
      </div>
      {/* Safari bottom-bar clearance */}
      <div aria-hidden="true" style={{ height: 'max(5rem, env(safe-area-inset-bottom))' }} />
    </div>
  );
}
