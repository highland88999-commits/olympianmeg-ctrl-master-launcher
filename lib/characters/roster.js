// lib/characters/roster.js
// The platform character roster: every character the Olympus 3D
// generator (Tripo sprint) has produced and verified complete —
// generation + rig files on disk, glTF-checked by the sprint runner —
// published for ALL users to use in their profiles (Merlin, 2026-10-13:
// "all characters made should be able to be used by users in their
// profiles").
//
// This is Merlin's platform catalog, distinct from per-user World
// Engine forge characters (those live in world_engine_assets and show
// under My Creations). Preview images are local files under
// public/characters/ — the signed render URLs from generation time
// expire, so previews are served from the repo, never hot-linked.
//
// Pure data + helpers — safe to import from client components, API
// routes, and tests. When the sprint completes more characters, append
// them here (id = sprint queue id, preview copied to
// public/characters/<id>.png).

export const CHARACTERS = [
  { id: 'q001-freddy-krueger', name: 'Freddy Krueger', queueNumber: 1, preview: '/characters/q001-freddy-krueger.png' },
  { id: 'q002-jason-voorhees', name: 'Jason Voorhees', queueNumber: 2, preview: '/characters/q002-jason-voorhees.png' },
  { id: 'q003-michael-myers', name: 'Michael Myers', queueNumber: 3, preview: '/characters/q003-michael-myers.png' },
  { id: 'q004-leatherface', name: 'Leatherface', queueNumber: 4, preview: '/characters/q004-leatherface.png' },
  { id: 'q005-pennywise', name: 'Pennywise', queueNumber: 5, preview: '/characters/q005-pennywise.png' },
  { id: 'q006-ghostface', name: 'Ghostface', queueNumber: 6, preview: '/characters/q006-ghostface.png' },
  { id: 'q007-chucky', name: 'Chucky', queueNumber: 7, preview: '/characters/q007-chucky.png' },
  { id: 'q008-pinhead', name: 'Pinhead', queueNumber: 8, preview: '/characters/q008-pinhead.png' },
  { id: 'q009-candyman', name: 'Candyman', queueNumber: 9, preview: '/characters/q009-candyman.png' },
  { id: 'q010-samara-morgan', name: 'Samara Morgan', queueNumber: 10, preview: '/characters/q010-samara-morgan.png' },
  { id: 'q011-xenomorph', name: 'Xenomorph', queueNumber: 11, preview: '/characters/q011-xenomorph.png' },
  { id: 'q012-predator', name: 'Predator', queueNumber: 12, preview: '/characters/q012-predator.png' },
  { id: 'q013-darth-vader', name: 'Darth Vader', queueNumber: 13, preview: '/characters/q013-darth-vader.png' },
  { id: 'q014-luke-skywalker', name: 'Luke Skywalker', queueNumber: 14, preview: '/characters/q014-luke-skywalker.png' },
  { id: 'q015-yoda', name: 'Yoda', queueNumber: 15, preview: '/characters/q015-yoda.png' },
  { id: 'q016-emperor-palpatine', name: 'Emperor Palpatine', queueNumber: 16, preview: '/characters/q016-emperor-palpatine.png' },
  { id: 'q017-t-800-terminator', name: 'T-800 Terminator', queueNumber: 17, preview: '/characters/q017-t-800-terminator.png' },
  { id: 'q018-t-1000', name: 'T-1000', queueNumber: 18, preview: '/characters/q018-t-1000.png' },
  { id: 'q019-ellen-ripley', name: 'Ellen Ripley', queueNumber: 19, preview: '/characters/q019-ellen-ripley.png' },
  { id: 'q020-neo', name: 'Neo', queueNumber: 20, preview: '/characters/q020-neo.png' },
  { id: 'q021-t-rex', name: 'T-Rex', queueNumber: 21, preview: '/characters/q021-t-rex.png' },
  { id: 'q022-swift-raptor', name: 'Swift (raptor)', queueNumber: 22, preview: '/characters/q022-swift-raptor.png' },
  { id: 'q023-claw-raptor', name: 'Claw (raptor)', queueNumber: 23, preview: '/characters/q023-claw-raptor.png' },
  { id: 'q024-fang-raptor', name: 'Fang (raptor)', queueNumber: 24, preview: '/characters/q024-fang-raptor.png' },
  { id: 'q025-peter-venkman', name: 'Peter Venkman', queueNumber: 25, preview: '/characters/q025-peter-venkman.png' },
  { id: 'q026-ray-stantz', name: 'Ray Stantz', queueNumber: 26, preview: '/characters/q026-ray-stantz.png' },
  { id: 'q027-egon-spengler', name: 'Egon Spengler', queueNumber: 27, preview: '/characters/q027-egon-spengler.png' },
  { id: 'q028-winston-zeddemore', name: 'Winston Zeddemore', queueNumber: 28, preview: '/characters/q028-winston-zeddemore.png' },
  { id: 'q029-slimer', name: 'Slimer', queueNumber: 29, preview: '/characters/q029-slimer.png' },
  { id: 'q030-stay-puft', name: 'Stay Puft Marshmallow Man', queueNumber: 30, preview: '/characters/q030-stay-puft.png' },
  { id: 'q031-bugs-bunny', name: 'Bugs Bunny', queueNumber: 31, preview: '/characters/q031-bugs-bunny.png' },
  { id: 'q032-tasmanian-devil', name: 'Tasmanian Devil', queueNumber: 32, preview: '/characters/q032-tasmanian-devil.png' },
  { id: 'q033-hulk', name: 'Hulk', queueNumber: 33, preview: '/characters/q033-hulk.png' },
  { id: 'q034-deadpool', name: 'Deadpool', queueNumber: 34, preview: '/characters/q034-deadpool.png' },
  { id: 'q035-wolverine', name: 'Wolverine', queueNumber: 35, preview: '/characters/q035-wolverine.png' },
  { id: 'q036-thanos', name: 'Thanos', queueNumber: 36, preview: '/characters/q036-thanos.png' },
  { id: 'q037-iron-man', name: 'Iron Man', queueNumber: 37, preview: '/characters/q037-iron-man.png' },
  { id: 'q038-cloud-strife', name: 'Cloud Strife', queueNumber: 38, preview: '/characters/q038-cloud-strife.png' },
  { id: 'q039-sephiroth', name: 'Sephiroth', queueNumber: 39, preview: '/characters/q039-sephiroth.png' },
  { id: 'q040-tifa-lockhart', name: 'Tifa Lockhart', queueNumber: 40, preview: '/characters/q040-tifa-lockhart.png' },
  { id: 'q041-b-o-b', name: 'B.O.B.', queueNumber: 41, preview: '/characters/q041-b-o-b.png' },
  { id: 'q042-the-missing-link', name: 'The Missing Link', queueNumber: 42, preview: '/characters/q042-the-missing-link.png' },
  { id: 'q043-dr-cockroach', name: 'Dr. Cockroach', queueNumber: 43, preview: '/characters/q043-dr-cockroach.png' },
];

const BY_ID = new Map(CHARACTERS.map((c) => [c.id, c]));

export function getCharacterById(id) {
  if (typeof id !== 'string') return null;
  return BY_ID.get(id) || null;
}

export function isCharacterId(id) {
  return typeof id === 'string' && BY_ID.has(id);
}
