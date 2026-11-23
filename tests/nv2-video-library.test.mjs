import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import {
  mulberry32,
  CATEGORIES,
  CATALOG,
  categoryById,
  featuredEntry,
  filterCatalog,
  filterMyList,
  formatRuntime,
  isInMyList,
  normalizeCatalog,
  paintPoster,
  paintEmblem,
  playableSrc,
  toggleMyList,
} from "../app/nv2-video-library/library.js";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, "../app/nv2-video-library");
const pageSrc = readFileSync(join(appDir, "page.jsx"), "utf8");
const libSrc = readFileSync(join(appDir, "library.js"), "utf8");
const catalogSrc = readFileSync(join(appDir, "catalog.json"), "utf8");
const catalogRows = JSON.parse(catalogSrc);
const allSrc = pageSrc + "\n" + libSrc + "\n" + catalogSrc;
const lower = allSrc.toLowerCase();

test("page.jsx parses as valid JSX", () => {
  const require = createRequire(
    "/home/hatch/.npm/_npx/beb367dfa21eb3f5/node_modules/esbuild/package.json"
  );
  const { transformSync } = require("esbuild");
  const out = transformSync(pageSrc, { loader: "jsx", jsx: "automatic" });
  assert.ok(out.code.length > 0);
  assert.ok(out.code.includes("Nv2VideoLibraryPage"));
});

test("no telemetry, tracking, or secrets remain", () => {
  const forbidden = [
    "supabase",
    "ipify",
    "central_telemetry",
    "track_ping",
    "nexus_visitor_id",
    "brain uplink",
    "brain-uplink",
    "logbrainaction",
    "createclient",
    "registernode",
    "omegarepo",
    "eyJhbGciOi",
  ];
  for (const word of forbidden) {
    assert.ok(!lower.includes(word.toLowerCase()), `forbidden string present: ${word}`);
  }
});

test("zero external network requests", () => {
  assert.ok(!allSrc.includes("http://"), "http:// URL found");
  assert.ok(!allSrc.includes("https://"), "https:// URL found");
  assert.ok(!lower.includes("fetch("), "fetch() call found");
  assert.ok(!lower.includes("xmlhttprequest"), "XMLHttpRequest found");
  assert.ok(!lower.includes("websocket"), "WebSocket found");
  assert.ok(!allSrc.includes("<iframe"), "<iframe> found");
  assert.ok(!allSrc.includes("mailto:"), "mailto: found");
  assert.ok(!allSrc.includes("window.open"), "window.open found");
});

test("no remote video files or hotlinked thumbnails", () => {
  // A video file reference is only ever allowed as a local path under
  // /videos/nv2-library/ — the loading path for titles added later.
  // Anything remote, or any other local video path, is forbidden.
  assert.ok(!/["']https?:[^"']*\.(mp4|mov)["']/i.test(allSrc), "remote video file reference found");
  for (const m of allSrc.matchAll(/["']([^"']*\.(?:mp4|mov))["']/gi)) {
    assert.ok(
      m[1].startsWith("/videos/nv2-library/"),
      `video reference outside the local library folder: ${m[1]}`
    );
  }
  assert.ok(!/<video[^>]*src\s*=\s*["']https?/i.test(allSrc), "remote <video> src found");
  assert.ok(!/<img[^>]*src\s*=\s*["']https?/i.test(allSrc), "remote <img> src found");
});

test("no third-party imports", () => {
  for (const [name, src] of [["page.jsx", pageSrc], ["library.js", libSrc]]) {
    const imports = [...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    for (const imp of imports) {
      // next/image is a first-party Next.js framework import (Phase 2b
      // <img> migration), not a third-party dependency.
      assert.ok(
        imp === "react" || imp === "next/image" || imp.startsWith("./") || imp.startsWith("../"),
        `${name}: unexpected external import: ${imp}`
      );
    }
  }
});

test("catalog is honest: every entry flagged as demo", () => {
  assert.ok(CATALOG.length >= 12, `catalog too small: ${CATALOG.length}`);
  for (const e of CATALOG) {
    assert.equal(e.demo, true, `${e.id} not flagged demo`);
    assert.ok(e.title.length > 0);
    assert.ok(categoryById(e.category), `${e.id} has unknown category ${e.category}`);
  }
  const ids = new Set(CATALOG.map((e) => e.id));
  assert.equal(ids.size, CATALOG.length, "duplicate catalog ids");
});

test("categories cover the catalog", () => {
  assert.equal(CATEGORIES.length, 5);
  const used = new Set(CATALOG.map((e) => e.category));
  for (const c of CATEGORIES) assert.ok(used.has(c.id), `category ${c.id} has no entries`);
});

test("filterCatalog searches and filters", () => {
  assert.equal(filterCatalog(CATALOG, "", "all").length, CATALOG.length);
  const neon = filterCatalog(CATALOG, "", "neon");
  assert.ok(neon.length > 0 && neon.every((e) => e.category === "neon"));
  const q = filterCatalog(CATALOG, "nebula", "all");
  assert.ok(q.length === 1 && q[0].title === "Nebula Bloom");
  assert.deepEqual(filterCatalog(CATALOG, "zzz-no-match", "all"), []);
  // case-insensitive, trims whitespace
  assert.equal(filterCatalog(CATALOG, "  NEBULA ", "all").length, 1);
  // blurb matches too
  assert.ok(filterCatalog(CATALOG, "tuning fork", "all").length === 1);
});

test("formatRuntime is plain", () => {
  assert.equal(formatRuntime(12), "12 min");
});

test("mulberry32 is deterministic", () => {
  const a = mulberry32(7);
  const b = mulberry32(7);
  for (let i = 0; i < 5; i++) assert.equal(a(), b());
});

function fakeCtx() {
  const calls = [];
  const grad = { addColorStop: () => calls.push(["gradient-stop"]) };
  return {
    calls,
    proxy: new Proxy(
      {},
      {
        get(t, prop) {
          if (prop === "createRadialGradient" || prop === "createLinearGradient")
            return () => grad;
          return (...args) => calls.push([prop, args.length]);
        },
        set(t, prop, v) {
          calls.push(["set", prop]);
          return true;
        },
      }
    ),
  };
}

test("paintPoster draws for every category motif", () => {
  for (const entry of CATALOG) {
    const { calls, proxy } = fakeCtx();
    paintPoster(proxy, 320, 180, entry, 0);
    const draws = calls.filter(
      ([p]) => p === "fillRect" || p === "stroke" || p === "fill"
    );
    assert.ok(draws.length > 5, `${entry.id}: poster drew almost nothing`);
  }
});

test("paintPoster is deterministic per seed and time", () => {
  const entry = CATALOG[0];
  const run = () => {
    const { calls, proxy } = fakeCtx();
    paintPoster(proxy, 320, 180, entry, 1.5);
    return JSON.stringify(calls);
  };
  assert.equal(run(), run(), "same seed+time painted differently");
});

test("paintEmblem draws the gold core", () => {
  const { calls, proxy } = fakeCtx();
  paintEmblem(proxy, 84, 0);
  const sets = calls.filter(([p, prop]) => p === "set");
  const styles = sets.map(([, prop]) => prop);
  assert.ok(styles.includes("fillStyle"), "emblem sets no fillStyle");
  assert.ok(calls.some(([p]) => p === "arc"), "emblem draws no ring");
});

test("reduced-motion path exists", () => {
  assert.ok(allSrc.includes("prefers-reduced-motion"), "no prefers-reduced-motion check");
  assert.ok(pageSrc.includes("cancelAnimationFrame"), "animation frame not cancelled");
});

test("copy is plain English and honest about being a demo", () => {
  assert.ok(pageSrc.includes("DEMO CATALOG"), "demo honesty note missing");
  const uiText = [...pageSrc.matchAll(/>([^<>{}]+)</g)]
    .map((m) => m[1].trim())
    .filter((s) => s.length > 0)
    .join(" ")
    .toLowerCase();
  for (const word of ["telemetry", "uplink", "repository", "ip address"]) {
    assert.ok(!uiText.includes(word), `jargon in UI copy: ${word}`);
  }
});

test("catalog.json is the single data source and matches the live catalog", () => {
  assert.ok(Array.isArray(catalogRows) && catalogRows.length >= 12, "catalog.json too small");
  const { entries, dropped } = normalizeCatalog(catalogRows);
  assert.deepEqual(dropped, [], `catalog.json has dropped rows: ${JSON.stringify(dropped)}`);
  assert.deepEqual(
    entries.map((e) => e.id),
    CATALOG.map((e) => e.id),
    "live catalog drifted from catalog.json"
  );
  // Adding a title is a data change: a new row flows through untouched.
  const extra = normalizeCatalog([
    ...catalogRows,
    { title: "Test Title", category: "nature", minutes: 6, blurb: "A test row." },
  ]);
  assert.equal(extra.entries.length, CATALOG.length + 1);
  assert.equal(extra.entries.at(-1).title, "Test Title");
});

test("normalizeCatalog drops bad rows and never invents content", () => {
  const { entries, dropped } = normalizeCatalog([
    { title: "Good One", category: "cosmos", minutes: 12, blurb: "Fine." },
    { title: "  ", category: "cosmos", minutes: 12, blurb: "No title." },
    { title: "Wrong Shelf", category: "nope", minutes: 12, blurb: "Bad category." },
    { title: "No Minutes", category: "neon", blurb: "Minutes default." },
    { title: "Remote Video", category: "deep", minutes: 5, blurb: "Off-site src.", src: "https://example.com/x.mp4" },
    { title: "Local File", category: "pulse", minutes: 5, blurb: "On-site src.", src: "/videos/nv2-library/local-file.mp4" },
  ]);
  assert.equal(entries.length, 4);
  assert.deepEqual(
    entries.map((e) => e.title),
    ["Good One", "No Minutes", "Remote Video", "Local File"]
  );
  assert.equal(dropped.length, 2);
  assert.equal(entries.find((e) => e.title === "No Minutes").minutes, 5);
  // a remote src is refused: the entry stays demo with no playable file
  const remote = entries.find((e) => e.title === "Remote Video");
  assert.equal(remote.src, null);
  assert.equal(remote.demo, true);
  assert.equal(playableSrc(remote), null);
  const local = entries.find((e) => e.title === "Local File");
  assert.equal(local.demo, false);
  assert.equal(local.src, "/videos/nv2-library/local-file.mp4");
  // stable ids and seeds: the same rows always paint the same posters
  const again = normalizeCatalog(catalogRows);
  assert.deepEqual(
    again.entries.map((e) => [e.id, e.seed]),
    CATALOG.map((e) => [e.id, e.seed])
  );
});

test("normalizeCatalog handles junk input", () => {
  assert.deepEqual(normalizeCatalog(null), { entries: [], dropped: [] });
  assert.deepEqual(normalizeCatalog("nope"), { entries: [], dropped: [] });
  assert.deepEqual(normalizeCatalog([]), { entries: [], dropped: [] });
});

test("featuredEntry picks the flagged title, else the first", () => {
  assert.equal(featuredEntry(CATALOG).title, "Drift Through the Orion Arm");
  assert.equal(featuredEntry([{ title: "A" }, { title: "B" }]).title, "A");
  assert.equal(featuredEntry([{ title: "A" }, { title: "B", featured: true }]).title, "B");
  assert.equal(featuredEntry([]), null);
  assert.equal(featuredEntry(null), null);
});

test("My List helpers are pure and round-trip", () => {
  assert.deepEqual(toggleMyList([], "demo-1"), ["demo-1"]);
  assert.deepEqual(toggleMyList(["demo-1"], "demo-1"), []);
  assert.deepEqual(toggleMyList(["demo-1"], "demo-2"), ["demo-1", "demo-2"]);
  assert.deepEqual(toggleMyList(null, "demo-1"), ["demo-1"]);
  assert.equal(isInMyList(["demo-1"], "demo-1"), true);
  assert.equal(isInMyList(["demo-1"], "demo-2"), false);
  assert.equal(isInMyList(null, "demo-1"), false);
  assert.deepEqual(
    filterMyList(CATALOG, ["demo-2", "demo-5"]).map((e) => e.id),
    ["demo-2", "demo-5"]
  );
  assert.deepEqual(filterMyList(CATALOG, null), []);
});

test("playableSrc prefers a device upload, then the local file", () => {
  assert.equal(playableSrc(null), null);
  assert.equal(playableSrc(CATALOG[0]), null, "demo entry has no playable file");
  assert.equal(
    playableSrc({ src: "/videos/nv2-library/a.mp4" }),
    "/videos/nv2-library/a.mp4"
  );
  assert.equal(
    playableSrc({ src: "/videos/nv2-library/a.mp4", blobUrl: "blob:xyz" }),
    "blob:xyz"
  );
});

test("loading path is documented where a title gets added", () => {
  assert.ok(libSrc.includes("catalog.json"), "library.js does not name catalog.json");
  assert.ok(libSrc.includes("HOW TO ADD A TITLE"), "add-a-title instructions missing");
  assert.ok(libSrc.includes("/videos/nv2-library/"), "local video folder not documented");
});

test("page has a hero, browse rows, a player shell, and honest empty states", () => {
  assert.ok(pageSrc.includes("nv2-hero"), "hero missing");
  assert.ok(pageSrc.includes("FEATURED"), "hero kicker missing");
  assert.ok(pageSrc.includes("nv2-row-scroll"), "browse rows missing");
  assert.ok(pageSrc.includes("nv2-player"), "player shell missing");
  assert.ok(pageSrc.includes("requestFullscreen"), "player fullscreen missing");
  assert.ok(pageSrc.includes("No video file behind this title yet"), "player honest empty state missing");
  assert.ok(pageSrc.includes("The shelves are empty for now"), "empty-shelf state missing");
  assert.ok(pageSrc.includes("titles arrive once rights are acquired"), "rights honesty note missing");
  assert.ok(pageSrc.includes("nv2-my-list"), "My List persistence key missing");
});

test("controls are circle orbs, never rectangles", () => {
  assert.ok(pageSrc.includes("nv2-orb"), "orb controls missing");
  // the detail close is a circle orb, not the old rectangular button
  assert.ok(!pageSrc.includes("nv2-close"), "old rectangular close button still present");
  assert.ok(pageSrc.includes("nv2-detail-close"), "detail close orb missing");
  assert.ok(pageSrc.includes("nv2-player-top"), "player orb row missing");
});

test("upload double-add is guarded", () => {
  assert.ok(pageSrc.includes("let done = false"), "upload done-guard missing");
  assert.ok(pageSrc.includes("if (done) return;"), "upload done-guard not checked");
});

test("Safari bottom-bar clearance has a real rule", () => {
  assert.ok(pageSrc.includes(".player-clear {"), "player-clear rule missing");
  assert.ok(pageSrc.includes("safe-area-inset-bottom"), "safe-area clearance missing");
});
