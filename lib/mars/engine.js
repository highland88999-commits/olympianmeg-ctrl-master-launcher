// MARS — seeded exobiology world engine.
// Pure logic port of the Xenogenesis 360° world seed generator, reskinned
// for the Martian surface: deterministic SeedRNG (xmur3 + mulberry32),
// terrain height field, and generateMarsProfile() which produces the same
// profile shape as the original generator — rust-band palette, one sun,
// near-Martian gravity/pressure — from any seed string.
// No React, no network, no DOM: safe to import from tests and the scene.
import * as THREE from 'three';

// --- deterministic PRNG (ported faithfully) --------------------------------
function xmur3(str) {
  for (var i = 0, h = 1779033703 ^ str.length; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function mulberry32(a) {
  return function () {
    var t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class SeedRNG {
  constructor(seedStr) {
    this.seedStr = String(seedStr || 'MUSE-OMEGA-77');
    const seedFunc = xmur3(this.seedStr);
    this.rand = mulberry32(seedFunc());
  }
  next() {
    return this.rand();
  }
  range(min, max) {
    return min + this.rand() * (max - min);
  }
  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }
  pick(arr) {
    return arr[Math.floor(this.rand() * arr.length)];
  }
  colorHSL(hMin, hMax, sMin, sMax, lMin, lMax) {
    const h = this.range(hMin, hMax) / 360;
    const s = this.range(sMin, sMax) / 100;
    const l = this.range(lMin, lMax) / 100;
    const c = new THREE.Color();
    c.setHSL((h + 1) % 1, s, l);
    return c;
  }
}

// --- terrain height field (ported faithfully) ------------------------------
// Basins flatten toward their depth; elsewhere two seeded wave trains plus
// a fixed swell, with a gentle outer crater rim past radius 62.
export function getTerrainHeight(x, z, profile) {
  const dist = Math.sqrt(x * x + z * z);
  // Flatten basins where elemental lakes exist
  for (let i = 0; i < profile.basins.length; i++) {
    const b = profile.basins[i];
    const dx = x - b.x;
    const dz = z - b.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < b.radius * 1.25) {
      const factor = Math.max(0, (d - b.radius * 0.75) / (b.radius * 0.5));
      const smooth = factor * factor * (3 - 2 * factor);
      const rawH = computeRawWaves(x, z, dist, profile);
      return THREE.MathUtils.lerp(b.depth, rawH, smooth);
    }
  }
  return computeRawWaves(x, z, dist, profile);
}

export function computeRawWaves(x, z, dist, profile) {
  const f1 = profile.freq1;
  const f2 = profile.freq2;
  let h =
    Math.sin(x * f1 + profile.phaseX) * Math.cos(z * f1 + profile.phaseZ) * profile.amp1 +
    Math.sin((x + z) * f2 - profile.phaseX) * profile.amp2 +
    Math.cos(x * 0.08 - z * 0.06) * 0.85;
  // Gentle outer crater rim
  if (dist > 62) {
    h += Math.pow((dist - 62) * 0.14, 1.5);
  }
  return Math.max(-1.8, h);
}

// --- world profile -----------------------------------------------------------
// Same return shape as the original generateWorldProfile, reskinned to
// Mars: rust-band hues (the seed's 0-360 draw mapped into ~6-38), pale
// butterscotch day sky, near-black warm-plum night, deep-teal brine as the
// one cool accent, quicksilver kept silver.
export function generateMarsProfile(seedString) {
  const rng = new SeedRNG(seedString);

  const prefixes = ['Tharsis', 'Elysium', 'Hellas', 'Valles', 'Syrtis', 'Meridiani', 'Arcadia', 'Utopia', 'Acidalia', 'Noachis', 'Arabia', 'Olympus'];
  const suffixes = ['Prime', 'Minor', 'Majoris', 'Basin', 'Reach', 'Deep', 'Expanse'];
  const biomeTypes = [
    'Regolith Basin & Dust Flats',
    'Caldera Field',
    'Canyon System',
    'Ancient Lakebed',
    'Polar Margin',
    'Dune Sea'
  ];

  const worldName = `${rng.pick(prefixes)}-${rng.pick(suffixes)} [${seedString.slice(0, 8).toUpperCase()}]`;
  const biomeClass = rng.pick(biomeTypes);

  // Elemental composition percentages (Earth, Air, Fire, Water, Mercury/Metal, Aether)
  const rawWeights = [
    rng.range(12, 40), // Earth (Crystalline/Silicon)
    rng.range(12, 40), // Air (Atmospheric/Gas/Spore)
    rng.range(10, 35), // Fire (Thermal/Pyro/Plasma)
    rng.range(15, 45), // Water (Brine/Hydro-kelp)
    rng.range(18, 48), // Mercury (Liquid Quicksilver/Ferro-life)
    rng.range(10, 38)  // Aether (Bioluminescence/Psionic)
  ];
  const totalW = rawWeights.reduce((a, b) => a + b, 0);
  const elements = {
    earth: Math.round((rawWeights[0] / totalW) * 100),
    air: Math.round((rawWeights[1] / totalW) * 100),
    fire: Math.round((rawWeights[2] / totalW) * 100),
    water: Math.round((rawWeights[3] / totalW) * 100),
    mercury: Math.round((rawWeights[4] / totalW) * 100),
    aether: Math.round((rawWeights[5] / totalW) * 100)
  };

  // Mars palette anchor: base hue lives in the rust band.
  const baseHue = 6 + rng.range(0, 32);
  const compHue = (baseHue + rng.range(110, 220)) % 360;
  const accentHue = (baseHue + rng.range(50, 100)) % 360;

  const daySkyColor = rng.colorHSL(baseHue, baseHue + 14, 45, 65, 55, 72);
  const dayHorizonColor = rng.colorHSL(baseHue + 6, baseHue + 22, 50, 70, 42, 58);
  const nightSkyColor = rng.colorHSL(275, 300, 25, 45, 3, 7);
  const nightHorizonColor = rng.colorHSL(285, 310, 20, 40, 6, 12);

  const groundColor = rng.colorHSL(baseHue, baseHue + 12, 38, 58, 14, 24);
  const groundAccentColor = rng.colorHSL(baseHue + 4, baseHue + 18, 45, 70, 24, 38);
  const waterColor = rng.colorHSL(168, 192, 55, 80, 30, 45);

  // Define 3 distinct basins on the surface:
  // Basin 0: Ancient brine lake (water)
  // Basin 1: Quicksilver seep (liquid mercury)
  // Basin 2: Convergence pool (secondary water or mercury)
  const basins = [
    {
      id: 'water_main',
      type: 'water',
      label: 'Ancient Brine Lake',
      x: -26,
      z: -16,
      radius: rng.range(18, 22),
      level: -0.35,
      depth: -2.4,
      color: '#' + waterColor.getHexString()
    },
    {
      id: 'mercury_main',
      type: 'mercury',
      label: 'Quicksilver Seep',
      x: 26,
      z: -14,
      radius: rng.range(17, 21),
      level: -0.3,
      depth: -2.1,
      color: '#e8e2d6'
    },
    {
      id: 'water_south',
      type: rng.next() > 0.45 ? 'mercury' : 'water',
      label: 'Convergence Pool',
      x: rng.range(-10, 10),
      z: 27,
      radius: rng.range(14, 17),
      level: -0.32,
      depth: -2.2,
      color: '#' + waterColor.getHexString()
    }
  ];

  // Procedural Species Taxonomy Generator (exobiology catalog, unchanged
  // in shape from the original — alien life seeded onto Mars).
  const genusSyl1 = ['Aero', 'veloci', 'Chromo', 'Ferro', 'Hydro', 'Pyro', 'Litho', 'Myco', 'Xeno', 'strato', 'Abyssal', 'Argent', 'Silico'];
  const genusSyl2 = ['manta', 'strider', 'stalker', 'serpens', 'medusa', 'drifter', 'rex', 'chela', 'carapace', 'glider', 'morph', 'kelp'];

  const speciesCatalog = {
    airborne: {
      name: `${rng.pick(genusSyl1)}${rng.pick(genusSyl2)} Volans`,
      niche: 'Airborne Sky-Leviathan & Spore Glider',
      element: 'Air / Aether / Plasma',
      diet: 'Ionized Atmospheric Plankton & Thermal Updrafts',
      primaryColor: '#' + rng.colorHSL(accentHue, accentHue + 40, 75, 95, 55, 70).getHexString(),
      secondaryColor: '#' + rng.colorHSL(compHue, compHue + 30, 80, 100, 60, 75).getHexString(),
      wingCount: rng.int(2, 4),
      bodyStyle: rng.pick(['manta', 'medusa', 'serpent']),
      scale: rng.range(0.9, 1.35)
    },
    grazer: {
      name: `${rng.pick(genusSyl1)}${rng.pick(genusSyl2)} Herbivora`,
      niche: 'Terrestrial Flora Grazer',
      element: 'Earth / Silicon / Bio-Flora',
      diet: 'Crystalline Spore-Pods & Bioluminescent Fungi',
      primaryColor: '#' + rng.colorHSL(baseHue + 60, baseHue + 110, 60, 85, 42, 58).getHexString(),
      secondaryColor: '#' + rng.colorHSL(accentHue, accentHue + 40, 85, 100, 58, 72).getHexString(),
      legPairs: rng.int(2, 4),
      domeStyle: rng.pick(['carapace', 'crystal_back', 'tri_horn']),
      scale: rng.range(0.85, 1.25)
    },
    carnivore: {
      name: `${rng.pick(genusSyl1)}${rng.pick(genusSyl2)} Vorax`,
      niche: 'Apex Biomechanical Predator',
      element: 'Fire / Chitin / Thermal',
      diet: 'Active Hunter of Terrestrial Grazers',
      primaryColor: '#' + rng.colorHSL(0, 35, 75, 95, 32, 48).getHexString(),
      secondaryColor: '#' + rng.colorHSL(35, 65, 90, 100, 55, 68).getHexString(),
      eyeCount: rng.int(3, 6),
      tailSpikes: rng.int(3, 5),
      scale: rng.range(1.0, 1.35)
    },
    waterBorne: {
      name: `${rng.pick(genusSyl1)}${rng.pick(genusSyl2)} Pelagica`,
      niche: 'Water-Borne Hydro-Swimmer',
      element: 'Water / Brine / Bioluminescence',
      diet: 'Sub-Surface Hydro-Kelp & Thermal Micro-Fauna',
      primaryColor: '#' + rng.colorHSL(175, 225, 80, 100, 50, 68).getHexString(),
      secondaryColor: '#' + rng.colorHSL(280, 330, 85, 100, 62, 78).getHexString(),
      segments: rng.int(4, 7),
      scale: rng.range(0.8, 1.2)
    },
    mercuryBorne: {
      name: `Hydrargyrum ${rng.pick(genusSyl2)} Metallum`,
      niche: 'Mercury-Borne Quicksilver Symbiote',
      element: 'Liquid Mercury (Hg) / Electromagnetism',
      diet: 'Surface-Tension Heavy Metals & Magnetic Flux',
      primaryColor: '#f8fafc',
      secondaryColor: '#' + rng.colorHSL(compHue, compHue + 40, 85, 100, 60, 75).getHexString(),
      orbitalRings: rng.int(2, 4),
      scale: rng.range(0.85, 1.25)
    }
  };

  return {
    seed: seedString,
    worldName,
    biomeClass,
    elements,
    gravity: (0.36 + rng.range(0, 0.05)).toFixed(2) + ' G',
    surfaceTemp: rng.int(-95, 18) + ' °C',
    atmosPressure: rng.range(0.004, 0.009).toFixed(3) + ' atm',
    sunsCount: 1,
    ringsPresent: false,
    freq1: rng.range(0.032, 0.055),
    freq2: rng.range(0.06, 0.095),
    amp1: rng.range(2.2, 4.4),
    amp2: rng.range(1.1, 2.3),
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
      mercuryBorne: rng.int(8, 12)
    }
  };
}
