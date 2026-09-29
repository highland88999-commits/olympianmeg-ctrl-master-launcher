// components/persephone/BroadcastRoom.jsx
// The artist broadcast room for PERSEPHONE.
//
// HONESTY CONTRACT — read before touching this file:
// - Full WebRTC broadcast infrastructure (ingest, SFU, viewer delivery)
//   is NOT built in this pass. There is no streaming pipeline behind this UI.
// - So: NOTHING here is labeled "LIVE". Slots are QUEUED. The room is a
//   running-order + rehearsal checklist, and it says so on screen.
// - When streaming gets wired up, the states to add are:
//     'queued' -> 'soundcheck' (real local preview) -> 'live' (real ingest).
//   Do not add a 'live' state until a real ingest endpoint confirms it.
// - FX NOTE: the set-start stage wash lives in lib/fx.js as fx.stageWash().
//   Call it ONLY from the 'live' branch once real ingest confirms — never
//   from 'soundcheck' or any state that isn't a confirmed stream. No FX
//   on fake-live. Ever.

'use client';

import { useEffect, useState } from 'react';
import ContentPicker from '@/components/user-content/ContentPicker';
import { getItem, getPool, getPoolAudio, persistPool } from '@/lib/user-content/pool';
import { seedStationInto } from '@/lib/user-content/station-seed';

const STORAGE_KEY = 'persephone:running-order';
const AMBIENCE_KEY = 'persephone:preshow-ambience';

const DEFAULT_ORDER = [
  { id: 'slot-1', artist: 'House opener', note: 'Doors set — 60 min', state: 'queued' },
  { id: 'slot-2', artist: 'Headliner', note: 'Peak set — 90 min', state: 'queued' },
  { id: 'slot-3', artist: 'After-hours', note: 'Wind down — 60 min', state: 'queued' },
];

function loadOrder() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* private mode */ }
  return DEFAULT_ORDER;
}

export default function BroadcastRoom() {
  const [order, setOrder] = useState(DEFAULT_ORDER);
  const [artist, setArtist] = useState('');
  const [notice, setNotice] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [ambienceId, setAmbienceId] = useState(null);

  useEffect(() => { setOrder(loadOrder()); }, []);

  // Pre-show ambience: seed the radio station into the shared pool (idempotent)
  // and restore the user's explicit pick. Explicit selection = explicit share.
  useEffect(() => {
    try {
      const pool = getPool();
      seedStationInto(pool);
      persistPool();
      const saved = localStorage.getItem(AMBIENCE_KEY);
      if (saved) setAmbienceId(saved);
    } catch { /* private mode */ }
  }, []);

  const ambienceItem = ambienceId ? getItem(getPool(), ambienceId) : null;
  const poolAudioCount = getPoolAudio().length;

  // Station seeds carry spotify: URIs; link out to the real Spotify web player.
  function spotifyWebUrl(uri) {
    if (typeof uri !== 'string') return null;
    const m = uri.match(/^spotify:(track|playlist|album|artist):([A-Za-z0-9]+)$/);
    return m ? `https://open.spotify.com/${m[1]}/${m[2]}` : null;
  }
  const ambienceWebUrl = ambienceItem ? spotifyWebUrl(ambienceItem.remoteUrl) : null;

  function chooseAmbience(item) {
    if (!item || !item.id) return;
    setAmbienceId(item.id);
    try { localStorage.setItem(AMBIENCE_KEY, item.id); } catch { /* private mode */ }
    setPickerOpen(false);
  }

  function clearAmbience() {
    setAmbienceId(null);
    try { localStorage.removeItem(AMBIENCE_KEY); } catch { /* private mode */ }
  }

  function save(next) {
    setOrder(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* private mode */ }
  }

  function addSlot() {
    const name = artist.trim();
    if (!name) { setNotice('Type the artist or act name first.'); return; }
    setNotice('');
    save([...order, { id: `slot-${Date.now()}`, artist: name, note: 'Queued by the room', state: 'queued' }]);
    setArtist('');
  }

  function removeSlot(id) {
    save(order.filter((s) => s.id !== id));
  }

  return (
    <section aria-label="Broadcast room" className="w-full">
      <h2 className="text-2xl font-light tracking-[0.2em] text-[#d4af37]">BROADCAST ROOM</h2>

      {/* the honesty banner — never remove while streaming is unwired */}
      <div className="mt-3 rounded-xl border border-[#5a4a1a] bg-[#141007] px-4 py-3" role="note">
        <p className="text-sm text-[#e8d9b0] leading-relaxed">
          <span className="font-bold text-[#d4af37]">Not streaming yet.</span>{' '}
          This room holds the running order and the rehearsal checklist. There is no broadcast
          pipeline behind it — nothing here goes out to an audience, and nothing is marked live.
          Streaming is a future build (WebRTC ingest + viewer delivery).
        </p>
      </div>

      <h3 className="mt-6 text-sm tracking-[0.3em] uppercase text-[#8a7f66]">Running order</h3>
      <ul className="mt-3 space-y-3">
        {order.map((s, i) => (
          <li key={s.id} className="flex items-center gap-4 rounded-xl border border-[#2a2418] bg-[#0e0b07] px-4 py-3">
            <span className="text-xs text-[#6a6050] w-8">{String(i + 1).padStart(2, '0')}</span>
            <div className="flex-1 min-w-0">
              <p className="text-[#e8d9b0] truncate">{s.artist}</p>
              <p className="text-xs text-[#6a6050]">{s.note}</p>
            </div>
            <span className="rounded-full border border-[#5a4a1a] px-3 py-1 text-[11px] tracking-[0.2em] uppercase text-[#a89a78]">
              Queued
            </span>
            <button
              type="button"
              onClick={() => removeSlot(s.id)}
              className="text-xs text-[#6a6050] hover:text-[#d8a8a8] uppercase tracking-widest"
              aria-label={`Remove ${s.artist} from the running order`}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex gap-2">
        <input
          value={artist}
          onChange={(e) => setArtist(e.target.value)}
          placeholder="Artist or act name"
          aria-label="Artist or act name"
          className="flex-1 rounded-xl border border-[#3a2f1a] bg-[#0e0b07] px-4 py-3 text-sm text-[#e8d9b0] placeholder-[#5a5348]"
        />
        <button
          type="button"
          onClick={addSlot}
          className="rounded-xl border border-[#d4af37]/60 px-5 py-3 text-sm tracking-widest uppercase text-[#d4af37] hover:bg-[#d4af37]/10 transition"
        >
          Queue set
        </button>
      </div>
      {notice && <p className="mt-2 text-sm text-[#d8a8a8]" role="alert">{notice}</p>}

      {/* Pre-show ambience — explicit user pick from their shared uploads.
          Explicit selection = explicit share. Nothing is auto-shared, and
          with no broadcast pipeline yet this plays nowhere — it is saved
          for when streaming lands. */}
      <h3 className="mt-8 text-sm tracking-[0.3em] uppercase text-[#8a7f66]">Pre-show ambience</h3>
      <p className="mt-2 text-sm text-[#a89a78] leading-relaxed">
        Pick music from your uploads to play before the show. Your pick is saved
        on this device only — there is no broadcast pipeline yet, so it plays
        nowhere today.
        {poolAudioCount > 0 && (
          <span className="text-[#6a6050]"> ({poolAudioCount} audio upload{poolAudioCount === 1 ? '' : 's'} available)</span>
        )}
      </p>
      <div className="mt-3 rounded-xl border border-[#2a2418] bg-[#0e0b07] px-4 py-3">
        {ambienceItem ? (
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[#e8d9b0] truncate">{ambienceItem.title || 'Untitled'}</p>
              <p className="text-xs text-[#6a6050]">
                {ambienceItem.originProgram === 'radio' ? 'Your radio station' : `From ${ambienceItem.originProgram}`}
                {ambienceItem.remoteUrl && ambienceItem.remoteUrl.startsWith('spotify:') ? ' · opens in Spotify' : ''}
              </p>
            </div>
            {ambienceWebUrl && (
              <a
                href={ambienceWebUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[44px] inline-flex items-center rounded-xl border border-[#3a2f1a] px-4 text-xs uppercase tracking-widest text-[#d4af37] hover:bg-[#d4af37]/10"
              >
                Open
              </a>
            )}
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="min-h-[44px] rounded-xl border border-[#3a2f1a] px-4 text-xs uppercase tracking-widest text-[#a89a78] hover:bg-white/5"
            >
              Change
            </button>
            <button
              type="button"
              onClick={clearAmbience}
              aria-label="Clear pre-show ambience"
              className="min-h-[44px] text-xs text-[#6a6050] hover:text-[#d8a8a8] uppercase tracking-widest"
            >
              Clear
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="w-full min-h-[48px] rounded-xl border border-[#d4af37]/60 px-5 text-sm tracking-widest uppercase text-[#d4af37] hover:bg-[#d4af37]/10"
          >
            Choose from your uploads
          </button>
        )}
      </div>

      {pickerOpen && (
        <ContentPicker
          accept={['audio']}
          onSelect={chooseAmbience}
          onClose={() => setPickerOpen(false)}
        />
      )}

      <h3 className="mt-8 text-sm tracking-[0.3em] uppercase text-[#8a7f66]">Before the stream exists — the rehearsal checklist</h3>
      <ul className="mt-3 space-y-2 text-sm text-[#a89a78] leading-relaxed list-disc pl-5">
        <li>Decks and mixer patched into the booth — both platters spin clean.</li>
        <li>Stage wash aimed at the decks, not the crowd&apos;s eyes.</li>
        <li>Speaker stacks tested at show volume — no rattling columns.</li>
        <li>Running order confirmed with every act on it.</li>
        <li>When streaming lands: soundcheck becomes a real local preview, and &quot;live&quot; only lights up once the ingest server answers.</li>
      </ul>
    </section>
  );
}
