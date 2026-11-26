// ARES Phase 1 — kill-switch state for the edge middleware.
//
// Node-importable for plain `node` tests (relative imports, global
// Response instead of a top-level next/server import — next/server does
// not resolve under plain Node; same pattern as the agents route). In
// the Next runtime a returned Response is served as-is.
//
// Internal only (x-ares-internal). The middleware asks this route
// whether the kill switch is on; the route answers with ONE boolean and
// nothing else. It never returns a threshold, a rate limit, a window,
// a seed, or an epoch — no response may ever reveal a limit value, and
// this route is where that rule is enforced.
//
// The dashboard toggles the switch through /api/ares/settings (key
// phase1_kill_switch); env ARES_PHASE1_KILL_SWITCH=1 forces it on.
// Fail-open: if the settings read fails, the switch reads ON (static
// v0) — the safe, predictable defense — rather than running a rotation
// the keeper may have just ordered off.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { checkInternal, getSettings } from '../../../../lib/ares/server.js';
import { apiGuard } from '../../../../lib/api-guard.js';

export const POST = apiGuard(async function POST(request) {
  if (!checkInternal(request)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }
  let killSwitch = true; // read failure -> switch ON (static v0), never half-on
  try {
    const settings = await getSettings();
    killSwitch = settings.killSwitch === true;
  } catch {
    killSwitch = true;
  }
  return Response.json({ killSwitch });
});
