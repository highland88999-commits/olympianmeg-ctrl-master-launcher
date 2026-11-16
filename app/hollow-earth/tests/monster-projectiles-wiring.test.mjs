// Hollow Earth monster-projectile wiring: ranged monster hits launch
// a visible traveling projectile (damage on arrival) instead of
// dealing instant damage; melee/short-range keep instant damage;
// Korus blasts gain a sky-bolt visual without a timing change.
// Run: node app/hollow-earth/tests/monster-projectiles-wiring.test.mjs (from the repo root).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '');
const zone = strip(readFileSync('app/hollow-earth/zone.js', 'utf8'));
const spawns = strip(readFileSync('app/hollow-earth/spawns.js', 'utf8'));

test('zone imports the projectile manager and updates it per frame', () => {
  assert.match(zone, /from '\.\/monster-projectiles\.js'/);
  assert.match(zone, /createMonsterProjectiles\(R, group/);
  assert.match(zone, /monsterShots\.update\(dt, \{ x: observer\.x, z: observer\.z \}\)/);
});

test('ranged monster hits spawn projectiles instead of instant damage', () => {
  assert.match(zone, /m\.stats\.archetype === 'ranged'/);
  assert.match(zone, /monsterShots\.spawn\(\{/);
  assert.match(zone, /element: m\.stats\.element, dmg: ev\.dmg, fromId: m\.id/);
});

test('melee and short-range hits still deal damage instantly — now carrying the element', () => {
  assert.match(zone, /else if \(ev\.kind === 'hit' && opts\.onPlayerHit\) opts\.onPlayerHit\(ev\.dmg, ev\.from, ev\.archetype, ev\.element\)/);
});

test('projectile arrival carries the element through the zone (flat-damage site D2 closed)', () => {
  assert.match(zone, /onArrive: \(dmg, fromId, element\) => \{ if \(opts\.onPlayerHit\) opts\.onPlayerHit\(dmg, fromId, 'ranged', element\); \}/);
});

test('aura-strike draws a sky-bolt at the player (WS3) — the visual already exists', () => {
  assert.match(zone, /drawStrikeBolt\(ev, observer\.x, observer\.z\)/);
  assert.match(zone, /monsterShots\.skyBolt\(\{/);
});

test('Korus blasts draw a sky-bolt visual; damage call unchanged', () => {
  assert.match(zone, /monsterShots\.skyBolt\(/);
  assert.match(zone, /if \(opts\.onPlayerHit\) opts\.onPlayerHit\(ev\.dmg, 'korus', 'boss'\)/);
  assert.match(spawns, /from: 'korus-shadow', x: at\.x, z: at\.z/);
  assert.match(spawns, /from: 'korus-bolt', x: at\.x, z: at\.z/);
});

test('projectiles dispose with the world', () => {
  assert.match(zone, /monsterShots\.dispose\(\)/);
});
