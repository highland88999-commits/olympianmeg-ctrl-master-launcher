// tests/jupiter2-storm-light.test.mjs — Jupiter 2 Phase 2b: the storm
// light follows the roam. The flash light and the bolts used to live
// at the spawn pole, so the far side's night never flashed and no
// bolt ever struck there. The flash intensity (×8), cadence (28% of
// 90 ms slices) and savagery are untouched — only the anchor moves
// with the walker. Run: node --test tests/jupiter2-storm-light.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { flashLightPose, boltWorldPoints, boltFor } from '../lib/jupiter2/storm.js';
import { groundPointAt, deckToDir } from '../lib/jupiter2/planet.js';
import { buildOblivionLever } from '../lib/jupiter2/meshes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

function unit(p) {
  const r = Math.hypot(p.x, p.y, p.z) || 1;
  return { x: p.x / r, y: p.y / r, z: p.z / r };
}

// The old fixed rig, in numbers: position [20, 50, −10], target the
// origin. A directional light's direction is uniform (position −
// target) — a surface is lit by dot(normal, that direction). At
// the spawn pole the old rig lit at 0.913; at the antipode the
// same direction arrives from below the local ground, so the far
// side's night never flashed.
function oldFixedPoseLightsGround(groundPoint) {
  const up = unit(groundPoint);
  const toLight = { x: 20, y: 50, z: -10 }; // position − target (origin)
  const n = Math.hypot(toLight.x, toLight.y, toLight.z) || 1;
  return (up.x * toLight.x + up.y * toLight.y + up.z * toLight.z) / n;
}

describe('the flash light follows the walker', () => {
  it('at the spawn pole it keeps the old light direction exactly', () => {
    const pole = groundPointAt({ x: 0, y: 1, z: 0 });
    const pose = flashLightPose(pole);
    // Same rake as the old fixed rig: 50 m up, 20 m east, 10 m north.
    assert.ok(Math.abs(pose.position.x - 20) < 1e-9, `x ${pose.position.x}`);
    assert.ok(Math.abs(pose.position.z + 10) < 1e-9, `z ${pose.position.z}`);
    assert.ok(Math.abs(pose.position.y - (pole.y + 50)) < 1e-9, `y ${pose.position.y}`);
    assert.deepEqual(pose.target, { x: pole.x, y: pole.y, z: pole.z });
    // The light still travels (−20, −50, 10) there.
    const d = {
      x: pose.target.x - pose.position.x,
      y: pose.target.y - pose.position.y,
      z: pose.target.z - pose.position.z,
    };
    const n = Math.hypot(d.x, d.y, d.z);
    assert.ok(Math.abs(d.x / n + 20 / 54.77) < 0.01, 'same travel direction');
    assert.ok(Math.abs(d.y / n + 50 / 54.77) < 0.01, 'same travel direction');
    assert.ok(Math.abs(d.z / n - 10 / 54.77) < 0.01, 'same travel direction');
  });
  it('it lights the ground everywhere — deck, shelf, mountain flank, antipode', () => {
    // The old rig left the far side dark (pinned below); the new
    // pose sits ~50 m above the local ground everywhere, so the
    // light always arrives from above it.
    const spots = [
      deckToDir(0, 0), deckToDir(30, -40), deckToDir(0, -200),
      deckToDir(0, 270), deckToDir(45, 270), deckToDir(150, 150),
      deckToDir(0, -120), deckToDir(30, -128),
    ];
    let oldWorst = Infinity;
    for (const dir of spots) {
      const ground = groundPointAt(dir);
      const up = unit(ground);
      const pose = flashLightPose(ground);
      const toLight = {
        x: pose.position.x - ground.x,
        y: pose.position.y - ground.y,
        z: pose.position.z - ground.z,
      };
      const n = Math.hypot(toLight.x, toLight.y, toLight.z) || 1;
      const lit = (up.x * toLight.x + up.y * toLight.y + up.z * toLight.z) / n;
      assert.ok(lit > 0.9, `flash lights the ground at ${JSON.stringify(dir)} (dot ${lit.toFixed(3)})`);
      const old = oldFixedPoseLightsGround(ground);
      if (old < oldWorst) oldWorst = old;
    }
    // The old rig left part of the planet unlit (negative = the
    // light arrives from below the local ground), while the new
    // pose holds 0.913 everywhere above.
    assert.ok(oldWorst < 0, `the old fixed rig left a spot unlit (worst ${oldWorst.toFixed(3)})`);
    // And the old rig, in numbers, left the antipode unlit.
    const antipode = groundPointAt(deckToDir(0, 270));
    assert.ok(oldFixedPoseLightsGround(antipode) < 0, `old rig at the antipode: ${oldFixedPoseLightsGround(antipode).toFixed(3)}`);
  });
});

describe('the bolts strike near the walker', () => {
  it('boltWorldPoints keeps the bolt\'s shape in the walker\'s local frame', () => {
    // Find a real flashing instant so the bolt has points.
    let bolt = null;
    for (let t = 0; t < 20000; t += 90) {
      const b = boltFor(Date.UTC(2026, 10, 15) + t);
      if (b.points.length >= 8) { bolt = b; break; }
    }
    assert.ok(bolt, 'a flashing instant exists in the window');
    for (const dir of [deckToDir(0, 0), deckToDir(0, 270), deckToDir(0, -200)]) {
      const anchor = groundPointAt(dir);
      const up = unit(anchor);
      const world = boltWorldPoints(bolt.points, anchor);
      assert.equal(world.length, bolt.points.length);
      // Heights along the local up are the bolt's own heights, exactly.
      for (let i = 0; i < bolt.points.length; i++) {
        const h = (world[i].x - anchor.x) * up.x + (world[i].y - anchor.y) * up.y + (world[i].z - anchor.z) * up.z;
        assert.ok(Math.abs(h - bolt.points[i].y) < 1e-9, `height ${i}: ${h} vs ${bolt.points[i].y}`);
      }
      // The strike foot lands where the old pole anchor's foot
      // landed (same local geometry — the transform preserves
      // local heights exactly, so the bolt's shape is unchanged;
      // its clearance over the ground is the terrain's, not the
      // transform's, and the old rig had the same).
      // The whole bolt stays near the walker (tangent spread ≤ 50 m).
      for (const p of world) {
        const dx = p.x - anchor.x, dy = p.y - anchor.y, dz = p.z - anchor.z;
        const radial = dx * up.x + dy * up.y + dz * up.z;
        const tangent = Math.hypot(dx - up.x * radial, dy - up.y * radial, dz - up.z * radial);
        assert.ok(tangent <= 50, `bolt stays within 50 m of the walker (${tangent.toFixed(1)} m)`);
      }
    }
    // Pure: same input, same output.
    const a = groundPointAt(deckToDir(0, 270));
    assert.deepEqual(boltWorldPoints(bolt.points, a), boltWorldPoints(bolt.points, a));
  });
});

describe('the scene wires the storm to the walker', () => {
  it('StormRig aims the flash light and anchors the bolts at the walker\'s ground', () => {
    const scene = read('components/jupiter2/Jupiter2Scene.jsx');
    assert.match(scene, /flashLightPose, boltWorldPoints \} from '@\/lib\/jupiter2\/storm'/);
    assert.match(scene, /const pose = flashLightPose\(camGround\);/);
    assert.match(scene, /flashLight\.current\.position\.set\(pose\.position\.x, pose\.position\.y, pose\.position\.z\);/);
    assert.match(scene, /flashLight\.current\.target\.position\.set\(pose\.target\.x, pose\.target\.y, pose\.target\.z\);/);
    assert.match(scene, /flashLight\.current\.target\.updateMatrixWorld\(\);/);
    assert.match(scene, /boltWorldPoints\(pts, camGround\)/);
    // The old pole anchor is gone — no bolt is ever built at the spawn pole again.
    assert.doesNotMatch(scene, /groundPointAt\(\{ x: 0, y: 1, z: 0 \}\)/);
    // The flash itself is untouched: still intensity ×8, still the
    // seeded flash, still the additive wash.
    assert.match(scene, /flashLight\.current\.intensity = flash \* 8;/);
    assert.match(scene, /washMat\.opacity = flash \* 0\.3;/);
  });
  it('the lever beacon reads through the storm: fog never swallows it', () => {
    const lever = buildOblivionLever();
    assert.equal(lever.userData.beaconMat.fog, false, 'the beacon ignores scene fog, like the sun glow and the engine flames');
    assert.equal(lever.userData.beaconMat.blending, 2, 'still additive');
    assert.equal(lever.userData.beaconMat.transparent, true, 'still translucent');
    assert.equal(lever.userData.beaconMat.color.getHexString(), '22ff66', 'still green');
  });
});
