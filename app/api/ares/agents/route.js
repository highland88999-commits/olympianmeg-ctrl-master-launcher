// ARES dashboard API: the hive mind — agents alive, Hub fusion, and the
// last self-terminate report (owner-locked: Merlin only).
//
// GET /api/ares/agents -> {
//   agents: [{ id, name, role, alive, scorer, scoresProcessed }],
//   hub: { weights: { sentinel, phalanx, dreadnought }, score, label,
//          reasons, action, strongestAgent },
//   lastSelfTerminate: { agent, reason, signals, host, at } | null,
//   everScored: boolean,
//   status: 'active' | 'armed-idle',
//   source: 'hive-host' | 'agents-direct',
// }
//
// The status itself comes from the hive host (lib/ares/hive-status.js
// reads lib/ares/hive.js first). The last self-terminate report is the
// durable record: the report sink writes it to ares_events, so the
// console still shows it after a restart, when the host's in-memory
// copy is gone. That lookup is best-effort — if the database is
// unreachable the hive status still answers and the report is null.
//
// COLD INSTANCE: a fresh deploy that has never scored answers honestly
// (everScored false, status 'armed-idle', hub score null, label 'Idle')
// — armed agents with no live events yet, not zeros dressed as activity.
//
// Node-importable for plain `node` tests (relative imports, global
// Response instead of a top-level next/server import — next/server does
// not resolve under plain Node). In the Next runtime a returned
// Response is served as-is.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { requireUser, isOwnerEmail, serviceClient } from '../../../../lib/ares/server.js';
import { loadHiveSnapshot } from '../../../../lib/ares/hive-status.js';
import { SELF_TERMINATE_EVENT } from '../../../../lib/ares/self-terminate.js';
import { apiGuard } from '../../../../lib/api-guard.js';

export const GET = apiGuard(async function GET(request) {
  const user = await requireUser(request);
  if (!user) return Response.json({ error: 'sign in required' }, { status: 401 });
  if (!isOwnerEmail(user)) return Response.json({ error: 'restricted to the throne' }, { status: 403 });

  const status = await loadHiveSnapshot();
  const logged = await lastSelfTerminateFromLog();
  if (logged) status.lastSelfTerminate = logged;
  return Response.json(status);
});

// Best-effort read of the latest self-terminate report from the durable
// evidence log. Any failure (no DB configured, query error) means "no
// report on record" — never a 500 for the whole hive status.
// (Defined below the handler on purpose: the owner-lock audit reads the
// file top-down and requires the lock to precede the first DB query.)
async function lastSelfTerminateFromLog() {
  try {
    const { data, error } = await serviceClient()
      .from('ares_events')
      .select('details, created_at')
      .eq('event_type', SELF_TERMINATE_EVENT)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    const d = data.details || {};
    return {
      agent: d.agent_name || d.agent || 'Unknown agent',
      reason: d.reason || 'cage-detected',
      signals: Array.isArray(d.signals) ? d.signals.map(String) : [],
      host: d.host || 'unknown',
      at: data.created_at || null,
    };
  } catch {
    return null;
  }
}
