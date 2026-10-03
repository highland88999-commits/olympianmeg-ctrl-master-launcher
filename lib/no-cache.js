// lib/no-cache.js
// Shared "never cache this" policy for the friends + notifications APIs.
//
// Root cause (2026-10-02): the friends API routes returned the default
// Next.js caching headers, so Safari served STALE cached empty GET
// responses from before a friendship was accepted ("No friends yet" and an
// ADD button for someone already a friend) while POSTs always hit fresh.
// Every JSON response from these routes — success AND error — now carries
// Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate.
//
// Usage: compose around apiGuard at the export line of each route:
//   import { apiGuard } from '@/lib/api-guard';
//   import { noCache } from '@/lib/no-cache';
//   export const GET = noCache(apiGuard(async function GET(req) { ... }));
//
// This module deliberately has no top-level next/server import (only the
// global Headers contract), so plain Node unit tests can load it.

export const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

/**
 * Merge the no-cache policy into an init.headers value for
 * NextResponse.json / fetch. Accepts Headers, [k,v][] pairs, or a plain
 * object; returns a Headers instance. Plain values win only for the
 * policy keys — callers can still add their own headers.
 */
export function noCacheHeaders(initHeaders) {
  const h = new Headers(initHeaders || {});
  for (const [k, v] of Object.entries(NO_CACHE_HEADERS)) h.set(k, v);
  return h;
}

/**
 * Route-handler decorator: whatever response the wrapped handler returns
 * (a fresh NextResponse, or the plain-Node fallback shape from apiGuard),
 * stamp the no-cache policy on it before it goes out.
 */
export function noCache(handler) {
  return async function noCacheWrapped(request, ctx) {
    const res = await handler(request, ctx);
    if (res && res.headers && typeof res.headers.set === 'function') {
      for (const [k, v] of Object.entries(NO_CACHE_HEADERS)) res.headers.set(k, v);
    }
    return res;
  };
}
