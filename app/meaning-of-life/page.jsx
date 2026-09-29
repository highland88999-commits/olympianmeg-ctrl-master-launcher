"use client";

import { useEffect, useRef, useState } from "react";
import {
  MOVEMENTS,
  TAGLINE,
  LINE_DWELL_MS,
  movementAt,
  nextIndex,
  prevIndex,
  lineAt,
} from "./movements.js";
import { ART } from "./art.js";
import PassageLink from "@/components/styx/PassageLink";

export default function MeaningOfLifePage() {
  const [movementIdx, setMovementIdx] = useState(0);
  const [line, setLine] = useState(MOVEMENTS[0].lines[0]);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [paused, setPaused] = useState(false);
  const canvasRef = useRef(null);
  const advanceTimer = useRef(null);
  const lineTimer = useRef(null);
  const movementStart = useRef(Date.now());
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = (e) => setReducedMotion(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const movement = movementAt(movementIdx);

  const goTo = (idx) => {
    movementStart.current = Date.now();
    setMovementIdx(((idx % MOVEMENTS.length) + MOVEMENTS.length) % MOVEMENTS.length);
  };

  /* auto-advance movements (not under reduced motion, not paused) */
  useEffect(() => {
    if (reducedMotion || paused) return;
    advanceTimer.current = setTimeout(() => {
      goTo(nextIndex(movementIdx));
    }, movement.durationMs);
    return () => clearTimeout(advanceTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movementIdx, reducedMotion, paused]);

  /* rotate reflective lines */
  useEffect(() => {
    setLine(lineAt(movement, 0));
    if (reducedMotion) return;
    lineTimer.current = setInterval(() => {
      const elapsed = Date.now() - movementStart.current;
      setLine(lineAt(movement, elapsed));
    }, LINE_DWELL_MS);
    return () => clearInterval(lineTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movementIdx, reducedMotion]);

  /* canvas loop */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = (canvas.width = window.innerWidth);
    const H = (canvas.height = window.innerHeight);
    const t0 = performance.now();
    const draw = ART[movement.id];
    let raf = 0;

    function frame() {
      const t = (performance.now() - t0) / 1000;
      draw(ctx, W, H, t);
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
  }, [movement.id, reducedMotion]);

  return (
    <main className="mol">
      <PassageLink />
      <canvas ref={canvasRef} className="mol-canvas" aria-hidden="true" />

      <div className="mol-overlay">
        <p className="mol-kicker">
          Genesis <span aria-hidden="true">&bull;</span> Interconnection{" "}
          <span aria-hidden="true">&bull;</span> Transcendence
        </p>
        <h1 className="mol-title" key={movement.id}>
          {movement.title}
        </h1>
        <p className="mol-epithet">{movement.epithet}</p>
        <p className="mol-line" key={`${movement.id}-${line}`}>
          {line}
        </p>
        <p className="mol-tagline">{TAGLINE}</p>
      </div>

      <nav className="mol-nav" aria-label="Movements">
        <button
          type="button"
          className="mol-btn"
          onClick={() => goTo(prevIndex(movementIdx))}
          aria-label="Previous movement"
        >
          &#8249;
        </button>
        <div className="mol-dots" role="tablist" aria-label="Choose a movement">
          {MOVEMENTS.map((m, i) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={i === movementIdx}
              aria-label={m.title}
              className={`mol-dot ${i === movementIdx ? "active" : ""}`}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
        <button
          type="button"
          className="mol-btn"
          onClick={() => goTo(nextIndex(movementIdx))}
          aria-label="Next movement"
        >
          &#8250;
        </button>
        {!reducedMotion && (
          <button
            type="button"
            className="mol-pause"
            onClick={() => setPaused((p) => !p)}
            aria-pressed={paused}
            aria-label={paused ? "Resume the visualizer" : "Pause the visualizer"}
          >
            {paused ? "Resume" : "Pause"}
          </button>
        )}
      </nav>

      <style jsx>{`
        .mol {
          position: fixed;
          inset: 0;
          background: #000;
          color: rgba(255, 255, 255, 0.82);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
            "Helvetica Neue", Arial, sans-serif;
          overflow: hidden;
        }
        .mol-canvas {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          display: block;
        }
        .mol-overlay {
          position: absolute;
          left: 50%;
          bottom: max(88px, env(safe-area-inset-bottom));
          transform: translateX(-50%);
          width: min(92vw, 640px);
          text-align: center;
          pointer-events: none;
          z-index: 2;
          mix-blend-mode: screen;
        }
        .mol-kicker {
          font-size: 10px;
          letter-spacing: 0.35em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.5);
          margin: 0 0 10px;
        }
        .mol-title {
          font-size: clamp(1.6rem, 6vw, 2.4rem);
          font-weight: 300;
          letter-spacing: 0.5em;
          text-indent: 0.5em;
          color: rgba(255, 240, 200, 0.95);
          margin: 0 0 4px;
          text-shadow: 0 0 18px rgba(255, 215, 120, 0.35);
          animation: molfade 2.4s ease;
        }
        .mol-epithet {
          font-size: 0.8rem;
          letter-spacing: 0.3em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.45);
          margin: 0 0 18px;
        }
        .mol-line {
          font-size: clamp(0.95rem, 3.4vw, 1.12rem);
          font-weight: 300;
          line-height: 1.7;
          color: rgba(255, 244, 220, 0.9);
          margin: 0 0 14px;
          min-height: 3.4em;
          animation: molfade 2s ease;
          text-shadow: 0 0 14px rgba(0, 0, 0, 0.9);
        }
        .mol-tagline {
          font-size: 10px;
          letter-spacing: 0.32em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.42);
          margin: 0;
          line-height: 1.9;
        }
        @keyframes molfade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .mol-nav {
          position: absolute;
          left: 50%;
          bottom: max(20px, env(safe-area-inset-bottom));
          transform: translateX(-50%);
          display: flex;
          align-items: center;
          gap: 14px;
          z-index: 3;
        }
        .mol-btn {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          border: 1px solid rgba(255, 255, 255, 0.25);
          background: rgba(0, 0, 0, 0.35);
          color: rgba(255, 255, 255, 0.75);
          font-size: 1.5rem;
          line-height: 1;
          cursor: pointer;
        }
        .mol-btn:hover {
          border-color: rgba(255, 215, 120, 0.7);
        }
        .mol-dots {
          display: flex;
          gap: 10px;
        }
        .mol-dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          border: 1px solid rgba(255, 255, 255, 0.4);
          background: transparent;
          cursor: pointer;
          padding: 0;
          min-width: 44px;
          min-height: 44px;
          background-clip: content-box;
          position: relative;
        }
        .mol-dot::after {
          content: "";
          position: absolute;
          inset: 16px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.35);
        }
        .mol-dot.active::after {
          background: rgba(255, 215, 120, 0.95);
        }
        .mol-pause {
          min-height: 44px;
          padding: 0 16px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.25);
          background: rgba(0, 0, 0, 0.35);
          color: rgba(255, 255, 255, 0.7);
          font-size: 0.8rem;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          cursor: pointer;
        }
        .mol-pause:hover {
          border-color: rgba(255, 215, 120, 0.7);
        }
        @media (prefers-reduced-motion: reduce) {
          .mol-title, .mol-line {
            animation: none;
          }
        }
      `}</style>
    </main>
  );
}
