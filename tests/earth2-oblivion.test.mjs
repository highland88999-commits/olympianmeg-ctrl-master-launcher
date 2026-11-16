// tests/earth2-oblivion.test.mjs — the Oblivion sequence
// (Merlin, 2026-10-26 late evening orders + refinements).
//
//   1. Oblivion triggers -> Earth gets sucked into the middle
//      and disappears (original shader cinematic in the reference
//      video's grammar — bloom -> inward pull -> collapse into
//      the void -> gone; never the video file itself).
//   2. THEN the 3D countdown of 72 hours begins, on a floating
//      holographic 4-sided cube, oriented horizontally like a
//      hockey arena's center-ice scoreboard cube, with the three
//      portal link buttons beneath it (Concourse, Portal Room,
//      Program Menu — real navigation, not labels; this
//      SUPERSEDES the short curated program list).
//   3. AT THE END (countdown reaches 0) -> Earth 2 is released
//      for EACH MEMBER of the passing team (default definition:
//      every team that earned entry, solo teams included;
//      server-enforced, never client-claimed).
//
// BLACKOUT RULE (his explicit refinement): the back of each cube
// face is BLACKED OUT — every face carries its display on the
// front with an opaque black backing behind it, so the opposite
// face's numbers can never bleed through. Pinned here as the
// face contract + the renderer's two locks (opaque backing,
// front-side-only planes).
//
// A true end-to-end release cannot be proven live until a real
// Oblivion (arming is Merlin's Oblivion Day step:
// OBLIVION_ENDS_AT in the Vercel environment, no dashboard SQL
// needed — the teams tables already exist). What IS pinned here:
// the math, the phases, the cube contract, the release
// definition, and the shipped UI/server wiring by source pins.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  OBLIVION_WAIT_MS,
  COLLAPSE_PHASES,
  COLLAPSE_TOTAL_MS,
  collapsePhaseAt,
  remainingMs,
  formatCountdown,
  CUBE_FACE_COUNT,
  CUBE_FACE_BACKING,
  CUBE_FACES,
  RELEASE_QUALIFYING_MODE,
  isReleaseQualified,
  releaseState,
} from '../lib/earth/oblivion.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf-8');

let n = 0;
const check = (cond, msg) => {
  n += 1;
  assert.ok(cond, msg);
};

// The wait is 72 hours, exactly.
check(OBLIVION_WAIT_MS === 72 * 60 * 60 * 1000, 'wait is exactly 72 hours');

// Collapse phases: bloom -> pull -> collapse -> done, ~9.5 s.
check(COLLAPSE_TOTAL_MS === 9500, 'collapse totals 9500 ms');
check(COLLAPSE_PHASES.map((p) => p.key).join(',') === 'bloom,pull,collapse', 'phases in order');
check(collapsePhaseAt(0) === 'bloom', 't=0 blooms');
check(collapsePhaseAt(2499) === 'bloom', 't=2499 still blooms');
check(collapsePhaseAt(2500) === 'pull', 't=2500 pulls inward');
check(collapsePhaseAt(6999) === 'pull', 't=6999 still pulling');
check(collapsePhaseAt(7000) === 'collapse', 't=7000 collapses');
check(collapsePhaseAt(9499) === 'collapse', 't=9499 still collapsing');
check(collapsePhaseAt(9500) === 'done', 't=9500 done');
check(collapsePhaseAt(99999) === 'done', 'late t stays done');

// Countdown math: hours uncapped (72 reads as 72), floor at 0.
check(remainingMs(1000, 4000) === 0, 'remaining never goes negative');
check(remainingMs(5000, 1000) === 4000, 'remaining subtracts');
check(formatCountdown(72 * 3600 * 1000) === '72:00:00', '72 hours reads 72:00:00');
check(formatCountdown(0) === '00:00:00', 'zero reads 00:00:00');
check(formatCountdown(3661000) === '01:01:01', '3661 s reads 01:01:01');
check(formatCountdown(90061000) === '25:01:01', 'hours pass 24 uncapped');

// Cube contract: 4 faces, horizontal ring, opaque-black backing each.
check(CUBE_FACE_COUNT === 4, 'cube has 4 faces');
check(CUBE_FACES.length === 4, 'face list has 4 entries');
check(CUBE_FACES.map((f) => f.angleDeg).join(',') === '0,90,180,270', 'faces ring horizontally');
check(CUBE_FACES.every((f) => f.backing === 'opaque-black'), 'every face backing is opaque-black');
check(CUBE_FACE_BACKING === 'opaque-black', 'backing constant is opaque-black');

// Release definition: team-members mode, solo teams included.
check(RELEASE_QUALIFYING_MODE === 'team-members', 'qualifying mode is team-members');
check(isReleaseQualified({ mode: 'team-members', memberRows: [{ team_id: 'x' }] }) === true, 'member qualifies');
check(isReleaseQualified({ mode: 'team-members', memberRows: [] }) === false, 'non-member does not qualify');
check(isReleaseQualified({ mode: 'something-else', memberRows: [{ team_id: 'x' }] }) === false, 'unknown mode qualifies nobody');

// Release state combinations.
const base = { endsAtMs: 100000, nowMs: 50000 };
check(releaseState({ ...base, armed: false, memberRows: [], preAccess: false }).released === false, 'unarmed releases nobody new');
check(releaseState({ ...base, armed: false, memberRows: [], preAccess: true }).released === true, 'unarmed keeps pre-existing access');
check(releaseState({ ...base, armed: true, memberRows: [], preAccess: false }).released === false, 'before end, memberless user not released');
check(releaseState({ ...base, armed: true, memberRows: [{ team_id: 'x' }], preAccess: false }).released === false, 'before end, member not yet released');
check(releaseState({ ...base, armed: true, nowMs: 100000, memberRows: [{ team_id: 'x' }], preAccess: false }).released === true, 'at end, member released');
check(releaseState({ ...base, armed: true, nowMs: 100000, memberRows: [], preAccess: false }).released === false, 'at end, non-member still locked');
check(releaseState({ ...base, armed: true, nowMs: 100000, memberRows: [], preAccess: true }).released === true, 'at end, pre-access still holds');

// Shipped wiring, by source pins.
const page = read('app/oblivion/page.jsx');
check(page.includes("href: '/?concourse=1'"), 'waiting page links Concourse with ?concourse=1');
check(page.includes("href: '/?concourse=1&portals3d=1'"), 'waiting page links Portals 3D with the hall deep link');
check(page.includes("href: '/'"), 'waiting page links Program Menu to the hub');
check(page.includes('OblivionCountdownCube'), 'waiting page renders the countdown cube');
check(page.includes('OblivionCollapse'), 'waiting page renders the collapse cinematic');
check(page.includes('/api/earth2/release'), 'waiting page reads the server release status');
check(page.includes('While you wait, step into any portal'), 'waiting copy frames the three portal buttons');
const cube = read('components/earth/OblivionCountdownCube.jsx');
check(cube.includes('CUBE_FACES'), 'cube renders from the CUBE_FACES contract');
check(cube.includes('color: 0x000000'), 'cube has an opaque black backing plane');
check(cube.includes('side: THREE.FrontSide'), 'cube faces are front-side only (backs culled)');
const collapse = read('components/earth/OblivionCollapse.jsx');
check(!collapse.includes('.mp4') && !collapse.includes('oblivionvid'), 'collapse uses no video file');
check(collapse.includes('COLLAPSE_TOTAL_MS'), 'collapse honors the phase timing');
const access = read('lib/earth2/access.js');
check(access.includes('checkTeamMembership'), 'access door enforces the release fallback');
check(access.includes('getOblivionEndsAt'), 'access door reads the countdown end');
const hub = read('app/page.jsx');
check(hub.includes("get('concourse') === '1'"), 'hub collapses the menu for ?concourse=1');
const earth2 = read('app/earth-2/page.jsx');
check(earth2.includes('checkReleaseGate'), 'earth-2 page consults the release route');
const route = read('app/api/earth2/release/route.js');
check(route.includes('releaseState'), 'release route computes from the shared release state');
check(route.includes('getOblivionEndsAt'), 'release route reads the countdown end');

console.log(`earth2-oblivion: ${n}/${n} passed`);
