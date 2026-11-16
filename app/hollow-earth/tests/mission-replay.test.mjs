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

test('map mode: a done mission renders a "Hunt again" replay button that re-enters the mission', () => {
  assert.match(code, /Hunt again/, 'no "Hunt again" replay label in page.jsx');
  // The replay button lives in the isDone branch and re-enters
  // the same mission id — not roam, not a reset.
  const replayBranch = code.match(/isDone \? \(([\s\S]*?)\) : \(/);
  assert.ok(replayBranch, 'no isDone ternary branch in the mission row');
  assert.match(replayBranch[1], /Hunt again/);
  assert.match(replayBranch[1], /enterCluster\(cid, 'mission', m\.id\)/,
    'replay must re-enter the same mission via enterCluster');
  assert.doesNotMatch(replayBranch[1], /roam/, 'replay must not fall back to roam');
  // The unfinished branch still renders the plain Hunt button.
  assert.match(code, />Hunt<\/button>/, 'unfinished missions must keep the plain Hunt button');
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
