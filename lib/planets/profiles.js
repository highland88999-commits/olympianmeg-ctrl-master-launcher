// lib/planets/profiles.js — seeded surface profiles for the hub's
// outer planets (Merlin, 2026-10-22: "Street level click enabled for
// all planets").
//
// generatePlanetProfile(seedEntry, planet) grows a whole surface
// region from the planet's canonical seed (lib/planets/
// planet-seeds.js) — the SAME profile shape lib/mars/engine.js
// generateMarsProfile returns, so the realm scene composition
// (components/mars/MarsScene.jsx: terrain, basins, flora, the five
// fauna niches and their driver) renders a planet unchanged. What
// differs per planet is everything the seed + life type decide:
//   - the palette, keyed to the planet's map colors
//   - the terrain wave character (ampScale in the design table)
//   - the basin names (the planet's own seas and seeps)
//   - the species catalog: names, niches, elements and diets flavored
//     by the planet's LIFE TYPE — the mesh builders stay the shared
//     Mars families, exactly as briefed (flavor only, no new rigs)
//   - the vitals (real gravity / temperature / pressure, as flavor)
//
// Deterministic: same seed entry -> identical profile, every time.
// The draw order below is FIXED (mirroring the Mars generator's
// structure); changing it re-grows every planet's surface.
import { SeedRNG } from '../mars/engine.js';

// --- per-planet design -------------------------------------------------------
// Hues are degrees. sat ranges exist because two planets are defined
// by LOW saturation: Tempest (monochrome storm) and Mercury (ash).
const PLANET_DESIGN = {
  jupiter: {
    name: 'Jupiter',
    epithets: ['Cloudsea', 'Bandcurrent', 'Great', 'Amber'],
    baseHue: [26, 40], skyHue: [32, 44], nightHue: [258, 282], waterHue: [168, 192],
    ampScale: 0.9,
    gravity: '2.53 G', surfaceTemp: '-108 °C', atmosPressure: '1.0 atm at the cloud deck',
    basinLabels: ['Ammonia Band Sea', 'Golden Seep', 'The Great Drift'],
  },
  saturn: {
    name: 'Saturn',
    epithets: ['Ringlit', 'Palegold', 'Titan', 'Quiet'],
    baseHue: [40, 50], skyHue: [42, 52], nightHue: [250, 275], waterHue: [130, 158],
    ampScale: 0.7,
    gravity: '1.07 G', surfaceTemp: '-139 °C', atmosPressure: '1.4 atm',
    basinLabels: ['Pale Gold Shallows', 'Ringmetal Seep', 'Titan Pool'],
  },
  neptune: {
    name: 'Neptune',
    epithets: ['Lightless', 'Cobalt', 'Deep', 'Silent'],
    baseHue: [206, 222], skyHue: [208, 224], nightHue: [228, 248], waterHue: [182, 200],
    ampScale: 0.8,
    gravity: '1.14 G', surfaceTemp: '-201 °C', atmosPressure: 'deep-ocean pressure',
    basinLabels: ['The Ammonia Deep', 'Pressure Seep', 'Convergence Trench'],
  },
  uranus: {
    name: 'Uranus',
    epithets: ['Icegrove', 'Pale', 'Network', 'Cyan'],
    baseHue: [180, 194], skyHue: [182, 196], nightHue: [215, 238], waterHue: [164, 182],
    ampScale: 0.75,
    gravity: '0.89 G', surfaceTemp: '-195 °C', atmosPressure: '1.2 atm',
    basinLabels: ['Cyan Thaw Sea', 'Fungal Seep', 'Spore Pool'],
  },
  venus: {
    name: 'Venus',
    epithets: ['Sulphur', 'Ember', 'Crushing', 'Veiled'],
    baseHue: [38, 50], skyHue: [40, 52], nightHue: [24, 44], waterHue: [26, 42],
    ampScale: 1.0,
    gravity: '0.90 G', surfaceTemp: '464 °C', atmosPressure: '92 atm — crushing',
    basinLabels: ['Sulphur Sea', 'Magma Seep', 'Vent Pool'],
  },
  tempest: {
    name: 'Tempest',
    epithets: ['Monochrome', 'Stormbound', 'Gray', 'Howling'],
    baseHue: [208, 228], skyHue: [210, 230], nightHue: [220, 240], waterHue: [200, 220],
    skySat: [4, 12], groundSat: [4, 13], ampScale: 1.6,
    gravity: '1.31 G', surfaceTemp: '-63 °C', atmosPressure: '0.9 atm, permanent storm',
    basinLabels: ['Storm Surge Basin', 'Charged Seep', 'Eye Pool'],
  },
  vesta: {
    name: 'Vesta',
    epithets: ['Rose', 'Hive', 'Brood', 'Velvet'],
    baseHue: [6, 18], skyHue: [8, 20], nightHue: [318, 340], waterHue: [322, 342],
    ampScale: 0.85,
    gravity: '0.25 G', surfaceTemp: '-100 °C', atmosPressure: 'trace — near vacuum',
    basinLabels: ['Rose Brine Lake', 'Hive Seep', 'Brood Pool'],
  },
  mercury: {
    name: 'Mercury',
    epithets: ['Ashen', 'Radiant', 'Terminator', 'Iron'],
    baseHue: [30, 44], skyHue: [34, 48], nightHue: [230, 250], waterHue: [205, 222],
    skySat: [6, 14], groundSat: [5, 12], ampScale: 0.8,
    gravity: '0.38 G', surfaceTemp: '167 °C (dayside)', atmosPressure: 'trace — near vacuum',
    basinLabels: ['Terminator Melt', 'Iron Seep', 'Ash Pool'],
  },
};

// Fallback for any PLANETS key without a design row: a neutral blue
// world rather than a crash — the registry test pins that all eight
// real planets have designs, so this is belt-and-braces only.
const FALLBACK_DESIGN = {
  name: 'Unknown',
  epithets: ['Distant', 'Quiet'],
  baseHue: [200, 220], skyHue: [200, 220], nightHue: [240, 260], waterHue: [170, 195],
  ampScale: 1.0,
  gravity: '1.00 G', surfaceTemp: '-40 °C', atmosPressure: '1.0 atm',
  basinLabels: ['First Sea', 'Metal Seep', 'Convergence Pool'],
};

// --- life flavor ---------------------------------------------------------------
// Per life type: the biomes a surface can be, the genus syllables its
// species are named from, and the niche/element/diet voice of each of
// the five fauna niches. The BUILDERS are the shared Mars families —
// this table is names and behavior flavor only, per the brief.
const LIFE_FLAVOR = {
  'terran-biosphere': {
    biomes: ['Living Expanse', 'Green Reach', 'Wild Basin'],
    genus1: ['Terra', 'Verdi', 'Fauno', 'Silva', 'Prato', 'Flora', 'Borea', 'Vivo'],
    genus2: ['walker', 'grazer', 'bloom', 'runner', 'wing', 'crawler', 'herd', 'shade'],
    niches: {
      airborne: { niche: 'Sky Grazer', element: 'Air / Aether', diet: 'High meadows of airborne seed and spore' },
      grazer: { niche: 'Terrestrial Grazer', element: 'Earth / Flora', diet: 'Grasses, fruit and living ground cover' },
      carnivore: { niche: 'Apex Predator', element: 'Chitin / Thermal', diet: 'Active hunter of terrestrial grazers' },
      waterBorne: { niche: 'Water-Borne Swimmer', element: 'Water / Bioluminescence', diet: 'River and lake micro-fauna' },
      mercuryBorne: { niche: 'Metal-Heart Symbiote', element: 'Liquid Metal / Magnetism', diet: 'Surface-tension metals and magnetic flux' },
    },
  },
  'microbial-mat': {
    biomes: ['Ancient Lakebed Mats', 'Rust Flats', 'Brine Margins'],
    genus1: ['Stromato', 'Micro', 'Crypto', 'Endo', 'Litho', 'Halo', 'Photo', 'Chemo'],
    genus2: ['mat', 'film', 'bloom', 'crust', 'veil', 'colony', 'sheet', 'garden'],
    niches: {
      airborne: { niche: 'Spore-Drift Glider', element: 'Air / Spore', diet: 'Airborne cells shed by the great mats' },
      grazer: { niche: 'Mat Grazer', element: 'Earth / Bio-Film', diet: 'Living microbial mats at the brine margins' },
      carnivore: { niche: 'Mat Harvester', element: 'Chitin / Thermal', diet: 'Hunts grazers across the mat fields' },
      waterBorne: { niche: 'Brine Swimmer', element: 'Water / Bioluminescence', diet: 'Brine-shrimp analogues and mat plankton' },
      mercuryBorne: { niche: 'Quicksilver Symbiote', element: 'Liquid Metal / Magnetism', diet: 'Heavy metals pooled in the seeps' },
    },
  },
  'aerial-plankton': {
    biomes: ['Plankton Bloom Deck', 'Band-Current Reaches', 'Storm-Shear Shallows', 'The Cream Expanse'],
    genus1: ['Aero', 'Plankto', 'Strato', 'Nebulo', 'Cumulo', 'Vento', 'Halo', 'Drifto'],
    genus2: ['manta', 'veil', 'bloom', 'sail', 'drift', 'whale', 'kite', 'swarm'],
    niches: {
      airborne: { niche: 'Aerial Plankton Grazer', element: 'Air / Plankton', diet: 'Filter-feeds on living plankton blooms' },
      grazer: { niche: 'Low-Band Grazer', element: 'Air / Cream-Band', diet: 'Skims plankton mats along the band currents' },
      carnivore: { niche: 'Apex Storm Hunter', element: 'Storm / Chitin', diet: 'Hunts plankton grazers in the shear zones' },
      waterBorne: { niche: 'Ammonia-Sea Swimmer', element: 'Ammonia / Bioluminescence', diet: 'Ammonia-sea micro-fauna' },
      mercuryBorne: { niche: 'Metal-Heart Symbiote', element: 'Liquid Metal / Magnetism', diet: 'Magnetic flux in the deep bands' },
    },
  },
  'photosynthetic-titan': {
    biomes: ['Titan Meadow', 'Ring-Light Shallows', 'Pale Gold Expanse', 'Sail-Forest Reach'],
    genus1: ['Photo', 'Helio', 'Titano', 'Lumeno', 'Auro', 'Sola', 'Verdi', 'Grand'],
    genus2: ['titan', 'sail', 'bloom', 'tower', 'moth', 'crown', 'herd', 'spire'],
    scales: { grazer: [1.6, 2.2] },
    niches: {
      airborne: { niche: 'Sun-Sail Drifter', element: 'Light / Aether', diet: 'Photosynthesis and ring-shine spores' },
      grazer: { niche: 'Photosynthetic Titan Grazer', element: 'Light / Flora', diet: 'Sun-drinking across the pale shallows' },
      carnivore: { niche: 'Dusk Titan-Stalker', element: 'Chitin / Shadow', diet: 'Hunts young titans at ring-set' },
      waterBorne: { niche: 'Shallows Light-Eel', element: 'Water / Light', diet: 'Algae and light-kelp of the gold shallows' },
      mercuryBorne: { niche: 'Ring-Shadow Symbiote', element: 'Liquid Metal / Magnetism', diet: 'Magnetic dust sifted from the rings' },
    },
  },
  'ammonia-aquatic': {
    biomes: ['The Lightless Deep', 'Ammonia Trench Fields', 'Cobalt Expanse', 'Pressure Gardens'],
    genus1: ['Abyssal', 'Nepto', 'Pelago', 'Bary', 'Cobalt', 'Hydro', 'Nereo', 'Profundo'],
    genus2: ['eel', 'leviathan', 'ray', 'serpent', 'bloom', 'drifter', 'maw', 'fin'],
    niches: {
      airborne: { niche: 'Storm-Petrel Glider', element: 'Air / Storm', diet: 'Wind-borne ammonia motes above the swell' },
      grazer: { niche: 'Abyssal Mat Grazer', element: 'Water / Abyss', diet: 'Ammonia mats on the dark floor' },
      carnivore: { niche: 'Apex Deep Leviathan', element: 'Water / Chitin', diet: 'Hunts in the lightless blue' },
      waterBorne: { niche: 'Ammonia-Sea Swimmer', element: 'Ammonia / Bioluminescence', diet: 'Glowing micro-fauna of the deep sea' },
      mercuryBorne: { niche: 'Pressure-Core Symbiote', element: 'Liquid Metal / Pressure', diet: 'Heavy-element flux at crushing depth' },
    },
  },
  'fungal-network': {
    biomes: ['Ice-Grove Expanse', 'The Great Network', 'Sporefall Flats', 'Cyan Thawlands'],
    genus1: ['Myco', 'Sporo', 'Hyphal', 'Gloeo', 'Veluto', 'Crypto', 'Rhizo', 'Fungo'],
    genus2: ['veil', 'mat', 'treader', 'bloom', 'spire', 'drifter', 'cap', 'root'],
    niches: {
      airborne: { niche: 'Spore-Drift Medusa', element: 'Air / Spore', diet: 'Airborne spores of the great network' },
      grazer: { niche: 'Grove-Treader Grazer', element: 'Fungi / Ice', diet: 'Fruiting bodies of the ice groves' },
      carnivore: { niche: 'Pale Network Stalker', element: 'Fungi / Chitin', diet: 'Ambushes grazers between the groves' },
      waterBorne: { niche: 'Thaw-Channel Swimmer', element: 'Water / Spore', diet: 'Micro-fungi in the cyan thaw channels' },
      mercuryBorne: { niche: 'Network-Heart Symbiote', element: 'Liquid Metal / Fungi', diet: 'Mineral flux along the mycelial veins' },
    },
  },
  'chemosynthetic-deep': {
    biomes: ['Sulphur Vent Fields', 'The Crushing Deep', 'Acid Shallows', 'Ember Expanse'],
    genus1: ['Chemo', 'Thio', 'Pyro', 'Sulfo', 'Venti', 'Acido', 'Thermo', 'Ember'],
    genus2: ['vent', 'maw', 'crawler', 'bloom', 'spire', 'serpent', 'mat', 'drill'],
    niches: {
      airborne: { niche: 'Acid-Cloud Sailer', element: 'Air / Acid', diet: 'Sulphur motes in the acid clouds' },
      grazer: { niche: 'Vent-Field Grazer', element: 'Sulphur / Heat', diet: 'Sulphur crusts around the deep vents' },
      carnivore: { niche: 'Ember Vent Stalker', element: 'Fire / Chitin', diet: 'Hunts the vent fields in the heat haze' },
      waterBorne: { niche: 'Sulphur-Sea Swimmer', element: 'Acid / Bioluminescence', diet: 'Chemosynthetic micro-fauna' },
      mercuryBorne: { niche: 'Magma-Vein Symbiote', element: 'Liquid Metal / Fire', diet: 'Molten metal flux beneath the crust' },
    },
  },
  'silicon-crystal': {
    biomes: ['The Monochrome Lattice', 'Storm-Band Reaches', 'Shard Expanse', 'Eye of the Tempest'],
    genus1: ['Silico', 'Crysto', 'Litho', 'Prismo', 'Quarzo', 'Vitreo', 'Strato', 'Fulmi'],
    genus2: ['shard', 'lattice', 'spire', 'glider', 'treader', 'prism', 'fang', 'bloom'],
    niches: {
      airborne: { niche: 'Stormglass Glider', element: 'Air / Crystal', diet: 'Charged crystal dust in the storm bands' },
      grazer: { niche: 'Lattice Treader', element: 'Silicon / Storm', diet: 'Storm-deposited lattice shards' },
      carnivore: { niche: 'Shardfang Hunter', element: 'Crystal / Chitin', diet: 'Hunts treaders in the gray wastes' },
      waterBorne: { niche: 'Gray-Sea Swimmer', element: 'Water / Storm', diet: 'Ion-rich micro-fauna of the gray seas' },
      mercuryBorne: { niche: 'Storm-Core Symbiote', element: 'Liquid Metal / Storm', diet: 'Lightning-fed magnetic flux' },
    },
  },
  'hive-insectoid': {
    biomes: ['Rose-Rock Hivefields', 'Brood Canyon', 'Resin Flats', "The Queen's Expanse"],
    genus1: ['Api', 'Formi', 'Vespi', 'Chitino', 'Regina', 'Hexa', 'Alvo', 'Myrmi'],
    genus2: ['scout', 'strider', 'blade', 'drone', 'mat', 'wing', 'burrow', 'crown'],
    niches: {
      airborne: { niche: 'Hive Sky Scout', element: 'Air / Hive', diet: 'Scouts nectar blooms for the hive' },
      grazer: { niche: 'Hive Worker Grazer', element: 'Flora / Hive', diet: 'Rose-rock pollen and resin' },
      carnivore: { niche: 'Hive Soldier-Caste', element: 'Chitin / Hive', diet: 'Defends the burrows; hunts stray grazers' },
      waterBorne: { niche: 'Brine-Channel Swimmer', element: 'Water / Hive', diet: 'Rose-brine micro-fauna' },
      mercuryBorne: { niche: 'Hive-Heart Symbiote', element: 'Liquid Metal / Hive', diet: "Metal flux in the queen's chamber" },
    },
  },
  'radiotroph': {
    biomes: ['The Terminator Line', 'Radiation Gardens', 'Ash Expanse', 'Solar Flare Fields'],
    genus1: ['Radio', 'Actino', 'Helio', 'Fisso', 'Gamma', 'Photo', 'Nucleo', 'Cinero'],
    genus2: ['moth', 'mat', 'bloom', 'grazer', 'fang', 'drifter', 'film', 'spire'],
    niches: {
      airborne: { niche: 'Solar Radiation Drifter', element: 'Air / Radiation', diet: 'Solar wind and radiation blooms' },
      grazer: { niche: 'Radiotroph Film Grazer', element: 'Radiation / Ash', diet: 'Radiation-fed ash films' },
      carnivore: { niche: 'Terminator Stalker', element: 'Chitin / Radiation', diet: 'Hunts along the day-night line' },
      waterBorne: { niche: 'Metal-Sea Swimmer', element: 'Metal / Bioluminescence', diet: 'Liquid-metal micro-fauna' },
      mercuryBorne: { niche: 'Iron-Heart Symbiote', element: 'Liquid Metal / Radiation', diet: 'Pure magnetic flux at the core' },
    },
  },
};

// Same niche suffixes the Mars taxonomy uses, so a creature's name
// reads its niche the same way on every world.
const NICHE_SUFFIX = {
  airborne: 'Volans',
  grazer: 'Herbivora',
  carnivore: 'Vorax',
  waterBorne: 'Pelagica',
  mercuryBorne: 'Metallum',
};
const NICHE_ORDER = ['airborne', 'grazer', 'carnivore', 'waterBorne', 'mercuryBorne'];

/**
 * Grow a planet's surface profile from its registry seed entry.
 * @param {{key:string, seed:string, lifeType:string, lifeLabel:string}} seedEntry
 * @param {{key:string}} planet — the lib/god-orbits.js PLANETS row.
 * Returns the Mars profile shape (see lib/mars/engine.js) plus
 * planetKey / planetName / lifeType / lifeLabel so consoles can
 * present the world without a second lookup.
 */
export function generatePlanetProfile(seedEntry, planet) {
  const design = PLANET_DESIGN[planet.key] || { ...FALLBACK_DESIGN, name: planet.key };
  const flavor = LIFE_FLAVOR[seedEntry.lifeType] || LIFE_FLAVOR['terran-biosphere'];
  const rng = new SeedRNG(seedEntry.seed);

  const worldName = `${rng.pick(design.epithets)} ${design.name} [${seedEntry.seed.slice(0, 8).toUpperCase()}]`;
  const biomeClass = rng.pick(flavor.biomes);

  // Elemental composition — same six-weight draw as Mars.
  const rawWeights = [
    rng.range(12, 40), rng.range(12, 40), rng.range(10, 35),
    rng.range(15, 45), rng.range(18, 48), rng.range(10, 38),
  ];
  const totalW = rawWeights.reduce((a, b) => a + b, 0);
  const elements = {
    earth: Math.round((rawWeights[0] / totalW) * 100),
    air: Math.round((rawWeights[1] / totalW) * 100),
    fire: Math.round((rawWeights[2] / totalW) * 100),
    water: Math.round((rawWeights[3] / totalW) * 100),
    mercury: Math.round((rawWeights[4] / totalW) * 100),
    aether: Math.round((rawWeights[5] / totalW) * 100),
  };

  // Palette — anchored on the planet's map hues (design table).
  const baseHue = rng.range(design.baseHue[0], design.baseHue[1]);
  const compHue = (baseHue + rng.range(110, 220)) % 360;
  const accentHue = (baseHue + rng.range(50, 100)) % 360;
  const skySat = design.skySat || [45, 65];
  const groundSat = design.groundSat || [38, 58];

  const daySkyColor = rng.colorHSL(design.skyHue[0], design.skyHue[1], skySat[0], skySat[1], 55, 72);
  const dayHorizonColor = rng.colorHSL(design.skyHue[0] + 4, design.skyHue[1] + 8, skySat[0] + 5, skySat[1] + 5, 42, 58);
  const nightSkyColor = rng.colorHSL(design.nightHue[0], design.nightHue[1], 25, 45, 3, 7);
  const nightHorizonColor = rng.colorHSL(design.nightHue[0] + 8, design.nightHue[1] + 10, 20, 40, 6, 12);
  const groundColor = rng.colorHSL(baseHue, baseHue + 12, groundSat[0], groundSat[1], 14, 26);
  const groundAccentColor = rng.colorHSL(baseHue + 4, baseHue + 18, Math.min(groundSat[0] + 8, 90), Math.min(groundSat[1] + 12, 95), 26, 40);
  const waterColor = rng.colorHSL(design.waterHue[0], design.waterHue[1], 55, 80, 30, 45);

  // Basins — same geometry/draw pattern as Mars, the planet's own
  // names. One liquid sea ('water'), one metal seep ('mercury' — the
  // scene renders it as a chrome pool with levitating droplets), one
  // convergence pool that can be either.
  const basins = [
    {
      id: 'water_main', type: 'water', label: design.basinLabels[0],
      x: -26, z: -16, radius: rng.range(18, 22), level: -0.35, depth: -2.4,
      color: '#' + waterColor.getHexString(),
    },
    {
      id: 'mercury_main', type: 'mercury', label: design.basinLabels[1],
      x: 26, z: -14, radius: rng.range(17, 21), level: -0.3, depth: -2.1,
      color: '#e8e2d6',
    },
    {
      id: 'water_south', type: rng.next() > 0.45 ? 'mercury' : 'water', label: design.basinLabels[2],
      x: rng.range(-10, 10), z: 27, radius: rng.range(14, 17), level: -0.32, depth: -2.2,
      color: '#' + waterColor.getHexString(),
    },
  ];

  // Species — one per niche, named and voiced by the life type; the
  // structural draws (wings, legs, segments, rings, scale) mirror
  // the Mars catalog field-for-field so buildFaunaGroup renders
  // them unchanged.
  const speciesFor = (niche) => {
    const f = flavor.niches[niche];
    const spec = {
      name: `${rng.pick(flavor.genus1)}${rng.pick(flavor.genus2)} ${NICHE_SUFFIX[niche]}`,
      niche: f.niche,
      element: f.element,
      diet: f.diet,
      primaryColor: '#' + rng.colorHSL(accentHue, accentHue + 40, 70, 92, 42, 60).getHexString(),
      secondaryColor: '#' + rng.colorHSL(compHue, compHue + 30, 75, 98, 55, 72).getHexString(),
    };
    if (niche === 'airborne') {
      spec.wingCount = rng.int(2, 4);
      spec.bodyStyle = rng.pick(['manta', 'medusa', 'serpent']);
    } else if (niche === 'grazer') {
      spec.legPairs = rng.int(2, 4);
      spec.domeStyle = rng.pick(['carapace', 'crystal_back', 'tri_horn']);
    } else if (niche === 'carnivore') {
      spec.eyeCount = rng.int(3, 6);
      spec.tailSpikes = rng.int(3, 5);
    } else if (niche === 'waterBorne') {
      spec.segments = rng.int(4, 7);
    } else if (niche === 'mercuryBorne') {
      spec.orbitalRings = rng.int(2, 4);
      spec.primaryColor = '#f8fafc';
    }
    const scaleRange = (flavor.scales && flavor.scales[niche]) || [0.85, 1.3];
    spec.scale = rng.range(scaleRange[0], scaleRange[1]);
    return spec;
  };
  const speciesCatalog = {};
  for (const niche of NICHE_ORDER) speciesCatalog[niche] = speciesFor(niche);

  return {
    seed: seedEntry.seed,
    planetKey: planet.key,
    planetName: design.name,
    lifeType: seedEntry.lifeType,
    lifeLabel: seedEntry.lifeLabel,
    worldName,
    biomeClass,
    elements,
    gravity: design.gravity,
    surfaceTemp: design.surfaceTemp,
    atmosPressure: design.atmosPressure,
    sunsCount: 1,
    ringsPresent: !!planet.rings,
    freq1: rng.range(0.032, 0.055),
    freq2: rng.range(0.06, 0.095),
    amp1: rng.range(2.2, 4.4) * design.ampScale,
    amp2: rng.range(1.1, 2.3) * design.ampScale,
    phaseX: rng.range(0, 10),
    phaseZ: rng.range(0, 10),
    daySkyColor,
    dayHorizonColor,
    nightSkyColor,
    nightHorizonColor,
    groundColor,
    groundAccentColor,
    waterColor,
    basins,
    speciesCatalog,
    counts: {
      flora: rng.int(75, 105),
      airborne: rng.int(10, 15),
      grazers: rng.int(10, 14),
      carnivores: rng.int(4, 7),
      waterBorne: rng.int(9, 13),
      mercuryBorne: rng.int(8, 12),
    },
  };
}

/** Has this PLANETS key got a full design row? (Registry-test pin.) */
export function hasPlanetDesign(key) {
  return Object.prototype.hasOwnProperty.call(PLANET_DESIGN, key);
}

export { PLANET_DESIGN };
