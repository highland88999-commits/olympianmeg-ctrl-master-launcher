// tests/vortex-tube.test.mjs — the tube ride's pure motion math
// (Merlin, 2026-10-29): the tube spins around the rider; the rider
// does not spin; the camera auto-fixes forward down the tube.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  tubeSpinAngle,
  tubeCameraZ,
  VORTEX_RIDE_MS,
  TUBE_SPIN_RAD_PER_SEC,
  TUBE_LENGTH,
} from '../app/nexus-vortex/lib/tube.js';

describe('tube motion', () => {
  it('the tube spins at a steady rate', () => {
    assert.equal(tubeSpinAngle(0), 0);
    assert.equal(tubeSpinAngle(1000), TUBE_SPIN_RAD_PER_SEC);
    assert.equal(tubeSpinAngle(2000), TUBE_SPIN_RAD_PER_SEC * 2);
    assert.ok(tubeSpinAngle(500) < tubeSpinAngle(1000), 'spin only moves forward');
  });
  it('the camera travels straight down the tube, eased by progress', () => {
    const z0 = tubeCameraZ(0);
    const zMid = tubeCameraZ(0.5);
    const z1 = tubeCameraZ(1);
    assert.ok(zMid < z0, 'camera moves forward');
    assert.ok(z1 < zMid, 'camera keeps moving forward');
    assert.ok(z1 > -TUBE_LENGTH, 'camera stays inside the tube at the end');
  });
  it('ride constants are sane', () => {
    assert.equal(VORTEX_RIDE_MS, 8000);
    assert.ok(TUBE_SPIN_RAD_PER_SEC > 0 && TUBE_SPIN_RAD_PER_SEC < 5);
  });
});

describe('tube ride component', () => {
  const src = readFileSync('app/nexus-vortex/components/VortexTubeRide.jsx', 'utf8');
  it('renders outside and inside skins on separate walls', () => {
    assert.match(src, /FrontSide/);
    assert.match(src, /BackSide/);
    assert.match(src, /outsideSkin/);
    assert.match(src, /insideSkin/);
  });
  it('the camera auto-fixes forward every frame; only the tube spins', () => {
    assert.match(src, /lookForward\(\)/);
    assert.match(src, /tubeGroup\.rotation\.z = tubeSpinAngle/);
    assert.doesNotMatch(src, /camera\.rotation\.z/);
  });
  it('falls back to the 2D flight when WebGL is unavailable', () => {
    assert.match(src, /VortexFallbackRide/);
    assert.match(src, /setWebglFailed\(true\)/);
  });
  it('shows the destination ahead at the ride\'s end', () => {
    assert.match(src, /exitVisible/);
    assert.match(src, /Approaching/);
    assert.match(src, /onDone/);
  });
  it('3rd person shows the rider\'s character in front of them in the tube', () => {
    assert.match(src, /characterPreview/);
    assert.match(src, /perspective === '3rd' && characterPreview/);
    assert.match(src, /riderSprite/);
  });
  it('the rider sprite never spins with the tube', () => {
    // The sprite is positioned ahead of the camera each frame; only
    // tubeGroup.rotation.z spins.
    assert.match(src, /riderSprite\.position\.set\(0, 0\.4/);
    assert.doesNotMatch(src, /riderSprite\.rotation\.z/);
  });
});
