// lib/communiverse.js
// The Communiverse (Merlin, 2026-10-22): the shared universe where users'
// forged worlds live side by side as planets. Pure helpers — no I/O, safe
// to unit-test in plain Node.
//
// Data model (no new tables, no migration):
// - A "world" is a world_engine_assets row with category 'world', rendered
//   from its generation_params (see lib/world-engine/world-builder.js).
// - Publishing state rides INSIDE generation_params under the `communiverse`
//   key: { published: true, at: <ISO> }. That is deliberate:
//     * it needs no schema change, so the feature works the moment it ships;
//     * the marker travels with the asset row, so an Auction House sale —
//       which transfers the row (user_id) to the buyer with its params
//       intact (lib/auction/settle.js) — automatically transfers the
//       planet's place in the Communiverse and every owner right with it,
//       and the world leaves the seller's profile the same instant, because
//       profiles are read by owner (GET /api/profiles/:id/creations).
// - Earth is the first planet: a built-in entry, not a user asset. Its
//   street level is the hub's real Earth dive (/?enter=earth).

/** generation_params key that carries the publish marker. */
export const COMMUNIVERSE_KEY = 'communiverse';

/** Where the Earth card sends you: the hub, told to dive straight to Earth. */
export const EARTH_ENTER_HREF = '/?enter=earth';

/**
 * The first planet of the Communiverse. `generation_params` are only a
 * visual stand-in for previews (blue marble); entering Earth goes to the
 * hub's real Earth, never to this procedural preview.
 */
export const EARTH_ENTRY = {
  id: 'earth',
  kind: 'earth',
  display_name: 'Earth',
  category: 'world',
  prompt: null,
  created_at: null,
  in_communiverse: true,
  communiverse_at: null,
  owner_id: null,
  is_earth: true,
  enter_href: EARTH_ENTER_HREF,
  generation_params: {
    terrainType: 'ocean',
    terrainRoughness: 0.35,
    sunColor: '#ffd166',
    atmosphereDensity: 0.6,
    ambientLightIntensity: 0.7,
    weatherType: 'clear',
  },
};

/** Read the publish marker out of a params object (never throws). */
export function communiverseMarker(params) {
  const m = params && typeof params === 'object' ? params[COMMUNIVERSE_KEY] : null;
  if (!m || typeof m !== 'object') return { published: false, at: null };
  return { published: m.published === true, at: typeof m.at === 'string' ? m.at : null };
}

/** True when a world's generation_params carry a live publish marker. */
export function isInCommuniverse(params) {
  return communiverseMarker(params).published;
}

/**
 * Return a NEW params object with the publish marker set or removed.
 * Every other parameter is preserved untouched — publishing must never
 * reshape the planet itself.
 */
export function withCommuniverse(params, published, nowIso) {
  const base = params && typeof params === 'object' ? { ...params } : {};
  if (published) {
    base[COMMUNIVERSE_KEY] = { published: true, at: nowIso || new Date().toISOString() };
  } else {
    delete base[COMMUNIVERSE_KEY];
  }
  return base;
}

/** The in-app URL that drops a visitor into a user world (orbit + street level). */
export function worldHref(assetOrId) {
  const id = typeof assetOrId === 'string' ? assetOrId : assetOrId && assetOrId.id;
  return '/communiverse/world/' + encodeURIComponent(String(id || ''));
}

/**
 * Public, safe view of a published world for the Communiverse feed.
 * generation_params are included because the planet renderer needs them;
 * the publish marker inside them is harmless public data.
 */
export function publicWorldFields(a = {}) {
  const marker = communiverseMarker(a.generation_params);
  return {
    id: a.id,
    kind: 'world',
    display_name: a.display_name || 'Untitled world',
    category: 'world',
    generation_params: a.generation_params || {},
    prompt: a.prompt || null,
    created_at: a.created_at || null,
    in_communiverse: marker.published,
    communiverse_at: marker.at,
    owner_id: a.user_id || null,
    is_earth: false,
    enter_href: worldHref(a),
  };
}
