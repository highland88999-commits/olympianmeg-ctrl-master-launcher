// Circle-orb controls regression guard (Merlin, Nov 16, 2026 —
// STANDING LAW: every control under a game screen is a circle orb,
// never a rectangle; the maximize/fullscreen button sits at the very
// top right OF the game screen).
//
// Corrections pinned here too (Merlin, Nov 16 ~01:10):
//  1. The overlapping pair in the bottom-right orb is the speeder
//     action button and JUMP — "the shoot and jump buttons overlap".
//     The pair in the video is JUMP over BOOST (zoomed frame f_002
//     reads "JUMP" over "BOOST"); no SHOOT control existed in the
//     Jupiter 2 code then. BOOST now parks ABOVE the JUMP orb, each
//     its own circle, one label per orb. The SHOOT orb came later
//     with the speeder blaster (Merlin, Nov 16 ~01:16): its own
//     plain circle LEFT of JUMP, below BOOST, riding only.
//  2. The orbs are PLAIN round buttons, like the existing joystick
//     and JUMP circles — NOT the Earth 1 collectible missile orbs:
//     no glowing orb visuals, no video wraps, no missile-orb styling.
//
// Source-grep tests, the house pattern: the controls are JSX, so
// the guard reads the files the way the other control tests do.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const orb = read('../components/world/OrbButton.jsx');
const j2page = read('../app/jupiter-2/page.jsx');
const j2scene = read('../components/jupiter2/Jupiter2Scene.jsx');
const mars2 = read('../app/mars-2/page.jsx');
const earth3 = read('../app/new-earth/page.jsx');
const earth4 = read('../app/earth-4/page.jsx');
const moon = read('../app/moon/page.jsx');
const earthWalk = read('../app/earth-walk/page.jsx');
const hollow = read('../app/hollow-earth/page.jsx');
const middle = read('../app/middle-earth/page.jsx');
const starwars = read('../app/star-wars/page.jsx');
const hell = read('../app/hell/page.jsx');
const valhalla = read('../app/valhalla/page.jsx');
const erebus = read('../app/erebus/page.jsx');

test('OrbButton is a plain circle: 50% radius, no glow, no video, no missile-orb styling', () => {
  assert.match(orb, /borderRadius: '50%'/);
  assert.match(orb, /export default function OrbButton/);
  assert.match(orb, /export function OrbLabel/);
  // No glow/video/missile-orb styling in the rendered output — the
  // words appear only in the header comment stating the exclusion.
  assert.doesNotMatch(orb, /boxShadow|<video|drop-shadow/);
});

test('Jupiter 2 page has no raw rectangular buttons left; fullscreen lives top-right of the stage', () => {
  assert.doesNotMatch(j2page, /<button/);
  assert.match(j2page, /import OrbButton, \{ OrbLabel \} from "@\/components\/world\/OrbButton"/);
  assert.match(j2page, /ariaLabel="Enter fullscreen"/);
  assert.match(j2page, /ariaLabel="Exit fullscreen"/);
  assert.match(j2page, /position: 'absolute', right: 12, top: 12, zIndex: 9/);
  assert.match(j2page, /<OrbButton ariaLabel="Jump" size=\{76\}/);
});

test('Jupiter 2 fullscreen top row cannot pile up: speeder column top-left, HP orb beside it, hint below the row', () => {
  assert.match(j2scene, /position: 'absolute', left: 12, top: 12, zIndex: 6, display: 'flex', flexDirection: 'column'/);
  assert.match(j2scene, /top: 12, left: 76, zIndex: 6,\n *width: 56, height: 56, borderRadius: '50%'/);
  assert.match(j2scene, /top: 76, left: '50%', transform: 'translateX\(-50%\)',\n *maxWidth: 'calc\(100% - 184px\)'/);
  assert.doesNotMatch(j2scene, /🛸 DISMISS SPEEDER|🛸 SUMMON SPEEDER/);
  assert.match(j2scene, /<OrbLabel>\{riding \? 'DISMISS' : 'SUMMON'\}<\/OrbLabel>/);
});

test('JUMP and the speeder action button never share a corner: BOOST parks above JUMP', () => {
  // JUMP orb: bottom 12, 76 tall — ends at bottom 88. BOOST: bottom 104.
  assert.match(j2scene, /right: 16, bottom: 104, width: 64, height: 64, borderRadius: '50%'/);
  assert.match(j2page, /right: 12, bottom: 12, zIndex: 6/);
});

test('SHOOT orb has its own spot: left of JUMP, below BOOST, riding only, wired to the blaster', () => {
  // SHOOT: right 104–168, bottom 12–76 — 16 px clear of JUMP (right 12–88),
  // below BOOST (bottom 104). One label per orb, never overlapping.
  assert.match(j2scene, /<OrbButton size=\{64\} onClick=\{onShoot\} ariaLabel="Shoot the speeder blaster"/);
  assert.match(j2scene, /position: 'absolute', right: 104, bottom: 12, zIndex: 6/);
  assert.match(j2scene, /\{riding && onShoot && \(/);
  assert.match(j2scene, /<OrbLabel>SHOOT<\/OrbLabel>/);
  // Wired: the scene passes fireBlaster down as onShoot.
  assert.match(j2scene, /<Jupiter2TouchControls inputRef=\{inputRef\} riding=\{riding\} onShoot=\{fireBlaster\} \/>/);
  assert.match(j2scene, /export function Jupiter2TouchControls\(\{ inputRef, riding, onShoot \}\)/);
});

test('Oblivion lever label cannot sit on the JUMP orb: raised and layered under the HUD', () => {
  assert.match(j2scene, /mouthUp\.x \* 8, mouthPoint\.y \+ mouthUp\.y \* 8/);
  assert.match(j2scene, /zIndexRange=\{\[2, 0\]\}/);
});

test('Mars 2 under-screen controls are orbs; JUMP stays a plain circle', () => {
  assert.doesNotMatch(mars2, /<button/);
  assert.match(mars2, /<OrbButton ariaLabel="Jump" size=\{76\} accent="#e07840"/);
  assert.match(mars2, /ariaLabel="Summon rover"/);
  assert.match(mars2, /ariaLabel="Dismount rover"/);
});

test('Earth 3 and Earth 4 fullscreen orbs sit top-right of the stage; HUD buttons are orbs', () => {
  for (const page of [earth3, earth4]) {
    assert.match(page, /position: "absolute", right: 14, top: 14, zIndex: 9/);
    assert.doesNotMatch(page, /⛶ FULLSCREEN/);
    assert.match(page, /ariaLabel="Jump"/);
    assert.match(page, /ariaLabel="Toggle fly"/);
  }
  assert.match(earth3, /ariaLabel="Guided tour"/);
  assert.match(earth3, /ariaLabel="Previous stop"/);
  assert.match(earth4, /ariaLabel="Go to where I am"/);
  assert.match(earth4, /ariaLabel="Go to Redwater"/);
});

test('Moon and Earth-walk back-to-hub controls are orbs', () => {
  for (const page of [moon, earthWalk]) {
    assert.match(page, /<OrbButton accent="#ffd700" onClick=\{goBack\} ariaLabel="Back to hub"/);
    // The only "Back to hub" button text left is the locked gate
    // screen's sign-in button — not a game-screen control. (The
    // other match is the file's pre-existing header comment.)
    assert.equal((page.match(/← Back to hub\n/g) || []).length, 1);
  }
});

test('Hollow Earth and Middle-earth in-world controls are orbs; strike stays a circle', () => {
  assert.match(hollow, /ariaLabel=\{`Mount \$\{mountPrompt\.name\}`\}/);
  assert.match(hollow, /ariaLabel="Dismount"/);
  assert.match(hollow, /ariaLabel=\{`Weapon: \$\{weaponLabel\} — tap to switch weapon`\}/);
  assert.match(hollow, /ariaLabel="Spawn to base — return to The Haven"/);
  assert.match(middle, /ariaLabel=\{`Mount \$\{mountPrompt\.name\}`\}/);
  assert.match(middle, /ariaLabel="Dismount"/);
  assert.match(middle, /ariaLabel="Map"/);
  assert.match(middle, /tap to switch to melee/);
  assert.match(middle, /tap to switch to ranged/);
});

test('Star Wars zone controls are orbs', () => {
  assert.match(starwars, /ariaLabel="Tap to ride"/);
  assert.match(starwars, /ariaLabel="Exit vehicle"/);
  assert.match(starwars, /ariaLabel="Map"/);
});

test('Hell deed controls are orbs in a row, not stacked pills', () => {
  assert.match(hell, /flex flex-row items-center justify-center gap-3/);
  assert.match(hell, /ariaLabel=\{`Cast a soul into the fire — \$\{forgeRateText\(\)\}`\}/);
  assert.match(hell, /ariaLabel=\{`Call Charon — cross for \$\{FERRY_FARE_GOLD\} gold`\}/);
  assert.match(hell, /ariaLabel="Guide this soul to rest"/);
});

test('Realm template: Leave and Info are orbs, no pill text remains', () => {
  assert.match(valhalla, /<OrbButton href="\/" ariaLabel="Leave Valhalla" accent="#ffffff">/);
  assert.match(valhalla, /ariaLabel="Show realm information"/);
  assert.doesNotMatch(valhalla, /← Leave Valhalla/);
  assert.doesNotMatch(valhalla, /ⓘ Info/);
});

test('Erebus in-world controls are orbs', () => {
  assert.match(erebus, /ariaLabel="Toggle autopilot tour"/);
  assert.match(erebus, /ariaLabel="Atlas"/);
  assert.match(erebus, /ariaLabel="Portal — jump to another universe"/);
  assert.match(erebus, /<OrbButton accent="#67e8f9" size=\{72\}/);
});
