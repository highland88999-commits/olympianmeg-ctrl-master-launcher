// Hollow Earth bolt wiring: the page spawns a visible bolt on every ranged
// strike, flies it in the frame loop, and cleans it up on unmount.
// Run: node app/hollow-earth/tests/bolt-wiring.test.mjs (from the repo root).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';

const src = readFileSync('app/hollow-earth/page.jsx', 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '');
const code = strip(src);

test('bolt module imported and bolt spawned on ranged strikes only', () => {
  assert.match(code, /from '\.\/bolt-visual\.js'/);
  assert.match(code, /boltKindFor\(equippedRef\.current, hero\.ranged\.kind\)/);
  assert.match(code, /if \(weaponRef\.current !== 'melee'\)/);
  assert.match(code, /spawnBolt\(endpoint\)/);
});

test('bolt targets nearest hit, else Korus, else max range', () => {
  assert.match(code, /for \(const m of hits\)/);
  assert.match(code, /else if \(korusInRange\)/);
  assert.match(code, /walker\.pos\.x \+ fx \* spec\.range/);
});

test('frame loop flies and fades bolts; cleanup removes stragglers', () => {
  assert.match(code, /b\.mesh\.position\.x \+= b\.vx \* dt/);
  assert.match(code, /b\.mesh\.material\.opacity = Math\.max\(0, b\.life \/ b\.maxLife\)/);
  assert.match(code, /for \(const b of blasts\) \{ try \{ scene\.remove\(b\.mesh\)/);
});
