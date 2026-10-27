// tests/earth-street-polish.test.mjs — the 2026-10-27 Earth 1
// street polish: progress sync that actually lands, a lens
// queue that cannot wedge, and the crack glow retune's wiring.
//
//   1. PROGRESS: the three Earth ui-state calls used to send NO
//      Authorization header, so every one 401'd (the route
//      requires Bearer) and no mapped ground ever reached the
//      server — the live registry held zero cells while the pill
//      read 0.0% all session. They now carry the session token
//      (the Concourse pattern), the 30 s beat clears its dirty
//      flag only on a confirmed ok response, and the mount flags
//      local-ahead ground so a failed flush still syncs later.
//   2. LENS QUEUE: a null 2D canvas context, a throwing tile
//      draw, a setup fault, or a hung tile fetch used to hold a
//      pool's busy flag forever — no later build in the session
//      ever started ("new ground never paints"). The build now
//      guards the canvas context, catches setup faults, settles
//      tiles before painting, and force-finishes past Merlin's
//      ~1-minute lag tolerance via a watchdog.
//   3. The crack glow pins live in tests/earth-cracks.test.mjs.
//
// Run: node tests/earth-street-polish.test.mjs (from the repo root).
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  createBitset,
  markDisc,
  unionInto,
  parseBitset,
  serializeBitset,
} from '../lib/earth/mapping-progress.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok - ${name}`);
}

const nexus = read('components/NexusEarth.jsx');

check('Earth sync carries the session token on every ui-state call', () => {
  // The helper itself (Concourse pattern: dynamic import, session token).
  assert.ok(nexus.includes('async function getEarthUiToken()'), 'token helper exists');
  assert.ok(nexus.includes("await import('@/lib/supabase')"), 'token comes from the Supabase session');
  assert.ok(nexus.includes('session?.access_token'), 'token is the session access token');
  // All three call sites attach it: mount GET, roam-end flush, 30 s beat.
  const bearer = nexus.match(/Authorization: `Bearer \$\{token\}`/g) || [];
  assert.ok(bearer.length >= 3, `three authenticated calls (found ${bearer.length})`);
});

check('dirty flag clears only on a confirmed sync, never before', () => {
  // Exactly one place clears the flag, and it sits behind an ok check.
  const clears = nexus.match(/mappedDirtyRef\.current = false/g) || [];
  assert.equal(clears.length, 1, `one dirty-clear in the file (found ${clears.length})`);
  assert.ok(nexus.includes('if (r.ok) mappedDirtyRef.current = false'), 'clear happens only on ok');
  // The old bug: the beat cleared the flag before the fetch.
  assert.ok(
    !/mappedSyncRef\.current = nowMs;\s*mappedDirtyRef\.current = false/.test(nexus),
    'no clear-before-fetch left in the beat',
  );
});

check('mount flags local-ahead ground for the next beat', () => {
  // Probe pattern: copy the server bitset, union local into it —
  // true means the device holds marks the server has never seen.
  assert.ok(nexus.includes('server.slice()'), 'probe copies the server bitset');
  assert.ok(nexus.includes('unionInto(probe, bitset)'), 'probe unions local into the copy');
  assert.ok(nexus.includes('createBitset()'), 'no-server case probes against an empty bitset');
});

check('local-ahead probe semantics (headless, via mapping-progress)', () => {
  const local = createBitset();
  markDisc(local, 53.63, -113.41);
  // No server record at all: local marks are ahead.
  assert.equal(unionInto(createBitset(), local), true, 'marks with no server record are ahead');
  // Server identical to local: nothing ahead.
  const serverSame = parseBitset(serializeBitset(local));
  assert.equal(unionInto(serverSame.slice(), local), false, 'identical server is not ahead');
  // Server behind local (older marks): local is ahead.
  const serverOld = createBitset();
  markDisc(serverOld, 53.63, -113.41);
  const localMore = createBitset();
  unionInto(localMore, serverOld);
  markDisc(localMore, 54.0, -113.0);
  assert.equal(unionInto(serverOld.slice(), localMore), true, 'extra local marks are ahead');
  // Server ahead of local: local adds nothing to the server copy.
  const localLess = createBitset();
  assert.equal(unionInto(localMore.slice(), localLess), false, 'server-ahead local is not ahead');
  const grown = createBitset();
  assert.equal(unionInto(grown, localMore), true, 'union still grows the device record');
});

check('lens build guards the null canvas context', () => {
  // The old guard checked the build context and height data but
  // never the canvas context — a null ctx threw in the first
  // tile onload before the settle count moved, wedging the pool.
  assert.ok(nexus.includes('if (!hd || !ctx)'), 'null canvas context skips the build honestly');
});

check('lens setup faults free the pool instead of wedging it', () => {
  assert.ok(nexus.includes('try { bctx.remove(job.key); } catch {}'), 'partial sheet dropped on setup fault');
});

check('tile loads settle before they paint', () => {
  assert.ok(nexus.includes('let painted = false'), 'paint tracked separately from settle');
  assert.ok(/try \{\s*ctx\.drawImage/.test(nexus), 'drawImage runs inside try');
  assert.ok(nexus.includes('if (painted) okCount += 1'), 'ok counts only painted tiles');
});

check('lens watchdog force-finishes stalled builds at ~1 minute', () => {
  assert.ok(nexus.includes('LENS_BUILD_WATCHDOG_MS = 60000'), 'watchdog is 60 s (Merlin tolerance)');
  assert.ok(nexus.includes('watchTimer = setTimeout'), 'watchdog timer set per build');
  assert.ok(nexus.includes('if (!finished) finish()'), 'watchdog force-finishes unfinished builds');
  assert.ok(nexus.includes('if (finished) return'), 'finish is guarded against double-run');
  assert.ok(nexus.includes('clearTimeout(watchTimer)'), 'clean finish clears the watchdog');
});

console.log(`earth-street-polish: ${passed} checks passed`);
