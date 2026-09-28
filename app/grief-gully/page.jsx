"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import {
  INTRO_LINES,
  RESOURCE_LINKS,
  TRACKS,
  HONEST_NOTE,
  STORAGE_KEYS,
  initialMediaState,
  mediaReducer,
  addEntry,
  removeEntry,
} from "./journey.js";

/* ---------- small seeded rng so the background tree is stable ---------- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function growBranches(rng, branches, x, y, angle, length, depth) {
  if (depth > 7 || length < 6) return;
  const x2 = x + Math.cos(angle) * length;
  const y2 = y + Math.sin(angle) * length;
  branches.push({ x1: x, y1: y, x2, y2, depth });
  const n = 2;
  for (let i = 0; i < n; i += 1) {
    if (rng() > 0.2) {
      growBranches(
        rng,
        branches,
        x2,
        y2,
        angle + (i === 0 ? -1 : 1) * (0.28 + rng() * 0.3),
        length * (0.68 + rng() * 0.12),
        depth + 1
      );
    }
  }
}

/* ---------- generative audio: soft, local, no files ---------- */
function createAudioEngine(character) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  const master = ctx.createGain();
  master.gain.value = 0.14;
  master.connect(ctx.destination);
  const timers = [];
  const nodes = [];

  function tone(freq, start, dur, type = "sine", vol = 0.5) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const t = ctx.currentTime + start;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.1);
    nodes.push(osc, g);
  }

  if (character === "pulse") {
    // low drone + sparse minor-pentatonic plucks
    const drone = ctx.createOscillator();
    const dg = ctx.createGain();
    drone.type = "sine";
    drone.frequency.value = 55;
    dg.gain.value = 0.35;
    drone.connect(dg);
    dg.connect(master);
    drone.start();
    nodes.push(drone, dg);
    const scale = [110, 130.81, 146.83, 164.81, 196, 220];
    let i = 0;
    const pluck = () => {
      tone(scale[i % scale.length], 0, 3.2, "triangle", 0.5);
      tone(scale[(i + 2) % scale.length] * 2, 0.4, 2.6, "sine", 0.22);
      i += 1;
    };
    pluck();
    timers.push(setInterval(pluck, 3400));
  } else if (character === "drift") {
    // warm detuned pads, slow swell
    const pad = (freq, detune) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const lfo = ctx.createOscillator();
      const lfoG = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.detune.value = detune;
      lfo.type = "sine";
      lfo.frequency.value = 0.07;
      lfoG.gain.value = 0.18;
      lfo.connect(lfoG);
      lfoG.connect(g.gain);
      g.gain.value = 0.3;
      osc.connect(g);
      g.connect(master);
      osc.start();
      lfo.start();
      nodes.push(osc, g, lfo, lfoG);
    };
    pad(110, -6);
    pad(164.81, 5);
    pad(220, 3);
    const shimmerNotes = [440, 523.25, 587.33, 659.25];
    let i = 0;
    const shimmer = () => {
      tone(shimmerNotes[i % shimmerNotes.length], 0, 5, "sine", 0.16);
      i += 1;
    };
    shimmer();
    timers.push(setInterval(shimmer, 7000));
  } else {
    // resolve: descending bells, then rest
    const drone = ctx.createOscillator();
    const dg = ctx.createGain();
    drone.type = "sine";
    drone.frequency.value = 110;
    dg.gain.value = 0.22;
    drone.connect(dg);
    dg.connect(master);
    drone.start();
    nodes.push(drone, dg);
    const line = [329.63, 293.66, 261.63, 220, 220];
    let i = 0;
    const bell = () => {
      const f = line[i % line.length];
      tone(f, 0, 4.2, "sine", 0.5);
      tone(f * 2.01, 0, 2.4, "sine", 0.12);
      i += 1;
    };
    bell();
    timers.push(setInterval(bell, 3600));
  }

  return {
    stop() {
      timers.forEach(clearInterval);
      try {
        master.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.8);
      } catch (e) {
        /* already closed */
      }
      setTimeout(() => {
        nodes.forEach((n) => {
          try {
            if (n.stop) n.stop();
            n.disconnect();
          } catch (e) {
            /* noop */
          }
        });
        ctx.close().catch(() => {});
      }, 900);
    },
  };
}

/* ---------- track visual: tiny canvas, calm shapes ---------- */
function TrackVisual({ character, active, reducedMotion }) {
  const ref = useRef(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = (canvas.width = canvas.offsetWidth || 220);
    const H = (canvas.height = 84);
    let raf = 0;
    const t0 = performance.now();

    function draw() {
      const t = (performance.now() - t0) / 1000;
      ctx.clearRect(0, 0, W, H);
      const live = activeRef.current && !reducedMotion;
      const tt = live ? t : 0;
      ctx.globalAlpha = 0.9;
      if (character === "pulse") {
        for (let i = 0; i < 3; i += 1) {
          const phase = (tt * 0.3 + i / 3) % 1;
          const r = 8 + phase * 44;
          ctx.strokeStyle = `rgba(0, 178, 190, ${0.35 * (1 - phase)})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(W / 2, H / 2, r, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = "rgba(0, 200, 210, 0.8)";
        ctx.beginPath();
        ctx.arc(W / 2, H / 2, 4 + (live ? Math.sin(tt * 2) * 1.2 : 0), 0, Math.PI * 2);
        ctx.fill();
      } else if (character === "drift") {
        for (let i = 0; i < 5; i += 1) {
          const x = W * ((i + 0.5) / 5) + (live ? Math.sin(tt * 0.4 + i * 2.1) * 14 : 0);
          const y = H / 2 + (live ? Math.cos(tt * 0.3 + i * 1.7) * 10 : 0);
          const grad = ctx.createRadialGradient(x, y, 0, x, y, 18);
          grad.addColorStop(0, "rgba(150, 190, 210, 0.5)");
          grad.addColorStop(1, "rgba(150, 190, 210, 0)");
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(x, y, 18, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        for (let i = 0; i < 6; i += 1) {
          const progress = live ? (tt * 0.12 + i / 6) % 1 : i / 6;
          const y = 8 + progress * (H - 16);
          const x = W / 2 + Math.sin(progress * Math.PI * 2) * 20 * (1 - progress * 0.5);
          ctx.fillStyle = `rgba(212, 175, 55, ${0.75 * (1 - progress * 0.6)})`;
          ctx.beginPath();
          ctx.arc(x, y, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (live) raf = requestAnimationFrame(draw);
    }
    draw();
    if (!reducedMotion) raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [character, reducedMotion]);

  return <canvas ref={ref} className="track-visual" aria-hidden="true" />;
}

/* ---------- ink canvas (drawing journal) ---------- */
function InkCanvas({ reducedMotion }) {
  const ref = useRef(null);
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const fit = () => {
      canvas.width = canvas.offsetWidth || 300;
      canvas.height = 150;
      ctx.strokeStyle = "rgba(0, 200, 210, 0.85)";
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      const saved = localStorage.getItem(STORAGE_KEYS.ink);
      if (saved) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        img.src = saved;
      }
    };
    fit();
    window.addEventListener("resize", fit);

    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      const p = e.touches && e.touches[0] ? e.touches[0] : e;
      return { x: p.clientX - r.left, y: p.clientY - r.top };
    };
    const down = (e) => {
      drawing.current = true;
      const { x, y } = pos(e);
      ctx.beginPath();
      ctx.moveTo(x, y);
    };
    const move = (e) => {
      if (!drawing.current) return;
      if (e.cancelable) e.preventDefault();
      const { x, y } = pos(e);
      ctx.lineTo(x, y);
      ctx.stroke();
    };
    const up = () => {
      if (!drawing.current) return;
      drawing.current = false;
      try {
        localStorage.setItem(STORAGE_KEYS.ink, canvas.toDataURL());
      } catch (e) {
        /* storage full — drawing just won't persist */
      }
    };
    canvas.addEventListener("mousedown", down);
    canvas.addEventListener("mousemove", move);
    canvas.addEventListener("mouseup", up);
    canvas.addEventListener("mouseleave", up);
    canvas.addEventListener("touchstart", down, { passive: true });
    canvas.addEventListener("touchmove", move, { passive: false });
    canvas.addEventListener("touchend", up);
    return () => {
      window.removeEventListener("resize", fit);
      canvas.removeEventListener("mousedown", down);
      canvas.removeEventListener("mousemove", move);
      canvas.removeEventListener("mouseup", up);
      canvas.removeEventListener("mouseleave", up);
      canvas.removeEventListener("touchstart", down);
      canvas.removeEventListener("touchmove", move);
      canvas.removeEventListener("touchend", up);
    };
  }, []);

  const clear = () => {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    localStorage.removeItem(STORAGE_KEYS.ink);
  };

  return (
    <div>
      <canvas ref={ref} className="ink-canvas" aria-label="A small canvas to draw on" />
      <div className="btn-row">
        <button type="button" onClick={clear}>
          Clear drawing
        </button>
      </div>
    </div>
  );
}

/* ---------- main page ---------- */
export default function GriefGullyPage() {
  const [stage, setStage] = useState("resting");
  const [introLine, setIntroLine] = useState(0);
  const [media, dispatchMedia] = useReducer(mediaReducer, initialMediaState);
  const [entries, setEntries] = useState([]);
  const [draft, setDraft] = useState("");
  const [reducedMotion, setReducedMotion] = useState(false);
  const bgRef = useRef(null);
  const engineRef = useRef(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = (e) => setReducedMotion(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  /* journal persistence (this device only) */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.journal);
      if (raw) setEntries(JSON.parse(raw));
    } catch (e) {
      /* no stored entries */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.journal, JSON.stringify(entries));
    } catch (e) {
      /* storage unavailable — session only */
    }
  }, [entries]);

  /* intro line rotation */
  useEffect(() => {
    if (stage !== "resting" || reducedMotion) return;
    const id = setInterval(
      () => setIntroLine((l) => (l + 1) % INTRO_LINES.length),
      4200
    );
    return () => clearInterval(id);
  }, [stage, reducedMotion]);

  /* background: faint tree + drifting motes */
  useEffect(() => {
    const canvas = bgRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const rng = mulberry32(20260927);
    const W = (canvas.width = window.innerWidth);
    const H = (canvas.height = window.innerHeight);
    const branches = [];
    growBranches(rng, branches, W * 0.5, H + 20, -Math.PI / 2, 90, 0);
    growBranches(rng, branches, W * 0.12, H + 20, -Math.PI / 2 + 0.3, 60, 0);
    growBranches(rng, branches, W * 0.88, H + 20, -Math.PI / 2 - 0.3, 60, 0);
    const motes = Array.from({ length: 70 }, () => ({
      x: rng() * W,
      y: rng() * H,
      r: 0.6 + rng() * 1.8,
      s: 0.08 + rng() * 0.25,
      hue: rng() > 0.5 ? "0,200,210" : "212,175,55",
      a: 0.12 + rng() * 0.3,
    }));
    let raf = 0;
    const t0 = performance.now();

    function frame() {
      const t = (performance.now() - t0) / 1000;
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, "#070d12");
      grad.addColorStop(1, "#04070a");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      const sway = reducedMotion ? 0 : Math.sin(t * 0.25) * 4;
      ctx.lineWidth = 1;
      branches.forEach((b) => {
        const alpha = Math.max(0.05, 0.22 - b.depth * 0.028);
        ctx.strokeStyle = `rgba(160, 190, 200, ${alpha})`;
        ctx.beginPath();
        ctx.moveTo(b.x1 + sway * b.depth * 0.4, b.y1);
        ctx.lineTo(b.x2 + sway * b.depth * 0.4, b.y2);
        ctx.stroke();
      });

      motes.forEach((m) => {
        if (!reducedMotion) {
          m.y -= m.s;
          m.x += Math.sin(t * 0.5 + m.y * 0.01) * 0.15;
          if (m.y < -4) {
            m.y = H + 4;
            m.x = rng() * W;
          }
        }
        ctx.fillStyle = `rgba(${m.hue}, ${m.a})`;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        ctx.fill();
      });

      if (!reducedMotion) raf = requestAnimationFrame(frame);
    }
    frame();
    const onResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [reducedMotion]);

  /* media engine lifecycle */
  useEffect(() => {
    return () => {
      if (engineRef.current) engineRef.current.stop();
    };
  }, []);

  const toggleTrack = (track) => {
    const willPlay =
      !(media.activeTrackId === track.id && media.playing);
    if (engineRef.current) {
      engineRef.current.stop();
      engineRef.current = null;
    }
    dispatchMedia({ type: "TOGGLE", id: track.id });
    if (willPlay) {
      try {
        engineRef.current = createAudioEngine(track.character);
      } catch (e) {
        dispatchMedia({ type: "STOP" });
      }
    }
  };

  const saveDraft = () => {
    const next = addEntry(entries, draft);
    if (next !== entries) {
      setEntries(next);
      setDraft("");
    }
  };

  const enter = () => {
    if (stage !== "resting") return;
    if (reducedMotion) {
      setStage("present");
      return;
    }
    setStage("entering");
    setTimeout(() => setStage("present"), 1100);
  };

  return (
    <main className="grief-gully">
      <canvas ref={bgRef} className="bg-canvas" aria-hidden="true" />

      {stage !== "present" && (
        <div
          className={`intro-overlay ${stage === "entering" ? "leaving" : ""}`}
          onClick={enter}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") enter();
          }}
          aria-label="Enter Grief Gully"
        >
          <h1 className="intro-title">GRIEF GULLY</h1>
          <p className="intro-sub">A quiet place to rest</p>
          <p className="intro-line" key={introLine}>
            {INTRO_LINES[introLine]}
          </p>
          <p className="intro-cta">click anywhere to enter</p>
        </div>
      )}

      {stage === "present" && (
        <div className="content">
          <header className="page-header">
            <h1>Grief Gully</h1>
            <p className="tagline">Healing Matrix — take your time. There is no hurry here.</p>
          </header>

          <section className="card" aria-label="Media archive">
            <h2 className="section-label">Media Archive</h2>
            <p className="section-note">
              Gentle generative pieces, made here in your browser — no recordings,
              no streaming. Headphones help.
            </p>
            {TRACKS.map((track) => {
              const active = media.activeTrackId === track.id && media.playing;
              return (
                <article key={track.id} className={`track ${active ? "active" : ""}`}>
                  <div className="track-head">
                    <div>
                      <h3>{track.title}</h3>
                      <p className="track-note">{track.note}</p>
                    </div>
                    <button
                      type="button"
                      className="play-btn"
                      onClick={() => toggleTrack(track)}
                      aria-pressed={active}
                      aria-label={active ? `Stop ${track.title}` : `Play ${track.title}`}
                    >
                      {active ? "Rest" : "Listen"}
                    </button>
                  </div>
                  <TrackVisual character={track.character} active={active} reducedMotion={reducedMotion} />
                </article>
              );
            })}
          </section>

          <section className="card" aria-label="Healing resources">
            <h2 className="section-label">Healing Matrix</h2>
            <p className="section-note">
              Outside help, for when you want it. These are plain links to real
              services — we receive nothing for them.
            </p>
            <ul className="resource-list">
              {RESOURCE_LINKS.map((r) => (
                <li key={r.name}>
                  <a href={r.href} target="_blank" rel="noopener noreferrer" className="resource-link">
                    <span className="resource-name">{r.name}</span>
                    <span className="resource-blurb">{r.blurb}</span>
                    <span className="resource-ext" aria-hidden="true">↗</span>
                  </a>
                </li>
              ))}
            </ul>
            <p className="honest-note">{HONEST_NOTE}</p>
          </section>

          <section className="card" aria-label="Reflection journal">
            <h2 className="section-label">Reflection Journal</h2>
            <p className="section-note">
              Words you want to set down, and a small space to draw in. Everything
              stays on this device — nothing is sent anywhere.
            </p>
            <label className="journal-label" htmlFor="journal-draft">
              What would you like to set down today?
            </label>
            <textarea
              id="journal-draft"
              className="journal-input"
              rows={3}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Write freely…"
            />
            <div className="btn-row">
              <button type="button" onClick={saveDraft} disabled={!draft.trim()}>
                Set this down
              </button>
            </div>
            {entries.length > 0 && (
              <ul className="entries">
                {entries.map((e) => (
                  <li key={e.id} className="entry">
                    <p>{e.text}</p>
                    <div className="entry-meta">
                      <time>
                        {new Date(e.createdAt).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </time>
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() => setEntries(removeEntry(entries, e.id))}
                        aria-label="Remove this entry"
                      >
                        let go
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <InkCanvas reducedMotion={reducedMotion} />
          </section>

          <footer className="page-footer">
            <p>Grief Gully — a quiet corner of the multiverse.</p>
          </footer>
        </div>
      )}

      <style jsx>{`
        .grief-gully {
          position: relative;
          min-height: 100dvh;
          color: #dfe9ec;
          font-family: Georgia, "Times New Roman", "Songti SC", serif;
          overflow-x: hidden;
        }
        .bg-canvas {
          position: fixed;
          inset: 0;
          width: 100%;
          height: 100%;
          z-index: 0;
          pointer-events: none;
        }
        .intro-overlay {
          position: fixed;
          inset: 0;
          z-index: 10;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 24px;
          cursor: pointer;
          background: radial-gradient(circle at 50% 45%, rgba(4, 10, 14, 0) 0%, rgba(2, 5, 8, 0.88) 78%);
          transition: opacity 1s ease;
        }
        .intro-overlay.leaving {
          opacity: 0;
          pointer-events: none;
        }
        .intro-title {
          font-size: clamp(2.4rem, 9vw, 4rem);
          letter-spacing: 0.35em;
          margin: 0 0 12px;
          color: #a8d8de;
          text-shadow: 0 0 18px rgba(0, 200, 210, 0.35);
          font-weight: 400;
        }
        .intro-sub {
          color: #d4af37;
          letter-spacing: 0.28em;
          font-size: 0.85rem;
          margin: 0 0 28px;
          text-transform: uppercase;
        }
        .intro-line {
          font-style: italic;
          color: #9fb6bc;
          min-height: 2.2em;
          margin: 0 0 40px;
          animation: linefade 4.2s ease;
        }
        @keyframes linefade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .intro-cta {
          color: #5f767c;
          letter-spacing: 0.3em;
          font-size: 0.72rem;
          text-transform: uppercase;
          animation: breathe 3s ease-in-out infinite;
        }
        @keyframes breathe {
          0%, 100% { opacity: 0.45; }
          50% { opacity: 1; }
        }
        .content {
          position: relative;
          z-index: 1;
          max-width: 620px;
          margin: 0 auto;
          padding: 48px 20px 80px;
          animation: rise 1.2s ease;
        }
        @keyframes rise {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: none; }
        }
        .page-header {
          text-align: center;
          margin-bottom: 34px;
        }
        .page-header h1 {
          font-weight: 400;
          letter-spacing: 0.3em;
          color: #cfe3e8;
          font-size: 1.7rem;
          margin: 0 0 10px;
        }
        .tagline {
          color: #8ba0a6;
          font-style: italic;
          margin: 0;
        }
        .card {
          background: rgba(6, 12, 16, 0.72);
          border: 1px solid rgba(0, 200, 210, 0.16);
          border-radius: 14px;
          padding: 22px;
          margin-bottom: 26px;
          backdrop-filter: blur(8px);
        }
        .section-label {
          font-size: 0.78rem;
          letter-spacing: 0.34em;
          text-transform: uppercase;
          color: #d4af37;
          margin: 0 0 8px;
          font-weight: 400;
          border-left: 3px solid rgba(0, 200, 210, 0.6);
          padding-left: 12px;
        }
        .section-note {
          color: #93a8ad;
          font-size: 0.92rem;
          line-height: 1.65;
          margin: 0 0 16px;
        }
        .track {
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          padding: 14px;
          margin: 10px 0;
          background: rgba(255, 255, 255, 0.02);
          transition: border-color 0.4s ease;
        }
        .track.active {
          border-color: rgba(0, 200, 210, 0.5);
        }
        .track-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          margin-bottom: 8px;
        }
        .track h3 {
          margin: 0 0 4px;
          font-weight: 400;
          color: #dfe9ec;
          font-size: 1.05rem;
        }
        .track-note {
          margin: 0;
          color: #8ba0a6;
          font-size: 0.86rem;
          font-style: italic;
        }
        .play-btn {
          flex-shrink: 0;
          min-width: 88px;
          min-height: 44px;
          background: transparent;
          border: 1px solid rgba(212, 175, 55, 0.6);
          color: #d4af37;
          border-radius: 999px;
          font-size: 0.9rem;
          cursor: pointer;
          font-family: inherit;
        }
        .play-btn:hover {
          background: rgba(212, 175, 55, 0.12);
        }
        .track-visual {
          width: 100%;
          height: 84px;
          display: block;
        }
        .resource-list {
          list-style: none;
          margin: 0 0 16px;
          padding: 0;
        }
        .resource-list li {
          margin: 8px 0;
        }
        .resource-link {
          display: block;
          text-decoration: none;
          border: 1px solid rgba(0, 200, 210, 0.18);
          border-left: 3px solid transparent;
          border-radius: 8px;
          padding: 12px 14px;
          transition: border-color 0.3s ease, background 0.3s ease;
        }
        .resource-link:hover {
          border-left-color: #d4af37;
          background: rgba(0, 200, 210, 0.06);
        }
        .resource-name {
          display: block;
          color: #a8d8de;
          font-size: 1rem;
          margin-bottom: 2px;
        }
        .resource-blurb {
          display: block;
          color: #8ba0a6;
          font-size: 0.86rem;
        }
        .resource-ext {
          color: #d4af37;
          font-size: 0.8rem;
        }
        .honest-note {
          border-top: 1px solid rgba(212, 175, 55, 0.25);
          padding-top: 14px;
          color: #b9a86a;
          font-size: 0.88rem;
          line-height: 1.7;
          margin: 0;
        }
        .journal-label {
          display: block;
          color: #a8d8de;
          font-style: italic;
          margin-bottom: 8px;
        }
        .journal-input {
          width: 100%;
          background: rgba(0, 0, 0, 0.45);
          border: 1px solid rgba(0, 200, 210, 0.22);
          border-radius: 8px;
          color: #dfe9ec;
          font-family: inherit;
          font-size: 1rem;
          padding: 12px;
          resize: vertical;
        }
        .journal-input:focus {
          outline: 1px solid rgba(0, 200, 210, 0.6);
        }
        .btn-row {
          display: flex;
          justify-content: flex-end;
          padding: 10px 0;
        }
        .btn-row button {
          min-height: 44px;
          background: transparent;
          border: 1px solid rgba(212, 175, 55, 0.6);
          color: #d4af37;
          border-radius: 8px;
          padding: 8px 18px;
          cursor: pointer;
          font-family: inherit;
          font-size: 0.95rem;
        }
        .btn-row button:disabled {
          opacity: 0.35;
          cursor: default;
        }
        .btn-row button:not(:disabled):hover {
          background: rgba(212, 175, 55, 0.12);
        }
        .entries {
          list-style: none;
          margin: 8px 0 16px;
          padding: 0;
        }
        .entry {
          border-left: 3px solid rgba(0, 200, 210, 0.5);
          background: rgba(255, 255, 255, 0.02);
          border-radius: 0 8px 8px 0;
          padding: 10px 14px;
          margin: 8px 0;
        }
        .entry p {
          margin: 0 0 6px;
          white-space: pre-wrap;
          line-height: 1.6;
        }
        .entry-meta {
          display: flex;
          justify-content: space-between;
          align-items: center;
          color: #6d8288;
          font-size: 0.8rem;
        }
        .link-btn {
          background: none;
          border: none;
          color: #8ba0a6;
          cursor: pointer;
          font-family: inherit;
          font-style: italic;
          font-size: 0.8rem;
          min-height: 44px;
        }
        .link-btn:hover {
          color: #d4af37;
        }
        .ink-canvas {
          width: 100%;
          height: 150px;
          background: rgba(0, 0, 0, 0.45);
          border: 1px solid rgba(0, 200, 210, 0.22);
          border-radius: 8px;
          cursor: crosshair;
          touch-action: none;
        }
        .page-footer {
          text-align: center;
          color: #5f767c;
          font-size: 0.82rem;
          font-style: italic;
        }
        @media (prefers-reduced-motion: reduce) {
          .intro-overlay, .content, .intro-line, .intro-cta {
            animation: none !important;
            transition: none !important;
          }
        }
      `}</style>
    </main>
  );
}
