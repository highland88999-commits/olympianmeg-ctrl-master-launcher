'use client';

// CharacterSelect — pick a player avatar archetype and paint it.
// Props:
//   onChange({ archetype, tint })  fired whenever the choice changes
//   initialArchetype, initialTint  optional starting values
//
// One live 3D preview (not four — kinder to mobile GPUs), a preset grid,
// and tint swatches that recolor the armor in real time.
import { useState } from 'react';
import ModelViewer from './ModelViewer';
import { AVATAR_ARCHETYPES, AVATAR_TINTS } from '@/lib/glb/avatars';

export default function CharacterSelect({ onChange, initialArchetype = 'scout', initialTint }) {
  const start = AVATAR_ARCHETYPES.find((a) => a.id === initialArchetype) || AVATAR_ARCHETYPES[0];
  const [archetype, setArchetype] = useState(start);
  const [tint, setTint] = useState(initialTint || start.defaultTint);

  const choose = (a) => {
    setArchetype(a);
    // keep the user's tint when switching bodies — it is their color
    if (onChange) onChange({ archetype: a.id, tint });
  };
  const paint = (hex) => {
    setTint(hex);
    if (onChange) onChange({ archetype: archetype.id, tint: hex });
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="text-center mb-4">
        <div className="text-[10px] tracking-[0.5em] text-cyan-500 uppercase mb-2">OASIS registry</div>
        <h2 className="text-3xl font-black tracking-[0.15em] uppercase text-white">Choose your avatar</h2>
        <p className="text-zinc-400 text-sm mt-2">{archetype.blurb}</p>
      </div>

      <ModelViewer
        src={archetype.model}
        animations={archetype.animations}
        tint={tint}
        height={340}
      />

      <div className="text-[10px] tracking-[0.4em] text-zinc-500 uppercase mt-6 mb-3 text-center">
        Pick a frame
      </div>
      <div className="grid grid-cols-2 gap-3">
        {AVATAR_ARCHETYPES.map((a) => {
          const selected = a.id === archetype.id;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => choose(a)}
              aria-pressed={selected}
              className={`min-h-[64px] px-4 py-3 rounded-lg border text-left transition-all ${
                selected
                  ? 'border-cyan-400/70 bg-cyan-500/15'
                  : 'border-zinc-800 bg-black/40 hover:border-zinc-500'
              }`}
            >
              <div className={`text-sm font-black tracking-[0.2em] uppercase ${selected ? 'text-cyan-100' : 'text-zinc-200'}`}>
                {a.label}
              </div>
              <div className="text-[11px] text-zinc-500 mt-1 leading-snug">{a.blurb}</div>
            </button>
          );
        })}
      </div>

      <div className="text-[10px] tracking-[0.4em] text-zinc-500 uppercase mt-6 mb-3 text-center">
        Paint your armor
      </div>
      <div className="flex flex-wrap gap-3 justify-center">
        {AVATAR_TINTS.map((t) => {
          const selected = t.hex.toLowerCase() === tint.toLowerCase();
          return (
            <button
              key={t.hex}
              type="button"
              onClick={() => paint(t.hex)}
              title={t.name}
              aria-label={`Paint armor ${t.name}`}
              aria-pressed={selected}
              className={`w-11 h-11 rounded-full border-2 transition-all ${
                selected ? 'border-white scale-110' : 'border-zinc-700 hover:border-zinc-400'
              }`}
              style={{ backgroundColor: t.hex }}
            />
          );
        })}
      </div>
      <p className="text-center text-zinc-600 text-xs mt-3 tracking-widest uppercase">
        Wearing: {AVATAR_TINTS.find((t) => t.hex.toLowerCase() === tint.toLowerCase())?.name || 'Custom'}
      </p>
    </div>
  );
}
