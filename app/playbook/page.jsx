'use client';

// THE SURVIVORS PLAYBOOK — an interactive reading of Merlin Ambros's book.
// Swipeable chapter carousel, progress bar, type-size control, chapter jump.
// Zero network calls; system fonts only.

import { useCallback, useEffect, useRef, useState } from "react";
import { BOOK, PAGES, pageCount, clampPage, progressOf } from "./book.js";

const FONT_SCALES = [0.92, 1.05, 1.22];

/* ATHENA interior treatment: inline SVG glyph set (zero image weight).
   Calm silver-blue + gold, matching the program's existing palette. */
function Glyph({ size = 14, children }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round"
      strokeLinejoin="round" aria-hidden="true" style={{ flex: "none" }}>
      {children}
    </svg>
  );
}
const GlyphTextSize = () => (
  <Glyph>
    <path d="M4 19 L11 5 L18 19" />
    <path d="M6.6 14.2 H15.4" />
    <path d="M20 3.5 V8 M18.2 3.5 H21.8" />
  </Glyph>
);
const GlyphStart = () => (
  <Glyph>
    <path d="M6 5 V19" />
    <path d="M19 5 L10 12 L19 19" />
  </Glyph>
);
const GlyphPrev = () => (
  <Glyph>
    <path d="M14.5 5.5 L8 12 L14.5 18.5" />
  </Glyph>
);
const GlyphNext = () => (
  <Glyph>
    <path d="M9.5 5.5 L16 12 L9.5 18.5" />
  </Glyph>
);
const GlyphBook = ({ size = 40 }) => (
  <Glyph size={size}>
    <path d="M12 5.5 C10 4 7 3.5 4 3.5 V19.5 C7 19.5 10 20 12 21.5 C14 20 17 19.5 20 19.5 V3.5 C17 3.5 14 4 12 5.5 Z" />
    <path d="M12 5.5 V21.5" />
  </Glyph>
);

function Block({ block }) {
  switch (block.type) {
    case "author":
      return (
        <div className="sp-author" style={{ textAlign: "center", color: "#00f2ff", letterSpacing: 3, textTransform: "uppercase", fontSize: "1.05em" }}>
          {block.text}
        </div>
      );
    case "h3":
      return <h3 className="sp-h3">{block.text}</h3>;
    case "quote":
      return <blockquote className="sp-quote">{block.text}</blockquote>;
    case "list":
      return (
        <ul className="sp-list">
          {block.items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      );
    case "sign":
      return (
        <p className="sp-sign">
          <strong>{block.text}</strong>
        </p>
      );
    default:
      return <p className="sp-p">{block.text}</p>;
  }
}

export default function SurvivorsPlaybook() {
  const trackRef = useRef(null);
  const [page, setPage] = useState(0);
  const [fontIx, setFontIx] = useState(1);
  const [reduced, setReduced] = useState(false);
  const [ready, setReady] = useState(false); // loading veil: fades once first paint lands
  const pageRef = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 650);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    setReduced(
      typeof window !== "undefined" &&
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
    try {
      const saved = Number(localStorage.getItem("sp-page") || 0);
      if (saved > 0 && saved < pageCount()) {
        setPage(saved);
        pageRef.current = saved;
        // jump the carousel to the saved page once layout is ready
        requestAnimationFrame(() => {
          const el = trackRef.current;
          if (el) el.scrollLeft = saved * el.clientWidth;
        });
      }
      const fs = Number(localStorage.getItem("sp-font") || 1);
      if (fs >= 0 && fs < FONT_SCALES.length) setFontIx(fs);
    } catch (e) {}
  }, []);

  const goTo = useCallback(
    (i) => {
      const el = trackRef.current;
      const p = clampPage(i);
      pageRef.current = p;
      setPage(p);
      try {
        localStorage.setItem("sp-page", String(p));
      } catch (e) {}
      if (el) {
        el.scrollTo({
          left: p * el.clientWidth,
          behavior: reduced ? "auto" : "smooth",
        });
      }
    },
    [reduced]
  );

  // keep page state in sync with manual swipes
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const p = clampPage(Math.round(el.scrollLeft / el.clientWidth));
        if (p !== pageRef.current) {
          pageRef.current = p;
          setPage(p);
          try {
            localStorage.setItem("sp-page", String(p));
          } catch (e) {}
        }
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowRight") goTo(pageRef.current + 1);
      if (e.key === "ArrowLeft") goTo(pageRef.current - 1);
      if (e.key === "Home") goTo(0);
      if (e.key === "End") goTo(pageCount() - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo]);

  const cycleFont = () => {
    const n = (fontIx + 1) % FONT_SCALES.length;
    setFontIx(n);
    try {
      localStorage.setItem("sp-font", String(n));
    } catch (e) {}
  };

  return (
    <>
    <div className="sp-root" style={{ fontSize: 16 * FONT_SCALES[fontIx] + "px" }}>
      {!ready && (
        <div className="sp-veil" aria-hidden="true">
          <GlyphBook />
          <span>The Survivors Playbook</span>
        </div>
      )}
      <style>{`
        .sp-root { position: fixed; inset: 0; color: #E0E0E0;
          font-family: Georgia, 'Times New Roman', serif; overflow: hidden;
          background:
            linear-gradient(rgba(5,5,9,0.84), rgba(5,5,9,0.9)),
            url('/images/playbook/bg.webp') center / cover no-repeat,
            #050507; }
        .sp-root::before { content: ""; position: fixed; inset: 0;
          background-image:
            linear-gradient(rgba(0,243,255,0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,243,255,0.05) 1px, transparent 1px);
          background-size: 30px 30px; pointer-events: none; z-index: 0; }
        .sp-chrome { position: absolute; top: 0; left: 0; right: 0; z-index: 10;
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 14px;
          background:
            linear-gradient(rgba(5,5,9,0.62), rgba(5,5,9,0.78)),
            url('/images/playbook/header.webp') center / cover no-repeat,
            rgba(5,5,7,0.88);
          border-bottom: 1px solid rgba(0,243,255,0.18); }
        .sp-title { font-family: ui-monospace, Menlo, monospace; color: #FFD700;
          letter-spacing: 3px; font-size: 12px; text-transform: uppercase; }
        .sp-tools { display: flex; gap: 8px; }
        .sp-btn { font-family: ui-monospace, Menlo, monospace; font-size: 12px;
          letter-spacing: 1px; color: #00f2ff; background: transparent;
          border: 1px solid rgba(0,243,255,0.4); border-radius: 6px;
          padding: 8px 12px; cursor: pointer; min-height: 40px;
          display: inline-flex; align-items: center; gap: 8px; }
        .sp-btn:active { background: rgba(0,243,255,0.15); }
        .sp-veil { position: fixed; inset: 0; z-index: 60; background: #050507;
          display: flex; flex-direction: column; align-items: center;
          justify-content: center; gap: 18px; color: #FFD700;
          font-family: ui-monospace, Menlo, monospace; font-size: 11px;
          letter-spacing: 4px; text-transform: uppercase;
          animation: sp-veil-out 0.6s ease 0.9s forwards; pointer-events: none; }
        .sp-veil svg { animation: sp-veil-breathe 1.6s ease-in-out infinite; }
        @keyframes sp-veil-out { to { opacity: 0; visibility: hidden; } }
        @keyframes sp-veil-breathe { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }
        .sp-progress { position: absolute; top: 0; left: 0; height: 3px; z-index: 11;
          background: linear-gradient(90deg, #FFD700, #00f2ff);
          transition: width 0.25s ease; }
        .sp-track { position: absolute; inset: 0; padding-top: 56px; z-index: 1;
          display: flex; overflow-x: auto; overflow-y: hidden;
          scroll-snap-type: x mandatory; scrollbar-width: none; }
        .sp-track::-webkit-scrollbar { display: none; }
        .sp-page { min-width: 100%; height: 100%; scroll-snap-align: start;
          overflow-y: auto; padding: 24px 18px 90px; box-sizing: border-box;
          display: flex; justify-content: center; }
        .sp-card { width: 100%; max-width: 760px;
          background:
            linear-gradient(rgba(16,16,22,0.93), rgba(16,16,22,0.95)),
            url('/images/playbook/panel-tile.webp');
          border: 1px solid rgba(0,243,255,0.2); border-radius: 6px;
          padding: clamp(22px, 4vw, 52px); height: fit-content; }
        .sp-kicker { font-family: ui-monospace, Menlo, monospace; color: #00f2ff;
          letter-spacing: 4px; font-size: 0.8em; text-transform: uppercase;
          margin-bottom: 10px; text-align: center; }
        .sp-h1 { font-family: ui-monospace, Menlo, monospace; color: #FFD700;
          text-transform: uppercase; letter-spacing: 2px; text-align: center;
          font-size: 1.9em; margin: 0 0 18px; line-height: 1.35;
          text-shadow: 0 0 12px rgba(255,215,0,0.35); }
        .sp-h2 { font-family: ui-monospace, Menlo, monospace; color: #00f2ff;
          text-transform: uppercase; letter-spacing: 2px; text-align: center;
          font-size: 1.35em; margin: 0 0 22px; line-height: 1.4;
          border-bottom: 1px solid rgba(0,243,255,0.3); padding-bottom: 16px; }
        .sp-h3 { font-family: ui-monospace, Menlo, monospace; color: #FFD700;
          font-size: 1.02em; margin: 26px 0 10px; border-left: 3px solid #00f2ff;
          padding-left: 12px; text-transform: uppercase; letter-spacing: 1px; }
        .sp-p { line-height: 1.85; font-size: 1.06em; margin: 0 0 18px; color: #D4D4D9; }
        .sp-quote { border-left: 2px solid #FFD700; margin: 18px 0; padding: 10px 20px;
          background: rgba(255,215,0,0.04); font-style: italic; color: #FFD700;
          line-height: 1.7; white-space: pre-line; }
        .sp-list { list-style: none; padding: 0; margin: 0 0 22px; }
        .sp-list li { margin-bottom: 14px; line-height: 1.75; font-size: 1.02em;
          position: relative; padding-left: 26px; color: #D4D4D9; }
        .sp-list li::before { content: "▸"; color: #FFD700; position: absolute;
          left: 2px; top: 1px; }
        .sp-sign { margin-top: 24px; color: #E8E8EC; font-size: 1.1em; }
        .sp-foot { text-align: center; font-family: ui-monospace, Menlo, monospace;
          color: rgba(255,215,0,0.55); font-size: 0.72em; letter-spacing: 3px;
          text-transform: uppercase; margin-top: 30px; padding-top: 18px;
          border-top: 1px solid rgba(0,243,255,0.15); }
        .sp-nav { position: absolute; bottom: 0; left: 0; right: 0; z-index: 10;
          display: flex; align-items: center; justify-content: space-between;
          padding: 12px 14px calc(12px + env(safe-area-inset-bottom));
          background: rgba(5,5,7,0.9); border-top: 1px solid rgba(0,243,255,0.18); }
        .sp-dots { display: flex; gap: 10px; }
        .sp-dot { width: 12px; height: 12px; border-radius: 50%;
          border: 1px solid #00f2ff; background: transparent; cursor: pointer; padding: 0; }
        .sp-dot.on { background: #FFD700; border-color: #FFD700; }
        .sp-count { font-family: ui-monospace, Menlo, monospace; color: #8f9bb3;
          font-size: 12px; letter-spacing: 2px; }
      `}</style>

      <div className="sp-progress" style={{ width: progressOf(page) * 100 + "%" }} />

      <div className="sp-chrome">
        <div className="sp-title">{BOOK.title}</div>
        <div className="sp-tools">
          <button className="sp-btn" onClick={cycleFont} aria-label="Change text size">
            <GlyphTextSize />
            <span>A{fontIx === 0 ? "−" : fontIx === 2 ? "+" : "±"}</span>
          </button>
          <button className="sp-btn" onClick={() => goTo(0)}>
            <GlyphStart />
            <span>START</span>
          </button>
        </div>
      </div>

      <div className="sp-track" ref={trackRef}>
        {PAGES.map((pg, i) => (
          <div className="sp-page" key={pg.id}>
            <div className="sp-card">
              {pg.kind === "cover" ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    minHeight: "55vh",
                  }}
                >
                  <h1 className="sp-h1">{pg.title}</h1>
                  {pg.blocks.map((b, bi) => (
                    <Block key={bi} block={b} />
                  ))}
                </div>
              ) : (
                <div>
                  {pg.kicker && <div className="sp-kicker">{pg.kicker}</div>}
                  <h2 className="sp-h2">{pg.title}</h2>
                  {pg.blocks.map((b, bi) => (
                    <Block key={bi} block={b} />
                  ))}
                </div>
              )}
              <div className="sp-foot">
                {BOOK.imprint} · {i + 1} / {pageCount()}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="sp-nav">
        <button
          className="sp-btn"
          onClick={() => goTo(page - 1)}
          disabled={page === 0}
          style={{ opacity: page === 0 ? 0.35 : 1 }}
        >
          <GlyphPrev />
          <span>PREV</span>
        </button>
        <div className="sp-dots" role="tablist" aria-label="Chapters">
          {PAGES.map((pg, i) => (
            <button
              key={pg.id}
              className={"sp-dot" + (i === page ? " on" : "")}
              onClick={() => goTo(i)}
              aria-label={"Go to " + (pg.kicker || pg.title)}
            />
          ))}
        </div>
        <button
          className="sp-btn"
          onClick={() => goTo(page + 1)}
          disabled={page === pageCount() - 1}
          style={{ opacity: page === pageCount() - 1 ? 0.35 : 1 }}
        >
          <span>NEXT</span>
          <GlyphNext />
        </button>
      </div>
      <div
        className="sp-count"
        style={{ position: "absolute", bottom: 64, right: 16, zIndex: 10 }}
      >
        {page + 1} / {pageCount()}
      </div>
    </div>
    {/* Safari bottom-bar clearance: blank space under the fixed reader viewport */}
    <div aria-hidden="true" className="player-clear" />
    </>
  );
}
