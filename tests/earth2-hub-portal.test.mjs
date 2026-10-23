// tests/earth2-hub-portal.test.mjs
// THE EARTH 2 DOOR IN THE MAIN HUB (Merlin, 2026-10-22): "Put the
// portal to earth 2 in the main hub, but only my account can open it."
//
// Pins:
// - the gate decision is pure (lib/earth2-hub-portal.js): the owner
//   email — and only the owner email — makes the portal exist;
//   signed-out, still-resolving, and every other account get nothing
// - the door routes to /earth-2 (the chamber's own server-side gate
//   stays the second lock) and carries no Earth 2 content at all
// - the placement law: flanking the Omega Arch on its own plane
//   beyond the Sun, clear of the Omega span and the Sun's surface
// - the hub scene consumes the gate, and the gate component holds
//   no copy of the owner email (lib/owner.js is the one definition)
// - the swirl painter's palette argument: the violet default is
//   unchanged, and the door's earth palette paints green/blue
//
// Run: node --test tests/earth2-hub-portal.test.mjs   (from repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  EARTH2_HUB_ARCH,
  EARTH2_HUB_LABEL,
  EARTH2_HUB_PORTAL_RADIUS,
  EARTH2_HUB_POSITION,
  EARTH2_HUB_RING_CENTER_Y,
  EARTH2_HUB_ROUTE,
  EARTH2_SWIRL_PALETTE,
  earth2HubClearances,
  earth2HubPortalCenter,
  earth2HubPortalVisible,
} from '../lib/earth2-hub-portal.js';
import { OMEGA_ARCH, OMEGA_POSITION } from '../lib/omega-arch.js';
import { paintPortalSwirl, PORTAL_SWIRL_PALETTE } from '../lib/portal-swirl.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const read = (p) => readFileSync(join(repo, p), 'utf8');

const OWNER = 'olympiannexus@gmail.com';

describe('the gate — a pure decision (lib/earth2-hub-portal.js)', () => {
  it('the owner email, and only the owner email, makes the portal exist', () => {
    assert.equal(earth2HubPortalVisible(OWNER), true);
    assert.equal(earth2HubPortalVisible('someone.else@example.com'), false);
    assert.equal(earth2HubPortalVisible('olympianmeg@gmail.com'), false, "Merlin's personal account is not the owner account");
  });

  it('matching follows the house rule (trim + case-insensitive, via lib/owner.js)', () => {
    assert.equal(earth2HubPortalVisible('  OlympianNexus@Gmail.com '), true);
  });

  it('absent sessions get nothing — signed out or still resolving', () => {
    assert.equal(earth2HubPortalVisible(null), false);
    assert.equal(earth2HubPortalVisible(undefined), false);
    assert.equal(earth2HubPortalVisible(''), false);
    assert.equal(earth2HubPortalVisible('   '), false);
  });

  it('the module defers to lib/owner.js and holds no second copy of the email', () => {
    const src = read('lib/earth2-hub-portal.js');
    assert.ok(src.includes("from './owner.js'"), 'imports the owner source of truth');
    assert.ok(src.includes('isOwnerEmail'), 'the decision runs through isOwnerEmail');
    assert.ok(!src.includes(OWNER), 'the email string is never copied here');
    assert.ok(!src.includes("from 'three'"), 'pure module — no three');
    assert.ok(!src.includes('document.'), 'pure module — no DOM');
  });
});

describe('the door — route, label, placement', () => {
  it('routes to the chamber and wears its own name', () => {
    assert.equal(EARTH2_HUB_ROUTE, '/earth-2');
    assert.equal(EARTH2_HUB_LABEL, 'EARTH 2');
  });

  it('stands on the Omega plane beyond the Sun, flanking the Arch', () => {
    assert.equal(EARTH2_HUB_POSITION.z, OMEGA_POSITION.z, 'same vista plane');
    assert.equal(EARTH2_HUB_POSITION.y, OMEGA_POSITION.y, 'same feet plane');
    assert.ok(EARTH2_HUB_POSITION.x > OMEGA_POSITION.x, 'east of the Omega Arch');
  });

  it('placement law: clear of the Omega span and the Sun surface', () => {
    const { gapToOmega, sunClearance } = earth2HubClearances();
    assert.equal(gapToOmega, 79, 'a clear gap between the two monuments');
    assert.ok(gapToOmega > 0, 'the arches never overlap');
    assert.ok(sunClearance > 0, 'well clear of the Sun');
    const ownSpan = EARTH2_HUB_ARCH.radius + EARTH2_HUB_ARCH.tube;
    assert.ok(EARTH2_HUB_POSITION.x - ownSpan > OMEGA_ARCH.radius + OMEGA_ARCH.tube);
  });

  it('disc + center math follow the Omega endpoint rules', () => {
    assert.equal(
      EARTH2_HUB_PORTAL_RADIUS,
      EARTH2_HUB_ARCH.radius - EARTH2_HUB_ARCH.tube - 5
    );
    const center = earth2HubPortalCenter(0);
    assert.equal(center.x, EARTH2_HUB_POSITION.x);
    assert.equal(center.z, EARTH2_HUB_POSITION.z);
    assert.equal(center.y, EARTH2_HUB_POSITION.y + EARTH2_HUB_RING_CENTER_Y);
    assert.equal(earth2HubPortalCenter(3).y, center.y + 3, 'the bob rides the center');
  });
});

describe('the swirl — earth palette, violet default untouched', () => {
  function stubCtx() {
    const calls = [];
    const ctx = {
      calls,
      clearRect: (...a) => calls.push(['clearRect', ...a]),
      beginPath: () => calls.push(['beginPath']),
      arc: (...a) => calls.push(['arc', ...a]),
      fill: () => calls.push(['fill']),
      save: () => calls.push(['save']),
      clip: () => calls.push(['clip']),
      stroke: () => calls.push(['stroke']),
      restore: () => calls.push(['restore']),
      createRadialGradient: () => ({
        addColorStop: (offset, color) => calls.push(['addColorStop', offset, color]),
      }),
    };
    return ctx;
  }

  it('the earth palette is deep green and ocean blue, not the violet default', () => {
    assert.notDeepEqual(EARTH2_SWIRL_PALETTE, PORTAL_SWIRL_PALETTE);
    assert.equal(EARTH2_SWIRL_PALETTE.base[0][1], '#0e5c46', 'deep-green heart');
    assert.equal(EARTH2_SWIRL_PALETTE.base[1][1], '#0a3d5c', 'ocean blue');
  });

  it('painting with the earth palette uses its stops — and stays deterministic', () => {
    const a = stubCtx();
    const b = stubCtx();
    paintPortalSwirl(a, 128, EARTH2_SWIRL_PALETTE);
    paintPortalSwirl(b, 128, EARTH2_SWIRL_PALETTE);
    assert.equal(JSON.stringify(a.calls), JSON.stringify(b.calls), 'deterministic');
    const stops = a.calls.filter((c) => c[0] === 'addColorStop').map((c) => c[2]);
    assert.ok(stops.includes('#0e5c46'), 'earth core painted');
    assert.ok(!stops.includes('#4c2a9e'), 'no violet in the earth face');
  });

  it('the default call still paints the violet original', () => {
    const ctx = stubCtx();
    paintPortalSwirl(ctx, 128);
    const stops = ctx.calls.filter((c) => c[0] === 'addColorStop').map((c) => c[2]);
    assert.ok(stops.includes('#4c2a9e'), 'violet core preserved');
    assert.ok(!stops.includes('#0e5c46'), 'no earth tones leak into the default');
  });
});

describe('the hub wiring (static)', () => {
  const gate = read('components/Earth2HubGate.jsx');
  const scene = read('components/HomeScene.jsx');

  it('the scene mounts the gate beside the Omega Arch', () => {
    assert.ok(scene.includes("import Earth2HubGate from './Earth2HubGate';"), 'imported');
    assert.ok(scene.includes('<Earth2HubGate'), 'mounted');
    assert.ok(
      scene.indexOf('<Earth2HubGate') > scene.indexOf('<OmegaHubGate'),
      'mounted alongside the Omega Arch'
    );
  });

  it('the gate watches the session and renders nothing for non-owners', () => {
    assert.ok(gate.includes("from '@/lib/supabase'"), 'the house session client');
    assert.ok(gate.includes('getSession'), 'reads the current session');
    assert.ok(gate.includes('onAuthStateChange'), 'follows sign-in changes');
    assert.ok(gate.includes('earth2HubPortalVisible(sessionEmail)'), 'the pure decision decides');
    assert.ok(gate.includes('return null'), 'non-owners get no scene presence at all');
  });

  it('the door opens onto the chamber route and names itself from the module', () => {
    assert.ok(gate.includes('EARTH2_HUB_ROUTE'), 'route comes from the module');
    assert.ok(gate.includes('router.push'), 'clicking routes');
    assert.ok(gate.includes('EARTH2_HUB_LABEL'), 'label comes from the module');
    assert.ok(gate.includes('paintPortalSwirl'), 'the shared swirl, earth palette');
    assert.ok(gate.includes('EARTH2_SWIRL_PALETTE'), 'the door paints its own colours');
  });

  it('the gate holds no owner email and no Earth 2 content', () => {
    assert.ok(!gate.includes(OWNER), 'the email string lives only in lib/owner.js');
    assert.ok(!gate.includes('/models/earth2'), 'no Earth 2 model paths in the hub');
    assert.ok(!gate.includes('DinosaurBay'), 'no Bay in the hub');
    assert.ok(!gate.includes('lib/earth2/'), 'nothing imported from the chamber territory');
  });
});
