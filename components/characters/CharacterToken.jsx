'use client';
// components/characters/CharacterToken.jsx
//
// WAVE 0 — the 2D/display form of a roster character
// (characters-everywhere-plan.md §3): one component for every
// preview-image embodiment — picker cards, circular tokens,
// callsign plates, lobby rows, profile displays — so a character
// looks like itself everywhere it stands for a user.
//
// Treatment follows the select-screen cards (app/kombat/page.jsx)
// and the profile roster (components/profile/MyCharacters.jsx):
// square preview art, dark frame, amber highlight when selected.
//
// Props:
//   characterId  roster characterId — unknown ids render nothing
//   embodiment   a read-model record (lib/characters/embodiment.js)
//                may be passed instead of characterId
//   variant      'card' (default, picker/display card) |
//                'token' (circular token) |
//                'plate' (small icon + name chip) |
//                'billboard' (standing display card, name bar)
//   size         px box size for token/plate variants
//   showName     name label where the variant carries one
//   selected     amber selected treatment
//   onClick      when set, the token is a button
//   className    extra classes on the outer element
import { getEmbodiment } from '@/lib/characters/embodiment';

export default function CharacterToken({
  characterId,
  embodiment,
  variant = 'card',
  size = 64,
  showName = true,
  selected = false,
  onClick,
  className = '',
}) {
  const e = embodiment || getEmbodiment(characterId);
  if (!e || !e.preview) return null;

  const frame = selected
    ? 'border-amber-300 bg-amber-400/15'
    : 'border-white/10 bg-white/5';

  let body;
  if (variant === 'token') {
    body = (
      <>
        <span
          className={`block overflow-hidden rounded-full ring-2 ${selected ? 'ring-amber-300' : 'ring-white/20'}`}
          style={{ width: size, height: size }}
        >
          <img src={e.preview} alt={e.name} className="h-full w-full object-cover" loading="lazy" />
        </span>
        {showName && (
          <span className="mt-1 block max-w-full truncate text-center text-[11px] font-semibold text-neutral-200">
            {e.name}
          </span>
        )}
      </>
    );
  } else if (variant === 'plate') {
    body = (
      <span className={`inline-flex items-center gap-2 rounded-lg border px-2 py-1 ${frame}`}>
        <span className="block overflow-hidden rounded-md" style={{ width: size, height: size }}>
          <img src={e.preview} alt={e.name} className="h-full w-full object-cover" loading="lazy" />
        </span>
        {showName && <span className="text-sm font-semibold text-neutral-100">{e.name}</span>}
      </span>
    );
  } else if (variant === 'billboard') {
    body = (
      <span className={`block overflow-hidden rounded-xl border-2 ${frame}`}>
        <img src={e.preview} alt={e.name} className="aspect-square w-full object-cover" loading="lazy" />
        {showName && (
          <span className="block bg-black/60 px-2 py-1.5 text-center text-xs font-bold tracking-wide text-neutral-100">
            {e.name}
          </span>
        )}
      </span>
    );
  } else {
    // 'card' — the select-screen / profile-picker treatment
    body = (
      <span className={`block overflow-hidden rounded-xl border-2 text-left ${frame}`}>
        <span className="block aspect-square overflow-hidden">
          <img src={e.preview} alt={e.name} className="aspect-square w-full object-cover" loading="lazy" />
        </span>
        {showName && (
          <span className="block px-3 py-2.5">
            <span className="block truncate text-sm font-semibold text-neutral-100">{e.name}</span>
            <span className="block text-[11px] uppercase tracking-widest text-neutral-500">
              Roster #{e.queueNumber}
            </span>
          </span>
        )}
      </span>
    );
  }

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={selected}
        aria-label={e.name}
        className={`block ${className}`}
      >
        {body}
      </button>
    );
  }
  return <div className={className}>{body}</div>;
}
