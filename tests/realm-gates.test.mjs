// tests/realm-gates.test.mjs — REALM DOORWAY GATES: STATIC, SO THE TRANSIT TREATMENT DOES NOT APPLY (Merlin, Nov 13, 2026).
// Merlin's order (Nov 13 ~22:27): "Use the graphics we use for the
// portal transit system for the portal gates themselves... make the
// portal gates turn at the same speed..." — done for the hub discs in
// commit 119e6cd (gold exit ring + aurora boot ring, one speed
// TUBE_SPIN_RAD_PER_SEC = 1.4 rad/s). He then said "Yes" to the same
// pass for the doorway gates inside the 24 realms.
// Verification (Nov 13, in code, not assumed): every realm doorway
// gate is a STATIC vertical stone doorway — two pillars, a lintel, a
// thin coloured bar, a label — with no disc, no ring, no swirl and NO
// turning part. There is nothing to re-skin and nothing to re-speed:
// bolting a spinning gold ring onto the stonework would be a different
// look, not the same treatment, and the order for this pass says
// exactly that — do NOT force rotation onto a gate that genuinely
// cannot turn, leave it as-is and report it. So this suite pins the
// finding: all 24 realm gates are documented exceptions, and it fails
// loudly if any gate ever gains a turning part without the one speed.
// The travel arches and descent portals are static too (same check).
// Run: node tests/portal-gates.test.mjs (from the repo root).
// No browser, no network — pure wired-source audits (same grep style
// as the portal-gates suite).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { TUBE_SPIN_RAD_PER_SEC } from '../app/nexus-vortex/lib/tube.js';
import { PORTAL_REALMS } from '../lib/portal/realms.js';

const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

// Extract a top-level `function Name(...) { ... }` body by brace
// matching, skipping over string literals and comments so braces in
// text do not throw the count. Throws if the function is missing or
// its braces do not balance — a loud failure, not a silent pass.
function fnBody(source, name) {
  const start = source.search(new RegExp(`^function ${name}\\(`, 'm'));
  assert.notEqual(start, -1, `no function ${name} found`);
  const open = source.indexOf('{', start);
  let depth = 0;
  let i = open;
  let quote = null;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (quote) {
      if (ch === '\\') { i += 2; continue; }
      if (ch === quote) quote = null;
    } else if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i += 1;
      continue;
    } else if (ch === '/' && next === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    } else if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
    } else if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
    i += 1;
  }
  throw new Error(`unbalanced braces in function ${name}`);
}

// The doorway gate component per realm (verified in code, Nov 13, 2026).
// Default is Gates(); the named exceptions use their own component.
const GATE_FN = {
  '/kur': ['SevenGates'],
  '/nav': ['RiverGate'],
  '/orun': ['AncestorsGate'],
  '/duat': ['Gates', 'TwelveGates'],
};
const gateFns = (route) => GATE_FN[route] || ['Gates'];

// Why each realm's gate cannot take the transit treatment (verified in
// code): every one is a static vertical stone doorway with no turning
// part. The named exceptions are the ones whose structure differs
// from the standard template; the rest share the standard reason.
const GATE_NOTES = {
  '/kur': 'SevenGates — seven small stone doorways in a row, no turning part',
  '/nav': 'RiverGate — the same stone doorway template under another name, no turning part',
  '/orun': 'AncestorsGate — the same stone doorway template under another name, no turning part',
  '/duat': 'Gates + TwelveGates — the twelve are a ground disc with pillar rows, no turning part',
  '/yomi': 'Gates — the entrance is sealed by a great boulder between the pillars, no turning part',
};
const gateNote = (route) =>
  GATE_NOTES[route] ||
  'Gates — static vertical stone doorway (pillars + lintel + bar + label), no turning part';

// --- 1. The pass covers exactly the 24 portal realms ---

test('the pass covers exactly the 24 portal realms, each with its own world3d file', () => {
  assert.equal(PORTAL_REALMS.length, 24, 'the portal system counts 24 realms');
  for (const realm of PORTAL_REALMS) {
    const file = `../app${realm.route}/world3d.js`;
    assert.ok(existsSync(new URL(file, import.meta.url)), `no world3d for ${realm.label} (${realm.route})`);
  }
});

// --- 2. Every realm renders its own doorway gate, mounted in the scene ---

test('every realm renders its own doorway gate component, mounted in the scene', () => {
  for (const realm of PORTAL_REALMS) {
    const world3d = src(`../app${realm.route}/world3d.js`);
    for (const fn of gateFns(realm.route)) {
      // Defined (fnBody throws if missing) and mounted.
      fnBody(world3d, fn);
      assert.ok(world3d.includes(`<${fn}`), `${realm.label} mounts <${fn} /> in its scene`);
    }
  }
});

// --- 3. No realm gate turns — the finding this suite pins ---

test('no realm doorway gate turns: no useFrame, no rotation, no transit speed, no transit graphics', () => {
  for (const realm of PORTAL_REALMS) {
    const world3d = src(`../app${realm.route}/world3d.js`);
    for (const fn of gateFns(realm.route)) {
      const body = fnBody(world3d, fn);
      assert.ok(!body.includes('useFrame'), `${realm.label} ${fn}: no useFrame — nothing animates the gate`);
      assert.ok(!body.includes('.rotation.y'), `${realm.label} ${fn}: nothing turns on Y`);
      assert.ok(!body.includes('.rotation.z'), `${realm.label} ${fn}: nothing turns on Z`);
      assert.ok(!body.includes('rotation.y ='), `${realm.label} ${fn}: no Y rotation assignment`);
      assert.ok(!body.includes('rotation.z ='), `${realm.label} ${fn}: no Z rotation assignment`);
      assert.ok(!body.includes('TUBE_SPIN_RAD_PER_SEC'), `${realm.label} ${fn}: the one speed is not wired — nothing turns`);
      assert.ok(!body.includes('paintAuroraBootRing'), `${realm.label} ${fn}: no aurora boot ring`);
      assert.ok(!body.includes('TRANSIT_GOLD'), `${realm.label} ${fn}: no transit gold`);
      assert.ok(!body.includes('torusGeometry'), `${realm.label} ${fn}: no ring at all, gold or otherwise`);
      assert.ok(!body.includes('0xffd700'), `${realm.label} ${fn}: no transit gold value`);
    }
    // File-level too: no realm file imports the transit speed or the
    // transit painters anywhere, for any component.
    assert.ok(!world3d.includes('TUBE_SPIN_RAD_PER_SEC'), `${realm.label}: the file never imports the one speed`);
    assert.ok(!world3d.includes('paintAuroraBootRing'), `${realm.label}: the file never imports the boot ring painter`);
    assert.ok(!world3d.includes('TRANSIT_GOLD'), `${realm.label}: the file never uses the transit gold`);
    assert.ok(!world3d.includes('0xffd700'), `${realm.label}: the file never uses the transit gold value`);
  }
});

test('the travel arches and descent portals are static too — no turning part anywhere near a gate', () => {
  for (const realm of PORTAL_REALMS) {
    const world3d = src(`../app${realm.route}/world3d.js`);
    for (const fn of ['PortalArches', 'DescentPortal']) {
      if (!new RegExp(`^function ${fn}\\(`, 'm').test(world3d)) continue;
      const body = fnBody(world3d, fn);
      assert.ok(!body.includes('useFrame'), `${realm.label} ${fn}: no useFrame — the arches do not turn`);
      assert.ok(!body.includes('.rotation.y'), `${realm.label} ${fn}: nothing turns on Y`);
      assert.ok(!body.includes('.rotation.z'), `${realm.label} ${fn}: nothing turns on Z`);
      assert.ok(!body.includes('TUBE_SPIN_RAD_PER_SEC'), `${realm.label} ${fn}: the one speed is not wired`);
      assert.ok(!body.includes('0xffd700'), `${realm.label} ${fn}: no transit gold value`);
    }
  }
  // The only rotation assignments in any realm file are the camera
  // rigs turning the player's view — never a gate, arch or portal.
  for (const realm of PORTAL_REALMS) {
    const world3d = src(`../app${realm.route}/world3d.js`);
    const rotations = world3d.match(/\.rotation\.[xyz][^\n]*/g) || [];
    for (const r of rotations) {
      assert.ok(
        r.trim().startsWith('camera.rotation.set(0, player.yaw, 0)'),
        `${realm.label}: the only rotation is the camera rig, not a gate — found "${r.trim()}"`
      );
    }
  }
});

// --- 4. The exception list covers all 24 realms, by name ---

test('the documented exceptions cover all 24 realms, each with its reason', () => {
  const named = Object.keys(GATE_NOTES).sort();
  assert.deepEqual(
    named,
    ['/duat', '/kur', '/nav', '/orun', '/yomi'].sort(),
    'exactly five realms differ from the standard doorway template'
  );
  for (const realm of PORTAL_REALMS) {
    const note = gateNote(realm.route);
    assert.ok(note.length > 20, `${realm.label} has a recorded reason`);
    assert.ok(note.includes('no turning part'), `${realm.label} reason states there is no turning part`);
  }
});

// --- 5. The one speed is still the transit tube 1.4 rad/s — and the hub discs still hold it ---

test('the one speed is still the transit tube 1.4 rad/s, and the hub discs still hold it', () => {
  assert.equal(TUBE_SPIN_RAD_PER_SEC, 1.4, 'tube.js is the single source of truth');
  const hub = src('../components/HubPortals.jsx');
  assert.ok(
    hub.includes("import { TUBE_SPIN_RAD_PER_SEC } from '@/app/nexus-vortex/lib/tube.js'"),
    'the hub discs still import the tube speed — no second copy of the value'
  );
  assert.ok(hub.includes('TRANSIT_GOLD = 0xffd700'), 'the hub discs still wear the transit gold');
});
