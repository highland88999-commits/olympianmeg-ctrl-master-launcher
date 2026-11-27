// tests/omega-portal.test.mjs
// The Omega Arch + the flat Portals menu (Nov 16, 2026 merge: the 2D
// Portal Room is gone; the Arch flies the user to the hub with the
// portal menu open, and /portal-room redirects there):
// - lib/omega-arch.js geometry: the port keeps the OMEGA original's math
//   (288° torus, portal radius = radius - tube - 5, ring center height)
// - placement: the Arch stands beyond the Sun on its axis
// - the wrap + vortex videos are the self-hosted files from the OMEGA
//   import (public/media/skyscraper/), and both exist in the repo
// - registration: "portal-room" is gone from the registry, from every
//   god menu, and from all 34 locales — no satellite points at a room
//   that no longer exists
// - roster: the merged menu's program list (registry deduped by route)
//   is 214 portals
// - wiring: the gate is kept but unmounted in hub space (retired
//   2026-10-31); the live entry is the Earth chooser's Omega
//   street-light, which rides the tube to OMEGA_ROUTE; the
//   /portal-room redirect lands old links on the menu deep link
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

  it('route is the Portals deep link (the 2D room is gone)', () => {
    assert.equal(OMEGA_ROUTE, '/?concourse=1&portals3d=1');
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

describe('registration — the room is gone from every registry', () => {
  const satsSrc = read('lib/i18n/satellites.ts');
  const entries = [
    ...satsSrc.matchAll(
      /\{\s*key:\s*"([^"]+)",\s*route:\s*"([^"]+)",\s*pos:\s*"([^"]+)",\s*section:\s*"([^"]+)",\s*constellation:\s*"([^"]+)"\s*\}/g
    ),
  ].map((m) => ({ key: m[1], route: m[2], pos: m[3], section: m[4], constellation: m[5] }));

  it('portal-room is gone from the registry (Nov 16, 2026 merge)', () => {
    const hits = entries.filter((e) => e.key === 'portal-room');
    assert.equal(hits.length, 0);
    assert.ok(!entries.some((e) => e.route === '/portal-room'), 'no route points at the room');
  });

  it('no god menu claims portal-room anymore', () => {
    const menus = read('lib/god-menus.js');
    const claims = menus.match(/'portal-room'/g) || [];
    assert.equal(claims.length, 0);
  });

  it('no locale carries a portal-room title or subtitle', () => {
    const files = readdirSync(join(root, 'lib/i18n/locales')).filter((f) => f.endsWith('.json'));
    assert.equal(files.length, 34);
    for (const f of files) {
      const dict = JSON.parse(read(`lib/i18n/locales/${f}`));
      assert.equal(dict['sat.portal-room.title'], undefined, `${f} still titles the room`);
      assert.equal(dict['sat.portal-room.subtitle'], undefined, `${f} still subtitles the room`);
    }
  });

  it('the merged roster (deduped by route) is 220 portals', () => {
    const seen = new Set();
    let count = 0;
    for (const e of entries) {
      if (seen.has(e.route)) continue;
      seen.add(e.route);
      count += 1;
    }
    assert.equal(count, 222); // ARES seat removed: 223→222, Nov 26, 2026 (restoring Concourse-tile-only access, Nov 16 order; Phase 1 re-add reverted); Checker Tracks seat: 221→222, Nov 25, 2026; Job Board seat: 216→217, Nov 21, 2026 (pins were stale at 215); Red Moon seat: 214→215, Nov 17, 2026; Keepsake seat: 213→214, Nov 17, 2026; Housing seat: 217→218; Social Assistance seat: 218→219; Business Services seat: 219→220 (four-program merge), Nov 21, 2026; Vault seat: 220→221 (Alexandria suite ship), Nov 22, 2026
  });

  it('the old /portal-room route redirects to the menu deep link', () => {
    const cfg = read('next.config.js');
    assert.ok(cfg.includes("source: '/portal-room'"), 'redirect source');
    assert.ok(cfg.includes("destination: '/?concourse=1&portals3d=1'"), 'redirect destination');
  });
});

describe('hub wiring', () => {
  it('the gate is kept but no longer mounted in hub space (retired 2026-10-31)', () => {
    const scene = read('components/HomeScene.jsx');
    assert.ok(!scene.includes('<OmegaHubGate'), 'no gate mount in hub space');
    assert.ok(scene.includes('chooseOmegaPortal'), 'the handoff names the chooser light');
  });

  it('the live entry is the Earth chooser’s Omega light, riding the tube to OMEGA_ROUTE', () => {
    const page = read('app/page.jsx');
    assert.ok(page.includes('handleSatellitePortal(OMEGA_ROUTE)'), 'chooser rides the tube to OMEGA_ROUTE');
    assert.ok(page.includes("import { OMEGA_ROUTE } from '@/lib/omega-arch'"), 'route comes from the arch module');
  });

  it('the gate enters on click and on fly-through, pushing the menu deep link', () => {
    const gate = read('components/OmegaHubGate.jsx');
    assert.ok(gate.includes('router.push(OMEGA_ROUTE)'));
    assert.ok(gate.includes('onClick'));
    assert.ok(gate.includes('omegaPortalCenter'));
    // the wrap skins the arch as map + emissive map, as in the original
    assert.ok(gate.includes('emissiveMap={wrapTex}'));
    assert.ok(gate.includes('map={vortexTex}'));
  });

  it('the panel builds its roster from the registry and skips the room', () => {
    const panel = read('components/ConcoursePortals.jsx');
    assert.ok(panel.includes("from '@/lib/i18n/satellites'"));
    assert.ok(panel.includes('buildPortalRoster'), 'panel derives via the shared builder');
    assert.ok(panel.includes('<PortalFlatGrid'), 'the flat grid is the menu');
    // The skip itself lives in the shared derivation
    // (lib/portal-roster.js) — one builder, no drift.
    const roster = read('lib/portal-roster.js');
    assert.ok(roster.includes("sat.key === 'portal-room'"), 'builder skips the room itself');
  });
});
