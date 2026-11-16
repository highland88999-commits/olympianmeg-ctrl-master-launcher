// tests/earth-render-queue.test.mjs — Pins for the 2026-10-27
// Earth 1 street render queue (Merlin's second phone video:
// driving fell into a dark void that NEVER recovered, not even
// on foot afterward — so land passed over must queue for
// rendering, in a car the radius must double, builds must run
// ahead-first and work back, already-rendered tiles must be
// skipped, and a periodic reconciliation must heal any void).
// Run: node tests/earth-render-queue.test.mjs (from the repo root).
import { readFileSync } from 'fs';
import {
  LENS_PRESETS,
  lensTilePlan,
} from '../lib/earth/lens.js';
import { tileCellKey } from '../lib/earth/lens-cache.js';
import {
  coarsePresetFor,
  centreDistanceHub,
  stepAlongHeading,
  bearingBetween,
  planTrailCentres,
  isCentreRendered,
  filterUnrenderedCentres,
  sortByAheadness,
  pruneStaleQueue,
  capTrailQueue,
  lacksMountedCoverage,
  RENDER_QUEUE_RECONCILE_MS,
  TRAIL_QUEUE_MAX,
} from '../lib/earth/render-queue.js';

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

const HOME = { lat: 53.55, lon: -113.49 }; // Edmonton / Redwater area
const approx = (a, b, eps) => Math.abs(a - b) <= eps;

// --- The doubled driving preset: same 64-tile cost, 2x radius.
{
  const w = LENS_PRESETS.streetCoarseWide;
  t('streetCoarseWide preset exists', !!w);
  t('streetCoarseWide radius is exactly 2x coarse (43.2)',
    w.radiusUnits === 2 * LENS_PRESETS.streetCoarse.radiusUnits && w.radiusUnits === 43.2);
  t('streetCoarseWide zoom 5 (8 x 11.25 deg = 90 deg disc)', w.zoom === 5);
  t('streetCoarseWide grid 8', w.grid === 8);
  t('streetCoarseWide canvas 640', w.canvasPx === 640);
  t('streetCoarseWide plan is 64 tiles',
    lensTilePlan(HOME.lat, HOME.lon, w.zoom, w.grid, w.canvasPx).tiles.length === 64);
  t('streetCoarseWide lift sits below coarse (wins never fight it) but above patch',
    w.lift > 0.002 && w.lift < LENS_PRESETS.streetCoarse.lift);
  t('coarse preset unchanged', LENS_PRESETS.streetCoarse.radiusUnits === 21.6
    && LENS_PRESETS.streetCoarse.zoom === 6 && LENS_PRESETS.streetCoarse.grid === 8);
  t('coarsePresetFor: on foot -> streetCoarse, in car -> streetCoarseWide',
    coarsePresetFor(false) === 'streetCoarse' && coarsePresetFor(true) === 'streetCoarseWide');
}

// --- Heading math: yawDeg is compass (0 = north, 90 = east).
{
  const n = stepAlongHeading(HOME.lat, HOME.lon, 0, 21.6);
  t('step north raises latitude, holds longitude', n.lat > HOME.lat && approx(n.lon, HOME.lon, 0.01));
  const e = stepAlongHeading(HOME.lat, HOME.lon, 90, 21.6);
  t('step east raises longitude', e.lon > HOME.lon);
  // Great-circle truth (same as roam.js's own lead math): a
  // due-east great circle from mid-latitudes drifts to lower
  // latitude as it runs — the step is a rotation, not a
  // latitude-parallel slide. Only the longitude gain is pinned.
  const back = stepAlongHeading(n.lat, n.lon, 180, 21.6);
  t('step north then south returns home', approx(back.lat, HOME.lat, 0.01) && approx(back.lon, HOME.lon, 0.01));
  t('step distance matches the preset radius',
    approx(centreDistanceHub(HOME, n), 21.6, 0.01));
  t('bearing north is 0, east is 90',
    approx(bearingBetween(HOME, n), 0, 0.5) && approx(bearingBetween(HOME, e), 90, 0.5));
}

// --- Trail plan: ahead, current, behind — in that order.
{
  const trail = planTrailCentres({ lat: HOME.lat, lon: HOME.lon, headingDeg: 0, driving: false });
  t('trail plan has 3 centres', trail.length === 3);
  t('trail order: ahead first (north of home)', trail[0].lat > HOME.lat);
  t('trail order: current second', trail[1].lat === HOME.lat && trail[1].lon === HOME.lon);
  t('trail order: behind third (south of home)', trail[2].lat < HOME.lat);
  t('trail centres sit one radius apart',
    approx(centreDistanceHub(HOME, trail[0]), 21.6, 0.01)
    && approx(centreDistanceHub(HOME, trail[2]), 21.6, 0.01));
  t('trail on foot uses streetCoarse', trail.every((c) => c.presetName === 'streetCoarse'));
  const car = planTrailCentres({ lat: HOME.lat, lon: HOME.lon, headingDeg: 90, driving: true });
  t('trail in car uses streetCoarseWide', car.every((c) => c.presetName === 'streetCoarseWide'));
  t('trail in car spans the doubled radius',
    approx(centreDistanceHub(HOME, car[0]), 43.2, 0.01));
  t('trail in car heads east first', car[0].lon > HOME.lon);
}

// --- Dedup: rendered record + in-session half-radius rule.
{
  const preset = LENS_PRESETS.streetCoarse;
  const plan = lensTilePlan(HOME.lat, HOME.lon, preset.zoom, preset.grid, preset.canvasPx);
  const key = tileCellKey('streetCoarse', plan);
  const centre = { lat: HOME.lat, lon: HOME.lon, presetName: 'streetCoarse' };
  t('recorded cell key dedups', isCentreRendered(centre, { renderedKeys: [key], sessionCentres: [] }));
  t('unrecorded, unmounted centre is NOT rendered',
    !isCentreRendered(centre, { renderedKeys: [], sessionCentres: [] }));
  // A session centre 0.4 radii away: same corridor, skip.
  const near = stepAlongHeading(HOME.lat, HOME.lon, 0, 21.6 * 0.4);
  t('session centre within half a radius dedups',
    isCentreRendered(centre, { renderedKeys: [], sessionCentres: [near] }));
  // A session centre 0.8 radii away: genuinely new ground, build.
  const far = stepAlongHeading(HOME.lat, HOME.lon, 0, 21.6 * 0.8);
  t('session centre beyond half a radius does NOT dedup',
    !isCentreRendered(centre, { renderedKeys: [], sessionCentres: [far] }));
  const trail = planTrailCentres({ lat: HOME.lat, lon: HOME.lon, headingDeg: 0, driving: false });
  t('filter keeps the whole trail when nothing is rendered',
    filterUnrenderedCentres(trail, { renderedKeys: [], sessionCentres: [] }).length === 3);
  t('filter drops the current centre when its cell is recorded',
    filterUnrenderedCentres(trail, { renderedKeys: [key], sessionCentres: [] }).length === 2);
}

// --- Ahead-first ranking across a mixed queue.
{
  const ahead = stepAlongHeading(HOME.lat, HOME.lon, 0, 21.6);
  const behind = stepAlongHeading(HOME.lat, HOME.lon, 180, 21.6);
  const ranked = sortByAheadness([behind, { ...HOME }, ahead], HOME.lat, HOME.lon, 0);
  t('sortByAheadness: ahead, current, behind',
    ranked[0].lat === ahead.lat && ranked[1].lat === HOME.lat && ranked[2].lat === behind.lat);
  t('sortByAheadness does not mutate the input',
    (() => {
      const input = [behind, { ...HOME }, ahead];
      sortByAheadness(input, HOME.lat, HOME.lon, 0);
      return input[0].lat === behind.lat;
    })());
}

// --- Queue hygiene: stale pruning + farthest-first cap.
{
  const far = stepAlongHeading(HOME.lat, HOME.lon, 0, 21.6 * 3);
  const near = stepAlongHeading(HOME.lat, HOME.lon, 0, 21.6 * 0.5);
  const pruned = pruneStaleQueue([far, near], HOME.lat, HOME.lon, 21.6);
  t('prune drops centres beyond two radii, keeps the near one',
    pruned.length === 1 && pruned[0].lat === near.lat);
  const behind = stepAlongHeading(HOME.lat, HOME.lon, 180, 21.6);
  t('prune keeps the one-radius-behind trail centre',
    pruneStaleQueue([behind], HOME.lat, HOME.lon, 21.6).length === 1);
  const many = [];
  for (let i = 0; i < TRAIL_QUEUE_MAX + 4; i++) {
    many.push(stepAlongHeading(HOME.lat, HOME.lon, 0, 21.6 * 0.6 * (i + 1)));
  }
  const capped = capTrailQueue(many, HOME.lat, HOME.lon);
  t('cap holds at TRAIL_QUEUE_MAX', capped.length === TRAIL_QUEUE_MAX);
  t('cap keeps the closest centres (drops the farthest)',
    capped.every((c) => centreDistanceHub(HOME, c) <= 21.6 * 0.6 * TRAIL_QUEUE_MAX));
  t('reconcile beat is 10 s', RENDER_QUEUE_RECONCILE_MS === 10000);
}

// --- Recovery: the mounted-coverage question.
{
  t('empty sheets = void', lacksMountedCoverage(HOME.lat, HOME.lon, []));
  t('a far sheet covering home = covered',
    !lacksMountedCoverage(HOME.lat, HOME.lon,
      [{ lat: HOME.lat, lon: HOME.lon, radiusUnits: 21.6 }]));
  const edge = stepAlongHeading(HOME.lat, HOME.lon, 0, 21.6 * 1.5);
  t('a sheet centred 1.5 radii away does NOT cover home',
    lacksMountedCoverage(HOME.lat, HOME.lon,
      [{ lat: edge.lat, lon: edge.lon, radiusUnits: 21.6 }]));
  const wide = { lat: HOME.lat, lon: HOME.lon, radiusUnits: 43.2 };
  const away = stepAlongHeading(HOME.lat, HOME.lon, 90, 43.2 * 0.9);
  t('a wide sheet covers a point 0.9 radii away',
    !lacksMountedCoverage(away.lat, away.lon, [wide]));
}

// --- Component wiring is GONE (Merlin, 2026-11-15 — tiles no
// longer render in Earth 1): the render queue, the coarse pool,
// the pumps and the recovery reconciler all went with the lens
// system. The pure queue helpers above stay pinned for the
// record; NexusEarth must not reference any of them.
{
  const src = readFileSync('components/NexusEarth.jsx', 'utf8');
  t('component no longer imports the render queue', !src.includes("from '@/lib/earth/render-queue'"));
  t('no coarse pool remains',
    !src.includes('coarseSheetsRef') && !src.includes('MAX_COARSE_LENS_SHEETS = 3'));
  t('no queue manager remains', !src.includes('queue: []') && !src.includes('mgr.queue.shift()'));
  t('no trail planning remains', !src.includes('planTrailCentres('));
  t('no dedup against the painted record remains',
    !src.includes('filterUnrenderedCentres(') && !src.includes('loadRenderedTileKeys()'));
  t('no aheadness re-ranking remains', !src.includes('sortByAheadness('));
  t('no stale pruning remains', !src.includes('pruneStaleQueue('));
  t('no queue capping remains', !src.includes('capTrailQueue('));
  t('no driving-flip re-run remains', !/\[coarseCenterKey, heightReady, roaming, driving\]/.test(src));
  t('no driving-aware recenter remains',
    !src.includes('coarsePresetFor(drivingRef.current)'));
  t('no recovery reconciler remains',
    !src.includes('RENDER_QUEUE_RECONCILE_MS') && !src.includes('lacksMountedCoverage('));
  t('no dedup bypass remains', !src.includes('mgr.queue.unshift('));
  t('no governor mechanism anywhere in the queue path (the word survives only in comments explaining its absence)',
    !/governorRef|useGovernor|GOVERNOR|governorMs/.test(src)
    && !/governorRef|useGovernor|GOVERNOR|governorMs/.test(readFileSync('lib/earth/render-queue.js', 'utf8')));
}

// --- Mission pill no longer sits on the camera buttons.
{
  const prompt = readFileSync('components/EarthOblivionPrompt.jsx', 'utf8');
  t('pill moved below the camera column (9.5rem top in its style)',
    /top: 'calc\(env\(safe-area-inset-top, 0px\) \+ 9\.5rem\)'/.test(prompt));
  t('pill text is the corrected line (no Oblivion claim) and dismissal unchanged',
    prompt.includes('Map this world — the ancient giants still walk here, waiting to be found')
    && prompt.includes('setDismissed(true)'));
  t('pill text never claims mapping triggers Oblivion',
    !prompt.includes('Map this world to trigger Oblivion'));
}

console.log(`earth-render-queue: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
