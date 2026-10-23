// lib/earth2/lifecycle.js
// EARTH 2 — DEATH & RESPAWN (Living Planet Wave A, 2026-10-23).
// Merlin's law: "When one animal dies, it should respawn
// somewhere else on the map." This module is the world's
// creature lifecycle: a kill registers a CARCASS (which lingers,
// settles and sinks — with the fossil-drop hook riding on it for
// the hunt build to attach to), and schedules the same species
// to return at a DIFFERENT anchor — the far side of the map from
// the death, away from the player, in the same biome family —
// so predation (and the blood-sac loop's mosquito kills, which
// route through here too) can never empty the world.
//
// Pure and deterministic: no three.js, no DOM, no Math.random —
// the manager carries a seeded rng, the anchor choice is a
// scored deterministic pick, and every rule is unit-tested. The
// scene (Earth2World.jsx) owns the meshes; this owns the truth
// about who is alive, who is a carcass, and who is due back.

import { rollFossilDrops } from './fossils.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function mulberryStep(state) {
  let a = (state | 0) + 0x6d2b79f5 | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return { state: a, value: ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
}

/**
 * THE FOSSIL HOOK. A kill of a huntable species rolls its fossil
 * drops (lib/earth2/fossils.js — the drop tables already exist)
 * and the roll rides on the carcass record as `fossilDrops`.
 * Nothing applies the roll today — the future hunt build calls
 * exactly this, at exactly this point, to fill the hunter's
 * pack. Species that never fossilise (the giant mosquito, per
 * the fossil catalog's own exclusions) roll null, and the blood
 * sac stays their only drop.
 */
export function carcassFossilDrops(slug, rng) {
  const rand = typeof rng === 'function' ? rng : Math.random;
  try {
    return rollFossilDrops(slug, rand);
  } catch {
    return null;
  }
}

/**
 * Where a dead creature comes back: a deterministic scored
 * choice over candidate anchors [{ x, z, family? }].
 *   - same biome family as the death, when `family` is given
 *     and any candidate carries it;
 *   - at least minDeathDist from the death (the far side of
 *     the map, not the next hill);
 *   - at least minPlayerDist from the player (a respawn is
 *     never a pop-in at the walker's elbow).
 * Among the anchors that satisfy both distances, the pick
 * maximises the smaller of the two distance scores, jittered
 * by the caller's rng. When nothing satisfies both, the anchor
 * farthest from the death wins outright — distance from the
 * kill is the hard law; the player's comfort is the soft one.
 */
export function chooseRespawnAnchor(anchors, opts = {}) {
  const list = Array.isArray(anchors) ? anchors.filter((a) => a && Number.isFinite(a.x) && Number.isFinite(a.z)) : [];
  if (!list.length) return null;
  const death = opts.deathPos || { x: 0, z: 0 };
  const player = opts.playerPos || null;
  const minDeath = opts.minDeathDist != null ? opts.minDeathDist : 380;
  const minPlayer = opts.minPlayerDist != null ? opts.minPlayerDist : 240;
  const rng = typeof opts.rng === 'function' ? opts.rng : () => 0.5;
  let pool = list;
  if (opts.family) {
    const fam = list.filter((a) => a.family === opts.family);
    if (fam.length) pool = fam;
  }
  const distDeath = (a) => Math.hypot(a.x - death.x, a.z - death.z);
  const distPlayer = (a) => (player ? Math.hypot(a.x - player.x, a.z - player.z) : Infinity);
  const ok = pool.filter((a) => distDeath(a) >= minDeath && distPlayer(a) >= minPlayer);
  if (ok.length) {
    let best = null;
    let bestScore = -Infinity;
    for (const a of ok) {
      const score = Math.min(distDeath(a) / 600, distPlayer(a) / 400) * (0.9 + rng() * 0.2);
      if (score > bestScore) { bestScore = score; best = a; }
    }
    return best;
  }
  let best = pool[0];
  let bestD = -Infinity;
  for (const a of pool) {
    const d = distDeath(a);
    if (d > bestD) { bestD = d; best = a; }
  }
  return best;
}

/** How a carcass ages: fresh for the first 60% of its linger,
 *  then a smooth sink to gone. Returns 0..1 sunk fraction. */
export function carcassSink(carcass, nowS) {
  if (!carcass) return 1;
  const linger = Math.max(1, carcass.lingerS || 55);
  const age = Math.max(0, (Number(nowS) || 0) - (carcass.diedAt || 0));
  const f = clamp((age / linger - 0.6) / 0.4, 0, 1);
  return f * f * (3 - 2 * f);
}

export const DEFAULT_RESPAWN_DELAY_S = 40;
export const DEFAULT_CARCASS_LINGER_S = 55;

/**
 * The lifecycle manager. Register creatures by id; kill them
 * (a carcass comes back); ask who is due to respawn; complete
 * the respawn when the scene has stood the creature up again
 * (or quietly drop it when its stream unit is gone — the unit
 * re-places a living copy when it next streams in, so the
 * population restores itself either way).
 */
export function createLifecycle(opts = {}) {
  const respawnDelayS = opts.respawnDelayS != null ? opts.respawnDelayS : DEFAULT_RESPAWN_DELAY_S;
  const carcassLingerS = opts.carcassLingerS != null ? opts.carcassLingerS : DEFAULT_CARCASS_LINGER_S;
  let rngState = (opts.seed >>> 0) || 20261023;
  const nextRandom = () => {
    const r = mulberryStep(rngState);
    rngState = r.state;
    return r.value;
  };
  const records = new Map(); // id -> { id, slug, status, diedAt, respawnAt }

  return {
    register(id, slug) {
      if (!records.has(id)) records.set(id, { id, slug, status: 'alive', diedAt: 0, respawnAt: 0 });
      return records.get(id);
    },
    isAlive(id) {
      const r = records.get(id);
      return !!r && r.status === 'alive';
    },
    status(id) {
      const r = records.get(id);
      return r ? r.status : null;
    },
    /**
     * Kill a creature at a position. Returns the carcass
     * { id, slug, x, z, diedAt, lingerS, fossilHook,
     *   fossilDrops } — or null when the id is unknown or
     * already dead (a death is never double-counted).
     */
    kill(id, nowS, pos, delayS) {
      const r = records.get(id);
      if (!r || r.status !== 'alive') return null;
      const now = Number(nowS) || 0;
      r.status = 'dead';
      r.diedAt = now;
      // A caller may override the delay (the blood-sac loop's
      // mosquitos cycle in seconds; a dinosaur takes longer to
      // be missed, and to return).
      r.respawnAt = now + (Number.isFinite(delayS) ? delayS : respawnDelayS);
      return {
        id: r.id,
        slug: r.slug,
        x: pos && Number.isFinite(pos.x) ? pos.x : 0,
        z: pos && Number.isFinite(pos.z) ? pos.z : 0,
        diedAt: now,
        lingerS: carcassLingerS,
        fossilHook: true,
        fossilDrops: carcassFossilDrops(r.slug, nextRandom),
      };
    },
    /** Creatures whose respawn time has come. Marks them
     *  'pending' so each is handed out exactly once. */
    dueRespawns(nowS) {
      const now = Number(nowS) || 0;
      const out = [];
      for (const r of records.values()) {
        if (r.status === 'dead' && now >= r.respawnAt) {
          r.status = 'pending';
          out.push({ id: r.id, slug: r.slug });
        }
      }
      return out;
    },
    /** The scene stood the creature up again (or its unit is
     *  gone and the stream will restore it): the id is alive
     *  in the world's accounting once more. */
    completeRespawn(id) {
      const r = records.get(id);
      if (r && r.status === 'pending') {
        r.status = 'alive';
        r.diedAt = 0;
        r.respawnAt = 0;
      }
    },
    /** Forget a creature entirely (its stream unit released;
     *  a fresh copy registers when it streams back in). */
    forget(id) {
      records.delete(id);
    },
  };
}
