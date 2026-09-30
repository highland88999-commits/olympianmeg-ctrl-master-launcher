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
  filterCatalog,
  formatRuntime,
  paintPoster,
  paintEmblem,
} from "../app/nv2-video-library/library.js";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, "../app/nv2-video-library");
const pageSrc = readFileSync(join(appDir, "page.jsx"), "utf8");
const libSrc = readFileSync(join(appDir, "library.js"), "utf8");
const allSrc = pageSrc + "\n" + libSrc;
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
  assert.ok(!/["'][^"']*\.(mp4|mov)["']/i.test(allSrc), "remote/local video file reference found");
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
