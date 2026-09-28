import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import {
  STORAGE_KEY,
  SCHOOLS,
  LESSONS,
  schoolById,
  lessonsForSchool,
  getProgress,
  toggleCompleted,
  loadProgress,
  saveProgress,
} from "../app/olympian-education/curriculum.js";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, "../app/olympian-education");
const pageSrc = readFileSync(join(appDir, "page.jsx"), "utf8");
const curSrc = readFileSync(join(appDir, "curriculum.js"), "utf8");
const allSrc = pageSrc + "\n" + curSrc;
const lower = allSrc.toLowerCase();

test("page.jsx parses as valid JSX", () => {
  const require = createRequire(
    "/home/hatch/.npm/_npx/beb367dfa21eb3f5/node_modules/esbuild/package.json"
  );
  const { transformSync } = require("esbuild");
  const out = transformSync(pageSrc, { loader: "jsx", jsx: "automatic" });
  assert.ok(out.code.length > 0);
  assert.ok(out.code.includes("OlympianEducationPage"));
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

test("zero external network requests: no iframes, hotlinks, or fetches", () => {
  assert.ok(!allSrc.includes("http://"), "http:// URL found");
  assert.ok(!allSrc.includes("https://"), "https:// URL found");
  assert.ok(!lower.includes("fetch("), "fetch() call found");
  assert.ok(!lower.includes("xmlhttprequest"), "XMLHttpRequest found");
  assert.ok(!lower.includes("websocket"), "WebSocket found");
  assert.ok(!allSrc.includes("<iframe"), "<iframe> found (remote portal removed)");
  assert.ok(!allSrc.includes("mailto:"), "mailto: found");
  assert.ok(!allSrc.includes("window.open"), "window.open found");
});

test("no remote video background", () => {
  assert.ok(!/["'][^"']*\.(mp4|mov|webm)["']/i.test(allSrc), "video file reference found");
  assert.ok(!/<video/i.test(allSrc), "<video> element found");
});

test("no third-party imports", () => {
  for (const [name, src] of [["page.jsx", pageSrc], ["curriculum.js", curSrc]]) {
    const imports = [...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    for (const imp of imports) {
      assert.ok(
        imp === "react" || imp.startsWith("./") || imp.startsWith("../"),
        `${name}: unexpected external import: ${imp}`
      );
    }
  }
});

test("curriculum has three schools and twelve complete lessons", () => {
  assert.equal(SCHOOLS.length, 3);
  assert.equal(LESSONS.length, 12);
  const ids = new Set();
  for (const l of LESSONS) {
    assert.ok(!ids.has(l.id), `duplicate lesson id: ${l.id}`);
    ids.add(l.id);
    assert.ok(schoolById(l.school), `${l.id}: unknown school ${l.school}`);
    assert.ok(l.title.length > 2, `${l.id}: missing title`);
    assert.ok(l.intro.length > 40, `${l.id}: intro too short`);
    assert.ok(l.points.length >= 3, `${l.id}: needs at least 3 key points`);
    assert.ok(l.tryIt.length > 20, `${l.id}: missing exercise`);
    assert.ok(l.minutes > 0, `${l.id}: missing read time`);
  }
  for (const s of SCHOOLS) {
    assert.equal(lessonsForSchool(s.id).length, 4, `${s.id} should have 4 lessons`);
  }
});

test("getProgress computes per-school and overall percentages", () => {
  const empty = getProgress([]);
  assert.equal(empty.overallPct, 0);
  assert.equal(empty.totalDone, 0);
  assert.equal(empty.total, 12);
  for (const s of SCHOOLS) assert.equal(empty.bySchool[s.id].pct, 0);

  const all = getProgress(LESSONS.map((l) => l.id));
  assert.equal(all.overallPct, 100);
  assert.equal(all.totalDone, 12);

  const partial = getProgress(["socratic", "democracy", "binary"]);
  assert.equal(partial.bySchool.athens.done, 2);
  assert.equal(partial.bySchool.athens.pct, 50);
  assert.equal(partial.bySchool.forge.done, 1);
  assert.equal(partial.bySchool.forge.pct, 25);
  assert.equal(partial.bySchool.scrolls.done, 0);
  assert.equal(partial.overallPct, 25); // 3 of 12
});

test("toggleCompleted adds and removes ids", () => {
  assert.deepEqual(toggleCompleted([], "binary"), ["binary"]);
  assert.deepEqual(toggleCompleted(["binary"], "binary"), []);
  assert.deepEqual(toggleCompleted(["a"], "b"), ["a", "b"]);
});

test("loadProgress validates stored data", () => {
  const good = { getItem: () => JSON.stringify(["binary", "socratic"]) };
  assert.deepEqual(loadProgress(good), ["binary", "socratic"]);
  const junk = { getItem: () => JSON.stringify(["binary", "nope"]) };
  assert.deepEqual(loadProgress(junk), ["binary"], "unknown ids should be dropped");
  const corrupt = { getItem: () => "{oops" };
  assert.deepEqual(loadProgress(corrupt), []);
  const throwing = {
    getItem: () => {
      throw new Error("denied");
    },
  };
  assert.deepEqual(loadProgress(throwing), []);
  assert.equal(STORAGE_KEY, "olympian-education-progress-v1");
});

test("saveProgress writes JSON and never throws", () => {
  let written = null;
  saveProgress({ setItem: (k, v) => (written = [k, v]) }, ["binary"]);
  assert.deepEqual(written, [STORAGE_KEY, JSON.stringify(["binary"])]);
  assert.doesNotThrow(() =>
    saveProgress(
      {
        setItem: () => {
          throw new Error("full");
        },
      },
      []
    )
  );
});

test("orb physics from the source survived the port", () => {
  for (const marker of [
    "resolveCollisions",
    "createSpark",
    "translate3d",
    "requestAnimationFrame",
  ]) {
    assert.ok(pageSrc.includes(marker), `physics marker missing: ${marker}`);
  }
});

test("reduced-motion path exists", () => {
  assert.ok(allSrc.includes("prefers-reduced-motion"), "no prefers-reduced-motion check");
  assert.ok(pageSrc.includes("cancelAnimationFrame"), "animation frame not cancelled");
});

test("copy is plain English, honest about local progress", () => {
  assert.ok(pageSrc.includes("saved on this device only"), "local-progress honesty note missing");
  const uiText = [...pageSrc.matchAll(/>([^<>{}]+)</g)]
    .map((m) => m[1].trim())
    .filter((s) => s.length > 0)
    .join(" ")
    .toLowerCase();
  for (const word of ["telemetry", "uplink", "repository", "ip address"]) {
    assert.ok(!uiText.includes(word), `jargon in UI copy: ${word}`);
  }
});
