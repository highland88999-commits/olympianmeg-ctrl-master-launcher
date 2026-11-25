// tests/mars2-zones-flat.test.mjs
// MARS 2 FLAT MINING ZONES + STARTER GUIDANCE (Merlin, Nov 25, 2026).
//
// 1. "wrap the mining zone area lines flush with the ground" — the
//    zone disc + ring drape over the terrain instead of floating at
//    the centre height.
// 2. "Make mining zones flat by default" — the ground inside a zone
//    is levelled to the area's height, blended at the rim.
// 3. Starter guidance (approved Nov 25): with no buildings yet the
//    panel says plainly that the first mine in each area is free
//    and earns on its own, and unclaimed mine plots pulse until the
//    first mine is staked.
// Run: node --test tests/mars2-zones-flat.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateMarsProfile, getTerrainHeight } from '../lib/mars/engine.js';
import { MARS2_SEED } from '../lib/mars2/world.js';
import { miningAreasFor } from '../lib/mars2/build-mode.js';
import {
  mars2TerrainHeight,
  MINING_ZONE_FLAT_RADIUS_M,
  MINING_ZONE_RADIUS_M,
} from '../lib/mars2/terrain.js';
import { zoneDiscVertices, zoneRingVertices } from '../lib/mars2/zone-geometry.js';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(repo, p), 'utf8');

const profile = generateMarsProfile(MARS2_SEED);
const areas = miningAreasFor(profile);

describe('flat mining zones', () => {
  it('the ground is dead level inside the flat radius', () => {
    for (const a of areas) {
      for (let k = 0; k < 12; k++) {
        const ang = (k / 12) * Math.PI * 2;
        for (const r of [0, 3, 6, MINING_ZONE_FLAT_RADIUS_M]) {
          const h = mars2TerrainHeight(a.x + Math.cos(ang) * r, a.z + Math.sin(ang) * r, profile, areas);
          assert.equal(h, a.y, `zone ${a.id} r=${r} not level`);
        }
      }
    }
  });

  it('the blend returns to the raw dunes at the rim', () => {
    for (const a of areas) {
      const ang = 0.7;
      const atRim = mars2TerrainHeight(a.x + Math.cos(ang) * MINING_ZONE_RADIUS_M, a.z + Math.sin(ang) * MINING_ZONE_RADIUS_M, profile, areas);
      const raw = getTerrainHeight(a.x + Math.cos(ang) * MINING_ZONE_RADIUS_M, a.z + Math.sin(ang) * MINING_ZONE_RADIUS_M, profile);
      assert.ok(Math.abs(atRim - raw) < 1e-9, 'rim is raw terrain');
    }
  });

  it('outside every zone the height is the raw seeded height', () => {
    const h = mars2TerrainHeight(0, 0, profile, areas);
    assert.equal(h, getTerrainHeight(0, 0, profile));
  });

  it('the walker, the chunks and the plots all read the same height', () => {
    const streaming = read('lib/mars2/streaming.js');
    assert.ok(streaming.includes('mars2TerrainHeight'), 'chunks build on the levelled height');
    const scene = read('components/mars2/Mars2Scene.jsx');
    assert.ok(scene.includes('mars2TerrainHeight'), 'walker/rover/ship stand on the levelled height');
    const layer = read('components/mars2/BuildModeLayer.jsx');
    assert.ok(layer.includes('mars2TerrainHeight'), 'plot frames sit on the levelled height');
  });

  it('mine plots sit at the area level height, not the raw slope', () => {
    const buildMode = read('lib/mars2/build-mode.js');
    assert.ok(buildMode.includes('area.y'), 'mine plot y is the area level');
  });
});

describe('zone lines flush with the ground', () => {
  it('every disc vertex sits at ground height + lift', () => {
    for (const a of areas) {
      const v = zoneDiscVertices(a, (x, z) => mars2TerrainHeight(x, z, profile, areas));
      for (let i = 0; i < v.positions.length; i += 3) {
        const wx = v.positions[i];
        const wy = v.positions[i + 1];
        const wz = v.positions[i + 2];
        const want = mars2TerrainHeight(wx, wz, profile, areas) + 0.08;
        assert.ok(Math.abs(wy - want) < 1e-6, `disc vertex floats: ${wy} vs ${want}`);
      }
      assert.ok(v.indices.length > 0, 'disc has faces');
    }
  });

  it('every ring vertex sits at ground height + lift', () => {
    for (const a of areas) {
      const v = zoneRingVertices(a, (x, z) => mars2TerrainHeight(x, z, profile, areas));
      for (let i = 0; i < v.positions.length; i += 3) {
        const wx = v.positions[i];
        const wy = v.positions[i + 1];
        const wz = v.positions[i + 2];
        const want = mars2TerrainHeight(wx, wz, profile, areas) + 0.08;
        assert.ok(Math.abs(wy - want) < 1e-6, `ring vertex floats: ${wy} vs ${want}`);
      }
    }
  });

  it('the build layer renders the draped disc + ring, not the flat planes', () => {
    const layer = read('components/mars2/BuildModeLayer.jsx');
    assert.ok(layer.includes('zoneDiscGeometry'), 'draped disc in the layer');
    assert.ok(layer.includes('zoneRingGeometry'), 'draped ring in the layer');
    assert.ok(!layer.includes('circleGeometry'), 'flat disc gone');
    assert.ok(!layer.includes("ringGeometry args={[a.radius - 0.4, a.radius, 48]}"), 'flat ring gone');
  });
});

describe('starter guidance (approved Nov 25)', () => {
  it('the panel tells a zero-building user the first mine is free and earns alone', () => {
    const panel = read('components/mars2/BuildPanel.jsx');
    assert.ok(panel.includes('first mine'), 'first-mine wording present');
    assert.ok(panel.includes('FREE'), 'free called out');
    assert.ok(panel.includes('no crew'), 'no crew needed stated');
    assert.ok(panel.includes('2/min') || panel.includes('2 per minute'), 'the rate is stated');
  });

  it('the guidance shows even on a barracks plot, not only a mine plot', () => {
    const panel = read('components/mars2/BuildPanel.jsx');
    // The banner is gated on the building count, not the selection.
    const bannerAt = panel.indexOf('first mine');
    const selectedAt = panel.indexOf('selectedPlot');
    assert.ok(bannerAt >= 0 && bannerAt < panel.indexOf('Selected plot'), 'banner sits above the selection');
  });

  it('unclaimed mine plots pulse until the first mine is staked', () => {
    const layer = read('components/mars2/BuildModeLayer.jsx');
    assert.ok(layer.includes('hasAnyMine') || layer.includes('hasMine'), 'first-mine state tracked');
    assert.ok(layer.includes('useFrame'), 'pulse animates per frame');
  });
});
