// lib/earth2/sfx.js
// EARTH 2 — SYNTHESIZED SOUND + HAPTICS (Vehicles Phase 2,
// Phase B, 2026-10-23). Merlin: "Inject sound haptics."
//
// No audio assets anywhere: every effect is Web Audio
// synthesis — filtered noise bursts, sine drops, inharmonic
// metallic partials — built lazily, because a browser only
// lets an AudioContext start inside a user gesture. The scene
// calls ensureSfx() from its gesture handlers; every effect
// then no-ops quietly until a context is actually running.
// No window, no AudioContext, a context that refuses to
// resume — nothing here throws, ever; the game just stays
// silent, which is the correct failure mode for sound.
//
// The DECISIONS are pure and exported — gain curves, filter
// frequencies, haptic pattern selection — so the tests pin
// the feel without a browser. Only the plumbing touches the
// platform, and it is all guarded try/catch.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ── Pure: how loud, how deep, how hard the buzz ─────────────

/** Impact thud gain (0..0.9) for a bill of `amount` integrity
 *  points: a scrape is a whisper, a wrecking hit is a shout,
 *  and nothing honest is free. */
export function impactGainFor(amount) {
  const a = Number(amount) || 0;
  if (a <= 0) return 0;
  return clamp(0.12 + a * 0.012, 0, 0.9);
}

/** The thud's lowpass frequency: the bigger the hit, the
 *  deeper the boom (950 Hz scrape → 170 Hz floor). */
export function impactFilterFreqFor(amount) {
  const a = Math.max(0, Number(amount) || 0);
  return clamp(950 - a * 11, 170, 950);
}

/** Explosion gain by distance to the listener: full voice at
 *  the wreck, a tenth of it two hundred metres out. */
export function explosionGainFor(distanceM) {
  const d = Math.max(0, Number(distanceM) || 0);
  return 0.95 / (1 + d / 22);
}

/** Splash gain for a water entry at `speed` m/s: below a
 *  walking pace there is nothing to hear. */
export function splashGainFor(speed) {
  const s = Math.abs(Number(speed) || 0);
  if (s < 2) return 0;
  return clamp(s * 0.028, 0, 0.5);
}

/** At and past this bill, an impact is a HARD impact. */
export const HARD_IMPACT_AMOUNT = 25;

/**
 * The haptic pattern for one felt event, in navigator.vibrate
 * terms (a number of ms, an [on, off, on] pattern, or 0 for
 * silence). Merlin's set: a light impact 30 ms, a hard one
 * 70 ms, an explosion [120, 40, 120], a shot landing 15 ms,
 * and the sinking / low-integrity warning a short double-tap.
 */
export function hapticFor(event) {
  if (!event || typeof event !== 'object') return 0;
  switch (event.kind) {
    case 'impact': {
      const a = Number(event.amount) || 0;
      if (a <= 0) return 0;
      return a >= HARD_IMPACT_AMOUNT ? 70 : 30;
    }
    case 'explosion': return [120, 40, 120];
    case 'shot': return 15;
    case 'warning':
    case 'sinking': return [30, 60, 30];
    default: return 0;
  }
}

/** Fire the haptic for an event. Returns true when a pattern
 *  was actually delivered; unsupported platforms (desktop,
 *  iOS Safari) no-op silently. */
export function vibrateFor(event) {
  let pattern = 0;
  try { pattern = hapticFor(event); } catch { return false; }
  if (!pattern || (Array.isArray(pattern) && pattern.length === 0)) return false;
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
      return true;
    }
  } catch { /* a refused buzz is not an error worth surfacing */ }
  return false;
}

// ── The audio plumbing (guarded, lazy, gesture-born) ────────

let actx = null;
let masterGain = null;
let noiseBuffer = null;

/**
 * Create (once) and resume the context. Call from user
 * gestures — pointerdown, keydown, a button press. Returns
 * true when sound can actually play right now.
 */
export function ensureSfx() {
  try {
    if (typeof window === 'undefined') return false;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    if (!actx) {
      actx = new AC();
      masterGain = actx.createGain();
      masterGain.gain.value = 0.85;
      masterGain.connect(actx.destination);
      const len = Math.max(1, Math.floor(actx.sampleRate * 1.2));
      noiseBuffer = actx.createBuffer(1, len, actx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (actx.state === 'suspended') {
      const p = actx.resume();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
    return actx.state === 'running';
  } catch {
    return false;
  }
}

function ready() {
  return !!(actx && masterGain && actx.state === 'running');
}

function noiseSource() {
  const src = actx.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;
  return src;
}

/** A gain node with a fast attack and an exponential tail. */
function envelope(peak, dur) {
  const t0 = actx.currentTime;
  const g = actx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
  g.connect(masterGain);
  return g;
}

/** A filtered noise burst — the body of thuds and splashes. */
function noiseBurst({ type, freqFrom, freqTo, peak, dur, q = 0.7 }) {
  const t0 = actx.currentTime;
  const src = noiseSource();
  const filter = actx.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(freqFrom, t0);
  filter.frequency.exponentialRampToValueAtTime(Math.max(30, freqTo), t0 + dur);
  src.connect(filter);
  filter.connect(envelope(peak, dur));
  src.start(t0);
  src.stop(t0 + dur + 0.05);
}

/** A sine voice with a pitch glide (thumps, sub drops, ticks). */
function tone({ type = 'sine', freqFrom, freqTo, peak, dur, delay = 0 }) {
  const t0 = actx.currentTime + delay;
  const osc = actx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freqFrom, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqTo), t0 + dur);
  const g = actx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
  osc.connect(g);
  g.connect(masterGain);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

/** A billable hit while driving: the thud's body is filtered
 *  noise, its weight a low sine — both sized by the bill. */
export function sfxImpact(amount) {
  try {
    if (!ready()) return;
    const gain = impactGainFor(amount);
    if (gain <= 0) return;
    const dur = 0.22 + Math.min(0.28, (Number(amount) || 0) * 0.003);
    noiseBurst({
      type: 'lowpass',
      freqFrom: impactFilterFreqFor(amount),
      freqTo: 90,
      peak: gain,
      dur,
    });
    tone({ freqFrom: 96, freqTo: 46, peak: gain * 0.75, dur: dur * 0.9 });
  } catch { /* silence is an acceptable impact */ }
}

/** The explosion: a noise burst whose filter collapses, over
 *  a sub-bass drop — sized by the listener's distance. */
export function sfxExplosion(distanceM) {
  try {
    if (!ready()) return;
    const gain = explosionGainFor(distanceM);
    if (gain < 0.02) return;
    noiseBurst({ type: 'lowpass', freqFrom: 2600, freqTo: 80, peak: gain, dur: 1.0 });
    tone({ freqFrom: 118, freqTo: 27, peak: Math.min(1, gain * 1.15), dur: 0.9 });
  } catch { /* ditto */ }
}

/** A bullet striking metal: inharmonic partials, fast tails,
 *  plus a breath of high noise for the strike itself. */
export function sfxClang() {
  try {
    if (!ready()) return;
    const partials = [
      [523.25, 0.10, 0.22], [1244.5, 0.07, 0.16], [2093, 0.045, 0.10], [2960, 0.02, 0.06],
    ];
    for (const [freq, peak, dur] of partials) {
      tone({ type: 'triangle', freqFrom: freq, freqTo: freq * 0.995, peak, dur });
    }
    noiseBurst({ type: 'highpass', freqFrom: 4200, freqTo: 4200, peak: 0.05, dur: 0.035 });
  } catch { /* ditto */ }
}

/** Water entry at speed: band-swept noise, the pitch falling
 *  as the hull (or the wheels) push through. */
export function sfxSplash(speed) {
  try {
    if (!ready()) return;
    const gain = splashGainFor(speed);
    if (gain <= 0) return;
    noiseBurst({ type: 'bandpass', freqFrom: 1300, freqTo: 320, peak: gain, dur: 0.55, q: 0.8 });
  } catch { /* ditto */ }
}

/** The low-integrity warning while driving: two dry ticks. */
export function sfxWarningTick() {
  try {
    if (!ready()) return;
    tone({ type: 'square', freqFrom: 840, freqTo: 840, peak: 0.05, dur: 0.055 });
    tone({ type: 'square', freqFrom: 840, freqTo: 840, peak: 0.05, dur: 0.055, delay: 0.12 });
  } catch { /* ditto */ }
}

/** A fresh machine materializing at home: a soft rising
 *  shimmer, kept quiet — a courtesy, not an alarm. */
export function sfxShimmer() {
  try {
    if (!ready()) return;
    tone({ freqFrom: 380, freqTo: 920, peak: 0.04, dur: 0.5 });
    tone({ freqFrom: 760, freqTo: 1840, peak: 0.018, dur: 0.5 });
  } catch { /* ditto */ }
}
