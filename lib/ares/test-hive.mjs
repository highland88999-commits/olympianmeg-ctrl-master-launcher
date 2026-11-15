// ARES tests: hive host — live scoring, arming, self-terminate delivery.
// Run with: node lib/ares/test-hive.mjs
//
// Env is set BEFORE importing the hive: the module arms the agents on
// load, and the expected-hosts list is derived from env at that point.
process.env.VERCEL_URL = 'olympus-preview-abc123.vercel.app';
delete process.env.ARES_EXPECTED_HOSTS;

const { Sentinel, Phalanx, Dreadnought, Hub } = await import('./agents.js');
const { extractFeatures } = await import('./features.js');
const { CONSOLE_DESTINATION, SELF_TERMINATE_EVENT } = await import('./self-terminate.js');
const { reportAgentSelfTerminate } = await import('./server.js');
const hive = await import('./hive.js');

let pass = 0;
let fail = 0;
function t(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.error('FAIL:', name); }
}

const browserFp = extractFeatures({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  path: '/',
  headers: { 'accept-language': 'en-US', accept: 'text/html' },
});
const botFp = extractFeatures({
  userAgent: 'Nikto/2.1.6', path: '/.env', headers: {},
});
const repeatFp = extractFeatures({
  userAgent: 'curl/8.0', path: '/wp-admin', headers: {},
  honeypotHit: true, strikes: 8, windowHits: 120, windowMax: 120,
});

// --- Module-load arming wires the production report sink ---
t('hive arms with the production report sink on load', hive.getReportSink() === reportAgentSelfTerminate);

// --- Expected hosts: safe defaults + VERCEL_URL host ---
const hosts = hive.getExpectedHosts();
t('prod host passes the expected-hosts check', hosts.includes('olympusverse.com'));
t('www host is expected too', hosts.includes('www.olympusverse.com'));
t('localhost is expected too', hosts.includes('localhost'));
t('VERCEL_URL host is expected too', hosts.includes('olympus-preview-abc123.vercel.app'));

// --- Re-arm with a stub sink (the only way to observe delivery) ---
const reports = [];
let delivered = 0;
const stubSink = (payload) => {
  reports.push(payload);
  return new Promise((resolve) => {
    setTimeout(() => { delivered += 1; resolve({ logged: true }); }, 5);
  });
};
const armed = hive.armHive({ report: stubSink });
t('re-arming arms all three field agents', ['sentinel', 'phalanx', 'dreadnought'].every((id) => armed.armed.includes(id)));
t('re-arming keeps the prod host expected', armed.expectedHosts.includes('olympusverse.com'));

// --- Clean traffic on the prod host: no deaths, no reports ---
const clean = hive.scoreEvent({ vector: browserFp.vector, host: 'olympusverse.com' });
t('clean event scores on the prod host', clean.hub.label === 'Calm' && clean.terminated.length === 0);
t('clean event sends no report', reports.length === 0);
for (const host of ['www.olympusverse.com', 'localhost', 'olympus-preview-abc123.vercel.app']) {
  const r = hive.scoreEvent({ vector: browserFp.vector, host });
  t(`expected host passes: ${host}`, r.terminated.length === 0 && reports.length === 0);
}
const bot = hive.scoreEvent({ vector: botFp.vector, host: 'olympusverse.com' });
t('hostile event scores without dying', bot.agents.sentinel.action === 'block' && bot.terminated.length === 0);
t('hostile event still sends no report', reports.length === 0);
t('event details carry per-agent readings + hub', typeof bot.agents.phalanx.score === 'number' && typeof bot.hub.score === 'number');

// --- A bad vector never blocks logging (ingest guard pattern) ---
let loggedAnyway = false;
try {
  hive.scoreEvent({ vector: 'not-a-vector', host: 'olympusverse.com' });
} catch (err) {
  loggedAnyway = err instanceof TypeError;
}
t('bad vector throws a clean, catchable error', loggedAnyway);
t('bad vector leaves the agents alive and uncorrupted', !Sentinel.isTerminated() && !Phalanx.isTerminated() && !Dreadnought.isTerminated());
try {
  hive.scoreEvent({ vector: null, host: 'olympusverse.com' });
} catch {
  loggedAnyway = true;
}
t('null vector is catchable the same way', loggedAnyway);

// --- Single-agent death: the fuse skips the dead and re-weights ---
const manual = Sentinel.selfTerminate('manual');
t('manual self-terminate order returns true', manual === true);
t('manual order fires exactly one report', reports.length === 1);
t('manual report goes to the console only', reports[0].destination === CONSOLE_DESTINATION && reports[0].destination === 'ares-console');
t('manual report event type is agent_self_terminate', reports[0].eventType === SELF_TERMINATE_EVENT);
t('manual report names the agent', reports[0].agentId === 'sentinel');
t('manual report carries no raw IP', !('ip' in reports[0]) && !('ipHash' in reports[0]));
t('dead agent is marked in the host registry', hive.hiveStatus().dead.includes('sentinel'));
t('dead agent refuses to score', Sentinel.score(botFp.vector).terminated === true);
const settledManual = await hive.drainReports();
t('drainReports resolves after delivery', settledManual.length === 1 && settledManual[0].status === 'fulfilled');
t('delivery actually landed before drain resolved', delivered === 1);
t('pending reports are cleared by the drain', hive.hiveStatus().pendingReports === 0);

const survivors = hive.scoreEvent({ vector: repeatFp.vector, host: 'olympusverse.com' });
t('dead agent stays in the readings as a terminated marker', survivors.agents.sentinel.terminated === true && survivors.agents.sentinel.score === null);
t('dead agent is listed as terminated', survivors.terminated.includes('sentinel'));
t('hub still computes from the survivors', survivors.hub.label === 'Severe' && survivors.hub.action === 'block');
t('hub re-weights over survivors only (no dilution by the dead)', survivors.hub.score === Hub.fuse({
  phalanx: survivors.agents.phalanx,
  dreadnought: survivors.agents.dreadnought,
}).score);
t('hub score is the re-weighted value, not the three-agent value', survivors.hub.score === 92);

// --- Cage signal in the live path: unexpected host fires + terminates ---
const cage = hive.scoreEvent({ vector: botFp.vector, host: 'cage.example' });
t('cage event terminates the remaining agents', cage.terminated.length === 3);
for (const id of ['phalanx', 'dreadnought']) {
  const mine = reports.filter((r) => r.agentId === id);
  t(`cage fires exactly one report for ${id}`, mine.length === 1);
  t(`cage report for ${id} goes to the console only`, mine[0].destination === CONSOLE_DESTINATION);
  t(`cage report for ${id} names the signal`, mine[0].signals.includes('unexpected-host'));
  t(`cage report for ${id} names where it was trapped`, mine[0].host === 'cage.example');
}
t('one report per death, no duplicates', reports.length === 3);
t('dead agents refuse to score after the cage', Phalanx.score(botFp.vector).terminated === true && Dreadnought.score(botFp.vector).terminated === true);
const afterDeath = hive.scoreEvent({ vector: botFp.vector, host: 'olympusverse.com' });
t('all-dead hive still answers: every agent terminated, hub calm', afterDeath.terminated.length === 3 && afterDeath.hub.score === 0 && afterDeath.hub.label === 'Calm');
t('dead agents never report again', reports.length === 3);
const settledCage = await hive.drainReports();
t('cage reports drain after delivery', settledCage.length === 2 && settledCage.every((s) => s.status === 'fulfilled'));
t('all three reports delivered', delivered === 3);
t('drain on an empty queue resolves immediately', (await hive.drainReports()).length === 0);

// --- Env override is honoured by the derived host list ---
process.env.ARES_EXPECTED_HOSTS = 'custom.example, olympusverse.com';
t('ARES_EXPECTED_HOSTS adds to the list', hive.getExpectedHosts().includes('custom.example'));
delete process.env.ARES_EXPECTED_HOSTS;

console.log(`hive: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
