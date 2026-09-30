// app/api/midi/_server.js
// Shared server-only helpers for the Maestro universal MIDI library.
// Not a route (underscore prefix). Uses the service-role key — never import
// into client code.
//
// Pipeline: download (from URL) or accept (upload) -> validate SMF magic ->
// parse metadata -> sha256 -> dedupe by hash -> upload to the midi-library
// bucket -> upsert the midi_library row -> return the entry.

import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { parseMidi } from '../../maestro/midi.js';
import { MIDI_SEEDS } from '../../../lib/midi/seeds.js';

export const MAX_MIDI_BYTES = 8 * 1024 * 1024; // 8 MB — plenty for any .mid
export const BUCKET = 'midi-library';

let admin = null;

export function getAdminClient() {
  if (!admin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('Supabase is not configured (missing URL or service-role key).');
    }
    admin = createClient(url, key);
  }
  return admin;
}

export function cloudConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** True when the bytes look like a Standard MIDI File (MThd header). */
export function isMidiBytes(u8) {
  return (
    u8 &&
    u8.length >= 14 &&
    u8[0] === 0x4d && // M
    u8[1] === 0x54 && // T
    u8[2] === 0x68 && // h
    u8[3] === 0x64 // d
  );
}

export function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Parse + summarize a validated MIDI buffer. Throws on parse failure. */
export function midiMetadata(bytes) {
  const parsed = parseMidi(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  if (!parsed || parsed.totalNotes === 0) {
    throw new Error('That file parsed, but it has no notes to play.');
  }
  return {
    durationSec: Math.round(parsed.duration * 100) / 100,
    trackCount: parsed.tracks.length,
    noteCount: parsed.totalNotes,
    trackNames: parsed.tracks.map((t) => t.name || null),
  };
}

/** "https://x/y/axel-f-1.mid?dl=1" -> "axel f 1" */
export function titleFromUrl(url) {
  try {
    const path = new URL(url).pathname.split('/').filter(Boolean).pop() || 'untitled';
    return decodeURIComponent(path)
      .replace(/\.(mid|midi)$/i, '')
      .replace(/[_+]+/g, ' ')
      .trim() || 'untitled';
  } catch {
    return 'untitled';
  }
}

export function publicFileUrl(path) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return `${base}/storage/v1/object/public/${BUCKET}/${path}`;
}

function rowToEntry(row) {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    url: publicFileUrl(row.storage_path),
    hash: row.file_hash,
    size: row.file_size,
    duration: Number(row.duration_sec),
    tracks: row.track_count,
    notes: row.note_count,
    uses: row.use_count,
    seed: false,
  };
}

/**
 * Store a validated MIDI buffer in the universal library (dedupe by hash).
 * Returns the library entry. Throws when the cloud backend is not configured.
 */
export async function ensureLibraryEntry({ bytes, title, artist = null, sourceUrl = null }) {
  const adminClient = getAdminClient();
  const hash = sha256Hex(bytes);
  const meta = midiMetadata(bytes);

  // Dedupe: the same file can only ever appear once.
  const { data: existing, error: findErr } = await adminClient
    .from('midi_library')
    .select('*')
    .eq('file_hash', hash)
    .maybeSingle();
  if (findErr) throw findErr;
  if (existing) {
    await adminClient
      .from('midi_library')
      .update({ use_count: (existing.use_count || 0) + 1 })
      .eq('id', existing.id);
    return { entry: rowToEntry({ ...existing, use_count: (existing.use_count || 0) + 1 }), fresh: false };
  }

  const storagePath = `${hash}.mid`;
  const { error: upErr } = await adminClient.storage
    .from(BUCKET)
    .upload(storagePath, bytes, { contentType: 'audio/midi', upsert: false });
  if (upErr) throw upErr;

  const cleanTitle = (title && String(title).trim()) || 'untitled';
  const { data: row, error: insErr } = await adminClient
    .from('midi_library')
    .insert({
      title: cleanTitle,
      artist: artist ? String(artist).trim() || null : null,
      source_url: sourceUrl,
      storage_path: storagePath,
      file_hash: hash,
      file_size: bytes.length,
      duration_sec: meta.durationSec,
      track_count: meta.trackCount,
      note_count: meta.noteCount,
    })
    .select('*')
    .single();
  if (insErr) throw insErr;
  return { entry: rowToEntry(row), fresh: true };
}

/**
 * Download a MIDI file server-side (the backend does the download).
 * Enforces the size cap while streaming; validates the SMF magic.
 */
export async function downloadMidi(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('That is not a valid URL.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http(s) links can be fetched.');
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  let res;
  try {
    res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Nexus-Maestro/1.0 (+midi-library)' },
    });
  } catch (e) {
    throw new Error(e?.name === 'AbortError' ? 'The download timed out.' : 'Could not download that link.');
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`The download failed (HTTP ${res.status}).`);

  const hinted = Number(res.headers.get('content-length'));
  if (Number.isFinite(hinted) && hinted > MAX_MIDI_BYTES) {
    throw new Error('That file is too large (over 8 MB).');
  }
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_MIDI_BYTES) throw new Error('That file is too large (over 8 MB).');
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    bytes.set(c, off);
    off += c.length;
  }
  if (!isMidiBytes(bytes)) throw new Error('That link did not return a MIDI file.');
  return bytes;
}

/**
 * The universal library: DB rows first (most-used), then the bundled seeds
 * that are not already in the DB (matched by hash). `q` filters on
 * title/artist. Always resolves — never breaks the Maestro UI.
 */
export async function listLibrary(q) {
  const needle = (q || '').trim().toLowerCase();
  const matches = (e) =>
    !needle ||
    (e.title || '').toLowerCase().includes(needle) ||
    (e.artist || '').toLowerCase().includes(needle);

  let rows = [];
  let cloud = false;
  if (cloudConfigured()) {
    try {
      const adminClient = getAdminClient();
      let query = adminClient
        .from('midi_library')
        .select('id,title,artist,storage_path,file_hash,file_size,duration_sec,track_count,note_count,use_count')
        .order('use_count', { ascending: false })
        .limit(200);
      if (needle) query = query.or(`title.ilike.%${needle}%,artist.ilike.%${needle}%`);
      const { data, error } = await query;
      if (error) throw error;
      rows = (data || []).map(rowToEntry);
      cloud = true;
    } catch {
      rows = [];
      cloud = false;
    }
  }
  const seen = new Set(rows.map((r) => r.hash));
  const seeds = MIDI_SEEDS.filter((s) => !seen.has(s.hash)).filter(matches);
  return { ok: true, cloud, entries: [...rows.filter(matches), ...seeds] };
}

export function jsonError(message, status = 400) {
  return Response.json({ ok: false, error: message }, { status });
}
