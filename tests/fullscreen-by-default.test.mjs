// tests/fullscreen-by-default.test.mjs — fullscreen by default on
// Jupiter 2, Earth 2, Earth 3 and Earth 4 (Merlin, Nov 24 dive round
// item 3: "Jupiter 2, Earth 2, Earth 3, and Earth 4 should all load
// fullscreen by default").
//
// What "fullscreen" means here: it is NOT the native Fullscreen API
// — no page calls requestFullscreen (the native helper
// lib/use-fullscreen.js is used only by Shadow Realm). The house
// mechanism, since Nov 16, is a React state: the world stage becomes
// a fixed inset-0 overlay (z-80, 100dvh) with an EXIT orb at the very
// top right and Escape to leave. Mounting fullscreen by default is
// therefore an initial-state change (useState(true)), not a gesture:
// nothing needs a tap, nothing is faked, and there is no first-tap
// arming to pin — the browser blocks nothing, because the browser is
// never asked.
//
// Per world:
//   · Jupiter 2 (app/jupiter-2/page.jsx) — stage mounts fullscreen;
//     the world itself mounts on page load (no menu gate); EXIT /
//     Escape drops back to the boxed stage with the TIME controls
//     and the WALK/ORBIT toggle below it.
//   · Earth 2 (app/earth-2/page.jsx) — ALREADY fullscreen: the
//     Earth2World root is a fixed inset-0 z-[80] overlay, mounted
//     when `walking` turns true (tap to walk from the chamber). No
//     toggle exists on this page; the world mounts fullscreen once
//     entered, which is exactly the order.
//   · Earth 3 IS /new-earth (app/new-earth/page.jsx) — there is no
//     app/earth-3 route; the hub's Earth 3 chooser navigates to
//     /new-earth (app/page.jsx chooseEarth3). Stage mounts
//     fullscreen; the tile CLAIM bar and landmark chips below the
//     stage are reachable after EXIT.
//   · Earth 4 (app/earth-4/page.jsx) — stage mounts fullscreen;
//     the place bar (HERE / HOME) below the stage is reachable
//     after EXIT.
//
// Static source analysis (same pattern as
// tests/fullscreen-planets.test.mjs); the headless probe measures
// the mounted stage rect live.
// Run: node --test tests/fullscreen-by-default.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');

const j2 = readFileSync(join(repo, 'app', 'jupiter-2', 'page.jsx'), 'utf8');
const e2page = readFileSync(join(repo, 'app', 'earth-2', 'page.jsx'), 'utf8');
const e2world = readFileSync(join(repo, 'components', 'earth2', 'Earth2World.jsx'), 'utf8');
const e3 = readFileSync(join(repo, 'app', 'new-earth', 'page.jsx'), 'utf8');
const e4 = readFileSync(join(repo, 'app', 'earth-4', 'page.jsx'), 'utf8');
const hub = readFileSync(join(repo, 'app', 'page.jsx'), 'utf8');
const core = readFileSync(join(repo, 'components', 'world', 'ControlsCore.jsx'), 'utf8');

describe('fullscreen by default — the three toggle pages mount fullscreen', () => {
  it('Jupiter 2, Earth 3 and Earth 4 initialise fullscreen to true', () => {
    for (const [name, src] of [['jupiter-2', j2], ['earth-3 (/new-earth)', e3], ['earth-4', e4]]) {
      assert.ok(
        src.includes('const [fullscreen, setFullscreen] = useState(true)'),
        `${name}: mounts fullscreen by default`,
      );
      assert.ok(!src.includes('const [fullscreen, setFullscreen] = useState(false)'), `${name}: no boxed default left`);
    }
  });

  it('the fullscreen stage is the fixed inset-0 overlay, still conditional so EXIT returns to the boxed stage', () => {
    for (const [name, src] of [['jupiter-2', j2], ['earth-3 (/new-earth)', e3], ['earth-4', e4]]) {
      assert.ok(src.includes('fullscreen ?'), `${name}: the fixed style is conditional on the state`);
      assert.ok(
        src.includes('position: "fixed", inset: 0') || src.includes("position: 'fixed', inset: 0"),
        `${name}: the stage goes fixed inset-0`,
      );
      assert.ok(src.includes('zIndex: 80'), `${name}: the fullscreen stage sits at z-80`);
      assert.ok(src.includes('height: "100dvh"'), `${name}: the fullscreen stage is a full viewport tall`);
    }
  });

  it('an EXIT orb renders in the fullscreen state on every page, and Escape exits', () => {
    // Jupiter 2 carries its own orb; Earth 3 / Earth 4 wear the
    // shared core, so the label lives in ControlsCore.jsx.
    assert.ok(j2.includes('ariaLabel="Exit fullscreen"'), 'jupiter-2: an exit orb in the fullscreen branch');
    assert.ok(core.includes("ariaLabel={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}"), 'core: EXIT label in the fullscreen branch');
    assert.ok(e3.includes('onToggleFullscreen') && e4.includes('onToggleFullscreen'), 'earth-3 / earth-4: the core toggle is wired');
    for (const [name, src] of [['jupiter-2', j2], ['earth-3 (/new-earth)', e3], ['earth-4', e4]]) {
      assert.ok(src.includes('"Escape"'), `${name}: Escape is handled`);
      assert.ok(src.includes('setFullscreen(false)'), `${name}: Escape drops back to the boxed stage`);
    }
  });

  it('the fullscreen orb stays at the very top right (circle orb controls law)', () => {
    // Jupiter 2's own orb: absolute, 12 px off the top-right corner.
    assert.ok(j2.includes("style={{ position: 'absolute', right: 12, top: 12, zIndex: 9 }}"), 'jupiter-2: fullscreen orb absolute top-right of the stage');
    // The shared core's orb: absolute, 14 px off the top-right corner.
    assert.ok(core.includes("style={{ position: 'absolute', right: 14, top: 14, zIndex: 9"), 'core: fullscreen orb absolute top-right of the stage');
    // Both orbs are OrbButtons (plain circles), not rectangles.
    assert.ok(j2.includes('OrbButton ariaLabel="Enter fullscreen"'), 'jupiter-2: the enter control is an orb');
    assert.ok(core.includes('<OrbButton fn={fullscreen'), 'core: the fullscreen control is an orb');
  });

  it('no page uses the native Fullscreen API — nothing needs a user gesture, nothing is faked', () => {
    // The house mechanism is the fixed overlay, not the API, so
    // there is no gesture requirement to work around and no
    // first-tap arming: the stage is fullscreen on first paint.
    for (const [name, src] of [['jupiter-2', j2], ['earth-2', e2page], ['earth-3 (/new-earth)', e3], ['earth-4', e4]]) {
      assert.ok(!src.includes('requestFullscreen'), `${name}: no requestFullscreen call`);
      assert.ok(!src.includes('exitFullscreen'), `${name}: no exitFullscreen call`);
      assert.ok(!src.includes('fullscreenElement'), `${name}: no fullscreenElement read`);
    }
    assert.ok(!e2world.includes('requestFullscreen'), 'Earth2World: no requestFullscreen call');
  });
});

describe('Earth 2 — already fullscreen, no change needed', () => {
  it('Earth2World mounts as a fixed inset-0 overlay above the chamber', () => {
    assert.ok(e2world.includes('fixed inset-0 z-[80]'), 'Earth2World root is fixed inset-0 at z-80');
  });

  it('the world mounts fullscreen once entered — walking is the entry, and the world only renders then', () => {
    assert.ok(e2page.includes('{walking && ('), 'earth-2: the world renders only once walking');
    assert.ok(e2page.includes('<Earth2World'), 'earth-2: the mounted world is Earth2World');
    // The chamber/menu underneath is the entry, not a boxed world:
    // the world itself has no boxed state to default out of.
    assert.ok(!e2page.includes('fullscreen'), 'earth-2: no fullscreen toggle state on the page at all');
  });
});

describe('Earth 3 resolves to /new-earth — no app/earth-3 route exists', () => {
  it('there is no app/earth-3 route directory in this tree', () => {
    assert.ok(!existsSync(join(repo, 'app', 'earth-3')), 'no app/earth-3 route dir');
  });

  it("the hub's Earth 3 chooser navigates to /new-earth", () => {
    assert.ok(hub.includes("window.location.href = '/new-earth'"), 'hub chooseEarth3 goes to /new-earth');
  });

  it('the Earth 3 world lives in app/new-earth/page.jsx', () => {
    assert.ok(e3.includes('New Earth'), 'new-earth: the Earth 3 page');
    assert.ok(e3.includes('createWorld'), 'new-earth: the world mounts on page load');
  });
});

describe('the below-stage controls still exist — reachable after EXIT (documented trade-off)', () => {
  it('Jupiter 2 keeps its TIME controls and WALK/ORBIT toggle below the stage', () => {
    assert.ok(j2.includes('aria-label="Time of day"'), 'jupiter-2: TIME slider still on the page');
    assert.ok(j2.includes('ariaLabel="Walk"') || j2.includes('ariaLabel={mode === "walk" ? "Walking" : "Walk"}'), 'jupiter-2: WALK toggle still on the page');
    assert.ok(j2.includes('ariaLabel="Orbit"') || j2.includes('ariaLabel={mode === "orbit" ? "Orbiting" : "Orbit"}'), 'jupiter-2: ORBIT toggle still on the page');
  });

  it('Earth 3 keeps its tile CLAIM bar and landmark chips below the stage', () => {
    assert.ok(e3.includes('Claim this tile'), 'new-earth: CLAIM still on the page');
    assert.ok(e3.includes('ne-chips'), 'new-earth: landmark chips still on the page');
  });

  it('Earth 4 keeps its HERE / HOME place-bar buttons below the stage', () => {
    assert.ok(e4.includes('ariaLabel="Go to where I am"'), 'earth-4: HERE still on the page');
    assert.ok(e4.includes('ariaLabel="Go to Redwater"'), 'earth-4: HOME still on the page');
  });
});
