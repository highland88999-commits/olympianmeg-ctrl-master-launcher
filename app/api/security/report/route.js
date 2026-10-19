// app/api/security/report/route.js
// AEGIS Security Grid — incident reports.
//
// GET /api/security/report -> recent incident summaries (owner only)
// POST /api/security/report -> file a manual incident report (owner only)

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { verifyOwnerSession } from '@/lib/owner';
import { buildAttackReport, resolveAreaProgram } from '@/lib/security/reporter';
import { getIpLogRecords, getBlacklist } from '@/lib/security/ip-tracer';
import { getGridStatus } from '@/lib/security/grid-coordinator';

// In-memory incident store (persisted to DB when Supabase is healthy)
const incidents = [];

async function checkOwner(req) {
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.replace(/^Bearer\s+/i, '');
  const { user } = await verifyOwnerSession(token).catch(() => ({ user: null }));
  return !!user;
}

export async function GET(req) {
  const isOwner = await checkOwner(req);
  if (!isOwner) {
    return NextResponse.json({ error: 'Owner only' }, { status: 403 });
  }

  return NextResponse.json({
    incidents: incidents.slice(-50).reverse(),
    grid: getGridStatus(),
    blacklistedCount: getBlacklist().length,
  });
}

export async function POST(req) {
  const isOwner = await checkOwner(req);
  if (!isOwner) {
    return NextResponse.json({ error: 'Owner only' }, { status: 403 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const report = buildAttackReport({
    targetPath: body.targetPath || '/',
    attackerCount: body.attackerCount || 0,
    uniqueIps: body.uniqueIps || 0,
    severity: body.severity || 1,
    countermeasures: body.countermeasures || [],
    gridMode: getGridStatus().mode,
  });

  incidents.push(report);
  // Cap in-memory store
  if (incidents.length > 200) incidents.splice(0, incidents.length - 200);

  return NextResponse.json({
    filed: true,
    report: {
      id: report.id,
      areaProgram: report.areaProgram,
      severity: report.severity,
      summary: report.summary,
    },
  });
}
