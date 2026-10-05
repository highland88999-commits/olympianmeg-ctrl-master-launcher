"use client";

import { IcWave, IcDive, IcPlay, IcPause, IcRefresh } from "@/app/artemis-ui/icons";

import { useEffect, useRef, useState, useCallback } from "react";
import { createGame, stepGame, resetGame, DIFFICULTY, depthZone, WORLD } from "./engine";
import { createDiveScene } from "./dive3d";

/**
 * Abyssal Voyage — an endless deep-sea dive, now in 3D.
 * Steer a submersible through rock gates, collect pearls, survive the trench.
 * Game logic is pure and unchanged (engine.js); the renderer is three.js.
 * All art is procedural; zero external requests.
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

    // 3D trench renderer. Game logic (engine.js) is untouched; the HUD that
    // used to be painted on the 2D canvas now lives in HTML overlays below.
    const dive = createDiveScene(canvas, { reducedMotion: reduced });

    function resize() {
      const r = canvas.getBoundingClientRect();
      dive.resize(Math.max(1, Math.floor(r.width)), Math.max(1, Math.floor(r.height)));
    }
    resize();
    window.addEventListener("resize", resize);

    const toWorldX = (clientX) => {
      const r = canvas.getBoundingClientRect();
      return ((clientX - r.left) / r.width) * WORLD.width;
    };

    const onPointer = (e) => {
      const g = gameRef.current;
      if (!g || g.phase !== "playing") return;
      inputRef.current.targetX = toWorldX(e.clientX);
    };
    const onKeyDown = (e) => {
      if (e.key === "ArrowLeft" || e.key === "a") { inputRef.current.left = true; inputRef.current.keyboardAxis = -1; }
      if (e.key === "ArrowRight" || e.key === "d") { inputRef.current.right = true; inputRef.current.keyboardAxis = 1; }
      if (e.code === "Space") { e.preventDefault(); pauseGame(); }
    };
    const onKeyUp = (e) => {
      if (e.key === "ArrowLeft" || e.key === "a") { inputRef.current.left = false; inputRef.current.keyboardAxis = inputRef.current.right ? 1 : 0; }
      if (e.key === "ArrowRight" || e.key === "d") { inputRef.current.right = false; inputRef.current.keyboardAxis = inputRef.current.left ? 1 : 0; }
    };

    canvas.addEventListener("pointermove", onPointer);
    canvas.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    let last = performance.now();
    let raf = 0;
    let hudTick = 0;

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
      dive.render(g, reduced ? 0 : dt, now);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      dive.dispose();
      canvas.removeEventListener("pointermove", onPointer);
      canvas.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("resize", resize);
    };
  }, [reduced, pauseGame]);

  const pickDifficulty = (k) => {
    setDifficulty(k);
    if (screen !== "title") startGame(k);
  };

  return (
    <div style={styles.page}>
      <div aria-hidden="true" style={styles.bgLayer} />
      <div style={styles.shell}>
        <div style={styles.canvasWrap}>
          <canvas ref={canvasRef} style={styles.canvas} aria-label="Abyssal Voyage 3D dive" />
          {(screen === "playing" || screen === "paused") && (
            <div style={styles.hud} aria-hidden="true">
              <div style={styles.hudTop}>
                <div>
                  <div style={styles.hudDepth}>DEPTH {Math.floor(hud.depth)}m</div>
                  <div style={styles.hudZone}>{hud.zone}</div>
                </div>
                <div style={styles.hullWrap}>
                  <div style={styles.hullBar}>
                    <div
                      style={{
                        ...styles.hullFill,
                        width: `${Math.max(0, Math.min(100, hud.hull))}%`,
                        background: hud.hull > 50 ? "#00f2ff" : hud.hull > 25 ? "#ffb300" : "#ff3355",
                      }}
                    />
                  </div>
                  <div style={styles.hullText}>HULL {Math.ceil(hud.hull)}%</div>
                </div>
              </div>
              <div style={styles.hudBottom}>
                <span>SCORE {Math.floor(hud.score)}</span>
                <span style={styles.pearls}>◈ {hud.pearls}</span>
              </div>
            </div>
          )}
          {screen === "title" && (
            <div style={styles.overlay}>
              <h1 style={styles.title}>DEEP-SEA DIVE</h1>
              <p style={styles.sub}>Descend the trench. Thread the rock gates.<br />Gather pearls to patch your hull.</p>
              <div style={styles.row}>
                {Object.keys(DIFFICULTY).map((k) => (
                  <button key={k} onClick={() => pickDifficulty(k)} style={{ ...styles.btn, ...(difficulty === k ? styles.btnActive : {}) }} aria-pressed={difficulty === k}>
                    <IcWave /><span>{DIFFICULTY[k].label}</span>
                  </button>
                ))}
              </div>
              <button onClick={() => startGame()} style={{ ...styles.btn, ...styles.btnPrimary }}><IcDive /><span>DIVE</span></button>
              <p style={styles.hint}>Drag / arrow keys to steer · Space to pause</p>
            </div>
          )}
          {screen === "paused" && (
            <div style={styles.overlay}>
              <h2 style={styles.title2}>PAUSED</h2>
              <button onClick={pauseGame} style={{ ...styles.btn, ...styles.btnPrimary }}><IcPlay /><span>RESUME</span></button>
              <button onClick={() => startGame()} style={styles.btn}><IcRefresh /><span>RESTART</span></button>
            </div>
          )}
          {screen === "over" && (
            <div style={styles.overlay}>
              <h2 style={styles.title2}>{hud.cause || "LOST"}</h2>
              <p style={styles.stats}>DEPTH {Math.floor(hud.depth)}m · {hud.zone}<br />SCORE {Math.floor(hud.score)} · PEARLS {hud.pearls}</p>
              <button onClick={() => startGame()} style={{ ...styles.btn, ...styles.btnPrimary }}><IcDive /><span>DIVE AGAIN</span></button>
              <div style={styles.row}>
                {Object.keys(DIFFICULTY).map((k) => (
                  <button key={k} onClick={() => pickDifficulty(k)} style={{ ...styles.btn, ...(difficulty === k ? styles.btnActive : {}) }} aria-pressed={difficulty === k}>
                    <IcWave /><span>{DIFFICULTY[k].label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div style={styles.bar}>
          <span style={styles.barText}>{DIFFICULTY[difficulty].label} · {reduced ? "REDUCED MOTION" : "LIVE"}</span>
          {screen === "playing" && <button onClick={pauseGame} style={styles.smallBtn}><IcPause /><span>PAUSE</span></button>}
          {screen === "playing" && <button onClick={() => startGame()} style={styles.smallBtn}><IcRefresh /><span>RESTART</span></button>}
        </div>
        <div aria-hidden="true" style={{ height: "calc(4.5rem + env(safe-area-inset-bottom))" }} />
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: "100dvh", background: "#00040a", display: "flex", alignItems: "center", justifyContent: "center", padding: 12, overflowY: "auto", fontFamily: "ui-monospace, Menlo, monospace", position: "relative" },
  bgLayer: { position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", opacity: 0.4,
    backgroundImage: "linear-gradient(to bottom, rgba(0,4,10,0.55), rgba(0,4,10,0.2) 45%, rgba(0,4,10,0.75)), url(/images/abyssal-voyage/bg.webp)",
    backgroundSize: "cover", backgroundPosition: "center" },
  shell: { width: "min(480px, 100%)", position: "relative", zIndex: 1 },
  canvasWrap: { position: "relative", width: "100%", aspectRatio: "720 / 960", borderRadius: 12, overflow: "hidden", border: "1px solid rgba(0,242,255,0.25)" },
  canvas: { display: "block", width: "100%", height: "100%", touchAction: "none", cursor: "crosshair" },
  hud: { position: "absolute", inset: 0, pointerEvents: "none", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 14 },
  hudTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  hudDepth: { color: "rgba(0,242,255,0.9)", fontWeight: 600, fontSize: 20 },
  hudZone: { color: "rgba(0,242,255,0.55)", fontSize: 14, marginTop: 4 },
  hullWrap: { textAlign: "right" },
  hullBar: { width: 170, height: 12, background: "rgba(255,255,255,0.12)", borderRadius: 3, overflow: "hidden" },
  hullFill: { height: "100%" },
  hullText: { color: "rgba(255,255,255,0.75)", fontWeight: 600, fontSize: 13, marginTop: 4 },
  hudBottom: { display: "flex", justifyContent: "space-between", color: "rgba(255,255,255,0.85)", fontWeight: 600, fontSize: 18 },
  pearls: { color: "rgba(255,215,130,0.9)" },
  overlay: { position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14,
    backgroundImage: "linear-gradient(rgba(0,6,14,0.7), rgba(0,6,14,0.7)), url(/images/abyssal-voyage/tile.webp)", backgroundSize: "auto, 170px",
    backdropFilter: "blur(6px)", textAlign: "center", padding: 20 },
  title: { margin: 0, color: "#00f2ff", letterSpacing: 8, fontSize: "clamp(1.6rem, 8vw, 2.6rem)", textShadow: "0 0 24px rgba(0,242,255,0.6)" },
  title2: { margin: 0, color: "#00f2ff", letterSpacing: 6, fontSize: "1.6rem" },
  sub: { color: "#bfe9ff", lineHeight: 1.6, fontSize: "0.95rem", margin: 0 },
  stats: { color: "#bfe9ff", lineHeight: 1.8, fontSize: "0.95rem", margin: 0 },
  hint: { color: "rgba(191,233,255,0.6)", fontSize: "0.8rem", margin: 0 },
  row: { display: "flex", gap: 8 },
  btn: { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px 18px", fontSize: "0.8rem", cursor: "pointer", background: "transparent", color: "#00f2ff", border: "1px solid rgba(0,242,255,0.6)", fontWeight: "bold", letterSpacing: 2, borderRadius: 6, fontFamily: "inherit" },
  btnActive: { background: "rgba(0,242,255,0.18)" },
  btnPrimary: { background: "#00f2ff", color: "#001318", border: "1px solid #00f2ff" },
  smallBtn: { display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", fontSize: "0.7rem", cursor: "pointer", background: "transparent", color: "#00f2ff", border: "1px solid rgba(0,242,255,0.4)", letterSpacing: 1, borderRadius: 4, fontFamily: "inherit" },
  bar: { display: "flex", alignItems: "center", gap: 8, marginTop: 10, padding: "8px 10px", borderRadius: 8,
    backgroundImage: "linear-gradient(rgba(0,10,16,0.8), rgba(0,10,16,0.8)), url(/images/abyssal-voyage/tile.webp)", backgroundSize: "auto, 150px",
    border: "1px solid rgba(0,242,255,0.15)" },
  barText: { color: "rgba(0,242,255,0.6)", fontSize: "0.75rem", letterSpacing: 2, flex: 1 },
};
