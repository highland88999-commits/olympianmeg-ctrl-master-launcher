// Maestro instrument voices + shared sound helpers.
//
// The player synthesizes every note with the raw Web Audio API (no sample
// downloads, works offline). Each instrument is a voice recipe: oscillator
// type, filter, envelope, vibrato, and optional distortion. Switching voices
// or transposing never restarts the song — live oscillators are retuned
// in place.

// Order matters: the first entry is the landing (default) instrument.
export const INSTRUMENTS = [
  {
    id: 'piano',
    name: 'Piano',
    icon: '🎹',
    oscType: 'triangle',
    // Multisamples: Salamander Grand Piano V3 (CC BY 3.0, Alexander Holm).
    // Roots every 3 semitones, MIDI 21-108; files piano-<n><oct>.mp3 ('s'=sharp).
    sampleDir: 'piano',
    sampleKind: 'piano',
    sampleRoots: [21,24,27,30,33,36,39,42,45,48,51,54,57,60,63,66,69,72,75,78,81,84,87,90,93,96,99,102,105,108],
    filterType: 'lowpass',
    filterFreq: 4200,
    attack: 0.015,
    peakScale: 1.0,
    vibratoRate: 0,
    vibratoDepth: 0,
    distortion: 0,
  },
  {
    id: 'trumpet',
    name: 'Trumpet',
    icon: '🎺',
    oscType: 'sawtooth',
    // Multisamples: FluidR3 GM (MIT, Frank Wen & contributors), preset 56.
    // Files: trumpet_root<midi>.mp3
    sampleDir: 'trumpet',
    sampleRoots: [52,55,60,67,76,84],
    filterType: 'lowpass',
    filterFreq: 3000,
    attack: 0.05,
    peakScale: 0.85,
    vibratoRate: 5.5,
    vibratoDepth: 4,
    distortion: 0,
  },
  {
    id: 'violin',
    name: 'Violin',
    icon: '🎻',
    oscType: 'sawtooth',
    // Multisamples: FluidR3 GM (MIT), preset 40; stereo (L)/(R) pairs mixed to mono.
    // Files: violin_root<midi>.mp3
    sampleDir: 'violin',
    sampleRoots: [68,71,74,77,80,86,89,92,95,98,101,104,107,110],
    filterType: 'lowpass',
    filterFreq: 2400,
    attack: 0.18,
    peakScale: 0.8,
    vibratoRate: 5.0,
    vibratoDepth: 7,
    distortion: 0,
  },
  {
    id: 'guitar',
    name: 'Guitar',
    icon: '🎸',
    oscType: 'square',
    // Multisamples: FluidR3 GM (MIT), preset 24 (nylon string).
    // Files: guitar_root<midi>.mp3
    sampleDir: 'guitar',
    sampleRoots: [40,45,50,55,59,64,69,71,72,76],
    filterType: 'lowpass',
    filterFreq: 1800,
    attack: 0.005,
    peakScale: 0.7,
    vibratoRate: 0,
    vibratoDepth: 0,
    distortion: 0,
  },
  {
    id: 'electric-guitar',
    name: 'Electric guitar',
    icon: '⚡',
    oscType: 'sawtooth',
    // Multisamples: FluidR3 GM (MIT), preset 30 (distortion guitar).
    // Files: electric-guitar_root<midi>.mp3
    sampleDir: 'electric-guitar',
    sampleRoots: [40,45,50,55,59,60,65,67,76,79],
    filterType: 'lowpass',
    filterFreq: 3600,
    attack: 0.01,
    peakScale: 0.9,
    vibratoRate: 0,
    vibratoDepth: 0,
    distortion: 45,
  },
];

export const DEFAULT_INSTRUMENT = INSTRUMENTS[0].id;
export const INSTRUMENT_IDS = INSTRUMENTS.map((i) => i.id);

export function getInstrument(id) {
  return INSTRUMENTS.find((i) => i.id === id) || INSTRUMENTS[0];
}

export const TRANSPOSE_MIN = -12;
export const TRANSPOSE_MAX = 12;
// Live tempo range: half speed to double speed. 1 = the file's own tempo.
export const TEMPO_MIN = 0.5;
export const TEMPO_MAX = 2;

// Scheduler math (pure, unit-tested):
// song position advances by real elapsed time scaled by the live tempo,
// and a note at song-time `noteStart` is scheduled this far out in audio time.
export function advanceSongPos(songPos, dtSeconds, tempo) {
  return songPos + Math.max(0, dtSeconds) * tempo;
}
export function noteAudioTime(nowAudio, noteStart, songPos, tempo) {
  return nowAudio + Math.max(0, (noteStart - songPos) / tempo);
}

// Equal-tempered frequency for a MIDI note, shifted by transpose semitones.
export function midiToFreq(midi, transpose = 0) {
  return 440 * Math.pow(2, (midi + transpose - 69) / 12);
}

// Gentle overdrive curve for the electric guitar voice.
export function makeDistortionCurve(amount = 45) {
  const n = 256;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(amount * x) / Math.tanh(amount);
  }
  return curve;
}

// Alphabetical catalog: group library entries by first letter of title.
// Non-letters land under '#'. Pure function, tested.
export function groupByLetter(entries) {
  const groups = new Map();
  for (const e of entries || []) {
    const t = String(e.title || '').trim();
    const ch = t.charAt(0).toUpperCase();
    const letter = ch >= 'A' && ch <= 'Z' ? ch : '#';
    if (!groups.has(letter)) groups.set(letter, []);
    groups.get(letter).push(e);
  }
  return [...groups.entries()]
    .sort((a, b) => (a[0] === '#' ? 1 : b[0] === '#' ? -1 : a[0].localeCompare(b[0])))
    .map(([letter, items]) => ({
      letter,
      items: items.sort((x, y) =>
        String(x.title || '').localeCompare(String(y.title || ''))
      ),
    }));
}
