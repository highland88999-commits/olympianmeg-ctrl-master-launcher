// lib/controls/gesture.js
//
// The CONTINUOUS-CONTACT gesture engine (Merlin, 2026-10-13):
// "The finger should not have to leave the pad." One unbroken touch
// engages a pad; sliding crosses wedges without lifting; lifting the
// finger is the only release — the pad returns to neutral the moment
// contact ends. The CENTER of every pad is NEUTRAL: inside the dead
// zone no wedge is active, whatever the angle.
//
// Pure state machine — no DOM. The React pad feeds it normalized
// coordinates (pad space: x right+, y down+, 0 = center, 1 = rim) and
// pointer ids; it emits events the component translates to game input:
//
//   { type: 'engage' }                    contact began
//   { type: 'wedgeOn',  index }           a wedge became active
//   { type: 'wedgeOff', index }           a wedge stopped being active
//   { type: 'tilt', index, tilt, vector } analog readout while engaged
//                                         (tilt = magnitude 0..1 from
//                                         center; vector = unit*magnitude)
//   { type: 'release' }                   contact ended -> neutral
//
// Hold wedges (Block) and momentary wedges (Punch) use the same
// wedgeOn/wedgeOff pair — the consumer decides what "on" means.
// Analog wedges (Advance/Retreat, the brawl compass) read `tilt`.

import { wedgeIndexForAngle } from './shapes.js';

export const DEFAULT_DEAD_ZONE = 0.22;

export function createPadGesture({ sides, deadZone = DEFAULT_DEAD_ZONE } = {}) {
  if (!Number.isInteger(sides) || sides < 1) {
    throw new Error(`createPadGesture: sides must be a positive integer, got ${sides}`);
  }
  let engaged = false;
  let activePointer = null;
  let wedge = -1;
  let tilt = 0;
  let vector = { x: 0, y: 0 };

  function evaluate(x, y) {
    const r = Math.hypot(x, y);
    if (r < deadZone) return { wedge: -1, tilt: 0, vector: { x: 0, y: 0 } };
    const mag = Math.min(1, r);
    const ang = Math.atan2(y, x);
    return {
      wedge: wedgeIndexForAngle(ang, sides),
      tilt: mag,
      vector: { x: Math.cos(ang) * mag, y: Math.sin(ang) * mag },
    };
  }

  function applyPosition(x, y, events) {
    const next = evaluate(x, y);
    if (next.wedge !== wedge) {
      if (wedge >= 0) events.push({ type: 'wedgeOff', index: wedge });
      wedge = next.wedge;
      if (wedge >= 0) events.push({ type: 'wedgeOn', index: wedge });
    }
    tilt = next.tilt;
    vector = next.vector;
    events.push({ type: 'tilt', index: wedge, tilt, vector: { ...vector } });
  }

  return {
    get engaged() { return engaged; },
    get wedge() { return wedge; },
    get tilt() { return tilt; },
    get vector() { return { ...vector }; },
    get pointerId() { return activePointer; },

    /** Contact begins. `x`,`y` in pad space. Returns events. */
    down(pointerId, x, y) {
      if (engaged) return []; // one engagement per pad; other fingers ignored
      engaged = true;
      activePointer = pointerId;
      const events = [{ type: 'engage' }];
      applyPosition(x, y, events);
      return events;
    },

    /** Contact slides — the heart of the continuous-contact law. */
    move(pointerId, x, y) {
      if (!engaged || pointerId !== activePointer) return [];
      const events = [];
      applyPosition(x, y, events);
      return events;
    },

    /** Contact ends: everything disengages, pad returns to neutral. */
    up(pointerId) {
      if (!engaged) return [];
      if (pointerId != null && pointerId !== activePointer) return [];
      const events = [];
      if (wedge >= 0) events.push({ type: 'wedgeOff', index: wedge });
      wedge = -1;
      tilt = 0;
      vector = { x: 0, y: 0 };
      events.push({ type: 'tilt', index: -1, tilt: 0, vector: { x: 0, y: 0 } });
      events.push({ type: 'release' });
      engaged = false;
      activePointer = null;
      return events;
    },

    /** Unconditional release (Esc key, unmount, mode switch). */
    forceRelease() {
      return this.up(null);
    },
  };
}

/**
 * The joystick element's readout: Merlin's joystick "acts as it pretty
 * much is already" — direction + magnitude from center, with the same
 * dead-zone-to-neutral rule. Returns tilt vector parts.
 */
export function stickReadout(x, y, deadZone = 0.12) {
  const r = Math.hypot(x, y);
  if (r < deadZone) return { x: 0, y: 0, magnitude: 0, angle: 0 };
  const mag = Math.min(1, r);
  const ang = Math.atan2(y, x);
  // rescale so the rim is exactly 1 past the dead zone
  const scaled = Math.min(1, (r - deadZone) / (1 - deadZone));
  return {
    x: Math.cos(ang) * scaled,
    y: Math.sin(ang) * scaled,
    magnitude: scaled,
    angle: ang,
    rawMagnitude: mag,
  };
}
