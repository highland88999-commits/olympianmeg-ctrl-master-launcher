// tests/earth-sync-status.test.mjs — the Earth 1 mapped-coverage sync
// reports each attempt to a shared status module, and the Earth
// console renders one plain SYNC line from it (no more silent
// failures: a 0-cell registry now shows WHICH link broke).
// Run: node tests/earth-sync-status.test.mjs (from the repo root).
// No browser, no network — source-level checks plus the pure
// telemetry module's behavior.
import { readFileSync } from 'fs';
import { reportEarthSync, getEarthSyncStatus } from '../lib/earth/sync-status.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}
const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

// --- the telemetry module: pure, never throws ---
{
  const s0 = getEarthSyncStatus();
  t('initial state is sane',
    s0.cells === 0 && s0.dirty === false && s0.token === null
    && s0.lastBeat === 0 && s0.lastHttp === null && s0.lastOk === null);
  reportEarthSync({ cells: 412, dirty: true, token: true, lastBeat: 123, lastHttp: 200, lastOk: true });
  const s1 = getEarthSyncStatus();
  t('report merges patches', s1.cells === 412 && s1.dirty === true && s1.lastHttp === 200);
  t('report ignores junk without throwing',
    (() => { try { reportEarthSync(null); reportEarthSync('x'); return true; } catch { return false; } })());
  reportEarthSync({ cells: 0, dirty: false, token: null, lastBeat: 0, lastHttp: null, lastOk: null });
}

// --- NexusEarth reports the real sync outcome ---
const nexus = src('../components/NexusEarth.jsx');
t('NexusEarth imports the telemetry reporter', nexus.includes("reportEarthSync") && nexus.includes("lib/earth/sync-status"));
t('NexusEarth imports countBits for the cell count', nexus.includes('countBits'));
t('marking reports cells + dirty', nexus.includes("reportEarthSync({ cells: countBits(bitset), dirty: true })"));
t('beat stamps each attempt', nexus.includes('reportEarthSync({ lastBeat: Date.now()'));
t('beat reports a missing token instead of skipping silently',
  nexus.includes("lastHttp: 'no-token'"));
t('beat reports the HTTP status on failure', nexus.includes('reportEarthSync({ lastHttp: r.status, lastOk: false })'));
t('beat reports ok + clears dirty on success',
  nexus.includes('reportEarthSync({ lastHttp: r.status, lastOk: true, dirty: false })'));
t('beat reports network failures', nexus.includes("lastHttp: 'network'"));
t('roam-end flush reports too', (nexus.match(/reportEarthSync\(\{ lastBeat: Date\.now\(\)/g) || []).length >= 2);
t('mount records token presence', nexus.includes('reportEarthSync({ token: true })')
  && nexus.includes('reportEarthSync({ token: false })'));

// --- the console renders the line ---
const line = src('../components/earth/EarthSyncLine.jsx');
t('sync line reads the shared status', line.includes('getEarthSyncStatus'));
t('sync line renders a SYNC readout', line.includes('SYNC'));
t('sync line covers no-token', line.includes('no sign-in token'));
t('sync line covers server errors', line.includes('server ${'));
t('sync line covers network failures', line.includes('network failed'));
t('sync line re-reads on an interval', line.includes('setInterval'));
const consoleSrc = src('../components/EarthConsole.jsx');
t('EarthConsole imports the sync line', consoleSrc.includes("components/earth/EarthSyncLine"));
t('EarthConsole renders the sync line in the pinned header', consoleSrc.includes('<EarthSyncLine />'));

console.log(`earth-sync-status: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
