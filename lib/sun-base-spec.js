// lib/sun-base-spec.js — the sun-base interior spec.
//
// Resolves one of the 3 reserved sun-base interiors
// (lib/earth2/fittings.js) to the full interior-room spec the
// scene builds (lib/earth2/interior-room.js buildInteriorRoom),
// re-based at the origin: the base room stands at (0, 0, 0) with
// no heading, wherever the user's base lives — never at the
// interior's Earth 2 anchor position.
//
// Kept apart from lib/sun-base.js on purpose: this file imports
// the Earth 2 fittings data, and the hub bundle (which imports
// lib/sun-base.js for the entry wiring) must not carry it. Only
// the /sun-base route imports this file.
//
// Pure math + data — no THREE, no DOM — node tests drive it.

import { buildingAnchor, interiorSpecForAnchor } from './earth2/fittings.js';
import { sunBaseOptionFor } from './sun-base.js';

/**
 * The interior spec for a reserved sun-base assetId, re-based at
 * the origin (x 0, z 0, heading 0). Returns null when the assetId
 * is not one of the three reserved options, or its Earth 2 anchor
 * is missing (the scene then says so honestly instead of forcing
 * a room that does not exist).
 */
export function sunBaseSpecFor(assetId) {
  if (!sunBaseOptionFor(assetId)) return null;
  const anchor = buildingAnchor(assetId);
  if (!anchor) return null;
  const spec = interiorSpecForAnchor(anchor);
  return { ...spec, x: 0, z: 0, headingDeg: 0 };
}
