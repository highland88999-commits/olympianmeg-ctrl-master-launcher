// tests/aurora-portal-paused.test.mjs
// AURORA REMOVAL + PAUSED PORTAL VIDEOS (Merlin, Nov 24, 2026):
// remove the Aurora system from the hub; make the Concourse portal
// videos load the same way Starforge tiles do — paused on their
// first frame, ignited only on tap. The tap path is untouched: tap
// expands fullscreen, the video plays once, travel engages on end.
//
// Static pins (the hub scene + Concourse are JSX — node reads their
// sources). The headless probe (not this suite) watches a real hub
// load with no aurora, real grid faces paused on first frame, and a
// real tap playing the fullscreen video to travel.
//
// Run: node --test tests/aurora-portal-paused.test.mjs (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const read = (p) => readFileSync(join(repo, p), 'utf8');

const hub = read('components/HubPortals.jsx');
const grid = read('components/concourse/PortalFlatGrid.jsx');
const panel = read('components/ConcoursePortals.jsx');
const suck = read('components/concourse/PortalSuckOverlay.jsx');
const room = read('components/PortalRoom.jsx');
const starforge = read('components/starforge/graphics.jsx');
const concourse = read('components/Concourse.jsx');
const hubLoaded = read('lib/hub-loaded.js');

// The Arch strip is GONE (hub-video-fixes, Nov 27, fix 5): the old
// OMEGA_WRAP_VIDEO strip was replaced by the Portals hero video
// (PortalsHeroVideo in the panel, lib/portals-hero.js). The hero
// INTENTIONALLY autoplays unmuted 1 s after the menu opens and loops
// — that is the ordered fix-5 behaviour, pinned in detail by
// tests/hub-video-fixes.test.mjs — so the paused-strip assertions
// below now assert the replacement, not the strip.
function heroBlock() {
  const at = panel.indexOf('<PortalsHeroVideo');
  assert.ok(at !== -1, 'the Portals hero video is the top video');
  return panel.slice(at, panel.indexOf('/>', at));
}

describe('the Aurora system is gone from the hub', () => {
  it('no aurora field, no shaft texture — nothing streams down from Heaven', () => {
    assert.ok(!hub.includes('AuroraField'), 'AuroraField component gone');
    assert.ok(!hub.includes('auroraShaftTexture'), 'shaft texture helper gone');
    assert.ok(!hub.includes('<AuroraField'), 'no AuroraField rendered');
  });

  it('the gates themselves are untouched: both discs, swirl, nanites, rings', () => {
    assert.ok(hub.includes('def={HEAVEN_PORTAL}'), 'heaven disc stays');
    assert.ok(hub.includes('def={NETHER_PORTAL}'), 'nether disc stays');
    assert.ok(hub.includes('paintPortalSwirl'), 'swirl faces stay');
    assert.ok(hub.includes('getParticleTexture'), 'nanites stay');
    assert.ok(hub.includes('TRANSIT_GOLD'), 'transit gold ring stays');
    assert.ok(hub.includes('paintAuroraBootRing'), 'transit aurora ring stays — static, painted once, not the field');
  });

  it('the Portal Room boot sequence is NOT removed with it (out of scope — click-triggered, not a load cost)', () => {
    assert.ok(room.includes('AURORA SYSTEM'), 'room still boots the aurora system on a portal click');
    assert.ok(room.includes('BOOT_MS'), 'boot timing untouched');
  });
});

describe('portal faces load paused, Starforge-style', () => {
  it('the face video is muted + inline + metadata-only, never autoplay, never looping', () => {
    assert.ok(!grid.includes('autoPlay'), 'no autoplay anywhere in the grid');
    assert.ok(!/<video[^>]*\bloop\b/.test(grid), 'the face video has no loop attribute');
    assert.ok(grid.includes('preload="metadata"'), 'JSX preload is metadata — first frame only');
    assert.ok(grid.includes("video.preload = 'metadata'"), 'the stagger load also sets metadata, never auto');
    assert.ok(grid.includes('muted'), 'faces stay muted');
    assert.ok(grid.includes('playsInline'), 'faces stay inline');
  });

  it('nothing plays a grid video on load, on return, or on suck-in close', () => {
    assert.ok(!grid.includes('video.play()'), 'no play() call anywhere in the grid');
    assert.ok(!grid.includes('.play()'), 'no play() on any video in the grid');
    assert.ok(grid.includes('visibilitychange'), 'tab-hide pause survives');
    assert.ok(grid.includes('document.hidden'), 'hidden-tab check survives');
  });

  it('the load discipline survives: stagger, unmount unload, reduced-motion marker', () => {
    assert.ok(grid.includes('VIDEO_START_STAGGER_MS'), '120 ms stagger still gates the load');
    assert.ok(grid.includes("removeAttribute('src')"), 'unmount still unloads the video');
    assert.ok(grid.includes("matchMedia('(prefers-reduced-motion: reduce)')"), 'reduced-motion check survives');
    assert.ok(grid.includes('gridStill'), 'still-face marker survives');
  });

  it('the Starforge pattern being mirrored is intact in its own file', () => {
    assert.ok(starforge.includes('preload="metadata"'), 'TileVideo still preloads metadata');
    const tileFn = starforge.slice(
      starforge.indexOf('function TileVideo('),
      starforge.indexOf('function TileVideoLayer')
    );
    assert.ok(tileFn.length > 0, 'TileVideo function found');
    assert.ok(!tileFn.includes('autoPlay'), 'TileVideo still never autoplays');
    assert.ok(!tileFn.includes('loop'), 'TileVideo still never loops');
  });
});

describe('the Arch strip is gone — the Portals hero video is the top video', () => {
  it('no Arch strip video is left in the panel', () => {
    assert.ok(!panel.includes('OMEGA_WRAP_VIDEO'), 'the old wrap strip is fully removed');
    assert.ok(!panel.includes('src={OMEGA_WRAP_VIDEO}'), 'no strip video src left');
  });

  it('the hero video sits at the top of the panel, over the categories', () => {
    const block = heroBlock();
    assert.ok(block.length > 0, 'hero video mounts in the panel');
    assert.ok(panel.indexOf('<PortalsHeroVideo') < panel.indexOf('<PortalFlatGrid'), 'hero is above the grid');
    assert.ok(panel.includes("from '@/lib/portals-hero'"), 'hero behaviour comes from lib/portals-hero');
  });

  it('the only autoPlay left in the panel is the dialog background (user preference — out of scope)', () => {
    const count = (panel.match(/autoPlay/g) || []).length;
    assert.equal(count, 1, 'exactly one autoPlay left in the panel');
    assert.ok(panel.indexOf('bgPref') < panel.indexOf('autoPlay'), 'that one is the background video');
  });
});

describe('tap still ignites the video, exactly as before', () => {
  it('the suck-in overlay still autoplays once, muted, inline, and travel engages on end', () => {
    assert.ok(suck.includes('autoPlay'), 'the fullscreen video starts itself — no second tap');
    assert.ok(suck.includes('muted'), 'muted');
    assert.ok(suck.includes('playsInline'), 'inline');
    assert.ok(!suck.includes('loop'), 'plays ONCE — it must end for travel to engage');
    assert.ok(suck.includes('onEnded={engage}'), 'video end engages travel');
  });

  it('the hub-loaded defer is untouched — the gate still serialises hub, then Concourse', () => {
    assert.ok(hubLoaded.includes('fireHubLoaded'), 'signal still exists');
    assert.ok(hubLoaded.includes('shouldMountConcoursePortals'), 'predicate still exists');
    assert.ok(concourse.includes('shouldMountConcoursePortals'), 'Concourse still gates the mount on it');
  });
});
