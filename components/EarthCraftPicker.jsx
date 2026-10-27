'use client';
// components/EarthCraftPicker.jsx
//
// The Earth 1 craft picker — the character selection pattern,
// mirrored for vehicles (Merlin, 2026-10-26: "when a user clicks
// car, make it get them to let them select their craft, just
// like the character selection"). One compact control in the
// Earth console's own idiom (dark translucent panel, in flow,
// like the Character section above it): collapsed it shows the
// craft you currently drive; open, it offers the whole Earth
// vehicle roster (lib/earth/vehicles.js) as cards.
//
// Pick semantics mirror CharacterPicker: choosing a craft writes
// the device pick (localStorage CRAFT_PICK_KEY — the character
// pick chain's localStorage-first precedent; no profile craft
// field exists, so no new SQL), and hands the pick to onPick so
// the live scene spawns or swaps the craft without a reload.
// Picking always puts you in the craft: nothing out spawns it
// (auto-mounted, like the old summon); mounted swaps it in place
// (position, heading, speed kept — see swapCarCraft).
//
// Props:
//   onPick    (craftId) => void — fired after every change
//   accent    theme color for the section (Earth's cyan)
//   embedded  host-menu mode (Earth console): the picker lives
//             IN FLOW inside the console card, like CharacterPicker
//             embedded. Always true in practice on Earth.

import { useEffect, useRef, useState } from 'react';
import { listVehicles, getVehicle, resolveCraftId, boostTopSpeed, CRAFT_PICK_KEY } from '@/lib/earth/vehicles';
import { carState } from '@/lib/earth/parachute';

function readPick() {
  try {
    const raw = localStorage.getItem(CRAFT_PICK_KEY);
    return resolveCraftId(raw);
  } catch {
    return resolveCraftId(null);
  }
}

export default function EarthCraftPicker({ onPick, accent = '#00f2ff', embedded = true }) {
  const [open, setOpen] = useState(false);
  const [pickedId, setPickedId] = useState(() => {
    try { return resolveCraftId(carState.craftId); } catch { return resolveCraftId(null); }
  });
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  // The console reads the device pick on mount (same beat as the
  // character picker's mount refresh): a pick saved on this
  // device is honored, and the scene's carState follows it.
  useEffect(() => {
    const id = readPick();
    setPickedId(id);
    carState.craftId = id;
  }, []);

  function choose(id) {
    const next = resolveCraftId(id);
    try { localStorage.setItem(CRAFT_PICK_KEY, next); } catch { /* mirror is a cache */ }
    carState.craftId = next;
    setPickedId(next);
    setOpen(false);
    if (onPickRef.current) onPickRef.current(next);
  }

  const current = getVehicle(pickedId);
  const border = accent;

  return (
    <div style={{ position: 'relative', width: '100%', minWidth: 0 }}>
      <button
        type="button"
        aria-expanded={open}
        aria-label="Choose your craft"
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 12px', background: 'rgba(0,0,0,0.7)',
          border: `1px solid ${border}`, borderRadius: 8,
          color: '#fff', fontSize: 12, cursor: 'pointer',
          maxWidth: '100%', width: '100%', boxSizing: 'border-box',
        }}
      >
        <span aria-hidden="true" style={{ fontSize: 18, flexShrink: 0 }}>{current ? current.emoji : '🏎'}</span>
        <span style={{
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          flex: '1 1 auto', minWidth: 0, textAlign: 'left',
        }}>
          {current ? current.name : 'Choose your craft'}
        </span>
        <span aria-hidden="true" style={{ opacity: 0.7, flexShrink: 0 }}>{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Craft roster"
          style={{
            position: 'static', width: '100%', boxSizing: 'border-box',
            marginTop: 8, maxHeight: '44vh', overflowY: 'auto',
            background: 'rgba(8,9,13,0.94)', border: `1px solid ${border}`,
            borderRadius: 12, padding: 10,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {listVehicles().map((v) => {
              const selected = v.id === pickedId;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => choose(v.id)}
                  aria-pressed={selected}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                    textAlign: 'left', padding: '9px 10px',
                    background: selected ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${selected ? accent : 'rgba(255,255,255,0.12)'}`,
                    borderRadius: 8, color: '#fff', cursor: 'pointer',
                  }}
                >
                  <span aria-hidden="true" style={{ fontSize: 26, flexShrink: 0 }}>{v.emoji}</span>
                  <span style={{ minWidth: 0, flex: '1 1 auto' }}>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>{v.name}</span>
                    <span style={{ display: 'block', fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
                      {v.blurb} Top speed {Math.round(boostTopSpeed(v))} u/s boosted
                      {v.engine === 'jet' ? ' · blue jet exhaust' : ' · hover, no jet flame'}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
