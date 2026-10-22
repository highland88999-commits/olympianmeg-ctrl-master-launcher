// tests/omega-portal.test.mjs
// The Omega Arch + Portal Room:
// - lib/omega-arch.js geometry: the port keeps the OMEGA original's math
//   (288° torus, portal radius = radius - tube - 5, ring center height)
// - placement: the Arch stands beyond the Sun on its axis
// - the wrap + vortex videos are the self-hosted files from the OMEGA
//   import (public/media/skyscraper/), and both exist in the repo
// - registration: "portal-room" is a satellite exactly once, claimed by
//   exactly one god menu (HERMES), titled in all 31 locales
// - roster: the room's program list (registry deduped by route, minus
//   the room itself) is 165 portals
// - wiring: HomeScene mounts the gate behind freeroam; the gate pushes
//   OMEGA_ROUTE on click and on fly-through
//
// Run: node --test tests/omega-portal.test.mjs   (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  OMEGA_ARCH,
  OMEGA_PORTAL_RADIUS,
  OMEGA_POSITION,
  OMEGA_RING_CENTER_Y,
  OMEGA_ROUTE,
  OMEGA_VORTEX_VIDEO,
  OMEGA_WRAP_VIDEO,
  SUN_CENTER,
  SUN_RADIUS,
  omegaFootX,
  omegaFootY,
  omegaPortalCenter,
} from '../lib/omega-arch.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('omega arch geometry (the OMEGA original, faithfully)', () => {
  it('keeps the original proportions: R80 tube15, 288-degree arc', () => {
    assert.equal(OMEGA_ARCH.radius, 80);
    assert.equal(OMEGA_ARCH.tube, 15);
    assert.ok(Math.abs(OMEGA_ARCH.arc - Math.PI * 1.6) < 1e-12);
    assert.ok(Math.abs(OMEGA_ARCH.rotationZ - -Math.PI * 0.3) < 1e-12);
    assert.equal(OMEGA_ARCH.footLength, 40);
  });

  it('portal radius is radius - tube - 5 = 60', () => {
    assert.equal(OMEGA_PORTAL_RADIUS, 60);
  });

  it('ring center height matches the original endpoint math', () => {
    // |80 * sin(-0.3π)| + 15 ≈ 64.721 + 15
    assert.ok(Math.abs(OMEGA_RING_CENTER_Y - 79.721) < 0.01);
    assert.ok(Math.abs(omegaFootX() - 47.023) < 0.01);
    assert.ok(Math.abs(omegaFootY() - -64.721) < 0.01);
    // foot center sits exactly one tube radius above the feet plane
    assert.ok(Math.abs(OMEGA_RING_CENTER_Y + omegaFootY() - OMEGA_ARCH.tube) < 1e-9);
  });
});

describe('placement beyond the Sun', () => {
  it('stands on the Sun axis, clear beyond its far surface', () => {
    assert.equal(OMEGA_POSITION.x, SUN_CENTER.x);
    assert.equal(OMEGA_POSITION.y, SUN_CENTER.y);
    const sunFarSurface = SUN_CENTER.z + SUN_RADIUS;
    assert.ok(OMEGA_POSITION.z > sunFarSurface, 'arch must be beyond the sun');
    assert.ok(
      OMEGA_POSITION.z - sunFarSurface >= 150,
      'arch stands well clear of the sun, not inside its glow'
    );
  });

  it('portal center rides at ring-center height over the position', () => {
    const c = omegaPortalCenter();
    assert.equal(c.x, OMEGA_POSITION.x);
    assert.equal(c.z, OMEGA_POSITION.z);
    assert.ok(Math.abs(c.y - (OMEGA_POSITION.y + OMEGA_RING_CENTER_Y)) < 1e-9);
  });

  it('route is the portal room page', () => {
    assert.equal(OMEGA_ROUTE, '/portal-room');
  });
});

describe('the wrap and the vortex are self-hosted', () => {
  it('points at the files imported from the OMEGA repo', () => {
    assert.equal(OMEGA_WRAP_VIDEO, '/media/skyscraper/wmhz50.mp4');
    assert.equal(OMEGA_VORTEX_VIDEO, '/media/skyscraper/4ab3h5.mp4');
  });

  it('both video files exist in public/', () => {
    assert.ok(existsSync(join(root, 'public', OMEGA_WRAP_VIDEO)));
    assert.ok(existsSync(join(root, 'public', OMEGA_VORTEX_VIDEO)));
  });
});

describe('registration — one satellite, one god, every language', () => {
  const satsSrc = read('lib/i18n/satellites.ts');
  const entries = [
    ...satsSrc.matchAll(
      /\{\s*key:\s*"([^"]+)",\s*route:\s*"([^"]+)",\s*pos:\s*"([^"]+)",\s*section:\s*"([^"]+)",\s*constellation:\s*"([^"]+)"\s*\}/g
    ),
  ].map((m) => ({ key: m[1], route: m[2], pos: m[3], section: m[4], constellation: m[5] }));

  it('portal-room is registered exactly once, as specced', () => {
    const hits = entries.filter((e) => e.key === 'portal-room');
    assert.equal(hits.length, 1);
    assert.deepEqual(hits[0], {
      key: 'portal-room',
      route: '/portal-room',
      pos: 'HERMES',
      section: 'OBSERVATORY',
      constellation: 'ARGUS',
    });
  });

  it('HERMES claims portal-room, and no other god does', () => {
    const menus = read('lib/god-menus.js');
    const claims = menus.match(/'portal-room'/g) || [];
    assert.equal(claims.length, 1);
    const hermesBlock = menus.slice(menus.indexOf("god: 'HERMES'"), menus.indexOf("god: 'HEPHAESTUS'"));
    assert.ok(hermesBlock.includes("'portal-room'"));
  });

  it('all 31 locales carry the portal-room title and subtitle', () => {
    const files = readdirSync(join(root, 'lib/i18n/locales')).filter((f) => f.endsWith('.json'));
    assert.equal(files.length, 31);
    for (const f of files) {
      const dict = JSON.parse(read(`lib/i18n/locales/${f}`));
      assert.ok(dict['sat.portal-room.title'], `${f} missing title`);
      assert.ok(dict['sat.portal-room.subtitle'], `${f} missing subtitle`);
    }
  });

  it('the room roster (deduped by route, minus itself) is 165 portals', () => {
    const seen = new Set();
    let count = 0;
    for (const e of entries) {
      if (e.key === 'portal-room') continue;
      if (seen.has(e.route)) continue;
      seen.add(e.route);
      count += 1;
    }
    assert.equal(count, 165);
  });
});

describe('hub wiring', () => {
  it('HomeScene mounts the gate, gated on freeroam', () => {
    const scene = read('components/HomeScene.jsx');
    assert.ok(scene.includes("import OmegaHubGate from './OmegaHubGate';"));
    assert.ok(scene.includes("<OmegaHubGate freeroam={appState === 'hub_freeroam'} />"));
  });

  it('the gate enters on click and on fly-through, pushing the room route', () => {
    const gate = read('components/OmegaHubGate.jsx');
    assert.ok(gate.includes('router.push(OMEGA_ROUTE)'));
    assert.ok(gate.includes('onClick'));
    assert.ok(gate.includes('omegaPortalCenter'));
    // the wrap skins the arch as map + emissive map, as in the original
    assert.ok(gate.includes('emissiveMap={wrapTex}'));
    assert.ok(gate.includes('map={vortexTex}'));
  });

  it('the page builds its roster from the registry and skips itself', () => {
    const page = read('app/portal-room/page.jsx');
    assert.ok(page.includes("from '@/lib/i18n/satellites'"));
    assert.ok(page.includes('buildPortalRoster'), 'page derives via the shared builder');
    assert.ok(page.includes('/videos/portals/'));
    // The skip itself lives in the shared derivation
    // (lib/portal-roster.js) since the Concourse's Portals 3D panel
    // joined the room as a second surface — one builder, no drift.
    const roster = read('lib/portal-roster.js');
    assert.ok(roster.includes("sat.key === 'portal-room'"), 'builder skips the room itself');
  });
});
