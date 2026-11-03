'use client';

// Dino selection menu (Merlin, 2026-11-03): when a user clicks
// their egg, this menu appears letting them pick what kind of
// dinosaur they will raise. The egg is generic until they choose
// — the choice decides what hatches.

import { useState } from 'react';

// The species a user can raise from an egg. Names and plain
// descriptions — no stats jargon.
const RAISEABLE_DINOS = [
  { id: 'tyrannosaurus', label: 'Tyrannosaurus', desc: 'The king. Big, loud, and loyal once bonded.' },
  { id: 'velociraptor', label: 'Velociraptor', desc: 'Fast, clever, hunts in a pack with you.' },
  { id: 'triceratops', label: 'Triceratops', desc: 'A living tank. Gentle with friends, fearless with threats.' },
  { id: 'pteranodon', label: 'Pteranodon', desc: 'Takes to the sky. Sees everything before you do.' },
  { id: 'stegosaurus', label: 'Stegosaurus', desc: 'Plated and steady. Nothing pushes it around.' },
  { id: 'parasaurolophus', label: 'Parasaurolophus', desc: 'Musical and calm. Its call carries for miles.' },
  { id: 'ankylosaurus', label: 'Ankylosaurus', desc: 'Armored from nose to tail. A walking fortress.' },
  { id: 'dilophosaurus', label: 'Dilophosaurus', desc: 'Smaller, quick, and spits trouble at your enemies.' },
  { id: 'gallimimus', label: 'Gallimimus', desc: 'The fastest thing on two legs. Loves to run.' },
  { id: 'brachiosaurus', label: 'Brachiosaurus', desc: 'Gentle giant. Reaches the treetops.' },
];

export default function DinoSelectionMenu({ onPick, onClose }) {
  const [filter, setFilter] = useState('');

  const list = RAISEABLE_DINOS.filter((d) =>
    d.label.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
      <div className="max-h-[80vh] w-full max-w-md overflow-hidden rounded-2xl border border-emerald-800 bg-zinc-950">
        <div className="border-b border-zinc-800 p-4">
          <h3 className="text-sm font-black uppercase tracking-[0.2em] text-emerald-300">
            What will you raise?
          </h3>
          <p className="mt-1 text-xs text-zinc-400">
            Pick the dinosaur that hatches from your egg. This is your companion — choose well.
          </p>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search dinosaurs…"
            className="mt-3 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500"
          />
        </div>
        <div className="max-h-[45vh] overflow-y-auto p-2">
          {list.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-zinc-500">
              No dinosaurs match that search.
            </p>
          ) : (
            list.map((dino) => (
              <button
                key={dino.id}
                type="button"
                onClick={() => onPick(dino)}
                className="mb-1 block w-full rounded-xl border border-zinc-800 bg-zinc-900 p-3 text-left hover:border-emerald-600"
              >
                <p className="text-sm font-bold text-zinc-100">🦖 {dino.label}</p>
                <p className="mt-0.5 text-xs text-zinc-400">{dino.desc}</p>
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
            Not yet
          </button>
        </div>
      </div>
    </div>
  );
}

export { RAISEABLE_DINOS };
