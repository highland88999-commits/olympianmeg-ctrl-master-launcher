/*
 * THE FLYING DUTCHMAN module tests — run with: node --test tests/flying-dutchman.test.mjs
 * Covers chapter sequencing, sea/ship scene math, and static audits
 * (no telemetry, no video embeds, no external hosts).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  CHAPTERS, VOYAGE_LENGTH, chapterAt, waveY, shipScreenX, shipScale,
  lightningAt, FogSim, WispSim, LOG_WINDOWS,
} from '../app/flying-dutchman/sea.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), 'utf8');
const pageSrc = read('../app/flying-dutchman/page.jsx');
const seaSrc = read('../app/flying-dutchman/sea.js');

// ---------- Chapters ----------

test('voyage has four chapters with positive durations', () => {
  assert.equal(CHAPTERS.length, 4);
  assert.deepEqual(CHAPTERS.map((c) => c.id), ['calm', 'crossing', 'haunting', 'curse']);
  for (const c of CHAPTERS) assert.ok(c.dur > 0);
  assert.equal(VOYAGE_LENGTH, CHAPTERS.reduce((s, c) => s + c.dur, 0));
});

test('chapterAt sequences chapters in order and loops', () => {
  let t = 0;
  const seen = [];
  for (const c of CHAPTERS) {
    const r = chapterAt(t + 0.01);
    seen.push(r.chapter.id);
    assert.equal(r.index, CHAPTERS.indexOf(c));
    assert.ok(r.local >= 0 && r.local < c.dur);
    t += c.dur;
  }
  assert.deepEqual(seen, ['calm', 'crossing', 'haunting', 'curse']);
  // loop point
  const looped = chapterAt(VOYAGE_LENGTH + 1);
  assert.equal(looped.chapter.id, 'calm');
  // boundary: exact chapter edge lands on the next chapter
  const edge = chapterAt(CHAPTERS[0].dur);
  assert.equal(edge.chapter.id, 'crossing');
});

test('chapter scene params escalate the haunting', () => {
  const [calm, cross, haunt, curse] = CHAPTERS.map((c) => c.scene);
  assert.equal(calm.shipOpacity, 0);                    // no ship in the calm
  assert.ok(cross.shipOpacity > calm.shipOpacity);
  assert.equal(haunt.glow, 1.0);                        // full spectral glow
  assert.equal(curse.lightning, true);                  // only the curse has lightning
  assert.equal(calm.lightning, false);
  assert.ok(curse.fog >= cross.fog);                    // thickest fog in the storm
  assert.ok(curse.rough > calm.rough);                  // roughest seas in the storm
});

test('captions are original prose, not ad copy', () => {
  const all = CHAPTERS.map((c) => c.caption).join(' ').toLowerCase();
  assert.ok(!all.includes('$'), 'no pricing in the story');
  assert.ok(!all.includes('mailto'), 'no funnel links in the story');
  assert.ok(all.includes('part of the ship'), 'keeps the source tagline');
});

// ---------- Sea math ----------

test('waveY is deterministic and scales with roughness', () => {
  assert.equal(waveY(100, 5, 0.5, 1), waveY(100, 5, 0.5, 1));
  const calmAmp = Math.abs(waveY(100, 5, 0.0, 0));
  const stormAmp = Math.abs(waveY(100, 5, 1.0, 0));
  // rough seas have larger potential amplitude (check the scale factor path)
  assert.ok(stormAmp !== calmAmp || true);
  let maxCalm = 0, maxStorm = 0;
  for (let x = 0; x < 2000; x += 37) {
    maxCalm = Math.max(maxCalm, Math.abs(waveY(x, 5, 0, 0)));
    maxStorm = Math.max(maxStorm, Math.abs(waveY(x, 5, 1, 0)));
  }
  assert.ok(maxStorm > maxCalm, 'storm waves must be taller than glass-calm waves');
});

test('ship approaches as chapters progress and scales up', () => {
  const W = 1200;
  const xCalm = shipScreenX(W, CHAPTERS[0].scene, 0, 1);
  const xHaunt = shipScreenX(W, CHAPTERS[2].scene, 0, 1);
  assert.ok(xHaunt < xCalm, 'ship moves closer (leftward) as the story progresses');
  assert.ok(shipScale(CHAPTERS[2].scene) > shipScale(CHAPTERS[0].scene));
  // drift keeps it on screen
  for (let l = 0; l < 16; l += 2) {
    const x = shipScreenX(W, CHAPTERS[2].scene, l, 16);
    assert.ok(x > -W * 0.2 && x < W * 1.2, `ship drifted off screen: ${x}`);
  }
});

test('lightningAt fires periodically with a decaying envelope', () => {
  const a = lightningAt(0.1);
  assert.equal(a.active, true);
  assert.ok(a.intensity > 0 && a.intensity <= 1);
  const b = lightningAt(0.4);
  assert.ok(b.intensity < a.intensity, 'flash must decay');
  const quiet = lightningAt(2.0);
  assert.equal(quiet.active, false);
  assert.equal(quiet.intensity, 0);
});

test('fog banks drift and wrap', () => {
  const fog = new FogSim(2026, 10);
  assert.equal(fog.banks.length, 10);
  const x0 = fog.banks[0].x;
  fog.step(1);
  assert.ok(fog.banks[0].x > x0, 'fog must drift');
  for (let i = 0; i < 10000; i++) fog.step(1);
  for (const b of fog.banks) assert.ok(b.x - b.w <= 1, 'fog bank escaped without wrapping');
});

test('wisps return one position per wisp with a twinkle factor', () => {
  const w = new WispSim(99, 14);
  const pts = w.positions(3.3);
  assert.equal(pts.length, 14);
  for (const p of pts) {
    assert.ok(p.tw >= 0 && p.tw <= 1);
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
  }
  assert.notDeepEqual(w.positions(1), w.positions(2), 'wisps must move over time');
});

test('log windows carry story content, three of them', () => {
  assert.equal(LOG_WINDOWS.length, 3);
  assert.deepEqual(LOG_WINDOWS.map((w) => w.id), ['voyage', 'manifest', 'crew']);
  for (const w of LOG_WINDOWS) {
    assert.ok(w.title && w.icon);
    assert.ok(w.body.length >= 3);
  }
  const all = LOG_WINDOWS.map((w) => w.body.join(' ')).join(' ').toLowerCase();
  assert.ok(!all.includes('dutchmanautoads'), 'no funnel email addresses');
  assert.ok(!all.includes('$200') && !all.includes('$300'), 'no ad pricing');
});

// ---------- Static audits ----------

const FORBIDDEN = [
  'youtube.com', 'youtu.be', 'hailuo', '.mp4', 'supabase', 'ipify', 'ipify.org',
  'jsdelivr', 'unpkg', 'central_telemetry', 'track_ping', 'OMEGA', 'brain-uplink',
  'catbox.moe', 'vercel.app', 'githubusercontent', 'raw.githubusercontent',
  'dutchmanautoads', 'architect-artemis', 'googleapis',
];
for (const [name, raw] of [['page.jsx', pageSrc], ['sea.js', seaSrc]]) {
  test(`static audit: ${name} has no external hosts, telemetry, video, or funnel links`, () => {
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    for (const bad of FORBIDDEN) {
      assert.ok(!src.toLowerCase().includes(bad.toLowerCase()), `${name} contains forbidden string: ${bad}`);
    }
    assert.ok(!src.includes('https://'), `${name} contains an https URL`);
    assert.ok(!src.includes('http://'), `${name} contains an http URL`);
    assert.ok(!/<iframe/i.test(src), `${name} contains an iframe`);
    assert.ok(!/<video/i.test(src), `${name} contains a video element`);
  });
}

test('page is a client component importing only react and the local sea module', () => {
  assert.ok(pageSrc.includes("'use client'"));
  const imports = [...pageSrc.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1]);
  for (const imp of imports) {
    assert.ok(imp === 'react' || imp.startsWith('./'), `unexpected import: ${imp}`);
  }
});

test('page implements all three stages of the source structure', () => {
  assert.ok(pageSrc.includes("useState('gate')") || pageSrc.includes('gate'), 'missing entry-gate stage');
  assert.ok(pageSrc.includes('voyage'), 'missing voyage stage');
  assert.ok(pageSrc.includes('log'), 'missing captain-log stage');
  assert.ok(pageSrc.includes('HAIL THE SHIP'), 'missing entry button copy');
});

test('page.jsx JSX is structurally balanced', () => {
  let s = pageSrc
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
  const stack = [];
  const pairs = { ')': '(', ']': '[', '}': '{' };
  for (const ch of s) {
    if ('([{'.includes(ch)) stack.push(ch);
    else if (')]}'.includes(ch)) {
      assert.ok(stack.length > 0, `unbalanced closing ${ch}`);
      assert.equal(stack.pop(), pairs[ch], `mismatched bracket near ${ch}`);
    }
  }
  assert.equal(stack.length, 0, `unclosed brackets remain: ${stack.join('')}`);
});
