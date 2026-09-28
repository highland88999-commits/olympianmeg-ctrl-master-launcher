// OASIS RosterPanel — the waiting-room headcount: humans seated, NPCs
// backfilled, open seats. Min-max participation made visible.
'use client';

import { getNpc } from '@/lib/oasis/npcs';

export default function RosterPanel({ humans = [], npcIds = [], minPlayers, maxPlayers, theme, hostLabel = 'YOU' }) {
  const t = theme || {};
  const total = humans.length + npcIds.length;
  const seats = [];
  for (let i = 0; i < maxPlayers; i += 1) {
    if (i < humans.length) seats.push({ kind: 'human', label: humans[i]?.label || hostLabel });
    else if (i < total) {
      const npc = getNpc(npcIds[i - humans.length]);
      seats.push({ kind: 'npc', label: npc ? npc.name : 'Rival' });
    } else seats.push({ kind: 'open', label: 'Open seat' });
  }

  const ready = humans.length >= minPlayers;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className={`text-xs font-bold tracking-widest uppercase ${t.accentText || 'text-fuchsia-400'}`}>
          ROSTER — {total}/{maxPlayers}
        </h3>
        <span className={`text-[10px] font-bold tracking-widest uppercase ${ready ? 'text-emerald-400' : 'text-amber-300 animate-pulse'}`}>
          {ready ? 'READY TO START' : `NEED ${minPlayers - humans.length} MORE`}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {seats.map((seat, i) => (
          <div
            key={i}
            className={`flex items-center gap-3 px-3 py-2 border rounded text-sm ${
              seat.kind === 'human'
                ? `${t.secondaryBorder || 'border-cyan-500/50'} bg-white/5`
                : seat.kind === 'npc'
                  ? 'border-zinc-700 bg-black/40'
                  : 'border-dashed border-zinc-800 text-zinc-600'
            }`}
          >
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${
              seat.kind === 'human' ? 'bg-cyan-500/20 text-cyan-300'
              : seat.kind === 'npc' ? 'bg-fuchsia-500/20 text-fuchsia-300'
              : 'bg-zinc-900 text-zinc-600'
            }`}>
              {i + 1}
            </span>
            <span className={`font-bold tracking-wider uppercase ${seat.kind === 'open' ? 'text-zinc-600' : 'text-white'}`}>
              {seat.label}
            </span>
            {seat.kind === 'npc' && (
              <span className="ml-auto text-[10px] tracking-widest uppercase text-fuchsia-400/70">NPC</span>
            )}
            {seat.kind === 'human' && i === 0 && (
              <span className="ml-auto text-[10px] tracking-widest uppercase text-cyan-400/70">HOST</span>
            )}
          </div>
        ))}
      </div>
      {!ready && (
        <p className="text-[11px] text-zinc-500 leading-snug">
          Short of the minimum? NPC rivals will backfill the open seats when the match starts —
          nobody waits forever in the OASIS.
        </p>
      )}
    </div>
  );
}
