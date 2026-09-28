// OASIS party — min-max participation, the heart of Merlin's directive.
// A match may start with anywhere from minPlayers to maxPlayers seats.
// If human players fall short of the minimum, NPCs backfill the roster.
// Humans are never dropped and the roster never exceeds the maximum.

/**
 * Build the final roster for a match.
 *
 * @param {string[]} humans   human player ids (or callsigns) already seated
 * @param {object[]} npcs     NPC objects already chosen (each needs an `id`)
 * @param {number} minPlayers game minimum (e.g. chess: 2)
 * @param {number} maxPlayers game maximum (e.g. colosseum: 8)
 * @param {object[]} npcPool  NPC candidates to draw backfill from (each needs an `id`)
 * @returns {{ roster, backfilled, droppedNpcs }}
 *   roster: [{ seat, kind: 'human'|'npc', id, npc? }] in seat order
 *   backfilled: how many NPCs were added to reach the minimum
 *   droppedNpcs: NPC ids removed to respect the maximum (humans always win ties)
 */
export function fillParty({ humans = [], npcs = [], minPlayers, maxPlayers, npcPool = [] }) {
  if (!Number.isInteger(minPlayers) || !Number.isInteger(maxPlayers)) {
    throw new Error('fillParty needs integer minPlayers and maxPlayers.');
  }
  if (minPlayers < 2) throw new Error('minPlayers must be at least 2 for a versus match.');
  if (maxPlayers < minPlayers) throw new Error('maxPlayers cannot be below minPlayers.');

  const cleanHumans = [...new Set(humans.filter(Boolean))];
  if (cleanHumans.length > maxPlayers) {
    throw new Error(`Too many humans: ${cleanHumans.length} seated, max is ${maxPlayers}.`);
  }

  // Chosen NPCs first (dedupe, keep order); humans always keep their seats.
  const seen = new Set(cleanHumans);
  const chosen = [];
  for (const npc of npcs) {
    if (!npc || !npc.id || seen.has(npc.id)) continue;
    seen.add(npc.id);
    chosen.push(npc);
  }

  // Backfill from the pool until the minimum is met.
  let backfilled = 0;
  if (cleanHumans.length + chosen.length < minPlayers) {
    for (const candidate of npcPool) {
      if (cleanHumans.length + chosen.length >= minPlayers) break;
      if (!candidate || !candidate.id || seen.has(candidate.id)) continue;
      seen.add(candidate.id);
      chosen.push(candidate);
      backfilled += 1;
    }
  }

  // Enforce the maximum by trimming NPCs (last chosen first). Humans are sacred.
  const droppedNpcs = [];
  while (cleanHumans.length + chosen.length > maxPlayers && chosen.length > 0) {
    const removed = chosen.pop();
    droppedNpcs.unshift(removed.id);
  }
  if (cleanHumans.length + chosen.length > maxPlayers) {
    throw new Error('Roster still exceeds maxPlayers after trimming NPCs.');
  }

  const roster = [
    ...cleanHumans.map((id, i) => ({ seat: i + 1, kind: 'human', id })),
    ...chosen.map((npc, i) => ({ seat: cleanHumans.length + i + 1, kind: 'npc', id: npc.id, npc })),
  ];

  return { roster, backfilled, droppedNpcs };
}

/** True when the human headcount alone is below the game's minimum. */
export function needsBackfill(humanCount, minPlayers) {
  return humanCount < minPlayers;
}

/** How many more seats (human or NPC) are needed to reach the minimum. */
export function seatsNeeded(humanCount, npcCount, minPlayers) {
  return Math.max(0, minPlayers - humanCount - npcCount);
}

/** True when one more human may still join. */
export function canJoinMore(humanCount, npcCount, maxPlayers) {
  return humanCount + npcCount < maxPlayers;
}

/** Validate a finished roster: every seat filled, within [min, max], humans intact. */
export function validateRoster(roster, { minPlayers, maxPlayers, humans = [] }) {
  const errors = [];
  if (!Array.isArray(roster)) return ['Roster must be an array.'];
  if (roster.length < minPlayers) errors.push(`Roster has ${roster.length} seats but the minimum is ${minPlayers}.`);
  if (roster.length > maxPlayers) errors.push(`Roster has ${roster.length} seats but the maximum is ${maxPlayers}.`);
  const ids = new Set(roster.map((s) => s.id));
  for (const h of humans) {
    if (!ids.has(h)) errors.push(`Human ${h} is missing from the roster.`);
  }
  return errors;
}
