/*
 * MIDDLE-EARTH — THE TWO-WAY HUNT (pure core).
 *
 * Merlin: "Orcs hunt them too." A hunt meter per pod tracks how
 * loudly the player has been hunting. Kills, sightings and alarms
 * raise it; silence and distance cool it. At thresholds, hunting
 * parties form up from the blanket spawns and MARCH to the
 * player's last known position — they path across the map, they
 * never teleport. Break line of sight and put distance between
 * you and the search: the trail goes cold, parties lose it and
 * drift back to roaming. Death cuts the meter (they lost your
 * trail in the chaos).
 *
 * The zone owns the live orcs and fulfils dispatches by retasking
 * them; this module owns only the numbers, so node tests pin the
 * logic exactly. Line of sight here is a distance + terrain-
 * clearance approximation — honest about it: a straight segment
 * sampled against the analytic heightfield, blocked when terrain
 * rises above the sight line by more than the margin.
 */

export const HUNT_LEVELS = [
  { max: 20, name: 'Cold' },
  { max: 45, name: 'Warm' },
  { max: 70, name: 'Hot' },
  { max: Infinity, name: 'Bloodhunt' },
];

export function heatLevel(heat) {
  for (const l of HUNT_LEVELS) if (heat < l.max) return l.name;
  return 'Bloodhunt';
}

/* Dispatch thresholds: heat at which a party forms, and the
 * lower heat at which that party slot re-arms (hysteresis, so a
 * hovering meter doesn't spam parties). */
export const DISPATCH_TIERS = [
  { at: 45, rearm: 30, size: 3 },
  { at: 70, rearm: 55, size: 4 },
  { at: 90, rearm: 75, size: 5 },
];

export const HEAT_DECAY_PER_S = 0.55; // while unseen
export const TRAIL_COLD_S = 25; // seconds unseen before the trail dies
export const KILL_HEAT = 14;
export const SIGHT_HEAT = 4;
export const ALARM_HEAT = 10;
export const LOUD_HEAT = 3;

export function createHunt(initialHeat) {
  return {
    heat: Math.max(0, Math.min(100, initialHeat || 0)),
    lastKnown: null, // { x, z } | null
    sinceSeen: 0,
    armed: DISPATCH_TIERS.map(() => true),
    nextPartyId: 1,
  };
}

export function addHeat(hunt, amount) {
  hunt.heat = Math.max(0, Math.min(100, hunt.heat + amount));
  return hunt.heat;
}

export function noteKillHeat(hunt, x, z, scale) {
  addHeat(hunt, KILL_HEAT * (scale != null ? scale : 1));
  hunt.lastKnown = { x, z };
  hunt.sinceSeen = 0;
}

export function noteSightHeat(hunt, x, z, scale) {
  addHeat(hunt, SIGHT_HEAT * (scale != null ? scale : 1));
  hunt.lastKnown = { x, z };
  hunt.sinceSeen = 0;
}

export function noteAlarmHeat(hunt, scale) {
  addHeat(hunt, ALARM_HEAT * (scale != null ? scale : 1));
}

export function noteLoudHeat(hunt, scale) {
  addHeat(hunt, LOUD_HEAT * (scale != null ? scale : 1));
}

/** Death cuts the meter — they lost your trail in the chaos. */
export function cutHeat(hunt) {
  hunt.heat = hunt.heat * 0.35;
  hunt.lastKnown = null;
  hunt.sinceSeen = 0;
  return hunt.heat;
}

/**
 * Advance the meter. seen = the player is currently noticed by
 * any orc (chasing or sighting this frame). Returns events:
 * [{ type: 'dispatch', size, partyId, x, z }] — the zone
 * fulfils each by retasking live orcs toward (x, z).
 * [{ type: 'trailCold' }] — the zone drops every party task.
 */
export function stepHunt(hunt, dt, seen) {
  const events = [];
  if (seen) {
    hunt.sinceSeen = 0;
  } else {
    hunt.sinceSeen += dt;
    hunt.heat = Math.max(0, hunt.heat - HEAT_DECAY_PER_S * dt);
    if (hunt.lastKnown && hunt.sinceSeen >= TRAIL_COLD_S) {
      hunt.lastKnown = null;
      events.push({ type: 'trailCold' });
    }
  }
  DISPATCH_TIERS.forEach((tier, i) => {
    if (hunt.armed[i] && hunt.heat >= tier.at && hunt.lastKnown) {
      hunt.armed[i] = false;
      events.push({
        type: 'dispatch', size: tier.size,
        partyId: hunt.nextPartyId++,
        x: hunt.lastKnown.x, z: hunt.lastKnown.z,
      });
    } else if (!hunt.armed[i] && hunt.heat < tier.rearm) {
      hunt.armed[i] = true;
    }
  });
  return events;
}

/**
 * Terrain line of sight, approximated. Eye height 1.6 m at both
 * ends; the segment is sampled 9 ways; blocked when the terrain
 * rises above the sight line by more than `margin` (0.5 m).
 * A ridge blocks; flat ground and shallow dips clear.
 */
export function losClear(heightAt, ax, az, bx, bz, margin) {
  const m = margin != null ? margin : 0.5;
  const ha = heightAt(ax, az) + 1.6;
  const hb = heightAt(bx, bz) + 1.6;
  for (let i = 1; i < 9; i++) {
    const k = i / 9;
    const x = ax + (bx - ax) * k;
    const z = az + (bz - az) * k;
    const line = ha + (hb - ha) * k;
    if (heightAt(x, z) > line + m) return false;
  }
  return true;
}
