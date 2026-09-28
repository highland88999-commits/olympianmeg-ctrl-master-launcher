'use client';

// STATUE OF LIBERTY — interactive monument exhibit, now in 3D.
// The monument is a fully procedural three.js model (no model files, no CDN):
// drag to orbit, scroll or pinch to zoom, tap the + markers for facts,
// toggle day and night, and walk the 1876 → 1886 → 1986 timeline.
// Zero network calls.

import { useEffect, useRef, useState } from "react";
import { HOTSPOTS, TIMELINE } from "./liberty.js";
import { buildStatueGlb } from "./glb.js";
import { createLibertyScene } from "./liberty3d.js";

export default function StatueOfLiberty() {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const sceneRef = useRef(null);
  const markerRefs = useRef({});
  const [night, setNight] = useState(false);
  const [active, setActive] = useState(null); // hotspot id
  const [tlIx, setTlIx] = useState(1);
  const [monumentReady, setMonumentReady] = useState(false);
  const [monumentFailed, setMonumentFailed] = useState(false);
  const reducedRef = useRef(false);

  useEffect(() => {
    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useEffect(() => {
    if (sceneRef.current) sceneRef.current.setNight(night);
  }, [night ]);
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const scene3d = createLibertyScene(canvas, { reducedMotion: reducedRef.current });
    sceneRef.current = scene3d;
    scene3d.setNight(night);
    scene3d.ready.then((ok) => {
      if (ok) setMonumentReady(true);
      else setMonumentFailed(true);
    });

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      scene3d.resize(r.width, r.height);
    };
    resize();
    window.addEventListener("resize", resize);

    let raf = 0;
    let last = performance.now();
    const onVis = () => {
      if (document.hidden) last = performance.now();
    };
    document.addEventListener("visibilitychange", onVis);

    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      scene3d.render(dt);
      // pin the HTML hotspot markers to their 3D anchors
      for (const hsp of HOTSPOTS) {
        const el = markerRefs.current[hsp.id];
        if (!el) continue;
        const p = scene3d.project(hsp.id);
        if (!p || !p.visible) {
          el.style.display = "none";
        } else {
          el.style.display = "flex";
          el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -50%)`;
        }
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVis);
      scene3d.dispose();
      sceneRef.current = null;
    };
  }, []);

  const zoomBy = (d) => {
    if (sceneRef.current) sceneRef.current.zoomBy(d);
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
    <>
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
        <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />
        {/* 3D hotspot markers, pinned to the monument each frame */}
        {HOTSPOTS.map((hsp) => (
          <button
            key={hsp.id}
            ref={(el) => {
              markerRefs.current[hsp.id] = el;
            }}
            onClick={() => setActive(hsp.id)}
            aria-label={`Fact: ${hsp.title}`}
            style={markerBtn}
          >
            +
          </button>
        ))}
        {!monumentReady && (
          <div style={loadingVeil}>
            {monumentFailed
              ? "THE MONUMENT COULD NOT BE RAISED ON THIS DEVICE."
              : "RAISING THE MONUMENT…"}
          </div>
        )}
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
    {/* Safari bottom-bar clearance: blank space under the fixed monument viewport */}
    <div aria-hidden="true" style={{ height: 'max(5rem, env(safe-area-inset-bottom))' }} />
    </>
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

const markerBtn = {
  position: "absolute",
  top: 0,
  left: 0,
  width: 36,
  height: 36,
  borderRadius: "50%",
  display: "none",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(5,10,18,0.7)",
  border: "2px solid #FFD700",
  color: "#FFD700",
  fontSize: 18,
  fontWeight: "bold",
  cursor: "pointer",
  zIndex: 3,
  padding: 0,
};

const loadingVeil = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#04060f",
  color: "#FFD700",
  fontFamily: "ui-monospace, Menlo, monospace",
  fontSize: 13,
  letterSpacing: 4,
  zIndex: 2,
};
