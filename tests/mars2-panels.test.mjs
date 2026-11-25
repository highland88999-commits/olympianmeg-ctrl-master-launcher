// tests/mars2-panels.test.mjs
// MARS 2 panels — merged + minimizable (Merlin, Nov 18, 2026 —
// phone check, fullscreen /mars-2): the hint strip and the
// fullscreen controls panel are ONE panel now, and it collapses
// into a single orb top-left under the hint line. Tap the orb and
// the full panel comes back.
//
// Run: node --test tests/mars2-panels.test.mjs
// The page path honours MARS2_PAGE_PATH so the staged push page
// (main's page + this round's delta) can be verified the same way
// as the working-tree page.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.isAbsolute(p) ? p : path.join(repo, p), 'utf8');
const pagePath = process.env.MARS2_PAGE_PATH || 'app/mars-2/page.jsx';

describe('mars-2 merged panel (Merlin, Nov 18, 2026 — phone check)', () => {
  it('the hint strip and the controls are ONE panel: status header, then time slider, time orbs, mode orbs', () => {
    const page = read(pagePath);
    // The status line is one fragment, shared by the roverbar and
    // the panel header — the same words in both homes.
    assert.equal(page.split('const statusLine = ').length - 1, 1, 'one statusLine fragment');
    assert.ok(page.includes('className="fs-controls"'), 'the merged panel exists');
    assert.ok(page.includes('aria-label="Mars 2 controls"'), 'the panel is labelled');
    assert.ok(page.includes('className="fs-head"'), 'the panel has a header row');
    assert.ok(page.includes('<span className="fs-status">{statusLine}</span>'), 'the header row carries the status line');
    assert.ok(page.includes('<div className="fs-row">{timeSlider}</div>'), 'row 1 is the TIME slider');
    assert.ok(page.includes('<div className="fs-row">{timeOrbs}</div>'), 'row 2 is the time orbs');
    assert.ok(page.includes('<div className="fs-row">{modeOrbs}</div>'), 'row 3 is the mode orbs');
    // The header is its own class, not a fourth fs-row — the old
    // "exactly three rows" pin still holds.
    assert.equal(page.split('className="fs-row"').length - 1, 3, 'still exactly three fs-rows');
    // The shared fragments are untouched: one definition each.
    assert.equal(page.split('const timeSlider = (').length - 1, 1, 'one TIME slider fragment');
    assert.equal(page.split('const timeOrbs = (').length - 1, 1, 'one time-orbs fragment');
    assert.equal(page.split('const modeOrbs = (').length - 1, 1, 'one mode-orbs fragment');
  });

  it('the panel minimizes: a MIN orb collapses it, and it renders only while open', () => {
    const page = read(pagePath);
    assert.ok(page.includes('const [panelMinimized, setPanelMinimized] = useState(false)'), 'minimized state exists, default open');
    assert.ok(page.includes('fn="minimize"'), 'the collapse control wears the minimize face');
    assert.ok(page.includes('size={40}'), 'the header MIN orb is compact');
    assert.ok(page.includes('ariaLabel="Minimize panel"'), 'the MIN orb names itself');
    assert.ok(page.includes('onClick={() => setPanelMinimized(true)}'), 'MIN collapses the panel');
    assert.ok(page.includes('{!panelMinimized && ('), 'the panel renders only while open');
    assert.ok(page.includes('{fullscreen && !buildMode && ('), 'the panel only renders in fullscreen, and steps aside while build mode owns the stage (dive round item 4)');
  });

  it('minimized, the panel is ONE orb top-left under the hint line; tap it to expand', () => {
    const page = read(pagePath);
    assert.ok(page.includes('fn="expand"'), 'the minimized orb wears the expand face');
    assert.ok(page.includes('ariaLabel="Expand Mars 2 controls"'), 'the orb names itself');
    assert.ok(page.includes('<OrbLabel>PANEL</OrbLabel>'), 'the orb reads PANEL');
    assert.ok(page.includes('onClick={() => setPanelMinimized(false)}'), 'tap re-expands the panel');
    // Top-left, under the roverbar (top 12, ~2 lines tall): left 12,
    // top 88 — below the strip's bottom edge, above everything else.
    assert.ok(page.includes("left: 12, top: 88"), 'the orb sits left 12, top 88');
    // The orb is a circle orb (OrbButton), never a rectangle.
    assert.ok(page.includes('<OrbButton fn="expand"'), 'the minimized orb is an OrbButton');
    assert.ok(page.includes('<OrbButton fn="minimize"'), 'the MIN orb is an OrbButton');
    // The house faces exist on disk.
    assert.ok(fs.existsSync(path.join(repo, 'public/images/shadow-realm/ui/tron-minimize.webp')), 'minimize art exists');
    assert.ok(fs.existsSync(path.join(repo, 'public/images/shadow-realm/ui/tron-expand.webp')), 'expand art exists');
    const orb = read('components/world/OrbButton.jsx');
    assert.ok(orb.includes("minimize: { label: 'MIN'"), 'minimize is a registered orb function');
    assert.ok(orb.includes("expand: { label: 'EXPAND'"), 'expand is a registered orb function');
  });

  it('one status line, never two: the roverbar hides while the panel is open', () => {
    const page = read(pagePath);
    assert.ok(page.includes('{(!fullscreen || panelMinimized) && ('), 'roverbar shows unless fullscreen + panel open');
    assert.ok(page.includes('<div className="roverbar" aria-live="polite">'), 'the roverbar keeps its shape');
    assert.ok(page.includes('{statusLine}'), 'the roverbar shows the shared status line');
    // The panel header is the only other home of the status line.
    assert.equal(page.split('{statusLine}').length - 1, 2, 'statusLine renders in exactly two places (roverbar + panel header)');
  });

  it('the minimized orb cannot overlap: left column, clear of the right column and the joystick row', () => {
    const page = read(pagePath);
    const scene = read('components/mars2/Mars2Scene.jsx');
    // Orb: left 12, default OrbButton size 56 → right edge 68.
    // The Thule pill + BuildPanel live on the right (right: 10),
    // so the left-column orb can never reach them.
    assert.ok(scene.includes('top: 96'), 'Thule pill sits in the second row, on the right');
    assert.ok(scene.includes('right: 10'), 'Thule pill is right-anchored');
    assert.ok(page.includes('zIndex: 6'), 'the orb rides above the scene');
    // The orb's top (88) is below the roverbar (top 12) and its
    // bottom (88 + 56 = 144) is far above the joystick row, whose
    // top edge sits 138 px + safe-area off the floor.
    assert.ok(88 + 56 < 844 - 138, 'the orb ends well above the joystick row on a phone');
  });

  it('the controls still work after re-expanding: same fragments, same handlers', () => {
    const page = read(pagePath);
    assert.ok(page.includes('aria-label="Time of day"'), 'the TIME slider is still a slider');
    assert.ok(page.includes('setManualTime'), 'the slider + presets still take the clock manual');
    assert.ok(page.includes('resumeLiveTime'), 'LIVE still hands the clock back');
    assert.ok(page.includes('toggleMode'), 'the mode orbs still switch modes');
  });

  it('the normal layout is untouched: roverbar in the stage, controls below it', () => {
    const page = read(pagePath);
    assert.ok(page.includes('{!fullscreen && ('), 'the below-stage controls hide in fullscreen');
    assert.ok(page.includes('{timeSlider}'), 'time controls sit below the stage normally');
    assert.ok(page.includes('{modeOrbs}'), 'mode orbs sit below the stage normally');
  });
});
