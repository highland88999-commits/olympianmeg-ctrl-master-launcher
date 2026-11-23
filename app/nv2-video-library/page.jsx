"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  CATALOG,
  CATEGORIES,
  categoryById,
  featuredEntry,
  filterCatalog,
  filterMyList,
  formatRuntime,
  isInMyList,
  paintPoster,
  paintEmblem,
  playableSrc,
  toggleMyList,
} from "./library";

/**
 * NV2 Video Library — a video-library catalog with no actual videos yet.
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
 *   - titles load from catalog.json (see library.js) — add a title there,
 *     no code change; a title with a local file plays in the player shell
 */

const MY_LIST_KEY = "nv2-my-list";

function PosterCanvas({ entry, animated, width = 320, height = 180 }) {
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
  }, [animated, width, height]);
  return (
    <canvas
      ref={ref}
      width={width}
      height={height}
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
const GlyphCheck = () => (<Nv2Glyph><path d="M4 12.5l5 5L20 6.5" /></Nv2Glyph>);
const GlyphX = () => (<Nv2Glyph><path d="M6 6l12 12 M18 6L6 18" /></Nv2Glyph>);
const GlyphPlay = () => (<Nv2Glyph><path d="M8 5.5v13l11-6.5Z" /></Nv2Glyph>);
const GlyphExpand = () => (<Nv2Glyph><path d="M4 9V5a1 1 0 0 1 1-1h4 M15 4h4a1 1 0 0 1 1 1v4 M20 15v4a1 1 0 0 1-1 1h-4 M9 20H5a1 1 0 0 1-1-1v-4" /></Nv2Glyph>);
const GlyphFilm = () => (
  <Nv2Glyph size={30}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M7.5 5v14 M16.5 5v14 M3 9.7h4.5 M3 14.3h4.5 M16.5 9.7H21 M16.5 14.3H21" />
  </Nv2Glyph>
);

function TitleCard({ entry, saved, onOpen, onToggleSave }) {
  return (
    <article className="nv2-card-wrap">
      <div
        className="nv2-card"
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        }}
        aria-label={`Open ${entry.title}`}
      >
        {entry.thumbUrl ? (
          <Image className="nv2-thumb-img" src={entry.thumbUrl} alt="" width={640} height={360} unoptimized />
        ) : (
          <PosterCanvas entry={entry} animated={false} />
        )}
        <div className="nv2-card-body">
          <h3>{entry.title}</h3>
          <div className="nv2-card-foot">
            <div className="nv2-meta">
              <span>{(categoryById(entry.category) || { name: "Your uploads" }).name}</span>
              <span>{formatRuntime(entry.minutes)}</span>
              {entry.demo && <span className="nv2-tag">DEMO</span>}
            </div>
            <button
              className={`nv2-save${saved ? " saved" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggleSave();
              }}
              aria-label={saved ? `Remove ${entry.title} from My List` : `Save ${entry.title} to My List`}
              aria-pressed={saved}
            >
              {saved ? <GlyphCheck /> : <GlyphPlus />}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function Nv2VideoLibraryPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [selected, setSelected] = useState(null);
  const [player, setPlayer] = useState(null);
  const [entries, setEntries] = useState(CATALOG);
  const [myList, setMyList] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(MY_LIST_KEY) || "[]");
      return Array.isArray(saved) ? saved.filter((x) => typeof x === "string") : [];
    } catch { return []; }
  });
  const fileRef = useRef(null);
  const playerRef = useRef(null);
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

  const toggleSave = (id) => {
    setMyList((prev) => {
      const next = toggleMyList(prev, id);
      try { localStorage.setItem(MY_LIST_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const browsing = !query.trim() && category === "all";
  const base = category === "mylist" ? filterMyList(entries, myList) : entries;
  const visible = filterCatalog(base, query, category === "mylist" ? "all" : category);
  const featured = featuredEntry(entries);
  const chips = [
    { id: "all", name: "Everything" },
    ...CATEGORIES,
    ...(entries.some((e) => e.category === "yours")
      ? [{ id: "yours", name: "Your uploads" }]
      : []),
    ...(myList.length > 0 ? [{ id: "mylist", name: "My List" }] : []),
  ];
  const rows = CATEGORIES
    .map((c) => ({ ...c, items: entries.filter((e) => e.category === c.id) }))
    .filter((r) => r.items.length > 0);
  const uploads = entries.filter((e) => e.category === "yours");

  const addUpload = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const url = URL.createObjectURL(file);
    const temp = document.createElement("video");
    temp.muted = true;
    temp.preload = "auto";
    temp.src = url;
    let done = false; // the seeked handler and the timeout must not both add
    const finish = (thumbUrl, minutes) => {
      if (done) return;
      done = true;
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

  const toggleFullscreen = () => {
    const el = playerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      el.requestFullscreen?.().catch(() => {});
    }
  };

  const openPlayer = (entry) => {
    setSelected(null);
    setPlayer(entry);
  };

  const selectedCat = selected ? categoryById(selected.category) : null;
  const playerSrc = player ? playableSrc(player) : null;

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
        .nv2-head, .nv2-bar, .nv2-grid, .nv2-hero, .nv2-rows { position:relative; z-index:1; }
        .nv2-add { display:inline-flex; align-items:center; gap:8px; }
        .nv2-watch { display:inline-flex; align-items:center; gap:8px; }
        .nv2-ambience-toggle { background:none; border:1px solid #444; color:#aaa; border-radius:999px; padding:.35rem .8rem; font-size:.72rem; letter-spacing:1px; cursor:pointer; font-family:inherit; display:inline-flex; align-items:center; gap:6px; }
        .nv2-ambience-toggle[aria-pressed="true"] { border-color:rgba(255,215,0,.55); color:#ffd700; }
        .nv2-grid { animation:nv2-rise .5s ease both; }
        @keyframes nv2-rise { from { opacity:0; transform:translateY(10px); } }
        .nv2-empty { display:flex; flex-direction:column; align-items:center; gap:12px; color:#888; padding:3rem 1rem; grid-column:1/-1; text-align:center; line-height:1.6; }
        .nv2-empty svg { opacity:.6; }
        @media (prefers-reduced-motion: reduce) { .nv2-ambient, .nv2-grid { animation:none; } }
        .nv2-head { padding:2.2rem 1.2rem 1.2rem; text-align:center; border-bottom:1px solid #2a2410; background:radial-gradient(ellipse at 50% -40px, rgba(255,215,0,.08), transparent 60%); }
        .nv2-head h1 { margin:.6rem 0 .2rem; font-size:clamp(1.4rem,5vw,2rem); letter-spacing:4px; color:#ffd700; }
        .nv2-head p { margin:0; color:#9a9a9a; font-size:.85rem; letter-spacing:1px; }
        .nv2-demo-note { display:inline-block; margin-top:.7rem; font-size:.72rem; color:#ffd700; border:1px solid rgba(255,215,0,.4); border-radius:999px; padding:.25rem .8rem; letter-spacing:1px; }
        .nv2-rights-note { margin:.6rem 0 0; color:#888; font-size:.8rem; letter-spacing:0; }
        .nv2-hero { max-width:1200px; margin:0 auto; padding:1.2rem 1.2rem 0; }
        .nv2-hero-poster { border-radius:14px; overflow:hidden; border:1px solid #262626; }
        .nv2-hero-poster .nv2-poster { width:100%; height:auto; }
        .nv2-hero-body { padding:1rem .2rem 0; }
        .nv2-hero-kicker { font-size:.72rem; letter-spacing:3px; color:#ffd700; }
        .nv2-hero-body h2 { margin:.3rem 0 .4rem; color:#fff; font-size:1.5rem; line-height:1.25; }
        .nv2-hero-body p { color:#bbb; line-height:1.6; margin:.4rem 0 0; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
        .nv2-hero-actions { display:flex; gap:.7rem; margin-top:.9rem; flex-wrap:wrap; }
        .nv2-hero-info { background:#1a1a1a; color:#eee; border:1px solid #444; border-radius:10px; padding:.8rem 1.2rem; font-weight:600; cursor:pointer; font-size:1rem; min-height:44px; font-family:inherit; }
        .nv2-bar { position:sticky; top:0; z-index:20; background:rgba(0,0,0,.92); padding:.8rem 1rem; border-bottom:1px solid #222; display:flex; flex-direction:column; gap:.7rem; }
        .nv2-search { width:100%; max-width:560px; margin:0 auto; display:flex; gap:.5rem; }
        .nv2-search input { flex:1; min-width:0; background:#111; border:1px solid #333; color:#fff; border-radius:10px; padding:.7rem .9rem; font-size:1rem; min-height:44px; font-family:inherit; }
        .nv2-search input:focus { outline:2px solid #ffd700; border-color:#ffd700; }
        .nv2-add { background:linear-gradient(145deg,#cfd6da,#7f8c8d); border:2px solid #ecf0f1; color:#1c2833; border-radius:10px; padding:.7rem 1rem; font-weight:700; cursor:pointer; min-height:44px; font-family:inherit; }
        .nv2-chips { display:flex; gap:.5rem; overflow-x:auto; padding-bottom:.2rem; justify-content:flex-start; scrollbar-width:none; }
        .nv2-chips::-webkit-scrollbar { display:none; }
        @media (min-width:700px){ .nv2-chips{ justify-content:center; } }
        .nv2-chip { white-space:nowrap; background:#141414; border:1px solid #333; color:#ccc; border-radius:999px; padding:.5rem 1rem; cursor:pointer; font-size:.85rem; font-family:inherit; min-height:44px; }
        .nv2-chip.active { border-color:#ffd700; color:#ffd700; box-shadow:0 0 8px rgba(255,215,0,.25); }
        .nv2-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:1rem; padding:1.2rem; max-width:1200px; margin:0 auto; }
        .nv2-rows { max-width:1200px; margin:0 auto; padding:0 0 1rem; }
        .nv2-row { padding:1.2rem 0 0; }
        .nv2-row-head { display:flex; align-items:baseline; gap:.7rem; padding:0 1.2rem .6rem; }
        .nv2-row-head h2 { margin:0; color:#fff; font-size:1.1rem; }
        .nv2-row-head span { color:#888; font-size:.8rem; }
        .nv2-row-scroll { display:flex; gap:.8rem; overflow-x:auto; padding:0 1.2rem .4rem; scroll-snap-type:x mandatory; scrollbar-width:none; }
        .nv2-row-scroll::-webkit-scrollbar { display:none; }
        .nv2-row-scroll .nv2-card-wrap { flex:0 0 220px; scroll-snap-align:start; }
        @media (max-width:360px){ .nv2-row-scroll .nv2-card-wrap { flex-basis:200px; } }
        .nv2-card-wrap { min-width:0; }
        .nv2-card { display:block; width:100%; background:#0c0c0c; border:1px solid #262626; border-radius:12px; overflow:hidden; cursor:pointer; text-align:left; padding:0; color:inherit; font-family:inherit; transition:transform .15s, border-color .15s; }
        .nv2-card:hover { transform:translateY(-3px); border-color:rgba(255,215,0,.5); }
        .nv2-card:focus-visible { outline:2px solid #ffd700; outline-offset:2px; }
        .nv2-poster { width:100%; height:auto; display:block; aspect-ratio:16/9; }
        .nv2-card-body { padding:.8rem .9rem 1rem; }
        .nv2-card-body h3 { margin:0 0 .5rem; font-size:1rem; color:#fff; }
        .nv2-card-foot { display:flex; align-items:center; justify-content:space-between; gap:.6rem; }
        .nv2-meta { display:flex; gap:.6rem; align-items:center; font-size:.75rem; color:#999; flex-wrap:wrap; }
        .nv2-tag { color:#ffd700; border:1px solid rgba(255,215,0,.35); border-radius:6px; padding:.1rem .45rem; font-size:.68rem; letter-spacing:.5px; }
        .nv2-save { flex:none; width:36px; height:36px; border-radius:50%; border:1px solid #444; background:#1a1a1a; color:#ccc; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; padding:0; }
        .nv2-save.saved { border-color:rgba(255,215,0,.7); color:#ffd700; }
        .nv2-overlay { position:fixed; inset:0; z-index:50; background:rgba(0,0,0,.85); display:flex; align-items:center; justify-content:center; padding:1rem; }
        .nv2-detail { position:relative; background:#0b0b0d; border:2px solid #ffd700; border-radius:16px; max-width:640px; width:100%; max-height:92dvh; overflow:auto; box-shadow:0 0 60px rgba(212,175,55,.25); }
        .nv2-detail .nv2-poster { border-radius:14px 14px 0 0; }
        .nv2-detail-body { padding:1.2rem 1.3rem 1.5rem; }
        .nv2-detail-body h2 { margin:0 0 .4rem; color:#fff; font-size:1.3rem; padding-right:52px; }
        .nv2-detail-body p { color:#bbb; line-height:1.6; }
        .nv2-orb { width:44px; height:44px; border-radius:50%; border:1px solid #555; background:rgba(0,0,0,.75); color:#ffd700; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; padding:0; flex:none; }
        .nv2-detail-close { position:absolute; top:.7rem; right:.7rem; z-index:2; }
        .nv2-detail-actions { display:flex; gap:.7rem; margin-top:.9rem; flex-wrap:wrap; align-items:center; }
        .nv2-watch { margin-top:0; background:#ffd700; color:#000; border:none; border-radius:10px; padding:.8rem 1.4rem; font-weight:700; cursor:pointer; font-size:1rem; min-height:44px; font-family:inherit; }
        .nv2-list-toggle { background:#1a1a1a; color:#eee; border:1px solid #444; border-radius:10px; padding:.8rem 1.2rem; font-weight:600; cursor:pointer; font-size:1rem; min-height:44px; font-family:inherit; }
        .nv2-player { position:relative; background:#000; border:2px solid #ffd700; border-radius:16px; max-width:880px; width:100%; max-height:92dvh; overflow:auto; box-shadow:0 0 60px rgba(212,175,55,.25); }
        .nv2-player-top { position:absolute; top:.7rem; right:.7rem; z-index:2; display:flex; gap:.5rem; }
        .nv2-player video { width:100%; display:block; background:#000; aspect-ratio:16/9; }
        .nv2-player-empty { padding:3.5rem 1.2rem 1.2rem; text-align:center; }
        .nv2-player-empty .nv2-poster { border-radius:10px; }
        .nv2-player-empty p { color:#bbb; line-height:1.6; margin:.9rem 0 0; }
        .nv2-player-empty-sub { color:#888 !important; font-size:.85rem; }
        .nv2-player-caption { padding:.9rem 1.2rem 1.2rem; border-top:1px solid #222; }
        .nv2-player-caption strong { color:#fff; font-size:1.05rem; }
        .nv2-thumb-img { width:100%; display:block; aspect-ratio:16/9; object-fit:cover; }
        .player-clear { height:calc(env(safe-area-inset-bottom, 0px) + 72px); }
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
        <p className="nv2-rights-note">Licensed titles arrive once rights are acquired.</p>
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

      {browsing && featured && (
        <section className="nv2-hero" aria-label="Featured title">
          <div className="nv2-hero-poster">
            {featured.thumbUrl ? (
              <Image className="nv2-thumb-img" src={featured.thumbUrl} alt="" width={1280} height={720} unoptimized />
            ) : (
              <PosterCanvas entry={featured} animated={ambience} width={640} height={360} />
            )}
          </div>
          <div className="nv2-hero-body">
            <span className="nv2-hero-kicker">FEATURED</span>
            <h2>{featured.title}</h2>
            <div className="nv2-meta">
              <span>{(categoryById(featured.category) || { name: "Your uploads" }).name}</span>
              <span>{formatRuntime(featured.minutes)}</span>
              {featured.demo && <span className="nv2-tag">DEMO</span>}
            </div>
            <p>{featured.blurb}</p>
            <div className="nv2-hero-actions">
              <button className="nv2-watch" onClick={() => openPlayer(featured)}>
                <GlyphPlay />
                <span>Watch</span>
              </button>
              <button className="nv2-hero-info" onClick={() => setSelected(featured)}>
                More info
              </button>
            </div>
          </div>
        </section>
      )}

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

      {browsing ? (
        <main className="nv2-rows">
          {entries.length === 0 && (
            <div className="nv2-empty">
              <GlyphFilm />
              <span>The shelves are empty for now — titles arrive once rights are acquired.</span>
            </div>
          )}
          {rows.map((row) => (
            <section className="nv2-row" key={row.id} aria-label={row.name}>
              <div className="nv2-row-head">
                <h2>{row.name}</h2>
                <span>{row.items.length} titles</span>
              </div>
              <div className="nv2-row-scroll">
                {row.items.map((entry) => (
                  <TitleCard
                    key={entry.id}
                    entry={entry}
                    saved={isInMyList(myList, entry.id)}
                    onOpen={() => setSelected(entry)}
                    onToggleSave={() => toggleSave(entry.id)}
                  />
                ))}
              </div>
            </section>
          ))}
          {uploads.length > 0 && (
            <section className="nv2-row" aria-label="Your uploads">
              <div className="nv2-row-head">
                <h2>Your uploads</h2>
                <span>{uploads.length} titles</span>
              </div>
              <div className="nv2-row-scroll">
                {uploads.map((entry) => (
                  <TitleCard
                    key={entry.id}
                    entry={entry}
                    saved={isInMyList(myList, entry.id)}
                    onOpen={() => setSelected(entry)}
                    onToggleSave={() => toggleSave(entry.id)}
                  />
                ))}
              </div>
            </section>
          )}
        </main>
      ) : (
        <main className="nv2-grid">
          {visible.length === 0 && (
            <div className="nv2-empty">
              <GlyphFilm />
              {entries.length === 0 ? (
                <span>The shelves are empty for now — titles arrive once rights are acquired.</span>
              ) : category === "mylist" ? (
                <span>Nothing saved yet — tap + on a title to keep it here.</span>
              ) : query ? (
                <span>Nothing matches “{query}”. Try a different search.</span>
              ) : (
                <span>Nothing in this row yet.</span>
              )}
            </div>
          )}
          {visible.map((entry) => (
            <TitleCard
              key={entry.id}
              entry={entry}
              saved={isInMyList(myList, entry.id)}
              onOpen={() => setSelected(entry)}
              onToggleSave={() => toggleSave(entry.id)}
            />
          ))}
        </main>
      )}

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
            <button
              className="nv2-orb nv2-detail-close"
              onClick={() => setSelected(null)}
              aria-label="Close"
            >
              <GlyphX />
            </button>
            {selected.thumbUrl ? (
              <Image className="nv2-thumb-img" src={selected.thumbUrl} alt="" width={640} height={360} unoptimized />
            ) : (
              <PosterCanvas entry={selected} animated={true} />
            )}
            <div className="nv2-detail-body">
              <h2>{selected.title}</h2>
              <div className="nv2-meta">
                <span>{(selectedCat || { name: "Your uploads" }).name}</span>
                <span>{formatRuntime(selected.minutes)}</span>
                {selected.demo && <span className="nv2-tag">DEMO ENTRY</span>}
              </div>
              <p>{selected.blurb}</p>
              {selected.demo && (
                <p>
                  <em>
                    Demo entry — there is no video file behind this one. The
                    poster above is art painted live on a canvas.
                  </em>
                </p>
              )}
              <div className="nv2-detail-actions">
                <button className="nv2-watch" onClick={() => openPlayer(selected)}>
                  <GlyphPlay />
                  <span>Watch</span>
                </button>
                <button
                  className="nv2-list-toggle"
                  onClick={() => toggleSave(selected.id)}
                  aria-pressed={isInMyList(myList, selected.id)}
                >
                  {isInMyList(myList, selected.id) ? "✓ In My List" : "+ My List"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {player && (
        <div
          className="nv2-overlay"
          onClick={() => setPlayer(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`Playing ${player.title}`}
        >
          <div className="nv2-player" ref={playerRef} onClick={(e) => e.stopPropagation()}>
            <div className="nv2-player-top">
              <button className="nv2-orb" onClick={() => setPlayer(null)} aria-label="Close player">
                <GlyphX />
              </button>
              <button className="nv2-orb" onClick={toggleFullscreen} aria-label="Fullscreen">
                <GlyphExpand />
              </button>
            </div>
            {playerSrc ? (
              <video src={playerSrc} controls autoPlay playsInline preload="metadata" />
            ) : (
              <div className="nv2-player-empty">
                {player.thumbUrl ? (
                  <Image className="nv2-thumb-img" src={player.thumbUrl} alt="" width={640} height={360} unoptimized />
                ) : (
                  <PosterCanvas entry={player} animated={false} width={640} height={360} />
                )}
                <p>No video file behind this title yet.</p>
                <p className="nv2-player-empty-sub">
                  Titles arrive once rights are acquired — the poster above is
                  art painted live on a canvas.
                </p>
              </div>
            )}
            <div className="nv2-player-caption">
              <strong>{player.title}</strong>
              <div className="nv2-meta">
                <span>{(categoryById(player.category) || { name: "Your uploads" }).name}</span>
                <span>{formatRuntime(player.minutes)}</span>
                {player.demo && <span className="nv2-tag">DEMO</span>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
