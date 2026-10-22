// Aethelgard motion-controls regression guard.
// Field report (2026-10-21, iPhone): after interacting with an exhibit,
// "motion controls go away" — the user could not detach or move.
// Root cause, established by elimination: the desktop path is healthy
// (mouse drags orbit fine after focus + panel close, verified live), but
// on touchscreens two things stacked up in walk/fly mode:
//  1. three-stdlib's OrbitControls sets touch-action: none on the canvas
//     while connected — and restores 'auto' when it disposes, which is
//     exactly what happens when the mode leaves 'orbit'. With 'auto',
//     the browser claims canvas drags as page scroll, so drag-look (the
//     FirstPerson rig's only look input) never receives its gestures.
//  2. Walk/fly had NO touch movement input at all: movement keys are
//     keyboard-only (WASD/Space/C), so on a phone there was no way to
//     translate, only (broken) look.
// Fixes pinned here: the stage canvas carries touch-action: none in ALL
// modes via page CSS, and TouchControls gives walk/fly a stick (plus
// up/down hold buttons in fly) writing into the same inputRef.keys the
// keyboard fills. The FirstPerson rig additionally remounts per mode so
// each mode starts from its own spawn pose with clean listeners.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const scene = readFileSync(new URL('../components/aethelgard/RainforestScene.jsx', import.meta.url), 'utf8');
const page = readFileSync(new URL('../app/aethelgard/page.jsx', import.meta.url), 'utf8');

test('stage canvas keeps touch-action none in every mode', () => {
  assert.match(page, /\.argus \.stage canvas \{ touch-action: none; \}/);
});

test('first-person rig remounts per movement mode', () => {
  assert.match(scene, /<FirstPerson key=\{mode\} inputRef=\{inputRef\} fly=\{mode === 'fly'\} \/>/);
});

test('first-person spawn reset still runs on mount', () => {
  assert.match(scene, /pos\.current\.set\(10, fly \? 14 : EYE, 26\)/);
});

test('touch controls exist and write the shared movement keys', () => {
  assert.match(scene, /function TouchControls\(\{ inputRef, fly \}\)/);
  assert.match(scene, /inputRef\.current\.keys\[name\] = v/);
  assert.match(scene, /setKey\('fwd', dy < -T\); setKey\('back', dy > T\);/);
  assert.match(scene, /setKey\('left', dx < -T\); setKey\('right', dx > T\);/);
});

test('touch controls clear every key on release and unmount', () => {
  assert.match(scene, /const onUp = \(e\) => \{ if \(activeId\.current === e\.pointerId\) \{ activeId\.current = null; clearStick\(\); \} \};/);
  assert.match(scene, /useEffect\(\(\) => \(\) => \{ clearStick\(\); setKey\('up', false\); setKey\('down', false\); \}, \[\]\);/);
});

test('fly gets hold-to-rise and hold-to-sink buttons', () => {
  assert.match(scene, /aria-label="Fly up" \{\.\.\.holdBtn\('up'\)\}/);
  assert.match(scene, /aria-label="Fly down" \{\.\.\.holdBtn\('down'\)\}/);
  assert.match(scene, /mode !== 'orbit' && <TouchControls inputRef=\{inputRef\} fly=\{mode === 'fly'\} \/>/);
});

test('orbit controls and the exhibit focus path are intact', () => {
  assert.match(scene, /<OrbitControls ref=\{orbitRef\} makeDefault/);
  assert.match(scene, /onClick=\{\(e\) => \{ e\.stopPropagation\(\); onHotspot\(h\.id\); \}\}/);
  assert.match(scene, /<FocusRig focusReq=\{focusReq\} orbitRef=\{orbitRef\} \/>/);
});
