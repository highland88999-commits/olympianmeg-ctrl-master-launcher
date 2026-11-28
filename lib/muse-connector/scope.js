// lib/muse-connector/scope.js — the brain's own-account scope rules.
//
// The brain (Supabase Brain — the Olympus backend) is the SINGLE place
// that knows the full rule set and executes it, server-side, never by
// client code and never trusted from the client (Merlin, Nov 27
// ~03:40). This module is the pure heart of that: the function
// vocabulary and the allow/refuse decision for every change attempt.
//
// A change has TWO halves, and BOTH must be inside the account:
//   - the THING (a program, object, build, planet, creation — anything
//     with an owner), and
//   - the FUNCTION (the action/operation being performed on it).
// If the thing doesn't belong to them, OR the function relates to
// something outside their account, they can't change it. Only what is
// specifically theirs — their own things and their own functions.
//
// How enforcement reads the registry (server-side, on every attempt):
//   1. The registry row for the account must exist and not be revoked.
//      It records the account's allowed thing KINDS and FUNCTIONS, plus
//      a snapshot of the things the account held at connect time.
//   2. The requested FUNCTION must be in the registry's function list.
//   3. The requested THING's kind must be in the registry's kind list.
//   4. The thing's LIVE owner (the asset/build row's owner id, read
//      server-side in the same request) must be the requesting account.
//      The snapshot in the registry is a record, never the gate — a
//      thing created after connect time is covered by the live owner
//      check, and a thing sold away stops being theirs the moment the
//      row changes hands (same as /api/communiverse/direct, whose
//      owner check follows the row).
//
// Reasons are stable machine codes with plain-English text, so routes,
// tests, and the reports (what was refused and why) all pin the same
// words. A refusal reason is a FACT (what was found, what rule
// matched), never an invented conclusion.

// Functions the connector may perform. Each names the thing kinds it
// may act on. Nothing outside this list exists for the connector — an
// unknown function is refused, not guessed at.
export const CONNECTOR_FUNCTIONS = {
  'registry.read': {
    thingKinds: [],
    description: 'Read the account\'s own connector registration.',
  },
  'world.direct': {
    thingKinds: ['world'],
    description: 'Re-forge one of the account\'s own worlds with new directions.',
  },
  'world.read': {
    thingKinds: ['world', 'weather', 'character', 'creature', 'vehicle', 'object', 'weapon', 'asset_link'],
    description: 'Read one of the account\'s own creations.',
  },
  'asset.read': {
    thingKinds: ['world', 'weather', 'character', 'creature', 'vehicle', 'object', 'weapon', 'asset_link'],
    description: 'List the account\'s own creations.',
  },
  'outpost.read': {
    thingKinds: ['mars2_outpost'],
    description: 'Read the account\'s own Mars 2 outpost site.',
  },
  'profile.read': {
    thingKinds: ['profile'],
    description: 'Read the account\'s own public profile.',
  },
  'build.read': {
    thingKinds: ['earth2_build'],
    description: 'Read the account\'s own Earth 2 builds.',
  },
};

// Thing kinds the registry can hold, keyed to the tables that own them.
export const CONNECTOR_THING_KINDS = [
  'world', 'weather', 'character', 'creature', 'vehicle', 'object', 'weapon', 'asset_link',
  'mars2_outpost', 'profile', 'earth2_build',
];

// The default scope written into a fresh registry row at connect time:
// every function above, every kind above. The registry may narrow it;
// it never widens past this list.
export function defaultScope() {
  return {
    kinds: [...CONNECTOR_THING_KINDS],
    functions: Object.keys(CONNECTOR_FUNCTIONS),
  };
}

export const SCOPE_REASONS = {
  'signed-out': 'Sign in to use the connector.',
  'not-registered': 'This account has not connected its Muse yet.',
  'registry-revoked': 'This account\'s connector was revoked.',
  'function-out-of-scope': 'That action is not in this account\'s connector scope.',
  'thing-out-of-scope': 'That kind of thing is not in this account\'s connector scope.',
  'not-owner': 'That thing belongs to another account.',
  'unknown-function': 'That action does not exist for the connector.',
  'unknown-thing-kind': 'That kind of thing does not exist for the connector.',
  ok: 'Allowed: the thing and the function are both the account\'s own.',
};

/**
 * The own-account decision for one change (or read) attempt.
 *   registry: the account's registry row (or null when unregistered).
 *     { user_id, functions: string[], kinds: string[], revoked_at }
 *   userId: the requesting account id (from the verified Supabase session).
 *   thing: { kind, id, ownerId } — ownerId is the LIVE owner, read
 *     server-side in the same request. Null when the attempt names no
 *     single thing (a list read).
 *   fn: the function being attempted, e.g. 'world.direct'.
 * Returns { ok, reason } — reason is a code from SCOPE_REASONS.
 * Pure: no I/O, so routes and tests exercise the identical rules.
 */
export function canChange({ registry, userId, thing, fn } = {}) {
  if (!userId) return { ok: false, reason: 'signed-out' };
  if (!registry) return { ok: false, reason: 'not-registered' };
  if (registry.revoked_at) return { ok: false, reason: 'registry-revoked' };
  if (!fn || !CONNECTOR_FUNCTIONS[fn]) return { ok: false, reason: 'unknown-function' };
  const functions = Array.isArray(registry.functions) ? registry.functions : [];
  if (!functions.includes(fn)) return { ok: false, reason: 'function-out-of-scope' };
  if (thing) {
    if (!thing.kind || !CONNECTOR_THING_KINDS.includes(thing.kind)) {
      return { ok: false, reason: 'unknown-thing-kind' };
    }
    const kinds = Array.isArray(registry.kinds) ? registry.kinds : [];
    if (!kinds.includes(thing.kind)) return { ok: false, reason: 'thing-out-of-scope' };
    if (!thing.ownerId || String(thing.ownerId) !== String(userId)) {
      return { ok: false, reason: 'not-owner' };
    }
    // The function must relate to this kind of thing: a 'world.direct'
    // on a 'profile' is a function reaching outside its own things,
    // even when the profile is the account's own.
    if (!CONNECTOR_FUNCTIONS[fn].thingKinds.includes(thing.kind)) {
      return { ok: false, reason: 'function-out-of-scope' };
    }
  }
  return { ok: true, reason: 'ok' };
}

/** Plain-English text for a scope reason code. */
export function scopeReasonText(reason) {
  return SCOPE_REASONS[reason] || SCOPE_REASONS['not-owner'];
}
