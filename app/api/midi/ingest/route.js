// app/api/midi/ingest/route.js
// POST /api/midi/ingest — the backend download/upload/load pipeline.
//
// Accepts either:
//   JSON       { url, title?, artist? }  — the backend downloads the file
//   multipart  file=<.mid>, title?, artist? — a device upload
//
// The backend validates the SMF magic, parses metadata, dedupes by sha256,
// uploads to the midi-library bucket and upserts the midi_library row.
// Responds with the library entry plus the file bytes (base64) so the client
// can load it into the player immediately with no second fetch.

import {
  downloadMidi,
  ensureLibraryEntry,
  isMidiBytes,
  midiMetadata,
  sha256Hex,
  titleFromUrl,
  cloudConfigured,
  jsonError,
  MAX_MIDI_BYTES,
} from '../_server.js';

function bytesToBase64(bytes) {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  }
  return btoa(s);
}

export async function POST(req) {
  try {
    const ctype = req.headers.get('content-type') || '';
    let bytes;
    let title = null;
    let artist = null;
    let sourceUrl = null;

    if (ctype.includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file');
      title = form.get('title');
      artist = form.get('artist');
      if (!file || typeof file.arrayBuffer !== 'function') {
        return jsonError('Attach a .mid file.', 400);
      }
      const buf = new Uint8Array(await file.arrayBuffer());
      if (buf.length > MAX_MIDI_BYTES) return jsonError('That file is too large (over 8 MB).', 400);
      if (!isMidiBytes(buf)) return jsonError('That is not a MIDI file.', 400);
      bytes = buf;
      if (!title) {
        const n = file.name || 'untitled';
        title = n.replace(/\.(mid|midi)$/i, '').replace(/[_+]+/g, ' ').trim() || 'untitled';
      }
    } else {
      const body = await req.json().catch(() => ({}));
      const url = body.url;
      title = body.title || null;
      artist = body.artist || null;
      if (!url || typeof url !== 'string') return jsonError('Give me a link to a .mid file.', 400);
      sourceUrl = url;
      bytes = await downloadMidi(url); // throws with a friendly message
      if (!title) title = titleFromUrl(url);
    }

    // Metadata check doubles as the parse check (throws when unplayable).
    const meta = midiMetadata(bytes);
    const localEntry = () => ({
      id: `local-${sha256Hex(bytes).slice(0, 12)}`,
      title,
      artist,
      url: sourceUrl,
      hash: sha256Hex(bytes),
      size: bytes.length,
      duration: meta.durationSec,
      tracks: meta.trackCount,
      notes: meta.noteCount,
      uses: 1,
      seed: false,
    });

    let entry;
    let cloud = false;
    if (cloudConfigured()) {
      try {
        const res = await ensureLibraryEntry({ bytes, title, artist, sourceUrl });
        entry = res.entry;
        cloud = true;
      } catch (e) {
        // Storage/DB hiccup: still let the user play what the backend fetched.
        entry = localEntry();
      }
    } else {
      entry = localEntry();
    }

    return Response.json({ ok: true, cloud, entry, dataBase64: bytesToBase64(bytes) });
  } catch (e) {
    return jsonError(e?.message || 'Could not ingest that MIDI.', 400);
  }
}
