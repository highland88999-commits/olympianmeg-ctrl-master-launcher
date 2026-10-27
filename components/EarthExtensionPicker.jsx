'use client';
// components/EarthExtensionPicker.jsx
//
// The Earth 1 EXTENSION character picker — the second half of
// the full character roster (Merlin, 2026-10-26: "add ALL
// characters to Earth 1 as well"). The platform CharacterPicker
// above it offers the visible 43; this picker offers the 29
// extension characters (Middle-earth heroes, Hawkins 8,
// batch-4 intact 16 — lib/earth/earth-characters.js) through the
// SAME embedded pattern: collapsed button + grid + pick +
// persist + live swap, in the console's own idiom.
//
// Mutual exclusion: picking here sets the extension pick
// (device key olympus.earthCharacterExt); picking a platform
// character clears it (EarthConsole's Character onPick). One
// body at a time, never two — EarthWalker prefers the extension
// pick when one is set and falls back to the platform body
// otherwise. The "Use platform character" row clears the pick
// without touching the platform choice.

import { useEffect, useState } from 'react';
import { listExtensionCharacters, getExtensionCharacter } from '@/lib/earth/earth-characters';
import { readExtensionCharacterPick, writeExtensionCharacterPick } from '@/lib/earth/earth-extension-character';

export default function EarthExtensionPicker({ onPick, accent = '#00f2ff' }) {
  const [open, setOpen] = useState(false);
  const [pickedId, setPickedId] = useState(() => readExtensionCharacterPick());
  useEffect(() => { setPickedId(readExtensionCharacterPick()); }, []);

  function choose(id) {
    writeExtensionCharacterPick(id);
    setPickedId(id || '');
    setOpen(false);
    if (onPick) onPick(id || '');
  }

  const current = getExtensionCharacter(pickedId);
  const groups = {};
  for (const c of listExtensionCharacters()) {
    (groups[c.source] = groups[c.source] || []).push(c);
  }

  return (
    <div style={{ position: 'relative', width: '100%', minWidth: 0 }}>
      <button
        type="button"
        aria-expanded={open}
        aria-label="Choose an extra character"
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 12px', background: 'rgba(0,0,0,0.7)',
          border: `1px solid ${accent}`, borderRadius: 8,
          color: '#fff', fontSize: 12, cursor: 'pointer',
          maxWidth: '100%', width: '100%', boxSizing: 'border-box',
        }}
      >
        <span aria-hidden="true" style={{ fontSize: 18, flexShrink: 0 }}>{current ? current.emoji : '🎭'}</span>
        <span style={{
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          flex: '1 1 auto', minWidth: 0, textAlign: 'left',
        }}>
          {current ? current.name : 'Extra characters (29)'}
        </span>
        <span aria-hidden="true" style={{ opacity: 0.7, flexShrink: 0 }}>{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Extra character roster"
          style={{
            position: 'static', width: '100%', boxSizing: 'border-box',
            marginTop: 8, maxHeight: '44vh', overflowY: 'auto',
            background: 'rgba(8,9,13,0.94)', border: `1px solid ${accent}`,
            borderRadius: 12, padding: 10,
          }}
        >
          <button
            type="button"
            onClick={() => choose('')}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%',
              textAlign: 'left', padding: '9px 10px', marginBottom: 8,
              background: !pickedId ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${!pickedId ? accent : 'rgba(255,255,255,0.12)'}`,
              borderRadius: 8, color: '#fff', cursor: 'pointer',
            }}
          >
            <span aria-hidden="true" style={{ fontSize: 26, flexShrink: 0 }}>🎭</span>
            <span style={{ minWidth: 0, flex: '1 1 auto' }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>Use platform character</span>
              <span style={{ display: 'block', fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
                Back to the character picked above.
              </span>
            </span>
          </button>
          {Object.entries(groups).map(([source, chars]) => (
            <div key={source} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', margin: '0 0 6px 2px' }}>
                {source}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {chars.map((c) => {
                  const selected = c.id === pickedId;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => choose(c.id)}
                      aria-pressed={selected}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                        textAlign: 'left', padding: '9px 10px',
                        background: selected ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${selected ? accent : 'rgba(255,255,255,0.12)'}`,
                        borderRadius: 8, color: '#fff', cursor: 'pointer',
                      }}
                    >
                      <span aria-hidden="true" style={{ fontSize: 26, flexShrink: 0 }}>{c.emoji}</span>
                      <span style={{ minWidth: 0, flex: '1 1 auto' }}>
                        <span style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>{c.name}</span>
                        <span style={{ display: 'block', fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{c.blurb}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
