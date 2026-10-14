// lib/kombat/framing.js
//
// Arena camera framing (Merlin's playtest, 2026-10-14): on his phone
// the fighters fought LOW in the frame and drifted BEHIND the Powers
// hexagon — the pad row owns the bottom of the screen, so the fight
// must play in the clear band ABOVE it. This module computes the
// framing both engines apply on resize:
//
//   - Landscape (aspect >= ~1.05): the classic framing, unchanged.
//   - Portrait: widen the lens and pull the camera back until the
//     full arena width fits, then shift the frustum (view offset) so
//     the floor line — and the fighters standing on it — render in
//     the band above the pads, never under them.
//
// Pure math + a projector helper the headless tests drive with the
// real three.js camera, so the band guarantee is verified, not hoped.

/** Fraction of frame height the pad row can occupy (worst case). */
export const PAD_BAND_FRAC = 0.34;

/**
 * Duel framing for a viewport aspect (width / height).
 * @returns {{ fovY: number, camY: number, camZ: number, lookY: number,
 *             shiftUpFrac: number }}
 *   shiftUpFrac: pass to camera.setViewOffset as a positive y offset
 *   fraction of full height — it moves the rendered fight UP.
 */
export function duelFraming(aspect, arenaHalfWidth = 4.2) {
  const a = aspect && aspect > 0 ? aspect : 1;
  if (a >= 1.05) {
    return { fovY: 50, camY: 2.35, camZ: 8.8, lookY: 1.35, shiftUpFrac: 0 };
  }
  const fovY = 58;
  const tanHalf = Math.tan((fovY * Math.PI) / 360);
  const needHalfW = arenaHalfWidth + 0.35;
  const camZ = Math.min(22, Math.max(10.5, needHalfW / (tanHalf * a)));
  const camY = camZ * 0.267;
  return { fovY, camY, camZ, lookY: 1.12, shiftUpFrac: 0.13 };
}

/** Brawl framing: the chase camera only needs the upward shift. */
export function brawlFraming(aspect) {
  const a = aspect && aspect > 0 ? aspect : 1;
  return { shiftUpFrac: a >= 1.05 ? 0 : 0.11 };
}

/**
 * Screen position (fractions of width/height, y measured from the
 * TOP) of a world point under a three.js PerspectiveCamera that has
 * been positioned/lookAt'ed and had its view offset applied. `vec3`
 * is a real THREE.Vector3 (anything with clone().project(camera)).
 */
export function projectToScreen(camera, vec3) {
  const v = vec3.clone().project(camera);
  return { x: (v.x + 1) / 2, yFromTop: (1 - v.y) / 2, behind: v.z > 1 };
}

/**
 * The guarantee, as a check: with this framing, a standing fighter
 * (feet at floorY, head at floorY + height) at arena x projects with
 * feet ABOVE the pad band and head inside the frame.
 * @param makeVec (x, y, z) => THREE.Vector3 (injected so this module
 *   stays three-free; tests pass the real constructor)
 */
export function fighterInClearBand(camera, makeVec, x, height, floorY = 0) {
  const feet = projectToScreen(camera, makeVec(x, floorY, 0));
  const head = projectToScreen(camera, makeVec(x, floorY + height, 0));
  return {
    feet, head,
    ok: !feet.behind && !head.behind
      && feet.yFromTop <= 1 - PAD_BAND_FRAC - 0.02
      && head.yFromTop >= 0.02
      && feet.x >= -0.02 && feet.x <= 1.02,
  };
}
