"use client";

import { useEffect, useRef, useState } from "react";
import {
  createGame,
  step,
  pressJump,
  resetGame,
  timeToLanding,
  levelY,
  LEVEL_COUNT,
  LEVEL_SPACING,
  BALL_R,
} from "./game";

/**
 * Orbital Ascent — the 99-level ascent, rebuilt.
 * A ball auto-bounces up a tower of 99 platforms. Steer sideways; press
 * JUMP exactly as the timing ring closes on landing to boost upward.
 * Fall more than two levels below your best and the run ends.
 */
export default function OrbitalAscentPage() {
  const canvasRef = useRef(null);
  const levelLabelRef = useRef(null);
  const [overlay, setOverlay] = useState({ kind: "menu", text: "" });
  const gameRef = useRef(null);

  useEffect(() => {
    document.title = "Orbital Ascent";
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const game = createGame(20260927);
    gameRef.current = game;

    let raf = 0;
    let last = performance.now();
    let camY = 0;
    const stars = [];
    for (let i = 0; i < 140; i++) {
      stars.push({
        x: Math.random() * 1200 - 100,
        y: Math.random() * 2400 - 200,
        r: Math.random() * 1.6 + 0.4,
        layer: i % 3,
        tw: Math.random() * Math.PI * 2,
      });
    }

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

    // world: 900px wide centered on canvas; camera follows ball y
    function view() {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const scale = Math.min(1.15, w / 900);
      return { w, h, scale, cx: w / 2, cy: h * 0.62 };
    }

    function draw(now) {
      const v = view();
      const t = now / 1000;
      const targetCamY = game.ball.y;
      camY = reduced ? targetCamY : camY + (targetCamY - camY) * 0.12;

      const toSX = (x) => v.cx + x * v.scale;
      const toSY = (y) => v.cy + (y - camY) * v.scale;

      // background
      const g = ctx.createLinearGradient(0, 0, 0, v.h);
      g.addColorStop(0, "#04040c");
      g.addColorStop(0.6, "#0a0a1e");
      g.addColorStop(1, "#120a24");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, v.w, v.h);

      // parallax stars (static when reduced motion)
      for (const s of stars) {
        const par = [0.15, 0.35, 0.6][s.layer];
        const yy = reduced
          ? s.y % v.h
          : ((s.y - camY * par * 0.4) % (v.h + 80) + v.h + 80) % (v.h + 80) - 40;
        const alpha = 0.35 + 0.35 * s.layer / 2 + (reduced ? 0 : 0.25 * Math.sin(t * 2 + s.tw));
        ctx.fillStyle = `rgba(200,220,255,${Math.max(0.1, Math.min(0.9, alpha))})`;
        ctx.beginPath();
        ctx.arc((s.x % (v.w + 40)) - 20, yy, s.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // faint nebula bands
      ctx.save();
      ctx.globalAlpha = 0.16;
      for (let b = 0; b < 3; b++) {
        const yy = ((b * 700 - camY * 0.25) % (v.h + 600) + v.h + 600) % (v.h + 600) - 300;
        const ng = ctx.createRadialGradient(v.w * (0.2 + b * 0.3), yy, 10, v.w * (0.2 + b * 0.3), yy, 260);
        ng.addColorStop(0, ["#3b1d6e", "#0e3a5c", "#5c1746"][b]);
        ng.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = ng;
        ctx.fillRect(0, yy - 300, v.w, 600);
      }
      ctx.restore();

      // platforms near view
      const loY = camY + (v.h - v.cy) / v.scale + 120;
      const hiY = camY - v.cy / v.scale - 120;
      for (const p of game.levels) {
        if (p.y > loY || p.y < hiY) continue;
        const sx = toSX(p.x);
        const sy = toSY(p.y);
        const pw = p.width * v.scale;
        const hue = 175 + (p.level / LEVEL_COUNT) * 130;
        ctx.save();
        ctx.shadowColor = `hsla(${hue},90%,60%,0.7)`;
        ctx.shadowBlur = reduced ? 0 : 14;
        ctx.fillStyle = `hsla(${hue},70%,42%,0.9)`;
        const ph = 10 * v.scale;
        ctx.beginPath();
        ctx.roundRect(sx - pw / 2, sy - ph / 2, pw, ph, ph / 2);
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = "rgba(255,255,255,0.75)";
        ctx.font = `${Math.max(10, 11 * v.scale)}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(String(p.level), sx, sy - 8 * v.scale);
      }

      // ball + trail
      const bx = toSX(Math.max(-440, Math.min(440, game.ball.x)));
      const by = toSY(game.ball.y);
      if (!reduced) {
        game.trail = game.trail || [];
        game.trail.push({ x: bx, y: by });
        if (game.trail.length > 14) game.trail.shift();
        for (let i = 0; i < game.trail.length; i++) {
          const p = game.trail[i];
          ctx.fillStyle = `rgba(0,255,204,${(i / game.trail.length) * 0.25})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, BALL_R * v.scale * (i / game.trail.length), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      const bg = ctx.createRadialGradient(bx - 5, by - 6, 2, bx, by, BALL_R * v.scale);
      bg.addColorStop(0, "#ffffff");
      bg.addColorStop(0.45, "#00ffcc");
      bg.addColorStop(1, "#007a66");
      ctx.save();
      ctx.shadowColor = "#00ffcc";
      ctx.shadowBlur = reduced ? 0 : 22;
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(bx, by, BALL_R * v.scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // timing ring: closes exactly at landing — press JUMP as it closes
      if (game.status === "playing") {
        const ttl = timeToLanding(game);
        if (ttl !== Infinity && ttl < 0.9) {
          const k = Math.max(0, Math.min(1, ttl / 0.9));
          const rr = (BALL_R * v.scale + 6) + k * 46 * v.scale;
          const inWindow = ttl <= 0.28;
          ctx.save();
          ctx.strokeStyle = inWindow ? "#ffe14d" : "rgba(255,255,255,0.55)";
          ctx.lineWidth = 3;
          ctx.shadowColor = inWindow ? "#ffe14d" : "transparent";
          ctx.shadowBlur = reduced ? 0 : 10;
          ctx.beginPath();
          ctx.arc(bx, by, rr, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }

      // HUD level
      if (levelLabelRef.current) {
        const txt = `Level ${game.highest} / ${LEVEL_COUNT}`;
        if (levelLabelRef.current.textContent !== txt) levelLabelRef.current.textContent = txt;
      }
    }

    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      // The game itself is user-initiated play, so it runs under
      // reduced-motion too; only decorative motion is stilled in draw().
      const events = step(game, dt);
      for (const e of events) {
        if (e.type === "lost") setOverlay({ kind: "lost", text: `You fell. Highest level reached: ${e.highest}` });
        if (e.type === "won") setOverlay({ kind: "won", text: "You reached level 99 — the top of the tower." });
      }
      draw(now);
      raf = requestAnimationFrame(frame);
    }

    // input
    const keys = {};
    function onKey(e) {
      if (e.repeat) return;
      keys[e.code] = true;
      if (e.code === "Space" || e.code === "KeyW" || e.code === "ArrowUp") {
        e.preventDefault();
        doJump();
      }
      updateSteer();
    }
    function onKeyUp(e) {
      keys[e.code] = false;
      updateSteer();
    }
    function updateSteer() {
      const left = keys["ArrowLeft"] || keys["KeyA"];
      const right = keys["ArrowRight"] || keys["KeyD"];
      game.steer = (right ? 1 : 0) - (left ? 1 : 0);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);

    function doJump() {
      pressJump(game);
    }
    gameRef.current.doJump = doJump;
    gameRef.current.setSteer = (d) => {
      game.steer = d;
    };

    window.startAscent = () => {
      resetGame(game);
      setOverlay({ kind: "none", text: "" });
    };

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      delete window.startAscent;
    };
  }, []);

  function press(dir) {
    const g = gameRef.current;
    if (g && g.setSteer) g.setSteer(dir);
  }
  function jump() {
    const g = gameRef.current;
    if (g && g.doJump) g.doJump();
  }

  return (
    <>
    <div style={styles.page}>
      <div ref={levelLabelRef} style={styles.hud}>Level 1 / 99</div>
      <div style={styles.hint}>Steer with ← → or the pad. Press JUMP as the ring closes.</div>
      <canvas ref={canvasRef} style={styles.canvas} />

      <div style={styles.controls}>
        <div style={styles.dpad}>
          <button
            style={styles.padBtn} aria-label="Steer left"
            onPointerDown={() => press(-1)} onPointerUp={() => press(0)} onPointerLeave={() => press(0)}
          >◀</button>
          <button
            style={styles.padBtn} aria-label="Steer right"
            onPointerDown={() => press(1)} onPointerUp={() => press(0)} onPointerLeave={() => press(0)}
          >▶</button>
        </div>
        <button style={styles.jumpBtn} onPointerDown={jump} aria-label="Jump">JUMP</button>
      </div>

      {overlay.kind !== "none" && (
        <div style={styles.overlay}>
          <h1 style={styles.title}>Orbital Ascent</h1>
          <p style={styles.sub}>
            {overlay.kind === "menu" &&
              "A ball, a tower, 99 platforms. It bounces on its own — you steer. Time your single JUMP exactly as the ring closes on landing to boost upward. Fall two levels below your best and the run ends."}
            {overlay.kind === "lost" && overlay.text}
            {overlay.kind === "won" && overlay.text}
          </p>
          <button style={styles.startBtn} onClick={() => window.startAscent && window.startAscent()}>
            {overlay.kind === "menu" ? "Begin Ascent" : "Climb Again"}
          </button>
          <p style={styles.keys}>Keys: ← → or A D to steer · Space to jump</p>
        </div>
      )}
    </div>
    {/* Safari bottom-bar clearance: blank space under the fixed game viewport */}
    <div aria-hidden="true" style={{ height: 'calc(4.5rem + env(safe-area-inset-bottom))' }} />
    </>
  );
}

const styles = {
  page: { position: "fixed", inset: 0, background: "#04040c", color: "#fff", overflow: "hidden", fontFamily: "system-ui, -apple-system, sans-serif", touchAction: "none", userSelect: "none" },
  canvas: { position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" },
  hud: { position: "absolute", top: 16, left: 20, zIndex: 5, fontSize: 30, fontWeight: 700, color: "#00ffcc", textShadow: "0 0 12px rgba(0,255,204,.6)", pointerEvents: "none" },
  hint: { position: "absolute", top: 56, left: 20, zIndex: 5, fontSize: 13, opacity: 0.75, pointerEvents: "none", maxWidth: "70vw" },
  controls: { position: "absolute", left: 0, right: 0, bottom: 18, zIndex: 5, display: "flex", justifyContent: "space-between", alignItems: "flex-end", padding: "0 20px", pointerEvents: "none" },
  dpad: { display: "flex", gap: 12, pointerEvents: "auto" },
  padBtn: { width: 68, height: 68, borderRadius: 14, border: "2px solid rgba(255,255,255,.4)", background: "rgba(255,255,255,.12)", color: "#fff", fontSize: 26, cursor: "pointer" },
  jumpBtn: { width: 104, height: 104, borderRadius: "50%", border: "2px solid #ff2e63", background: "rgba(255,46,99,.25)", color: "#fff", fontSize: 18, fontWeight: 700, cursor: "pointer", pointerEvents: "auto" },
  overlay: { position: "absolute", inset: 0, zIndex: 10, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(2,2,8,.86)", textAlign: "center", padding: 24 },
  title: { fontSize: 44, margin: "0 0 12px", color: "#00ffcc", letterSpacing: 3, textTransform: "uppercase" },
  sub: { fontSize: 16, maxWidth: 560, lineHeight: 1.6, opacity: 0.9, margin: "0 0 24px" },
  startBtn: { padding: "14px 44px", fontSize: 20, fontWeight: 700, background: "#00ffcc", color: "#00211b", border: "none", borderRadius: 8, cursor: "pointer", textTransform: "uppercase", letterSpacing: 2 },
  keys: { marginTop: 18, fontSize: 13, opacity: 0.6 },
};
