// tests/erebus-universes.test.js — Headless tests for the EREBUS pocket universe.
// Run: node tests/erebus-universes.test.js (from the repo root).
// No browser, no network — asserts on lib/erebus-universes.js logic plus
// source-level checks (route registration, menu registration, no telemetry).
import { readFileSync } from 'fs';
import {
  EREBUS_SEED,
  UNIVERSE_COUNT,
  UNIVERSES,
  universeById,
  generateUniverses,
  sceneFor,
  moonPosAt,
  obstaclesFor,
  resolveCollision,
  tuckedness,
  dist3,
  EREBUS_SPAWN,
  PORTAL,
  BARS_PER_UNIVERSE,
  BAR_COLLECT_RADIUS,
  GOLD_LIQUID_PER_BAR,
  blankProgress,
  loadProgress,
  saveProgress,
  markVisited,
  collectBar,
  barsFound,
  totalBars,
  visitedCount,
  blankLedger,
  loadLedger,
  saveLedger,
  creditBarToLedger,
  progressKey,
  ledgerKey,
} from '../lib/erebus-universes.js';

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

// --- identity ---------------------------------------------------------------
t('140 universes', UNIVERSE_COUNT === 140 && UNIVERSES.length === 140);
t('unique ids', new Set(UNIVERSES.map((u) => u.id)).size === 140);
t('unique names', new Set(UNIVERSES.map((u) => u.name)).size === 140);
t('ids 1..140', UNIVERSES.every((u, i) => u.id === i + 1));
t('seed constant', EREBUS_SEED === 20260930);
t('universeById works', universeById(1).id === 1 && universeById(140).id === 140);
t('universeById miss -> null', universeById(999) === null);
t('palettes are valid hex triples', UNIVERSES.every((u) =>
  u.palette.length === 3 && u.palette.every((c) => HEX.test(c))));
t('starDensity in range', UNIVERSES.every((u) => u.starDensity >= 0.4 && u.starDensity <= 1));
t('descriptions are plain-English', UNIVERSES.every((u) =>
  typeof u.description === 'string' && u.description.length > 40 &&
  !/lorem|TODO|FIXME/i.test(u.description)));

// --- determinism -------------------------------------------------------------
t('generateUniverses deterministic', JSON.stringify(generateUniverses(EREBUS_SEED)) === JSON.stringify(UNIVERSES));
t('different seed differs', generateUniverses(EREBUS_SEED + 1)[0].name !== UNIVERSES[0].name);
{
  const s1 = sceneFor(UNIVERSES[0]);
  const s2 = sceneFor(UNIVERSES[0]);
  t('sceneFor deterministic', JSON.stringify(s1) === JSON.stringify(s2));
  const s3 = sceneFor(UNIVERSES[77]);
  t('different universes differ', JSON.stringify(s1.planets) !== JSON.stringify(s3.planets));
}

// --- scene contents -----------------------------------------------------------
for (const idx of [0, 41, 139]) {
  const u = UNIVERSES[idx];
  const s = sceneFor(u);
  const tag = `u${u.id}`;
  t(`${tag}: planets 6..9`, s.planets.length >= 6 && s.planets.length <= 9);
  t(`${tag}: planet radii 8..22`, s.planets.every((p) => p.radius >= 8 && p.radius <= 22));
  t(`${tag}: planets ahead of spawn (z -60..-420)`, s.planets.every((p) => p.pos.z <= -60 && p.pos.z >= -420));
  t(`${tag}: moons 0..3 per planet`, s.planets.every((p) => {
    const ms = s.moons.filter((m) => m.planetKey === p.key);
    return ms.length >= 0 && ms.length <= 3;
  }));
  t(`${tag}: fields 2..3`, s.fields.length >= 2 && s.fields.length <= 3);
  t(`${tag}: rocks 40..69 per field`, s.fields.every((f) => f.rocks.length >= 40 && f.rocks.length <= 69));
  t(`${tag}: rock radii 1..4`, s.fields.every((f) => f.rocks.every((r) => r.r >= 1 && r.r <= 4)));
  t(`${tag}: nebulae 2..3`, s.nebulae.length >= 2 && s.nebulae.length <= 3);
  t(`${tag}: exactly 2 bars`, s.bars.length === BARS_PER_UNIVERSE);
  t(`${tag}: bar kinds open+tucked`, s.bars[0].kind === 'open' && s.bars[1].kind === 'tucked');
  t(`${tag}: collect radius sane`, BAR_COLLECT_RADIUS === 8);
}

// --- bar placement / difficulty -------------------------------------------------
for (const idx of [0, 13, 41, 88, 139]) {
  const u = UNIVERSES[idx];
  const s = sceneFor(u);
  const tag = `u${u.id}`;
  const [open, tucked] = s.bars;
  // Open bar: reachable, clear of planets, within a few seconds' flight.
  t(`${tag}: open bar 100..260 from spawn`, dist3(open.pos, EREBUS_SPAWN) >= 100 && dist3(open.pos, EREBUS_SPAWN) <= 260);
  t(`${tag}: open bar clear of planets`, s.planets.every((p) => dist3(open.pos, p.pos) >= p.radius + 20));
  // Tucked bar: still reachable, clear of planet interiors, near something.
  t(`${tag}: tucked bar within 340 of spawn`, dist3(tucked.pos, EREBUS_SPAWN) <= 340);
  t(`${tag}: tucked bar clear of planet interiors`, s.planets.every((p) => dist3(tucked.pos, p.pos) >= p.radius + 8));
  const tk = tuckedness(s, tucked.pos);
  t(`${tag}: tucked bar is tucked (near planet/moon/field)`, tk.nearPlanet || tk.nearMoon || tk.nearField);
  t(`${tag}: bars not on top of each other`, dist3(open.pos, tucked.pos) > 40);
}

// --- portal ----------------------------------------------------------------------
t('portal radius 8', PORTAL.radius === 8);
t('portal well placed: visible from spawn, above flight line, deliberate',
  dist3(PORTAL.pos, EREBUS_SPAWN) > 30 && dist3(PORTAL.pos, EREBUS_SPAWN) < 120 &&
  PORTAL.pos.y >= 6 && PORTAL.pos.z < 0);

// --- obstacles + collision ----------------------------------------------------------
{
  const s = sceneFor(UNIVERSES[0]);
  const t0 = obstaclesFor(s, 0);
  const t1 = obstaclesFor(s, 10);
  const expected = s.planets.length + s.moons.length + s.fields.reduce((n, f) => n + f.rocks.length, 0);
  t('obstaclesFor count = planets+moons+rocks', t0.length === expected);
  t('moons move with t', JSON.stringify(t0) !== JSON.stringify(t1));
  const p = s.planets[0];
  const m = s.moons.find((mm) => mm.planetKey === p.key);
  if (m) {
    const mp0 = moonPosAt(p, m, 0);
    t('moon orbits at orbitR', Math.abs(dist3(mp0, p.pos) - m.orbitR) < m.bobAmp + 0.01);
  }

  // Collision: pushed out of a sphere, no death.
  const rock = { x: 0, y: 0, z: 0, r: 5 };
  const inside = resolveCollision({ x: 1, y: 0, z: 0 }, 2, [rock]);
  t('collision hits', inside.hit === true);
  t('collision pushes to surface', Math.abs(dist3(inside.pos, rock) - 7) < 1e-6);
  const far = resolveCollision({ x: 100, y: 0, z: 0 }, 2, [rock]);
  t('no collision far away', far.hit === false && far.pos.x === 100);
  const center = resolveCollision({ x: 0, y: 0, z: 0 }, 2, [rock]);
  t('dead-center pushes up safely', center.hit === true && center.pos.y > 0);
}

// --- solid geometry: Merlin's rule — no clipping through anything, ----------
// --- all 140 universes. March a bike-sized sphere along 40 rays per universe,
// --- substepped exactly like the page, and prove it never rests inside rock.
{
  const R = 2.2; // bike collision radius (matches page BIKE_RADIUS)
  const dirs = [];
  for (let a = 0; a < 8; a++) {
    for (let b = -2; b <= 2; b++) {
      const yaw = (a / 8) * Math.PI * 2;
      const pitch = (b / 2) * 0.35;
      dirs.push({
        x: Math.sin(yaw) * Math.cos(pitch),
        y: Math.sin(pitch),
        z: Math.cos(yaw) * Math.cos(pitch),
      });
    }
  }
  let worst = 0;
  let worstAt = '';
  for (const u of UNIVERSES) {
    const s = sceneFor(u);
    const obs = obstaclesFor(s, 0);
    for (let di = 0; di < dirs.length; di++) {
      const d = dirs[di];
      let px = EREBUS_SPAWN.x;
      let py = EREBUS_SPAWN.y;
      let pz = EREBUS_SPAWN.z;
      // substepped march, mirroring the page's per-frame collision
      for (let step = 2; step <= 500; step += 2) {
        const res = resolveCollision(
          {
            x: EREBUS_SPAWN.x + d.x * step,
            y: EREBUS_SPAWN.y + d.y * step,
            z: EREBUS_SPAWN.z + d.z * step,
          },
          R,
          obs
        );
        px = res.pos.x;
        py = res.pos.y;
        pz = res.pos.z;
        if (res.hit) break; // bounced — like the page, the flight stops here
      }
      const p = { x: px, y: py, z: pz };
      for (const o of obs) {
        const pen = o.r + R - dist3(p, o);
        if (pen > worst) {
          worst = pen;
          worstAt = `u${u.id} dir${di}`;
        }
      }
    }
  }
  if (worst > 1e-6) console.error(`worst penetration ${worst} at ${worstAt}`);
  t('solid geometry: no clipping in any of 140 universes (40 rays each)', worst <= 1e-6);
}

// --- progress -------------------------------------------------------------------------
{
  const mem = (() => { const m = new Map(); return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
  }; })();
  const p0 = blankProgress();
  t('blank progress shape', p0.visited.length === 0 && p0.goldBars === 0);
  const p1 = markVisited(p0, 7);
  t('markVisited', p1.visited.includes(7) && !p0.visited.includes(7));
  t('markVisited idempotent', markVisited(p1, 7).visited.length === 1);
  const { progress: p2, fresh: f1 } = collectBar(p1, 7, 0);
  t('collectBar fresh', f1 === true && barsFound(p2, 7) === 1 && totalBars(p2) === 1);
  const { progress: p3, fresh: f2 } = collectBar(p2, 7, 0);
  t('collectBar idempotent', f2 === false && totalBars(p3) === 1);
  const { progress: p4 } = collectBar(p3, 7, 1);
  t('both bars', barsFound(p4, 7) === 2 && totalBars(p4) === 2);
  t('visitedCount', visitedCount(markVisited(p4, 9)) === 2);
  t('save/load roundtrip', saveProgress('u1', p4, mem) && barsFound(loadProgress('u1', mem), 7) === 2);
  t('loadProgress corrupt -> blank', barsFound(loadProgress('nope', { getItem: () => '###' }), 7) === 0);
  t('progress keys namespaced', progressKey('abc').includes('erebus:progress') && ledgerKey('abc').includes('erebus:gold'));
}

// --- ledger ------------------------------------------------------------------------------
{
  const mem = (() => { const m = new Map(); return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
  }; })();
  t('gold per bar = 1000 liquid', GOLD_LIQUID_PER_BAR === 1000);
  const l0 = blankLedger();
  const { ledger: l1, fresh: f1 } = creditBarToLedger(l0, 3, 0, 'The Silent Maw');
  t('ledger credit fresh', f1 && l1.balance === 1000 && l1.entries.length === 1);
  const { ledger: l2, fresh: f2 } = creditBarToLedger(l1, 3, 0, 'The Silent Maw');
  t('ledger idempotent', !f2 && l2.balance === 1000 && l2.entries.length === 1);
  const { ledger: l3 } = creditBarToLedger(l2, 3, 1, 'The Silent Maw');
  t('second bar credits', l3.balance === 2000 && l3.entries.length === 2);
  t('ledger save/load', saveLedger('u1', l3, mem) && loadLedger('u1', mem).balance === 2000);
}

// --- source-level checks ----------------------------------------------------------------------
const libSrc = stripComments(readFileSync(new URL('../lib/erebus-universes.js', import.meta.url), 'utf8'));
t('lib: no network calls', !/fetch\s*\(|XMLHttpRequest|WebSocket/.test(libSrc));
t('lib: no telemetry', !/central_telemetry|telemetry|analytics|ipify|hotlink/i.test(libSrc));
t('lib: no secrets', !/supabase|api[_-]?key|secret|token/i.test(libSrc));

const pageSrc = readFileSync(new URL('../app/erebus/page.jsx', import.meta.url), 'utf8');
const pageClean = stripComments(pageSrc);
t('page: exists and is a client component', /'use client'/.test(pageSrc));
t('page: no telemetry', !/central_telemetry|ipify/.test(pageClean));
t('page: no remote fetches', !/fetch\(['"]https?:/.test(pageClean));
t('page: uses TRON bike garage', /TronBikes|bikeByKey/.test(pageSrc));
t('page: uses nova flight math', /nova-flight|stepFlight/.test(pageSrc));
t('page: renders gold bars', /GoldBar|gold/i.test(pageSrc));
t('page: single portal button', /PORTAL|portal/i.test(pageSrc));
t('page: autopilot tour (toggle + steerToward + user disengage)',
  /autopilotRef/.test(pageSrc) && /steerToward/.test(pageSrc) &&
  /Toggle autopilot tour/.test(pageSrc));
t('page: substepped solid collision (no tunneling through rocks)',
  /substeps/.test(pageSrc) && /geometry is solid/.test(pageSrc));

const menus = readFileSync(new URL('../lib/god-menus.js', import.meta.url), 'utf8');
t('god-menus: erebus registered', /'erebus'/.test(menus));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
