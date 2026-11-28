// tests/hub-video-fixes.test.mjs
// Hub-video fixes round (Merlin's Nov 27 ~06:10 phone video, 61 s):
//   FIX 2 — the Doomsday strip's text clipped off both panel edges
//   FIX 3 — the backpack "99+" badge half cut off by the panel edge
//   FIX 4 — black flash before the Phone tile's video (phone.mp4)
//   FIX 5 — the Portals hero video (logo first, autoplay after 1 s,
//           unmuted, tap to mute, pause on minimize, replay on reopen)
//   Q6    — Portals says 223 realms after the ARES dedup (roster 222)
//
// Run: node --test tests/hub-video-fixes.test.mjs   (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { buildPortalRoster, withSignedInPortals, withOwnerPortals, SIGNED_IN_PORTALS, OWNER_PORTALS } from '../lib/portal-roster.js';
import { SATELLITES } from '../lib/i18n/satellites.ts';
import {
  PORTALS_HERO_VIDEO,
  PORTALS_HERO_AUTOPLAY_DELAY_MS,
  createPortalsHeroState,
  portalsHeroNext,
  attemptUnmutedPlay,
} from '../lib/portals-hero.js';
import { PHONE_VIDEO, warmPortalVideo } from '../lib/portal-video-preload.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const read = (p) => readFileSync(join(repo, p), 'utf8');
const en = JSON.parse(read('lib/i18n/locales/en.json'));

const banner = read('components/DoomsdayBanner.jsx');
const panel = read('components/ConcoursePortals.jsx');

const enRoster = () =>
  buildPortalRoster(SATELLITES, (k) => en[`sat.${k}.title`], (k) => en[`sat.${k}.subtitle`]);

describe('FIX 2 — Doomsday strip fits the Concourse panel at phone widths', () => {
  it('the "until" line takes its own centred line below 640px (sm:basis-auto restores the one-line row above it)', () => {
    assert.match(banner, /basis-full text-center[^"]*sm:basis-auto/);
    assert.match(banner, /until \{info\.locked_until_label/);
  });

  it('the clock cannot split across lines and the strip cannot squeeze its row', () => {
    assert.match(banner, /shrink-0 whitespace-nowrap text-\[13px\] font-extrabold tabular-nums/);
    assert.match(banner, /flex min-w-0 flex-wrap items-center justify-center gap-x-2\.5 gap-y-0\.5/);
  });

  it('the countdown value itself is untouched', () => {
    assert.match(banner, /countdown_ms: Math\.max\(0, \(prev\.countdown_ms \|\| 0\) - 1000\)/);
    assert.match(banner, /const clock = `\$\{days\}d \$\{pad\(hours\)\}:\$\{pad\(mins\)\}:\$\{pad\(secs\)\}`/);
    assert.match(banner, /href="\/wallet\/how-it-works"/);
  });
});

describe('FIX 3 — the "99+" badge sits fully inside the panel', () => {
  it('the backpack mount is OUT of the sliding track (no transformed ancestor can throw it a panel-width sideways)', () => {
    // The track runs from its pointer-down div to the moved-row
    // comment that now follows its close — it holds the two panels
    // only, and the backpack must not be inside it.
    const trackAt = panel.indexOf('onPointerDown={onTrackPointerDown}');
    const rowAt = panel.indexOf('{/* Bottom chrome row — MOVED OUT');
    assert.ok(trackAt > 0, 'track div present');
    assert.ok(rowAt > trackAt, 'moved chrome row follows the track close');
    const trackSpan = panel.slice(trackAt, rowAt);
    assert.ok(!trackSpan.includes('<BackpackHud'), 'BackpackHud is not inside the track');
    assert.ok(!trackSpan.includes('ConcourseRadio'), 'the chrome row is not inside the track');
  });

  it('the moved chrome row still shows only on the tile panel, below the grid, with the backpack docked in it', () => {
    assert.match(panel, /\{panel === 'tiles' && \(\s*<div className="flex flex-wrap items-center justify-center gap-2 px-5 pb-1 pt-2">/);
    assert.match(panel, /<BackpackHud realm="hub" realmLabel="the hub" docked/);
    assert.match(panel, /<ConcourseRadio \/>/);
  });

  it('the panel-flip slide mechanism itself is unchanged', () => {
    assert.match(panel, /transform: panel === 'tiles' \? 'translateX\(-100%\)' : 'translateX\(0\)'/);
  });
});

describe('FIX 4 — no black flash before the Phone tile video', () => {
  it('warmPortalVideo preloads through a detached video element', () => {
    const created = [];
    const stubDoc = {
      createElement: (tag) => {
        const el = {
          tag,
          preload: '',
          src: '',
          loadCalled: false,
          load() { this.loadCalled = true; },
        };
        created.push(el);
        return el;
      },
    };
    const el = warmPortalVideo(stubDoc, PHONE_VIDEO);
    assert.equal(created.length, 1);
    assert.equal(el.tag, 'video');
    assert.equal(el.preload, 'auto');
    assert.equal(el.src, PHONE_VIDEO);
    assert.equal(el.loadCalled, true);
  });

  it('warmPortalVideo returns null without a document or a src', () => {
    assert.equal(warmPortalVideo(null, PHONE_VIDEO), null);
    assert.equal(warmPortalVideo({ createElement: () => ({}) }, ''), null);
  });

  it('the Concourse menu warms the Phone video while it is open', () => {
    assert.match(panel, /warmPortalVideo\(/);
    assert.match(panel, /phonePreloadRef\.current = warmPortalVideo\(/);
    assert.match(panel, /PHONE_VIDEO/);
    assert.equal(PHONE_VIDEO, '/videos/portals/phone.mp4');
    assert.ok(existsSync(join(repo, 'public/videos/portals/phone.mp4')));
  });

  it('phone.mp4 is faststart (moov near the head, not the tail)', () => {
    const head = readFileSync(join(repo, 'public/videos/portals/phone.mp4')).subarray(0, 131072);
    const moovAt = head.indexOf(Buffer.from('moov'));
    assert.ok(moovAt > 0 && moovAt < 100000, `moov at ${moovAt}`);
  });
});

describe('FIX 5 — the Portals hero video', () => {
  it('the delay is exactly 1 second', () => {
    assert.equal(PORTALS_HERO_AUTOPLAY_DELAY_MS, 1000);
  });

  it('the state machine: logo first, playing on confirm, reset on deactivate', () => {
    const fresh = createPortalsHeroState();
    assert.deepEqual(fresh, { phase: 'logo', muted: false, playBlocked: false });
    const playing = portalsHeroNext(portalsHeroNext(fresh, 'activate'), 'play-confirmed');
    assert.equal(playing.phase, 'playing');
    assert.equal(playing.playBlocked, false);
    const reset = portalsHeroNext(playing, 'deactivate');
    assert.deepEqual(reset, { phase: 'logo', muted: false, playBlocked: false });
  });

  it('replay on reopen: deactivate then activate lands back on the logo', () => {
    let s = createPortalsHeroState();
    s = portalsHeroNext(s, 'play-confirmed');
    s = portalsHeroNext(s, 'deactivate');
    s = portalsHeroNext(s, 'activate');
    assert.equal(s.phase, 'logo');
    assert.equal(s.muted, false);
  });

  it('the mute toggle flips and flips back', () => {
    let s = portalsHeroNext(createPortalsHeroState(), 'play-confirmed');
    s = portalsHeroNext(s, 'toggle-mute');
    assert.equal(s.muted, true);
    s = portalsHeroNext(s, 'toggle-mute');
    assert.equal(s.muted, false);
    assert.equal(s.phase, 'playing');
  });

  it('a rejected unmuted play blocks on the logo — never a silent muted fallback', async () => {
    const err = new Error('play() failed');
    err.name = 'NotAllowedError';
    const video = { muted: false, play: async () => { throw err; } };
    const res = await attemptUnmutedPlay(video, { muted: false });
    assert.deepEqual(res, { ok: false, name: 'NotAllowedError' });
    assert.equal(video.muted, false, 'the attempt must not mute the video as a fallback');
    const s = portalsHeroNext(createPortalsHeroState(), 'play-rejected');
    assert.equal(s.phase, 'blocked');
    assert.equal(s.playBlocked, true);
    assert.equal(s.muted, false);
  });

  it('the unmuted-play attempt plays WITH sound when the browser allows it', async () => {
    const video = { muted: true, play: async () => {} };
    const res = await attemptUnmutedPlay(video, { muted: false });
    assert.deepEqual(res, { ok: true, name: null });
    assert.equal(video.muted, false);
  });

  it('the muted path still plays (a tap during the logo second can pre-mute)', async () => {
    const video = { muted: false, play: async () => {} };
    const res = await attemptUnmutedPlay(video, { muted: true });
    assert.deepEqual(res, { ok: true, name: null });
    assert.equal(video.muted, true);
  });

  it('the hero file exists: h264 video + AAC audio, and the HEVC original is untouched', () => {
    assert.equal(PORTALS_HERO_VIDEO, '/videos/portals/portals-hero.mp4');
    const heroPath = join(repo, 'public/videos/portals/portals-hero.mp4');
    assert.ok(existsSync(heroPath));
    const head = readFileSync(heroPath).subarray(0, 262144);
    assert.ok(head.indexOf(Buffer.from('avc1')) > 0, 'h264 (avc1) sample entry present');
    assert.ok(head.indexOf(Buffer.from('mp4a')) > 0, 'AAC (mp4a) sample entry present');
    assert.ok(statSync(heroPath).size > 1000000, 'hero file is non-trivial');
    const orig = join(
      repo,
      '..', '..', 'user/media_library/video/0c/0c64eadaf2e8210acf1cdeedb0bb3047146c82cb60853fd9538d92862700607b.mp4'
    );
    assert.ok(existsSync(orig), 'HEVC original still in the media library');
    assert.equal(statSync(orig).size, 6605029, 'original byte size unchanged');
  });

  it('the Portals panel wires the hero: logo first, 1 s delay, loop, tap to mute, pause on flip away', () => {
    assert.match(panel, /<PortalsHeroVideo active=\{panel === 'portals'\} \/>/);
    assert.match(panel, /src=\{PORTALS_HERO_VIDEO\}/);
    assert.match(panel, /PORTALS_HERO_AUTOPLAY_DELAY_MS/);
    assert.match(panel, /loop\n\s+playsInline\n\s+preload="auto"/);
    assert.match(panel, /onClick=\{onTap\}/);
    // A tap during the logo window must mute the element itself, not
    // just the state flag: the play() may already be resolving while
    // the pill still shows the logo, and the flag alone would leave
    // the video sounding under a "Muted" pill.
    assert.ok(panel.includes('video.muted = next.muted'), 'the logo-phase tap writes muted to the video element');
    assert.ok(!panel.includes('src={OMEGA_WRAP_VIDEO}'), 'the old paused wrap strip is gone from the hero box');
  });
});

describe('Q6 — Portals says 223 realms after the ARES dedup (roster 222)', () => {
  it('the bare registry roster is 222 (the ARES dedup, Nov 26, 2026)', () => {
    const roster = enRoster();
    assert.equal(roster.length, 222);
    assert.ok(!roster.some((p) => p.key === 'earth-2'), 'Earth 2 is NOT in the registry');
    assert.ok(!roster.some((p) => p.key === 'ares'), 'no ARES portal seat in the registry');
  });

  it('Portals counts the roster PLUS the signed-in Earth 2 — 223 for Merlin, 222 signed out', () => {
    const roster = enRoster();
    assert.equal(withSignedInPortals(roster, true).length, 223);
    assert.equal(withSignedInPortals(roster, false).length, 222);
    assert.deepEqual(
      withSignedInPortals(roster, true).filter((p) => p.key === 'earth-2'),
      [{ key: 'earth-2', route: '/earth-2', section: 'OBSERVATORY', title: 'Earth 2', subtitle: 'Open to all signed-in users' }]
    );
    assert.equal(SIGNED_IN_PORTALS.length, 1, 'Earth 2 is the only signed-in extra');
    assert.equal(OWNER_PORTALS.length, 0, 'no owner-only extra inflates the count');
    assert.equal(withOwnerPortals(roster, true).length, 222);
  });
});
