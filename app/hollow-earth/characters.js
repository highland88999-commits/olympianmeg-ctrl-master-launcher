// OLYMPIAN MONSTERVERSE — character roster (pure data + figure).
//
// SELECTION LIVES IN THE MONSTERVERSE CONCOURSE ENTRY (Merlin,
// 2026-10-24): the realm's Concourse tile/panel opens character
// selection FIRST, and entering the realm happens as the selected
// character. There is deliberately NO standalone picker page —
// the page's menu screen IS the Concourse entry. The pick
// persists like Middle-earth's progress.hero (data.js).
//
// THE MONSTER HUNTER (builder-determined, the realm's default):
// Kael, the Monster Hunter — a tall hunter in dark leathers with
// a trophy pauldron and a hunting spear, built for exactly this
// realm. HP 120 (above the Middle-earth average: he is the
// specialist here). Starting weapon: hunting spear, 38 dmg
// (spear → chevron reticle under the backpack law) + a
// bolt-thrower at range, 30 dmg @ 28 m (bow-class → chevron).
// SIGNATURE TRAIT (judgment call): TRACKING SENSE — the HUD
// shows the nearest monster's direction, distance and element
// colour. Tracking beats resilience here because the realm's
// core loop IS the hunt: finding the next monster matters more
// than soaking one more hit. Procedural stand-in below until a
// Tripo model lands at the registry path (same footprint
// contract as the monsters: collider 0.45 m, height-fitted).
// NEEDS-TRIPO-GLB (2026-11-28): /models/hollow-earth/
// monster-hunter.glb does NOT exist on disk — Kael stays on the
// procedural stand-in. Do NOT fake a Kael model.
//
// IMPORTED HEROES (adapted, stats carried over verbatim from
// their home program — HP, speed, quiet, sense, weapons — and
// reticles re-derived from the backpack law, never forked):
//   wizard, ranger, elf-archer, dwarf, halfling (Middle-earth
//   PLAYABLE, characters.js). Their realm rules still apply
//   here: the +12 heal on kill and the 30-kill shield are realm
//   rules, identical for every hero.
//   CGI SWAP (2026-11-28): the five imported heroes now render
//   their real Middle-earth GLBs (public/models/middle-earth/),
//   loaded the Middle-earth way (attachFigureModel idiom:
//   GLTFLoader + MeshoptDecoder — the ME GLBs are
//   EXT_meshopt_compression, a plain GLTFLoader cannot read
//   them). The procedural body stays as the load-failure
//   fallback ONLY, same as the Middle-earth orcs' stand-in
//   contract: on any load failure the figure keeps its
//   procedural body and never goes blank.
// EXCLUDED, exactly, and why:
//   Jedi Knight, Sith Lord (Star Wars placed characters): their
//   home program defines NO hero stats — saber colour/length
//   only, no HP, no damage — so by Merlin's own rule they are
//   left out. If he defines their stats, they slot into this
//   same adapter with one entry each.
//   The Dark Lord, Saruman/the White Wizard (Middle-earth):
//   deliberately not playable in their home program (placed
//   cast / boss), so not imported.
//   Horse, eagle, warg, fell-beast, dragon (Middle-earth):
//   creatures, not heroes.

export const HERO_MODEL = {
  'monster-hunter': { url: '/models/hollow-earth/monster-hunter.glb', height: 1.9 },
  wizard: { url: '/models/middle-earth/wizard.glb', height: 1.9 },
  ranger: { url: '/models/middle-earth/ranger.glb', height: 1.85 },
  'elf-archer': { url: '/models/middle-earth/elf-archer.glb', height: 1.9 },
  dwarf: { url: '/models/middle-earth/dwarf.glb', height: 1.35 },
  halfling: { url: '/models/middle-earth/halfling.glb', height: 1.15 },
};

// Heroes with a real in-tree GLB to load. Kael is deliberately
// NOT in this set: his GLB does not exist (see header), so he
// never attempts a load and stays procedural.
const GLB_HEROES = new Set(['wizard', 'ranger', 'elf-archer', 'dwarf', 'halfling']);

export const HEROES = {
  'monster-hunter': {
    key: 'monster-hunter', name: 'Kael, the Monster Hunter', realm: 'Olympian Monsterverse',
    model: 'monster-hunter', height: 1.9,
    maxHp: 120, speedMult: 1.05, quiet: 0.9, sense: true,
    meleeLabel: '🏹 Hunting spear', meleeDmg: 38, meleeClass: 'spear',
    rangedLabel: '🎯 Bolt-thrower', ranged: { kind: 'bow', dmg: 30, range: 28, cooldown: 0.8 },
    trait: 'Tracking sense — the HUD shows the nearest monster, its distance and its element.',
    blurb: 'The realm’s own hunter. Built for this hunt, and it shows.',
  },
  wizard: {
    key: 'wizard', name: 'The Grey Pilgrim', realm: 'Middle-earth',
    model: 'wizard', height: 1.9,
    maxHp: 100, speedMult: 1.0, quiet: 1.0, sense: false,
    meleeLabel: '⚔ Staff-blow', meleeDmg: 30, meleeClass: 'staff',
    rangedLabel: '🔮 Staff blast', ranged: { kind: 'staff', dmg: 30, range: 26, cooldown: 0.9 },
    blurb: 'Staff blast at range, steady stride, steady nerve.',
  },
  ranger: {
    key: 'ranger', name: 'A Ranger of the North', realm: 'Middle-earth',
    model: 'ranger', height: 1.85,
    maxHp: 110, speedMult: 1.03, quiet: 0.9, sense: true,
    meleeLabel: '⚔ Blade', meleeDmg: 36, meleeClass: 'blade',
    rangedLabel: '🏹 Bow', ranged: { kind: 'bow', dmg: 26, range: 30, cooldown: 0.8 },
    blurb: 'Balanced — and he reads sign: the HUD shows the nearest monster.',
  },
  'elf-archer': {
    key: 'elf-archer', name: 'An Elf of the Valley', realm: 'Middle-earth',
    model: 'elf-archer', height: 1.9,
    maxHp: 95, speedMult: 1.05, quiet: 0.85, sense: false,
    meleeLabel: '⚔ Blade', meleeDmg: 30, meleeClass: 'blade',
    rangedLabel: '🏹 Bow', ranged: { kind: 'bow', dmg: 34, range: 38, cooldown: 0.7 },
    blurb: 'The bow sings farther and harder; lighter in the body.',
  },
  dwarf: {
    key: 'dwarf', name: 'A Dwarf of Erebor', realm: 'Middle-earth',
    model: 'dwarf', height: 1.35,
    maxHp: 135, speedMult: 0.95, quiet: 1.1, sense: false,
    meleeLabel: '⚔ Axe', meleeDmg: 44, meleeClass: 'blunt',
    rangedLabel: '🏹 Bow', ranged: { kind: 'bow', dmg: 20, range: 24, cooldown: 0.9 },
    blurb: 'Hits like a forge-hammer and takes a beating; slower, louder.',
  },
  halfling: {
    key: 'halfling', name: 'A Halfling of the Shire', realm: 'Middle-earth',
    model: 'halfling', height: 1.15,
    maxHp: 90, speedMult: 1.12, quiet: 0.55, sense: false,
    meleeLabel: '🗡 Dagger', meleeDmg: 28, meleeClass: 'blade',
    rangedLabel: '🏹 Bow', ranged: { kind: 'bow', dmg: 22, range: 26, cooldown: 0.7 },
    blurb: 'Quick, quiet, hard to notice — monsters spot him last.',
  },
};

export const HERO_ORDER = ['monster-hunter', 'wizard', 'ranger', 'elf-archer', 'dwarf', 'halfling'];
export const DEFAULT_HERO = 'monster-hunter';

export function heroDef(key) {
  return HEROES[key] || HEROES[DEFAULT_HERO];
}

/* Load a hero's Middle-earth GLB into the figure group, the
 * Middle-earth attachFigureModel way (app/middle-earth/
 * characters.js): GLTFLoader + MeshoptDecoder, normalised by
 * HEIGHT — the figure stands `height` metres tall, base on y=0,
 * centred on x/z. Fire-and-forget, never throws: on success the
 * procedural stand-in subgroup is removed and the GLB takes its
 * place (same group, same position/rotation/userData — the
 * page's per-frame sync never notices); on ANY failure the
 * stand-in simply stays. Browser only — in headless tests
 * (no window) this is a no-op and the stand-in is the figure. */
function attachHeroGlb(R, group, standIn, heroKey, height) {
  const def = HERO_MODEL[heroKey];
  if (!def || !def.url || !group || typeof window === 'undefined') return;
  (async () => {
    try {
      const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
        import('three/examples/jsm/loaders/GLTFLoader.js'),
        import('three/examples/jsm/libs/meshopt_decoder.module.js'),
      ]);
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      const gltf = await loader.loadAsync(def.url);
      const model = gltf.scene;
      if (!model) return;
      const box = new R.Box3().setFromObject(model);
      const size = new R.Vector3(); box.getSize(size);
      const center = new R.Vector3(); box.getCenter(center);
      const fit = (height || 1.8) / Math.max(size.y, 1e-6);
      model.scale.setScalar(fit);
      model.position.set(-center.x * fit, -box.min.y * fit, -center.z * fit);
      model.traverse((o) => {
        if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; }
      });
      if (standIn && standIn.parent === group) group.remove(standIn);
      group.add(model);
      group.userData.standIn = false;
      group.userData.glb = true;
      group.userData.figureModel = heroKey;
    } catch {
      // Load failure: the procedural stand-in stays. Never blank.
    }
  })();
}

/* Procedural stand-in for the selected hero: a full body in the
 * hero's colours with a weapon in hand, base on y=0, height as
 * given. For the five Middle-earth heroes the real GLB swaps in
 * on top of it (attachHeroGlb above); for Kael this IS the
 * figure until his Tripo model lands at HERO_MODEL.url. */
export function buildHeroFigure(R, heroKey) {
  const hero = heroDef(heroKey);
  const h = hero.height;
  const g = new R.Group();
  // The stand-in lives in its own subgroup so a successful GLB
  // load can remove it cleanly without touching the group the
  // page positions every frame.
  const standIn = new R.Group();
  standIn.name = 'hero-stand-in';
  g.add(standIn);
  const M = (geo, m, x, y, z) => {
    const o = new R.Mesh(geo, new R.MeshStandardMaterial(m));
    o.position.set(x, y, z);
    standIn.add(o);
    return o;
  };
  const coat = heroKey === 'monster-hunter' ? 0x2e2620 : 0x3a4a5a;
  M(new R.CylinderGeometry(0.26, 0.34, h * 0.55, 8), { color: coat, roughness: 0.9 }, 0, h * 0.62, 0);
  M(new R.SphereGeometry(0.16 * h, 10, 8), { color: 0xc8a888, roughness: 0.8 }, 0, h * 0.97, 0);
  M(new R.CylinderGeometry(0.05, 0.05, h * 0.7, 6), { color: 0x6b4a2f }, 0.3, h * 0.6, 0.2);
  M(new R.ConeGeometry(0.09, 0.3, 6), { color: 0xd8d8e0, metalness: 0.7, roughness: 0.3 }, 0.3, h * 0.6 + h * 0.35 + 0.15, 0.2);
  if (heroKey === 'monster-hunter') {
    // trophy pauldron: a small horned plate on the left shoulder
    M(new R.SphereGeometry(0.2, 8, 6), { color: 0x8a6a38, metalness: 0.5, roughness: 0.4 }, -0.3, h * 0.86, 0);
  }
  g.userData.heroKey = hero.key;
  g.userData.footprintR = 0.45;
  g.userData.modelPath = (HERO_MODEL[heroKey] || {}).url || null;
  g.userData.standIn = true;
  if (GLB_HEROES.has(hero.key)) attachHeroGlb(R, g, standIn, hero.key, h);
  return g;
}
