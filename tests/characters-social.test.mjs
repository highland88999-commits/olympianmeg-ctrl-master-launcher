// tests/characters-social.test.mjs — headless tests for WAVE 2 of
// the characters-everywhere program: social embodiment.
//   - lib/characters/presence-embodiment.js: presence-payload pick
//     extraction + the per-scene presence embodiment manager
//     (host groups, per-instance slot keys, cap -> billboard,
//     swap/remove/dispose) over the Wave 0 scene;
//   - lib/characters/embodiment.js profileCharacterAvatar (the
//     avatar picker's "use my character" option source);
//   - source wiring of the four surfaces: Persephone's hall
//     (self embodied, peers' native figures kept — the presence
//     payload carries no pick), Skyscraper (picker mount, the
//     broadcast `char` field, peer embody + stale retirement),
//     /u/[username] (profile-character display), DefaultAvatarPicker.
// Run: node tests/characters-social.test.mjs (from the repo root).
// No browser; the network is stubbed out — GLB loads fail, which
// is the fallback world half these tests describe.
import fs from 'node:fs';
import * as THREE from 'three';
import {
  PROFILE_CHARACTER_LS_KEY, profileCharacterAvatar,
} from '../lib/characters/embodiment.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

const JASON = 'q002-jason-voorhees';
const FREDDY = 'q001-freddy-krueger';
const SLIMER = 'q029-slimer';

function fakeStorage(seed) {
  const m = new Map(Object.entries(seed || {}));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    _map: m,
  };
}

// The network is stubbed BEFORE the adapter imports: every real
// GLB load fails (fallback world), exactly as in the Wave 0/1 suites.
globalThis.fetch = () => Promise.reject(new Error('offline (test stub)'));
const {
  characterIdFromPresencePayload, createPresenceEmbodiments,
} = await import('../lib/characters/presence-embodiment.js');
const { createEmbodimentScene } = await import('../lib/characters/character-glb.js');

// ==================================================================
// 1. Presence-payload pick extraction — validated, never trusted
// ==================================================================
{
  t('char field resolves a roster id',
    characterIdFromPresencePayload({ char: JASON }) === JASON);
  t('long characterId form resolves too',
    characterIdFromPresencePayload({ characterId: FREDDY }) === FREDDY);
  t('char wins when both are present',
    characterIdFromPresencePayload({ char: JASON, characterId: FREDDY }) === JASON);
  t('no pick in payload -> null',
    characterIdFromPresencePayload({ id: 'abc', x: 1 }) === null);
  t('null char -> null', characterIdFromPresencePayload({ char: null }) === null);
  t('unknown id in payload -> null (never smuggled into an attach)',
    characterIdFromPresencePayload({ char: 'q999-nobody' }) === null);
  t('non-string char -> null', characterIdFromPresencePayload({ char: 42 }) === null);
  t('garbage payloads -> null',
    characterIdFromPresencePayload(null) === null
    && characterIdFromPresencePayload(undefined) === null
    && characterIdFromPresencePayload('q002-jason-voorhees') === null);
  t('the profiles-API answer shape validates the same way',
    characterIdFromPresencePayload({ char: 'q035-wolverine' }) === 'q035-wolverine'
    && characterIdFromPresencePayload({ char: null }) === null);
}

// ==================================================================
// 2. profileCharacterAvatar — the avatar picker's option source
// ==================================================================
{
  const withPick = fakeStorage({ [PROFILE_CHARACTER_LS_KEY]: JASON });
  const opt = profileCharacterAvatar(withPick);
  t('mirror pick becomes an avatar option {id,name,preview}',
    !!opt && opt.id === JASON && opt.name === 'Jason Voorhees'
    && opt.preview === '/characters/q002-jason-voorhees.png');
  t('no pick on this device -> null (picker unchanged)',
    profileCharacterAvatar(fakeStorage()) === null);
  t('garbage mirror value -> null',
    profileCharacterAvatar(fakeStorage({ [PROFILE_CHARACTER_LS_KEY]: 'q999-nobody' })) === null);
}

// ==================================================================
// 3. The presence manager over an injected scene — hosts, swaps,
//    per-instance slot keys, removal
// ==================================================================
{
  const attached = [];
  const disposed = [];
  const fakeScene = {
    registry: null,
    attach({ characterId, procSize, slotKey }) {
      const group = new THREE.Group();
      group.name = `fake-${characterId}`;
      const handle = {
        characterId, kind: 'glb', group,
        ready: Promise.resolve(true),
        isReady: () => true,
        isLiveGlb: () => true,
        update() {},
        dispose() { disposed.push(characterId); },
      };
      attached.push({ characterId, procSize, slotKey, handle });
      return handle;
    },
    prefetch() {},
  };
  const mgr = createPresenceEmbodiments({ keyPrefix: 'test', embodimentScene: fakeScene });

  const selfHost = mgr.hostFor('self');
  t('hostFor is stable per key', mgr.hostFor('self') === selfHost);
  t('no handle before any sync', mgr.handleFor('self') === null);

  const h1 = mgr.sync('self', JASON, { x: 0.8, y: 2.0, z: 0.8 });
  t('sync attaches and returns the handle', h1 && h1.characterId === JASON);
  t('the handle group lives inside the instance host',
    h1.group.parent === selfHost);
  t('slot key is composed per instance (prefix:key)',
    attached[0].slotKey === 'test:self');
  t('the surface procSize reached the attach',
    attached[0].procSize && attached[0].procSize.y === 2.0);

  t('re-sync of the same pick is a no-op',
    mgr.sync('self', JASON, { x: 0.8, y: 2.0, z: 0.8 }) === h1 && attached.length === 1);

  const peerHost = mgr.hostFor('peer-7');
  const hp = mgr.sync('peer-7', JASON, { x: 0.8, y: 2.0, z: 0.8 });
  t('two instances of the SAME character are two attaches (per-instance keys)',
    attached.length === 2 && attached[1].slotKey === 'test:peer-7' && hp !== h1);
  t('peer host is a different group', peerHost !== selfHost && hp.group.parent === peerHost);

  const h2 = mgr.sync('self', FREDDY, { x: 0.8, y: 2.0, z: 0.8 });
  t('swapping picks disposes the old handle and attaches the new',
    h2 && h2.characterId === FREDDY && disposed.length === 1 && disposed[0] === JASON
    && h2.group.parent === selfHost && mgr.characterIdFor('self') === FREDDY);

  t('sync to null clears back to the native figure',
    mgr.sync('self', null) === null && mgr.handleFor('self') === null
    && disposed.length === 2 && selfHost.children.length === 0);
  t('sync of an unknown id is refused as a clear, never an attach',
    mgr.sync('self', 'q999-nobody') === null && attached.length === 3);

  const removedHost = mgr.remove('peer-7');
  t('remove disposes the peer handle and returns its host',
    removedHost === peerHost && disposed.length === 3 && mgr.handleFor('peer-7') === null);
  t('remove of an unknown key is a safe null', mgr.remove('nobody') === null);

  mgr.sync('a', FREDDY, undefined);
  mgr.sync('b', JASON, undefined);
  mgr.disposeAll();
  t('disposeAll disposes every live handle',
    disposed.length === 5 && mgr.keys().length === 0);
}

// ==================================================================
// 4. The manager over the REAL Wave 0 scene — the presence cap:
//    live GLBs are metered per instance, the overflow instance is
//    a preview billboard; failed loads keep ready=false (the
//    native figure stays — fallback law end to end)
// ==================================================================
{
  const mgr = createPresenceEmbodiments({
    keyPrefix: 'cap', embodimentScene: createEmbodimentScene({ maxLiveGlb: 2 }),
  });
  const a = mgr.sync('a', JASON, { x: 0.8, y: 2.0, z: 0.8 });
  const b = mgr.sync('b', FREDDY, { x: 0.8, y: 2.0, z: 0.8 });
  const c = mgr.sync('c', SLIMER, { x: 0.84, y: 2.2, z: 0.84 });
  t('first instances under the cap are live-GLB handles',
    a && a.kind === 'glb' && b && b.kind === 'glb');
  t('the instance beyond the cap is a billboard handle',
    c && c.kind === 'billboard' && c.isLiveGlb() === false);
  t('the billboard is present immediately (ready + showing)',
    c.isReady() === true);
  t('registry holds exactly the capped live slots, keyed per instance',
    mgr.registry.liveCount() === 2
    && mgr.registry.has('cap:a') && mgr.registry.has('cap:b')
    && !mgr.registry.has('cap:c'));
  const readyResults = await Promise.all([a.ready, b.ready]);
  t('offline loads resolve ready=false — the native figures stay',
    readyResults[0] === false && readyResults[1] === false
    && a.isReady() === false && b.isReady() === false);
  mgr.remove('a');
  t('removing an instance returns its slot to the pool',
    mgr.registry.liveCount() === 1 && !mgr.registry.has('cap:a'));
  const d = mgr.sync('d', JASON, { x: 0.8, y: 2.0, z: 0.8 });
  t('a later instance can take the freed slot as a live GLB',
    d && d.kind === 'glb' && mgr.registry.liveCount() === 2);
  mgr.disposeAll();
  t('disposeAll empties the registry', mgr.registry.liveCount() === 0);
}

// ==================================================================
// 5. Source wiring — Persephone's hall
// ==================================================================
{
  const src = fs.readFileSync('components/persephone/HallScene.jsx', 'utf8');
  t('hall imports the Wave 0 React adapter',
    src.includes("from '@/components/characters/CharacterGlb'"));
  t('hall resolves the visitor pick through the Wave 0 chain',
    src.includes("resolveSurfaceCharacterId('persephone')"));
  t('the visitor figure receives the pick',
    src.includes('characterId={selfCharacterId}'));
  t('embodiment attaches only when a pick exists',
    src.includes('{characterId && (') && src.includes('<CharacterGlb'));
  t('the native hooded figure is the fallback (rendered while not live)',
    src.includes('{!live && (') && src.includes('coneGeometry'));
  t('per-instance slot key for the visitor',
    src.includes("SELF_SLOT_KEY = 'persephone:self'"));
  t('the figure footprint is the measured cone size',
    src.includes('FIGURE_PROC_SIZE = { x: 0.84, y: 2.2, z: 0.84 }'));
  t('peers render through the native figure (no invented picks)',
    src.includes('peers.map((p, i) => (') && !src.includes('characterId={p.'));
  t('the peer limit is documented in-source (presence payload has no pick)',
    src.includes('no account identity and no character pick'));
}

// ==================================================================
// 6. Source wiring — Skyscraper page + engine
// ==================================================================
{
  const page = fs.readFileSync('app/skyscraper/page.jsx', 'utf8');
  t('page mounts the shared CharacterPicker for the skyscraper surface',
    page.includes("from '@/components/characters/CharacterPicker'")
    && page.includes('surface="skyscraper"'));
  t('page state carries the picker report into the engine',
    page.includes('onPick={setWalkerPick}')
    && page.includes('walkerCharacterId={walkerPick}'));

  const eng = fs.readFileSync('app/skyscraper/components/NexusEngine.jsx', 'utf8');
  t('engine builds one presence manager for the scene',
    eng.includes("createPresenceEmbodiments({ keyPrefix: 'skyscraper' })"));
  t('engine self-resolves until the picker reports',
    eng.includes("resolveSurfaceCharacterId('skyscraper')"));
  t('our pick rides the broadcast payload',
    eng.includes('char: walkerCharRef.current || null'));
  t('peer picks are roster-validated on receipt',
    eng.includes('charId: characterIdFromPresencePayload(payload)'));
  t('peers without a payload pick get ONE public-API lookup by authId',
    eng.includes('fetchPeerCharacter(payload.id, payload.authId)')
    && eng.includes('/api/profiles/${encodeURIComponent(authId)}/character'));
  t('peer embodiments use per-instance keys (the peer session id)',
    eng.includes('emb.sync(peerId, characterId, FIGURE_PROC_SIZE)'));
  t('stale peers are retired with their embodiments (no slot leaks)',
    eng.includes('PEER_STALE_MS = 15000') && eng.includes('embRef.current.remove(peerId)'));
  t('the capsule steps aside only while the peer model is live',
    eng.includes('p.mesh.visible = !handle.isReady()'));
  t('peer embodiments stand on the floor beneath the capsule center',
    eng.includes('p.mesh.position.y - FIGURE_PROC_SIZE.y / 2'));
  t('the bespoke Deadpool remains the native self body',
    eng.includes('<DeadpoolAvatar isDriving={false}') && eng.includes('nativeAvatarRef'));
  t('Deadpool steps aside only while the self model is ready',
    eng.includes('nativeAvatarRef.current.visible = !(selfHandle && selfHandle.isReady())'));
  t('the self embodiment inherits the avatar group (position + facing)',
    eng.includes('<primitive object={selfHost} />'));
  t('scene teardown disposes all embodiments',
    eng.includes('embRef.current?.disposeAll()'));
}

// ==================================================================
// 7. Source wiring — /u/[username] character display
// ==================================================================
{
  const src = fs.readFileSync('app/u/[username]/page.jsx', 'utf8');
  t('/u renders the profile character through CharacterToken (plate)',
    src.includes("from '@/components/characters/CharacterToken'")
    && src.includes('variant="plate"'));
  t('/u validates the stored pick against the roster before display',
    src.includes('getCharacterById(data.characterId)'));
  t('/u reads the pick off the personal row / by user_id for business',
    src.includes("typeof profile.profile_character_id === 'string'")
    && src.includes(".select('profile_character_id')"));
  t('the character block is a labeled profile section',
    src.includes('aria-label="Profile character"') && src.includes('Profile character</h2>'));
}

// ==================================================================
// 8. Source wiring — DefaultAvatarPicker "use my character"
// ==================================================================
{
  const src = fs.readFileSync('components/profile/DefaultAvatarPicker.jsx', 'utf8');
  t('picker reads the option from the pure read model (no 3D bundle)',
    src.includes("profileCharacterAvatar } from '@/lib/characters/embodiment'")
    && !src.includes('presence-embodiment'));
  t('the character option is offered by name',
    src.includes('Or use your character') && src.includes('Your profile character'));
  t('picking it hands the roster preview to onPick like any avatar',
    src.includes('onPick(character.preview)')
    && src.includes('characterSelected') && src.includes('value === character.preview'));
  t('the defaults grid is untouched',
    src.includes('DEFAULT_AVATARS.map') && src.includes('Or pick a default avatar'));
}

console.log(`\ncharacters-social: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
