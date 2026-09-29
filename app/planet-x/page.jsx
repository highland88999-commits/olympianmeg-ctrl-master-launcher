"use client";

import { useEffect, useRef, useState } from "react";
import {
  buildHeightMap,
  heightAt,
  spherePoint,
  terrainColor,
  shade,
  createFlight,
  startDescent,
  stepFlight,
  diveEase,
} from "./planet";

/**
 * Planet X — an explorable procedural world, rebuilt.
 * Drag to spin the planet, click anywhere on it (or press Descend) to dive
 * to the surface, and walk the ridgelines in falling snow. Everything is
 * generated locally: seeded noise continents, no video, no trackers.
 */
const GRID_W = 110;
const GRID_H = 56;

export default function PlanetXPage() {
  const canvasRef = useRef(null);
  const hudRef = useRef(null);
  const [panel, setPanel] = useState({
    roughness: 0.55,
    spin: 0.35,
    snow: true,
    playing: true,
    mode: "orbit",
  });
  const panelRef = useRef(panel);
  panelRef.current = panel;

  useEffect(() => {
    document.title = "Planet X";
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let map = buildHeightMap(20260927, panelRef.current.roughness, GRID_W, GRID_H);
    const flight = createFlight();
    const st = {
      yaw: 0.6,
      pitch: 0.28,
      mapSeed: 20260927,
      snow: [],
    };
    for (let i = 0; i < 130; i++) {
      st.snow.push({
        x: Math.random(), y: Math.random(),
        s: 0.6 + Math.random() * 1.8, v: 0.12 + Math.random() * 0.3,
        ph: Math.random() * Math.PI * 2,
      });
    }
    const geo = { cx: 0, cy: 0, px: 1, r: 1 }; // updated each frame for picking

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

    const LIGHT = (() => {
      const l = Math.hypot(-0.55, 0.4, 0.73);
      return [-0.55 / l, 0.4 / l, 0.73 / l];
    })();

    function drawOrbit(w, h, t) {
      const R = Math.min(w, h) * 0.36;
      const cx = w / 2;
      const cy = h / 2;
      const px = R / 1.25;
      geo.cx = cx; geo.cy = cy; geo.px = px; geo.r = 1.25;

      // space backdrop
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, "#020208");
      bg.addColorStop(1, "#0a0a20");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // atmosphere halo (localized glow)
      const halo = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.45);
      halo.addColorStop(0, "rgba(90,140,255,0.28)");
      halo.addColorStop(1, "rgba(90,140,255,0)");
      ctx.fillStyle = halo;
      ctx.fillRect(cx - R * 1.5, cy - R * 1.5, R * 3, R * 3);

      // night side disc (drawn first, day cells over it)
      ctx.fillStyle = "#05050f";
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();

      const amp = 0.09;
      const cell = Math.max(2, (Math.PI * 2 * px) / GRID_W);
      for (let j = 0; j < GRID_H; j++) {
        const lat = (j / (GRID_H - 1) - 0.5) * Math.PI;
        for (let i = 0; i < GRID_W; i++) {
          const lon = (i / GRID_W) * Math.PI * 2;
          const p = spherePoint(map, lat, lon, st.yaw, st.pitch, 1.25, amp);
          if (p.z <= 0.02) continue;
          const sx = cx + p.x * px;
          const sy = cy - p.y * px;
          const inv = 1 / Math.hypot(p.x, p.y, p.z);
          const s = shade(p.x * inv, p.y * inv, p.z * inv, LIGHT[0], LIGHT[1], LIGHT[2]);
          const [r, gg, b] = terrainColor(p.h);
          ctx.fillStyle = `rgb(${Math.round(r * s)},${Math.round(gg * s)},${Math.round(b * s)})`;
          ctx.fillRect(sx - cell / 2, sy - cell / 2, cell + 0.6, cell + 0.6);
        }
      }

      // limb darkening ring
      ctx.strokeStyle = "rgba(120,170,255,0.35)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.stroke();
      return { cx, cy, R };
    }

    function drawDive(w, h, p) {
      // zoom the planet as the camera dives; crossfade near the end
      const e = diveEase(p);
      const R = Math.min(w, h) * 0.36 * (1 + e * 5);
      const cx = w / 2;
      const cy = h / 2 + e * h * 0.9;
      const px = R / 1.25;
      geo.cx = cx; geo.cy = cy; geo.px = px; geo.r = 1.25;
      ctx.fillStyle = "#020208";
      ctx.fillRect(0, 0, w, h);
      ctx.save();
      ctx.globalAlpha = 1 - Math.max(0, (p - 0.55) / 0.45);
      ctx.fillStyle = "#0a1428";
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();
      const amp = 0.09;
      const cell = Math.max(2, (Math.PI * 2 * px) / GRID_W) * (1 + e * 2);
      for (let j = 0; j < GRID_H; j += 2) {
        const lat = (j / (GRID_H - 1) - 0.5) * Math.PI;
        for (let i = 0; i < GRID_W; i += 2) {
          const lon = (i / GRID_W) * Math.PI * 2;
          const pt = spherePoint(map, lat, lon, st.yaw, st.pitch, 1.25, amp);
          if (pt.z <= 0.02) continue;
          const [r, gg, b] = terrainColor(pt.h);
          ctx.fillStyle = `rgb(${r},${gg},${b})`;
          ctx.fillRect(cx + pt.x * px - cell / 2, cy - pt.y * px - cell / 2, cell, cell);
        }
      }
      ctx.restore();
    }

    function drawSurface(w, h, t) {
      // flyover: layered ridge silhouettes sampled from the heightmap
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, "#060818");
      sky.addColorStop(0.7, "#101a3a");
      sky.addColorStop(1, "#1a1440");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      const layers = [
        { dLat: 0.35, base: 0.78, amp: 0.16, speed: 0.05, col: "#232a55", snow: 0.2 },
        { dLat: 0.12, base: 0.86, amp: 0.22, speed: 0.11, col: "#161c40", snow: 0.45 },
        { dLat: 0.0, base: 0.95, amp: 0.3, speed: 0.2, col: "#0b0f2c", snow: 0.8 },
      ];
      const N = 200;
      layers.forEach((L) => {
        const pts = [];
        for (let i = 0; i <= N; i++) {
          const lon = flight.targetLon + (((i / N) * Math.PI * 2 + t * L.speed) % (Math.PI * 2));
          const hh = heightAt(map, flight.targetLat + L.dLat, lon);
          pts.push({ x: (i / N) * w, y: h * L.base - (hh * 0.5 + 0.5) * h * L.amp - 20, hh });
        }
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (const p of pts) ctx.lineTo(p.x, p.y);
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fillStyle = L.col;
        ctx.fill();
        // snow glint on the peaks
        ctx.fillStyle = `rgba(220,235,255,${L.snow * 0.55})`;
        for (const p of pts) {
          if (p.hh > 0.55) ctx.fillRect(p.x - 2, p.y, 4, 3);
        }
      });

      // snowfall
      if (panelRef.current.snow && !reduced) {
        ctx.fillStyle = "rgba(235,242,255,0.85)";
        for (const f of st.snow) {
          f.y += f.v * 0.016;
          f.x += Math.sin(t * 1.4 + f.ph) * 0.0006;
          if (f.y > 1) { f.y = 0; f.x = Math.random(); }
          ctx.beginPath();
          ctx.arc(f.x * w, f.y * h, f.s, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    function updateHud() {
      if (!hudRef.current) return;
      const centerLon = ((st.yaw + Math.PI / 2) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      const latDeg = (st.pitch * 180 / Math.PI).toFixed(1);
      const lonDeg = (centerLon * 180 / Math.PI).toFixed(1);
      let alt = "1,200 km";
      if (flight.mode === "descending") alt = `${Math.round(1200 - diveEase(flight.progress) * 1192)} km`;
      if (flight.mode === "surface") alt = "8 km — surface";
      if (flight.mode === "ascending") alt = `${Math.round(8 + diveEase(flight.progress) * 1192)} km`;
      const txt = `${flight.mode.toUpperCase()} · LAT ${latDeg}° LON ${lonDeg}° · ALT ${alt}`;
      if (hudRef.current.textContent !== txt) hudRef.current.textContent = txt;
    }

    let raf = 0;
    let last = performance.now();
    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      const P = panelRef.current;
      stepFlight(flight, reduced ? 1 : dt);
      if (P.playing && !reduced && flight.mode === "orbit") st.yaw += dt * 0.12 * P.spin * 3;

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (flight.mode === "orbit" || flight.mode === "ascending") drawOrbit(w, h, t);
      else if (flight.mode === "descending") drawDive(w, h, flight.progress);
      else drawSurface(w, h, t);
      updateHud();
      if (P.mode !== flight.mode) setPanel({ ...P, mode: flight.mode });
      raf = requestAnimationFrame(frame);
    }

    // drag to rotate (orbit) / pan (surface)
    let dragging = false;
    let lx = 0;
    let ly = 0;
    function onDown(e) {
      dragging = true;
      lx = e.clientX; ly = e.clientY;
    }
    function onMove(e) {
      if (!dragging) return;
      const dx = e.clientX - lx;
      const dy = e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
      if (flight.mode === "orbit") {
        st.yaw += dx * 0.005;
        st.pitch = Math.max(-1.2, Math.min(1.2, st.pitch + dy * 0.004));
      }
    }
    function onUp(e) {
      if (!dragging) return;
      dragging = false;
    }
    function onClick(e) {
      if (flight.mode !== "orbit") return;
      const rect = canvas.getBoundingClientRect();
      const dx = e.clientX - rect.left - geo.cx;
      const dy = e.clientY - rect.top - geo.cy;
      const R = geo.r * geo.px;
      if (dx * dx + dy * dy > R * R) return;
      // view-space point on the sphere, then inverse rotations
      const s = geo.px;
      const x1 = dx / s;
      const y1 = -dy / s;
      const z1 = Math.sqrt(Math.max(0, geo.r * geo.r - x1 * x1 - y1 * y1));
      const cyaw = Math.cos(st.yaw);
      const syaw = Math.sin(st.yaw);
      const x = x1 * cyaw - z1 * syaw;
      const z = x1 * syaw + z1 * cyaw;
      const cp = Math.cos(st.pitch);
      const sp = Math.sin(st.pitch);
      const y = y1 * cp + z1 * sp;
      const r = Math.hypot(x, y, z);
      const lat = Math.asin(Math.max(-1, Math.min(1, y / r)));
      const lon = Math.atan2(z, x);
      startDescent(flight, lat, lon < 0 ? lon + Math.PI * 2 : lon);
    }
    canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    canvas.addEventListener("click", onClick);

    window.planetx = {
      descend: () => {
        if (flight.mode === "orbit") {
          const lon = ((st.yaw + Math.PI / 2) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
          startDescent(flight, st.pitch, lon);
        }
      },
      ascend: () => {
        if (flight.mode === "surface") {
          flight.mode = "ascending";
          flight.progress = 0;
        }
      },
      regen: (rough) => {
        map = buildHeightMap(st.mapSeed, rough, GRID_W, GRID_H);
      },
    };

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("click", onClick);
      delete window.planetx;
    };
  }, []);

  function set(key, value) {
    const next = { ...panelRef.current, [key]: value };
    if (key === "roughness" && window.planetx) window.planetx.regen(value);
    setPanel(next);
  }

  return (
    <>
    <div style={styles.page}>
      <div style={styles.title}>Planet X</div>
      <div ref={hudRef} style={styles.hud}>ORBIT</div>
      <div style={styles.hint}>Drag to spin · Click the planet to dive to its surface</div>
      <canvas ref={canvasRef} style={styles.canvas} />

      <div style={styles.dock}>
        <label style={styles.row}>Terrain roughness
          <input type="range" min="0" max="1" step="0.01" value={panel.roughness}
            onChange={(e) => set("roughness", parseFloat(e.target.value))} style={styles.range} />
        </label>
        <label style={styles.row}>Spin
          <input type="range" min="0" max="1" step="0.01" value={panel.spin}
            onChange={(e) => set("spin", parseFloat(e.target.value))} style={styles.range} />
        </label>
        <button style={styles.btn} onClick={() => set("snow", !panel.snow)}>
          Snow: {panel.snow ? "on" : "off"}
        </button>
        <button style={styles.btn} onClick={() => set("playing", !panel.playing)}>
          {panel.playing ? "Pause" : "Play"}
        </button>
        {panel.mode === "orbit" && (
          <button style={styles.cta} onClick={() => window.planetx && window.planetx.descend()}>Descend</button>
        )}
        {panel.mode === "surface" && (
          <button style={styles.cta} onClick={() => window.planetx && window.planetx.ascend()}>Return to orbit</button>
        )}
      </div>
    </div>
    {/* Safari bottom-bar clearance: blank space under the fixed planet viewport */}
    <div aria-hidden="true" style={{ height: 'calc(4.5rem + env(safe-area-inset-bottom))' }} />
    </>
  );
}

const styles = {
  page: { position: "fixed", inset: 0, background: "#020208", color: "#fff", overflow: "hidden", fontFamily: "system-ui, -apple-system, sans-serif", userSelect: "none" },
  canvas: { position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", touchAction: "none", cursor: "grab" },
  hud: { position: "absolute", top: 52, left: 20, zIndex: 5, fontSize: 15, fontWeight: 600, letterSpacing: 1, color: "#9fc0ff", textShadow: "0 0 10px rgba(120,160,255,.5)", pointerEvents: "none" },
  hint: { position: "absolute", top: 78, left: 20, zIndex: 5, fontSize: 13, opacity: 0.7, pointerEvents: "none" },
  title: { position: "absolute", top: 14, left: 20, zIndex: 5, fontSize: 22, fontWeight: 800, letterSpacing: 4, color: "#cfe0ff", textShadow: "0 0 14px rgba(120,160,255,.6)", pointerEvents: "none", textTransform: "uppercase" },
  dock: { position: "absolute", left: 12, right: 12, bottom: "max(12px, env(safe-area-inset-bottom))", zIndex: 5, display: "flex", gap: 10, alignItems: "center", justifyContent: "center", flexWrap: "wrap", background: "rgba(8,10,24,.72)", border: "1px solid rgba(140,170,255,.25)", borderRadius: 14, padding: "10px 14px", backdropFilter: "blur(8px)" },
  row: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, opacity: 0.9 },
  range: { width: 110, accentColor: "#7ea2ff" },
  btn: { background: "rgba(255,255,255,.08)", color: "#fff", border: "1px solid rgba(255,255,255,.25)", borderRadius: 8, padding: "8px 12px", fontSize: 13, cursor: "pointer" },
  cta: { background: "#7ea2ff", color: "#060818", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
};
