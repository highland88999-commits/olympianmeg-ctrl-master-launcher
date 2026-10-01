// lib/luge/logic.js
// Pure business logic for the LUGE Complete Arsenal store + hoodie claims.
// No I/O, no framework dependencies — fully headless-testable.
// The API routes (checkout, webhook, claim) and the client page all derive
// from these helpers and from LUGE_PREMIUM_IDS so counts can never drift.
import { LUGE_PREMIUM_IDS, LUGE_PREMIUM_COUNT } from '../luge_data.js';
import { LUGE_COURSES, LUGE_SLEDS } from '../luge_data.js';

export { LUGE_PREMIUM_IDS, LUGE_PREMIUM_COUNT };
export { LUGE_COURSES };

// Server-set price for the Complete Arsenal pack. The client never sends a
// price — the checkout route charges exactly this. Confirmed by Merlin
// 2026-09-27: $129 USD. Hoodie lands at $72 CAD; the rest covers shipping +
// Stripe fees with healthy margin left over.
export const LUGE_ARSENAL_PRICE_USD = 129;
export const LUGE_ARSENAL_PRODUCT_NAME = 'Luge Complete Arsenal';

/** True when the owned sled-id collection contains every premium sled. */
export function ownsArsenal(ownedSledIds) {
  const set = new Set(ownedSledIds || []);
  return LUGE_PREMIUM_IDS.every((id) => set.has(id));
}

/** True when a sled should show as locked in the selector. */
export function isSledLocked(sled, ownedSledIds) {
  if (!sled || sled.type !== 'premium') return false;
  return !new Set(ownedSledIds || []).has(sled.id);
}

/** Rows the Stripe webhook grants on a completed Arsenal purchase. */
export function arsenalGrantRows(userId) {
  return LUGE_PREMIUM_IDS.map((sled_id) => ({ user_id: userId, sled_id }));
}

/**
 * Pure claim decision. Returns { ok: true } or
 * { ok: false, status, error } mirroring the claim API's responses.
 */
export function decideClaim({ ownedSledIds, alreadyRedeemed }) {
  const owned = new Set(ownedSledIds || []);
  if (!ownsArsenal(owned)) {
    return {
      ok: false,
      status: 403,
      error: `The hoodie is reserved for Complete Arsenal owners. You have ${owned.size} of ${LUGE_PREMIUM_COUNT} premium sleds.`,
    };
  }
  if (alreadyRedeemed) {
    return {
      ok: false,
      status: 409,
      error: 'This hoodie has already been claimed on your account. One per rider.',
    };
  }
  return { ok: true };
}

/**
 * Webhook event bookkeeping decision. `seenEventIds` is the set of already-
 * processed stripe_event_ids (backed by luge_stripe_events). Returns
 * { duplicate: true } when this delivery must be acknowledged without
 * granting anything again.
 */
export function decideWebhookEvent(seenEventIds, eventId) {
  if (!eventId) return { ok: false, error: 'Missing event id.' };
  if (new Set(seenEventIds || []).has(eventId)) return { ok: true, duplicate: true };
  return { ok: true, duplicate: false };
}

// ============================================================================
// Free-hoodie reward chain (Merlin 2026-09-29): complete ALL courses AND own
// the Complete Arsenal -> one FREE hoodie. Entirely separate from the
// Valkyrie referral program. Only runs finished after the reward launched
// count — no backfills, no fakes.
// ============================================================================

/**
 * The game's top speed for a course, mirroring app/luge/page.tsx:
 * baseMaxSpeed = 150 + turns * 8, hard-clamped at 1.5x that.
 *
 * Sled stats (sandResist / boostGain) deliberately do NOT appear here:
 * they only scale the ACCELERATION toward the clamp (lib/luge/track.js
 * zoneSpeedDelta), never the clamp itself. Every sled — base or premium —
 * is capped at the same top speed, so the floor below stays valid for
 * the whole garage.
 */
export function courseTopSpeed(course) {
  return (150 + course.turns * 8) * 1.5;
}

/** Highest boostGain any sled ships with (p26 Merlin's Apex). The anti-cheat
 *  floor below is proven against this gain in tests/luge/test-luge-sled-stats.mjs. */
export const MAX_BOOST_GAIN = 2.0;

/**
 * Clamped per-sled physics stats. Unknown/garbage sleds degrade to the
 * base-sled baseline (0 resist, 1.0 gain) — never to a super-sled.
 */
export function sledStats(sled) {
  const s = sled && typeof sled === 'object' ? sled : {};
  const sandResist = Math.min(0.9, Math.max(0, Number(s.sandResist) || 0));
  const boostGain = Math.max(1, Number(s.boostGain) || 1);
  return { sandResist, boostGain };
}

/**
 * Theoretical minimum legit run time (ms) for a course: instant top speed
 * for the whole descent. No real run can beat it — the sled always ramps
 * up from a standstill, and the client clamp (baseMaxSpeed * 1.5) caps
 * every sled no matter its boostGain, so boosts can only approach this
 * floor, never break it. Used as the anti-cheat floor.
 */
export function minRunMs(course) {
  if (!course || typeof course.length !== 'number' || typeof course.turns !== 'number') return null;
  return Math.ceil((0.999 * course.length / courseTopSpeed(course)) * 1000);
}

// Runs faster than this fraction of the theoretical minimum are rejected.
export const RUN_CHEAT_MARGIN = 0.85;
// Longer than this is garbage input, not a run.
export const MAX_RUN_MS = 3_600_000;
// Callsigns on the global leaderboard: 1..24 printable chars.
export const MAX_PLAYER_NAME = 24;

/**
 * Pure validation for a global-leaderboard submission
 * (POST /api/luge/leaderboard). The run must pass the same anti-cheat
 * floor as course completions, and the rider's name must be sane —
 * empty, blank, or billboard-length names are rejected, never stored.
 * Returns { ok: true } or { ok: false, status, error }.
 */
export function decideLeaderboardPost({ courseId, runMs, sledId, ownedSledIds, player }) {
  const name = String(player || '').trim();
  if (name.length < 1 || name.length > MAX_PLAYER_NAME) {
    return { ok: false, status: 400, error: 'Pick a rider name between 1 and 24 characters.' };
  }
  const check = validateRun({ courseId, runMs, sledId, ownedSledIds });
  if (!check.ok) return check;
  return { ok: true, course: check.course, player: name };
}

/**
 * Pure anti-cheat validation for a claimed course finish.
 * Returns { ok: true, course } or { ok: false, status, error }.
 * A client flag alone never passes: the course must exist, the sled must
 * be a real sled the rider owns (premium) or a free one, and the run time
 * must be physically possible inside the game's own physics.
 */
export function validateRun({ courseId, runMs, sledId, ownedSledIds }) {
  const course = LUGE_COURSES.find((c) => c.id === courseId);
  if (!course) return { ok: false, status: 400, error: 'Unknown course.' };

  const sled = LUGE_SLEDS.find((s) => s.id === sledId);
  if (!sled) return { ok: false, status: 400, error: 'Unknown sled.' };
  if (sled.type === 'premium' && !new Set(ownedSledIds || []).has(sled.id)) {
    return { ok: false, status: 403, error: 'That sled is not in your garage.' };
  }

  if (typeof runMs !== 'number' || !Number.isFinite(runMs) || runMs <= 0) {
    return { ok: false, status: 400, error: 'Invalid run time.' };
  }
  if (runMs > MAX_RUN_MS) {
    return { ok: false, status: 400, error: 'That run time looks wrong. Run the course again.' };
  }
  const floor = minRunMs(course) * RUN_CHEAT_MARGIN;
  if (runMs < floor) {
    return {
      ok: false,
      status: 422,
      error: 'That run was faster than physically possible. Run it again for real.',
    };
  }
  return { ok: true, course };
}

/**
 * Course-completion progress for a rider.
 * completedCourseIds: array of course ids from luge_course_completions.
 */
export function courseCompletionStatus(completedCourseIds) {
  const done = new Set(completedCourseIds || []);
  const all = LUGE_COURSES.map((c) => c.id);
  const missing = all.filter((id) => !done.has(id));
  return {
    completed: all.length - missing.length,
    total: all.length,
    missing,
    complete: missing.length === 0,
  };
}

/**
 * Full reward-eligibility decision. Returns { ok: true } or
 * { ok: false, status, error }, always carrying the progress breakdown
 * so the UI can say exactly what is missing. Nothing here trusts the
 * client — every input comes from server-side tables.
 */
export function decideRewardEligibility({ completedCourseIds, ownedSledIds, alreadyRedeemed }) {
  const courses = courseCompletionStatus(completedCourseIds);
  const arsenalComplete = ownsArsenal(ownedSledIds);

  if (alreadyRedeemed) {
    return {
      ok: false,
      status: 409,
      error: 'This hoodie has already been claimed on your account. One per rider.',
      courses,
      arsenalComplete,
      alreadyRedeemed: true,
    };
  }
  if (!courses.complete) {
    return {
      ok: false,
      status: 403,
      error: `Conquer every course first — ${courses.completed} of ${courses.total} so far. Only runs finished after the reward launched count.`,
      courses,
      arsenalComplete,
      alreadyRedeemed: false,
    };
  }
  if (!arsenalComplete) {
    const ownedCount = new Set(ownedSledIds || []).size;
    return {
      ok: false,
      status: 403,
      error: `The hoodie is reserved for Complete Arsenal owners. You have ${ownedCount} of ${LUGE_PREMIUM_COUNT} premium sleds.`,
      courses,
      arsenalComplete: false,
      alreadyRedeemed: false,
    };
  }
  return { ok: true, courses, arsenalComplete: true, alreadyRedeemed: false };
}
