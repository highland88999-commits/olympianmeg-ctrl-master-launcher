// tests/hub-baseball-button.test.mjs
// Headless tests for the hub baseball button round (Merlin, Nov 27
// ~14:17, video 41 s): an actual baseball LIVES bottom-right of the
// hub screen, same size as the Concourse button, a real 3D reflective
// baseball — always in hub freeroam, not only near the plate.
//
// The defect, in numbers: the SWING orb gate required `baseballNear`
// (camera within 150 of the plate). At the landing spot the camera is
// ~1000 from the plate, so the button never rendered in freeroam —
// exactly what the video shows (bottom-right empty in every frame).
// Push 1's size (56 px) and 3D-reflectivity claims were TRUE; only
// the visibility gate was wrong.
//
// The fix: drop `baseballNear` from the SWING gate (it lives
// bottom-right always in hub freeroam, signed-in, vehicle sheet
// closed, Settings closed); add the `olympus:concourse-settings`
// gate from the video-fixes round so the always-visible orb hides
// while Settings is open (approved flaw 1 must not regress); the
// tap hint shows in freeroam alongside the orb — the live probe
// (probe-hub-baseball-button.mjs) measures its clearance at 390/320
// in the live locale.
//
// Run: node --test tests/hub-baseball-button.test.mjs (from the repo root).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const page = readFileSync(join(repo, 'app', 'page.jsx'), 'utf8');
const panel = readFileSync(join(repo, 'components', 'ConcourseSettings.jsx'), 'utf8');
const concourse = readFileSync(join(repo, 'components', 'Concourse.jsx'), 'utf8');
const en = JSON.parse(readFileSync(join(repo, 'lib', 'i18n', 'locales', 'en.json'), 'utf8'));

describe('the button is the Concourse icon’s size (56 px)', () => {
  it('the Concourse icon is 56x56 (the reference)', () => {
    assert.ok(concourse.includes('const SIZE = 56'), 'Concourse SIZE is 56');
    assert.ok(concourse.includes('aria-label="Open the Concourse"'), 'Concourse orb labelled');
  });

  it('SWING is 56x56, bottom-right (right 18, bottom 80)', () => {
    const m = page.match(/<button\s+type="button"\s+onClick=\{swingBaseball\}[\s\S]{0,900}?width: 56, height: 56[\s\S]{0,300}?aria-label="Swing at the baseball"/);
    assert.ok(m, 'SWING button renders 56x56 and carries the Swing label');
    assert.ok(page.includes("right: 'calc(env(safe-area-inset-right, 0px) + 18px)'"), 'SWING right 18');
    assert.ok(page.includes("bottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)'"), 'SWING bottom 80');
  });
});

describe('the button lives bottom-right always in hub freeroam', () => {
  it('the SWING gate no longer requires baseballNear', () => {
    const m = page.match(/\{\(baseballSwingVisible\) && \(\s*\n\s*<button[^>]*onClick=\{swingBaseball\}/);
    assert.ok(m, 'SWING gate uses baseballSwingVisible');
    const flag = page.match(/const baseballSwingVisible = ([^\n]+);/);
    assert.ok(flag, 'baseballSwingVisible defined');
    assert.ok(!flag[1].includes('baseballNear'), `SWING condition must not mention baseballNear, got: ${flag[1]}`);
    assert.ok(flag[1].includes('!showEarthVehicleSelect'), 'SWING still stands down while the vehicle sheet is open');
    assert.ok(flag[1].includes('!settingsDialogOpen'), 'SWING stands down while Settings is open');
  });

  it('baseballNear is still wired (the scene still reports proximity) — only the gate dropped it', () => {
    assert.ok(page.includes('const [baseballNear, setBaseballNear] = useState(false)'), 'baseballNear state still declared');
    assert.ok(page.includes('setBaseballNear(!!evt.nearPlate)'), 'scene still reports proximity into it');
  });

  it('the tap still starts the flight from the ball (handler unchanged)', () => {
    assert.ok(page.includes('onClick={swingBaseball}'), 'SWING keeps its tap handler');
  });
});

describe('Settings-hide (video-fixes gate, applied here too)', () => {
  it('the sheet announces itself on the house bus', () => {
    assert.ok(panel.includes("const SETTINGS_DIALOG_EVENT = 'olympus:concourse-settings'"), 'event named once');
    assert.ok(panel.includes('new CustomEvent(SETTINGS_DIALOG_EVENT, { detail: { open: !!open } })'), 'open state dispatched');
    assert.ok(panel.includes('}, [open ]);'), 'effect re-runs on open change');
    assert.ok(panel.includes("new CustomEvent(SETTINGS_DIALOG_EVENT, { detail: { open: false } })"), 'unmount cleanup dispatches closed');
  });

  it('the page hears it and stands both orbs down', () => {
    assert.ok(page.includes("window.addEventListener('olympus:concourse-settings'"), 'listener attached');
    assert.ok(page.includes("window.removeEventListener('olympus:concourse-settings'"), 'listener removed on unmount');
    assert.ok(page.includes('setSettingsDialogOpen(!!e?.detail?.open)'), 'open flag follows the detail');
    const quit = page.match(/\{\(baseballQuitVisible\) && \(\s*\n\s*<button[^>]*onClick=\{quitBaseballFlight\}/);
    assert.ok(quit, 'QUIT gate uses baseballQuitVisible');
    const flag = page.match(/const baseballQuitVisible = ([^\n]+);/);
    assert.ok(flag && flag[1].includes('!settingsDialogOpen'), 'QUIT stands down while Settings is open');
  });
});

describe('the tap hint rides alongside the orb', () => {
  it('the hint gate no longer hides it while the orb is up', () => {
    assert.ok(
      page.includes("{(user || cloudOffline) && appState === 'hub_freeroam' && !showEarthVehicleSelect && (\n        <div className=\"absolute left-1/2"),
      'hint gate has no baseballNear condition'
    );
    assert.ok(
      !page.includes("!showEarthVehicleSelect && !baseballNear && ("),
      'old hint gate (hidden while near the plate) is gone'
    );
  });

  it('the live-locale hint is short enough to clear the orb (geometry the probe measures live)', () => {
    // Orb left edge: vw - 18 (right) - 56 (wide) = vw - 74.
    // Hint is centred: right edge = vw/2 + width/2. Clearance =
    // (vw - 74) - (vw/2 + width/2) = vw/2 - 74 - width/2.
    // En string is 25 chars; frame measurements put the rendered
    // hint at ~156–190 px wide (measurement spread across frames).
    // At 190 px: 390 clears by 26 px, 320 overlaps by 9 px. At
    // 156 px: 390 clears by 43 px, 320 clears by 8 px. The probe
    // measures the real rendered width live at both widths and is
    // the deciding evidence — this test pins the string it measures.
    const hint = en['earth.tapHint'];
    assert.equal(hint, 'Click the Earth to descend', 'en hint text pinned');
    assert.ok(hint.length <= 26, `hint must stay short (got ${hint.length} chars) or the 320 px clearance closes`);
  });
});

describe('the Concourse icon yields while a baseball orb is up', () => {
  it('page announces baseball-orb visibility on the house bus', () => {
    assert.ok(
      page.includes("window.dispatchEvent(new CustomEvent('olympus:hub-baseball-orb', { detail: { visible: baseballOrbVisible } }))"),
      'page must dispatch olympus:hub-baseball-orb with { visible: baseballOrbVisible }'
    );
    assert.ok(
      page.includes('baseballSwingVisible = (user || cloudOffline) && appState === \'hub_freeroam\' && !showEarthVehicleSelect && !settingsDialogOpen'),
      'baseballSwingVisible must be the freeroam SWING condition'
    );
    assert.ok(
      page.includes("baseballQuitVisible = (user || cloudOffline) && appState === 'baseball_flight' && !settingsDialogOpen"),
      'baseballQuitVisible must be the flight QUIT condition'
    );
    assert.ok(
      page.includes('baseballOrbVisible = baseballSwingVisible || baseballQuitVisible'),
      'baseballOrbVisible must be SWING || QUIT'
    );
    assert.ok(page.includes('[baseballOrbVisible]'), 'the announce effect must re-run when baseballOrbVisible changes');
  });

  it('SWING and QUIT gates use the shared baseball visibility flags', () => {
    assert.ok(page.includes('{(baseballSwingVisible) && ('), 'SWING gate must use baseballSwingVisible');
    assert.ok(page.includes('{(baseballQuitVisible) && ('), 'QUIT gate must use baseballQuitVisible');
  });

  it('Concourse listens for the event and lifts 176 px (bike rule untouched)', () => {
    assert.ok(concourse.includes("export const BASEBALL_ORB_EVENT = 'olympus:hub-baseball-orb'"), 'Concourse must export BASEBALL_ORB_EVENT');
    assert.ok(concourse.includes('const [baseballOut, setBaseballOut] = useState(false)'), 'Concourse must track baseballOut');
    assert.ok(concourse.includes('window.addEventListener(BASEBALL_ORB_EVENT, onBaseballOrb)'), 'Concourse must listen for the baseball-orb event');
    assert.ok(concourse.includes('window.removeEventListener(BASEBALL_ORB_EVENT, onBaseballOrb)'), 'Concourse must remove the baseball-orb listener');
    assert.ok(concourse.includes('setBaseballOut(!!e?.detail?.visible)'), 'Concourse must take visible from the event detail');
    assert.ok(
      concourse.includes('const yieldLift = (bikeOut && !orbCustom ? 270 : 0) + (baseballOut && !orbCustom ? 176 : 0)'),
      'yieldLift must add 176 while a baseball orb is up (bike 270 unchanged, both gated on !orbCustom)'
    );
    assert.ok(concourse.includes('(window.innerHeight - 96 - SIZE)'), 'default anchor must stay bottom 96 (the lift is measured from it)');
  });

  it('baseball-orb event name agrees between the page dispatch and the Concourse listener', () => {
    const pageDispatches = page.match(/new CustomEvent\('olympus:hub-baseball-orb'/g) || [];
    const concourseEvents = concourse.match(/olympus:hub-baseball-orb/g) || [];
    assert.equal(pageDispatches.length, 1, `page must dispatch the event once, found ${pageDispatches.length}`);
    assert.equal(concourseEvents.length, 1, `Concourse must name the event once (const), found ${concourseEvents.length}`);
  });
});
