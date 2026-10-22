// Hub Mars entry + Earth Console scroll-ghost pins (Merlin's video,
// 2026-10-21): tapping the hub's Mars body must dive INTO the planet
// — the seeded surface renders inside the hub Canvas as the
// 'mars_surface' realm, the way Earth works — and the Earth Console
// must keep exactly ONE scroll surface with no backdrop-blur on it
// (iOS Safari ghosts rows when a blurred element scrolls).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const home = readFileSync('components/HomeScene.jsx', 'utf8');
const console_ = readFileSync('components/EarthConsole.jsx', 'utf8');
const page = readFileSync('app/page.jsx', 'utf8');
const marsScene = readFileSync('components/mars/MarsScene.jsx', 'utf8');
const marsConsole = readFileSync('components/MarsConsole.jsx', 'utf8');

test('MarsBackground accepts an onSelect prop', () => {
  assert.match(home, /function MarsBackground\(\{ onSelect \}\)/);
});

test('Mars group delivers taps to onSelect (stopPropagation, gated)', () => {
  assert.match(home, /onClick=\{onSelect \? \(e\) => \{ e\.stopPropagation\(\); onSelect\(\); \} : undefined\}/);
});

test('Mars mount is freeroam-gated and dives via beginMarsDive (no route push)', () => {
  assert.match(home, /<MarsBackground onSelect=\{appState === 'hub_freeroam' \? beginMarsDive : null\} \/>/);
  assert.ok(!home.includes("router.push('/mars')"), 'hub Mars tap must not route away to /mars');
});

test('page owns the mars_surface state and the freeroam-gated dive', () => {
  assert.match(page, /const beginMarsDive = \(\) => \{\s*if \(appState !== 'hub_freeroam'\) return;\s*setAppState\('mars_surface'\);/);
  assert.match(page, /const exitMars = \(\) => \{ setAppState\('hub_freeroam'\); \};/);
  assert.match(page, /const marsProfile = useMemo\(\(\) => generateMarsProfile\(marsSeed\), \[marsSeed\]\);/);
});

test('page mounts MarsConsole only in mars_surface and passes the realm + exit', () => {
  assert.match(page, /appState === 'mars_surface' && \(\s*<MarsConsole/);
  assert.match(page, /onExit=\{exitMars\}/);
  assert.match(page, /beginMarsDive=\{beginMarsDive\}/);
});

test('HomeScene renders MarsRealmContent inside the hub Canvas in mars_surface', () => {
  assert.match(home, /import \{ MarsRealmContent \} from '\.\/mars\/MarsScene';/);
  assert.match(home, /const inMars = appState === 'mars_surface';/);
  assert.match(home, /<MarsRealmContent\s+key=\{marsProfile\.seed\}/);
  assert.match(home, /onSelect=\{onMarsSelect\}/);
});

test('MarsScene exports the realm content and the touch controls', () => {
  assert.match(marsScene, /export function MarsRealmContent\(\{ profile, timeOfDay, mode, inputRef, focusReq, onSelect, selectedId \}\)/);
  assert.match(marsScene, /export function TouchControls\(\{ inputRef, fly \}\)/);
});

test('MarsConsole carries the return-to-orbit exit and the seed/time/mode shell', () => {
  assert.match(marsConsole, /RETURN TO ORBIT/);
  assert.match(marsConsole, /onClick=\{onExit\}/);
  assert.match(marsConsole, /"MARS-" \+ Math\.floor\(1000 \+ Math\.random\(\) \* 9000\)/);
  assert.match(marsConsole, /<TouchControls inputRef=\{inputRef\} fly=\{mode === 'fly'\} \/>/);
});

test('Earth Console card has no backdrop-blur (scroll ghost fix)', () => {
  const code = console_.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
  const cardLine = code.split('\n').find((l) => l.includes('max-h-[70dvh]'));
  assert.ok(cardLine, 'console card line found');
  assert.ok(!cardLine.includes('backdrop-blur'), 'card must not backdrop-blur');
  assert.ok(cardLine.includes('bg-zinc-950/95'), 'card compensates with a solid bg');
});

test('Earth Console has exactly one scroll surface (no nested scrollers)', () => {
  const code = console_.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
  const count = (code.match(/overflow-y-auto/g) || []).length;
  assert.equal(count, 1);
});
