/*
 * MIDDLE-EARTH — THE HUNT: orc war-bands, combat, loot.
 *
 * Merlin's campaign spine: "objective is hunt orcs". Every pod
 * carries seeded orc war-bands (data.js def.orcs). This module is
 * split the house way — a PURE core (band generation, the orc AI
 * state machine, blade/bow resolution, loot rolls) that node tests
 * exercise directly, and a thin scene layer (procedural orc figure
 * with a GLB slot) that renders what the core decides.
 *
 * THE ORC MODELS: two rigged foundry files land later —
 * 'orc warrior' and 'orc captain' (the staged 'fantasy orc' file,
 * tentatively the captain/brute). ORC_MODELS below is the single
 * registry; until a file arrives the procedural brute IS the orc,
 * and when it does the GLB swaps over it with no code change.
 * Combat never waits on a model: an orc is its state, not its mesh.
 *
 * Combat idiom (house): tap/click with a blade in hand = a swing
 * (arc check, ~2.2 m); tap at range with a bow = a shot down the
 * CHEVRON the backpack law assigns bows (RETICLE_BY_CLASS.bow —
 * imported, never forked; campaign.js/page.jsx read it from the
 * same source).
 */

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

import { ORC_WINDUP_S, ORC_ARM_REST, orcLimbAngles } from './figure-motion.js';

/* ---------------- numbers (the hunt's tuning) ---------------- */

export const PLAYER_MAX_HP = 100;
export const BLADE = { dmg: 34, range: 2.2, arcCos: Math.cos(1.22), cooldown: 0.45 }; // ±70°
export const BOW = { dmg: 26, range: 30, arcCos: Math.cos(0.21), cooldown: 0.8 }; // ±12°

export const ORC_KINDS = {
  warrior: { hp: 60, dmg: 8, speed: 3.4, scale: 1, height: 1.75, swingRange: 2.0, alertR: 16, sightR: 26, swingCooldown: 1.1 },
  captain: { hp: 150, dmg: 14, speed: 3.1, scale: 1.22, height: 2.05, swingRange: 2.2, alertR: 20, sightR: 34, swingCooldown: 1.3 },
};

/* Blanket-coverage streaming laws (Merlin, 2026-10-24: "all over
 * the map"). Records are cheap data; only orcs inside the working
 * radius get a state + a figure. A dead record refills only once
 * the player has left the immediate area, so nothing pops in
 * underfoot. */
export const ACTIVATE_R = 110;
export const DEACTIVATE_R = 135;
export const RESPAWN_MIN_DIST = 65;
export const SPAWN_SAFE_R = 30; // around the pod spawn point (0, 95)
export const POD_SPAWN = { x: 0, z: 95 };

/* Weapons an orc may drop — modest forge-spirit blades and bows.
 * campaign.js turns these into backpack items, which stamps the
 * reticle by class through the backpack law (blade -> dot,
 * bow -> chevron, spear -> chevron). */
export const ORC_LOOT_WEAPONS = [
  { id: 'orc-cleaver', name: 'Orcish Cleaver', class: 'blade' },
  { id: 'gondorian-shortbow', name: 'Gondorian Shortbow', class: 'bow' },
  { id: 'rohirric-spear', name: 'Rohirric Spear', class: 'spear' },
  { id: 'crude-mace', name: 'Crude Iron Mace', class: 'blunt' },
];

/* ---------------- band generation (LEGACY) ----------------
 * Superseded by spawnField (the blanket field) as the zone's
 * source since 2026-10-24; kept exported for compatibility. */
export function generateBands(seed, cfg, tryPlace) {
  const c = cfg || {};
  const bands = Math.max(0, c.bands | 0);
  const lo = Array.isArray(c.perBand) ? (c.perBand[0] | 0) : 3;
  const hi = Array.isArray(c.perBand) ? (c.perBand[1] | 0) : lo;
  const captainChance = c.captainChance != null ? c.captainChance : 0.25;
  const rng = mulberry32((seed >>> 0) ^ 0x0ac5 ^ 0x9e37);
  const out = [];
  for (let b = 0; b < bands; b++) {
    let cx = 0, cz = 0, placed = false;
    for (let tries = 0; tries < 18 && !placed; tries++) {
      const a = rng() * Math.PI * 2;
      const r = 40 + rng() * 210;
      cx = Math.cos(a) * r; cz = Math.sin(a) * r;
      placed = tryPlace(cx, cz);
    }
    if (!placed) continue;
    const n = lo + Math.floor(rng() * (Math.max(hi - lo, 0) + 1));
    const members = [];
    const hasCaptain = captainChance > 0 && rng() < captainChance;
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2;
      const rr = 2 + rng() * 7;
      members.push({
        kind: i === 0 && hasCaptain ? 'captain' : 'warrior',
        x: cx + Math.cos(a) * rr,
        z: cz + Math.sin(a) * rr,
      });
    }
    out.push({ cx, cz, members });
  }
  return out;
}

/* ---------------- blanket spawn field (2026-10-24) ----------------
 * Merlin: "I want more orc spawns. Like all over the map."
 * generateBands (above) placed a few bands near the middle; the
 * field below replaces it as the zone's source: CAMPS distributed
 * across the WHOLE disc (uniform radius, full circle — not near
 * landmarks or beats) plus ROVERS, lone wanderers with a wide
 * home radius that read as war-bands on the move. tryPlace is the
 * zone's clearance predicate; it must ALSO keep records out of
 * the spawn-safe radius (the zone's tryPlace does). A record that
 * cannot place after its tries is skipped — counts are ceilings.
 * cfg: { camps, campSize: [lo, hi], rovers, captainChance,
 *        respawnS } — per-pod character lives in data.js. */
export function spawnField(seed, cfg, tryPlace) {
  const c = cfg || {};
  const rng = mulberry32((seed >>> 0) ^ 0xf13d ^ 0x9e37);
  const records = [];
  const lo = Array.isArray(c.campSize) ? (c.campSize[0] | 0) : 3;
  const hi = Array.isArray(c.campSize) ? (c.campSize[1] | 0) : lo;
  const captainChance = c.captainChance != null ? c.captainChance : 0.3;
  const place = (x, z) => {
    if (Math.hypot(x - POD_SPAWN.x, z - POD_SPAWN.z) < SPAWN_SAFE_R) return false;
    return tryPlace(x, z);
  };
  let id = 0;
  const camps = Math.max(0, c.camps | 0);
  for (let ci = 0; ci < camps; ci++) {
    let cx = 0, cz = 0, placed = false;
    for (let tries = 0; tries < 24 && !placed; tries++) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * 285; // uniform over the disc
      cx = Math.cos(a) * r; cz = Math.sin(a) * r;
      placed = place(cx, cz);
    }
    if (!placed) continue;
    const n = lo + Math.floor(rng() * (Math.max(hi - lo, 0) + 1));
    const hasCaptain = captainChance > 0 && rng() < captainChance;
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2;
      const rr = 2 + rng() * 7;
      records.push({
        id: id++, x: cx + Math.cos(a) * rr, z: cz + Math.sin(a) * rr,
        kind: i === 0 && hasCaptain ? 'captain' : 'warrior',
        campId: ci, rove: false,
      });
    }
  }
  const rovers = Math.max(0, c.rovers | 0);
  for (let ri = 0; ri < rovers; ri++) {
    let rx = 0, rz = 0, placed = false;
    for (let tries = 0; tries < 24 && !placed; tries++) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * 285;
      rx = Math.cos(a) * r; rz = Math.sin(a) * r;
      placed = place(rx, rz);
    }
    if (!placed) continue;
    records.push({
      id: id++, x: rx, z: rz,
      kind: rng() < Math.min(0.25, captainChance) ? 'captain' : 'warrior',
      campId: -1, rove: true,
    });
  }
  return records;
}

export function createOrc(spec, bandId) {
  const stats = ORC_KINDS[spec.kind] || ORC_KINDS.warrior;
  return {
    kind: spec.kind === 'captain' ? 'captain' : 'warrior',
    bandId: bandId != null ? bandId : -1,
    recordId: spec.id != null ? spec.id : -1,
    x: spec.x, z: spec.z,
    home: { x: spec.x, z: spec.z },
    homeRadius: spec.rove ? 70 : 9, // rovers roam wide; camps hold ground
    rove: !!spec.rove,
    yaw: Math.atan2(spec.x, spec.z),
    hp: stats.hp, maxHp: stats.hp,
    state: 'idle', // idle | chase | dead
    swingT: 0, windupT: 0, wanderT: Math.random() * 2, wanderYaw: 0,
    deathT: 0, flashT: 0,
    task: null, // hunting-party task: { type:'seek', x, z, phase, t, partyId }
    stats,
  };
}

/* A captain's shout: when one orc of a band is alerted (struck or
 * sights the player), its bandmates inside earshot join the hunt. */
export function alertBand(orcs, source) {
  for (const o of orcs) {
    if (o === source || o.state === 'dead') continue;
    if (o.bandId !== source.bandId) continue;
    const d = Math.hypot(o.x - source.x, o.z - source.z);
    if (d <= 18 && o.state === 'idle') o.state = 'chase';
  }
}

/* Hearing (two-way hunt): a loud act at (x, z) — a bow/staff
 * shot, a kill — turns every live orc inside `radius` toward the
 * noise. One that can plausibly SEE the noisemaker (inside
 * sightR x 1.2 with a clear line) joins the chase outright.
 * senses.losClear(ox, oz, tx, tz) is the zone's terrain check. */
export function hearNoise(orcs, x, z, radius, senses) {
  let joined = 0;
  for (const o of orcs) {
    if (o.state === 'dead') continue;
    const dx = x - o.x, dz = z - o.z;
    const d = Math.hypot(dx, dz);
    if (d > radius) continue;
    o.yaw = Math.atan2(dx, dz);
    if (o.state === 'idle' && d <= o.stats.sightR * 1.2
      && (!senses || !senses.losClear || senses.losClear(o.x, o.z, x, z))) {
      o.state = 'chase';
      joined++;
    }
  }
  return joined;
}

/* Alarm: a kill near other orcs raises one — every live orc
 * inside `radius` of the kill (any band) turns and chases. */
export function raiseAlarm(orcs, x, z, radius) {
  let joined = 0;
  for (const o of orcs) {
    if (o.state === 'dead' || o.state === 'chase') continue;
    if (Math.hypot(o.x - x, o.z - z) <= radius) { o.state = 'chase'; joined++; }
  }
  return joined;
}

/**
 * Advance one orc. player = { x, z, alive, quiet? } — quiet scales
 * the orc's alert radius (a quiet hero is harder to notice).
 * senses = { losClear(ox, oz, tx, tz) } — the zone's terrain
 * line-of-sight check (distance + terrain-clearance approximation).
 * Returns events: [{ type: 'hitPlayer', dmg }] | [{ type: 'sighted' }].
 * Dead orcs tick their deathT (the scene layer fades them).
 *
 * Senses (two-way hunt): an idle orc SIGHTS the player inside
 * sightR, inside a ±60° cone of its facing, with a clear line —
 * it alerts (event) and chases. A hunting-party TASK (seek/search)
 * steers it toward a last-known position instead of its home
 * shuffle; spotting the player mid-task drops the task for a
 * real chase, and a cold trail drops the task for home.
 */
export function stepOrc(orc, dt, player, rng, senses) {
  const events = [];
  if (orc.state === 'dead') { orc.deathT += dt; return events; }
  const dx = player.x - orc.x, dz = player.z - orc.z;
  const dist = Math.hypot(dx, dz);
  if (orc.flashT > 0) orc.flashT -= dt;
  if (orc.swingT > 0) orc.swingT -= dt;
  // A wind-up only lives while the orc is still chasing, the player is
  // still alive, and the player is still in reach — step out of range
  // mid-wind-up and the blow is cancelled, not banked.
  if (orc.windupT > 0 && !(orc.state === 'chase' && player.alive
    && dist <= orc.stats.swingRange)) {
    orc.windupT = 0;
  }
  const quiet = player.quiet != null ? player.quiet : 1;
  const alertR = orc.stats.alertR * quiet;

  /* hunting-party task: march to the last-known point, search it,
   * then give up and drift home. */
  if (orc.task && orc.task.type === 'seek') {
    if (player.alive && dist <= alertR) {
      orc.task = null;
      orc.state = 'chase';
    } else if (orc.task.phase === 'go') {
      const tdx = orc.task.x - orc.x, tdz = orc.task.z - orc.z;
      const td = Math.hypot(tdx, tdz);
      if (td <= 6) {
        orc.task.phase = 'search';
        orc.task.t = 20;
      } else {
        const step = Math.min(orc.stats.speed * 1.15 * dt, td);
        orc.x += (tdx / td) * step;
        orc.z += (tdz / td) * step;
        orc.yaw = Math.atan2(tdx, tdz);
      }
      return events;
    } else {
      orc.task.t -= dt;
      orc.wanderT -= dt;
      if (orc.wanderT <= 0) {
        orc.wanderT = 1.4 + rng() * 2.2;
        orc.wanderYaw = rng() * Math.PI * 2;
      }
      const hx = orc.task.x - orc.x, hz = orc.task.z - orc.z;
      if (Math.hypot(hx, hz) > 14) orc.wanderYaw = Math.atan2(hx, hz);
      orc.x += Math.sin(orc.wanderYaw) * 0.8 * dt;
      orc.z += Math.cos(orc.wanderYaw) * 0.8 * dt;
      orc.yaw = orc.wanderYaw;
      if (orc.task.t <= 0) orc.task = null; // trail cold — drift home
      /* a searcher that spots its quarry drops the search */
      if (player.alive && dist <= alertR) { orc.task = null; orc.state = 'chase'; }
      return events;
    }
  }

  /* sight: range + cone + line, only from idle */
  if (player.alive && orc.state === 'idle' && dist <= orc.stats.sightR) {
    const facing = Math.sin(orc.yaw) * dx + Math.cos(orc.yaw) * dz;
    const cone = dist > 1e-6 ? facing / dist : 1;
    const los = !senses || !senses.losClear || senses.losClear(orc.x, orc.z, player.x, player.z);
    if (cone >= Math.cos(1.05) && los) {
      orc.state = 'chase';
      events.push({ type: 'sighted' });
    }
  }
  if (player.alive && orc.state === 'idle' && dist <= alertR) {
    orc.state = 'chase';
  }
  if (orc.state === 'chase') {
    if (!player.alive || dist > alertR * 2.6) {
      orc.state = 'idle'; // lost the scent — drift home
    } else if (dist > orc.stats.swingRange) {
      const step = Math.min(orc.stats.speed * dt, dist - orc.stats.swingRange * 0.7);
      orc.x += (dx / dist) * step;
      orc.z += (dz / dist) * step;
      orc.yaw = Math.atan2(dx, dz);
    } else {
      orc.yaw = Math.atan2(dx, dz);
      if (orc.windupT > 0) {
        // Winding up: stand and raise the blade. The hit lands only
        // when the wind-up finishes, so the player SEES it coming.
        // Damage, cooldown, and speed are untouched — the blow is
        // delayed by the wind-up, never strengthened.
        orc.windupT -= dt;
        if (orc.windupT <= 0) {
          orc.windupT = 0;
          orc.swingT = orc.stats.swingCooldown;
          events.push({ type: 'hitPlayer', dmg: orc.stats.dmg });
        }
      } else if (orc.swingT <= 0) {
        orc.windupT = ORC_WINDUP_S;
        events.push({ type: 'windup' });
      }
    }
  } else {
    /* idle: a slow patrol shuffle around home (rovers roam wide) */
    orc.wanderT -= dt;
    if (orc.wanderT <= 0) {
      orc.wanderT = 1.6 + rng() * 2.6;
      orc.wanderYaw = rng() * Math.PI * 2;
    }
    const hx = orc.home.x - orc.x, hz = orc.home.z - orc.z;
    if (Math.hypot(hx, hz) > (orc.homeRadius || 9)) orc.wanderYaw = Math.atan2(hx, hz);
    orc.x += Math.sin(orc.wanderYaw) * 0.55 * dt;
    orc.z += Math.cos(orc.wanderYaw) * 0.55 * dt;
    orc.yaw = orc.wanderYaw;
  }
  return events;
}

/* ---------------- the hunter (player combat) ---------------- */

export function createHunter(maxHp) {
  const hp = maxHp != null ? maxHp : PLAYER_MAX_HP;
  return { hp, maxHp: hp, bladeT: 0, bowT: 0, alive: true };
}

export function stepHunter(hunter, dt) {
  if (hunter.bladeT > 0) hunter.bladeT -= dt;
  if (hunter.bowT > 0) hunter.bowT -= dt;
}

export function hurtHunter(hunter, dmg) {
  if (!hunter.alive) return false;
  hunter.hp -= dmg;
  if (hunter.hp <= 0) { hunter.hp = 0; hunter.alive = false; return true; }
  return false;
}

export function reviveHunter(hunter) {
  hunter.hp = hunter.maxHp != null ? hunter.maxHp : PLAYER_MAX_HP;
  hunter.alive = true;
  hunter.bladeT = 0; hunter.bowT = 0;
}

/* Facing convention: yaw such that forward = (sin(yaw), cos(yaw))
 * on the ground plane. The shared walker's yaw runs the opposite
 * way (its forward is (-sin, -cos)), so the page converts with
 * aimYawFromWalker before striking. */
export function aimYawFromWalker(walkerYaw) {
  return walkerYaw + Math.PI;
}

function inArc(px, pz, yaw, tx, tz, range, arcCos) {
  const dx = tx - px, dz = tz - pz;
  const dist = Math.hypot(dx, dz);
  if (dist > range || dist < 1e-6) return { ok: dist <= range, dist };
  const dot = (Math.sin(yaw) * dx + Math.cos(yaw) * dz) / dist;
  return { ok: dot >= arcCos, dist };
}

/** One strike with any hand: melee spends bladeT, ranged spends
 * bowT (a staff is a ranged hand — same timer, same law).
 * spec = { dmg, range, arcCos, cooldown }. Returns the target or
 * null (on cooldown, or nothing in the arc). The boss carries
 * stats.scale too, so it strikes like any figure. */
export function strike(hunter, targets, px, pz, yaw, spec, slot) {
  if (!hunter.alive) return null;
  const timer = slot === 'ranged' ? 'bowT' : 'bladeT';
  if (hunter[timer] > 0) return null;
  hunter[timer] = spec.cooldown;
  let best = null, bestD = Infinity;
  for (const o of targets) {
    if (!o || o.state === 'dead') continue;
    const scale = o.stats && o.stats.scale ? o.stats.scale : 1;
    const r = inArc(px, pz, yaw, o.x, o.z, spec.range + scale * 0.3, spec.arcCos);
    if (r.ok && r.dist < bestD) { best = o; bestD = r.dist; }
  }
  return best;
}

/** Blade swing: the nearest living orc inside the arc takes it. */
export function strikeBlade(hunter, orcs, px, pz, yaw) {
  return strike(hunter, orcs, px, pz, yaw, BLADE, 'melee');
}

/** Bow shot: the nearest living orc down the chevron's line. */
export function shootBow(hunter, orcs, px, pz, yaw) {
  return strike(hunter, orcs, px, pz, yaw, BOW, 'ranged');
}

/**
 * Apply damage to an orc. Returns the loot array when this blow
 * kills (possibly empty), or null when the orc stands.
 * rng: the hunt's seeded stream (loot is seeded randomness —
 * real rolls, honestly reported, like the gift tables elsewhere).
 */
export function damageOrc(orc, dmg, rng) {
  if (orc.state === 'dead') return null;
  orc.hp -= dmg;
  orc.flashT = 0.18;
  if (orc.state === 'idle') orc.state = 'chase';
  if (orc.hp > 0) return null;
  orc.hp = 0;
  orc.state = 'dead';
  orc.deathT = 0;
  return rollLoot(orc.kind, rng);
}

export function rollLoot(kind, rng) {
  const loot = [];
  const r = rng();
  if (kind === 'captain') {
    loot.push({ id: 'crude-iron', name: 'Crude Iron', qty: 2 });
    if (rng() < 0.25) {
      const w = ORC_LOOT_WEAPONS[Math.floor(rng() * ORC_LOOT_WEAPONS.length)];
      loot.push({ weapon: w });
    } else {
      loot.push({ id: 'orcish-scrap', name: 'Orcish Scrap', qty: 2 });
    }
    return loot;
  }
  if (r < 0.08) {
    const w = ORC_LOOT_WEAPONS[Math.floor(rng() * ORC_LOOT_WEAPONS.length)];
    loot.push({ weapon: w });
  } else if (r < 0.2) {
    loot.push({ id: 'orcish-scrap', name: 'Orcish Scrap', qty: 1 + Math.floor(rng() * 3) });
    loot.push({ id: 'crude-iron', name: 'Crude Iron', qty: 1 + Math.floor(rng() * 2) });
  } else if (r < 0.45) {
    loot.push({ id: 'crude-iron', name: 'Crude Iron', qty: 1 + Math.floor(rng() * 2) });
  } else {
    loot.push({ id: 'orcish-scrap', name: 'Orcish Scrap', qty: 1 + Math.floor(rng() * 3) });
  }
  return loot;
}

/* ---------------- scene layer ----------------
 * A procedural orc: hunched green brute, crude blade in fist,
 * built from primitives in the house flat style. When the foundry
 * GLB lands at the registry path it swaps over the brute (the
 * brute hides) — combat state is untouched. */

export const ORC_MODELS = {
  warrior: { url: '/models/middle-earth/orc-warrior.glb', height: 1.75 },
  // 'fantasy orc' staged file — tentatively the captain (its pair
  // 'fantasy orc warrior' maps to the warrior seat above).
  captain: { url: '/models/middle-earth/orc-brute.glb', height: 2.05 },
};

function attachOrcModel(R, slot, kind, onArrive) {
  const def = ORC_MODELS[kind];
  if (!def || !slot || typeof window === 'undefined') return null;
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
      const fit = def.height / Math.max(size.y, 1e-6);
      model.scale.setScalar(fit);
      model.position.set(-center.x * fit, -box.min.y * fit, -center.z * fit);
      model.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
      slot.add(model);
      if (typeof onArrive === 'function') onArrive();
    } catch (e) { /* the brute stays — by design */ }
  })();
  return slot;
}

export function buildOrcFigure(R, orc) {
  const s = orc.stats.scale;
  const captain = orc.kind === 'captain';
  const g = new R.Group();
  g.name = 'orc:' + orc.kind;

  const skin = new R.MeshStandardMaterial({ color: captain ? 0x5c6e3a : 0x6d8148, flatShading: true, roughness: 1 });
  const dark = new R.MeshStandardMaterial({ color: 0x33302a, flatShading: true, roughness: 1 });
  const iron = new R.MeshStandardMaterial({ color: 0x777d84, flatShading: true, roughness: 0.6, metalness: 0.5 });
  const mats = [skin, dark, iron];

  const body = new R.Group();
  body.rotation.x = 0.16; // the hunch
  g.add(body);
  const torso = new R.Mesh(new R.BoxGeometry(0.62, 0.78, 0.4), dark);
  torso.position.y = 1.05;
  body.add(torso);
  const hips = new R.Mesh(new R.BoxGeometry(0.52, 0.34, 0.36), dark);
  hips.position.y = 0.58;
  body.add(hips);
  const head = new R.Mesh(new R.BoxGeometry(0.34, 0.38, 0.36), skin);
  head.position.set(0, 1.62, 0.1);
  body.add(head);
  const jaw = new R.Mesh(new R.BoxGeometry(0.3, 0.12, 0.3), skin);
  jaw.position.set(0, 1.42, 0.14);
  body.add(jaw);
  /* Limbs hang from pivot groups at the shoulder/hip so they can
   * swing. The offsets are counter-rotated so the REST pose is
   * exactly the old static build: arm boxes centred at y 1.08 with
   * the old -0.35 lean, legs centred at y 0.25, blade in the side
   * -1 fist at its old spot with its old 0.9 tilt (the tilt is split
   * between pivot rest and mesh so it survives the swing). */
  const armPivots = {};
  const legPivots = {};
  for (const side of [-1, 1]) {
    const shoulder = new R.Group();
    shoulder.position.set(side * 0.42, 1.44, 0.06);
    shoulder.rotation.x = ORC_ARM_REST;
    body.add(shoulder);
    const arm = new R.Mesh(new R.BoxGeometry(0.18, 0.72, 0.18), skin);
    arm.position.set(0, -0.338, -0.123);
    shoulder.add(arm);
    const hip = new R.Group();
    hip.position.set(side * 0.17, 0.5, 0);
    g.add(hip);
    const leg = new R.Mesh(new R.BoxGeometry(0.2, 0.5, 0.2), dark);
    leg.position.set(0, -0.25, 0);
    hip.add(leg);
    if (side === -1) { armPivots.blade = shoulder; legPivots.left = hip; }
    else { armPivots.free = shoulder; legPivots.right = hip; }
  }
  /* the crude blade, in the right fist — rides the blade-arm pivot */
  const blade = new R.Mesh(new R.BoxGeometry(0.05, 0.62, 0.14), iron);
  blade.position.set(-0.02, -0.716, 0.037);
  blade.rotation.x = 0.9 - ORC_ARM_REST;
  armPivots.blade.add(blade);
  if (captain) {
    const crest = new R.Mesh(new R.BoxGeometry(0.08, 0.34, 0.4),
      new R.MeshStandardMaterial({ color: 0x8c2f1d, flatShading: true, roughness: 1 }));
    crest.position.set(0, 1.88, 0.06);
    body.add(crest);
    mats.push(crest.material);
    for (const side of [-1, 1]) {
      const pad = new R.Mesh(new R.BoxGeometry(0.3, 0.14, 0.34), iron);
      pad.position.set(side * 0.42, 1.42, 0);
      body.add(pad);
    }
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  g.scale.setScalar(s);

  const slot = new R.Group();
  slot.name = 'orc-model-slot';
  g.add(slot);
  attachOrcModel(R, slot, orc.kind, () => { body.visible = false; });

  /* The hunt marker (Middle-earth fix, 2026-10-25): a small, faint
   * red diamond floating above a live orc. A ~1.8 m dark figure at
   * ~95 m is only a few pixels tall on a phone screen, so distant
   * orcs read as empty ground even though they render fine. The
   * marker is fog-proof and small — a readability aid only: it
   * changes no spawn, ecology, or hunt rule, and it hides once the
   * orc is close enough to see (25 m) or dead. */
  const marker = new R.Mesh(
    new R.OctahedronGeometry(0.55),
    new R.MeshBasicMaterial({ color: 0xff5540, transparent: true, opacity: 0.55, fog: false, depthWrite: false })
  );
  marker.name = 'orc-hunt-marker';
  marker.position.y = 2.5;
  g.add(marker);

  /* Render state -> mesh: fall + fade on death, a hit flash,
   * a lurch when it swings (the zone reports swing events), and
   * procedural life — a walk cycle, an idle sway, a wind-up raise
   * (the zone reports wind-up events before the hit lands). The
   * orc has no skeleton: limbs swing on their pivot groups. */
  let swingAnim = 0;
  let walkPhase = 0;
  function update(t, dt, dist) {
    marker.visible = orc.state !== 'dead' && (dist == null || dist > 25);
    marker.position.y = 2.5 + Math.sin(t * 2.1 + orc.home.x) * 0.08;
    if (orc.flashT > 0) {
      const f = Math.min(1, orc.flashT / 0.18);
      for (const m of mats) { if (m.emissive) m.emissive.setRGB(0.5 * f, 0.08 * f, 0.05 * f); }
    } else {
      for (const m of mats) { if (m.emissive) m.emissive.setRGB(0, 0, 0); }
    }
    if (swingAnim > 0) swingAnim = Math.max(0, swingAnim - dt * 3.2);
    body.rotation.x = 0.16 + Math.sin(Math.min(1, swingAnim) * Math.PI) * 0.5;
    if (orc.state !== 'dead') {
      // Travel speed from state: chasing at full stride, task-marching
      // faster, idle shuffling slowly, planted while winding up.
      let moveSpeed = 0;
      if (orc.state === 'chase' && orc.windupT <= 0
        && (dist == null || dist > orc.stats.swingRange)) moveSpeed = orc.stats.speed;
      else if (orc.task && orc.task.phase === 'go') moveSpeed = orc.stats.speed * 1.15;
      else if (orc.state === 'idle') moveSpeed = 0.55;
      if (moveSpeed > 0) walkPhase += dt * moveSpeed * 4.4;
      const windupP = orc.windupT > 0 ? 1 - orc.windupT / ORC_WINDUP_S : 0;
      const swingP = Math.sin(Math.min(1, swingAnim) * Math.PI);
      const a = orcLimbAngles({ moveSpeed, phase: walkPhase, windupP, swingP, idleT: t });
      armPivots.blade.rotation.x = a.armBlade;
      armPivots.free.rotation.x = a.armFree;
      legPivots.left.rotation.x = a.legL;
      legPivots.right.rotation.x = a.legR;
    }
    if (orc.state === 'dead') {
      const k = Math.min(1, orc.deathT / 0.7);
      g.rotation.x = -k * (Math.PI / 2) * 0.92;
      const fade = orc.deathT > 1.6 ? Math.max(0, 1 - (orc.deathT - 1.6) / 0.9) : 1;
      g.position.y = (g.userData.groundY || 0) - (orc.deathT > 1.6 ? (orc.deathT - 1.6) * 0.35 : 0);
      g.traverse((o) => {
        if (o.isMesh && o.material) { o.material.transparent = fade < 1; o.material.opacity = fade; }
      });
    } else {
      body.position.y = Math.sin(t * 2.1 + orc.home.x) * 0.02;
    }
  }
  function noteSwing() { swingAnim = 1; }
  // Wind-up needs no latch: the pose reads orc.windupT directly, so
  // the arm rises the moment the AI starts winding up and settles
  // the moment the blow lands or is cancelled.
  function noteWindup() { /* pose follows orc.windupT */ }
  return { group: g, update, noteSwing, noteWindup };
}
