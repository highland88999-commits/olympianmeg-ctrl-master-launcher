// app/api/midi/library/route.js
// GET  /api/midi/library?q= — search the universal MIDI library.
//      DB rows (most-used first) merged over the bundled seeds. Always 200:
//      the Maestro UI must never break because the cloud is unreachable.
// POST /api/midi/library { id } — count a play (service-role bump).

import { listLibrary, jsonError, getAdminClient, cloudConfigured } from '../_server.js';

export async function GET(req) {
  try {
    const q = new URL(req.url).searchParams.get('q') || '';
    return Response.json(await listLibrary(q));
  } catch (e) {
    return jsonError('Library lookup failed.', 500);
  }
}

export async function POST(req) {
  try {
    if (!cloudConfigured()) return Response.json({ ok: true, cloud: false });
    const { id } = await req.json();
    if (!id) return jsonError('Missing id.', 400);
    const admin = getAdminClient();
    const { data, error } = await admin.from('midi_library').select('use_count').eq('id', id).single();
    if (error || !data) return jsonError('Not found.', 404);
    await admin.from('midi_library').update({ use_count: (data.use_count || 0) + 1 }).eq('id', id);
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError('Bump failed.', 500);
  }
}
