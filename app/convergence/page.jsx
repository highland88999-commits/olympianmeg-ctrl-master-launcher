"use client";

import { useEffect, useRef, useState } from "react";
import { bandLevels, demoSignal, makeParticle, stepConvergence } from "./engine.js";

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

  function mulberry(seed) {
    let a = seed >>> 0;
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

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
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(r.width * dpr));
      canvas.height = Math.max(1, Math.floor(r.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);

    const rng = mulberry(20260927);
    let particles = [];
    function buildParticles(n) {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      particles = [];
      for (let i = 0; i < n; i++) particles.push(makeParticle(w, h, rng));
    }
    buildParticles(paramsRef.current.count);

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
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const p = paramsRef.current;
      const w = canvas.clientWidth, h = canvas.clientHeight;

      if (particles.length !== p.count && !reduced) buildParticles(p.count);
      const lv = currentLevels(now);
      if (!p.paused) {
        for (const pt of particles) stepConvergence(pt, lv, w, h, dt, p.strength);
      }

      ctx.fillStyle = "#000208";
      ctx.fillRect(0, 0, w, h);

      // core: brightness follows bass, kept small
      const coreR = 26 + lv.bass * 90;
      const cg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, coreR * 2.4);
      cg.addColorStop(0, `hsla(${p.hueShift},95%,60%,${0.35 + lv.bass * 0.4})`);
      cg.addColorStop(1, `hsla(${p.hueShift},95%,40%,0)`);
      ctx.fillStyle = cg;
      ctx.beginPath(); ctx.arc(w / 2, h / 2, coreR * 2.4, 0, Math.PI * 2); ctx.fill();

      for (const pt of particles) {
        const hue = (p.hueShift + pt.hue * 0.25 + lv.mid * 60) % 360;
        ctx.fillStyle = `hsla(${hue},90%,${45 + lv.treble * 30}%,0.85)`;
        ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2); ctx.fill();
      }

      if (now - lastLvlT > 300) {
        lastLvlT = now;
        setLevels({ bass: lv.bass, mid: lv.mid, treble: lv.treble });
      }
      if (!reduced) requestAnimationFrame(frame);
    }

    if (reduced) {
      buildParticles(paramsRef.current.count);
      frame(performance.now());
    } else {
      requestAnimationFrame(frame);
    }

    return () => {
      running = false;
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
