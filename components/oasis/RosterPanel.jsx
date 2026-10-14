// OASIS RosterPanel — the waiting-room headcount: humans seated, NPCs
// backfilled, open seats. Min-max participation made visible.
//
// WAVE 4 (characters-everywhere-plan.md §4): identity made visible —
// each human's row carries their profile character's preview token
// when they have one, and a roster-legend NPC seat shows the
// fighter's own name + token instead of a generic "Rival".
// Display only: seat logic, counts and readiness are unchanged.
// A human's pick is read from the same public route the rest of
// the platform uses (GET /api/profiles/<id>/character — one public
// roster id, validated against the roster before it renders);
// a human without a pick, or an unreachable lookup, renders
// exactly as before. Roster NPC ids (`roster:<characterId>`)
// resolve via getAnyNpc; hand-authored ids resolve as before.
'use client';

import { useEffect, useState } from 'react';
import { getAnyNpc } from '@/lib/oasis/roster-npcs';
import { getEmbodiment } from '@/lib/characters/embodiment';
import CharacterToken from '@/components/characters/CharacterToken';

// userId -> characterId | null, for the life of the page: a lobby
// re-renders often, a player's pick doesn't change mid-wait.
const profileCharCache = new Map();

async function fetchProfileCharacterId(userId) {
  if (profileCharCache.has(userId)) return profileCharCache.get(userId);
  let characterId = null;
  try {
    const res = await fetch(`/api/profiles/${encodeURIComponent(userId)}/character`);
    if (res && res.ok) {
      const body = await res.json();
      if (body && getEmbodiment(body.characterId)) characterId = body.characterId;
    }
  } catch { /* offline / unconnected — no token, the row stands as-is */ }
  profileCharCache.set(userId, characterId);
  return characterId;
}

export default function RosterPanel({ humans = [], npcIds = [], minPlayers, maxPlayers, theme, hostLabel = 'YOU' }) {
  const t = theme || {};
  const [humanChars, setHumanChars] = useState({});

  // Resolve each seated human's profile character (display only).
  useEffect(() => {
    const wanted = [...new Set(humans.map((h) => h?.id).filter(Boolean))]
      .filter((id) => !(id in humanChars) && !profileCharCache.has(id));
    if (wanted.length === 0) return undefined;
    let cancelled = false;
    (async () => {
      const found = {};
      await Promise.all(wanted.map(async (id) => {
        found[id] = await fetchProfileCharacterId(id);
      }));
      if (!cancelled) setHumanChars((prev) => ({ ...prev, ...found }));
    })();
    return () => { cancelled = true; };
    // humanChars is read as a "already resolved" set only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [humans]);

  const total = humans.length + npcIds.length;
  const seats = [];
  for (let i = 0; i < maxPlayers; i += 1) {
    if (i < humans.length) {
      const human = humans[i];
      seats.push({
        kind: 'human',
        label: human?.label || hostLabel,
        characterId: (human?.id && (humanChars[human.id] ?? profileCharCache.get(human.id))) || null,
      });
    } else if (i < total) {
      const npc = getAnyNpc(npcIds[i - humans.length]);
      seats.push({ kind: 'npc', label: npc ? npc.name : 'Rival', characterId: npc?.characterId || null });
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
            {seat.characterId && (
              <CharacterToken characterId={seat.characterId} variant="token" size={24} showName={false} />
            )}
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
