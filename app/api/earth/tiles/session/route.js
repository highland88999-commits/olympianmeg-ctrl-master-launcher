export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { MAPTILES_ENV_VAR, createMapTilesSession } from '@/lib/maptiles';
import { apiGuard } from '@/lib/api-guard';

// GET /api/earth/tiles/session
// Mints a short-lived Google Map Tiles 3D-tiles session token for the Earth
// module. The API key never leaves the server: the client only receives the
// session token, which Google accepts on tile requests in place of the key.
// Honest failures: 503 when the key is not configured, 502 when Google
// rejects the exchange. The client falls back to the ESRI satellite lens.
export const GET = apiGuard(async function GET() {
  const result = await createMapTilesSession(process.env[MAPTILES_ENV_VAR]);
  return NextResponse.json(result.json, { status: result.status });
});
