// tests/myriad-wonders.test.js — Headless tests for MYRIAD extra sites.
// Run: node tests/myriad-wonders.test.js (from the repo root).
import {
  NEW_ANOMALIES,
  FIND_KINDS,
  wonderDef,
  findDef,
  WALK_RADIUS,
  sitesFor,
  landingSitesFor,
  foundKey,
  parseFoundKey,
} from '../lib/myriad-wonders.js';
import { UNIVERSES, universeById, sceneFor } from '../lib/myriad-universes.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}
const finitePos = (p) => p && ['x', 'y', 'z'].every((ax) => Number.isFinite(p[ax]));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

// --- catalogues ---
{
  t('exactly 3 new wonders', NEW_ANOMALIES.length === 3);
  t('wonder kinds unique', new Set(NEW_ANOMALIES.map((w) => w.kind)).size === 3);
  t('wonders have plain labels + colors + descs',
    NEW_ANOMALIES.every((w) => w.label && w.color && w.desc && typeof w.landable === 'boolean'));
  t('echo reef is landable, others are not',
    wonderDef('echo-reef').landable === true &&
    wonderDef('aurora-veil').landable === false &&
    wonderDef('comet-swarm').landable === false);
  t('exactly 3 find kinds', FIND_KINDS.length === 3);
  t('derelict is landable, signal + phenomenon are not',
    findDef('derelict').landable === true &&
    findDef('signal').landable === false &&
    findDef('phenomenon').landable === false);
  t('wonderDef unknown -> null', wonderDef('bogus') === null);
  t('findDef unknown -> null', findDef('bogus') === null);
  t('WALK_RADIUS is 26', WALK_RADIUS === 26);
}

// --- sitesFor: shape + determinism + identity preservation ---
{
  for (const u of UNIVERSES) {
    const a = sitesFor(u);
    const b = sitesFor(u);
    if (JSON.stringify(a) !== JSON.stringify(b)) { t(`sitesFor deterministic (u${u.id})`, false); break; }
  }
  t('sitesFor deterministic for all 100', true);
  t('every universe gets 2-4 finds',
    UNIVERSES.every((u) => {
      const n = sitesFor(u).filter((s) => s.group === 'find').length;
      return n >= 2 && n <= 4;
    }));
  t('every universe gets at most 1 wonder',
    UNIVERSES.every((u) => sitesFor(u).filter((s) => s.group === 'wonder').length <= 1));
  t('wonder kinds come from the catalogue',
    UNIVERSES.every((u) => sitesFor(u).filter((s) => s.group === 'wonder')
      .every((s) => NEW_ANOMALIES.some((w) => w.kind === s.kind))));
  t('find kinds come from the catalogue',
    UNIVERSES.every((u) => sitesFor(u).filter((s) => s.group === 'find')
      .every((s) => FIND_KINDS.some((f) => f.kind === s.kind))));
  t('all site positions finite',
    UNIVERSES.every((u) => sitesFor(u).every((s) => finitePos(s.pos))));
  t('all site radii positive',
    UNIVERSES.every((u) => sitesFor(u).every((s) => s.radius > 0)));
  t('site ids unique within a universe',
    UNIVERSES.every((u) => {
      const ids = sitesFor(u).map((s) => s.id);
      return new Set(ids).size === ids.length;
    }));
  t('sites stay clear of the primary anomaly (>= 30 units)',
    UNIVERSES.every((u) => {
      const scene = sceneFor(u);
      if (!scene.anomaly) return true;
      return sitesFor(u).every((s) => dist(s.pos, scene.anomaly.pos) >= 30);
    }));
  t('sitesFor never changes the universe descriptor or its scene',
    UNIVERSES.every((u) => {
      const beforeU = JSON.stringify(u);
      const beforeS = JSON.stringify(sceneFor(u));
      sitesFor(u);
      return JSON.stringify(u) === beforeU && JSON.stringify(sceneFor(u)) === beforeS;
    }));
  t('at least one universe has each wonder kind',
    NEW_ANOMALIES.every((w) => UNIVERSES.some((u) =>
      sitesFor(u).some((s) => s.group === 'wonder' && s.kind === w.kind))));
  t('at least one universe has each find kind',
    FIND_KINDS.every((f) => UNIVERSES.some((u) =>
      sitesFor(u).some((s) => s.group === 'find' && s.kind === f.kind))));
}

// --- landing sites ---
{
  t('wormhole universes do not offer the wormhole as a landing site',
    UNIVERSES.filter((u) => u.anomaly === 'wormhole').every((u) =>
      landingSitesFor(u).every((s) => s.kind !== 'wormhole')));
  t('starforge/voidbloom/crystalfield universes offer the anomaly as a landing site',
    UNIVERSES.filter((u) => ['starforge', 'voidbloom', 'crystalfield'].includes(u.anomaly)).every((u) =>
      landingSitesFor(u).some((s) => s.group === 'anomaly')));
  t('every landing site is landable with walk radius + prop',
    UNIVERSES.every((u) => landingSitesFor(u).every(
      (s) => s.landable === true && s.radius === WALK_RADIUS && typeof s.prop === 'string')));
  t('landing site positions finite',
    UNIVERSES.every((u) => landingSitesFor(u).every((s) => finitePos(s.pos))));
  const u37 = universeById(37);
  t('landingSitesFor deterministic',
    JSON.stringify(landingSitesFor(u37)) === JSON.stringify(landingSitesFor(u37)));
}

// --- found keys ---
{
  t('foundKey format', foundKey(12, 'signal-0') === '12:signal-0');
  t('parseFoundKey round-trips',
    JSON.stringify(parseFoundKey('12:signal-0')) === JSON.stringify({ universeId: 12, siteId: 'signal-0' }));
  t('parseFoundKey rejects bad input',
    parseFoundKey('nocolon') === null && parseFoundKey('x:signal-0') === null &&
    parseFoundKey(42) === null && parseFoundKey('12:') === null);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
