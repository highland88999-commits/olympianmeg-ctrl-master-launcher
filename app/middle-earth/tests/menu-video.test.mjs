// app/middle-earth/tests/menu-video.test.mjs — the Nov 26 menu
// background video (Merlin ~18:07): a slow Misty Mountains drift
// loop behind the Middle-earth menus — the intro card ("A POCKET
// WORLD — Middle-earth") and the missions/map menu.
//
// No test renders page.jsx (the house's known gate gap), so the
// contract is pinned on the JSX + styles source: the video element
// is present behind the menus, loops, is muted, and the menu
// content/layout is unchanged — plus the video file itself exists
// on disk and is a real mp4.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, '..', '..', '..');
const pageSrc = readFileSync(path.join(HERE, '../page.jsx'), 'utf8');

function styleBlock(src, name) {
  // Every entry in the styles object is one line; match the whole
  // line so ${GOLD} template braces inside a value cannot cut it short.
  const line = src.split('\n').find((l) => l.trimStart().startsWith(`${name}: {`));
  assert.ok(line, `style ${name} exists`);
  return line;
}

function videoTag(src) {
  const m = src.match(/<video[^>]*data-testid="menu-bg-video"[^>]*>/s);
  assert.ok(m, 'menu-bg-video element exists');
  return m[0];
}

/* ---- the video element: present, looping, muted, autoplay ---- */
test('menu video: element present with the Middle-earth source + valley poster', () => {
  const tag = videoTag(pageSrc);
  assert.match(tag, /src=\{MENU_BG_VIDEO\}/);
  assert.match(tag, /poster=\{MENU_BG_POSTER\}/);
  assert.match(pageSrc, /const MENU_BG_VIDEO = '\/videos\/middle-earth\/menu-bg\.mp4';/);
  assert.match(pageSrc, /const MENU_BG_POSTER = '\/art\/middle-earth\/middle-earth\.jpg';/);
});

test('menu video: muted, looped, inline, autoplaying — never a sound, never a stop', () => {
  const tag = videoTag(pageSrc);
  for (const attr of ['muted', 'loop', 'playsInline', 'autoPlay']) {
    assert.ok(new RegExp(`\\b${attr}\\b`).test(tag), `video carries ${attr}`);
  }
  assert.match(tag, /preload="auto"/);
  assert.match(tag, /aria-hidden="true"/);
  // One video element only — no second copy hiding in another branch.
  assert.equal(pageSrc.match(/data-testid="menu-bg-video"/g).length, 1);
});

/* ---- shown behind the menus only, never in a zone ---- */
test('menu video: rendered only in menu + map modes, never over the 3D zone', () => {
  const idx = pageSrc.indexOf('data-testid="menu-bg-video"');
  const guard = pageSrc.lastIndexOf("(mode === 'menu' || mode === 'map')", idx);
  assert.ok(guard !== -1, 'video is guarded by the menu/map mode check');
  assert.ok(idx - guard < 200, 'guard sits directly above the video element');
  // And the video tag appears exactly once in the whole page — no
  // second copy hiding in a zone branch.
  assert.equal(pageSrc.match(/data-testid="menu-bg-video"/g).length, 1);
});

test('menu video: full-bleed behind the menus, below every control', () => {
  const line = styleBlock(pageSrc, 'menuBgVideo');
  assert.match(line, /position: 'absolute'/);
  assert.match(line, /inset: 0/);
  assert.match(line, /width: '100%', height: '100%'/);
  assert.match(line, /objectFit: 'cover'/);
  // Above the canvas (no z-index) so it is visible; below the map
  // (20), the overlays (30) and the HUD (10) so it never covers one.
  assert.match(line, /zIndex: 1/);
  assert.match(line, /pointerEvents: 'none'/);
});

/* ---- menu content + layout unchanged ---- */
test('menu layout unchanged: overlay, panel and map wrap keep their geometry', () => {
  const overlay = styleBlock(pageSrc, 'overlay');
  assert.match(overlay, /position: 'absolute', inset: 0/);
  assert.match(overlay, /zIndex: 30/);
  const panel = styleBlock(pageSrc, 'menuPanel');
  assert.match(panel, /maxWidth: 560/);
  assert.match(panel, /padding: '2rem 1\.6rem'/);
  const mapWrap = styleBlock(pageSrc, 'mapWrap');
  assert.match(mapWrap, /position: 'absolute', inset: 0/);
  assert.match(mapWrap, /zIndex: 20/);
  assert.match(mapWrap, /padding: `calc\(\$\{BANNER_CLEAR\}\) 1rem calc\(\$\{CARD_CLEAR\}\)`/);
  // The intro card and the map title are still the same JSX.
  assert.ok(pageSrc.includes('<div style={styles.kicker}>A POCKET WORLD</div>'));
  assert.ok(pageSrc.includes('<h1 style={styles.title}>Middle-earth</h1>'));
  assert.ok(pageSrc.includes('The Map of Middle-earth'));
});

/* ---- readability: scrims stay, cards keep near-opaque fills ---- */
test('menu readability: scrims dim the video, cards keep their fills', () => {
  const overlay = styleBlock(pageSrc, 'overlay');
  assert.match(overlay, /background: 'rgba\(6,8,5,0\.55\)'/);
  const panel = styleBlock(pageSrc, 'menuPanel');
  assert.match(panel, /background: 'rgba\(16,20,12,0\.9\)'/);
  const mapWrap = styleBlock(pageSrc, 'mapWrap');
  // Translucent now, so the video shows through — but still a dark
  // wash (0.62 -> 0.88), never clear glass.
  assert.match(mapWrap, /rgba\(36,49,24,0\.62\) 0%, rgba\(16,19,12,0\.88\) 70%\)/);
  const card = styleBlock(pageSrc, 'campaignCard');
  assert.match(card, /background: 'rgba\(22,28,16,0\.92\)'/);
  const pod = styleBlock(pageSrc, 'podCard');
  assert.match(pod, /background: 'rgba\(20,26,15,0\.92\)'/);
});

/* ---- the video file itself ---- */
test('menu video file: a real mp4 on disk at the wired path', () => {
  const file = path.join(REPO, 'public/videos/middle-earth/menu-bg.mp4');
  const stat = statSync(file);
  assert.ok(stat.isFile(), 'menu-bg.mp4 exists');
  // Menu loops stay lean: bigger than a still, far below the 6.6 MB
  // Hollow Earth sky loop.
  assert.ok(stat.size > 100 * 1024, `video is not a stub (${stat.size} bytes)`);
  assert.ok(stat.size < 10 * 1024 * 1024, `video stays lean (${stat.size} bytes)`);
  const head = readFileSync(file).subarray(0, 12);
  assert.equal(head.subarray(4, 8).toString('ascii'), 'ftyp', 'file is an mp4 (ftyp box)');
});
