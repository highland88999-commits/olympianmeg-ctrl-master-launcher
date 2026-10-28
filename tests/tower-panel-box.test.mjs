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

import { PANEL_SCALE, billboardNumberFor, topLevelBillboardNumberFor, TOP_LEVEL_BADGE_BASE, bottomLevelBillboardNumberFor, BOTTOM_LEVEL_BADGE_BASE, houseLevelSlot, HOUSE_FALLBACK_ENTRY } from '../lib/tower-panels.js';

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

  it('the pillar stays enclosed by the box and now spans the full stack', () => {
    assert.ok(tower.includes('cylinderGeometry args={[2.5, 2.5, 43, 32]}'), 'pillar radius 2.5, length 43');
    assert.ok(tower.includes('position={[0, -1, 0]}'), 'pillar centred -1');
    // Top 20.5 (propellers) to -22.5, 0.9 below the level-3 box bottom.
    assert.equal(-1 + 43 / 2, 20.5);
    assert.equal(-1 - 43 / 2, -22.5);
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

// Tower LEVELS (Merlin, 2026-10-27: "It's levels" — Level 1 TOP
// (Merlin: "Multiverse = multi level one"), Level 2 MIDDLE, Level
// 3 BOTTOM, with a name level and ring breaks between levels).
// Stack, inner units, top to bottom:
//   level 1 box band [8.8, 19.6] (centre 14.2)
//   ring break at 8.3, name level at 6.6, ring break at 4.9
//   level 2 box band [-6.4, 4.4] (centre -1, the current 44)
//   ring break at -6.9, name level at -8.6, ring break at -10.3
//   level 3 box band [-21.6, -10.8] (centre -16.2)
// Every level matches the same diameter (mount 2.64, same
// rotations, same face/border/backing). Levels 1 and 3 are
// house-only: every new face plays the same house video through
// the existing panel video path, with PROVISIONAL display numbers
// (top 45–88, bottom 89–132, code only, not a product decision —
// no manager/manifest/queue/pricing/cap wiring).
describe('tower levels', () => {
  const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);

  it('three levels mount at the same 2.64 box distance: top 14.2, middle -1, bottom -16.2', () => {
    assert.ok(tower.includes('<group position={[0, 14.2, 2.64]}>'), 'level 1 top mount');
    assert.ok(tower.includes('<group position={[0, -1, 2.64]}>'), 'level 2 middle mount unchanged');
    assert.ok(tower.includes('<group position={[0, -16.2, 2.64]}>'), 'level 3 bottom mount');
    close(14.2 - -1, 15.2);
    close(-1 - -16.2, 15.2);
  });

  it('all three levels use the same four Y-only rotations and the same panel component', () => {
    for (const key of ['ad-top-${i}', 'ad-${i}', 'ad-bottom-${i}']) {
      assert.ok(tower.includes(`<group key={\`${key}\`} rotation={[0, angle, 0]}>`), `${key} rotates about Y only`);
    }
    const top = tower.slice(tower.indexOf('ad-top-${i}'));
    assert.ok(top.includes('slot={houseLevelPanels[i]}'), 'top slots are the house-only derivations');
    assert.ok(top.includes('badgeNumber={topLevelBillboardNumberFor(towerIndex, i)}'), 'top provisional badges');
    const bottom = tower.slice(tower.indexOf('ad-bottom-${i}'));
    assert.ok(bottom.includes('slot={houseLevelPanels[i]}'), 'bottom slots are the house-only derivations');
    assert.ok(bottom.includes('badgeNumber={bottomLevelBillboardNumberFor(towerIndex, i)}'), 'bottom provisional badges');
  });

  it('new-level box corners coincide exactly like the middle level (same diameter)', () => {
    const angles = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
    const faces = angles.map((a) => {
      const origin = rotY(a, [0, 0, MOUNT]);
      const normal = rotY(a, [0, 0, 1]);
      const center = origin.map((c, k) => c + normal[k] * FACE_OFFSET * PANEL_SCALE);
      const tangent = rotY(a, [1, 0, 0]);
      return {
        right: center.map((c, k) => c + tangent[k] * faceHalfWidth),
        left: center.map((c, k) => c - tangent[k] * faceHalfWidth),
      };
    });
    for (let i = 0; i < 4; i++) {
      const a = faces[i];
      const b = faces[(i + 1) % 4];
      const gap = Math.hypot(...a.right.map((c, k) => c - b.left[k]));
      assert.ok(gap < 1e-9, `new-level corner ${i} closed (gap ${gap})`);
    }
  });

  it('level bands do not overlap; name levels sit between them', () => {
    // Bands (centre ± 5.4): top [8.8, 19.6], middle [-6.4, 4.4], bottom [-21.6, -10.8].
    close(14.2 - 5.4, 8.8);
    close(14.2 + 5.4, 19.6);
    close(-1 - 5.4, -6.4);
    close(-1 + 5.4, 4.4);
    close(-16.2 - 5.4, -21.6);
    close(-16.2 + 5.4, -10.8);
    assert.ok(6.6 > 4.4 && 6.6 < 8.8, 'upper name level 6.6 sits between middle and top bands');
    assert.ok(-8.6 > -10.8 && -8.6 < -6.4, 'lower name level -8.6 sits between bottom and middle bands');
  });

  it('four ring breaks frame the two name levels, in the existing metalwork language', () => {
    for (const y of ['8.3', '4.9', '-6.9', '-10.3']) {
      assert.ok(tower.includes(`<mesh position={[0, ${y}, 0]} material={darkMetal}`), `ring at ${y}`);
    }
    assert.equal((tower.match(/cylinderGeometry args={\[4\.5, 4\.5, 0\.4, 32\]}/g) || []).length, 4,
      'exactly four break discs, radius 4.5 past the 4.24 box corner radius');
  });

  it('both name bands are camera-facing Billboards, and the pillar texts are gone', () => {
    for (const y of ['6.6', '-8.6']) {
      assert.ok(tower.includes(`<Billboard position={[0, ${y}, 0]}>`), `name band Billboard at ${y}`);
    }
    const band = tower.slice(tower.indexOf('<Billboard position={[0, 6.6, 0]}>'));
    assert.ok(band.includes('{god}'), 'name bands render the god name');
    assert.ok(!tower.includes('position={[0, 2, 2.55]}'), 'old pillar-surface text (front) removed');
    assert.ok(!tower.includes('position={[0, 2, -2.55]}'), 'old pillar-surface text (back) removed');
  });

  it('the floating Billboard god label moved up with the pillar top', () => {
    assert.ok(tower.includes('<Billboard position={[0, 24.5, 0]}>'), 'floating label at 24.5');
    assert.ok(!tower.includes('<Billboard position={[0, 16, 0]}>'), 'old label position gone (it would sit inside the top box)');
  });

  it('propellers moved to the new pillar top; the tail cone caps the stack', () => {
    assert.ok(tower.includes("position={[0, 20.5, 0]} rotation={[0, rot, 0]}"), 'propellers at 20.5');
    assert.ok(tower.includes('position={[0, -23.5, 0]}'), 'tail cone below level 3');
    assert.equal(-23.5 + 1, -22.5, 'tail top meets the pillar bottom exactly');
  });

  it('the hull cone is untouched (still pierces only the middle band)', () => {
    assert.ok(tower.includes('position={[0, -2, 0]}'), 'hull cone position unchanged');
  });

  it('new levels get their own colliders above and below the tower collider', () => {
    assert.ok(tower.includes('tower-${god}-top'), 'top collider id');
    assert.ok(tower.includes('y: position[1] + 22.72'), 'top collider centre (14.2 x 1.6 outer)');
    assert.ok(tower.includes('tower-${god}-bottom'), 'bottom collider id');
    assert.ok(tower.includes('y: position[1] - 25.92'), 'bottom collider centre (16.2 x 1.6 outer)');
    assert.ok(tower.includes('}), 13);'), 'new-level collider radius 13');
  });

  it('level names are internal only: no rendered text names a level', () => {
    // Merlin, 2026-10-27: "Multiverse = multi level one" is private
    // programming, NOT a public label. The only rendered texts on
    // the tower are god names ({god}: floating label + two name
    // bands) and badge numbers ({label} = String(number)). The
    // phrase lives in code comments only, never in a <Text>.
    const texts = [...tower.matchAll(/<Text[^>]*>([\s\S]*?)<\/Text>/g)];
    assert.ok(texts.length >= 4, `expected the rendered Text blocks, found ${texts.length}`);
    for (const [, body] of texts) {
      assert.ok(!/Level|Multiverse|multi level/i.test(body), `no level-name text rendered (found: ${body.trim()})`);
    }
    assert.ok(tower.includes('Multiverse = multi level one'), 'the private phrase is recorded in comments');
  });

  it('middle level mount, badges, and video path are unchanged', () => {
    assert.ok(tower.includes('badgeNumber={billboardNumberFor(towerIndex, i)}'), 'middle badges 1-44');
    assert.ok(tower.includes('slot={panels[i]}'), 'middle slots unchanged');
  });
});

describe('new-level house slots (lib/tower-panels.js, pure)', () => {
  it('provisional numbers: middle keeps 1–44, top 45–88, bottom 89–132', () => {
    assert.equal(billboardNumberFor(0, 0), 1);
    assert.equal(billboardNumberFor(10, 3), 44);
    assert.equal(topLevelBillboardNumberFor(0, 0), 45);
    assert.equal(topLevelBillboardNumberFor(10, 3), 88);
    assert.equal(bottomLevelBillboardNumberFor(0, 0), 89);
    assert.equal(bottomLevelBillboardNumberFor(10, 3), 132);
    assert.equal(TOP_LEVEL_BADGE_BASE, 44);
    assert.equal(BOTTOM_LEVEL_BADGE_BASE, 88);
  });

  it('a slot with paid + house entries keeps only the house entry', () => {
    const slot = {
      key: 'ad-7',
      entries: [
        { company: 'Paid', link: 'https://example.com', creativeType: 'video', creativeUrl: '/paid.mp4', house: false },
        { company: 'Olympus', link: 'https://olympusverse.com/request-billboard', creativeType: 'video', creativeUrl: '/billboards/house-ad-space.mp4', house: true },
      ],
    };
    const out = houseLevelSlot(slot);
    assert.equal(out.entries.length, 1);
    assert.equal(out.entries[0].house, true);
    assert.equal(out.entries[0].creativeUrl, '/billboards/house-ad-space.mp4');
    assert.equal(out.creativeType, 'video');
    assert.equal(out.key, 'ad-7', 'slot key preserved (stake face path intact)');
  });

  it('a slot with no house entry (solo board) falls back to the shipped house creative', () => {
    const slot = {
      key: 'ad-9',
      entries: [{ company: 'Solo', link: 'https://example.com', creativeType: 'video', creativeUrl: '/solo.mp4', house: false }],
    };
    const out = houseLevelSlot(slot);
    assert.equal(out.entries.length, 1);
    assert.equal(out.entries[0], HOUSE_FALLBACK_ENTRY);
    assert.equal(out.entries[0].creativeUrl, '/billboards/house-ad-space.mp4');
  });

  it('a slot with no entries array at all still yields the house video', () => {
    const out = houseLevelSlot({ key: 'stake' });
    assert.equal(out.entries.length, 1);
    assert.equal(out.entries[0].creativeType, 'video');
  });
});
