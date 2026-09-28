"use client";

import { useEffect, useRef, useState } from "react";
import {
  makeStars,
  makeNebulae,
  stepStars,
  projectStar,
  createFlight,
  stepFlight,
  clampWarp,
  timeDilation,
  formatLightYears,
  MAX_WARP,
} from "./warp";

/**
 * Infinity Drive — an endless warp flight, built from the "Holoframe Nexus"
 * shell (which was only a video frame around a remote page).
 * Throttle the warp drive, steer with drag, and watch the light-years pile
 * up. Everything is procedural; nothing leaves the browser.
 */
export default function InfinityDrivePage() {
  const canvasRef = useRef(null);
  const hudRef = useRef(null);
  const [ui, setUi] = useState({ playing: true, warp: 5, overdrive: false });
  const uiRef = useRef(ui);
  uiRef.current = ui;

  useEffect(() => {
    document.title = "Infinity Drive";
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const field = makeStars(20260927, 420);
    const nebulae = makeNebulae(99, 7);
    const flight = createFlight();
    flight.warp = uiRef.current.warp;
    const prev = new Float32Array(420 * 2); // previous projected pos for streaks
    const steer = { x: 0, y: 0, active: false };

    function resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);

    function draw(now) {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const t = now / 1000;
      ctx.fillStyle = "#020208";
      ctx.fillRect(0, 0, w, h);

      const cx = w / 2 + steer.x * 60;
      const cy = h / 2 + steer.y * 60;
      const focal = Math.min(w, h) * 0.5;
      const wEff = flight.overdrive ? 9.99 : flight.warp;

      // procedural nebulae, drifting
      for (const n of nebulae) {
        const nx = cx + n.x * w * 0.7 + (reduced ? 0 : Math.sin(t * n.drift * 4 + n.hue) * 30);
        const ny = cy + n.y * h * 0.7;
        const nr = n.r * Math.min(w, h) * (0.9 + n.depth * 0.4);
        const g = ctx.createRadialGradient(nx, ny, 4, nx, ny, nr);
        g.addColorStop(0, `hsla(${n.hue},70%,38%,0.34)`);
        g.addColorStop(1, "hsla(0,0%,0%,0)");
        ctx.fillStyle = g;
        ctx.fillRect(nx - nr, ny - nr, nr * 2, nr * 2);
      }

      // stars: streaks when fast, points when slow
      const streak = reduced ? 0 : Math.min(1, (wEff - 1) / 8);
      for (let i = 0; i < field.stars.length; i++) {
        const s = field.stars[i];
        const p = projectStar(s, cx, cy, focal, 0, 0);
        const px = prev[i * 2];
        const py = prev[i * 2 + 1];
        const bright = 0.35 + p.near * 0.65;
        const col = s.tint < 0.5
          ? `rgba(255,255,255,${bright.toFixed(3)})`
          : `rgba(150,220,255,${bright.toFixed(3)})`;
        ctx.strokeStyle = col;
        ctx.fillStyle = col;
        ctx.lineWidth = Math.max(0.6, s.size * (0.5 + p.near));
        if (streak > 0.05 && px !== 0) {
          ctx.beginPath();
          ctx.moveTo(px + (p.x - px) * (1 - streak * 0.85), py + (p.y - py) * (1 - streak * 0.85));
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, s.size * (0.5 + p.near), 0, Math.PI * 2);
          ctx.fill();
        }
        prev[i * 2] = p.x;
        prev[i * 2 + 1] = p.y;
      }

      // overdrive flash ring (localized)
      if (flight.overdrive && !reduced) {
        const rr = (Math.min(w, h) * 0.2) + ((t * 300) % (Math.min(w, h) * 0.3));
        ctx.strokeStyle = `rgba(120,255,255,${Math.max(0, 0.5 - rr / Math.min(w, h))})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, rr, 0, Math.PI * 2);
        ctx.stroke();
      }

      // HUD
      if (hudRef.current) {
        const txt =
          `WARP ${wEff.toFixed(2)} · ${formatLightYears(flight.lightYears)} traveled · time dilation ${timeDilation(wEff).toFixed(2)}×`;
        if (hudRef.current.textContent !== txt) hudRef.current.textContent = txt;
      }
    }

    let raf = 0;
    let last = performance.now();
    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const U = uiRef.current;
      flight.warp = clampWarp(U.warp);
      flight.overdrive = U.overdrive;
      if (U.playing && !reduced) {
        const wEff = stepFlight(flight, dt);
        stepStars(field, dt, wEff, steer.x, steer.y);
      } else if (U.playing && reduced) {
        stepFlight(flight, dt); // distance still accrues; starfield stays still
      }
      // steer eases toward drag target
      draw(now);
      raf = requestAnimationFrame(frame);
    }

    let dragging = false;
    let lx = 0;
    let ly = 0;
    function onDown(e) {
      dragging = true;
      lx = e.clientX;
      ly = e.clientY;
    }
    function onMove(e) {
      if (!dragging) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      steer.x = Math.max(-1, Math.min(1, steer.x + ((e.clientX - lx) / w) * 2));
      steer.y = Math.max(-1, Math.min(1, steer.y + ((e.clientY - ly) / h) * 2));
      lx = e.clientX;
      ly = e.clientY;
    }
    function onUp() {
      dragging = false;
      steer.x = 0;
      steer.y = 0;
    }
    canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointerdown", onDown);
    };
  }, []);

  return (
    <div style={styles.page}>
      <canvas ref={canvasRef} style={styles.canvas} />
      <div style={styles.top}>
        <h1 style={styles.title}>Infinity Drive</h1>
        <div ref={hudRef} style={styles.hud}>WARP 5.00</div>
        <div style={styles.hint}>Drag to steer · Throttle below to change warp</div>
      </div>
      <div style={styles.dock}>
        <button style={styles.btn} onClick={() => setUi({ ...ui, playing: !ui.playing })}>
          {ui.playing ? "Pause" : "Play"}
        </button>
        <label style={styles.row}>Warp
          <input
            type="range" min="1" max={MAX_WARP} step="0.1" value={ui.warp}
            onChange={(e) => setUi({ ...ui, warp: parseFloat(e.target.value) })}
            style={styles.range} aria-label="Warp factor"
          />
          <span style={styles.warpNum}>{ui.warp.toFixed(1)}</span>
        </label>
        <button
          style={ui.overdrive ? styles.punchActive : styles.punch}
          onPointerDown={() => setUi({ ...ui, overdrive: true })}
          onPointerUp={() => setUi({ ...uiRef.current, overdrive: false })}
          onPointerLeave={() => setUi({ ...uiRef.current, overdrive: false })}
        >
          PUNCH IT
        </button>
      </div>
    </div>
  );
}

const styles = {
  page: { position: "fixed", inset: 0, background: "#020208", color: "#fff", overflow: "hidden", fontFamily: "system-ui, -apple-system, sans-serif", userSelect: "none" },
  canvas: { position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", touchAction: "none", cursor: "crosshair" },
  top: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 5, padding: "18px 22px", pointerEvents: "none", background: "linear-gradient(to bottom, rgba(0,0,0,.55), transparent)" },
  title: { margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: 4, textTransform: "uppercase", color: "#bfe9ff" },
  hud: { marginTop: 6, fontSize: 14, fontWeight: 600, letterSpacing: 1, color: "#8fd8ff" },
  hint: { marginTop: 4, fontSize: 13, opacity: 0.7 },
  dock: { position: "absolute", left: 12, right: 12, bottom: 12, zIndex: 5, display: "flex", gap: 12, alignItems: "center", justifyContent: "center", background: "rgba(6,10,20,.72)", border: "1px solid rgba(140,210,255,.25)", borderRadius: 14, padding: "10px 14px", backdropFilter: "blur(8px)", flexWrap: "wrap" },
  btn: { background: "rgba(255,255,255,.08)", color: "#fff", border: "1px solid rgba(255,255,255,.25)", borderRadius: 8, padding: "8px 12px", fontSize: 13, cursor: "pointer" },
  row: { display: "flex", alignItems: "center", gap: 8, fontSize: 13 },
  range: { width: 150, accentColor: "#6fd2ff" },
  warpNum: { minWidth: 30, fontWeight: 700, color: "#8fd8ff" },
  punch: { background: "rgba(255,80,120,.15)", color: "#ffb3c4", border: "2px solid #ff5078", borderRadius: 10, padding: "10px 18px", fontSize: 14, fontWeight: 800, letterSpacing: 2, cursor: "pointer", touchAction: "none" },
  punchActive: { background: "#ff5078", color: "#fff", border: "2px solid #ff8ba3", borderRadius: 10, padding: "10px 18px", fontSize: 14, fontWeight: 800, letterSpacing: 2, cursor: "pointer", touchAction: "none", boxShadow: "0 0 18px rgba(255,80,120,.8)" },
};
