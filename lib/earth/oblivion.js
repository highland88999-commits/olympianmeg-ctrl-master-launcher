// lib/earth/oblivion.js — the Oblivion sequence, pure logic
// (Merlin, 2026-10-26 late evening orders + the reference video:
// a bright mass blooms, pulls inward toward a central point, and
// collapses into a dark void with radiant light streaks).
//
// THE SEQUENCE, IN HIS ORDER:
//   1. Oblivion triggers -> Earth gets sucked into the middle and
//      disappears (an ORIGINAL shader cinematic in the video's
//      visual grammar — never the video file itself).
//   2. THEN the 3D countdown of 72 hours begins, on a holographic
//      4-sided cube, oriented horizontally like a hockey arena's
//      center-ice scoreboard cube, floating over the waiting space.
//   3. AT THE END (countdown reaches 0) -> Earth 2 is released
//      for EACH MEMBER of the passing team.
//
// This module holds ONLY pure, node-testable decisions: phase
// timing, countdown math, the cube's face contract, and the
// release-qualifying definition. Rendering lives in
// components/earth/OblivionCollapse.jsx and
// components/earth/OblivionCountdownCube.jsx; server enforcement
// lives in lib/earth2/release.js + app/api/earth2/release/route.js.
// Nothing here touches the network, the DOM, or Supabase, so the
// whole contract is pinned by tests/earth2-oblivion.test.mjs.

// The wait: 72 hours, exactly (Merlin's order, matching the
// Oblivion story Earth 1 has carried all along).
export const OBLIVION_WAIT_MS = 72 * 60 * 60 * 1000;

// The collapse cinematic, one continuous move (~9.5 s):
// bloom -> inward pull -> collapse into the void -> gone.
export const COLLAPSE_PHASES = [
  { key: 'bloom', startMs: 0, endMs: 2500 },
  { key: 'pull', startMs: 2500, endMs: 7000 },
  { key: 'collapse', startMs: 7000, endMs: 9500 },
];
export const COLLAPSE_TOTAL_MS = 9500;

/** Phase of the collapse cinematic at tMs since it started. */
export function collapsePhaseAt(tMs) {
  if (tMs < 0) return 'bloom';
  for (const p of COLLAPSE_PHASES) {
    if (tMs >= p.startMs && tMs < p.endMs) return p.key;
  }
  return 'done';
}

/** Milliseconds left until endsAtMs, never below zero. */
export function remainingMs(endsAtMs, nowMs) {
  if (!endsAtMs || !nowMs) return 0;
  return Math.max(0, endsAtMs - nowMs);
}

/** "72:00:00" style countdown text. Hours are NOT capped at 24:
// the wait is 72 hours, so the counter reads 72 down to 00. */
export function formatCountdown(ms) {
  const totalSeconds = Math.max(0, Math.floor((ms || 0) / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

// ── The holographic countdown cube ───────────────────────────────
// A floating scoreboard cube, oriented HORIZONTALLY (its four
// faces point outward around the vertical axis, like a hockey
// arena's center-ice cube). The countdown shows on ALL FOUR side
// faces so it reads from every angle. Top and bottom are dark
// caps, not display faces.
//
// BLACKOUT RULE (Merlin, 2026-10-26): the BACK of each face is
// BLACKED OUT — every face carries its countdown display on the
// front with an OPAQUE BLACK backing behind it, so the opposite
// face's numbers can never bleed through (no mirrored
// double-read). The cube keeps its holographic glow on the faces,
// but each face reads cleanly on its own because the black backing
// blocks bleed-through. The renderer enforces this twice: the
// backing plane is opaque black, AND every face plane is
// front-side only (backs culled), so looking through the cube
// never shows a far face's numbers.
export const CUBE_FACE_COUNT = 4;
export const CUBE_FACE_BACKING = 'opaque-black';
export const CUBE_FACES = [
  { angleDeg: 0, backing: CUBE_FACE_BACKING },
  { angleDeg: 90, backing: CUBE_FACE_BACKING },
  { angleDeg: 180, backing: CUBE_FACE_BACKING },
  { angleDeg: 270, backing: CUBE_FACE_BACKING },
];

// ── The Earth 2 release definition ───────────────────────────────
// RELEASE_QUALIFYING_MODE is THE single switch for who counts as
// a "passing team" (Merlin's order, default reading): every team
// that earned entry through the mandatory-teams rule — solo teams
// of one included — so each member is released at countdown end.
// Flipping this to 'top-5-prize-teams-only' is a one-constant
// change here PLUS the matching query branch in
// lib/earth2/release.js (top-5 needs the standings rank, not just
// a membership row); the constant names the definition, the
// server query enforces it. Never client-claimed.
export const RELEASE_QUALIFYING_MODE = 'team-members';

/**
 * Pure membership predicate for the release definition.
 * memberRows: rows proving the user belongs to a team (any shape;
 * only presence matters for 'team-members' mode).
 */
export function isReleaseQualified({ mode, memberRows }) {
  if (mode === 'team-members') {
    return Array.isArray(memberRows) && memberRows.length > 0;
  }
  return false;
}

/**
 * The whole release decision, pure. preAccess covers the
 * pre-existing law (owner + named POC guest), which holds
 * regardless of the countdown — the release only ADDS members
 * of passing teams once the countdown completes. Before the
 * countdown is armed, nothing new is released.
 */
export function releaseState({ armed, endsAtMs, nowMs, memberRows, preAccess }) {
  if (!armed || !endsAtMs) {
    return { armed: false, complete: false, qualified: false, released: Boolean(preAccess) };
  }
  const complete = nowMs >= endsAtMs;
  const qualified = isReleaseQualified({ mode: RELEASE_QUALIFYING_MODE, memberRows });
  return {
    armed: true,
    complete,
    qualified,
    released: Boolean(preAccess) || (complete && qualified),
  };
}
