/**
 * lib/star-wars/menu-graphics.js
 *
 * PART -> MENU ART MAP for the Star Wars menus (Merlin, 2026-11-15).
 *
 * Per-part rule: every selectable part of the Star Wars universe gets
 * its OWN illustrated graphic, true to that place, and NO graphic
 * repeats across parts. Every button belonging to a part (its Missions
 * choice, its Free Roam choice, its mission buttons) carries that
 * part's graphic; non-part buttons get the neutral galaxy graphic.
 *
 * Pure module: no JSX, no document/window access at import time.
 * Art lives under public/art/star-wars/ so it ships with the build.
 * Generated (media pipeline) — no Tripo, no paid assets.
 */

export const ART_BASE = '/art/star-wars';

/* One distinct graphic per selectable part (PLANETS keys in
 * app/star-wars/data.js). */
export const PART_GRAPHICS = {
  tatooine: `${ART_BASE}/tatooine.jpg`,
  naboo: `${ART_BASE}/naboo.jpg`,
  coruscant: `${ART_BASE}/coruscant.jpg`,
  kamino: `${ART_BASE}/kamino.jpg`,
  geonosis: `${ART_BASE}/geonosis.jpg`,
  mustafar: `${ART_BASE}/mustafar.jpg`,
  'yavin-4': `${ART_BASE}/yavin-4.jpg`,
  alderaan: `${ART_BASE}/alderaan.jpg`,
  'death-star': `${ART_BASE}/death-star.jpg`,
  hoth: `${ART_BASE}/hoth.jpg`,
  dagobah: `${ART_BASE}/dagobah.jpg`,
  bespin: `${ART_BASE}/bespin.jpg`,
  endor: `${ART_BASE}/endor.jpg`,
  jakku: `${ART_BASE}/jakku.jpg`,
  takodana: `${ART_BASE}/takodana.jpg`,
  starkiller: `${ART_BASE}/starkiller.jpg`,
  'ahch-to': `${ART_BASE}/ahch-to.jpg`,
  crait: `${ART_BASE}/crait.jpg`,
  exegol: `${ART_BASE}/exegol.jpg`,
};

/* Neutral Star Wars-themed graphic for non-part buttons/screens
 * (menu, crawl, Exit to Lobby, Back, Close, ...). */
export const NEUTRAL_GRAPHIC = `${ART_BASE}/galaxy.jpg`;

/* What each graphic depicts (from the planet's own code: biome,
 * landmarks, sky — not invented from the films). */
export const PART_DEPICTS = {
  tatooine: 'Twin suns over golden dunes, dome huts, moisture vaporators, mesas, landspeeder',
  naboo: 'Green plains, lake and waterfalls, white-domed Theed palace',
  coruscant: 'Towering city spires at dusk, Jedi Temple ziggurat, skylane lights',
  kamino: 'White stilt city on pylons over a storm ocean, rain and lightning',
  geonosis: 'Rust-red rocky desert, open-air arena, hive spires, droid foundry',
  mustafar: 'Black obsidian plains, rivers and falls of glowing lava, dark fortress',
  'yavin-4': 'Dense green jungle, ancient Massassi step-pyramid temple above the canopy',
  alderaan: 'Debris field in deep space, warm memorial beacon among the wreckage',
  'death-star': 'Colossal grey battle station, trench with tiny lights, fighter skimming it',
  hoth: 'White snow plains, blue ice crags, Echo Base entrance glowing warm, tauntauns',
  dagobah: 'Misty green swamp, gnarled moss-draped trees, small hut on stilts',
  bespin: 'Cloud City floating above golden clouds at sunset',
  endor: 'Giant redwood forest, tree villages, shield-generator bunker in the green',
  jakku: 'Sandy starship graveyard, fallen Star Destroyer hull, Niima outpost',
  takodana: 'Forest lake, old stone castle on the wooded shore',
  starkiller: 'Frozen ice canyon, colossal cannon dish in the canyon wall, pine forest',
  'ahch-to': 'Green island cliffs over blue ocean, stone steps to round stone huts',
  crait: 'White salt flats, salt arch, red mineral trail curving across the white',
  exegol: 'Black stone spires, purple lightning, dark Sith citadel, red ground glow',
};

/** Graphic for a planet part; unknown ids fall back to the neutral galaxy. */
export function graphicForPlanet(planetId) {
  return PART_GRAPHICS[planetId] || NEUTRAL_GRAPHIC;
}

/**
 * CSS background-image value: the part's art under a dark scrim so a
 * label stays legible at phone size in bright light. `opacity` is the
 * scrim strength (0.68 for travel buttons, 0.80 for mission rows).
 */
export function artScrimBackground(planetId, opacity) {
  const o = opacity == null ? 0.68 : opacity;
  return `linear-gradient(rgba(6,8,18,${o}), rgba(6,8,18,${o})), url(${graphicForPlanet(planetId)})`;
}
