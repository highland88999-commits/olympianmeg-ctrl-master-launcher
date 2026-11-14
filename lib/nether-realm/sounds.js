// lib/nether-realm/sounds.js
// NETHER-REALM sounds — the Hades hook for the sound engine
// (Merlin, Nov 12, 2026).
//
// Hades' own profiles (mythical creatures and place ambience — these
// are game sounds, not spreadsheet species) plus the map from each
// region of the world to the ambient bed that plays there, and the
// Cerberus proximity rule: walk close to the Gates and the hound
// growls, at most once every 12 seconds.
//
// The page wires it up: unlock on the first gesture, start the bed
// for the current region, swap the bed when the region changes, and
// check the growl rule on a timer. Pure logic here (no AudioContext)
// so node tests can assert it.

import { GATES } from './world.js';

// Mythical / place profiles. Same shape as a sound profile; Cerberus
// is marked mythical in its tone because the spreadsheet schema has
// no field for creatures that never lived.
export const HADES_PROFILES = [
  {
    id: 'cerberus', species: 'Cerberus', scientific: '',
    tone: 'mythical — the three-headed hound growls, low and close',
    math: {
      frequency: 65, frequencyEnd: 45,
      harmonics: [{ multiple: 1, gain: 1 }, { multiple: 2, gain: 0.6 }, { multiple: 3, gain: 0.3 }],
      waveform: 'sawtooth',
      envelope: { attack: 0.1, decay: 0.3, sustain: 0.8, release: 0.5 },
    },
    duration: 1.6, pattern: { type: 'single' }, volume: 0.9,
    context: 'growl', source: 'synthesized', seed: false,
  },
  {
    id: 'hades-styx', species: 'River Styx', scientific: '',
    tone: 'dark water moving slow under the bridge',
    math: {
      frequency: 600, frequencyEnd: 300,
      harmonics: [{ multiple: 1, gain: 1 }],
      waveform: 'noise',
      envelope: { attack: 0.5, decay: 0.3, sustain: 0.9, release: 0.6 },
    },
    duration: 2, pattern: { type: 'chorus', interval: 6 }, volume: 0.35,
    context: 'flow', source: 'synthesized', seed: false,
  },
  {
    id: 'hades-fire', species: 'Tartarus fire', scientific: '',
    tone: 'fire pits crackling',
    math: {
      frequency: 1200, frequencyEnd: 400,
      harmonics: [{ multiple: 1, gain: 1 }],
      waveform: 'noise',
      envelope: { attack: 0.02, decay: 0.05, sustain: 0.8, release: 0.1 },
    },
    duration: 0.5, pattern: { type: 'repeat', count: 5, interval: 0.12 }, volume: 0.4,
    context: 'crackle', source: 'synthesized', seed: false,
  },
  {
    id: 'hades-shade', species: 'Shade', scientific: '',
    tone: 'the dead whispering as they drift past',
    math: {
      frequency: 900, frequencyEnd: 1400,
      harmonics: [{ multiple: 1, gain: 1 }],
      waveform: 'noise',
      envelope: { attack: 0.4, decay: 0.3, sustain: 0.7, release: 0.6 },
    },
    duration: 1.2, pattern: { type: 'chorus', interval: 7 }, volume: 0.25,
    context: 'whisper', source: 'synthesized', seed: false,
  },
  {
    // THUNDER (Merlin, 2026-11-14): the day/night rig dispatches
    // window 'olympus:thunder' on a lightning strike and the Hades
    // page answers with this — one low noise rumble through the
    // engine's existing noise-voice path (same shape as hades-styx:
    // bandpass noise sweeping down, slow release so it rolls).
    id: 'hades-thunder', species: 'Thunder', scientific: '',
    tone: 'low storm rumble rolling over Hades when lightning strikes',
    math: {
      frequency: 120, frequencyEnd: 40,
      harmonics: [{ multiple: 1, gain: 1 }],
      waveform: 'noise',
      envelope: { attack: 0.05, decay: 0.4, sustain: 0.7, release: 1.2 },
    },
    duration: 2.8, pattern: { type: 'single' }, volume: 0.55,
    context: 'thunder', source: 'synthesized', seed: false,
  },
];

/** Region name → ambient bed entries for the sound engine. */
export function ambientForRegion(region) {
  switch (region) {
    case 'The Descent':
      return [{ id: 'hades-shade', weight: 2 }, { id: 'hades-styx', weight: 1 }];
    case 'The Gates':
      return [{ id: 'cerberus', weight: 2 }, { id: 'hades-fire', weight: 1 }];
    case 'The River Styx':
      return [{ id: 'hades-styx', weight: 3 }, { id: 'hades-shade', weight: 1 }];
    case "Hades' Palace":
      return [{ id: 'hades-fire', weight: 1 }, { id: 'hades-shade', weight: 2 }];
    case 'Asphodel':
      return [{ id: 'hades-shade', weight: 3 }];
    case 'Elysium':
      // The blessed field: birdsong, of all things, in the underworld.
      return [{ id: 'turdus-migratorius', weight: 2 }, { id: 'hades-shade', weight: 1 }];
    case 'Tartarus':
      return [{ id: 'hades-fire', weight: 3 }, { id: 'cerberus', weight: 1 }];
    default:
      return [{ id: 'hades-shade', weight: 2 }, { id: 'hades-styx', weight: 1 }];
  }
}

export const GROWL_RADIUS = 30; // metres from the Gates
export const GROWL_COOLDOWN_MS = 12000;

/**
 * Should Cerberus growl now? True when the player is within
 * GROWL_RADIUS of the Gates and the last growl was at least
 * GROWL_COOLDOWN_MS ago. Pure — `nowMs` is injected for tests.
 */
export function shouldGrowl(playerPos, lastGrowlAtMs, nowMs) {
  if (!playerPos) return false;
  const d = Math.hypot(playerPos.x - GATES.x, playerPos.z - GATES.z);
  if (d >= GROWL_RADIUS) return false;
  return nowMs - lastGrowlAtMs >= GROWL_COOLDOWN_MS;
}
