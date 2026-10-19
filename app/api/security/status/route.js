// app/api/security/status/route.js
// AEGIS Security Grid — status dashboard.
//
// GET /api/security/status -> grid status (public: mode, threat level)
// Owner-only fields: blacklist, IP log summary.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getGridStatus } from '@/lib/security/grid-coordinator';
import { getBlacklist } from '@/lib/security/ip-tracer';
import { verifyOwnerSession } from '@/lib/owner';

export async function GET(req) {
  const status = getGridStatus();
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.replace(/^Bearer\s+/i, '');
  const { user } = await verifyOwnerSession(token).catch(() => ({ user: null }));
  const isOwner = !!user;

  const public_status = {
    mode: status.mode,
    threatLevel: status.threatLevel,
    activeAgents: status.activeAgents,
    baselineAgents: status.baselineAgents,
    attackersDetected: status.attackersDetected,
    lastScaleEvent: status.lastScaleEvent,
  };

  if (!isOwner) {
    return NextResponse.json({ aegis: public_status });
  }

  return NextResponse.json({
    aegis: {
      ...public_status,
      reserveAgents: status.reserveAgents,
      totalCapacity: status.totalCapacity,
      blacklistedIps: getBlacklist().length,
      startedAt: status.startedAt,
    },
  });
}
