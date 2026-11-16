// tests/moon-cgi.test.mjs
// MOON CGI — the /moon scene is a CGI moon now (Merlin, Nov 14, 2026).
// The lunar surface, Earth and rocks come from the shared planet-CGI
// module (lib/planet-cgi); Earth turns on the real clock under its
// own drifting cloud layer, dust motes drift around the pad, the
// flag waves, and the OLYMPUS label is a small label again — not a
// billboard filling the spawn screen. The hub Moon's orbit is
// verified here too: it already advances on the real clock, so no
// fix was needed. Run: node --test tests/moon-cgi.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import * as THREE from 'three';
import { MOON_ORBIT_RADIUS, MOON_ORBIT_SPEED, moonPositionAt } from '../lib/hub-layout.js';
import { EARTH_CENTER, orbitTime } from '../lib/god-orbits.js';
import {
  MOON_EARTH_SPIN_RATE,
  MOON_OLYMPUS_LABEL_SIZE,
  MOON_FLAG_CLOTH,
  MOON_DUST_FIELD,
} from '../lib/moon.js';
import { planetMaps } from '../lib/planet-cgi/textures.js';
import {
  PLANET_CGI_EPOCH_MS,
  spinAngle,
  cloudDriftAngle,
  makeDustField,
  updateDustField,
  waveFlag,
} from '../lib/planet-cgi/motion.js';

const moonSceneSrc = readFileSync(new URL('../components/MoonScene.jsx', import.meta.url), 'utf8');
const hubMoonSrc = readFileSync(new URL('../components/HubMoon.jsx', import.meta.url), 'utf8');

describe('hub Moon orbit (verify it moves)', () => {
  it('one orbit takes exactly 240 s', () => {
    assert.equal(MOON_ORBIT_SPEED, (Math.PI * 2) / 240);
  });

  it('moonPositionAt advances with t and returns after one orbit', () => {
    const p0 = moonPositionAt(0);
    const p60 = moonPositionAt(60);
    const d = Math.hypot(p60.x - p0.x, p60.y - p0.y, p60.z - p0.z);
    assert.ok(d > 100, `the Moon moves a long way in 60 s (moved ${d.toFixed(1)})`);
    // Still on the orbit: 180 out from Earth, in the XZ plane.
    for (const t of [0, 60, 137, 240]) {
      const p = moonPositionAt(t);
      const r = Math.hypot(p.x - EARTH_CENTER.x, p.z - EARTH_CENTER.z);
      assert.ok(Math.abs(r - MOON_ORBIT_RADIUS) < 1e-9, `orbit radius holds at t=${t}`);
    }
    const p240 = moonPositionAt(240);
    assert.ok(Math.hypot(p240.x - p0.x, p240.y - p0.y, p240.z - p0.z) < 1e-9, 'back where it started after one orbit');
  });

  it('moonPositionAt(orbitTime()) advances on the real clock', () => {
    const now = orbitTime();
    assert.ok(typeof now === 'number' && now >= 0, 'orbitTime is a live clock');
    const a = moonPositionAt(now);
    const b = moonPositionAt(now + 60);
    assert.ok(Math.hypot(b.x - a.x, b.z - a.z) > 100, 'a minute later the Moon is elsewhere');
  });
});

describe('Moon CGI wiring', () => {
  it('HubMoon delegates the lunar texture to the shared module', () => {
    assert.ok(hubMoonSrc.includes("planetMaps('lunarRegolith', 'moon')"), 'makeMoonTexture delegates to planetMaps');
    assert.ok(hubMoonSrc.includes('bumpMap={maps.bumpMap}'), 'hub orb applies the bump map');
    assert.ok(!hubMoonSrc.includes('CanvasTexture'), 'no one-off canvas texture left');
  });

  it('MoonScene uses the shared module for surface, Earth, dust and flag', () => {
    assert.ok(moonSceneSrc.includes("makeMoonTexture } from './HubMoon'"), 'surface still one source of truth with the hub orb');
    assert.ok(moonSceneSrc.includes("planetMaps('earthLike', 'earth')"), 'Earth is the shared earthLike map');
    assert.ok(moonSceneSrc.includes('cloudLayerTexture'), 'clouds live on their own layer');
    assert.ok(moonSceneSrc.includes('cloudDriftAngle'), 'clouds drift on the real clock');
    assert.ok(moonSceneSrc.includes('makeDustField'), 'dust motes at the pad');
    assert.ok(moonSceneSrc.includes('waveFlag'), 'the flag waves');
    assert.ok(moonSceneSrc.includes("materialForPlanet('rock'"), 'rocks use the shared rock material');
    assert.ok(!moonSceneSrc.includes('makeEarthTexture'), 'the flat canvas Earth is gone');
    assert.ok(!moonSceneSrc.includes('fontSize={0.9}'), 'the giant OLYMPUS billboard size is gone');
  });

  it('the lunar surface the scene uses has a real bump map', () => {
    const { map, bumpMap } = planetMaps('lunarRegolith', 'moon');
    assert.ok(map instanceof THREE.DataTexture);
    assert.ok(bumpMap instanceof THREE.DataTexture);
    const bd = bumpMap.image.data;
    let lo = 255;
    let hi = 0;
    for (let i = 0; i < bd.length; i++) {
      if (bd[i] < lo) lo = bd[i];
      if (bd[i] > hi) hi = bd[i];
    }
    assert.ok(hi - lo > 120, 'moon bump has deep relief');
  });

  it('Earth turns on the real clock and clouds outrun the surface', () => {
    const t0 = PLANET_CGI_EPOCH_MS + 60000;
    const a0 = spinAngle(MOON_EARTH_SPIN_RATE, t0);
    const a1 = spinAngle(MOON_EARTH_SPIN_RATE, t0 + 10000);
    assert.notEqual(a0, a1, 'Earth has turned 10 s later');
    assert.ok(a0 >= 0 && a0 < Math.PI * 2, 'spin angle wraps 0..2π');
    const c0 = cloudDriftAngle(MOON_EARTH_SPIN_RATE, t0);
    assert.ok(c0 > a0, 'clouds lead the ground at the same instant');
    assert.notEqual(c0, cloudDriftAngle(MOON_EARTH_SPIN_RATE, t0 + 10000), 'clouds drift too');
    // Same instant, same angles — deterministic on every phone.
    assert.equal(spinAngle(MOON_EARTH_SPIN_RATE, t0), a0);
  });
});

describe('flag, dust, label', () => {
  it('the flag cloth is segmented and waves at the free edge, pinned at the pole', () => {
    assert.equal(MOON_FLAG_CLOTH.width, 1.15);
    assert.equal(MOON_FLAG_CLOTH.height, 0.65);
    assert.ok(MOON_FLAG_CLOTH.segmentsX >= 12 && MOON_FLAG_CLOTH.segmentsY >= 6, 'enough segments to ripple');
    const geo = new THREE.PlaneGeometry(
      MOON_FLAG_CLOTH.width,
      MOON_FLAG_CLOTH.height,
      MOON_FLAG_CLOTH.segmentsX,
      MOON_FLAG_CLOTH.segmentsY,
    );
    let freeMax = 0;
    for (let k = 0; k < 8; k++) {
      const now = PLANET_CGI_EPOCH_MS + k * 700;
      waveFlag(geo, now, MOON_FLAG_CLOTH.width, MOON_FLAG_CLOTH.amplitude);
      const pos = geo.getAttribute('position');
      const arr = pos.array;
      let poleMax = 0;
      for (let i = 0; i < pos.count; i++) {
        const x = geo.userData.flagBase[i * 3];
        const z = Math.abs(arr[i * 3 + 2]);
        if (x < -0.5) poleMax = Math.max(poleMax, z);
        if (x > 0.5) freeMax = Math.max(freeMax, z);
      }
      assert.ok(poleMax < 0.005, `pole edge pinned at t+${k * 700}ms`);
    }
    assert.ok(freeMax > 0.02, 'free edge waves');
    assert.ok(freeMax <= MOON_FLAG_CLOTH.amplitude + 1e-9, 'wave never exceeds its amplitude');
  });

  it('dust motes stay inside the landing-site box', () => {
    const field = makeDustField(MOON_DUST_FIELD);
    assert.equal(field.geometry.getAttribute('position').count, MOON_DUST_FIELD.count);
    const { width, height, depth, yBase } = MOON_DUST_FIELD;
    for (let k = 0; k < 6; k++) {
      updateDustField(field, PLANET_CGI_EPOCH_MS + k * 5000);
      const arr = field.geometry.getAttribute('position').array;
      for (let i = 0; i < MOON_DUST_FIELD.count; i++) {
        // Drift is ±0.55 sideways, ±0.28 vertical (see motion.js).
        assert.ok(Math.abs(arr[i * 3]) <= width / 2 + 0.55 + 1e-6, 'motes stay in the box (x)');
        assert.ok(arr[i * 3 + 1] >= yBase - 0.28 - 1e-6 && arr[i * 3 + 1] <= yBase + height + 0.28 + 1e-6, 'motes stay in the box (y)');
        assert.ok(Math.abs(arr[i * 3 + 2]) <= depth / 2 + 0.55 + 1e-6, 'motes stay in the box (z)');
      }
    }
  });

  it('the OLYMPUS label is small and the scene uses the constant', () => {
    assert.ok(MOON_OLYMPUS_LABEL_SIZE <= 0.35, `label is a label, not a billboard (${MOON_OLYMPUS_LABEL_SIZE})`);
    assert.ok(MOON_OLYMPUS_LABEL_SIZE < 0.9, 'smaller than the old screen-filling 0.9');
    assert.ok(moonSceneSrc.includes('fontSize={MOON_OLYMPUS_LABEL_SIZE}'), 'the scene renders the constant, not a literal');
  });
});

// ── Moon photo wrap (Merlin, Nov 15, 2026) ─────────────────────────
// His lunar photograph wraps both Moon spheres — the hub orb and the
// /moon ground (one source of truth: HubMoon makeMoonTexture). The
// photo is a 1170x585 (2:1) equirectangular JPEG; the procedural
// lunar maps stay as the fallback if the photo fails to load. Run:
// node --test tests/moon-cgi.test.mjs

// Minimal JPEG dimension reader (SOF0/SOF2) — no image deps.
function jpegDimensions(buf) {
  assert.equal(buf[0], 0xff);
  assert.equal(buf[1], 0xd8, 'not a JPEG (no SOI marker)');
  let off = 2;
  while (off < buf.length - 1) {
    if (buf[off] !== 0xff) { off += 1; continue; }
    const marker = buf[off + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { off += 2; continue; }
    const len = buf.readUInt16BE(off + 2);
    if (marker === 0xc0 || marker === 0xc2) {
      return { width: buf.readUInt16BE(off + 7), height: buf.readUInt16BE(off + 5) };
    }
    off += 2 + len;
  }
  throw new Error('no SOF marker found in the Moon photo');
}

describe('Moon photo wrap (Merlin\u2019s lunar map)', () => {
  it('the photo exists at the wired path, is a JPEG, 1170x585, exactly 2:1', () => {
    const buf = readFileSync(new URL('../public/images/moon/moon-surface.jpg', import.meta.url));
    assert.equal(buf.length, 325593, 'the photo is Merlin\u2019s file, uncut (325,593 bytes)');
    const { width, height } = jpegDimensions(buf);
    assert.equal(width, 1170, 'photo is 1170 wide');
    assert.equal(height, 585, 'photo is 585 high');
    assert.equal(width, height * 2, 'exactly 2:1 — a proper equirectangular map');
    assert.ok(hubMoonSrc.includes("'/images/moon/moon-surface.jpg'"), 'HubMoon wires this exact path');
  });

  it('makeMoonTexture loads the photo and keeps the procedural maps as fallback', () => {
    assert.ok(hubMoonSrc.includes("planetMaps('lunarRegolith', 'moon')"), 'procedural lunar maps still the fallback');
    assert.ok(hubMoonSrc.includes('MOON_SURFACE_PHOTO_URL'), 'the photo URL is a named constant');
    assert.ok(hubMoonSrc.includes('new THREE.TextureLoader().load('), 'the photo loads through TextureLoader');
    assert.ok(hubMoonSrc.includes('MOON_SURFACE_PHOTO_URL,'), 'the loader loads the named photo URL');
    assert.ok(hubMoonSrc.includes('tex.image = loaded.image'), 'the photo swaps into the shared texture on load');
    assert.ok(hubMoonSrc.includes('photo failed'), 'a failed load keeps the procedural canvas');
    assert.ok(hubMoonSrc.includes("typeof document === 'undefined'"), 'node/prerender stays procedural (no DOM)');
    assert.ok(!hubMoonSrc.includes('CanvasTexture'), 'still no one-off canvas texture');
  });

  it('the photo is north-up on the sphere and the fallback keeps its orientation', () => {
    assert.ok(hubMoonSrc.includes('tex.flipY = false'), 'procedural canvas matches the south-up DataTexture');
    assert.ok(hubMoonSrc.includes('tex.flipY = true'), 'the north-up photo flips to the pole on load');
    assert.ok(hubMoonSrc.includes('tex.colorSpace = THREE.SRGBColorSpace'), 'photo keeps sRGB colour like the procedural map');
  });

  it('both Moon spheres still share the one source of truth', () => {
    assert.ok(moonSceneSrc.includes("makeMoonTexture } from './HubMoon'"), '/moon ground still shares HubMoon makeMoonTexture');
    assert.ok(moonSceneSrc.includes('map={moonMaps.map}'), 'the ground sphere renders the shared map');
    assert.ok(hubMoonSrc.includes('useMemo(makeMoonTexture, [])'), 'the hub orb renders the shared map');
    assert.ok(hubMoonSrc.includes('<sphereGeometry args={[MOON_RADIUS, 48, 32]}'), 'hub orb is a sphere — the equirect wrap is correct');
    assert.ok(moonSceneSrc.includes('<sphereGeometry args={[MOON_RADIUS, 64, 48]}'), '/moon ground is a sphere too — the same wrap is correct there');
  });

  it('the shadow-realm moon disc is deliberately untouched', () => {
    const shadowSrc = readFileSync(new URL('../app/shadow-realm/scene.jsx', import.meta.url), 'utf8');
    assert.ok(shadowSrc.includes('function moonTexture()'), 'the shadow disc keeps its own texture');
    assert.ok(!shadowSrc.includes('MOON_SURFACE_PHOTO_URL'), 'the shadow disc does not take the Moon photo');
    assert.ok(!shadowSrc.includes('moon-surface.jpg'), 'the shadow disc is not re-wrapped');
  });
});

// ── Flag photos + pole + Earth click (Merlin, Nov 15, 2026) ───────────
// His gold-Omega-on-silver photograph wraps the flag cloth (both
// sides, Omega upright on both) and his scratched-gold photograph
// wraps the flag pole (light reflecting: metalness 1.0, roughness
// 0.18, night Environment). The flag moves with the Moon's wind.
// Clicking the Earth in the /moon sky opens the Earth menu (the
// hub's Earth chooser) via the existing ?enter=earth deep link.

const moonPageSrc = readFileSync(new URL('../app/moon/page.jsx', import.meta.url), 'utf8');
const hubPageSrc = readFileSync(new URL('../app/page.jsx', import.meta.url), 'utf8');

describe('flag photos (Omega cloth, gold pole)', () => {
  it('the Omega flag photo exists at the wired path: JPEG, 1170x653, 1.792', () => {
    const buf = readFileSync(new URL('../public/images/moon/flag-omega.jpg', import.meta.url));
    assert.equal(buf.length, 375835, 'the flag photo is Merlin’s file, uncut (375,835 bytes)');
    const { width, height } = jpegDimensions(buf);
    assert.equal(width, 1170, 'flag photo is 1170 wide');
    assert.equal(height, 653, 'flag photo is 653 high');
    assert.ok(Math.abs(width / height - 1.792) < 0.001, 'aspect 1.792 — a 1.3% squeeze onto the 1.769 cloth');
    assert.ok(moonSceneSrc.includes("'/images/moon/flag-omega.jpg'"), 'MoonScene wires this exact path');
  });

  it('the pole shares the ONE gold file: JPEG, 1170x653, 1.792, no second copy', () => {
    const buf = readFileSync(new URL('../public/textures/gold/gold-scratched.jpg', import.meta.url));
    assert.equal(buf.length, 400196, 'the gold file is Merlin’s upload, uncut (400,196 bytes)');
    const { width, height } = jpegDimensions(buf);
    assert.equal(width, 1170, 'gold photo is 1170 wide');
    assert.equal(height, 653, 'gold photo is 653 high');
    assert.ok(Math.abs(width / height - 1.792) < 0.001, 'aspect 1.792');
    assert.ok(moonSceneSrc.includes('GOLD_TEXTURE_URL'), 'MoonScene wires the shared GOLD_TEXTURE_URL');
    assert.ok(moonSceneSrc.includes("from '@/lib/portal/gold-texture'"), 'the URL comes from the arch gold module — one source of truth');
    assert.ok(!existsSync(new URL('../public/images/moon/flag-pole-gold.jpg', import.meta.url)), 'no second copy of the 400 KB gold file');
    assert.ok(!moonSceneSrc.includes('flag-pole-gold'), 'MoonScene no longer references the deleted duplicate path');
  });

  it('the flag cloth wears the photo on both sides, gold fallback until it lands', () => {
    assert.ok(moonSceneSrc.includes('FLAG_OMEGA_PHOTO_URL'), 'the flag photo URL is a named constant');
    assert.ok(moonSceneSrc.includes('new THREE.TextureLoader().load('), 'the photos load through TextureLoader');
    assert.ok(moonSceneSrc.includes("side={THREE.DoubleSide}"), 'the cloth is double-sided — both sides show the Omega');
    assert.ok(moonSceneSrc.includes("map={flagTex ?? undefined}"), 'the cloth takes the photo when it lands');
    assert.ok(moonSceneSrc.includes("color={flagTex ? '#ffffff' : '#ffd700'}"), 'plain gold until the photo lands, true colour after');
    assert.ok(moonSceneSrc.includes('photo failed'), 'a failed load keeps the plain-colour fallback');
    assert.ok(moonSceneSrc.includes("typeof document === 'undefined'"), 'node/prerender loads nothing (no DOM)');
  });

  it('the pole wears the gold photo and is light reflecting', () => {
    assert.ok(moonSceneSrc.includes('GOLD_TEXTURE_URL'), 'the pole loads the shared gold URL');
    assert.ok(moonSceneSrc.includes("map={poleTex ?? undefined}"), 'the pole takes the photo when it lands');
    assert.ok(moonSceneSrc.includes("metalness={poleTex ? 1.0 : 0.8}"), 'metalness 1.0 with the photo (0.8 silver fallback)');
    assert.ok(moonSceneSrc.includes("roughness={poleTex ? 0.18 : 0.4}"), 'roughness 0.18 with the photo (0.4 fallback)');
    assert.ok(moonSceneSrc.includes('tex.repeat.set(1, 8)'), 'the wrap repeats (1, 8) — near-square scratches on the thin pole');
    assert.ok(moonSceneSrc.includes('<Environment preset="night" />'), 'the night Environment gives the metal something to reflect');
    assert.ok(moonSceneSrc.includes('<Suspense fallback={null}>'), 'the Environment suspends alone — a slow HDR fetch never blanks the Moon');
  });

  it('the flag moves with the wind, not a fixed loop', () => {
    assert.ok(moonSceneSrc.includes('moonWind'), 'the scene reads the Moon wind');
    assert.ok(moonSceneSrc.includes('moonWind(now)'), 'the wave is driven by the live wind each frame');
    assert.ok(moonSceneSrc.includes('waveFlag(flagGeo, now, MOON_FLAG_CLOTH.width, MOON_FLAG_CLOTH.amplitude, moonWind(now))'), 'the cloth wave takes the wind');
  });
});

describe('clicking Earth lands on Earth on foot (Merlin, Nov 15, 2026 — planet-hopping)', () => {
  it('the Moon-sky Earth mesh is clickable with a pointer cursor', () => {
    assert.ok(moonSceneSrc.includes('onEarthClick'), 'EarthInSky takes an onEarthClick prop');
    assert.ok(moonSceneSrc.includes('onClick: (e) => { e.stopPropagation(); onEarthClick(); }'), 'clicking Earth fires the callback');
    assert.ok(moonSceneSrc.includes("document.body.style.cursor = 'pointer'"), 'hovering Earth shows a pointer (the hub PlanetBody pattern)');
    assert.ok(moonSceneSrc.includes('<EarthInSky onEarthClick={onEarthClick} />'), 'the scene passes the callback into the sky Earth');
  });

  it('the Moon page hops straight to the Earth walk — no menu, no hub detour', () => {
    assert.ok(moonPageSrc.includes("travel('/earth-walk', 'Earth')"), 'the Earth click travels to /earth-walk via the vortex');
    assert.ok(moonPageSrc.includes('onEarthClick={goEarthWalk}'), 'the page passes the Earth-walk trip into the scene');
    assert.ok(!moonPageSrc.includes("travel('/?enter=earth'"), 'the Moon page no longer detours through the Earth menu');
  });

  it('the hub opens its Earth chooser on ?enter=earth — no new param, no hub change', () => {
    assert.ok(hubPageSrc.includes("get('enter') === 'earth'"), 'the hub reads the ?enter=earth deep link');
    assert.ok(hubPageSrc.includes('beginEarthDive()'), 'the deep link dives to Earth');
    assert.ok(hubPageSrc.includes('setShowEarthChooser(true)'), 'the dive opens the chooser');
    assert.ok(hubPageSrc.includes('Choose your Earth'), 'the chooser offers Earth 1/2/3/4');
  });
});

describe('moon phone fixes (Merlin, Nov 15, 2026 — from his /moon video)', () => {
  it('the move stick is really on screen, bottom-left, level with JUMP', () => {
    // The stick was bare in flow after the full-height canvas — it
    // rendered below the viewport, so no phone ever showed it.
    const stickAt = moonPageSrc.indexOf('<WalkJoystick');
    assert.ok(stickAt > 0, 'the Moon page renders the WalkJoystick');
    const wrapAt = moonPageSrc.lastIndexOf("position: 'absolute'", stickAt);
    assert.ok(wrapAt > 0 && stickAt - wrapAt < 200, 'the stick rides an absolutely-positioned wrapper');
    assert.ok(moonPageSrc.includes('left: 18, bottom: 96'), 'the stick is parked bottom-left, level with JUMP');
    assert.ok(moonPageSrc.includes('moveRef.current = { x, y }'), 'the stick drives the same moveRef the keys use');
    assert.ok(moonSceneSrc.includes('moveRef.current.y'), 'the rig reads the stick into forward walk');
    assert.ok(moonSceneSrc.includes('moveRef.current.x'), 'the rig reads the stick into strafe');
    assert.ok(moonPageSrc.includes('aria-label="Jump"'), 'the JUMP button stays as-is');
  });

  it('the landing pad is gone — no disc, no gold ring, no pad in the hint', () => {
    assert.ok(!moonSceneSrc.includes('circleGeometry'), 'no regolith disc left in the Moon scene');
    assert.ok(!moonSceneSrc.includes('ringGeometry'), 'no gold ring left in the Moon scene');
    assert.ok(!moonSceneSrc.includes('#5f5f5f'), 'the disc grey is gone with the pad');
    assert.ok(!moonPageSrc.includes('landing pad'), 'the hint no longer points at a pad');
    assert.ok(moonSceneSrc.includes('MOON_SPAWN_FEET'), 'the walker still spawns at the same spot');
    assert.ok(moonSceneSrc.includes('MOON_LANDING_FEET'), 'the landing site (dust + flag) still anchors there');
  });

  it('the flag cloth remounts when the Omega photo lands, so the map is really on it', () => {
    // three.js only recompiles a material when material.version
    // changes; assigning .map after first render does not bump it
    // and R3F v8 never sets needsUpdate — the map was silently
    // ignored and the cloth stayed plain white on his phone.
    assert.ok(moonSceneSrc.includes("key={flagTex ? 'flag-photo' : 'flag-plain'}"), 'the cloth remounts when the photo lands');
    assert.ok(moonSceneSrc.includes('map={flagTex ?? undefined}'), 'the cloth takes the photo when it lands');
    assert.ok(moonSceneSrc.includes('side={THREE.DoubleSide}'), 'the Omega reads from both sides');
    assert.ok(moonSceneSrc.includes("key={poleTex ? 'pole-photo' : 'pole-plain'}"), 'the pole remounts the same way — its map had the same latent bug');
  });
});

// ── Moon round 2/3 (Merlin, Nov 15, 2026 — from his /moon videos) ──
// Roam the whole Moon: the walker was never clamped in physics, but
// the far side was bare grey — rocks + pebbles now cover the whole
// sphere. And the camera, round 3: round 2's fixed rad/px value
// turned only ~60° per full-width swipe, so looking around took
// full swipes across the screen. The turn is now a fraction of the
// screen — one full-width swipe turns 180°, a half-screen swipe
// 90° — with a faster ease (20/s) so the camera tracks the finger.

describe('moon round 2/3 — roam the whole Moon, normal camera', () => {
  it('the drag-to-look is normal: screen-fraction turn, damped, no old value left', () => {
    assert.ok(!moonSceneSrc.includes('0.004'), 'the old twitchy rad/px value is gone from the scene');
    assert.ok(!moonSceneSrc.includes('MOON_LOOK_SENSITIVITY'), 'the old fixed-sensitivity alias is gone from the scene');
    assert.ok(!moonSceneSrc.includes('0.0015'), 'the old round-2 value is gone from the scene');
    assert.ok(moonSceneSrc.includes('lookTurnForDrag'), 'the rig turns by screen fraction');
    assert.ok(moonSceneSrc.includes('MOON_LOOK_PITCH_MAX'), 'the pitch clamp is the named constant');
    assert.ok(moonSceneSrc.includes('dampLookAngle,'), 'the ease helper is imported from lib/moon');
    assert.ok(moonSceneSrc.includes('yawTarget'), 'the drag sets a yaw target');
    assert.ok(moonSceneSrc.includes('pitchTarget'), 'the drag sets a pitch target');
    assert.ok(moonSceneSrc.includes('dampLookAngle(yaw.current, yawTarget.current'), 'the yaw eases toward its target each frame');
    assert.ok(moonSceneSrc.includes('dampLookAngle(pitch.current, pitchTarget.current'), 'the pitch eases toward its target each frame');
  });

  it('rocks and pebbles cover the whole Moon in the scene', () => {
    assert.ok(moonSceneSrc.includes('globalRockPlacements'), 'the scene imports the global rock scatter');
    assert.ok(moonSceneSrc.includes('globalPebblePlacements'), 'the scene imports the global pebble scatter');
    assert.ok(moonSceneSrc.includes('useMemo(globalRockPlacements, [])'), 'the global rocks are memoised like the pad rocks');
    assert.ok(moonSceneSrc.includes('globalRocks.map'), 'the global rocks render');
    assert.ok(moonSceneSrc.includes('globalPebbles.map'), 'the global pebbles render');
    assert.ok(moonSceneSrc.includes("material={i % 2 ? rockMatB : rockMatA}"), 'the global scatter uses the shared rock material');
  });

  it('the walker is never reset or clamped — moonLandingState runs once, at spawn', () => {
    const inits = moonSceneSrc.split('moonLandingState()').length - 1;
    assert.equal(inits, 1, 'the walker state is created once (spawn) and never re-created mid-walk');
    assert.ok(!moonSceneSrc.includes('walker.current = moonLandingState'), 'nothing re-spawns the walker');
  });

  it('the landing-site scatter still comes from lib/moon, unchanged', () => {
    assert.ok(moonSceneSrc.includes('rockPlacements'), 'the pad rocks come from lib/moon');
    assert.ok(moonSceneSrc.includes('pebblePlacements'), 'the pad pebbles come from lib/moon');
    assert.ok(!moonSceneSrc.includes('function rockPlacements()'), 'the placement functions moved out of the scene');
    assert.ok(!moonSceneSrc.includes('function pebblePlacements()'), 'the pebble function moved out of the scene too');
  });
});
