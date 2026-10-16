// lib/ghost-riders.js — the ghost-rider embodiment contract for
// components/presence/GhostRiders.jsx (bike-scene presence peers).
//
// THE EXECUTIVE CALL (Merlin, 2026-10-15): ghost bikes are not
// deleted — they are UPGRADED. A peer whose presence row carries a
// character pick (lib/presence.js: mapRowToPeer -> peer.characterId,
// the column wired 2026-10-15) renders as that character, seated on
// the ghost bike in the Wave 6 'seated' pose. A peer with no pick —
// or a pick that fails roster validation — renders EXACTLY the
// translucent ghost bike that has always been there. The ghost
// silhouette is the fallback, never a hole (Wave 0 fallback law).
//
// PERFORMANCE LAW: ghosts exist because twenty detailed models in
// one scene would melt a phone. Embodiment is therefore capped at
// the NEAREST 6 picked peers (MAX_EMBODIED_GHOST_RIDERS); everyone
// beyond the cap keeps the ghost silhouette. The component also
// hands its attach layer a slot registry capped at the same number
// (lib/characters/glb-slots.js), so the cap holds even if the
// selection and the mounts momentarily disagree — beyond it the
// attach layer would hand back a billboard, and the component
// treats that as "stay ghost" rather than standing a preview card
// in the rider's seat.
//
// DISPOSAL LAW: an embodied peer's model is disposed the same tick
// the peer leaves, changes pick, or falls out of the nearest-6 —
// the component unmounts its attach, whose cleanup removes the
// model group and frees the slot synchronously. No translucent
// leftovers, no leaked slots.
//
// This module is the pure half (contract constants + the nearest-6
// selection), headless-testable like lib/luge/rider-embodiment.js.
// The rendering half lives in the component.

import { peerKey } from './presence.js';
import { characterIdFromPresencePayload } from './characters/presence-embodiment.js';

/** Concurrent embodied riders cap — the performance law above. */
export const MAX_EMBODIED_GHOST_RIDERS = 6;

/** The pose the rider holds (pose-driver Wave 6 seated family). */
export const GHOST_RIDER_POSE = 'seated';

/** The rider's footprint for the Wave 0 adapter: the character
 *  takes this stature at the seat (humanoids scale by height). */
export const GHOST_RIDER_PROC_SIZE = { x: 0.85, y: 2.0, z: 0.85 };

/** The mount: where the embodiment's floor plane sits inside the
 *  ghost group. The ghost bike's frame top is y ~= 0.78 and its
 *  rider hump sits at z = -0.3; the seat plane rests just under the
 *  frame top at the hump, so the seated figure settles INTO the
 *  bike instead of hovering over it. The figure faces +Z, the
 *  bike's nose — no yaw (contrast lib/luge, whose sled runs -Z). */
export const GHOST_RIDER_MOUNT = { position: [0, 0.62, -0.3] };

/** Slot-key namespace: per-instance, as the Wave 0 presence
 *  contract requires (two peers who picked the same character are
 *  two instances, never one shared slot). */
export const GHOST_RIDER_SLOT_PREFIX = 'ghostriders:peer';

/**
 * The roster-validated character pick a peer carries, or null.
 * Accepts the presence peer shape ({ characterId }) and the
 * compact broadcast shape ({ char }) — validation against the
 * roster happens in characterIdFromPresencePayload, so a payload
 * can never smuggle an unknown id into an attach.
 */
export function ghostRiderCharacterId(peer) {
  return characterIdFromPresencePayload(peer);
}

/** Per-instance slot key for a peer's rider embodiment. */
export function ghostRiderSlotKey(peer) {
  return `${GHOST_RIDER_SLOT_PREFIX}:${peerKey(peer)}`;
}

function finiteOrZero(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Choose which peers embody: the peerKeys of the nearest `max`
 * peers (to `origin`, usually the camera) that carry a valid
 * character pick. Peers without a valid pick are never selected —
 * they stay ghosts at any distance. Distance ties break by
 * peerKey so the selection is deterministic and doesn't churn
 * between polls. Returns keys nearest-first.
 */
export function selectEmbodiedPeerKeys(peers, origin, max = MAX_EMBODIED_GHOST_RIDERS) {
  const list = Array.isArray(peers) ? peers : [];
  const cap = Number.isInteger(max) && max >= 0 ? max : MAX_EMBODIED_GHOST_RIDERS;
  if (cap === 0) return [];
  const o = origin && typeof origin === 'object' ? origin : {};
  const ox = finiteOrZero(o.x);
  const oy = finiteOrZero(o.y);
  const oz = finiteOrZero(o.z);
  const candidates = [];
  for (const p of list) {
    if (!p || typeof p !== 'object' || !p.id) continue;
    if (!ghostRiderCharacterId(p)) continue;
    const pos = p.pos && typeof p.pos === 'object' ? p.pos : {};
    const dx = finiteOrZero(pos.x) - ox;
    const dy = finiteOrZero(pos.y) - oy;
    const dz = finiteOrZero(pos.z) - oz;
    candidates.push({ key: peerKey(p), d2: dx * dx + dy * dy + dz * dz });
  }
  candidates.sort((a, b) => (a.d2 - b.d2) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return candidates.slice(0, cap).map((c) => c.key);
}

/** Order-insensitive comparison of two peerKey lists. */
export function sameKeySet(a, b) {
  const la = Array.isArray(a) ? a : [];
  const lb = Array.isArray(b) ? b : [];
  if (la.length !== lb.length) return false;
  const set = new Set(la);
  for (const k of lb) if (!set.has(k)) return false;
  return true;
}
