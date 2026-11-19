'use client';

// ConcourseRadio — the radio mini-player, moved here verbatim from
// components/Concourse.jsx in the Nov 18, 2026 Concourse merge
// ("Concourse becomes the portal menu"): the Concourse box is gone,
// and the pill's home is now the tile panel's chrome row in the
// merged menu, beside the season badge and the docked backpack.

import { Play, Pause, SkipBack, SkipForward, Music2 } from 'lucide-react';
import { useRadio } from '../radio/RadioProvider';

// Concourse mini-player (Merlin, round 3, 2026-10-23): "the visual
// part stays alive in concourse with the player controls at the
// bottom of concourse next to the season name in its own button."
// The full RadioBar can be minimized — its embed now survives that
// parked — and this pill is the radio's living face in the merged menu:
// transport (prev / play-pause / next) plus the current track.
// Play state is the provider's own, set only by Spotify's real
// playback events, so the pill never shows a state that isn't
// real. Tapping the track face reopens the full radio —
// setMinimized(false) + setExpanded(true), the same end state the
// Radio tile's `olympus:concourse-open` handler lands in. Before
// any track has ever loaded it simply reads as the station and
// still opens the radio.
export default function ConcourseRadio() {
  const {
    current, playing, engineReady, station,
    togglePlay, next, prev, setMinimized, setExpanded,
  } = useRadio();
  const openRadio = () => { setMinimized(false); setExpanded(true); };
  const skipBtn =
    'ui-element pointer-events-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-300 transition-all hover:bg-white/10 hover:text-white active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300';
  return (
    <div
      role="group"
      aria-label="Radio — mini player"
      className="flex min-w-0 items-center gap-1 rounded-full border border-white/14 bg-zinc-950/55 py-1 pl-1 pr-1.5 backdrop-blur-md"
    >
      <button type="button" onClick={prev} aria-label="Previous track" title="Previous track" className={skipBtn}>
        <SkipBack size={14} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={togglePlay}
        disabled={!engineReady}
        aria-label={playing ? 'Pause' : engineReady ? 'Play' : 'Loading Spotify player'}
        title={playing ? 'Pause' : 'Play'}
        className="ui-element pointer-events-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-300 text-black transition-all hover:opacity-90 active:scale-95 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
      >
        {playing
          ? <Pause size={15} aria-hidden="true" />
          : <Play size={15} aria-hidden="true" className="ml-px" />}
      </button>
      <button type="button" onClick={next} aria-label="Next track" title="Next track" className={skipBtn}>
        <SkipForward size={14} aria-hidden="true" />
      </button>
      <span className="h-5 w-px shrink-0 bg-white/15" aria-hidden="true" />
      <button
        type="button"
        onClick={openRadio}
        aria-label={current ? `Open the radio — now showing ${current.title} by ${current.artist}` : `Open the radio — ${station.shortName}`}
        title="Open the radio"
        className="ui-element pointer-events-auto flex min-w-0 items-center gap-1.5 rounded-full px-1.5 py-1 text-left transition-all hover:bg-white/10 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300"
      >
        <Music2 size={13} aria-hidden="true" className="shrink-0 text-teal-300" />
        <span className="block max-w-[76px] truncate text-[10.5px] font-semibold leading-tight text-zinc-100">
          {current ? current.title : station.shortName}
        </span>
        {playing && (
          <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-teal-300" />
        )}
      </button>
    </div>
  );
}

// The box backdrop media: the default artwork, the user's own photo,
// or the user's own video (muted, looping; held still — no autoplay —
// under prefers-reduced-motion). Sits under a scrim of the same
// darkness the glass always had (bg-zinc-950/55), so tiles and labels
