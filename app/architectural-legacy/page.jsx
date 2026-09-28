"use client";

import { useEffect, useRef, useState } from "react";
import { createScene, ERAS, SLABS, ACCENT, nextEra, prevEra } from "./scene";

export default function ArchitecturalLegacyPage() {
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const [eraIdx, setEraIdx] = useState(0);
  const [auto, setAuto] = useState(false);

  useEffect(() => {
    document.title = "Architectural Legacy — ARGUS Observatory";
    const s = createScene(canvasRef.current, { onEra: setEraIdx });
    sceneRef.current = s;
    return () => s.destroy();
  }, []);

  useEffect(() => { sceneRef.current && sceneRef.current.setAuto(auto); }, [auto]);

  function go(i) { sceneRef.current && sceneRef.current.goTo(i, i > eraIdx ? 1 : -1); }
  const era = ERAS[eraIdx];

  return (
    <main className="argus">
      <style>{`
        .argus { min-height: 100dvh; background: #050508; color: #ece7db; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; display: flex; flex-direction: column; }
        .argus header { padding: 18px 20px 10px; }
        .argus .kicker { font-size: 11px; letter-spacing: 4px; color: ${ACCENT}; text-transform: uppercase; }
        .argus h1 { margin: 4px 0 2px; font-size: clamp(1.6rem, 5vw, 2.6rem); letter-spacing: 6px; font-weight: 800; }
        .argus .sub { color: #9d968a; font-size: 0.9rem; max-width: 62ch; }
        .argus .stage { position: relative; margin: 10px 16px 0; border: 1px solid #3a3324; border-radius: 14px; overflow: hidden; height: min(58dvh, 520px); min-height: 300px; background: #050508; }
        .argus canvas { width: 100%; height: 100%; display: block; touch-action: pan-y; cursor: grab; outline: none; }
        .argus .fact { margin: 12px 20px 0; padding: 14px 16px; border-left: 3px solid ${era.accent}; background: #0b0a08; border-radius: 0 10px 10px 0; }
        .argus .fact p { margin: 0; font-size: 0.92rem; line-height: 1.6; color: #ddd6c6; }
        .argus .controls { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; padding: 14px 20px; }
        .argus button { min-height: 44px; min-width: 44px; padding: 10px 16px; border-radius: 8px; border: 1px solid #3a3324; background: #100e0a; color: #ece7db; font-size: 0.8rem; letter-spacing: 1px; cursor: pointer; }
        .argus button.on { background: ${ACCENT}; border-color: ${ACCENT}; color: #0d0a04; font-weight: 700; }
        .argus .dot { width: 44px; height: 44px; border-radius: 50%; padding: 0; display: inline-flex; align-items: center; justify-content: center; }
        .argus .dot.on { background: ${era.accent}; border-color: ${era.accent}; }
        .argus .slabs { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 14px; padding: 6px 20px 24px; }
        .argus .slab { border: 1px solid #3a3324; border-radius: 12px; padding: 18px 20px; background: linear-gradient(180deg, #0d0b08, #080706); }
        .argus .slab.gold { border-top: 3px solid ${ACCENT}; }
        .argus .slab.silver { border-top: 3px solid #9aa3b8; }
        .argus .slab h2 { margin: 0 0 10px; font-size: 1.15rem; letter-spacing: 3px; color: ${ACCENT}; }
        .argus .slab h3 { margin: 14px 0 4px; font-size: 0.95rem; color: #fff; }
        .argus .slab p { margin: 0 0 8px; font-size: 0.88rem; line-height: 1.6; color: #cfc8b8; }
        .argus .slab .footer { margin-top: 12px; font-size: 0.7rem; letter-spacing: 3px; color: #8a8272; }
        .argus .hint { padding: 0 20px 8px; font-size: 0.75rem; letter-spacing: 2px; color: #8a8272; }
      `}</style>

      <header>
        <div className="kicker">ARGUS // Observatory</div>
        <h1>ARCHITECTURAL LEGACY</h1>
        <div className="sub">Six orders of building, from marble temples to printed arcologies. Swipe the archive or use the arrows to flip through the eras.</div>
      </header>

      <div className="stage">
        <canvas ref={canvasRef} aria-label={"Architectural era illustration: " + era.name} />
      </div>

      <div className="fact" aria-live="polite">
        <p><strong style={{ color: era.accent, letterSpacing: 2 }}>{era.name}</strong> · {era.span} — {era.fact}</p>
      </div>

      <div className="controls">
        <button onClick={() => sceneRef.current && sceneRef.current.prev()} aria-label="Previous era">← PREV</button>
        <button onClick={() => sceneRef.current && sceneRef.current.next()} aria-label="Next era">NEXT →</button>
        {ERAS.map((e, i) => (
          <button key={e.id} className={"dot" + (i === eraIdx ? " on" : "")} onClick={() => go(i)} aria-label={"Go to " + e.name} style={i === eraIdx ? {} : {}}>
            {i + 1}
          </button>
        ))}
        <button className={auto ? "on" : ""} onClick={() => setAuto(!auto)} aria-pressed={auto}>
          AUTO-FLIP {auto ? "ON" : "OFF"}
        </button>
      </div>
      <div className="hint">SWIPE HORIZONTALLY TO FLIP THE ARCHIVE</div>

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
      <div aria-hidden="true" className="h-[max(5rem,env(safe-area-inset-bottom))]" />
    </main>
  );
}
