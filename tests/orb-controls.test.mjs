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
import { readFileSync, existsSync } from 'node:fs';

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
const core = read('../components/world/ControlsCore.jsx');

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
  // JUMP is docked (the Hollow Earth mirror, Nov 16 ~02:35): free-
  // floating, draggable, its spot persisting per user — fullscreen
  // stays fixed top-right, never docked.
  assert.match(j2page, /dock\.styleFor\('jump', \{ right: 12, bottom: 88 \}\)/);
  assert.match(j2page, /dock\.bind\('jump'/);
  assert.doesNotMatch(j2page, /dock\.bind\('fullscreen'/);
});

test('Jupiter 2 fullscreen top row cannot pile up: free-floating speeder orbs top-left, HP orb beside them, hint below the row', () => {
  // The top-left column container is GONE (the Hollow Earth mirror,
  // Nov 16 ~02:35): SUMMON / DISMOUNT / TRADE are free-floating
  // docked orbs now, defaulting to the column's old slots.
  assert.doesNotMatch(j2scene, /position: 'absolute', left: 12, top: 12, zIndex: 6, display: 'flex', flexDirection: 'column'/);
  assert.match(j2scene, /dock\.styleFor\('summon', \{ left: 12, top: 12 \}\)/);
  assert.match(j2scene, /dock\.styleFor\('trade', \{ left: 12, top: riding \? 148 : 76 \}\)/);
  assert.match(j2scene, /top: 12, left: 76, zIndex: 6,\n *width: 56, height: 56, borderRadius: '50%'/);
  assert.match(j2scene, /top: 76, left: '50%', transform: 'translateX\(-50%\)',\n *maxWidth: 'calc\(100% - 184px\)'/);
  assert.doesNotMatch(j2scene, /🛸 DISMISS SPEEDER|🛸 SUMMON SPEEDER/);
  assert.doesNotMatch(j2scene, /<OrbLabel>\{riding \? 'DISMISS' : 'SUMMON'\}<\/OrbLabel>/);
  // SUMMON shows on foot only now (Merlin, Nov 16 — the J2 layout):
  // hidden while riding, DISMOUNT is the way off. 8 px label, not
  // OrbLabel's 9 px — SUMMON clipped to "SUMMOI" at 9 px on his phone.
  assert.match(j2scene, /\{!riding && \(/);
  assert.match(j2scene, /fontSize: 8, letterSpacing: 1, lineHeight: 1 \}\}>SUMMON<\/span>/);
});

test('JUMP and the speeder action button never share a corner: BOOST parks above JUMP', () => {
  // JUMP orb moved to bottom 88 (Merlin, Nov 16 — the J2 layout:
  // BACKPACK above it, FIRE below it). BOOST moved with it: right
  // 104, bottom 88 — directly above SHOOT, side by side with JUMP.
  assert.match(j2scene, /orbDock\.styleFor\('boost', \{ right: 104, bottom: 88 \}\)/);
  assert.match(j2page, /dock\.styleFor\('jump', \{ right: 12, bottom: 88 \}\)/);
});

test('SHOOT orb has its own spot: left of JUMP, below BOOST, riding only, wired to the blaster', () => {
  // SHOOT: right 104–168, bottom 12–76 — 16 px clear of JUMP (right 12–88),
  // below BOOST (bottom 104). One label per orb, never overlapping.
  // Docked now (the Hollow Earth mirror): same spot, draggable.
  assert.match(j2scene, /<OrbButton size=\{64\} onClick=/);
  assert.match(j2scene, /ariaLabel="Shoot the speeder blaster"/);
  assert.match(j2scene, /orbDock\.styleFor\('shoot', \{ right: 104, bottom: 12 \}\)/);
  assert.match(j2scene, /orbDock\.bind\('shoot'/);
  assert.match(j2scene, /\{riding && onShoot && \(/);
  assert.match(j2scene, /<OrbLabel>SHOOT<\/OrbLabel>/);
  // Wired: the scene passes fireBlaster down as onShoot, fireOnFoot
  // down as onFire (FIRE orb, walking mode), and panelOpen so the
  // FIRE orb hides while a creature panel is open.
  assert.match(j2scene, /<Jupiter2TouchControls inputRef=\{inputRef\} riding=\{riding\} onShoot=\{fireBlaster\} onFire=\{fireOnFoot\} panelOpen=\{!!selectedId\} orbDock=\{dock\} \/>/);
  assert.match(j2scene, /export function Jupiter2TouchControls\(\{ inputRef, riding, onShoot, onFire, panelOpen, orbDock \}\)/);
});

test('Oblivion lever label cannot sit on the JUMP orb: raised and layered under the HUD', () => {
  assert.match(j2scene, /mouthUp\.x \* 8, mouthPoint\.y \+ mouthUp\.y \* 8/);
  assert.match(j2scene, /zIndexRange=\{\[2, 0\]\}/);
});

test('Mars 2 under-screen controls are orbs; JUMP comes from the universal core', () => {
  assert.doesNotMatch(mars2, /<button/);
  // Universal controls core (Merlin, Nov 16 ~03:49): the standalone
  // 76 px JUMP orb moved into ControlsCore — docked, tron-jump
  // face, 56 px — and the core owns the touch stick too (Mars 2 had
  // none: WASD only). The page keeps the rover summon/dismount.
  assert.match(mars2, /import ControlsCore from "@\/components\/world\/ControlsCore"/);
  assert.match(mars2, /<ControlsCore/);
  assert.match(mars2, /world="mars-2"/);
  assert.match(mars2, /\(\) => \{ jumpRef\.current = true; \}/);
  assert.doesNotMatch(mars2, /<OrbButton ariaLabel="Jump" size=\{76\}/);
  assert.match(mars2, /ariaLabel="Summon rover"/);
  assert.match(mars2, /ariaLabel="Dismount rover"/);
});

test('Earth 3 and Earth 4 fullscreen orbs sit top-right of the stage; HUD buttons are orbs', () => {
  // Universal controls core (Merlin, Nov 16 ~03:49): the fullscreen
  // orb and the JUMP orb moved out of these pages into ControlsCore —
  // the top-right pin is asserted on the core itself, and each page
  // passes its fullscreen state + jump handler in.
  assert.match(core, /position: 'absolute', right: 14, top: 14, zIndex: 9/);
  assert.match(core, /ariaLabel="Jump"/);
  for (const page of [earth3, earth4]) {
    assert.match(page, /import ControlsCore from "@\/components\/world\/ControlsCore"/);
    assert.match(page, /<ControlsCore/);
    assert.match(page, /fullscreen=\{fullscreen\} onToggleFullscreen=/);
    assert.match(page, /onJump=\{mode === "walk" \? \(\) => worldRef\.current && worldRef\.current\.jump\(\) : undefined\}/);
    assert.doesNotMatch(page, /⛶ FULLSCREEN/);
    assert.match(page, /ariaLabel="Toggle fly"/);
    // No bespoke joystick copy left, no standalone JUMP orb.
    assert.doesNotMatch(page, /function Joystick\(/);
    assert.doesNotMatch(page, /ariaLabel="Jump" onPointerDown/);
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
  // Hollow Earth, J2/Mars2 standard (Merlin, Nov 16 WS1): no raw
  // <button> left under the game screen, a fullscreen orb top-right,
  // and a JUMP orb. The menu/map cards and the Korus overlay button
  // are NOT under a game screen, so the no-button assertion is scoped
  // to the world-mode block — and inside it exactly ONE raw <button>
  // remains, the Korus victory overlay's "Back to the map" (Q2, held
  // for Merlin's word on a "Keep hunting" option).
  const hollowWorld = hollow.slice(hollow.indexOf('// ---- world ----'));
  const worldButtons = hollowWorld.match(/<button/g) || [];
  assert.equal(worldButtons.length, 1);
  assert.match(hollowWorld, /Back to the map/);
  assert.match(hollow, /ariaLabel="Enter fullscreen"/);
  assert.match(hollow, /ariaLabel="Exit fullscreen"/);
  assert.match(hollow, /position: 'absolute', right: 12, top: 12, zIndex: 9/);
  // JUMP wears its shared face now (fn="jump"), same tag otherwise.
  assert.match(hollow, /<OrbButton fn="jump" ariaLabel="Jump" size=\{76\}/);
  // Strike is an orb now, not the old raw 36 px button.
  assert.match(hollow, /ariaLabel="Strike"/);
  assert.match(hollow, /<OrbLabel>STRIKE<\/OrbLabel>/);
  // JUMP is wired, not just drawn: Space (consumeJump) or the orb
  // (jumpRef) reaches stepWalker, and a press while mounted is
  // consumed-and-discarded, never a jump off the saddle.
  assert.match(hollow, /const jump = ride \? false : keys\.consumeJump\(\) \|\| jumpRef\.current;/);
  assert.match(hollow, /if \(ride\) \{ keys\.consumeJump\(\); jumpRef\.current = false; \}/);
  // The bottom bar is GONE (Merlin, Nov 16 ~02:30 — WS1 Q4 answered
  // by removal): no pill wrapper holds the orbs in world mode, the
  // four orbs are free-floating in one draggable dock, and the
  // corner lift it forced on JUMP/joystick is gone with it.
  assert.doesNotMatch(hollowWorld, /rounded-full/);
  // The dock lives in the ONE shared module now (Merlin, Nov 16
  // ~02:35 — the Hollow Earth local copy moved to lib/world, and
  // Jupiter 2 uses the same module): same import, same functions.
  assert.match(hollow, /from '@\/lib\/world\/orb-dock'/);
  assert.doesNotMatch(hollow, /from '\.\/orb-dock\.js'/);
  assert.match(hollow, /loadOrbDockPosition/);
  assert.match(hollow, /saveOrbDockPosition/);
  assert.match(hollow, /beginDockDrag/);
  assert.match(hollow, /dockTapGuard/);
  assert.match(hollow, /right: 12, bottom: BOTTOM_CLEAR, zIndex: 6/);
  assert.match(hollow, /left: 12, bottom: BOTTOM_CLEAR, zIndex: 6/);
  // Map and Strike are at opposite ends of the dock column (Map
  // first, Strike last), never next to each other.
  assert.ok(hollow.indexOf('ariaLabel="Map"') < hollow.indexOf('ariaLabel="Strike"'));
  // The Sanctuary/Wilds readout survived the bar's removal — it
  // lives in the HUD row now.
  assert.match(hollowWorld, /⚔️ Wilds/);
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

test('One graphic per button function: every ORB_FUNCTIONS face exists on disk; Hollow Earth orbs wear their fn', () => {
  // The map lives in the shared OrbButton layer: one art file per
  // function, the TRON house style. Every face the map names must
  // exist under public/ — a missing file would silently fall back
  // to bare text (the img hides itself on error).
  const faces = [...orb.matchAll(/art: '(\/images\/shadow-realm\/ui\/tron-[^']+\.webp)'/g)].map((m) => m[1]);
  assert.ok(faces.length >= 70, `expected 70+ faces, got ${faces.length}`);
  // The 8 TRON motion graphics are reused as-is, never redrawn.
  for (const reused of ['tron-boost', 'tron-gas', 'tron-brake', 'tron-steer-left', 'tron-steer-right', 'tron-recenter', 'tron-pause', 'tron-leave']) {
    assert.ok(faces.some((f) => f.endsWith(`${reused}.webp`)), `missing reused TRON face ${reused}`);
  }
  const missing = faces.filter((f) => !existsSync(new URL(`../public${f}`, import.meta.url)));
  assert.deepEqual(missing, []);
  // Hollow Earth (the realm in focus) wears its faces: 14 orbs, one
  // fn each, no orb left on its old emoji.
  const hollowWorld = hollow.slice(hollow.indexOf('// ---- world ----'));
  for (const fn of ['fullscreen', 'fullscreen-exit', 'jump', 'trade', 'mount', 'dismount', 'buy-shield', 'recharge', 'buy-weapon', 'close', 'map', 'weapon', 'home', 'strike']) {
    assert.match(hollowWorld, new RegExp(`fn="${fn}"`));
  }
  assert.equal((hollowWorld.match(/fn="/g) || []).length, 14);
});
