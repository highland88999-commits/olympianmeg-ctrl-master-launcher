"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  CATALOG,
  CATEGORIES,
  categoryById,
  filterCatalog,
  formatRuntime,
  paintPoster,
  paintEmblem,
} from "./library";

/**
 * NV2 Video Library — a video-library catalog with no actual videos.
 *
 * Source audit: the original "Panning Core" page shipped a silent telemetry
 * uplink (per-minute ping to a hosted database), pulled three.js and GSAP
 * from CDNs, and listed four "videos" that all pointed at the same sample
 * clip on a tutorial site with stock-photo thumbnails hotlinked from the web.
 * All of that is gone here:
 *   - no telemetry, no IP lookup, no database keys, no CDN scripts
 *   - no remote video files, no hotlinked thumbnails, no iframes
 *   - the catalog is explicit demo content; posters are painted on canvas
 *   - "Add" entries come from the visitor's own device and never leave it
 */

function PosterCanvas({ entry, animated }) {
  const ref = useRef(null);
  const entryRef = useRef(entry);
  entryRef.current = entry;
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const w = canvas.width;
    const h = canvas.height;
    paintPoster(ctx, w, h, entryRef.current, 0);
    if (!animated || reduced) return;
    let raf = 0;
    const t0 = performance.now();
    const draw = () => {
      paintPoster(ctx, w, h, entryRef.current, (performance.now() - t0) / 1000);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [animated]);
  return (
    <canvas
      ref={ref}
      width={320}
      height={180}
      className="nv2-poster"
      aria-label={`Poster art for ${entry.title}`}
    />
  );
}

function Emblem() {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    paintEmblem(ctx, 84, 0);
    if (reduced) return;
    let raf = 0;
    const t0 = performance.now();
    const draw = () => {
      paintEmblem(ctx, 84, (performance.now() - t0) / 1000);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} width={84} height={84} aria-hidden="true" />;
}

/* ATHENA interior treatment: inline SVG glyph set for the buttons
   (zero image weight). */
function Nv2Glyph({ size = 15, children }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round"
      strokeLinejoin="round" aria-hidden="true" style={{ flex: "none" }}>
      {children}
    </svg>
  );
}
const GlyphPlus = () => (<Nv2Glyph><path d="M12 5v14 M5 12h14" /></Nv2Glyph>);
const GlyphX = () => (<Nv2Glyph><path d="M6 6l12 12 M18 6L6 18" /></Nv2Glyph>);
const GlyphPlay = () => (<Nv2Glyph><path d="M8 5.5v13l11-6.5Z" /></Nv2Glyph>);
const GlyphFilm = () => (
  <Nv2Glyph size={30}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M7.5 5v14 M16.5 5v14 M3 9.7h4.5 M3 14.3h4.5 M16.5 9.7H21 M16.5 14.3H21" />
  </Nv2Glyph>
);

export default function Nv2VideoLibraryPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [selected, setSelected] = useState(null);
  const [entries, setEntries] = useState(CATALOG);
  const fileRef = useRef(null);
  // ATHENA interior treatment: calm CSS ambience layer (replaces the planned
  // generated video for mobile perf). Respects reduced-motion; persisted.
  const [ambience, setAmbience] = useState(() => {
    try {
      const saved = localStorage.getItem("nv2-ambience");
      if (saved !== null) return saved === "1";
      return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch { return true; }
  });
  const toggleAmbience = () => {
    setAmbience((v) => {
      try { localStorage.setItem("nv2-ambience", v ? "0" : "1"); } catch {}
      return !v;
    });
  };

  const visible = filterCatalog(entries, query, category);
  const chips = [
    { id: "all", name: "Everything" },
    ...CATEGORIES,
    ...(entries.some((e) => e.category === "yours")
      ? [{ id: "yours", name: "Your uploads" }]
      : []),
  ];

  const addUpload = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const url = URL.createObjectURL(file);
    const temp = document.createElement("video");
    temp.muted = true;
    temp.preload = "auto";
    temp.src = url;
    const finish = (thumbUrl, minutes) => {
      setEntries((prev) => [
        {
          id: `upload-${Date.now()}`,
          title: file.name.replace(/\.[a-z0-9]+$/i, ""),
          category: "yours",
          minutes,
          blurb: "Added from your device. It never leaves this browser.",
          seed: (Math.random() * 1e9) | 0,
          demo: false,
          blobUrl: url,
          thumbUrl,
        },
        ...prev,
      ]);
      setCategory("yours");
    };
    temp.onloadedmetadata = () => {
      const seekTo = Math.min(1, (temp.duration || 2) / 2);
      const onSeeked = () => {
        temp.removeEventListener("seeked", onSeeked);
        const c = document.createElement("canvas");
        c.width = 320;
        c.height = 180;
        const cx = c.getContext("2d");
        // cover-fit the frame
        const vr = temp.videoWidth / temp.videoHeight;
        const cr = 320 / 180;
        let sw, sh, sx, sy;
        if (vr > cr) {
          sh = temp.videoHeight;
          sw = sh * cr;
          sx = (temp.videoWidth - sw) / 2;
          sy = 0;
        } else {
          sw = temp.videoWidth;
          sh = sw / cr;
          sx = 0;
          sy = (temp.videoHeight - sh) / 2;
        }
        cx.drawImage(temp, sx, sy, sw, sh, 0, 0, 320, 180);
        finish(
          c.toDataURL("image/jpeg", 0.7),
          Math.max(1, Math.round((temp.duration || 60) / 60))
        );
      };
      temp.addEventListener("seeked", onSeeked);
      try {
        temp.currentTime = seekTo;
      } catch {
        onSeeked();
      }
      setTimeout(() => finish(null, 1), 4000); // never hang on a bad file
    };
    temp.onerror = () => finish(null, 1);
  };

  const selectedCat = selected ? categoryById(selected.category) : null;

  return (
    <div className="nv2-root">
      <div className="nv2-bg" aria-hidden="true" />
      {ambience && <div className="nv2-ambient" aria-hidden="true" />}
      <style>{`
        .nv2-root { background:#000; color:#eee; min-height:100dvh; font-family:'Segoe UI',system-ui,sans-serif; position:relative; }
        .nv2-bg { position:fixed; inset:0; z-index:0; pointer-events:none;
          background:linear-gradient(rgba(3,7,18,0.84), rgba(3,7,18,0.91)), url('/images/nv2-video-library/bg.webp') center / cover no-repeat, #030712; }
        .nv2-ambient { position:fixed; inset:-15%; z-index:0; pointer-events:none; opacity:.55;
          background:radial-gradient(ellipse 42% 30% at 28% 18%, rgba(147,197,253,.13), transparent 70%),
                     radial-gradient(ellipse 36% 26% at 72% 62%, rgba(255,215,0,.07), transparent 70%);
          animation:nv2-drift 16s ease-in-out infinite alternate; }
        @keyframes nv2-drift { from { transform:translate3d(-3%,-2%,0) rotate(-1deg); } to { transform:translate3d(3%,2%,0) rotate(1deg); } }
        .nv2-head, .nv2-bar, .nv2-grid { position:relative; z-index:1; }
        .nv2-add { display:inline-flex; align-items:center; gap:8px; }
        .nv2-close { display:inline-flex; align-items:center; gap:6px; }
        .nv2-watch { display:inline-flex; align-items:center; gap:8px; }
        .nv2-ambience-toggle { background:none; border:1px solid #444; color:#aaa; border-radius:999px; padding:.35rem .8rem; font-size:.72rem; letter-spacing:1px; cursor:pointer; font-family:inherit; display:inline-flex; align-items:center; gap:6px; }
        .nv2-ambience-toggle[aria-pressed="true"] { border-color:rgba(255,215,0,.55); color:#ffd700; }
        .nv2-grid { animation:nv2-rise .5s ease both; }
        @keyframes nv2-rise { from { opacity:0; transform:translateY(10px); } }
        .nv2-empty { display:flex; flex-direction:column; align-items:center; gap:12px; color:#888; padding:3rem 1rem; grid-column:1/-1; }
        .nv2-empty svg { opacity:.6; }
        @media (prefers-reduced-motion: reduce) { .nv2-ambient, .nv2-grid { animation:none; } }
        .nv2-head { padding:2.2rem 1.2rem 1.2rem; text-align:center; border-bottom:1px solid #2a2410; background:radial-gradient(ellipse at 50% -40px, rgba(255,215,0,.08), transparent 60%); }
        .nv2-head h1 { margin:.6rem 0 .2rem; font-size:clamp(1.4rem,5vw,2rem); letter-spacing:4px; color:#ffd700; }
        .nv2-head p { margin:0; color:#9a9a9a; font-size:.85rem; letter-spacing:1px; }
        .nv2-demo-note { display:inline-block; margin-top:.7rem; font-size:.72rem; color:#ffd700; border:1px solid rgba(255,215,0,.4); border-radius:999px; padding:.25rem .8rem; letter-spacing:1px; }
        .nv2-bar { position:sticky; top:0; z-index:20; background:rgba(0,0,0,.92); padding:.8rem 1rem; border-bottom:1px solid #222; display:flex; flex-direction:column; gap:.7rem; }
        .nv2-search { width:100%; max-width:560px; margin:0 auto; display:flex; gap:.5rem; }
        .nv2-search input { flex:1; background:#111; border:1px solid #333; color:#fff; border-radius:10px; padding:.7rem .9rem; font-size:1rem; min-height:44px; font-family:inherit; }
        .nv2-search input:focus { outline:2px solid #ffd700; border-color:#ffd700; }
        .nv2-add { background:linear-gradient(145deg,#cfd6da,#7f8c8d); border:2px solid #ecf0f1; color:#1c2833; border-radius:10px; padding:.7rem 1rem; font-weight:700; cursor:pointer; min-height:44px; font-family:inherit; }
        .nv2-chips { display:flex; gap:.5rem; overflow-x:auto; padding-bottom:.2rem; justify-content:flex-start; }
        @media (min-width:700px){ .nv2-chips{ justify-content:center; } }
        .nv2-chip { white-space:nowrap; background:#141414; border:1px solid #333; color:#ccc; border-radius:999px; padding:.5rem 1rem; cursor:pointer; font-size:.85rem; font-family:inherit; min-height:44px; }
        .nv2-chip.active { border-color:#ffd700; color:#ffd700; box-shadow:0 0 8px rgba(255,215,0,.25); }
        .nv2-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:1rem; padding:1.2rem; max-width:1200px; margin:0 auto; }
        .nv2-card { background:#0c0c0c; border:1px solid #262626; border-radius:12px; overflow:hidden; cursor:pointer; text-align:left; padding:0; color:inherit; font-family:inherit; transition:transform .15s, border-color .15s; }
        .nv2-card:hover { transform:translateY(-3px); border-color:rgba(255,215,0,.5); }
        .nv2-poster { width:100%; height:auto; display:block; aspect-ratio:16/9; }
        .nv2-card-body { padding:.8rem .9rem 1rem; }
        .nv2-card-body h3 { margin:0 0 .3rem; font-size:1rem; color:#fff; }
        .nv2-meta { display:flex; gap:.6rem; align-items:center; font-size:.75rem; color:#999; }
        .nv2-tag { color:#ffd700; border:1px solid rgba(255,215,0,.35); border-radius:6px; padding:.1rem .45rem; font-size:.68rem; letter-spacing:.5px; }
        .nv2-empty { text-align:center; color:#888; padding:3rem 1rem; grid-column:1/-1; }
        .nv2-overlay { position:fixed; inset:0; z-index:50; background:rgba(0,0,0,.85); display:flex; align-items:center; justify-content:center; padding:1rem; }
        .nv2-detail { background:#0b0b0d; border:2px solid #ffd700; border-radius:16px; max-width:640px; width:100%; max-height:92dvh; overflow:auto; box-shadow:0 0 60px rgba(212,175,55,.25); }
        .nv2-detail .nv2-poster { border-radius:14px 14px 0 0; }
        .nv2-detail-body { padding:1.2rem 1.3rem 1.5rem; }
        .nv2-detail-body h2 { margin:0 0 .4rem; color:#fff; font-size:1.3rem; }
        .nv2-detail-body p { color:#bbb; line-height:1.6; }
        .nv2-close { float:right; background:none; border:1px solid #555; color:#ffd700; border-radius:8px; font-size:1rem; cursor:pointer; padding:.4rem .8rem; min-height:44px; font-family:inherit; }
        .nv2-watch { display:inline-block; margin-top:.6rem; background:#ffd700; color:#000; border:none; border-radius:10px; padding:.8rem 1.4rem; font-weight:700; cursor:pointer; font-size:1rem; min-height:44px; font-family:inherit; }
        .nv2-detail video { width:100%; border-radius:10px; margin-top:.8rem; background:#000; }
        .nv2-thumb-img { width:100%; display:block; aspect-ratio:16/9; object-fit:cover; }
      `}</style>

      <header className="nv2-head">
        <Emblem />
        <h1>NV2 VIDEO LIBRARY</h1>
        <p>THE PANNING CORE</p>
        <div>
          <span className="nv2-demo-note">
            DEMO CATALOG — POSTERS ARE GENERATED ART, NOT VIDEO FILES
          </span>
        </div>
        <div style={{ marginTop: ".6rem" }}>
          <button
            className="nv2-ambience-toggle"
            aria-pressed={ambience}
            onClick={toggleAmbience}
            title="Toggle the calm ambient light drift"
          >
            Ambience {ambience ? "On" : "Off"}
          </button>
        </div>
      </header>

      <div className="nv2-bar">
        <div className="nv2-search">
          <input
            type="search"
            placeholder="Search titles…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search the catalog"
          />
          <button className="nv2-add" onClick={() => fileRef.current?.click()}>
            <GlyphPlus />
            <span>Add</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="video/*"
            style={{ display: "none" }}
            onChange={addUpload}
            aria-label="Add a video from your device"
          />
        </div>
        <div className="nv2-chips" role="tablist" aria-label="Categories">
          {chips.map((c) => (
            <button
              key={c.id}
              role="tab"
              aria-selected={category === c.id}
              className={`nv2-chip${category === c.id ? " active" : ""}`}
              onClick={() => setCategory(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <main className="nv2-grid">
        {visible.length === 0 && (
          <div className="nv2-empty">
            <GlyphFilm />
            <span>Nothing matches “{query}”. Try a different search.</span>
          </div>
        )}
        {visible.map((entry) => (
          <button
            key={entry.id}
            className="nv2-card"
            onClick={() => setSelected(entry)}
            aria-label={`Open ${entry.title}`}
          >
            {entry.thumbUrl ? (
              <Image className="nv2-thumb-img" src={entry.thumbUrl} alt="" width={640} height={360} unoptimized />
            ) : (
              <PosterCanvas entry={entry} animated={false} />
            )}
            <div className="nv2-card-body">
              <h3>{entry.title}</h3>
              <div className="nv2-meta">
                <span>{(categoryById(entry.category) || { name: "Your uploads" }).name}</span>
                <span>{formatRuntime(entry.minutes)}</span>
                {entry.demo && <span className="nv2-tag">DEMO</span>}
              </div>
            </div>
          </button>
        ))}
      </main>

      {/* Safari bottom-bar clearance */}
      <div aria-hidden="true" className="player-clear" />

      {selected && (
        <div
          className="nv2-overlay"
          onClick={() => setSelected(null)}
          role="dialog"
          aria-modal="true"
          aria-label={selected.title}
        >
          <div className="nv2-detail" onClick={(e) => e.stopPropagation()}>
            {selected.thumbUrl ? (
              <Image className="nv2-thumb-img" src={selected.thumbUrl} alt="" width={640} height={360} unoptimized />
            ) : (
              <PosterCanvas entry={selected} animated={true} />
            )}
            <div className="nv2-detail-body">
              <button className="nv2-close" onClick={() => setSelected(null)} aria-label="Close">
                <GlyphX />
              </button>
              <h2>{selected.title}</h2>
              <div className="nv2-meta">
                <span>{(selectedCat || { name: "Your uploads" }).name}</span>
                <span>{formatRuntime(selected.minutes)}</span>
                {selected.demo && <span className="nv2-tag">DEMO ENTRY</span>}
              </div>
              <p>{selected.blurb}</p>
              {selected.demo ? (
                <p>
                  <em>
                    Demo entry — there is no video file behind this one. The
                    poster above is art painted live on a canvas.
                  </em>
                </p>
              ) : (
                selected.blobUrl && (
                  <video src={selected.blobUrl} controls playsInline preload="metadata" />
                )
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
