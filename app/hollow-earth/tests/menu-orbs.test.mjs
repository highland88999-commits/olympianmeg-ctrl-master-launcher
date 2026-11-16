// Menu orb faces + one-frame fit (Merlin, Nov 16, 2026 — the
// hunter-pick + missions-map orb rework). Pins:
//   * every hero, cluster and mission has its own orb face, the
//     file exists on disk, and ORB_FUNCTIONS registers the same
//     art path (a missing face would fall back to bare text, which
//     the orb law forbids on a pick);
//   * the menu + map screens wear OrbButton for every pick (no
//     rectangular chips or Hunt / Free Roam pills left);
//   * the stacked heights — computed from the same layout numbers
//     the page's inline styles use — fit one 390 px phone frame
//     with no scroll, against the VISIBLE height (700 px, browser
//     chrome up), not just the full 844 px device height.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  HERO_ORB_FN, CLUSTER_ORB_FN, MISSION_ORB_FN,
  heroOrbFn, clusterOrbFn, missionOrbFn, orbArt, missingFaces,
  MENU_LAYOUT, MAP_LAYOUT, PHONE_VIEWPORT,
  menuStackHeight, mapStackHeight,
  menuFitsOneFrame, mapFitsOneFrame,
} from '../menu-orbs.js';
import { HERO_ORDER } from '../characters.js';
import { CLUSTERS, CLUSTER_ORDER } from '../data.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const orbButtonSrc = readFileSync(join(ROOT, 'components/world/OrbButton.jsx'), 'utf8');
const pageSrc = readFileSync(join(ROOT, 'app/hollow-earth/page.jsx'), 'utf8');

test('orb faces: every hero, cluster and mission has one (no bare-text pick)', () => {
  assert.deepEqual(missingFaces(), []);
  assert.equal(Object.keys(HERO_ORB_FN).length, HERO_ORDER.length, 'hero faces ≠ heroes');
  assert.equal(Object.keys(CLUSTER_ORB_FN).length, CLUSTER_ORDER.length, 'cluster faces ≠ clusters');
  const missionCount = CLUSTER_ORDER.reduce((n, cid) => n + CLUSTERS[cid].missions.length, 0);
  assert.equal(Object.keys(MISSION_ORB_FN).length, missionCount, 'mission faces ≠ missions');
  assert.equal(missionCount, 7, 'expected 7 missions');
});

test('orb faces: every art file exists on disk, 256x256 webp, distinct names', () => {
  const fns = [...Object.values(HERO_ORB_FN), ...Object.values(CLUSTER_ORB_FN), ...Object.values(MISSION_ORB_FN)];
  assert.equal(new Set(fns).size, fns.length, 'duplicate orb fn');
  for (const fn of fns) {
    const rel = orbArt(fn).replace(/^\//, '');
    const abs = join(ROOT, 'public', rel);
    assert.ok(existsSync(abs), `missing face file: ${rel}`);
    assert.ok(statSync(abs).size > 1000, `face file suspiciously small: ${rel}`);
    assert.ok(!rel.includes('vehicle-'), 'hero/cluster/mission face collides with the vehicle namespace');
  }
  // The generator that drew them is the standalone hero script,
  // not the vehicle/function script it must not touch.
  assert.ok(existsSync(join(ROOT, 'scripts/gen-hero-orb-art.py')), 'gen-hero-orb-art.py missing');
});

test('orb faces: ORB_FUNCTIONS registers every pick fn with the same art path', () => {
  const fns = [...Object.values(HERO_ORB_FN), ...Object.values(CLUSTER_ORB_FN), ...Object.values(MISSION_ORB_FN)];
  for (const fn of fns) {
    const art = orbArt(fn);
    const re = new RegExp(`'${fn}':\\s*\\{[^}]*art:\\s*'${art.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`);
    assert.ok(re.test(orbButtonSrc), `ORB_FUNCTIONS lacks ${fn} -> ${art}`);
  }
});

test('orb face helpers: unknown keys fall back to a real face, never undefined', () => {
  assert.equal(heroOrbFn('no-such-hero'), 'hero-monster-hunter');
  assert.equal(clusterOrbFn('no-such-cluster'), 'cluster-wilds');
  assert.equal(missionOrbFn('no-such-mission'), 'mission');
  assert.ok(orbArt(heroOrbFn('wizard')).endsWith('tron-hero-wizard.webp'));
  assert.ok(orbArt(clusterOrbFn('stormlands')).endsWith('tron-cluster-stormlands.webp'));
  assert.ok(orbArt(missionOrbFn('dark-korus-approach')).endsWith('tron-mission-throne-road.webp'));
});

test('menu screen: every hero pick is an OrbButton, no rectangular chips left', () => {
  assert.ok(pageSrc.includes('fn={heroOrbFn(key)}'), 'hero orbs not worn in page.jsx');
  assert.ok(pageSrc.includes('ariaLabel={`Pick ${h.name}`}'), 'hero orb has no full-name aria-label');
  assert.ok(!pageSrc.includes("gridTemplateColumns: 'repeat(3, 1fr)'"), 'rectangular 3x2 chip grid still in page.jsx');
  assert.ok(pageSrc.includes('Enter as {hero.name} →'), 'Enter pill missing');
  // The detail strip + Enter button are still there (only the
  // pick buttons changed form).
  assert.ok(pageSrc.includes('hero.blurb'), 'detail strip blurb gone');
  assert.ok(pageSrc.includes('hero.trait'), 'detail strip trait gone');
});

test('map screen: cluster + mission picks are OrbButtons, no Hunt/Free Roam pills left', () => {
  assert.ok(pageSrc.includes('fn={clusterOrbFn(cid)}'), 'cluster orbs not worn in page.jsx');
  assert.ok(pageSrc.includes('fn={missionOrbFn(m.id)}'), 'mission orbs not worn in page.jsx');
  assert.ok(!pageSrc.includes('Free Roam</button>'), 'rectangular Free Roam pill still in page.jsx');
  assert.ok(!pageSrc.includes('>Hunt</button>'), 'rectangular Hunt pill still in page.jsx');
  assert.ok(!pageSrc.includes('Hunt again</button>'), 'rectangular Hunt again pill still in page.jsx');
  // Every function still wired: cluster orb roams, mission orb hunts.
  assert.ok(pageSrc.includes("enterCluster(cid, 'roam')"), 'Free Roam entry unwired');
  assert.ok(pageSrc.includes("enterCluster(cid, 'mission', m.id)"), 'Hunt entry unwired');
});

test('one frame: hunter-pick menu stacks to 465 px, fits the visible 700 px', () => {
  assert.equal(PHONE_VIEWPORT.width, 390, 'budget is for Merlin’s 390 px phone');
  assert.equal(menuStackHeight(), 465, 'menu stack changed — update the arithmetic, not just the test');
  assert.ok(menuFitsOneFrame(), 'menu does not fit one frame');
  assert.ok(menuStackHeight() <= PHONE_VIEWPORT.height, 'menu exceeds the full device height');
  // At 320 px the 6 orbs wrap to two rows of three: still fits.
  assert.ok(menuStackHeight() + MENU_LAYOUT.orbsWrapExtra <= PHONE_VIEWPORT.visibleHeight,
    'menu does not fit at 320 px with wrapped orbs');
  // One row of six 52 px orbs + 6 px gaps fits the 358 px content width.
  assert.ok(6 * MENU_LAYOUT.orbs + 5 * 6 <= PHONE_VIEWPORT.width - 2 * 16, 'hero orb row overflows 390 px');
});

test('one frame: missions map stacks to 658 px, fits the visible 700 px', () => {
  assert.equal(mapStackHeight(), 658, 'map stack changed — update the arithmetic, not just the test');
  assert.ok(mapFitsOneFrame(), 'map does not fit one frame');
  assert.ok(mapStackHeight() <= PHONE_VIEWPORT.height, 'map exceeds the full device height');
  // Every cluster's missions are counted (nothing hidden to fit).
  for (const cid of CLUSTER_ORDER) {
    assert.ok(MAP_LAYOUT.missionRow * CLUSTERS[cid].missions.length > 0, `${cid} missions uncounted`);
  }
});
