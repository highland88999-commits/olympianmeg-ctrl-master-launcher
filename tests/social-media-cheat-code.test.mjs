// tests/social-media-cheat-code.test.mjs
// THE SOCIAL MEDIA CHEAT CODE room (Merlin, 2026-10-26) — the 3D
// room carousel for the town-and-city hashtag list, featured on
// every portal entry point:
// - the source list (3,098 unique tags) re-divvies per platform
//   at its verified cap: TikTok 5, Instagram 5, Facebook 120,
//   YouTube 60 (each cap labeled with its source in platforms.js)
// - each piece carries a Copy button + a per-account, per-platform
//   remembered checkbox (never shared, never faked)
// - the room is seated in the master registry + all 31 locale
//   dictionaries, in the HERMES god menu, and featured on the
//   Concourse box, the Portal Room, and the hub program menu
//
// Run: node --test tests/social-media-cheat-code.test.mjs   (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  CHUNKS,
  CHUNK_SIZE,
  TOTAL_TAGS,
  ALL_TAGS,
  chunkArray,
  chunkText,
  chunkRange,
  chunkRangeFor,
} from '../lib/social-media-cheat-code/chunks.js';
import {
  PLATFORMS,
  PLATFORM_IDS,
  getPlatform,
  platformPieces,
  platformPieceCount,
  pieceRange,
} from '../lib/social-media-cheat-code/platforms.js';
import { sanitizeCheatCodeChecks } from '../lib/social-media-cheat-code/tracking.js';
import { buildPortalRoster } from '../lib/portal-roster.js';
import { SATELLITES } from '../lib/i18n/satellites.ts';
import { GOD_MENUS } from '../lib/god-menus.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const read = (p) => readFileSync(join(repo, p), 'utf8');
const sourceTags = read('../your_files/all-towns-and-cities-hashtags.txt')
  .split(/\s+/)
  .filter(Boolean);

describe('source list + Facebook chunking (the 120 rooms)', () => {
  it('the source file holds exactly 3,098 unique well-formed tags', () => {
    assert.equal(sourceTags.length, 3098);
    assert.equal(new Set(sourceTags).size, 3098);
    assert.ok(sourceTags.every((t) => /^#[a-z0-9]+$/.test(t)));
  });

  it('the module matches the source file tag for tag, in order', () => {
    assert.deepEqual(ALL_TAGS, sourceTags);
    assert.equal(TOTAL_TAGS, 3098);
  });

  it('chunks into 26 pieces: 25 of 120 + a final 98', () => {
    assert.equal(CHUNK_SIZE, 120);
    assert.equal(CHUNKS.length, 26);
    assert.ok(CHUNKS.slice(0, 25).every((c) => c.length === 120));
    assert.equal(CHUNKS[25].length, 98);
    assert.equal(CHUNKS.flat().length, 3098);
  });

  it('chunk text + ranges are paste-ready and honest', () => {
    assert.equal(chunkText(0).split(' ').length, 120);
    assert.equal(chunkText(25).split(' ').length, 98);
    assert.equal(chunkRange(0), '1-120');
    assert.equal(chunkRange(25), '3001-3098');
    assert.equal(chunkRangeFor(0, 5), '1-5');
    assert.equal(chunkRangeFor(619, 5), '3096-3098');
  });

  it('first and last tags match the posted list', () => {
    assert.equal(ALL_TAGS[0], '#edmonton');
    assert.equal(ALL_TAGS[3097], '#hagatna');
  });
});

describe('platform re-divvying (verified caps only)', () => {
  it('ships exactly the four platforms with verified caps', () => {
    assert.deepEqual(PLATFORM_IDS, ['facebook', 'tiktok', 'instagram', 'youtube']);
    assert.equal(getPlatform('facebook').cap, 120);
    assert.equal(getPlatform('tiktok').cap, 5);
    assert.equal(getPlatform('instagram').cap, 5);
    assert.equal(getPlatform('youtube').cap, 60);
  });

  it('every cap carries its source label — no silent numbers', () => {
    for (const p of PLATFORMS) {
      assert.ok(p.capLine && p.capSource, `${p.id} names its cap source`);
      assert.ok(p.logo && p.logo.startsWith('/cheat-code-logos/'), `${p.id} logo is self-hosted`);
    }
    assert.match(getPlatform('instagram').capSource, /Help Center/);
    assert.match(getPlatform('instagram').capSource, /old 30 no longer applies/);
    assert.match(getPlatform('youtube').capSource, /Help Center/);
    assert.match(getPlatform('tiktok').capSource, /observed cap/);
    assert.match(getPlatform('facebook').capSource, /linkify/);
  });

  it('piece counts follow the caps exactly', () => {
    assert.equal(platformPieceCount('facebook'), 26);
    assert.equal(platformPieceCount('tiktok'), 620);
    assert.equal(platformPieceCount('instagram'), 620);
    assert.equal(platformPieceCount('youtube'), 52);
  });

  it('every platform re-covers the whole list, in order, with no loss or duplication', () => {
    for (const id of PLATFORM_IDS) {
      const pieces = platformPieces(id);
      assert.deepEqual(pieces.flat(), sourceTags, `${id} pieces cover the list exactly`);
      const cap = getPlatform(id).cap;
      assert.ok(pieces.slice(0, -1).every((c) => c.length === cap), `${id} full pieces are all ${cap}`);
    }
    assert.equal(platformPieces('youtube')[51].length, 38);
    assert.equal(platformPieces('tiktok')[619].length, 3);
  });

  it('piece ranges are 1-based and exact', () => {
    assert.equal(pieceRange('tiktok', 0), '1-5');
    assert.equal(pieceRange('tiktok', 619), '3096-3098');
    assert.equal(pieceRange('youtube', 51), '3061-3098');
    assert.equal(pieceRange('facebook', 25), '3001-3098');
  });

  it('the self-hosted logo files exist and are real SVGs', () => {
    for (const p of PLATFORMS) {
      const svg = read(`public${p.logo}`);
      assert.ok(svg.startsWith('<svg'), `${p.id} logo is an SVG`);
      assert.ok(svg.includes('<path'), `${p.id} logo carries a path`);
      assert.ok(svg.includes('fill="#'), `${p.id} logo has its brand color baked in`);
    }
  });

  it('chunkArray is pure and size-exact', () => {
    assert.deepEqual(chunkArray([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
    assert.deepEqual(chunkArray([], 5), []);
  });
});

describe('per-account per-platform tracking (never shared, never faked)', () => {
  it('keeps valid platform+piece checks and drops everything else', () => {
    const sane = sanitizeCheatCodeChecks({
      facebook: { 0: true, 25: true, 26: true, nope: true, 3: false },
      tiktok: { 619: true, 620: true },
      instagram: { 0: true },
      youtube: { 51: true, 52: true },
      x: { 0: true },
    });
    assert.deepEqual(sane, {
      facebook: { 0: true, 25: true },
      tiktok: { 619: true },
      instagram: { 0: true },
      youtube: { 51: true },
    });
  });

  it('a TikTok check never marks a Facebook piece, and vice versa', () => {
    const sane = sanitizeCheatCodeChecks({ tiktok: { 0: true } });
    assert.deepEqual(sane, { tiktok: { 0: true } });
    assert.ok(!sane.facebook);
  });

  it('rejects non-objects; empty-but-valid maps pass through clean', () => {
    assert.equal(sanitizeCheatCodeChecks(null), null);
    assert.equal(sanitizeCheatCodeChecks('nope'), null);
    assert.equal(sanitizeCheatCodeChecks([0]), null);
    assert.deepEqual(sanitizeCheatCodeChecks({}), {});
    assert.deepEqual(sanitizeCheatCodeChecks({ facebook: {} }), {});
  });
});

describe('master-portal seating + featured placement', () => {
  it('the registry seats the room with HERMES/TOOLS (one claim, unique route)', () => {
    const seat = SATELLITES.find((s) => s.key === 'social-media-cheat-code');
    assert.ok(seat);
    assert.equal(seat.route, '/social-media-cheat-code');
    assert.equal(seat.pos, 'HERMES');
    assert.equal(seat.section, 'TOOLS');
    assert.equal(SATELLITES.filter((s) => s.route === '/social-media-cheat-code').length, 1);
    assert.equal(SATELLITES.length, 213); // Request a Billboard seat: 178→179; Collapse Run seat: 179→180; Quidditch seat: 180→181; Omega 500 seat: 195→196; Hades seats: 196→198; nether-realms homes: 198→210 (Nov 12, 2026); Earth 4 seat: 210→211 (Nov 14, 2026); Moon + Sun Base seats: 211→213 (Nov 14, 2026)
  });

  it('the HERMES god menu carries the room (so search + menu rows find it)', () => {
    const hermes = GOD_MENUS.find((m) => m.god === 'HERMES');
    assert.ok(hermes.satellites.includes('social-media-cheat-code'));
  });

  it('the Portal Room roster includes the room (registry − the room itself)', () => {
    const en = JSON.parse(read('lib/i18n/locales/en.json'));
    const roster = buildPortalRoster(SATELLITES, (k) => en[`sat.${k}.title`], (k) => en[`sat.${k}.subtitle`]);
    assert.equal(roster.length, 212); // Request a Billboard seat: 177→178; Collapse Run seat: 178→179; Quidditch seat: 179→180; Omega 500 seat: 194→195 (the old 180 pin was stale); Hades seats: 195→197; nether-realms homes: 197→209 (Nov 12, 2026); Earth 4 seat: 209→210 (Nov 14, 2026); Moon + Sun Base seats: 210→212 (Nov 14, 2026)
    const seat = roster.find((p) => p.key === 'social-media-cheat-code');
    assert.ok(seat);
    assert.equal(seat.title, 'Social Media Cheat Code');
    assert.equal(seat.section, 'TOOLS');
  });

  it('all 34 locale dictionaries carry the room title + subtitle', () => {
    const locales = readdirSync(join(repo, 'lib/i18n/locales')).filter((f) => f.endsWith('.json'));
    assert.equal(locales.length, 34);
    for (const f of locales) {
      const d = JSON.parse(read(`lib/i18n/locales/${f}`));
      assert.equal(d['sat.social-media-cheat-code.title'], 'Social Media Cheat Code', f);
      assert.ok(d['sat.social-media-cheat-code.subtitle'], f);
    }
  });

  it('the room page exists where the registry points', () => {
    const page = read('app/social-media-cheat-code/page.jsx');
    assert.ok(page.includes('Social Media Cheat Code'));
    assert.ok(page.includes('CheatCodeRoom'));
  });

  it('the Concourse box features the room above its tiles', () => {
    const concourse = read('components/Concourse.jsx');
    assert.ok(concourse.includes("import CheatCodeFeatured from './CheatCodeFeatured'"));
    assert.ok(concourse.includes('<CheatCodeFeatured />'));
    // The banner sits before the tile grid in the scroll area.
    assert.ok(concourse.indexOf('<CheatCodeFeatured />') < concourse.indexOf('grid-cols-4'));
  });

  it('the Portal Room page features the room above its roster', () => {
    const page = read('app/portal-room/page.jsx');
    assert.ok(page.includes("import CheatCodeFeatured from '@/components/CheatCodeFeatured'"));
    assert.ok(page.includes('<CheatCodeFeatured />'));
    assert.ok(page.indexOf('<CheatCodeFeatured />') < page.indexOf('<PortalRoomGate'));
  });

  it('the hub program menu features the room as a pinned top button', () => {
    const menu = read('components/SatelliteMenu.jsx');
    assert.ok(menu.includes('launchCheatCode'));
    assert.ok(menu.includes("satIndex.get('social-media-cheat-code')"));
    assert.ok(menu.includes("onLaunch('/social-media-cheat-code', 'social-media-cheat-code'"));
    assert.ok(menu.includes('sat.social-media-cheat-code.title'));
  });

  it('the ui-state route accepts the per-platform checks key', () => {
    const route = read('app/api/ui-state/route.js');
    assert.ok(route.includes("import { sanitizeCheatCodeChecks } from '@/lib/social-media-cheat-code/tracking'"));
    assert.ok(route.includes("if ('cheat_code_checks' in prefs)"));
  });
});

describe('room component — function + look + per-visit prompt', () => {
  const room = read('components/social-media-cheat-code/CheatCodeRoom.jsx');

  it('swipes rooms, copies pieces, checks per platform (no faked state)', () => {
    assert.ok(room.includes('platformPieces(platformId)'));
    assert.ok(room.includes('navigator.clipboard.writeText'));
    assert.ok(room.includes('execCommand'));
    assert.ok(room.includes('toggleCheck'));
    assert.ok(room.includes('cheat_code_checks'));
  });

  it('never walks: view toggles 1st/3rd person and the character stands as gatekeeper', () => {
    assert.ok(room.includes("setView"));
    assert.ok(room.includes('3rd person'));
    assert.ok(room.includes('1st person'));
    assert.ok(room.includes('Gatekeeper of this room'));
    assert.ok(room.includes('Choose gatekeeper'));
    // No walking controls exist: no joystick, no movement keys.
    assert.ok(!room.includes('Joystick') && !room.includes('onMove'));
  });

  it('obsidian + deep red veins + rock frame + glassy thin borders + silver words', () => {
    assert.ok(room.includes('#0a0908')); // obsidian
    assert.ok(room.includes('#7f1d1d') || room.includes('#991b1b')); // deep red veins
    assert.ok(room.includes('rgba(255,255,255,0.04)') || room.includes('rgba(255,255,255,0.03)')); // see-through panels
    assert.ok(room.includes("SILVER")); // silver text scale
    assert.ok(!room.includes('amber-300') && !room.includes('bg-amber-400')); // no amber UI left
  });

  it('controls sit fixed in the middle of each room (plaque, controls, tags)', () => {
    const plaque = room.indexOf('Piece plaque');
    const controls = room.indexOf('Controls — FIXED in the middle');
    const tags = room.indexOf("The piece's tags");
    assert.ok(plaque > 0 && controls > plaque && tags > controls);
  });

  it('the per-visit prompt is tap-to-dismiss with NO saved dismissal', () => {
    assert.ok(room.includes('Copy a room and drop it into your next social post.'));
    assert.ok(room.includes('Tap to dismiss'));
    assert.ok(room.includes('promptDismissed'));
    // The prompt's dismissal must never touch storage: no LS key,
    // no ui-state write mentioning the prompt.
    const promptLines = room.split('\n').filter((l) => /prompt/i.test(l));
    assert.ok(!promptLines.some((l) => /localStorage|ui-state|cheat_code_checks/.test(l)));
  });

  it('the platform selector shows real logos + the cap line', () => {
    assert.ok(room.includes('PLATFORMS.map'));
    assert.ok(room.includes('p.logo'));
    assert.ok(room.includes('capLine'));
    assert.ok(room.includes('capSource'));
  });
});
