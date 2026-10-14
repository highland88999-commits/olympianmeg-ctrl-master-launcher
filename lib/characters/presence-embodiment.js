// lib/characters/presence-embodiment.js
//
// WAVE 2 of the characters-everywhere program (plan:
// tripo-figures/characters-everywhere-plan.md §2/§4) — the shared
// helpers for PRESENCE surfaces: scenes where several users stand
// in one place and each should be embodied as their own character
// (Persephone's hall, Skyscraper's hub room). Wave 0 built the
// single-user machinery (lib/characters/character-glb.js: attach,
// slot cap, billboard fallback, floor law); Wave 1 built the
// walker adapter. This module is the thin presence layer over
// them — it owns no rendering of its own:
//
//   characterIdFromPresencePayload(payload)
//     The pick chain crosses the wire in exactly one field: a
//     presence/broadcast payload may carry `char` (or the long
//     form `characterId`) naming the sender's roster character.
//     Extracted here, validated against the roster — a payload can
//     never smuggle an unknown id into an attach. Absent/garbage
//     -> null -> the peer keeps its native figure (fallback law).
//
//   createPresenceEmbodiments({ keyPrefix, maxLiveGlb, ... })
//     A per-scene manager over createEmbodimentScene: one stable
//     host group per instance key ('self', a peer's session id),
//     sync(key, characterId, procSize) attaches / swaps / clears
//     that instance's embodiment inside its host. Slot keys are
//     composed `${keyPrefix}:${key}` — PER-INSTANCE, as the Wave 0
//     presence contract requires (two users who both picked
//     Slimer are two instances, never one shared slot). Beyond
//     the scene cap the Wave 0 adapter hands back a preview
//     billboard handle instead of a live GLB — present and named,
//     at a fraction of the GPU cost.
//
// FALLBACK LAW (Wave 0 contract, unchanged): a null handle and a
// not-yet-ready handle both mean "keep the native figure"; hide
// the native figure only while handle.isReady() is true. A failed
// load leaves ready=false forever — the native body simply stays.

import * as THREE from 'three';
import { getEmbodiment } from './embodiment.js';
import { createEmbodimentScene } from './character-glb.js';

/**
 * Extract a roster-validated characterId from a presence payload.
 * Accepts the compact `char` field (what Skyscraper's hub_room
 * broadcast sends) and the long `characterId` form. Anything else
 * — missing, non-string, not on the roster — resolves to null.
 */
export function characterIdFromPresencePayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const raw = typeof payload.char === 'string'
    ? payload.char
    : (typeof payload.characterId === 'string' ? payload.characterId : null);
  return raw && getEmbodiment(raw) ? raw : null;
}

/**
 * Per-scene presence embodiment manager.
 * @param opts.keyPrefix    slot-key namespace ('skyscraper', ...)
 * @param opts.maxLiveGlb   live-GLB cap for the scene (default 4,
 *   the Wave 0 presence default)
 * @param opts.registry     injectable slot registry (tests)
 * @param opts.embodimentScene  injectable Wave 0 scene (tests)
 *
 * Surface duties: add hostFor(key) to the scene graph, position
 * it each frame, and toggle the instance's native figure by
 * handleFor(key)?.isReady(). The manager owns attach/swap/
 * dispose inside the hosts.
 */
export function createPresenceEmbodiments(opts) {
  const o = opts || {};
  const embScene = o.embodimentScene
    || createEmbodimentScene({ maxLiveGlb: o.maxLiveGlb, registry: o.registry });
  const prefix = typeof o.keyPrefix === 'string' && o.keyPrefix
    ? o.keyPrefix
    : 'presence';
  const entries = new Map(); // key -> { characterId, handle, host }

  function entryFor(key) {
    let e = entries.get(key);
    if (!e) {
      const host = new THREE.Group();
      host.name = `presence-embodiment-${String(key)}`;
      e = { characterId: undefined, handle: null, host };
      entries.set(key, e);
    }
    return e;
  }

  /** The stable host group for an instance (created on demand). */
  function hostFor(key) {
    return entryFor(key).host;
  }

  /** The instance's current embodiment handle, or null. */
  function handleFor(key) {
    const e = entries.get(key);
    return e ? e.handle : null;
  }

  /** The characterId an instance is currently synced to (or null). */
  function characterIdFor(key) {
    const e = entries.get(key);
    return e && e.characterId !== undefined ? e.characterId : null;
  }

  /**
   * Make an instance's embodiment match a pick: a roster id
   * attaches (or swaps), null/unknown clears back to the native
   * figure. Re-syncing the same id is a no-op. Returns the live
   * handle (or null — keep the native figure).
   */
  function sync(key, characterId, procSize) {
    const e = entryFor(key);
    const next = characterId && getEmbodiment(characterId) ? characterId : null;
    if (e.characterId === next) return e.handle;
    if (e.handle) {
      if (e.handle.group && e.handle.group.parent === e.host) {
        e.host.remove(e.handle.group);
      }
      e.handle.dispose();
      e.handle = null;
    }
    e.characterId = next;
    if (next) {
      const handle = embScene.attach({
        characterId: next,
        procSize,
        slotKey: `${prefix}:${String(key)}`,
      });
      if (handle) {
        e.host.add(handle.group);
        e.handle = handle;
      }
    }
    return e.handle;
  }

  /**
   * Drop an instance entirely (peer left / went stale): disposes
   * its handle and returns its host so the surface can remove the
   * host from the scene graph.
   */
  function remove(key) {
    const e = entries.get(key);
    if (!e) return null;
    sync(key, null);
    entries.delete(key);
    return e.host;
  }

  /** Dispose every instance (scene unmount). Hosts are emptied;
   *  surfaces discard them with the scene. */
  function disposeAll() {
    for (const key of [...entries.keys()]) sync(key, null);
    entries.clear();
  }

  return {
    hostFor,
    handleFor,
    characterIdFor,
    sync,
    remove,
    disposeAll,
    /** Instance keys currently known (diagnostics/tests). */
    keys() { return [...entries.keys()]; },
    /** The scene's slot registry (cap introspection/tests). */
    registry: embScene.registry || null,
  };
}
