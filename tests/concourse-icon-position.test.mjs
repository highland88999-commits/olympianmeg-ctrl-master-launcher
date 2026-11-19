// tests/concourse-icon-position.test.mjs
// The Concourse icon (the Orb) is movable like the old Muse button
// and remembers where every user leaves it — indefinitely
// (Merlin, 2026-10-22, refining bug report 7d786bbe: "Concourse
// should be able to be moved to any place on the screen by any
// user").
//
// What these pin:
//   - tap vs drag: an 8px travel threshold (the Muse FAB model in
//     lib/muse-fab.js), factored through lib/concourse-icon.js;
//   - the drag top-left is clamped so the whole icon stays on
//     screen with an 8px margin, grab offset preserved;
//   - the position is viewport fractions: frac -> px -> frac round
//     trips, so one stored spot works on any screen size;
//   - restore precedence: account copy > device cache > default;
//   - the component wiring: pointer engine on the Orb, pointer
//     capture, touch-none, persistence via localStorage +
//     /api/ui-state concourse_orb (server jsonb, no TTL = no
//     expiry), and the tiles' hold-to-pin engine untouched.
//
// Run: node --test tests/concourse-icon-position.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  CONCOURSE_ICON_SIZE,
  ICON_DRAG_THRESHOLD_PX,
  ICON_EDGE_MARGIN,
  isIconDrag,
  sanitizeIconPosition,
  resolveIconPosition,
  iconFracToPx,
  iconPxToFrac,
  clampIconPx,
  dragIconTopLeft,
} from '../lib/concourse-icon.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const read = (p) => readFileSync(join(repo, p), 'utf8');
const concourse = read('components/Concourse.jsx');
const panel = read('components/ConcoursePortals.jsx');
const uiState = read('app/api/ui-state/route.js');

const PHONE = { w: 390, h: 844 };
const DESKTOP = { w: 1440, h: 900 };

describe('tap vs drag threshold (the Muse FAB model)', () => {
  it('a still press is a tap, never a drag', () => {
    assert.equal(isIconDrag(0, 0), false);
    assert.equal(isIconDrag(3, -2), false);
  });

  it('travel must EXCEED 8px to become a drag', () => {
    assert.equal(ICON_DRAG_THRESHOLD_PX, 8);
    assert.equal(isIconDrag(8, 0), false, 'exactly at the threshold is still a tap');
    assert.equal(isIconDrag(9, 0), true);
    assert.equal(isIconDrag(6, 6), true, 'diagonal travel counts (hypot ≈ 8.49)');
    assert.equal(isIconDrag(-20, 0), true, 'direction does not matter');
  });
});

describe('viewport clamp with a small margin', () => {
  it('keeps an 8px margin from every edge', () => {
    assert.equal(ICON_EDGE_MARGIN, 8);
    assert.deepEqual(clampIconPx({ x: -50, y: -50 }, PHONE.w, PHONE.h), { x: 8, y: 8 });
    assert.deepEqual(
      clampIconPx({ x: 10000, y: 10000 }, PHONE.w, PHONE.h),
      { x: PHONE.w - CONCOURSE_ICON_SIZE - 8, y: PHONE.h - CONCOURSE_ICON_SIZE - 8 }
    );
  });

  it('leaves an in-bounds position untouched', () => {
    assert.deepEqual(clampIconPx({ x: 100, y: 200 }, DESKTOP.w, DESKTOP.h), { x: 100, y: 200 });
  });

  it('never produces NaN on a degenerate viewport', () => {
    const c = clampIconPx({ x: 5, y: 5 }, 40, 40);
    assert.ok(Number.isFinite(c.x) && Number.isFinite(c.y));
  });
});

describe('drag math', () => {
  it('the grab offset is preserved — the icon does not jump under the finger', () => {
    const orig = { x: 100, y: 100 };
    const start = { x: 128, y: 140 }; // grabbed 28px in, 40px down
    const now = { x: 228, y: 240 };
    assert.deepEqual(dragIconTopLeft(orig, start, now, DESKTOP.w, DESKTOP.h), { x: 200, y: 200 });
  });

  it('a drag to any corner ends clamped inside the margin', () => {
    const orig = { x: 100, y: 100 };
    const start = { x: 110, y: 110 };
    assert.deepEqual(
      dragIconTopLeft(orig, start, { x: -999, y: -999 }, PHONE.w, PHONE.h),
      { x: 8, y: 8 }
    );
    assert.deepEqual(
      dragIconTopLeft(orig, start, { x: 9999, y: 9999 }, PHONE.w, PHONE.h),
      { x: PHONE.w - CONCOURSE_ICON_SIZE - 8, y: PHONE.h - CONCOURSE_ICON_SIZE - 8 }
    );
  });
});

describe('normalized coordinates round-trip', () => {
  const fracs = [
    { x: 0, y: 0 },
    { x: 0.5, y: 0.5 },
    { x: 1, y: 1 },
    { x: 0.25, y: 0.75 },
    { x: 0.9, y: 0.1 },
  ];
  for (const vp of [PHONE, DESKTOP, { w: 768, h: 1024 }]) {
    it(`frac -> px -> frac is stable on ${vp.w}x${vp.h}`, () => {
      for (const f of fracs) {
        const rt = iconPxToFrac(iconFracToPx(f, vp.w, vp.h), vp.w, vp.h);
        assert.ok(Math.abs(rt.x - f.x) < 1e-9, `x drift: ${f.x} -> ${rt.x}`);
        assert.ok(Math.abs(rt.y - f.y) < 1e-9, `y drift: ${f.y} -> ${rt.y}`);
      }
    });
  }

  it('the same fractions render fully on screen at both sizes', () => {
    for (const vp of [PHONE, DESKTOP]) {
      const px = iconFracToPx({ x: 1, y: 1 }, vp.w, vp.h);
      assert.equal(px.x + CONCOURSE_ICON_SIZE, vp.w);
      assert.equal(px.y + CONCOURSE_ICON_SIZE, vp.h);
    }
  });

  it('px -> frac clamps out-of-range drops into [0, 1]', () => {
    assert.deepEqual(iconPxToFrac({ x: -30, y: 99999 }, PHONE.w, PHONE.h), { x: 0, y: 1 });
  });
});

describe('restore precedence: server > local > default', () => {
  const server = { x: 0.2, y: 0.3 };
  const local = { x: 0.6, y: 0.7 };
  const fallback = { x: 0.9, y: 0.9 };

  it('the account copy wins when present (new device at login)', () => {
    assert.deepEqual(resolveIconPosition({ server, local, fallback }), server);
  });

  it('the device cache wins when there is no account copy', () => {
    assert.deepEqual(resolveIconPosition({ server: null, local, fallback }), local);
    assert.deepEqual(resolveIconPosition({ local, fallback }), local);
  });

  it('the default serves a user who never dragged', () => {
    assert.deepEqual(resolveIconPosition({ server: null, local: null, fallback }), fallback);
  });

  it('malformed values are skipped, never trusted', () => {
    assert.deepEqual(
      resolveIconPosition({ server: { x: 2, y: 0.5 }, local, fallback }),
      local,
      'out-of-range server value falls through to local'
    );
    assert.equal(resolveIconPosition({ server: 'junk', local: { x: NaN, y: 0 }, fallback: null }), null);
    assert.equal(sanitizeIconPosition({ x: 0.5 }), null, 'both axes required');
    assert.deepEqual(sanitizeIconPosition({ x: 0, y: 1 }), { x: 0, y: 1 }, 'edges are valid');
  });
});

describe('component wiring (components/Concourse.jsx)', () => {
  it('the Orb has its own pointer drag engine, wired to its pointer-down', () => {
    assert.ok(concourse.includes('const beginOrbDrag = (e) => {'), 'orb drag engine defined');
    assert.ok(concourse.includes('onPointerDown={beginOrbDrag}'), 'orb button uses it');
    assert.ok(!concourse.includes("beginPress('orb'"), 'the old hold-to-drag orb path is gone');
  });

  it('the engine uses pointer capture and the threshold helper', () => {
    assert.ok(concourse.includes('setPointerCapture(e.pointerId)'), 'pointer captured on the icon');
    assert.ok(concourse.includes('releasePointerCapture(info.pointerId)'), 'capture released on drop');
    assert.ok(concourse.includes('isIconDrag(dx, dy)'), 'tap vs drag decided by the 8px helper');
    assert.ok(concourse.includes('dragIconTopLeft('), 'drag position computed by the clamped helper');
    assert.ok(concourse.includes("from '@/lib/concourse-icon'"), 'helpers imported from the lib module');
  });

  it('a drag swallows its click; a tap still opens the Concourse', () => {
    assert.ok(concourse.includes('if (!info.moved) return; // plain tap — the click handler runs'));
    assert.ok(concourse.includes('onClick={() => { if (!tapGuard()) { setPortal3dOpen(true); } }}'), 'tap opens the merged menu');
  });

  it('the drop persists the remembered spot through the shared path', () => {
    assert.ok(concourse.includes('iconPxToFrac({ x: info.x, y: info.y }'), 'drop stored as fractions');
    assert.ok(concourse.includes('concourse_orb: orb'), 'saved to /api/ui-state as concourse_orb');
    assert.ok(concourse.includes('resolveIconPosition({ server: prefs.concourse_orb })'), 'account copy restores on login');
  });

  it('the Orb cannot fight page scroll on touch', () => {
    const orbAt = concourse.indexOf('onPointerDown={beginOrbDrag}');
    const orbChunk = concourse.slice(Math.max(0, orbAt - 1200), orbAt + 1200);
    assert.ok(orbChunk.includes('touch-none'), 'orb button is touch-none');
  });

  it('the tiles keep their hold-to-pin engine, untouched', () => {
    assert.ok(concourse.includes("beginPress('tile', tile.id, e)"), 'tiles still press-and-hold');
    assert.ok(concourse.includes('const HOLD_MS = 2000'), 'the 2s hold remains for tiles only');
  });

  it('the user is told the truth about the gesture', () => {
    assert.ok(panel.includes('Drag the Orb → put it anywhere. It stays where you leave it.'));
    assert.ok(concourse.includes('title="The Concourse — drag to move"'));
  });
});

describe('permanent memory (no expiry)', () => {
  it('the server key is plain validated jsonb — no TTL, no reset', () => {
    assert.ok(uiState.includes("if ('concourse_orb' in prefs)"));
    assert.ok(uiState.includes('patch.concourse_orb = sane'));
    assert.ok(!/concourse_orb[\s\S]{0,200}(expires|ttl|expiry)/i.test(uiState), 'no expiry attached to the key');
  });

  it('signed-out users still get device memory', () => {
    assert.ok(concourse.includes('if (!token) return; // signed out: localStorage only'));
    assert.ok(concourse.includes("const LS_KEY = 'olympus.concourse.v1'"), 'local cache key unchanged');
    assert.ok(concourse.includes('localStorage.setItem(LS_KEY'), 'local cache written instantly');
  });
});
