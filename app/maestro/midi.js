// midi.js — a small, dependency-free Standard MIDI File (SMF) parser.
// Parses type 0/1 files: header, track chunks, tempo map, note on/off with
// running status, and converts ticks to seconds. No DOM, no network.
// Input: Uint8Array. Output: { division, trackCount, tracks: [{ name, notes }] }
// where each note is { midi, name, start, duration, velocity }.

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function noteName(midi) {
  const n = ((midi % 12) + 12) % 12;
  return NOTE_NAMES[n] + (Math.floor(midi / 12) - 1);
}

function readU16(bytes, off) {
  return (bytes[off] << 8) | bytes[off + 1];
}

function readU32(bytes, off) {
  return (bytes[off] * 0x1000000) + ((bytes[off + 1] << 16) | (bytes[off + 2] << 8) | bytes[off + 3]);
}

function readVarLen(bytes, off) {
  let value = 0;
  let i = off;
  for (let k = 0; k < 4; k += 1) {
    if (i >= bytes.length) throw new Error('Truncated variable-length value');
    const b = bytes[i];
    i += 1;
    value = (value << 7) | (b & 0x7f);
    if (!(b & 0x80)) return { value, next: i };
  }
  throw new Error('Variable-length value too long');
}

function readAscii(bytes, off, len) {
  let s = '';
  for (let i = 0; i < len; i += 1) s += String.fromCharCode(bytes[off + i]);
  return s;
}

export function parseMidi(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new Error('parseMidi expects a Uint8Array');
  if (bytes.length < 14) throw new Error('File too short for a MIDI header');
  if (readAscii(bytes, 0, 4) !== 'MThd') throw new Error('Missing MThd magic');

  const headerLen = readU32(bytes, 4);
  const format = readU16(bytes, 8);
  const trackCount = readU16(bytes, 10);
  const division = readU16(bytes, 12);
  if (division & 0x8000) throw new Error('SMPTE time division is not supported');
  if (trackCount === 0 || trackCount > 64) throw new Error('Unreasonable track count');

  let off = 8 + headerLen;
  const tracks = [];
  const tempoEvents = []; // { tick, mpqn }

  for (let t = 0; t < trackCount; t += 1) {
    if (off + 8 > bytes.length) throw new Error('Truncated track header');
    if (readAscii(bytes, off, 4) !== 'MTrk') throw new Error('Missing MTrk magic');
    const chunkLen = readU32(bytes, off + 4);
    const end = off + 8 + chunkLen;
    if (end > bytes.length) throw new Error('Truncated track data');
    off += 8;

    let tick = 0;
    let status = 0;
    let trackName = '';
    const open = new Map(); // (channel*128+midi) -> { startTick, velocity }
    const notes = [];

    while (off < end) {
      const d = readVarLen(bytes, off);
      tick += d.value;
      off = d.next;
      if (off >= end) break;

      let byte = bytes[off];
      if (byte & 0x80) {
        status = byte;
        off += 1;
      } else if (status === 0) {
        throw new Error('Running status with no previous status byte');
      }
      byte = status;

      if (byte === 0xff) {
        const metaType = bytes[off];
        off += 1;
        const l = readVarLen(bytes, off);
        off = l.next;
        const dataStart = off;
        if (metaType === 0x51 && l.value === 3) {
          const mpqn = (bytes[off] << 16) | (bytes[off + 1] << 8) | bytes[off + 2];
          if (mpqn > 0) tempoEvents.push({ tick, mpqn });
        } else if ((metaType === 0x03 || metaType === 0x04) && !trackName) {
          trackName = readAscii(bytes, off, l.value).trim();
        }
        off = dataStart + l.value;
      } else if (byte === 0xf0 || byte === 0xf7) {
        const l = readVarLen(bytes, off);
        off = l.next + l.value;
      } else {
        const kind = byte & 0xf0;
        const channel = byte & 0x0f;
        if (kind === 0x90 || kind === 0x80) {
          if (off + 2 > end) throw new Error('Truncated note event');
          const key = bytes[off];
          const vel = bytes[off + 1];
          off += 2;
          const id = channel * 128 + key;
          const isOn = kind === 0x90 && vel > 0;
          if (isOn) {
            if (!open.has(id)) open.set(id, { startTick: tick, velocity: vel });
          } else if (open.has(id)) {
            const o = open.get(id);
            open.delete(id);
            if (tick > o.startTick && key >= 0 && key <= 127) {
              notes.push({ midi: key, startTick: tick, endTick: tick, velocity: o.velocity });
              notes[notes.length - 1].endTick = tick;
              notes[notes.length - 1].startTick = o.startTick;
            }
          }
        } else if (kind === 0xc0 || kind === 0xd0) {
          off += 1;
        } else {
          off += 2;
        }
      }
    }

    // Close any notes left hanging at end of track.
    for (const [id, o] of open) {
      notes.push({
        midi: id % 128,
        startTick: o.startTick,
        endTick: tick,
        velocity: o.velocity,
      });
    }

    tracks.push({ name: trackName || `Track ${t + 1}`, notes });
    off = end;
  }

  // Build the tempo map and convert ticks to seconds.
  tempoEvents.sort((a, b) => a.tick - b.tick);
  const segments = [{ tick: 0, mpqn: 500000 }];
  for (const te of tempoEvents) {
    if (te.tick > segments[segments.length - 1].tick) {
      segments.push({ tick: te.tick, mpqn: te.mpqn });
    } else {
      segments[segments.length - 1] = { tick: te.tick, mpqn: te.mpqn };
    }
  }
  const secPerTickAt = (tick) => {
    let acc = 0;
    let prevTick = 0;
    let mpqn = segments[0].mpqn;
    for (let i = 1; i < segments.length; i += 1) {
      const seg = segments[i];
      if (tick < seg.tick) break;
      acc += ((seg.tick - prevTick) * mpqn) / 1000000 / division;
      prevTick = seg.tick;
      mpqn = seg.mpqn;
    }
    acc += ((tick - prevTick) * mpqn) / 1000000 / division;
    return acc;
  };

  let totalNotes = 0;
  for (const tr of tracks) {
    tr.notes = tr.notes
      .filter((n) => n.endTick > n.startTick)
      .map((n) => ({
        midi: n.midi,
        name: noteName(n.midi),
        start: secPerTickAt(n.startTick),
        duration: Math.max(0.03, secPerTickAt(n.endTick) - secPerTickAt(n.startTick)),
        velocity: n.velocity / 127,
      }))
      .sort((a, b) => a.start - b.start);
    totalNotes += tr.notes.length;
  }

  const duration = tracks.reduce(
    (m, tr) => tr.notes.reduce((mm, n) => Math.max(mm, n.start + n.duration), m),
    0
  );

  return { format, division, trackCount, tracks, totalNotes, duration };
}

// Build a minimal in-memory MIDI file for tests: one track, one note.
export function buildTestMidi({ division = 480, tempoMpqn = 500000, note = 60, startTick = 0, endTick = 480 } = {}) {
  const out = [];
  const push = (...bs) => out.push(...bs);
  const varlen = (v) => {
    const bytes = [v & 0x7f];
    let x = v >> 7;
    while (x > 0) {
      bytes.unshift((x & 0x7f) | 0x80);
      x >>= 7;
    }
    return bytes;
  };
  push(0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, (division >> 8) & 0xff, division & 0xff);
  const track = [];
  const tpush = (...bs) => track.push(...bs);
  tpush(...varlen(0), 0xff, 0x51, 0x03,
    (tempoMpqn >> 16) & 0xff, (tempoMpqn >> 8) & 0xff, tempoMpqn & 0xff);
  tpush(...varlen(startTick), 0x90, note, 100);
  tpush(...varlen(endTick - startTick), 0x80, note, 0);
  tpush(...varlen(0), 0xff, 0x2f, 0x00);
  push(0x4d, 0x54, 0x72, 0x6b);
  const len = track.length;
  push((len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff);
  push(...track);
  return new Uint8Array(out);
}
