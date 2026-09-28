"use client";

import { useEffect, useRef, useState } from "react";
import {
  rotationPlanes,
  rotateND,
  buildPointCloud,
  projectNDto3D,
  project3Dto2D,
  norm2,
  hexToRgb,
  pointColor,
  analyserEnergy,
  mulberry32,
} from "./hyper";

/**
 * Hyperion Gravitas — an 8th-dimensional point cloud projector, rebuilt.
 * True N-dimensional rotation (4–8 axes) projected down to your screen,
 * with a "sonic core" that can listen to a local audio file or your mic
 * and let the sound bend the shape. All math is local; nothing is uploaded.
 */
const SHAPES = [
  { id: "cube", label: "Hypercube" },
  { id: "cross", label: "Cross-polytope" },
  { id: "shell", label: "Star shell" },
];
const MODES = [
  { id: "tint", label: "Core tint" },
  { id: "rainbow", label: "Spectrum" },
  { id: "pulse", label: "Pulse" },
];

export default function HyperionPage() {
  const canvasRef = useRef(null);
  const statusRef = useRef(null);
  const fileRef = useRef(null);
  const [ui, setUi] = useState({
    dims: 8,
    shape: "cube",
    count: 1200,
    speed: 0.5,
    squash: 0.8,
    mode: "tint",
    tint: "#00f3ff",
    playing: true,
    sonic: "off", // off | file | mic
  });
  const uiRef = useRef(ui);
  uiRef.current = ui;

  useEffect(() => {
    document.title = "Hyperion Gravitas";
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const st = {
      cloud: null,
      planes: [],
      angles: [],
      planeSpeeds: [],
      yaw: 0.7,
      pitch: 0.45,
      energy: 0,
    };
    const sonic = { ctx: null, analyser: null, freq: null, stream: null, source: null };

    function rebuild() {
      const U = uiRef.current;
      st.cloud = buildPointCloud(U.dims, U.shape, U.count, 20260927);
      st.planes = rotationPlanes(U.dims);
      const rand = mulberry32(99);
      st.angles = st.planes.map(() => rand() * Math.PI * 2);
      st.planeSpeeds = st.planes.map(() => 0.25 + rand() * 0.75);
    }
    rebuild();

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

    function sampleSonic() {
      if (!sonic.analyser) return 0;
      sonic.analyser.getByteFrequencyData(sonic.freq);
      return analyserEnergy(sonic.freq);
    }

    function draw() {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const U = uiRef.current;
      ctx.fillStyle = "#030309";
      ctx.fillRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const scale = Math.min(w, h) * 0.32;
      const tintRgb = hexToRgb(U.tint);
      const total = st.cloud.points.length;

      // edges first (under the points)
      if (st.cloud.edges.length > 0) {
        ctx.strokeStyle = "rgba(140,180,255,0.16)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        const cache = new Array(total);
        for (let i = 0; i < total; i++) {
          const p3 = projectNDto3D(st.cloud.points[i], U.squash);
          const q = project3Dto2D(p3, st.yaw, st.pitch);
          cache[i] = [cx + q.x * scale, cy - q.y * scale];
        }
        for (const [a, b] of st.cloud.edges) {
          ctx.moveTo(cache[a][0], cache[a][1]);
          ctx.lineTo(cache[b][0], cache[b][1]);
        }
        ctx.stroke();
        // points
        for (let i = 0; i < total; i++) {
          const r = Math.sqrt(norm2(st.cloud.points[i])) / 2;
          ctx.fillStyle = pointColor(U.mode, tintRgb, i, total, r, st.energy);
          ctx.fillRect(cache[i][0] - 1.25, cache[i][1] - 1.25, 2.5, 2.5);
        }
      } else {
        for (let i = 0; i < total; i++) {
          const p3 = projectNDto3D(st.cloud.points[i], U.squash);
          const q = project3Dto2D(p3, st.yaw, st.pitch);
          const r = Math.sqrt(norm2(st.cloud.points[i])) / 2;
          ctx.fillStyle = pointColor(U.mode, tintRgb, i, total, r, st.energy);
          const s = 1.4 + q.z * 0.8;
          ctx.fillRect(cx + q.x * scale - s / 2, cy - q.y * scale - s / 2, s, s);
        }
      }

      // status line
      if (statusRef.current) {
        const sonicPct = U.sonic !== "off" ? " " + (st.energy * 100).toFixed(0) + "%" : "";
        const txt = `HYPERION // ${U.dims}D ${U.shape.toUpperCase()} // SONIC CORE: ${U.sonic.toUpperCase()}${sonicPct}`;
        if (statusRef.current.textContent !== txt) statusRef.current.textContent = txt;
      }
    }

    let raf = 0;
    let last = performance.now();
    let lastSig = "";
    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const U = uiRef.current;
      const sig = `${U.dims}|${U.shape}|${U.count}`;
      if (sig !== lastSig) {
        rebuild();
        lastSig = sig;
      }
      if (U.playing && !reduced) {
        rotateStep(dt, U.speed);
      }
      const target = sampleSonic();
      st.energy += (target - st.energy) * 0.18;
      draw();
      raf = requestAnimationFrame(frame);
    }

    // rotate incrementally: apply small delta angles each frame
    const deltaAngles = [];
    function rotateStep(dt, speed) {
      for (let i = 0; i < st.planes.length; i++) {
        deltaAngles[i] = dt * speed * 1.4 * st.planeSpeeds[i];
      }
      rotateND(st.cloud.points, st.planes, deltaAngles);
    }

    // drag to orbit the camera
    let dragging = false;
    let lx = 0;
    let ly = 0;
    function onDown(e) {
      dragging = true;
      lx = e.clientX;
      ly = e.clientY;
    }
    function onMove(e) {
      if (!dragging) return;
      st.yaw += (e.clientX - lx) * 0.006;
      st.pitch = Math.max(-1.4, Math.min(1.4, st.pitch + (e.clientY - ly) * 0.005));
      lx = e.clientX;
      ly = e.clientY;
    }
    function onUp() {
      dragging = false;
    }
    canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);

    // sonic core: local audio file or mic, analysed in-browser, never sent anywhere
    async function stopSonic() {
      if (sonic.source) {
        try { sonic.source.stop(); } catch (_) {}
        try { sonic.source.disconnect(); } catch (_) {}
      }
      if (sonic.stream) {
        for (const tr of sonic.stream.getTracks()) tr.stop();
      }
      if (sonic.ctx) {
        try { await sonic.ctx.close(); } catch (_) {}
      }
      sonic.ctx = null;
      sonic.analyser = null;
      sonic.freq = null;
      sonic.stream = null;
      sonic.source = null;
      st.energy = 0;
    }
    async function startSonicFile(file) {
      await stopSonic();
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC || !file) return;
      const ac = new AC();
      const buf = await file.arrayBuffer();
      const audioBuf = await ac.decodeAudioData(buf);
      const src = ac.createBufferSource();
      src.buffer = audioBuf;
      src.loop = true;
      const an = ac.createAnalyser();
      an.fftSize = 256;
      src.connect(an);
      src.start();
      sonic.ctx = ac;
      sonic.analyser = an;
      sonic.freq = new Uint8Array(an.frequencyBinCount);
      sonic.source = src;
    }
    async function startSonicMic() {
      await stopSonic();
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC || !navigator.mediaDevices) return;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ac = new AC();
      const src = ac.createMediaStreamSource(stream);
      const an = ac.createAnalyser();
      an.fftSize = 256;
      src.connect(an);
      sonic.ctx = ac;
      sonic.analyser = an;
      sonic.freq = new Uint8Array(an.frequencyBinCount);
      sonic.stream = stream;
      sonic.source = src;
    }

    window.hyperion = {
      sonicFile: (file) => {
        startSonicFile(file).then(() => setUi({ ...uiRef.current, sonic: "file" }));
      },
      sonicMic: () => {
        startSonicMic()
          .then(() => setUi({ ...uiRef.current, sonic: "mic" }))
          .catch(() => setUi({ ...uiRef.current, sonic: "off" }));
      },
      sonicOff: () => {
        stopSonic().then(() => setUi({ ...uiRef.current, sonic: "off" }));
      },
    };

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointerdown", onDown);
      stopSonic();
      delete window.hyperion;
    };
  }, []);

  function set(key, value) {
    setUi({ ...ui, [key]: value });
  }

  return (
    <div style={styles.page}>
      <canvas ref={canvasRef} style={styles.canvas} />
      <div style={styles.top}>
        <h1 style={styles.title}>Hyperion Gravitas</h1>
        <div ref={statusRef} style={styles.status}>HYPERION</div>
        <div style={styles.hint}>Drag to orbit the camera · The shape truly rotates in {ui.dims} dimensions</div>
      </div>

      <div style={styles.dock}>
        <label style={styles.row}>Dimensions
          <select value={ui.dims} onChange={(e) => set("dims", parseInt(e.target.value, 10))} style={styles.select}>
            {[4, 5, 6, 7, 8].map((d) => <option key={d} value={d}>{d}D</option>)}
          </select>
        </label>
        <label style={styles.row}>Shape
          <select value={ui.shape} onChange={(e) => set("shape", e.target.value)} style={styles.select}>
            {SHAPES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        {ui.shape === "shell" && (
          <label style={styles.row}>Points
            <input type="range" min="200" max="3000" step="100" value={ui.count}
              onChange={(e) => set("count", parseInt(e.target.value, 10))} style={styles.range} />
          </label>
        )}
        <label style={styles.row}>Spin
          <input type="range" min="0" max="1.5" step="0.01" value={ui.speed}
            onChange={(e) => set("speed", parseFloat(e.target.value))} style={styles.range} />
        </label>
        <label style={styles.row}>Depth squash
          <input type="range" min="0" max="1.5" step="0.01" value={ui.squash}
            onChange={(e) => set("squash", parseFloat(e.target.value))} style={styles.range} />
        </label>
        <label style={styles.row}>Color
          <select value={ui.mode} onChange={(e) => set("mode", e.target.value)} style={styles.select}>
            {MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </label>
        {ui.mode === "tint" && (
          <input type="color" value={ui.tint} onChange={(e) => set("tint", e.target.value)}
            style={styles.color} aria-label="Core tint" />
        )}
        <button style={styles.btn} onClick={() => set("playing", !ui.playing)}>
          {ui.playing ? "Pause" : "Play"}
        </button>
      </div>

      <div style={styles.sonic}>
        <span style={styles.sonicLabel}>Sonic core</span>
        <button style={styles.btn} onClick={() => fileRef.current && fileRef.current.click()}>Load audio file</button>
        <input ref={fileRef} type="file" accept="audio/*" style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files && e.target.files[0];
            if (f && window.hyperion) window.hyperion.sonicFile(f);
            e.target.value = "";
          }} />
        <button style={styles.btn} onClick={() => window.hyperion && window.hyperion.sonicMic()}>Use mic</button>
        {ui.sonic !== "off" && (
          <button style={styles.btn} onClick={() => window.hyperion && window.hyperion.sonicOff()}>Stop</button>
        )}
        <span style={styles.sonicNote}>drives the visuals only — nothing is recorded or sent</span>
      </div>
    </div>
  );
}

const styles = {
  page: { position: "fixed", inset: 0, background: "#030309", color: "#fff", overflow: "hidden", fontFamily: "system-ui, -apple-system, sans-serif", userSelect: "none" },
  canvas: { position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", touchAction: "none", cursor: "grab" },
  top: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 5, padding: "16px 20px", pointerEvents: "none", background: "linear-gradient(to bottom, rgba(0,0,0,.6), transparent)" },
  title: { margin: 0, fontSize: 21, fontWeight: 800, letterSpacing: 3, textTransform: "uppercase", color: "#aef4ff" },
  status: { marginTop: 6, fontSize: 13, fontWeight: 600, letterSpacing: 1, color: "#7fd8ec", fontFamily: "ui-monospace, monospace" },
  hint: { marginTop: 4, fontSize: 12, opacity: 0.65 },
  dock: { position: "absolute", left: 12, right: 12, bottom: 64, zIndex: 5, display: "flex", gap: 10, alignItems: "center", justifyContent: "center", flexWrap: "wrap", background: "rgba(6,8,18,.72)", border: "1px solid rgba(0,243,255,.22)", borderRadius: 14, padding: "10px 14px", backdropFilter: "blur(8px)" },
  sonic: { position: "absolute", left: 12, right: 12, bottom: 12, zIndex: 5, display: "flex", gap: 10, alignItems: "center", justifyContent: "center", flexWrap: "wrap" },
  sonicLabel: { fontSize: 12, fontWeight: 700, letterSpacing: 2, color: "#7fd8ec", textTransform: "uppercase" },
  sonicNote: { fontSize: 11, opacity: 0.55 },
  row: { display: "flex", alignItems: "center", gap: 8, fontSize: 13 },
  range: { width: 90, accentColor: "#00f3ff" },
  select: { background: "#0a0f1e", color: "#fff", border: "1px solid rgba(255,255,255,.25)", borderRadius: 6, padding: "6px 8px", fontSize: 13 },
  color: { width: 40, height: 30, border: "1px solid rgba(255,255,255,.3)", borderRadius: 6, background: "none", padding: 2, cursor: "pointer" },
  btn: { background: "rgba(255,255,255,.08)", color: "#fff", border: "1px solid rgba(255,255,255,.25)", borderRadius: 8, padding: "8px 12px", fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" },
};
