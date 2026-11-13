// lib/sound/engine.js
// SOUND ENGINE (Merlin, Nov 12, 2026) — the browser engine.
//
// One engine for every sound in Olympus. Any creature, in any world,
// makes its sound through one call:
//
//   playSound(speciesId, context, sourcePos, listenerPos)
//
// The engine figures out the rest: a real recording where one exists,
// a synthesized voice built from the species' own sound math where
// one doesn't, and silence where the species makes no sound.
//
// Phone rules (browsers demand them): sound only starts after the
// user taps something — call unlock() from the first gesture. Sound
// files load lazily so the world still opens fast. One master mute
// and volume, remembered in localStorage.
//
// 3D: distance falloff + left/right pan in headphones (StereoPanner —
// the phone-safe choice over full HRTF panning). A sound failure
// never throws into the world: every Web Audio call is guarded and
// playSound reports { played, reason } instead of crashing.

import { createRegistry } from './profiles.js';
import { SEED_PROFILES } from './seed-profiles.js';
import {
  voicePlan,
  envelopePoints,
  expandPattern,
  gainForDistance,
  earshotFor,
  panForListener,
  REFERENCE_DISTANCE,
} from './math.js';

const MUTE_KEY = 'olympus-sound-muted';
const VOLUME_KEY = 'olympus-sound-volume';

function readStored(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeStored(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage is best-effort */
  }
}

export function createSoundEngine({ profiles = SEED_PROFILES } = {}) {
  let registry = createRegistry(profiles);
  let ctx = null;
  let master = null;
  let muted = typeof window !== 'undefined' ? !!readStored(MUTE_KEY, false) : false;
  let volume = typeof window !== 'undefined' ? readStored(VOLUME_KEY, 0.8) : 0.8;
  if (typeof volume !== 'number' || volume < 0 || volume > 1) volume = 0.8;
  const sampleCache = new Map();
  let ambientTimer = null;
  let ambientEntries = [];
  let ambientListenerFn = null;

  function applyMaster() {
    if (master) master.gain.value = muted ? 0 : volume;
  }

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return true;
    }
    if (typeof window === 'undefined') return false;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      ctx = new AC();
      master = ctx.createGain();
      applyMaster();
      master.connect(ctx.destination);
      return true;
    } catch {
      ctx = null;
      master = null;
      return false;
    }
  }

  function scheduleGain(gainNode, t0, duration, envelope, scale = 1) {
    const points = envelopePoints(duration, envelope);
    for (const [t, v] of points) {
      const scaled = Math.max(0.0001, v * scale);
      if (t === 0) gainNode.gain.setValueAtTime(scaled, t0);
      else gainNode.gain.linearRampToValueAtTime(scaled, t0 + t);
    }
  }

  function playOscVoice(plan, t0, gainValue, pan) {
    const out = ctx.createGain();
    out.gain.value = gainValue;
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (panner) {
      panner.pan.value = pan;
      out.connect(panner);
      panner.connect(master);
    } else {
      out.connect(master);
    }
    for (const oscDef of plan.oscillators) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = oscDef.type;
      osc.frequency.setValueAtTime(Math.max(1, oscDef.freq), t0);
      if (oscDef.freqEnd) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, oscDef.freqEnd), t0 + plan.duration);
      }
      g.gain.value = oscDef.gain;
      osc.connect(g);
      g.connect(out);
      osc.start(t0);
      osc.stop(t0 + plan.duration + 0.1);
    }
    scheduleGain(out, t0, plan.duration, plan.envelope, gainValue);
    return out;
  }

  function playNoiseVoice(plan, t0, gainValue, pan) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * plan.duration));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(Math.max(40, plan.frequency), t0);
    if (plan.sweepTo) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(40, plan.sweepTo), t0 + plan.duration);
    }
    filter.Q.value = plan.q || 0.8;
    const out = ctx.createGain();
    out.gain.value = gainValue;
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    src.connect(filter);
    filter.connect(out);
    if (panner) {
      panner.pan.value = pan;
      out.connect(panner);
      panner.connect(master);
    } else {
      out.connect(master);
    }
    scheduleGain(out, t0, plan.duration, plan.envelope, gainValue);
    src.start(t0);
    src.stop(t0 + plan.duration + 0.1);
    return out;
  }

  async function loadSample(url) {
    if (sampleCache.has(url)) return sampleCache.get(url);
    const pending = (async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`sample fetch failed: ${res.status}`);
      const buf = await res.arrayBuffer();
      return ctx.decodeAudioData(buf);
    })();
    sampleCache.set(url, pending);
    try {
      return await pending;
    } catch (err) {
      sampleCache.delete(url);
      throw err;
    }
  }

  function playSample(profile, t0, gainValue, pan) {
    if (!profile.sample) return Promise.resolve(false);
    return loadSample(profile.sample)
      .then((buffer) => {
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        const out = ctx.createGain();
        out.gain.value = gainValue;
        const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
        src.connect(out);
        if (panner) {
          panner.pan.value = pan;
          out.connect(panner);
          panner.connect(master);
        } else {
          out.connect(master);
        }
        scheduleGain(out, t0, Math.min(profile.duration, buffer.duration), profile.math?.envelope, gainValue);
        src.start(t0);
        return true;
      })
      .catch(() => false);
  }

  const api = {
    get registry() {
      return registry;
    },
    get muted() {
      return muted;
    },
    get volume() {
      return volume;
    },
    get unlocked() {
      return !!ctx;
    },

    /** Call from the page's first user gesture. Safe to call often. */
    unlock() {
      return ensure();
    },

    setMuted(m) {
      muted = !!m;
      writeStored(MUTE_KEY, muted);
      applyMaster();
    },

    setVolume(v) {
      const next = Math.min(1, Math.max(0, Number(v) || 0));
      volume = next;
      writeStored(VOLUME_KEY, volume);
      applyMaster();
    },

    /**
     * Play a species' sound.
     * sourcePos: { x, y?, z } of the creature. listenerPos:
     * { x, y?, z, yaw } of the player. Either may be null for a
     * full-volume, centred sound (menus, UI).
     * Returns { played, reason } — reason is 'silent', 'unknown',
     * 'locked' (no gesture yet), 'too-far', 'muted', or 'ok'.
     */
    playSound(speciesId, context = null, sourcePos = null, listenerPos = null) {
      const profile = registry.resolve(speciesId, context);
      if (!profile) return { played: false, reason: 'unknown' };
      if (profile.silent || profile.source === 'silent') return { played: false, reason: 'silent' };
      if (muted) return { played: false, reason: 'muted' };
      if (!ensure()) return { played: false, reason: 'locked' };

      let distance = 0;
      let pan = 0;
      if (sourcePos && listenerPos) {
        const placed = panForListener(listenerPos, sourcePos);
        distance = placed.distance;
        pan = placed.pan;
      }
      // Earshot: louder species are heard from farther away (Earth 4).
      const distGain = gainForDistance(distance, REFERENCE_DISTANCE, earshotFor(profile.volume));
      if (distGain <= 0) return { played: false, reason: 'too-far' };
      const gainValue = Math.min(1, profile.volume * distGain);

      const plan = voicePlan(profile);
      const { events } = expandPattern(profile);
      const t0 = ctx.currentTime + 0.02;
      try {
        if (profile.source === 'recording' && profile.sample) {
          // Real recording first; fall back to synthesis if it fails.
          playSample(profile, t0, gainValue, pan).then((ok) => {
            if (!ok && plan) {
              for (const ev of events) {
                const at = t0 + ev.delay;
                if (plan.kind === 'noise') playNoiseVoice(plan, at, gainValue, pan);
                else playOscVoice(plan, at, gainValue, pan);
              }
            }
          });
          return { played: true, reason: 'ok', sample: true };
        }
        if (!plan) return { played: false, reason: 'silent' };
        for (const ev of events) {
          const at = t0 + ev.delay;
          if (plan.kind === 'noise') playNoiseVoice(plan, at, gainValue, pan);
          else playOscVoice(plan, at, gainValue, pan);
        }
        return { played: true, reason: 'ok' };
      } catch {
        return { played: false, reason: 'error' };
      }
    },

    /**
     * Start an ambient bed: entries [{ id, context?, weight?, maxDistance? }].
     * Every few seconds a random entry calls from a random spot on a
     * ring around the listener. listenerFn returns the current
     * listener position { x, y?, z, yaw } each time it is needed.
     */
    startAmbient(entries, listenerFn) {
      this.stopAmbient();
      ambientEntries = (entries || []).filter((e) => e && e.id);
      ambientListenerFn = typeof listenerFn === 'function' ? listenerFn : null;
      if (ambientEntries.length === 0) return;
      const tick = () => {
        if (muted || !ctx) return;
        const listener = ambientListenerFn ? ambientListenerFn() : null;
        if (!listener) return;
        const total = ambientEntries.reduce((s, e) => s + (e.weight || 1), 0);
        let roll = Math.random() * total;
        let picked = ambientEntries[0];
        for (const e of ambientEntries) {
          roll -= e.weight || 1;
          if (roll <= 0) { picked = e; break; }
        }
        const angle = Math.random() * Math.PI * 2;
        const radius = 10 + Math.random() * 30;
        const source = {
          x: listener.x + Math.cos(angle) * radius,
          z: listener.z + Math.sin(angle) * radius,
        };
        this.playSound(picked.id, picked.context || null, source, listener);
      };
      tick();
      ambientTimer = setInterval(tick, 4000);
    },

    stopAmbient() {
      if (ambientTimer) {
        clearInterval(ambientTimer);
        ambientTimer = null;
      }
      ambientEntries = [];
      ambientListenerFn = null;
    },

    /** Register extra profiles (the sounds spreadsheet plugs in here). */
    addProfiles(profiles) {
      registry = createRegistry([...registry.list(), ...profiles]);
      return registry;
    },
  };
  return api;
}
