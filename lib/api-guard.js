// lib/api-guard.js
// Shared safety net for every API route handler.
//
// Wrap each exported handler: `export const POST = apiGuard(async (req) => {...})`.
// A thrown error (missing env vars, unreachable database, crashed SDK,
// network failure) then always answers with clean JSON instead of an
// unhandled-exception page. Normal return values pass through untouched.
//
// Status codes: 503 when the failure smells like missing configuration,
// 500 otherwise. Messages stay plain and honest; internal details are
// logged server-side only, never sent to the client.
//
// The next/server import is lazy so this module also loads in plain Node
// (unit tests); in the Next runtime it answers with a real NextResponse.
async function jsonResponse(body, status) {
  try {
    const mod = await import('next/server');
    const NextResponse = mod.NextResponse || (mod.default && mod.default.NextResponse);
    if (NextResponse) return NextResponse.json(body, { status });
  } catch {
    // Plain Node (tests) — fall through to the minimal shape below.
  }
  return { status, body };
}

const NOT_CONFIGURED_RE = /not configured|missing .*key|missing .*secret|is required|not connected yet/i;

export function apiGuard(handler) {
  return async function guarded(request, ctx) {
    try {
      return await handler(request, ctx);
    } catch (err) {
      console.error('API route error:', err && err.message ? err.message : err);
      const msg = err && err.message ? String(err.message) : '';
      const notConfigured = NOT_CONFIGURED_RE.test(msg);
      return jsonResponse(
        {
          ok: false,
          error: notConfigured
            ? 'This service is not connected yet.'
            : 'Something went wrong. Please try again.',
        },
        notConfigured ? 503 : 500
      );
    }
  };
}
