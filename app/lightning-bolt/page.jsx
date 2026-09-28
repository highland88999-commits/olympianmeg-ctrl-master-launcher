"use client";

import { useEffect, useRef, useState } from "react";
import {
  mulberry32,
  buildBolt,
  makeRain,
  stepRain,
  nextStrikeDelay,
  flashEnvelope,
} from "./engine.js";

/**
 * Storm Bolt — tap the sky to call lightning. Storm mode, rain, forked bolts.
 * Fully procedural canvas 2D. Zero network.
 */
export default function LightningBoltPage() {
  const canvasRef = useRef(null);
  const simRef = useRef(null);
  const [storm, setStorm] = useState(false);
  const [rainOn, setRainOn] = useState(true);
  const [intensity, setIntensity] = useState(0.7);
  const [strikes, setStrikes] = useState(0);
  const [paused, setPaused] = useState(false);

  const paramsRef = useRef({ storm, rainOn, intensity, paused });
  useEffect(() => {
    paramsRef.current = { storm, rainOn, intensity, paused };
  }, [storm, rainOn, intensity, paused]);

  useEffect(() => {
    document.title = "Storm Bolt";
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

    let rng = mulberry32((Date.now() ^ 0x9e3779b9) >>> 0);
    const sim = {
      bolts: [], // { segs, born, life, hue }
      clouds: [],
      rain: [],
      flashAt: -1e9,
      nextAuto: performance.now() + 2500,
      running: true,
    };
    simRef.current = sim;

    function rebuildRain() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      sim.rain = makeRain(Math.round((w * h) / 5200), w, h, rng);
    }
    rebuildRain();

    for (let i = 0; i < 9; i++) {
      sim.clouds.push({
        x: rng(), y: rng() * 0.35, s: 120 + rng() * 220,
        v: 0.004 + rng() * 0.012, a: 0.10 + rng() * 0.12,
      });
    }

    function strike(x, y) {
      const h = canvas.clientHeight;
      const segs = buildBolt(x, -20, x + (rng() - 0.5) * 160, y, rng, {
        displace: 0.22 + paramsRef.current.intensity * 0.18,
        branchChance: 0.12 + paramsRef.current.intensity * 0.3,
        minLen: 10,
      });
      sim.bolts.push({ segs, born: performance.now(), life: 260 + rng() * 220, hue: 185 + rng() * 25 });
      if (sim.bolts.length > 6) sim.bolts.shift();
      sim.flashAt = performance.now();
      setStrikes((s) => s + 1);
    }
    sim.strikeAt = (x, y) => strike(x, y);

    function drawClouds(w, h, t) {
      for (const c of sim.clouds) {
        const cx = ((c.x + t * c.v) % 1.3 - 0.15) * w;
        const cy = c.y * h;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, c.s);
        g.addColorStop(0, `rgba(40,60,95,${c.a})`);
        g.addColorStop(1, "rgba(40,60,95,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(cx, cy, c.s, c.s * 0.38, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function drawBolt(b, now) {
      const age = now - b.born;
      const fade = Math.max(0, 1 - age / b.life);
      const flicker = 0.55 + 0.45 * Math.abs(Math.sin(age * 0.09));
      const alpha = fade * flicker;
      const int = paramsRef.current.intensity;
      for (const pass of [0, 1]) {
        ctx.lineCap = "round";
        for (const s of b.segs) {
          if (pass === 0) {
            // localized outer glow, thin — never washes the scene
            ctx.strokeStyle = `hsla(${b.hue},100%,60%,${0.28 * alpha})`;
            ctx.lineWidth = 4 + int * 8;
          } else {
            ctx.strokeStyle = `hsla(${b.hue},100%,92%,${0.95 * alpha})`;
            ctx.lineWidth = s.gen > 0 ? 1 : 1.8;
          }
          ctx.beginPath();
          ctx.moveTo(s.x1, s.y1);
          ctx.lineTo(s.x2, s.y2);
          ctx.stroke();
        }
      }
    }

    let last = performance.now();
    function frame(now) {
      if (!sim.running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const p = paramsRef.current;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      const t = now / 1000;

      if (!p.paused) {
        if (p.storm && now > sim.nextAuto && !reduced) {
          strike(rng() * w, h * (0.35 + rng() * 0.5));
          sim.nextAuto = now + nextStrikeDelay(rng);
        }
        if (p.rainOn && !reduced) stepRain(sim.rain, dt, w, h);
        sim.bolts = sim.bolts.filter((b) => now - b.born < b.life);
      }

      // sky
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, "#04060f");
      sky.addColorStop(0.6, "#070b18");
      sky.addColorStop(1, "#0a0f1e");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      // screen flash — brief, subtle
      const fl = flashEnvelope(now - sim.flashAt);
      if (fl > 0.01) {
        ctx.fillStyle = `rgba(160,220,255,${0.10 * fl})`;
        ctx.fillRect(0, 0, w, h);
      }

      drawClouds(w, h, t);

      // city silhouette for grounding
      ctx.fillStyle = "#05070d";
      let bx = 0;
      let i = 0;
      while (bx < w) {
        const bw = 30 + ((i * 53) % 47);
        const bh = 40 + ((i * 97) % 120);
        ctx.fillRect(bx, h - bh, bw, bh);
        bx += bw + 6;
        i++;
      }

      // rain
      if (p.rainOn) {
        ctx.strokeStyle = "rgba(140,190,240,0.28)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (const d of sim.rain) {
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x - 2, d.y + d.len);
        }
        ctx.stroke();
      }

      for (const b of sim.bolts) drawBolt(b, now);

      // ground impact glow — small and local
      for (const b of sim.bolts) {
        const age = now - b.born;
        const fade = Math.max(0, 1 - age / b.life);
        if (fade <= 0) continue;
        let maxY = 0, ix = 0;
        for (const s of b.segs) {
          if (s.gen === 0 && s.y2 > maxY) { maxY = s.y2; ix = s.x2; }
        }
        const g = ctx.createRadialGradient(ix, maxY, 0, ix, maxY, 70);
        g.addColorStop(0, `rgba(180,230,255,${0.5 * fade})`);
        g.addColorStop(1, "rgba(180,230,255,0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(ix, maxY, 70, 0, Math.PI * 2); ctx.fill();
      }

      if (!reduced) requestAnimationFrame(frame);
    }

    function onTap(e) {
      const r = canvas.getBoundingClientRect();
      strike(e.clientX - r.left, e.clientY - r.top);
    }
    canvas.addEventListener("pointerdown", onTap);

    if (reduced) {
      strike(canvas.clientWidth / 2, canvas.clientHeight * 0.7);
      frame(performance.now());
    } else {
      requestAnimationFrame(frame);
    }

    return () => {
      sim.running = false;
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onTap);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const btn = {
    background: "rgba(8,14,28,0.9)", color: "#9adcff", border: "1px solid rgba(154,220,255,0.4)",
    borderRadius: 8, padding: "12px 14px", fontSize: 14, cursor: "pointer", fontFamily: "inherit",
  };
  const lbl = { fontSize: 11, letterSpacing: 1.5, color: "#5f7fa6", textTransform: "uppercase" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#04060f", color: "#cfeaff", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", overflow: "hidden" }}>
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", touchAction: "none", cursor: "crosshair" }} />
      <div style={{ position: "absolute", top: 12, left: 12, zIndex: 2, background: "rgba(4,8,18,0.8)", border: "1px solid rgba(154,220,255,0.25)", borderRadius: 10, padding: 12 }}>
        <div style={{ fontSize: 13, letterSpacing: 2, color: "#9adcff" }}>STORM BOLT</div>
        <div style={{ color: "#5f7fa6", fontSize: 11, marginTop: 2 }}>tap the sky to call lightning</div>
        <div style={{ color: "#5f7fa6", fontSize: 11, marginTop: 4 }}>strikes {strikes}{storm ? " · storm live" : ""}</div>
      </div>
      <div style={{ position: "absolute", left: 12, right: 12, bottom: 12, zIndex: 2, display: "flex", gap: 10, alignItems: "stretch", flexWrap: "wrap" }}>
        <button style={{ ...btn, flex: 1, minWidth: 130 }} onClick={() => setStorm(!storm)}>
          {storm ? "CALM THE STORM" : "SUMMON STORM"}
        </button>
        <button style={{ ...btn, flex: 1, minWidth: 130 }} onClick={() => setRainOn(!rainOn)}>
          RAIN {rainOn ? "ON" : "OFF"}
        </button>
        <button style={btn} onClick={() => setPaused(!paused)}>{paused ? "Resume" : "Pause"}</button>
        <div style={{ ...btn, display: "flex", alignItems: "center", gap: 10, flex: 2, minWidth: 200 }}>
          <span style={lbl}>Fury</span>
          <input type="range" min={0.1} max={1} step={0.01} value={intensity}
            style={{ flex: 1 }} aria-label="Bolt intensity"
            onChange={(e) => setIntensity(Number(e.target.value))} />
        </div>
      </div>
    </div>
  );
}
