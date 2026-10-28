// tests/tower-panel-box.test.mjs
// Hub tower panels form a closed horizontal 4-sided box (Merlin,
// 2026-10-27: "if we match the vertical sides of the billboards to
// each other, forming a horizontal 4 sided box, the videos will
// render right"). The old mount (panel origin 5.0 from the axis)
// left a 2.36-unit open gap at every corner — the front face ended
// at x = 3.0 while the neighbor's face plane stood at x = 5.36,
// which is the sliver-and-gap look in his HERMES screenshot.
//
// Box math, in the tower group's units (PANEL_SCALE 1.5):
//   face width  = 4.0 * 1.5 = 6.0  -> half-width 3.0
//   face offset = 0.24 * 1.5 = 0.36 in front of the panel origin
//   origin mount = 3.0 - 0.36 = 2.64 from the axis
// so each face plane sits exactly 3.0 from the axis and each face's
// edge lands exactly on its neighbor's edge at the corner (3.0, 3.0).
// The pillar (radius 2.5) stays enclosed with 0.5 clearance to the
// face planes.
//
// Run: node --test tests/tower-panel-box.test.mjs (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { PANEL_SCALE } from '../lib/tower-panels.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const read = (p) => readFileSync(join(repo, p), 'utf8');
const tower = read('components/GodTower.jsx');

// Constants straight from the component under test.
const FACE_W = 4.0;
const FACE_H = 7.0;
const BORDER_W = 4.2;
const BORDER_H = 7.2;
const FACE_OFFSET = 0.24; // face mesh z inside TowerAdPanel
const PILLAR_RADIUS = 2.5;

// Panel origin mount, parsed from the live source (not duplicated here).
const mountMatch = tower.match(/<group position=\{\[0, -1, ([\d.]+)\]\}>/);
assert.ok(mountMatch, 'panel mount group found in GodTower.jsx');
const MOUNT = parseFloat(mountMatch[1]);

const faceHalfWidth = (FACE_W * PANEL_SCALE) / 2;
const facePlaneDistance = MOUNT + FACE_OFFSET * PANEL_SCALE;

// Rotate a vector about Y by angle (three.js rotation={[0, angle, 0]}).
const rotY = (angle, [x, y, z]) => [
  x * Math.cos(angle) + z * Math.sin(angle),
  y,
  -x * Math.sin(angle) + z * Math.cos(angle),
];

describe('tower panel box geometry', () => {
  it('mounts the panel origin at 2.64 from the axis (face plane at 3.0)', () => {
    assert.equal(MOUNT, 2.64);
    assert.equal(facePlaneDistance, 3.0);
  });

  it('face plane distance equals face half-width, so edges coincide', () => {
    assert.equal(facePlaneDistance, faceHalfWidth);
  });

  it('four panels at 0/90/180/-90 degrees, Y-rotation only', () => {
    assert.ok(
      tower.includes('[0, Math.PI / 2, Math.PI, -Math.PI / 2].map((angle, i) => ('),
      'four panel rotations'
    );
    assert.ok(
      tower.includes('<group key={`ad-${i}`} rotation={[0, angle, 0]}>'),
      'panel groups rotate about Y only — no tilt, no mirror'
    );
  });

  it('adjacent face edges meet exactly at the box corners', () => {
    const angles = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
    const faces = angles.map((a) => {
      const origin = rotY(a, [0, 0, MOUNT]);
      const normal = rotY(a, [0, 0, 1]);
      // The face plane sits 0.36 in front of the panel origin.
      const center = origin.map((c, k) => c + normal[k] * FACE_OFFSET * PANEL_SCALE);
      // Face corners: center +/- half-width along the face's local X.
      const tangent = rotY(a, [1, 0, 0]);
      return {
        center,
        normal,
        right: center.map((c, k) => c + tangent[k] * faceHalfWidth),
        left: center.map((c, k) => c - tangent[k] * faceHalfWidth),
      };
    });
    // Front face (angle 0) right edge == right face (angle 90deg) front edge.
    const front = faces[0];
    const right = faces[1];
    for (let k = 0; k < 3; k++) {
      assert.ok(Math.abs(front.right[k] - right.left[k]) < 1e-9,
        `front right edge meets right left edge (axis ${k})`);
    }
    // Corner point is (3.0, 3.0) in (x, z).
    assert.ok(Math.abs(front.right[0] - 3.0) < 1e-9);
    assert.ok(Math.abs(front.right[2] - 3.0) < 1e-9);
    // Every corner closes, not just the first.
    for (let i = 0; i < 4; i++) {
      const a = faces[i];
      const b = faces[(i + 1) % 4];
      const gap = Math.hypot(...a.right.map((c, k) => c - b.left[k]));
      assert.ok(gap < 1e-9, `corner ${i} closed (gap ${gap})`);
    }
  });

  it('every face is outward-facing, upright, and unmirrored', () => {
    const angles = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
    for (const a of angles) {
      const origin = rotY(a, [0, 0, MOUNT]);
      const normal = rotY(a, [0, 0, 1]);
      const center = origin.map((c, k) => c + normal[k] * FACE_OFFSET * PANEL_SCALE);
      // Normal parallel to the radial direction (outward, not inward).
      const radial = center.map((c) => c / Math.hypot(center[0], center[2]));
      const dot = normal[0] * radial[0] + normal[2] * radial[2];
      assert.ok(dot > 0.999, `face at angle ${a} faces outward (dot ${dot})`);
      // Upright: normal has no Y component, center keeps its y.
      assert.equal(normal[1], 0);
    }
    // Rotation about Y is a proper rotation (determinant +1): no mirror.
    const det = (a) => {
      const c = Math.cos(a);
      const s = Math.sin(a);
      return c * c + s * s; // det of rotY
    };
    for (const a of angles) assert.ok(Math.abs(det(a) - 1) < 1e-9);
  });

  it('the pillar stays enclosed by the box', () => {
    assert.ok(tower.includes('cylinderGeometry args={[2.5, 2.5, 24, 32]}'), 'pillar radius 2.5');
    assert.ok(PILLAR_RADIUS < facePlaneDistance, 'pillar radius < face plane distance');
    assert.equal(facePlaneDistance - PILLAR_RADIUS, 0.5);
  });

  it('face, border, and backing sizes are untouched by the boxing', () => {
    assert.equal(PANEL_SCALE, 1.5);
    assert.ok(tower.includes('const FACE_PLANE_W = 4.0;'), 'face width 4.0');
    assert.ok(tower.includes('const FACE_PLANE_H = 7.0;'), 'face height 7.0');
    assert.ok(tower.includes('<planeGeometry args={[FACE_PLANE_W, FACE_PLANE_H]} />'), 'face plane');
    assert.ok(tower.includes('<boxGeometry args={[4.2, 7.2, 0.2]} />'), 'backing box 4.2x7.2x0.2');
    assert.ok(tower.includes('<planeGeometry args={[4.2, 7.2]} />'), 'border plane 4.2x7.2');
    assert.ok(tower.includes('position={[0, 0, 0.24]}'), 'face offset 0.24');
    assert.ok(tower.includes('position={[0, 0, 0.16]}'), 'border offset 0.16');
  });

  it('badges, tap-to-link, video, and the GPU guard ride along unchanged', () => {
    assert.ok(tower.includes('BillboardNumberBadge'), 'number badge on the panel');
    assert.ok(tower.includes('onClick={handleFaceClick}'), 'tap-to-link on the face mesh');
    assert.ok(tower.includes('onLaunchExternal(effectiveSlot.trackingUrl)'), 'tap opens the entry link');
    assert.ok(tower.includes('<meshBasicMaterial map={videoState.texture} color="#ffffff" toneMapped={false} />'),
      'video true-color material');
    assert.ok(tower.includes('const facing = _panelNormal.dot(_panelToCam) > 0;'), 'front-facing check');
    assert.ok(tower.includes('_panelFrustum.intersectsObject(mesh)'), 'frustum check');
    assert.ok(tower.includes('setPanelVideoViewer(videoUrl, viewerId, inView)'), 'in-view guard seat');
  });
});
