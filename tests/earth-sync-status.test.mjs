// tests/earth-sync-status.test.mjs — the Earth 1 mapped-coverage sync
// module (lib/earth/sync-status.js) is pure and stays on disk,
// unwired, with its behaviour pinned below. The mapping system
// it reported on is GONE (Merlin, 2026-11-15 — mapping goes away
// completely with the tiling system): NexusEarth no longer
// imports the reporter, EarthConsole no longer renders the SYNC
// line, and components/earth/EarthSyncLine.jsx is deleted.
// Run: node tests/earth-sync-status.test.mjs (from the repo root).
// No browser, no network — source-level checks plus the pure
// telemetry module's behavior.
import { readFileSync, existsSync } from 'fs';
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

// --- The mapping system is gone from every live path ---
const nexus = src('../components/NexusEarth.jsx');
t('NexusEarth no longer imports the telemetry reporter',
  !nexus.includes('reportEarthSync') && !nexus.includes('lib/earth/sync-status'));
t('NexusEarth carries no mapping marks or cell counts',
  !nexus.includes('countBits') && !nexus.includes('markDisc')
  && !nexus.includes('mappedBitset') && !nexus.includes('setMappedPercent'));
t('EarthSyncLine component is deleted',
  !existsSync(new URL('../components/earth/EarthSyncLine.jsx', import.meta.url)));
const consoleSrc = src('../components/EarthConsole.jsx');
t('EarthConsole no longer imports the sync line',
  !consoleSrc.includes('components/earth/EarthSyncLine'));
t('EarthConsole no longer renders the sync line',
  !consoleSrc.includes('<EarthSyncLine />'));
t('EarthConsole carries no mapping pill or percent',
  !consoleSrc.includes('Mapped') && !consoleSrc.includes('mappedPercent')
  && !consoleSrc.includes('coveragePercent'));

console.log(`earth-sync-status: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
