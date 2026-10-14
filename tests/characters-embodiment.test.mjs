// tests/characters-embodiment.test.mjs — headless tests for WAVE 0
// of the characters-everywhere program: the shared embodiment
// module (lib/characters/embodiment.js read model + pick chain,
// lib/characters/glb-slots.js presence cap, lib/characters/
// character-glb.js 3D adapter core over Kombat's GLB machinery).
// Run: node tests/characters-embodiment.test.mjs (from the repo root).
// No browser; the network is stubbed out — GLB loads are forced to
// fail so the fallback contract is what gets exercised.
import { CHARACTERS, getCharacterById } from '../lib/characters/roster.js';
import { LOADOUTS } from '../lib/kombat/loadouts.js';
import {
  EMBODIMENTS, getEmbodiment, hasEmbodiment, listEmbodiments,
  kombatIdForCharacter, characterIdForKombat, getEmbodimentByKombatId,
  SURFACE_SCALE_CLASSES, procSizeForScaleClass,
  PROFILE_CHARACTER_LS_KEY, SURFACE_PICK_PREFIX, surfacePickKey,
  readProfileCharacterId, readSurfaceOverride, writeSurfaceOverride,
  resolveSurfaceCharacterId, resolveSurfaceCharacter,
} from '../lib/characters/embodiment.js';
import {
  DEFAULT_MAX_LIVE_GLB, createGlbSlotRegistry, sharedGlbSlots,
} from '../lib/characters/glb-slots.js';
import {
  FLOOR_Y, clampToFloor, applyFloorClamp, stepVertical,
} from '../lib/kombat/floor.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

// ==================================================================
// 1. Read model: the join is total for all 43
// ==================================================================
t('roster carries 43 characters', CHARACTERS.length === 43);
t('bridge carries 43 loadouts', LOADOUTS.length === 43);
t('one embodiment per roster character', EMBODIMENTS.length === CHARACTERS.length);
t('listEmbodiments is the roster listing', listEmbodiments() === EMBODIMENTS);
t('listing is in roster (queue) order',
  EMBODIMENTS.every((e, i) => i === 0 || EMBODIMENTS[i - 1].queueNumber < e.queueNumber));

for (const c of CHARACTERS) {
  const e = getEmbodiment(c.id);
  t(`${c.id} resolves`, !!e);
  if (!e) continue;
  t(`${c.id} id joins`, e.id === c.id);
  t(`${c.id} name joins`, e.name === c.name && e.name === getCharacterById(c.id).name);
  t(`${c.id} preview non-null`, e.preview === `/characters/${c.id}.png`);
  t(`${c.id} glbUrl non-null`, typeof e.glbUrl === 'string'
    && e.glbUrl.endsWith(`/fighter-models/${c.id}.glb`));
  t(`${c.id} available`, e.available === true);
  t(`${c.id} rigClass present`, typeof e.rigClass === 'string' && e.rigClass.length > 0);
  t(`${c.id} motionClass present`, typeof e.motionClass === 'string' && e.motionClass.length > 0);
  t(`${c.id} movementStyle present`, typeof e.movementStyle === 'string' && e.movementStyle.length > 0);
  t(`${c.id} kombatId present`, typeof e.kombatId === 'string' && e.kombatId.length > 0);
  t(`${c.id} powers carried`, Array.isArray(e.powers) && e.powers.length >= 5);
}
t('kombatIds are unique', new Set(EMBODIMENTS.map((e) => e.kombatId)).size === 43);
for (const e of EMBODIMENTS) {
  t(`${e.id} kombat round-trip`,
    kombatIdForCharacter(e.id) === e.kombatId
    && characterIdForKombat(e.kombatId) === e.id
    && getEmbodimentByKombatId(e.kombatId) === e);
}
t('getEmbodiment unknown -> null', getEmbodiment('q999-nobody') === null);
t('getEmbodiment non-string -> null', getEmbodiment(42) === null && getEmbodiment(null) === null);
t('hasEmbodiment', hasEmbodiment('q001-freddy-krueger') === true && hasEmbodiment('q001') === false);
t('characterIdForKombat unknown -> null', characterIdForKombat('nobody') === null);
t('rig classes cover the known kinds',
  EMBODIMENTS.some((e) => e.rigClass === 'humanoid')
  && EMBODIMENTS.some((e) => e.motionClass === 'creature')
  && getEmbodiment('q029-slimer').rigClass === 'none');

// scale policy (visual only)
t('human scale class is person-sized', procSizeForScaleClass('human').y === SURFACE_SCALE_CLASSES.human.targetHeight);
t('boss scale class exists', procSizeForScaleClass('boss').y > procSizeForScaleClass('human').y);
t('unknown scale class -> null', procSizeForScaleClass('huge') === null && procSizeForScaleClass(null) === null);

// ==================================================================
// 2. Pick chain: surface override > profile default > none
// ==================================================================
function fakeStorage(seed) {
  const m = new Map(Object.entries(seed || {}));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    _map: m,
  };
}
const JASON = 'q002-jason-voorhees';
const FREDDY = 'q001-freddy-krueger';

t('profile mirror key is the existing one', PROFILE_CHARACTER_LS_KEY === 'olympus.profileCharacterId');
t('surface key convention', surfacePickKey('chess') === 'olympus.characterPick.chess'
  && SURFACE_PICK_PREFIX === 'olympus.characterPick.');
t('surface key refuses bad surfaces', surfacePickKey('') === null && surfacePickKey(7) === null);

{
  const s = fakeStorage();
  t('no picks anywhere -> null id', resolveSurfaceCharacterId('chess', { storage: s }) === null);
  t('no picks anywhere -> null record', resolveSurfaceCharacter('chess', { storage: s }) === null);
}
{
  const s = fakeStorage({ [PROFILE_CHARACTER_LS_KEY]: JASON });
  t('profile mirror resolves', resolveSurfaceCharacterId('chess', { storage: s }) === JASON);
  t('profile mirror resolves to the record', resolveSurfaceCharacter('chess', { storage: s })?.id === JASON);
  t('readProfileCharacterId reads the mirror', readProfileCharacterId(s) === JASON);
}
{
  const s = fakeStorage({
    [PROFILE_CHARACTER_LS_KEY]: JASON,
    'olympus.characterPick.chess': FREDDY,
  });
  t('surface override beats profile', resolveSurfaceCharacterId('chess', { storage: s }) === FREDDY);
  t('override is per-surface', resolveSurfaceCharacterId('luge', { storage: s }) === JASON);
  t('readSurfaceOverride reads its own key', readSurfaceOverride('chess', s) === FREDDY
    && readSurfaceOverride('luge', s) === null);
}
{
  const s = fakeStorage({ [PROFILE_CHARACTER_LS_KEY]: JASON });
  t('explicit profile pick beats the mirror',
    resolveSurfaceCharacterId('chess', { storage: s, profileCharacterId: FREDDY }) === FREDDY);
  t('explicit null profile pick skips the mirror',
    resolveSurfaceCharacterId('chess', { storage: s, profileCharacterId: null }) === null);
  t('explicit garbage profile pick -> null',
    resolveSurfaceCharacterId('chess', { storage: s, profileCharacterId: 'q999-nobody' }) === null);
  const s2 = fakeStorage({
    [PROFILE_CHARACTER_LS_KEY]: JASON,
    'olympus.characterPick.chess': FREDDY,
  });
  t('override still beats an explicit profile pick',
    resolveSurfaceCharacterId('chess', { storage: s2, profileCharacterId: JASON }) === FREDDY);
}
{
  const s = fakeStorage({ [PROFILE_CHARACTER_LS_KEY]: 'not-a-character' });
  t('garbage in the mirror is ignored', resolveSurfaceCharacterId('chess', { storage: s }) === null);
  const s2 = fakeStorage({
    [PROFILE_CHARACTER_LS_KEY]: JASON,
    'olympus.characterPick.chess': 'not-a-character',
  });
  t('garbage override falls through to profile', resolveSurfaceCharacterId('chess', { storage: s2 }) === JASON);
}
{
  const s = fakeStorage();
  t('writeSurfaceOverride stores a valid pick', writeSurfaceOverride('mega-city', FREDDY, s) === true
    && s._map.get('olympus.characterPick.mega-city') === FREDDY);
  t('written override resolves', resolveSurfaceCharacterId('mega-city', { storage: s }) === FREDDY);
  t('writeSurfaceOverride refuses unknown ids', writeSurfaceOverride('mega-city', 'q999-nobody', s) === false
    && s._map.get('olympus.characterPick.mega-city') === FREDDY);
  t('writeSurfaceOverride null clears', writeSurfaceOverride('mega-city', null, s) === true
    && !s._map.has('olympus.characterPick.mega-city'));
  t('writeSurfaceOverride refuses bad surfaces', writeSurfaceOverride('', FREDDY, s) === false);
  t('writes survive with no storage at all -> false, no throw',
    writeSurfaceOverride('mega-city', FREDDY, null) === false || typeof window !== 'undefined');
}

// ==================================================================
// 3. Floor clamp unit behaviour (lib/kombat/floor.js — the law the
//    adapter applies to every embodiment root, every frame)
// ==================================================================
t('floor plane is y=0', FLOOR_Y === 0);
t('clampToFloor lifts negatives to the plane', clampToFloor(-0.5) === 0 && clampToFloor(-100) === 0);
t('clampToFloor leaves heights alone', clampToFloor(0) === 0 && clampToFloor(2.5) === 2.5);
t('clampToFloor is NaN/garbage safe', clampToFloor(NaN) === 0 && clampToFloor('x') === 0 && clampToFloor(undefined) === 0);
{
  const root = { position: { x: 1, y: -3, z: 2 } };
  t('applyFloorClamp pins the root', applyFloorClamp(root) === 0 && root.position.y === 0);
  const ok = { position: { x: 0, y: 1.25, z: 0 } };
  t('applyFloorClamp keeps a legal root', applyFloorClamp(ok) === 1.25 && ok.position.y === 1.25);
  t('applyFloorClamp tolerates no root', applyFloorClamp(null) === 0 && applyFloorClamp({}) === 0);
}
{
  const landed = stepVertical(0.1, -5, 9.8, 0.1);
  t('vertical step lands ON the plane', landed.y === 0 && landed.vy === 0 && landed.grounded === true);
  const air = stepVertical(2, 1, 9.8, 0.05);
  t('vertical step stays airborne above it', air.grounded === false && air.y > 0);
}

// ==================================================================
// 4 + 5. Cap logic + fallback contract (character-glb.js)
// The network is stubbed BEFORE the import: every GLB load fails,
// which is exactly the fallback world these assertions describe.
// ==================================================================
globalThis.fetch = () => Promise.reject(new Error('offline (test stub)'));
const {
  attachCharacterGlb, prefetchCharacterGlbs, toDriverPose, createEmbodimentScene,
} = await import('../lib/characters/character-glb.js');

t('pose mapping: run is the walk gait', toDriverPose('run') === 'walk');
t('pose mapping: driver poses pass through',
  toDriverPose('idle') === 'idle' && toDriverPose('walk') === 'walk' && toDriverPose('block') === 'block');
t('pose mapping: unknown reads as idle', toDriverPose('dance') === 'idle' && toDriverPose(undefined) === 'idle');

t('attach unknown character -> null (native body stays)',
  attachCharacterGlb({ characterId: 'q999-nobody' }) === null);
t('attach non-string -> null', attachCharacterGlb({ characterId: 42 }) === null);
t('prefetch tolerates unknown ids', (() => {
  try { prefetchCharacterGlbs(['q999-nobody', null, JASON]); return true; } catch { return false; }
})());

// slot registry units
{
  const r = createGlbSlotRegistry(2);
  t('registry cap is honoured', r.maxLive === 2);
  t('first two acquires succeed', r.acquire('a') === true && r.acquire('b') === true);
  t('third acquire is refused (billboard territory)', r.acquire('c') === false);
  t('re-acquire is idempotent', r.acquire('a') === true && r.liveCount() === 2);
  t('bad keys refused', r.acquire('') === false && r.acquire(null) === false && r.acquire(9) === false);
  r.release('a');
  t('release frees a slot', r.liveCount() === 1 && r.acquire('c') === true);
  r.release('never-held');
  t('releasing an unknown key is a no-op', r.liveCount() === 2);
  t('cap 0 means billboards only', createGlbSlotRegistry(0).acquire('a') === false);
  t('default cap is 4', DEFAULT_MAX_LIVE_GLB === 4 && sharedGlbSlots.maxLive === 4);
  t('garbage cap falls back to the default', createGlbSlotRegistry(-3).maxLive === 4);
}

// attach-level cap: the 5th live request yields a billboard
{
  const registry = createGlbSlotRegistry(4);
  const ids = ['q001-freddy-krueger', 'q002-jason-voorhees', 'q003-michael-myers',
    'q004-leatherface', 'q005-pennywise'];
  const handles = ids.map((id) => attachCharacterGlb({ characterId: id, registry }));
  t('five attaches all return handles', handles.every((h) => !!h));
  t('first four are live-GLB handles', handles.slice(0, 4).every((h) => h.kind === 'glb'));
  t('5th live request yields a billboard', handles[4].kind === 'billboard');
  t('registry holds exactly the cap', registry.liveCount() === 4);
  t('billboard is ready immediately and not a live GLB',
    handles[4].isReady() === true && handles[4].isLiveGlb() === false);
  t('billboard sprite stands on the floor (bottom-center anchor)',
    handles[4].group.children.length === 1 && handles[4].group.children[0].center.y === 0);
  // the billboard honours the floor law through the adapter update
  handles[4].group.position.y = -2;
  handles[4].update('idle', 0.016, 1.0, {});
  t('billboard root is floor-clamped on update', handles[4].group.position.y >= 0);
  // failed GLB loads resolve ready=false — the native body stays
  const oks = await Promise.all(handles.slice(0, 4).map((h) => h.ready));
  t('failed loads resolve ready=false (fallback contract)', oks.every((ok) => ok === false));
  t('failed handles never report ready', handles.slice(0, 4).every((h) => !h.isReady() && !h.isLiveGlb()));
  // a GLB handle's root is floor-clamped on update too
  handles[0].group.position.y = -1;
  handles[0].update('idle', 0.016, 1.0, {});
  t('glb root is floor-clamped on update', handles[0].group.position.y >= 0);
  // disposing frees the slot for the next character
  handles[0].dispose();
  t('dispose releases the slot', registry.liveCount() === 3);
  const next = attachCharacterGlb({ characterId: 'q006-ghostface', registry });
  t('freed slot admits the next live GLB', !!next && next.kind === 'glb');
  for (const h of handles.slice(1)) h.dispose();
  if (next) next.dispose();
  t('all slots returned after dispose', registry.liveCount() === 0);
}

// per-instance keys: one character, two presences, two slots
{
  const registry = createGlbSlotRegistry(4);
  const a = attachCharacterGlb({ characterId: 'q029-slimer', registry, slotKey: 'user-a' });
  const b = attachCharacterGlb({ characterId: 'q029-slimer', registry, slotKey: 'user-b' });
  t('same character, two instances, two slots',
    a.kind === 'glb' && b.kind === 'glb' && registry.liveCount() === 2);
  a.dispose(); b.dispose();
}

// scene factory: one cap shared by a whole presence scene
{
  const scene = createEmbodimentScene({ maxLiveGlb: 1 });
  const a = scene.attach({ characterId: 'q033-hulk' });
  const b = scene.attach({ characterId: 'q036-thanos' });
  t('scene factory caps at its own maxLiveGlb',
    a.kind === 'glb' && b.kind === 'billboard' && scene.registry.liveCount() === 1);
  a.dispose(); b.dispose();
}

console.log(`\ncharacters-embodiment: ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
