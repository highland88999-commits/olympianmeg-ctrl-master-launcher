// tests/portal-gates.test.mjs — THE PORTAL GATES WEAR THE TRANSIT (Merlin, Nov 13, 2026).
// The hub's Heaven + Nether discs carry the portal transit system's
// own graphics — the vortex tube's gold exit ring and the aurora
// boot's conic ring — and every turning part of every gate turns at
// ONE speed: the transit tube's spin, TUBE_SPIN_RAD_PER_SEC (1.4
// rad/s), frame-rate independent via the useFrame delta. Before this
// the face, the nanites and the aurora fan each turned at a different
// fixed per-frame rate (0.004 / 0.0012 / 0.0006) — none of them the
// transit's speed.
// Run: node tests/portal-gates.test.mjs (from the repo root).
// No browser, no network — pure lib checks + wired-source audits
// (same grep style as the portal-system suite).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { TUBE_SPIN_RAD_PER_SEC, tubeSpinAngle } from '../app/nexus-vortex/lib/tube.js';
import { AURORA_BOOT_COLORS, paintAuroraBootRing } from '../lib/portal-swirl.js';
import { PORTAL_REALMS } from '../lib/portal/realms.js';

const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

// A recording 2D context for the pure painters (same stub style as
// the concourse portal tests): every call is logged, setters logged.
function recordingCtx() {
  const calls = [];
  return {
    calls,
    clearRect(...a) { calls.push(['clearRect', ...a]); },
    save() { calls.push(['save']); },
    restore() { calls.push(['restore']); },
    beginPath() { calls.push(['beginPath']); },
    arc(...a) { calls.push(['arc', ...a]); },
    clip() { calls.push(['clip']); },
    stroke() { calls.push(['stroke']); },
    set strokeStyle(v) { calls.push(['strokeStyle', v]); },
    set globalAlpha(v) { calls.push(['globalAlpha', v]); },
    set lineWidth(v) { calls.push(['lineWidth', v]); },
  };
}

// --- 1. The transit speed: one value, the tube's spin ---

test('the transit tube spins at 1.4 rad/s — the one gate speed', () => {
  assert.equal(TUBE_SPIN_RAD_PER_SEC, 1.4, 'tube.js is the single source of truth');
  assert.equal(tubeSpinAngle(1000), 1.4, '1 s of ride is 1.4 rad');
  assert.equal(tubeSpinAngle(4500), 1.4 * 4.5, 'a full turn takes ~4.5 s');
});

// --- 2. The gates use the transit speed, everywhere, and nothing else ---

test('both gates import the transit speed and turn on the frame delta', () => {
  const hub = src('../components/HubPortals.jsx');
  assert.ok(
    hub.includes("import { TUBE_SPIN_RAD_PER_SEC } from '@/app/nexus-vortex/lib/tube.js'"),
    'the gates import the tube speed — no second copy of the value'
  );
  // Two useFrame loops (disc + aurora fan), both taking the delta.
  assert.equal((hub.match(/useFrame\(\(state, delta\) =>/g) || []).length, 2, 'disc + aurora fan both read delta');
  // The speed times the delta, in both loops.
  assert.equal((hub.match(/TUBE_SPIN_RAD_PER_SEC \* delta/g) || []).length, 2, 'face/nanites + fan share one rate');
  assert.ok(hub.includes('spinRef.current.rotation.y += spin'), 'face turns on the shared spin');
  assert.ok(hub.includes('naniteRef.current.rotation.y += spin'), 'nanites turn on the shared spin');
  // No fixed per-frame rate left anywhere in the file.
  assert.ok(!hub.includes('+= 0.004'), 'old face rate 0.004 is gone');
  assert.ok(!hub.includes('+= 0.0012'), 'old nanite rate 0.0012 is gone');
  assert.ok(!hub.includes('+= 0.0006'), 'old aurora rate 0.0006 is gone');
});

test('one disc component serves both gates — one speed by construction', () => {
  const hub = src('../components/HubPortals.jsx');
  assert.equal((hub.match(/function PortalDisc\(/g) || []).length, 1, 'a single PortalDisc');
  assert.equal((hub.match(/<PortalDisc/g) || []).length, 2, 'heaven + nether both render it');
  assert.ok(hub.includes('def={HEAVEN_PORTAL}'), 'heaven disc');
  assert.ok(hub.includes('def={NETHER_PORTAL}'), 'nether disc');
});

// --- 3. The transit graphics on the gates ---

test('the gates wear the vortex tube gold exit ring, lying flat', () => {
  const hub = src('../components/HubPortals.jsx');
  const tube = src('../app/nexus-vortex/components/VortexTubeRide.jsx');
  // The tube's exit ring is the gold torus at the far end.
  assert.ok(tube.includes('0xffd700'), 'the tube exit ring is gold');
  assert.ok(tube.includes('TorusGeometry'), 'the tube exit ring is a torus');
  // The gates wear the same gold torus, flat around the disc rim.
  assert.ok(hub.includes('TRANSIT_GOLD = 0xffd700'), 'gate gold matches the tube gold');
  assert.ok(hub.includes('torusGeometry'), 'gate carries the gold torus');
  assert.ok(
    /<mesh rotation=\{\[-Math\.PI \/ 2, 0, 0\]\}[^>]*>\s*<torusGeometry/s.test(hub),
    'the gold torus lies flat, never upright like a doorway'
  );
});

test('the gates wear the aurora boot conic ring, in the boot colours', () => {
  const hub = src('../components/HubPortals.jsx');
  const room = src('../components/PortalRoom.jsx');
  // The boot disc is the conic gradient in the room.
  assert.ok(
    room.includes('conic-gradient(from 0deg, #7ef0c8, #8fd8ff, #c084fc, #ff7a1a, #7ef0c8)'),
    'the boot disc is the 4-colour aurora conic'
  );
  assert.deepEqual(AURORA_BOOT_COLORS, ['#7ef0c8', '#8fd8ff', '#c084fc', '#ff7a1a'], 'the ring painter uses the boot colours');
  assert.ok(hub.includes("paintAuroraBootRing } from '@/lib/portal-swirl'"), 'gate imports the boot ring painter');
  assert.ok(hub.includes('transitRingTexture()'), 'gate paints the boot ring texture');
  assert.ok(hub.includes('map={bootRingTex}'), 'gate wears the boot ring on a mesh');
  assert.ok(hub.includes('AdditiveBlending'), 'boot ring glows additive, like the transit light');
});

test('the aurora boot ring painter draws a deterministic 4-colour annulus', () => {
  const a = recordingCtx();
  const out = paintAuroraBootRing(a, 256);
  assert.equal(out, a, 'returns the context');
  const arcs = a.calls.filter((c) => c[0] === 'arc');
  assert.equal(arcs.length, 73, '1 clip circle + 72 sweep segments');
  const colours = new Set(a.calls.filter((c) => c[0] === 'strokeStyle').map((c) => c[1]));
  assert.deepEqual([...colours].sort(), [...AURORA_BOOT_COLORS].sort(), 'all four boot colours are painted');
  const widths = new Set(a.calls.filter((c) => c[0] === 'lineWidth').map((c) => c[1]));
  assert.deepEqual([...widths], [51.2], 'one annulus band (0.40 x 128)');
  assert.ok(a.calls.some((c) => c[0] === 'clip'), 'painted inside the inscribed circle');
  // Deterministic: a second run logs the identical calls.
  const b = recordingCtx();
  paintAuroraBootRing(b, 256);
  assert.deepEqual(b.calls, a.calls, 'same seed, same painting, every mount');
});

// --- 4. The realm doorway gates are their own files, not the hub discs ---

test('no realm renders the hub discs — each realm gates in its own world3d file', () => {
  for (const realm of PORTAL_REALMS) {
    const file = `../app${realm.route}/world3d.js`;
    assert.ok(existsSync(new URL(file, import.meta.url)), `no world3d for ${realm.label} (${realm.route})`);
    const world3d = src(file);
    assert.ok(!world3d.includes('HubPortals'), `${realm.label} must not import the hub discs`);
    assert.ok(world3d.includes('GATES'), `${realm.label} renders its own Gates`);
  }
});

test('the hub discs mount only in the hub scene', () => {
  const home = src('../components/HomeScene.jsx');
  assert.ok(home.includes("import HubPortals from './HubPortals'"), 'hub scene owns the discs');
  const nether = src('../app/nether-realm/page.jsx');
  assert.ok(!nether.includes('HubPortals'), 'Hades does not mount the hub discs');
});
