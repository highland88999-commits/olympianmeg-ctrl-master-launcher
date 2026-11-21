// lib/starforge/tile-hold.js — the tile-video hold, as pure transitions.
//
// After a roll (or a void-pirate landing) wakes tile videos, the turn
// must last at least as long as the video (Merlin, Nov 21). This module
// owns the hold's state transitions; the page owns the React state and
// the backstop timer, and TileVideo (graphics.jsx) owns the video
// element. No React, no timers, no I/O here — so the transitions are
// directly unit-testable.
//
// The duration always comes from the video element itself (TileVideo
// reads v.duration and reports it). The only constants here are the
// grace added to a reported duration for the backstop timer, and the
// absolute failsafe that bounds a hold whose videos never report a
// duration or an end. Neither is a video-duration constant: the 5 s the
// tile videos happen to be is never written down in this module.

// Grace added to a video's own duration for the backstop timer.
export const TILE_HOLD_GRACE_MS = 1000;
// Failsafe: a hold with no reported duration and no end event ends here.
export const TILE_HOLD_FAILSAFE_MS = 30_000;

export function createTileHold() {
  return { playing: 0, maxDurationMs: 0 };
}

// A tile started playing. durationMs is the video's own duration in ms,
// or null when its metadata had not loaded yet. restart is true when the
// tile was already playing and a second matching roll rewound it — the
// play count does not rise, only the timer is refreshed.
export function tileHoldWake(hold, durationMs, restart = false) {
  if (!restart) hold.playing += 1;
  if (Number.isFinite(durationMs) && durationMs > 0) {
    hold.maxDurationMs = Math.max(hold.maxDurationMs, durationMs);
  }
  return hold;
}

// A woken tile's metadata arrived late: record its duration so the
// backstop can be set from the real length.
export function tileHoldDuration(hold, durationMs) {
  if (Number.isFinite(durationMs) && durationMs > 0) {
    hold.maxDurationMs = Math.max(hold.maxDurationMs, durationMs);
  }
  return hold;
}

// A tile stopped playing (ended, errored, or its play() was rejected).
// The hold ends when the last playing tile reports.
export function tileHoldEnd(hold) {
  if (hold.playing > 0) hold.playing -= 1;
  if (hold.playing <= 0) {
    hold.playing = 0;
    hold.maxDurationMs = 0;
  }
  return hold;
}

export function tileHoldActive(hold) {
  return hold.playing > 0;
}

// How long the backstop timer runs from now: the longest reported video
// duration plus grace — or the failsafe when no duration was reported.
export function tileHoldBackstopMs(hold) {
  return hold.maxDurationMs > 0
    ? hold.maxDurationMs + TILE_HOLD_GRACE_MS
    : TILE_HOLD_FAILSAFE_MS;
}
