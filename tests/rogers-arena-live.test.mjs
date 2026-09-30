// tests/rogers-arena-live.test.mjs
// Headless tests for the Rogers Arena "Live" game-center tab.
// Run: node tests/rogers-arena-live.test.mjs (from the repo root).
// Pure logic in lib/nhl-live.js is tested behaviorally; the server route and
// client component are tested structurally (no secrets, honest copy, no
// fake scores) because they need the Next.js runtime.
import { readFileSync } from 'fs';
import {
  NHL_SCORE_URL,
  nhlGameDetailUrl,
  gameStatus,
  periodLabel,
  normalizeScoreboardGame,
  sortGames,
  normalizeGameDetail,
} from '../lib/nhl-live.js';

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

// --- fixtures shaped like the real api-web.nhle.com responses ---
const sbFut = {
  id: 2026020006, gameDate: '2026-09-30', startTimeUTC: '2026-09-30T23:30:00Z',
  gameState: 'FUT', gameType: 2,
  awayTeam: { id: 5, abbrev: 'PIT', commonName: { default: 'Penguins' }, placeName: { default: 'Pittsburgh' } },
  homeTeam: { id: 4, abbrev: 'PHI', commonName: { default: 'Flyers' }, placeName: { default: 'Philadelphia' } },
  periodDescriptor: { number: 1, periodType: 'REG', maxRegulationPeriods: 3 },
  clock: { timeRemaining: '20:00', secondsRemaining: 1200, running: false, inIntermission: false },
};
const sbLive = {
  ...sbFut, id: 2026020007, gameState: 'LIVE',
  awayTeam: { ...sbFut.awayTeam, score: 2 },
  homeTeam: { ...sbFut.homeTeam, score: 1 },
  periodDescriptor: { number: 2, periodType: 'REG', maxRegulationPeriods: 3 },
  clock: { timeRemaining: '08:41', secondsRemaining: 521, running: true, inIntermission: false },
};
const sbFinal = {
  ...sbFut, id: 2026020001, gameState: 'OFF',
  awayTeam: { ...sbFut.awayTeam, score: 1 },
  homeTeam: { ...sbFut.homeTeam, score: 4 },
  periodDescriptor: { number: 3, periodType: 'REG', maxRegulationPeriods: 3 },
  clock: { timeRemaining: '00:00', secondsRemaining: 0, running: false, inIntermission: false },
};

// --- status mapping ---
t('LIVE is live', gameStatus('LIVE') === 'live');
t('CRIT is live', gameStatus('CRIT') === 'live');
t('OFF is final', gameStatus('OFF') === 'final');
t('FUT is upcoming', gameStatus('FUT') === 'upcoming');
t('PRE is upcoming', gameStatus('PRE') === 'upcoming');
t('unknown state is upcoming, never crashes', gameStatus('WEIRD') === 'upcoming');

// --- period labels ---
t('1 -> 1st', periodLabel(1, 'REG') === '1st');
t('2 -> 2nd', periodLabel(2, 'REG') === '2nd');
t('3 -> 3rd', periodLabel(3, 'REG') === '3rd');
t('OT period -> OT', periodLabel(4, 'OT') === 'OT');
t('shootout -> SO', periodLabel(5, 'SO') === 'SO');

// --- scoreboard normalization ---
const nFut = normalizeScoreboardGame(sbFut);
t('upcoming game keeps id', nFut && nFut.id === 2026020006);
t('upcoming game status', nFut.status === 'upcoming');
t('upcoming score is null, not zero', nFut.away.score === null && nFut.home.score === null);
t('teams keep abbrev and name', nFut.away.abbrev === 'PIT' && nFut.away.name === 'Penguins');
t('keeps start time', nFut.startTimeUTC === '2026-09-30T23:30:00Z');

const nLive = normalizeScoreboardGame(sbLive);
t('live game status', nLive.status === 'live');
t('live game keeps scores', nLive.away.score === 2 && nLive.home.score === 1);
t('live game keeps clock', nLive.label === '2nd' && nLive.timeRemaining === '08:41' && nLive.running === true);

const nFinal = normalizeScoreboardGame(sbFinal);
t('final game status', nFinal.status === 'final');

t('game without id is null', normalizeScoreboardGame({ awayTeam: {}, homeTeam: {} }) === null);
t('null input is null', normalizeScoreboardGame(null) === null);

// --- sorting: live first, then upcoming soonest, then finals latest ---
const sorted = sortGames([nFinal, nFut, nLive]);
t('live sorts first', sorted[0].status === 'live');
t('upcoming sorts second', sorted[1].status === 'upcoming');
t('final sorts last', sorted[2].status === 'final');

// --- URL builders ---
t('score url is the nhl public api', NHL_SCORE_URL === 'https://api-web.nhle.com/v1/score/now');
t('detail url targets the game id',
  nhlGameDetailUrl(2026020001) === 'https://api-web.nhle.com/v1/gamecenter/2026020001/play-by-play');
t('detail url encodes the id', nhlGameDetailUrl('2026 020001').includes('2026%20020001'));

// --- game detail normalization ---
const detailRaw = {
  id: 2024020001, gameState: 'OFF', startTimeUTC: '2024-10-04T17:00:00Z',
  awayTeam: { id: 1, abbrev: 'NJD', score: 4, sog: 23, commonName: { default: 'Devils' }, placeName: { default: 'New Jersey' } },
  homeTeam: { id: 7, abbrev: 'BUF', score: 1, sog: 31, commonName: { default: 'Sabres' }, placeName: { default: 'Buffalo' } },
  periodDescriptor: { number: 3, periodType: 'REG', maxRegulationPeriods: 3 },
  clock: { timeRemaining: '00:00', secondsRemaining: 0, running: false, inIntermission: false },
  rosterSpots: [
    { teamId: 1, playerId: 8476474, firstName: { default: 'Jesper' }, lastName: { default: 'Bratt' }, sweaterNumber: 63 },
    { teamId: 1, playerId: 8480192, firstName: { default: 'Jack' }, lastName: { default: 'Hughes' }, sweaterNumber: 86 },
    { teamId: 7, playerId: 8474593, firstName: { default: 'Jacob' }, lastName: { default: 'Markstrom' }, sweaterNumber: 25 },
  ],
  plays: [
    {
      eventId: 51, typeDescKey: 'period-start',
      periodDescriptor: { number: 1, periodType: 'REG', maxRegulationPeriods: 3 },
      timeInPeriod: '00:00', timeRemaining: '20:00', details: { eventOwnerTeamId: 1 },
    },
    {
      eventId: 152, typeDescKey: 'goal',
      periodDescriptor: { number: 1, periodType: 'REG', maxRegulationPeriods: 3 },
      timeInPeriod: '07:32', timeRemaining: '12:28',
      details: {
        eventOwnerTeamId: 1, scoringPlayerId: 8476474, scoringPlayerTotal: 1,
        assist1PlayerId: 8480192, assist1PlayerTotal: 1, assist2PlayerId: null,
        shotType: 'snap',
      },
    },
    {
      eventId: 200, typeDescKey: 'penalty',
      periodDescriptor: { number: 2, periodType: 'REG', maxRegulationPeriods: 3 },
      timeInPeriod: '03:11', timeRemaining: '16:49',
      details: { eventOwnerTeamId: 7, committedByPlayerId: 8474593, descKey: 'tripping', duration: 2 },
    },
  ],
};
const det = normalizeGameDetail(detailRaw);
t('detail keeps id and final status', det && det.id === 2024020001 && det.status === 'final' && det.live === false);
t('detail keeps shots on goal', det.away.sog === 23 && det.home.sog === 31);
t('scoring summary has the goal', det.scoring.length === 1 && det.scoring[0].team === 'NJD');
t('goal names the scorer', /Jesper Bratt/.test(det.scoring[0].detail));
t('goal names the assist', /Jack Hughes/.test(det.scoring[0].detail));
t('goal keeps period and time', det.scoring[0].periodLabel === '1st' && det.scoring[0].timeInPeriod === '07:32');
t('recent plays are newest first', det.recentPlays[0].key === 'penalty' && det.recentPlays.length === 3);
t('penalty is readable', /Tripping/.test(det.recentPlays[0].detail) && /Jacob Markstrom/.test(det.recentPlays[0].detail));
t('period-start has a plain label', det.recentPlays[2].label === 'Period start');

// recent plays cap at 20
const manyPlays = Array.from({ length: 30 }, (_, i) => ({
  eventId: i, typeDescKey: 'faceoff',
  periodDescriptor: { number: 1, periodType: 'REG', maxRegulationPeriods: 3 },
  timeInPeriod: '00:00', timeRemaining: '20:00', details: { eventOwnerTeamId: 1 },
}));
const detMany = normalizeGameDetail({ ...detailRaw, plays: manyPlays });
t('recent plays capped at 20', detMany.recentPlays.length === 20);

t('detail without id is null', normalizeGameDetail({ plays: [] }) === null);
t('detail with no plays is fine', (() => {
  const d = normalizeGameDetail({ ...detailRaw, plays: null });
  return d && d.scoring.length === 0 && d.recentPlays.length === 0;
})());

// --- structural: server isolation, honest states --------------------------------
const route = readFileSync('app/rogers-arena/api/live/route.js', 'utf8');
const clientUi = readFileSync('app/rogers-arena/live.jsx', 'utf8');
const sharedLib = readFileSync('lib/nhl-live.js', 'utf8');
const page = readFileSync('app/rogers-arena/page.jsx', 'utf8');

t('route marks force-dynamic', route.includes("dynamic = 'force-dynamic'"));
t('route reads no env vars', !route.includes('process.env'));
t('route never logs', !/console\.(log|info|debug|error)/.test(route));
t('route answers 502 honestly when provider fails', route.includes('Live scores are unavailable right now'));
t('route validates the game id', route.includes("error: 'id is required'"));
t('client never calls the nhl api directly', !clientUi.includes('api-web.nhle.com'));
t('client only talks to our own api route', /\/rogers-arena\/api\/live/.test(clientUi));
t('shared lib never reads process.env', !sharedLib.includes('process.env'));
t('shared lib never fetches', !sharedLib.includes('fetch('));
t('client shows honest unreachable copy', /reach live scores/.test(clientUi));
t('client admits no guessed scores', /rather than guessed ones/.test(clientUi));
t('client has 44px touch targets', /min-h-\[44px\]/.test(clientUi));
t('zero external scripts in live UI', !/<script/.test(clientUi));
t('no hotlinked team logos in live UI', !clientUi.includes('assets.nhle.com'));
t('reduced-motion-safe pulse', clientUi.includes('motion-safe:animate-pulse'));

// --- structural: tab wiring ------------------------------------------------------
t('page adds the live tab', page.includes("{ id: 'live', label: 'Live' }"));
t('page renders the Live section', page.includes('<Live'));
t('page imports the Live component', page.includes("import Live from './live'"));
t('page keeps the arena vignette', page.includes('createArenaScene'));
t('page keeps the tickets tab', page.includes("{ id: 'tickets', label: 'Tickets' }"));

console.log(`\nrogers-arena-live: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
