// lib/fx.js — Central sound + haptics FX for the Nexus launcher.
//
// One place for every synthesized sound and every vibration in the hub:
// buttons, menus, satellite drops, the TRON bike, landings, the entrance
// cinematic, Persephone moments, purchases, errors, victories.
//
// RULES (standing design):
// - 100% synthesized Web Audio — no audio files, ever.
// - Haptics via navigator.vibrate ONLY where the API actually exists.
//   iOS Safari has no vibration API: it degrades to sound-only. We NEVER
//   fake vibration (feature-detect every call; never assume).
// - Nothing plays before the user's first gesture: unlockFx() is wired to
//   the first pointerdown/keydown. Audio is blocked by autoplay policy
//   before that anyway; haptics are suppressed by design too (no buzzing
//   someone who hasn't touched anything yet).
// - prefers-reduced-motion tones everything down: gains are halved and the
//   big kinetic patterns (drop, victory, bike mount) collapse to a single
//   short pulse.
// - Every effect is a MATCHED pair: the right sound + the right haptic for
//   the moment. The one exception is entrancePhase(), which layers haptics
//   on top of the per-phase sounds already in lib/entrance-audio.js —
//   extend, don't replace.
// - Everything is guarded: SSR, blocked AudioContext, private mode.
//   FX must never break the launcher.
//
// Usage: import { fx, unlockFx } from '@/lib/fx'; then fx.tap(),
// fx.satelliteDrop(), fx.routeLaunch(route), etc. Call unlockFx() once on
// the first user gesture (the hub home page does this).

let ctx = null;
let masterGain = null;
let enabled = true;
let unlocked = false; // first user gesture happened
let reduced = false; // prefers-reduced-motion (or test override)

// Hydrate the persisted FX preference on the client. SettingsGear writes it
// ('nexus_fx_enabled'); deep-linked games must honor it even when the gear
// never mounted. Private-mode/blocked storage: stay enabled, never throw.
try {
  if (typeof window !== 'undefined' && window.localStorage) {
    if (window.localStorage.getItem('nexus_fx_enabled') === '0') enabled = false;
  }
} catch {
  /* stay enabled */
}

function readReducedMotion() {
  try {
    if (typeof window !== 'undefined' && window.matchMedia) {
      reduced = !!window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
  } catch {
    reduced = false;
  }
  return reduced;
}

/** Call once from the first user gesture (pointerdown / keydown). */
export function unlockFx() {
  unlocked = true;
  readReducedMotion();
  audio(); // wake the AudioContext so the first real FX is on time
}

export function setFxEnabled(v) {
  enabled = !!v;
  if (!enabled) {
    try { if (ctx) { ctx.close().catch(() => {}); } } catch { /* noop */ }
    ctx = null;
    masterGain = null;
  }
}

export function isFxEnabled() {
  return enabled;
}

export function setReducedMotion(v) {
  reduced = !!v; // test override / manual setting
}

export function prefersReducedMotion() {
  return reduced;
}

export function isFxUnlocked() {
  return unlocked;
}

// Test/debug log: every sound + haptic attempt is recorded here so the
// headless suite can assert the matched-pair correspondence. Negligible
// cost in production (tiny descriptors only).
export const FX_DEBUG = { sounds: [], haptics: [] };

export function resetFxDebug() {
  FX_DEBUG.sounds.length = 0;
  FX_DEBUG.haptics.length = 0;
}

/** Shared AudioContext. Null when unavailable (SSR, autoplay-blocked, muted). */
function audio() {
  if (typeof window === 'undefined' || !enabled || !unlocked) return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.8;
      masterGain.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx.state === 'running' && masterGain ? ctx : null;
  } catch {
    return null;
  }
}

const reducedGain = (g) => (reduced ? g * 0.5 : g);

// --- synthesis primitives ------------------------------------------------

function tone(c, dest, { freq = 440, type = 'sine', at = 0, dur = 0.2, gain = 0.08, slideTo = null }) {
  const t0 = c.currentTime + at;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(Math.max(1, freq), t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(reducedGain(gain), t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(dest);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
  FX_DEBUG.sounds.push({ kind: 'tone', freq, type, dur, gain });
}

function noiseBurst(c, dest, { at = 0, dur = 0.5, gain = 0.05, filterFreq = 3000, slideTo = null, q = 1 }) {
  const t0 = c.currentTime + at;
  const len = Math.max(1, Math.floor(c.sampleRate * (dur + 0.1)));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(Math.max(20, filterFreq), t0);
  f.Q.value = q;
  if (slideTo) f.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(reducedGain(gain), t0 + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f);
  f.connect(g);
  g.connect(dest);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
  FX_DEBUG.sounds.push({ kind: 'noise', dur, gain, filterFreq });
}

// --- haptics ---------------------------------------------------------------

/** True only when the device genuinely supports vibration (Android Chrome
 *  etc.). iOS Safari returns false — and stays sound-only. Never faked. */
export function canVibrate() {
  try {
    return (
      enabled &&
      unlocked &&
      typeof navigator !== 'undefined' &&
      typeof navigator.vibrate === 'function'
    );
  } catch {
    return false;
  }
}

/** Vibrate with a pattern. Silent no-op when vibration isn't supported —
 *  and it never pretends otherwise. */
function buzz(pattern) {
  const p = reduced && Array.isArray(pattern) ? [Math.min(25, pattern.reduce((a, b) => a + b, 0))] : pattern;
  const supported = canVibrate();
  FX_DEBUG.haptics.push({ pattern: Array.isArray(p) ? p.slice() : p, fired: supported });
  if (!supported) return false;
  try {
    return navigator.vibrate(p);
  } catch {
    return false;
  }
}

/** Run a matched pair: one sound body + one haptic pattern. Never throws. */
function pair(soundFn, hapticPattern) {
  try {
    const c = audio();
    if (c && masterGain) soundFn(c, masterGain);
  } catch {
    // audio must never break the launcher
  }
  try {
    buzz(hapticPattern);
  } catch {
    // haptics must never break the launcher either
  }
}

const throttleMarks = new Map();

/**
 * Drop repeat firings of high-frequency pairs within the window so coin
 * showers, automatic fire, and rapid hits never stack into noise. Returns
 * true when the caller may fire. Used INSIDE the hot pairs (coin, shoot,
 * hit, boost) — call sites stay clean.
 */
export function throttle(key, ms) {
  try {
    const now = Date.now();
    const last = throttleMarks.get(key) || 0;
    if (now - last < ms) return false;
    throttleMarks.set(key, now);
    return true;
  } catch {
    return true;
  }
}

/** Test hook: clear all throttle windows. */
export function resetFxThrottle() {
  throttleMarks.clear();
}

const EXTERNAL_URL = /^https?:\/\//i;

export const fx = {
  // --- plain UI ----------------------------------------------------------
  /** Every button tap. Tiny, neutral, gone in a blink. */
  tap() {
    pair((c, d) => tone(c, d, { freq: 660, type: 'sine', dur: 0.06, gain: 0.05 }), [12]);
  },

  /** A god menu (or the hub panel) opening: a soft swell upward. */
  menuOpen() {
    pair(
      (c, d) => tone(c, d, { freq: 300, type: 'sine', dur: 0.18, gain: 0.06, slideTo: 520 }),
      [18]
    );
  },

  /** A menu closing: the same swell, played back down. */
  menuClose() {
    pair(
      (c, d) => tone(c, d, { freq: 520, type: 'sine', dur: 0.16, gain: 0.05, slideTo: 300 }),
      [14]
    );
  },

  // --- satellites --------------------------------------------------------
  /**
   * The ONE satellite-launch FX. Internal routes get the full drop fanfare —
   * Merlin's "we DROP it" moment: a rising whoosh into a deep orbital thud.
   * External links (stake.com tower panels, http(s) URLs) get a plain
   * neutral tap — no fanfare on affiliate inventory, ever.
   */
  routeLaunch(route) {
    if (typeof route === 'string' && route && !EXTERNAL_URL.test(route)) {
      fx.satelliteDrop();
      return 'drop';
    }
    fx.tap(); // neutral: external/affiliate link, or nothing to drop
    return 'external';
  },

  /** A satellite drops out of its menu into the orbit rings. */
  satelliteDrop() {
    pair(
      (c, d) => {
        noiseBurst(c, d, { dur: 0.9, gain: 0.06, filterFreq: 400, slideTo: 5000 });
        tone(c, d, { freq: 58, type: 'sine', at: 0.55, dur: 1.1, gain: 0.16, slideTo: 30 });
      },
      [25, 60, 90]
    );
  },

  // --- the bike ----------------------------------------------------------
  /** Spawning to the TRON bike: engine-up sweep with a rising buzz. */
  bikeMount() {
    pair(
      (c, d) => {
        tone(c, d, { freq: 80, type: 'sawtooth', dur: 0.5, gain: 0.07, slideTo: 320 });
        tone(c, d, { freq: 640, type: 'sine', at: 0.3, dur: 0.25, gain: 0.05, slideTo: 960 });
      },
      [0, 50, 60, 70]
    );
  },

  /** Leaving the bike: a soft settle, power easing down. */
  bikeDismount() {
    pair(
      (c, d) => tone(c, d, { freq: 320, type: 'sawtooth', dur: 0.3, gain: 0.05, slideTo: 120 }),
      [35]
    );
  },

  // --- entrance cinematic --------------------------------------------------
  /**
   * Haptics layered onto the entrance cinematic phases. Sound stays in
   * lib/entrance-audio.js (playPhaseSound) — this extends, never replaces.
   * Subscribed from the hub to the 'nexus:entrance-phase' event.
   * 'skipped' / 'completed' are silent: the skip button already tapped.
   */
  entrancePhase(phase) {
    const PATTERNS = {
      static: [15], // signal hiss tremor
      speech: [10], // a bare heartbeat under the address
      glitch: [20, 40, 20], // hijack stutter
      commander: [60], // "We DROP it." — one deep punch
      drop: [40, 60, 120], // satellites seating into their rings
    };
    const p = PATTERNS[phase];
    if (!p) return; // skipped / completed / unknown: no FX
    try {
      buzz(p);
    } catch {
      /* noop */
    }
  },

  // --- purchases -----------------------------------------------------------
  /**
   * Stripe redirect came back ?checkout=success (or a gold purchase went
   * through). Honest, modest, warm: it confirms the RETURN — the webhook
   * settles the actual payment. No triumphant fanfare; we don't over-claim.
   */
  checkoutConfirm() {
    pair(
      (c, d) => {
        tone(c, d, { freq: 261.63, type: 'triangle', dur: 0.14, gain: 0.07 });
        tone(c, d, { freq: 329.63, type: 'triangle', at: 0.12, dur: 0.14, gain: 0.07 });
        tone(c, d, { freq: 392.0, type: 'triangle', at: 0.24, dur: 0.22, gain: 0.08 });
      },
      [20, 60, 20, 60]
    );
  },

  /** Checkout cancelled: a soft neutral settle. Not an error — no buzz-shame. */
  checkoutCancelled() {
    pair((c, d) => tone(c, d, { freq: 196, type: 'sine', dur: 0.2, gain: 0.04 }), [30]);
  },

  // --- errors --------------------------------------------------------------
  /** Real, actionable errors only (checkout failed to start, etc.).
   *  Low double-buzz with a muted descending tone — firm, not alarming. */
  error() {
    pair(
      (c, d) => {
        tone(c, d, { freq: 160, type: 'square', dur: 0.22, gain: 0.06, slideTo: 110 });
        tone(c, d, { freq: 160, type: 'square', at: 0.28, dur: 0.22, gain: 0.06, slideTo: 110 });
      },
      [80, 50, 120]
    );
  },

  // --- victories -------------------------------------------------------------
  /** A liquid-gold bar minted: bright sparkle arpeggio + a shimmer buzz. */
  victory() {
    pair(
      (c, d) => {
        tone(c, d, { freq: 880, type: 'sine', dur: 0.1, gain: 0.06 });
        tone(c, d, { freq: 1320, type: 'sine', at: 0.09, dur: 0.1, gain: 0.06 });
        tone(c, d, { freq: 1760, type: 'sine', at: 0.18, dur: 0.16, gain: 0.07 });
        noiseBurst(c, d, { at: 0.05, dur: 0.3, gain: 0.02, filterFreq: 8000 });
      },
      [15, 40, 15, 40, 60]
    );
  },

  // --- game feel -------------------------------------------------------------
  // Matched pairs for every game in the launcher. Seasoning rule: small
  // events get light ticks (<=120ms patterns); only big moments (wins,
  // deaths, launches) get full rumble. Hot pairs (coin, shoot, hit, boost)
  // throttle internally so showers and automatics never stack into noise.

  /** Coin / pickup sparkle: bright little chirp + a light tick. Small! */
  coin() {
    if (!throttle('fx:coin', 90)) return;
    pair(
      (c, d) => {
        tone(c, d, { freq: 987.77, type: 'sine', dur: 0.07, gain: 0.05 });
        tone(c, d, { freq: 1318.5, type: 'sine', at: 0.06, dur: 0.09, gain: 0.05 });
      },
      [10]
    );
  },

  /** A jump: soft spring blip + a tiny tick. */
  jump() {
    pair(
      (c, d) => tone(c, d, { freq: 280, type: 'sine', dur: 0.12, gain: 0.06, slideTo: 560 }),
      [12]
    );
  },

  /** Damage taken: dull thud + medium buzz. Throttled against hit flurries. */
  hit() {
    if (!throttle('fx:hit', 180)) return;
    pair(
      (c, d) => {
        tone(c, d, { freq: 130, type: 'sine', dur: 0.22, gain: 0.12, slideTo: 55 });
        noiseBurst(c, d, { dur: 0.15, gain: 0.05, filterFreq: 900 });
      },
      [45]
    );
  },

  /** Death / run over: descending tone + long rumble. Collapses under
   *  reduced motion to a single short pulse. */
  death() {
    pair(
      (c, d) => {
        tone(c, d, { freq: 320, type: 'sawtooth', dur: 0.8, gain: 0.08, slideTo: 55 });
        tone(c, d, { freq: 160, type: 'sine', at: 0.1, dur: 0.9, gain: 0.1, slideTo: 40 });
      },
      [60, 60, 140]
    );
  },

  /** Level up: a rising arpeggio — brighter and busier than the gold-mint
   *  victory() sparkle, which stays reserved for liquid gold. */
  levelUp() {
    pair(
      (c, d) => {
        tone(c, d, { freq: 523.25, type: 'triangle', dur: 0.1, gain: 0.07 });
        tone(c, d, { freq: 659.25, type: 'triangle', at: 0.09, dur: 0.1, gain: 0.07 });
        tone(c, d, { freq: 783.99, type: 'triangle', at: 0.18, dur: 0.1, gain: 0.07 });
        tone(c, d, { freq: 1046.5, type: 'triangle', at: 0.27, dur: 0.2, gain: 0.08 });
      },
      [15, 40, 25]
    );
  },

  /** Checkpoint / sector jump / meter-full: soft chime + a single tick. */
  checkpoint() {
    pair(
      (c, d) => tone(c, d, { freq: 659.25, type: 'sine', dur: 0.25, gain: 0.06, slideTo: 880 }),
      [15]
    );
  },

  /** Match / game win: full fanfare. The big one — use sparingly. */
  gameWin() {
    pair(
      (c, d) => {
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
          tone(c, d, { freq: f, type: 'triangle', at: i * 0.11, dur: 0.16, gain: 0.08 })
        );
        tone(c, d, { freq: 2093, type: 'sine', at: 0.44, dur: 0.35, gain: 0.05 });
      },
      [30, 50, 30, 50, 120]
    );
  },

  /** Race countdown tick. final=true: higher and longer — the last beep
   *  before GO. */
  countdownBeep(final) {
    pair(
      (c, d) =>
        tone(c, d, {
          freq: final ? 880 : 440,
          type: 'square',
          dur: final ? 0.18 : 0.1,
          gain: 0.06,
        }),
      [12]
    );
  },

  /** Race launch: a rising sweep into a punch. */
  go() {
    pair(
      (c, d) => {
        tone(c, d, { freq: 440, type: 'sawtooth', dur: 0.35, gain: 0.07, slideTo: 880 });
        noiseBurst(c, d, { dur: 0.3, gain: 0.04, filterFreq: 800, slideTo: 4000 });
      },
      [40, 40, 80]
    );
  },

  /** Weapon fire: light zap + tick. kind tunes the texture ('marksman',
   *  'smg', anything else = rifle). Throttled for automatics. */
  shoot(kind) {
    if (!throttle('fx:shoot', 70)) return;
    const v =
      kind === 'marksman'
        ? { freq: 220, dur: 0.22, gain: 0.09 }
        : kind === 'smg'
          ? { freq: 1100, dur: 0.06, gain: 0.05 }
          : { freq: 750, dur: 0.1, gain: 0.07 };
    pair(
      (c, d) => {
        tone(c, d, { freq: v.freq, type: 'sawtooth', dur: v.dur, gain: v.gain, slideTo: v.freq * 0.35 });
        noiseBurst(c, d, { dur: 0.08, gain: 0.03, filterFreq: 2500 });
      },
      [12]
    );
  },

  /** Speed boost (flyers, racers): a rising whoosh. Throttled — boost is
   *  held, not tapped, so this fires at most ~once a second. */
  /** Stepping through a space portal gate: a rising transit whoosh that
   *  resolves into a soft arrival chime. Throttled — flying through gates
   *  can re-trigger quickly, and the launch fanfare follows right after. */
  portal() {
    if (!throttle('fx:portal', 900)) return;
    pair(
      (c, d) => {
        noiseBurst(c, d, { dur: 0.6, gain: 0.05, filterFreq: 400, slideTo: 5200 });
        tone(c, d, { freq: 220, type: 'sine', dur: 0.55, gain: 0.05, slideTo: 660 });
        tone(c, d, { freq: 880, type: 'sine', at: 0.55, dur: 0.35, gain: 0.04, slideTo: 1320 });
      },
      [30, 70, 30]
    );
  },

  boost() {
    if (!throttle('fx:boost', 900)) return;
    pair(
      (c, d) => {
        noiseBurst(c, d, { dur: 0.55, gain: 0.05, filterFreq: 500, slideTo: 4500 });
        tone(c, d, { freq: 180, type: 'sine', dur: 0.5, gain: 0.05, slideTo: 420 });
      },
      [25, 60, 25]
    );
  },

  // --- persephone ------------------------------------------------------------
  /** Door entry: presence join succeeded, the avatar fades in. Fired once
   *  per visit — not on every peer update. A soft welcome shimmer. */
  doorEntry() {
    pair(
      (c, d) => tone(c, d, { freq: 523.25, type: 'sine', dur: 0.3, gain: 0.05, slideTo: 784 }),
      [25]
    );
  },

  /**
   * Stage wash for set-start — RESERVED for a real ingest confirmation.
   * Persephone's builder rule: the wash only plays when a real stream
   * ingest confirms the set is live. The broadcast room has no live branch
   * yet, so this is exported for that future branch to call — never from a
   * fake-live state.
   */
  stageWash() {
    pair(
      (c, d) => {
        noiseBurst(c, d, { dur: 1.2, gain: 0.06, filterFreq: 600, slideTo: 4000, q: 2 });
        tone(c, d, { freq: 98, type: 'sine', at: 0.2, dur: 0.9, gain: 0.1 });
      },
      [50, 80, 100]
    );
  },

  // --- orbit scene -----------------------------------------------------------
  /** Diving to the photorealistic Earth: a soft descending whoosh. */
  earthDive() {
    pair(
      (c, d) => {
        noiseBurst(c, d, { dur: 0.8, gain: 0.05, filterFreq: 2000, slideTo: 300 });
        tone(c, d, { freq: 220, type: 'sine', dur: 0.8, gain: 0.06, slideTo: 70 });
      },
      [30, 80, 50]
    );
  },

  /**
   * Spacecraft landing in a pocket universe: a controlled-burn rumble that
   * settles into a soft touchdown thud. Timed for a ~3s descent flight.
   */
  landing() {
    pair(
      (c, d) => {
        noiseBurst(c, d, { dur: 2.4, gain: 0.05, filterFreq: 500, slideTo: 120 });
        tone(c, d, { freq: 95, type: 'sawtooth', dur: 2.4, gain: 0.05, slideTo: 48 });
        tone(c, d, { freq: 58, type: 'sine', at: 2.3, dur: 0.9, gain: 0.16, slideTo: 30 });
      },
      [40, 60, 40, 60, 40, 120]
    );
  },
};

export default fx;
