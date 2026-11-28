// tests/concourse-portals.test.mjs
// Portals — the Concourse's FLAT portal grid (Merlin, 2026-11-18:
// the 3D hall is gone — "I don't want the 3d version of portals
// as seen in the video" — the portals look like the wall discs
// did, but BIGGER and flat, 3 across, bold name underneath, and a
// tap sucks the user into the video; travel engages when the video
// finishes) — and, since the Nov 16, 2026 merge, THE ONE portal
// menu (the 2D Portal Room is gone; this sheet carries its top
// video, its ALL + section categories, and its extras):
// - the shared roster derivation (lib/portal-roster.js): the real
//   registry yields exactly the merged menu's 216, deduped by route,
//   title/subtitle fallbacks honored
// - grid paging (42 per page; GAMES' 88 -> 3 pages), section hues,
//   the shared section/search filtering and grouping
// - the swirl painter (lib/portal-swirl.js) is deterministic and
//   drives a bare 2D-context stub without throwing
// - static wiring: the portalroom tile (after Guide), its fireTile
//   branch, the lazily-loaded panel, the ui-state pin whitelist, the
//   flat grid — 3 across, video faces with phone-first gating
//   (Merlin, 2026-11-17: portals wear their videos, not the swirl),
//   bold names underneath, tap -> suck-in -> travel on video end
//
// Run: node --test tests/concourse-portals.test.mjs   (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
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
import { PORTAL_VIDEO_KEYS, portalHasVideo, portalVideoCoverFit } from '../lib/portal-videos.js';
import { SATELLITES } from '../lib/i18n/satellites.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const read = (p) => readFileSync(join(repo, p), 'utf8');
const en = JSON.parse(read('lib/i18n/locales/en.json'));

const concourse = read('components/Concourse.jsx');
const panel = read('components/ConcoursePortals.jsx');
const grid = read('components/concourse/PortalFlatGrid.jsx');
const suck = read('components/concourse/PortalSuckOverlay.jsx');
const uiState = read('app/api/ui-state/route.js');

const enRoster = () =>
  buildPortalRoster(SATELLITES, (k) => en[`sat.${k}.title`], (k) => en[`sat.${k}.subtitle`]);

describe('buildPortalRoster (the shared derivation)', () => {
  it('yields exactly 220 portals from the real registry — the merged menu count (Monsterverse seat adcdb3cd: 174→175; Social Media Cheat Code seat: 175→176; Dodgeball seat: 176→177; Request a Billboard seat: 177→178; Omega 500 seat: 194→195; Hades seats: 195→197; nether-realms homes: 197→209, Nov 12, 2026; Earth 4 seat: 209→210, Nov 14, 2026; Moon + Sun Base seats: 210→212, Nov 14, 2026; Jupiter 2 + Mars 2 seats: 212→214, Nov 15, 2026; Ghost Rider seat: 214→215, Nov 15, 2026; Weapons Forge seat removed: 215→214, Nov 15, 2026; Land of the Dead seat added: 214→215, Nov 16, 2026; ARES seat removed: 215→214, Nov 16, 2026; Land of the Dead seat removed: 214→213, Nov 16, 2026 (Merlin: floor drop only, no portal card); Portal Room seat removed from the registry: 214→213, Nov 16, 2026 (portal menu merge — the roster stays 213 because the room was already skipped by the builder; Keepsake seat: 213→214, Nov 17, 2026; Red Moon seat: 214→215, Nov 17, 2026; Settlers of Olympus seat: 215→216, Nov 19, 2026; renamed Starforge Nov 21, 2026 — count unchanged; Job Board seat: 216→217, Nov 21, 2026 (pins were stale at 215 — registry was already 216 before this seat); Housing seat: 217→218; Social Assistance seat: 218→219; Business Services seat: 219→220 (four-program merge), Nov 21, 2026; Checker Tracks seat: 221→222, Nov 25, 2026; ARES seat removed: 223→222, Nov 26, 2026 (restoring Concourse-tile-only access, Nov 16 order; Phase 1 re-add reverted)', () => {
    assert.equal(enRoster().length, 222);
  });

  it('skips the Portal Room itself', () => {
    assert.ok(!enRoster().some((p) => p.key === 'portal-room'));
    assert.ok(!enRoster().some((p) => p.route === '/portal-room'));
  });

  it('dedupes by route (planet-tech\'s duplicated dead seat was removed 2026-10-23; routes are unique)', () => {
    const roster = enRoster();
    const routes = roster.map((p) => p.route);
    assert.equal(new Set(routes).size, routes.length, 'every route appears once');
    assert.equal(roster.filter((p) => p.key === 'planet-tech').length, 0);
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

describe('grid paging + hues', () => {
  it('WALL_PAGE_SIZE is 42 and GAMES (89) spans 3 pages, 42 + 42 + 5', () => {
    assert.equal(WALL_PAGE_SIZE, 42);
    const games = enRoster().filter((p) => p.section === 'GAMES');
    assert.equal(games.length, 89); // Checker Tracks seat (GAMES): 88→89, Nov 25, 2026; Job Board seat: 86→87, Nov 21, 2026; Omega 500 seat: 70→71 (the old 54 pin was stale); Hades seat: 71→72; nether-realms homes: 72→84 (Nov 12, 2026); Ghost Rider seat: 84→85 (Nov 15, 2026); Land of the Dead seat (HADES/GAMES): 85→86 (Nov 16, 2026); Land of the Dead seat removed: 86→85 (Nov 16, 2026, floor drop only); Settlers of Olympus seat: 85→86 (Nov 19, 2026; renamed Starforge Nov 21, 2026); Housing seat: 87→88, Nov 21, 2026
    const pages = paginateWall(games);
    assert.deepEqual(pages.map((pg) => pg.length), [42, 42, 5]);
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
    assert.equal(tools.length, 25); // ARES seat removed (ATHENA/TOOLS): 26→25, Nov 26, 2026 (restoring Concourse-tile-only access, Nov 16 order; Phase 1 re-add reverted); Social Media Cheat Code seat (HERMES/TOOLS): 25→26; Request a Billboard seat (PLUTUS/TOOLS): 26→27; Weapons Forge seat removed (HEPHAESTUS/TOOLS): 27→26 (Nov 15, 2026); ARES seat removed (ATHENA/TOOLS): 26→25 (Nov 16, 2026)
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
    assert.equal(grouped.reduce((n, g) => n + g.items.length, 0), 222); // ARES seat removed: 223→222, Nov 26, 2026 (restoring Concourse-tile-only access, Nov 16 order; Phase 1 re-add reverted); Checker Tracks seat: 221→222, Nov 25, 2026; Job Board seat: 216→217, Nov 21, 2026; Settlers of Olympus seat: 215→216, Nov 19, 2026 (renamed Starforge Nov 21, 2026); Red Moon seat: 214→215, Nov 17, 2026; Keepsake seat: 213→214, Nov 17, 2026; Social Media Cheat Code seat: 175→176; Dodgeball seat: 176→177; Request a Billboard seat: 177→178; Omega 500 seat: 194→195; Hades seats: 195→197; nether-realms homes: 197→209 (Nov 12, 2026); Earth 4 seat: 209→210 (Nov 14, 2026); Moon + Sun Base seats: 210→212 (Nov 14, 2026); Jupiter 2 + Mars 2 seats: 212→214 (Nov 15, 2026); Ghost Rider seat: 214→215 (Nov 15, 2026); Weapons Forge seat removed: 215→214 (Nov 15, 2026); Land of the Dead seat added: 214→215 (Nov 16, 2026); ARES seat removed: 215→214 (Nov 16, 2026); Land of the Dead seat removed: 214→213 (Nov 16, 2026); Portal Room seat removed from the registry (Nov 16, 2026, portal menu merge) — roster stays 213, the room was already skipped; Vault seat: 220→221 (Alexandria suite ship), Nov 22, 2026
    assert.deepEqual(groupBySection([]), []);
  });
});

describe('paintPortalSwirl (the shared no-video face)', () => {
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
  it("the 'portalroom' tile sits in TILES immediately after Guide, icon-only — the ONE Portals entry", () => {
    assert.ok(
      concourse.includes("{ id: 'portalroom', label: 'Portals', icon: 'Ω' }"),
      'portalroom tile defined exactly as specced'
    );
    const guide = concourse.indexOf("id: 'guide'");
    const hall = concourse.indexOf("id: 'portalroom'");
    const night = concourse.indexOf("id: 'night'");
    assert.ok(guide >= 0 && hall > guide && night > hall, 'Guide < Portals < Night');
  });

  it("the old 'portals' tile is the Menu toggle now, not a second Portals entry", () => {
    assert.ok(
      concourse.includes("{ id: 'portals', label: 'Menu', icon: '☰', hubOnly: true }"),
      'portals tile relabeled Menu — it toggles the hub program menu, never the portal menu'
    );
    assert.equal((concourse.match(/label: 'Portals'/g) || []).length, 1, 'exactly one Portals label in the Concourse');
  });

  it('fireTile opens the panel through the family branch, and the panel is mounted lazily', () => {
    assert.ok(concourse.includes("tile.id === 'portalroom'"), 'fireTile branch');
    assert.ok(concourse.includes('setPortal3dOpen(true)'), 'branch opens the panel');
    assert.ok(
      concourse.includes("dynamic(() => import('./ConcoursePortals'), { ssr: false })"),
      'panel chunk stays out of the eager bundle'
    );
    assert.ok(concourse.includes('<ConcoursePortals'), 'panel mounted');
    assert.ok(concourse.includes('open={portal3dOpen}'), 'panel opens on the Orb state');
  });

  it("cross-source sync guard: 'portalroom' is whitelisted for pins in ui-state", () => {
    const m = uiState.match(/const TILE_IDS = \[([^\]]*)\]/);
    assert.ok(m, 'TILE_IDS present');
    assert.ok(m[1].includes("'portalroom'"), 'portalroom whitelisted — its pin survives login');
  });

  it('the panel derives through the same builder (no second roster)', () => {
    assert.ok(panel.includes('buildPortalRoster'), 'panel uses buildPortalRoster');
    assert.ok(panel.includes("from '@/lib/i18n/satellites'"), 'panel feeds the registry');
  });

  it('the ?portals3d=1 deep link opens the menu (and consumes the param)', () => {
    assert.ok(concourse.includes('Portals3dDeepLink'), 'deep-link reader mounted');
    assert.ok(concourse.includes("searchParams?.get('portals3d') !== '1'"), 'param gate');
    assert.ok(concourse.includes('setPortal3dOpen(true)'), 'deep link opens the menu');
    assert.ok(concourse.includes("url.searchParams.delete('portals3d')"), 'param consumed so a reload never re-opens the menu');
  });
});

describe('the panel + grid (static)', () => {
  it('the panel is a PhoneFrame-family Layer 3 sheet at z-[62], headed "Portals"', () => {
    assert.ok(panel.includes('fixed inset-0 z-[62]'), 'sheet layer');
    assert.ok(panel.includes("useState('ALL')"), 'lands on the ALL grid — every portal');
    assert.ok(panel.includes("aria-label=\"Portals\""), 'dialog labelled Portals, not Portals 3D');
    assert.ok(panel.includes('>Portals<') || panel.includes('Portals\n'), 'header reads Portals');
    assert.ok(!panel.includes('Portals 3D'), 'no 3D label left in the panel');
    assert.ok(panel.includes('<PortalFlatGrid'), 'the flat grid is the menu');
    assert.ok(panel.includes('<PortalSuckOverlay'), 'the suck-in overlay is mounted');
    assert.ok(panel.includes('<PortalEnterOverlay'), 'shares the room step-through');
  });

  it('there is no 3D hall left: no scene, no probe, no retry fallback, no expand state', () => {
    assert.ok(!existsSync(join(repo, 'components', 'concourse', 'PortalHallScene.jsx')), 'hall file deleted');
    assert.ok(!panel.includes('<PortalHallScene'), 'no hall mount');
    assert.ok(!panel.includes('PortalHallScene'), 'no hall reference at all');
    assert.ok(!panel.includes('probeWebGL'), 'no WebGL probe — the grid is plain DOM');
    assert.ok(!panel.includes("from '@/lib/webgl-support'"), 'no WebGL import');
    assert.ok(!panel.includes('glFailed'), 'no GL failure state');
    assert.ok(!panel.includes('Retry 3D'), 'no retry fallback');
    assert.ok(!panel.includes('expandedKey'), 'no tap-to-expand state — a tap sucks the user in');
    assert.ok(!panel.includes('Step through'), 'no step-through button — travel engages on video end');
    assert.ok(!panel.includes('>Back<'), 'no back button — there is nothing to collapse from');
    assert.ok(!panel.includes('tilt'), 'no tilt language left in the panel');
    assert.ok(!panel.includes('drag empty space'), 'no drag-to-look hint');
  });

  it('the menu is flat: no switch, no list; the grid defaults to ALL', () => {
    assert.ok(!panel.includes("useState('list')"), 'no list default — the grid IS the menu');
    assert.ok(!panel.includes('setMode('), 'no view switching');
    assert.ok(!panel.includes('aria-label="View"'), 'no switch group in the header');
    assert.ok(!panel.includes("mode === 'list'"), 'no list branch');
    assert.ok(panel.includes("useState('ALL')"), 'grid default is ALL — every portal, one page at a time');
    // Hub-video-fixes (Nov 27, fix 5): the wrap strip was replaced by
    // the Portals hero video — still the room's top video, over the categories.
    assert.ok(panel.includes('<PortalsHeroVideo'), 'the room\'s top video lives over the categories');
    assert.ok(panel.indexOf('<PortalsHeroVideo') < panel.indexOf('<PortalFlatGrid'), 'hero video sits above the grid');
    assert.ok(panel.includes("`All · ${programs.length}`"), 'the ALL tab carries the whole count');
    assert.ok(panel.includes("wallSection === 'TOOLS'"), 'the Cheat Code feature heads TOOLS');
    assert.ok(panel.includes('<CheatCodeFeatured />'), 'the feature banner is in the sheet');
    assert.ok(panel.includes("wallSection === 'SHOPPING'"), 'the FINTRAC entry heads SHOPPING');
    assert.ok(panel.includes('<FintracExplanationMenuButton />'), 'the FINTRAC button is in the sheet');
    assert.ok(panel.indexOf('<CheatCodeFeatured />') < panel.indexOf('<PortalFlatGrid'), 'feature banner sits above the grid');
    assert.ok(panel.indexOf('<FintracExplanationMenuButton />') < panel.indexOf('<PortalFlatGrid'), 'FINTRAC button sits above the grid');
    assert.ok(!existsSync(join(repo, 'components', 'portal-room', 'PortalRoom.jsx')), 'room file deleted');
    assert.ok(!existsSync(join(repo, 'app', 'portal-room', 'page.jsx')), 'room route deleted');
  });

  it('the categories ride one horizontal carousel row, never a wrapped grid', () => {
    assert.ok(panel.includes('flex flex-nowrap gap-1.5 overflow-x-auto'), 'tabs ride one scrollable row');
    assert.ok(!panel.includes('flex flex-wrap gap-1.5 px-5'), 'no wrapped tab grid');
    assert.ok(panel.includes('[scrollbar-width:none]'), 'carousel hides its scrollbar');
    assert.ok(panel.includes('shrink-0 whitespace-nowrap rounded-full border'), 'pills never shrink or wrap mid-label');
  });

  it('the sheet wears the Concourse background graphic behind a scrim', () => {
    assert.ok(panel.includes("from '@/lib/concourse-bg'"), 'bg comes from the shared concourse-bg module');
    assert.ok(panel.includes('resolveConcourseBg'), 'the stored preference resolves through the shared resolver');
    assert.ok(panel.includes('CONCOURSE_BG_ART'), 'a malformed preference falls back to the default art');
    assert.ok(panel.includes('olympus.concourse.v1'), 'the device cache is the same key the box reads');
    assert.ok(panel.includes('preferences?.concourse_bg'), 'the account copy wins when signed in');
    assert.ok(panel.includes('bg-[#070418]/75'), 'a scrim keeps the menu legible over the graphic');
  });

  it('the grid scrolls vertically, one page at a time, under the hint bar', () => {
    assert.ok(panel.includes('overflow-y-auto'), 'the grid stage scrolls vertically');
    assert.ok(panel.includes('Portal page'), 'page dots are portal pages now');
    assert.ok(panel.includes('Tap a portal to be sucked in'), 'the hint names the tap');
    assert.ok(panel.includes('its video plays, then the portal takes you through'), 'the hint names the travel-on-end');
  });

  it('the grid is 3 across, one circular video face per portal, bold name underneath', () => {
    assert.ok(grid.includes('export const FLAT_GRID_COLS = 3'), '3 across — Merlin\'s call ("Maybe 3")');
    assert.ok(grid.includes('grid-cols-3'), 'three columns in the layout');
    assert.ok(grid.includes('max-w-[520px]'), 'the grid caps at 520 px on desktop');
    assert.ok(grid.includes('max-w-[148px]'), 'faces cap at 148 px — big, not the wall\'s tiny discs');
    assert.ok(grid.includes('aspect-square'), 'faces are square');
    assert.ok(grid.includes('rounded-full'), 'faces are circles');
    assert.ok(grid.includes('role="list"'), 'the grid is a list of portals');
    assert.ok(grid.includes('font-bold'), 'the name under each portal is BOLD');
    assert.ok(grid.includes('{item.title}'), 'the name is the destination title');
    assert.ok(grid.indexOf('data-face') < grid.indexOf('{item.title}'), 'the name sits under the face');
  });

  it('grid faces wear their own videos, gated for the phone (Merlin, 2026-11-17)', () => {
    assert.ok(grid.includes('/videos/portals/'), 'per-program portal videos');
    assert.ok(grid.includes('portalHasVideo(item.key)'), 'video presence read from the data source');
    assert.ok(grid.includes('VIDEO_START_STAGGER_MS'), 'grid starts are staggered so 42 decodes never spin up on one frame');
    assert.ok(grid.includes('visibilitychange'), 'every grid video pauses while the tab is hidden');
    assert.ok(grid.includes('muted'), 'grid videos are muted');
    assert.ok(!/<video[^>]*\bloop\b/.test(grid), 'grid face videos never loop — paused first frame, Starforge pattern');
    assert.ok(grid.includes('playsInline'), 'grid videos play inline');
    assert.ok(grid.includes("video.preload = 'metadata'"), 'a face loads metadata only — first frame, no decode burst on load');
    assert.ok(grid.includes('removeAttribute(\'src\')'), 'unmount unloads the video — a video element exists only while its portal is mounted');
    assert.ok(grid.includes('getSwirlDataUrl'), 'the shared swirl is the face for portals without a video');
    assert.ok(grid.includes('SECTION_HUES[item.section]'), 'faces keep their section hue');
    assert.ok(grid.includes('paused'), 'the grid pauses while the user is sucked into a video');
  });
});

describe('portal video presence (lib/portal-videos.js — the file-presence list)', () => {
  // Hub-video-fixes (Nov 27, fix 5): portals-hero.mp4 is a menu hero
  // asset, not a portal face video — it is not wired to a roster key
  // and is excluded from the portal-video count below.
  const onDisk = readdirSync(join(repo, 'public/videos/portals'))
    .filter((f) => f.endsWith('.mp4'))
    .map((f) => f.replace(/\.mp4$/, ''))
    .filter((name) => name !== 'portals-hero')
    .sort();

  it('the data source carries exactly the videos on disk — no drift either way', () => {
    assert.deepEqual([...PORTAL_VIDEO_KEYS].sort(), onDisk);
    assert.equal(onDisk.length, 235, 'two hundred and thirty-five portal videos wired (221 roster + the 14 Concourse videos, Nov 18, 2026 merge, + Starforge, Nov 21, 2026, + Job Board, Nov 21, 2026, + Housing, Nov 21, 2026, + Social Assistance, Nov 21, 2026, + Business Services, Nov 21, 2026, + Vault, Nov 22, 2026)');
  });

  it('every video key on disk resolves as video-present from the data source', () => {
    for (const key of onDisk) {
      assert.ok(portalHasVideo(key), `${key} has its video`);
    }
  });

  it('roster portals without a video on disk resolve as still waiting', () => {
    const waiting = enRoster().filter((p) => !onDisk.includes(p.key));
    // The Red Moon's video was wired Nov 18, 2026 (concourse videos
    // batch 1) — no roster portal waits any more. earth-2 still has
    // no video by design (it is not in the roster; see below).
    // Checker Tracks waits by design, Nov 25, 2026: its portal video is
    // the UON Visuals reel, not received/licensed yet — the page ships a
    // trailer placeholder instead.
    assert.equal(waiting.length, 1, 'one roster portal still awaits its video');
    assert.deepEqual(waiting.map((p) => p.key), ['checker-tracks']);
    for (const p of waiting.slice(0, 12)) {
      assert.equal(portalHasVideo(p.key), false, `${p.key} has no video yet`);
    }
    assert.equal(portalHasVideo('earth-2'), false, 'signed-in portal has no portal video');
    assert.equal(portalHasVideo('no-such-key'), false, 'unknown keys have no video');
  });

  it('portrait sources get a cover fit; landscape keeps the raw mapping', () => {
    // astra.mp4 is the one portrait portal video: 720x1280.
    assert.deepEqual(portalVideoCoverFit(720, 1280), {
      repeat: [1, 0.5625],
      offset: [0, 0.21875],
    });
    assert.equal(portalVideoCoverFit(1280, 720), null, 'landscape untouched');
    assert.equal(portalVideoCoverFit(512, 512), null, 'square untouched');
    assert.equal(portalVideoCoverFit(0, 1280), null, 'no dimensions, no fit');
    assert.equal(portalVideoCoverFit(720, 0), null, 'no dimensions, no fit');
  });
});

describe('the suck-in: tap -> fullscreen video -> travel on video end (Merlin, 2026-11-18)', () => {
  it('a tap hands the tapped face rect to the panel (the zoom starts at the portal)', () => {
    assert.ok(grid.includes('getBoundingClientRect()'), 'the face rect is measured on tap');
    assert.ok(grid.includes('onTap(item,'), 'tap hands the program and its rect up');
    assert.ok(panel.includes('handlePortalTap'), 'the panel owns the tap');
    assert.ok(panel.includes('setSucking({ program, rect })'), 'tap opens the suck-in with program + rect');
    assert.ok(suck.includes('fromRect'), 'the overlay starts at the tapped rect');
    assert.ok(suck.includes('ZOOM_MS'), 'the zoom has a duration — a hard cut is not a suck-in');
    assert.ok(suck.includes('cubic-bezier(0.22, 1, 0.36, 1)'), 'the zoom eases out of the slot');
  });

  it('the fullscreen video plays once, muted and inline, and travel engages on its end', () => {
    assert.ok(suck.includes('autoPlay'), 'the video starts itself — no second tap');
    assert.ok(suck.includes('muted'), 'the fullscreen video is muted');
    assert.ok(suck.includes('playsInline'), 'the fullscreen video plays inline');
    assert.ok(suck.includes('onEnded={engage}'), 'video end engages travel');
    assert.ok(panel.includes('handleSuckDone'), 'the panel engages travel from the overlay');
    assert.ok(panel.includes('enterProgram(program)'), 'travel is the existing enterProgram — vortex ride, then the realm');
    assert.ok(!suck.includes('loop'), 'the suck-in video plays ONCE — it must end for travel to engage');
  });

  it('travel does NOT engage before the video ends: no skip, no early call', () => {
    assert.ok(!suck.includes('Skip'), 'no skip button — the video runs to its end (per brief)');
    assert.ok(suck.includes('doneRef'), 'travel engages exactly once');
    assert.ok(!suck.includes('onDone()') || suck.includes('onDoneRef.current()'), 'onDone only fires through the once-guard');
    assert.ok(panel.includes('if (!sucking) return;'), 'a stray done with no suck-in travels nowhere');
  });

  it('Esc cancels the suck-in before travel engages', () => {
    assert.ok(suck.includes("'Escape'"), 'Esc is the cancel');
    assert.ok(suck.includes('onCancel'), 'cancel returns to the grid');
    assert.ok(panel.includes("onCancel={() => setSucking(null)}"), 'cancel clears the suck-in');
  });

  it('reduced motion skips the video and travel engages at once', () => {
    assert.ok(panel.includes("matchMedia('(prefers-reduced-motion: reduce)')"), 'the panel checks reduced motion on tap');
    assert.ok(suck.includes("matchMedia('(prefers-reduced-motion: reduce)')"), 'the overlay checks it too');
    assert.ok(suck.includes('if (reduced) return null;'), 'no overlay at all under reduced motion');
  });

  it('a portal with no video is never stranded: swirl fullscreen for a beat, then travel', () => {
    assert.ok(suck.includes('portalHasVideo(program.key)'), 'video presence decides the face');
    assert.ok(suck.includes('NO_VIDEO_BEAT_MS'), 'the swirl holds for a beat');
    assert.ok(suck.includes('onError={engage}'), 'a video that fails to load still travels');
    assert.ok(suck.includes('STALL_SLACK_MS'), 'a stalled video still travels (safety timeout)');
    assert.ok(suck.includes('getSwirlDataUrl'), 'the no-video face is the shared swirl');
  });

  it('earth-2 keeps the swirl by design — no video invented for it', () => {
    assert.equal(portalHasVideo('earth-2'), false, 'signed-in portal has no portal video');
    assert.equal(portalHasVideo('mars-moon'), true, 'the Red Moon video is wired (concourse videos batch 1)');
  });
});
