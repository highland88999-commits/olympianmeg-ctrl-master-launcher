// lib/shadow-realm/plate-identity.js
//
// WAVE 6 of the characters-everywhere program (plan:
// tripo-figures/characters-everywhere-plan.md §2/§4) — the Shadow
// Realm half: a rider's callsign plate gains their profile
// character's preview icon beside the name, so a rider is
// recognizable as THEMSELVES, not just a colored name. The plate
// stays what it always was — one canvas texture per rider, drawn
// once, never per frame (app/shadow-realm/RemoteBikes.jsx); this
// module owns the identity half: where the character comes from,
// how the plate is laid out, and how it is drawn.
//
// WHERE THE CHARACTER COMES FROM (first hit wins):
//   1. The beacon itself — if a rider's client ever stamps its
//      pick on the beacon row, characterIdFromPresencePayload
//      (lib/characters/presence-embodiment.js, the Wave 2 presence
//      contract) reads it, roster-validated.
//   2. The rider's PUBLIC profile character — the same lookup
//      Wave 2 built for Skyscraper peers and the OASIS roster
//      panel: GET /api/profiles/<userId>/character, one public
//      roster id, validated again here against the roster. No
//      beacon schema change, no new SQL.
//   3. Nothing — the plate renders name-only, exactly as it did
//      before this wave. Absence is a normal state, never an
//      error and never a placeholder face.
//
// Lookups are cached per user for the session (a rider's pick
// changing mid-race re-resolves next session, like every other
// presence surface), and a failed lookup caches as null so a
// flaky network never turns into a fetch per beacon.

import { getEmbodiment } from '../characters/embodiment.js';
import { characterIdFromPresencePayload } from '../characters/presence-embodiment.js';

/** Plate canvas geometry. 4:1, matching the sprite's world scale
 *  ([7, 1.75] in RemoteBikes) — the plate's size on the track does
 *  not change; only its resolution and content do. */
export const PLATE_CANVAS = { width: 320, height: 80 };

/** The character icon's box on the canvas (circular-clipped when
 *  drawn, ringed in the rider's ghost color). */
export const PLATE_ICON = { x: 8, y: 8, size: 64 };

/**
 * Plate layout for a draw: with an icon, the name sits beside it,
 * left-aligned and a little shorter; without one, the name keeps
 * the plate's original centered treatment.
 */
export function plateLayout(hasIcon) {
  if (hasIcon) {
    return {
      canvas: PLATE_CANVAS,
      icon: { ...PLATE_ICON },
      textX: PLATE_ICON.x + PLATE_ICON.size + 16,
      textAlign: 'left',
      maxName: 13,
    };
  }
  return {
    canvas: PLATE_CANVAS,
    icon: null,
    textX: PLATE_CANVAS.width / 2,
    textAlign: 'center',
    maxName: 16,
  };
}

/** The name as the plate shows it (length follows the layout). */
export function plateNameFor(name, hasIcon) {
  const layout = plateLayout(hasIcon);
  return String(name || 'Rider').slice(0, layout.maxName);
}

/**
 * Resolve a rider's characterId: the beacon's own stamped pick
 * wins; the profile lookup is the fallback; both are roster
 * records by the time they arrive here (the payload extractor
 * validates, and the lookup validates before caching). Anything
 * else resolves to null — a name-only plate.
 */
export function characterIdForBeacon(beacon, lookedUpId) {
  const fromPayload = characterIdFromPresencePayload(beacon);
  if (fromPayload) return fromPayload;
  return lookedUpId && getEmbodiment(lookedUpId) ? lookedUpId : null;
}

/**
 * A profile-character lookup with a session cache.
 * @param opts.fetchFn  (userId) => Promise<characterId|null> —
 *   injectable for tests; the default reads the public profile
 *   route Wave 2 established. Raw results are roster-validated
 *   before they are cached or returned: the route is trusted to
 *   answer for the right user, never to invent a character.
 */
export function createProfileCharacterLookup(opts) {
  const o = opts || {};
  const fetchFn = typeof o.fetchFn === 'function' ? o.fetchFn : defaultFetchProfileCharacter;
  const cache = new Map(); // userId -> Promise<characterId|null>
  function lookup(userId) {
    if (typeof userId !== 'string' || !userId) return Promise.resolve(null);
    let p = cache.get(userId);
    if (!p) {
      p = Promise.resolve()
        .then(() => fetchFn(userId))
        .then((id) => (id && getEmbodiment(id) ? id : null))
        .catch(() => null);
      cache.set(userId, p);
    }
    return p;
  }
  return {
    lookup,
    /** Session-cache introspection (diagnostics/tests). */
    cachedCount() { return cache.size; },
  };
}

async function defaultFetchProfileCharacter(userId) {
  if (typeof fetch !== 'function') return null;
  const res = await fetch(`/api/profiles/${encodeURIComponent(userId)}/character`);
  if (!res || !res.ok) return null;
  const data = await res.json();
  return data && typeof data.characterId === 'string' ? data.characterId : null;
}

/** The shared session lookup (one cache for the whole scene). */
export const sharedProfileCharacterLookup = createProfileCharacterLookup();

/**
 * Draw a plate into a 2D context. `iconImage` is a loaded image
 * (or null — the name-only plate). The text treatment is the
 * plate's original: bold system font, rider-color glow. The icon
 * is circular-clipped with a rider-color ring, so every rider's
 * character reads as a token on the plate (the Wave 0 Character
 * Token 'plate' idea, in canvas form — the plate lives in a 3D
 * scene, where the DOM component cannot go).
 */
export function drawPlate(g, opts) {
  const o = opts || {};
  const hasIcon = !!o.iconImage;
  const layout = plateLayout(hasIcon);
  const { width, height } = layout.canvas;
  g.clearRect(0, 0, width, height);
  if (hasIcon && layout.icon) {
    const { x, y, size } = layout.icon;
    g.save();
    g.beginPath();
    g.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    g.clip();
    g.drawImage(o.iconImage, x, y, size, size);
    g.restore();
    g.save();
    g.beginPath();
    g.arc(x + size / 2, y + size / 2, size / 2 - 1, 0, Math.PI * 2);
    g.lineWidth = 3;
    g.strokeStyle = o.color || '#ffffff';
    g.stroke();
    g.restore();
  }
  g.font = '700 30px system-ui, -apple-system, sans-serif';
  g.textAlign = layout.textAlign;
  g.textBaseline = 'middle';
  g.shadowColor = o.color || '#ffffff';
  g.shadowBlur = 12;
  g.fillStyle = o.color || '#ffffff';
  g.fillText(plateNameFor(o.name, hasIcon), layout.textX, height / 2 + 2);
}
