'use client';

// DefaultAvatarPicker — choose a polished default avatar or keep your photo.
// Props: value (current avatar src), onPick(src).
// Phone-first: 44px+ touch targets, 4-column grid.
import Image from 'next/image';
import { DEFAULT_AVATARS } from '@/lib/avatars/defaults';

export default function DefaultAvatarPicker({ value, onPick }) {
  return (
    <div>
      <div className="text-[10px] tracking-[0.3em] uppercase text-zinc-500 mb-2">
        Or pick a default avatar
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
