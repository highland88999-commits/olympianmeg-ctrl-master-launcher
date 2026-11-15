// lib/weapons/cgi.js
// THE SHARED WEAPON CGI SPEC (Merlin, 2026-11-15) — the one
// place that says what a weapon LOOKS like and how it FIRES.
// The forge, the backpack, and the gun system all read this
// module; nothing invents a second spec shape.
//
//   cgiForWeapon({ id, weaponClass }) -> { model, firing }
//   firingForClass(weaponClass)       -> { kind, speedMps, tracerColor, rangeM }
//   cgiForClass(weaponClass)          -> { model, firing } (procedural model —
//                                        for weapons known only by
//                                        class, e.g. patron commissions)
//   MODEL_BY_ID / MODEL_BY_PRESET_ID / MODEL_BY_CLASS /
//   FIRING_BY_CLASS — the tables.
//   spawnProjectile(firing, origin, direction, now[, rangeM])
//   stepProjectile(state, dt)         — pure, headless projectile sim
//   buildProceduralWeapon(R, build)   — seeded Three.js geometry for a
//                                        weapon with no GLB (or whose GLB
//                                        failed to load)
//   loadWeaponGroup(R, spec)          — GLB with procedural fallback,
//                                        normalised to the fit contract
//                                        (grip at the origin, fitted
//                                        to its intended in-hand length)
//   normaliseWeaponGroup(R, group, opts) — the fit itself, on any
//                                        loaded or procedural group
//   mountWeaponInHand(R, anchor, group, opts) — in-hand mount helper
//   mountWeaponSheathed(R, anchor, group, opts) — sheathe mount helper
//   WEAPON_LENGTH_M / WEAPON_MOUNT / WEAPON_SHEATHE — the tables
//   buildProjectileMesh / buildSwingArc / buildMuzzleFlash — the
//                                        visible shot for a strike
//
// MODEL — { kind: 'glb', src } for a real model file under
// public/models/weapons/, or { kind: 'procedural', build } where
// build names a primitive build the viewer knows ('blade', 'bow',
// 'spear', 'blunt', 'cane', 'staff', 'firearm'). A catalogue
// weapon maps by id first; anything else falls back to the
// procedural build for its class, default 'blade' — never an
// invented class, never a missing model.
// FIRING — kind is one of 'bullet' | 'arrow' | 'blast' | 'swing'
// | 'thrust' | 'cannonball'; speedMps is the projectile speed for
// ranged kinds and the swing speed for melee kinds; tracerColor
// is the tracer tint for ranged kinds (null for melee); rangeM
// is the reach.
//
// SIZE LAW — meta.cgi rides in the backpack entry's meta, and the
// backpack law drops any meta whose JSON tops 2400 chars, so
// both halves stay deliberately small: no names, no blurbs, no
// nested detail. The full spec is ~200 chars.

import * as THREE from 'three';

const GLB = (file) => ({ kind: 'glb', src: `/models/weapons/${file}` });
const PROC = (build) => ({ kind: 'procedural', build });

// ── Models by catalogue weapon id ────────────────────────────────
// Every GLB named here exists on disk (public/models/weapons/).
// Flint Shiv has no GLB — it is the one procedural catalogue
// weapon, built as a blade.
// Forge ids wrap the closest real GLB by resemblance (a bow wraps
// the recurve bow, a rifle the crystal sniper) — the file exists
// in every case; the procedural class build is the fallback when
// a GLB fails to load (loadWeaponGroup, below).
export const MODEL_BY_ID = {
  'flint-shiv': PROC('blade'),
  'driftwood-bow': GLB('recurve-bow.glb'),
  'scrap-spear': GLB('spear.glb'),
  'bronze-gladius': GLB('short-sword.glb'),
  'ember-revolver': GLB('revolver-handgun.glb'),
  'silverfang-dagger': GLB('short-sword.glb'),
  'nightreaver-bow': GLB('recurve-bow.glb'),
  'bloodmoon-rifle': GLB('crystal-sniper-rifle.glb'),
  'terrorbone-club': GLB('heavy-spiked-mace.glb'),
  'raptorclaw-kris': GLB('short-sword.glb'),
  'amberfang-spear': GLB('spear.glb'),
  'fossilplate-maul': GLB('heavy-spiked-mace.glb'),
  'hammonds-amber-cane': GLB('walking-cane.glb'),
};

// ── Models by preset / gift / prize weapon id ────────────────────
// Kept apart from MODEL_BY_ID on purpose: that table is the
// forge catalogue, exactly 13 (the forge test asserts the count).
// These ids come from the backpack instead — the seven Tripo
// presets (TRIPO_PRESET_WEAPONS, each names its own GLB in
// code), Merlin's gift, and the Redwater prize. cgiForWeapon
// reads this table second, after the catalogue.
export const MODEL_BY_PRESET_ID = {
  // ── Backpack presets (lib/backpack/backpack.js) ──
  'preset-revolver': GLB('revolver-handgun.glb'),
  'preset-bow': GLB('recurve-bow.glb'),
  'preset-spear': GLB('spear.glb'),
  'preset-sword': GLB('short-sword.glb'),
  'preset-mace': GLB('heavy-spiked-mace.glb'),
  'preset-cane': GLB('walking-cane.glb'),
  'preset-staff': GLB('wizard-staff.glb'),
  // ── Merlin's gift (MERLIN_GIFT_ITEMS) + the Redwater prize ──
  // The sniper's CGI key is 'crystal-sniper': the claim route
  // (app/api/redwater/claim/route.js) names the prize
  // 'Diamond-Crusted Sniper' and points it at this GLB.
  'rusty-grappling-hook': GLB('rusty-grappling-hook.glb'),
  'crystal-sniper': GLB('crystal-sniper-rifle.glb'),
};

// ── Procedural model by weapon class ─────────────────────────────
// The fallback for any weapon known only by class (a patron
// commission, a gift known only by name). Keyed by the weapon's
// actual class; unknown classes default to 'blade'.
export const MODEL_BY_CLASS = {
  firearm: PROC('firearm'),
  bow: PROC('bow'),
  spear: PROC('spear'),
  blade: PROC('blade'),
  blunt: PROC('blunt'),
  cane: PROC('cane'),
  staff: PROC('staff'),
};

export const PROCEDURAL_BUILDS = Object.keys({
  blade: 1, bow: 1, spear: 1, blunt: 1, cane: 1, staff: 1, firearm: 1, cannon: 1,
});

// ── Scene weapons with no backpack entry ─────────────────────────
// The Flying Dutchman fights with these, not with backpack ids:
// cannons (engine.js SHIP.ballSpeed 64, cannonRange 130) and the
// pistol of the ashore pistol duel (a firearm by behaviour).
// Middle-earth heroes need no special ids — a hero's ranged kind
// ('bow' | 'staff') and melee resolve through the class fallback.
export const SCENE_WEAPON_CGI = {
  'dutchman-cannon': {
    model: PROC('cannon'),
    firing: { kind: 'cannonball', speedMps: 64, tracerColor: '#ffb347', rangeM: 130 },
  },
  'dutchman-pistol': {
    model: PROC('firearm'),
    firing: { kind: 'bullet', speedMps: 350, tracerColor: '#ffb347', rangeM: 60 },
  },
};

// ── Firing behaviour by weapon class ─────────────────────────────

export const FIRING_KINDS = ['bullet', 'arrow', 'blast', 'swing', 'thrust', 'cannonball'];

export const FIRING_BY_CLASS = {
  firearm: { kind: 'bullet', speedMps: 350, tracerColor: '#ffb347', rangeM: 120 },
  bow: { kind: 'arrow', speedMps: 70, tracerColor: '#e8e0c8', rangeM: 90 },
  spear: { kind: 'thrust', speedMps: 14, tracerColor: null, rangeM: 2 },
  blade: { kind: 'swing', speedMps: 9, tracerColor: null, rangeM: 2 },
  blunt: { kind: 'swing', speedMps: 7, tracerColor: null, rangeM: 2 },
  cane: { kind: 'swing', speedMps: 8, tracerColor: null, rangeM: 2 },
  staff: { kind: 'blast', speedMps: 60, tracerColor: '#b78cff', rangeM: 60 },
};

/** The firing behaviour for a weapon class — a fresh copy, so
 *  callers can never mutate the table. Unknown classes default
 *  to 'blade' (a swing), never an invented kind. */
export function firingForClass(weaponClass) {
  const spec = FIRING_BY_CLASS[weaponClass] || FIRING_BY_CLASS.blade;
  return { ...spec };
}

/** The procedural model for a weapon class — a fresh copy.
 *  Unknown classes default to the blade build. */
export function proceduralModelForClass(weaponClass) {
  const model = MODEL_BY_CLASS[weaponClass] || MODEL_BY_CLASS.blade;
  return { ...model };
}

/** The full CGI spec for a weapon known by id and/or class: the
 *  id's model when it has one, else the procedural build for its
 *  class, plus the class firing behaviour. Scene weapons
 *  (Dutchman cannon/pistol) resolve by id first. */
export function cgiForWeapon({ id, weaponClass } = {}) {
  if (id && SCENE_WEAPON_CGI[id]) {
    const s = SCENE_WEAPON_CGI[id];
    return { model: { ...s.model }, firing: { ...s.firing } };
  }
  const model = (id && MODEL_BY_ID[id])
    ? { ...MODEL_BY_ID[id] }
    : (id && MODEL_BY_PRESET_ID[id])
      ? { ...MODEL_BY_PRESET_ID[id] }
      : proceduralModelForClass(weaponClass);
  return { model, firing: firingForClass(weaponClass) };
}

/** The full CGI spec for a weapon known only by class (a patron
 *  commission): procedural model keyed by that class + the class
 *  firing behaviour. */
export function cgiForClass(weaponClass) {
  return { model: proceduralModelForClass(weaponClass), firing: firingForClass(weaponClass) };
}

// ── Projectile sim (pure, headless-testable) ─────────────────────
// A strike's visible shot is a record first, a mesh second: the
// scene steps the record with stepProjectile and moves the mesh
// to record.pos. Damage is NEVER decided here — the realm's
// strike() owns hit/miss/cooldown; this only flies the tracer.

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function vec3(v, fallback) {
  if (Array.isArray(v) && v.length >= 3) {
    return [num(v[0], fallback[0]), num(v[1], fallback[1]), num(v[2], fallback[2])];
  }
  return [...fallback];
}

/**
 * Start a projectile. firing is a FIRING_BY_CLASS entry (or any
 * { kind, speedMps, tracerColor, rangeM }); origin/direction are
 * [x, y, z] (direction is normalised, zero falls back to -Z);
 * rangeM overrides firing.rangeM (a realm's strike range, e.g.
 * the hero's bow range, beats the table's reach for the visual).
 * Returns the mutable state stepProjectile advances.
 */
export function spawnProjectile(firing, origin, direction, now, rangeM) {
  const f = firing || {};
  const dir = vec3(direction, [0, 0, -1]);
  const len = Math.hypot(dir[0], dir[1], dir[2]);
  const unit = len > 1e-9
    ? [dir[0] / len, dir[1] / len, dir[2] / len]
    : [0, 0, -1];
  const pos = vec3(origin, [0, 0, 0]);
  const speed = Math.max(0, num(f.speedMps, 30));
  const range = Math.max(0.1, num(rangeM, num(f.rangeM, 30)));
  return {
    kind: typeof f.kind === 'string' && f.kind ? f.kind : 'blast',
    speedMps: speed,
    tracerColor: typeof f.tracerColor === 'string' ? f.tracerColor : '#ffffff',
    rangeM: range,
    origin: [...pos],
    dir: unit,
    pos: [...pos],
    traveled: 0,
    bornAt: num(now, 0),
    alive: true,
  };
}

/**
 * Advance a projectile state by dt seconds. Returns true the
 * frame it impacts (travelled >= rangeM) — the scene removes the
 * mesh then. Mutates state in place.
 */
export function stepProjectile(state, dt) {
  if (!state || !state.alive) return false;
  const step = Math.max(0, num(dt, 0)) * state.speedMps;
  state.traveled += step;
  state.pos[0] += state.dir[0] * step;
  state.pos[1] += state.dir[1] * step;
  state.pos[2] += state.dir[2] * step;
  if (state.traveled >= state.rangeM) {
    state.alive = false;
    return true;
  }
  return false;
}

/** A projectile record's remaining life in seconds (for fades). */
export function projectileLifeLeft(state) {
  if (!state || !state.alive) return 0;
  return Math.max(0, (state.rangeM - state.traveled) / Math.max(state.speedMps, 1e-6));
}

// ── Which firing a strike shows (pure — the ME page's decision) ──
// The equipped weapon arms the hand when it fits: a firearm or
// bow in the pack replaces the hero's native ranged shot; anything
// else leaves the hero's own bow/staff. This is the one place
// that decision lives, so the page and the tests can never drift.

const RANGED_CLASSES = ['bow', 'firearm'];

/**
 * The firing spec for a ranged strike.
 * { equippedId, equippedClass } — the backpack's equipped weapon
 * (either may be null); heroKind — the hero's native ranged kind
 * ('bow' | 'staff'). An equipped firearm shoots real bullets.
 */
export function rangedFiringFor({ equippedId, equippedClass, heroKind } = {}) {
  if (equippedClass && RANGED_CLASSES.includes(equippedClass)) {
    return cgiForWeapon({ id: equippedId || undefined, weaponClass: equippedClass }).firing;
  }
  return firingForClass(heroKind);
}

/**
 * The firing spec for a melee strike, or null when the hero's
 * native melee owns the hand (no equipped melee weapon).
 */
export function meleeFiringFor({ equippedId, equippedClass } = {}) {
  if (!equippedClass || RANGED_CLASSES.includes(equippedClass)) return null;
  return cgiForWeapon({ id: equippedId || undefined, weaponClass: equippedClass }).firing;
}

// ── Procedural builders (seeded Three.js geometry + materials) ──
// Same method as lib/planet-cgi and lib/sports/cgi.js: primitives
// only, no Tripo, no paid assets, deterministic — the same key
// builds the same weapon every load. Every weapon is ~1 m long
// before the fit, origin at the grip, length along +Y (the
// firearm's barrel up, grip down — normaliseWeaponGroup lays
// its barrel forward); loadWeaponGroup then fits each build to
// its intended in-hand length. R is the three namespace
// (import * as THREE).

function std(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.15, ...extra });
}

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = false;
  m.receiveShadow = false;
  return m;
}

function buildBlade(R) {
  const g = new THREE.Group();
  g.name = 'weapon-procedural:blade';
  const steel = std(0xb8bec8, { metalness: 0.7, roughness: 0.35 });
  const brass = std(0xc9a227, { metalness: 0.8, roughness: 0.4 });
  const grip = std(0x4a3220, { roughness: 1 });
  const blade = mesh(new THREE.BoxGeometry(0.09, 0.62, 0.016), steel, 0, 0.48, 0);
  g.add(blade);
  const tip = mesh(new THREE.ConeGeometry(0.064, 0.14, 4), steel, 0, 0.86, 0);
  tip.rotation.y = Math.PI / 4;
  tip.scale.set(1, 1, 0.25);
  g.add(tip);
  g.add(mesh(new THREE.BoxGeometry(0.2, 0.035, 0.04), brass, 0, 0.16, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.032, 0.036, 0.16, 8), grip, 0, 0.06, 0));
  g.add(mesh(new THREE.SphereGeometry(0.04, 8, 6), brass, 0, -0.03, 0));
  return g;
}

function buildBow(R) {
  const g = new THREE.Group();
  g.name = 'weapon-procedural:bow';
  const wood = std(0x6b4a2f, { roughness: 0.95 });
  const limb = mesh(new THREE.TorusGeometry(0.52, 0.028, 6, 24, Math.PI * 1.15), wood, 0, 0, 0);
  limb.rotation.z = Math.PI / 2 - (Math.PI * 1.15) / 2;
  limb.rotation.y = Math.PI / 2;
  g.add(limb);
  // Sinew string between the limb tips: the arc's ends land at
  // y ≈ -0.12, z ≈ ±0.5 (belly at y ≈ +0.52, the grip).
  const string = mesh(new THREE.CylinderGeometry(0.004, 0.004, 1.01, 4), std(0xe8e0c8), 0, -0.12, 0);
  string.rotation.x = Math.PI / 2;
  g.add(string);
  g.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.14, 8), std(0x3a2a18), 0, 0.52, 0));
  return g;
}

function buildSpear(R) {
  const g = new THREE.Group();
  g.name = 'weapon-procedural:spear';
  const haft = std(0x7a5a36, { roughness: 0.95 });
  const steel = std(0xb8bec8, { metalness: 0.7, roughness: 0.35 });
  g.add(mesh(new THREE.CylinderGeometry(0.025, 0.028, 1.0, 8), haft, 0, 0.5, 0));
  const head = mesh(new THREE.ConeGeometry(0.045, 0.22, 8), steel, 0, 1.1, 0);
  g.add(head);
  g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 8), std(0xc9a227, { metalness: 0.8 }), 0, 0.02, 0));
  return g;
}

function buildBlunt(R) {
  const g = new THREE.Group();
  g.name = 'weapon-procedural:blunt';
  const haft = std(0x5a4630, { roughness: 0.95 });
  const iron = std(0x6e6e72, { metalness: 0.75, roughness: 0.45 });
  g.add(mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.62, 8), haft, 0, 0.31, 0));
  g.add(mesh(new THREE.SphereGeometry(0.11, 10, 8), iron, 0, 0.72, 0));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const spike = mesh(new THREE.ConeGeometry(0.022, 0.09, 6), iron, Math.cos(a) * 0.1, 0.72, Math.sin(a) * 0.1);
    // Cone tip (+Y) points radially out from the head.
    spike.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).normalize(),
    );
    g.add(spike);
  }
  g.add(mesh(new THREE.ConeGeometry(0.03, 0.09, 6), iron, 0, 0.85, 0));
  return g;
}

function buildCane(R) {
  const g = new THREE.Group();
  g.name = 'weapon-procedural:cane';
  const wood = std(0x3a2a18, { roughness: 0.9 });
  const amber = std(0xff9a1f, { emissive: 0xcc6600, emissiveIntensity: 0.9, roughness: 0.25 });
  g.add(mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.95, 8), wood, 0, 0.475, 0));
  const crook = mesh(new THREE.TorusGeometry(0.07, 0.02, 6, 12, Math.PI), wood, 0, 0.95, 0);
  g.add(crook);
  g.add(mesh(new THREE.SphereGeometry(0.05, 10, 8), amber, 0, 0.99, 0));
  return g;
}

function buildStaff(R) {
  const g = new THREE.Group();
  g.name = 'weapon-procedural:staff';
  const wood = std(0x4a3520, { roughness: 0.95 });
  const crystal = std(0xb78cff, { emissive: 0x7a3cff, emissiveIntensity: 1.1, roughness: 0.2 });
  g.add(mesh(new THREE.CylinderGeometry(0.025, 0.032, 1.05, 8), wood, 0, 0.52, 0));
  g.add(mesh(new THREE.TorusGeometry(0.045, 0.012, 6, 12), std(0xc9a227, { metalness: 0.8 }), 0, 0.86, 0));
  g.children[g.children.length - 1].rotation.x = Math.PI / 2;
  g.add(mesh(new THREE.OctahedronGeometry(0.075), crystal, 0, 1.12, 0));
  return g;
}

function buildFirearm(R) {
  const g = new THREE.Group();
  g.name = 'weapon-procedural:firearm';
  const steel = std(0x3c3c40, { metalness: 0.8, roughness: 0.35 });
  const brass = std(0xc9a227, { metalness: 0.8, roughness: 0.4 });
  const grip = std(0x4a2c14, { roughness: 1 });
  // Revolver lying along +Y: barrel up, grip down — the mount
  // turns it to point at the aim.
  g.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.34, 10), steel, 0, 0.62, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.16, 12), steel, 0, 0.38, 0));
  g.add(mesh(new THREE.BoxGeometry(0.07, 0.16, 0.09), steel, 0, 0.26, 0));
  const gripMesh = mesh(new THREE.BoxGeometry(0.07, 0.2, 0.1), grip, 0, 0.08, -0.02);
  gripMesh.rotation.x = 0.35;
  g.add(gripMesh);
  g.add(mesh(new THREE.BoxGeometry(0.02, 0.05, 0.02), brass, 0, 0.5, 0.05));
  return g;
}

function buildCannon(R) {
  const g = new THREE.Group();
  g.name = 'weapon-procedural:cannon';
  const iron = std(0x2e2e32, { metalness: 0.75, roughness: 0.45 });
  const wood = std(0x5a4630, { roughness: 0.95 });
  const barrel = mesh(new THREE.CylinderGeometry(0.09, 0.13, 0.9, 12), iron, 0, 0.32, 0);
  barrel.rotation.x = Math.PI / 2;
  g.add(barrel);
  g.add(mesh(new THREE.SphereGeometry(0.13, 10, 8), iron, 0, 0.32, -0.42));
  for (const x of [-0.22, 0.22]) {
    const wheel = mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.05, 12), wood, x, 0.19, 0);
    wheel.rotation.z = Math.PI / 2;
    g.add(wheel);
  }
  g.add(mesh(new THREE.BoxGeometry(0.34, 0.08, 0.5), wood, 0, 0.22, 0));
  return g;
}

const PROCEDURAL_BUILDERS = {
  blade: buildBlade,
  bow: buildBow,
  spear: buildSpear,
  blunt: buildBlunt,
  cane: buildCane,
  staff: buildStaff,
  firearm: buildFirearm,
  cannon: buildCannon,
};

/**
 * Build a procedural weapon group for a build key ('blade',
 * 'bow', 'spear', 'blunt', 'cane', 'staff', 'firearm',
 * 'cannon'). Unknown keys fall back to 'blade' — never null.
 * Deterministic: the same key builds the same group.
 */
export function buildProceduralWeapon(R, key) {
  const build = PROCEDURAL_BUILDERS[key] || PROCEDURAL_BUILDERS.blade;
  return build(R);
}

/** The procedural build key for a weapon (its GLB's fallback when
 *  the file fails to load, else its class build). */
export function proceduralBuildForWeapon({ id, weaponClass } = {}) {
  if (id && MODEL_BY_ID[id] && MODEL_BY_ID[id].kind === 'procedural') {
    return MODEL_BY_ID[id].build;
  }
  return (MODEL_BY_CLASS[weaponClass] || MODEL_BY_CLASS.blade).build;
}

// ── In-hand mount + GLB loading ────────────────────────────────

// ── In-hand mount + GLB loading ────────────────────────────────
//
// THE FIT CONTRACT (Merlin, 2026-11-15 — the revolver photo):
// loadWeaponGroup returns a group whose ORIGIN IS THE GRIP, whose
// long axis lies along +Y (firearms: +Z, barrel forward), fitted
// to the weapon's INTENDED in-hand length (WEAPON_LENGTH_M), not
// to a blind 1 m. The mount then only places that grip at the
// fist and turns the long axis toward the aim — it never scales,
// so a revolver can never again arrive 1.9 m long across the
// shoulders. Every GLB on disk was measured (node probe,
// 2026-11-15) and the numbers below are the measurements, not
// guesses: revolver/sniper lie barrel-along-−X with the grip
// below the barrel line at the +X end; the short sword is
// modelled diagonal; the spear carries a flat Tripo display
// disc at its butt; the grappling hook is longest on Z.

/* Intended in-hand lengths in metres — real-world sizes. A
 * Colt Single Action Army with a 5⅛″ barrel is 11″ (0.28 m)
 * overall; a longsword ~0.9 m; a recurve bow ~1.2 m; a spear
 * ~1.8 m; a wizard's staff ~1.6 m; a walking cane ~0.95 m; a
 * mace/maul ~0.8 m. A sniper rifle is a long gun, not a
 * handgun, so the crystal sniper GLB overrides the firearm
 * length (a rifle at revolver size would read as a toy). */
export const WEAPON_LENGTH_M = {
  firearm: 0.32, bow: 1.2, blade: 0.9, spear: 1.8,
  staff: 1.6, cane: 0.95, blunt: 0.8, cannon: 1.0,
};

const WEAPON_LENGTH_BY_SRC = {
  'crystal-sniper-rifle.glb': 1.1,
};

/** The intended in-hand length (m) for a weapon of a class (a
 * GLB src overrides the class length for long guns). */
export function intendedWeaponLengthM({ weaponClass, src } = {}) {
  if (src) {
    const base = String(src).split('/').pop();
    if (WEAPON_LENGTH_BY_SRC[base]) return WEAPON_LENGTH_BY_SRC[base];
  }
  return WEAPON_LENGTH_M[weaponClass] || WEAPON_LENGTH_M.blade;
}

/* Where the fist closes, as a fraction along the long axis from
 * the grip end (the low end: the butt for +Y weapons, the rear
 * for +Z firearms): blade/spear/blunt grip near the butt; a
 * staff is gripped about a third up the shaft; a bow at its
 * middle (the riser); a cane by the crook at the top; a
 * revolver at the rear, a rifle at the trigger grip about a
 * third from the butt. The grip POINT itself is the centroid
 * of the mesh inside that band, so an off-centre shaft (the
 * spear's shaft sits ~0.2 m off its box centre) still lands
 * in the fist instead of beside it. */
const WEAPON_GRIP_AT = {
  blade: 0.08, spear: 0.12, blunt: 0.08, staff: 0.30,
  bow: 0.50, cane: 0.95, firearm: 0.15, cannon: 0.5,
};

const WEAPON_GRIP_AT_BY_SRC = {
  'crystal-sniper-rifle.glb': 0.35,
};

/* Where a weapon sits in the hand: the figure's right side at
 * hand height. The group origin is the grip (see the fit
 * contract above), so `at` IS the fist. Rotation turns the
 * long axis toward the aim (forward is the figure's +Z):
 * blades/spears/maces lean forward out of a raised guard, the
 * bow stands vertical in the V of the bow hand, the staff
 * rises from the fist, the cane hangs from its crook, and the
 * firearm — already barrel-forward along +Z — needs only a
 * slight downward tilt, the barrel in line with the forearm
 * as a proper revolver grip demands. `scale` stays 1.0: the
 * fit lives in loadWeaponGroup, and the mount must never
 * re-scale it (mountWeaponInHand multiplies, it never sets). */
export const WEAPON_MOUNT = {
  blade: { at: [0.3, 0.62, 0.12], rot: [0.9, 0, -0.25], scale: 1.0 },
  bow: { at: [0.3, 0.62, 0.12], rot: [0, 0, 0], scale: 1.0 },
  spear: { at: [0.3, 0.62, 0.12], rot: [0.7, 0, -0.2], scale: 1.0 },
  blunt: { at: [0.3, 0.62, 0.12], rot: [0.9, 0, -0.25], scale: 1.0 },
  cane: { at: [0.3, 0.62, 0.12], rot: [0.15, 0, -0.1], scale: 1.0 },
  staff: { at: [0.3, 0.62, 0.12], rot: [0.25, 0, -0.15], scale: 1.0 },
  firearm: { at: [0.3, 0.62, 0.16], rot: [0.08, 0, 0], scale: 1.0 },
  cannon: { at: [0, 0.5, 0], rot: [0, 0, 0], scale: 1.0 },
};

/* Where a carried weapon rests when it is NOT in the hand
 * (fractions of the figure height, figure-body space — the
 * figure faces +Z, so the back is −Z): the blade on the left
 * hip, hilt at the waist, tip down-back (the quick-draw carry
 * — a back scabbard cannot be drawn for a blade this long);
 * the bow slung diagonal across the back; the spear and the
 * staff slung on the back, tips above the shoulder; the mace
 * on the back, head up; the cane hanging from its crook at
 * the left hip; the revolver in a low hip holster, barrel
 * down-forward, grip up-back. Every spot is ON the body, at
 * the weapon's fitted size — nothing floats, nothing is
 * oversized. The cannon has no sheathe: it is never carried. */
export const WEAPON_SHEATHE = {
  blade: { at: [-0.22, 0.52, -0.06], rot: [-2.64, 0, 0.25], scale: 1.0 },
  bow: { at: [0, 0.78, -0.18], rot: [0, 0, 0.6], scale: 1.0 },
  spear: { at: [0.1, 0.62, -0.2], rot: [0, 0, 0.5], scale: 1.0 },
  blunt: { at: [0.14, 0.72, -0.18], rot: [0.5, 0, -0.3], scale: 1.0 },
  cane: { at: [-0.24, 0.55, 0.02], rot: [0, 0, 0.1], scale: 1.0 },
  staff: { at: [-0.12, 0.55, -0.2], rot: [0.15, 0, 0.15], scale: 1.0 },
  firearm: { at: [0.24, 0.52, 0.05], rot: [1.25, 0, 0.15], scale: 1.0 },
  cannon: null,
};

/**
 * Attach a weapon group to a figure's body anchor (the
 * 'figure-body' group of a Middle-earth figure, or any Group).
 * height is the figure's height in metres — the mount fractions
 * scale with it. The group must already be fitted (its origin
 * the grip, its long axis on the aim axis — what
 * loadWeaponGroup returns); the mount only places and turns
 * it, and multiplies the scale (1.0) so it can never undo the
 * fit. Returns the group, added to the anchor.
 */
/** The procedural build key for a weapon class: the class's own
 * build, 'cannon' for the Dutchman scene cannon (it has no
 * backpack class entry), 'blade' for anything unknown. */
function buildForClass(weaponClass) {
  if (weaponClass === 'cannon') return 'cannon';
  return (MODEL_BY_CLASS[weaponClass] || MODEL_BY_CLASS.blade).build;
}

export function mountWeaponInHand(R, anchor, group, { weaponClass, height } = {}) {
  if (!anchor || !group) return null;
  const build = buildForClass(weaponClass);
  const m = WEAPON_MOUNT[build] || WEAPON_MOUNT.blade;
  const h = Math.max(0.5, Number(height) || 1.8);
  group.position.set(m.at[0] * (h / 1.8), m.at[1] * h, m.at[2]);
  group.rotation.set(m.rot[0], m.rot[1], m.rot[2]);
  group.scale.multiplyScalar(m.scale);
  group.name = 'weapon-in-hand:' + build;
  anchor.add(group);
  return group;
}

/**
 * Hang a carried weapon on the body at its sheathe spot (the
 * same anchor and height as mountWeaponInHand). The group must
 * already be fitted (origin the grip — what loadWeaponGroup
 * returns). Returns null for classes with no sheathe (cannon)
 * or a missing anchor/group; otherwise the group, added to
 * the anchor.
 */
export function mountWeaponSheathed(R, anchor, group, { weaponClass, height } = {}) {
  if (!anchor || !group) return null;
  const build = buildForClass(weaponClass);
  const m = WEAPON_SHEATHE[build];
  if (!m) return null;
  const h = Math.max(0.5, Number(height) || 1.8);
  group.position.set(m.at[0] * (h / 1.8), m.at[1] * h, m.at[2] * (h / 1.8));
  group.rotation.set(m.rot[0], m.rot[1], m.rot[2]);
  group.scale.multiplyScalar(m.scale);
  group.name = 'weapon-sheathed:' + build;
  anchor.add(group);
  return group;
}

// ── Normalisation (the fit contract — pure geometry) ───────────
// Every step bakes into the geometry itself, so the returned
// group carries scale 1 and position 0 with the grip exactly
// at its origin: callers can mount it, frame it, or measure
// it without ever knowing the fit happened.

/** Quantized (normalized-integer) position/normal attributes
 * cannot be baked: applyMatrix4 writes the transformed floats
 * back into the integer array, and any value past the int
 * range WRAPS (the staff's head folded to its feet — its Y
 * box came back exactly ±1.0). Convert them to float first:
 * getComponent returns the true dequantized metres. */
function dequantizeAttributes(group) {
  group.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    for (const key of ['position', 'normal']) {
      const attr = o.geometry.attributes[key];
      if (!attr || !attr.normalized) continue;
      const count = attr.count;
      const itemSize = attr.itemSize;
      const arr = new Float32Array(count * itemSize);
      for (let i = 0; i < count; i++) {
        for (let k = 0; k < itemSize; k++) {
          arr[i * itemSize + k] = attr.getComponent(i, k);
        }
      }
      o.geometry.setAttribute(key, new THREE.BufferAttribute(arr, itemSize));
    }
    o.geometry.boundingBox = null;
    o.geometry.boundingSphere = null;
  });
}

/** Bake every node transform of a loaded scene into its
 * geometries, so all vertices live in the group's own space
 * and every later step can read raw positions. */
function bakeNodeTransforms(group) {
  group.updateMatrixWorld(true);
  const meshes = [];
  group.traverse((o) => { if (o.isMesh) meshes.push(o); });
  for (const m of meshes) {
    if (m.geometry) m.geometry.applyMatrix4(m.matrixWorld);
  }
  group.traverse((o) => {
    if (o === group) return;
    o.position.set(0, 0, 0);
    o.rotation.set(0, 0, 0);
    o.scale.set(1, 1, 1);
  });
  group.updateMatrixWorld(true);
}

/** Bake one rotation into every mesh geometry of the group. */
function bakeRotation(group, rx, ry, rz) {
  if (!rx && !ry && !rz) return;
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0));
  group.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.applyMatrix4(m); });
}

/**
 * Strip a Tripo display base: a flat disc at the butt end of a
 * model (the spear's: 85% of its vertices sit in the bottom
 * 12% of its height, spanning 0.9 m while the shaft is 0.05 m
 * wide). Detected, never assumed: the bottom slab must hold
 * over half the vertices AND span 3× the mid-body width.
 * Triangles in the slab are dropped except those hugging the
 * shaft axis, so the shaft itself survives. Indexed geometry
 * only; anything else is left untouched. Returns true when a
 * disc was stripped.
 */
function stripDisplayDisc(group) {
  const meshes = [];
  group.traverse((o) => {
    if (o.isMesh && o.geometry && o.geometry.attributes && o.geometry.attributes.position
      && o.geometry.index) meshes.push(o);
  });
  if (!meshes.length) return false;
  let total = 0;
  let minY = Infinity;
  let maxY = -Infinity;
  const positions = [];
  for (const m of meshes) {
    const p = m.geometry.attributes.position;
    positions.push(p);
    total += p.count;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (!Number.isFinite(minY) || total === 0) return false;
  const spanY = Math.max(maxY - minY, 1e-6);
  const slabTop = minY + 0.12 * spanY;
  const midLo = minY + 0.4 * spanY;
  const midHi = minY + 0.6 * spanY;
  let slabCount = 0;
  let slabMinX = Infinity;
  let slabMaxX = -Infinity;
  let slabMinZ = Infinity;
  let slabMaxZ = -Infinity;
  let midCount = 0;
  let midMinX = Infinity;
  let midMaxX = -Infinity;
  let midMinZ = Infinity;
  let midMaxZ = -Infinity;
  let midSumX = 0;
  let midSumZ = 0;
  for (const p of positions) {
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      if (y <= slabTop) {
        slabCount += 1;
        if (x < slabMinX) slabMinX = x;
        if (x > slabMaxX) slabMaxX = x;
        if (z < slabMinZ) slabMinZ = z;
        if (z > slabMaxZ) slabMaxZ = z;
      } else if (y >= midLo && y <= midHi) {
        midCount += 1;
        if (x < midMinX) midMinX = x;
        if (x > midMaxX) midMaxX = x;
        if (z < midMinZ) midMinZ = z;
        if (z > midMaxZ) midMaxZ = z;
        midSumX += x;
        midSumZ += z;
      }
    }
  }
  if (midCount === 0) return false;
  const slabExtent = Math.max(slabMaxX - slabMinX, slabMaxZ - slabMinZ);
  const midExtent = Math.max(midMaxX - midMinX, midMaxZ - midMinZ);
  if (!(slabCount > 0.5 * total && slabExtent > 3 * Math.max(midExtent, 1e-6))) return false;
  const axisX = midSumX / midCount;
  const axisZ = midSumZ / midCount;
  const keepRadius = 0.6 * midExtent;
  for (const m of meshes) {
    const geo = m.geometry;
    const p = geo.attributes.position;
    const idx = geo.index.array;
    const kept = [];
    for (let t = 0; t + 2 < idx.length; t += 3) {
      const a = idx[t];
      const b = idx[t + 1];
      const c = idx[t + 2];
      const cx = (p.getX(a) + p.getX(b) + p.getX(c)) / 3;
      const cy = (p.getY(a) + p.getY(b) + p.getY(c)) / 3;
      const cz = (p.getZ(a) + p.getZ(b) + p.getZ(c)) / 3;
      const inSlab = cy <= slabTop;
      const farFromShaft = Math.hypot(cx - axisX, cz - axisZ) > keepRadius;
      if (inSlab && farFromShaft) continue;
      kept.push(a, b, c);
    }
    if (kept.length === idx.length) continue;
    geo.setIndex(kept);
    // The dropped vertices must leave the position attribute
    // too: three.js bounding boxes (and the grip centroid below)
    // read raw positions and never look at the index, so a
    // strip that only rewrote the index would still measure
    // — and grip — the disc.
    compactIndexedGeometry(geo);
  }
  return true;
}

/**
 * Drop unreferenced vertices from an indexed geometry and
 * remap the index (triangle order kept, so groups stay valid).
 * Skips morph-target geometry, whose morph attributes would
 * go stale. Every attribute is compacted, not just position.
 */
function compactIndexedGeometry(geo) {
  if (!geo.index || !geo.attributes.position) return;
  if (geo.morphAttributes && Object.keys(geo.morphAttributes).length) return;
  const index = geo.index.array;
  const pos = geo.attributes.position;
  const used = new Uint8Array(pos.count);
  for (let i = 0; i < index.length; i++) used[index[i]] = 1;
  const remap = new Int32Array(pos.count);
  let next = 0;
  for (let i = 0; i < pos.count; i++) remap[i] = used[i] ? next++ : -1;
  if (next === pos.count) return;
  for (const key of Object.keys(geo.attributes)) {
    const attr = geo.attributes[key];
    const itemSize = attr.itemSize;
    const src = attr.array;
    const dst = new src.constructor(next * itemSize);
    for (let i = 0; i < pos.count; i++) {
      const j = remap[i];
      if (j < 0) continue;
      for (let k = 0; k < itemSize; k++) dst[j * itemSize + k] = src[i * itemSize + k];
    }
    geo.setAttribute(key, new THREE.BufferAttribute(dst, itemSize, attr.normalized));
  }
  const newIndex = new index.constructor(index.length);
  for (let i = 0; i < index.length; i++) newIndex[i] = remap[index[i]];
  geo.setIndex(new THREE.BufferAttribute(newIndex, 1));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
}

/**
 * The grip point of a fitted-orientation weapon: the centroid
 * of the mesh inside the grip band (a ±7% band around the grip
 * fraction along the long axis), with the along-axis
 * coordinate pinned to the band centre. Falls back to the box
 * centre of the band when the band is empty.
 */
function gripPoint(group, longAxis, gripAt) {
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  const size = new THREE.Vector3();
  box.getSize(size);
  const axis = { x: 0, y: 1, z: 2 }[longAxis] || 1;
  const lo = box.min.getComponent(axis);
  const len = Math.max(size.getComponent(axis), 1e-6);
  const bandLo = lo + (gripAt - 0.07) * len;
  const bandHi = lo + (gripAt + 0.07) * len;
  let sx = 0;
  let sy = 0;
  let sz = 0;
  let n = 0;
  const v = new THREE.Vector3();
  group.traverse((o) => {
    if (!o.isMesh || !o.geometry || !o.geometry.attributes || !o.geometry.attributes.position) return;
    const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const a = v.getComponent(axis);
      if (a >= bandLo && a <= bandHi) { sx += v.x; sy += v.y; sz += v.z; n += 1; }
    }
  });
  const centre = box.getCenter(new THREE.Vector3());
  const grip = n > 0 ? new THREE.Vector3(sx / n, sy / n, sz / n) : centre;
  grip.setComponent(axis, lo + gripAt * len);
  return grip;
}

/**
 * Normalise a weapon group to the fit contract: origin at the
 * grip, long axis on the aim axis (+Y, or +Z barrel-forward
 * for firearms), fitted to its intended in-hand length. The
 * GLB or procedural group is mutated in place (transforms and
 * the fit are baked into the geometry) and returned; never
 * throws — a group that cannot be fitted comes back as it
 * was. R is the three namespace (kept for the callers'
 * convention; the module's own THREE does the work).
 */
export function normaliseWeaponGroup(R, group, { weaponClass, src } = {}) {
  if (!group) return null;
  const build = buildForClass(weaponClass);
  if (build === 'cannon') return group;
  const base = src ? String(src).split('/').pop() : '';
  try {
    dequantizeAttributes(group);
    bakeNodeTransforms(group);
    // 1. Longest axis onto the aim axis. Firearms built
    // barrel-up (the procedural revolver) lay the barrel
    // forward; an X-longest GLB (revolver, sniper: barrel
    // −X, grip below at +X) turns about Y so the barrel
    // points forward and the grip stays down — the one turn
    // that keeps the grip at the fist. A Z-longest model
    // (grappling hook) stands up on +Y.
    group.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(group);
    let size = new THREE.Vector3();
    box.getSize(size);
    let longAxis = 'y';
    if (size.x >= size.y && size.x >= size.z) longAxis = 'x';
    else if (size.z >= size.y && size.z >= size.x) longAxis = 'z';
    if (build === 'firearm' && longAxis === 'y') {
      bakeRotation(group, Math.PI / 2, 0, 0);
      longAxis = 'z';
    } else if (longAxis === 'x') {
      bakeRotation(group, 0, Math.PI / 2, 0);
      longAxis = 'z';
    } else if (longAxis === 'z' && build !== 'firearm') {
      bakeRotation(group, -Math.PI / 2, 0, 0);
      longAxis = 'y';
    }
    // 2. Measured per-model straightening: the short sword is
    // modelled diagonal (tip high-Y/−Z, hilt low-Y/+Z, ~32°);
    // +0.56 rad about X stands its true long axis on +Y.
    if (base === 'short-sword.glb') bakeRotation(group, 0.56, 0, 0);
    // 3. A Tripo display base at the butt (the spear's disc).
    stripDisplayDisc(group);
    // 4. Fit by the intended in-hand length, grip to the origin.
    group.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(group);
    size = new THREE.Vector3();
    box.getSize(size);
    const axisIdx = { x: 0, y: 1, z: 2 }[longAxis];
    const longLen = Math.max(size.getComponent(axisIdx), 1e-6);
    const target = intendedWeaponLengthM({ weaponClass, src });
    const scale = target / longLen;
    const gripAt = (base && WEAPON_GRIP_AT_BY_SRC[base])
      || WEAPON_GRIP_AT[build] || WEAPON_GRIP_AT.blade;
    const grip = gripPoint(group, longAxis, gripAt);
    const fit = new THREE.Matrix4()
      .multiplyMatrices(
        new THREE.Matrix4().makeScale(scale, scale, scale),
        new THREE.Matrix4().makeTranslation(-grip.x, -grip.y, -grip.z),
      );
    group.traverse((o) => {
      if (o.isMesh) {
        if (o.geometry) o.geometry.applyMatrix4(fit);
        o.castShadow = false;
        o.receiveShadow = false;
      }
    });
    return group;
  } catch (e) {
    return group;
  }
}

function disposeGroup(group) {
  if (!group) return;
  group.traverse((o) => {
    if (o.isMesh || o.isSprite) {
      if (o.geometry) { try { o.geometry.dispose(); } catch (e) { /* noop */ } }
      const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      for (const mat of mats) {
        if (mat.map) { try { mat.map.dispose(); } catch (e) { /* noop */ } }
        try { mat.dispose(); } catch (e) { /* noop */ }
      }
    }
  });
}

/**
 * Load a weapon's visible group: the GLB when the spec names one
 * (normalised to the fit contract — grip at the origin, long
 * axis on the aim axis, fitted to its intended in-hand length),
 * the procedural build when it names one, and the procedural
 * class build when the GLB fails to load — a missing file never
 * leaves the hand empty. Never throws; returns null only when
 * there is nothing to mount at all. R is the three namespace.
 */
export async function loadWeaponGroup(R, spec) {
  const s = spec || {};
  const model = s.model || {};
  if (model.kind === 'glb' && model.src) {
    try {
      const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
        import('three/examples/jsm/loaders/GLTFLoader.js'),
        import('three/examples/jsm/libs/meshopt_decoder.module.js'),
      ]);
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      const gltf = await loader.loadAsync(model.src);
      const group = new THREE.Group();
      group.name = 'weapon-glb:' + model.src;
      const inner = gltf.scene;
      normaliseWeaponGroup(R, inner, { weaponClass: s.weaponClass, src: model.src });
      inner.traverse((o) => {
        if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; }
      });
      group.add(inner);
      return group;
    } catch (e) {
      /* GLB missing or broken: fall through to procedural */
    }
  }
  const build = model.kind === 'procedural' && model.build
    ? model.build
    : proceduralBuildForWeapon({ weaponClass: s.weaponClass });
  try {
    const g = buildProceduralWeapon(R, build);
    normaliseWeaponGroup(R, g, { weaponClass: s.weaponClass });
    return g;
  } catch (e) {
    return null;
  }
}

// ── Visible shot meshes ──────────────────────────────────────────
// One mesh per projectile record (bullet / arrow / blast /
// cannonball) plus the melee swing arc and the muzzle flash.
// All builders are DOM-free except the flash glow texture, which
// falls back to a plain coloured sprite when document is absent
// (node tests), so the whole set is headless-testable.

let glowTextureCache = null;

function glowTexture() {
  if (glowTextureCache) return glowTextureCache;
  if (typeof document === 'undefined') return null;
  try {
    const cv = document.createElement('canvas');
    cv.width = 64;
    cv.height = 64;
    const ctx = cv.getContext('2d');
    if (!ctx) return null;
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(cv);
    glowTextureCache = tex;
    return tex;
  } catch (e) {
    return null;
  }
}

function hexToInt(color) {
  if (typeof color === 'number') return color;
  if (typeof color === 'string' && color.startsWith('#')) {
    const n = parseInt(color.slice(1), 16);
    return Number.isFinite(n) ? n : 0xffffff;
  }
  return 0xffffff;
}

/**
 * The visible mesh for a projectile record from spawnProjectile.
 * Bullet: a glowing tracer slug, long axis along the flight dir.
 * Arrow: shaft + head + fletching, along the flight dir.
 * Blast / cannonball: a glowing orb (cannonballs dark with glow).
 * Returns { group, dispose } — the scene steps record.pos onto
 * group.position each frame.
 */
export function buildProjectileMesh(R, record) {
  const group = new THREE.Group();
  group.name = 'projectile:' + (record ? record.kind : 'blast');
  const color = hexToInt(record ? record.tracerColor : '#ffffff');
  const dir = record && Array.isArray(record.dir) ? record.dir : [0, 0, -1];
  const d = new THREE.Vector3(dir[0], dir[1], dir[2]).normalize();
  const disposables = [];
  const add = (o) => { group.add(o); return o; };
  if (!record || record.kind === 'blast') {
    const orb = add(mesh(new THREE.SphereGeometry(0.12, 10, 8),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, fog: false }), 0, 0, 0));
    disposables.push(orb);
    const tex = glowTexture();
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex || undefined, color, transparent: true, opacity: 0.8, depthWrite: false, fog: false,
    }));
    glow.scale.set(0.9, 0.9, 1);
    add(glow);
    disposables.push(glow);
  } else if (record.kind === 'cannonball') {
    const ball = add(mesh(new THREE.SphereGeometry(0.32, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0x1a1a1a, fog: false }), 0, 0, 0));
    disposables.push(ball);
    const tex = glowTexture();
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex || undefined, color, transparent: true, opacity: 0.7, depthWrite: false, fog: false,
    }));
    glow.scale.set(2.2, 2.2, 1);
    add(glow);
    disposables.push(glow);
  } else if (record.kind === 'arrow') {
    const shaft = add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.7, 6),
      new THREE.MeshBasicMaterial({ color: 0x8a6a3a, fog: false }), 0, 0, 0));
    shaft.rotation.x = Math.PI / 2;
    disposables.push(shaft);
    const head = add(mesh(new THREE.ConeGeometry(0.035, 0.12, 6),
      new THREE.MeshBasicMaterial({ color, fog: false }), 0, 0, 0.4));
    head.rotation.x = Math.PI / 2;
    disposables.push(head);
    const fletch = add(mesh(new THREE.ConeGeometry(0.05, 0.14, 4),
      new THREE.MeshBasicMaterial({ color: 0xf5f0e6, fog: false }), 0, 0, -0.36));
    fletch.rotation.x = -Math.PI / 2;
    disposables.push(fletch);
  } else {
    // bullet: a bright tracer slug + glow, long axis on +Z.
    const slug = add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.55, 6),
      new THREE.MeshBasicMaterial({ color, fog: false }), 0, 0, 0));
    slug.rotation.x = Math.PI / 2;
    disposables.push(slug);
    const tex = glowTexture();
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex || undefined, color, transparent: true, opacity: 0.85, depthWrite: false, fog: false,
    }));
    glow.scale.set(0.7, 0.7, 1);
    add(glow);
    disposables.push(glow);
  }
  // Long-axis meshes are built on +Z; point +Z down the flight dir.
  const zAxis = new THREE.Vector3(0, 0, 1);
  if (Math.abs(d.dot(zAxis)) < 0.999) {
    group.quaternion.setFromUnitVectors(zAxis, d);
  } else if (d.z < 0) {
    group.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
  }
  if (record) group.position.set(record.pos[0], record.pos[1], record.pos[2]);
  return {
    group,
    dispose() {
      for (const o of disposables) disposeGroup(o);
      disposeGroup(group);
    },
  };
}

/**
 * The visible melee swing: a glowing arc sweeping the aim yaw.
 * kind 'thrust' (spear) draws a narrower, faster arc than a
 * 'swing'. Returns { mesh, life } — the scene fades mesh over
 * life seconds, then removes it.
 */
export function buildSwingArc(R, { origin, yaw, kind, color } = {}) {
  const arc = kind === 'thrust' ? 1.1 : 2.2;
  const geo = new THREE.TorusGeometry(1.15, 0.045, 6, 24, arc);
  const mat = new THREE.MeshBasicMaterial({
    color: hexToInt(color || '#ffe9b0'), transparent: true, opacity: 0.9, fog: false,
  });
  const m = new THREE.Mesh(geo, mat);
  m.name = 'swing-arc:' + (kind || 'swing');
  const o = vec3(origin, [0, 1, 0]);
  m.position.set(o[0], o[1], o[2]);
  // Euler XYZ applies Z first, then X: the Z turn centres the arc
  // on the aim (a point at local angle a lands at (cos a, 0, -sin a)
  // once flat, so a = yaw - π/2 points down the aim), then the X
  // turn lays the ring flat on the ground plane.
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = num(yaw, 0) - Math.PI / 2 - arc / 2;
  return {
    mesh: m,
    life: kind === 'thrust' ? 0.18 : 0.25,
    dispose() {
      try { geo.dispose(); } catch (e) { /* noop */ }
      try { mat.dispose(); } catch (e) { /* noop */ }
    },
  };
}

/**
 * A muzzle flash sprite at an origin. Returns { sprite, life }
 * — the scene fades it over life seconds, then removes it.
 */
export function buildMuzzleFlash(R, origin, color) {
  const tex = glowTexture();
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex || undefined, color: hexToInt(color || '#ffb347'),
    transparent: true, opacity: 1, depthWrite: false, fog: false,
  }));
  sprite.name = 'muzzle-flash';
  const o = vec3(origin, [0, 1, 0]);
  sprite.position.set(o[0], o[1], o[2]);
  sprite.scale.set(1.4, 1.4, 1);
  return {
    sprite,
    life: 0.09,
    dispose() {
      try { sprite.material.dispose(); } catch (e) { /* noop */ }
    },
  };
}
