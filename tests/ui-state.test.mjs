// tests/ui-state.test.mjs
// /api/ui-state whitelist: orb-dock spots per world + portal progress
// (Merlin, Nov 17 ~14:00 — sync across devices, Supabase, not
// Cloudflare). The route only accepts known keys; these two families
// were silently dropped before this change.
// Run: node tests/ui-state.test.mjs (from the repo root).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sanitizeFractions } from '../lib/muse-fab.js';
import {
  ORB_DOCK_UI_STATE_KEY, orbDockUiStateKeyFor, sanitizeOrbDockMap,
} from '../lib/world/orb-dock.js';
import { sanitizePortalProgress, emptyPortalProgress } from '../lib/portal/progress.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const route = read('../app/api/ui-state/route.js');
const hook = read('../components/world/useOrbDock.js');
const progress = read('../lib/portal/progress.js');
const hePage = read('../app/hollow-earth/page.jsx');

// ── Client and server agree on the key names ──────────────────────
test('orb-dock keys: client naming matches the route whitelist', () => {
  assert.equal(ORB_DOCK_UI_STATE_KEY, 'hollow_earth_orb_dock');
  assert.equal(orbDockUiStateKeyFor('jupiter-2'), 'jupiter2_orb_dock');
  assert.equal(orbDockUiStateKeyFor('middle-earth'), 'middleearth_orb_dock');
});

// ── Route whitelist (static: the route module itself cannot run in node) ──
test('route whitelists exactly the three live worlds, with shapes', () => {
  assert.match(route, /const ORB_DOCK_UI_STATE_KEYS = \{/);
  assert.match(route, /hollow_earth_orb_dock: 'single'/);
  assert.match(route, /jupiter2_orb_dock: 'map'/);
  assert.match(route, /middleearth_orb_dock: 'map'/);
  // The loop only ever iterates the whitelist — an unknown world key
  // in the request is ignored, never stored.
  assert.match(route, /for \(const \[key, shape\] of Object\.entries\(ORB_DOCK_UI_STATE_KEYS\)\)/);
  assert.match(route, /if \(!\(key in prefs\)\) continue;/);
});

test('route does not whitelist the ControlsCore worlds yet', () => {
  // Mars 2 / Earth 3 / Earth 4 also use useOrbDock, but their keys
  // are not whitelisted until Merlin says so — one entry each.
  assert.doesNotMatch(route, /mars2_orb_dock/);
  assert.doesNotMatch(route, /newearth_orb_dock/);
  assert.doesNotMatch(route, /earth4_orb_dock/);
});

test('route accepts portal-progress via a mirrored sanitizer', () => {
  // The route CANNOT import lib/portal/progress.js (it imports
  // useSyncExternalStore — next build rejects it in a server
  // route), so the logic is mirrored in the route file. Pin both
  // the mirror's presence and the absence of the import.
  assert.doesNotMatch(route, /from '@\/lib\/portal\/progress'/);
  assert.match(route, /function sanitizePortalProgressPatch\(raw\)/);
  assert.match(route, /const num0 = \(v\) => \{\n\s+const n = Math\.floor\(Number\(v\)\);\n\s+return Number\.isFinite\(n\) && n > 0 \? n : 0;\n\s+\};/);
  assert.match(route, /out\.netherVisits = num0\(raw\.netherVisits\);/);
  assert.match(route, /out\.totalPortals = num0\(raw\.totalPortals\);/);
  assert.match(route, /out\.gunGranted = raw\.gunGranted === true;/);
  assert.match(route, /if \('portal-progress' in prefs\)/);
  assert.match(route, /patch\['portal-progress'\] = sanitizePortalProgressPatch\(prefs\['portal-progress'\]\);/);
});

test('route rejects a non-object orb-dock value with a 400', () => {
  assert.match(route, /import \{ sanitizeOrbDockMap \} from '@\/lib\/world\/orb-dock';/);
  assert.match(route, /if \(!raw \|\| typeof raw !== 'object' \|\| Array\.isArray\(raw\)\) \{\n\s+return NextResponse\.json\(\{ error: `\$\{key\} must be an object of positions\.` \}, \{ status: 400 \}\);/);
  assert.match(route, /patch\[key\] = sanitizeOrbDockMap\(raw\);/);
});

// ── Orb-dock map: valid kept, malformed dropped, non-object empty ──
test('orb-dock map: valid entries kept, malformed dropped', () => {
  const kept = sanitizeOrbDockMap({
    summon: { x: 0.2, y: 0.8 },
    jump: { x: 0.9, y: 0.1 },
  });
  assert.deepEqual(kept, { summon: { x: 0.2, y: 0.8 }, jump: { x: 0.9, y: 0.1 } });

  const cleaned = sanitizeOrbDockMap({
    good: { x: 0.5, y: 0.5 },
    offscreen: { x: 1.4, y: 0.5 },
    negative: { x: 0.5, y: -0.2 },
    notNumbers: { x: 'left', y: 0.5 },
    nullEntry: null,
    stringEntry: 'home',
  });
  assert.deepEqual(cleaned, { good: { x: 0.5, y: 0.5 } });
});

test('orb-dock map: non-object is an empty map (route 400s above it)', () => {
  assert.deepEqual(sanitizeOrbDockMap(null), {});
  assert.deepEqual(sanitizeOrbDockMap('home'), {});
  assert.deepEqual(sanitizeOrbDockMap([1, 2]), {});
  assert.deepEqual(sanitizeOrbDockMap({}), {});
});

// ── Hollow Earth single spot: one fraction, [0, 1] ────────────────
test('orb-dock single spot: valid kept, out-of-range rejected', () => {
  assert.deepEqual(sanitizeFractions({ x: 0.2, y: 0.8 }), { x: 0.2, y: 0.8 });
  assert.equal(sanitizeFractions({ x: 1.2, y: 0.5 }), null);
  assert.equal(sanitizeFractions({ x: 0.5, y: -0.1 }), null);
  assert.equal(sanitizeFractions({ x: '0.5', y: 0.5 }), null);
  assert.equal(sanitizeFractions(null), null);
});

// ── Portal progress: the shared sanitizer's contract ──────────────
test('portal-progress: a valid record passes through', () => {
  const rec = sanitizePortalProgress({ v: 1, netherVisits: 3, totalPortals: 10, gunGranted: true });
  assert.deepEqual(rec, { v: 1, netherVisits: 3, totalPortals: 10, gunGranted: true });
});

test('portal-progress: negatives floor to 0, floats floor, flag is boolean', () => {
  const rec = sanitizePortalProgress({ v: 1, netherVisits: -3, totalPortals: 2.7, gunGranted: 'yes' });
  assert.deepEqual(rec, { v: 1, netherVisits: 0, totalPortals: 2, gunGranted: false });
  const missing = sanitizePortalProgress({ v: 1 });
  assert.deepEqual(missing, emptyPortalProgress());
});

test('portal-progress: a non-object coerces to the empty record', () => {
  assert.deepEqual(sanitizePortalProgress(null), emptyPortalProgress());
  assert.deepEqual(sanitizePortalProgress('visited'), emptyPortalProgress());
  assert.deepEqual(sanitizePortalProgress([1, 2]), emptyPortalProgress());
});

// ── The client mirror is actually wired (not assumed) ─────────────
test('useOrbDock POSTs its map and GETs the account copy back', () => {
  assert.match(hook, /await fetch\('\/api\/ui-state', \{\n\s+method: 'POST',/);
  assert.match(hook, /body: JSON\.stringify\(\{ preferences: \{ \[uiStateKey\]: nextMap \} \}\),/);
  assert.match(hook, /const res = await fetch\('\/api\/ui-state', \{ headers: \{ Authorization: `Bearer \$\{token\}` \}, cache: 'no-store' \}\);/);
  assert.match(hook, /data\.preferences\[uiStateKey\]/);
});

test('portal progress POSTs its record and GETs the account copy back', () => {
  assert.match(progress, /body: JSON\.stringify\(\{ preferences: \{ 'portal-progress': state \} \}\),/);
  assert.match(progress, /data\.preferences\['portal-progress'\]/);
});

test('Hollow Earth POSTs its single spot and GETs the account copy back', () => {
  assert.match(hePage, /body: JSON\.stringify\(\{ preferences: \{ \[ORB_DOCK_UI_STATE_KEY\]: frac \} \}\),/);
  assert.match(hePage, /data\.preferences\[ORB_DOCK_UI_STATE_KEY\]/);
});
