// tests/god-menus.test.js — Headless tests for the 10 god-menu navigation.
// Run: node tests/god-menus.test.js (from the repo root). No browser, no network.
import { readFileSync } from 'fs';
import { GOD_MENUS, godMenuFor, allGodMenuSatellites, menuBannerFor, menuArtFor } from '../lib/god-menus.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

// --- satellites.ts: the canonical satellite list ---------------------------
const satSrc = readFileSync('lib/i18n/satellites.ts', 'utf8');
const satKeys = [...satSrc.matchAll(/\{ key: "([^"]+)", route: "([^"]+)", pos: "([^"]+)", section: "([^"]+)", constellation: "([^"]+)" \}/g)]
  .map((m) => m[1]);

// --- shape: exactly 10 god menus -------------------------------------------
t('exactly 10 god menus', GOD_MENUS.length === 10);

const godNameRe = /^[A-Z][A-Z]+$/;
for (const m of GOD_MENUS) {
  t(`${m.god}: god name is a single uppercase mythic word`, godNameRe.test(m.god));
  t(`${m.god}: plain-English category label`, typeof m.category === 'string' && m.category.length >= 4 && m.category.length <= 40);
  t(`${m.god}: tagline explains the contents`, typeof m.tagline === 'string' && m.tagline.length >= 20);
  t(`${m.god}: satellites is a non-empty array`, Array.isArray(m.satellites) && m.satellites.length > 0);
  // 2026-10-01 framework (Merlin + Gemini): ARTEMIS holds 23 after the deep-space
  // moves. Menus scroll vertically, so the bound is headroom, not a target.
  t(`${m.god}: menu size is sane (within 8..24)`, m.satellites.length >= 8 && m.satellites.length <= 24);
  t(`${m.god}: texture is null or an honest menus texture path`,
    m.texture === null || (typeof m.texture === 'string' && m.texture.startsWith('/textures/menus/')));
  t(`${m.god}: gradient fallback is two hex colors`,
    Array.isArray(m.gradient) && m.gradient.length === 2 && m.gradient.every((c) => /^#[0-9a-fA-F]{6}$/.test(c)));
  t(`${m.god}: menuArt points at the 2026-10-01 transfer banner`,
    m.menuArt === `/images/menu/banners/banner-${m.god.toLowerCase()}.webp`);
  t(`${m.god}: menuBannerFor matches menuArt`, menuBannerFor(m.god) === m.menuArt);
}

// --- coverage: every satellite in exactly one god menu ----------------------
const claimed = allGodMenuSatellites();
t('no satellite claimed twice', new Set(claimed).size === claimed.length);

const satSet = new Set(satKeys);
const orphaned = satKeys.filter((k) => !claimed.includes(k));
t(`no orphaned satellites (${orphaned.length})`, orphaned.length === 0);
if (orphaned.length) console.error('  orphaned:', orphaned.join(', '));

const unknown = claimed.filter((k) => !satSet.has(k));
t(`no phantom keys in god menus (${unknown.length})`, unknown.length === 0);
if (unknown.length) console.error('  phantom:', unknown.join(', '));

t('god-menu satellite count matches satellites.ts', claimed.length === satKeys.length);

// --- menu art: every program button resolves to its transfer image -----------
for (const k of claimed) {
  t(`menu art path for ${k}`, menuArtFor(k) === `/images/menu/programs/${k}.webp`);
}

// --- HERMES: transit, comms & shopping (2026-09-30, Merlin's direction) ------
import { GOD_HEX } from '../lib/god-orbits.js';
const hermesMenu = GOD_MENUS.find((m) => m.god === 'HERMES');
t('HERMES is the Transit, Comms & Shopping category', hermesMenu && hermesMenu.category === 'Transit, Comms & Shopping');
// Merlin's correction 2026-09-30: Hermes' landing as HE made it — the paid
// directory (/hermes) leads the menu; the Omega Store is the shopping program
// under it, not the landing.
t('HERMES leads with Hermes\' landing as Merlin made it (the paid directory)',
  hermesMenu && hermesMenu.satellites[0] === 'hermes');
t('HERMES keeps the Omega Store in its shopping row',
  hermesMenu && hermesMenu.satellites.includes('store'));
t('HERMES wears the merchant gold accent', hermesMenu && hermesMenu.accent === 'gold');
t('merchant gold resolves to a real hex for the 3D ring',
  typeof GOD_HEX.gold === 'string' && /^#[0-9a-fA-F]{6}$/.test(GOD_HEX.gold));
t('godMenuFor routes the store to HERMES', godMenuFor('store')?.god === 'HERMES');

// --- helpers ----------------------------------------------------------------
t('godMenuFor finds the right menu', godMenuFor('chess')?.god === 'ATHENA'); // 2026-10-01 framework: chess moved ARES -> ATHENA
t('godMenuFor finds plutus menu', godMenuFor('liquid-gold')?.god === 'PLUTUS');
t('godMenuFor finds therapy menu', godMenuFor('grief-gully')?.god === 'HESTIA');
t('godMenuFor returns null for unknown key', godMenuFor('nope-not-real') === null);

// --- wiring: single entry point ---------------------------------------------
const pageSrc = stripComments(readFileSync('app/page.jsx', 'utf8'));
// Phase 2b (2026-09-30): the home 3D scene was code-split out of app/page.jsx
// into components/HomeScene.jsx. Scene assertions read the scene file.
const sceneSrc = stripComments(readFileSync('components/HomeScene.jsx', 'utf8'));
t('shell declutter: satellite menu (floating button) is the single launcher, GodMenuPanel not rendered',
  pageSrc.includes('<SatelliteMenu') && !pageSrc.includes('GodMenuPanel'));
t('home keeps launchPocketUniverse as the menu-to-satellite function',
  pageSrc.includes('const launchPocketUniverse'));
t('home passes launchPocketUniverse into the god menu panel',
  pageSrc.includes('onLaunch') && pageSrc.includes('launchPocketUniverse(route, key, pos)'));
t('home resolves menu launches to live orbit positions',
  pageSrc.includes('orbitPositionFor'));

const panelSrc = stripComments(readFileSync('components/GodMenuPanel.jsx', 'utf8'));
t('panel launches satellites only through onLaunch (no direct router.push)',
  panelSrc.includes('onLaunch(') && !panelSrc.includes('router.push'));
t('panel shows god name, category, tagline, and count',
  panelSrc.includes('menu.god') && panelSrc.includes('menu.category') &&
  panelSrc.includes('menu.tagline') && panelSrc.includes('menu.satellites.length'));
t('panel degrades honestly when a menu texture is missing (onError fallback)',
  panelSrc.includes('onError'));

// --- constellation layer untouched (3D grouping still intact) ----------------
t('satellites.ts still carries constellation + pos for the 3D layer',
  satSrc.includes('constellation:') && satSrc.includes('pos:'));

// --- orbit rings: the 10 god bands around the constellation center ---------
import {
  GOD_BANDS,
  ORBIT_CENTER,
  EARTH_CENTER,
  EARTH_RADIUS,
  MAX_BAND_RADIUS,
  RING_SPIN,
  BIKE_PARK_POS,
  RIDER_OFFSET,
  BIKE_LOOK_AHEAD,
  bandAngle,
  orbitTime,
  orbitPositionFor,
  menuSatellitePosition,
  dist3,
} from '../lib/god-orbits.js';

t('exactly 10 orbit bands, one per god menu, in order',
  GOD_BANDS.length === 10 && GOD_BANDS.every((b, i) => b.god === GOD_MENUS[i].god));
t('band radii grow outward and clear the old tower ring (r~40)',
  GOD_BANDS.every((b, i) => b.radius >= 46 && (i === 0 || b.radius > GOD_BANDS[i - 1].radius)));
t('exactly ONE physical satellite per band (10 total, not every program)',
  GOD_BANDS.every((b) => b.count === 1));
t('bandAngle advances with time (bands actually orbit)',
  GOD_BANDS.every((b) => bandAngle(b, 10) > bandAngle(b, 0)));
t('the 10 satellites are evenly spaced: phases exactly 36° apart',
  GOD_BANDS.every((b, i) => Math.abs(b.phase - (i * Math.PI * 2) / 10) < 1e-12));
t('world-space satellite spacing reads even (tilt perturbs < 1°)',
  [0, 30, 300, 1000].every((tt) => {
    const angs = GOD_BANDS.map((_, i) => {
      const p = menuSatellitePosition(i, tt);
      return Math.atan2(p.z - ORBIT_CENTER.z, p.x - ORBIT_CENTER.x);
    });
    return angs.every((a, i) => {
      const b = angs[(i + 1) % angs.length];
      let d = (b - a) % (Math.PI * 2);
      if (d < 0) d += Math.PI * 2;
      return Math.abs(d - (Math.PI * 2) / 10) < 0.02; // < ~1.15°
    });
  }));
t('ring spin is counter-rotation against Earth (negative Y application)',
  RING_SPIN > 0 &&
  stripComments(readFileSync('components/GodOrbitRings.jsx', 'utf8'))
    .includes('-RING_SPIN * orbitTime()'));
t('orbitPositionFor resolves through the program menu to its one satellite',
  (() => {
    const p = orbitPositionFor('chess', 42);
    const bandIdx = GOD_MENUS.findIndex((m) => m.god === godMenuFor('chess').god);
    const q = menuSatellitePosition(bandIdx, 42); // chess → its god's band
    return p && q && Math.abs(p.x - q.x) < 1e-9 && Math.abs(p.y - q.y) < 1e-9 && Math.abs(p.z - q.z) < 1e-9;
  })());

const finite = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
const sampleTimes = [0, 7.5, 123.456];
for (const tt of sampleTimes) {
  const bad = satKeys.filter((k) => !finite(orbitPositionFor(k, tt)));
  t(`every satellite has a finite orbit position at t=${tt} (${bad.length} bad)`, bad.length === 0);
  if (bad.length) console.error('  bad:', bad.join(', '));
}
t('orbit lookup is deterministic for the same time',
  satKeys.every((k) => {
    const a = orbitPositionFor(k, 42);
    const b = orbitPositionFor(k, 42);
    return a.x === b.x && a.y === b.y && a.z === b.z;
  }));
t('orbit lookup returns null for unknown keys', orbitPositionFor('nope-not-real', 1) === null);

// Nodes must stay outside the Earth and inside the camera far plane.
for (const tt of sampleTimes) {
  const insideEarth = satKeys.filter((k) => dist3(orbitPositionFor(k, tt), EARTH_CENTER) < EARTH_RADIUS + 5);
  t(`no orbit node inside the Earth at t=${tt}`, insideEarth.length === 0);
  const tooFar = satKeys.filter((k) => dist3(orbitPositionFor(k, tt), ORBIT_CENTER) > 400);
  t(`no orbit node absurdly far from center at t=${tt}`, tooFar.length === 0);
}

// --- spawn: camera starts in the middle, bike parked ahead ------------------
t('home camera spawns at the constellation center (middle of the satellites)',
  sceneSrc.includes('position: [ORBIT_CENTER.x, ORBIT_CENTER.y, ORBIT_CENTER.z]'));
t('bike is parked just outside the outermost band on the -Z view axis',
  BIKE_PARK_POS[0] === ORBIT_CENTER.x &&
  BIKE_PARK_POS[1] === ORBIT_CENTER.y &&
  (ORBIT_CENTER.z - BIKE_PARK_POS[2]) > MAX_BAND_RADIUS &&
  (ORBIT_CENTER.z - BIKE_PARK_POS[2]) < MAX_BAND_RADIUS + 15);
t('rider offset sits above/behind the bike nose (sane mount point)',
  RIDER_OFFSET.y > 1 && RIDER_OFFSET.y < 4 && RIDER_OFFSET.z < 0 && BIKE_LOOK_AHEAD > 10);
t('home renders the god orbit rings', sceneSrc.includes('GodOrbitRings'));
t('home renders the parked bike rig', sceneSrc.includes('BikeRig'));
t('spawn-to-bike button exists, fixed bottom-right with bar clearance',
  pageSrc.includes('SPAWN TO BIKE') && pageSrc.includes('bottom-[calc(8.75rem+env(safe-area-inset-bottom))] right-5 z-[80]'));
t('camera controller handles to_bike and on_bike states',
  pageSrc.includes("'to_bike'") && pageSrc.includes("'on_bike'"));

const ringsSrc = stripComments(readFileSync('components/GodOrbitRings.jsx', 'utf8'));
t('orbit rings carry no launch wiring at all (menu-only navigation)',
  !ringsSrc.includes('router.push') && !ringsSrc.includes('onLaunch'));
t('orbit rings share the analytic clock (no render-clock drift)',
  ringsSrc.includes('orbitTime()') && ringsSrc.includes('-RING_SPIN * orbitTime()'));
t('orbit nodes stay crisp (fog off on the orbit layer)',
  ringsSrc.includes('fog={false}'));

const bikeSrc = stripComments(readFileSync('components/BikeRig.jsx', 'utf8'));
t('bike rig reuses the existing TRON bike model (no duplicate model)',
  bikeSrc.includes('WispBike') && bikeSrc.includes("from './nova/TronBikes'"));

console.log(`\ngod-menus: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
