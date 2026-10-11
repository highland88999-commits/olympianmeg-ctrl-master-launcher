// KOMBAT ARENA — BRAWL MODE rules.
// Pure logic only (no three.js, no DOM): safe to import in Node for headless tests.
// Free-for-all elimination: every fighter for themselves. Round ends when one
// fighter remains (or the timer expires -> highest health takes the round).
//
// TARGETING DECISION (documented per the brawl build notes):
//   Nearest-enemy snap targeting, for both the player and the CPU.
//   - The player's attacks (light/heavy/special) snap-face the nearest living
//     enemy inside the attack's range; the HUD target ring shows that fighter.
//   - Every CPU targets its NEAREST living opponent (see aiThink in
//     app/kombat/brawl.js) — deliberately no gang-up bias, no target memory,
//     no focus-fire.
//   Why this option: with up to 16 fighters on a phone screen, manual target
//   switching (tap-to-target / lock-on cycling) is fiddly and slow; nearest-
//   enemy snap keeps combat fluid one-thumb. It is also symmetric — the AI
//   plays by the exact same rule, so it stays fair by construction.
//   Alternatives considered and rejected: tap-to-target (breaks flow on
//   small screens), sticky lock-on (unfair kiting in a free-for-all).
//
// FINISH HIM RULE (brawl adaptation of the duel flow):
//   When the final round's winner is decided, the match does NOT end on the
//   KO. Instead: the last fighter beaten staggers back up "dizzy" at 1 HP
//   for FINISH_HIM_SECONDS (4s, shared with duel). The champion's player may
//   press FATALITY to perform their fighter's fatality (cinematic + name
//   card); a CPU champion sometimes performs its own (difficulty-scaled
//   chance, never input-read). If the window expires, it's a plain KO.
//   The victim: on a KO-decided match, the fighter just knocked out; on a
//   timeout-decided match, the toughest rival still standing (highest health
//   among living non-champions) — the most dramatic final blow.

export const BRAWL_COUNTS = [2, 4, 8, 16]; // total fighters in the arena (player + CPU)
export const BRAWL_BEST_OF = [3, 5, 7]; // round options (Merlin's call)
export const BRAWL_ROUND_TIME = 75; // seconds — a little longer than duel for multi-fighter chaos
export const BRAWL_MIN_SEPARATION = 1.0; // bodies never overlap closer than this (XZ)
export const MULTI_KO_WINDOW = 1.4; // seconds: KOs inside this window chain DOUBLE/TRIPLE KO callouts

/** Rounds needed to take the match: best-of 3 -> 2, 5 -> 3, 7 -> 4. */
export function brawlWinsNeeded(bestOf) {
  if (!BRAWL_BEST_OF.includes(bestOf)) throw new Error(`kombat: bad bestOf ${bestOf}`);
  return Math.ceil(bestOf / 2);
}

export function createBrawlState(fighterCount, bestOf) {
  if (!BRAWL_COUNTS.includes(fighterCount)) throw new Error(`kombat: bad fighterCount ${fighterCount}`);
  return {
    phase: 'intro', // intro -> fight -> roundEnd -> intro ... -> done
    round: 1,
    bestOf,
    winsNeeded: brawlWinsNeeded(bestOf),
    timeLeft: BRAWL_ROUND_TIME,
    fighters: Array.from({ length: fighterCount }, (_, i) => ({
      idx: i,
      alive: true,
      health: 100,
      rounds: 0,
    })),
  };
}

/** Reset every fighter to alive/full-health for the next round (round wins kept). */
export function resetBrawlRound(state) {
  for (const f of state.fighters) {
    f.alive = true;
    f.health = 100;
  }
  state.timeLeft = BRAWL_ROUND_TIME;
  state.phase = 'intro';
  return state;
}

export function brawlAlive(state) {
  return state.fighters.filter((f) => f.alive);
}

export function brawlAliveCount(state) {
  let n = 0;
  for (const f of state.fighters) if (f.alive) n += 1;
  return n;
}

/** Mark a fighter KO'd. Returns the new alive count. */
export function applyBrawlKnockout(state, loserIdx) {
  const f = state.fighters[loserIdx];
  if (f && f.alive) {
    f.alive = false;
    f.health = 0;
  }
  return brawlAliveCount(state);
}

/**
 * Decide the round winner. Call when <=1 fighter remains or time expires.
 * Returns a fighter idx, or 'draw' when nobody can take it (tie on timeout).
 */
export function brawlRoundWinner(state) {
  const alive = brawlAlive(state);
  if (alive.length === 1) return alive[0].idx;
  if (alive.length === 0) return 'draw';
  // timeout: highest health wins; exact tie = draw (round replays)
  let best = alive[0];
  for (const f of alive) if (f.health > best.health) best = f;
  const tied = alive.filter((f) => f.health === best.health);
  return tied.length > 1 ? 'draw' : best.idx;
}

/**
 * Score a finished round. Returns { phase, champion } where champion is a
 * fighter idx once someone reaches the majority, else null.
 */
export function applyBrawlRoundWin(state, winnerIdx /* number | 'draw' */) {
  if (winnerIdx === 'draw') {
    state.round += 0; // replay the same round
    resetBrawlRound(state);
    return { phase: state.phase, champion: null };
  }
  const w = state.fighters[winnerIdx];
  if (!w) throw new Error(`kombat: bad winnerIdx ${winnerIdx}`);
  w.rounds += 1;
  if (w.rounds >= state.winsNeeded) {
    state.phase = 'done';
    return { phase: 'done', champion: winnerIdx };
  }
  state.round += 1;
  resetBrawlRound(state);
  return { phase: state.phase, champion: null };
}

/**
 * Spawn positions: fighters ringed evenly around the arena center.
 * Returns [{x, z}] of length count, all inside radius, with a random rotation
 * offset so rematches don't look identical.
 */
export function brawlSpawnPositions(count, radius, rand = Math.random) {
  const pts = [];
  const r = Math.max(2.2, radius * 0.62);
  const off = rand() * Math.PI * 2;
  for (let i = 0; i < count; i++) {
    const a = off + (i / count) * Math.PI * 2;
    pts.push({ x: Math.cos(a) * r, z: Math.sin(a) * r });
  }
  return pts;
}

/** Multi-KO callout label for a chain of KOs inside MULTI_KO_WINDOW. */
export function multiKoLabel(chainCount) {
  if (chainCount === 2) return 'DOUBLE KO!';
  if (chainCount === 3) return 'TRIPLE KO!';
  if (chainCount >= 4) return 'RAMPAGE!';
  return null;
}

/**
 * Pick the FINISH HIM victim for a match-deciding round.
 * fighters: array of { idx, alive, health } (plain records — engine maps its
 *   own fighter objects to this shape before calling).
 * championIdx: the decided match winner's idx.
 * Returns a fighter idx:
 *   - if exactly one non-champion is alive, that's the victim (the normal
 *     KO-decided case: the last fighter beaten);
 *   - otherwise the toughest rival still standing (highest health among
 *     living non-champions; ties break to the lowest idx) — the
 *     timeout-decided case.
 * Returns -1 when nobody qualifies (shouldn't happen in a decided match).
 */
export function pickFinishHimVictim(fighters, championIdx) {
  const rivals = fighters.filter((f) => f.idx !== championIdx && f.alive);
  if (rivals.length === 0) return -1;
  if (rivals.length === 1) return rivals[0].idx;
  let best = rivals[0];
  for (const r of rivals) {
    if (r.health > best.health || (r.health === best.health && r.idx < best.idx)) best = r;
  }
  return best.idx;
}
