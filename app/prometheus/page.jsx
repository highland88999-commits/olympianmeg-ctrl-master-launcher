"use client";

import { useEffect, useRef, useState } from "react";
import {
  mulberry32, spawnEmber, spawnSparks, stepFire, fireColor, flameHeight,
} from "./engine.js";

/**
 * Prometheus' Forge — fire stolen for mortals.
 * Drag to fan the flames, tap STRIKE for a spark shower. Procedural canvas. Zero network.
 */
export default function PrometheusPage() {
  const canvasRef = useRef(null);
  const simRef = useRef(null);
  const [heat, setHeat] = useState(0.6);
  const [paused, setPaused] = useState(false);
  const [strikes, setStrikes] = useState(0);

  const paramsRef = useRef({ heat, paused });
  useEffect(() => { paramsRef.current = { heat, paused }; }, [heat, paused]);

  useEffect(() => {
    document.title = "Prometheus' Forge";
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

    const rng = mulberry32(9001);
    const sim = {
      parts: [],
      wind: { x: 0, y: 0 },
      dragWind: { x: 0, y: 0 },
      t: 0,
      running: true,
      emitAcc: 0,
    };
    simRef.current = sim;

    sim.strike = (x, y) => {
      sim.parts.push(...spawnSparks(x, y, 90, rng));
      setStrikes((s) => s + 1);
    };

    function drawFlames(w, h, now) {
      const p = paramsRef.current;
      const fx = w / 2, fy = h * 0.86;
      const fh = flameHeight(p.heat, now / 1000, 3.7);
      // layered flame tongues — glow stays inside the fire bed
      for (let layer = 0; layer < 4; layer++) {
        const lr = 70 - layer * 15;
        const lh = fh * (1 - layer * 0.2);
        const g = ctx.createRadialGradient(fx, fy, 0, fx, fy - lh * 0.5, lr * 1.6);
        const hue = 50 - layer * 12 - p.heat * 12;
        g.addColorStop(0, `hsla(${hue},100%,${55 - layer * 7}%,${0.5 - layer * 0.09})`);
        g.addColorStop(1, `hsla(${hue},100%,40%,0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(fx, fy - lh * 0.42, lr, lh * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // coal bed
      ctx.fillStyle = "#17100a";
      ctx.beginPath();
      ctx.ellipse(fx, fy + 12, 110, 26, 0, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 14; i++) {
        const cx = fx - 90 + ((i * 67) % 180);
        const cy = fy + 4 + ((i * 41) % 16);
        const pulse = 0.5 + 0.5 * Math.sin(now / 300 + i * 1.7);
        ctx.fillStyle = `hsla(${18 + pulse * 20},95%,${25 + pulse * 30 * p.heat}%,0.9)`;
        ctx.beginPath(); ctx.arc(cx, cy, 5 + pulse * 3, 0, Math.PI * 2); ctx.fill();
      }
    }

    let last = performance.now();
    function frame(now) {
      if (!sim.running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const p = paramsRef.current;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      const fx = w / 2, fy = h * 0.86;

      if (!p.paused && !reduced) {
        sim.t += dt;
        // decay fan wind
        sim.wind.x += (sim.dragWind.x - sim.wind.x) * dt * 2;
        sim.wind.y += (sim.dragWind.y - sim.wind.y) * dt * 2;
        sim.dragWind.x *= 1 - dt * 1.5;
        sim.dragWind.y *= 1 - dt * 1.5;
        // emit embers
        sim.emitAcc += (30 + p.heat * 130) * dt;
        while (sim.emitAcc >= 1 && sim.parts.length < 900) {
          sim.emitAcc -= 1;
          sim.parts.push(spawnEmber(fx, fy, p.heat, rng));
        }
        const alive = [];
        for (const pt of sim.parts) {
          if (stepFire(pt, sim.wind, p.heat, sim.t, dt)) alive.push(pt);
        }
        sim.parts = alive;
      }

      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, "#050308");
      bg.addColorStop(0.75, "#0a0605");
      bg.addColorStop(1, "#120a06");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // anvil silhouette
      ctx.fillStyle = "#0d0b10";
      const ax = w / 2;
      ctx.fillRect(ax - 110, h * 0.86 - 6, 220, 14); // base
      ctx.fillRect(ax - 20, h * 0.86 - 46, 40, 42); // waist
      ctx.beginPath();
      ctx.moveTo(ax - 130, h * 0.86 - 46);
      ctx.lineTo(ax + 40, h * 0.86 - 58);
      ctx.lineTo(ax + 40, h * 0.86 - 34);
      ctx.lineTo(ax - 130, h * 0.86 - 30);
      ctx.closePath(); ctx.fill();

      drawFlames(w, h, now);

      for (const pt of sim.parts) {
        const c = fireColor(pt, p.heat);
        const r = pt.size * (0.5 + c.alpha);
        const g = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, r * 3);
        g.addColorStop(0, `hsla(${c.hue},${c.sat}%,${c.light}%,${c.alpha})`);
        g.addColorStop(1, `hsla(${c.hue},${c.sat}%,${c.light}%,0)`);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(pt.x, pt.y, r * 3, 0, Math.PI * 2); ctx.fill();
      }

      if (!reduced) requestAnimationFrame(frame);
    }

    let dragLast = null;
    function onDown(e) {
      dragLast = { x: e.clientX, y: e.clientY };
    }
    function onMove(e) {
      if (!dragLast) return;
      const dx = e.clientX - dragLast.x, dy = e.clientY - dragLast.y;
      dragLast = { x: e.clientX, y: e.clientY };
      sim.dragWind.x += dx * 6;
      sim.dragWind.y += dy * 6;
    }
    function onUp() { dragLast = null; }
    canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);

    if (reduced) {
      for (let i = 0; i < 120; i++) sim.parts.push(spawnEmber(w0(), h0(), paramsRef.current.heat, rng));
      function w0() { return canvas.clientWidth; }
      function h0() { return canvas.clientHeight; }
      frame(performance.now());
    } else {
      requestAnimationFrame(frame);
    }

    return () => {
      sim.running = false;
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const btn = {
    background: "rgba(24,10,6,0.9)", color: "#ffb066", border: "1px solid rgba(255,176,102,0.45)",
    borderRadius: 8, padding: "12px 14px", fontSize: 14, cursor: "pointer", fontFamily: "inherit",
  };
  const lbl = { fontSize: 11, letterSpacing: 1.5, color: "#a0724f", textTransform: "uppercase" };

  return (
    <>
    <div style={{ position: "fixed", inset: 0, background: "#050308", color: "#ffd9b0", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", overflow: "hidden" }}>
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", touchAction: "none", cursor: "grab" }} />
      <div style={{ position: "absolute", top: 12, left: 12, zIndex: 2, background: "rgba(16,8,5,0.82)", border: "1px solid rgba(255,176,102,0.3)", borderRadius: 10, padding: 12 }}>
        <div style={{ fontSize: 13, letterSpacing: 2, color: "#ffb066" }}>PROMETHEUS&apos; FORGE</div>
        <div style={{ color: "#a0724f", fontSize: 11, marginTop: 2 }}>drag to fan the flames · strike the anvil</div>
        <div style={{ color: "#a0724f", fontSize: 11, marginTop: 4 }}>hammer strikes {strikes}</div>
      </div>
      <div style={{ position: "absolute", left: 12, right: 12, bottom: 12, zIndex: 2, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "stretch" }}>
        <button style={{ ...btn, flex: 1, minWidth: 150, fontWeight: 700 }}
          onClick={() => {
            const r = canvasRef.current.getBoundingClientRect();
            simRef.current?.strike(r.width / 2, r.height * 0.8);
          }}>
          ⚒ STRIKE THE ANVIL
        </button>
        <button style={btn} onClick={() => setPaused(!paused)}>{paused ? "Resume" : "Pause"}</button>
        <div style={{ ...btn, display: "flex", alignItems: "center", gap: 10, flex: 2, minWidth: 220 }}>
          <span style={lbl}>Heat</span>
          <input type="range" min={0.05} max={1} step={0.01} value={heat} style={{ flex: 1 }} aria-label="Heat"
            onChange={(e) => setHeat(Number(e.target.value))} />
          <span style={{ fontSize: 12, width: 40 }}>{Math.round(heat * 100)}%</span>
        </div>
      </div>
    </div>
    {/* Safari bottom-bar clearance: blank space under the fixed forge viewport */}
    <div aria-hidden="true" style={{ height: 'max(5rem, env(safe-area-inset-bottom))' }} />
    </>
  );
}
