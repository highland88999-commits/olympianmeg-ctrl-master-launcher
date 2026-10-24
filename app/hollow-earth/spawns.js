// OLYMPIAN MONSTERVERSE — monster spawn system (pure + figures).
//
// Monsters are FULL-BODIED by contract: every entry carries a
// footprint collider, a scale, and a model path, and the figure
// builder below makes a complete body (trunk, head, legs, tail)
// in the element's colours. When the Tripo models land, they drop
// into MONSTER_MODELS at the same public paths and the figure
// builder swaps the stand-in for the GLB with no code change —
// the footprint and collider contract does not move.
//
// ATTITUDES (Merlin's words: scary, vicious, fast — varied):
// stalkers circle and close in, chargers burst from range,
// ambushers lie still until the hunter is close, then explode.
// Temperament tags (0..1) ride each type for HUD/voice later.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const ELEMENTS = ['acid', 'fire', 'lightning', 'poison', 'shadow', 'sand'];

export const ATTITUDES = ['stalk', 'charge', 'ambush'];

export const WORLD_SPAWN = { x: 0, z: 95 };
export const SPAWN_CLEAR_R = 30; // no monster spawns near the arrival ground
export const ACTIVATE_R = 110;
export const DEACTIVATE_R = 135;
export const RESPAWN_S = 45;
export const PLAYER_MAX_HP = 100;

/* Twelve types, two per element. HP BAND RULE (Merlin, 2026-10-24):
 * every regular monster sits between 100 and 200 HP — bigger
 * brutes near 200, skirmishers near 100. dmg/speed are the combat
 * contract the page's strike code and the boss gate both read.
 * Every entry also carries ONE primary attack archetype (see
 * ARCHETYPES): ranged, environmental, melee, short-range. */
export const MONSTER_TYPES = {
  'ooze-maw': { element: 'acid', attitude: 'ambush', archetype: 'environmental', hp: 140, dmg: 10, speed: 3.2, scaleM: 2.2, footprintR: 1.6, temperament: { scary: 0.8, vicious: 0.7, fast: 0.3 } },
  'acid-spitter': { element: 'acid', attitude: 'stalk', archetype: 'ranged', hp: 100, dmg: 12, speed: 3.6, scaleM: 1.8, footprintR: 1.2, temperament: { scary: 0.6, vicious: 0.8, fast: 0.5 } },
  'ember-beast': { element: 'fire', attitude: 'charge', archetype: 'melee', hp: 170, dmg: 14, speed: 4.6, scaleM: 2.6, footprintR: 1.8, temperament: { scary: 0.7, vicious: 0.9, fast: 0.7 } },
  'magma-wurm': { element: 'fire', attitude: 'ambush', archetype: 'environmental', hp: 200, dmg: 16, speed: 2.8, scaleM: 3.4, footprintR: 2.2, temperament: { scary: 0.9, vicious: 0.8, fast: 0.2 } },
  'storm-stalker': { element: 'lightning', attitude: 'stalk', archetype: 'short-range', hp: 120, dmg: 13, speed: 5.4, scaleM: 2.0, footprintR: 1.4, temperament: { scary: 0.8, vicious: 0.7, fast: 0.9 } },
  'volt-hound': { element: 'lightning', attitude: 'charge', archetype: 'melee', hp: 110, dmg: 11, speed: 5.8, scaleM: 1.7, footprintR: 1.2, temperament: { scary: 0.5, vicious: 0.8, fast: 1.0 } },
  'mire-lurker': { element: 'poison', attitude: 'ambush', archetype: 'environmental', hp: 130, dmg: 12, speed: 3.0, scaleM: 2.1, footprintR: 1.5, temperament: { scary: 0.9, vicious: 0.6, fast: 0.3 } },
  'spore-beast': { element: 'poison', attitude: 'stalk', archetype: 'ranged', hp: 150, dmg: 9, speed: 3.4, scaleM: 2.4, footprintR: 1.7, temperament: { scary: 0.6, vicious: 0.5, fast: 0.4 } },
  'gloom-reaper': { element: 'shadow', attitude: 'stalk', archetype: 'melee', hp: 190, dmg: 18, speed: 4.2, scaleM: 2.8, footprintR: 1.8, temperament: { scary: 1.0, vicious: 0.9, fast: 0.6 } },
  'smoke-wraith': { element: 'shadow', attitude: 'ambush', archetype: 'short-range', hp: 100, dmg: 15, speed: 5.0, scaleM: 2.0, footprintR: 1.0, temperament: { scary: 1.0, vicious: 0.7, fast: 0.8 } },
  'dune-ripper': { element: 'sand', attitude: 'charge', archetype: 'short-range', hp: 170, dmg: 14, speed: 5.2, scaleM: 2.5, footprintR: 1.7, temperament: { scary: 0.7, vicious: 0.9, fast: 0.8 } },
  'wreck-scavenger': { element: 'sand', attitude: 'stalk', archetype: 'melee', hp: 100, dmg: 8, speed: 4.0, scaleM: 1.5, footprintR: 1.1, temperament: { scary: 0.4, vicious: 0.6, fast: 0.7 } },
  /* DRAGONS — exactly three, spanning flying and ground roles
   * (Merlin, 2026-10-24). All three follow the same realm rules
   * as every other monster: the 100–200 HP band, kill rewards,
   * two-way-hunt senses, element spawn tables. The split:
   *   sky-dragon   — FLY: fights from the air at flyHeight 6,
   *     out of melee reach (strike skips it for short weapons),
   *     ranged breath from above. The fastest thing in the sky.
   *   cinder-dragon — GROUND: a brute on foot, the heaviest
   *     hitter in the realm (200 HP, 20 dmg), charging melee.
   *   muse-dragon  — BOTH: a low hover at flyHeight 3, within
   *     reach of spear AND bolt — it fights from low air and
   *     on the ground, and its hazard is a violet storm-call.
   * THE MUSE DRAGON (tribute entry, documented as such): one
   * of the three is styled after Muse, the assistant —
   * luminous, keen, violet-and-cyan marked (the Olympus light),
   * the clever one of the three. Temperament says it plainly:
   * the wiser/cooler dragon (vicious 0.5, the lowest of the
   * three) while still a realm monster under the same combat
   * rules — it hunts, it hurts, it pays health on kill like
   * any other. Its stand-in carries glow markings and a sleek
   * build so the later Tripo model brief can match it. */
  'sky-dragon': { name: 'Stormwing', element: 'lightning', attitude: 'stalk', archetype: 'ranged', hp: 170, dmg: 16, speed: 6.5, scaleM: 3.2, footprintR: 3.5, role: 'fly', flyHeight: 6, dragon: true, temperament: { scary: 0.9, vicious: 0.7, fast: 1.0 } },
  'cinder-dragon': { name: 'Cinder Maw', element: 'fire', attitude: 'charge', archetype: 'melee', hp: 200, dmg: 20, speed: 3.8, scaleM: 3.6, footprintR: 4.0, role: 'ground', dragon: true, temperament: { scary: 0.9, vicious: 1.0, fast: 0.4 } },
  'muse-dragon': { name: 'Muse, the Luminous', element: 'shadow', attitude: 'stalk', archetype: 'environmental', hp: 150, dmg: 14, speed: 5.2, scaleM: 3.0, footprintR: 3.0, role: 'both', flyHeight: 3, dragon: true, tribute: 'muse', temperament: { scary: 0.6, vicious: 0.5, fast: 0.8 } },
};

export const DRAGON_TYPES = ['sky-dragon', 'cinder-dragon', 'muse-dragon'];

/* ATTACK ARCHETYPES — the range band IS the definition:
 * ranged: projectiles/spit out to 22 m, never closing to contact.
 * environmental: the monster triggers a hazard at the hunter's
 *   feet — acid pool, lightning strike, rockfall, poison cloud,
 *   tied to its element — an area effect with a telegraph; the
 *   page deals the damage if the hunter is still inside it.
 * melee: contact claws/bites at STRIKE_R (2.6 m).
 * short-range: a lunge/breath/sweep out to 5 m — past contact,
 *   short of ranged. Distinct from melee by that band. */
export const ARCHETYPES = {
  ranged: { range: 22, hazard: false },
  environmental: { range: 18, hazard: true, hazardR: 3.5, telegraph: 0.9 },
  melee: { range: 2.6, hazard: false },
  'short-range': { range: 5, hazard: false },
};

export const TYPES_BY_ELEMENT = {};
for (const [key, t] of Object.entries(MONSTER_TYPES)) {
  // Dragons are NOT in the blanket tables — they are rare, and
  // spawn through their own pass in spawnField (3 of each).
  if (t.dragon) continue;
  (TYPES_BY_ELEMENT[t.element] = TYPES_BY_ELEMENT[t.element] || []).push(key);
}

/* THE DROP-IN CONTRACT. Tripo GLBs land at these public paths
 * (full-bodied, rigged). Until then the figure builder below
 * stands in with the same footprint — the swap changes no code
 * and no collider. Korus has his own seat at the bottom. */
export const MONSTER_MODELS = {};
for (const key of Object.keys(MONSTER_TYPES)) {
  MONSTER_MODELS[key] = { url: `/models/hollow-earth/${key}.glb`, height: MONSTER_TYPES[key].scaleM };
}
export const KORUS_MODEL = { url: '/models/hollow-earth/korus.glb', height: 12 };

export const ELEMENT_COLORS = {
  acid: 0x8fd43a, fire: 0xff6a22, lightning: 0xffe14d,
  poison: 0xc06ae0, shadow: 0x8a8a9a, sand: 0xe8c87a,
};

/* ---------------- THE SAFE BASE (Merlin, 2026-10-24) ----------------
 * The Haven: a sanctuary zone where the hunter CANNOT die. No
 * monster spawns inside it, no monster damage lands inside it,
 * and any chase breaks at its boundary. This is where hunters
 * go to log off or take a break. Logging off anywhere in the
 * realm returns the hunter HERE on next entry (the realm's
 * return point, persisted by data.js). Dying in the realm also
 * respawns here — JUDGMENT CALL, stated plainly: the base is
 * the realm's one safe point, so death returns the hunter to
 * it with full HP, kills and shield kept (death costs progress
 * nowhere; the realm is hard enough without a death tax).
 * SPAWN-TO-BASE: a teleport back here at any time, even
 * mid-danger, no cost, with a 10 s anti-spam cooldown
 * (judgment call — short enough to never trap a retreat, long
 * enough that teleport-dodging can't be spammed). */
export const SAFE_BASE = { x: 0, z: 155, r: 28, name: 'The Haven' };
export const BASE_TELEPORT_COOLDOWN_S = 10;

export function isInBase(x, z) {
  return Math.hypot(x - SAFE_BASE.x, z - SAFE_BASE.z) <= SAFE_BASE.r;
}

export function canTeleport(lastTeleportMs, nowMs) {
  if (lastTeleportMs == null) return true;
  return nowMs - lastTeleportMs >= BASE_TELEPORT_COOLDOWN_S * 1000;
}

/* The monster element at a point follows the biome field. The
 * caller passes a biomeAt-style reader so this module stays pure
 * and the zone's field is the single source of truth. */
export function spawnField(seed, opts = {}) {
  const rng = mulberry32(seed);
  const count = opts.count || 150;
  const radius = opts.radius || 280;
  const elementAt = opts.elementAt || (() => ELEMENTS[(rng() * ELEMENTS.length) | 0]);
  const records = [];
  let guard = 0;
  while (records.length < count && guard++ < count * 40) {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * radius;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (Math.hypot(x - WORLD_SPAWN.x, z - WORLD_SPAWN.z) < SPAWN_CLEAR_R) continue;
    // The Haven is sanctuary: nothing spawns inside it, or near it.
    if (Math.hypot(x - SAFE_BASE.x, z - SAFE_BASE.z) < SAFE_BASE.r + 10) continue;
    const element = elementAt(x, z);
    const types = TYPES_BY_ELEMENT[element] || TYPES_BY_ELEMENT.sand;
    const type = types[(rng() * types.length) | 0];
    records.push({ id: `m-${records.length}`, type, element, x, z });
  }
  // DRAGON PASS — rare by design: exactly 3 of each dragon,
  // each placed where its element holds the field (sampled
  // until the element matches, same exclusions as above).
  for (const dtype of DRAGON_TYPES) {
    const element = MONSTER_TYPES[dtype].element;
    let placed = 0;
    let guard2 = 0;
    while (placed < 3 && guard2++ < 400) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * radius;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (Math.hypot(x - WORLD_SPAWN.x, z - WORLD_SPAWN.z) < SPAWN_CLEAR_R) continue;
      if (Math.hypot(x - SAFE_BASE.x, z - SAFE_BASE.z) < SAFE_BASE.r + 10) continue;
      if (elementAt(x, z) !== element) continue;
      records.push({ id: `m-${records.length}`, type: dtype, element, x, z });
      placed++;
    }
  }
  return records;
}

export function createMonster(record, rng) {
  const stats = MONSTER_TYPES[record.type];
  const rand = rng || Math.random;
  return {
    ...record,
    stats,
    hp: stats.hp,
    state: stats.attitude === 'ambush' ? 'ambush' : 'idle',
    yaw: 0,
    faceYaw: rand() * Math.PI * 2, // the direction it watches
    spotted: false, // two-way hunt: unspotted monsters do not aggro
    unseenT: 0,
    target: null,
    attackCd: 0,
    hazardCd: 0,
    chargeT: 0,
    dead: false,
    active: false,
  };
}

const SIGHT_R = 26;
const SIGHT_HALF_ANGLE = 0.96; // ±55° cone, ME hunt convention
const SIGHT_COS = 0.5736;
const AMBUSH_R = 10;
const PROXIMITY_R = 8; // spotted regardless of facing or cover
const HEARING_R = 30; // loud actions draw nearby monsters
export const GIVE_UP_S = 12; // JUDGMENT CALL: 12 s unseen and the
// monster gives up the chase and returns to its roam — long enough
// to break line of sight around a rock, short enough that a lost
// trail actually goes cold.

/* SENSES (two-way hunt, ME hunt.js pattern adapted): monsters do
 * NOT aggro blindly. A monster hunts the player once it SPOTS
 * them — sight cone (range + angle, blocked by terrain
 * line-of-sight via opts.losClear), hearing (a loud action at
 * opts.noise draws monsters within HEARING_R), or close
 * proximity. Ambushers are the exception: they ignore sight and
 * hearing and wait in their biome's hazards until the hunter
 * closes to AMBUSH_R (or hurts them). On spotting, the monster
 * chases and attacks with its archetype. Lose sight for
 * GIVE_UP_S and it returns to its roam. Chases break at the
 * safe-base boundary (opts.inBase): the hunter inside The Haven
 * is untouchable — hunting monsters drop the chase outright.
 * opts.quiet (the hunter's quiet factor, 1 = normal) scales the
 * sight and hearing radii down for quiet hunters. */
export function stepMonster(m, dt, player, rng, opts = {}) {
  if (m.dead) return [];
  const events = [];
  m.attackCd = Math.max(0, m.attackCd - dt);
  m.hazardCd = Math.max(0, (m.hazardCd || 0) - dt);
  const quiet = opts.quiet != null ? opts.quiet : 1;
  const sightR = SIGHT_R * quiet;
  const hearR = HEARING_R * quiet;
  const losClear = opts.losClear || (() => true);

  const dx = player.x - m.x;
  const dz = player.z - m.z;
  const dist = Math.hypot(dx, dz) || 0.001;

  // Sanctuary break: inside The Haven the hunt ends, outright.
  if (opts.inBase) {
    if (m.spotted) { m.spotted = false; m.state = 'idle'; m.target = null; }
    return events;
  }

  // --- spotting (uses the facing BEFORE this tick's movement) ---
  const isAmbusher = m.stats.attitude === 'ambush';
  if (!m.spotted) {
    let seen = false;
    let via = null;
    if (dist <= PROXIMITY_R) { seen = true; via = 'proximity'; }
    else if (!isAmbusher && dist <= sightR) {
      const toPlayer = Math.atan2(dx, dz);
      let da = toPlayer - m.faceYaw;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      if (Math.abs(da) <= SIGHT_HALF_ANGLE && losClear(m.x, m.z, player.x, player.z)) {
        seen = true; via = 'sight';
      }
    }
    if (!seen && !isAmbusher && opts.noise) {
      const nd = Math.hypot(opts.noise.x - m.x, opts.noise.z - m.z);
      if (nd <= hearR) { seen = true; via = 'hearing'; }
    }
    if (seen) {
      m.spotted = true;
      m.unseenT = 0;
      m.target = via === 'hearing' && opts.noise ? { x: opts.noise.x, z: opts.noise.z } : { x: player.x, z: player.z };
      if (m.state === 'idle') m.state = 'stalk';
      if (via === 'sight' || via === 'proximity') events.push({ kind: 'spotted', from: m.id, via });
    }
  } else {
    // --- tracking: sight refreshes the trail, else it goes cold ---
    let seen = false;
    if (dist <= PROXIMITY_R) seen = true;
    else if (dist <= sightR) {
      const toPlayer = Math.atan2(dx, dz);
      let da = toPlayer - m.faceYaw;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      if (Math.abs(da) <= SIGHT_HALF_ANGLE && losClear(m.x, m.z, player.x, player.z)) seen = true;
    }
    if (seen) {
      m.unseenT = 0;
      m.target = { x: player.x, z: player.z };
    } else {
      m.unseenT = (m.unseenT || 0) + dt;
      if (m.unseenT >= GIVE_UP_S) {
        m.spotted = false;
        m.state = 'idle';
        m.target = null;
        return events;
      }
    }
  }

  if (!m.spotted) {
    // Roam drift: a slow wander so the field feels alive.
    if (rng) {
      m.x += Math.sin(rng() * Math.PI * 2) * 0.4 * dt;
      m.z += Math.cos(rng() * Math.PI * 2) * 0.4 * dt;
    }
    return events;
  }

  // --- hunt movement toward the target (player or last known) ---
  const tx = (m.target || player).x;
  const tz = (m.target || player).z;
  const tdx = tx - m.x;
  const tdz = tz - m.z;
  const tdist = Math.hypot(tdx, tdz) || 0.001;
  const nx = tdx / tdist;
  const nz = tdz / tdist;
  m.faceYaw = Math.atan2(nx, nz);
  const speed = m.stats.speed;
  const arch = ARCHETYPES[m.stats.archetype] || ARCHETYPES.melee;
  if (m.stats.archetype === 'ranged') {
    if (dist < 10) { m.x -= nx * speed * 0.6 * dt; m.z -= nz * speed * 0.6 * dt; }
  } else if (m.state === 'charge' || (m.stats.attitude === 'charge' && dist < 14)) {
    m.state = 'charge';
    m.chargeT = Math.max(0, (m.chargeT || 0) - dt);
    m.x += nx * speed * 1.7 * dt;
    m.z += nz * speed * 1.7 * dt;
  } else {
    m.x += nx * speed * dt;
    m.z += nz * speed * dt;
  }

  // --- archetype attacks (only while hunting, in band) ---
  if (m.attackCd <= 0) {
    if (arch.hazard) {
      if (dist <= arch.range && m.hazardCd <= 0) {
        m.attackCd = 1.6;
        m.hazardCd = 3.5;
        events.push({
          kind: 'hazard', element: m.element, from: m.id,
          x: player.x, z: player.z, radius: arch.hazardR,
          dmg: m.stats.dmg, telegraph: arch.telegraph,
        });
      }
    } else if (dist <= arch.range + m.stats.footprintR) {
      m.attackCd = 1.1;
      events.push({ kind: 'hit', dmg: m.stats.dmg, from: m.id, archetype: m.stats.archetype });
    }
  }
  return events;
}

export function damageMonster(m, dmg) {
  if (m.dead) return false;
  m.hp -= dmg;
  if (m.hp <= 0) { m.hp = 0; m.dead = true; m.state = 'dead'; m.spotted = false; return true; }
  // Pain wakes an ambusher — and spots the hunter for any monster.
  m.spotted = true;
  m.unseenT = 0;
  if (m.state === 'ambush') { m.state = 'charge'; m.chargeT = 0.8; }
  return false;
}

/* ---------------- hunter rewards (Merlin, 2026-10-24) ----------------
 * KILL REWARD — every monster killed in this realm grants BONUS
 * HEALTH: a heal on kill. JUDGMENT CALL, stated plainly: +12 HP
 * per kill, capped at max HP. At 100 max HP that is 12% a kill —
 * enough to feel rewarding across a hunt, small enough that a
 * 14–18 dmg hit still hurts and kills never trivialise the realm.
 * 30-KILL SHIELD — at 30 realm kills (and at every further
 * 30-kill milestone while no shield is active) the hunter gains
 * a SHIELD that absorbs 50 damage. It is one-time until broken:
 * it does not refresh on its own, and a broken shield stays
 * broken until the next 30-kill milestone grants a fresh one.
 * The realm's progress record carries { kills, shield } — data.js
 * persists them, and the page feeds them through here. */
export const HEAL_ON_KILL = 12;
export const SHIELD_KILLS = 30;
export const SHIELD_ABSORB = 50;

export function createHunterState() {
  return { hp: PLAYER_MAX_HP, shield: 0, kills: 0 };
}

/* Call on every monster kill. Returns what the HUD should show. */
export function onMonsterKilled(hunter) {
  hunter.kills += 1;
  const missing = PLAYER_MAX_HP - hunter.hp;
  const heal = Math.max(0, Math.min(HEAL_ON_KILL, missing));
  hunter.hp += heal;
  let shieldGranted = false;
  if (hunter.kills % SHIELD_KILLS === 0 && hunter.shield <= 0) {
    hunter.shield = SHIELD_ABSORB;
    shieldGranted = true;
  }
  return { heal, shieldGranted, kills: hunter.kills, shield: hunter.shield };
}

/* Damage routing: the shield absorbs first, the rest hits HP. */
export function applyDamage(hunter, dmg) {
  const absorbed = Math.min(hunter.shield, dmg);
  hunter.shield -= absorbed;
  const hpLost = dmg - absorbed;
  hunter.hp = Math.max(0, hunter.hp - hpLost);
  return { absorbed, hpLost, shieldBroken: absorbed > 0 && hunter.shield === 0, hp: hunter.hp };
}

/* Hunter weapons. Blade is the close arc, bolt the ranged line —
 * the page maps these to the backpack reticle law (dot / crosshair). */
export const WEAPONS = {
  blade: { dmg: 36, range: 2.4, arcCos: Math.cos(1.22), cooldown: 0.45 },
  bolt: { dmg: 28, range: 30, arcCos: Math.cos(0.21), cooldown: 0.8 },
};

export function strike(monsters, px, pz, yaw, spec) {
  const hits = [];
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  for (const m of monsters) {
    if (m.dead || !m.active) continue;
    const dx = m.x - px;
    const dz = m.z - pz;
    const dist = Math.hypot(dx, dz);
    if (dist > spec.range + m.stats.footprintR) continue;
    // Flight ceiling: a dragon flying above the weapon's reach
    // (range + footprint) cannot be struck by it — the sky
    // dragon at 6 m is bolt-only; the low-hovering Muse dragon
    // at 3 m is within spear reach too.
    if (m.stats.flyHeight && m.stats.flyHeight > spec.range + m.stats.footprintR) continue;
    const cos = dist > 0.001 ? (dx * fx + dz * fz) / dist : 1;
    if (cos < spec.arcCos) continue;
    hits.push(m);
  }
  return hits;
}

/* ---------------- KORUS, the ultimate boss ----------------
 * A colossal shadow/lightning boss on his throne in the Shadow
 * Smoke Wastes. Dormant and untargetable until the campaign gate
 * opens — the Saruman pattern, retuned for a wider field.
 * GATE JUDGMENT CALL (documented, not Merlin's number): 40
 * campaign monster kills. Saruman's gate was 30 across ~170
 * orcs; the Monsterverse field holds ~150 monsters across a
 * bigger disc, so the road to Korus runs a little longer — an
 * evening's hunt, not a week's. One constant to tune. */
export const KORUS_POS = { x: -215, z: 55 };
export const KORUS_MAX_HP = 1000; // Merlin's number, exactly
export const KORUS_WAKE_DIST = 30;
export const KORUS_GATE_KILLS = 40;
export const KORUS_BLAST = { shadowDmg: 26, shadowR: 4, boltDmg: 18, boltR: 6, telegraph: 1.2 };

export function korusPhase(hp) {
  if (hp > KORUS_MAX_HP * 0.66) return 1;
  if (hp > KORUS_MAX_HP * 0.33) return 2;
  return 3;
}

export function createKorus(gateOpen) {
  return {
    x: KORUS_POS.x, z: KORUS_POS.z,
    hp: KORUS_MAX_HP, gateOpen: !!gateOpen,
    dormant: !gateOpen, awake: false,
    telegraph: 0, telegraphedAt: null, attackCd: 0,
    dead: false,
  };
}

export function stepKorus(k, dt, player) {
  if (k.dead || k.dormant) return [];
  const events = [];
  const dist = Math.hypot(player.x - k.x, player.z - k.z);
  if (!k.awake) {
    if (dist < KORUS_WAKE_DIST) { k.awake = true; events.push({ kind: 'wake' }); }
    return events;
  }
  k.attackCd = Math.max(0, k.attackCd - dt);
  const phase = korusPhase(k.hp);
  if (k.telegraph > 0) {
    k.telegraph = Math.max(0, k.telegraph - dt);
    if (k.telegraph === 0 && k.telegraphedAt) {
      const at = k.telegraphedAt;
      k.telegraphedAt = null;
      const d = Math.hypot(player.x - at.x, player.z - at.z);
      if (d <= KORUS_BLAST.shadowR) events.push({ kind: 'hit', dmg: KORUS_BLAST.shadowDmg, from: 'korus-shadow' });
      if (d <= KORUS_BLAST.boltR) events.push({ kind: 'hit', dmg: KORUS_BLAST.boltDmg, from: 'korus-bolt' });
    }
    return events;
  }
  const castS = phase === 1 ? 3.2 : phase === 2 ? 2.4 : 1.8;
  if (k.attackCd <= 0) {
    k.attackCd = castS;
    k.telegraph = KORUS_BLAST.telegraph;
    k.telegraphedAt = { x: player.x, z: player.z };
    events.push({ kind: 'telegraph', phase });
  }
  return events;
}

export function damageKorus(k, dmg) {
  if (k.dead || k.dormant) return false;
  k.hp -= dmg;
  if (k.hp <= 0) { k.hp = 0; k.dead = true; return true; }
  return false;
}

/* ---------------- figures (procedural stand-ins) ----------------
 * Full-bodied by construction: trunk, head, four legs, tail, eyes
 * in the element colour. userData carries the footprint and the
 * model path the Tripo GLB will occupy — the swap is one loader
 * call, and the collider never moves. */
export function buildMonsterFigure(R, monster) {
  const s = monster.stats.scaleM;
  const color = ELEMENT_COLORS[monster.element] || 0x888888;
  const g = new R.Group();
  const M = (geo, m, x, y, z) => {
    const o = new R.Mesh(geo, new R.MeshStandardMaterial(m));
    o.position.set(x, y, z);
    g.add(o);
    return o;
  };
  if (monster.stats.dragon) {
    // DRAGON STAND-IN — winged quadruped, full-bodied: trunk,
    // long neck, horned head, four legs, tail, spread wings.
    // The Muse dragon is the sleek one: slimmer trunk, swept
    // wings, violet body with CYAN glow markings (the Olympus
    // light) — the Tripo brief is: match this, luminous, keen.
    const isMuse = monster.type === 'muse-dragon';
    const bodyColor = isMuse ? 0x6a4ac8 : color;
    const glow = isMuse ? 0x22d8e8 : 0xffe14d;
    const body = M(new R.SphereGeometry(1, 12, 10), { color: bodyColor, roughness: 0.8 }, 0, 1.4 * s, 0);
    body.scale.set(1.0, 0.9, 1.7);
    const neck = M(new R.CylinderGeometry(0.3, 0.45, 1.6 * s, 8), { color: bodyColor, roughness: 0.8 }, 0, 2.4 * s, 1.2 * s);
    neck.rotation.x = 0.5;
    M(new R.SphereGeometry(0.6, 10, 8), { color: bodyColor, roughness: 0.8 }, 0, 3.1 * s, 1.8 * s);
    M(new R.ConeGeometry(0.12, 0.5, 6), { color: 0xe8e8e8 }, -0.25, 3.5 * s, 1.8 * s);
    M(new R.ConeGeometry(0.12, 0.5, 6), { color: 0xe8e8e8 }, 0.25, 3.5 * s, 1.8 * s);
    M(new R.SphereGeometry(0.14, 8, 6), { color: glow, emissive: glow, emissiveIntensity: 1.4 }, -0.24, 3.2 * s, 2.3 * s);
    M(new R.SphereGeometry(0.14, 8, 6), { color: glow, emissive: glow, emissiveIntensity: 1.4 }, 0.24, 3.2 * s, 2.3 * s);
    for (const [lx, lz] of [[-0.6, 0.8], [0.6, 0.8], [-0.6, -0.8], [0.6, -0.8]]) {
      M(new R.CylinderGeometry(0.18, 0.14, 1.4 * s, 6), { color: bodyColor, roughness: 0.9 }, lx * s, 0.7 * s, lz * s);
    }
    const tail = M(new R.ConeGeometry(0.25, 2.2 * s, 6), { color: bodyColor, roughness: 0.9 }, 0, 1.5 * s, -2.1 * s);
    tail.rotation.x = -1.2;
    // Spread wings — swept back on the Muse dragon, broad else.
    const wingSpan = isMuse ? 2.2 : 2.8;
    const wingSweep = isMuse ? -0.5 : 0;
    for (const side of [-1, 1]) {
      const wing = M(new R.BoxGeometry(wingSpan * s, 0.08, 1.2 * s), { color: bodyColor, roughness: 0.85 }, side * 1.4 * s, 2.2 * s, 0.2 * s);
      wing.rotation.z = side * 0.25;
      wing.rotation.y = side * wingSweep;
    }
    if (isMuse) {
      // Cyan glow markings along the spine — the tribute tell.
      for (let i = 0; i < 4; i++) {
        M(new R.SphereGeometry(0.12, 8, 6), { color: glow, emissive: glow, emissiveIntensity: 1.6 }, 0, (1.9 + i * 0.35) * s, (0.6 - i * 0.45) * s);
      }
    }
    g.userData.monsterId = monster.id;
    g.userData.footprintR = monster.stats.footprintR;
    g.userData.modelPath = (MONSTER_MODELS[monster.type] || {}).url || null;
    g.userData.standIn = true;
    g.userData.dragon = true;
    g.userData.flyHeight = monster.stats.flyHeight || 0;
    return g;
  }
  const body = M(new R.SphereGeometry(1, 12, 10), { color, roughness: 0.85 }, 0, 1.1 * s, 0);
  body.scale.set(1.25, 0.95, 1.6);
  M(new R.SphereGeometry(0.55, 10, 8), { color, roughness: 0.85 }, 0, 1.7 * s, 1.15 * s);
  M(new R.SphereGeometry(0.12, 8, 6), { color: 0xffe14d, emissive: 0xcc9900, emissiveIntensity: 1 }, -0.22, 1.85 * s, 1.6 * s);
  M(new R.SphereGeometry(0.12, 8, 6), { color: 0xffe14d, emissive: 0xcc9900, emissiveIntensity: 1 }, 0.22, 1.85 * s, 1.6 * s);
  for (const [lx, lz] of [[-0.55, 0.7], [0.55, 0.7], [-0.55, -0.7], [0.55, -0.7]]) {
    M(new R.CylinderGeometry(0.16, 0.13, 1.1 * s, 6), { color, roughness: 0.9 }, lx * s, 0.55 * s, lz * s);
  }
  const tail = M(new R.ConeGeometry(0.22, 1.6 * s, 6), { color, roughness: 0.9 }, 0, 1.2 * s, -1.7 * s);
  tail.rotation.x = -1.1;
  g.userData.monsterId = monster.id;
  g.userData.footprintR = monster.stats.footprintR;
  g.userData.modelPath = (MONSTER_MODELS[monster.type] || {}).url || null;
  g.userData.standIn = true;
  return g;
}

export function buildKorusFigure(R) {
  const g = new R.Group();
  const M = (geo, m, x, y, z) => {
    const o = new R.Mesh(geo, new R.MeshStandardMaterial(m));
    o.position.set(x, y, z);
    g.add(o);
    return o;
  };
  M(new R.CylinderGeometry(1.4, 2.2, 7, 8), { color: 0x242428, roughness: 0.9 }, 0, 3.5, 0);
  M(new R.SphereGeometry(1.6, 12, 10), { color: 0x1c1c20, roughness: 0.85 }, 0, 8.2, 0);
  M(new R.SphereGeometry(0.3, 8, 6), { color: 0xffe14d, emissive: 0xffe14d, emissiveIntensity: 2 }, -0.6, 8.5, 1.3);
  M(new R.SphereGeometry(0.3, 8, 6), { color: 0xffe14d, emissive: 0xffe14d, emissiveIntensity: 2 }, 0.6, 8.5, 1.3);
  for (const [lx, lz] of [[-1.1, 0.6], [1.1, 0.6], [-1.1, -0.6], [1.1, -0.6]]) {
    M(new R.CylinderGeometry(0.5, 0.4, 3.4, 6), { color: 0x1c1c20, roughness: 0.9 }, lx, 1.7, lz);
  }
  M(new R.CylinderGeometry(0.14, 0.14, 9, 5), { color: 0xffe14d, emissive: 0xffe14d, emissiveIntensity: 1.6 }, -2.6, 6, 0.5);
  M(new R.CylinderGeometry(0.14, 0.14, 9, 5), { color: 0x8a8a9a, emissive: 0x666670, emissiveIntensity: 1 }, 2.6, 6, 0.5);
  g.userData.bossId = 'korus';
  g.userData.footprintR = 3;
  g.userData.modelPath = KORUS_MODEL.url;
  g.userData.standIn = true;
  return g;
}
