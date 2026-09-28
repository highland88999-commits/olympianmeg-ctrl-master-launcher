"use client";

import { useEffect, useRef, useState } from "react";
import {
  makeParticles,
  stageFor,
  formatYears,
  yearsAfterBang,
  expansionFactor,
  particlePos,
  starColor,
  starBrightness,
  PLANETS,
  planetAngle,
} from "./cosmos";

/**
 * The Big Bang — a scrubbable history of the universe, rebuilt.
 * Drag the timeline from the first instant to the present: the flash,
 * the dark ages, first starlight, galaxies, and finally our solar system.
 * All particles are seeded and local; the ambient drone is synthesized
 * live in your browser — nothing is downloaded or uploaded.
 */
const SPEEDS = [0.5, 1, 2, 4];

export default function BigBangPage() {
  const canvasRef = useRef(null);
  const stageNameRef = useRef(null);
  const yearsRef = useRef(null);
  const blurbRef = useRef(null);
  const scrubRef = useRef(null);
  const [ui, setUi] = useState({ playing: false, sound: false, speedIdx: 1 });
  const uiRef = useRef(ui);
  uiRef.current = ui;

  useEffect(() => {
    document.title = "The Big Bang";
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const particles = makeParticles(20260927, 650);
    const st = { t: 0.0 };
    const audio = { ctx: null, nodes: null };

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

    function smooth(a, b, x) {
      const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
      return k * k * (3 - 2 * k);
    }

    function draw(now) {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const t = st.t;
      const time = now / 1000;
      ctx.fillStyle = "#010102";
      ctx.fillRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const R = Math.min(w, h) * 0.44;
      const tiltX = 0.5;

      // galaxy-stage swirl (skipped under reduced motion)
      const stage = stageFor(t);
      const swirlW =
        stage.id === "galaxies" ? 1 : stage.id === "stars" ? 0.3 : stage.id === "solar" || stage.id === "present" ? 0.15 : 0;
      const swirl = reduced ? 0 : t * 2.4 * swirlW;

      // the flash: brilliant point at the very beginning
      if (t < 0.03) {
        const k = 1 - t / 0.03;
        const fr = R * (0.15 + expansionFactor(Math.max(t, 0.0005)) * 2);
        const fg = ctx.createRadialGradient(cx, cy, 1, cx, cy, fr);
        fg.addColorStop(0, `rgba(255,255,255,${0.95 * k + 0.05})`);
        fg.addColorStop(0.4, `rgba(255,240,220,${0.5 * k})`);
        fg.addColorStop(1, "rgba(255,240,220,0)");
        ctx.fillStyle = fg;
        ctx.fillRect(cx - fr, cy - fr, fr * 2, fr * 2);
      }

      // starfield particles
      const cosS = Math.cos(swirl);
      const sinS = Math.sin(swirl);
      const solarBlend = smooth(0.86, 0.96, t);
      if (solarBlend < 1) {
        for (const p of particles) {
          const b = starBrightness(p, t);
          if (b <= 0.01) continue;
          const pos = particlePos(p, t, R, tiltX);
          // swirl rotation in the view plane
          const x = pos.x * cosS - pos.y * sinS;
          const y = pos.x * sinS + pos.y * cosS;
          const [r, g, bl] = starColor(p, t);
          const a = Math.min(1, b) * (1 - solarBlend);
          if (a <= 0.02) continue;
          ctx.fillStyle = `rgba(${r},${g},${bl},${a.toFixed(3)})`;
          const s = p.size * (0.7 + pos.z / (R + 1) * 0.6);
          ctx.beginPath();
          ctx.arc(cx + x, cy + y, Math.max(0.4, s), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // solar system crossfade
      if (solarBlend > 0) {
        const u = Math.min(1, (t - 0.86) / 0.14);
        const sr = R * 0.9 * solarBlend;
        ctx.save();
        ctx.globalAlpha = solarBlend;
        // sun (localized glow)
        const sg = ctx.createRadialGradient(cx, cy, 2, cx, cy, 34);
        sg.addColorStop(0, "#fff8e8");
        sg.addColorStop(0.35, "#ffd76e");
        sg.addColorStop(1, "rgba(255,160,60,0)");
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.arc(cx, cy, 34, 0, Math.PI * 2);
        ctx.fill();
        // orbits + planets
        for (const pl of PLANETS) {
          const or = pl.radius * sr;
          ctx.strokeStyle = "rgba(160,180,220,0.28)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(cx, cy, or, 0, Math.PI * 2);
          ctx.stroke();
          const ang = planetAngle(pl, u, pl.radius * 40);
          const pxp = cx + Math.cos(ang) * or;
          const pyp = cy + Math.sin(ang) * or * 0.92;
          ctx.fillStyle = pl.color;
          ctx.beginPath();
          ctx.arc(pxp, pyp, pl.size, 0, Math.PI * 2);
          ctx.fill();
          if (pl.ring) {
            ctx.strokeStyle = "rgba(232,216,168,0.7)";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.ellipse(pxp, pyp, pl.size * 1.9, pl.size * 0.7, -0.4, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        ctx.restore();
      }

      // HUD text
      const years = yearsAfterBang(t);
      if (stageNameRef.current) {
        const label = `${stage.name} — ${formatYears(years)} after the bang`;
        if (stageNameRef.current.textContent !== label) stageNameRef.current.textContent = label;
      }
      if (blurbRef.current && blurbRef.current.textContent !== stage.blurb) {
        blurbRef.current.textContent = stage.blurb;
      }
      if (yearsRef.current) {
        const pct = `${Math.round(t * 100)}% of cosmic history`;
        if (yearsRef.current.textContent !== pct) yearsRef.current.textContent = pct;
      }
      if (scrubRef.current && document.activeElement !== scrubRef.current) {
        scrubRef.current.value = String(Math.round(t * 1000));
      }
    }

    // ambient drone, synthesized locally, started by the user's toggle
    function setSound(on) {
      if (on && !audio.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        const ac = new AC();
        const master = ac.createGain();
        master.gain.value = 0.0;
        master.connect(ac.destination);
        const filter = ac.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 220;
        filter.connect(master);
        const o1 = ac.createOscillator();
        o1.type = "sine";
        o1.frequency.value = 48;
        const o2 = ac.createOscillator();
        o2.type = "triangle";
        o2.frequency.value = 96.7;
        const g2 = ac.createGain();
        g2.gain.value = 0.25;
        o1.connect(filter);
        o2.connect(g2);
        g2.connect(filter);
        o1.start();
        o2.start();
        master.gain.linearRampToValueAtTime(0.16, ac.currentTime + 2);
        audio.ctx = ac;
        audio.nodes = { master, filter, o1, o2 };
      } else if (!on && audio.ctx) {
        const { master } = audio.nodes;
        master.gain.linearRampToValueAtTime(0.0001, audio.ctx.currentTime + 0.6);
        const ac = audio.ctx;
        setTimeout(() => {
          audio.nodes.o1.stop();
          audio.nodes.o2.stop();
          ac.close();
        }, 700);
        audio.ctx = null;
        audio.nodes = null;
      }
      // swell the drone with the expansion while it plays
      if (audio.nodes) {
        const swell = 0.1 + 0.12 * expansionFactor(st.t);
        audio.nodes.master.gain.setTargetAtTime(swell, audio.ctx.currentTime, 0.5);
      }
    }

    let raf = 0;
    let last = performance.now();
    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const U = uiRef.current;
      if (U.playing) {
        st.t += (dt / 75) * SPEEDS[U.speedIdx]; // full timeline ≈ 75s at 1x
        if (st.t >= 1) {
          st.t = 1;
          setUi({ ...U, playing: false });
        }
      }
      if (U.sound !== (audio.ctx !== null)) setSound(U.sound);
      else if (audio.nodes) {
        const swell = 0.1 + 0.12 * expansionFactor(st.t);
        audio.nodes.master.gain.setTargetAtTime(swell, audio.ctx.currentTime, 0.5);
      }
      draw(now);
      raf = requestAnimationFrame(frame);
    }

    window.bigbang = {
      scrub: (v) => {
        st.t = Math.max(0, Math.min(1, v));
      },
      replay: () => {
        st.t = 0;
        setUi({ ...uiRef.current, playing: true });
      },
    };

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      if (audio.ctx) {
        try {
          audio.nodes.o1.stop();
          audio.nodes.o2.stop();
          audio.ctx.close();
        } catch (_) {}
      }
      delete window.bigbang;
    };
  }, []);

  function togglePlay() {
    if (uiRef.current.t >= 1) window.bigbang && window.bigbang.scrub(0);
    setUi({ ...ui, playing: !ui.playing });
  }

  return (
    <div style={styles.page}>
      <canvas ref={canvasRef} style={styles.canvas} />
      <div style={styles.top}>
        <h1 style={styles.title}>The Big Bang</h1>
        <div ref={stageNameRef} style={styles.stage}>The First Flash</div>
        <div ref={yearsRef} style={styles.years}>0% of cosmic history</div>
        <p ref={blurbRef} style={styles.blurb}>Everything there is, smaller than an atom.</p>
      </div>
      <div style={styles.dock}>
        <button style={styles.btn} onClick={togglePlay} aria-label={ui.playing ? "Pause" : "Play"}>
          {ui.playing ? "Pause" : "Play"}
        </button>
        <button style={styles.btn} onClick={() => window.bigbang && window.bigbang.replay()}>
          Replay the bang
        </button>
        <input
          ref={scrubRef}
          type="range" min="0" max="1000" defaultValue="0"
          onChange={(e) => window.bigbang && window.bigbang.scrub(parseInt(e.target.value, 10) / 1000)}
          style={styles.scrub}
          aria-label="Scrub through cosmic time"
        />
        <button style={styles.btn} onClick={() => setUi({ ...ui, speedIdx: (ui.speedIdx + 1) % SPEEDS.length })}>
          {SPEEDS[ui.speedIdx]}×
        </button>
        <button style={styles.btn} onClick={() => setUi({ ...ui, sound: !ui.sound })}>
          Drone: {ui.sound ? "on" : "off"}
        </button>
      </div>
    </div>
  );
}

const styles = {
  page: { position: "fixed", inset: 0, background: "#010102", color: "#fff", overflow: "hidden", fontFamily: "system-ui, -apple-system, sans-serif", userSelect: "none" },
  canvas: { position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" },
  top: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 5, padding: "18px 22px", pointerEvents: "none", background: "linear-gradient(to bottom, rgba(0,0,0,.55), transparent)" },
  title: { margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: 4, textTransform: "uppercase", color: "#ffe9c4" },
  stage: { marginTop: 6, fontSize: 17, fontWeight: 700, color: "#ffd76e" },
  years: { fontSize: 13, opacity: 0.75, marginTop: 2 },
  blurb: { fontSize: 14, opacity: 0.85, maxWidth: 620, lineHeight: 1.5, margin: "8px 0 0" },
  dock: { position: "absolute", left: 12, right: 12, bottom: 12, zIndex: 5, display: "flex", gap: 10, alignItems: "center", background: "rgba(10,8,4,.72)", border: "1px solid rgba(255,215,110,.25)", borderRadius: 14, padding: "10px 14px", backdropFilter: "blur(8px)", flexWrap: "wrap" },
  btn: { background: "rgba(255,255,255,.08)", color: "#fff", border: "1px solid rgba(255,255,255,.25)", borderRadius: 8, padding: "8px 12px", fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" },
  scrub: { flex: 1, minWidth: 140, accentColor: "#ffd76e" },
};
