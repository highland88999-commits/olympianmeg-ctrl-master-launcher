'use client';

// UNDERWORLD AWAKENING — the descent.
// A scripted canvas cinematic: the warp (a soul-road tunnel ride), the
// approach (the gates resolve out of the dark), then the gates themselves
// with passage onward to the underworld catalog. Procedural canvas 2D,
// original Stygian theming — no borrowed IP, no remote frames, no tracking.

import { useEffect, useRef, useState } from "react";
import {
  WARP_DURATION,
  APPROACH_DURATION,
  RING_COUNT,
  createDescent,
  beginDescent,
  replayDescent,
  updateDescent,
  phaseProgress,
  tunnelRing,
  soulStreak,
  streakCountFor,
} from "./awakening.js";

const TAU = Math.PI * 2;

export default function UnderworldAwakening() {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const descentRef = useRef(null);
  const [phase, setPhase] = useState("dormant");
  const [progress, setProgress] = useState(0);
  const reducedRef = useRef(false);

  useEffect(() => {
    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    const reduced = reducedRef.current;

    const d = createDescent();
    descentRef.current = d;

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

    function paintWarp(w, h, t) {
      ctx.fillStyle = "#030109";
      ctx.fillRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      const R = Math.min(w, h) / 2;
      // tunnel rings rushing outward
      for (let i = 0; i < RING_COUNT; i++) {
        const r = tunnelRing(i, t);
        ctx.strokeStyle = `rgba(120,90,220,${(r.alpha * 0.8).toFixed(3)})`;
        ctx.lineWidth = 1 + r.p * 5;
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(1, r.radius * R), 0, TAU);
        ctx.stroke();
      }
      // streaking soul-lights
      const n = reduced ? 40 : streakCountFor(w, h);
      ctx.lineCap = "round";
      for (let i = 0; i < n; i++) {
        const s = soulStreak(i, t, n);
        const x0 = cx + Math.cos(s.angle) * s.r0 * R * 1.4;
        const y0 = cy + Math.sin(s.angle) * s.r0 * R * 1.4;
        const x1 = cx + Math.cos(s.angle) * s.r1 * R * 1.4;
        const y1 = cy + Math.sin(s.angle) * s.r1 * R * 1.4;
        ctx.strokeStyle = `hsla(${s.hue},80%,70%,${s.alpha.toFixed(3)})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
      // the far light
      const pr = phaseProgress(d);
      const fg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.5);
      fg.addColorStop(0, `rgba(200,170,255,${0.35 + pr * 0.3})`);
      fg.addColorStop(1, "rgba(200,170,255,0)");
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.5, 0, TAU);
      ctx.fill();
    }

    function paintApproach(w, h, t) {
      ctx.fillStyle = "#040208";
      ctx.fillRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h * 0.56;
      const pr = phaseProgress(d);
      const R = Math.min(w, h) / 2;
      // receding tunnel, slowing
      for (let i = 0; i < 12; i++) {
        const r = tunnelRing(i, t * 0.4, 0.6);
        ctx.strokeStyle = `rgba(110,80,200,${(r.alpha * (1 - pr) * 0.7).toFixed(3)})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(1, r.radius * R), 0, TAU);
        ctx.stroke();
      }
      // the gates resolve out of the dark
      const gw = Math.min(w * 0.62, 520) * (0.4 + pr * 0.6);
      const gh = h * 0.52 * (0.4 + pr * 0.6);
      const gx = cx - gw / 2;
      const gy = cy - gh / 2;
      const a = Math.min(1, pr * 1.6);
      // portal glow between the pillars — localized
      const pg = ctx.createRadialGradient(cx, cy, 0, cx, cy, gw * 0.7);
      pg.addColorStop(0, `rgba(150,110,255,${0.5 * a})`);
      pg.addColorStop(1, "rgba(150,110,255,0)");
      ctx.fillStyle = pg;
      ctx.fillRect(cx - gw, cy - gh, gw * 2, gh * 2);
      // pillars
      ctx.fillStyle = `rgba(18,12,30,${a})`;
      ctx.strokeStyle = `rgba(170,130,255,${0.55 * a})`;
      ctx.lineWidth = 2.5;
      for (const px of [gx, gx + gw - 26]) {
        ctx.beginPath();
        ctx.rect(px, gy, 26, gh);
        ctx.fill();
        ctx.stroke();
        // capitals
        ctx.fillRect(px - 8, gy - 14, 42, 14);
      }
      // lintel
      ctx.fillStyle = `rgba(22,14,36,${a})`;
      ctx.fillRect(gx - 10, gy - 34, gw + 20, 22);
      ctx.strokeRect(gx - 10, gy - 34, gw + 20, 22);
      // steps
      ctx.fillStyle = `rgba(14,10,24,${a})`;
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(gx - 20 - i * 14, gy + gh + i * 12, gw + 40 + i * 28, 12);
      }
    }

    function paintGates(w, h, t) {
      paintApproach(w, h, t);
      // force full reveal
      const cx = w / 2;
      const cy = h * 0.56;
      const pulse = reduced ? 0.5 : 0.35 + 0.15 * Math.sin(t * 2.2);
      const pg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(w, h) * 0.4);
      pg.addColorStop(0, `rgba(180,150,255,${pulse})`);
      pg.addColorStop(1, "rgba(180,150,255,0)");
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.min(w, h) * 0.4, 0, TAU);
      ctx.fill();
    }

    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.1) dt = 0.1;
      const t = now / 1000;

      const before = d.phase;
      updateDescent(d, dt);
      if (d.phase !== before) setPhase(d.phase);
      setProgress(phaseProgress(d));

      const w = canvas.width;
      const h = canvas.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const vw = w / dpr;
      const vh = h / dpr;

      if (d.phase === "dormant") {
        ctx.fillStyle = "#030109";
        ctx.fillRect(0, 0, vw, vh);
        // faint drifting motes behind the title
        for (let i = 0; i < 40; i++) {
          const x = (i * 173.3) % vw;
          const y = (i * 311.7) % vh;
          const tw = reduced ? 0.25 : 0.12 + 0.12 * Math.sin(t + i);
          ctx.fillStyle = `rgba(140,120,220,${tw})`;
          ctx.fillRect(x, y + (reduced ? 0 : Math.sin(t * 0.4 + i) * 8), 2, 2);
        }
      } else if (d.phase === "warp") {
        paintWarp(vw, vh, t);
      } else if (d.phase === "approach") {
        paintApproach(vw, vh, t);
      } else {
        paintGates(vw, vh, t);
      }
    };
    raf = requestAnimationFrame(frame);

    const onVis = () => {
      if (document.hidden) last = performance.now();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const start = () => {
    const d = descentRef.current;
    if (d) {
      beginDescent(d);
      setPhase("warp");
    }
  };

  const replay = () => {
    const d = descentRef.current;
    if (d) {
      replayDescent(d);
      setPhase("dormant");
      setProgress(0);
    }
  };

  return (
    <>
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#030109",
        color: "#e6dcff",
        fontFamily: "'Courier New', ui-monospace, monospace",
        overflow: "hidden",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      <div ref={wrapRef} style={{ position: "absolute", inset: 0 }}>
        <canvas ref={canvasRef} style={{ display: "block" }} />
      </div>

      {phase === "dormant" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: 24,
            background:
              "radial-gradient(ellipse at center, rgba(8,4,18,0.45) 0%, rgba(3,1,9,0.9) 100%)",
          }}
        >
          <div
            style={{
              fontSize: "clamp(30px, 7vw, 58px)",
              letterSpacing: 10,
              color: "#f0e8ff",
              textShadow: "0 0 26px rgba(150,110,255,0.6)",
            }}
          >
            UNDERWORLD
          </div>
          <div style={{ marginTop: 6, letterSpacing: 12, color: "#9d8fd0", fontSize: 15 }}>
            AWAKENING
          </div>
          <p
            style={{
              marginTop: 24,
              maxWidth: 440,
              color: "#b6a8d8",
              fontSize: 14,
              lineHeight: 1.9,
            }}
          >
            Below the catalog of games lies the road that leads to it. Take the
            descent: ride the soul-road tunnel, and arrive at the gates.
          </p>
          <button
            onClick={start}
            style={{
              marginTop: 26,
              padding: "14px 42px",
              fontSize: 14,
              letterSpacing: 4,
              fontFamily: "inherit",
              background: "rgba(120,80,220,0.14)",
              border: "2px solid #a685ff",
              color: "#e6dcff",
              borderRadius: 8,
              cursor: "pointer",
              boxShadow: "0 0 18px rgba(140,110,255,0.35)",
            }}
          >
            BEGIN THE DESCENT
          </button>
        </div>
      )}

      {(phase === "warp" || phase === "approach") && (
        <div
          style={{
            position: "absolute",
            bottom: 26,
            left: 0,
            right: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 10,
            pointerEvents: "none",
          }}
        >
          <div style={{ letterSpacing: 6, fontSize: 12, color: "#b6a8d8" }}>
            {phase === "warp" ? "RIDING THE SOUL-ROAD" : "THE GATES APPROACH"}
          </div>
          <div
            style={{
              width: 220,
              height: 4,
              background: "rgba(255,255,255,0.12)",
              borderRadius: 2,
            }}
          >
            <div
              style={{
                width: progress * 100 + "%",
                height: "100%",
                borderRadius: 2,
                background: "linear-gradient(90deg,#7a5fd0,#c9b3ff)",
              }}
            />
          </div>
        </div>
      )}

      {phase === "gates" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "flex-end",
            paddingBottom: "9vh",
            textAlign: "center",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              letterSpacing: 6,
              fontSize: 14,
              color: "#d9ccff",
              textShadow: "0 0 16px rgba(150,110,255,0.7)",
              marginBottom: 18,
            }}
          >
            THE GATES STAND OPEN
          </div>
          <div style={{ display: "flex", gap: 12, pointerEvents: "auto" }}>
            <a
              href="/underworld"
              style={{
                padding: "14px 34px",
                fontSize: 14,
                letterSpacing: 3,
                fontFamily: "inherit",
                background: "rgba(120,80,220,0.2)",
                border: "2px solid #a685ff",
                color: "#f0e8ff",
                borderRadius: 8,
                textDecoration: "none",
                boxShadow: "0 0 18px rgba(140,110,255,0.4)",
              }}
            >
              ENTER THE UNDERWORLD
            </a>
            <button
              onClick={replay}
              style={{
                padding: "14px 22px",
                fontSize: 14,
                letterSpacing: 2,
                fontFamily: "inherit",
                background: "transparent",
                border: "1px solid rgba(166,133,255,0.5)",
                color: "#b6a8d8",
                borderRadius: 8,
                cursor: "pointer",
              }}
              aria-label="Replay the descent"
            >
              ↻
            </button>
          </div>
        </div>
      )}
    </div>
    {/* Safari bottom-bar clearance: blank space under the fixed descent viewport */}
    <div aria-hidden="true" style={{ height: 'max(5rem, env(safe-area-inset-bottom))' }} />
    </>
  );
}
