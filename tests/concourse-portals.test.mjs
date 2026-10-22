// tests/concourse-portals.test.mjs
// Portals 3D — the Concourse's 3D portal hall (Merlin, 2026-10-21:
// the 3D portal objects live inside the Concourse, minimized until
// the user expands them):
// - the shared roster derivation (lib/portal-roster.js): the real
//   registry yields exactly the Portal Room's 166, deduped by route,
//   the room itself skipped, title/subtitle fallbacks honored
// - wall paging (42 per wall; GAMES' 51 -> 2 pages), section hues,
//   the shared section/search filtering and grouping
// - the swirl painter (lib/portal-swirl.js) is deterministic and
//   drives a bare 2D-context stub without throwing
// - static wiring: the portalroom tile (after Guide), its fireTile
//   branch, the lazily-loaded panel, the ui-state pin whitelist, the
//   instanced 3D hall with its single video texture discipline
//
// Run: node --test tests/concourse-portals.test.mjs   (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  SECTION_ORDER,
  SECTION_HUES,
  DEFAULT_SECTION_HUE,
  WALL_PAGE_SIZE,
  buildPortalRoster,
  paginateWall,
  groupBySection,
  filterPortals,
} from '../lib/portal-roster.js';
import { paintPortalSwirl, PORTAL_SWIRL_SIZE } from '../lib/portal-swirl.js';
import { SATELLITES } from '../lib/i18n/satellites.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const read = (p) => readFileSync(join(repo, p), 'utf8');
const en = JSON.parse(read('lib/i18n/locales/en.json'));

const concourse = read('components/Concourse.jsx');
const panel = read('components/ConcoursePortals.jsx');
const scene = read('components/concourse/PortalHallScene.jsx');
const uiState = read('app/api/ui-state/route.js');
const portalPage = read('app/portal-room/page.jsx');

const enRoster = () =>
  buildPortalRoster(SATELLITES, (k) => en[`sat.${k}.title`], (k) => en[`sat.${k}.subtitle`]);

describe('buildPortalRoster (the shared derivation)', () => {
  it('yields exactly 166 portals from the real registry — the Portal Room count', () => {
    assert.equal(enRoster().length, 166);
  });

  it('skips the Portal Room itself', () => {
    assert.ok(!enRoster().some((p) => p.key === 'portal-room'));
    assert.ok(!enRoster().some((p) => p.route === '/portal-room'));
  });

  it('dedupes by route (planet-tech is registered twice, portaled once)', () => {
    const roster = enRoster();
    const routes = roster.map((p) => p.route);
    assert.equal(new Set(routes).size, routes.length, 'every route appears once');
    assert.equal(roster.filter((p) => p.key === 'planet-tech').length, 1);
  });

  it('keeps registry order and carries key/route/section/title/subtitle', () => {
    const roster = enRoster();
    assert.deepEqual(roster[0], {
      key: 'chess',
      route: '/chess',
      section: 'GAMES',
      title: 'Chess',
      subtitle: 'Orbital Payload',
    });
    for (const p of roster) {
      assert.ok(p.key && p.route && p.section && p.title, `complete entry for ${p.key}`);
    }
  });

  it('falls back to the key for a missing title and empty for a missing subtitle', () => {
    const sats = [{ key: 'mystery', route: '/mystery', section: 'WISDOM' }];
    const [p] = buildPortalRoster(sats, () => '', () => undefined);
    assert.equal(p.title, 'mystery');
    assert.equal(p.subtitle, '');
  });

  it('skips and dedupes synthetic registries the same way', () => {
    const sats = [
      { key: 'portal-room', route: '/portal-room', section: 'OBSERVATORY' },
      { key: 'a', route: '/x', section: 'GAMES' },
      { key: 'b', route: '/x', section: 'TOOLS' },
      { key: 'c', route: '/y', section: 'TOOLS' },
    ];
    const roster = buildPortalRoster(sats, (k) => `T:${k}`, () => '');
    assert.deepEqual(roster.map((p) => p.key), ['a', 'c']);
  });
});

describe('wall paging + hues', () => {
  it('WALL_PAGE_SIZE is 42 and GAMES (51) spans exactly 2 pages, 42 + 9', () => {
    assert.equal(WALL_PAGE_SIZE, 42);
    const games = enRoster().filter((p) => p.section === 'GAMES');
    assert.equal(games.length, 51);
    const pages = paginateWall(games);
    assert.deepEqual(pages.map((pg) => pg.length), [42, 9]);
  });

  it('paginateWall edge cases: empty -> no pages, exact fit -> one page', () => {
    assert.deepEqual(paginateWall([]), []);
    assert.equal(paginateWall(Array.from({ length: 42 })).length, 1);
    assert.deepEqual(paginateWall([1, 2, 3, 4, 5], 2).map((p) => p.length), [2, 2, 1]);
  });

  it('every section in SECTION_ORDER carries a hue; unknown sections fall back', () => {
    assert.deepEqual(SECTION_ORDER, [
      'SANCTUM', 'GAMES', 'OBSERVATORY', 'AI PROGRAMS', 'TOOLS',
      'UTILITIES', 'THERAPY', 'WISDOM', 'SHOPPING',
    ]);
    for (const s of SECTION_ORDER) assert.match(SECTION_HUES[s], /^#[0-9a-f]{6}$/i, `hue for ${s}`);
    assert.match(DEFAULT_SECTION_HUE, /^#[0-9a-f]{6}$/i);
    const sectionsInRoster = new Set(enRoster().map((p) => p.section));
    for (const s of sectionsInRoster) assert.ok(SECTION_HUES[s], `roster section ${s} has a hue`);
  });
});

describe('filterPortals + groupBySection (room/panel shared semantics)', () => {
  const roster = enRoster();

  it('section filter keeps only that section', () => {
    const tools = filterPortals(roster, { section: 'TOOLS' });
    assert.equal(tools.length, 22);
    assert.ok(tools.every((p) => p.section === 'TOOLS'));
  });

  it('search matches title, subtitle and key, case-insensitively', () => {
    assert.ok(filterPortals(roster, { query: 'CHESS' }).some((p) => p.key === 'chess'), 'title');
    assert.ok(filterPortals(roster, { query: 'orbital payload' }).some((p) => p.key === 'chess'), 'subtitle');
    assert.ok(filterPortals(roster, { query: 'chess' }).every((p) => p.key === 'chess'), 'key/only match');
    assert.equal(filterPortals(roster, { query: 'zzz-no-such-realm' }).length, 0);
  });

  it('grouping follows SECTION_ORDER and drops empty sections', () => {
    const grouped = groupBySection(roster);
    assert.deepEqual(grouped.map((g) => g.section), SECTION_ORDER);
    assert.equal(grouped.reduce((n, g) => n + g.items.length, 0), 166);
    assert.deepEqual(groupBySection([]), []);
  });
});

describe('paintPortalSwirl (the shared minimized-portal face)', () => {
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
      createRadialGradient: () => ({ addColorStop: () => {} }),
    };
    return ctx;
  }

  it('paints without a real canvas and returns the context', () => {
    const ctx = stubCtx();
    assert.equal(paintPortalSwirl(ctx, PORTAL_SWIRL_SIZE), ctx);
    assert.ok(ctx.calls.some((c) => c[0] === 'arc'), 'disc geometry painted');
    assert.ok(ctx.calls.filter((c) => c[0] === 'stroke').length > 10, 'spiral arms painted');
  });

  it('is deterministic — the same seed paints the same swirl every mount', () => {
    const a = stubCtx();
    const b = stubCtx();
    paintPortalSwirl(a, 128);
    paintPortalSwirl(b, 128);
    assert.equal(JSON.stringify(a.calls), JSON.stringify(b.calls));
  });
});

describe('Concourse wiring (static)', () => {
  it("the 'portalroom' tile sits in TILES immediately after Guide, icon-only", () => {
    assert.ok(
      concourse.includes("{ id: 'portalroom', label: 'Portals 3D', icon: 'Ω' }"),
      'portalroom tile defined exactly as specced'
    );
    const guide = concourse.indexOf("id: 'guide'");
    const hall = concourse.indexOf("id: 'portalroom'");
    const night = concourse.indexOf("id: 'night'");
    assert.ok(guide >= 0 && hall > guide && night > hall, 'Guide < Portals 3D < Night');
  });

  it('fireTile opens the panel through the family branch, and the panel is mounted lazily', () => {
    assert.ok(concourse.includes("tile.id === 'portalroom'"), 'fireTile branch');
    assert.ok(concourse.includes('setPortal3dOpen(true)'), 'branch opens the panel');
    assert.ok(
      concourse.includes("dynamic(() => import('./ConcoursePortals'), { ssr: false })"),
      'panel chunk (and three.js) stays out of the eager bundle'
    );
    assert.ok(concourse.includes('<ConcoursePortals open={portal3dOpen}'), 'panel mounted');
  });

  it("cross-source sync guard: 'portalroom' is whitelisted for pins in ui-state", () => {
    const m = uiState.match(/const TILE_IDS = \[([^\]]*)\]/);
    assert.ok(m, 'TILE_IDS present');
    assert.ok(m[1].includes("'portalroom'"), 'portalroom whitelisted — its pin survives login');
  });

  it('the Portal Room page derives through the same builder (no second roster)', () => {
    assert.ok(portalPage.includes('buildPortalRoster'), 'page uses buildPortalRoster');
    assert.ok(portalPage.includes("from '@/lib/i18n/satellites'"), 'page feeds the registry');
  });
});

describe('the panel + hall (static)', () => {
  it('the panel is a PhoneFrame-family Layer 3 sheet at z-[62]', () => {
    assert.ok(panel.includes('fixed inset-0 z-[62]'), 'sheet layer');
    assert.ok(panel.includes("useState('GAMES')"), 'lands on the GAMES wall');
    assert.ok(panel.includes('Step through'), 'step-through action');
    assert.ok(panel.includes('>Back<') || panel.includes('Back'), 'back action');
    assert.ok(panel.includes('<PortalEnterOverlay'), 'shares the room step-through');
    assert.ok(panel.includes('onGlFail'), 'WebGL failure falls back to List mode');
    assert.ok(panel.includes("from '@/lib/webgl-support'"), 'uses the shared WebGL probe');
    assert.ok(panel.includes('probeWebGL()'), 'the probe decides the initial mode');
  });

  it('the hall is two instanced meshes over one shared swirl texture', () => {
    const instanced = scene.match(/args=\{\[null, null, WALL_PAGE_SIZE\]\}/g) || [];
    assert.equal(instanced.length, 2, 'rings + discs instanced meshes');
    assert.ok(scene.includes('paintPortalSwirl'), 'shared swirl painted once');
    assert.ok(scene.includes('new THREE.CanvasTexture'), 'one canvas texture');
    assert.ok(scene.includes('setColorAt'), 'per-instance section hues');
  });

  it('exactly one video texture discipline: the expanded portal owns it', () => {
    assert.ok(scene.includes('new THREE.VideoTexture'), 'video texture exists');
    assert.equal((scene.match(/createElement\('video'\)/g) || []).length, 1, 'one video element path');
    assert.ok(scene.includes('/videos/portals/'), 'per-program portal videos');
    assert.ok(scene.includes('failedKeysRef'), 'failed videos are never retried this session');
    assert.ok(scene.includes('tex.dispose()'), 'video texture disposed on collapse/unmount');
  });

  it("the Canvas carries HomeScene's tuned GL props and reports context loss", () => {
    assert.ok(scene.includes("gl={{ alpha: true, antialias: false, powerPreference: 'default' }}"), 'GL props');
    assert.ok(scene.includes('dpr={[1, 1.75]}'), 'dpr clamp');
    assert.ok(scene.includes('webglcontextlost'), 'context loss reported to the panel');
  });
});
