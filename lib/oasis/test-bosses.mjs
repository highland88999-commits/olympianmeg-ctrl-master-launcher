// OASIS boss tests — definitions, unlock eligibility, boss-rush.
import { BOSSES, BOSS_RUSH, getBoss, bossesForGame, bossNpc, bossEligible, unlockedBosses, bossRushComplete } from './bosses.js';

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; } else { fail++; console.error('FAIL:', name); } };

// Definitions.
ok(BOSSES.length === 3, 'three bosses defined');
ok(new Set(BOSSES.map((b) => b.id)).size === 3, 'boss ids unique');
ok(BOSSES.every((b) => b.name && b.tagline && b.specialRules.length >= 3 && b.title && b.engine), 'bosses fully specified');
ok(BOSSES.every((b) => bossNpc(b) !== null), 'every boss maps to a real NPC');
ok(BOSS_RUSH.length === 3 && BOSS_RUSH.every((id) => getBoss(id)), 'boss rush references real bosses');

// Per-game mapping.
ok(bossesForGame('chess').length === 1, 'one chess boss');
ok(bossesForGame('basketball').length === 1, 'one basketball boss');
ok(bossesForGame('colosseum').length === 1, 'one colosseum boss');
ok(getBoss('nope') === null, 'getBoss null for unknown');

// Eligibility gates on elite wins.
{
  const chessBoss = 'checkmate_prime';
  ok(bossEligible(chessBoss, {}) === false, 'locked with no stats');
  ok(bossEligible(chessBoss, { chess: { eliteWins: 2 } }) === false, 'locked below threshold');
  ok(bossEligible(chessBoss, { chess: { eliteWins: 3 } }) === true, 'unlocked at threshold');
  ok(bossEligible('shotclock_seraph', { basketball: { eliteWins: 5 } }) === true, 'basketball unlock at 5');
  ok(bossEligible('undying_champion', { colosseum: { eliteWins: 3 } }) === true, 'colosseum unlock at 3');
  ok(bossEligible('missing', {}) === false, 'unknown boss ineligible');
  ok(bossEligible(chessBoss, null) === false, 'null stats safe');
}

// Unlocked-but-undefeated list.
{
  const stats = { chess: { eliteWins: 3 }, basketball: { eliteWins: 0 }, colosseum: { eliteWins: 0 } };
  const unlocked = unlockedBosses(stats, []);
  ok(unlocked.length === 1 && unlocked[0].id === 'checkmate_prime', 'unlockedBosses lists newly unlocked');
  const after = unlockedBosses(stats, ['checkmate_prime']);
  ok(after.length === 0, 'defeated bosses excluded');
}

// Boss-rush completion.
ok(bossRushComplete([]) === false, 'rush incomplete when empty');
ok(bossRushComplete(['checkmate_prime', 'shotclock_seraph']) === false, 'rush incomplete at 2/3');
ok(bossRushComplete(['checkmate_prime', 'shotclock_seraph', 'undying_champion']) === true, 'rush complete at 3/3');

console.log(`bosses: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
