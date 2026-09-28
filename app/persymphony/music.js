// Persymphony — generative music engine.
// Pure logic: no WebAudio, no DOM, no network. Fully deterministic given a seed,
// so the page's WebAudio layer and the test suite share the exact same composer.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Scales as semitone offsets from the root.
export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  pentatonic: [0, 2, 4, 7, 9],
  lydian: [0, 2, 4, 6, 7, 9, 11],
};

export function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// motif: { seed, root (midi), scale (key of SCALES), density 0..1,
//          wave ('sine'|'triangle'|'square'|'sawtooth'), bassEvery (steps) }
export function createComposer(motif, opts = {}) {
  const scale = SCALES[motif.scale] || SCALES.minor;
  const rng = mulberry32((motif.seed >>> 0) || 1);
  let step = 0;
  let tempo = clamp(opts.tempo || 96, 40, 200);
  let mood = opts.mood == null ? 0.6 : clamp(opts.mood, 0, 1);

  function effectiveDensity() {
    return clamp(motif.density * (0.35 + 0.95 * mood), 0, 1);
  }

  function octaveProbability() {
    return clamp(mood * 0.35, 0, 0.35);
  }

  function pickNote() {
    const degree = Math.floor(rng() * scale.length);
    let octave = 0;
    if (rng() < octaveProbability()) octave = rng() < 0.75 ? 1 : -1;
    return clamp(Math.round(motif.root + scale[degree] + octave * 12), 24, 96);
  }

  return {
    setTempo(bpm) {
      tempo = clamp(bpm, 40, 200);
    },
    setMood(m) {
      mood = clamp(m, 0, 1);
    },
    getTempo() {
      return tempo;
    },
    getMood() {
      return mood;
    },
    getScale() {
      return scale.slice();
    },
    // Seconds per sequencer step (eighth notes).
    stepSeconds() {
      return 60 / tempo / 2;
    },
    effectiveDensity,
    octaveProbability,
    reset() {
      step = 0;
    },
    nextStep() {
      const s = step++;
      const notes = [];
      const density = effectiveDensity();
      const count = rng() < density ? (rng() < density * mood ? 2 : 1) : 0;
      for (let i = 0; i < count; i++) {
        const midi = pickNote();
        notes.push({
          midi,
          freq: midiToFreq(midi),
          wave: motif.wave || 'triangle',
          gain: 0.3 + mood * 0.3,
        });
      }
      let bass = null;
      const every = motif.bassEvery || 4;
      if (s % every === 0) {
        const bm = clamp(motif.root - 12, 24, 96);
        bass = { midi: bm, freq: midiToFreq(bm), wave: 'sine', gain: 0.5 };
      }
      return { step: s, notes, bass };
    },
  };
}
