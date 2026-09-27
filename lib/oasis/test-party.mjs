// OASIS party tests — min-max participation logic.
import { fillParty, needsBackfill, seatsNeeded, canJoinMore, validateRoster } from './party.js';

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; } else { fail++; console.error('FAIL:', name); } };
const throws = (fn, name) => { try { fn(); fail++; console.error('FAIL (no throw):', name); } catch { pass++; } };

const npc = (id) => ({ id, name: id });

// 1. Solo human in chess (min 2): one NPC backfilled.
{
  const r = fillParty({ humans: ['h1'], npcs: [], minPlayers: 2, maxPlayers: 2, npcPool: [npc('n1'), npc('n2')] });
  ok(r.roster.length === 2, 'chess solo backfills to 2');
  ok(r.backfilled === 1, 'backfilled count is 1');
  ok(r.roster[0].kind === 'human' && r.roster[1].kind === 'npc', 'human keeps seat 1');
}

// 2. Two humans in chess: no backfill.
{
  const r = fillParty({ humans: ['h1', 'h2'], npcs: [], minPlayers: 2, maxPlayers: 2, npcPool: [npc('n1')] });
  ok(r.backfilled === 0 && r.roster.length === 2, 'full human roster needs no backfill');
  ok(r.roster.every((s) => s.kind === 'human'), 'no NPCs when humans suffice');
}

// 3. Basketball 3v3: 2 humans + 4 NPC pool, max 6 — backfill to min 2 only.
{
  const r = fillParty({ humans: ['h1', 'h2'], npcs: [npc('n1')], minPlayers: 2, maxPlayers: 6, npcPool: [npc('n2')] });
  ok(r.roster.length === 3, 'roster is 2 humans + 1 chosen NPC');
  ok(r.backfilled === 0, 'no backfill when chosen NPCs meet minimum');
}

// 4. Colosseum: 1 human, min 2, max 8 — backfills exactly 1.
{
  const r = fillParty({ humans: ['h1'], npcs: [], minPlayers: 2, maxPlayers: 8, npcPool: [npc('n1'), npc('n2'), npc('n3')] });
  ok(r.roster.length === 2 && r.backfilled === 1, 'colosseum backfills 1');
}

// 5. Empty pool: roster stays short, no crash.
{
  const r = fillParty({ humans: ['h1'], npcs: [], minPlayers: 2, maxPlayers: 2, npcPool: [] });
  ok(r.roster.length === 1 && r.backfilled === 0, 'empty pool leaves roster short');
}

// 6. Too many humans throws.
throws(() => fillParty({ humans: ['a', 'b', 'c'], npcs: [], minPlayers: 2, maxPlayers: 2, npcPool: [] }), 'humans over max throws');

// 7. NPCs trimmed to respect max; humans never dropped.
{
  const r = fillParty({ humans: ['h1', 'h2'], npcs: [npc('n1'), npc('n2'), npc('n3')], minPlayers: 2, maxPlayers: 3, npcPool: [] });
  ok(r.roster.length === 3, 'roster trimmed to max');
  ok(r.roster.filter((s) => s.kind === 'human').length === 2, 'humans survive trimming');
  ok(r.droppedNpcs.length === 2, 'two NPCs dropped');
}

// 8. Duplicate NPC ids deduped.
{
  const r = fillParty({ humans: ['h1'], npcs: [npc('n1'), npc('n1')], minPlayers: 2, maxPlayers: 4, npcPool: [] });
  ok(r.roster.length === 2, 'duplicate NPC ids deduped');
}

// 9. Helpers.
ok(needsBackfill(1, 2) === true, 'needsBackfill true when short');
ok(needsBackfill(2, 2) === false, 'needsBackfill false when met');
ok(seatsNeeded(1, 0, 2) === 1, 'seatsNeeded counts open seats');
ok(canJoinMore(2, 1, 4) === true, 'canJoinMore true when seats free');
ok(canJoinMore(3, 1, 4) === false, 'canJoinMore false when full');

// 10. Roster validation.
{
  const r = fillParty({ humans: ['h1'], npcs: [], minPlayers: 2, maxPlayers: 2, npcPool: [npc('n1')] });
  ok(validateRoster(r.roster, { minPlayers: 2, maxPlayers: 2, humans: ['h1'] }).length === 0, 'valid roster passes');
  ok(validateRoster(r.roster, { minPlayers: 2, maxPlayers: 2, humans: ['h1', 'ghost'] }).length === 1, 'missing human flagged');
}

console.log(`party: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
