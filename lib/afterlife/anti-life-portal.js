// lib/afterlife/anti-life-portal.js — the Anti-Life floor portal.
//
// ANTI-LIFE PORTAL (Merlin, 2026-11-15): a portal to /anti-life lives
// in EVERY hell realm (all 13 nether realms), and it is a
// FALL-THROUGH-THE-FLOOR portal — the same fall-through pattern as
// the Hades lava drop (lib/nether-realm/world.js nearestLavaPool +
// the lava guard in app/nether-realm/world3d.js CameraRig): step
// onto the marked disc and you drop through the floor, riding the
// same vortex travel as the arches (Merlin's one-vortex-system rule),
// into Anti-Life — where the 10-minute lingering decay is granted.
// The portal is the way in; the decay is what you carry out.
//
// The portal sits in the SAME place in all 13 realms because the
// realms share one skeleton (verified in every lib/<realm>/world.js):
// SPAWN (0,160), GATES (0,70), river band z ±18, landmark (0,-130),
// three region discs west (-160,-70) / east (160,-70) / far-north
// (0,-230), portal arches on a radius-55 arc around the landmark.
// The disc is south-west of the Descent path: visible from spawn, a
// short walk, clear of the spawn, the Gates, the river, the plaza,
// every region disc, every arch, and (in Hades) Medusa's Lair.
//
// Pure: no three.js, no DOM — unit-testable in plain Node.

export const ANTI_LIFE_ROUTE = '/anti-life';
export const ANTI_LIFE_PORTAL_NAME = 'Anti-Life';

// The one disc, in every hell realm.
export const ANTI_LIFE_PORTAL = {
  key: 'anti-life',
  name: 'Anti-Life',
  x: -70,
  z: 110,
  r: 8,
};

/**
 * True when (x, z) is standing on the Anti-Life disc. The trigger is
 * the disc's own radius, exactly like the lava drop: stepping onto
 * the disc is the fall. A walker standing exactly on the rim is not
 * yet in.
 */
export function isOnAntiLifePortal(x, z, portal = ANTI_LIFE_PORTAL) {
  const dx = Number(x) - portal.x;
  const dz = Number(z) - portal.z;
  if (!Number.isFinite(dx) || !Number.isFinite(dz)) return false;
  return dx * dx + dz * dz < portal.r * portal.r;
}

/** Plain-English line for the HUD hint in every hell realm. */
export const ANTI_LIFE_HINT = 'step onto the dark Anti-Life disc to fall through';
