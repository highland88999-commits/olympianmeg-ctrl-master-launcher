// lib/entrance-sequence.js — State machine for the Nexus entrance cinematic.
//
// The intro is a ~11s original homage sequence (broadcast static → podium
// speech → signal hijack → masked commander → satellite drop into orbit).
// This module is pure logic + localStorage persistence so it can be tested
// headlessly. The React component (components/EntranceSequence.jsx) drives
// the machine with timers and renders each phase.
//
// Skip policy: an EXPLICIT skip persists `nexus_intro_skip_v1 = '1'` so the
// intro never auto-plays again. Watching it through does not persist — only
// the skip action does. Replay is always available from the hub UI.

export const INTRO_SKIP_KEY = 'nexus_intro_skip_v1';

// Phase order and pacing. Total ≈ 11s — inside the 8–12s budget.
export const PHASES = [
  { id: 'static',    durationMs: 2200 }, // dark broadcast-static opening
  { id: 'speech',    durationMs: 2600 }, // podium figure: "We don't launch it—"
  { id: 'glitch',    durationMs: 1100 }, // signal hijack effect
  { id: 'commander', durationMs: 2200 }, // masked commander: "We DROP it."
  { id: 'drop',      durationMs: 3000 }, // satellites drop into their orbit rings
];

export const TOTAL_DURATION_MS = PHASES.reduce((sum, p) => sum + p.durationMs, 0);

// Plain-English captions shown on screen. Exported so tests can assert them.
export const CAPTIONS = {
  static: 'TUNING IN…',
  speech: 'We don’t launch it—',
  commander: 'We DROP it.',
  drop: 'NEXUS',
};

function safeGet(storage) {
  try {
    return storage ? storage.getItem(INTRO_SKIP_KEY) : null;
  } catch {
    return null; // private mode / denied storage: behave as "not skipped"
  }
}

function safeSet(storage) {
  try {
    if (storage) storage.setItem(INTRO_SKIP_KEY, '1');
  } catch {
    // storage unavailable: skip just ends the intro for this session
  }
}

/**
 * createEntranceMachine(storage, opts)
 * storage: a localStorage-like { getItem, setItem } or null.
 * opts.fast: true when prefers-reduced-motion — plays a compressed cut.
 *
 * States: 'idle' → 'playing' → 'done'
 * End reasons: 'completed' (watched through) | 'skipped' (user bailed)
 */
export function createEntranceMachine(storage, opts = {}) {
  const fast = !!opts.fast;
  const scale = fast ? 0.35 : 1;

  let status = 'idle';
  let index = 0;
  let reason = null;

  const machine = {
    /** True when the intro should auto-play on entrance (no skip on record). */
    shouldAutoPlay() {
      return safeGet(storage) !== '1';
    },

    /** Begin (or restart) the sequence. Returns a snapshot. */
    start() {
      status = 'playing';
      index = 0;
      reason = null;
      return machine.snapshot();
    },

    /** Current phase id, or null when not playing. */
    phase() {
      return status === 'playing' ? PHASES[index].id : null;
    },

    /** How long the current phase lasts (ms), honoring the fast cut. */
    phaseDurationMs() {
      if (status !== 'playing') return 0;
      return Math.round(PHASES[index].durationMs * scale);
    },

    /** Move to the next phase; completes the sequence at the end. */
    advance() {
      if (status !== 'playing') return machine.snapshot();
      index += 1;
      if (index >= PHASES.length) {
        status = 'done';
        reason = 'completed';
      }
      return machine.snapshot();
    },

    /** User bailed: end immediately AND persist the skip preference. */
    skip() {
      if (status === 'done' && reason === 'skipped') return machine.snapshot();
      status = 'done';
      reason = 'skipped';
      safeSet(storage);
      return machine.snapshot();
    },

    /** Manual replay from the hub: restart, but never clear the skip flag. */
    replay() {
      return machine.start();
    },

    snapshot() {
      return {
        status,
        phase: machine.phase(),
        reason,
        phaseIndex: index,
        phaseCount: PHASES.length,
      };
    },

    totalDurationMs() {
      return Math.round(TOTAL_DURATION_MS * scale);
    },
  };

  return machine;
}
