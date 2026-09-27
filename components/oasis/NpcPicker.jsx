// OASIS NpcPicker — choose NPC rivals/allies, styled to the game's theme.
// Props: gameSlug, tier ('rookie'|'veteran'|'elite'|'any'), selected (id[]),
// maxSelect, onToggle(id), theme.
'use client';

import { useMemo, useState } from 'react';
import { npcsForGame, difficultyLabel, TIERS } from '@/lib/oasis/npcs';

export default function NpcPicker({
  gameSlug,
  selected = [],
  maxSelect = 6,
  onToggle,
  theme,
  title = 'CALL IN RIVALS',
}) {
  const [tierFilter, setTierFilter] = useState('any');
  const all = useMemo(() => npcsForGame(gameSlug), [gameSlug]);
  const list = useMemo(
    () => (tierFilter === 'any' ? all : all.filter((n) => n.tier === tierFilter)),
    [all, tierFilter],
  );

  const t = theme || {};

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className={`text-xs font-bold tracking-widest uppercase ${t.accentText || 'text-fuchsia-400'}`}>
          {title}
        </h3>
        <div className="flex gap-1">
          {['any', ...TIERS].map((tier) => (
            <button
              key={tier}
              onClick={() => setTierFilter(tier)}
              className={`px-2 py-1 text-[10px] font-bold tracking-widest uppercase border rounded transition-colors ${
                tierFilter === tier
                  ? `${t.accentText || 'text-fuchsia-400'} ${t.accentBorder || 'border-fuchsia-500/50'} bg-white/5`
                  : 'text-zinc-500 border-zinc-800 hover:text-zinc-300'
              }`}
            >
              {tier}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
        {list.map((npc) => {
          const isSel = selected.includes(npc.id);
          const disabled = !isSel && selected.length >= maxSelect;
          return (
            <button
              key={npc.id}
              disabled={disabled}
              onClick={() => onToggle && onToggle(npc.id)}
              className={`text-left px-3 py-2.5 border rounded transition-all ${
                isSel
                  ? `${t.accentBorder || 'border-fuchsia-500/50'} ${t.accentBg || 'bg-fuchsia-950/20'} ${t.glow || ''}`
                  : 'border-zinc-800 bg-black/40 hover:border-zinc-600'
              } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-white uppercase tracking-wider">{npc.name}</span>
                <span className={`text-[10px] font-bold tracking-widest uppercase px-1.5 py-0.5 border rounded ${
                  npc.tier === 'elite' ? 'text-red-400 border-red-500/50'
                  : npc.tier === 'veteran' ? 'text-amber-300 border-amber-500/50'
                  : 'text-zinc-400 border-zinc-700'
                }`}>
                  {difficultyLabel(npc.difficulty)}
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 mt-1 leading-snug">{npc.tagline}</p>
              <div className="mt-1.5 h-1 rounded bg-zinc-800 overflow-hidden">
                <div
                  className={`h-full rounded ${npc.tier === 'elite' ? 'bg-red-500' : npc.tier === 'veteran' ? 'bg-amber-400' : 'bg-zinc-500'}`}
                  style={{ width: `${npc.difficulty * 10}%` }}
                />
              </div>
            </button>
          );
        })}
      </div>
      {list.length === 0 && (
        <p className="text-xs text-zinc-600 tracking-widest uppercase">No rivals in this tier for this game.</p>
      )}
    </div>
  );
}
