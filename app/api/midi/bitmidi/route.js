import { NextResponse } from 'next/server';
import { searchBitmidi } from '../_bitmidi.js';

// GET /api/midi/bitmidi?q=<song name>
// Searches bitmidi.com's public catalog (on demand, one polite call per
// search) and returns normalized rows the Maestro UI can ingest.
export async function GET(req) {
  const q = new URL(req.url).searchParams.get('q') || '';
  if (!q.trim()) {
    return NextResponse.json({ ok: true, results: [] });
  }
  try {
    const results = await searchBitmidi(q, 12);
    return NextResponse.json({ ok: true, results });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e.message || 'BitMidi search failed' },
      { status: 502 }
    );
  }
}
