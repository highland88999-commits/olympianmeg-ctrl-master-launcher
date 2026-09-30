// tests/myriad-universes.test.js — Headless tests for the MYRIAD pocket universe.
// Run: node tests/myriad-universes.test.js (from the repo root).
// No browser, no network — asserts on lib/myriad-universes.js logic plus
// source-level checks (menu registration, locale keys, no telemetry).
import { readFileSync } from 'fs';
import {
  MASTER_SEED,
  UNIVERSE_COUNT,
  ANOMALIES,
  ANOMALY_LABELS,
  anomalyLabel,
  mulberry32,
  generateUniverses,
  UNIVERSES,
  universeById,
  sceneFor,
  MYRIAD_SPAWN,
} from '../lib/myriad-universes.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}
const HEX = /^#[0-9a-fA-F]{6}$/;

// --- generator basics ---
{
  t('exactly 100 universes', UNIVERSES.length === 100 && UNIVERSE_COUNT === 100);
  const ids = UNIVERSES.map((u) => u.id);
  t('ids are 1..100 with no gaps',
    ids.length === 100 && ids.every((id, i) => id === i + 1));
  t('ids unique', new Set(ids).size === 100);
  const names = UNIVERSES.map((u) => u.name);
  t('names unique', new Set(names).size === 100);
  t('names are non-empty strings', names.every((n) => typeof n === 'string' && n.length > 3));
  t('names start with "The "', names.every((n) => n.startsWith('The ')));
  t('seeds are unique unsigned ints',
    new Set(UNIVERSES.map((u) => u.seed)).size === 100 &&
    UNIVERSES.every((u) => Number.isInteger(u.seed) && u.seed >= 0));
}

// --- determinism ---
{
  const a = generateUniverses(MASTER_SEED);
  const b = generateUniverses(MASTER_SEED);
  t('same master seed -> deep equal', JSON.stringify(a) === JSON.stringify(b));
  t('UNIVERSES matches default generation',
    JSON.stringify(UNIVERSES) === JSON.stringify(generateUniverses()));
  const other = generateUniverses(MASTER_SEED + 1);
  t('different seed -> different universes',
    JSON.stringify(other) !== JSON.stringify(UNIVERSES));
  const r1 = mulberry32(1234);
  const r2 = mulberry32(1234);
  t('mulberry32 deterministic',
    r1() === r2() && r1() === r2() && r1() === r2());
  t('mulberry32 output in [0,1)', (() => {
    const r = mulberry32(99);
    for (let i = 0; i < 50; i++) { const v = r(); if (v < 0 || v >= 1) return false; }
    return true;
  })());
}

// --- descriptor fields ---
{
  t('palettes have 2-3 valid hex colors',
    UNIVERSES.every((u) =>
      Array.isArray(u.palette) && u.palette.length >= 2 && u.palette.length <= 3 &&
      u.palette.every((c) => HEX.test(c))));
  t('starDensity in (0,1]',
    UNIVERSES.every((u) => typeof u.starDensity === 'number' && u.starDensity > 0 && u.starDensity <= 1));
  t('nebulaCount int 0..3',
    UNIVERSES.every((u) => Number.isInteger(u.nebulaCount) && u.nebulaCount >= 0 && u.nebulaCount <= 3));
  t('galaxyCount int 0..2',
    UNIVERSES.every((u) => Number.isInteger(u.galaxyCount) && u.galaxyCount >= 0 && u.galaxyCount <= 2));
  t('anomaly in allowed set',
    UNIVERSES.every((u) => ANOMALIES.includes(u.anomaly)));
  t('anomaly set is exactly the five',
    JSON.stringify([...ANOMALIES].sort()) ===
    JSON.stringify(['crystalfield', 'none', 'starforge', 'voidbloom', 'wormhole'].sort()));
  t('descriptions are plain-English one-liners',
    UNIVERSES.every((u) =>
      typeof u.description === 'string' && u.description.length > 20 && !u.description.includes('\n')));
  t('every anomaly type appears at least once',
    ANOMALIES.every((a) => UNIVERSES.some((u) => u.anomaly === a)));
  t('anomalyLabel covers all', ANOMALIES.every((a) => !!anomalyLabel(a)));
  t('anomalyLabel unknown -> Quiet', anomalyLabel('bogus') === 'Quiet');
  t('labels object matches', Object.keys(ANOMALY_LABELS).every((k) => ANOMALIES.includes(k)));
}

// --- universeById ---
{
  t('universeById(1) is universe 1', universeById(1) && universeById(1).id === 1);
  t('universeById(100) is universe 100', universeById(100) && universeById(100).id === 100);
  t('universeById(37) has id 37', universeById(37).id === 37);
  t('universeById(0) -> null', universeById(0) === null);
  t('universeById(101) -> null', universeById(101) === null);
  t('universeById(-3) -> null', universeById(-3) === null);
}

// --- sceneFor ---
{
  const u = universeById(37);
  const s1 = sceneFor(u);
  const s2 = sceneFor(u);
  t('sceneFor deterministic', JSON.stringify(s1) === JSON.stringify(s2));
  t('scene galaxy count matches descriptor', s1.galaxies.length === u.galaxyCount);
  t('scene nebula count matches descriptor', s1.nebulae.length === u.nebulaCount);
  t('galaxies have pos + radius + arms + palette',
    s1.galaxies.every((g) =>
      g.pos && ['x', 'y', 'z'].every((ax) => Number.isFinite(g.pos[ax])) &&
      g.radius > 0 && g.arms >= 2 && g.palette.length >= 3 && g.name));
  t('nebulae have pos + radius + palette',
    s1.nebulae.every((n) =>
      n.pos && ['x', 'y', 'z'].every((ax) => Number.isFinite(n.pos[ax])) &&
      n.radius > 0 && n.palette.length >= 3 && n.name));
  const withAnom = UNIVERSES.find((x) => x.anomaly === 'wormhole');
  const sa = sceneFor(withAnom);
  t('wormhole anomaly has pos + radius + type',
    sa.anomaly && sa.anomaly.type === 'wormhole' && Number.isFinite(sa.anomaly.pos.x) && sa.anomaly.radius > 0);
  const quiet = UNIVERSES.find((x) => x.anomaly === 'none');
  t('quiet universe has null anomaly', sceneFor(quiet).anomaly === null);
  t('MYRIAD_SPAWN is 3D', ['x', 'y', 'z'].every((ax) => typeof MYRIAD_SPAWN[ax] === 'number'));
  t('scene positions are finite for all 100',
    UNIVERSES.every((x) => {
      const s = sceneFor(x);
      const pts = [...s.galaxies, ...s.nebulae].map((o) => o.pos);
      if (s.anomaly) pts.push(s.anomaly.pos);
      return pts.every((p) => ['x', 'y', 'z'].every((ax) => Number.isFinite(p[ax])));
    }));
}

// --- source-level checks: registration, locale, honesty, no telemetry ---
{
  const registry = readFileSync('lib/i18n/satellites.ts', 'utf8');
  t('registry has myriad entry (exact format)',
    registry.includes('{ key: "myriad", route: "/myriad", pos: "HERMES", section: "GAMES", constellation: "ZEUS" }'));

  const langs = ['de', 'el', 'en', 'es', 'fr', 'it', 'pt'];
  for (const lang of langs) {
    const loc = readFileSync(`lib/i18n/locales/${lang}.json`, 'utf8');
    if (!loc.includes('"sat.myriad.title": "Myriad"')) {
      failed++;
      console.error(`FAIL: ${lang} locale missing sat.myriad.title`);
    } else { passed++; }
    if (!loc.includes('"sat.myriad.subtitle": "100 Universes"')) {
      failed++;
      console.error(`FAIL: ${lang} locale missing sat.myriad.subtitle`);
    } else { passed++; }
  }

  const page = readFileSync('app/myriad/page.jsx', 'utf8');
  const pcode = stripComments(page);
  t('page: no central_telemetry', !/central_telemetry/.test(pcode));
  t('page: no phone-home', !/phone.?home/i.test(pcode));
  t('page: no fetch', !/fetch\(/.test(pcode));
  t('page: no supabase', !/supabase/i.test(pcode));
  t('page: no external URLs', !/https?:\/\//.test(pcode));
  t('page: reduced-motion respected', /prefers-reduced-motion/.test(page));
  t('page: safari bottom clearance', /safe-area-inset-bottom/.test(page));
  t('page: touch targets >= 44px', /min-h-\[44px\]/.test(page));
  t('page: autopilot tour present', /Autopilot tour/.test(page));
  t('page: return-to-atlas present', /Return to atlas/.test(page));
  t('page: reuses nova flight math', /stepFlight/.test(page) && /steerToward/.test(page));
  t('page: reuses tron bikes', /TRON_BIKES|bikeByKey/.test(page));
  t('page: tron bike wording', /tron bike/i.test(page));
  t('page: camera snaps on entry (snapCamRef)', /snapCamRef/.test(page));
  t('page: reuses deep-space scenery', /SpiralGalaxy|Nebula|Wormhole/.test(page));
  t('page: atlas grid present', /10/.test(page) && /grid/.test(page));

  const lib = readFileSync('lib/myriad-universes.js', 'utf8');
  const lcode = stripComments(lib);
  t('lib: no fetch/telemetry', !/fetch\(|telemetry|phone|supabase|https?:\/\//i.test(lcode));
  t('lib: no THREE import', !/from 'three'|require\(['"]three/.test(lcode));
  t('lib: no DOM access', !/document\.|window\./.test(lcode));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
