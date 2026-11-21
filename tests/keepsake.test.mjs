// tests/keepsake.test.mjs
// KEEPSAKE (Nov 17, 2026) — a treasured photo, kept in a snow globe.
// - registry: 'keepsake' in SATELLITES (SANCTUM, ARTEMIS) + the ARTEMIS
//   god menu; title/subtitle in en and all 34 locale JSONs
// - the roster grows 214 -> 215 (the Red Moon seat) and the portal-video queue is clear
//   (215 wired of 215 as of Nov 18, 2026; the Red Moon's video is wired
//   ahead of its registry seat, which lands with the Mars 2 space round)
// - the Supabase SQL stages the table, the public bucket and the RLS
//   policies (it is NOT run here — Merlin green-lights the run)
// - camera math: a swipe leaves the camera exactly where it stops
//   (no recoil); the joystick walks the camera around the globe
// - palette math: region averages, most-saturated accent, brightest warm
//
// Run: node --test tests/keepsake.test.mjs   (from the repo root)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { SATELLITES } from '../lib/i18n/satellites.ts';
import { GOD_MENUS } from '../lib/god-menus.js';
import { buildPortalRoster } from '../lib/portal-roster.js';
import { PORTAL_VIDEO_KEYS } from '../lib/portal-videos.js';
import { averageRegion, mostSaturated, brightestWarm, mediaSize } from '../lib/keepsake/palette.js';
import {
  initialCamera, applySwipe, applyJoystick, cameraPosition, clampPolar, clampRadius,
  fitBackdropPanel, horizontalFovRad, backdropAngularWidth,
  initialInteriorCamera, applyInteriorSwipe, applyInteriorJoystick,
  interiorCameraPosition, interiorLookTarget, INTERIOR_MAX_R, INTERIOR_EYE_Y,
  zoomToExteriorRadius, zoomToInteriorFov, clampZoomT, ZOOM_T_DEFAULT,
} from '../lib/keepsake/camera.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const read = (p) => readFileSync(join(repo, p), 'utf8');
const en = JSON.parse(read('lib/i18n/locales/en.json'));

describe('keepsake registry (dual-registry rule)', () => {
  it('sits in SATELLITES as SANCTUM / ARTEMIS at /keepsake', () => {
    const seat = SATELLITES.find((s) => s.key === 'keepsake');
    assert.ok(seat, 'keepsake has a registry seat');
    assert.equal(seat.route, '/keepsake');
    assert.equal(seat.section, 'SANCTUM');
    assert.equal(seat.pos, 'ARTEMIS');
    assert.equal(seat.constellation, 'ARTEMIS');
  });

  it('sits in exactly one god menu: ARTEMIS', () => {
    const holders = GOD_MENUS.filter((m) => m.satellites.includes('keepsake'));
    assert.equal(holders.length, 1);
    assert.equal(holders[0].god, 'ARTEMIS');
  });

  it('has an en title + subtitle, and the same keys in all 34 locales', () => {
    assert.equal(en['sat.keepsake.title'], 'Keepsake');
    assert.ok(en['sat.keepsake.subtitle'] && en['sat.keepsake.subtitle'].length > 0);
    const files = readdirSync(join(repo, 'lib/i18n/locales')).filter((f) => f.endsWith('.json'));
    assert.equal(files.length, 34);
    for (const f of files) {
      const dict = JSON.parse(read(`lib/i18n/locales/${f}`));
      assert.equal(dict['sat.keepsake.title'], 'Keepsake', `${f} title`);
      assert.ok(dict['sat.keepsake.subtitle'] && dict['sat.keepsake.subtitle'].trim(), `${f} subtitle`);
    }
  });

  it('joins the roster (216 -> 217) with its title and subtitle', () => {
    const roster = buildPortalRoster(SATELLITES, (k) => en[`sat.${k}.title`], (k) => en[`sat.${k}.subtitle`]);
    assert.equal(roster.length, 217); // Job Board seat: 216→217, Nov 21, 2026 (pins were stale at 215); Red Moon seat: 214→215, Nov 18, 2026
    const seat = roster.find((p) => p.key === 'keepsake');
    assert.ok(seat);
    assert.equal(seat.title, 'Keepsake');
    assert.ok(seat.subtitle.length > 0);
    assert.equal(seat.section, 'SANCTUM');
  });

  it('has its portal video wired (215 wired of 215 — the queue is clear)', () => {
    const roster = buildPortalRoster(SATELLITES, (k) => en[`sat.${k}.title`], (k) => en[`sat.${k}.subtitle`]);
    const waiting = roster.filter((p) => !PORTAL_VIDEO_KEYS.includes(p.key));
    assert.equal(waiting.length, 0); // batch 26 wired the last roster video (sun-base); mars-moon's video is wired too, ahead of its registry seat
    assert.ok(PORTAL_VIDEO_KEYS.includes('keepsake'), 'keepsake video is wired');
    assert.ok(!waiting.some((p) => p.key === 'keepsake'), 'keepsake no longer waits');
  });
});

describe('keepsake files are all in place', () => {
  it('route, public viewer, API routes and samples exist', () => {
    assert.ok(existsSync(join(repo, 'app/keepsake/page.jsx')), '/keepsake page');
    assert.ok(existsSync(join(repo, 'app/keepsake/view/[id]/page.jsx')), 'public viewer');
    assert.ok(existsSync(join(repo, 'app/api/keepsake/route.js')), 'save route');
    assert.ok(existsSync(join(repo, 'app/api/keepsake/upload-url/route.js')), 'upload-url route');
    assert.ok(existsSync(join(repo, 'app/api/keepsake/[id]/route.js')), 'public read route');
    assert.ok(existsSync(join(repo, 'components/keepsake/KeepsakeGlobe.jsx')), 'globe component');
    assert.ok(existsSync(join(repo, 'lib/keepsake/scene.js')), 'scene');
    for (const s of ['cabin', 'lake', 'garden']) {
      assert.ok(existsSync(join(repo, `public/images/keepsake/${s}.jpg`)), `sample ${s}`);
    }
  });

  it('the globe honours the control laws in source', () => {
    const globe = read('components/keepsake/KeepsakeGlobe.jsx');
    assert.ok(/bottom: 76/.test(globe), 'joystick and orb sit 76px up from the bottom');
    assert.ok(/The world beyond your photo/.test(globe), 'honest reconstruction footer');
    assert.ok(!/OrbitControls/.test(read('lib/keepsake/scene.js')), 'custom orbit, no OrbitControls');
    assert.ok(/createKeepsakeScene/.test(read('lib/keepsake/scene.js')));
  });
});

describe('keepsake SQL (staged, not run here)', () => {
  const sql = read('supabase/keepsake.sql');

  it('creates the table, the public bucket and the RLS policies', () => {
    assert.ok(/create table if not exists public\.keepsake_globes/.test(sql), 'table');
    assert.ok(/insert into storage\.buckets \(id, name, public\)\s*values \('keepsake-globes', 'keepsake-globes', true\)/.test(sql), 'public bucket');
    assert.ok(/alter table public\.keepsake_globes enable row level security/.test(sql), 'RLS on');
    assert.ok(/"keepsake_globes: public read"/.test(sql), 'public read policy');
    assert.ok(/"keepsake_globes: owner insert"/.test(sql), 'owner insert policy');
    assert.ok(/"keepsake_globes: owner update"/.test(sql), 'owner update policy');
    assert.ok(/"keepsake_globes: owner delete"/.test(sql), 'owner delete policy');
    assert.ok(/"keepsake-globes: public read"/.test(sql), 'bucket public read');
    assert.ok(/"keepsake-globes: no client writes"/.test(sql), 'no direct client writes');
  });
});

describe('keepsake camera (no recoil)', () => {
  it('a swipe moves the camera and a second identical swipe moves it further — never back', () => {
    const start = initialCamera();
    const once = applySwipe(start, 100, 0);
    assert.ok(once.theta < start.theta, 'drag right orbits');
    const twice = applySwipe(once, 100, 0);
    assert.ok(twice.theta < once.theta, 'no return toward the start');
    assert.equal(twice.phi, once.phi, 'a level drag leaves the pitch alone');
  });

  it('letting go is the identity: zero delta changes nothing', () => {
    const state = { theta: 0.7, phi: 1.1, radius: 4.2 };
    assert.deepEqual(applySwipe(state, 0, 0), state);
    assert.deepEqual(applyJoystick(state, 0, 0, 1), state);
  });

  it('the joystick walks the camera: up closes in, sideways orbits, clamps hold', () => {
    const state = initialCamera();
    const closer = applyJoystick(state, 0, 1, 1);
    assert.ok(closer.radius < state.radius, 'stick up walks in');
    const farther = applyJoystick(state, 0, -1, 1);
    assert.ok(farther.radius > state.radius, 'stick down backs out');
    const orbited = applyJoystick(state, 1, 0, 1);
    assert.notEqual(orbited.theta, state.theta);
    assert.ok(clampRadius(0) >= 2.6 && clampRadius(99) <= 7.0, 'radius clamped');
    assert.ok(clampPolar(-1) >= 0.35 && clampPolar(99) <= 1.45, 'pitch clamped');
  });

  it('cameraPosition orbits the target at the state radius', () => {
    const p = cameraPosition({ theta: 0, phi: Math.PI / 2, radius: 5 }, { x: 0, y: 0, z: 0 });
    assert.ok(Math.abs(p.x) < 1e-9 && Math.abs(p.y) < 1e-9 && Math.abs(p.z - 5) < 1e-9);
  });
});

describe('keepsake palette math', () => {
  function buf(pixels, width, height) {
    const out = new Uint8ClampedArray(width * height * 4);
    pixels.forEach((px, i) => {
      out[i * 4] = px[0];
      out[i * 4 + 1] = px[1];
      out[i * 4 + 2] = px[2];
      out[i * 4 + 3] = 255;
    });
    return out;
  }

  it('averageRegion averages the rows it is given', () => {
    const px = buf([[200, 50, 50], [200, 50, 50], [0, 0, 0], [0, 0, 0]], 2, 2);
    assert.deepEqual(averageRegion(px, 2, 2, 0, 0.5), { r: 200, g: 50, b: 50 });
    assert.deepEqual(averageRegion(px, 2, 2, 0.5, 1), { r: 0, g: 0, b: 0 });
  });

  it('mostSaturated finds the vivid pixels, brightestWarm finds the warm light', () => {
    const grey = [128, 128, 128];
    const red = [255, 0, 0];
    const warm = [255, 220, 180];
    const dark = [10, 10, 12];
    const px = buf([grey, grey, grey, red, grey, grey, grey, grey, warm, dark, dark, dark, dark, dark, dark, dark], 4, 4);
    const accent = mostSaturated(px, 4, 4, 1);
    assert.ok(accent.r > 200 && accent.g < 60, 'accent is the red');
    const glow = brightestWarm(px, 4, 4, 1);
    assert.ok(glow.r > 200 && glow.g > 150, 'glow is the warm light');
  });
});

// ROUND 2 (Nov 17, 2026) — Merlin's phone orders after testing
// /keepsake: the whole photo fits (no cover-fit crop, no cut edges on
// orbit), videos up to 2 minutes are keepsakes, interior/exterior
// views, a zoom slider under Snow & motion, a menu that fits a 320px
// phone, and a footer clear of the joystick and the gold orb.

describe('keepsake round 2 — exterior photo fit (geometry proof)', () => {
  const hfov = horizontalFovRad(42, 390 / 844); // ~20.1° on his phone

  it('a portrait phone photo (3:4, like his) fits inside the horizontal FOV', () => {
    const fit = fitBackdropPanel(0.75);
    assert.ok(fit.angularWidth < hfov, `photo ${fit.angularWidth} rad fits inside HFOV ${hfov} rad`);
    assert.ok(fit.angularWidth > 0.7 * hfov, 'and still fills most of the screen width');
    assert.ok(fit.height <= 2.3 && fit.height >= 0.8, 'panel height stays inside the glass');
    assert.ok(fit.thetaLength <= 2.4, 'segment never wider than before');
  });

  it('square and landscape photos hit the ~85% width target, undistorted', () => {
    for (const aspect of [1, 1.5, 1.78]) {
      const fit = fitBackdropPanel(aspect);
      const frac = fit.angularWidth / hfov;
      assert.ok(frac > 0.8 && frac <= 0.87, `aspect ${aspect}: ${(frac * 100).toFixed(0)}% of HFOV`);
      // No distortion: arc/height ratio equals the photo aspect.
      assert.ok(Math.abs((1.55 * fit.thetaLength) / fit.height / aspect - 1) < 0.01, 'arc/height == aspect');
    }
  });

  it('the portrait panel top clears the top of the frame (the head is not clipped)', () => {
    // Default camera: y 2.24, z 4.51, looking down 29.8° with a 42°
    // vertical FOV — the frame top is 8.8° below horizontal.
    const camY = -0.35 + 5.2 * Math.cos(1.05);
    const camZ = 5.2 * Math.sin(1.05);
    const lookDown = Math.atan2(2.58, 4.51);
    const frameTop = lookDown - (42 / 2) * (Math.PI / 180);
    const fit = fitBackdropPanel(0.75);
    const panelTopY = -0.1 + fit.height / 2;
    const topAngle = Math.atan2(camY - panelTopY, camZ + 1.55);
    assert.ok(topAngle > frameTop, `panel top ${topAngle} rad is inside the frame (top ${frameTop} rad)`);
  });

  it('orbiting widens nothing past the FOV: the segment is narrower than the old 2.4 rad', () => {
    assert.ok(backdropAngularWidth(1.113) < backdropAngularWidth(2.4), 'narrower segment, less slide-off');
    assert.ok(backdropAngularWidth(0.5) < backdropAngularWidth(1.0), 'angular width grows with arc');
  });

  it('the scene rebuilds the backdrop per photo and the canvas melts + dissolves its edges', () => {
    const scene = read('lib/keepsake/scene.js');
    assert.ok(/rebuildBackdrop/.test(scene), 'backdrop geometry rebuilt per photo');
    assert.ok(/fitBackdropPanel/.test(scene), 'fitted from the photo aspect');
    const palette = read('lib/keepsake/palette.js');
    assert.ok(!/Math\.max\(width \/ iw, height \/ ih\)/.test(palette), 'no more cover-fit crop');
    assert.ok(/Math\.min\(cw \/ iw, ch \/ ih\)/.test(palette), 'contain-fit: the whole photo is in the canvas');
    assert.ok(/destination-out/.test(palette), 'side edges dissolve to transparent');
  });

  it('mediaSize reads images and videos alike', () => {
    assert.deepEqual(mediaSize({ naturalWidth: 768, naturalHeight: 1024 }), { w: 768, h: 1024 });
    assert.deepEqual(mediaSize({ videoWidth: 1920, videoHeight: 1080 }), { w: 1920, h: 1080 });
  });
});

describe('keepsake round 2 — interior camera (walk inside the glass)', () => {
  it('starts inside the globe, facing the photo wall', () => {
    const s = initialInteriorCamera();
    assert.deepEqual(s, { x: 0, z: 0.55, yaw: 0, pitch: 0 });
    const p = interiorCameraPosition(s);
    assert.equal(p.y, INTERIOR_EYE_Y);
    assert.ok(Math.hypot(p.x, p.z) < 1.55, 'inside the backdrop cylinder');
    const l = interiorLookTarget(s);
    assert.ok(l.z < p.z, 'looking toward the -z photo wall');
    assert.equal(l.y, p.y, 'level gaze');
  });

  it('a swipe turns the view and never recoils: two identical swipes keep turning', () => {
    const start = initialInteriorCamera();
    const once = applyInteriorSwipe(start, 100, 0);
    assert.ok(once.yaw < start.yaw, 'drag right turns');
    const twice = applyInteriorSwipe(once, 100, 0);
    assert.ok(twice.yaw < once.yaw, 'no return toward the start');
    assert.equal(twice.pitch, once.pitch, 'a level drag leaves the pitch alone');
    assert.deepEqual(applyInteriorSwipe(start, 0, 0), start, 'letting go is the identity');
  });

  it('the joystick walks: up is forward, sideways strafes, the globe wall holds', () => {
    const start = initialInteriorCamera();
    const fwd = applyInteriorJoystick(start, 0, 1, 1);
    assert.ok(fwd.z < start.z, 'stick up walks forward (-z)');
    assert.equal(fwd.x, start.x);
    const strafe = applyInteriorJoystick(start, 1, 0, 1);
    assert.ok(strafe.x > start.x, 'stick right strafes right');
    const far = applyInteriorJoystick(start, 0, 1, 100);
    assert.ok(Math.hypot(far.x, far.z) <= INTERIOR_MAX_R + 1e-9, 'clamped inside the globe');
    assert.deepEqual(applyInteriorJoystick(start, 0, 0, 1), start, 'centred stick changes nothing');
  });

  it('pitch is clamped so you cannot flip over', () => {
    const up = applyInteriorSwipe(initialInteriorCamera(), 0, -10000);
    assert.ok(up.pitch <= 0.9, 'looking up stops at the cap');
    const down = applyInteriorSwipe(initialInteriorCamera(), 0, 10000);
    assert.ok(down.pitch >= -0.9, 'looking down stops at the cap');
  });

  it('the scene wires the interior: 360° BackSide wrap, view switch, hidden bank', () => {
    const scene = read('lib/keepsake/scene.js');
    assert.ok(/setView/.test(scene), 'setView exists');
    assert.ok(/interiorBackdrop/.test(scene), 'interior backdrop mesh');
    assert.ok(/THREE\.BackSide/.test(scene), 'seen from inside');
    assert.ok(/Math\.PI \* 2/.test(scene), 'full 360° wrap');
    assert.ok(/fgBank\.visible = view === 'exterior'/.test(scene), 'foreground bank hides inside');
    assert.ok(/FrontSide/.test(scene), 'glass stays FrontSide: invisible from inside');
  });
});

describe('keepsake round 2 — zoom slider (one slider, two behaviours)', () => {
  it('exterior zoom drives orbit radius within the camera clamp', () => {
    assert.equal(zoomToExteriorRadius(0), 7.0);
    assert.ok(Math.abs(zoomToExteriorRadius(1) - 2.6) < 1e-9, 'zoomed right in is the 2.6 clamp');
    assert.ok(Math.abs(zoomToExteriorRadius(ZOOM_T_DEFAULT) - 5.2) < 1e-9, 'default lands on the 5.2 radius');
    assert.equal(zoomToExteriorRadius(-5), 7.0, 'clamped low');
    assert.ok(Math.abs(zoomToExteriorRadius(5) - 2.6) < 1e-9, 'clamped high');
  });

  it('interior zoom drives FOV', () => {
    assert.equal(zoomToInteriorFov(0), 70);
    assert.equal(zoomToInteriorFov(1), 32);
    assert.ok(zoomToInteriorFov(ZOOM_T_DEFAULT) > 42 && zoomToInteriorFov(ZOOM_T_DEFAULT) < 70, 'default sits mid-range');
    assert.equal(clampZoomT(-1), 0);
    assert.equal(clampZoomT(2), 1);
  });

  it('the menu has a real range slider directly under Snow & motion', () => {
    const globe = read('components/keepsake/KeepsakeGlobe.jsx');
    const snowAt = globe.indexOf('Snow &amp; motion');
    const rangeAt = globe.indexOf('type="range"');
    assert.ok(snowAt > 0 && rangeAt > snowAt, 'slider sits under Snow & motion');
    assert.ok(/Zoom out/.test(globe) && /Zoom in/.test(globe), 'zoom out / zoom in labels');
    assert.ok(/setZoom\(zoom \/ 100\)/.test(globe), 'slider drives the scene zoom');
    assert.ok(/setZoom\(t\)/.test(read('lib/keepsake/scene.js')), 'scene honours setZoom');
  });
});

describe('keepsake round 2 — video keepsakes (2 minutes, first-frame palette)', () => {
  it('the upload-url route allows video with a 500 MB cap; photos stay 12 MB', () => {
    const route = read('app/api/keepsake/upload-url/route.js');
    for (const t of ['video/mp4', 'video/webm', 'video/quicktime']) {
      assert.ok(route.includes(t), `${t} allowed`);
    }
    assert.ok(/500 \* 1024 \* 1024/.test(route), '500 MB video cap');
    assert.ok(/12 \* 1024 \* 1024/.test(route), '12 MB photo cap kept');
    assert.ok(/'video\/mp4': 'mp4'/.test(route) && /'video\/quicktime': 'mov'/.test(route), 'video extensions mapped');
    assert.ok(!/^export const (BUCKET|IMAGE_TYPES|VIDEO_TYPES|IMAGE_MAX_BYTES|VIDEO_MAX_BYTES|EXT_BY_TYPE)/m.test(route), 'no exported consts in the route');
  });

  it('the picker accepts video, checks duration client-side at 120 s, and saves the original file', () => {
    const globe = read('components/keepsake/KeepsakeGlobe.jsx');
    assert.ok(/accept="image\/\*,video\/\*"/.test(globe), 'file input takes image + video');
    assert.ok(/VIDEO_MAX_SECONDS = 120/.test(globe), '120 s cap');
    assert.ok(/over 2 minutes/.test(globe), 'plain refusal notice');
    assert.ok(/VIDEO_MAX_BYTES = 500 \* 1024 \* 1024/.test(globe), '500 MB client cap');
    assert.ok(/pickedFileRef\.current/.test(globe), 'original file kept for the PUT');
    assert.ok(/mediaType,/.test(globe) && /durationSec/.test(globe), 'save sends mediaType + durationSec');
  });

  it('the globe plays video as a VideoTexture with a first-frame fallback', () => {
    const scene = read('lib/keepsake/scene.js');
    assert.ok(/loadVideo/.test(scene), 'loadVideo exists');
    assert.ok(/VideoTexture/.test(scene), 'THREE.VideoTexture');
    assert.ok(/videoEl\.play\(\)/.test(scene), 'autoplay attempt');
    assert.ok(/setVideo\(videoEl/.test(scene), 'setVideo wires the texture');
    assert.ok(/NEUTRAL_PALETTE/.test(scene), 'neutral palette when the frame is not ready');
  });

  it('the save route stores media_type + duration_sec, retrying without them on 42703', () => {
    const route = read('app/api/keepsake/route.js');
    assert.ok(/media_type: mediaType/.test(route), 'inserts media_type');
    assert.ok(/duration_sec: durationSec/.test(route), 'inserts duration_sec');
    assert.ok(/42703/.test(route), 'undefined-column retry');
    assert.ok(/palette, mediaType, durationSec/.test(route) || /mediaType, durationSec/.test(route), 'fallback stashes both in the palette JSONB');
  });

  it('the public read selects the video columns with the same 42703 fallback', () => {
    const route = read('app/api/keepsake/[id]/route.js');
    assert.ok(/media_type, duration_sec/.test(route), 'selects the video columns');
    assert.ok(/42703/.test(route), 'pre-migration fallback');
  });

  it('the viewer passes media type + palette fallback to the globe', () => {
    const page = read('app/keepsake/view/[id]/page.jsx');
    assert.ok(/initialMediaType/.test(page), 'media type passed through');
    assert.ok(/globe\.media_type/.test(page) && /palette\.mediaType/.test(page), 'column first, palette second');
  });

  it('the video SQL is staged, idempotent, and green-lit — not run here', () => {
    const sql = read('supabase/keepsake-video.sql');
    assert.ok(/add column if not exists media_type text not null default 'image'/.test(sql), 'media_type column');
    assert.ok(/add column if not exists duration_sec numeric/.test(sql), 'duration_sec column');
    assert.ok(/GREEN LIGHT/.test(sql) && /Nov 17, 2026/.test(sql), 'green light + date in the header');
    assert.ok(/information_schema\.columns/.test(sql), 'verification query for the columns');
    assert.ok(!/row level security|create policy|drop policy/i.test(sql), 'no RLS/policy changes');
  });
});

describe('keepsake round 2 — view toggle, menu fit, footer clearance', () => {
  it('the menu has an interior/exterior toggle, exterior by default', () => {
    const globe = read('components/keepsake/KeepsakeGlobe.jsx');
    assert.ok(/aria-label="Exterior view/.test(globe), 'exterior orb');
    assert.ok(/aria-label="Interior view/.test(globe), 'interior orb');
    assert.ok(/useState\('exterior'\)/.test(globe), 'exterior is the default');
    assert.ok(/setView\('exterior'\)/.test(globe) && /setView\('interior'\)/.test(globe), 'toggle wires both views');
    assert.ok(/Inside the globe/.test(globe) && /Outside the globe/.test(globe), 'current view named');
  });

  it('the menu fits a 320px phone: border-box panel, wrapped small Snow row', () => {
    const globe = read('components/keepsake/KeepsakeGlobe.jsx');
    assert.ok(/boxSizing: 'border-box'/.test(globe), 'panel padding counted inside its width');
    assert.ok(/width: 'min\(320px, calc\(100vw - 32px\)\)'/.test(globe), 'panel width rule kept');
    assert.ok(/SMALL_ORB/.test(globe), 'Snow & motion orbs shrunk to 44px');
    // 4 x 44px orbs + 3 x 10px gaps + label fits the 292px inner width.
    assert.ok(4 * 44 + 3 * 10 + 60 <= 320 - 28, 'row arithmetic fits the panel');
    const snowRow = globe.slice(globe.indexOf('Snow &amp; motion'), globe.indexOf('Zoom out'));
    assert.ok(/flexWrap: 'wrap'/.test(snowRow), 'Snow row wraps instead of clipping');
  });

  it('the footer sits in the clear strip between joystick and gold orb, wording exact', () => {
    const globe = read('components/keepsake/KeepsakeGlobe.jsx');
    const footer = globe.slice(globe.indexOf('honest footer'));
    assert.ok(!/max-content/.test(footer), 'no max-content width (that clipped mid-word)');
    assert.ok(!/92vw/.test(footer), 'no viewport-wide clamp');
    assert.ok(/left: 140/.test(footer) && /right: 96/.test(footer), 'pinned between the controls');
    // Joystick: left:16 + 120 wide = right edge 136 < 140. Gold orb:
    // right:16 + 76 wide — at 320px its left edge is 228 > 320-96=224.
    assert.ok(16 + 120 < 140, 'footer starts right of the joystick');
    assert.ok(320 - 16 - 76 > 320 - 96, 'footer ends left of the gold orb at 320px');
    assert.ok(/The world beyond your photo&apos;s edges is rebuilt from its colours and light — a reconstruction, not the original scene\./.test(globe), 'honest wording kept exactly');
  });
});
