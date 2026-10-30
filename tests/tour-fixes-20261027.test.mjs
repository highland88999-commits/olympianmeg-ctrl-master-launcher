// tests/tour-fixes-20261027.test.mjs — Pins for the 2026-10-27 browser
// tour findings (headless, source-level; no browser, no network).
// Run: node tests/tour-fixes-20261027.test.mjs (from the repo root).
import { readFileSync, readdirSync } from 'fs';

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

// --- Tour flaw 6/7: hub menu showed raw "sat.star-wars.title" /
// "sat.middle-earth.title" keys because no locale carried them.
// Every locale must carry readable titles now (titles are proper
// nouns, identical in every locale; subtitles are the programs'
// own words).
{
  const files = readdirSync('lib/i18n/locales').filter((f) => f.endsWith('.json'));
  t('34 locale files', files.length === 34);
  for (const f of files) {
    const d = JSON.parse(readFileSync(`lib/i18n/locales/${f}`, 'utf8'));
    t(`${f}: star-wars title+subtitle`, d['sat.star-wars.title'] === 'Star Wars' && !!d['sat.star-wars.subtitle']);
    t(`${f}: middle-earth title+subtitle`, d['sat.middle-earth.title'] === 'Middle-earth' && !!d['sat.middle-earth.subtitle']);
    t(`${f}: myriad title is "Myriad"`, d['sat.myriad.title'] === 'Myriad');
  }
}

// --- Tour flaw 11: "Myriad" had no hub search match because the
// menu title was "100 Universes". Search matches title+subtitle
// (lib/menu-search.js), so the title fix above restores it; the
// entry itself was already seated (HERMES, /myriad) — no seating
// change, no deliberate-exception question.
{
  const reg = readFileSync('lib/i18n/satellites.ts', 'utf8');
  t('myriad seated (HERMES, /myriad)',
    reg.includes('{ key: "myriad", route: "/myriad", pos: "HERMES"'));
  const menus = readFileSync('lib/god-menus.js', 'utf8');
  t('myriad claimed by HERMES menu', menus.includes("'myriad'"));
}

// --- Tour flaw 9: Star Wars Naboo free roam showed no walk control
// on non-touch browsers because the joystick was gated on isTouch,
// while Middle-earth / Hollow Earth render theirs unconditionally.
{
  const sw = readFileSync('app/star-wars/page.jsx', 'utf8');
  t('star-wars renders WalkJoystick', sw.includes('<WalkJoystick onMove={onJoy}'));
  t('star-wars joystick has no isTouch gate', !/isTouch\s*&&\s*\(\s*<div[^>]*stickWrap/.test(sw));
  t('star-wars has no leftover isTouch', !sw.includes('isTouch'));
  const me = readFileSync('app/middle-earth/page.jsx', 'utf8');
  t('middle-earth joystick unconditional (reference)', me.includes('<WalkJoystick onMove={onJoy}'));
}

// --- Tour flaw 12: World Nexus canvas stayed black because the
// frame loop never called renderer.render.
{
  const scene = readFileSync('app/world-nexus/scene.js', 'utf8');
  const tick = scene.slice(scene.indexOf('function tick(now)'));
  t('world-nexus tick renders the scene', tick.includes('renderer.render(scene, camera)'));
  t('world-nexus still fires onReady on first frame', tick.includes('if (onReady) onReady('));
}

console.log(`tour-fixes-20261027: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
