// tests/characters-champion.test.mjs — headless tests for
// WAVE 3 (Colosseum half) of the characters-everywhere program:
// the champion boss as a selectable roster rival (decision D5 —
// player-chosen, Hulk default), embodied via the Wave 0 module.
// lib/colosseum/champion.js resolution + footprint, the balance
// freeze on ENEMY_TYPES, and the wiring pins in Pit.jsx /
// app/colosseum/page.jsx.
//
// This suite REPLACES tests/characters-king-champion.test.mjs.
// The chess half of Wave 3 was dropped on Merlin's direct order
// (2026-10-14: "Don't touch chess") — the king embodiment was
// reverted in full, and §5 below stands as the guard: chess
// carries NO embodiment wiring, now or later, without his word.
// Run: node tests/characters-champion.test.mjs (repo root).
import { existsSync, readFileSync } from 'node:fs';
import {
  CHAMPION_SURFACE, DEFAULT_CHAMPION_ID, resolveChampionCharacterId,
  getChampionEmbodiment, chooseChampionCharacterId,
  championNativeHeight, championProcSize,
} from '../lib/colosseum/champion.js';
import {
  PROFILE_CHARACTER_LS_KEY, SURFACE_PICK_PREFIX,
  readSurfaceOverride, writeSurfaceOverride,
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
const champKey = SURFACE_PICK_PREFIX + CHAMPION_SURFACE;

function src(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

// ==================================================================
// 1. Champion resolution (D5): override > Hulk default
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
// 2. Champion footprint + the balance freeze
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
// 3. Wiring pins — colosseum
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

// ==================================================================
// 4. The Merlin guard: chess is hands-off (2026-10-14 directive)
// ==================================================================
t('the Wave 3 king module is GONE from lib/chess',
  !existsSync(new URL('../lib/chess/king-character.js', import.meta.url)));
for (const [label, path] of [
  ['King.jsx', 'components/chess/pieces/King.jsx'],
  ['chess page', 'app/chess/page.tsx'],
  ['matchmaking', 'hooks/chess/useMatchmaking.js'],
]) {
  const s = src(path);
  t(`${label} carries NO embodiment wiring (Don't touch chess)`,
    !s.includes('CharacterGlb') && !s.includes('kingCharacterId')
    && !s.includes('kingPicks') && !s.includes('publishKingPick')
    && !s.includes('CharacterPicker') && !s.includes('king-character'));
}

console.log(`\ncharacters-champion: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
