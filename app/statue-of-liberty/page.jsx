'use client';

// STATUE OF LIBERTY — interactive monument exhibit.
// A fully procedural vector drawing (no model files, no CDN): drag to orbit
// the diorama, zoom, tap hotspots for facts, toggle day and night, and walk
// the 1876 → 1886 → 1986 timeline. Zero network calls.

import { useEffect, useRef, useState } from "react";
import { HOTSPOTS, TIMELINE, STATUE_SPACE, toScreen } from "./liberty.js";
import { buildStatueGlb } from "./glb.js";

const TAU = Math.PI * 2;
const COPPER = "#5f8f76";
const COPPER_DK = "#3f6350";
const COPPER_LT = "#86b394";
const STONE = "#8d8a80";
const STONE_DK = "#5f5c55";

export default function StatueOfLiberty() {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const viewRef = useRef({ orbit: 0, zoom: 1, night: false, t: 0 });
  const [night, setNight] = useState(false);
  const [active, setActive] = useState(null); // hotspot id
  const [tlIx, setTlIx] = useState(1);
  const reducedRef = useRef(false);

  useEffect(() => {
    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useEffect(() => {
    viewRef.current.night = night;
  }, [night ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    const reduced = reducedRef.current;
    const V = viewRef.current;

    let raf = 0;
    let last = performance.now();

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(r.width * dpr));
      canvas.height = Math.max(1, Math.floor(r.height * dpr));
      canvas.style.width = r.width + "px";
      canvas.style.height = r.height + "px";
    };
    resize();
    window.addEventListener("resize", resize);

    // drag to orbit; tap to select hotspot
    let dragging = false;
    let dragId = null;
    let lastX = 0;
    let moved = 0;
    const posOf = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
    };
    const pd = (e) => {
      const p = posOf(e);
      dragging = true;
      dragId = "m";
      lastX = p.x;
      moved = 0;
    };
    const pm = (e) => {
      if (!dragging) return;
      const p = posOf(e);
      const dx = p.x - lastX;
      lastX = p.x;
      moved += Math.abs(dx);
      V.orbit = Math.max(-1, Math.min(1, V.orbit + dx / 220));
    };
    const pu = (e) => {
      if (!dragging) return;
      dragging = false;
      if (moved < 8) {
        // treat as tap: hit-test hotspots
        const p = posOf(e);
        const view = { w: p.w, h: p.h };
        let hit = null;
        for (const hsp of HOTSPOTS) {
          const s = toScreen(hsp.x, hsp.y, V.orbit, V.zoom, view);
          if (Math.hypot(p.x - s.x, p.y - s.y) < 30) {
            hit = hsp.id;
            break;
          }
        }
        setActive(hit);
      }
    };
    canvas.addEventListener("pointerdown", pd);
    canvas.addEventListener("pointermove", pm);
    canvas.addEventListener("pointerup", pu);
    canvas.addEventListener("pointercancel", pu);

    // touch drag orbit (pointer events already cover touch; keep pinch)
    let pinchD = 0;
    const ts = (e) => {
      if (e.touches.length === 2) {
        const a = e.touches[0];
        const b = e.touches[1];
        pinchD = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      }
    };
    const tm = (e) => {
      if (e.touches.length === 2) {
        const a = e.touches[0];
        const b = e.touches[1];
        const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        if (pinchD > 0) {
          V.zoom = Math.max(0.8, Math.min(2.4, V.zoom * (d / pinchD)));
        }
        pinchD = d;
        if (e.cancelable) e.preventDefault();
      }
    };
    canvas.addEventListener("touchstart", ts, { passive: true });
    canvas.addEventListener("touchmove", tm, { passive: false });

    const onKey = (e) => {
      if (e.key === "ArrowLeft") V.orbit = Math.max(-1, V.orbit - 0.12);
      if (e.key === "ArrowRight") V.orbit = Math.min(1, V.orbit + 0.12);
      if (e.key === "+" || e.key === "=") V.zoom = Math.min(2.4, V.zoom + 0.15);
      if (e.key === "-") V.zoom = Math.max(0.8, V.zoom - 0.15);
      if (e.key === "n" || e.key === "N") setNight((n) => !n);
      const ni = ["1", "2", "3", "4", "5"].indexOf(e.key);
      if (ni >= 0 && ni < HOTSPOTS.length)
        setActive((a) => (a === HOTSPOTS[ni].id ? null : HOTSPOTS[ni].id));
      if (e.key === "Escape") setActive(null);
    };
    window.addEventListener("keydown", onKey);

    // ---------- scene painters ----------
    function paintSky(w, h, t) {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      if (V.night) {
        g.addColorStop(0, "#04060f");
        g.addColorStop(0.55, "#0a1230");
        g.addColorStop(1, "#16224d");
      } else {
        g.addColorStop(0, "#7fc4e8");
        g.addColorStop(0.6, "#bfe3f2");
        g.addColorStop(1, "#e8f4d8");
      }
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      if (V.night) {
        // stars
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        for (let i = 0; i < 90; i++) {
          const x = (i * 197.3) % w;
          const y = (i * 331.7) % (h * 0.55);
          const tw = reduced ? 0.7 : 0.4 + 0.4 * Math.sin(t * 1.7 + i);
          ctx.globalAlpha = tw;
          ctx.fillRect(x, y, 2, 2);
        }
        ctx.globalAlpha = 1;
        // moon
        ctx.fillStyle = "#e8ecf5";
        ctx.beginPath();
        ctx.arc(w * 0.82, h * 0.16, 26, 0, TAU);
        ctx.fill();
        ctx.fillStyle = "#c9cfdf";
        ctx.beginPath();
        ctx.arc(w * 0.82 - 9, h * 0.16 - 6, 20, 0, TAU);
        ctx.fill();
      } else {
        // sun
        const sg = ctx.createRadialGradient(w * 0.8, h * 0.18, 4, w * 0.8, h * 0.18, 120);
        sg.addColorStop(0, "rgba(255,250,220,0.95)");
        sg.addColorStop(0.25, "rgba(255,240,180,0.55)");
        sg.addColorStop(1, "rgba(255,240,180,0)");
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.arc(w * 0.8, h * 0.18, 120, 0, TAU);
        ctx.fill();
      }
    }

    function paintSkyline(w, h) {
      // distant Manhattan-ish silhouette; parallax layer 1
      const base = h * 0.72;
      ctx.fillStyle = V.night ? "#0b1026" : "#9fb3c8";
      const off = V.orbit * 26;
      ctx.beginPath();
      ctx.moveTo(-40, base);
      for (let i = 0; i < 26; i++) {
        const bx = -40 + i * ((w + 80) / 25) + off;
        const bh = 30 + ((i * 53) % 90);
        ctx.lineTo(bx, base - bh);
        ctx.lineTo(bx + (w + 80) / 50, base - bh);
        ctx.lineTo(bx + (w + 80) / 50, base);
      }
      ctx.lineTo(w + 40, base);
      ctx.lineTo(w + 40, h);
      ctx.lineTo(-40, h);
      ctx.closePath();
      ctx.fill();
      if (V.night) {
        // lit windows
        ctx.fillStyle = "rgba(255,220,140,0.75)";
        for (let i = 0; i < 120; i++) {
          const x = (i * 89.7) % w;
          const y = base - 12 - ((i * 41.3) % 100);
          if (y < base - 4) ctx.fillRect(x, y, 3, 4);
        }
      }
    }

    function paintWater(w, h, t) {
      const top = h * 0.72;
      const g = ctx.createLinearGradient(0, top, 0, h);
      if (V.night) {
        g.addColorStop(0, "#0a1430");
        g.addColorStop(1, "#04070f");
      } else {
        g.addColorStop(0, "#5f93b8");
        g.addColorStop(1, "#2c5a7c");
      }
      ctx.fillStyle = g;
      ctx.fillRect(0, top, w, h - top);
      // shimmer lines
      ctx.strokeStyle = V.night ? "rgba(150,180,255,0.16)" : "rgba(255,255,255,0.22)";
      ctx.lineWidth = 2;
      for (let i = 0; i < 14; i++) {
        const y = top + 14 + i * ((h - top - 20) / 14);
        const wob = reduced ? 0 : Math.sin(t * 1.2 + i * 1.7) * 12;
        const xoff = V.orbit * 40 * (i / 14);
        ctx.beginPath();
        ctx.moveTo(w * 0.1 + xoff + wob, y);
        ctx.lineTo(w * 0.9 + xoff - wob, y);
        ctx.stroke();
      }
    }

    // The monument itself, drawn in STATUE_SPACE then transformed.
    function paintStatue(view, t) {
      const s0 = toScreen(0, 0, V.orbit, V.zoom, view);
      const s = s0.scale;
      ctx.save();
      // subtle shear sells the "orbit" on this 2.5D diorama
      ctx.transform(1, 0, V.orbit * 0.08, 1, 0, 0);
      ctx.translate(s0.x, s0.y);
      ctx.scale(s, s);
      const night = V.night;
      const copper = night ? "#4c7a64" : COPPER;
      const copperDk = night ? "#33553f" : COPPER_DK;
      const copperLt = night ? "#6fa382" : COPPER_LT;
      const stone = night ? "#4a4a52" : STONE;
      const stoneDk = night ? "#2e2e34" : STONE_DK;

      // ---- pedestal: stepped star fort base ----
      ctx.fillStyle = stoneDk;
      ctx.fillRect(60, 760, 280, 60);
      ctx.fillStyle = stone;
      ctx.fillRect(80, 716, 240, 48);
      ctx.fillStyle = stoneDk;
      ctx.fillRect(100, 672, 200, 48);
      // pedestal column with inset panels
      ctx.fillStyle = stone;
      ctx.fillRect(140, 560, 120, 116);
      ctx.fillStyle = stoneDk;
      for (const px of [152, 196, 240]) ctx.fillRect(px, 576, 32, 84);
      ctx.fillStyle = stone;
      ctx.fillRect(132, 544, 136, 20);

      // ---- robe: flowing gown, waist to feet ----
      const robe = (fill) => {
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.moveTo(150, 560); // left hip
        ctx.bezierCurveTo(128, 600, 120, 660, 112, 716); // left drape out
        ctx.lineTo(288, 716); // hem
        ctx.bezierCurveTo(280, 660, 272, 600, 250, 560); // right drape
        ctx.bezierCurveTo(236, 520, 228, 480, 224, 446); // torso right
        ctx.lineTo(176, 446); // torso left
        ctx.bezierCurveTo(172, 480, 164, 520, 150, 560);
        ctx.closePath();
        ctx.fill();
      };
      robe(copper);
      // drape folds
      ctx.strokeStyle = copperDk;
      ctx.lineWidth = 3;
      for (const fx of [160, 185, 215, 240]) {
        ctx.beginPath();
        ctx.moveTo(fx, 470);
        ctx.bezierCurveTo(fx - 8, 560, fx - 14, 640, fx - 18, 712);
        ctx.stroke();
      }
      // left highlight
      ctx.strokeStyle = copperLt;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(150, 560);
      ctx.bezierCurveTo(128, 600, 120, 660, 112, 716);
      ctx.stroke();

      // ---- left arm holding the tablet ----
      ctx.strokeStyle = copper;
      ctx.lineCap = "round";
      ctx.lineWidth = 26;
      ctx.beginPath();
      ctx.moveTo(178, 452);
      ctx.quadraticCurveTo(150, 430, 138, 396);
      ctx.stroke();
      // tablet
      ctx.save();
      ctx.translate(128, 372);
      ctx.rotate(-0.28);
      ctx.fillStyle = copperDk;
      ctx.fillRect(-26, -34, 52, 68);
      ctx.fillStyle = copperLt;
      ctx.fillRect(-26, -34, 52, 8);
      ctx.strokeStyle = copperDk;
      ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(-18, -18 + i * 10);
        ctx.lineTo(18, -18 + i * 10);
        ctx.stroke();
      }
      ctx.restore();

      // ---- head + neck ----
      ctx.fillStyle = copper;
      ctx.fillRect(188, 400, 24, 30); // neck
      ctx.beginPath();
      ctx.arc(200, 372, 30, 0, TAU); // head
      ctx.fill();
      // face shading (profile facing left)
      ctx.fillStyle = copperDk;
      ctx.beginPath();
      ctx.arc(192, 374, 26, Math.PI * 0.6, Math.PI * 1.4);
      ctx.fill();
      // hair bun
      ctx.fillStyle = copperDk;
      ctx.beginPath();
      ctx.arc(222, 360, 12, 0, TAU);
      ctx.fill();

      // ---- crown: band + 7 spikes ----
      ctx.fillStyle = copperDk;
      ctx.fillRect(172, 336, 56, 12);
      ctx.strokeStyle = copperLt;
      ctx.lineWidth = 5;
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI / 2 + (i - 3) * 0.30;
        const x0 = 200 + Math.cos(a) * 26;
        const y0 = 342 + Math.sin(a) * 26;
        const x1 = 200 + Math.cos(a) * 66;
        const y1 = 342 + Math.sin(a) * 66;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }

      // ---- right arm raised with the torch ----
      ctx.strokeStyle = copper;
      ctx.lineWidth = 24;
      ctx.beginPath();
      ctx.moveTo(224, 448);
      ctx.quadraticCurveTo(262, 380, 282, 300);
      ctx.stroke();
      // hand
      ctx.fillStyle = copper;
      ctx.beginPath();
      ctx.arc(284, 292, 13, 0, TAU);
      ctx.fill();
      // torch handle
      ctx.strokeStyle = copperDk;
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(284, 292);
      ctx.lineTo(292, 232);
      ctx.stroke();
      // torch cup
      ctx.fillStyle = copperDk;
      ctx.beginPath();
      ctx.moveTo(278, 232);
      ctx.lineTo(306, 232);
      ctx.lineTo(300, 210);
      ctx.lineTo(284, 210);
      ctx.closePath();
      ctx.fill();
      // flame — the one localized light source
      const fl = reduced ? 0 : Math.sin(t * 9) * 3;
      const fg = ctx.createRadialGradient(292, 188, 2, 292, 188, 60);
      if (night) {
        fg.addColorStop(0, "rgba(255,220,150,0.95)");
        fg.addColorStop(0.4, "rgba(255,170,80,0.45)");
        fg.addColorStop(1, "rgba(255,150,60,0)");
      } else {
        fg.addColorStop(0, "rgba(255,200,110,0.75)");
        fg.addColorStop(1, "rgba(255,180,90,0)");
      }
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.arc(292, 188, 60, 0, TAU);
      ctx.fill();
      ctx.fillStyle = night ? "#ffe9b8" : "#ffcf7a";
      ctx.beginPath();
      ctx.moveTo(292, 168 + fl);
      ctx.quadraticCurveTo(308, 190, 292, 214);
      ctx.quadraticCurveTo(276, 190, 292, 168 + fl);
      ctx.fill();
      ctx.fillStyle = "#fff6dd";
      ctx.beginPath();
      ctx.moveTo(292, 180);
      ctx.quadraticCurveTo(300, 194, 292, 208);
      ctx.quadraticCurveTo(284, 194, 292, 180);
      ctx.fill();

      ctx.restore();
    }

    function paintHotspots(view) {
      for (const hsp of HOTSPOTS) {
        const s = toScreen(hsp.x, hsp.y, V.orbit, V.zoom, view);
        ctx.fillStyle = "rgba(5,10,18,0.65)";
        ctx.strokeStyle = "#FFD700";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 13, 0, TAU);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#FFD700";
        ctx.font = "bold 15px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("+", s.x, s.y + 1);
      }
    }

    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      void dt;

      const w = canvas.width;
      const h = canvas.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const viewW = w / dpr;
      const viewH = h / dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      paintSky(viewW, viewH, t);
      paintSkyline(viewW, viewH);
      paintWater(viewW, viewH, t);
      paintStatue({ w: viewW, h: viewH }, t);
      paintHotspots({ w: viewW, h: viewH });
    };
    raf = requestAnimationFrame(frame);

    const onVis = () => {
      if (document.hidden) last = performance.now();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("pointerdown", pd);
      canvas.removeEventListener("pointermove", pm);
      canvas.removeEventListener("pointerup", pu);
      canvas.removeEventListener("pointercancel", pu);
      canvas.removeEventListener("touchstart", ts);
      canvas.removeEventListener("touchmove", tm);
    };
  }, []);

  const zoomBy = (d) => {
    viewRef.current.zoom = Math.max(
      0.8,
      Math.min(2.4, viewRef.current.zoom + d)
    );
  };

  const [glbStatus, setGlbStatus] = useState("");
  const downloadGlb = () => {
    try {
      const bytes = buildStatueGlb();
      const blob = new Blob([bytes], { type: "model/gltf-binary" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "statue-of-liberty.glb";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      setGlbStatus("saved ✓");
      setTimeout(() => setGlbStatus(""), 2500);
    } catch (e) {
      setGlbStatus("export failed");
      setTimeout(() => setGlbStatus(""), 2500);
    }
  };

  const spot = HOTSPOTS.find((h) => h.id === active) || null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#04060f",
        color: "#eef2f7",
        fontFamily: "Georgia, 'Times New Roman', serif",
        overflow: "hidden",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      <div ref={wrapRef} style={{ position: "absolute", inset: 0 }}>
        <canvas ref={canvasRef} style={{ display: "block", touchAction: "pan-y" }} />
      </div>

      {/* header */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "10px 14px",
          background: "rgba(4,8,16,0.72)",
          borderBottom: "1px solid rgba(255,215,0,0.25)",
          zIndex: 5,
        }}
      >
        <div
          style={{
            fontFamily: "ui-monospace, Menlo, monospace",
            letterSpacing: 3,
            fontSize: 13,
            color: "#FFD700",
          }}
        >
          LIBERTY · HARBOR EXHIBIT
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => zoomBy(-0.2)} style={ctlBtn} aria-label="Zoom out">
            −
          </button>
          <button onClick={() => zoomBy(0.2)} style={ctlBtn} aria-label="Zoom in">
            +
          </button>
          <button
            onClick={() => setNight((n) => !n)}
            style={{ ...ctlBtn, minWidth: 86 }}
            aria-label="Toggle day and night"
          >
            {night ? "☀ DAY" : "☾ NIGHT"}
          </button>
          <button
            onClick={downloadGlb}
            style={{ ...ctlBtn, minWidth: 86 }}
            aria-label="Download the monument as a .glb file"
          >
            ⤓ .GLB
          </button>
        </div>
      </div>

      {/* hotspot fact card */}
      {spot && (
        <div
          style={{
            position: "absolute",
            left: 14,
            right: 14,
            bottom: 118,
            zIndex: 6,
            background: "rgba(6,10,18,0.92)",
            border: "1px solid rgba(255,215,0,0.5)",
            borderRadius: 10,
            padding: "16px 18px",
            maxWidth: 520,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
            }}
          >
            <div
              style={{
                fontFamily: "ui-monospace, Menlo, monospace",
                color: "#FFD700",
                letterSpacing: 2,
                fontSize: 14,
              }}
            >
              {spot.title.toUpperCase()}
            </div>
            <button
              onClick={() => setActive(null)}
              style={{
                background: "none",
                border: "none",
                color: "#8f9bb3",
                fontSize: 18,
                cursor: "pointer",
              }}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <p style={{ margin: "10px 0 0", lineHeight: 1.75, fontSize: 14.5, color: "#d5dbe6" }}>
            {spot.body}
          </p>
        </div>
      )}

      {/* timeline */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 5,
          background: "rgba(4,8,16,0.85)",
          borderTop: "1px solid rgba(255,215,0,0.25)",
          padding: "10px 14px calc(10px + env(safe-area-inset-bottom))",
        }}
      >
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 8 }}>
          {TIMELINE.map((e, i) => (
            <button
              key={e.year}
              onClick={() => setTlIx(i)}
              style={{
                fontFamily: "ui-monospace, Menlo, monospace",
                fontSize: 13,
                letterSpacing: 2,
                padding: "8px 16px",
                minHeight: 40,
                borderRadius: 20,
                border: tlIx === i ? "1px solid #FFD700" : "1px solid rgba(255,255,255,0.25)",
                background: tlIx === i ? "rgba(255,215,0,0.14)" : "transparent",
                color: tlIx === i ? "#FFD700" : "#aeb8c9",
                cursor: "pointer",
              }}
            >
              {e.year}
            </button>
          ))}
        </div>
        <div style={{ textAlign: "center", maxWidth: 560, margin: "0 auto" }}>
          <span
            style={{
              fontFamily: "ui-monospace, Menlo, monospace",
              color: "#FFD700",
              fontSize: 12,
              letterSpacing: 3,
            }}
          >
            {TIMELINE[tlIx].year} — {TIMELINE[tlIx].title.toUpperCase()}
          </span>
          <p style={{ margin: "6px 0 0", fontSize: 13, lineHeight: 1.6, color: "#c3ccd9" }}>
            {TIMELINE[tlIx].body}
          </p>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          top: 62,
          left: 0,
          right: 0,
          textAlign: "center",
          zIndex: 4,
          pointerEvents: "none",
          fontFamily: "ui-monospace, Menlo, monospace",
          fontSize: 11,
          letterSpacing: 3,
          color: "rgba(255,255,255,0.55)",
        }}
      >
        DRAG TO ORBIT · TAP + MARKERS FOR FACTS
        {glbStatus && (
          <span style={{ marginLeft: 12, color: "#FFD700" }}>
            {glbStatus}
          </span>
        )}
      </div>
    </div>
  );
}

const ctlBtn = {
  fontFamily: "ui-monospace, Menlo, monospace",
  fontSize: 13,
  letterSpacing: 1,
  color: "#FFD700",
  background: "rgba(255,215,0,0.08)",
  border: "1px solid rgba(255,215,0,0.5)",
  borderRadius: 8,
  minWidth: 44,
  minHeight: 40,
  cursor: "pointer",
};
