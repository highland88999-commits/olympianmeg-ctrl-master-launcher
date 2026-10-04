"use client";

import { useEffect, useRef, useState } from "react";
import { bandLevels, demoSignal } from "./engine.js";
import { createFieldScene } from "./field3d.js";

const TILE = "/images/apollo-shared/apollo-panel-tile.webp";
const BG = "/images/convergence/convergence-bg.webp";

// Inline SVG glyph system (zero image weight) — APOLLO amber/gold treatment.
const Ic = ({ children }) => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    style={{ flex: "none" }}>
    {children}
  </svg>
);
const IconMic = () => (<Ic><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></Ic>);
const IconWave = () => (<Ic><path d="M3 12h2l2-6 3 12 3-9 2 3h2l1-2 1 2h2" /></Ic>);
const IconPause = () => (<Ic><path d="M9 5v14M15 5v14" /></Ic>);
const IconPlay = () => (<Ic><path d="M8 5v14l11-7z" fill="currentColor" stroke="none" /></Ic>);
const IconSpin = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#e8b93c" strokeWidth="3"
    strokeLinecap="round" aria-hidden="true" style={{ animation: "cvspin 0.9s linear infinite", flex: "none" }}>
    <path d="M12 3a9 9 0 1 0 9 9" />
  </svg>
);

/**
 * Convergence — audio-reactive particle field.
 * Mic is processed locally (Web Audio API), never sent anywhere.
 * Demo mode synthesizes a deterministic signal. Zero network.
 */
export default function ConvergencePage() {
  const canvasRef = useRef(null);
  const audioRef = useRef({ ctx: null, analyser: null, data: null, mode: "demo", stream: null });
  const [mode, setMode] = useState("demo");
  const [count, setCount] = useState(700);
  const [strength, setStrength] = useState(1);
  const [hueShift, setHueShift] = useState(190);
  const [paused, setPaused] = useState(false);
  const [micError, setMicError] = useState("");
  const [micLoading, setMicLoading] = useState(false); // styled loading state while the mic wakes
  const [levels, setLevels] = useState({ bass: 0, mid: 0, treble: 0 });

  const paramsRef = useRef({ count, strength, hueShift, paused });
  useEffect(() => { paramsRef.current = { count, strength, hueShift, paused }; }, [count, strength, hueShift, paused]);

  async function enableMic() {
    setMicError("");
    setMicLoading(true);
    try {
      const A = audioRef.current;
      if (!A.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        A.ctx = new AC();
        A.analyser = A.ctx.createAnalyser();
        A.analyser.fftSize = 256;
        A.data = new Uint8Array(A.analyser.frequencyBinCount);
      }
      if (A.ctx.state === "suspended") await A.ctx.resume();
      if (!A.stream) {
        A.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const src = A.ctx.createMediaStreamSource(A.stream);
        src.connect(A.analyser);
      }
      A.mode = "mic";
      setMode("mic");
    } catch (e) {
      setMicError("Microphone unavailable — staying on demo signal.");
    } finally {
      setMicLoading(false);
    }
  }

  function useDemo() {
    audioRef.current.mode = "demo";
    setMode("demo");
  }

  useEffect(() => {
    document.title = "Convergence";
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // 3D audio-reactive field. The page keeps owning audio + controls.
    const field = createFieldScene(canvas, { reducedMotion: reduced });
    // Fixed sample under reduced motion: the field holds one still frame
    // instead of pulsing with the demo signal or the microphone.
    const stillLevels = bandLevels(demoSignal(2.5, 128));

    function resize() {
      const r = canvas.getBoundingClientRect();
      field.resize(Math.max(1, Math.floor(r.width)), Math.max(1, Math.floor(r.height)));
    }
    resize();
    window.addEventListener("resize", resize);

    let running = true;
    let last = performance.now();
    let t = 0;
    let lastLvlT = 0;

    function currentLevels(now) {
      const A = audioRef.current;
      if (A.mode === "mic" && A.analyser) {
        A.analyser.getByteFrequencyData(A.data);
        return bandLevels(A.data);
      }
      t = now / 1000;
      return bandLevels(demoSignal(t, 128));
    }

    function frame(now) {
      if (!running) return;
      const dt = reduced ? 0 : Math.min(0.05, (now - last) / 1000);
      last = now;
      const p = paramsRef.current;
      field.setParams({ count: p.count, strength: p.strength, hueShift: p.hueShift, paused: p.paused });
      const lv = reduced ? stillLevels : currentLevels(now);
      field.setState(lv, p.paused ? 0 : dt, reduced ? 0 : now);
      field.render();

      if (now - lastLvlT > 300) {
        lastLvlT = now;
        setLevels({ bass: lv.bass, mid: lv.mid, treble: lv.treble });
      }
      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);

    return () => {
      running = false;
      field.dispose();
      window.removeEventListener("resize", resize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const btn = {
    backgroundColor: "rgba(6,10,24,0.9)", backgroundImage: `url(${TILE})`, backgroundSize: "256px",
    color: "#f3d98b", border: "1px solid rgba(232,185,60,0.4)",
    borderRadius: 8, padding: "12px 14px", fontSize: 14, cursor: "pointer", fontFamily: "inherit",
    display: "inline-flex", alignItems: "center", gap: 8,
  };
  const lbl = { fontSize: 11, letterSpacing: 1.5, color: "#8a7a4e", textTransform: "uppercase" };
  const bar = (v) => ({ height: 6, borderRadius: 3, background: "rgba(232,185,60,0.15)", overflow: "hidden" });
  const hudPanel = {
    position: "absolute", top: 12, left: 12, zIndex: 2,
    backgroundColor: "rgba(8,6,2,0.85)", backgroundImage: `url(${TILE})`, backgroundSize: "256px",
    border: "1px solid rgba(232,185,60,0.3)", borderRadius: 10, padding: 12, width: 250,
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000208", color: "#cfeaff", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", overflow: "hidden" }}>
      {/* Page background art: bed behind the reactive canvas, visible at the edges while it boots. */}
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, backgroundImage: `url(${BG})`, backgroundSize: "cover", backgroundPosition: "center", opacity: 0.5 }} />
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
      <style>{`@keyframes cvspin { to { transform: rotate(360deg); } }`}</style>
      <div style={hudPanel}>
        <div style={{ fontSize: 13, letterSpacing: 2, color: "#f3d98b" }}>CONVERGENCE</div>
        <div style={{ color: "#8a7a4e", fontSize: 11, margin: "4px 0 8px" }}>
          audio-reactive field · audio stays on this device
        </div>
        {[["BASS", levels.bass, "#e8b93c"], ["MID", levels.mid, "#f3d98b"], ["TREBLE", levels.treble, "#7fe0d0"]].map(([n, v, c]) => (
          <div key={n} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
            <span style={{ ...lbl, width: 52 }}>{n}</span>
            <div style={{ ...bar(), flex: 1 }}>
              <div style={{ width: `${Math.round(v * 100)}%`, height: "100%", background: c }} />
            </div>
          </div>
        ))}
        {micLoading && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#e8b93c", fontSize: 11, marginTop: 8 }} role="status">
            <IconSpin /> OPENING THE MICROPHONE…
          </div>
        )}
        {micError && <div style={{ color: "#ff8a8a", fontSize: 11, marginTop: 8 }}>{micError}</div>}
      </div>
      <div style={{ position: "absolute", left: 12, right: 12, bottom: "max(12px, env(safe-area-inset-bottom))", zIndex: 2, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "stretch" }}>
        <button style={btn} onClick={enableMic} disabled={mode === "mic" || micLoading}>
          <IconMic />{mode === "mic" ? "MIC LIVE" : micLoading ? "LISTENING…" : "USE MIC"}
        </button>
        <button style={btn} onClick={useDemo} disabled={mode === "demo"}><IconWave />DEMO SIGNAL</button>
        <button style={btn} onClick={() => setPaused(!paused)}>{paused ? <IconPlay /> : <IconPause />}{paused ? "Resume" : "Pause"}</button>
        <div style={{ ...btn, display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 180 }}>
          <span style={lbl}>Particles</span>
          <input type="range" min={100} max={2000} step={50} value={count} style={{ flex: 1 }} aria-label="Particle count"
            onChange={(e) => setCount(Number(e.target.value))} />
        </div>
        <div style={{ ...btn, display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 180 }}>
          <span style={lbl}>Force</span>
          <input type="range" min={0.2} max={2.5} step={0.05} value={strength} style={{ flex: 1 }} aria-label="Field strength"
            onChange={(e) => setStrength(Number(e.target.value))} />
        </div>
        <div style={{ ...btn, display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 180 }}>
          <span style={lbl}>Hue</span>
          <input type="range" min={0} max={360} step={1} value={hueShift} style={{ flex: 1 }} aria-label="Hue shift"
            onChange={(e) => setHueShift(Number(e.target.value))} />
        </div>
      </div>
    </div>
  );
}
