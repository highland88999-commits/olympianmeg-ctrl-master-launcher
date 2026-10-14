// tests/characters-king-champion.test.mjs — headless tests for
// WAVE 3 of the characters-everywhere program: King & Champion.
//   Chess (D1, king only): the pick-chain resolution for the
//     player's king + the room-state protocol that carries both
//     kings' picks in PvP (lib/chess/king-character.js), and the
//     wiring pins in King.jsx / app/chess/page.tsx /
//     hooks/chess/useMatchmaking.js.
//   Colosseum (D5): the champion as a selectable roster rival
//     with the Hulk default (lib/colosseum/champion.js), the
//     balance freeze on ENEMY_TYPES, and the wiring pins in
//     Pit.jsx / app/colosseum/page.jsx.
// Run: node tests/characters-king-champion.test.mjs (repo root).
import { readFileSync } from 'node:fs';
import {
  CHESS_KING_SURFACE, KING_COLORS, resolveMyKingCharacterId,
  validKingPick, opponentColor, kingPicksFromState, withKingPick,
  opponentKingFromState, opponentKingFromMove,
} from '../lib/chess/king-character.js';
import {
  CHAMPION_SURFACE, DEFAULT_CHAMPION_ID, resolveChampionCharacterId,
  getChampionEmbodiment, chooseChampionCharacterId,
  championNativeHeight, championProcSize,
} from '../lib/colosseum/champion.js';
import {
  PROFILE_CHARACTER_LS_KEY, SURFACE_PICK_PREFIX,
  getEmbodiment, writeSurfaceOverride, readSurfaceOverride,
} from '../lib/characters/embodiment.js';
import { isCharacterId } from '../lib/characters/roster.js';
import { ENEMY_TYPES } from '../lib/colosseum/game.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

function fakeStorage(seed) {
  const m = new Map(Object.entries(seed || {}));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

const FREDDY = 'q001-freddy-krueger';
const HULK = 'q033-hulk';
const XENO = 'q011-xenomorph';
const kingKey = SURFACE_PICK_PREFIX + CHESS_KING_SURFACE;
const champKey = SURFACE_PICK_PREFIX + CHAMPION_SURFACE;

function src(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

// ==================================================================
// 1. Chess king pick chain (D1): override > profile > null
// ==================================================================
t('chess king surface key is chess', CHESS_KING_SURFACE === 'chess');
t('no pick anywhere -> native king (null)',
  resolveMyKingCharacterId(fakeStorage()) === null);
t('profile pick becomes the king',
  resolveMyKingCharacterId(fakeStorage({ [PROFILE_CHARACTER_LS_KEY]: FREDDY })) === FREDDY);
t('chess override beats the profile pick',
  resolveMyKingCharacterId(fakeStorage({
    [PROFILE_CHARACTER_LS_KEY]: FREDDY, [kingKey]: XENO,
  })) === XENO);
t('a stored non-roster id is refused by the chain',
  resolveMyKingCharacterId(fakeStorage({ [kingKey]: 'not-a-fighter' })) === null);
t('king colors are cyan + pink', KING_COLORS.join() === 'cyan,pink');
t('opponentColor flips cyan/pink and rejects others',
  opponentColor('cyan') === 'pink' && opponentColor('pink') === 'cyan'
  && opponentColor('green') === null && opponentColor(null) === null);
t('validKingPick validates against the roster',
  validKingPick(HULK) === HULK && validKingPick('hulk') === null
  && validKingPick(null) === null && validKingPick(42) === null);

// ==================================================================
// 2. Room-state protocol: full_state.kingPicks
// ==================================================================
t('kingPicksFromState of empty state is both null',
  JSON.stringify(kingPicksFromState(null)) === '{"cyan":null,"pink":null}'
  && JSON.stringify(kingPicksFromState({})) === '{"cyan":null,"pink":null}'
  && JSON.stringify(kingPicksFromState('junk')) === '{"cyan":null,"pink":null}');
t('kingPicksFromState reads + validates stored picks',
  JSON.stringify(kingPicksFromState({ kingPicks: { cyan: FREDDY, pink: 'bogus' } }))
  === `{"cyan":"${FREDDY}","pink":null}`);

const baseState = { pieces: [{ id: 1 }], currentTurn: 'cyan' };
const withCyan = withKingPick(baseState, 'cyan', FREDDY);
t('withKingPick sets the pick and keeps the payload',
  withCyan.kingPicks.cyan === FREDDY && withCyan.kingPicks.pink === null
  && withCyan.pieces === baseState.pieces && withCyan.currentTurn === 'cyan');
t('withKingPick never mutates its input',
  !('kingPicks' in baseState) && withCyan !== baseState);
const withBoth = withKingPick(withCyan, 'pink', XENO);
t('the second writer preserves the first pick (no clobber)',
  withBoth.kingPicks.cyan === FREDDY && withBoth.kingPicks.pink === XENO);
t('withKingPick can clear a pick back to native',
  withKingPick(withBoth, 'cyan', null).kingPicks.cyan === null
  && withKingPick(withBoth, 'cyan', null).kingPicks.pink === XENO);
t('withKingPick refuses a non-roster id (treated as clear)',
  withKingPick(withBoth, 'pink', 'sephiroth-fan-art').kingPicks.pink === null);
t('withKingPick ignores a non-king color',
  withKingPick(baseState, 'green', FREDDY).kingPicks.cyan === null);
t('opponentKingFromState reads the other side only',
  opponentKingFromState(withBoth, 'cyan') === XENO
  && opponentKingFromState(withBoth, 'pink') === FREDDY
  && opponentKingFromState(withBoth, 'green') === null
  && opponentKingFromState(null, 'cyan') === null);

// ==================================================================
// 3. Room-state protocol: last_move.kingId testimony
// ==================================================================
const move = { seq: 3, senderColor: 'pink', kingId: XENO, pieceId: 9, to: { x: 1, z: 2 } };
t('a move testifies to its mover king pick',
  opponentKingFromMove(move, 'cyan') === XENO);
t('my own move says nothing about the opponent',
  opponentKingFromMove(move, 'pink') === null);
t('a move with a bogus kingId proves nothing',
  opponentKingFromMove({ ...move, kingId: 'bogus' }, 'cyan') === null);
t('a move without kingId proves nothing',
  opponentKingFromMove({ seq: 1, senderColor: 'pink' }, 'cyan') === null);
t('a move from a third color proves nothing',
  opponentKingFromMove({ ...move, senderColor: 'green' }, 'cyan') === null);
t('null/garbage moves prove nothing',
  opponentKingFromMove(null, 'cyan') === null
  && opponentKingFromMove('move', 'cyan') === null);

// ==================================================================
// 4. Colosseum champion resolution (D5): override > Hulk default
// ==================================================================
t('champion surface is its own pick key', CHAMPION_SURFACE === 'colosseum-champion');
t('D5 default champion is Hulk', DEFAULT_CHAMPION_ID === HULK && isCharacterId(HULK));
t('no pick -> Hulk reigns',
  resolveChampionCharacterId(fakeStorage()) === HULK);
t('the profile pick does NOT leak into the champion slot (rival, not self)',
  resolveChampionCharacterId(fakeStorage({ [PROFILE_CHARACTER_LS_KEY]: FREDDY })) === HULK);
t('a chosen rival reigns',
  resolveChampionCharacterId(fakeStorage({ [champKey]: XENO })) === XENO);
t('a stored non-roster id falls back to Hulk',
  resolveChampionCharacterId(fakeStorage({ [champKey]: 'the-champ' })) === HULK);
t('getChampionEmbodiment returns the Hulk record by default',
  getChampionEmbodiment(fakeStorage())?.name === 'Hulk');
t('the default champion has a hosted GLB (embodiment is real)',
  !!getChampionEmbodiment(fakeStorage())?.glbUrl);
{
  const s = fakeStorage();
  t('chooseChampionCharacterId accepts a roster rival',
    chooseChampionCharacterId(XENO, s) === true
    && resolveChampionCharacterId(s) === XENO);
  t('chooseChampionCharacterId refuses an unknown id',
    chooseChampionCharacterId('nobody', s) === false
    && resolveChampionCharacterId(s) === XENO);
  t('clearing the pick returns to Hulk',
    chooseChampionCharacterId(null, s) === true
    && resolveChampionCharacterId(s) === HULK);
  t('the champion override lives under the Wave 0 key scheme',
    readSurfaceOverride(CHAMPION_SURFACE, fakeStorage({ [champKey]: FREDDY })) === FREDDY
    && writeSurfaceOverride(CHAMPION_SURFACE, FREDDY, fakeStorage()) === true);
}

// ==================================================================
// 5. Champion footprint + the balance freeze
// ==================================================================
t('native champion height is 3.1 x scale',
  championNativeHeight(1.7) === 3.1 * 1.7 && championNativeHeight(1) === 3.1
  && championNativeHeight(0) === 3.1 && championNativeHeight(undefined) === 3.1);
t('champion procSize is the measured native footprint',
  JSON.stringify(championProcSize(ENEMY_TYPES.champion.scale))
  === JSON.stringify({ x: 3.1 * 1.7, y: 3.1 * 1.7, z: 3.1 * 1.7 }));
t('ENEMY_TYPES balance is frozen (the swap is visual only)',
  ENEMY_TYPES.champion.hp === 24 && ENEMY_TYPES.champion.speed === 3.4
  && ENEMY_TYPES.champion.glory === 2000 && ENEMY_TYPES.champion.scale === 1.7
  && Object.keys(ENEMY_TYPES).length === 5);

// ==================================================================
// 6. Wiring pins — chess
// ==================================================================
const kingSrc = src('components/chess/pieces/King.jsx');
t('King.jsx embodies via the shared CharacterGlb module',
  kingSrc.includes("from '@/components/characters/CharacterGlb'")
  && kingSrc.includes('kingCharacterId'));
t('King.jsx hides the native lathe only behind the ready gate',
  kingSrc.includes('visible={!embReady}'));
t('King.jsx carries the selected-state ring for the embodied king',
  kingSrc.includes('ringGeometry') && kingSrc.includes('embReady &&'));
t('King.jsx measures the native king as its procSize',
  kingSrc.includes('KING_PROC_SIZE') && kingSrc.includes('0.97'));
t('King.jsx keeps the game FX (asteroid + black hole) mounted',
  kingSrc.includes('asteroidRef') && kingSrc.includes('blackHoleRef'));

const mmSrc = src('hooks/chess/useMatchmaking.js');
t('matchmaking merges king picks into full_state (state channel)',
  mmSrc.includes('withKingPick') && mmSrc.includes('kingPicksFromState'));
t('matchmaking piggybacks the pick on every move (move channel)',
  mmSrc.includes('kingId: validKingPick(myKingIdRef.current)'));
t('matchmaking exposes opponentKingId + publishKingPick',
  mmSrc.includes('opponentKingId, publishKingPick'));
t('matchmaking learns picks from BOTH channels',
  mmSrc.includes('opponentKingFromState') && mmSrc.includes('opponentKingFromMove'));
t('matchmaking still polls the same room row (no new transport)',
  mmSrc.includes("from('oasis_rooms')") && mmSrc.includes("eq('game', 'chess')"));

const chessPage = src('app/chess/page.tsx');
t('chess page mounts the pick-chain picker for surface chess',
  chessPage.includes('<CharacterPicker surface="chess"'));
t('chess page publishes its pick into the room protocol',
  chessPage.includes('publishKingPickRef.current(myKingId)'));
t('chess page feeds the room-state opponent pick to the kings',
  chessPage.includes('opponentKingId') && chessPage.includes('kingIdForTeam'));
t('chess page embodies ONLY kings (piece-type gate)',
  chessPage.includes("p.type === 'king' ? kingIdForTeam(p.team) : undefined"));
t('chess page seats roster-legend rivals as the AI king',
  chessPage.includes('characterIdFromRosterNpcId') && chessPage.includes('setRivalKingId'));

// ==================================================================
// 7. Wiring pins — colosseum
// ==================================================================
const pitSrc = src('components/colosseum/Pit.jsx');
t('Pit.jsx embodies via the shared CharacterGlb module',
  pitSrc.includes("from '@/components/characters/CharacterGlb'"));
t('Pit.jsx embodies ONLY the champion enemy',
  pitSrc.includes("e.type === 'champion' ? championId : null"));
t('Pit.jsx keeps the native champion body behind the ready gate',
  pitSrc.includes('visible={!embReady}'));
t('Pit.jsx keeps the native hit-target cylinder untouched',
  pitSrc.includes('fat transparent hit-target for touch')
  && pitSrc.includes('cylinderGeometry args={[2.2 * s, 2.2 * s, 4.4 * s, 8]}'));
t('Pit.jsx sizes the embodiment from the champion footprint helper',
  pitSrc.includes('championProcSize(s)'));
t('Pit.jsx faces the champion toward the pit centre',
  pitSrc.includes('Math.atan2(z, -x)'));
t('Pit.jsx pose follows the fight (walk / hit / idle-on-stagger)',
  pitSrc.includes("staggered ? 'idle' : hitFlash > 0 ? 'hit' : 'walk'"));

const colPage = src('app/colosseum/page.jsx');
t('colosseum page resolves the champion through the D5 module',
  colPage.includes("from '@/lib/colosseum/champion'")
  && colPage.includes('resolveChampionCharacterId()'));
t('colosseum page offers the boss select (roster tokens)',
  colPage.includes('listEmbodiments()') && colPage.includes('chooseChampion(')
  && colPage.includes('THE CHAMPION'));
t('colosseum page hands the champion to the Pit',
  colPage.includes('championId={championId}'));
t('colosseum page names the reigning champion on the boss bar',
  colPage.includes("championName.toUpperCase()} · THE UNDYING CHAMPION"));

console.log(`\ncharacters-king-champion: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
