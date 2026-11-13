// lib/sound/profiles.js
// SOUND ENGINE (Merlin, Nov 12, 2026) — sound profiles: one per species.
//
// A profile is the row of the sounds spreadsheet, in code form. The
// engine reads a profile and plays it — a recording where one exists,
// a synthesized voice built from the profile's own math where one
// doesn't, and silence where the species makes no sound at all.
//
// Profile shape (matches the sounds spreadsheet columns):
//   id         stable key, e.g. 'canis-lupus'
//   species    common name, e.g. 'Gray wolf'
//   scientific scientific name, e.g. 'Canis lupus'
//   tone       plain-English tone, e.g. 'long mournful howl'
//   math       { frequency, frequencyEnd?, harmonics, waveform, envelope }
//              frequency in Hz; harmonics [{ multiple, gain }];
//              waveform 'sine' | 'triangle' | 'sawtooth' | 'square' | 'noise';
//              envelope { attack, decay, sustain, release } in seconds / 0..1
//   duration   seconds of one call
//   pattern    { type: 'single' } | { type: 'repeat', count, interval }
//              | { type: 'chorus', interval } — a chorus repeats while
//              the ambient bed keeps it alive
//   volume     0..1, loudness of the call at the source
//   context    default context, e.g. 'howl' / 'alarm' / 'mating' / 'idle'
//   source     'recording' | 'synthesized' | 'silent'
//   sample     URL of the recording when source is 'recording', else null
//   silent     true when the species makes no sound — never invent one
//   seed       true when this is v1 seed data (approximate published
//              values, not measurements)
//
// Pure module — no window, no AudioContext. Node-testable.

export const WAVEFORMS = ['sine', 'triangle', 'sawtooth', 'square', 'noise'];
export const PATTERN_TYPES = ['single', 'repeat', 'chorus'];
export const SOURCES = ['recording', 'synthesized', 'silent'];

export const DEFAULT_ENVELOPE = { attack: 0.05, decay: 0.1, sustain: 0.7, release: 0.2 };

export const DEFAULT_PROFILE = {
  math: {
    frequency: 440,
    frequencyEnd: null,
    harmonics: [{ multiple: 1, gain: 1 }],
    waveform: 'sine',
    envelope: { ...DEFAULT_ENVELOPE },
  },
  duration: 0.5,
  pattern: { type: 'single' },
  volume: 0.6,
  context: 'idle',
  source: 'synthesized',
  sample: null,
  silent: false,
  seed: false,
};

const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function normalizeEnvelope(env) {
  const e = { ...DEFAULT_ENVELOPE, ...(env || {}) };
  return {
    attack: isFiniteNumber(e.attack) ? Math.max(0, e.attack) : DEFAULT_ENVELOPE.attack,
    decay: isFiniteNumber(e.decay) ? Math.max(0, e.decay) : DEFAULT_ENVELOPE.decay,
    sustain: isFiniteNumber(e.sustain) ? clamp(e.sustain, 0, 1) : DEFAULT_ENVELOPE.sustain,
    release: isFiniteNumber(e.release) ? Math.max(0, e.release) : DEFAULT_ENVELOPE.release,
  };
}

function normalizeHarmonics(harmonics) {
  if (!Array.isArray(harmonics) || harmonics.length === 0) {
    return [{ multiple: 1, gain: 1 }];
  }
  const out = [];
  for (const h of harmonics) {
    if (!h || !isFiniteNumber(h.multiple) || !isFiniteNumber(h.gain)) continue;
    out.push({ multiple: Math.max(1, Math.round(h.multiple)), gain: Math.max(0, h.gain) });
  }
  if (out.length === 0 || out.every((h) => h.gain === 0)) {
    return [{ multiple: 1, gain: 1 }];
  }
  return out;
}

function normalizePattern(pattern) {
  if (!pattern || !PATTERN_TYPES.includes(pattern.type)) return { type: 'single' };
  if (pattern.type === 'repeat') {
    return {
      type: 'repeat',
      count: isFiniteNumber(pattern.count) ? clamp(Math.round(pattern.count), 1, 12) : 3,
      interval: isFiniteNumber(pattern.interval) ? Math.max(0.05, pattern.interval) : 0.4,
    };
  }
  if (pattern.type === 'chorus') {
    return {
      type: 'chorus',
      interval: isFiniteNumber(pattern.interval) ? Math.max(0.2, pattern.interval) : 2.5,
    };
  }
  return { type: 'single' };
}

/**
 * Validate + fill defaults for a raw profile.
 * Returns { profile, errors } — profile is null when the raw data is
 * unusable (no id/species, or bad sound math on a non-silent profile).
 * Silent profiles need no math at all.
 */
export function normalizeProfile(raw) {
  const errors = [];
  if (!raw || typeof raw !== 'object') return { profile: null, errors: ['profile must be an object'] };
  if (!raw.id || typeof raw.id !== 'string') errors.push('missing id');
  if (!raw.species || typeof raw.species !== 'string') errors.push('missing species');

  const silent = raw.silent === true || raw.source === 'silent';
  const source = SOURCES.includes(raw.source) ? raw.source : (silent ? 'silent' : 'synthesized');

  let math = null;
  if (!silent) {
    const m = raw.math || {};
    if (!isFiniteNumber(m.frequency) || m.frequency <= 0) {
      errors.push('math.frequency must be a positive number');
    }
    if (m.frequencyEnd !== null && m.frequencyEnd !== undefined
      && (!isFiniteNumber(m.frequencyEnd) || m.frequencyEnd <= 0)) {
      errors.push('math.frequencyEnd must be a positive number or null');
    }
    if (m.waveform !== undefined && !WAVEFORMS.includes(m.waveform)) {
      errors.push(`math.waveform must be one of ${WAVEFORMS.join(', ')}`);
    }
    if (errors.length > 0) return { profile: null, errors };
    math = {
      frequency: m.frequency,
      frequencyEnd: m.frequencyEnd ?? null,
      harmonics: normalizeHarmonics(m.harmonics),
      waveform: m.waveform || 'sine',
      envelope: normalizeEnvelope(m.envelope),
    };
  }

  const profile = {
    id: raw.id,
    species: raw.species,
    scientific: typeof raw.scientific === 'string' ? raw.scientific : '',
    tone: typeof raw.tone === 'string' ? raw.tone : '',
    math,
    duration: isFiniteNumber(raw.duration) && raw.duration > 0 ? raw.duration : DEFAULT_PROFILE.duration,
    pattern: normalizePattern(raw.pattern),
    volume: isFiniteNumber(raw.volume) ? clamp(raw.volume, 0, 1) : DEFAULT_PROFILE.volume,
    context: typeof raw.context === 'string' && raw.context ? raw.context : 'idle',
    source,
    sample: source === 'recording' && typeof raw.sample === 'string' ? raw.sample : null,
    silent,
    seed: raw.seed === true,
  };
  if (source === 'recording' && !profile.sample) {
    errors.push('recording source needs a sample URL — profile will fall back to synthesis');
    profile.source = 'synthesized';
  }
  return { profile, errors };
}

/** A profile for a species that makes no sound. Never invent one. */
export function silentProfile(id, species, scientific = '') {
  return {
    id,
    species,
    scientific,
    tone: 'silent — this species makes no sound',
    math: null,
    duration: 0,
    pattern: { type: 'single' },
    volume: 0,
    context: 'idle',
    source: 'silent',
    sample: null,
    silent: true,
    seed: false,
  };
}

/**
 * A registry of profiles, keyed by species id and by id:context.
 * resolve() falls back to the species default when the context has
 * no own profile. Unknown species resolve to null — the engine must
 * never invent a sound for a species it has no profile for.
 */
export function createRegistry(profiles = []) {
  const byKey = new Map();
  const errors = [];
  for (const raw of profiles) {
    const { profile, errors: errs } = normalizeProfile(raw);
    if (!profile) {
      errors.push(...errs.map((e) => `${raw && raw.id ? raw.id : '?'}: ${e}`));
      continue;
    }
    // The bare id keeps the FIRST profile for the species (its
    // default); each context gets its own id:context key. A second
    // profile for the same species must not overwrite the default.
    if (!byKey.has(profile.id)) byKey.set(profile.id, profile);
    if (profile.context && profile.context !== 'idle') {
      byKey.set(`${profile.id}:${profile.context}`, profile);
    }
  }
  return {
    errors,
    size: byKey.size,
    has(id) {
      return byKey.has(id);
    },
    resolve(id, context = null) {
      if (!id) return null;
      if (context) {
        const specific = byKey.get(`${id}:${context}`);
        if (specific) return specific;
      }
      return byKey.get(id) || null;
    },
    list() {
      // One entry per species id (context duplicates collapsed).
      const seen = new Set();
      const out = [];
      for (const [key, profile] of byKey) {
        if (key.includes(':')) continue;
        if (seen.has(profile.id)) continue;
        seen.add(profile.id);
        out.push(profile);
      }
      return out;
    },
  };
}
