// Tests for the space-portal gate field (lib/space-portals.js): ring layout
// uniqueness/coverage, display names, accent colors, and the fly-through
// lockout logic. Run:
// node --test tests/space-portals.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GATE_SIZE,
  GATE_CROSSING_RADIUS,
  portalRingLayout,
  gateYawToCenter,
  menuForSatellite,
  accentForSatellite,
  displayNameFor,
  minSpotDistance,
} from '../lib/space-portals.js';

import { SATELLITES } from '../lib/i18n/satellites.ts';

const BABEL_LIKE_CENTER = [32.36, 35, -103.5];

test('layout places exactly one gate per satellite', () => {
  const spots = portalRingLayout(SATELLITES.length, { center: BABEL_LIKE_CENTER });
  assert.equal(spots.length, SATELLITES.length);
});

test('layout spots are unique — no two gates closer than half the gate width', () => {
  const spots = portalRingLayout(SATELLITES.length, { center: BABEL_LIKE_CENTER });
  const min = minSpotDistance(spots);
  assert.ok(
    min > GATE_SIZE.width / 2,
    `gates overlap: min pairwise distance ${min.toFixed(2)}`
  );
});

test('layout rings the center: every gate sits on a ring radius, all at center height', () => {
  const spots = portalRingLayout(SATELLITES.length, { center: BABEL_LIKE_CENTER });
  for (const s of spots) {
    assert.equal(s.y, BABEL_LIKE_CENTER[1]);
    const r = Math.hypot(s.x - BABEL_LIKE_CENTER[0], s.z - BABEL_LIKE_CENTER[2]);
    assert.ok(r >= 24 - 1e-6, `gate inside inner radius: ${r}`);
  }
  // Rings are filled in order — ring index never decreases along the list.
  for (let i = 1; i < spots.length; i++) {
    assert.ok(spots[i].ring >= spots[i - 1].ring, 'rings out of order');
  }
});

test('gateYawToCenter orients a gate to face the center', () => {
  const center = [0, 35, -80];
  const yaw = gateYawToCenter({ x: 10, z: -80 }, center);
  // Gate sits at +x of center; facing center means facing -x, i.e. yaw = -PI/2.
  assert.ok(Math.abs(yaw - -Math.PI / 2) < 1e-9, `yaw ${yaw}`);
});

test('displayNameFor prefers the i18n title, falls back to title-cased key', () => {
  assert.equal(displayNameFor('chess', 'Wizards Chess'), 'Wizards Chess');
  assert.equal(displayNameFor('browsers-castle', 'sat.browsers-castle.title'), 'Browsers Castle');
  assert.equal(displayNameFor('enyo', null), 'Enyo');
  assert.equal(displayNameFor('t-1000', undefined), 'T 1000');
});

test('every satellite resolves to a god menu and a hex accent color', () => {
  for (const sat of SATELLITES) {
    const menu = menuForSatellite(sat.key);
    assert.ok(menu, `no god menu owns satellite ${sat.key}`);
    const accent = accentForSatellite(sat.key);
    assert.match(accent, /^#[0-9a-f]{6}$/i, `bad accent for ${sat.key}: ${accent}`);
  }
});

test('accentForSatellite falls back to sky for unknown keys', () => {
  assert.equal(accentForSatellite('no-such-satellite'), '#38bdf8');
});

test('crossing radius is smaller than the gate spacing so fly-through is unambiguous', () => {
  const spots = portalRingLayout(SATELLITES.length, { center: BABEL_LIKE_CENTER });
  const min = minSpotDistance(spots);
  assert.ok(
    GATE_CROSSING_RADIUS * 2 < min,
    `crossing zones overlap: radius ${GATE_CROSSING_RADIUS}, min spacing ${min.toFixed(2)}`
  );
});

test('satellite registry has no duplicate keys or routes (one gate per universe)', () => {
  const keys = SATELLITES.map((s) => s.key);
  const routes = SATELLITES.map((s) => s.route);
  assert.equal(new Set(keys).size, keys.length, 'duplicate satellite keys');
  assert.equal(new Set(routes).size, routes.length, 'duplicate satellite routes');
});
