// tests/myriad-missions.test.js — Headless tests for MYRIAD missions.
// Run: node tests/myriad-missions.test.js (from the repo root).
import {
  MISSIONS,
  missionById,
  foundSiteKind,
  missionProgress,
  newlyCompleted,
  nextMission,
} from '../lib/myriad-missions.js';
import { createProgress } from '../lib/myriad-progress.js';
import { UNIVERSES, universeById } from '../lib/myriad-universes.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}
const prog = (over = {}) => ({ ...createProgress(), ...over });

// --- catalogue ---
{
  t('11 missions', MISSIONS.length === 11);
  t('mission ids unique', new Set(MISSIONS.map((m) => m.id)).size === 11);
  t('every mission has title + plain desc',
    MISSIONS.every((m) => m.title && m.desc && !m.desc.includes('\n')));
  t('missionById finds, unknown -> null',
    missionById('first-flight').title === 'First flight' && missionById('bogus') === null);
}

// --- foundSiteKind parsing ---
{
  t('wonder kind parses', foundSiteKind('7:wonder-aurora-veil') === 'aurora-veil');
  t('find kind parses', foundSiteKind('7:signal-0') === 'signal');
  t('derelict kind parses', foundSiteKind('7:derelict-1') === 'derelict');
  t('phenomenon kind parses', foundSiteKind('7:phenomenon-2') === 'phenomenon');
  t('bad keys -> null', foundSiteKind('nocolon') === null && foundSiteKind(42) === null);
}

// --- goal progress ---
{
  t('visits counts', (() => {
    const r = missionProgress(prog({ visited: [1, 2, 3] }), missionById('atlas-ten'));
    return r.current === 3 && r.target === 10 && r.done === false;
  })());
  t('visits completes at target', missionProgress(prog({ visited: [1, 2] }), missionById('first-flight')).done === true);
  t('wormholes count', (() => {
    const r = missionProgress(prog({ wormholes: 1 }), missionById('wormhole-rider'));
    return r.current === 1 && r.done === true;
  })());
  t('anomalyKinds needs all four', (() => {
    const oneOfEach = ['wormhole', 'starforge', 'voidbloom', 'crystalfield'].map(
      (a) => UNIVERSES.find((u) => u.anomaly === a).id);
    const r = missionProgress(prog({ visited: oneOfEach }), missionById('anomaly-tour'));
    const partial = missionProgress(prog({ visited: [oneOfEach[0]] }), missionById('anomaly-tour'));
    return r.done === true && r.current === 4 && partial.done === false && partial.current === 1;
  })());
  t('foundKind counts only its kind', (() => {
    const r = missionProgress(
      prog({ found: ['1:signal-0', '2:signal-1', '3:derelict-0'] }),
      missionById('signal-hunter'));
    return r.current === 2 && r.done === false;
  })());
  t('foundKind completes', missionProgress(
    prog({ found: ['1:derelict-0', '2:derelict-1'] }), missionById('salvager')).done === true);
  t('landings count', missionProgress(
    prog({ landings: [{ universeId: 1, siteId: 'wonder-echo-reef' }] }),
    missionById('grounded')).done === true);
  t('wonderKinds needs all three', (() => {
    const full = missionProgress(prog({ found: [
      '1:wonder-aurora-veil', '2:wonder-comet-swarm', '3:wonder-echo-reef',
    ] }), missionById('wonder-seeker'));
    const part = missionProgress(prog({ found: ['1:wonder-aurora-veil'] }), missionById('wonder-seeker'));
    return full.done === true && full.current === 3 && part.done === false;
  })());
  t('allUniverses needs 100', (() => {
    const all = missionProgress(prog({ visited: UNIVERSES.map((u) => u.id) }), missionById('century'));
    const almost = missionProgress(
      prog({ visited: UNIVERSES.slice(0, 99).map((u) => u.id) }), missionById('century'));
    return all.done === true && all.target === 100 && almost.done === false;
  })());
  t('unknown goal -> not done', missionProgress(prog(), { id: 'x', goal: { kind: 'nope' } }).done === false);
  t('every mission is reachable in principle', MISSIONS.every((m) => {
    // A maxed-out record completes every mission.
    const max = prog({
      visited: UNIVERSES.map((u) => u.id),
      wormholes: 5,
      found: [
        '1:signal-0', '2:signal-1', '3:signal-2',
        '4:derelict-0', '5:derelict-1',
        '6:phenomenon-0', '7:phenomenon-1', '8:phenomenon-2',
        '9:wonder-aurora-veil', '10:wonder-comet-swarm', '11:wonder-echo-reef',
      ],
      landings: [{ universeId: 1, siteId: 'wonder-echo-reef' }],
    });
    return missionProgress(max, m).done === true;
  }));
}

// --- completion bookkeeping ---
{
  const p = prog({ visited: [1] });
  t('newlyCompleted finds first-flight', (() => {
    const fresh = newlyCompleted(p);
    return fresh.length === 1 && fresh[0].id === 'first-flight';
  })());
  t('newlyCompleted skips already-recorded missions', (() => {
    const done = { ...p, completedMissions: ['first-flight'] };
    return newlyCompleted(done).length === 0;
  })());
  t('nextMission is first-flight on fresh, then atlas-ten once done', (() => {
    const first = nextMission(p);
    const after = nextMission({ ...p, completedMissions: ['first-flight'] });
    return first.id === 'first-flight' && after.id === 'atlas-ten';
  })());
  t('nextMission null when all done', nextMission(prog({
    completedMissions: MISSIONS.map((m) => m.id),
  })) === null);
  t('universeById sanity (test fixture check)', universeById(1).id === 1);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
