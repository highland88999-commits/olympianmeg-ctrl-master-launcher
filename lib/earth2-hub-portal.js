// lib/earth2-hub-portal.js
// THE EARTH 2 DOOR IN THE MAIN HUB (Merlin, 2026-10-22): "Put the
// portal to earth 2 in the main hub, but only my account can open it."
//
// The worlds browser in the 3D portal space is Artemis (user worlds) —
// Earth 2 does not belong there and its absence there is correct. Its
// door belongs in the hub itself, flanking the Omega Arch beyond the
// Sun, as a sibling monument: same Ω family form, its own earth-toned
// identity, and NO Earth 2 content of any kind — no models, no
// characters, nothing from the Bay. A door only. (The chamber behind
// it, app/earth-2, keeps its own server-side owner gate as the second
// lock; this module is presentation + the visibility decision.)
//
// THE GATE: the portal exists in the hub scene ONLY for accounts
// with Earth 2 access. Until 2026-10-23 that was the owner alone;
// Merlin's proof-of-concept order ("Make earth 2 portal and world
// render in his account") admits exactly one named guest beside
// him. The decision is this module's one pure function,
// earth2HubPortalVisible(email), which defers to
// lib/earth2/access.js — the one definition of Earth 2 access (the
// owner via lib/owner.js, plus the guest; no email string is ever
// copied here). The hub component consumes the decision and
// renders nothing at all — no mesh, no label, no click target — for
// signed-out visitors, other accounts, and while the session is still
// resolving (no email yet ⇒ not visible). Pure and node-testable:
// this module never touches the DOM, three, or the network.

import { hasEarth2Access } from './earth2/access.js';
import { OMEGA_ARCH, OMEGA_POSITION, SUN_CENTER, SUN_RADIUS } from './omega-arch.js';

/** The chamber the door opens onto (its own gate stays the second lock). */
export const EARTH2_HUB_ROUTE = '/earth-2';

/** The name over the crown, in the Omega label's serif convention. */
export const EARTH2_HUB_LABEL = 'EARTH 2';

/**
 * The gate decision, pure: a session email proves Earth 2 access
 * (the owner, or the one named POC guest — lib/earth2/access.js),
 * or the portal does not exist. Null/undefined/empty (signed out,
 * or the session still resolving) are all "no access" — the door
 * stays absent until the session actually proves whose it is.
 */
export function earth2HubPortalVisible(email) {
  return hasEarth2Access(email);
}

// Arch geometry — the Omega family's proportions at a slightly
// smaller, younger scale: the same 288° torus with two feet, so the
// two monuments read as kin across the vista beyond the Sun.
export const EARTH2_HUB_ARCH = {
  radius: 56,
  tube: 10,
  arc: Math.PI * 1.6, // 288 degrees — the bottom gap makes the Ω opening
  rotationZ: -Math.PI * 0.3, // gap centered at the bottom
  footLength: 28,
};

// The swirl disc inside the arch (Omega's rule: radius - tube - 5).
export const EARTH2_HUB_PORTAL_RADIUS = EARTH2_HUB_ARCH.radius - EARTH2_HUB_ARCH.tube - 5; // 41

// Where the door stands: on the Omega Arch's own plane (z = 1000,
// the vista beyond the Sun), offset +240 on x. The Omega spans
// x ∈ [-95, 95] there; this arch spans x ∈ [174, 306] — a clear
// 79-unit gap between the two monuments, and ~414 units from the
// Sun's center (its surface reaches 67.5), so it collides with
// neither the Sun nor the Omega click/fly-through targets, and it
// stands far clear of the bike's playground around the hub center.
// EARTH2_HUB_POSITION is the feet plane; the ring center rides
// EARTH2_HUB_RING_CENTER_Y above it (same endpoint math as Omega).
export const EARTH2_HUB_POSITION = { x: 240, y: OMEGA_POSITION.y, z: OMEGA_POSITION.z };

export const EARTH2_HUB_RING_CENTER_Y =
  Math.abs(EARTH2_HUB_ARCH.radius * Math.sin(-Math.PI * 0.3)) + EARTH2_HUB_ARCH.tube;

export function earth2HubFootX() {
  return EARTH2_HUB_ARCH.radius * Math.cos(-Math.PI * 0.3); // ≈ 32.9
}

export function earth2HubFootY() {
  return EARTH2_HUB_ARCH.radius * Math.sin(-Math.PI * 0.3); // ≈ -45.3
}

// World-space center of the swirl disc (before the breathing bob),
// for fly-through checks and labels.
export function earth2HubPortalCenter(bobY = 0) {
  return {
    x: EARTH2_HUB_POSITION.x,
    y: EARTH2_HUB_POSITION.y + EARTH2_HUB_RING_CENTER_Y + bobY,
    z: EARTH2_HUB_POSITION.z,
  };
}

// Clearance facts, exported so tests pin the placement law instead of
// re-deriving it: the gap between this arch's span and the Omega
// Arch's span on their shared plane, and this arch's distance from
// the Sun's center minus the Sun's radius and the arch's own reach.
export function earth2HubClearances() {
  const omegaHalfSpan = OMEGA_ARCH.radius + OMEGA_ARCH.tube;
  const ownHalfSpan = EARTH2_HUB_ARCH.radius + EARTH2_HUB_ARCH.tube;
  const gapToOmega =
    EARTH2_HUB_POSITION.x - ownHalfSpan - (OMEGA_POSITION.x + omegaHalfSpan);
  const sunClearance =
    Math.hypot(
      EARTH2_HUB_POSITION.x - SUN_CENTER.x,
      EARTH2_HUB_POSITION.z - SUN_CENTER.z
    ) -
    SUN_RADIUS -
    ownHalfSpan;
  return { gapToOmega, sunClearance };
}

// The door's own face: the shared portal swirl (lib/portal-swirl.js)
// repainted in earth tones — a deep-green heart sinking through ocean
// blue to a near-black rim, sea-green and gold-sand arms. Passed to
// paintPortalSwirl as its palette argument; the Concourse hall keeps
// the violet default untouched.
export const EARTH2_SWIRL_PALETTE = {
  base: [
    [0, '#0e5c46'],
    [0.35, '#0a3d5c'],
    [0.72, '#07263d'],
    [1, '#03121f'],
  ],
  arms: ['rgba(64,255,190,0.20)', 'rgba(40,160,255,0.22)', 'rgba(255,214,120,0.14)'],
  dust: 'rgba(220,255,240,0.5)',
  heart: [
    [0, 'rgba(240,255,230,0.85)'],
    [0.4, 'rgba(120,230,180,0.35)'],
    [1, 'rgba(40,140,120,0)'],
  ],
  rim: 'rgba(140,255,200,0.55)',
};
