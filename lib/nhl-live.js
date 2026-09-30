// lib/nhl-live.js
// Pure normalization for the FREE NHL public API (https://api-web.nhle.com,
// no API key needed). Used by the Rogers Arena "Live" game-center tab.
//
// No environment access here, no fetch here — safe to import from client
// components and from headless tests. The server route
// (app/rogers-arena/api/live) owns the network calls; the client never talks
// to api-web.nhle.com directly.

export const NHL_SCORE_URL = 'https://api-web.nhle.com/v1/score/now';

export function nhlGameDetailUrl(gameId) {
  return `https://api-web.nhle.com/v1/gamecenter/${encodeURIComponent(String(gameId))}/play-by-play`;
}

// NHL gameState -> our plain-English status.
export function gameStatus(gameState) {
  switch (gameState) {
    case 'LIVE':
    case 'CRIT':
      return 'live';
    case 'OFF':
    case 'FINAL':
      return 'final';
    case 'FUT':
    case 'PRE':
    default:
      return 'upcoming';
  }
}

// 1 -> '1st', 2 -> '2nd', 3 -> '3rd', OT periods -> 'OT', shootout -> 'SO'.
export function periodLabel(number, periodType) {
  if (periodType === 'SO') return 'SO';
  if (periodType === 'OT' || (typeof number === 'number' && number > 3)) return 'OT';
  if (number === 1) return '1st';
  if (number === 2) return '2nd';
  if (number === 3) return '3rd';
  return typeof number === 'number' ? `P${number}` : '';
}

function teamOf(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const abbrev = typeof raw.abbrev === 'string' ? raw.abbrev : '';
  const name =
    (raw.commonName && raw.commonName.default) ||
    (raw.placeName && raw.placeName.default) ||
    abbrev;
  return {
    id: raw.id ?? null,
    abbrev,
    name,
    score: typeof raw.score === 'number' ? raw.score : null,
    sog: typeof raw.sog === 'number' ? raw.sog : null,
  };
}

function clockOf(raw) {
  const clock = raw && raw.clock ? raw.clock : {};
  const pd = raw && raw.periodDescriptor ? raw.periodDescriptor : {};
  const number = typeof pd.number === 'number' ? pd.number : null;
  return {
    period: number,
    periodType: pd.periodType || null,
    label: number != null ? periodLabel(number, pd.periodType) : '',
    timeRemaining:
      typeof clock.timeRemaining === 'string' ? clock.timeRemaining : null,
    running: clock.running === true,
    intermission: clock.inIntermission === true,
  };
}

// One row on the scoreboard list.
export function normalizeScoreboardGame(g) {
  if (!g || typeof g !== 'object' || g.id == null) return null;
  const away = teamOf(g.awayTeam);
  const home = teamOf(g.homeTeam);
  if (!away || !home) return null;
  return {
    id: g.id,
    away,
    home,
    status: gameStatus(g.gameState),
    startTimeUTC: typeof g.startTimeUTC === 'string' ? g.startTimeUTC : null,
    ...clockOf(g),
  };
}

// Live games first, then upcoming (soonest first), then finals (latest first).
export function sortGames(games) {
  const rank = { live: 0, upcoming: 1, final: 2 };
  return [...games].sort((a, b) => {
    const ra = rank[a.status] ?? 3;
    const rb = rank[b.status] ?? 3;
    if (ra !== rb) return ra - rb;
    const ta = a.startTimeUTC || '';
    const tb = b.startTimeUTC || '';
    if (a.status === 'final') return tb.localeCompare(ta); // latest final first
    return ta.localeCompare(tb);
  });
}

function playerName(rosterMap, playerId) {
  if (playerId == null) return null;
  const p = rosterMap.get(playerId);
  if (!p) return null;
  const first = p.firstName && p.firstName.default ? p.firstName.default : '';
  const last = p.lastName && p.lastName.default ? p.lastName.default : '';
  const full = `${first} ${last}`.trim();
  return full || null;
}

function buildRosterMap(rosterSpots) {
  const map = new Map();
  if (!Array.isArray(rosterSpots)) return map;
  for (const spot of rosterSpots) {
    if (spot && spot.playerId != null) map.set(spot.playerId, spot);
  }
  return map;
}

function teamAbbrevFor(teamId, home, away) {
  if (home && home.id === teamId) return home.abbrev;
  if (away && away.id === teamId) return away.abbrev;
  return '';
}

// Plain-English label for a play-by-play event type.
const PLAY_LABELS = {
  goal: 'Goal',
  'shot-on-goal': 'Shot on goal',
  'blocked-shot': 'Blocked shot',
  'missed-shot': 'Missed shot',
  penalty: 'Penalty',
  hit: 'Hit',
  faceoff: 'Faceoff',
  giveaway: 'Giveaway',
  takeaway: 'Takeaway',
  'period-start': 'Period start',
  'period-end': 'End of period',
  'game-end': 'Game over',
  'shootout-complete': 'Shootout over',
  'goalie-stopped': 'Goalie stop',
};

function prettify(s) {
  return String(s || '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function playDetail(play, rosterMap, home, away) {
  const key = play.typeDescKey;
  const det = play.details || {};
  if (key === 'goal') {
    const scorer = playerName(rosterMap, det.scoringPlayerId);
    const parts = [];
    if (scorer) parts.push(scorer + (det.scoringPlayerTotal != null ? ` (${det.scoringPlayerTotal})` : ''));
    const a1 = playerName(rosterMap, det.assist1PlayerId);
    const a2 = playerName(rosterMap, det.assist2PlayerId);
    const assists = [a1, a2].filter(Boolean);
    if (assists.length) parts.push('assists: ' + assists.join(', '));
    if (det.shotType) parts.push(prettify(det.shotType));
    if (det.goalModifier) parts.push(prettify(det.goalModifier));
    return parts.join(' · ');
  }
  if (key === 'penalty') {
    const who = playerName(rosterMap, det.committedByPlayerId);
    const bits = [];
    if (det.descKey) bits.push(prettify(det.descKey));
    if (who) bits.push(who);
    if (det.duration) bits.push(`${det.duration} min`);
    return bits.join(' · ');
  }
  if (key === 'shot-on-goal' || key === 'blocked-shot' || key === 'missed-shot') {
    const shooter = playerName(rosterMap, det.shootingPlayerId);
    const goalie = playerName(rosterMap, det.goalieInNetId);
    const bits = [];
    if (shooter) bits.push(shooter);
    if (goalie && key === 'shot-on-goal') bits.push('saved by ' + goalie);
    if (det.shotType && key !== 'blocked-shot') bits.push(prettify(det.shotType));
    return bits.join(' · ');
  }
  return '';
}

function normalizePlay(play, rosterMap, home, away) {
  if (!play || typeof play !== 'object') return null;
  const pd = play.periodDescriptor || {};
  const number = typeof pd.number === 'number' ? pd.number : null;
  return {
    key: play.typeDescKey || 'unknown',
    label: PLAY_LABELS[play.typeDescKey] || prettify(play.typeDescKey || 'play'),
    period: number,
    periodLabel: number != null ? periodLabel(number, pd.periodType) : '',
    timeInPeriod: typeof play.timeInPeriod === 'string' ? play.timeInPeriod : '',
    team: teamAbbrevFor(play.details && play.details.eventOwnerTeamId, home, away),
    detail: playDetail(play, rosterMap, home, away),
  };
}

// Full game view: status, clock, shots, scoring summary, recent plays.
export function normalizeGameDetail(d) {
  if (!d || typeof d !== 'object' || d.id == null) return null;
  const away = teamOf(d.awayTeam);
  const home = teamOf(d.homeTeam);
  if (!away || !home) return null;
  const rosterMap = buildRosterMap(d.rosterSpots);
  const plays = Array.isArray(d.plays) ? d.plays : [];
  const normalized = plays.map((p) => normalizePlay(p, rosterMap, home, away)).filter(Boolean);
  const scoring = normalized.filter((p) => p.key === 'goal');
  const recent = normalized.slice(-20).reverse();
  const status = gameStatus(d.gameState);
  return {
    id: d.id,
    away,
    home,
    status,
    live: status === 'live',
    startTimeUTC: typeof d.startTimeUTC === 'string' ? d.startTimeUTC : null,
    ...clockOf(d),
    scoring,
    recentPlays: recent,
  };
}
