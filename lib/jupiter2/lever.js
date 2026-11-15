// lib/jupiter2/lever.js — the Jupiter 2 oblivion lever, pure logic.
//
// Merlin's spec (Nov 10): an OBLIVION LEVER somewhere on Jupiter
// that triggers oblivion, GLOWING GREEN so it can be seen through
// the storm. His oblivion arming is GATED: pulling the lever shows
// the oblivion warning and asks for an explicit CONFIRM before
// anything destructive runs — a single accidental tap must never
// destroy the world.
//
// THE GATE, as a state machine: idle → (pull) → warned → (confirm)
// → armed. Pulling alone NEVER arms anything: pullLever only raises
// the warning. Only confirmOblivion, called from the explicit
// confirm button in the warning dialog, arms it.
//
// WHAT "ARMED" MEANS HERE — read this before wiring anything
// destructive: the existing oblivion sequence (lib/earth/oblivion.js)
// is Earth 1 → Earth 2's: a 72-hour countdown and a release for
// Earth 2. There is NO Jupiter 2 successor world and NO server
// endpoint that collapses Jupiter 2, so arming records the intent
// (armedAtMs + the 72-hour countdown from the shared law) and the
// scene shows OBLIVION ARMED with that countdown. NOTHING in this
// module — and nothing the scene calls — collapses, deletes, or
// hides the world. The collapse itself needs Merlin's explicit
// server-side order; until then the armed lever is a gated intent,
// not a trigger. That is the honest reading of the gate, and the
// test pins it: pull-without-confirm leaves armed === false.

import { OBLIVION_WAIT_MS, formatCountdown } from '../earth/oblivion.js';

export { OBLIVION_WAIT_MS, formatCountdown };

export const LEVER_GREEN = '#22ff66';
export const LEVER_BEACON_HEIGHT = 60;

/** Fresh lever state: untouched, nothing armed. */
export function createLeverState() {
  return { pulled: false, warned: false, armed: false, armedAtMs: null };
}

/**
 * Pull the lever. First pull raises the warning only — armed
 * stays false. Pulling an already-armed lever changes nothing.
 * Returns { action: 'warn' | 'already-armed' }.
 */
export function pullLever(state, _nowMs = Date.now()) {
  if (state.armed) return { action: 'already-armed' };
  state.pulled = true;
  state.warned = true;
  return { action: 'warn' };
}

/**
 * The explicit CONFIRM from the warning dialog. Only a warned
 * (pulled, not yet armed) lever can be confirmed; confirming an
 * idle lever is a no-op that arms nothing. Returns the arm record
 * { armed, armedAtMs, endsAtMs, countdown } — the 72-hour wait
 * from the shared oblivion law.
 */
export function confirmOblivion(state, nowMs = Date.now()) {
  if (!state.warned || state.armed) {
    return { armed: false, armedAtMs: state.armedAtMs, endsAtMs: null, countdown: null };
  }
  state.armed = true;
  state.armedAtMs = nowMs;
  const endsAtMs = nowMs + OBLIVION_WAIT_MS;
  return { armed: true, armedAtMs: nowMs, endsAtMs, countdown: formatCountdown(OBLIVION_WAIT_MS) };
}

/** Stand down from the warning without arming anything. */
export function cancelLever(state) {
  state.pulled = false;
  state.warned = false;
  return { action: 'cancelled' };
}

/** Readable status for the HUD: phase + live countdown while armed. */
export function leverStatus(state, nowMs = Date.now()) {
  if (state.armed && state.armedAtMs != null) {
    const remaining = Math.max(0, state.armedAtMs + OBLIVION_WAIT_MS - nowMs);
    return { phase: 'armed', countdown: formatCountdown(remaining) };
  }
  if (state.warned) return { phase: 'warned', countdown: null };
  return { phase: 'idle', countdown: null };
}
