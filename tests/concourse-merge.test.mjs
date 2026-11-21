// tests/concourse-merge.test.mjs
// Concourse → portal menu merge (Merlin, Nov 18, 2026: "Concourse
// becomes the portal menu"). The Concourse landing IS the portal
// menu — the default view — with the Concourse's own tile menu
// riding beside it as the second panel of the one merged surface.
//   - the portal panel: flat 3-across video grid, ALL shows ALL
//     portals, categories one horizontal swipeable carousel
//   - the tile panel: the Concourse's own cards in the SAME shared
//     grid, action-variant taps (video plays, then the sheet opens)
//   - no duplicate portals: the 5 exact duplicates live once, as
//     portal cards; the tile panel never lists one
//   - gesture zones: carousel swipes move categories only, never
//     flip panels; horizontal swipes elsewhere flip panels;
//     vertical swipes scroll
//   - box chrome homes: bell in the header, Doomsday strip crowning
//     the tile panel, season badge + radio mini-player + docked
//     backpack in the tile panel's chrome row; the Orb opens the
//     merged menu; pins still float on the hub
//   - the hub program menu (god menus) is KEPT as a layer — Agent
//     Forge has no registry seat and is reachable only through it
//
// Run: node --test tests/concourse-merge.test.mjs (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  CONCOURSE_ACTION_ITEMS,
  HUB_ONLY_CONCOURSE_TILE_IDS,
  DUPLICATE_CONCOURSE_TILE_IDS,
} from '../lib/concourse-actions.js';
import { PORTAL_VIDEO_KEYS, portalHasVideo } from '../lib/portal-videos.js';
import { SECTION_HUES, buildPortalRoster } from '../lib/portal-roster.js';
import { SATELLITES } from '../lib/i18n/satellites.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const read = (p) => readFileSync(join(repo, p), 'utf8');
const en = JSON.parse(read('lib/i18n/locales/en.json'));

const concourse = read('components/Concourse.jsx');
const panel = read('components/ConcoursePortals.jsx');
const grid = read('components/concourse/PortalFlatGrid.jsx');
const radio = read('components/concourse/ConcourseRadio.jsx');

const onDiskVideos = readdirSync(join(repo, 'public/videos/portals'))
  .filter((f) => f.endsWith('.mp4'))
  .map((f) => f.replace(/\.mp4$/, ''))
  .sort();

describe('the Concourse action items (lib/concourse-actions.js)', () => {
  it('is exactly the 14 non-duplicate, non-self-referential tiles, in tile order', () => {
    assert.deepEqual(
      CONCOURSE_ACTION_ITEMS.map((i) => i.key),
      ['hub', 'tour', 'intro', 'guide', 'night', 'bike', 'muse', 'phone', 'radio', 'alerts', 'settings', 'bug', 'fintrac', 'ares']
    );
    assert.equal(CONCOURSE_ACTION_ITEMS.length, 14);
  });

  it('every item has a key, a tile id, a title and the Concourse section', () => {
    for (const item of CONCOURSE_ACTION_ITEMS) {
      assert.ok(item.key && item.tileId && item.title, `complete entry for ${item.key}`);
      assert.equal(item.section, 'CONCOURSE', `${item.key} wears the Concourse hue`);
    }
    assert.ok(SECTION_HUES.CONCOURSE, 'the Concourse section has a face hue');
    assert.match(SECTION_HUES.CONCOURSE, /^#[0-9a-f]{6}$/i);
  });

  it('every item wears its own portal video — file on disk AND key wired', () => {
    for (const item of CONCOURSE_ACTION_ITEMS) {
      assert.ok(onDiskVideos.includes(item.key), `${item.key}.mp4 is placed`);
      assert.ok(portalHasVideo(item.key), `${item.key} is wired in PORTAL_VIDEO_KEYS`);
    }
    assert.equal(onDiskVideos.length, 230, '216 roster videos + the 14 Concourse videos + Starforge');
    assert.deepEqual([...PORTAL_VIDEO_KEYS].sort(), onDiskVideos, 'keys match the directory exactly');
  });

  it('ARES keeps its legacy tile id (molly) under its video key (ares)', () => {
    const ares = CONCOURSE_ACTION_ITEMS.find((i) => i.key === 'ares');
    assert.equal(ares.tileId, 'molly');
    assert.equal(ares.title, 'ARES');
  });

  it('the hub-only cards are exactly the hub functions (intro, guide, night, bike)', () => {
    assert.deepEqual([...HUB_ONLY_CONCOURSE_TILE_IDS].sort(), ['bike', 'guide', 'intro', 'night']);
    for (const id of HUB_ONLY_CONCOURSE_TILE_IDS) {
      assert.ok(CONCOURSE_ACTION_ITEMS.some((i) => i.tileId === id), `${id} is an action item`);
    }
  });

  it('no duplicate lives in the tile panel — not the 4 duplicate tiles, not the banner', () => {
    const tileIds = CONCOURSE_ACTION_ITEMS.map((i) => i.tileId);
    for (const dup of DUPLICATE_CONCOURSE_TILE_IDS) {
      assert.ok(!tileIds.includes(dup), `${dup} is not a tile-panel card`);
    }
    assert.ok(!CONCOURSE_ACTION_ITEMS.some((i) => i.key === 'social-media-cheat-code'), 'the Cheat Code banner is not a tile card');
    assert.deepEqual([...DUPLICATE_CONCOURSE_TILE_IDS].sort(), ['calls', 'profile', 'renewal', 'store']);
  });
});

describe('no duplicate portals: each destination appears exactly once', () => {
  const roster = buildPortalRoster(
    SATELLITES,
    (k) => en[`sat.${k}.title`],
    (k) => en[`sat.${k}.subtitle`]
  );

  it('each exact duplicate is one portal card in the roster', () => {
    for (const key of ['store', 'order-67', 'renewal-plan', 'profile', 'social-media-cheat-code']) {
      assert.equal(roster.filter((p) => p.key === key).length, 1, `${key} appears once`);
    }
  });

  it('the related-but-not-identical pairs stay separate (his call still open)', () => {
    assert.equal(roster.filter((p) => p.key === 'cloud-phone').length, 1, 'cloud-phone stays a portal');
    assert.equal(roster.filter((p) => p.key === 'shadow-realm').length, 1, 'shadow-realm stays a portal');
    assert.ok(CONCOURSE_ACTION_ITEMS.some((i) => i.key === 'phone'), 'the Phone tile card stays too');
    assert.ok(CONCOURSE_ACTION_ITEMS.some((i) => i.key === 'night'), 'the Night tile card stays too');
    assert.notEqual(
      CONCOURSE_ACTION_ITEMS.find((i) => i.key === 'phone').tileId,
      'cloud-phone',
      'phone is not cloud-phone'
    );
  });

  it('the merged menu never lists a duplicate twice across its two panels', () => {
    const portalKeys = new Set(roster.map((p) => p.key));
    for (const item of CONCOURSE_ACTION_ITEMS) {
      assert.ok(!portalKeys.has(item.key), `${item.key} is not also a portal card`);
    }
  });
});

describe('the merged menu: two panels, one surface (static)', () => {
  it('the portal panel is the default view when the menu opens', () => {
    assert.ok(panel.includes("useState('portals')"), 'panel state defaults to portals');
    assert.ok(panel.includes("if (open) setPanel('portals');"), 'reopening lands on the portal panel');
  });

  it('both panels live in one sliding track, each with its own grid', () => {
    assert.ok(panel.includes('aria-label="Portal menu"'), 'portal panel');
    assert.ok(panel.includes('aria-label="Concourse tiles"'), 'tile panel');
    assert.ok(panel.includes("panel === 'tiles' ? 'translateX(-100%)' : 'translateX(0)'"), 'panels slide side by side');
    assert.equal((panel.match(/<PortalFlatGrid/g) || []).length, 2, 'the SAME shared grid renders both panels — no second grid');
    assert.ok(panel.includes('pageItems={concourseItems}'), 'the tile panel feeds the shared grid its action items');
    assert.ok(panel.includes('pageItems={pageItems}'), 'the portal panel feeds the shared grid its page');
  });

  it('ALL shows ALL portals — every one', () => {
    assert.ok(panel.includes("useState('ALL')"), 'the grid defaults to ALL');
    assert.ok(panel.includes("if (wallSection === 'ALL') return programs;"), 'ALL returns the whole roster');
    assert.ok(panel.includes('setWallSection(s);'), 'a section tab picks the grid section, ALL included');
  });

  it('the header follows the panel and keeps the Portals count', () => {
    assert.ok(panel.includes("{panel === 'portals' ? ("), 'title branches on the panel');
    assert.ok(panel.includes('>Portals</span>'), 'portal panel titled Portals');
    assert.ok(panel.includes('>Concourse</span>'), 'tile panel titled Concourse');
    assert.ok(panel.includes('`${programs.length} realms`'), 'portal count in the header');
    assert.ok(panel.includes('`${concourseItems.length} tiles`'), 'tile count in the header');
  });

  it('the panel dots switch panels by tap', () => {
    assert.ok(panel.includes('aria-label="Show the portal menu"'), 'portals dot');
    assert.ok(panel.includes('aria-label="Show the Concourse tiles"'), 'tiles dot');
    assert.ok(panel.includes("onClick={() => setPanel('portals')}"), 'dot flips to portals');
    assert.ok(panel.includes("onClick={() => setPanel('tiles')}"), 'dot flips to tiles');
  });

  it('the sliding track never clips its own panels — the dialog box is the viewport', () => {
    // The track translates -100% to show the tile panel; a clip on the
    // track would cut the second panel away in local space (it sits
    // outside the track's own box once translated) and the Concourse
    // panel would render empty and unhittable (headless probe, Nov 18,
    // 2026: blank tile panel, strip + cards + chrome row all gone).
    assert.ok(panel.includes('className="flex min-h-0 flex-1 transition-transform duration-300 ease-out"'), 'no overflow-hidden on the sliding track');
    assert.ok(panel.includes('overflow-hidden rounded-[2rem]'), 'the dialog box still clips to the viewport');
  });

  it('the tile panel drops its hub-only cards off the hub', () => {
    assert.ok(panel.includes('HUB_ONLY_CONCOURSE_TILE_IDS'), 'hub-only list consulted');
    assert.ok(panel.includes('CONCOURSE_ACTION_ITEMS.filter('), 'tile panel filters by hub');
  });
});

describe('gesture zones: carousel isolated, swipe flips, scroll scrolls (static)', () => {
  it('a swipe on the category carousel moves categories ONLY — it never flips panels', () => {
    assert.ok(panel.includes('onCarouselPointerDown'), 'carousel owns its pointer gesture');
    assert.ok(panel.includes('el.scrollLeft = d.startScrollLeft - (e.clientX - d.startX)'), 'the carousel scrolls itself — native scroll is dead here (track pan-y ∩ carousel pan-x = none)');
    assert.ok(panel.includes("touchAction: 'pan-x'"), 'the carousel keeps its horizontal scroll intent');
    assert.ok(panel.includes('setPointerCapture'), 'the drag keeps its pointer while it scrolls');
  });

  it('a grid face loads its own video in its stagger slot, so faces autoplay', () => {
    assert.ok(grid.includes('video.src = `/videos/portals/${item.key}.mp4`'), 'the face video gets its src in the stagger slot');
    assert.ok(grid.includes('VIDEO_START_STAGGER_MS'), 'loads stay staggered, one slot at a time');
  });

  it('a horizontal swipe anywhere else flips panels (direction detection)', () => {
    assert.ok(panel.includes('onTrackPointerDown'), 'the track owns the flip gesture');
    assert.ok(panel.includes('PANEL_FLIP_MIN_PX'), 'a flip needs a real swipe, not a tap');
    assert.ok(panel.includes('PANEL_FLIP_START_PX'), 'horizontal intent is detected before the flip');
    assert.ok(panel.includes("touchAction: 'pan-y'"), 'vertical touches scroll natively, horizontal ones flip');
    assert.ok(panel.includes("if (dx < 0 && panel === 'portals') setPanel('tiles');"), 'swipe left goes to the tiles');
    assert.ok(panel.includes("else if (dx > 0 && panel === 'tiles') setPanel('portals');"), 'swipe right comes back');
  });

  it('a drag swallows the tap that follows it, so a swipe never also opens a card', () => {
    assert.ok(panel.includes('suppressClickRef'), 'drag suppression tracked');
    assert.ok(panel.includes('onTrackClickCapture'), 'the capture guard stops the post-drag tap');
    assert.ok(panel.includes('Date.now() - suppressClickRef.current < CLICK_SUPPRESS_MS'), 'the tap handler checks it too');
  });

  it('the grid still scrolls vertically, one page at a time', () => {
    assert.ok(panel.includes('overflow-y-auto'), 'both panels scroll vertically');
    assert.ok(panel.includes('overscroll-contain'), 'scroll stays inside the sheet');
  });

  it('the grid hands each card its key, so the tile panel can hold-to-pin it', () => {
    assert.ok(grid.includes('data-item-key={item.key}'), 'grid buttons carry their key');
    assert.ok(panel.includes("closest('[data-item-key]')"), 'the pin hold finds its card by key');
    assert.ok(panel.includes('PIN_HOLD_MS'), 'the 2s hold pins a tile card');
    assert.ok(panel.includes('onPinTile(item.tileId)'), 'the pin fires through the parent');
  });
});

describe('action-variant taps: video plays, then the action runs (static)', () => {
  it('a Concourse card is told apart from a portal by its tile id', () => {
    assert.ok(panel.includes('isConcourseItem'), 'the branch exists');
    assert.ok(panel.includes('program.tileId'), 'a Concourse card carries its tile id');
  });

  it('the suck-in ending runs the action for a card, travel for a portal', () => {
    assert.ok(panel.includes('if (isConcourseItem(program)) handleConcourseAction(program);'), 'suck-done branches');
    assert.ok(panel.includes('else enterProgram(program);'), 'portals still travel');
    assert.ok(panel.includes('handleConcourseAction'), 'the action runs after the video');
  });

  it('reduced motion runs a card action at once, with no video', () => {
    assert.ok(panel.includes("if (isConcourseItem(program)) handleConcourseAction(program);"), 'reduced-motion tap branches');
  });

  it('the menu closes before the action opens, so no sheet hides behind it', () => {
    const action = panel.slice(panel.indexOf('const handleConcourseAction'));
    assert.ok(action.includes('handleClose();'), 'close first');
    assert.ok(action.includes('onConcourseAction(item.tileId)'), 'then dispatch');
  });
});

describe('box chrome homes in the merged menu (static)', () => {
  it('the announcements bell rides the header, its menu overlays from here', () => {
    assert.ok(panel.includes('<AnnouncementsBell hasUnread={hasUnread}'), 'bell in the header');
    assert.ok(panel.includes('<AnnouncementsMenu open={notifOpen}'), 'menu mounted in the sheet');
    assert.ok(!concourse.includes('<AnnouncementsBell'), 'the old box no longer carries the bell');
  });

  it('the Doomsday strip crowns the tile panel', () => {
    assert.ok(panel.includes('<DoomsdayStrip />'), 'strip in the tile panel');
    assert.ok(panel.indexOf('<DoomsdayStrip />') < panel.indexOf('pageItems={concourseItems}'), 'strip sits above the tile grid');
    assert.ok(!concourse.includes('<DoomsdayStrip />'), 'the old box no longer carries it');
  });

  it('the season badge, radio mini-player and docked backpack ride the tile chrome row', () => {
    assert.ok(panel.includes('{onHub && <SeasonBadge inline onGuide={handleSeasonGuide} />}'), 'season badge, hub-only');
    assert.ok(panel.includes('<ConcourseRadio />'), 'radio mini-player in the row');
    assert.ok(panel.includes('<BackpackHud realm="hub" realmLabel="the hub" docked'), 'backpack docked in the row');
    assert.ok(existsSync(join(repo, 'components', 'concourse', 'ConcourseRadio.jsx')), 'the pill lives in its own module now');
    assert.ok(radio.includes('export default function ConcourseRadio'), 'the pill kept its shape');
    assert.ok(radio.includes('useRadio'), 'the pill still reads the provider');
  });

  it('the Orb opens the merged menu now — the box is gone, the Orb is not', () => {
    assert.ok(concourse.includes('setPortal3dOpen(true)'), 'the Orb opens the merged menu');
    assert.ok(!concourse.includes('setOpen((o) => !o)'), 'the Orb no longer toggles the old box');
    assert.ok(!concourse.includes('grid-cols-4'), 'no box tile grid left');
    assert.ok(!concourse.includes('<CheatCodeFeatured />'), 'the box banner is gone — the TOOLS banner keeps the one copy');
    assert.ok(!concourse.includes('beginBoxDrag'), 'the box drag engine retired with the box');
    assert.ok(concourse.includes('const beginOrbDrag = (e) => {'), 'the Orb drag engine stays');
    assert.ok(concourse.includes("beginPress('tile', tile.id, e)"), 'pinned tiles keep their hold-to-pin engine');
  });

  it('the Concourse wires the merged menu: hub, actions, Programs, season guide, pins', () => {
    assert.ok(concourse.includes('<ConcoursePortals'), 'panel mounted');
    assert.ok(concourse.includes('open={portal3dOpen}'), 'panel opens on the Orb state');
    assert.ok(concourse.includes('onHub={onHub}'), 'hub passed in');
    assert.ok(concourse.includes('onConcourseAction='), 'card actions dispatch through fireTile');
    assert.ok(concourse.includes('onTogglePrograms='), 'Programs toggle wired');
    assert.ok(concourse.includes('onSeasonGuide='), 'season guide wired');
    assert.ok(concourse.includes('onPinTile='), 'pin-out wired');
    assert.ok(concourse.includes("fireConcourseTile('portals')"), 'Programs fires the Menu toggle event');
    assert.ok(concourse.includes('const handlePinTile'), 'pin-out handler exists');
  });

  it('the deep link still opens the merged menu unchanged', () => {
    assert.ok(concourse.includes('Portals3dDeepLink'), 'deep-link reader mounted');
    assert.ok(concourse.includes("searchParams?.get('portals3d') !== '1'"), 'param gate');
    assert.ok(concourse.includes('setPortal3dOpen(true)'), 'deep link opens the menu');
    assert.ok(concourse.includes("url.searchParams.delete('portals3d')"), 'param consumed so a reload never re-opens the menu');
  });
});

describe('the god menus stay reachable (static)', () => {
  it('the Programs button toggles the hub program menu from the merged header', () => {
    assert.ok(panel.includes('aria-label="Toggle the program menu"'), 'Programs button in the header');
    assert.ok(panel.includes('{onHub && ('), 'Programs is hub-only, like the Menu tile was');
    assert.ok(panel.includes('onTogglePrograms'), 'it fires the parent toggle');
  });

  it('Agent Forge has no registry seat — the god-menu layer must stay', () => {
    const roster = buildPortalRoster(
      SATELLITES,
      (k) => en[`sat.${k}.title`],
      (k) => en[`sat.${k}.subtitle`]
    );
    assert.ok(!roster.some((p) => p.key === 'agent-forge'), 'agent-forge is not a portal card');
    assert.ok(!CONCOURSE_ACTION_ITEMS.some((i) => i.key === 'agent-forge'), 'agent-forge is not a tile card either');
    assert.ok(read('lib/god-menus.js').includes('agent-forge'), 'it lives in the god menus alone');
  });
});
