// app/sound-studio/page.jsx — SOUND STUDIO (Merlin, Nov 12, 2026).
//
// A separate tool from the sound engine: this one makes downloadable
// sound files, on the fly. Pick a species, pick what it's doing,
// preview it, then download the file — named like gray-wolf-howl.wav.
//
// The sound is produced in the moment from the species' own sound
// profile (the same math the engine uses): rendered offline with
// OfflineAudioContext, encoded to WAV in the browser, and offered as
// a download. Where a profile ever carries a real recording, that
// recording is offered to download as well. A species that makes no
// sound gets no file — the page says so plainly and never invents one.

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { createRegistry } from '@/lib/sound/profiles';
import { SEED_PROFILES } from '@/lib/sound/seed-profiles';
import { createSoundEngine } from '@/lib/sound/engine';
import { buildFileName, renderProfileToWav, totalDuration } from '@/lib/sound/render';
import { hasOfflineAudio, renderOffline } from '@/lib/sound/offline';

const GENERIC_CONTEXTS = ['call', 'alarm', 'mating', 'idle', 'song'];

const PAGE_STYLE = {
  minHeight: '100vh',
  background: 'linear-gradient(160deg, #14100a 0%, #1c1305 50%, #0a0805 100%)',
  color: '#f5ead6',
  padding: '24px 16px 64px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const CARD_STYLE = {
  maxWidth: 720,
  margin: '0 auto',
};

const SECTION_STYLE = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(245,234,214,0.16)',
  borderRadius: 16,
  padding: 20,
  marginTop: 16,
};

const BUTTON_STYLE = {
  minHeight: 48,
  borderRadius: 12,
  border: 'none',
  padding: '12px 20px',
  fontSize: 17,
  fontWeight: 700,
  cursor: 'pointer',
};

const INPUT_STYLE = {
  width: '100%',
  minHeight: 48,
  borderRadius: 12,
  border: '1px solid rgba(245,234,214,0.3)',
  background: 'rgba(0,0,0,0.35)',
  color: '#f5ead6',
  padding: '10px 14px',
  fontSize: 17,
  boxSizing: 'border-box',
};

function sourceLine(profile) {
  if (!profile) return '';
  if (profile.silent) {
    return `${profile.species} makes no sound — there is no file to download, and none is invented.`;
  }
  if (profile.source === 'recording') {
    return `A real recording of a ${profile.species}.`;
  }
  const m = profile.math;
  const freq = m.frequencyEnd
    ? `${m.frequency} to ${m.frequencyEnd} Hz`
    : `${m.frequency} Hz`;
  return `Made from the ${profile.species}'s own numbers — ${profile.tone || 'its call'}, ${freq}, ${profile.duration} seconds, built fresh in your browser.`;
}

export default function SoundStudioPage() {
  const registry = useMemo(() => createRegistry(SEED_PROFILES), []);
  const speciesList = useMemo(
    () => registry.list().slice().sort((a, b) => a.species.localeCompare(b.species)),
    [registry],
  );
  const engineRef = useRef(null);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('canis-lupus');
  const [context, setContext] = useState('howl');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState(null);

  const selected = registry.resolve(selectedId) || speciesList[0] || null;
  const resolved = selected ? registry.resolve(selected.id, context) : null;

  const contextOptions = useMemo(() => {
    const opts = [];
    if (selected && selected.context) opts.push(selected.context);
    for (const c of GENERIC_CONTEXTS) {
      if (!opts.includes(c)) opts.push(c);
    }
    return opts;
  }, [selected]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return speciesList;
    return speciesList.filter(
      (p) =>
        p.species.toLowerCase().includes(q)
        || (p.scientific || '').toLowerCase().includes(q)
        || p.id.toLowerCase().includes(q),
    );
  }, [query, speciesList]);

  useEffect(() => {
    // Revoke the previous file link when a new one replaces it.
    return () => {
      if (file && file.url) {
        try { URL.revokeObjectURL(file.url); } catch { /* ignore */ }
      }
    };
  }, [file]);

  function pickSpecies(profile) {
    setSelectedId(profile.id);
    setContext(profile.context || 'call');
    setFile(null);
    setStatus('');
  }

  function preview() {
    if (!resolved || resolved.silent) {
      setStatus(`${selected ? selected.species : 'This species'} makes no sound — nothing to play.`);
      return;
    }
    if (!engineRef.current) engineRef.current = createSoundEngine();
    const engine = engineRef.current;
    engine.unlock();
    const result = engine.playSound(resolved.id, context);
    if (result.played) {
      setStatus(`Playing the ${resolved.species}'s ${resolved.context}.`);
    } else if (result.reason === 'muted') {
      setStatus('Sound is muted — turn it back on in a world first, then preview here.');
    } else {
      setStatus('Could not play that sound right now — try tapping Preview again.');
    }
  }

  async function download() {
    if (!resolved || resolved.silent) {
      setStatus(`${selected ? selected.species : 'This species'} makes no sound — there is no file to download.`);
      return;
    }
    setBusy(true);
    setStatus('Making your file…');
    try {
      let rendered = null;
      if (hasOfflineAudio()) {
        rendered = await renderOffline(resolved);
      }
      if (!rendered) {
        rendered = renderProfileToWav(resolved);
      }
      if (!rendered) {
        setStatus('That sound could not be made — nothing was downloaded.');
        return;
      }
      const fileName = buildFileName(resolved, resolved.context);
      const blob = new Blob([rendered.bytes], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      setFile({
        url,
        fileName,
        sizeKb: Math.max(1, Math.round(rendered.bytes.length / 1024)),
        duration: rendered.duration,
      });
      setStatus(`Ready — ${fileName}, ${rendered.duration.toFixed(1)} seconds. If the download did not start on its own, tap the download link below.`);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      setStatus('That sound could not be made — nothing was downloaded. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const fileSeconds = resolved ? totalDuration(resolved) : 0;

  return (
    <main style={PAGE_STYLE}>
      <div style={CARD_STYLE}>
        <Link href="/" style={{ color: '#d9a441', fontSize: 15 }}>
          ← Back to Olympus
        </Link>
        <h1 style={{ fontSize: 34, margin: '16px 0 4px' }}>Sound Studio</h1>
        <p style={{ fontSize: 17, lineHeight: 1.5, margin: '0 0 4px' }}>
          Pick an animal, hear its call, take the file home.
        </p>
        <p style={{ fontSize: 15, lineHeight: 1.5, margin: '0 0 4px', opacity: 0.85 }}>
          Every sound is made in the moment, from that species&apos; own numbers —
          or a real recording where one exists. Sounds are built fresh in your
          browser and downloaded as a WAV file. Nothing is faked, and a species
          that makes no sound gets no file.
        </p>

        <section style={SECTION_STYLE}>
          <label htmlFor="species-search" style={{ display: 'block', fontWeight: 700, marginBottom: 8 }}>
            1. Pick a species
          </label>
          <input
            id="species-search"
            style={INPUT_STYLE}
            type="search"
            placeholder="Search by name — wolf, owl, whale…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
            {matches.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => pickSpecies(p)}
                style={{
                  ...BUTTON_STYLE,
                  textAlign: 'left',
                  background: selected && p.id === selected.id ? '#d9a441' : 'rgba(255,255,255,0.08)',
                  color: selected && p.id === selected.id ? '#1c1305' : '#f5ead6',
                  fontWeight: selected && p.id === selected.id ? 800 : 400,
                }}
              >
                {p.species}
                {p.scientific ? ` — ${p.scientific}` : ''}
                {p.silent ? ' (silent)' : ''}
              </button>
            ))}
            {matches.length === 0 && (
              <p style={{ margin: 0, opacity: 0.8 }}>
                Nothing matches that search yet — only the first animals are on
                file so far. The full list arrives with the sounds spreadsheet.
              </p>
            )}
          </div>
        </section>

        {selected && (
          <section style={SECTION_STYLE}>
            <label htmlFor="context-pick" style={{ display: 'block', fontWeight: 700, marginBottom: 8 }}>
              2. What it&apos;s doing
            </label>
            <select
              id="context-pick"
              style={INPUT_STYLE}
              value={context}
              onChange={(e) => setContext(e.target.value)}
            >
              {contextOptions.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <p style={{ fontSize: 15, lineHeight: 1.5, margin: '12px 0 0' }}>
              {resolved ? sourceLine(resolved) : ''}
            </p>
            {resolved && context !== resolved.context && (
              <p style={{ fontSize: 15, lineHeight: 1.5, margin: '8px 0 0', opacity: 0.85 }}>
                No separate {context} call is on file for the {selected.species} —
                this is its usual {resolved.context}.
              </p>
            )}
            {resolved && !resolved.silent && (
              <p style={{ fontSize: 15, lineHeight: 1.5, margin: '8px 0 0', opacity: 0.85 }}>
                The file will be {fileSeconds.toFixed(1)} seconds long.
              </p>
            )}
          </section>
        )}

        <section style={SECTION_STYLE}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button
              type="button"
              onClick={preview}
              disabled={busy || !resolved || resolved.silent}
              style={{
                ...BUTTON_STYLE,
                background: '#d9a441',
                color: '#1c1305',
                opacity: busy || !resolved || resolved.silent ? 0.5 : 1,
              }}
            >
              ▶ Preview the sound
            </button>
            <button
              type="button"
              onClick={download}
              disabled={busy || !resolved || resolved.silent}
              style={{
                ...BUTTON_STYLE,
                background: '#3f7d4e',
                color: '#ffffff',
                opacity: busy || !resolved || resolved.silent ? 0.5 : 1,
              }}
            >
              {busy ? 'Making your file…' : '⬇ Download the sound file'}
            </button>
          </div>
          {status && (
            <p style={{ fontSize: 15, lineHeight: 1.5, margin: '16px 0 0' }} role="status">
              {status}
            </p>
          )}
          {file && (
            <p style={{ fontSize: 15, lineHeight: 1.5, margin: '12px 0 0' }}>
              <a href={file.url} download={file.fileName} style={{ color: '#d9a441', fontWeight: 700 }}>
                Download {file.fileName} again
              </a>
              {` — ${file.duration.toFixed(1)} seconds, ${file.sizeKb} KB, WAV.`}
            </p>
          )}
          {resolved && resolved.source === 'recording' && resolved.sample && (
            <p style={{ fontSize: 15, lineHeight: 1.5, margin: '12px 0 0' }}>
              <a href={resolved.sample} download={buildFileName(resolved, resolved.context)} style={{ color: '#d9a441', fontWeight: 700 }}>
                Download the real recording instead
              </a>
            </p>
          )}
        </section>

        <p style={{ fontSize: 13, lineHeight: 1.5, marginTop: 16, opacity: 0.7 }}>
          Seed data: the first 20 animals, with approximate published values —
          not measurements. The full sounds spreadsheet replaces and extends
          them when it lands. Files are WAV, 44.1 kHz, mono.
        </p>
      </div>
    </main>
  );
}
