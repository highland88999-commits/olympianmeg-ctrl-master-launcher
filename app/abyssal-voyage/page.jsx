"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createGame, stepGame, resetGame, DIFFICULTY, depthZone, WORLD } from "./engine";

/**
 * Abyssal Voyage — an endless deep-sea dive.
 * Steer a submersible through rock gates, collect pearls, survive the trench.
 * All art is procedural canvas 2D; zero external requests.
 */
export default function AbyssalVoyagePage() {
  const canvasRef = useRef(null);
  const gameRef = useRef(null);
  const inputRef = useRef({ left: false, right: false, targetX: null, keyboardAxis: 0 });
  const [screen, setScreen] = useState("title"); // title | playing | paused | over
  const [difficulty, setDifficulty] = useState("abyssal");
  const [hud, setHud] = useState({ depth: 0, hull: 100, score: 0, pearls: 0, zone: "TWILIGHT ZONE", cause: "" });
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    document.title = "Abyssal Voyage";
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  const startGame = useCallback(
    (diffKey) => {
      const g = createGame(diffKey || difficulty, (Math.random() * 1e9) | 0);
      g.phase = "playing";
      gameRef.current = g;
      inputRef.current.targetX = null;
      setScreen("playing");
    },
    [difficulty]
  );

  const pauseGame = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    if (g.phase === "playing") {
      g.phase = "paused";
      setScreen("paused");
    } else if (g.phase === "paused") {
      g.phase = "playing";
      setScreen("playing");
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = WORLD.width, H = WORLD.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.aspectRatio = `${W}/${H}`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // scrolling parallax rock-wall textures, seeded once
    const wallSeed = 1234;
    const rand = (n) => {
      let x = Math.sin(n * 127.1 + wallSeed * 311.7) * 43758.5453;
      return x - Math.floor(x);
    };
    const wallLumps = [];
    for (let i = 0; i < 60; i++) wallLumps.push({ x: rand(i) * W, w: 40 + rand(i + 999) * 130, y0: rand(i + 500) * 1200 });

    let last = performance.now();
    let raf = 0;
    let hudTick = 0;

    const toWorld = (clientX, clientY) => {
      const r = canvas.getBoundingClientRect();
      return { x: ((clientX - r.left) / r.width) * W, y: ((clientY - r.top) / r.height) * H };
    };

    const onPointer = (e) => {
      const g = gameRef.current;
      if (!g || g.phase !== "playing") return;
      const p = toWorld(e.clientX, e.clientY);
      inputRef.current.targetX = p.x;
    };
    const onKeyDown = (e) => {
      if (e.key === "ArrowLeft" || e.key === "a") { inputRef.current.left = true; inputRef.current.keyboardAxis = -1; }
      if (e.key === "ArrowRight" || e.key === "d") { inputRef.current.right = true; inputRef.current.keyboardAxis = 1; }
      if (e.code === "Space") { e.preventDefault(); pauseGame(); }
    };
    const onKeyUp = (e) => {
      if (e.key === "ArrowLeft" || e.key === "a") { inputRef.current.left = false; inputRef.current.keyboardAxis = inputRef.current.right ? 1 : 0; }
      if (e.key === "ArrowRight" || e.key === "d") { inputRef.current.right = false; inputRef.current.keyboardAxis = inputRef.current.left ? -1 : 0; }
    };

    canvas.addEventListener("pointermove", onPointer);
    canvas.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    function drawBackground(g, t) {
      const zoneMix = Math.min(1, g.depth / 9000);
      const top = lerpColor([8, 40, 70], [2, 6, 16], zoneMix);
      const bot = lerpColor([2, 14, 34], [0, 2, 8], zoneMix);
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, top);
      grad.addColorStop(1, bot);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // god rays (subtle, localized)
      if (!reduced) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.10 * (1 - zoneMix * 0.7);
        for (let i = 0; i < 4; i++) {
          const rx = W * (0.15 + i * 0.22) + Math.sin(t * 0.0002 + i) * 20;
          const rg = ctx.createLinearGradient(rx, 0, rx + 90, H);
          rg.addColorStop(0, "rgba(120,220,255,0.55)");
          rg.addColorStop(1, "rgba(120,220,255,0)");
          ctx.fillStyle = rg;
          ctx.beginPath();
          ctx.moveTo(rx, 0); ctx.lineTo(rx + 40, 0);
          ctx.lineTo(rx + 130, H); ctx.lineTo(rx + 90, H);
          ctx.closePath(); ctx.fill();
        }
        ctx.restore();
      }

      // parallax wall lumps
      ctx.fillStyle = "rgba(6,16,28,0.85)";
      const scroll = g.depth * 0.9;
      for (const lump of wallLumps) {
        let y = (lump.y0 - scroll * 0.4) % 1300;
        if (y < -150) y += 1300;
        ctx.beginPath();
        ctx.ellipse(lump.x, y, lump.w / 2, lump.w / 2.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(W - lump.x, y + 400 > 1300 ? y - 900 : y + 400, lump.w / 2.4, lump.w / 3, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function drawObstacles(g) {
      for (const o of g.obstacles) {
        const gapTop = o.gapY - o.gapH / 2;
        const gapBot = o.gapY + o.gapH / 2;
        // rock body
        for (const rect of [{ x: o.x, y: -200, w: o.w, h: gapTop + 200 }, { x: o.x, y: gapBot, w: o.w, h: H - gapBot + 200 }]) {
          const rg = ctx.createLinearGradient(rect.x, 0, rect.x + rect.w, 0);
          rg.addColorStop(0, "#0d1622");
          rg.addColorStop(0.5, "#16222f");
          rg.addColorStop(1, "#0d1622");
          ctx.fillStyle = rg;
          ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
          // localized rim glow on the gap edges
          const edge = rect.y < o.gapY ? gapTop : gapBot;
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = 0.5;
          const eg = ctx.createLinearGradient(0, edge - 26, 0, edge + (rect.y < o.gapY ? 6 : 26));
          eg.addColorStop(0, "rgba(0,242,255,0)");
          eg.addColorStop(1, "rgba(0,242,255,0.35)");
          ctx.fillStyle = eg;
          ctx.fillRect(o.x, edge - 26, o.w, 32);
          ctx.restore();
        }
      }
      // pearls & debris
      for (const b of g.bits) {
        if (b.kind === "pearl") {
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          const pg = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 2.4);
          pg.addColorStop(0, "rgba(255,255,255,0.95)");
          pg.addColorStop(0.4, "rgba(0,242,255,0.6)");
          pg.addColorStop(1, "rgba(0,242,255,0)");
          ctx.fillStyle = pg;
          ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 2.4, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
          ctx.fillStyle = "#eaffff";
          ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.55, 0, Math.PI * 2); ctx.fill();
        } else if (b.kind === "debris") {
          ctx.fillStyle = "rgba(140,170,190,0.5)";
          ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
        } else if (b.kind === "spark") {
          ctx.fillStyle = "rgba(255,180,80,0.9)";
          ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
        }
      }
    }

    function drawSub(g, t) {
      const p = g.player;
      const blink = g.invuln > 0 && Math.floor(t / 120) % 2 === 0;
      ctx.save();
      ctx.translate(p.x, p.y);
      // headlight cone (localized)
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.16;
      const cone = ctx.createLinearGradient(0, 0, 0, -260);
      cone.addColorStop(0, "rgba(180,240,255,0.8)");
      cone.addColorStop(1, "rgba(180,240,255,0)");
      ctx.fillStyle = cone;
      ctx.beginPath();
      ctx.moveTo(-14, -10); ctx.lineTo(14, -10); ctx.lineTo(46, -260); ctx.lineTo(-46, -260);
      ctx.closePath(); ctx.fill();
      ctx.restore();

      ctx.rotate(Math.max(-0.3, Math.min(0.3, (p.targetX - p.x) * 0.004)));
      ctx.globalAlpha = blink ? 0.35 : 1;
      // hull
      const hg = ctx.createLinearGradient(0, -20, 0, 20);
      hg.addColorStop(0, "#3fd7ff");
      hg.addColorStop(0.5, "#1288b8");
      hg.addColorStop(1, "#083c5c");
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.ellipse(0, 0, 26, 15, 0, 0, Math.PI * 2);
      ctx.fill();
      // canopy
      ctx.fillStyle = "#dffaff";
      ctx.beginPath();
      ctx.ellipse(2, -4, 10, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      // tail fins
      ctx.fillStyle = "#0a5a80";
      ctx.beginPath(); ctx.moveTo(-24, -2); ctx.lineTo(-36, -12); ctx.lineTo(-32, 2); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-24, 2); ctx.lineTo(-36, 12); ctx.lineTo(-32, -2); ctx.closePath(); ctx.fill();
      // thruster
      if (!reduced) {
        const fl = 10 + Math.random() * 14;
        ctx.fillStyle = "rgba(0,242,255,0.7)";
        ctx.beginPath(); ctx.moveTo(-26, -5); ctx.lineTo(-26 - fl, 0); ctx.lineTo(-26, 5); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }

    function drawHUD(g) {
      ctx.textBaseline = "top";
      ctx.font = "600 20px ui-monospace, Menlo, monospace";
      // depth
      ctx.fillStyle = "rgba(0,242,255,0.9)";
      ctx.fillText(`DEPTH ${Math.floor(g.depth)}m`, 18, 16);
      ctx.fillStyle = "rgba(0,242,255,0.55)";
      ctx.font = "500 14px ui-monospace, Menlo, monospace";
      ctx.fillText(depthZone(g.depth), 18, 42);
      // hull bar
      const bw = 170;
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(W - bw - 18, 18, bw, 12);
      const hcol = g.hull > 50 ? "#00f2ff" : g.hull > 25 ? "#ffb300" : "#ff3355";
      ctx.fillStyle = hcol;
      ctx.fillRect(W - bw - 18, 18, bw * (g.hull / 100), 12);
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.font = "600 13px ui-monospace, Menlo, monospace";
      ctx.fillText(`HULL ${Math.ceil(g.hull)}%`, W - bw - 18, 36);
      // score
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = "600 18px ui-monospace, Menlo, monospace";
      ctx.fillText(`SCORE ${Math.floor(g.score)}`, 18, H - 40);
      ctx.fillStyle = "rgba(255,215,130,0.9)";
      ctx.fillText(`◈ ${g.pearls}`, W - 90, H - 40);
      // damage flash
      if (g.flash > 0) {
        ctx.fillStyle = `rgba(255,40,80,${Math.min(0.35, g.flash)})`;
        ctx.fillRect(0, 0, W, H);
      }
    }

    function lerpColor(a, b, m) {
      return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * m)).join(",")})`;
    }

    function frame(now) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const g = gameRef.current;

      if (g && g.phase === "playing") {
        stepGame(g, inputRef.current, reduced ? 0 : dt);
        hudTick += dt;
        if (hudTick > 0.15) {
          hudTick = 0;
          setHud({ depth: g.depth, hull: g.hull, score: g.score, pearls: g.pearls, zone: depthZone(g.depth), cause: g.causeOfDeath });
        }
        if (g.phase === "over") {
          setScreen("over");
          setHud({ depth: g.depth, hull: g.hull, score: g.score, pearls: g.pearls, zone: depthZone(g.depth), cause: g.causeOfDeath });
        }
      }
      if (g) {
        drawBackground(g, now);
        drawObstacles(g);
        drawSub(g, now);
        drawHUD(g);
      } else {
        drawBackground({ depth: 0 }, now);
      }
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointermove", onPointer);
      canvas.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [reduced, pauseGame]);

  const pickDifficulty = (k) => {
    setDifficulty(k);
    if (screen !== "title") startGame(k);
  };

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <div style={styles.canvasWrap}>
          <canvas ref={canvasRef} style={styles.canvas} aria-label="Abyssal Voyage dive canvas" />
          {screen === "title" && (
            <div style={styles.overlay}>
              <h1 style={styles.title}>ABYSSAL VOYAGE</h1>
              <p style={styles.sub}>Descend the trench. Thread the rock gates.<br />Gather pearls to patch your hull.</p>
              <div style={styles.row}>
                {Object.keys(DIFFICULTY).map((k) => (
                  <button key={k} onClick={() => pickDifficulty(k)} style={{ ...styles.btn, ...(difficulty === k ? styles.btnActive : {}) }}>
                    {DIFFICULTY[k].label}
                  </button>
                ))}
              </div>
              <button onClick={() => startGame()} style={{ ...styles.btn, ...styles.btnPrimary }}>DIVE</button>
              <p style={styles.hint}>Drag / arrow keys to steer · Space to pause</p>
            </div>
          )}
          {screen === "paused" && (
            <div style={styles.overlay}>
              <h2 style={styles.title2}>PAUSED</h2>
              <button onClick={pauseGame} style={{ ...styles.btn, ...styles.btnPrimary }}>RESUME</button>
              <button onClick={() => startGame()} style={styles.btn}>RESTART</button>
            </div>
          )}
          {screen === "over" && (
            <div style={styles.overlay}>
              <h2 style={styles.title2}>{hud.cause || "LOST"}</h2>
              <p style={styles.stats}>DEPTH {Math.floor(hud.depth)}m · {hud.zone}<br />SCORE {Math.floor(hud.score)} · PEARLS {hud.pearls}</p>
              <button onClick={() => startGame()} style={{ ...styles.btn, ...styles.btnPrimary }}>DIVE AGAIN</button>
              <div style={styles.row}>
                {Object.keys(DIFFICULTY).map((k) => (
                  <button key={k} onClick={() => pickDifficulty(k)} style={{ ...styles.btn, ...(difficulty === k ? styles.btnActive : {}) }}>
                    {DIFFICULTY[k].label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div style={styles.bar}>
          <span style={styles.barText}>{DIFFICULTY[difficulty].label} · {reduced ? "REDUCED MOTION" : "LIVE"}</span>
          {screen === "playing" && <button onClick={pauseGame} style={styles.smallBtn}>PAUSE</button>}
          {screen === "playing" && <button onClick={() => startGame()} style={styles.smallBtn}>RESTART</button>}
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: "100dvh", background: "#00040a", display: "flex", alignItems: "center", justifyContent: "center", padding: 12, fontFamily: "ui-monospace, Menlo, monospace" },
  shell: { width: "min(480px, 100%)" },
  canvasWrap: { position: "relative", width: "100%", borderRadius: 12, overflow: "hidden", border: "1px solid rgba(0,242,255,0.25)" },
  canvas: { display: "block", width: "100%", touchAction: "none", cursor: "crosshair" },
  overlay: { position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, background: "rgba(0,6,14,0.72)", backdropFilter: "blur(6px)", textAlign: "center", padding: 20 },
  title: { margin: 0, color: "#00f2ff", letterSpacing: 8, fontSize: "clamp(1.6rem, 8vw, 2.6rem)", textShadow: "0 0 24px rgba(0,242,255,0.6)" },
  title2: { margin: 0, color: "#00f2ff", letterSpacing: 6, fontSize: "1.6rem" },
  sub: { color: "#bfe9ff", lineHeight: 1.6, fontSize: "0.95rem", margin: 0 },
  stats: { color: "#bfe9ff", lineHeight: 1.8, fontSize: "0.95rem", margin: 0 },
  hint: { color: "rgba(191,233,255,0.6)", fontSize: "0.8rem", margin: 0 },
  row: { display: "flex", gap: 8 },
  btn: { padding: "12px 18px", fontSize: "0.8rem", cursor: "pointer", background: "transparent", color: "#00f2ff", border: "1px solid rgba(0,242,255,0.6)", fontWeight: "bold", letterSpacing: 2, borderRadius: 6, fontFamily: "inherit" },
  btnActive: { background: "rgba(0,242,255,0.18)" },
  btnPrimary: { background: "#00f2ff", color: "#001318", border: "1px solid #00f2ff" },
  smallBtn: { padding: "6px 12px", fontSize: "0.7rem", cursor: "pointer", background: "transparent", color: "#00f2ff", border: "1px solid rgba(0,242,255,0.4)", letterSpacing: 1, borderRadius: 4, fontFamily: "inherit" },
  bar: { display: "flex", alignItems: "center", gap: 8, marginTop: 10 },
  barText: { color: "rgba(0,242,255,0.6)", fontSize: "0.75rem", letterSpacing: 2, flex: 1 },
};
