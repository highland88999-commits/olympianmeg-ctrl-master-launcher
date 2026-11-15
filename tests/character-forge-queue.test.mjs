// tests/character-forge-queue.test.mjs — headless tests for the
// character forge queue (Merlin, Nov 15 ~04:36: all stand-in
// characters not yet replaced by models go into the forge; upgrade
// the forge first if it can't meet the demand; Cerberus first).
// Run: node tests/character-forge-queue.test.mjs (from the repo root).
// No browser, no network, no Tripo calls, no credits spent — asserts
// on lib/characters/forge-queue.js only.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  FORGE_QUEUE,
  FORGE_STATUSES,
  TRIPO_CREDITS_BALANCE,
  TRIPO_CREDITS_PER_MODEL_ESTIMATE,
  getQueueEntry,
  entriesByStatus,
  nextUp,
  newGenerationDemand,
  readyToWireCount,
  resendCount,
  estimatedCreditsNeeded,
  creditsShortfall,
  demandCovered,
  statusCounts,
} from '../lib/characters/forge-queue.js';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKSPACE = join(REPO, '..');
const QUEUE_SRC = readFileSync(join(REPO, 'lib/characters/forge-queue.js'), 'utf8');

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

// --- shape: the audited demand ---
t('queue has 68 entries (85 audited kinds, drift collapsed by kind-name)', FORGE_QUEUE.length === 68);
t('ids are unique', new Set(FORGE_QUEUE.map((e) => e.id)).size === FORGE_QUEUE.length);
t('priorities are unique', new Set(FORGE_QUEUE.map((e) => e.priority)).size === FORGE_QUEUE.length);
t('priorities run 1..68 with no gaps',
  FORGE_QUEUE.map((e) => e.priority).sort((a, b) => a - b)
    .every((p, i) => p === i + 1));
t('every entry has name/world/kind/standIn/source',
  FORGE_QUEUE.every((e) => e.name && e.world && e.kind && e.standIn && e.source));
t('every kind is known',
  FORGE_QUEUE.every((e) => ['drift', 'figure', 'creature', 'boss', 'statue', 'class'].includes(e.kind)));
t('every status is known',
  FORGE_QUEUE.every((e) => FORGE_STATUSES.includes(e.status)));

// --- Cerberus first (Merlin-ordered) ---
t('cerberus is priority 1', getQueueEntry('cerberus')?.priority === 1);
t('cerberus is queued-new', getQueueEntry('cerberus')?.status === 'queued-new');
t('cerberus has a generation prompt', typeof getQueueEntry('cerberus')?.prompt === 'string'
  && getQueueEntry('cerberus').prompt.length > 50);
t('nextUp() is cerberus', nextUp()?.id === 'cerberus');
t('unknown id returns null', getQueueEntry('no-such-character') === null);

// --- demand vs capacity ---
t('new-generation demand is 50', newGenerationDemand() === 50);
t('ready-to-wire count is 3', readyToWireCount() === 3);
t('re-send count is 12', resendCount() === 12);
t('status counts are 50/3/12/1/1/1', JSON.stringify(statusCounts())
  === JSON.stringify({
    'queued-new': 50,
    'model-exists-wiring': 3,
    'model-exists-resend': 12,
    'procedural-by-design': 1,
    deferred: 1,
    'blocked-needs-design': 1,
  }));
t('balance constant is the verified 10', TRIPO_CREDITS_BALANCE === 10);
t('per-model estimate is the brief’s 19', TRIPO_CREDITS_PER_MODEL_ESTIMATE === 19);
t('estimated credits for the demand is 950', estimatedCreditsNeeded() === 950);
t('shortfall at balance 10 is 940', creditsShortfall(10) === 940);
t('demand is NOT covered at balance 10', demandCovered(10) === false);
t('demand IS covered at 950', demandCovered(950) === true);
t('shortfall never goes negative', creditsShortfall(9999) === 0);

// --- prompts: every generatable job has one, blocked ones honestly don’t ---
t('every queued-new entry has a prompt',
  entriesByStatus('queued-new').every((e) => typeof e.prompt === 'string' && e.prompt.length > 50));
t('wiring/resend entries have no prompt (nothing to generate)',
  FORGE_QUEUE.filter((e) => e.status === 'model-exists-wiring' || e.status === 'model-exists-resend')
    .every((e) => e.prompt === null));
t('persephone is blocked with no prompt (needs Merlin’s design)',
  getQueueEntry('persephone')?.status === 'blocked-needs-design'
  && getQueueEntry('persephone')?.prompt === null);
t('petrified statue is deferred with no prompt',
  getQueueEntry('petrified-statue')?.status === 'deferred'
  && getQueueEntry('petrified-statue')?.prompt === null);
t('earth 4 is the one procedural-by-design class entry',
  getQueueEntry('e4-procedural-creatures')?.status === 'procedural-by-design');

// --- drift jobs: one job serves every realm listed ---
t('shade serves 14 realms', getQueueEntry('shade')?.realms?.length === 14);
t('drifter serves 4 realms', getQueueEntry('drifter')?.realms?.length === 4);
t('every drift entry lists its realms',
  FORGE_QUEUE.filter((e) => e.kind === 'drift').every((e) => Array.isArray(e.realms) && e.realms.length > 0));
t('8 drift jobs cover the 24 realm kinds',
  FORGE_QUEUE.filter((e) => e.kind === 'drift').length === 8);

// --- sources: every entry cites a file that exists ---
function sourceFileExists(source) {
  const first = source.split(' ')[0].replace(/:\d+.*$/, '').replace(/;$/, '');
  if (first === 'medusa-run-characters.json') {
    return existsSync(join(WORKSPACE, 'your_files/character-data/medusa-run-characters.json'));
  }
  return existsSync(join(REPO, first));
}
const missingSources = FORGE_QUEUE.filter((e) => !sourceFileExists(e.source)).map((e) => e.id);
t(`every entry cites an existing source file (missing: ${missingSources.join(', ') || 'none'})`,
  missingSources.length === 0);

// --- existing models: every claimed model is really on disk ---
function modelExists(entry) {
  if (!entry.existingModel) return true;
  const p = entry.existingModel;
  if (p.startsWith('~/workspace/')) return existsSync(join(WORKSPACE, p.slice('~/workspace/'.length)));
  if (p.startsWith('public/')) return existsSync(join(REPO, p));
  return false;
}
const missingModels = FORGE_QUEUE.filter((e) => e.existingModel && !modelExists(e)).map((e) => e.id);
t(`every claimed existing model is on disk (missing: ${missingModels.join(', ') || 'none'})`,
  missingModels.length === 0);
t('j2 lightning-monster names its batch-4 model',
  getQueueEntry('j2-lightning-monster')?.existingModel
  === '~/workspace/character-batch-4/golden-lightning-monster-3d-model.glb');
t('dutchman merchant names vendor.glb',
  getQueueEntry('dutchman-merchant')?.existingModel === 'public/models/npcs/vendor.glb');

// --- wiring: every entry that can be wired names its target ---
t('every queued-new entry names a wiring target',
  entriesByStatus('queued-new').every((e) => typeof e.wiring === 'string' && e.wiring.length > 10));
t('entriesByStatus returns priority order',
  entriesByStatus('queued-new').every((e, i, a) => i === 0 || a[i - 1].priority < e.priority));

// --- IP flags: Star Wars kinds are flagged, nothing new invented ---
t('all 10 star-wars entries carry an ip_flag',
  FORGE_QUEUE.filter((e) => e.id.startsWith('sw-')).length === 10
  && FORGE_QUEUE.filter((e) => e.id.startsWith('sw-')).every((e) => typeof e.ip_flag === 'string'));

// --- the queue generates nothing: no network, no Tripo calls ---
t('queue source makes no fetch call', !/fetch\s*\(/.test(QUEUE_SRC));
t('queue source calls no Tripo API host', !/api\.tripo3d/.test(QUEUE_SRC));
t('no Mortal Kombat strings in the queue', !/mortal\s*kombat|sub-zero|scorpion|raiden|liu\s*kang/i.test(QUEUE_SRC));

console.log(`character-forge-queue: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
