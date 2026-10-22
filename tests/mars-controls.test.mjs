// Mars surface controls guard — same hardened pattern as Aethelgard:
// canvas keeps touch-action: none in all modes, the first-person rig
// remounts per mode and clamps walk height to the terrain, the touch
// stick writes the shared movement keys, and creatures are selectable
// by tap/click in every mode.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const scene = readFileSync(new URL('../components/mars/MarsScene.jsx', import.meta.url), 'utf8');
const page = readFileSync(new URL('../app/mars/page.jsx', import.meta.url), 'utf8');

test('stage canvas keeps touch-action none in every mode', () => {
  assert.match(page, /\.mars \.stage canvas \{ touch-action: none; \}/);
});

test('first-person rig remounts per movement mode', () => {
  assert.match(scene, /<FirstPerson key=\{mode\} inputRef=\{inputRef\} fly=\{mode === 'fly'\} groundHeight=\{groundHeight\} \/>/);
});

test('walk clamps to the Martian terrain, fly stays in its band', () => {
  assert.match(scene, /p\.y = groundHeight\(p\.x, p\.z\) \+ EYE;/);
  assert.match(scene, /p\.y = Math\.max\(1\.5, Math\.min\(90, p\.y\)\);/);
  assert.match(scene, /const groundHeight = \(x, z\) => getTerrainHeight\(x, z, profile\);/);
});

test('touch controls exist and write the shared movement keys', () => {
  assert.match(scene, /function TouchControls\(\{ inputRef, fly \}\)/);
  assert.match(scene, /inputRef\.current\.keys\[name\] = v/);
  assert.match(scene, /setKey\('fwd', dy < -T\); setKey\('back', dy > T\);/);
  assert.match(scene, /setKey\('left', dx < -T\); setKey\('right', dx > T\);/);
  assert.match(scene, /mode !== 'orbit' && <TouchControls inputRef=\{inputRef\} fly=\{mode === 'fly'\} \/>/);
});

test('orbit controls and the organism focus path are intact', () => {
  assert.match(scene, /<OrbitControls ref=\{orbitRef\} makeDefault/);
  assert.match(scene, /<FocusRig focusReq=\{focusReq\} orbitRef=\{orbitRef\} \/>/);
  assert.match(scene, /target=\{\[0, 6, 0\]\}/);
});

test('creatures are selectable with propagation stopped', () => {
  assert.match(scene, /onClick=\{\(e\) => \{ e\.stopPropagation\(\); onSelect\(creatureSummary\(c\)\); \}\}/);
});
