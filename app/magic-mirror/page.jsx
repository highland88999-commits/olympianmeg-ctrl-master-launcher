"use client";

// Magic Mirror — the Vortex Mirror.
// An ornate portal holds a procedurally drawn face; the visitor types into a
// prompt box and the mirror answers with locally composed reflections.
// The face is canvas art and the words come from a small on-device engine —
// no network, no AI service, no telemetry. A contemplative toy.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { reflect, hashSeed, sanitizePrompt, MAX_PROMPT_LENGTH } from "./reflection-engine";
import { createFaceModel, drawFace } from "./face";

const CANVAS_W = 360;
const CANVAS_H = 480;
const MATERIALIZE_SECONDS = 4.2;

// ---------------------------------------------------------------------------
// Face canvas — renders the seeded procedural face, with a gentle animation
// loop (static single frame when the user prefers reduced motion).
// ---------------------------------------------------------------------------
function FaceCanvas({ seed, onMaterialized, reduceMotion }) {
  const canvasRef = useRef(null);
  const doneRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const model = createFaceModel(seed);
    const start = performance.now();
    let raf = 0;

    const frame = (now) => {
      const elapsed = (now - start) / 1000;
      const mat = reduceMotion ? 1 : Math.min(1, elapsed / MATERIALIZE_SECONDS);
      drawFace(ctx, model, CANVAS_W, CANVAS_H, reduceMotion ? 0 : elapsed, mat);
      if (mat >= 1 && !doneRef.current) {
        doneRef.current = true;
        if (onMaterialized) onMaterialized();
      }
      if (!reduceMotion) raf = requestAnimationFrame(frame);
    };

    if (reduceMotion) {
      drawFace(ctx, model, CANVAS_W, CANVAS_H, 0, 1);
      doneRef.current = true;
      if (onMaterialized) onMaterialized();
    } else {
      raf = requestAnimationFrame(frame);
    }
    return () => cancelAnimationFrame(raf);
  }, [seed, reduceMotion, onMaterialized]);

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_W}
      height={CANVAS_H}
      role="img"
      aria-label="A procedurally drawn, ethereal face shimmering inside the mirror portal"
      style={{ width: "100%", height: "100%", display: "block" }}
    />
  );
}

// ---------------------------------------------------------------------------
// Ornate frame — SVG filigree drawn around the portal. Pure decoration.
// ---------------------------------------------------------------------------
function MirrorFrame() {
  return (
    <svg
      viewBox="0 0 200 250"
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{ position: "absolute", inset: "-7%", width: "114%", height: "114%", pointerEvents: "none" }}
    >
      <defs>
        <linearGradient id="mm-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f4dfa8" />
          <stop offset="0.5" stopColor="#caa14f" />
          <stop offset="1" stopColor="#8a6420" />
        </linearGradient>
      </defs>
      <ellipse cx="100" cy="125" rx="96" ry="120" fill="none" stroke="url(#mm-gold)" strokeWidth="2.5" />
      <ellipse cx="100" cy="125" rx="89" ry="113" fill="none" stroke="url(#mm-gold)" strokeWidth="1" opacity="0.7" />
      {/* corner flourishes */}
      <g fill="none" stroke="url(#mm-gold)" strokeWidth="1.6">
        <path d="M100,2 C118,2 130,10 134,24" />
        <path d="M100,2 C82,2 70,10 66,24" />
        <path d="M100,248 C118,248 130,240 134,226" />
        <path d="M100,248 C82,248 70,240 66,226" />
        <path d="M2,125 C2,107 10,95 24,91" />
        <path d="M2,125 C2,143 10,155 24,159" />
        <path d="M198,125 C198,107 190,95 176,91" />
        <path d="M198,125 C198,143 190,155 176,159" />
      </g>
      <g fill="#e9c979">
        <circle cx="100" cy="2" r="3.2" />
        <circle cx="100" cy="248" r="3.2" />
        <circle cx="134" cy="24" r="1.8" />
        <circle cx="66" cy="24" r="1.8" />
        <circle cx="134" cy="226" r="1.8" />
        <circle cx="66" cy="226" r="1.8" />
        <circle cx="24" cy="91" r="1.8" />
        <circle cx="24" cy="159" r="1.8" />
        <circle cx="176" cy="91" r="1.8" />
        <circle cx="176" cy="159" r="1.8" />
      </g>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Typewriter reveal for the mirror's latest reply (instant when reduced motion).
// ---------------------------------------------------------------------------
function MirrorReply({ text, reduceMotion }) {
  const [shown, setShown] = useState(reduceMotion ? text.length : 0);

  useEffect(() => {
    setShown(reduceMotion ? text.length : 0);
    if (reduceMotion) return;
    const id = setInterval(() => {
      setShown((n) => {
        if (n >= text.length) {
          clearInterval(id);
          return n;
        }
        return n + 2;
      });
    }, 24);
    return () => clearInterval(id);
  }, [text, reduceMotion]);

  return (
    <p style={{ whiteSpace: "pre-wrap", margin: 0, minHeight: "1.2em" }}>
      {text.slice(0, shown)}
      {!reduceMotion && shown < text.length ? <span className="mm-caret">▍</span> : null}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function MagicMirrorPage() {
  const [phase, setPhase] = useState("landing"); // landing | stirring | ready | awake
  const [prompt, setPrompt] = useState("");
  const [exchanges, setExchanges] = useState([]);
  const [turn, setTurn] = useState(0);

  const reduceMotion = useMemo(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  );

  const sessionSeed = useRef(0);
  if (sessionSeed.current === 0) {
    sessionSeed.current =
      (hashSeed(String(Date.now())) ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  }
  const faceSeed = useMemo(() => hashSeed("face|" + sessionSeed.current), []);

  const handleMaterialized = useCallback(() => {
    setPhase((p) => (p === "stirring" ? "ready" : p));
  }, []);

  const askMirror = useCallback(() => {
    const clean = sanitizePrompt(prompt);
    if (!clean) return;
    const result = reflect(clean, { seed: sessionSeed.current, turn });
    setExchanges((prev) => [...prev.slice(-11), { prompt: clean, lines: result.lines }].slice(-12));
    setTurn((t) => t + 1);
    setPrompt("");
  }, [prompt, turn]);

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      askMirror();
    }
  };

  const latest = exchanges.length ? exchanges[exchanges.length - 1] : null;

  return (
    <main className="mm-root" onClick={phase === "landing" ? () => setPhase("stirring") : undefined}>
      <style>{`
        .mm-root {
          min-height: 100dvh; margin: 0; padding: 24px 16px 48px;
          background: radial-gradient(120% 90% at 50% 0%, #0b0e1d 0%, #05060c 55%, #020307 100%);
          color: #dfe9f5;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Georgia, "Times New Roman", serif;
          display: flex; flex-direction: column; align-items: center;
          cursor: ${phase === "landing" ? "pointer" : "default"};
          -webkit-tap-highlight-color: transparent;
        }
        .mm-landing { text-align: center; margin: auto 0; padding: 0 12px; }
        .mm-title {
          font-size: clamp(1.6rem, 6vw, 3rem); letter-spacing: 0.35em; margin: 0 0 26px;
          color: #bfe9ff; text-shadow: 0 0 22px rgba(80,180,255,0.65), 0 0 70px rgba(80,180,255,0.3);
          font-weight: 300;
        }
        .mm-ticker {
          font-size: clamp(0.85rem, 3vw, 1.1rem); letter-spacing: 0.45em; color: #8fe3c8; margin: 0;
          animation: mm-pulse 2.2s ease-in-out infinite;
        }
        @keyframes mm-pulse { 0%,100% { opacity: 0.45; } 50% { opacity: 1; } }
        .mm-stage { display: flex; flex-direction: column; align-items: center; width: 100%; max-width: 560px; }
        .mm-kicker {
          font-size: 0.72rem; letter-spacing: 0.5em; color: #9aa7bd; margin: 0 0 14px; text-transform: uppercase;
        }
        .mm-portal-wrap { position: relative; width: min(74vw, 300px); aspect-ratio: 3 / 4; }
        .mm-portal {
          position: absolute; inset: 0; border-radius: 50%; overflow: hidden;
          box-shadow: 0 0 40px rgba(110,190,255,0.28), 0 0 120px rgba(110,190,255,0.12), inset 0 0 30px rgba(0,0,0,0.6);
          background: #05060c;
        }
        .mm-halo {
          position: absolute; inset: -16%; border-radius: 50%; pointer-events: none;
          background: radial-gradient(closest-side, rgba(120,200,255,0.14), rgba(120,200,255,0) 70%);
          animation: mm-breathe 6s ease-in-out infinite;
        }
        @keyframes mm-breathe { 0%,100% { transform: scale(1); opacity: 0.8; } 50% { transform: scale(1.06); opacity: 1; } }
        .mm-caption { margin: 18px 0 0; font-size: 0.8rem; letter-spacing: 0.4em; color: #8fe3c8; text-transform: uppercase; }
        .mm-speak-btn {
          margin-top: 22px; padding: 14px 34px; font-size: 0.95rem; letter-spacing: 0.3em; text-transform: uppercase;
          color: #0b0e1d; background: linear-gradient(135deg, #f4dfa8, #caa14f); border: none; border-radius: 999px;
          cursor: pointer; font-weight: 600; min-height: 48px;
          box-shadow: 0 0 24px rgba(202,161,79,0.45);
        }
        .mm-speak-btn:active { transform: scale(0.97); }
        .mm-ask { width: 100%; margin-top: 26px; display: flex; flex-direction: column; gap: 10px; }
        .mm-ask label { font-size: 0.72rem; letter-spacing: 0.4em; color: #9aa7bd; text-transform: uppercase; }
        .mm-ask textarea {
          width: 100%; box-sizing: border-box; min-height: 84px; resize: vertical;
          background: rgba(10,14,26,0.85); color: #eaf2fb; border: 1px solid rgba(140,180,220,0.35);
          border-radius: 12px; padding: 14px; font-size: 1rem; line-height: 1.5; font-family: inherit;
        }
        .mm-ask textarea:focus { outline: 2px solid rgba(140,200,255,0.7); border-color: transparent; }
        .mm-ask-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .mm-count { font-size: 0.75rem; color: #7c8aa0; }
        .mm-ask-btn {
          padding: 12px 26px; font-size: 0.85rem; letter-spacing: 0.25em; text-transform: uppercase;
          color: #0b0e1d; background: linear-gradient(135deg, #bfe9ff, #7fb8e8); border: none; border-radius: 999px;
          cursor: pointer; font-weight: 600; min-height: 48px;
        }
        .mm-ask-btn:disabled { opacity: 0.4; cursor: default; }
        .mm-reply {
          width: 100%; margin-top: 22px; padding: 20px;
          background: rgba(8,12,22,0.72); border: 1px solid rgba(140,180,220,0.22); border-radius: 14px;
          font-size: 1.02rem; line-height: 1.75; color: #e6eef8;
        }
        .mm-reply .mm-q { color: #9fb4cc; font-style: italic; margin: 0 0 12px; font-size: 0.95rem; }
        .mm-log { width: 100%; margin-top: 14px; display: flex; flex-direction: column; gap: 10px; opacity: 0.75; }
        .mm-log details {
          background: rgba(8,12,22,0.5); border: 1px solid rgba(140,180,220,0.14);
          border-radius: 10px; padding: 10px 14px; font-size: 0.9rem; line-height: 1.6;
        }
        .mm-log summary { cursor: pointer; color: #9fb4cc; }
        .mm-log p { margin: 8px 0 0; white-space: pre-wrap; }
        .mm-foot {
          margin-top: 34px; max-width: 560px; font-size: 0.78rem; line-height: 1.7; color: #7c8aa0; text-align: center;
        }
        .mm-foot strong { color: #a9bcd4; font-weight: 600; }
        .mm-caret { color: #8fe3c8; animation: mm-pulse 1s steps(2) infinite; }
        @media (prefers-reduced-motion: reduce) {
          .mm-ticker, .mm-halo, .mm-caret { animation: none; }
        }
      `}</style>

      {phase === "landing" && (
        <div className="mm-landing">
          <h1 className="mm-title">MIRROR, MIRROR ON THE WALL</h1>
          <p className="mm-ticker">TAP TO INITIALIZE</p>
        </div>
      )}

      {phase !== "landing" && (
        <div className="mm-stage">
          <p className="mm-kicker">The Vortex Mirror</p>
          <div className="mm-portal-wrap">
            <div className="mm-halo" />
            <div className="mm-portal">
              <FaceCanvas seed={faceSeed} onMaterialized={handleMaterialized} reduceMotion={reduceMotion} />
            </div>
            <MirrorFrame />
          </div>

          {phase === "stirring" && <p className="mm-caption">The mirror stirs&hellip;</p>}

          {phase === "ready" && (
            <>
              <p className="mm-caption">The mirror holds your shape</p>
              <button className="mm-speak-btn" onClick={() => setPhase("awake")}>
                Tap to speak
              </button>
            </>
          )}

          {phase === "awake" && (
            <>
              <div className="mm-ask">
                <label htmlFor="mm-prompt">Ask the mirror</label>
                <textarea
                  id="mm-prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={onKeyDown}
                  maxLength={MAX_PROMPT_LENGTH}
                  placeholder="Type what is on your mind — a question, a worry, a hope…"
                  aria-describedby="mm-count"
                />
                <div className="mm-ask-row">
                  <span className="mm-count" id="mm-count">
                    {prompt.length}/{MAX_PROMPT_LENGTH}
                  </span>
                  <button
                    className="mm-ask-btn"
                    onClick={askMirror}
                    disabled={!sanitizePrompt(prompt)}
                  >
                    Ask the mirror
                  </button>
                </div>
              </div>

              {latest && (
                <div className="mm-reply" aria-live="polite">
                  <p className="mm-q">&ldquo;{latest.prompt}&rdquo;</p>
                  <MirrorReply text={latest.lines.join("\n\n")} reduceMotion={reduceMotion} />
                </div>
              )}

              {exchanges.length > 1 && (
                <div className="mm-log">
                  {exchanges.slice(0, -1).reverse().map((ex, i) => (
                    <details key={exchanges.length - 2 - i}>
                      <summary>&ldquo;{ex.prompt.slice(0, 60)}{ex.prompt.length > 60 ? "…" : ""}&rdquo;</summary>
                      <p>{ex.lines.join("\n\n")}</p>
                    </details>
                  ))}
                </div>
              )}

              <p className="mm-foot">
                <strong>Honestly, from the mirror:</strong> the face above is procedural art drawn on
                this device, and every reply is composed locally by a small word-mirror engine from
                your own words — no network, no AI service, nothing leaves this page. It is a
                contemplative toy, not a therapist and not advice. If you are struggling, please
                reach out to a person you trust or a local support line.
              </p>
            </>
          )}
        </div>
      )}

      {/* Safari bottom-bar clearance */}
      <div aria-hidden="true" className="h-[calc(4.5rem+env(safe-area-inset-bottom))]" />
    </main>
  );
}
