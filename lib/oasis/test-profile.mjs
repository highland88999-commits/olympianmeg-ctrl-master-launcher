// OASIS profile tests — stats normalization, result recording, boss wins.
import { emptyStats, normalizeStats, recordResult, recordBossWin, winRate, getAvatar } from './profile.js';

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; } else { fail++; console.error('FAIL:', name); } };

// Normalization never breaks on junk.
{
  const s = normalizeStats(null);
  ok(s.chess.wins === 0 && s.basketball.losses === 0, 'null normalizes to empty');
  const partial = normalizeStats({ chess: { wins: 3 } });
  ok(partial.chess.wins === 3 && partial.chess.losses === 0, 'partial rows merge over empty shape');
  const neg = normalizeStats({ chess: { wins: -5, losses: 2.7 } });
  ok(neg.chess.wins === 0, 'negative wins clamped');
}

// Recording results.
{
  let s = emptyStats();
  s = recordResult(s, 'chess', { won: true });
  ok(s.chess.wins === 1 && s.chess.losses === 0, 'win recorded');
  s = recordResult(s, 'chess', { won: false });
  ok(s.chess.losses === 1, 'loss recorded');
  s = recordResult(s, 'chess', { won: true, eliteWin: true });
  ok(s.chess.eliteWins === 1 && s.chess.wins === 2, 'elite win recorded');
  const before = JSON.stringify(s);
  s = recordResult(s, 'nope', { won: true });
  ok(JSON.stringify(s) === before, 'unknown game ignored');
}

// Boss wins dedupe.
{
  let wins = recordBossWin([], 'checkmate_prime', 'Grandmaster Slayer');
  ok(wins.length === 1 && wins[0].title === 'Grandmaster Slayer', 'boss win recorded with title');
  wins = recordBossWin(wins, 'checkmate_prime', 'Grandmaster Slayer');
  ok(wins.length === 1, 'duplicate boss win ignored');
  wins = recordBossWin(wins, 'shotclock_seraph', 'Blacktop Legend');
  ok(wins.length === 2, 'second boss recorded');
}

// Win rate.
ok(winRate({ wins: 3, losses: 1 }) === 0.75, 'win rate 3-1');
ok(winRate({ wins: 0, losses: 0 }) === null, 'no matches -> null');
ok(winRate(null) === null, 'null safe');

// Avatars.
ok(getAvatar('nova').glyph === 'N', 'avatar lookup');
ok(getAvatar('missing').id === 'nova', 'unknown avatar falls back');

console.log(`profile: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
