'use client';

// DefaultAvatarPicker — choose a polished default avatar or keep your photo.
// Props: value (current avatar src), onPick(src).
// Phone-first: 44px+ touch targets, 4-column grid.
//
// WAVE 2 (characters-everywhere): "use my character" — when this
// device has a profile character, its roster preview joins the
// options as an avatar (the pick chain's profile default, read
// through the device mirror via lib/characters/embodiment — a
// pure data read, no 3D code in this bundle). Picking it hands
// the preview src to onPick like any default avatar; the profile
// pages save it through their normal avatar flow. No profile
// character on this device -> the picker is exactly as before.
import { useEffect, useState } from 'react';
import Image from 'next/image';
import { DEFAULT_AVATARS } from '@/lib/avatars/defaults';
import { profileCharacterAvatar } from '@/lib/characters/embodiment';

export default function DefaultAvatarPicker({ value, onPick }) {
  const [character, setCharacter] = useState(null);
  // The mirror is device-local storage — read after mount so the
  // server render and first paint agree (no hydration mismatch).
  useEffect(() => { setCharacter(profileCharacterAvatar()); }, []);

  const characterSelected = !!character && value === character.preview;

  return (
    <div>
      {character && (
        <div className="mb-4">
          <div className="text-[10px] tracking-[0.3em] uppercase text-zinc-500 mb-2">
            Your character
          </div>
          <button
            type="button"
            onClick={() => onPick && onPick(character.preview)}
            aria-pressed={characterSelected}
            aria-label={`Use your character ${character.name} as your avatar`}
            className={`flex w-full items-center gap-3 min-h-[56px] rounded-xl border-2 px-3 py-2 text-left transition-all ${
              characterSelected
                ? 'border-cyan-400 ring-2 ring-cyan-400/40 bg-cyan-400/10'
                : 'border-zinc-700 hover:border-zinc-400 bg-white/[0.03]'
            }`}
          >
            <span className="relative block h-11 w-11 flex-none overflow-hidden rounded-full">
              <Image src={character.preview} alt={character.name} fill sizes="44px" className="object-cover" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-neutral-100">{character.name}</span>
              <span className="block text-[11px] uppercase tracking-widest text-zinc-500">Your profile character</span>
            </span>
          </button>
        </div>
      )}
      <div className="text-[10px] tracking-[0.3em] uppercase text-zinc-500 mb-2">
        Default avatars
      </div>
      <div className="grid grid-cols-4 gap-2">
        {DEFAULT_AVATARS.map((a) => {
          const selected = value === a.src;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => onPick && onPick(a.src)}
              aria-pressed={selected}
              aria-label={a.label}
              title={a.label}
              className={`relative aspect-square min-h-[56px] rounded-full overflow-hidden border-2 transition-all ${
                selected
                  ? 'border-cyan-400 ring-2 ring-cyan-400/40'
                  : 'border-zinc-700 hover:border-zinc-400'
              }`}
            >
              <Image src={a.src} alt={a.label} fill sizes="72px" className="object-cover" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
