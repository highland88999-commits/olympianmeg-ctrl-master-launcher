// lib/nether-realm/lava-glow.js
// LAVA GLOW (Merlin, 2026-11-14, ORDERED): enhance the glow from lava
// in the underworlds. One shared glow law for every lava site, so the
// four pool realms (Hades, Hell, Naraka, Diyu) and the two pit realms
// (Mictlan, Xibalba) all burn the same way.
//
// What was wrong: every lava site was a FLAT unlit disc — halo 0.22,
// core 0.9, no light of its own, nothing above the surface. It read
// as paint, not heat, and Hell's Lake of Fire was a dark disc with
// one small bright spot, which is why it ran so dark in Merlin's reel.
//
// The law, per site:
// - Pools: brighter halo (0.22 -> 0.40) + solid core (0.9 -> 1.0) +
//   a hot centre + a glow dome hovering over the surface + a
//   flickering point light whose reach scales with the pool.
// - Pits: halo disc 0.3 -> 0.5 + glow dome over each pit + the shared
//   region light raised (55/110 -> 80/140; Mictlan/Xibalba 50/105 ->
//   80/140). Region light COLOURS stay per realm (Hades lava, Hell
//   ice-blue for the Frozen Deep, Naraka/Diyu warm gold, Mictlan/
//   Xibalba lava red) — the colour is realm design, only the reach
//   and the dome are shared.
// - Lake of Fire (Hell): the bright spot grows from a r12 dot to a
//   r55 mid glow + r30 hot + r14 core, the light 45/95 -> 90/160,
//   breathing flame cones over the surface, one big glow dome.
// - Descent cracks: 0.55 -> 0.85 + a small dome (Xibalba's crack is
//   green by design, not lava — untouched).
// - Ground veins: shadowBlur 14 -> 22 in the lava realms' textures.
//
// NOT lava, deliberately untouched: Duat's dark pools (gold), Mictlan's
// obsidian pools, Xibalba's blood pools, Helheim's frost, Annwn's mist,
// Kur's dust, Nav's damp, Orun (no pools), Yomi's dark pools. Those
// are other substances by design — giving them lava glow would change
// what those realms are.
//
// Visual only: no change to damage, collision, the lava drop, or the
// day/night law. The discs are meshBasicMaterial (unlit) so they read
// the same in red daylight and at night; the lights add the wash.
//
// Light budget: one realm scene mounts at a time. A pool realm goes
// from 12 point lights to 17 (5 pool lights on top of 8 torches + 4
// region lights). The scenes are otherwise cheap procedural geometry,
// and the flicker loop is skipped when reduced motion is on — the
// same pattern the torches already use.

// Pool halo disc: r x 1.5, was opacity 0.22.
export const LAVA_GLOW_POOL_HALO_OPACITY = 0.4;
// Pool core disc: r, was opacity 0.9.
export const LAVA_GLOW_POOL_CORE_OPACITY = 1;
// Pool hot-centre disc: r x 0.55, new.
export const LAVA_GLOW_POOL_HOT_OPACITY = 0.95;
// Pit halo disc: r x 1.6, was opacity 0.3.
export const LAVA_GLOW_PIT_HALO_OPACITY = 0.5;
// Glow dome hovering over a pool or pit: additive, squashed sphere.
export const LAVA_GLOW_DOME_OPACITY = 0.18;
// Descent crack disc: was opacity 0.55.
export const LAVA_GLOW_CRACK_OPACITY = 0.85;
// Ground-texture lava veins: canvas shadowBlur, was 14.
export const LAVA_GLOW_VEIN_SHADOW_BLUR = 22;
// Shared north-region light over the pits: was 55/110 (Hades, Hell,
// Naraka, Diyu) and 50/105 (Mictlan, Xibalba).
export const LAVA_GLOW_PIT_LIGHT_INTENSITY = 80;
export const LAVA_GLOW_PIT_LIGHT_DISTANCE = 140;
// Hell's Lake of Fire light: was 45/95.
export const LAVA_GLOW_LAKE_LIGHT_INTENSITY = 90;
export const LAVA_GLOW_LAKE_LIGHT_DISTANCE = 160;

export const LAVA_GLOW = {
  poolHaloOpacity: LAVA_GLOW_POOL_HALO_OPACITY,
  poolCoreOpacity: LAVA_GLOW_POOL_CORE_OPACITY,
  poolHotOpacity: LAVA_GLOW_POOL_HOT_OPACITY,
  pitHaloOpacity: LAVA_GLOW_PIT_HALO_OPACITY,
  domeOpacity: LAVA_GLOW_DOME_OPACITY,
  crackOpacity: LAVA_GLOW_CRACK_OPACITY,
  veinShadowBlur: LAVA_GLOW_VEIN_SHADOW_BLUR,
  pitLightIntensity: LAVA_GLOW_PIT_LIGHT_INTENSITY,
  pitLightDistance: LAVA_GLOW_PIT_LIGHT_DISTANCE,
  lakeLightIntensity: LAVA_GLOW_LAKE_LIGHT_INTENSITY,
  lakeLightDistance: LAVA_GLOW_LAKE_LIGHT_DISTANCE,
};

/**
 * The torch flicker wave (components/earth2/Earth2World.jsx, "Fire
 * flicker", 2026-11-03; same wave the nether torches already use):
 * every 3rd frame each flame breathes, intensity = base * wave.
 * Shared so the lava lights breathe in the same rhythm as the
 * torches instead of inventing a second flicker.
 */
export function lavaFlicker(t, id) {
  return 0.88 + 0.12 * Math.sin(t * 11 + id) * Math.sin(t * 5.7 + id * 2);
}

/**
 * One pool's light: intensity grows with the pool (r 6 -> ~25,
 * r 14 -> ~38), reach is five radii (30–70 m), riding 3 m above
 * the surface. Wide enough to wash the ground around the pool,
 * tight enough that a pool on the far side of the world does not
 * light the spawn.
 */
export function poolLightFor(pool) {
  const intensity = Math.round(24 * (0.6 + pool.r / 14));
  return { intensity, distance: pool.r * 5, height: 3 };
}
