"use client";

import { useEffect, useRef, useState } from "react";
import { bandLevels, demoSignal } from "./engine.js";
import { createFieldScene } from "./field3d.js";

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
  const [levels, setLevels] = useState({ bass: 0, mid: 0, treble: 0 });

  const paramsRef = useRef({ count, strength, hueShift, paused });
  useEffect(() => { paramsRef.current = { count, strength, hueShift, paused }; }, [count, strength, hueShift, paused]);

  async function enableMic() {
    setMicError("");
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
    background: "rgba(6,10,24,0.9)", color: "#8ef3ff", border: "1px solid rgba(142,243,255,0.4)",
    borderRadius: 8, padding: "12px 14px", fontSize: 14, cursor: "pointer", fontFamily: "inherit",
  };
  const lbl = { fontSize: 11, letterSpacing: 1.5, color: "#5f7fa6", textTransform: "uppercase" };
  const bar = (v) => ({ height: 6, borderRadius: 3, background: "rgba(142,243,255,0.15)", overflow: "hidden" });

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000208", color: "#cfeaff", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", overflow: "hidden" }}>
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
      <div style={{ position: "absolute", top: 12, left: 12, zIndex: 2, background: "rgba(2,6,16,0.82)", border: "1px solid rgba(142,243,255,0.25)", borderRadius: 10, padding: 12, width: 250 }}>
        <div style={{ fontSize: 13, letterSpacing: 2, color: "#8ef3ff" }}>CONVERGENCE</div>
        <div style={{ color: "#5f7fa6", fontSize: 11, margin: "4px 0 8px" }}>
          audio-reactive field · audio stays on this device
        </div>
        {[["BASS", levels.bass, "#ff5f9e"], ["MID", levels.mid, "#8ef3ff"], ["TREBLE", levels.treble, "#c99aff"]].map(([n, v, c]) => (
          <div key={n} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
            <span style={{ ...lbl, width: 52 }}>{n}</span>
            <div style={{ ...bar(), flex: 1 }}>
              <div style={{ width: `${Math.round(v * 100)}%`, height: "100%", background: c }} />
            </div>
          </div>
        ))}
        {micError && <div style={{ color: "#ff8a8a", fontSize: 11, marginTop: 8 }}>{micError}</div>}
      </div>
      <div style={{ position: "absolute", left: 12, right: 12, bottom: 12, zIndex: 2, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "stretch" }}>
        <button style={btn} onClick={enableMic} disabled={mode === "mic"}>{mode === "mic" ? "MIC LIVE" : "USE MIC"}</button>
        <button style={btn} onClick={useDemo} disabled={mode === "demo"}>DEMO SIGNAL</button>
        <button style={btn} onClick={() => setPaused(!paused)}>{paused ? "Resume" : "Pause"}</button>
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
