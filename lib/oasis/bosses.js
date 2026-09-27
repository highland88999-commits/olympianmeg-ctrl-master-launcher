// OASIS bosses — elite NPCs ascended, with special rules per game.
// A boss is a spectacle: beating one is recorded on the player's profile
// as a permanent bragging right. Boss-rush strings all three in a row.

import { getNpc } from './npcs.js';

export const BOSSES = [
  {
    id: 'checkmate_prime',
    npcId: 'paradox_prime',
    name: 'CHECKMATE PRIME',
    game: 'chess',
    tagline: 'Paradox Prime, overclocked. It does not blunder. It does not hurry.',
    specialRules: [
      'Plays at maximum search depth — every move is calculated, never guessed.',
      'No take-backs: the boss move timer is half yours.',
      'Draw offers are refused. There is only victory or defeat.',
    ],
    // How the game engine should treat this boss (consumed by the chess AI hookup).
    engine: { aiDepth: 'max', blunderRate: 0, moveTimeMs: 1200 },
    unlock: {
      description: 'Defeat 3 elite NPCs in chess to earn a shot at the Prime.',
      check: (stats) => (stats?.chess?.eliteWins ?? 0) >= 3,
    },
    title: 'Grandmaster Slayer',
  },
  {
    id: 'shotclock_seraph',
    npcId: 'deadline_dj',
    name: 'SHOTCLOCK SERAPH',
    game: 'basketball',
    tagline: 'Deadline DJ, remixed. Every third straight basket counts double.',
    specialRules: [
      'Scoring streaks: every 3rd consecutive basket scores double.',
      'The boss shoots from deep — contest every spot.',
      '60 seconds. No mercy. No timeouts.',
    ],
    engine: { streakBonusEvery: 3, streakMultiplier: 2, deepShotBias: 0.35 },
    unlock: {
      description: 'Win 5 shootouts against elite NPCs to face the Seraph.',
      check: (stats) => (stats?.basketball?.eliteWins ?? 0) >= 5,
    },
    title: 'Blacktop Legend',
  },
  {
    id: 'undying_champion',
    npcId: 'the_archivist',
    name: 'THE UNDYING CHAMPION',
    game: 'colosseum',
    tagline: 'The Archivist, undefeated. Wounded, she only fights harder.',
    specialRules: [
      'Champion health pool: twice a normal gladiator.',
      'Enrage: below 25% health her strikes hit 50% harder.',
      'The crowd favors the bold — finishing moves earn double glory.',
    ],
    engine: { healthMultiplier: 2, enrageAt: 0.25, enrageDamageBonus: 0.5 },
    unlock: {
      description: 'Defeat 3 elite NPCs in the arena to challenge the Champion.',
      check: (stats) => (stats?.colosseum?.eliteWins ?? 0) >= 3,
    },
    title: 'Champion of Champions',
  },
];

/** Boss-rush: face all three bosses in game order. */
export const BOSS_RUSH = ['checkmate_prime', 'shotclock_seraph', 'undying_champion'];

export function getBoss(id) {
  return BOSSES.find((b) => b.id === id) || null;
}

export function bossesForGame(gameSlug) {
  return BOSSES.filter((b) => b.game === gameSlug);
}

/** The NPC behind the boss mask (for portraits and flavor). */
export function bossNpc(boss) {
  return getNpc(boss.npcId);
}

/**
 * Is this boss unlocked for a player? `stats` is the player's per-game
 * record from their OASIS profile: { chess: { eliteWins }, ... }.
 */
export function bossEligible(bossId, stats) {
  const boss = getBoss(bossId);
  if (!boss) return false;
  try {
    return boss.unlock.check(stats || {});
  } catch {
    return false;
  }
}

/** Bosses the player has unlocked but not yet defeated. */
export function unlockedBosses(stats, defeatedIds = []) {
  const defeated = new Set(defeatedIds);
  return BOSSES.filter((b) => !defeated.has(b.id) && bossEligible(b.id, stats));
}

/** True when every boss in the rush has been defeated at least once. */
export function bossRushComplete(defeatedIds = []) {
  const defeated = new Set(defeatedIds);
  return BOSS_RUSH.every((id) => defeated.has(id));
}
