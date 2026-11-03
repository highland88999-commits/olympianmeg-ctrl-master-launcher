'use client';

// Portal destination picker (Merlin, 2026-11-03): when a builder
// places a wall or object containing a portal, tapping the placed
// piece opens this picker. Destinations are grouped and described
// in plain language:
//   - Programs: the 195 registered programs (games, worlds, tools)
//   - Map places: named locations on Earth 2
//   - Building floors: levels of the builder's own building
//   - Friend's tiles: parcels owned by friends
//   - Monuments: Earth 2 landmarks
//
// The picker's choice is stored on the placement as
// placement.portalTo = { kind, id, label }.

import { useState } from 'react';

const DESTINATIONS = {
  programs: {
    title: 'Programs',
    hint: 'Jump straight into a game, world, or tool on Olympus.',
    items: [
      { id: 'sports-complex', label: 'Sports Complex', desc: 'All 9 sports under one roof — soccer, hockey, volleyball, and more.' },
      { id: 'hawkins', label: 'Hawkins', desc: 'The Stranger Things world — hunt Demogorgons, face Vecna.' },
      { id: 'crocodile-swamp', label: 'Crocodile Swamp', desc: 'The swamp run — fast water, faster jaws.' },
      { id: 'monopoly', label: 'Monopoly', desc: 'Full Hasbro rules — vs AI, pass-and-play, or online.' },
      { id: 'ares', label: 'ARES', desc: 'The threat monitor — Molly\'s watchtower.' },
      { id: 'dream-engine', label: 'Dream Engine', desc: 'Build and explore dream worlds.' },
    ],
  },
  map: {
    title: 'Places on the map',
    hint: 'Named locations across Earth 2.',
    items: [
      { id: 'map:spawn', label: 'Spawn Point', desc: 'Where new visitors arrive on Earth 2.' },
      { id: 'map:hub', label: 'Main Hub', desc: 'The central gathering point.' },
    ],
  },
  floors: {
    title: 'Floors in this building',
    hint: 'Move between levels of your own building.',
    items: [
      { id: 'floor:0', label: 'Ground Floor (L1)', desc: 'The building\'s ground level.' },
      { id: 'floor:1', label: 'Level 2 (L2)', desc: 'One level up — 3 metres above ground.' },
      { id: 'floor:2', label: 'Level 3 (L3)', desc: 'Two levels up — 6 metres above ground.' },
    ],
  },
  friends: {
    title: 'A friend\'s tile',
    hint: 'Visit a parcel owned by someone you know. (Friend list loads when you open this.)',
    items: [],
  },
  monuments: {
    title: 'Monuments',
    hint: 'Earth 2 landmarks — big, unmissable, worth the trip.',
    items: [
      { id: 'monument:castle', label: 'Castle Transylvania', desc: 'The gothic castle on the hill — hard to miss.' },
    ],
  },
};

export default function PortalDestinationPicker({ onPick, onClose }) {
  const [tab, setTab] = useState('programs');
  const group = DESTINATIONS[tab];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
      <div className="max-h-[80vh] w-full max-w-md overflow-hidden rounded-2xl border border-sky-800 bg-zinc-950">
        <div className="border-b border-zinc-800 p-4">
          <h3 className="text-sm font-black uppercase tracking-[0.2em] text-sky-300">
            Where does this portal go?
          </h3>
          <p className="mt-1 text-xs text-zinc-400">
            Pick a destination. Anyone who walks through this portal arrives there.
          </p>
        </div>
        <div className="flex gap-1 overflow-x-auto border-b border-zinc-800 p-2">
          {Object.entries(DESTINATIONS).map(([key, g]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold ${
                tab === key
                  ? 'bg-sky-600 text-white'
                  : 'bg-zinc-800 text-zinc-300'
              }`}
            >
              {g.title}
            </button>
          ))}
        </div>
        <div className="max-h-[40vh] overflow-y-auto p-2">
          <p className="px-2 pb-2 text-xs text-zinc-500">{group.hint}</p>
          {group.items.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-zinc-500">
              Nothing here yet — check back soon.
            </p>
          ) : (
            group.items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onPick({ kind: tab, id: item.id, label: item.label })}
                className="mb-1 block w-full rounded-xl border border-zinc-800 bg-zinc-900 p-3 text-left hover:border-sky-600"
              >
                <p className="text-sm font-bold text-zinc-100">{item.label}</p>
                <p className="mt-0.5 text-xs text-zinc-400">{item.desc}</p>
              </button>
            ))
          )}
        </div>
        <div className="border-t border-zinc-800 p-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl border border-zinc-700 py-2 text-xs font-bold text-zinc-300"
          >
            Decide later
          </button>
        </div>
      </div>
    </div>
  );
}

// True when a catalog piece can hold a portal destination.
export function isPortalPiece(pieceId) {
  return typeof pieceId === 'string' && pieceId.toLowerCase().includes('portal');
}
