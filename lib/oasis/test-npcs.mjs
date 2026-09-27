// OASIS NPC tests — roster integrity and difficulty ordering.
import { NPCS, TIERS, getNpc, npcsForGame, npcsByTier, sortByDifficulty, pickBackfill, difficultyLabel } from './npcs.js';

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; } else { fail++; console.error('FAIL:', name); } };

// Roster integrity.
ok(NPCS.length >= 12, 'roster has at least 12 NPCs');
ok(new Set(NPCS.map((n) => n.id)).size === NPCS.length, 'NPC ids unique');
ok(NPCS.every((n) => n.name && n.tagline && n.games.length > 0), 'every NPC has name, tagline, games');
ok(NPCS.every((n) => TIERS.includes(n.tier)), 'every NPC has a valid tier');
ok(NPCS.every((n) => Number.isInteger(n.difficulty) && n.difficulty >= 1 && n.difficulty <= 10), 'difficulty in 1..10');

// No direct IP: banned terms must not appear.
{
  const banned = ['gundam', 'delorean', 'parzival', 'wade watts', 'art3mis', 'garth', 'joust'];
  const blob = JSON.stringify(NPCS).toLowerCase();
  ok(banned.every((b) => !blob.includes(b)), 'no direct IP references in roster');
}

// Difficulty ordering.
{
  const sorted = sortByDifficulty(NPCS);
  const ordered = sorted.every((n, i, arr) => i === 0 || arr[i - 1].difficulty <= n.difficulty);
  ok(ordered, 'sortByDifficulty orders ascending');
  const chess = npcsForGame('chess');
  ok(chess.length > 0 && chess.every((n) => n.games.includes('chess')), 'npcsForGame filters chess');
  const chessOrdered = chess.every((n, i, arr) => i === 0 || arr[i - 1].difficulty <= n.difficulty);
  ok(chessOrdered, 'npcsForGame returns easiest first');
}

// Tiers.
ok(npcsByTier('rookie').every((n) => n.tier === 'rookie'), 'npcsByTier rookie');
ok(npcsByTier('elite').length >= 3, 'at least 3 elite NPCs');
try { npcsByTier('god'); ok(false, 'unknown tier throws'); } catch { ok(true, 'unknown tier throws'); }

// Backfill picks.
{
  const picks = pickBackfill({ gameSlug: 'chess', count: 2, tier: 'rookie' });
  ok(picks.length === 2, 'pickBackfill returns requested count');
  ok(picks.every((n) => n.games.includes('chess')), 'backfill picks play the game');
  ok(new Set(picks.map((n) => n.id)).size === 2, 'backfill picks unique');
  const excl = pickBackfill({ gameSlug: 'chess', count: 5, tier: 'rookie', excludeIds: picks.map((n) => n.id) });
  ok(excl.every((n) => !picks.some((p) => p.id === n.id)), 'excludeIds respected');
  const none = pickBackfill({ gameSlug: 'nope', count: 3 });
  ok(none.length === 0, 'unknown game yields no picks');
}

// Lookup + labels.
ok(getNpc('paradox_prime')?.name === 'Paradox Prime', 'getNpc finds by id');
ok(getNpc('missing') === null, 'getNpc null for unknown');
ok(difficultyLabel(1) === 'Rookie' && difficultyLabel(5) === 'Veteran' && difficultyLabel(10) === 'Elite', 'difficulty labels');

console.log(`npcs: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
