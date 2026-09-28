import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import {
  mulberry32,
  SCENES,
  SCENE_TOTAL_SECONDS,
  sceneAt,
  sceneLocalTime,
  paintFeed,
  FEED_W,
  FEED_H,
} from "../app/nexus-symbiote/demo-feed.js";
import {
  VERTEX_SHADER,
  FRAGMENT_SHADER,
  projectPixel,
  pixelColor,
  SAMPLE_W,
  SAMPLE_H,
  createEngine,
} from "../app/nexus-symbiote/symbiote-engine.js";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, "../app/nexus-symbiote");
const pageSrc = readFileSync(join(appDir, "page.jsx"), "utf8");
const feedSrc = readFileSync(join(appDir, "demo-feed.js"), "utf8");
const engineSrc = readFileSync(join(appDir, "symbiote-engine.js"), "utf8");
const allSrc = pageSrc + "\n" + feedSrc + "\n" + engineSrc;
const lower = allSrc.toLowerCase();

// ---- JSX parse check (esbuild transform, method reported in module report) ----
test("page.jsx parses as valid JSX", () => {
  const require = createRequire(
    "/home/hatch/.npm/_npx/beb367dfa21eb3f5/node_modules/esbuild/package.json"
  );
  const { transformSync } = require("esbuild");
  const out = transformSync(pageSrc, { loader: "jsx", jsx: "automatic" });
  assert.ok(out.code.length > 0, "esbuild produced no output");
  assert.ok(out.code.includes("NexusSymbiotePage"), "component missing from output");
});

// ---- audit: telemetry / tracking stripped ----
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
    "registerNode",
    "omegarepo",
    "eyJhbGciOi", // no JWT blobs
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
  assert.ok(!allSrc.includes("window.open"), "window.open found (external navigation)");
});

test("no third-party imports", () => {
  const files = { "page.jsx": pageSrc, "demo-feed.js": feedSrc, "symbiote-engine.js": engineSrc };
  for (const [name, src] of Object.entries(files)) {
    const imports = [...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    for (const imp of imports) {
      assert.ok(
        imp === "react" || imp.startsWith("./") || imp.startsWith("../"),
        `${name}: unexpected external import: ${imp}`
      );
    }
  }
});

test("no remote video: no <video> src and no sample media files", () => {
  // quoted .mp4/.mov filenames only — prose mentions in comments are fine,
  // and the local .webm *download* filename is a save target, not a fetch
  assert.ok(!/["'][^"']*\.(mp4|mov)["']/i.test(allSrc), "sample media file reference found");
  assert.ok(!/<video[^>]*src\s*=/i.test(allSrc), "<video> with src attribute found");
});

// ---- demo feed logic ----
test("mulberry32 is deterministic", () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  for (let i = 0; i < 10; i++) assert.equal(a(), b());
  const c = mulberry32(43);
  assert.notEqual(a(), c(), "different seeds should diverge");
});

test("scene registry covers the full demo loop", () => {
  assert.equal(SCENE_TOTAL_SECONDS, 27);
  assert.equal(sceneAt(0).id, "words");
  assert.equal(sceneAt(8.9).id, "words");
  assert.equal(sceneAt(9).id, "bloom");
  assert.equal(sceneAt(18).id, "pulse");
  assert.equal(sceneAt(27).id, "words"); // wraps
  assert.equal(sceneLocalTime(10), 1);
});

test("paintFeed paints every scene without a real canvas", () => {
  // fake 2D context that records calls
  const calls = [];
  const grad = { addColorStop: () => {} };
  const fake = new Proxy(
    {},
    {
      get(t, prop) {
        if (prop === "createRadialGradient") return () => grad;
        if (prop === "canvas") return {};
        return (...args) => calls.push([prop, ...args]);
      },
      set(t, prop, v) {
        calls.push(["set", prop, v]);
        return true;
      },
    }
  );
  for (const scene of SCENES) {
    calls.length = 0;
    const id = paintFeed(fake, scene.seconds * SCENES.indexOf(scene) + 0.5);
    assert.equal(id, scene.id);
    const fills = calls.filter((c) => c[0] === "fillRect" || c[0] === "fillText" || c[0] === "stroke");
    assert.ok(fills.length > 0, `scene ${scene.id} drew nothing`);
  }
  assert.equal(FEED_W, 160);
  assert.equal(FEED_H, 120);
});

// ---- engine math ----
test("projectPixel keeps the anchor centred with no effects", () => {
  const [tx, ty, tz] = projectPixel(SAMPLE_W / 2, SAMPLE_H / 2, 1, {}, 0);
  assert.ok(Math.abs(tx) < 1e-9, `tx=${tx}`);
  assert.ok(Math.abs(ty) < 1e-9, `ty=${ty}`);
  assert.equal(tz, 3.5);
});

test("projectPixel vortex rotates off-centre points", () => {
  const fx = { vortex: true };
  const a = projectPixel(140, 60, 1, fx, 1);
  const b = projectPixel(140, 60, 1, fx, 2);
  assert.ok(
    Math.abs(a[0] - b[0]) > 1e-6 || Math.abs(a[1] - b[1]) > 1e-6,
    "vortex should move points over time"
  );
  // dark points are exempt from the swirl
  const dark = projectPixel(140, 60, 0.01, fx, 1);
  const dark2 = projectPixel(140, 60, 0.01, fx, 2);
  assert.deepEqual(dark, dark2);
});

test("projectPixel ripple offsets position", () => {
  const plain = projectPixel(80, 60, 1, {}, 1);
  const rip = projectPixel(80, 60, 1, { ripple: true }, 1);
  assert.ok(
    Math.abs(plain[0] - rip[0]) > 1e-9 || Math.abs(plain[1] - rip[1]) > 1e-9,
    "ripple should offset points"
  );
});

test("pixelColor pulse modulates brightness", () => {
  const fx = { pulse: true };
  const a = pixelColor(0.5, 0.5, 0.5, 60, fx, 0);
  const b = pixelColor(0.5, 0.5, 0.5, 60, fx, 0.4);
  assert.ok(Math.abs(a[0] - b[0]) > 1e-6, "pulse should change brightness over time");
  const still = pixelColor(0.5, 0.5, 0.5, 60, {}, 5);
  assert.deepEqual(still, [0.5, 0.5, 0.5]);
});

test("shaders are WebGL1-valid structure", () => {
  for (const [name, src] of [["vertex", VERTEX_SHADER], ["fragment", FRAGMENT_SHADER]]) {
    assert.ok(src.includes("void main"), `${name}: missing main()`);
    const open = (src.match(/{/g) || []).length;
    const close = (src.match(/}/g) || []).length;
    assert.equal(open, close, `${name}: unbalanced braces`);
  }
  assert.ok(VERTEX_SHADER.includes("gl_Position"), "vertex: no gl_Position");
  assert.ok(VERTEX_SHADER.includes("attribute vec3 position"), "vertex: no position attribute");
  assert.ok(FRAGMENT_SHADER.includes("gl_FragColor"), "fragment: no gl_FragColor");
  assert.ok(!FRAGMENT_SHADER.includes("#version"), "fragment: #version found (WebGL1 must not have it)");
  assert.ok(typeof createEngine === "function", "createEngine not exported");
});

test("reduced-motion path exists", () => {
  assert.ok(allSrc.includes("prefers-reduced-motion"), "no prefers-reduced-motion check");
  assert.ok(pageSrc.includes("cancelAnimationFrame"), "animation frame not cancelled");
});

test("copy is plain English with no jargon", () => {
  const uiText = [...pageSrc.matchAll(/>([^<>{}]+)</g)]
    .map((m) => m[1].trim())
    .filter((s) => s.length > 0)
    .join(" ")
    .toLowerCase();
  assert.ok(uiText.includes("what is this"), "about button copy missing");
  for (const word of ["telemetry", "uplink", "repository", "ip address", "node"]) {
    assert.ok(!uiText.includes(word), `jargon in UI copy: ${word}`);
  }
});
