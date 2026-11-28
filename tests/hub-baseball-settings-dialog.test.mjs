// tests/hub-baseball-settings-dialog.test.mjs
// Headless tests for fix 1 of the hub-video-fixes round (Merlin's
// Nov 27 ~06:10 phone video, f003): the 56 px 3D baseball SWING orb
// (bottom-right, z-[70]) painted over the right edge of the Settings
// sheet (z-[62]) while Settings was open — and stayed tappable
// through the sheet's backdrop, so a stray tap would start a flight
// behind the sheet.
//
// The fix: the sheet announces open/close on the house window bus
// ('olympus:concourse-settings' with { open }); the hub page hears
// it and stands both baseball orbs down while the sheet is open.
// SWING returns the moment the sheet closes — same button, same
// onClick. The sheet's open state lives in components/Concourse.jsx,
// which the hub page cannot read directly, so the event is the
// bridge (same convention as the tilt events this panel already
// dispatches).
//
// MERGE NOTE (push 2, Nov 27 ~18:15): head fb78cef5 (baseball-button
// push b09cb083) already carries this fix and adds the always-visible
// SWING orb — the gate now lives in the baseballSwingVisible /
// baseballQuitVisible consts in app/page.jsx (no baseballNear gate
// on SWING any more), so the two orb assertions below pin the consts
// rather than an inline gate. Behaviour pinned is unchanged: both
// orbs stand down while the sheet is open.
//
// Run: node --test tests/hub-baseball-settings-dialog.test.mjs (from the repo root).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const page = readFileSync(join(repo, 'app', 'page.jsx'), 'utf8');
const panel = readFileSync(join(repo, 'components', 'ConcourseSettings.jsx'), 'utf8');

// The event name, as written in each file — the two must agree, or
// the page never hears the sheet.
function eventName(src) {
  const m = src.match(/'olympus:concourse-settings'/);
  return m ? m[0] : null;
}

describe('the overlap, in numbers (why hiding is the fix, not moving)', () => {
  it('at a 390 px phone viewport the orb and the sheet overlap in both axes', () => {
    // Sheet panel: w-[min(340px,88vw)] centred → 340 wide at 390 vw,
    // spanning x 25–365. Orb: right 18, 56 wide → x 316–372.
    const vw = 390;
    const panelW = Math.min(340, 0.88 * vw);
    const panelLeft = (vw - panelW) / 2;
    const panelRight = panelLeft + panelW;
    const orbRight = vw - 18;
    const orbLeft = orbRight - 56;
    assert.ok(orbLeft < panelRight, `orb left ${orbLeft} must reach into the panel (right ${panelRight})`);
    assert.ok(orbRight > panelRight, `orb right ${orbRight} must cross the panel edge`);
    assert.equal(Math.round(panelRight - orbLeft), 49, '49 px of the 56 px orb sits over the panel');
    // Vertically: orb bottom 80, 56 tall → spans (H-136)–(H-80);
    // the sheet is max-h 82dvh centred, so it covers that band at
    // every phone height (its top is 9dvh, its bottom 91dvh).
    const h = 844;
    assert.ok(h - 136 > 0.09 * h && h - 80 < 0.91 * h, 'orb band sits inside the sheet band');
  });

  it('the orb paints above the sheet, so geometry alone cannot save it', () => {
    assert.ok(page.includes('z-[70]'), 'SWING orb is z-[70]');
    assert.ok(panel.includes('z-[62]'), 'sheet is z-[62]');
    // At phone widths the sheet spans almost the whole screen, so
    // no bottom-right spot clears it — hiding is the fix.
    assert.ok(panel.includes('w-[min(340px,88vw)]'), 'sheet width pins the phone geometry');
  });
});

describe('the sheet announces itself (ConcourseSettings.jsx)', () => {
  it('dispatches the event with { open } whenever open changes', () => {
    assert.ok(panel.includes("const SETTINGS_DIALOG_EVENT = 'olympus:concourse-settings'"), 'event named once');
    assert.ok(
      panel.includes('new CustomEvent(SETTINGS_DIALOG_EVENT, { detail: { open: !!open } })'),
      'open state dispatched in the detail'
    );
    assert.ok(panel.includes('}, [open ]);'), 'effect re-runs on open change');
  });

  it('reports closed if it unmounts while open, so listeners never strand chrome hidden', () => {
    assert.ok(
      panel.includes("new CustomEvent(SETTINGS_DIALOG_EVENT, { detail: { open: false } })"),
      'unmount cleanup dispatches closed'
    );
  });
});

describe('the hub page hears it and stands the orbs down (app/page.jsx)', () => {
  it('listens for the same event name the sheet dispatches', () => {
    assert.equal(eventName(page), eventName(panel), 'page and panel agree on the event name');
    assert.ok(page.includes("window.addEventListener('olympus:concourse-settings'"), 'listener attached');
    assert.ok(page.includes("window.removeEventListener('olympus:concourse-settings'"), 'listener removed on unmount');
    assert.ok(page.includes('setSettingsDialogOpen(!!e?.detail?.open)'), 'open flag follows the detail');
  });

  it('SWING stands down while the sheet is open', () => {
    // Gate lives in the visibility const (head fb78cef5: SWING is
    // always-visible in freeroam, no baseballNear gate any more).
    assert.ok(
      page.includes("const baseballSwingVisible = (user || cloudOffline) && appState === 'hub_freeroam' && !showEarthVehicleSelect && !settingsDialogOpen;"),
      'SWING visibility const includes !settingsDialogOpen'
    );
    assert.ok(page.includes('{(baseballSwingVisible) && ('), 'SWING renders under the visibility const');
    assert.ok(page.includes('onClick={swingBaseball}'), 'SWING keeps its tap handler — it works when no dialog is open');
  });

  it('QUIT stands down too — same spot, same z-[70]', () => {
    assert.ok(
      page.includes("const baseballQuitVisible = (user || cloudOffline) && appState === 'baseball_flight' && !settingsDialogOpen;"),
      'QUIT visibility const includes !settingsDialogOpen'
    );
    assert.ok(page.includes('{(baseballQuitVisible) && ('), 'QUIT renders under the visibility const');
    assert.ok(page.includes('onClick={quitBaseballFlight}'), 'QUIT keeps its tap handler');
  });

  it('the flight HUD pill is NOT gated — it sits under the sheet (z-[60]) and never overlaps it', () => {
    assert.ok(
      page.includes("{(user || cloudOffline) && appState === 'baseball_flight' && (\n        <div className=\"absolute top-5"),
      'HUD pill keeps its ungated render'
    );
  });
});
