// app/middle-earth/tests/controls.test.mjs — the 2026-10-25
// phone-control fixes, from the video QA (Mordor, "The Black Gate").
//
// Pure-function tests for the camera + compass math and the orc hunt
// marker; source-level pins for the JSX wiring, because no test
// renders page.jsx (the house's known gate gap — the on-phone feel
// verdict stays Merlin's). The source pins exist so a future edit
// cannot silently reintroduce the dead joystick or the
// pointerdown strike.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as THREE from 'three';

import { goalArrowDeg } from '../goal-compass.js';
import { followCameraPose } from '../../../lib/world/follow-camera.js';
import { createOrc, buildOrcFigure } from '../orcs.js';
import { labelOpacity } from '../../star-wars/characters.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const pageSrc = readFileSync(path.join(HERE, '../page.jsx'), 'utf8');
const joystickSrc = readFileSync(path.join(HERE, '../../../components/world/WalkJoystick.jsx'), 'utf8');

/* ---- fix 8: the goal compass ---- */
test('goal arrow: ahead is 0, right is +90, behind is 180, left is -90', () => {
  // facing north (yaw 0); goal offsets are goal-minus-walker
  assert.equal(Math.round(goalArrowDeg(0, -1, 0)), 0); // due north, ahead
  assert.equal(Math.round(goalArrowDeg(1, 0, 0)), 90); // due east, right
  assert.equal(Math.round(goalArrowDeg(0, 1, 0)), 180); // due south, behind
  assert.equal(Math.round(goalArrowDeg(-1, 0, 0)), -90); // due west, left
  assert.equal(Math.round(goalArrowDeg(1, -1, 0)), 45); // north-east diagonal
});

test('goal arrow: turning the walker turns the arrow the other way', () => {
  // facing east is yaw -PI/2 (forward = (-sin yaw, -cos yaw)); a goal
  // due east is then dead ahead, not 90 degrees off
  assert.equal(Math.round(goalArrowDeg(1, 0, -Math.PI / 2)), 0);
  // facing south (yaw PI) with the goal north: directly behind
  assert.equal(Math.round(goalArrowDeg(0, -1, Math.PI)), 180);
});

/* ---- fix 7: the follow camera never dollies with pitch ---- */
/* Round 2 corrects the sign this test pinned: pitch + looks UP (the
 * walk-controls contract — drag up raises pitch). Round 1 asserted
 * the opposite, which is why dragging up aimed down on the phone. */
test('follow camera: pitch moves the look target, never the height', () => {
  const flat = () => 0;
  const level = followCameraPose({ x: 0, z: 95, yaw: 0, pitch: 0, headY: 1.7, groundHeight: flat });
  const pitched = followCameraPose({ x: 0, z: 95, yaw: 0, pitch: 0.8, headY: 1.7, groundHeight: flat });
  assert.equal(pitched.cy, level.cy);
  assert.ok(pitched.lookY > level.lookY, 'pitch up raises the look target');
  assert.equal(level.cy, 1.7 + 1.7, 'camera rides 1.7 m above the head');
  assert.equal(level.cz, 95 + 5.2, 'camera trails 5.2 m behind (facing north, behind is +z)');
  assert.equal(level.lookZ, 95 - 4, 'look target sits 4 m ahead');
});

test('follow camera: a hill under the camera still lifts it', () => {
  const pose = followCameraPose({ x: 0, z: 95, yaw: 0, pitch: 0.8, headY: 1.7, groundHeight: () => 100 });
  assert.equal(pose.cy, 100.6, 'terrain clamp beats the pitch-free height');
});

/* ---- fix 9: the orc hunt marker ---- */
test('orc hunt marker: shows far away, hides up close, hides when dead', () => {
  const orc = createOrc({ kind: 'warrior', x: 0, z: 0, id: 1 });
  const fig = buildOrcFigure(THREE, orc);
  const marker = fig.group.getObjectByName('orc-hunt-marker');
  assert.ok(marker, 'the figure carries a hunt marker');
  assert.equal(marker.material.fog, false, 'the marker ignores fog so it reads at range');
  fig.update(0, 0.016, 95);
  assert.equal(marker.visible, true, 'visible at 95 m, where the body is a few pixels');
  fig.update(0, 0.016, 10);
  assert.equal(marker.visible, false, 'hidden up close, where the body reads fine');
  orc.state = 'dead';
  fig.update(0, 0.016, 95);
  assert.equal(marker.visible, false, 'never marks a corpse');
});

/* ---- fix 5: why the own tag used to show forever ---- */
test('label law: the 5.2 m follow camera sits inside the fade ramp', () => {
  assert.ok(labelOpacity(5.2) > 0, 'at the follow distance the old tag was partly on');
  assert.equal(labelOpacity(60), 0, 'past the far fade the tag is gone');
});

/* ---- source pins for the JSX wiring (no test renders the page) ---- */
test('pin: the joystick is wired with onMove, never onChange', () => {
  assert.ok(joystickSrc.includes('function WalkJoystick({ onMove'), 'joystick reads onMove');
  assert.ok(pageSrc.includes('<WalkJoystick onMove={onJoy}'), 'page passes onMove');
  assert.ok(!pageSrc.includes('onChange={onJoy}'), 'the dead onChange wiring is gone');
  assert.ok(pageSrc.includes('styles.stickWrap'), 'the stick is parked in its own wrap');
});

test('pin: strikes fire on tap-release, never on touch-down', () => {
  assert.ok(pageSrc.includes('onTap: () => onTap()'), 'drag-look carries the strike as onTap');
  assert.ok(!pageSrc.includes("canvas.addEventListener('pointerdown', onTap)"), 'no pointerdown strike left');
  assert.ok(pageSrc.includes('strikeRef.current()'), 'the Strike button calls the zone strike');
  assert.ok(pageSrc.includes('Tap the world to strike'), 'the first-entry hint is present');
});

test('pin: touch jump/sprint and the tucked mission card', () => {
  assert.ok(pageSrc.includes('touchRef.current.jump = true'), 'a Jump button feeds the walker');
  assert.ok(pageSrc.includes('touchRef.current.sprint = true'), 'a Sprint button feeds the walker');
  assert.ok(pageSrc.includes('missionHudCollapsed'), 'the mission card can tuck');
  // Round 2: the tuck is driven by the mission clock, not a one-shot
  // timer — the round-1 timer never landed in real play (the full
  // card stayed up for a whole 3-minute session).
  assert.ok(pageSrc.includes('shouldTuckMissionCard(s, missionHudExpandRef.current)'), 'the clock interval owns the tuck');
  assert.ok(pageSrc.includes('missionHudExpandRef.current = elapsedMirror.current'), 'expanding restarts the re-tuck window');
  assert.ok(pageSrc.includes('hideLabel: true'), 'the own tag is suppressed');
  assert.ok(pageSrc.includes('name: h.name'), 'the player figure carries the hero name');
  assert.ok(pageSrc.includes('followCameraPose({'), 'the frame loop uses the pitch-free camera');
});
