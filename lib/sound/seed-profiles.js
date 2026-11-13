// lib/sound/seed-profiles.js
// SOUND ENGINE (Merlin, Nov 12, 2026) — v1 seed profiles.
//
// Real animals, approximate published values — NOT measurements.
// Every profile here carries seed: true. The full per-species data
// (the sounds spreadsheet) replaces and extends these when it lands.
// Frequencies are the commonly published ranges for each call; where
// a call sits below what a phone speaker can reproduce (whale and
// elephant infrasound) the tone says so plainly.
//
// A silent species is in the list too (English oak) to prove the
// silent path: the engine plays nothing for it, by design.

export const SEED_PROFILES = [
  // -- mammals ------------------------------------------------------------
  {
    id: 'canis-lupus', species: 'Gray wolf', scientific: 'Canis lupus',
    tone: 'long mournful howl, rising then falling',
    math: {
      frequency: 350, frequencyEnd: 520,
      harmonics: [{ multiple: 1, gain: 1 }, { multiple: 2, gain: 0.4 }, { multiple: 3, gain: 0.15 }],
      waveform: 'sawtooth',
      envelope: { attack: 0.4, decay: 0.5, sustain: 0.7, release: 1.2 },
    },
    duration: 3.5, pattern: { type: 'single' }, volume: 0.85,
    context: 'howl', source: 'synthesized', seed: true,
  },
  {
    id: 'canis-familiaris', species: 'Domestic dog', scientific: 'Canis lupus familiaris',
    tone: 'sharp bark, three in a row',
    math: {
      frequency: 500, frequencyEnd: null,
      harmonics: [{ multiple: 1, gain: 1 }, { multiple: 2, gain: 0.5 }],
      waveform: 'square',
      envelope: { attack: 0.01, decay: 0.05, sustain: 0.8, release: 0.08 },
    },
    duration: 0.15, pattern: { type: 'repeat', count: 3, interval: 0.35 }, volume: 0.8,
    context: 'alarm', source: 'synthesized', seed: true,
  },
  {
    id: 'panthera-leo', species: 'Lion', scientific: 'Panthera leo',
    tone: 'deep roar, felt in the chest',
    math: {
      frequency: 100, frequencyEnd: 70,
      harmonics: [{ multiple: 1, gain: 1 }, { multiple: 2, gain: 0.6 }, { multiple: 3, gain: 0.3 }],
      waveform: 'sawtooth',
      envelope: { attack: 0.08, decay: 0.3, sustain: 0.8, release: 0.5 },
    },
    duration: 1.5, pattern: { type: 'single' }, volume: 0.9,
    context: 'roar', source: 'synthesized', seed: true,
  },
  {
    id: 'loxodonta-africana', species: 'African elephant', scientific: 'Loxodonta africana',
    tone: 'infrasonic rumble — felt more than heard, below a phone speaker',
    math: {
      frequency: 18, frequencyEnd: null,
      harmonics: [{ multiple: 1, gain: 1 }],
      waveform: 'sine',
      envelope: { attack: 0.5, decay: 0.5, sustain: 0.8, release: 1.0 },
    },
    duration: 4, pattern: { type: 'single' }, volume: 0.9,
    context: 'rumble', source: 'synthesized', seed: true,
  },
  {
    id: 'felis-catus', species: 'Domestic cat', scientific: 'Felis catus',
    tone: 'rising meow',
    math: {
      frequency: 650, frequencyEnd: 820,
      harmonics: [{ multiple: 1, gain: 1 }, { multiple: 2, gain: 0.3 }],
      waveform: 'triangle',
      envelope: { attack: 0.08, decay: 0.1, sustain: 0.8, release: 0.25 },
    },
    duration: 0.7, pattern: { type: 'single' }, volume: 0.6,
    context: 'call', source: 'synthesized', seed: true,
  },
  {
    id: 'equus-caballus', species: 'Horse', scientific: 'Equus caballus',
    tone: 'neigh, rising and quavering',
    math: {
      frequency: 700, frequencyEnd: 1400,
      harmonics: [{ multiple: 1, gain: 1 }, { multiple: 2, gain: 0.5 }, { multiple: 3, gain: 0.2 }],
      waveform: 'sawtooth',
      envelope: { attack: 0.1, decay: 0.2, sustain: 0.7, release: 0.4 },
    },
    duration: 1.2, pattern: { type: 'single' }, volume: 0.75,
    context: 'neigh', source: 'synthesized', seed: true,
  },

  // -- birds ---------------------------------------------------------------
  {
    id: 'turdus-migratorius', species: 'American robin', scientific: 'Turdus migratorius',
    tone: 'cheerful rising song phrases',
    math: {
      frequency: 2800, frequencyEnd: 3400,
      harmonics: [{ multiple: 1, gain: 1 }],
      waveform: 'sine',
      envelope: { attack: 0.03, decay: 0.05, sustain: 0.8, release: 0.1 },
    },
    duration: 0.4, pattern: { type: 'repeat', count: 4, interval: 0.3 }, volume: 0.55,
    context: 'song', source: 'synthesized', seed: true,
  },
  {
    id: 'bubo-virginianus', species: 'Great horned owl', scientific: 'Bubo virginianus',
    tone: 'low two-note hoot',
    math: {
      frequency: 350, frequencyEnd: null,
      harmonics: [{ multiple: 1, gain: 1 }, { multiple: 2, gain: 0.2 }],
      waveform: 'sine',
      envelope: { attack: 0.05, decay: 0.1, sustain: 0.8, release: 0.2 },
    },
    duration: 0.5, pattern: { type: 'repeat', count: 2, interval: 0.6 }, volume: 0.6,
    context: 'hoot', source: 'synthesized', seed: true,
  },
  {
    id: 'corvus-brachyrhynchos', species: 'American crow', scientific: 'Corvus brachyrhynchos',
    tone: 'harsh caw',
    math: {
      frequency: 1000, frequencyEnd: 800,
      harmonics: [{ multiple: 1, gain: 1 }, { multiple: 2, gain: 0.6 }],
      waveform: 'sawtooth',
      envelope: { attack: 0.02, decay: 0.05, sustain: 0.8, release: 0.1 },
    },
    duration: 0.25, pattern: { type: 'repeat', count: 3, interval: 0.4 }, volume: 0.6,
    context: 'caw', source: 'synthesized', seed: true,
  },

  // -- frogs ----------------------------------------------------------------
  {
    id: 'lithobates-catesbeianus', species: 'American bullfrog', scientific: 'Lithobates catesbeianus',
    tone: 'deep jug-o-rum croak',
    math: {
      frequency: 100, frequencyEnd: null,
      harmonics: [{ multiple: 1, gain: 1 }, { multiple: 2, gain: 0.4 }],
      waveform: 'square',
      envelope: { attack: 0.05, decay: 0.1, sustain: 0.7, release: 0.15 },
    },
    duration: 0.4, pattern: { type: 'repeat', count: 2, interval: 0.5 }, volume: 0.6,
    context: 'croak', source: 'synthesized', seed: true,
  },
  {
    id: 'pseudacris-crucifer', species: 'Spring peeper', scientific: 'Pseudacris crucifer',
    tone: 'high single-note peep, in chorus',
    math: {
      frequency: 3000, frequencyEnd: null,
      harmonics: [{ multiple: 1, gain: 1 }],
      waveform: 'sine',
      envelope: { attack: 0.02, decay: 0.02, sustain: 0.9, release: 0.05 },
    },
    duration: 0.1, pattern: { type: 'chorus', interval: 2.5 }, volume: 0.4,
    context: 'chorus', source: 'synthesized', seed: true,
  },

  // -- insects --------------------------------------------------------------
  {
    id: 'apis-mellifera', species: 'Honeybee', scientific: 'Apis mellifera',
    tone: 'steady wingbeat hum',
    math: {
      frequency: 200, frequencyEnd: null,
      harmonics: [{ multiple: 1, gain: 1 }, { multiple: 2, gain: 0.5 }],
      waveform: 'sawtooth',
      envelope: { attack: 0.2, decay: 0.2, sustain: 0.9, release: 0.4 },
    },
    duration: 2, pattern: { type: 'chorus', interval: 4 }, volume: 0.35,
    context: 'flight', source: 'synthesized', seed: true,
  },
  {
    id: 'gryllus-assimilis', species: 'Field cricket', scientific: 'Gryllus assimilis',
    tone: 'high pulsing chirp',
    math: {
      frequency: 4200, frequencyEnd: null,
      harmonics: [{ multiple: 1, gain: 1 }],
      waveform: 'sine',
      envelope: { attack: 0.01, decay: 0.01, sustain: 0.9, release: 0.03 },
    },
    duration: 0.06, pattern: { type: 'repeat', count: 6, interval: 0.08 }, volume: 0.35,
    context: 'chirp', source: 'synthesized', seed: true,
  },
  {
    id: 'magicicada-septendecim', species: 'Periodical cicada', scientific: 'Magicicada septendecim',
    tone: 'loud rising buzz, in chorus',
    math: {
      frequency: 5000, frequencyEnd: 4500,
      harmonics: [{ multiple: 1, gain: 1 }, { multiple: 2, gain: 0.3 }],
      waveform: 'sawtooth',
      envelope: { attack: 0.3, decay: 0.2, sustain: 0.9, release: 0.5 },
    },
    duration: 1.5, pattern: { type: 'chorus', interval: 5 }, volume: 0.4,
    context: 'buzz', source: 'synthesized', seed: true,
  },
  {
    id: 'aedes-aegypti', species: 'Yellow fever mosquito', scientific: 'Aedes aegypti',
    tone: 'thin whine by the ear',
    math: {
      frequency: 500, frequencyEnd: null,
      harmonics: [{ multiple: 1, gain: 1 }, { multiple: 2, gain: 0.3 }],
      waveform: 'sine',
      envelope: { attack: 0.1, decay: 0.1, sustain: 0.9, release: 0.2 },
    },
    duration: 1, pattern: { type: 'single' }, volume: 0.3,
    context: 'whine', source: 'synthesized', seed: true,
  },

  // -- whales + fish ----------------------------------------------------------
  {
    id: 'balaenoptera-musculus', species: 'Blue whale', scientific: 'Balaenoptera musculus',
    tone: 'deep infrasonic moan — below a phone speaker, felt more than heard',
    math: {
      frequency: 18, frequencyEnd: 15,
      harmonics: [{ multiple: 1, gain: 1 }],
      waveform: 'sine',
      envelope: { attack: 1.0, decay: 1.0, sustain: 0.8, release: 2.0 },
    },
    duration: 8, pattern: { type: 'single' }, volume: 0.9,
    context: 'call', source: 'synthesized', seed: true,
  },
  {
    id: 'megaptera-novaeangliae', species: 'Humpback whale', scientific: 'Megaptera novaeangliae',
    tone: 'haunting song phrases',
    math: {
      frequency: 400, frequencyEnd: 900,
      harmonics: [{ multiple: 1, gain: 1 }, { multiple: 2, gain: 0.5 }, { multiple: 3, gain: 0.2 }],
      waveform: 'sine',
      envelope: { attack: 0.3, decay: 0.3, sustain: 0.8, release: 0.6 },
    },
    duration: 2, pattern: { type: 'repeat', count: 3, interval: 0.8 }, volume: 0.7,
    context: 'song', source: 'synthesized', seed: true,
  },
  {
    id: 'tursiops-truncatus', species: 'Bottlenose dolphin', scientific: 'Tursiops truncatus',
    tone: 'rising whistle',
    math: {
      frequency: 9000, frequencyEnd: 12000,
      harmonics: [{ multiple: 1, gain: 1 }],
      waveform: 'sine',
      envelope: { attack: 0.05, decay: 0.1, sustain: 0.8, release: 0.2 },
    },
    duration: 0.8, pattern: { type: 'single' }, volume: 0.5,
    context: 'whistle', source: 'synthesized', seed: true,
  },
  {
    id: 'porichthys-notatus', species: 'Plainfin midshipman', scientific: 'Porichthys notatus',
    tone: 'low evening hum from the seabed',
    math: {
      frequency: 100, frequencyEnd: null,
      harmonics: [{ multiple: 1, gain: 1 }, { multiple: 2, gain: 0.4 }],
      waveform: 'sawtooth',
      envelope: { attack: 0.5, decay: 0.5, sustain: 0.9, release: 1.0 },
    },
    duration: 3, pattern: { type: 'chorus', interval: 8 }, volume: 0.4,
    context: 'hum', source: 'synthesized', seed: true,
  },

  // -- silence, by design -----------------------------------------------------
  {
    id: 'quercus-robur', species: 'English oak', scientific: 'Quercus robur',
    tone: 'silent — this species makes no sound',
    math: null, duration: 0, pattern: { type: 'single' }, volume: 0,
    context: 'idle', source: 'silent', silent: true, seed: true,
  },
];
