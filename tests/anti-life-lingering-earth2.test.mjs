// tests/anti-life-lingering-earth2.test.mjs — THE DECAY FOLLOW-THROUGH
// (Merlin, 2026-11-15): the lingering decay pill followed him into
// the hub and the Earth 2 intro screens, but the moment the Earth 2
// 3D world loaded the pill vanished and nothing withered — the
// plains stayed lush and green. The timer itself kept working
// (9:54 → 8:58 across his video), so the grant was fine.
//
// ROOT CAUSE (one bug, not two): the Earth 2 world root is
//   <div className="fixed inset-0 z-[80] ...">
// (components/earth2/Earth2World.jsx) — the "Earth Console (80)"
// in the Concourse's z-order comment. The heartbeat's overlays
// sat at z-60 and its pill at z-61, so the whole world painted
// ABOVE the decay: pill hidden, desat/darken/ash overlays hidden
// (they blend with what is beneath them, and the world was above
// them). Every other persistent world root on the platform is a
// bare fixed inset-0 with no z-index, so the heartbeat already
// showed over all of them.
//
// FIX (layout-level, one change): the heartbeat now lives at
// 85/86 — above the Earth Console (80) and every other world
// root, below the transient modal layers (88+), which still cover
// the pill while they are open, as a modal should. The world's
// own z-80 is deliberate (it keeps the Concourse, z-58, under the
// world) and is NOT touched.
//
// Run: node --test tests/anti-life-lingering-earth2.test.mjs
//   (from the repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

const HEARTBEAT = read('../components/anti-life/LingeringDecay.jsx');
const EARTH2_WORLD = read('../components/earth2/Earth2World.jsx');
const EARTH2_PAGE = read('../app/earth-2/page.jsx');

// The layering contract, read from the heartbeat's own constants.
const overlayZ = Number((HEARTBEAT.match(/HEARTBEAT_OVERLAY_Z\s*=\s*(\d+)/) || [])[1]);
const pillZ = Number((HEARTBEAT.match(/HEARTBEAT_PILL_Z\s*=\s*(\d+)/) || [])[1]);

// The highest persistent world layer on the platform: the Earth
// Console (80), per the Concourse's z-order comment. The next
// layer up is the transient popovers at 88.
const EARTH_CONSOLE_Z = 80;
const MODAL_FLOOR_Z = 88;

test('the heartbeat declares one layer for overlays and one for the pill', () => {
  assert.ok(Number.isFinite(overlayZ), 'HEARTBEAT_OVERLAY_Z must be a number');
  assert.ok(Number.isFinite(pillZ), 'HEARTBEAT_PILL_Z must be a number');
});

test('the heartbeat sits above the Earth Console (80) — the pill shows over Earth 2', () => {
  assert.ok(overlayZ > EARTH_CONSOLE_Z, `overlays at ${overlayZ} must beat the Earth Console at ${EARTH_CONSOLE_Z}`);
  assert.ok(pillZ > EARTH_CONSOLE_Z, `pill at ${pillZ} must beat the Earth Console at ${EARTH_CONSOLE_Z}`);
});

test('the pill sits above its own overlays', () => {
  assert.ok(pillZ > overlayZ, `pill ${pillZ} must be above overlays ${overlayZ}`);
});

test('the heartbeat stays below the transient modal layers (88+)', () => {
  assert.ok(overlayZ < MODAL_FLOOR_Z, `overlays at ${overlayZ} must stay below the modal floor at ${MODAL_FLOOR_Z}`);
  assert.ok(pillZ < MODAL_FLOOR_Z, `pill at ${pillZ} must stay below the modal floor at ${MODAL_FLOOR_Z}`);
});

test('all three overlays + the pill actually use the declared layers', () => {
  const overlayUses = (HEARTBEAT.match(/zIndex: HEARTBEAT_OVERLAY_Z/g) || []).length;
  assert.equal(overlayUses, 3, `expected the desat + darken overlays + ash canvas to use HEARTBEAT_OVERLAY_Z, found ${overlayUses}`);
  assert.ok(HEARTBEAT.includes('zIndex: HEARTBEAT_PILL_Z'), 'the pill must use HEARTBEAT_PILL_Z (inline style — a Tailwind z-[...] class built from a variable would never be generated)');
  assert.ok(!HEARTBEAT.includes('z-[61]'), 'the old pill layer z-[61] must be gone');
  assert.ok(!/zIndex: 60[,}]/.test(HEARTBEAT), 'no overlay may still sit at the old z-60');
});

test('Earth 2 world root is the Earth Console at 80 — and the heartbeat beats it', () => {
  const root = EARTH2_WORLD.match(/<div className="fixed inset-0 z-\[(\d+)\] overflow-hidden bg-\[#0a1410\]">/);
  assert.ok(root, 'Earth2World root must still be the fixed inset-0 Earth Console div');
  assert.equal(Number(root[1]), EARTH_CONSOLE_Z, `Earth2World root must be z-[${EARTH_CONSOLE_Z}]`);
  assert.ok(overlayZ > Number(root[1]), 'heartbeat overlays must beat the Earth 2 root');
  assert.ok(pillZ > Number(root[1]), 'heartbeat pill must beat the Earth 2 root');
});

test('the Earth 2 loading screen is below the heartbeat too (pill stays up while stepping on)', () => {
  const loader = EARTH2_PAGE.match(/STEPPING ONTO EARTH 2[\s\S]{0,200}?fixed inset-0 z-\[(\d+)\]|fixed inset-0 z-\[(\d+)\][\s\S]{0,200}?STEPPING ONTO EARTH 2/);
  const loaderZ = loader ? Number(loader[1] || loader[2]) : null;
  assert.equal(loaderZ, EARTH_CONSOLE_Z, `the stepping-on loader must be z-[${EARTH_CONSOLE_Z}]`);
  assert.ok(pillZ > loaderZ, 'the pill must beat the loader');
});

test('no other checked world root carries a layer above the heartbeat', () => {
  // JSX roots: bare fixed inset-0, no z-[ at all on the root line.
  const jsxRoots = {
    'app/nether-realm/page.jsx': read('../app/nether-realm/page.jsx'),
    'app/flying-dutchman/page.jsx': read('../app/flying-dutchman/page.jsx'),
    'app/ghost-rider/page.jsx': read('../app/ghost-rider/page.jsx'),
    'app/hell/page.jsx': read('../app/hell/page.jsx'),
    'app/helheim/page.jsx': read('../app/helheim/page.jsx'),
    'app/life/page.jsx': read('../app/life/page.jsx'),
  };
  for (const [file, src] of Object.entries(jsxRoots)) {
    const rootLines = src.split('\n').filter((l) => l.includes('fixed inset-0') && l.includes('overflow-hidden'));
    assert.ok(rootLines.length >= 1, `${file}: expected a fixed inset-0 world root`);
    for (const line of rootLines) {
      const zs = [...line.matchAll(/z-\[(\d+)\]/g)].map((m) => Number(m[1]));
      assert.ok(zs.every((z) => z < overlayZ), `${file}: world root carries z-[${zs}] — must stay below the heartbeat overlays at ${overlayZ}`);
    }
  }
  // Style-object roots: the root object itself carries no zIndex.
  const styleRoots = {
    'app/middle-earth/page.jsx': read('../app/middle-earth/page.jsx'),
    'app/star-wars/page.jsx': read('../app/star-wars/page.jsx'),
    'app/hollow-earth/page.jsx': read('../app/hollow-earth/page.jsx'),
  };
  for (const [file, src] of Object.entries(styleRoots)) {
    const rootLine = src.split('\n').find((l) => l.includes("position: 'fixed'") && l.includes('inset: 0'));
    assert.ok(rootLine, `${file}: expected a fixed inset-0 root style`);
    assert.ok(!rootLine.includes('zIndex'), `${file}: world root must not set a zIndex (heartbeat at ${overlayZ} must stay above it)`);
  }
});

test('the decay law is untouched by this fix (10 minutes, 1 km, 50 m infection)', () => {
  const lingering = read('../lib/anti-life/lingering.js');
  assert.ok(/DECAY_DURATION_MS = 10 \* 60 \* 1000/.test(lingering), '10-minute timer unchanged');
  assert.ok(/DECAY_RANGE_M = 1000/.test(lingering), '1 km field unchanged');
  assert.ok(/SPOT_RADIUS_M = 50/.test(lingering), '50 m infection radius unchanged');
});

test('no /life exemption sneaks in with this fix (that question stays open, his call)', () => {
  assert.ok(!HEARTBEAT.includes('/life'), 'LingeringDecay must not special-case /life — the exemption is still undecided');
});

test('the heartbeat still mounts once in the root layout (the "everywhere")', () => {
  const layout = read('../app/layout.jsx');
  assert.ok(layout.includes('LingeringDecayHeartbeat'), 'root layout must mount LingeringDecayHeartbeat');
  assert.equal((layout.match(/<LingeringDecayHeartbeat \/>/g) || []).length, 1, 'exactly one heartbeat mount');
});
