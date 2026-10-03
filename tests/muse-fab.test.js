// tests/muse-fab.test.js — Headless tests for the draggable Muse FAB.
// Run: node tests/muse-fab.test.js (from the repo root).
// No browser, no network — asserts on lib/muse-fab.js pure helpers.
import {
  FAB_SIZE,
  DRAG_THRESHOLD_PX,
  EDGE_MARGIN,
  fractionsToPixels,
  pixelsToFractions,
  clampFractions,
  clampPixels,
  defaultFractions,
  sanitizeFractions,
  isDrag,
  resolveFractions,
} from '../lib/muse-fab.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) {
    passed += 1;
  } else {
    failed += 1;
    console.error('FAIL:', name);
  }
}
function close(a, b, eps = 1e-9) {
  return Math.abs(a - b) < eps;
}

// --- fraction <-> pixel round trips (iPhone-ish 390x844) ---
{
  const vw = 390, vh = 844;
  const f = { x: 0.25, y: 0.75 };
  const p = fractionsToPixels(f.x, f.y, vw, vh);
  t('fractionsToPixels x', close(p.x, 0.25 * (vw - FAB_SIZE)));
  t('fractionsToPixels y', close(p.y, 0.75 * (vh - FAB_SIZE)));
  const back = pixelsToFractions(p.x, p.y, vw, vh);
  t('round trip x', close(back.x, f.x));
  t('round trip y', close(back.y, f.y));
}
{
  // corners map to corners
  const p0 = fractionsToPixels(0, 0, 390, 844);
  t('origin maps to 0,0', p0.x === 0 && p0.y === 0);
  const p1 = fractionsToPixels(1, 1, 390, 844);
  t('1,1 maps to max', p1.x === 390 - FAB_SIZE && p1.y === 844 - FAB_SIZE);
}
{
  // desktop-ish viewport
  const vw = 1440, vh = 900;
  const f = pixelsToFractions(1000, 700, vw, vh);
  const p = fractionsToPixels(f.x, f.y, vw, vh);
  t('desktop round trip', close(p.x, 1000) && close(p.y, 700));
}

// --- clamping ---
{
  const c = clampFractions(1.5, -0.2);
  t('clampFractions high/low', c.x === 1 && c.y === 0);
  const cn = clampFractions(NaN, Infinity);
  t('clampFractions non-finite -> 0', cn.x === 0 && cn.y === 0);
}
{
  const insets = { top: 47, right: 0, bottom: 34, left: 0 }; // iPhone notch + home bar
  const c = clampPixels(-50, -50, 390, 844, FAB_SIZE, insets);
  t('clampPixels top-left respects insets', c.x === EDGE_MARGIN && c.y === 47 + EDGE_MARGIN);
  const c2 = clampPixels(500, 900, 390, 844, FAB_SIZE, insets);
  t('clampPixels bottom-right respects insets',
    c2.x === 390 - FAB_SIZE - EDGE_MARGIN && c2.y === 844 - FAB_SIZE - 34 - EDGE_MARGIN);
  const c3 = clampPixels(100, 400, 390, 844, FAB_SIZE, insets);
  t('clampPixels interior untouched', c3.x === 100 && c3.y === 400);
  // degenerate tiny viewport: centers instead of NaN
  const c4 = clampPixels(0, 0, 40, 40, FAB_SIZE, insets);
  t('clampPixels degenerate viewport finite', Number.isFinite(c4.x) && Number.isFinite(c4.y));
}

// --- default spot matches the old CSS (right:12px, bottom:112px+safe) ---
{
  const vw = 390, vh = 844;
  const d = defaultFractions(vw, vh, FAB_SIZE, 0, 34);
  const p = fractionsToPixels(d.x, d.y, vw, vh);
  t('default right edge 12px', close(p.x, vw - FAB_SIZE - 12));
  t('default bottom edge 112px+safe', close(p.y, vh - FAB_SIZE - 112 - 34));
}

// --- sanitize ---
{
  t('sanitize valid', JSON.stringify(sanitizeFractions({ x: 0.5, y: 0.5 })) === '{"x":0.5,"y":0.5}');
  t('sanitize boundaries ok', sanitizeFractions({ x: 0, y: 1 }) !== null);
  t('sanitize null', sanitizeFractions(null) === null);
  t('sanitize string', sanitizeFractions('0.5') === null);
  t('sanitize out of range', sanitizeFractions({ x: 1.2, y: 0.5 }) === null);
  t('sanitize NaN', sanitizeFractions({ x: NaN, y: 0.5 }) === null);
  t('sanitize missing y', sanitizeFractions({ x: 0.5 }) === null);
  t('sanitize array', sanitizeFractions([0.5, 0.5]) === null);
}

// --- tap vs drag threshold ---
{
  t('no move is a tap', isDrag(0, 0) === false);
  t('7px diagonal is a tap', isDrag(5, 5) === false); // hypot ~7.07 < 8
  t('9px is a drag', isDrag(9, 0) === true);
  t('threshold constant is 8', DRAG_THRESHOLD_PX === 8);
  t('custom threshold respected', isDrag(5, 0, 4) === true && isDrag(5, 0, 6) === false);
}

// --- resolveFractions: stored -> default fallback -> clamp ---
{
  const insets = { top: 0, right: 0, bottom: 34, left: 0 };
  const r = resolveFractions({ x: 0.1, y: 0.1 }, 390, 844, FAB_SIZE, insets);
  t('resolve keeps valid stored', close(r.x, 0.1) && close(r.y, 0.1));
  const r2 = resolveFractions(null, 390, 844, FAB_SIZE, insets);
  const d = defaultFractions(390, 844, FAB_SIZE, 0, 34);
  const rd = resolveFractions(d, 390, 844, FAB_SIZE, insets);
  t('resolve null falls back to default', close(r2.x, rd.x) && close(r2.y, rd.y));
  const r3 = resolveFractions({ x: 0.999, y: 0.999 }, 390, 844, FAB_SIZE, insets);
  const p3 = fractionsToPixels(r3.x, r3.y, 390, 844);
  t('resolve clamps into safe area', p3.y <= 844 - FAB_SIZE - 34 - EDGE_MARGIN + 1e-9);
  // resize stability: same fractions re-resolved on a new viewport stay in range
  const r4 = resolveFractions({ x: 0.9, y: 0.9 }, 1440, 900, FAB_SIZE, null);
  t('resolve desktop in range', r4.x >= 0 && r4.x <= 1 && r4.y >= 0 && r4.y <= 1);
}

console.log(`muse-fab: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
