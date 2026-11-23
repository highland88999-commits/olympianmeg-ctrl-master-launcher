/**
 * library.js — the NV2 catalog.
 *
 * The source repo was a 3D "panning core" that pretended to be a video
 * library: four entries, all pointing at the same sample MP4 on a tutorial
 * site, with placeholder photos hotlinked from a stock-photo service. There
 * are no real videos here, and this module is honest about it: it is a
 * catalog UI — search, categories, procedural poster art, detail views —
 * built around demo entries. Posters are painted on canvas from each entry's
 * seed, so every visit looks the same and nothing downloads.
 *
 * HOW TO ADD A TITLE (no code change, no fetch, no remote anything):
 *   1. If the title has a video file, drop it under
 *      public/videos/nv2-library/ — the file stays on this site.
 *   2. Add one row to catalog.json next to this file:
 *      { "title": "…", "category": "cosmos", "minutes": 12,
 *        "blurb": "…", "src": "/videos/nv2-library/<file>" }
 *      Leave "src" off for a demo entry (poster art only, no video file).
 *   3. Done — the page reads catalog.json at build time. Rows with a
 *      missing title or an unknown category are dropped, never shown.
 *   Device-added files (the Add button) are separate: they play from the
 *   visitor's own device and never leave the browser.
 */

import CATALOG_ROWS from "./catalog.json" with { type: "json" };

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const CATEGORIES = [
  { id: "cosmos", name: "Cosmos", motif: "nebula", hue: [210, 290] },
  { id: "neon", name: "Neon City", motif: "grid", hue: [300, 340] },
  { id: "nature", name: "Nature", motif: "ridge", hue: [90, 160] },
  { id: "deep", name: "Deep Sea", motif: "current", hue: [180, 220] },
  { id: "pulse", name: "Pulse Lab", motif: "rings", hue: [40, 70] },
];

export function categoryById(id) {
  return CATEGORIES.find((c) => c.id === id) || null;
}

/**
 * Turn raw catalog rows into clean entries. Bad rows are dropped, never
 * shown: a row needs a title and a known category. Minutes default to 5.
 * A row is a demo entry (poster art only, no video file) unless it carries
 * a local src under /videos/nv2-library/ — remote video paths are never
 * accepted, so nothing here can point off-site.
 */
export function normalizeCatalog(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const entries = [];
  const dropped = [];
  list.forEach((row, index) => {
    const title = typeof row?.title === "string" ? row.title.trim() : "";
    if (!title) {
      dropped.push({ index, reason: "missing title" });
      return;
    }
    if (!categoryById(row.category)) {
      dropped.push({ index, reason: `unknown category ${String(row.category)}` });
      return;
    }
    const n = Number(row.minutes);
    const minutes = Number.isFinite(n) && n > 0 ? Math.round(n) : 5;
    const src =
      typeof row.src === "string" && row.src.startsWith("/videos/nv2-library/")
        ? row.src
        : null;
    const demo = row.demo === undefined ? src === null : row.demo === true;
    entries.push({
      id: typeof row.id === "string" && row.id ? row.id : `demo-${index + 1}`,
      title,
      category: row.category,
      minutes,
      blurb: typeof row.blurb === "string" ? row.blurb : "",
      seed: Number.isFinite(Number(row.seed)) ? Number(row.seed) : 1000 + index * 131,
      demo,
      src,
      featured: row.featured === true,
    });
  });
  return { entries, dropped };
}

/** Full catalog with stable ids, seeds and runtimes. */
export const CATALOG = normalizeCatalog(CATALOG_ROWS).entries;

/** The title the hero spotlights: the flagged row, else the first title. */
export function featuredEntry(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  return entries.find((e) => e.featured) || entries[0];
}

/** Pure My List helpers — the page persists the id list in localStorage. */
export function toggleMyList(list, id) {
  const ids = Array.isArray(list) ? list : [];
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

export function isInMyList(list, id) {
  return Array.isArray(list) && list.includes(id);
}

export function filterMyList(entries, ids) {
  const set = new Set(Array.isArray(ids) ? ids : []);
  return (Array.isArray(entries) ? entries : []).filter((e) => set.has(e.id));
}

/** The video a title can actually play: a device upload, else its local file. */
export function playableSrc(entry) {
  if (!entry) return null;
  if (typeof entry.blobUrl === "string" && entry.blobUrl) return entry.blobUrl;
  if (typeof entry.src === "string" && entry.src) return entry.src;
  return null;
}

/** Pure search + filter. Query matches title and blurb, case-insensitive. */
export function filterCatalog(entries, query, categoryId) {
  const q = (query || "").trim().toLowerCase();
  return entries.filter((e) => {
    if (categoryId && categoryId !== "all" && e.category !== categoryId) return false;
    if (!q) return true;
    return (
      e.title.toLowerCase().includes(q) || e.blurb.toLowerCase().includes(q)
    );
  });
}

export function formatRuntime(minutes) {
  return `${minutes} min`;
}

// ---------- procedural poster art ----------

function motifNebula(ctx, w, h, rng, hueA, hueB) {
  ctx.fillStyle = "#05030c";
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 9; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const r = 30 + rng() * 70;
    const hue = hueA + rng() * (hueB - hueA);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `hsla(${hue},90%,60%,0.7)`);
    g.addColorStop(1, "hsla(0,0%,0%,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.fillStyle = "#fff";
  for (let i = 0; i < 60; i++) ctx.fillRect(rng() * w, rng() * h, 1.5, 1.5);
  ctx.globalCompositeOperation = "source-over";
}

function motifGrid(ctx, w, h, rng, hueA) {
  ctx.fillStyle = "#0a0410";
  ctx.fillRect(0, 0, w, h);
  const horizon = h * 0.55;
  // sun
  const sg = ctx.createRadialGradient(w / 2, horizon, 0, w / 2, horizon, 70);
  sg.addColorStop(0, `hsla(${hueA},100%,65%,0.95)`);
  sg.addColorStop(1, "hsla(0,0%,0%,0)");
  ctx.fillStyle = sg;
  ctx.fillRect(0, 0, w, h);
  // grid
  ctx.strokeStyle = `hsla(${hueA},90%,60%,0.8)`;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 12; i++) {
    const x = (i / 12) * w;
    ctx.beginPath();
    ctx.moveTo(w / 2 + (x - w / 2) * 0.2, horizon);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let i = 0; i < 6; i++) {
    const y = horizon + (i / 6) * (h - horizon);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

function motifRidge(ctx, w, h, rng, hueA, hueB) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, `hsl(${hueA},45%,22%)`);
  sky.addColorStop(1, `hsl(${hueB},50%,8%)`);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  for (let layer = 0; layer < 3; layer++) {
    const base = h * (0.45 + layer * 0.18);
    ctx.fillStyle = `hsla(${hueA},40%,${14 - layer * 3}%,0.95)`;
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, base);
    for (let x = 0; x <= w; x += 8) {
      const y = base - Math.abs(Math.sin(x * 0.05 + layer * 2 + rng() * 0.6)) * (20 + layer * 14);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
  }
  // sun / moon disc
  ctx.fillStyle = `hsla(${hueB},60%,75%,0.9)`;
  ctx.beginPath();
  ctx.arc(w * 0.72, h * 0.26, 16, 0, Math.PI * 2);
  ctx.fill();
}

function motifCurrent(ctx, w, h, rng, hueA, hueB) {
  ctx.fillStyle = "#020a12";
  ctx.fillRect(0, 0, w, h);
  ctx.lineWidth = 2;
  for (let i = 0; i < 14; i++) {
    const y0 = rng() * h;
    const hue = hueA + rng() * (hueB - hueA);
    ctx.strokeStyle = `hsla(${hue},85%,55%,${0.25 + rng() * 0.5})`;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 6) {
      const y = y0 + Math.sin(x * 0.04 + i) * 14;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.fillStyle = "#bfefff";
  for (let i = 0; i < 40; i++) {
    const y = rng() * h;
    ctx.globalAlpha = 0.15 + rng() * 0.4;
    ctx.fillRect(rng() * w, y - rng() * 8, 1.5, 1.5);
  }
  ctx.globalAlpha = 1;
}

function motifRings(ctx, w, h, rng, hueA, hueB) {
  ctx.fillStyle = "#0c0802";
  ctx.fillRect(0, 0, w, h);
  const cx = w / 2 + (rng() - 0.5) * 40;
  const cy = h / 2 + (rng() - 0.5) * 30;
  for (let i = 8; i > 0; i--) {
    const r = i * 16 + rng() * 6;
    const hue = hueA + (8 - i) * ((hueB - hueA) / 8);
    ctx.strokeStyle = `hsla(${hue},95%,60%,0.85)`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, Math.PI * 2);
  ctx.fill();
}

const MOTIFS = {
  nebula: motifNebula,
  grid: motifGrid,
  ridge: motifRidge,
  current: motifCurrent,
  rings: motifRings,
};

/**
 * Paint a poster for `entry` into a 2D context (canvas sized 320x180 or any
 * 16:9 box). `time` animates the poster for detail-view previews; pass 0 for
 * a still thumbnail.
 */
export function paintPoster(ctx, w, h, entry, time = 0) {
  const cat = categoryById(entry.category);
  const [hueA, hueB] = cat ? cat.hue : [200, 260];
  const rng = mulberry32(entry.seed + Math.floor(time * 2) * 977);
  const paint = MOTIFS[cat ? cat.motif : "nebula"];
  paint(ctx, w, h, rng, hueA, hueB, time);
  // vignette
  const v = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.85);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
}

/** The gold-core emblem for the header, drawn procedurally. */
export function paintEmblem(ctx, size, t = 0) {
  const c = size / 2;
  const rng = mulberry32(7);
  ctx.clearRect(0, 0, size, size);
  // vortex particles
  for (let i = 0; i < 90; i++) {
    const ang = rng() * Math.PI * 2 + t * (0.3 + (i % 5) * 0.08);
    const rad = 10 + rng() * (c - 12);
    const x = c + Math.cos(ang) * rad;
    const y = c + Math.sin(ang) * rad;
    ctx.fillStyle = `hsla(${200 + rng() * 40},85%,60%,${0.35 + rng() * 0.5})`;
    ctx.fillRect(x, y, 1.6, 1.6);
  }
  // gold ring + bolt
  ctx.strokeStyle = "#ffd700";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(c, c, c - 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#ffd700";
  ctx.beginPath();
  const s = size / 22;
  ctx.moveTo(c, c - 5 * s);
  ctx.lineTo(c - 1.6 * s, c + 0.8 * s);
  ctx.lineTo(c + 0.6 * s, c + 0.4 * s);
  ctx.lineTo(c - 0.8 * s, c + 5 * s);
  ctx.lineTo(c + 1.6 * s, c - 0.8 * s);
  ctx.lineTo(c - 0.6 * s, c - 0.4 * s);
  ctx.closePath();
  ctx.fill();
}
