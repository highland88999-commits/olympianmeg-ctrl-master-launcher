"use client";

import { useEffect, useRef, useState } from "react";
import {
  mulberry32, makeContinentField, heightColor, sampleField,
  chordHalfWidth, createCamera, panSurface, pointInPlanet, clampRadius,
} from "./engine";

/**
 * Bearth — a procedural planet you can orbit, then descend onto.
 * Drag to rotate, scroll to zoom, tap the planet to fly to the surface
 * and walk the terrain. All geometry is seeded noise on canvas 2D;
 * zero external requests.
 */
const TEX_W = 360;
const TEX_H = 180;

export default function BearthPage() {
  const canvasRef = useRef(null);
  const [mode, setMode] = useState("orbit");
  const [coords, setCoords] = useState("LON 0.0° · LAT 0.0°");
  const [elev, setElev] = useState("");
  const [reduced, setReduced] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);

  useEffect(() => {
    document.title = "Bearth";
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  const autoRef = useRef(autoRotate);
  autoRef.current = autoRotate;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = 760, H = 760;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // --- procedural continent texture (one-time) ---
    const seed = 987654;
    const field = makeContinentField(TEX_W, TEX_H, seed);
    const tex = document.createElement("canvas");
    tex.width = TEX_W; tex.height = TEX_H;
    const tctx = tex.getContext("2d");
    const img = tctx.createImageData(TEX_W, TEX_H);
    for (let y = 0; y < TEX_H; y++) {
      const lat = Math.abs((y / TEX_H - 0.5) * Math.PI);
      for (let x = 0; x < TEX_W; x++) {
        const h = field[y * TEX_W + x];
        const [r, g, b] = heightColor(h, lat);
        const i = (y * TEX_W + x) * 4;
        img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
      }
    }
    tctx.putImageData(img, 0, 0);

    // --- stars ---
    const srng = mulberry32(42);
    const stars = [];
    for (let i = 0; i < 260; i++) {
      stars.push({ x: srng() * W, y: srng() * H, r: 0.4 + srng() * 1.4, tw: srng() * 6.28 });
    }

    const cam = createCamera();
    const cx = W / 2, cy = H / 2;

    let raf = 0;
    let last = performance.now();
    let t = 0;
    let flyDir = 0; // +1 diving, -1 ascending

    // pointer interaction
    let downPos = null;
    let dragging = false;
    let lastPtr = null;
    const toLocal = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
    };
    const onDown = (e) => { downPos = toLocal(e); lastPtr = downPos; dragging = false; };
    const onMove = (e) => {
      if (!downPos) return;
      const p = toLocal(e);
      const dx = p.x - lastPtr.x, dy = p.y - lastPtr.y;
      if (Math.hypot(p.x - downPos.x, p.y - downPos.y) > 8) dragging = true;
      lastPtr = p;
      if (!dragging) return;
      if (cam.mode === "orbit") {
        cam.lon += (dx / cam.radius) * 1.4;
        cam.tilt = Math.max(-1.2, Math.min(1.2, cam.tilt - (dy / cam.radius) * 1.4));
      } else {
        panSurface(cam, -dx / (220 * cam.surfZoom), -dy / (220 * cam.surfZoom));
        renderSurface();
      }
    };
    const onUp = (e) => {
      if (!downPos) return;
      const p = toLocal(e);
      const wasTap = !dragging;
      downPos = null; dragging = false;
      if (wasTap && cam.mode === "orbit" && cam.fly === 0 && pointInPlanet(p.x, p.y, cx, cy, cam.radius)) {
        // record landing spot from the tap point
        const dx = p.x - cx, dy = p.y - cy;
        const halfChord = chordHalfWidth(cam.radius, dy);
        if (halfChord > 0) {
          const lonRel = Math.asin(Math.max(-1, Math.min(1, dx / halfChord)));
          const viewLat = Math.asin(Math.max(-1, Math.min(1, dy / cam.radius)));
          cam.surfU = (((lonRel + cam.lon) / (Math.PI * 2) + 0.5) % 1 + 1) % 1;
          cam.surfV = Math.max(0.05, Math.min(0.95, (cam.tilt + viewLat) / Math.PI + 0.5));
          cam.surfZoom = 1;
          flyDir = 1;
        }
      }
    };
    const onWheel = (e) => {
      e.preventDefault();
      if (cam.mode === "orbit") cam.radius = clampRadius(cam.radius - e.deltaY * 0.25);
      else { cam.surfZoom = Math.max(0.5, Math.min(6, cam.surfZoom - e.deltaY * 0.003)); renderSurface(); }
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    // --- surface view cached render ---
    const surf = document.createElement("canvas");
    surf.width = 480; surf.height = 480;
    const sctx = surf.getContext("2d");
    function renderSurface() {
      const S = 480;
      const imgD = sctx.createImageData(S, S);
      const span = 0.35 / cam.surfZoom; // uv span of the view
      for (let y = 0; y < S; y++) {
        const v = cam.surfV + (y / S - 0.5) * span;
        for (let x = 0; x < S; x++) {
          const u = cam.surfU + (x / S - 0.5) * span;
          const h = sampleField(field, TEX_W, TEX_H, u, v);
          // hill shade from neighbors
          const hx = sampleField(field, TEX_W, TEX_H, u + 0.004, v) - sampleField(field, TEX_W, TEX_H, u - 0.004, v);
          const hy = sampleField(field, TEX_W, TEX_H, u, v + 0.004) - sampleField(field, TEX_W, TEX_H, u, v - 0.004);
          const shade = Math.max(0.35, Math.min(1.25, 1 - (hx * 6) - (hy * 4)));
          const [r, g, b] = heightColor(h, 0.4);
          const i = (y * S + x) * 4;
          imgD.data[i] = Math.min(255, r * shade);
          imgD.data[i + 1] = Math.min(255, g * shade);
          imgD.data[i + 2] = Math.min(255, b * shade);
          imgD.data[i + 3] = 255;
        }
      }
      sctx.putImageData(imgD, 0, 0);
    }
    renderSurface();

    function drawPlanet(now) {
      const R = cam.radius * (1 + cam.fly * 2.2);
      const rows = Math.ceil(R * 2);
      const srcH = TEX_H;
      for (let row = 0; row < rows; row++) {
        const dy = row - R;
        const halfChord = chordHalfWidth(R, dy);
        if (halfChord <= 0) continue;
        const viewLat = Math.asin(Math.max(-1, Math.min(1, dy / R)));
        const lat = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, cam.tilt + viewLat));
        const srcY = Math.floor(((lat / Math.PI) + 0.5) * srcH);
        // visible longitude span: [lon - π/2, lon + π/2]
        let u0 = ((cam.lon - Math.PI / 2) / (Math.PI * 2)) + 0.5;
        u0 = ((u0 % 1) + 1) % 1;
        const sliceW = TEX_W / 2;
        const sx0 = u0 * TEX_W;
        const destY = cy - R + row;
        const destX = cx - halfChord;
        const destW = halfChord * 2;
        if (sx0 + sliceW <= TEX_W) {
          ctx.drawImage(tex, sx0, srcY, sliceW, 1, destX, destY, destW, 1);
        } else {
          const w1 = TEX_W - sx0;
          const dw1 = destW * (w1 / sliceW);
          ctx.drawImage(tex, sx0, srcY, w1, 1, destX, destY, dw1, 1);
          ctx.drawImage(tex, 0, srcY, sliceW - w1, 1, destX + dw1, destY, destW - dw1, 1);
        }
      }
      // day/night terminator + atmosphere
      const tg = ctx.createRadialGradient(cx - R * 0.45, cy - R * 0.35, R * 0.2, cx, cy, R * 1.02);
      tg.addColorStop(0, "rgba(255,250,230,0.22)");
      tg.addColorStop(0.45, "rgba(0,0,0,0)");
      tg.addColorStop(0.8, "rgba(0,0,10,0.28)");
      tg.addColorStop(1, "rgba(0,0,10,0.72)");
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = tg;
      ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
      ctx.restore();
      // rim glow (localized)
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = "rgba(0,200,255,0.35)";
      ctx.lineWidth = 3;
      ctx.shadowColor = "rgba(0,200,255,0.8)";
      ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    function frame(now) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!reduced) t += dt;

      if (autoRef.current && !reduced && cam.mode === "orbit" && flyDir === 0) {
        cam.lon += dt * 0.08;
      }
      if (flyDir === 1) {
        cam.fly = Math.min(1, cam.fly + dt * 1.4);
        if (cam.fly >= 1) { cam.mode = "surface"; flyDir = 0; setMode("surface"); }
      } else if (flyDir === -1) {
        cam.fly = Math.max(0, cam.fly - dt * 1.4);
        if (cam.fly <= 0) { cam.mode = "orbit"; flyDir = 0; setMode("orbit"); }
      }

      // background
      ctx.fillStyle = "#010103";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#ffffff";
      for (const s of stars) {
        const a = reduced ? 0.7 : 0.35 + 0.35 * Math.sin(t * 2 + s.tw);
        ctx.globalAlpha = Math.max(0.15, a);
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;

      if (cam.mode === "orbit" || cam.fly > 0) {
        drawPlanet(now);
        // crosshair hint
        if (cam.mode === "orbit" && cam.fly === 0) {
          ctx.fillStyle = "rgba(0,255,255,0.55)";
          ctx.font = "500 13px ui-monospace, Menlo, monospace";
          ctx.textAlign = "center";
          ctx.fillText("TAP PLANET TO ENTER", cx, cy + cam.radius + 30);
        }
      }

      if (cam.mode === "surface") {
        // terrain close-up
        ctx.save();
        ctx.beginPath(); ctx.arc(cx, cy, 300, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(surf, cx - 300, cy - 300, 600, 600);
        // reticle + grid
        ctx.strokeStyle = "rgba(0,255,255,0.5)";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(cx - 18, cy); ctx.lineTo(cx + 18, cy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx, cy - 18); ctx.lineTo(cx, cy + 18); ctx.stroke();
        ctx.strokeStyle = "rgba(0,255,255,0.14)";
        for (let gx = -300; gx <= 300; gx += 60) {
          ctx.beginPath(); ctx.moveTo(cx + gx, cy - 300); ctx.lineTo(cx + gx, cy + 300); ctx.stroke();
        }
        for (let gy = -300; gy <= 300; gy += 60) {
          ctx.beginPath(); ctx.moveTo(cx - 300, cy + gy); ctx.lineTo(cx + 300, cy + gy); ctx.stroke();
        }
        ctx.restore();
        ctx.strokeStyle = "rgba(0,255,255,0.4)";
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, 300, 0, Math.PI * 2); ctx.stroke();
        // elevation readout at center
        const h = sampleField(field, TEX_W, TEX_H, cam.surfU, cam.surfV);
        const el = Math.round((h - 0.47) * 4200);
        setElevThrottled(`${el >= 0 ? "+" : ""}${el} m`);
      }

      // coords readout (throttled via state only in orbit)
      if (cam.mode === "orbit") {
        const lonDeg = (((cam.lon * 180 / Math.PI) % 360) + 360) % 360;
        setCoordsThrottled(`LON ${lonDeg.toFixed(1)}° · LAT ${(cam.tilt * 180 / Math.PI).toFixed(1)}°`);
      }
    }

    let coordTick = 0, elevTick = 0, lastCoords = "", lastElev = "";
    function setCoordsThrottled(v) {
      if (v !== lastCoords) { lastCoords = v; setCoords(v); }
    }
    function setElevThrottled(v) {
      if (v !== lastElev) { lastElev = v; setElev(v); }
    }

    raf = requestAnimationFrame(frame);

    const returnOrbit = () => { if (cam.mode === "surface") flyDir = -1; };
    canvas._returnOrbit = returnOrbit;

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [reduced]);

  const returnToOrbit = () => {
    const c = canvasRef.current;
    if (c && c._returnOrbit) c._returnOrbit();
  };

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <header style={styles.head}>
          <h1 style={styles.title}>BEARTH</h1>
          <p style={styles.sub}>EARTH_B · procedural world engine</p>
        </header>
        <div style={styles.canvasWrap}>
          <canvas ref={canvasRef} style={styles.canvas} aria-label="Bearth planet explorer" />
        </div>
        <div style={styles.bar}>
          <span style={styles.readout}>{mode === "orbit" ? coords : `SURFACE · ELEV ${elev}`}</span>
        </div>
        <div style={styles.controls}>
          {mode === "orbit" ? (
            <>
              <button onClick={() => setAutoRotate(!autoRotate)} style={{ ...styles.btn, ...(autoRotate ? styles.btnOn : {}) }}>
                AUTO-ROTATE
              </button>
              <span style={styles.hint}>Drag to rotate · Scroll to zoom · Tap planet to land</span>
            </>
          ) : (
            <>
              <button onClick={returnToOrbit} style={{ ...styles.btn, ...styles.btnPrimary }}>RETURN TO ORBIT</button>
              <span style={styles.hint}>Drag to walk · Scroll to zoom terrain</span>
            </>
          )}
        </div>
        <div aria-hidden="true" style={{ height: 'max(5rem, env(safe-area-inset-bottom))' }} />
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: "100dvh", background: "#010103", display: "flex", justifyContent: "center", padding: "20px 12px", fontFamily: "'Courier New', monospace" },
  shell: { width: "min(620px, 100%)" },
  head: { textAlign: "center", marginBottom: 12 },
  title: { margin: 0, color: "#00ffff", letterSpacing: 10, fontSize: "clamp(1.8rem,7vw,2.6rem)", textShadow: "0 0 20px #00ffff, 0 0 60px #ff00ff" },
  sub: { color: "#ffd700", letterSpacing: 4, fontSize: "0.8rem", margin: "6px 0 0", animation: "none" },
  canvasWrap: { border: "1px solid rgba(0,255,255,0.2)", borderRadius: 12, overflow: "hidden" },
  canvas: { display: "block", width: "100%", height: "auto", aspectRatio: "1 / 1", touchAction: "none", cursor: "grab" },
  bar: { marginTop: 10, padding: "10px 14px", borderLeft: "3px solid #00ffff", background: "rgba(0,20,30,0.7)" },
  readout: { color: "#00ffff", fontSize: "0.85rem", letterSpacing: 2 },
  controls: { display: "flex", alignItems: "center", gap: 12, marginTop: 12, flexWrap: "wrap" },
  btn: { padding: "10px 16px", fontSize: "0.75rem", cursor: "pointer", background: "transparent", color: "#00ffff", border: "1px solid rgba(0,255,255,0.5)", letterSpacing: 2, borderRadius: 6, fontFamily: "inherit", fontWeight: "bold" },
  btnOn: { background: "rgba(0,255,255,0.15)" },
  btnPrimary: { background: "#00ffff", color: "#001318", border: "1px solid #00ffff" },
  hint: { color: "rgba(0,255,255,0.55)", fontSize: "0.75rem", letterSpacing: 1 },
};
