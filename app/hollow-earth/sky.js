// OLYMPIAN MONSTERVERSE — Hollow Earth sky dome (G-02, WS4).
//
// The sky is a BackSide dome, not a background colour: it wears
// the savage sky VIDEO when it is live
// (public/videos/hollow-earth/monsterverse-sky.mp4) and falls back
// to the static sky image (public/art/hollow-earth/hollow-earth-sky.jpg),
// and to the flat dusk colour when neither has landed — the video
// can never blank the scene (the video-wraps.js fallback pattern).
// The day/night cycle retints the sky through the dome material
// colour multiply (applied by the page each frame), exactly as the
// realm-surfaces.js ceiling pattern does for the hell realms.
// Hollow Earth is NOT a nether realm — its video URL is wired
// directly here, never added to NETHER_VIDEO_SKY_REALMS.
// Pure module: no document/window access at import time, no
// texture loading here — the page loads textures and hands them
// to setSkyDomeMap().

/** Public URL of the savage sky video (already made, 10 s loop). */
export const HOLLOW_EARTH_SKY_VIDEO_URL = '/videos/hollow-earth/monsterverse-sky.mp4';

/** Public URL of the static sky image (the video fallback). */
export const HOLLOW_EARTH_SKY_ART_URL = '/art/hollow-earth/hollow-earth-sky.jpg';

/** Inside the shell (SPHERE_R 382 m): the dome must sit UNDER
 * the shell, or the shell hides it entirely. At 370 m the
 * walker (feet ~382, eye ~380 from the centre) always stands
 * OUTSIDE the dome and reads its far interior as the sky
 * overhead — the old 780 m dome wrapped the outside of the
 * shell and would have been invisible from within. The shell
 * itself, curving up around the walker, is the inverted
 * horizon; the dome is only the sky picture inside it. */
export const HOLLOW_EARTH_SKY_DOME_RADIUS = 370;

/** Repo-relative paths of the sky files (for tests). */
export const HOLLOW_EARTH_SKY_FILES = [
  'public/videos/hollow-earth/monsterverse-sky.mp4',
  'public/art/hollow-earth/hollow-earth-sky.jpg',
];

/**
 * A BackSide dome wearing a flat base tint until a map lands.
 * MeshBasicMaterial (unlit), fog: false so the fog never washes
 * the sky out to fog colour at 370 m. Zero new real lights.
 */
export function buildSkyDome(R, baseColor = 0x2a1e3f) {
  const dome = new R.Mesh(
    new R.SphereGeometry(HOLLOW_EARTH_SKY_DOME_RADIUS, 32, 24),
    new R.MeshBasicMaterial({ color: baseColor, side: R.BackSide, fog: false })
  );
  dome.userData.skyDome = true;
  return dome;
}

/** Day/night retint: the cycle colour multiplies whatever the dome wears. */
export function applySkyTint(dome, hex) {
  if (!dome || !dome.material) return;
  dome.material.color.setHex(hex);
}

/** Put a texture on the dome (video wins over static art — the
 * caller decides which one to hand over), or clear it back to
 * the flat tint when null. */
export function setSkyDomeMap(dome, tex) {
  if (!dome || !dome.material) return;
  dome.material.map = tex || null;
  dome.material.needsUpdate = true;
}
