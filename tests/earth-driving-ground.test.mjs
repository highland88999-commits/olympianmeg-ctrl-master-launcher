// tests/earth-driving-ground.test.mjs — Pins for the 2026-10-27
// driving-void fix (Merlin's phone video: walking kept its
// photographic mosaic, but at Aventador boost the ground fell
// back to flat patch-green, then bare dark globe — a black void
// — while the chase camera pulled far back intermittently).
//
// Mechanism, measured from the code: boosted Aventador speed is
// 180 × 3 = 540 display m/s, so it crosses the 2700 m far disc
// in 5 s while a 1296-tile far build takes far longer; the
// mounted far sheets were always kilometres behind the car,
// the fine sheet is frozen while driving by design, and the
// patch (338 m) was the only current layer — beyond its rim
// lay bare lit globe, dark against the unlit sheets. The
// third-person camera lagged by speed/20 = 27 m at boost.
// Run: node tests/earth-driving-ground.test.mjs (from the repo root).
import { readFileSync } from 'fs';
import {
  LENS_PRESETS,
  lensTilePlan,
} from '../lib/earth/lens.js';

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

// --- The coarse fallback preset: same 1350 m radius as far,
// but 64 tiles (zoom 6, grid 8 spans exactly the 45° disc) so a
// build finishes in seconds and centre-first painting puts
// photographic ground under the car in its first fetches.
{
  const c = LENS_PRESETS.streetCoarse;
  t('streetCoarse preset exists', !!c);
  t('streetCoarse radius matches far (21.6)', c.radiusUnits === 21.6);
  t('streetCoarse zoom 6', c.zoom === 6);
  t('streetCoarse grid 8', c.grid === 8);
  t('streetCoarse canvas 640', c.canvasPx === 640);
  t('streetCoarse lift sits between patch (0.002) and far (0.003)',
    c.lift > 0.002 && c.lift < 0.003);
  const plan = lensTilePlan(53.55, -113.49, c.zoom, c.grid, c.canvasPx);
  t('streetCoarse plan is 64 tiles', plan.tiles.length === 64);
  t('streetCoarse plan tiles carry ESRI urls',
    plan.tiles.filter((x) => x.url).length > 0);
  // Pre-existing presets untouched (no mapping-math change).
  t('street preset unchanged', LENS_PRESETS.street.radiusUnits === 1.44
    && LENS_PRESETS.street.zoom === 12 && LENS_PRESETS.street.grid === 36);
  t('streetFar preset unchanged', LENS_PRESETS.streetFar.radiusUnits === 21.6
    && LENS_PRESETS.streetFar.zoom === 8 && LENS_PRESETS.streetFar.grid === 36);
}

// --- NexusEarth wiring (source-level: the component is JSX and
// headless tests pin its structure, as the other Earth suites do).
{
  const src = readFileSync('components/NexusEarth.jsx', 'utf8');
  t('coarse pool + state exist',
    src.includes('coarseSheetsRef') && src.includes('coarseSheets, setCoarseSheets'));
  t('coarse ctx renders below far (renderOrder 1)',
    src.includes('COARSE_CTX') && /renderOrder: 1/.test(src));
  t('coarse sheets rendered in JSX', src.includes('coarseSheets.map((s)'));
  t('coarse centre follows the traveler (not led ahead)',
    src.includes('coarseCenterRef.current = { lat: roamState.lat, lon: roamState.lon }'));
  t('coarse effect has no driving gate (it IS the driving layer)',
    /presetName: 'streetCoarse'/.test(src)
    && !/if \(driving\) \{ mgr\.pending = job; return undefined; \}\n[\s\S]{0,400}streetCoarse/.test(src));
  t('far builds freeze while driving (like the fine sheet)',
    /if \(driving\) \{ mgr\.pending = job; return undefined; \}\n[\s\S]{0,600}presetName: 'streetFar'/.test(src)
    || (src.includes("presetName: 'streetFar'") && src.includes('if (driving) { mgr.pending = job; return undefined; }')));
  t('stale-drop helper exists and far + coarse use it',
    src.includes('dropStaleBuild') && src.includes('dropStaleBuild(FAR_CTX')
    && src.includes('dropStaleBuild(COARSE_CTX'));
  t('finish only clears the pool for its own job (no race with a replacement build)',
    src.includes('if (mgr.job === job) { mgr.job = null; mgr.busy = false; }'));
  t('unmount disposes coarse sheets',
    src.includes('coarseLensBuildRef.current.alive = false'));
}

// --- Chase camera: third-person follow rate scales with mounted
// speed so the speed/20 lag (27 m at boost) collapses to < 1 m.
{
  const fc = readFileSync('components/EarthFlightController.jsx', 'utf8');
  t('camera rate scales with mounted speed',
    fc.includes('carState.mounted ? (carState.speed || 0) * 3 : 0')
    && fc.includes('20 + speedMps * 1.5'));
  t('first-person snap untouched', fc.includes('camera.position.copy(camPos)'));
}

console.log(`earth-driving-ground: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
