// Mission replay (2026-11-16, Merlin: YES — finished missions
// are replayable, D-M2). Pins: the map renders a "Hunt again"
// button for a done mission that re-enters the same mission,
// and replaying never resets the done state nor double-awards
// (there is no per-mission reward in data.js — rewards are
// campaign kills + the Korus reward only — and completeMission
// is an idempotent flag-set, so re-completing is a no-op).
// Run: node app/hollow-earth/tests/mission-replay.test.mjs (from the repo root).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';

const src = readFileSync('app/hollow-earth/page.jsx', 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '');
const code = strip(src);
const { createProgress, completeMission, isMissionDone } = await import('../data.js');

test('map mode: a done mission renders a "Hunt again" mission orb that re-enters the mission', () => {
  // ORB REWORK (Merlin, Nov 16 ~03:53): the rectangular Hunt /
  // Hunt again pills are gone — the mission orb IS the Hunt pick.
  // A done mission's orb carries "Hunt again" in its aria-label
  // and title and re-enters the same mission id (not roam, not a
  // reset); an unfinished mission's orb carries "Hunt:".
  assert.match(code, /Hunt again: \$\{m\.title\}/, 'no "Hunt again" replay label on the mission orb');
  assert.match(code, /Hunt: \$\{m\.title\}/, 'no "Hunt" label on the mission orb');
  const orb = code.match(/<OrbButton fn=\{missionOrbFn\(m\.id\)\}([\s\S]*?)\/>/);
  assert.ok(orb, 'no mission orb in the mission row');
  assert.match(orb[1], /enterCluster\(cid, 'mission', m\.id\)/,
    'replay must re-enter the same mission via enterCluster');
  assert.doesNotMatch(orb[1], /'roam'/, 'replay must not fall back to roam');
  assert.match(orb[1], /isDone \? `Hunt again:/, 'done state must switch the orb to Hunt again');
  // No rectangular Hunt / Hunt again pill survives anywhere.
  assert.doesNotMatch(code, />Hunt<\/button>/, 'rectangular Hunt pill still in page.jsx');
  assert.doesNotMatch(code, /Hunt again<\/button>/, 'rectangular Hunt again pill still in page.jsx');
});

test('replay state: a done mission stays done; re-completing it is a no-op, no reward is re-awarded', () => {
  let p = createProgress();
  const first = { id: 'wilds-ooze-crossing' };
  assert.equal(isMissionDone(p, 'wilds', first), false);
  p = completeMission(p, 'wilds', first.id);
  assert.equal(isMissionDone(p, 'wilds', first), true);
  // Replaying and completing again: still done, same record —
  // completeMission sets the same flag, it never clears it and
  // carries no reward payload to re-award.
  const before = JSON.stringify(p.missionsDone);
  p = completeMission(p, 'wilds', first.id);
  assert.equal(isMissionDone(p, 'wilds', first), true, 'replay completion must not reset the done state');
  assert.equal(JSON.stringify(p.missionsDone), before, 're-completing must not change the record');
  assert.ok(!('reward' in p) && !('rewards' in p), 'progress carries no per-mission reward to double-award');
});
