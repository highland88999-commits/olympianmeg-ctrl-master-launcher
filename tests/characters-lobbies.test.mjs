// tests/characters-lobbies.test.mjs — headless tests for WAVE 4 of
// the characters-everywhere program: registry & lobbies.
//   - lib/oasis/roster-npcs.js: the 43 roster fighters as lobby NPC
//     records (namespaced seat ids, standard NPC record shape,
//     Kombat-stats difficulty derivation, getAnyNpc resolution,
//     originals-only separation from lib/oasis/npcs.js);
//   - the lobby seat flow end to end (fillParty seats a legend
//     under its own name; the room's npc id list carries its id);
//   - the pick-chain device-local persistence of the OASIS
//     registry shelf (surface 'oasis');
//   - source wiring of the four surfaces: CharacterSelect (roster
//     shelf + device-local pick + archetype system intact),
//     ModelViewer (characterId mode via the Wave 0 adapter, no
//     faked clip picker), NpcPicker (Roster Legends section),
//     RosterPanel (human profile-character tokens, roster NPC
//     names), Lobby (getAnyNpc seating).
// Run: node tests/characters-lobbies.test.mjs (from the repo root).
import fs from 'node:fs';
import {
  ROSTER_NPC_PREFIX, ROSTER_NPC_GAMES, rosterNpcId,
  characterIdFromRosterNpcId, rosterNpcForCharacter, getRosterNpc,
  rosterNpcOptions, getAnyNpc,
} from '../lib/oasis/roster-npcs.js';
import {
  getNpc, npcsForGame, pickBackfill, difficultyLabel,
} from '../lib/oasis/npcs.js';
import { fillParty } from '../lib/oasis/party.js';
import {
  readSurfaceOverride, writeSurfaceOverride,
} from '../lib/characters/embodiment.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

const FREDDY = 'q001-freddy-krueger';
const JASON = 'q002-jason-voorhees';
const CHUCKY = 'q007-chucky';
const TREX = 'q021-t-rex';
const HULK = 'q033-hulk';

function fakeStorage(seed) {
  const m = new Map(Object.entries(seed || {}));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    _map: m,
  };
}

// ==================================================================
// 1. Seat-id namespace
// ==================================================================
{
  t('rosterNpcId namespaces a real character', rosterNpcId(FREDDY) === `${ROSTER_NPC_PREFIX}${FREDDY}`);
  t('rosterNpcId refuses unknown characters', rosterNpcId('q999-nope') === null);
  t('rosterNpcId refuses non-strings', rosterNpcId(null) === null && rosterNpcId(7) === null);
  t('characterId round-trips', characterIdFromRosterNpcId(rosterNpcId(JASON)) === JASON);
  t('a generic npc id is not a roster id', characterIdFromRosterNpcId('pixel_paige') === null);
  t('a roster id for an unknown character is refused', characterIdFromRosterNpcId('roster:q999-nope') === null);
  t('non-strings are refused', characterIdFromRosterNpcId(undefined) === null);
}

// ==================================================================
// 2. Record shape + Kombat-stats difficulty derivation
// ==================================================================
{
  const freddy = getRosterNpc(rosterNpcId(FREDDY));
  t('freddy record resolves', !!freddy);
  t('record carries the standard npc shape',
    freddy.id === rosterNpcId(FREDDY) && freddy.name === 'Freddy Krueger'
    && typeof freddy.tagline === 'string' && typeof freddy.tier === 'string'
    && Number.isInteger(freddy.difficulty) && Array.isArray(freddy.games));
  t('record carries display identity', freddy.characterId === FREDDY
    && freddy.preview === '/characters/q001-freddy-krueger.png' && freddy.roster === true);
  t('tagline names a signature power', freddy.tagline.includes('Dream Slash'));
  t('games are the NPC-seating lobby games',
    JSON.stringify(freddy.games) === JSON.stringify(['chess', 'basketball', 'colosseum'])
    && JSON.stringify(ROSTER_NPC_GAMES) === JSON.stringify(freddy.games));
  // Hand-computed from lib/kombat/roster.js stats (power/speed/
  // toughness/range), rounded mean: Freddy (7,6,6,7)=6.5 -> 7,
  // Chucky (5,8,6,5)=6 -> 6, Hulk (10,6,10,4)=7.5 -> 8,
  // T-Rex (10,6,9,5)=7.5 -> 8.
  t('freddy difficulty is his Kombat mean (7)', freddy.difficulty === 7 && freddy.tier === 'veteran');
  const chucky = rosterNpcForCharacter(CHUCKY);
  t('chucky difficulty is his Kombat mean (6)', chucky.difficulty === 6 && chucky.tier === 'veteran');
  const hulk = rosterNpcForCharacter(HULK);
  t('hulk difficulty is his Kombat mean (8, elite)', hulk.difficulty === 8 && hulk.tier === 'elite');
  const trex = rosterNpcForCharacter(TREX);
  t('t-rex difficulty is his Kombat mean (8, elite)', trex.difficulty === 8 && trex.tier === 'elite');
  t('unknown character has no record', rosterNpcForCharacter('q999-nope') === null);
  t('unknown seat id has no record', getRosterNpc('roster:q999-nope') === null && getRosterNpc('nope') === null);
}

// ==================================================================
// 3. The full shelf: 43 resolvable, consistent options
// ==================================================================
{
  const options = rosterNpcOptions();
  t('the shelf offers all 59 fighters', options.length === 59);
  t('option ids are unique', new Set(options.map((o) => o.id)).size === 59);
  t('every option resolves through getAnyNpc',
    options.every((o) => getAnyNpc(o.id) && getAnyNpc(o.id).characterId === o.characterId));
  t('every difficulty is an integer on the 1-10 scale',
    options.every((o) => Number.isInteger(o.difficulty) && o.difficulty >= 1 && o.difficulty <= 10));
  t('every tier agrees with difficultyLabel bands',
    options.every((o) => difficultyLabel(o.difficulty).toLowerCase() === o.tier));
  t('every option is seatable in the lobby games',
    options.every((o) => o.games.includes('chess') && o.games.includes('colosseum')));
}

// ==================================================================
// 4. Originals stay originals — the generic cast is untouched
// ==================================================================
{
  const paige = getNpc('pixel_paige');
  t('getAnyNpc resolves a hand-authored npc to the same record', getAnyNpc('pixel_paige') === paige);
  t('getNpc does NOT resolve roster ids (originals-only view)',
    getNpc(rosterNpcId(FREDDY)) === null);
  t('npcsForGame never lists a legend',
    ['chess', 'basketball', 'colosseum'].every((g) => npcsForGame(g).every((n) => !String(n.id).startsWith(ROSTER_NPC_PREFIX))));
  const fill = pickBackfill({ gameSlug: 'chess', count: 3, tier: 'rookie' });
  t('backfill never seats a legend uninvited',
    fill.length > 0 && fill.every((n) => !String(n.id).startsWith(ROSTER_NPC_PREFIX)));
  t('getAnyNpc refuses garbage', getAnyNpc('') === null && getAnyNpc(null) === null && getAnyNpc('roster:') === null);
}

// ==================================================================
// 5. The seat flow: a picked legend fills a real seat
// ==================================================================
{
  const legend = getAnyNpc(rosterNpcId(JASON));
  const { roster, backfilled } = fillParty({
    humans: ['user-1'], npcs: [legend], minPlayers: 2, maxPlayers: 4, npcPool: [],
  });
  t('the legend takes an npc seat', roster.length === 2 && backfilled === 0
    && roster[1].kind === 'npc' && roster[1].id === rosterNpcId(JASON));
  t('the seat record is the fighter himself',
    roster[1].npc.name === 'Jason Voorhees' && roster[1].npc.characterId === JASON);
  const roomNpcIds = roster.filter((s) => s.kind === 'npc').map((s) => s.id);
  t('the room npc id list carries the legend id (setRoomNpcs shape)',
    JSON.stringify(roomNpcIds) === JSON.stringify([rosterNpcId(JASON)]));
  t('a legend id survives a getAnyNpc round-trip from the room list',
    roomNpcIds.every((id) => !!getAnyNpc(id)));
}

// ==================================================================
// 6. Registry shelf persistence — device-local pick chain
// ==================================================================
{
  const store = fakeStorage();
  t('no legend pick stored initially', readSurfaceOverride('oasis', store) === null);
  t('a legend pick writes through the validated chain',
    writeSurfaceOverride('oasis', HULK, store) === true
    && readSurfaceOverride('oasis', store) === HULK);
  t('an unknown legend pick is refused by the chain',
    writeSurfaceOverride('oasis', 'q999-nope', store) === false
    && readSurfaceOverride('oasis', store) === HULK);
  t('clearing the pick returns to the frame',
    writeSurfaceOverride('oasis', null, store) === true
    && readSurfaceOverride('oasis', store) === null);
}

// ==================================================================
// 7. Source wiring — CharacterSelect roster shelf
// ==================================================================
{
  const src = fs.readFileSync('components/glb/CharacterSelect.jsx', 'utf8');
  t('the shelf is the embodiment roster', src.includes('listEmbodiments().map'));
  t('picks render through CharacterToken', src.includes("CharacterToken from '@/components/characters/CharacterToken'"));
  t('the pick persists via the pick chain on the oasis surface',
    src.includes("OASIS_SURFACE = 'oasis'")
    && src.includes('readSurfaceOverride(OASIS_SURFACE)')
    && src.includes('writeSurfaceOverride(OASIS_SURFACE, characterId)'));
  t('picking a frame clears the legend',
    src.includes('writeSurfaceOverride(OASIS_SURFACE, null)'));
  t('the viewer swaps to character mode for a legend',
    src.includes('characterId={fighter.id}'));
  t('the archetype system is intact (grid + tint + onChange)',
    src.includes('AVATAR_ARCHETYPES.map') && src.includes('AVATAR_TINTS.map')
    && src.includes('Paint your armor') && src.includes('onChange({ archetype: a.id, tint })'));
  t('fighters do not fake armor paint', src.includes('Legends wear their own colors'));
  t('device-local honesty is printed on the shelf', src.includes('kept on this device'));
}

// ==================================================================
// 8. Source wiring — ModelViewer character mode
// ==================================================================
{
  const src = fs.readFileSync('components/glb/ModelViewer.jsx', 'utf8');
  t('characterId is an optional prop', src.includes('characterId = null'));
  t('the Wave 0 adapter is imported lazily',
    src.includes("await import('@/lib/characters/character-glb')"));
  t('the embodiment attaches at the human scale class',
    src.includes('attachCharacterGlb({ characterId, procSize })')
    && src.includes("procSizeForScaleClass('human')"));
  t('the driver holds idle — no clips are invented', src.includes("charHandle.update('idle', dt, t / 1000, {})")
    && src.includes('setClips([])'));
  t('the handle is disposed with the stage', src.includes('charHandle.dispose()'));
  t('the baked-clip src path is untouched', src.includes('loader.loadAsync(src)')
    && src.includes('mixer.clipAction(clip)'));
}

// ==================================================================
// 9. Source wiring — NpcPicker, Lobby, RosterPanel
// ==================================================================
{
  const picker = fs.readFileSync('components/oasis/NpcPicker.jsx', 'utf8');
  t('NpcPicker offers the roster legends shelf',
    picker.includes('ROSTER LEGENDS') && picker.includes('rosterNpcOptions()'));
  t('legends render as CharacterTokens', picker.includes('characterId={npc.characterId}'));
  t('legends toggle through the same onToggle contract',
    picker.includes('onToggle(npc.id)'));
  t('the hand-authored grid is intact', picker.includes('npcsForGame(gameSlug)'));

  const lobby = fs.readFileSync('components/oasis/Lobby.jsx', 'utf8');
  t('the lobby seats picks through getAnyNpc',
    lobby.includes("getAnyNpc } from '@/lib/oasis/roster-npcs'")
    && lobby.includes('npcIds.map(getAnyNpc)'));
  t('boss fights still resolve hand-authored npcs', lobby.includes('getNpc(boss.npcId)'));
  t('backfill still draws the generic pool', lobby.includes('pickBackfill({'));

  const panel = fs.readFileSync('components/oasis/RosterPanel.jsx', 'utf8');
  t('RosterPanel resolves npc seats through getAnyNpc',
    panel.includes('getAnyNpc(npcIds[i - humans.length])'));
  t('human picks come from the public character route',
    panel.includes('/api/profiles/${encodeURIComponent(userId)}/character'));
  t('picks are roster-validated before rendering', panel.includes('getEmbodiment(body.characterId)'));
  t('character previews render as small tokens',
    panel.includes('variant="token"') && panel.includes('size={24}'));
}

console.log(`\ncharacters-lobbies: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
