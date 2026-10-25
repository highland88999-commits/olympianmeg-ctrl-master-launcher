/*
 * MIDDLE-EARTH — placed figures: heroes, folk and creatures.
 *
 * Mirrors the Star Wars character system (../star-wars/characters.
 * js): a pod def carries `characters: [{ id, model, name, at,
 * faceYaw, height, creature? }]`; buildFigure assembles a group
 * seated on the terrain with a soft shadow blob, a breathing body,
 * a GLB model slot fitted by HEIGHT, and a small name label that
 * fades by the shared label law (gone inside 4 m, full through the
 * mid-range, gone past 60 m — imported from the SW module so the
 * two programs can never drift apart on it).
 *
 * The figures shipping today are the staged UNRIGGED downloads,
 * optimized through the unrigged pipeline into
 * public/models/middle-earth/. When a rigged twin later replaces
 * a file at the same public path, nothing here changes — the
 * skeleton simply arrives inside the slot.
 *
 * ⚠ IDENTIFICATION (tentative, one-line correctable): the two
 * dragon files Merlin downloaded are near-interchangeable at a
 * glance. The staged 'dark dragon 3d model' was read as the FELL
 * BEAST and 'fantasy dragon 3d model' as the DRAGON. The mapping
 * lives in CREATURE_FILE below and nowhere else — if the read was
 * wrong, swap those two values and both creatures are right.
 */
import { labelOpacity } from '../star-wars/characters.js';

export const CREATURE_FILE = {
  'fell-beast': 'fell-beast', // staged: 'dark dragon 3d model' (tentative)
  dragon: 'dragon', //           staged: 'fantasy dragon 3d model' (tentative)
};

/* Height-fitted figure models. yawFix corrects a model's file-space
 * facing to the house convention (figure faces its local +Z); all
 * zero until Merlin's on-device glance says otherwise — the staged
 * files' facings were never measured, so these are flagged
 * one-glance correctable, exactly like the saga's first pass. */
export const CHARACTER_MODELS = {
  wizard: { url: '/models/middle-earth/wizard.glb', yawFix: 0 },
  'white-wizard': { url: '/models/middle-earth/white-wizard.glb', yawFix: 0 },
  ranger: { url: '/models/middle-earth/ranger.glb', yawFix: 0 },
  'elf-archer': { url: '/models/middle-earth/elf-archer.glb', yawFix: 0 },
  dwarf: { url: '/models/middle-earth/dwarf.glb', yawFix: 0 },
  halfling: { url: '/models/middle-earth/halfling.glb', yawFix: 0 },
  'dark-lord': { url: '/models/middle-earth/dark-lord.glb', yawFix: 0 },
  horse: { url: '/models/middle-earth/horse.glb', yawFix: 0 },
  eagle: { url: '/models/middle-earth/eagle.glb', yawFix: 0 },
  warg: { url: '/models/middle-earth/warg.glb', yawFix: 0 },
  'fell-beast': { url: '/models/middle-earth/' + CREATURE_FILE['fell-beast'] + '.glb', yawFix: 0 },
  dragon: { url: '/models/middle-earth/' + CREATURE_FILE.dragon + '.glb', yawFix: 0 },
};

/* ---------------- THE FELLOWSHIP CAST — PLAYABLE ----------------
 * Merlin: "User selects their character and hunts orcs." The pick
 * lives in the progress store (data.js hero) and the player PLAYS
 * AS that figure in every pod. One table, every number: melee
 * damage, the ranged hand (kind + damage + range + cooldown),
 * max HP, walk speed, quiet (scales orc alert radius AND hunt-
 * meter growth — a quiet hero is harder to notice), and sense
 * (the ranger's orc-tracking read in the HUD).
 *
 * The dark lord is deliberately NOT playable: he is placed cast
 * in Mordor — the campaign's looming lord, not a hero pick.
 * The white wizard is likewise Saruman's alone. Picking a hero
 * empties that hero's NPC seat in its home pod (zone.js skips
 * the twin) — the player IS the wizard, so no second wizard
 * stands in the Shire.
 *
 * Reticles come from the backpack law, never forked: blade ->
 * dot, bow -> chevron, staff -> dot (RETICLE_BY_CLASS). */
export const PLAYABLE = {
  wizard: {
    key: 'wizard', name: 'The Grey Pilgrim', model: 'wizard', height: 1.9,
    maxHp: 100, speedMult: 1.0, quiet: 1.0, sense: false,
    meleeLabel: '⚔ Staff-blow', meleeDmg: 30,
    rangedLabel: '🔮 Staff blast', ranged: { kind: 'staff', dmg: 30, range: 26, cooldown: 0.9 },
    blurb: 'Staff blast at range, steady stride, steady nerve.',
  },
  ranger: {
    key: 'ranger', name: 'A Ranger of the North', model: 'ranger', height: 1.85,
    maxHp: 110, speedMult: 1.03, quiet: 0.9, sense: true,
    meleeLabel: '⚔ Blade', meleeDmg: 36,
    rangedLabel: '🏹 Bow', ranged: { kind: 'bow', dmg: 26, range: 30, cooldown: 0.8 },
    blurb: 'Balanced — and he reads orc-sign: the HUD shows the nearest orc.',
  },
  'elf-archer': {
    key: 'elf-archer', name: 'An Elf of the Valley', model: 'elf-archer', height: 1.9,
    maxHp: 95, speedMult: 1.05, quiet: 0.85, sense: false,
    meleeLabel: '⚔ Blade', meleeDmg: 30,
    rangedLabel: '🏹 Bow', ranged: { kind: 'bow', dmg: 34, range: 38, cooldown: 0.7 },
    blurb: 'The bow sings farther and harder; lighter in the body.',
  },
  dwarf: {
    key: 'dwarf', name: 'A Dwarf of Erebor', model: 'dwarf', height: 1.35,
    maxHp: 135, speedMult: 0.95, quiet: 1.1, sense: false,
    meleeLabel: '⚔ Axe', meleeDmg: 44,
    rangedLabel: '🏹 Bow', ranged: { kind: 'bow', dmg: 20, range: 24, cooldown: 0.9 },
    blurb: 'Hits like a forge-hammer and takes a beating; slower, louder.',
  },
  halfling: {
    key: 'halfling', name: 'A Halfling of the Shire', model: 'halfling', height: 1.15,
    maxHp: 90, speedMult: 1.12, quiet: 0.55, sense: false,
    meleeLabel: '🗡 Dagger', meleeDmg: 28,
    rangedLabel: '🏹 Bow', ranged: { kind: 'bow', dmg: 22, range: 26, cooldown: 0.7 },
    blurb: 'Quick, quiet, hard to notice — the hunt meter grows slowest.',
  },
};
export const PLAYABLE_ORDER = ['wizard', 'ranger', 'elf-archer', 'dwarf', 'halfling'];
export const DEFAULT_HERO = 'ranger'; // the balanced pick, until the player chooses

function makeNameLabel(R, text) {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 96;
  const ctx = cv.getContext('2d');
  if (ctx) {
    ctx.fillStyle = 'rgba(10,12,8,0.66)';
    const label = String(text || '');
    ctx.font = '600 40px Georgia, serif';
    const w = Math.min(500, ctx.measureText(label).width + 44);
    ctx.beginPath();
    ctx.roundRect((512 - w) / 2, 14, w, 62, 14);
    ctx.fill();
    ctx.fillStyle = '#e8dcb0';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, 256, 46);
  }
  const tex = new R.CanvasTexture(cv);
  tex.colorSpace = R.SRGBColorSpace;
  const sp = new R.Sprite(new R.SpriteMaterial({
    map: tex, transparent: true, depthWrite: false, fog: false, opacity: 0,
  }));
  sp.scale.set(2.0, 0.375, 1); // a small head tag, never a billboard
  return sp;
}

/**
 * Load CHARACTER_MODELS[key] into `slot`, normalised by HEIGHT:
 * the figure stands `height` metres tall, base on y=0, centred on
 * x/z, registry yawFix applied to an inner wrap. Same loader idiom
 * as the saga's attachCharacterModel. Never throws.
 */
export function attachFigureModel(R, slot, key, height, onArrive) {
  const def = CHARACTER_MODELS[key];
  if (!def || !slot || typeof window === 'undefined') return null;
  const wrap = new R.Group();
  wrap.name = 'figure-model:' + key;
  wrap.rotation.y = def.yawFix || 0;
  slot.add(wrap);
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
      const box = new R.Box3().setFromObject(model);
      const size = new R.Vector3(); box.getSize(size);
      const center = new R.Vector3(); box.getCenter(center);
      const fit = (height || 1.8) / Math.max(size.y, 1e-6);
      model.scale.setScalar(fit);
      model.position.set(-center.x * fit, -box.min.y * fit, -center.z * fit);
      model.traverse((o) => {
        if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; }
      });
      wrap.add(model);
      slot.userData.figureModel = key;
      if (typeof onArrive === 'function') onArrive();
    } catch (e) {
      /* no stand-in for a person: the figure simply never appears */
    }
  })();
  return slot;
}

/**
 * Build one figure. R = three namespace, def as in data.js,
 * groundHeight(x, z) seats it. Creatures (def.creature) get a
 * wider shadow and a stiller idle — a dragon does not fidget.
 * Returns { group, update(t, dt, distToPlayer), dispose() }.
 */
export function buildFigure(R, def, groundHeight) {
  const d = def || {};
  const at = Array.isArray(d.at) ? d.at : [0, 0];
  const height = d.height || 1.8;
  const phase = at[0] * 1.7 + at[1];
  const creature = !!d.creature;

  const group = new R.Group();
  group.name = 'figure:' + (d.id || d.model || 'figure');
  group.position.set(at[0], groundHeight(at[0], at[1]), at[1]);
  group.rotation.y = d.faceYaw || 0;

  const shadow = new R.Mesh(
    new R.CircleGeometry(creature ? height * 0.42 : 0.55, 20),
    new R.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;
  group.add(shadow);

  const body = new R.Group();
  body.name = 'figure-body';
  group.add(body);

  const slot = new R.Group();
  slot.name = 'figure-slot';
  body.add(slot);

  /* The label stays hidden until the model arrives — a floating
   * name with nobody under it reads broken (the SW law). */
  const label = makeNameLabel(R, d.name || d.id || '');
  label.position.y = height + 0.38;
  label.visible = false;
  group.add(label);
  let arrived = false;

  attachFigureModel(R, slot, d.model, height, () => { arrived = true; });

  function update(t, dt, dist) {
    body.position.y = Math.sin(t * (creature ? 0.7 : 1.35) + phase) * (creature ? 0.02 : 0.012);
    body.rotation.y = Math.sin(t * 0.23 + phase * 1.3) * (creature ? 0.05 : 0.13);
    if (arrived) {
      /* The player's own tag never shows (hideLabel): the follow
       * camera sits a fixed 5.2 m behind, inside the label law's
       * fade ramp, so the own tag used to float over the header
       * forever. You cannot read your own name tag — it is hidden,
       * and every other figure keeps the shared law. */
      if (d.hideLabel) {
        label.visible = false;
      } else {
        const op = labelOpacity(dist);
        label.material.opacity = op;
        label.visible = op > 0.02;
      }
    }
  }

  function dispose() {
    if (label.material) {
      if (label.material.map) label.material.map.dispose();
      label.material.dispose();
    }
  }

  return { group, update, dispose };
}
