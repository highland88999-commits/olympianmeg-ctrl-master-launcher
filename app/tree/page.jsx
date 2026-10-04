"use client";

import { useEffect, useRef, useState } from "react";
import {
  mulberry32, buildTree, makeLeaves, stepLeaf, seasonPhase,
  skyFor, leafRGB, monthProgress, CYCLE,
} from "./engine";
import { IcPause, IcPlay } from "@/app/artemis-ui/icons";

/**
 * Tree — The Cycle Tree. A procedurally grown tree living through a
 * 12-second year: spring growth, summer bloom, autumn fall, winter rest.
 * Drag to orbit the view, tap to draw closer, scroll to zoom.
 * All canvas 2D, zero external requests.
 */
const LEAVES_PER_TIP = 10;

export default function TreePage() {
  const canvasRef = useRef(null);
  const [paused, setPaused] = useState(false);
  const [phase, setPhase] = useState("SPRING");
  const [progress, setProgress] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    document.title = "Tree — The Cycle Tree";
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = 760, H = 900;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const tree = buildTree(777, 5);
    const leaves = makeLeaves(tree.tips, LEAVES_PER_TIP, 1234);
    const rng = mulberry32(555);

    // camera: viewAngle (orbit), zoom, focus
    const cam = { angle: 0, targetAngle: 0, zoom: 1, targetZoom: 1, focusY: -190, targetFocusY: -190 };

    let raf = 0;
    let last = performance.now();
    let t = 0;
    let month = 0.4; // start mid-spring

    // fireflies for night phases
    const frng = mulberry32(99);
    const flies = [];
    for (let i = 0; i < 40; i++) flies.push({ x: frng() * W, y: frng() * H, p: frng() * 6.28 });

    // interaction
    let downPos = null, dragging = false, lastPtr = null;
    const toLocal = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
    };
    const onDown = (e) => { downPos = toLocal(e); lastPtr = downPos; dragging = false; };
    const onMove = (e) => {
      if (!downPos) return;
      const p = toLocal(e);
      if (Math.hypot(p.x - downPos.x, p.y - downPos.y) > 8) dragging = true;
      const dx = p.x - lastPtr.x, dy = p.y - lastPtr.y;
      lastPtr = p;
      if (dragging) {
        cam.targetAngle += dx * 0.004;
        cam.targetFocusY = Math.max(-420, Math.min(0, cam.targetFocusY + dy * 0.6));
      }
    };
    const onUp = (e) => {
      if (downPos && !dragging) {
        // tap: toggle between wide and canopy close-up
        const close = cam.targetZoom < 1.4;
        cam.targetZoom = close ? 2.1 : 1;
        cam.targetFocusY = close ? -260 : -190;
      }
      downPos = null; dragging = false;
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    const onWheel = (e) => {
      e.preventDefault();
      cam.targetZoom = Math.max(0.7, Math.min(3, cam.targetZoom - e.deltaY * 0.002));
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });

    // world -> screen with orbit "turn" (x compressed by cos angle) and zoom
    function project(x, y) {
      const turned = x * Math.cos(cam.angle);
      return {
        x: W / 2 + turned * cam.zoom,
        y: H * 0.78 + (y - cam.focusY) * cam.zoom,
      };
    }

    function draw(now) {
      raf = requestAnimationFrame(draw);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const active = !pausedRef.current && !reduced;
      if (active) { t += dt; month = (month + dt) % CYCLE; }

      cam.angle += (cam.targetAngle - cam.angle) * Math.min(1, dt * 6);
      cam.zoom += (cam.targetZoom - cam.zoom) * Math.min(1, dt * 6);
      cam.focusY += (cam.targetFocusY - cam.focusY) * Math.min(1, dt * 6);

      const ph = seasonPhase(month);
      const sky = skyFor(month);
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, sky.top);
      grad.addColorStop(0.6, sky.mid);
      grad.addColorStop(1, sky.bot);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // stars fade in during autumn/winter nights
      const night = (month > 6.5) ? Math.min(1, (month - 6.5) / 2) : 0;
      if (night > 0) {
        ctx.fillStyle = `rgba(255,255,255,${0.7 * night})`;
        for (let i = 0; i < 80; i++) {
          const sx = (i * 97.3) % W, sy = (i * 57.7) % (H * 0.5);
          ctx.globalAlpha = 0.7 * night * (0.4 + 0.6 * Math.abs(Math.sin(t + i)));
          ctx.fillRect(sx, sy, 1.6, 1.6);
        }
        ctx.globalAlpha = 1;
      }

      // ground
      const gy = project(0, 0).y;
      const gg = ctx.createLinearGradient(0, gy - 30, 0, H);
      gg.addColorStop(0, "#1c2a1a");
      gg.addColorStop(1, "#060a06");
      ctx.fillStyle = gg;
      ctx.fillRect(0, gy, W, H - gy);
      ctx.fillStyle = "rgba(120,200,140,0.12)";
      ctx.fillRect(0, gy, W, 3);

      // branches
      ctx.lineCap = "round";
      for (const s of tree.segments) {
        const a = project(s.x1, s.y1);
        const b = project(s.x2, s.y2);
        const shade = 18 + Math.min(26, s.depth * 5);
        ctx.strokeStyle = `rgb(${shade + 12},${shade},${shade + 6})`;
        ctx.lineWidth = Math.max(0.8, s.w * 0.5 * cam.zoom * Math.abs(Math.cos(cam.angle)) ** 0.3 + 0.4);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }

      // leaves
      const [lr, lg, lb] = leafRGB(month);
      const dissolving = month >= 6;
      for (const leaf of leaves) {
        if (active) stepLeaf(leaf, month, dt, t, rng);
        if (leaf.scale <= 0.01) continue;
        const p = project(leaf.x, leaf.y);
        if (p.x < -30 || p.x > W + 30 || p.y < -30 || p.y > H + 30) continue;
        const s = leaf.size * leaf.scale * cam.zoom;
        let cr = lr, cg = lg, cb = lb;
        if (leaf.dissolving) {
          const f = leaf.scale;
          cr = Math.round(lr * f + 20 * (1 - f));
          cg = Math.round(lg * f + 20 * (1 - f));
          cb = Math.round(lb * f + 20 * (1 - f));
        }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(leaf.rot);
        ctx.shadowColor = `rgba(${cr},${cg},${cb},0.8)`;
        ctx.shadowBlur = 8 * leaf.scale;
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${0.92})`;
        // crystal-shard leaf
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.lineTo(s * 0.42, 0);
        ctx.lineTo(0, s);
        ctx.lineTo(-s * 0.42, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // fallen-leaf carpet glow (subtle, autumn)
      if (month > 6 && month < 9.5) {
        ctx.fillStyle = `rgba(255,80,180,${0.05 * Math.sin(((month - 6) / 3.5) * Math.PI)})`;
        ctx.fillRect(0, gy, W, 26);
      }

      // fireflies in dark phases
      if (night > 0.3 && !reduced) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        for (const f of flies) {
          const bx = f.x + Math.sin(t * 0.7 + f.p) * 30;
          const by = f.y + Math.cos(t * 0.9 + f.p) * 24;
          const a = 0.5 + 0.5 * Math.sin(t * 3 + f.p * 3);
          ctx.fillStyle = `rgba(180,255,150,${0.5 * a * night})`;
          ctx.beginPath(); ctx.arc(bx, by, 2, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }

      // vignette
      const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, "rgba(0,0,0,0.5)");
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);

      // HUD sync (throttled)
      hudAcc += dt;
      if (hudAcc > 0.25) {
        hudAcc = 0;
        setPhase(ph.name);
        setProgress(monthProgress(month));
      }
    }
    let hudAcc = 0;
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [reduced]);

  return (
    <div style={styles.page}>
      {/* page background: still wilds art behind the simulation chrome */}
      <div aria-hidden="true" style={styles.bgLayer} />
      <div style={styles.shell}>
        <header style={styles.head}>
          <h1 style={styles.title}>THE CYCLE TREE</h1>
          <p style={styles.sub}>one tree · one year · twelve seconds</p>
        </header>
        <div style={styles.canvasWrap}>
          <canvas ref={canvasRef} style={styles.canvas} aria-label="The Cycle Tree seasons simulation" />
          <div style={styles.hud}>
            <span style={styles.phase}>PHASE: {phase}</span>
            <div style={styles.bar}><div style={{ ...styles.fill, width: `${progress * 100}%`, background: progress < 0.5 ? "#00f2ff" : "#ff00ff", boxShadow: progress < 0.5 ? "0 0 10px #00f2ff" : "0 0 10px #ff00ff" }} /></div>
          </div>
        </div>
        <div style={styles.controls}>
          <button onClick={() => setPaused(!paused)} style={styles.btn} aria-label={paused ? "Resume the seasonal cycle" : "Pause the seasonal cycle"}>
            {paused ? <IcPlay /> : <IcPause />}
            <span style={styles.btnLabel}>{paused ? "RESUME CYCLE" : "PAUSE CYCLE"}</span>
          </button>
          <span style={styles.hint}>Drag to orbit · Tap to draw closer · Scroll to zoom</span>
        </div>
        <div aria-hidden="true" style={{ height: 'calc(4.5rem + env(safe-area-inset-bottom))' }} />
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: "100dvh", background: "#010103", display: "flex", justifyContent: "center", padding: "20px 12px", fontFamily: "ui-monospace, Menlo, monospace", position: "relative" },
  bgLayer: { position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", opacity: 0.42,
    backgroundImage: "linear-gradient(to bottom, rgba(1,1,3,0.55), rgba(1,1,3,0.15) 45%, rgba(1,1,3,0.75)), url(/images/tree/bg.webp)",
    backgroundSize: "cover", backgroundPosition: "center" },
  shell: { width: "min(560px, 100%)", position: "relative", zIndex: 1 },
  head: { textAlign: "center", marginBottom: 12 },
  title: { margin: 0, color: "#00f2ff", letterSpacing: 8, fontSize: "clamp(1.6rem,7vw,2.4rem)", textShadow: "0 0 25px #00f2ff, 0 0 60px #0088ff" },
  sub: { color: "#ff00ff", letterSpacing: 4, fontSize: "0.75rem", margin: "6px 0 0" },
  canvasWrap: { position: "relative", border: "1px solid rgba(0,242,255,0.2)", borderRadius: 12, overflow: "hidden" },
  canvas: { display: "block", width: "100%", height: "auto", aspectRatio: "760 / 900", touchAction: "none", cursor: "grab" },
  hud: { position: "absolute", top: 14, left: 14, right: 14, pointerEvents: "none" },
  phase: { color: "#fff", fontSize: "0.85rem", letterSpacing: 3, textShadow: "0 0 10px #00f2ff" },
  bar: { width: 200, height: 4, background: "rgba(255,255,255,0.2)", marginTop: 8, borderRadius: 2 },
  fill: { height: "100%", borderRadius: 2, transition: "width 0.25s linear" },
  controls: { display: "flex", alignItems: "center", gap: 12, marginTop: 12, flexWrap: "wrap",
    backgroundImage: "linear-gradient(rgba(1,8,6,0.82), rgba(1,8,6,0.82)), url(/images/tree/tile.webp)",
    backgroundSize: "auto, 180px", border: "1px solid rgba(0,242,255,0.18)", borderRadius: 10, padding: "10px 12px" },
  btn: { display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 16px", fontSize: "0.75rem", cursor: "pointer", background: "transparent", color: "#00f2ff", border: "1px solid rgba(0,242,255,0.5)", letterSpacing: 2, borderRadius: 6, fontFamily: "inherit", fontWeight: "bold" },
  btnLabel: { letterSpacing: 2 },
  hint: { color: "rgba(0,242,255,0.55)", fontSize: "0.75rem", letterSpacing: 1 },
};
