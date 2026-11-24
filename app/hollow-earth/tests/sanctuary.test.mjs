// Phase 2c tests (Merlin, Nov 24 ~10:06): safe zones stationed
// well distanced throughout Hollow Earth, sanctuary behaviour
// inside them, the shared ring graphic on every zone and every
// structure, and the spacing measurement. Pure modules first
// (sanctuary.js, sanctuary-ring.js), then the wiring pins in
// spawns.js / zone.js / page.jsx, then the live stepMonster
// guards. The buildWorld-level ring tests live in
// builders.test.mjs (it owns the mock-THREE world builds).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import {
  SAFE_ZONES, HAVEN_ZONE, SANCTUARY_GOLD,
  isInsideZone, isInSanctuary, sanctuaryAt, isInHaven,
  isInsideAnyRing, ringAt, measureSanctuaryCoverage,
} from '../sanctuary.js';
import {
  RING_BAND_WIDTH_M, RING_VEIL_HEIGHT_M, RING_SEGMENTS,
  ringElementColor, structureRingElement, structureRingRadius,
  sanctuaryRingGeometry,
} from '../sanctuary-ring.js';
import { ELEMENT_AURA } from '../elemental-aura.js';
import { BIOMES } from '../biomes.js';
import {
  MONSTER_TYPES, spawnField, createMonster, stepMonster,
  createKorus, stepKorus, respawnMonster, mulberry32,
  SAFE_BASE, isInBase,
} from '../spawns.js';
import { deckToDir, spherePointFromDeck, SPHERE_R } from '../../../lib/hollow-earth/planet.js';

const rng = () => 0.5;
const alwaysLos = () => true;
function mon(type, x, z, faceYaw = 0) {
  const m = createMonster({ id: `t-${type}-${x}-${z}`, type, element: MONSTER_TYPES[type].element, x, z }, rng);
  m.faceYaw = faceYaw;
  m.active = true;
  return m;
}

// ---- the table ----

test('sanctuary: fourteen zones, The Haven first and unchanged', () => {
  assert.equal(SAFE_ZONES.length, 14, `expected 14 safe zones, found ${SAFE_ZONES.length}`);
  assert.deepEqual(
    { x: SAFE_ZONES[0].x, z: SAFE_ZONES[0].z, r: SAFE_ZONES[0].r, name: SAFE_ZONES[0].name },
    { x: 0, z: 155, r: 28, name: 'The Haven' },
  );
  assert.equal(HAVEN_ZONE, SAFE_ZONES[0]);
  assert.deepEqual(
    { x: SAFE_BASE.x, z: SAFE_BASE.z, r: SAFE_BASE.r, name: SAFE_BASE.name },
    { x: 0, z: 155, r: 28, name: 'The Haven' },
    'spawns.js SAFE_BASE is still The Haven, re-exported from the table',
  );
  for (const z of SAFE_ZONES) {
    assert.ok(Number.isFinite(z.x) && Number.isFinite(z.z) && z.r > 0, `${z.name} has a bad seat`);
    assert.ok(typeof z.name === 'string' && z.name.length > 0, 'every zone is named');
  }
});

test('sanctuary: one zone per habitat band, every element covered', () => {
  const elements = new Set(SAFE_ZONES.map((z) => z.element));
  for (const el of ['acid', 'fire', 'lightning', 'poison', 'shadow', 'sand', 'frost']) {
    assert.ok(elements.has(el), `no safe zone stands in the ${el} band`);
  }
  assert.ok(elements.has('gold'), 'The Haven wears sanctuary gold');
  // Every zone's element is a real band element (or gold, or
  // mountain — whose element biomes.js already says is
  // lightning), never an invented one.
  for (const z of SAFE_ZONES) {
    const ok = z.element === 'gold'
      || BIOMES[z.element]
      || (z.element === 'mountain' && BIOMES.mountain.element === 'lightning');
    assert.ok(ok, `${z.name} carries unknown element ${z.element}`);
  }
});

test('sanctuary: predicates — inside, on the boundary, outside', () => {
  for (const z of SAFE_ZONES) {
    assert.equal(isInSanctuary(z.x, z.z), true, `${z.name} centre must be sanctuary`);
    assert.equal(sanctuaryAt(z.x, z.z).name, z.name, 'sanctuaryAt must name the zone');
    assert.equal(isInsideZone(z.x, z.z + z.r, z), true, 'the boundary itself counts as inside');
    assert.equal(isInsideZone(z.x, z.z + z.r + 0.5, z), false, 'half a metre past the boundary is the wilds');
  }
  // The arrival ground is wilds, and so is Korus's throne —
  // the nearest zone (Acid Hollow) stands 57 m off, outside
  // his 30 m wake distance.
  assert.equal(isInSanctuary(0, 95), false, 'spawn (0,95) is wilds');
  assert.equal(isInSanctuary(-215, 55), false, 'Korus’s throne is wilds, not sanctuary');
  assert.equal(sanctuaryAt(0, 95), null);
  // Haven-only predicate: trade + respawn still mean The Haven.
  assert.equal(isInHaven(0, 155), true);
  assert.equal(isInHaven(-160, 40), false, 'Acid Hollow is sanctuary, not The Haven');
  assert.equal(isInBase(0, 155), true, 'spawns.js isInBase is still Haven-only');
  assert.equal(isInBase(-160, 40), false);
});

test('sanctuary: zones never overlap, and never sit closer than 100 m centre to centre', () => {
  for (let i = 0; i < SAFE_ZONES.length; i++) {
    for (let j = i + 1; j < SAFE_ZONES.length; j++) {
      const a = SAFE_ZONES[i];
      const b = SAFE_ZONES[j];
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      assert.ok(d > a.r + b.r, `${a.name} overlaps ${b.name} (${d.toFixed(0)} m apart)`);
      assert.ok(d >= 100, `${a.name} sits ${d.toFixed(0)} m from ${b.name} — clustered, not well distanced`);
    }
  }
});

test('sanctuary: spacing measurement — worst point 276 m, mean 90 m over the hunted disc', () => {
  const m = measureSanctuaryCoverage();
  assert.equal(m.zones, 14);
  assert.equal(m.discR, 540, 'the measurement covers the spawn field’s disc, r 540');
  assert.ok(m.worstM >= 250 && m.worstM <= 280, `worst distance ${m.worstM} m, expected ~276`);
  assert.ok(m.meanM >= 80 && m.meanM <= 100, `mean distance ${m.meanM} m, expected ~90`);
  // At the Hollow Earth walk speed (10 m/s) the worst point in
  // the world is under 30 s from safety, the average under 10 s.
  assert.ok(m.worstM / 10 < 30, 'worst point must be < 30 s walk from safety');
  assert.ok(m.meanM / 10 < 10, 'mean point must be < 10 s walk from safety');
  // The measurement is honest about its domain: the far side
  // past the rim holds no spawn field, so it is not measured.
  const far = measureSanctuaryCoverage(SAFE_ZONES, 600, 10);
  assert.ok(far.worstM > m.worstM, 'the r 600 rim reads worse than the hunted disc, as it should');
});

// ---- the ring graphic (pure geometry) ----

test('sanctuary ring: one shared design — element band colour, gold edges, mountain wears lightning', () => {
  for (const el of ['acid', 'fire', 'lightning', 'poison', 'shadow', 'sand', 'frost']) {
    assert.equal(ringElementColor(el), ELEMENT_AURA[el].color, `${el} ring must wear its ELEMENT_AURA colour`);
  }
  assert.equal(ringElementColor('mountain'), ELEMENT_AURA.lightning.color, 'mountain bands wear lightning’s colour');
  assert.equal(ringElementColor('gold'), SANCTUARY_GOLD, 'The Haven’s ring wears sanctuary gold');
  assert.equal(ringElementColor('nope'), SANCTUARY_GOLD, 'an unknown element falls back to sanctuary gold');
  assert.equal(SANCTUARY_GOLD, 0xe8c87a, 'sanctuary gold is the Haven’s gold');
});

test('sanctuary ring: structure radii + elements read off the world, not a second table', () => {
  assert.equal(structureRingRadius(6, 1.2), 10.2, 'ooze-pool ring: 6 × 1.2 + 3');
  assert.equal(structureRingRadius(10, 1), 13, 'throne ring: 10 + 3');
  assert.equal(structureRingRadius(1.5, 1), 4.5, 'brazier ring: 1.5 + 3');
  assert.equal(structureRingRadius(0, 1), 3, 'a zero footprint still gets the 3 m margin');
  assert.equal(structureRingElement(-160, 40), 'acid', 'ooze-pool ground reads acid');
  assert.equal(structureRingElement(-215, 55), 'shadow', 'throne ground reads shadow');
  assert.equal(structureRingElement(-230, 130), 'frost', 'frost-spire ground reads frost');
  assert.equal(structureRingElement(60, 190), 'sand', 'wreck-hulk ground reads sand');
  assert.equal(structureRingElement(160, -60), 'fire', 'ember-spire ground reads fire');
});

test('sanctuary ring: band hugs the shell at r ± 0.6, veil rises 2.5 m and fades to black', () => {
  const cx = -160;
  const cz = 40;
  const r = 24;
  const heightAt = () => 0;
  const g = sanctuaryRingGeometry(cx, cz, r, heightAt, 'acid', RING_SEGMENTS);
  assert.equal(g.band.positions.length, RING_SEGMENTS * 2, 'band strip: two vertices per segment');
  assert.equal(g.band.indices.length, RING_SEGMENTS * 6, 'band strip: two triangles per segment');
  assert.equal(g.veil.positions.length, RING_SEGMENTS * 2, 'veil strip: two vertices per segment');
  assert.equal(g.veil.indices.length, RING_SEGMENTS * 6);
  assert.equal(g.edgeInner.length, RING_SEGMENTS, 'inner gold edge: one point per segment');
  assert.equal(g.edgeOuter.length, RING_SEGMENTS, 'outer gold edge: one point per segment');
  assert.equal(RING_BAND_WIDTH_M, 1.2, 'the ground band is 1.2 m wide');
  assert.equal(RING_VEIL_HEIGHT_M, 2.5, 'the veil is 2.5 m tall');
  // Chord distance from the centre ground point to each band
  // point: r ± 0.6 (auraRingPoints lifts 0.35 m toward the
  // centre, which shortens the chord by < 0.01 m — inside
  // tolerance, and the lift is what keeps the band off the
  // swells).
  const centre = spherePointFromDeck(cx, cz, heightAt);
  const chord = (p) => Math.hypot(p.x - centre.x, p.y - centre.y, p.z - centre.z);
  for (let i = 0; i < RING_SEGMENTS; i++) {
    const innerD = chord(g.band.positions[i * 2]);
    const outerD = chord(g.band.positions[i * 2 + 1]);
    assert.ok(Math.abs(innerD - (r - 0.6)) < 0.15, `band inner radius ${innerD.toFixed(2)}, expected ${r - 0.6}`);
    assert.ok(Math.abs(outerD - (r + 0.6)) < 0.15, `band outer radius ${outerD.toFixed(2)}, expected ${r + 0.6}`);
    // Veil: the top sits 2.5 m above the bottom along the local
    // up (toward the core), and its colour fades to black —
    // additive blending makes black invisible, so the curtain
    // dissolves overhead instead of ending in a hard line.
    const bottom = g.veil.positions[i * 2];
    const top = g.veil.positions[i * 2 + 1];
    const h = Math.hypot(top.x - bottom.x, top.y - bottom.y, top.z - bottom.z);
    assert.ok(Math.abs(h - RING_VEIL_HEIGHT_M) < 0.01, `veil height ${h.toFixed(3)}, expected ${RING_VEIL_HEIGHT_M}`);
    assert.deepEqual(g.veil.colors[i * 2 + 1], [0, 0, 0], 'veil top must be black (invisible under additive blending)');
  }
  // The veil base wears the element colour.
  const acid = ELEMENT_AURA.acid.color;
  const expect = [((acid >> 16) & 255) / 255, ((acid >> 8) & 255) / 255, (acid & 255) / 255];
  assert.deepEqual(g.veil.colors[0], expect, 'veil base must wear the element colour');
  // The ring is round on the shell, not a flat disc: its points
  // sit on the sphere (radius SPHERE_R, less the 0.35 m lift).
  for (const p of g.edgeInner) {
    const rad = Math.hypot(p.x, p.y, p.z);
    assert.ok(Math.abs(rad - (SPHERE_R - 0.35)) < 0.5, `ring point radius ${rad.toFixed(1)}, expected ~${SPHERE_R - 0.35}`);
  }
  assert.ok(deckToDir, 'planet deck helpers stay importable for the ring');
});

// ---- wiring: no monster spawns or respawns inside any sanctuary ----

test('sanctuary: spawnField never spawns inside any safe zone', () => {
  const field = spawnField(77701, { habitatAt: (x, z) => 'sand' });
  assert.ok(field.length >= 140, `field too small to prove the exclusion (${field.length})`);
  for (const rec of field) {
    assert.equal(isInSanctuary(rec.x, rec.z), false,
      `monster ${rec.id} spawned inside a sanctuary at (${rec.x.toFixed(0)},${rec.z.toFixed(0)})`);
  }
});

test('sanctuary: spawnField also honours caller-supplied structure rings', () => {
  // Two structure rings the caller passes in (the zone passes
  // the landmark rings): nothing may spawn inside either.
  const rings = [
    { x: 300, z: 300, r: 12, name: 'test-hulk' },
    { x: -300, z: -300, r: 9, name: 'test-spire' },
  ];
  const field = spawnField(77701, { habitatAt: (x, z) => 'sand', exclusionRings: rings });
  for (const rec of field) {
    assert.equal(isInsideAnyRing(rec.x, rec.z, rings), false,
      `monster ${rec.id} spawned inside structure ring ${ringAt(rec.x, rec.z, rings)?.name}`);
  }
});

test('sanctuary: respawnMonster never returns a monster inside a sanctuary', () => {
  const m = mon('slot-06', -160, 40); // died at the Acid Hollow centre
  m.dead = true;
  for (let i = 0; i < 25; i++) {
    // A fresh seeded stream per respawn (a constant rng would
    // re-roll the same inside point 20 times and exhaust the
    // guard — the guard is a backstop, not the mechanism).
    respawnMonster(m, mulberry32(1000 + i));
    assert.equal(isInSanctuary(m.x, m.z), false,
      `respawn ${i} landed inside a sanctuary at (${m.x.toFixed(1)},${m.z.toFixed(1)})`);
    m.dead = true;
  }
});

// ---- wiring: the hunt and the aura stop at the boundary ----

test('sanctuary: a hunting monster drops the chase the moment the hunter is inside any zone', () => {
  const m = mon('slot-06', -150, 40);
  m.spotted = true;
  m.state = 'stalk';
  m.target = { x: -160, z: 40 };
  // The hunter stands in Acid Hollow; the monster is 10 m out.
  const evs = stepMonster(m, 0.1, { x: -160, z: 40 }, rng, { losClear: alwaysLos, inBase: true });
  assert.equal(m.spotted, false, 'the hunt must break at the sanctuary boundary');
  assert.equal(m.state, 'idle');
  assert.equal(m.target, null);
  assert.deepEqual(evs, [], 'no hit, no aura strike, no hazard may fire from inside');
});

test('sanctuary: an aura carrier never strikes monster prey standing inside a zone', () => {
  // Carrier + prey 20 m apart; the player 100 m off so the
  // player-first strike cannot fire and the prey strike is the
  // only one in play. Fire aura radius is 24 m.
  const carrier = mon('slot-06', 0, 0);
  const prey = mon('slot-02', 10, 0);
  const evsOut = stepMonster(carrier, 0.1, { x: 0, z: 100 }, rng, {
    losClear: alwaysLos, others: [carrier, prey],
  });
  const preyStrikeOut = evsOut.find((e) => e.kind === 'aura-strike' && e.target === prey.id);
  assert.ok(preyStrikeOut, 'outside any zone the carrier must strike its prey (control)');
  // Same geometry moved into Acid Hollow: carrier 20 m west of
  // the centre, prey on the centre — the strike must not fire.
  const carrierIn = mon('slot-06', -140, 40);
  const preyIn = mon('slot-02', -160, 40);
  assert.equal(isInSanctuary(preyIn.x, preyIn.z), true, 'prey must stand inside Acid Hollow for this test');
  const evsIn = stepMonster(carrierIn, 0.1, { x: -140, z: 140 }, rng, {
    losClear: alwaysLos, others: [carrierIn, preyIn],
  });
  const preyStrikeIn = evsIn.find((e) => e.kind === 'aura-strike' && e.target === preyIn.id);
  assert.equal(preyStrikeIn, undefined, 'no aura strike may land on prey standing inside a sanctuary');
  // And the carrier outside the zone still hunts normally: the
  // player-first order is untouched, only the sanctuary is new.
  assert.equal(prey.hp, prey.stats.hp, 'the control prey must be unhurt before its own strike lands');
});

// ---- Korus: the one exemption ----

test('sanctuary: Korus still fights inside the throne court — his blasts are his own mechanics', () => {
  const k = createKorus(true);
  // The player stands inside the throne ring (10 m from the
  // throne — inside its r 13 structure ring).
  const player = { x: -215, z: 65 };
  let evs = stepKorus(k, 0.1, player);
  assert.equal(k.awake, true, 'Korus wakes at 10 m, sanctuary or not');
  // Fast-forward his cooldown: telegraph, then the blast.
  evs = stepKorus(k, 0.1, player);
  assert.ok(evs.some((e) => e.kind === 'telegraph'), 'Korus telegraphs on a player in his court');
  evs = stepKorus(k, 1.3, player);
  assert.ok(evs.some((e) => e.kind === 'hit'), 'Korus’s blast still lands in his own court');
});

// ---- source pins: the page + zone wiring ----

test('sanctuary: page + zone wiring pins', () => {
  const page = readFileSync(new URL('../page.jsx', import.meta.url), 'utf8');
  const zone = readFileSync(new URL('../zone.js', import.meta.url), 'utf8');
  const spawns = readFileSync(new URL('../spawns.js', import.meta.url), 'utf8');
  // The page feeds sanctuary (not just The Haven) into the zone.
  assert.match(page, /inSanctuaryAt\(walker\.pos\.x, walker\.pos\.z\)/, 'the observer flag must read the full sanctuary list');
  // Korus bypasses the damage guard; every other source does not.
  assert.match(page, /from === 'korus'/, 'Korus hits must bypass sanctuary in damageHunter');
  // Trade stays Haven-only: the trade guard still reads hud.inBase.
  assert.match(page, /if \(hud\.inBase\) return true;/, 'trade must stay The Haven only');
  // The HUD names the sanctuary the hunter stands in.
  assert.match(page, /sanctuary: /, 'the HUD must carry the sanctuary name');
  // The zone hangs the ring graphic and exposes the ring list.
  assert.match(zone, /sanctuaryRingGeometry/, 'zone.js must build the ring from sanctuary-ring.js');
  assert.match(zone, /sanctuaryRings/, 'buildWorld must expose its sanctuary rings');
  assert.match(zone, /SAFE_ZONES/, 'zone.js must ring the SAFE_ZONES table');
  // Spawns delegates the table to sanctuary.js instead of a second copy.
  assert.match(spawns, /from '\.\/sanctuary\.js'/, 'spawns.js must import the sanctuary table, not duplicate it');
  assert.match(spawns, /exclusionRings/, 'spawnField must honour caller-supplied structure rings');
});
