// The Pearl — authored celestial target catalog.
// All facts are written in-house. No external API, no remote catalogs.

export const TARGETS = [
  {
    id: 'andromeda',
    name: 'Andromeda Galaxy',
    catalog: 'M31',
    kind: 'spiral',
    type: 'Barred spiral galaxy',
    distance: '2.537 million light-years',
    fact: 'Our nearest large galactic neighbor, holding roughly a trillion stars. It is drifting toward the Milky Way and the two will merge in about 4.5 billion years, forming a new elliptical giant.',
    baseFreq: 110,
  },
  {
    id: 'orion-nebula',
    name: 'Orion Nebula',
    catalog: 'M42',
    kind: 'nebula',
    type: 'Diffuse stellar nursery',
    distance: '1,344 light-years',
    fact: 'A vast cloud of gas and dust where new stars are being born right now. The bright Trapezium cluster at its heart lights the whole cloud from within.',
    baseFreq: 130.8,
  },
  {
    id: 'saturn',
    name: 'Saturn',
    catalog: 'Sol VI',
    kind: 'ringed',
    type: 'Ringed gas giant',
    distance: '1.2 – 1.7 billion km from the Sun',
    fact: 'Its rings are made almost entirely of water ice, some chunks as small as grains of sand, others as large as houses. Saturn is less dense than water — it would float in a big enough ocean.',
    baseFreq: 146.8,
  },
  {
    id: 'jupiter',
    name: 'Jupiter',
    catalog: 'Sol V',
    kind: 'gasgiant',
    type: 'Gas giant',
    distance: '740 – 820 million km from the Sun',
    fact: 'The largest planet in the solar system — 1,300 Earths could fit inside it. The Great Red Spot is a storm wider than Earth that has raged for centuries.',
    baseFreq: 164.8,
  },
  {
    id: 'moon',
    name: 'The Moon',
    catalog: 'Sol I-a',
    kind: 'moon',
    type: 'Natural satellite',
    distance: '384,400 km from Earth',
    fact: 'Tidally locked, so the same face always greets us. Its craters are the scars of 4.5 billion years of impacts, preserved by the lack of wind or water.',
    baseFreq: 196,
  },
  {
    id: 'crab-nebula',
    name: 'Crab Nebula',
    catalog: 'M1',
    kind: 'remnant',
    type: 'Supernova remnant',
    distance: '6,500 light-years',
    fact: 'The expanding wreckage of a star seen exploding in the year 1054. At its center spins a pulsar — a city-sized stellar core flashing 30 times per second.',
    baseFreq: 220,
  },
  {
    id: 'eagle-nebula',
    name: 'Eagle Nebula',
    catalog: 'M16',
    kind: 'nebula',
    type: 'Star-forming nebula',
    distance: '7,000 light-years',
    fact: 'Home to the Pillars of Creation — towers of cold gas several light-years tall where infant stars are condensing out of the dark.',
    baseFreq: 246.9,
  },
  {
    id: 'whirlpool',
    name: 'Whirlpool Galaxy',
    catalog: 'M51',
    kind: 'spiral',
    type: 'Grand-design spiral galaxy',
    distance: '23 million light-years',
    fact: 'The classic face-on spiral, locked in a gravitational dance with a smaller companion galaxy that is stretching one of its arms into a tidal bridge.',
    baseFreq: 277.2,
  },
];

export function targetCount() {
  return TARGETS.length;
}

export function getTarget(index) {
  const n = TARGETS.length;
  return TARGETS[((index % n) + n) % n];
}

export function nextIndex(index) {
  return (index + 1) % TARGETS.length;
}

export function prevIndex(index) {
  return (index - 1 + TARGETS.length) % TARGETS.length;
}
