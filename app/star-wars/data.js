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
/*     landmarks: [{ type, x, z, s, ry?, model? }],                     */
/*     ambient:   [{ type, count }],                                    */
/*     characters: [{ id, model, name, at: [x, z], faceYaw, height?,    */
/*       hand?, saber: { color, length } | null }] — named figures,     */
/*       dressing in every mode; sabers ignite on approach.            */
/*     world (optional): seed, tex, groundAmp, worldRadius,            */
/*       boundsRadius, ambientRadius, canyon, scatter, horizon         */
/*     beat: { id, title, text, objective,                              */
/*             checkpoints?: [{x,z,r,label}] | target?: {x,z,r,label} } }*/
/*     missions: [mission, ...] — every planet carries a mission list;  */
/*       beat is kept as the alias of missions[0]. See SAGA EXPANSION. */
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
    /* Ever-expanding world (Earth 2 spirit, zone.js template):
     * a 340 m seeded dune sea instead of the old 130 m disc, a real
     * carved Beggar's Canyon under the podrace gates, instanced
     * rock/mesa/vaporator scatter, and mesa silhouettes on the
     * horizon. The old 'beggars-canyon' block walls are gone — the
     * terrain itself is the canyon now. */
    seed: 4242,
    tex: 'sand',
    groundAmp: 4,
    worldRadius: 340,
    boundsRadius: 295,
    ambientRadius: 150,
    canyon: {
      width: 26,
      depth: 6.5,
      /* The original six points run the classic gates; the extension
       * (from [-14,-36] on) carves a mesa circuit — a long drop south,
       * a far turn, and the loop home past the jagged mesa — so the
       * podrace course more than doubles without moving a single
       * original gate. */
      path: [[52, 128], [25, 55], [-20, 75], [-50, 40], [20, 35], [-14, -36],
        [-64, -78], [-118, -64], [-146, -6], [-128, 52], [-84, 44]],
    },
    scatter: [
      { kind: 'rock', count: 150, minR: 18, maxR: 300, size: [0.8, 3.4] },
      { kind: 'rock', count: 40, minR: 120, maxR: 300, size: [2, 5] },
      { kind: 'mesa', count: 30, minR: 60, maxR: 290, size: [6, 16] },
      { kind: 'vaporator', count: 22, cx: 45, cz: 20, minR: 13, maxR: 30 },
      { kind: 'vaporator', count: 8, cx: 0, cz: -40, minR: 16, maxR: 34 },
    ],
    horizon: { radius: 430, count: 18, color: 0xc79a58 },
    landmarks: [
      { type: 'mos-eisley', x: 0, z: -40, s: 1.2, ry: 0.4 },
      { type: 'moisture-farm', x: 45, z: 20, s: 1, model: 'homestead' },
      { type: 'cantina', x: 10, z: -28, s: 1, ry: 0.8, model: 'cantina' },
      { type: 'podrace-arch', x: -50, z: 30, s: 1.4, ry: 0.9 },
      /* THE POD GRID — staged ON the canyon floor at Canyon Gate, the
       * first thing a racer sees. (They used to be parked behind Mos
       * Eisley, 135 m off the course and out of the race entirely —
       * the pods never loaded into the podrace. Fixed 2026-10-23.)
       * A third pod waits at the mesa-circuit finish. */
      { type: 'podracer', x: 31, z: 64, s: 1.2, ry: -0.55, vehicle: 'podracer', vid: 'pod-grid-a' },
      { type: 'podracer', x: 13, z: 70, s: 1.2, ry: -0.55, vehicle: 'podracer', vid: 'pod-grid-b' },
      /* The winner's pod is rideable too (all-worlds QA, 2026-10-23):
       * the QA round left it dressing while its two grid siblings
       * drove, which read as a bug from the saddle. Same type, same
       * law — a champion's machine you can actually take out. */
      { type: 'podracer', x: -92, z: 58, s: 1.2, ry: 2.4, vehicle: 'podracer', vid: 'pod-winner' },
      { type: 'landspeeder', x: 60, z: 26, s: 1, ry: -0.7, model: 'landspeeder', vehicle: 'landspeeder', vid: 'landspeeder' },
    ],
    ambient: [
      { type: 'bantha', count: 4 },
      { type: 'jawa', count: 5 },
      { type: 'tuskan', count: 3 },
    ],
    /* A Jedi keeps a quiet watch over the Lars homestead, standing
     * off the vaporator field and looking down the farm road toward
     * Mos Eisley. Walk within 12 m and his saber answers.
     * hand/belt anchors MEASURED from knight.glb (2026-10-23 QA):
     * the old anchor (-0.37, 0.95) sat 17 cm OUTSIDE the silhouette
     * at hip height — the floating hilt Merlin filmed. The model's
     * defined arm hangs on its +X side; the fist cluster terminates
     * at ~(0.44, 0.50, 0.02) and the waist band at y ~0.92 spans
     * x -0.20..0.29, so the grip sits at (0.43, 0.54) and the belt
     * clip at (0.24, 0.92). One-glance correctable like the facings. */
    characters: [
      { id: 'knight', model: 'knight', name: 'Jedi Knight', at: [33, 24], faceYaw: -2.45,
        height: 1.8, hand: [0.43, 0.54, 0.02], belt: [0.24, 0.92, 0.06],
        saber: { color: 0x3f9dff, length: 1.05 } },
    ],
    missions: [
      {
        id: 'tatooine-beat',
        title: 'Beggar\u2019s Canyon Run',
        text: 'Anakin\u2019s old podrace circuit is still marked through the canyon — and it has grown. The pods are staged on the grid at Canyon Gate. Run the canyon, then the full mesa circuit extension.',
        objective: 'Run the expanded Beggar\u2019s Canyon podrace circuit',
        difficulty: 2,
        par: 210,
        checkpoints: [
          { x: 25, z: 55, r: 7, label: 'Canyon Gate' },
          { x: -20, z: 75, r: 7, label: 'Canyon Spine' },
          { x: -50, z: 40, r: 7, label: 'Arch Turn' },
          { x: 20, z: 35, r: 7, label: 'Home Straight' },
          { x: -64, z: -78, r: 7, label: 'Mesa Drop' },
          { x: -118, z: -64, r: 7, label: 'Far Turn' },
          { x: -146, z: -6, r: 7, label: 'Mesa Loop' },
        ],
        target: { x: -84, z: 44, r: 8, label: 'Finish \u2014 Jagged Mesa' },
      },
      {
        id: 'tatooine-moisture-run',
        title: 'The Moisture Run',
        text: 'The Lars homestead needs its vaporator yield in Mos Eisley before the suns climb. Load up at the farm, thread the market square, out through the canyon mouth and under the podrace arch — then home again.',
        objective: 'Delivery circuit: farm \u2192 Mos Eisley \u2192 canyon mouth \u2192 arch \u2192 home',
        difficulty: 2,
        par: 240,
        checkpoints: [
          { x: 38, z: 34, r: 7, label: 'Lars Homestead \u2014 load up' },
          { x: 0, z: -16, r: 7, label: 'Mos Eisley \u2014 market square' },
          { x: -14, z: -36, r: 7, label: 'Canyon Mouth' },
          { x: -50, z: 30, r: 7, label: 'Podrace Arch' },
        ],
        target: { x: 45, z: 8, r: 8, label: 'Back at the farm' },
      },
      {
        id: 'tatooine-tusken-gauntlet',
        title: 'Tusken Gauntlet',
        text: 'Sand People have claimed the canyon narrows. Thread every gate at speed, out the mesa drop and around the far turn to Ambush Hollow. They shoot straighter than stormtroopers — keep moving.',
        objective: 'Run the Tusken gauntlet through the canyon narrows',
        difficulty: 3,
        par: 260,
        extraAmbient: [{ type: 'tuskan', count: 4 }],
        checkpoints: [
          { x: 25, z: 55, r: 5, label: 'Canyon Gate' },
          { x: -20, z: 75, r: 5, label: 'Canyon Spine' },
          { x: -50, z: 40, r: 5, label: 'Arch Turn' },
          { x: 20, z: 35, r: 5, label: 'Home Straight' },
          { x: -64, z: -78, r: 5, label: 'Mesa Drop' },
          { x: -118, z: -64, r: 5, label: 'Far Turn' },
        ],
        target: { x: -146, z: -6, r: 6, label: 'Ambush Hollow' },
      },
    ],
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
      { type: 'kyber-forge', x: 24, z: -30, s: 1, ry: 0.4 },
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
    /* The Sith Lord waits on the fortress approach, off the road
     * before the gate — taller than any man has a right to be, and
     * his red blade wakes when you close within 12 m.
     * hand/belt anchors MEASURED from dark-lord.glb (2026-10-23 QA),
     * in body space (model faces -Z, yawFix pi flips x/z): the
     * front-swept fist cluster sits at (0.40, 0.57, 0.13); the
     * waist band at y ~0.98 spans x -0.30..0.30, belt clip at
     * (0.26, 0.98). */
    characters: [
      { id: 'dark-lord', model: 'dark-lord', name: 'Sith Lord', at: [7, -20], faceYaw: 0.15,
        height: 1.92, hand: [0.40, 0.60, 0.10], belt: [0.26, 0.98, 0.05],
        saber: { color: 0xff2a1a, length: 1.1 } },
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
/* SAGA EXPANSION (2026-10-23)                                         */
/*                                                                     */
/* Every world grows to the Tatooine template class and gains a        */
/* mission list. Worlds that shipped with a single `beat` keep it as   */
/* their first mission (same id, same content — one notch harder:      */
/* tighter rings, an extra gate where the route earns it), and gain   */
/* at least one more lore-true mission authored below. Tatooine       */
/* authors its missions inline (above).                                */
/*                                                                     */
/* Mission shape: { id, title, text, objective, difficulty: 1..3,      */
/*   par?: seconds, extraAmbient?: [{type, count}],                    */
/*   checkpoints?: [...], target?: {...} } — checkpoints run in order, */
/*   then the target (a mission may carry either or both). The engine  */
/*   honours: gate count/spacing, ring radii, extraAmbient density,   */
/*   and the par (shown as a soft clock in Mission mode).              */
/*                                                                     */
/* Walk worlds are SPREAD x1.6: landmarks and first-mission gates move */
/* out together so every route keeps threading the same landmarks on   */
/* the bigger terrain. Extra missions are authored in spread coords.   */
/* ------------------------------------------------------------------ */

export const DIFFICULTY_LABELS = { 1: 'Story', 2: 'Standard', 3: 'Heroic' };

const EXPANSIONS = {
  naboo: {
    seed: 1101, tex: 'leaf', groundAmp: 3, spread: true, par: 120,
    scatter: [
      { kind: 'garden-tree', count: 55, minR: 20, maxR: 290, size: [0.9, 1.7] },
      { kind: 'scrub', count: 45, minR: 16, maxR: 280, size: [0.8, 1.8] },
      { kind: 'rock', count: 36, minR: 24, maxR: 290, size: [0.8, 2.6] },
      { kind: 'reed', count: 30, minR: 18, maxR: 260, size: [0.8, 1.4] },
    ],
    horizon: { radius: 430, count: 16, color: 0x86b06a, style: 'peaks' },
  },
  coruscant: {
    seed: 2202, tex: 'city', groundAmp: 1.2, spread: true, par: 150,
    scatter: [
      { kind: 'spire', count: 64, minR: 30, maxR: 290, size: [0.8, 2.2] },
    ],
    horizon: { radius: 430, count: 20, color: 0x8a93a8, style: 'spires' },
  },
  kamino: {
    seed: 3303, tex: 'water', groundAmp: 1.5, spread: true, par: 150,
    scatter: [
      { kind: 'pylon', count: 38, minR: 24, maxR: 280, size: [0.9, 1.6] },
      { kind: 'reed', count: 55, minR: 18, maxR: 260, size: [0.8, 1.5] },
    ],
    horizon: { radius: 430, count: 10, color: 0x5f7f9e, style: 'peaks' },
  },
  geonosis: {
    seed: 4404, tex: 'rock', groundAmp: 4, spread: true, par: 120,
    scatter: [
      { kind: 'rock', count: 150, minR: 18, maxR: 300, size: [0.8, 3.4] },
      { kind: 'mesa', count: 26, minR: 60, maxR: 290, size: [6, 15] },
      { kind: 'obsidian', count: 40, minR: 20, maxR: 280, size: [1, 2.6], tint: 0x9a6a44 },
    ],
    horizon: { radius: 430, count: 18, color: 0xb06a3f },
  },
  mustafar: {
    seed: 5505, tex: 'lava', groundAmp: 4.5, spread: true, par: 120,
    scatter: [
      { kind: 'lava-rock', count: 160, minR: 18, maxR: 300, size: [0.8, 3.2] },
      { kind: 'obsidian', count: 55, minR: 20, maxR: 280, size: [1, 2.8] },
    ],
    horizon: { radius: 430, count: 16, color: 0x6e3a2a, style: 'peaks' },
  },
  'yavin-4': {
    seed: 6606, tex: 'leaf', groundAmp: 3, spread: true, par: 120,
    scatter: [
      { kind: 'canopy-tree', count: 120, minR: 18, maxR: 290, size: [0.9, 1.8] },
      { kind: 'undergrowth', count: 85, minR: 14, maxR: 280, size: [0.8, 2] },
      { kind: 'rock', count: 28, minR: 24, maxR: 290, size: [0.8, 2.4] },
    ],
    horizon: { radius: 430, count: 16, color: 0x4a7a44, style: 'trees' },
  },
  alderaan: { // fly — no spread; a wider patrol volume + more dressing
    seed: 7707, par: 120, boundsRadius: 190,
    extraLandmarks: [
      { type: 'debris-field', x: 90, z: -70, s: 2, ry: 1.1 },
      { type: 'star-destroyer', x: 150, z: 60, s: 1.2, ry: -0.6 },
    ],
  },
  'death-star': { // fly — trench volume + drifting debris off the trench
    seed: 8808, par: 150, boundsRadius: 170, firstDifficulty: 2,
    extraLandmarks: [
      { type: 'debris-field', x: 120, z: 90, s: 1.5, ry: 0.9 },
    ],
  },
  hoth: {
    seed: 9909, tex: 'ice', groundAmp: 3.5, spread: true, par: 120,
    scatter: [
      { kind: 'ice-crag', count: 110, minR: 18, maxR: 300, size: [0.9, 2.6] },
      { kind: 'snow-drift', count: 75, minR: 14, maxR: 280, size: [1, 2.4] },
    ],
    horizon: { radius: 430, count: 16, color: 0xcfe4f2, style: 'ice' },
  },
  dagobah: {
    seed: 10110, tex: 'swamp', groundAmp: 2.5, spread: true, par: 90,
    scatter: [
      { kind: 'swamp-tree', count: 100, minR: 16, maxR: 290, size: [0.9, 1.7] },
      { kind: 'swamp-knee', count: 85, minR: 12, maxR: 270, size: [0.8, 1.8] },
      { kind: 'undergrowth', count: 45, minR: 14, maxR: 270, size: [0.8, 1.8], tint: 0x3c5c34 },
    ],
    horizon: { radius: 430, count: 14, color: 0x39543c, style: 'trees' },
  },
  bespin: {
    seed: 11121, tex: 'metal', groundAmp: 1.2, spread: true, par: 120,
    scatter: [
      { kind: 'spire', count: 42, minR: 26, maxR: 280, size: [0.7, 1.6] },
    ],
    horizon: { radius: 430, count: 18, color: 0xd8c9a8, style: 'spires' },
  },
  endor: {
    seed: 12131, tex: 'leaf', groundAmp: 3, spread: true, par: 240, firstDifficulty: 2,
    scatter: [
      { kind: 'canopy-tree', count: 140, minR: 18, maxR: 295, size: [0.9, 1.9] },
      { kind: 'undergrowth', count: 80, minR: 14, maxR: 280, size: [0.8, 2] },
      { kind: 'rock', count: 22, minR: 24, maxR: 290, size: [0.8, 2.4] },
    ],
    horizon: { radius: 430, count: 16, color: 0x3f7040, style: 'trees' },
  },
  jakku: {
    seed: 13141, tex: 'sand', groundAmp: 4, spread: true, par: 120,
    scatter: [
      { kind: 'wreck', count: 55, minR: 20, maxR: 290, size: [0.9, 1.9] },
      { kind: 'rock', count: 85, minR: 18, maxR: 300, size: [0.8, 3] },
      { kind: 'mesa', count: 14, minR: 70, maxR: 290, size: [6, 14] },
    ],
    horizon: { radius: 430, count: 16, color: 0xc79a58 },
  },
  takodana: {
    seed: 14151, tex: 'leaf', groundAmp: 3, spread: true, par: 120,
    scatter: [
      { kind: 'canopy-tree', count: 105, minR: 18, maxR: 290, size: [0.9, 1.8] },
      { kind: 'undergrowth', count: 65, minR: 14, maxR: 280, size: [0.8, 2] },
      { kind: 'scrub', count: 28, minR: 16, maxR: 270, size: [0.8, 1.8] },
    ],
    horizon: { radius: 430, count: 16, color: 0x4a7a44, style: 'trees' },
  },
  starkiller: {
    seed: 15161, tex: 'ice', groundAmp: 3.5, spread: true, par: 150,
    scatter: [
      { kind: 'ice-crag', count: 75, minR: 18, maxR: 295, size: [0.9, 2.6] },
      { kind: 'snow-drift', count: 65, minR: 14, maxR: 280, size: [1, 2.4] },
      { kind: 'canopy-tree', count: 38, minR: 24, maxR: 290, size: [0.9, 1.6], tint: 0x8fa89b },
    ],
    horizon: { radius: 430, count: 16, color: 0xd4e6f0, style: 'ice' },
  },
  'ahch-to': {
    seed: 16171, tex: 'rock', groundAmp: 4, spread: true, par: 90,
    scatter: [
      { kind: 'scrub', count: 65, minR: 14, maxR: 280, size: [0.8, 1.9] },
      { kind: 'rock', count: 55, minR: 18, maxR: 295, size: [0.8, 3] },
      { kind: 'garden-tree', count: 15, minR: 26, maxR: 260, size: [0.9, 1.5] },
    ],
    horizon: { radius: 430, count: 14, color: 0x7a8a94, style: 'peaks' },
  },
  crait: {
    seed: 17181, tex: 'salt', groundAmp: 2, spread: true, par: 150,
    scatter: [
      { kind: 'salt-crystal', count: 100, minR: 14, maxR: 290, size: [0.7, 1.8] },
      { kind: 'rock', count: 18, minR: 30, maxR: 290, size: [0.8, 2.2] },
    ],
    horizon: { radius: 430, count: 16, color: 0xd8cfc4, style: 'peaks' },
  },
  exegol: {
    seed: 18191, tex: 'rock', groundAmp: 4, spread: true, par: 150,
    scatter: [
      { kind: 'dark-spire', count: 85, minR: 18, maxR: 295, size: [0.9, 2.2] },
      { kind: 'lava-rock', count: 55, minR: 18, maxR: 290, size: [0.8, 2.8] },
      { kind: 'rock', count: 36, minR: 22, maxR: 290, size: [0.8, 2.6] },
    ],
    horizon: { radius: 430, count: 16, color: 0x3a3f52, style: 'peaks' },
  },
};

/* First-mission hardening (one notch, Merlin 2026-10-23): tighter
 * rings everywhere; an extra gate where the route earns one. Applied
 * to the beat-derived first mission only — authored missions carry
 * their own numbers. Coordinates are post-spread. */
const HARDEN = {
  naboo: { targetR: 8 },
  coruscant: { targetR: 8, add: { x: -72, z: -8, r: 8, label: 'Undercity Gate' } },
  kamino: { cpR: 7, add: { x: 0, z: 88, r: 7, label: 'South Platform' } },
  geonosis: { targetR: 8 },
  mustafar: { targetR: 8 },
  'yavin-4': { targetR: 8 },
  alderaan: { targetR: 10 },
  'death-star': { cpR: 9 },
  hoth: { targetR: 8 },
  dagobah: { targetR: 7 },
  bespin: { targetR: 8 },
  endor: { cpR: 7 },
  jakku: { targetR: 8 },
  takodana: { targetR: 8 },
  starkiller: { targetR: 8 },
  'ahch-to': { targetR: 7 },
  crait: { cpR: 7 },
  exegol: { targetR: 8 },
};

/* Additional missions, one or more per world, lore-true to the place.
 * Coordinates are post-spread for walk worlds (see SPREAD note above);
 * fly worlds keep their native scale. */
const MORE_MISSIONS = {
  naboo: [
    {
      id: 'naboo-lake-country', title: 'Lake Country Crossing',
      text: 'Beyond Theed\u2019s avenues lie the lake retreats and waterfall meadows of the Lake Country. Cross the green hills and come home to the palace plaza.',
      objective: 'Cross the Lake Country to the palace plaza',
      difficulty: 2, par: 200,
      checkpoints: [
        { x: -64, z: 32, r: 8, label: 'Lake Retreat' },
        { x: 48, z: 64, r: 8, label: 'Waterfall Meadow' },
      ],
      target: { x: 0, z: -48, r: 9, label: 'Theed Palace plaza' },
    },
  ],
  coruscant: [
    {
      id: 'coruscant-senate-sprint', title: 'Senate Sprint',
      text: 'A courier\u2019s run across the Senate District: touch the Rotunda steps, dive past the skylane markets, and deliver to the Temple before the session opens.',
      objective: 'Courier run: Senate Rotunda \u2192 skylane markets \u2192 Jedi Temple',
      difficulty: 2, par: 220,
      checkpoints: [
        { x: 80, z: 22, r: 9, label: 'Senate Rotunda' },
        { x: -96, z: 32, r: 9, label: 'Skylane Markets' },
      ],
      target: { x: 0, z: -56, r: 8, label: 'Jedi Temple steps' },
    },
  ],
  kamino: [
    {
      id: 'kamino-storm-circuit', title: 'Storm Circuit',
      text: 'The aiwha trainers run the full platform ring in the teeth of the storm. Four outer platforms, in order, then home to Tipoca\u2019s landing deck.',
      objective: 'Run the outer platform ring and return to Tipoca',
      difficulty: 3, par: 200,
      checkpoints: [
        { x: 96, z: -32, r: 7, label: 'East Platform' },
        { x: 96, z: 64, r: 7, label: 'South-East Platform' },
        { x: -96, z: 64, r: 7, label: 'South-West Platform' },
        { x: -96, z: -32, r: 7, label: 'West Platform' },
      ],
      target: { x: 0, z: -16, r: 7, label: 'Tipoca Landing' },
    },
  ],
  geonosis: [
    {
      id: 'geonosis-foundry-run', title: 'Foundry Run',
      text: 'The droid foundry never sleeps. Slip in past the casting lines, out through the hive spires, and reach the arena gates before the next shift of guards.',
      objective: 'Foundry \u2192 hive spires \u2192 arena gates',
      difficulty: 2, par: 220,
      checkpoints: [
        { x: -72, z: 52, r: 8, label: 'Droid Foundry' },
        { x: -40, z: -10, r: 8, label: 'Hive Spires' },
      ],
      target: { x: 0, z: -40, r: 9, label: 'Arena gate' },
    },
  ],
  mustafar: [
    {
      id: 'mustafar-lava-bank', title: 'Lava Bank Run',
      text: 'Along the lava banks where the mining platforms harvest the flows. Falls, cooling fields and the mining shelf — mind the heat shimmer and keep to the route.',
      objective: 'Run the lava bank route to the fortress approach',
      difficulty: 3, par: 200,
      checkpoints: [
        { x: 60, z: 36, r: 8, label: 'Lava Falls' },
        { x: 36, z: -24, r: 7, label: 'Cooling Fields' },
        { x: -48, z: -4, r: 7, label: 'Mining Shelf' },
      ],
      target: { x: 0, z: -48, r: 8, label: 'Fortress approach' },
    },
  ],
  'yavin-4': [
    {
      id: 'yavin-4-jungle-patrol', title: 'Jungle Patrol',
      text: 'Rebel patrol route through the Massassi jungle: the west ruins, the river stones, the south clearing — then report at the Great Temple.',
      objective: 'Patrol the jungle waypoints and report at the temple',
      difficulty: 2, par: 220,
      checkpoints: [
        { x: -88, z: 40, r: 8, label: 'West Ruins' },
        { x: 88, z: 40, r: 8, label: 'River Stones' },
        { x: 0, z: 104, r: 9, label: 'South Clearing' },
      ],
      target: { x: 0, z: -48, r: 8, label: 'Great Temple' },
    },
  ],
  alderaan: [
    {
      id: 'alderaan-memorial-circuit', title: 'Memorial Circuit',
      text: 'A full circuit of the Graveyard in silence: three far beacons of the debris field, then the memorial itself. No chatter on the comm.',
      objective: 'Fly the memorial circuit of the debris field',
      difficulty: 2, par: 150,
      checkpoints: [
        { x: 60, z: -40, r: 14, label: 'Outer Beacon' },
        { x: -60, z: -40, r: 14, label: 'Far Beacon' },
        { x: -60, z: 50, r: 14, label: 'Home Beacon' },
      ],
      target: { x: 20, z: 20, r: 10, label: 'Memorial beacon' },
    },
  ],
  'death-star': [
    {
      id: 'death-star-hangar-escape', title: 'Hangar Escape Run',
      text: 'Your ship is impounded in Docking Bay 327 and the tractor beam is cycling. Thread the bay, the beam projector and the detention level — then dive for the reactor shaft.',
      objective: 'Escape run: docking bay \u2192 tractor beam \u2192 reactor shaft',
      difficulty: 3, par: 180,
      checkpoints: [
        { x: 30, z: 60, r: 12, label: 'Docking Bay 327' },
        { x: -30, z: 30, r: 12, label: 'Tractor Beam' },
        { x: 30, z: -30, r: 12, label: 'Detention Level' },
      ],
      target: { x: 0, z: -75, r: 10, label: 'Reactor Shaft' },
    },
  ],
  hoth: [
    {
      id: 'hoth-tauntaun-patrol', title: 'Tauntaun Patrol',
      text: 'Deck Officer\u2019s patrol: ride the ridges around Echo Base \u2014 north ridge, ice field, generator ridge \u2014 and check every sensor before the cold kills them.',
      objective: 'Patrol the ridge waypoints around Echo Base',
      difficulty: 2, par: 240,
      checkpoints: [
        { x: -96, z: -16, r: 8, label: 'North Ridge' },
        { x: -40, z: 72, r: 8, label: 'Ice Field' },
        { x: 72, z: 40, r: 8, label: 'Generator Ridge' },
      ],
      target: { x: 0, z: -48, r: 9, label: 'Echo Base gate' },
    },
    {
      id: 'hoth-generator-defence', title: 'Generator Defence',
      text: 'Imperial probes are mapping the power grid. Reach both generator stations and fall back to the hangar before the walkers crest the north ridge.',
      objective: 'Check both generators, then fall back to the hangar',
      difficulty: 3, par: 200,
      checkpoints: [
        { x: 56, z: -40, r: 7, label: 'Power Generator' },
        { x: 96, z: 8, r: 7, label: 'Shield Generator' },
      ],
      target: { x: 0, z: -64, r: 8, label: 'Echo Base hangar' },
    },
  ],
  dagobah: [
    {
      id: 'dagobah-dark-cave', title: 'The Dark Side Cave',
      text: 'Under the gnarl tree, past the sunken pool, a cave mouth breathes cold air in the middle of the swamp heat. Strong with the dark side it is. Careful, you must be.',
      objective: 'Find the cave under the great gnarl tree',
      difficulty: 2, par: 180,
      checkpoints: [
        { x: -64, z: 16, r: 7, label: 'Gnarl Tree' },
        { x: 40, z: 56, r: 7, label: 'Sunken Pool' },
      ],
      target: { x: -24, z: -48, r: 8, label: 'Cave Mouth' },
    },
  ],
  bespin: [
    {
      id: 'bespin-platform-circuit', title: 'Platform Circuit',
      text: 'The Tibanna platforms ring the city. East platform, the carbon-freezing dock, the west landing — a full circuit above the clouds at golden hour.',
      objective: 'Run the platform circuit around Cloud City',
      difficulty: 2, par: 200,
      checkpoints: [
        { x: 88, z: -24, r: 8, label: 'East Platform' },
        { x: 64, z: 72, r: 8, label: 'Carbon-Freezing Dock' },
        { x: -80, z: 40, r: 8, label: 'West Landing' },
      ],
      target: { x: 0, z: -45, r: 8, label: 'Cloud City plaza' },
    },
  ],
  endor: [
    {
      id: 'endor-bunker-assault', title: 'Bunker Assault Approach',
      text: 'Han\u2019s strike team moves at first light: rally at the Ewok village, cross the deep forest and the lake shore, and form up at the bunker approach — then hit the shield generator.',
      objective: 'Strike-team approach: village \u2192 forest \u2192 lake \u2192 bunker \u2192 generator',
      difficulty: 3, par: 240,
      checkpoints: [
        { x: 80, z: 40, r: 9, label: 'Ewok Village' },
        { x: 40, z: 110, r: 7, label: 'Deep Forest' },
        { x: -72, z: 80, r: 7, label: 'Lake Shore' },
        { x: -96, z: -16, r: 7, label: 'Bunker Approach' },
      ],
      target: { x: 0, z: -76, r: 8, label: 'Shield Generator' },
    },
  ],
  jakku: [
    {
      id: 'jakku-wreck-runner', title: 'Wreck Runner',
      text: 'A scavenger\u2019s circuit of the Graveyard: the fallen walker, the starship wrecks, the sinking fields — and back to Niima before Unkar\u2019s thugs close the gates.',
      objective: 'Run the scavenger circuit of the Graveyard',
      difficulty: 2, par: 220,
      checkpoints: [
        { x: 96, z: -40, r: 8, label: 'Fallen Walker' },
        { x: 72, z: 64, r: 8, label: 'Starship Graveyard' },
        { x: -88, z: 24, r: 8, label: 'Sinking Fields' },
      ],
      target: { x: 0, z: -45, r: 9, label: 'Niima Outpost' },
    },
  ],
  takodana: [
    {
      id: 'takodana-forest-lake', title: 'Forest & Lake Run',
      text: 'Maz\u2019s guests arrive by every path: along the lakeshore, through the forest shrine, and up to the castle courtyard. Walk the greeters\u2019 route.',
      objective: 'Walk the lakeside and forest route to the castle',
      difficulty: 2, par: 200,
      checkpoints: [
        { x: -88, z: -8, r: 8, label: 'Lakeside' },
        { x: 72, z: 48, r: 8, label: 'Forest Shrine' },
      ],
      target: { x: 0, z: -48, r: 8, label: 'Castle courtyard' },
    },
  ],
  starkiller: [
    {
      id: 'starkiller-oscillator-run', title: 'Oscillator Run',
      text: 'The thermal oscillator is the base\u2019s beating heart — and its weakness. Cross to the oscillator, sweep the forest battery, and reach the cannon approach.',
      objective: 'Oscillator \u2192 forest battery \u2192 cannon approach',
      difficulty: 3, par: 220,
      checkpoints: [
        { x: 80, z: -32, r: 8, label: 'Thermal Oscillator' },
        { x: -88, z: 16, r: 8, label: 'Forest Battery' },
      ],
      target: { x: 0, z: -56, r: 8, label: 'Cannon approach' },
    },
  ],
  'ahch-to': [
    {
      id: 'ahch-to-pilgrimage', title: 'Island Pilgrimage',
      text: 'The island\u2019s old path: the tree that holds the first texts, the steps of the first temple, and down to the village of stone huts. A thousand generations live in you now — walk like it.',
      objective: 'Walk the pilgrimage path of the first Jedi',
      difficulty: 2, par: 180,
      checkpoints: [
        { x: 56, z: 32, r: 7, label: 'The Tree Library' },
        { x: -64, z: 48, r: 7, label: 'First Temple Steps' },
      ],
      target: { x: 0, z: -40, r: 8, label: 'Jedi Village' },
    },
  ],
  crait: [
    {
      id: 'crait-salt-gauntlet', title: 'Salt Flat Gauntlet',
      text: 'Under the salt arch, along the north trenches and out over the crystal flats to the great door. The white hides the red — and the First Order is coming.',
      objective: 'Run the gauntlet: arch \u2192 trenches \u2192 crystal flats \u2192 the door',
      difficulty: 3, par: 200,
      checkpoints: [
        { x: -64, z: 48, r: 8, label: 'Salt Arch' },
        { x: 16, z: 88, r: 7, label: 'North Trenches' },
        { x: 88, z: 24, r: 7, label: 'Crystal Flats' },
      ],
      target: { x: 48, z: -40, r: 8, label: 'The Great Door' },
    },
  ],
  exegol: [
    {
      id: 'exegol-throne-descent', title: 'Throne Descent',
      text: 'Past the lightning spires and the fleet monoliths, the citadel floor gives way to the descent. At the bottom waits a throne no one was meant to sit. End this.',
      objective: 'Descend to the Sith throne',
      difficulty: 3, par: 220,
      checkpoints: [
        { x: -64, z: -48, r: 7, label: 'Lightning Spires' },
        { x: 56, z: -80, r: 7, label: 'Fleet Monoliths' },
      ],
      /* r 13, not the usual 10: the throne's dais collider is r 10.3
       * (all-worlds QA, 2026-10-23), so an r10 gate would sit inside
       * the collider and never complete. The band 10.3–13 reads as
       * standing at the dais edge. */
      target: { x: 0, z: -128, r: 13, label: 'The Sith Throne' },
    },
  ],
};

const SPREAD = 1.6;
for (const def of Object.values(PLANETS)) {
  const ex = EXPANSIONS[def.id];
  if (ex) {
    if (ex.spread && def.kind === 'walk') {
      for (const lm of def.landmarks) { lm.x *= SPREAD; lm.z *= SPREAD; }
      const b = def.beat;
      if (b) {
        if (Array.isArray(b.checkpoints)) for (const cp of b.checkpoints) { cp.x *= SPREAD; cp.z *= SPREAD; }
        if (b.target) { b.target.x *= SPREAD; b.target.z *= SPREAD; }
      }
      def.worldRadius = 340;
      def.boundsRadius = 295;
      def.ambientRadius = 150;
    }
    for (const f of ['seed', 'tex', 'groundAmp', 'scatter', 'horizon', 'boundsRadius']) {
      if (ex[f] !== undefined) def[f] = ex[f];
    }
    if (Array.isArray(ex.extraLandmarks)) def.landmarks.push(...ex.extraLandmarks);
  }
  if (!Array.isArray(def.missions) || !def.missions.length) {
    const first = { ...def.beat };
    const hz = HARDEN[def.id];
    if (hz) {
      if (Array.isArray(first.checkpoints)) {
        first.checkpoints = first.checkpoints.map((cp) => ({ ...cp }));
        if (hz.cpR) for (const cp of first.checkpoints) cp.r = hz.cpR;
      }
      if (hz.add) first.checkpoints = [...(first.checkpoints || []), { ...hz.add }];
      if (first.target && hz.targetR) first.target = { ...first.target, r: hz.targetR };
    }
    first.difficulty = (ex && ex.firstDifficulty) || 1;
    if (ex && ex.par) first.par = ex.par;
    def.missions = [first, ...(MORE_MISSIONS[def.id] || [])];
  }
  /* def.beat stays as the canonical alias of the first mission —
   * existing readers (galaxy card, crawl list, zone default) keep
   * working unchanged. */
  def.beat = def.missions[0];
}

/* ------------------------------------------------------------------ */
/* Progression helpers (pure functions)                                */
/* ------------------------------------------------------------------ */

/**
 * Fresh progress state.
 * beatsDone: { [planetId]: true } — the planet's FIRST mission is done
 *   (this is what chapter progression has always keyed on);
 * chaptersDone: [epIdx, ...] in completion order;
 * missionsDone: { [missionId]: true } — every individual mission.
 * Saves written before missions existed simply lack missionsDone;
 * loadProgress fills it in, and a beatsDone entry implies the first
 * mission is done (see isMissionDone).
 */
export function createProgress() {
  return { beatsDone: {}, chaptersDone: [], missionsDone: {} };
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

/** The first mission of a planet (its original beat), or null. */
export function firstMissionOf(planetId) {
  const def = PLANETS[planetId];
  return def && Array.isArray(def.missions) && def.missions.length ? def.missions[0] : null;
}

/** Is this mission complete? A legacy beatsDone entry counts as the
 * planet's first mission being done. */
export function isMissionDone(progress, planetId, mission) {
  if (!progress || !mission) return false;
  if (progress.missionsDone && progress.missionsDone[mission.id]) return true;
  const first = firstMissionOf(planetId);
  if (first && mission.id === first.id && progress.beatsDone && progress.beatsDone[planetId]) return true;
  return false;
}

/** { done, total } missions completed for a planet. */
export function planetMissionsDone(progress, planetId) {
  const def = PLANETS[planetId];
  const missions = def && Array.isArray(def.missions) ? def.missions : [];
  return {
    done: missions.filter((m) => isMissionDone(progress, planetId, m)).length,
    total: missions.length,
  };
}

/**
 * Mark one mission complete. Returns a NEW progress object (no mutation).
 * Completing a planet's FIRST mission also marks the planet's beat done —
 * and if every planet in the chapter is now done, appends epIdx to
 * chaptersDone. Later missions never touch chapter progression.
 */
export function completeMission(progress, planetId, missionId) {
  const missionsDone = { ...(progress.missionsDone || {}), [missionId]: true };
  const first = firstMissionOf(planetId);
  if (!first || missionId !== first.id) {
    return {
      beatsDone: { ...(progress.beatsDone || {}) },
      chaptersDone: [...(progress.chaptersDone || [])],
      missionsDone,
    };
  }
  const beatsDone = { ...progress.beatsDone, [planetId]: true };
  let chaptersDone = progress.chaptersDone;
  const epIdx = chapterIndexOf(planetId);
  if (epIdx !== -1) {
    const allDone = CHAPTERS[epIdx].planets.every((id) => beatsDone[id]);
    if (allDone && !chaptersDone.includes(epIdx)) {
      chaptersDone = [...chaptersDone, epIdx];
    }
  }
  return { beatsDone, chaptersDone, missionsDone };
}

/**
 * Mark a planet's beat complete (= its first mission). Kept for every
 * existing caller; see completeMission for the full contract.
 */
export function completeBeat(progress, planetId) {
  const first = firstMissionOf(planetId);
  return completeMission(progress, planetId, first ? first.id : `${planetId}-beat`);
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
    // Pre-mission saves have no missionsDone — fill it in, don't reset.
    if (!parsed.missionsDone || typeof parsed.missionsDone !== 'object') {
      parsed.missionsDone = {};
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
  DIFFICULTY_LABELS,
  createProgress,
  chapterIndexOf,
  isChapterUnlocked,
  isPlanetUnlocked,
  completeBeat,
  completeMission,
  isMissionDone,
  planetMissionsDone,
  firstMissionOf,
  chapterBeatsDone,
  loadProgress,
  saveProgress,
};
