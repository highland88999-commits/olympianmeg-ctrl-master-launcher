/**
 * app/star-wars/data.js
 *
 * DATA LAYER for the Star Wars open-world galaxy pocket universe.
 *
 * Pure module: no JSX, no document/window access at import time.
 * Importable from plain node (tests) and from Next.js page.jsx via:
 *   import { CHAPTERS, PLANETS, ... } from './data'
 *
 * Planet/character names are factual film-location labels (Tatooine,
 * Mos Eisley, ...). Chapter "crawl" texts are original 2-3 sentence
 * summaries written for this module — NOT the films' opening crawls.
 */

export const PROGRESS_KEY = 'olympus:starwars:progress';

/* ------------------------------------------------------------------ */
/* Chapters (saga order, Episode I - IX)                               */
/* ------------------------------------------------------------------ */

export const CHAPTERS = [
  {
    ep: 1,
    title: 'The Phantom Menace',
    crawl:
      'A trade blockade chokes the planet Naboo, and two Jedi are sent to end it. ' +
      'Their search for help leads them to a desert slave boy with more raw talent in the Force than anyone has ever measured. ' +
      'Behind the invasion, a hidden Sith Lord begins moving his pieces.',
    planets: ['tatooine', 'naboo'],
  },
  {
    ep: 2,
    title: 'Attack of the Clones',
    crawl:
      'Ten years later, the Republic teeters on the edge of civil war as an army of clones is secretly built in its name. ' +
      'A Jedi Knight and a senator fall in love while assassination plots pull them across the galaxy. ' +
      'The first battle of the Clone Wars erupts on Geonosis.',
    planets: ['coruscant', 'kamino', 'geonosis'],
  },
  {
    ep: 3,
    title: 'Revenge of the Sith',
    crawl:
      'The Clone Wars rage toward their end as a Jedi hero is seduced by promises of power to save the one he loves. ' +
      'The Republic falls in a single day, replaced by an Empire, and the Jedi are hunted to near extinction. ' +
      'Two newborn twins are hidden where no one will look for them.',
    planets: ['mustafar'],
  },
  {
    ep: 4,
    title: 'A New Hope',
    crawl:
      'Nineteen years on, a farm boy on Tatooine finds a message hidden in a droid and follows it into a rebellion. ' +
      'With a smuggler, a princess, and an old Jedi, he strikes at the Empire\u2019s planet-killing battle station. ' +
      'The Death Star falls \u2014 but the war is just beginning.',
    planets: ['yavin-4', 'alderaan', 'death-star'],
  },
  {
    ep: 5,
    title: 'The Empire Strikes Back',
    crawl:
      'The Empire hunts the rebels across the ice world Hoth while a young hero trains with a Jedi Master in a swamp. ' +
      'A trap in a floating city springs shut, and a shocking revelation about his parentage shakes him to the core. ' +
      'The rebellion escapes \u2014 barely \u2014 with its leaders scattered.',
    planets: ['hoth', 'dagobah', 'bespin'],
  },
  {
    ep: 6,
    title: 'Return of the Jedi',
    crawl:
      'The rebels strike the Empire\u2019s second Death Star while the Emperor lures its last Jedi into a final confrontation. ' +
      'On the forest moon of Endor, small warriors turn the tide of a battle the Empire thought it had already won. ' +
      'The Emperor falls, and the galaxy is free \u2014 for now.',
    planets: ['endor'],
  },
  {
    ep: 7,
    title: 'The Force Awakens',
    crawl:
      'Thirty years after Endor, the First Order rises from the Empire\u2019s ashes and a scavenger on Jakku finds a droid carrying a map. ' +
      'The search for a missing Jedi Master pulls her, a defecting stormtrooper, and old heroes into a new war. ' +
      'A superweapon is destroyed, and the spark of hope survives.',
    planets: ['jakku', 'takodana', 'starkiller'],
  },
  {
    ep: 8,
    title: 'The Last Jedi',
    crawl:
      'The last Jedi refuses to train the scavenger who found him, but she drags him back into the fight anyway. ' +
      'The Resistance is chased across the stars and nearly wiped out on a salt-white battlefield. ' +
      'The legend of the Jedi is reborn in the galaxy\u2019s children.',
    planets: ['ahch-to', 'crait'],
  },
  {
    ep: 9,
    title: 'The Rise of Skywalker',
    crawl:
      'A dead Emperor\u2019s voice reaches out from the dark, and the final battle for the galaxy begins. ' +
      'The scavenger, now a Jedi, confronts the truth of her bloodline and the fleet hidden beyond the galaxy\u2019s edge. ' +
      'The Sith are destroyed, and the Skywalker name finds its heir.',
    planets: ['exegol'],
  },
];

/* ------------------------------------------------------------------ */
/* Planets                                                             */
/*                                                                     */
/* Shape per entry:                                                    */
/*   { id, name, ep, kind: 'walk'|'fly', biome,                        */
/*     color, sky, fog, fogDensity, ground, ground2,                   */
/*     landmarks: [{ type, x, z, s, ry? }],                            */
/*     ambient:   [{ type, count }],                                    */
/*     beat: { id, title, text, objective,                              */
/*             checkpoints?: [{x,z,r,label}] | target?: {x,z,r,label} } }*/
/* ------------------------------------------------------------------ */

export const PLANETS = {
  tatooine: {
    id: 'tatooine',
    name: 'Tatooine',
    ep: 1,
    kind: 'walk',
    biome: 'desert',
    color: 0xd9a441,
    sky: 0x87ceeb,
    fog: 0xd9a441,
    fogDensity: 0.0018,
    ground: 0xd9a441,
    ground2: 0xb57f2a,
    landmarks: [
      { type: 'mos-eisley', x: 0, z: -40, s: 1.2, ry: 0.4 },
      { type: 'moisture-farm', x: 45, z: 20, s: 1 },
      { type: 'podrace-arch', x: -50, z: 30, s: 1.4, ry: 0.9 },
      { type: 'beggars-canyon', x: 0, z: 70, s: 2 },
    ],
    ambient: [
      { type: 'bantha', count: 4 },
      { type: 'jawa', count: 5 },
      { type: 'tuskan', count: 3 },
    ],
    beat: {
      id: 'tatooine-beat',
      title: 'Beggar\u2019s Canyon Run',
      text: 'Anakin\u2019s old podrace circuit is still marked through the canyon. Run the full loop.',
      objective: 'Run the Beggar\u2019s Canyon podrace circuit',
      checkpoints: [
        { x: 25, z: 55, r: 8, label: 'Canyon Gate' },
        { x: -20, z: 75, r: 8, label: 'Canyon Spine' },
        { x: -50, z: 40, r: 8, label: 'Arch Turn' },
        { x: 20, z: 35, r: 8, label: 'Home Straight' },
      ],
    },
  },

  naboo: {
    id: 'naboo',
    name: 'Naboo',
    ep: 1,
    kind: 'walk',
    biome: 'grassland',
    color: 0x5dbb63,
    sky: 0x8fd3f4,
    fog: 0xcfe8d8,
    fogDensity: 0.0012,
    ground: 0x5dbb63,
    ground2: 0x2e7d44,
    landmarks: [
      { type: 'theed-palace', x: 0, z: -50, s: 1.3, ry: 1.2 },
    ],
    ambient: [
      { type: 'bird', count: 6 },
    ],
    beat: {
      id: 'naboo-beat',
      title: 'Plaza at Theed',
      text: 'Theed is celebrating its liberation. Walk the grand avenue to the palace plaza.',
      objective: 'Reach the Theed Palace plaza',
      target: { x: 0, z: -30, r: 10, label: 'Theed Palace plaza' },
    },
  },

  coruscant: {
    id: 'coruscant',
    name: 'Coruscant',
    ep: 2,
    kind: 'walk',
    biome: 'city',
    color: 0x8a8fa3,
    sky: 0x3a4a6b,
    fog: 0x5a6a8a,
    fogDensity: 0.002,
    ground: 0x6a6f85,
    ground2: 0x3d4155,
    landmarks: [
      { type: 'jedi-temple', x: 0, z: -55, s: 1.2 },
      { type: 'senate-dome', x: 50, z: 30, s: 1.1, ry: 0.7 },
    ],
    ambient: [
      { type: 'bird', count: 8 },
    ],
    beat: {
      id: 'coruscant-beat',
      title: 'Ascent of the Temple',
      text: 'The Jedi Council awaits your report. Climb the temple steps above the city sprawl.',
      objective: 'Climb to the Jedi Temple',
      target: { x: 0, z: -35, r: 10, label: 'Jedi Temple steps' },
    },
  },

  kamino: {
    id: 'kamino',
    name: 'Kamino',
    ep: 2,
    kind: 'walk',
    biome: 'ocean',
    color: 0x7fd4e6,
    sky: 0x9db8c9,
    fog: 0xa9c2cf,
    fogDensity: 0.0022,
    ground: 0x3f6f8a,
    ground2: 0x274b5e,
    landmarks: [
      { type: 'tipoca-city', x: 0, z: -40, s: 1.4, ry: 0.3 },
    ],
    ambient: [
      { type: 'fish', count: 6 },
    ],
    beat: {
      id: 'kamino-beat',
      title: 'Landing Platforms',
      text: 'Storm waves batter the stilt city. Cross the landing platforms to the cloning hall.',
      objective: 'Cross the Tipoca landing platforms',
      checkpoints: [
        { x: 0, z: -10, r: 8, label: 'Platform Alpha' },
        { x: -15, z: 10, r: 8, label: 'Platform Beta' },
        { x: 15, z: 30, r: 8, label: 'Cloning Hall' },
      ],
    },
  },

  geonosis: {
    id: 'geonosis',
    name: 'Geonosis',
    ep: 2,
    kind: 'walk',
    biome: 'rocky desert',
    color: 0xc46a3d,
    sky: 0xe08b54,
    fog: 0xd08050,
    fogDensity: 0.002,
    ground: 0xa85a35,
    ground2: 0x7c4226,
    landmarks: [
      { type: 'geonosis-arena', x: 0, z: -45, s: 1.5 },
      { type: 'droid-foundry', x: -55, z: 25, s: 1.1, ry: 1.0 },
    ],
    ambient: [
      { type: 'bird', count: 4 },
    ],
    beat: {
      id: 'geonosis-beat',
      title: 'Into the Arena',
      text: 'The arena gates are open. Slip past the foundry and enter the execution arena.',
      objective: 'Enter the arena',
      target: { x: 0, z: -25, r: 10, label: 'Arena gate' },
    },
  },

  mustafar: {
    id: 'mustafar',
    name: 'Mustafar',
    ep: 3,
    kind: 'walk',
    biome: 'volcanic',
    color: 0xe25822,
    sky: 0x2a0f0a,
    fog: 0x661f0e,
    fogDensity: 0.003,
    ground: 0x1e1410,
    ground2: 0xe25822,
    landmarks: [
      { type: 'mustafar-fortress', x: 0, z: -50, s: 1.3 },
      { type: 'lava-falls', x: 45, z: 30, s: 1.2, ry: 0.5 },
    ],
    ambient: [
      { type: 'probe-droid', count: 3 },
    ],
    beat: {
      id: 'mustafar-beat',
      title: 'The Fortress',
      text: 'Darth Vader\u2019s fortress looms over the lava flows. Cross the obsidian field to reach it.',
      objective: 'Reach the fortress',
      target: { x: 0, z: -30, r: 10, label: 'Fortress gate' },
    },
  },

  'yavin-4': {
    id: 'yavin-4',
    name: 'Yavin 4',
    ep: 4,
    kind: 'walk',
    biome: 'jungle',
    color: 0x2f8f4e,
    sky: 0x9fd8ef,
    fog: 0xbfe3c8,
    fogDensity: 0.0018,
    ground: 0x2f8f4e,
    ground2: 0x1c5c30,
    landmarks: [
      { type: 'yavin-temple', x: 0, z: -50, s: 1.4, ry: 0.2 },
    ],
    ambient: [
      { type: 'bird', count: 8 },
    ],
    beat: {
      id: 'yavin-4-beat',
      title: 'The Massassi Temple',
      text: 'The rebel base hides inside the ancient temple. Push through the jungle to its steps.',
      objective: 'Reach the Massassi temple',
      target: { x: 0, z: -30, r: 10, label: 'Temple steps' },
    },
  },

  alderaan: {
    id: 'alderaan',
    name: 'Alderaan',
    ep: 4,
    kind: 'fly',
    biome: 'debris field',
    color: 0x7fa8c9,
    sky: 0x05070f,
    fog: 0x0a1220,
    fogDensity: 0.0008,
    ground: 0x1a2333,
    ground2: 0x0d1524,
    landmarks: [
      { type: 'debris-field', x: 0, z: 0, s: 3, ry: 0.6 },
    ],
    ambient: [],
    beat: {
      id: 'alderaan-beat',
      title: 'Memorial Beacon',
      text: 'Alderaan is gone \u2014 only drifting debris remains. Fly a silent patrol to the memorial beacon.',
      objective: 'Fly to the memorial beacon',
      target: { x: 20, z: 20, r: 12, label: 'Memorial beacon' },
    },
  },

  'death-star': {
    id: 'death-star',
    name: 'Death Star',
    ep: 4,
    kind: 'fly',
    biome: 'trench',
    color: 0x9aa3b2,
    sky: 0x05070f,
    fog: 0x0a1220,
    fogDensity: 0.0005,
    ground: 0x0d1524,
    ground2: 0x111a2b,
    landmarks: [
      { type: 'death-star', x: 0, z: 0, s: 3, ry: 0.3 },
    ],
    ambient: [],
    beat: {
      id: 'death-star-beat',
      title: 'Trench Run',
      text: 'Red Squadron is counting on you. Thread the exhaust checkpoints along the trench.',
      objective: 'Trench run \u2014 thread all 4 exhaust checkpoints',
      checkpoints: [
        { x: 0, z: -60, r: 10, label: 'Trench Entry' },
        { x: 20, z: -20, r: 10, label: 'Turbolaser Gap' },
        { x: -20, z: 20, r: 10, label: 'Exhaust Port' },
        { x: 0, z: 60, r: 10, label: 'Escape Vector' },
      ],
    },
  },

  hoth: {
    id: 'hoth',
    name: 'Hoth',
    ep: 5,
    kind: 'walk',
    biome: 'ice',
    color: 0xeef4fb,
    sky: 0xa9c6e8,
    fog: 0xdce9f7,
    fogDensity: 0.0025,
    ground: 0xe8f1fa,
    ground2: 0xb9d2ea,
    landmarks: [
      { type: 'echo-base', x: 0, z: -50, s: 1.4, ry: 0.1 },
    ],
    ambient: [
      { type: 'wampa', count: 2 },
      { type: 'tauntaun', count: 4 },
    ],
    beat: {
      id: 'hoth-beat',
      title: 'Echo Base',
      text: 'The Empire is coming. Cross the ice field and get inside Echo Base before the walkers arrive.',
      objective: 'Reach Echo Base',
      target: { x: 0, z: -30, r: 10, label: 'Echo Base gate' },
    },
  },

  dagobah: {
    id: 'dagobah',
    name: 'Dagobah',
    ep: 5,
    kind: 'walk',
    biome: 'swamp',
    color: 0x4a7c3a,
    sky: 0x8ba888,
    fog: 0x6b8f6a,
    fogDensity: 0.004,
    ground: 0x3d5c2e,
    ground2: 0x22331a,
    landmarks: [
      { type: 'swamp-hut', x: 0, z: -35, s: 1.2, ry: 0.8 },
    ],
    ambient: [
      { type: 'bird', count: 5 },
    ],
    beat: {
      id: 'dagobah-beat',
      title: 'The Swamp Hut',
      text: 'Something strong in the Force lives in this swamp. Follow the feeling to the hut.',
      objective: 'Find the swamp hut',
      target: { x: 0, z: -20, r: 8, label: 'Swamp hut door' },
    },
  },

  bespin: {
    id: 'bespin',
    name: 'Bespin',
    ep: 5,
    kind: 'walk',
    biome: 'sky city',
    color: 0xf4d58d,
    sky: 0xf7a25c,
    fog: 0xf2c98a,
    fogDensity: 0.0015,
    ground: 0xe8b96a,
    ground2: 0xc9924e,
    landmarks: [
      { type: 'cloud-city', x: 0, z: -45, s: 1.3, ry: 0.2 },
    ],
    ambient: [
      { type: 'bird', count: 6 },
    ],
    beat: {
      id: 'bespin-beat',
      title: 'Cloud City',
      text: 'Lando\u2019s city floats above the clouds. Cross the landing platform to the city spire.',
      objective: 'Reach Cloud City',
      target: { x: 0, z: -28, r: 10, label: 'Cloud City spire' },
    },
  },

  endor: {
    id: 'endor',
    name: 'Endor',
    ep: 6,
    kind: 'walk',
    biome: 'forest',
    color: 0x3a8f4f,
    sky: 0x9fd0e8,
    fog: 0xaad4b8,
    fogDensity: 0.002,
    ground: 0x2e6e3a,
    ground2: 0x1a4423,
    landmarks: [
      { type: 'shield-generator', x: 0, z: -55, s: 1.2 },
      { type: 'ewok-village', x: 50, z: 25, s: 1.1, ry: 0.6 },
    ],
    ambient: [
      { type: 'ewok', count: 6 },
      { type: 'bird', count: 6 },
    ],
    beat: {
      id: 'endor-beat',
      title: 'Speeder-Bike Run',
      text: 'The shield generator must fall. Thread the forest trail on a speeder bike.',
      objective: 'Speeder-bike run through the forest',
      checkpoints: [
        { x: 30, z: 30, r: 8, label: 'Forest Gate' },
        { x: 10, z: -10, r: 8, label: 'Tall Redwood' },
        { x: -20, z: 10, r: 8, label: 'Log Crossing' },
        { x: -35, z: -30, r: 8, label: 'Bunker Trail' },
        { x: 0, z: -60, r: 8, label: 'Shield Generator' },
      ],
    },
  },

  jakku: {
    id: 'jakku',
    name: 'Jakku',
    ep: 7,
    kind: 'walk',
    biome: 'desert',
    color: 0xd6b06a,
    sky: 0xd89a55,
    fog: 0xd9b26a,
    fogDensity: 0.003,
    ground: 0xc49a54,
    ground2: 0x9a7438,
    landmarks: [
      { type: 'niima-outpost', x: 0, z: -45, s: 1.3, ry: 0.4 },
    ],
    ambient: [
      { type: 'jawa', count: 4 },
    ],
    beat: {
      id: 'jakku-beat',
      title: 'Niima Outpost',
      text: 'A droid carrying a map is heading for the outpost. Get there before the First Order does.',
      objective: 'Reach Niima Outpost',
      target: { x: 0, z: -28, r: 10, label: 'Niima Outpost' },
    },
  },

  takodana: {
    id: 'takodana',
    name: 'Takodana',
    ep: 7,
    kind: 'walk',
    biome: 'forest lake',
    color: 0x55a868,
    sky: 0x93c8e8,
    fog: 0xbfe0cc,
    fogDensity: 0.0016,
    ground: 0x3e7f4e,
    ground2: 0x2a5a36,
    landmarks: [
      { type: 'maz-castle', x: 0, z: -50, s: 1.3, ry: 1.1 },
    ],
    ambient: [
      { type: 'bird', count: 6 },
    ],
    beat: {
      id: 'takodana-beat',
      title: 'Maz\u2019s Castle',
      text: 'Maz Kanata\u2019s castle sits by the lake. Cross the woods to the castle courtyard.',
      objective: 'Reach Maz\u2019s castle',
      target: { x: 0, z: -30, r: 10, label: 'Castle courtyard' },
    },
  },

  starkiller: {
    id: 'starkiller',
    name: 'Starkiller Base',
    ep: 7,
    kind: 'walk',
    biome: 'ice canyon',
    color: 0xcfe0f2,
    sky: 0x5a7a9e,
    fog: 0xa9c2d8,
    fogDensity: 0.0025,
    ground: 0xa9c2d8,
    ground2: 0x7a96b5,
    landmarks: [
      { type: 'starkiller-cannon', x: 0, z: -55, s: 1.5, ry: 0.3 },
    ],
    ambient: [
      { type: 'probe-droid', count: 3 },
    ],
    beat: {
      id: 'starkiller-beat',
      title: 'The Cannon',
      text: 'The superweapon is charging. Cross the ice canyon and plant the charges at the cannon.',
      objective: 'Reach the cannon',
      target: { x: 0, z: -35, r: 10, label: 'Cannon base' },
    },
  },

  'ahch-to': {
    id: 'ahch-to',
    name: 'Ahch-To',
    ep: 8,
    kind: 'walk',
    biome: 'island cliffs',
    color: 0x6fa87a,
    sky: 0x9ecbe8,
    fog: 0xb8d4c2,
    fogDensity: 0.0016,
    ground: 0x4a7f58,
    ground2: 0x2e5538,
    landmarks: [
      { type: 'jedi-village', x: 0, z: -40, s: 1.2, ry: 0.9 },
    ],
    ambient: [
      { type: 'porg', count: 8 },
      { type: 'bird', count: 5 },
    ],
    beat: {
      id: 'ahch-to-beat',
      title: 'The Jedi Village',
      text: 'An old hermit waits at the top of the island. Climb the ancient steps to the village.',
      objective: 'Climb to the Jedi village',
      target: { x: 0, z: -25, r: 8, label: 'Village steps' },
    },
  },

  crait: {
    id: 'crait',
    name: 'Crait',
    ep: 8,
    kind: 'walk',
    biome: 'salt flats',
    color: 0xf7f2e8,
    sky: 0x9fc8ee,
    fog: 0xf0e9d8,
    fogDensity: 0.002,
    ground: 0xefe8da,
    ground2: 0xd8cbb4,
    landmarks: [
      { type: 'salt-arch', x: -40, z: 30, s: 1.4, ry: 0.5 },
    ],
    ambient: [
      { type: 'bird', count: 4 },
    ],
    beat: {
      id: 'crait-beat',
      title: 'Across the Salt Flats',
      text: 'The Resistance base is under the mountain. Skim across the salt flats, leaving red trails.',
      objective: 'Cross the salt flats',
      checkpoints: [
        { x: -10, z: 20, r: 8, label: 'Salt Gate' },
        { x: 15, z: 0, r: 8, label: 'Mid Flats' },
        { x: 30, z: -25, r: 8, label: 'Base Approach' },
      ],
    },
  },

  exegol: {
    id: 'exegol',
    name: 'Exegol',
    ep: 9,
    kind: 'walk',
    biome: 'dark spires',
    color: 0x6a3fb5,
    sky: 0x0d0718,
    fog: 0x1c1030,
    fogDensity: 0.0035,
    ground: 0x141020,
    ground2: 0x2c1e45,
    landmarks: [
      { type: 'sith-citadel', x: 0, z: -55, s: 1.4 },
      { type: 'sith-throne', x: 0, z: -80, s: 1, ry: 0.2 },
    ],
    ambient: [
      { type: 'probe-droid', count: 4 },
    ],
    beat: {
      id: 'exegol-beat',
      title: 'The Sith Citadel',
      text: 'Lightning splits the sky over the hidden world. Enter the citadel and end the Sith.',
      objective: 'Enter the Sith citadel',
      target: { x: 0, z: -40, r: 10, label: 'Citadel gate' },
    },
  },
};

/* ------------------------------------------------------------------ */
/* Progression helpers (pure functions)                                */
/* ------------------------------------------------------------------ */

/**
 * Fresh progress state.
 * beatsDone: { [planetId]: true } ; chaptersDone: [epIdx, ...] in completion order.
 */
export function createProgress() {
  return { beatsDone: {}, chaptersDone: [] };
}

/** Index into CHAPTERS for the chapter containing planetId, or -1 if unknown. */
export function chapterIndexOf(planetId) {
  return CHAPTERS.findIndex((ch) => ch.planets.includes(planetId));
}

/** Chapter epIdx is unlocked if it's the first, or the previous chapter is done. */
export function isChapterUnlocked(progress, epIdx) {
  if (epIdx === 0) return true;
  return progress.chaptersDone.includes(epIdx - 1);
}

/** Planet is unlocked when its chapter is unlocked. */
export function isPlanetUnlocked(progress, planetId) {
  const epIdx = chapterIndexOf(planetId);
  if (epIdx === -1) return false;
  return isChapterUnlocked(progress, epIdx);
}

/**
 * Mark a planet's beat complete. Returns a NEW progress object (no mutation).
 * If every planet in the planet's chapter is now done, appends epIdx to chaptersDone.
 */
export function completeBeat(progress, planetId) {
  const beatsDone = { ...progress.beatsDone, [planetId]: true };
  let chaptersDone = progress.chaptersDone;
  const epIdx = chapterIndexOf(planetId);
  if (epIdx !== -1) {
    const allDone = CHAPTERS[epIdx].planets.every((id) => beatsDone[id]);
    if (allDone && !chaptersDone.includes(epIdx)) {
      chaptersDone = [...chaptersDone, epIdx];
    }
  }
  return { beatsDone, chaptersDone };
}

/** { done, total } beats completed for chapter epIdx. */
export function chapterBeatsDone(progress, epIdx) {
  const planets = CHAPTERS[epIdx] ? CHAPTERS[epIdx].planets : [];
  const done = planets.filter((id) => progress.beatsDone[id]).length;
  return { done, total: planets.length };
}

/** Load progress from localStorage; falls back to a fresh object on any failure. */
export function loadProgress() {
  try {
    if (typeof localStorage === 'undefined') return createProgress();
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return createProgress();
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.beatsDone !== 'object' ||
      !Array.isArray(parsed.chaptersDone)
    ) {
      return createProgress();
    }
    return parsed;
  } catch {
    return createProgress();
  }
}

/** Persist progress to localStorage; silently ignores failures (SSR / privacy mode). */
export function saveProgress(p) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
  } catch {
    /* noop */
  }
}

export default {
  PROGRESS_KEY,
  CHAPTERS,
  PLANETS,
  createProgress,
  chapterIndexOf,
  isChapterUnlocked,
  isPlanetUnlocked,
  completeBeat,
  chapterBeatsDone,
  loadProgress,
  saveProgress,
};
