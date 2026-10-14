'use client';

// CharacterSelect — pick a player avatar archetype and paint it.
// Props:
//   onChange({ archetype, tint })  fired whenever the choice changes
//   initialArchetype, initialTint  optional starting values
//   onFighterChange(characterId|null)  optional, WAVE 4 roster picks
//
// One live 3D preview (not four — kinder to mobile GPUs), a preset grid,
// and tint swatches that recolor the armor in real time.
//
// WAVE 4 (characters-everywhere-plan.md §2/§4): a ROSTER SHELF beside
// the six frames offers the 43 platform fighters. Picking one shows
// it in the viewer as the Wave 0 embodiment (pose-driver idle — the
// roster GLBs carry no baked clips, so fighters get NO clip picker
// and NO armor tint; legends wear their own colors). Picking a frame
// again clears the legend.
//
// Persistence, honestly split: the frame + tint persist to the
// account (oasis_profiles.avatar_glb / avatar_tint, parent-saved).
// That column is archetype-shaped — it stores a frame id, and a
// legend id would be a lie in it — so the legend pick follows the
// platform pick-chain precedent instead: device-local localStorage
// (`olympus.characterPick.oasis`, lib/characters/embodiment.js),
// read after mount like every other surface override.
import { useEffect, useState } from 'react';
import ModelViewer from './ModelViewer';
import CharacterToken from '@/components/characters/CharacterToken';
import { AVATAR_ARCHETYPES, AVATAR_TINTS } from '@/lib/glb/avatars';
import {
  getEmbodiment, listEmbodiments, readSurfaceOverride, writeSurfaceOverride,
} from '@/lib/characters/embodiment';

const OASIS_SURFACE = 'oasis';

export default function CharacterSelect({ onChange, initialArchetype = 'scout', initialTint, onFighterChange }) {
  const start = AVATAR_ARCHETYPES.find((a) => a.id === initialArchetype) || AVATAR_ARCHETYPES[0];
  const [archetype, setArchetype] = useState(start);
  const [tint, setTint] = useState(initialTint || start.defaultTint);
  const [fighterId, setFighterId] = useState(null);

  // The legend pick lives in localStorage (device mirror) — read
  // after mount so server markup and first client paint agree,
  // the CharacterPicker precedent.
  useEffect(() => { setFighterId(readSurfaceOverride(OASIS_SURFACE)); }, []);

  const fighter = fighterId ? getEmbodiment(fighterId) : null;

  const choose = (a) => {
    setArchetype(a);
    if (fighterId) {
      setFighterId(null);
      writeSurfaceOverride(OASIS_SURFACE, null);
      if (onFighterChange) onFighterChange(null);
    }
    // keep the user's tint when switching bodies — it is their color
    if (onChange) onChange({ archetype: a.id, tint });
  };
  const paint = (hex) => {
    setTint(hex);
    if (onChange) onChange({ archetype: archetype.id, tint: hex });
  };
  const chooseFighter = (characterId) => {
    setFighterId(characterId);
    writeSurfaceOverride(OASIS_SURFACE, characterId);
    if (onFighterChange) onFighterChange(characterId);
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="text-center mb-4">
        <div className="text-[10px] tracking-[0.5em] text-cyan-500 uppercase mb-2">OASIS registry</div>
        <h2 className="text-3xl font-black tracking-[0.15em] uppercase text-white">Choose your avatar</h2>
        <p className="text-zinc-400 text-sm mt-2">
          {fighter
            ? `${fighter.name} — roster legend. Signature: ${fighter.powers.slice(0, 2).join(' · ') || 'presence'}.`
            : archetype.blurb}
        </p>
      </div>

      {fighter ? (
        <ModelViewer characterId={fighter.id} height={340} showPicker={false} />
      ) : (
        <ModelViewer
          src={archetype.model}
          animations={archetype.animations}
          tint={tint}
          height={340}
        />
      )}

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
        Or stand as a legend
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-72 overflow-y-auto pr-1">
        {listEmbodiments().map((e) => (
          <CharacterToken
            key={e.id}
            embodiment={e}
            variant="card"
            selected={fighterId === e.id}
            onClick={() => chooseFighter(e.id)}
          />
        ))}
      </div>
      <p className="text-center text-zinc-600 text-[11px] mt-2 tracking-widest uppercase">
        Your legend pick is kept on this device
      </p>

      {fighter ? (
        <p className="text-center text-zinc-500 text-xs mt-6 tracking-widest uppercase">
          Legends wear their own colors — armor paint is for frames
        </p>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}
