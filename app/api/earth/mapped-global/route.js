// app/api/earth/mapped-global/route.js — Earth 1 GLOBAL team total
// (Merlin, 2026-10-26: "build the global team registry").
//
//   GET /api/earth/mapped-global ->
//     { ok: true, registryReady: true, globalPercent, coveredCells, totalCells }
//     or, before the migration has been run,
//     { ok: true, registryReady: false, globalPercent: null, coveredCells: 0, totalCells }
//
// No auth required: the response is an aggregate ONLY — covered
// cells + percentage for the whole team. No row, no user id, no
// per-user breakdown ever leaves this route (privacy rule: the
// UI shows the team total and nothing else). Rows are read with
// the service-role client, which is server-only.
//
// The missing-table case is the NORMAL state before Merlin runs
// supabase/migrations/20261026_earth_global_registry.sql in the
// dashboard, so it answers 200 with registryReady: false — never
// an error — and the tracker falls back to the personal number
// silently. Only a missing service client is a 503, matching the
// ui-state route's convention.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/economy/supabase';
import { apiGuard } from '@/lib/api-guard';
import { noCache } from '@/lib/no-cache';
import { TOTAL_CELLS, REGISTRY_TABLE, unionRegistryHexes } from '@/lib/earth/global-registry';

export const GET = noCache(
  apiGuard(async function GET() {
    const admin = await getServiceClient();
    if (!admin) {
      return NextResponse.json(
        { ok: true, registryReady: false, globalPercent: null, coveredCells: 0, totalCells: TOTAL_CELLS },
        { status: 503 }
      );
    }

    let rows;
    try {
      const res = await admin.from(REGISTRY_TABLE).select('mapped_hex');
      if (res.error) throw res.error;
      rows = res.data || [];
    } catch {
      // Table does not exist yet (migration not run) or unreadable:
      // "not ready", not an error — the tracker falls back silently.
      return NextResponse.json({
        ok: true,
        registryReady: false,
        globalPercent: null,
        coveredCells: 0,
        totalCells: TOTAL_CELLS,
      });
    }

    const { coveredCells, percent } = unionRegistryHexes(rows.map((r) => r && r.mapped_hex));
    return NextResponse.json({
      ok: true,
      registryReady: true,
      globalPercent: percent,
      coveredCells,
      totalCells: TOTAL_CELLS,
    });
  })
);
