"use client";

import { useEffect, useRef, useState } from "react";
import { createScene, ERAS, SLABS, ACCENT, nextEra, prevEra } from "./scene";

const TILE = "/images/apollo-shared/apollo-panel-tile.webp";
const BG = "/images/architectural-legacy/architectural-legacy-bg.webp";

// Inline SVG glyph system (zero image weight) — APOLLO amber/gold treatment.
const G = (props) => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    style={{ flex: "none" }} {...props} />
);
const IconPrev = () => (<G><path d="M15 5l-7 7 7 7" /></G>);
const IconNext = () => (<G><path d="M9 5l7 7-7 7" /></G>);
const IconPlay = () => (<G><path d="M8 5v14l11-7z" fill="currentColor" stroke="none" /></G>);
const IconPause = () => (<G><path d="M9 5v14M15 5v14" /></G>);
const IconColumn = () => (<G><path d="M5 21h14M6 18h12M7 18V8M11 18V8M13 18V8M17 18V8M4 8l8-5 8 5z" /></G>);
const IconSpin = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#ffd700" strokeWidth="3"
    strokeLinecap="round" aria-hidden="true" style={{ animation: "argspin 0.9s linear infinite" }}>
    <path d="M12 3a9 9 0 1 0 9 9" />
  </svg>
);

export default function ArchitecturalLegacyPage() {
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const [eraIdx, setEraIdx] = useState(0);
  const [auto, setAuto] = useState(false);
  const [ready, setReady] = useState(false); // styled loading veil while the archive raises

  useEffect(() => {
    document.title = "Architectural Legacy — ARGUS Observatory";
    let s = null;
    try {
      s = createScene(canvasRef.current, { onEra: setEraIdx });
      sceneRef.current = s;
    } catch {
      sceneRef.current = null; // the empty state below explains instead of crashing
    }
    const t = setTimeout(() => setReady(true), 600);
    return () => {
      clearTimeout(t);
      if (s) s.destroy();
    };
  }, []);

  useEffect(() => { sceneRef.current && sceneRef.current.setAuto(auto); }, [auto]);

  function go(i) { sceneRef.current && sceneRef.current.goTo(i, i > eraIdx ? 1 : -1); }
  const era = ERAS[eraIdx];

  return (
    <main className="argus">
      <style>{`
        @keyframes argspin { to { transform: rotate(360deg); } }
        .argus { min-height: 100dvh; background-color: #050508; background-image: linear-gradient(rgba(5,5,8,0.88), rgba(5,5,8,0.94)), url(${BG}); background-size: cover; background-position: top center; background-attachment: fixed; color: #ece7db; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; display: flex; flex-direction: column; }
        .argus header { padding: 0 0 10px; }
        .argus .banner { position: relative; height: clamp(150px, 26vw, 230px); background-image: linear-gradient(to bottom, rgba(5,5,8,0.15), rgba(5,5,8,0.88)), url(${BG}); background-size: cover; background-position: center 30%; border-bottom: 1px solid rgba(255,215,0,0.25); }
        .argus .banner .shade { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 120%, rgba(255,215,0,0.10), transparent 60%); }
        .argus .headtext { padding: 18px 20px 0; }
        .argus .kicker { font-size: 11px; letter-spacing: 4px; color: ${ACCENT}; text-transform: uppercase; }
        .argus h1 { margin: 4px 0 2px; font-size: clamp(1.6rem, 5vw, 2.6rem); letter-spacing: 6px; font-weight: 800; text-shadow: 0 0 26px rgba(255,215,0,0.25); }
        .argus .sub { color: #9d968a; font-size: 0.9rem; max-width: 62ch; }
        .argus .stage { position: relative; margin: 10px 16px 0; border: 1px solid rgba(255,215,0,0.28); border-radius: 14px; overflow: hidden; height: min(58dvh, 520px); min-height: 300px; background: #050508; box-shadow: 0 0 34px rgba(255,215,0,0.06); }
        .argus canvas { width: 100%; height: 100%; display: block; touch-action: pan-y; cursor: grab; outline: none; }
        .argus .fact { margin: 12px 20px 0; padding: 14px 16px; border-left: 3px solid ${era.accent}; background-color: #0b0a08; background-image: url(${TILE}); background-size: 220px; border-radius: 0 10px 10px 0; }
        .argus .fact p { margin: 0; font-size: 0.92rem; line-height: 1.6; color: #ddd6c6; }
        .argus .controls { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; padding: 14px 20px; }
        .argus button { min-height: 44px; min-width: 44px; padding: 10px 16px; border-radius: 8px; border: 1px solid #3a3324; background-color: #100e0a; background-image: url(${TILE}); background-size: 200px; color: #ece7db; font-size: 0.8rem; letter-spacing: 1px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
        .argus button:hover { border-color: rgba(255,215,0,0.5); }
        .argus button.on { background: ${ACCENT}; border-color: ${ACCENT}; color: #0d0a04; font-weight: 700; }
        .argus .dot { width: 44px; height: 44px; border-radius: 50%; padding: 0; display: inline-flex; align-items: center; justify-content: center; }
        .argus .dot.on { background: ${era.accent}; border-color: ${era.accent}; }
        .argus .slabs { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 14px; padding: 6px 20px 24px; }
        .argus .slab { border: 1px solid #3a3324; border-radius: 12px; padding: 18px 20px; background-color: #0d0b08; background-image: url(${TILE}); background-size: 220px; }
        .argus .slab.gold { border-top: 3px solid ${ACCENT}; }
        .argus .slab.silver { border-top: 3px solid #9aa3b8; }
        .argus .slab h2 { margin: 0 0 10px; font-size: 1.15rem; letter-spacing: 3px; color: ${ACCENT}; }
        .argus .slab h3 { margin: 14px 0 4px; font-size: 0.95rem; color: #fff; }
        .argus .slab p { margin: 0 0 8px; font-size: 0.88rem; line-height: 1.6; color: #cfc8b8; }
        .argus .slab .footer { margin-top: 12px; font-size: 0.7rem; letter-spacing: 3px; color: #8a8272; }
        .argus .hint { padding: 0 20px 8px; font-size: 0.75rem; letter-spacing: 2px; color: #8a8272; }
        .argus .veil { position: fixed; inset: 0; z-index: 50; display: flex; flex-direction: column; gap: 16px; align-items: center; justify-content: center; background-image: linear-gradient(rgba(5,5,8,0.86), rgba(5,5,8,0.92)), url(${BG}); background-size: cover; background-position: center; color: ${ACCENT}; font-size: 0.8rem; letter-spacing: 4px; }
        .argus .empty { margin: 24px 20px; padding: 48px 24px; text-align: center; border: 1px dashed rgba(255,215,0,0.4); border-radius: 14px; background-image: linear-gradient(rgba(5,5,8,0.7), rgba(5,5,8,0.8)), url(${BG}); background-size: cover; background-position: center; color: #cfc8b8; }
        .argus .empty h2 { color: ${ACCENT}; letter-spacing: 3px; font-size: 1.1rem; margin: 12px 0 8px; }
        .argus .empty p { font-size: 0.9rem; line-height: 1.6; max-width: 46ch; margin: 0 auto; }
      `}</style>

      <header>
        <div className="banner" aria-hidden="true"><div className="shade" /></div>
        <div className="headtext">
          <div className="kicker">ARGUS // Observatory</div>
          <h1>ARCHITECTURAL LEGACY</h1>
          <div className="sub">Six orders of building, from marble temples to printed arcologies. Swipe the archive or use the arrows to flip through the eras.</div>
        </div>
      </header>

      {!ready && (
        <div className="veil" role="status" aria-label="Raising the archive">
          <IconSpin />
          RAISING THE ARCHIVE…
        </div>
      )}

      {ERAS.length === 0 ? (
        <div className="empty" role="status">
          <IconColumn />
          <h2>THE ARCHIVE IS EMPTY</h2>
          <p>No eras are catalogued in this wing yet. The halls are built — the exhibits are on their way.</p>
        </div>
      ) : (
      <>
      <div className="stage">
        <canvas ref={canvasRef} aria-label={"Architectural era illustration: " + era.name} />
      </div>

      <div className="fact" aria-live="polite">
        <p><strong style={{ color: era.accent, letterSpacing: 2 }}>{era.name}</strong> · {era.span} — {era.fact}</p>
      </div>

      <div className="controls">
        <button onClick={() => sceneRef.current && sceneRef.current.prev()} aria-label="Previous era"><IconPrev />PREV</button>
        <button onClick={() => sceneRef.current && sceneRef.current.next()} aria-label="Next era">NEXT<IconNext /></button>
        {ERAS.map((e, i) => (
          <button key={e.id} className={"dot" + (i === eraIdx ? " on" : "")} onClick={() => go(i)} aria-label={"Go to " + e.name} style={i === eraIdx ? {} : {}}>
            {i + 1}
          </button>
        ))}
        <button className={auto ? "on" : ""} onClick={() => setAuto(!auto)} aria-pressed={auto}>
          {auto ? <IconPause /> : <IconPlay />}AUTO-FLIP {auto ? "ON" : "OFF"}
        </button>
      </div>
      <div className="hint">SWIPE HORIZONTALLY TO FLIP THE ARCHIVE</div>
      </>
      )}

      <div className="slabs" aria-label="Archive slabs">
        {SLABS.map((s, i) => (
          <article key={s.id} className={"slab " + (i === 0 ? "gold" : "silver")}>
            <h2>{s.title}</h2>
            {s.sections.map(([h, p], j) => (
              <div key={j}>
                {h && <h3>{h}</h3>}
                <p>{p}</p>
              </div>
            ))}
            <div className="footer">{s.tag}</div>
          </article>
        ))}
      </div>
      <div aria-hidden="true" className="player-clear" />
    </main>
  );
}
