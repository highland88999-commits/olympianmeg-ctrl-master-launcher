// lib/earth2/load-failures.js
// EARTH 2 — LOAD-FAILURE VISIBILITY (Merlin, 2026-11-13):
// a failed model used to vanish silently — the loader skipped
// its placements with no record anywhere, so a missing GLB read
// as an empty field and nobody could tell which object was gone.
// Every failed load is now recorded here: the scene reports it
// (console.warn + window.__earth2LoadFailures for the headless
// probe) and the boot pill can count it. Pure — no DOM, no THREE.

/**
 * A fresh registry: { failedUrls: Map<url, { error, at }> }.
 * One entry per failed URL (a retry that fails again refreshes
 * the entry, it never duplicates).
 */
export function createLoadFailureRegistry() {
  return { failedUrls: new Map() };
}

/** Record one failed load. Returns the registry (chainable). */
export function recordLoadFailure(registry, url, error) {
  if (!registry || !url) return registry;
  const err = error instanceof Error ? error.message : String(error || 'load failed');
  registry.failedUrls.set(String(url), { error: err, at: Date.now() });
  return registry;
}

/** Plain list of failures: [{ url, error, at }] in first-fail order. */
export function loadFailureList(registry) {
  if (!registry) return [];
  return [...registry.failedUrls.entries()].map(([url, v]) => ({ url, error: v.error, at: v.at }));
}

/** Count of distinct failed URLs. */
export function loadFailureCount(registry) {
  return registry ? registry.failedUrls.size : 0;
}
