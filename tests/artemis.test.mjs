// tests/artemis.test.mjs
// Headless tests for the rebuilt Artemis realm (Merlin's personal command deck).
// Run: node tests/artemis.test.mjs (from the repo root).
// No browser, no network. Logic lives in app/artemis/realm.js; the registry
// (lib/i18n/satellites.ts) is parsed as text since node cannot import TS.
import {
  REALM_NAME, REDUCED_MOTION_QUERY, QUICK_LAUNCH, SECTION_DESCRIPTIONS,
  resolveTarget, resolveQuickLaunch, countBy, constellationCounts,
  sectionCounts, fleetSummary, createStarfield, twinkle, formatRealmDate,
} from '../app/artemis/realm.js';
import { readFileSync, existsSync } from 'fs';

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

// --- load the real registry from the TS source (read-only, never modified) ---
const regSrc = readFileSync('lib/i18n/satellites.ts', 'utf8');
const SATELLITES = [];
const re = /\{ key: "([^"]+)", route: "([^"]+)", pos: "([^"]+)", section: "([^"]+)", constellation: "([^"]+)" \}/g;
let m;
while ((m = re.exec(regSrc)) !== null) {
  SATELLITES.push({ key: m[1], route: m[2], pos: m[3], section: m[4], constellation: m[5] });
}
t('registry parses (entries found)', SATELLITES.length > 100);

// --- quick-launch targets resolve against the REAL registry ---
t('8 quick-launch targets', QUICK_LAUNCH.length === 8);
const keys = QUICK_LAUNCH.map((q) => q.key);
t('no duplicate quick-launch keys', new Set(keys).size === keys.length);
for (const q of QUICK_LAUNCH) {
  const entry = resolveTarget(SATELLITES, q.key);
  t(`quick-launch "${q.key}" resolves in registry`, !!entry);
  t(`quick-launch "${q.key}" route starts with /`, entry && entry.route.startsWith('/'));
  t(`quick-launch "${q.key}" has label`, typeof q.label === 'string' && q.label.length > 0);
  t(`quick-launch "${q.key}" has plain blurb (<=60 chars)`, typeof q.blurb === 'string' && q.blurb.length <= 60);
}
const HYPE = ['revolutionary', 'ultimate', 'cutting-edge', 'AI-powered', 'next-gen', 'game-changer', 'world-class'];
for (const q of QUICK_LAUNCH) {
  t(`blurb for "${q.key}" has no hype words`, !HYPE.some((h) => q.blurb.toLowerCase().includes(h)));
}
t('resolveTarget: unknown key -> null', resolveTarget(SATELLITES, 'no-such-realm') === null);
t('resolveTarget: non-array -> null', resolveTarget(null, 'chess') === null);

// --- resolveQuickLaunch: registry wiring ---
const resolved = resolveQuickLaunch(SATELLITES);
t('resolveQuickLaunch resolves all 8', resolved.length === 8);
t('resolveQuickLaunch carries registry route', resolved.every((q) => q.route && q.route.startsWith('/')));
t('resolveQuickLaunch carries registry pos', resolved.every((q) => typeof q.pos === 'string' && q.pos.endsWith('_POS')));
const chess = resolved.find((q) => q.key === 'chess');
t('chess -> /chess', chess && chess.route === '/chess');
const dropped = resolveQuickLaunch(SATELLITES.filter((s) => s.key !== 'ares'));
t('missing registry key is dropped, not faked', dropped.length === 7 && !dropped.some((q) => q.key === 'ares'));

// --- fleet counts derived from real data ---
const sum = fleetSummary(SATELLITES);
t('fleet total equals registry length', sum.total === SATELLITES.length);
t('constellation counts sum to total', sum.constellations.reduce((a, c) => a + c.count, 0) === SATELLITES.length);
t('section counts sum to total', sum.sections.reduce((a, s) => a + s.count, 0) === SATELLITES.length);
for (const c of ['ZEUS', 'ARES', 'THOTH', 'ARGUS', 'MEDUSA', 'ARTEMIS']) {
  t(`constellation ${c} present`, sum.constellations.some((x) => x.name === c));
}
for (const s of ['GAMES', 'UTILITIES', 'TOOLS', 'AI PROGRAMS', 'OBSERVATORY', 'THERAPY', 'SANCTUM']) {
  t(`section ${s} present`, sum.sections.some((x) => x.name === s));
}
t('every section has a plain-English blurb', sum.sections.every((s) => typeof s.blurb === 'string' && s.blurb.length > 0));
t('countBy preserves first-seen order', countBy([{ k: 'b' }, { k: 'a' }, { k: 'b' }], 'k').map((x) => x.name).join(',') === 'b,a');
t('countBy skips missing fields', countBy([{ k: 'a' }, {}, { k: 'a' }], 'k')[0].count === 2);
t('fleetSummary tolerates non-array', fleetSummary(null).total === 0);
t('constellationCounts matches manual filter', (() => {
  const zeus = SATELLITES.filter((s) => s.constellation === 'ZEUS').length;
  return constellationCounts(SATELLITES).find((x) => x.name === 'ZEUS').count === zeus;
})());

// --- starfield: deterministic, bounded, subtle ---
const f1 = createStarfield(42), f2 = createStarfield(42);
t('starfield deterministic (same seed)', JSON.stringify(f1) === JSON.stringify(f2));
t('starfield default count 140', createStarfield().length === 140);
t('starfield custom count honored', createStarfield(1, 10).length === 10);
t('stars within unit square', f1.every((s) => s.x >= 0 && s.x < 1 && s.y >= 0 && s.y < 1));
t('star radius positive and small', f1.every((s) => s.r > 0 && s.r <= 2));
t('twinkle stays subtle (0.5..1)', (() => {
  for (const s of f1) for (const tsec of [0, 1.7, 42.3]) {
    const v = twinkle(s, tsec);
    if (v < 0.5 || v > 1) return false;
  }
  return true;
})());

// --- misc pure helpers ---
t('realm name is Artemis', REALM_NAME === 'Artemis');
t('reduced-motion query is correct', REDUCED_MOTION_QUERY === '(prefers-reduced-motion: reduce)');
t('formatRealmDate returns a readable date', /2026|September/.test(formatRealmDate(new Date('2026-09-28'))));
t('section descriptions cover 8 sections', Object.keys(SECTION_DESCRIPTIONS).length === 8);

// --- realm renders: page source wiring ---
const page = readFileSync('app/artemis/page.jsx', 'utf8');
t('page imports ./realm', page.includes("from './realm'"));
t('page imports the satellite registry', page.includes('@/lib/i18n/satellites'));
t('page has zero http(s) URLs (no external requests)', !/https?:\/\//.test(page));
t('page defines launchPocketUniverse(route, targetPos)', /launchPocketUniverse\(\s*route\s*,\s*_?targetPos\s*\)/.test(page));
t('page honors reduced motion', page.includes('prefers-reduced-motion'));
t('page has back-to-launcher link', page.includes('href="/"'));
t('page has 44px touch targets', /minHeight:\s*44/.test(page));
t('page titles the realm Artemis', page.includes('Artemis'));
t('page shows real fleet counts', page.includes('summary.total'));
t('page renders every quick-launch card from data', page.includes('quickLaunch.map'));
t('page is mobile-friendly (dvh + responsive grid)', page.includes('100dvh') && page.includes('auto-fill'));
t('no faux-OS remnants (terminal)', !/bootLines|spawnWindow|runCommand/.test(page));
t('no telemetry', !/telemetry|analytics|ipify|supabase/i.test(page));

// --- privacy: nothing about Miles' vault ---
t('page never mentions Miles', !/Miles/.test(page));
t('page never mentions vault', !/vault/i.test(page));
t('realm.js never mentions vault', !/vault/i.test(readFileSync('app/artemis/realm.js', 'utf8')));

// --- faux-OS fully removed ---
for (const f of ['app/artemis/os.js', 'app/artemis/terminal.js', 'app/artemis/monitor.js', 'app/artemis/background.js']) {
  t(`removed: ${f}`, !existsSync(f));
}

console.log(`\nartemis: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
