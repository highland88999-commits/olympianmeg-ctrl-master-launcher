"use client";

import { useEffect, useRef, useState } from "react";
import {
  stageFor,
  formatYears,
  yearsAfterBang,
  expansionFactor,
} from "./cosmos";
import { createUniverseScene } from "./universe3d";
import { IcPlay, IcPause, IcReplay, IcGauge, IcSpeaker } from "@/app/artemis-ui/icons";

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
  const [reduced, setReduced] = useState(false); // static scrub-only exhibit when true
  const [ui, setUi] = useState({ playing: false, sound: false, speedIdx: 1 });
  const uiRef = useRef(ui);
  uiRef.current = ui;

  useEffect(() => {
    document.title = "The Big Bang";
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setReduced(reduced);

    // 3D universe; the page keeps owning the timeline, HUD, and audio.
    const universe = createUniverseScene(canvas, { reducedMotion: reduced });
    const st = { t: 0.0 };
    const audio = { ctx: null, nodes: null };

    function resize() {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      universe.resize(Math.max(1, w), Math.max(1, h));
    }
    resize();
    window.addEventListener("resize", resize);

    function draw(now) {
      const t = st.t;
      universe.setTime(t, reduced ? 0 : 1 / 60);
      universe.render();

      // HUD text
      const years = yearsAfterBang(t);
      const stage = stageFor(t);
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
      // Reduced motion: static scrub-only fallback — the timeline never
      // auto-plays; the visitor moves through cosmic history by scrubbing.
      if (U.playing && !reduced) {
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
      universe.dispose();
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
    // Under reduced motion the exhibit is scrub-only; Play stays parked.
    if (uiRef.current.t >= 1) window.bigbang && window.bigbang.scrub(0);
    if (uiRef.current.playing) setUi({ ...ui, playing: false });
    else if (!reduced) setUi({ ...ui, playing: true });
  }

  return (
    <>
    <div style={styles.page}>
      <div aria-hidden="true" style={styles.bgLayer} />
      <canvas ref={canvasRef} style={styles.canvas} />
      <div style={styles.top}>
        <h1 style={styles.title}>The Cosmic Timeline</h1>
        <div ref={stageNameRef} style={styles.stage}>The First Flash</div>
        <div ref={yearsRef} style={styles.years}>0% of cosmic history</div>
        <p ref={blurbRef} style={styles.blurb}>Everything there is, smaller than an atom.</p>
      </div>
      <div style={styles.dock}>
        <button style={styles.btn} onClick={togglePlay} aria-label={ui.playing ? "Pause" : "Play"}
          disabled={reduced} title={reduced ? "Scrub the timeline instead — motion is reduced" : undefined}>
          {ui.playing ? <IcPause /> : <IcPlay />}<span>{ui.playing ? "Pause" : "Play"}</span>
        </button>
        <button style={styles.btn} onClick={() => window.bigbang && window.bigbang.replay()}
          disabled={reduced} title={reduced ? "Scrub the timeline instead — motion is reduced" : "Replay the universe"}>
          <IcReplay /><span>Replay the bang</span>
        </button>
        <input
          ref={scrubRef}
          type="range" min="0" max="1000" defaultValue="0"
          onChange={(e) => window.bigbang && window.bigbang.scrub(parseInt(e.target.value, 10) / 1000)}
          style={styles.scrub}
          aria-label="Scrub through cosmic time"
        />
        <button style={styles.btn} onClick={() => setUi({ ...ui, speedIdx: (ui.speedIdx + 1) % SPEEDS.length })} aria-label={`Time speed ${SPEEDS[ui.speedIdx]} times`}>
          <IcGauge /><span>{SPEEDS[ui.speedIdx]}×</span>
        </button>
        <button style={styles.btn} onClick={() => setUi({ ...ui, sound: !ui.sound })} aria-pressed={ui.sound}>
          <IcSpeaker /><span>Drone: {ui.sound ? "on" : "off"}</span>
        </button>
      </div>
    </div>
    {/* Safari bottom-bar clearance: blank space under the fixed cosmic viewport */}
    <div aria-hidden="true" style={{ height: 'calc(4.5rem + env(safe-area-inset-bottom))' }} />
    </>
  );
}

const styles = {
  page: { position: "fixed", inset: 0, background: "#010102", color: "#fff", overflow: "hidden", fontFamily: "system-ui, -apple-system, sans-serif", userSelect: "none" },
  bgLayer: { position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none", opacity: 0.32,
    backgroundImage: "linear-gradient(to bottom, rgba(1,1,2,0.65), rgba(1,1,2,0.2) 50%, rgba(1,1,2,0.7)), url(/images/the-big-bang/bg.webp)",
    backgroundSize: "cover", backgroundPosition: "center" },
  canvas: { position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", zIndex: 1 },
  top: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 5, padding: "18px 22px", pointerEvents: "none", background: "linear-gradient(to bottom, rgba(0,0,0,.55), transparent)" },
  title: { margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: 4, textTransform: "uppercase", color: "#ffe9c4" },
  stage: { marginTop: 6, fontSize: 17, fontWeight: 700, color: "#ffd76e" },
  years: { fontSize: 13, opacity: 0.75, marginTop: 2 },
  blurb: { fontSize: 14, opacity: 0.85, maxWidth: 620, lineHeight: 1.5, margin: "8px 0 0" },
  dock: { position: "absolute", left: 12, right: 12, bottom: "max(12px, env(safe-area-inset-bottom))", zIndex: 5, display: "flex", gap: 10, alignItems: "center", backgroundImage: "linear-gradient(rgba(10,8,4,0.78), rgba(10,8,4,0.78)), url(/images/the-big-bang/tile.webp)", backgroundSize: "auto, 170px", border: "1px solid rgba(255,215,110,0.25)", borderRadius: 14, padding: "10px 14px", backdropFilter: "blur(8px)", flexWrap: "wrap" },
  btn: { display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,.08)", color: "#fff", border: "1px solid rgba(255,255,255,.25)", borderRadius: 8, padding: "8px 12px", fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" },
  scrub: { flex: 1, minWidth: 140, accentColor: "#ffd76e" },
};
