// components/radio/RadioBar.jsx
// Nexus universe radio — persistent collapsible audio control for the launcher shell.
//
// Three states, one paradigm:
//   COLLAPSED (default) — slim bottom bar: current track + play/pause + next.
//                         One tap on the track expands the library.
//   EXPANDED            — station library opens UPWARD above the bar as a
//                         scrollable sheet (bottom-sheet behavior on mobile):
//                         tap any song to play it; full transport (previous,
//                         play/pause, next), shuffle toggle (on by default),
//                         the official Spotify player, and the deep link.
//                         Collapses back into the slim bar.
//   MINIMIZED           — interim dock chip (bottom-right). The radio registers
//                         itself in the shared window-dock registry
//                         (lib/window-dock/registry.js), so the future universal
//                         dock picks it up with the same behavior everywhere.
//
// Honesty: playing state comes only from Spotify's real playback events.
// Without the listener's Spotify Premium, the official embed plays 30-second
// previews — the UI says so and always offers the deep link. Never faked.
// Safari: the bar sits above the Safari chrome via env(safe-area-inset-bottom).
// Reduced motion: transitions collapse under prefers-reduced-motion.

'use client';

import {
  Play, Pause, SkipBack, SkipForward, Shuffle, Dices, ChevronDown,
  Minus, Radio, ExternalLink, Music2, ListMusic,
} from 'lucide-react';
import { useRadio } from './RadioProvider';
import SpotifyEmbed from './SpotifyEmbed';
import { sourceLabel } from '@/lib/radio/station';

const iconBtn =
  'rounded-full p-2 text-white/80 transition-colors motion-reduce:transition-none hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300';

function TrackRow({ track, index, active, onPlay }) {
  if (!track) return null;
  return (
    <button
      type="button"
      onClick={() => onPlay(index)}
      aria-label={`Play ${track.title} by ${track.artist}`}
      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors motion-reduce:transition-none hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300 ${active ? 'bg-white/10' : ''}`}
    >
      <Music2 size={14} className="shrink-0 text-teal-300" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-white">
          {track.title}{track.explicit ? ' [E]' : ''}
        </span>
        <span className="block truncate text-xs text-white/60">
          {track.artist} · {sourceLabel(track)}
        </span>
      </span>
      {active && (
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-teal-300">
          Now playing
        </span>
      )}
    </button>
  );
}

function TransportRow({ big = false }) {
  const { playing, engineReady, shuffle, togglePlay, next, prev, toggleShuffle, reshuffle } = useRadio();
  const playSize = big ? 22 : 18;
  return (
    <div className="flex items-center justify-center gap-1 sm:gap-2" role="group" aria-label="Playback controls">
      <button type="button" onClick={prev} aria-label="Previous track" title="Previous track" className={iconBtn}>
        <SkipBack size={big ? 20 : 18} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={togglePlay}
        disabled={!engineReady}
        aria-label={playing ? 'Pause' : engineReady ? 'Play' : 'Loading Spotify player'}
        title={playing ? 'Pause' : 'Play'}
        className={`${big ? 'p-3.5' : 'p-2.5'} rounded-full bg-teal-300 text-black transition-opacity motion-reduce:transition-none hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white disabled:opacity-40`}
      >
        {playing
          ? <Pause size={playSize} aria-hidden="true" />
          : <Play size={playSize} aria-hidden="true" className="ml-0.5" />}
      </button>
      <button type="button" onClick={next} aria-label="Next track" title="Next track" className={iconBtn}>
        <SkipForward size={big ? 20 : 18} aria-hidden="true" />
      </button>
      <span className="mx-1 h-6 w-px bg-white/15" aria-hidden="true" />
      <button
        type="button"
        onClick={toggleShuffle}
        aria-pressed={shuffle}
        aria-label={shuffle ? 'Turn shuffle off' : 'Turn shuffle on'}
        title={shuffle ? 'Shuffle is on' : 'Shuffle is off'}
        className={`${iconBtn} ${shuffle ? '!text-teal-300' : '!text-white/45'}`}
      >
        <Shuffle size={17} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={reshuffle}
        aria-label="Shuffle the order again"
        title="Shuffle the order again"
        className={iconBtn}
      >
        <Dices size={17} aria-hidden="true" />
      </button>
    </div>
  );
}

function LibrarySheet() {
  const { station, queue, index, playAt, contributions, setExpanded, setMinimized } = useRadio();
  return (
    <div className="flex min-h-0 flex-col">
      {/* Mobile bottom-sheet handle — tap to collapse */}
      <button
        type="button"
        onClick={() => setExpanded(false)}
        aria-label="Collapse radio panel"
        className="mx-auto flex w-16 items-center justify-center py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300"
      >
        <span className="h-1 w-10 rounded-full bg-white/25" aria-hidden="true" />
      </button>

      <div className="flex items-center justify-between px-3 pb-1">
        <h2 className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wider text-white/70">
          {station.name}
        </h2>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          aria-label="Collapse back to the slim bar"
          title="Collapse"
          className={iconBtn}
        >
          <ChevronDown size={17} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => { setExpanded(false); setMinimized(true); }}
          aria-label="Minimize radio to the dock"
          title="Minimize to dock"
          className={iconBtn}
        >
          <Minus size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="px-3">
        <TransportRow big />
      </div>

      {/* Official Spotify player — the real playback engine */}
      <div className="px-3 pt-2">
        <div className="overflow-hidden rounded-xl border border-white/10" aria-hidden="true">
          <SpotifyEmbed />
        </div>
        <p className="mt-2 text-[11px] leading-snug text-white/60">
          Playing 30-second previews. For full tracks, open the playlist in the Spotify
          app — full playback needs Spotify Premium.
        </p>
      </div>

      <div className="mt-2 flex items-center justify-between px-3">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-white/70">
          <ListMusic size={13} aria-hidden="true" /> Station library
        </h3>
        {contributions.length > 0 && (
          <span className="text-[11px] text-white/50">
            +{contributions.reduce((n, c) => n + c.trackCount, 0)} from pocket universes
          </span>
        )}
      </div>

      <div className="custom-scrollbar mt-1 min-h-0 flex-1 overflow-y-auto px-1.5" role="listbox" aria-label="Station library — tap a song to play it">
        {queue.map((t, i) => (
          <TrackRow key={`${t.uri}-${i}`} track={t} index={i} active={i === index} onPlay={playAt} />
        ))}
      </div>

      <div className="px-3 pb-1 pt-2">
        <a
          href={station.openUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1DB954] px-4 py-2.5 text-sm font-semibold text-black transition-opacity motion-reduce:transition-none hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        >
          <ExternalLink size={15} aria-hidden="true" /> Open “{station.name}” in Spotify
        </a>
        <p className="mt-1.5 text-center text-[11px] text-white/45">
          Want to add tracks? The playlist accepts collaborators — Merlin enables that in the Spotify app.
        </p>
      </div>
    </div>
  );
}

export default function RadioBar() {
  const {
    station, current, playing, engineReady, shuffle,
    minimized, expanded, togglePlay, next, toggleShuffle,
    setMinimized, setExpanded,
  } = useRadio();

  // MINIMIZED — interim dock chip (the shared dock registry already knows us).
  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        aria-label="Restore radio from the dock"
        title="Radio"
        className="fixed bottom-[calc(0.75rem+env(safe-area-inset-bottom))] right-3 z-[70] flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/85 text-teal-300 shadow-lg backdrop-blur-md transition-transform motion-reduce:transition-none hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300"
      >
        <Radio size={18} aria-hidden="true" />
      </button>
    );
  }

  const sheetOpen = expanded;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[70]"
      role="region"
      aria-label={`Nexus radio — ${station.shortName}`}
    >
      {/*
        Library sheet. Always mounted so the Spotify embed (the real playback
        engine) is never unmounted: when closed it parks in a 1px
        visibility:hidden slot — audio keeps playing, controls unfocusable.
        (display:none would risk throttling the embed's audio.)
      */}
      <div
        aria-hidden={!sheetOpen}
        className={
          sheetOpen
            ? 'relative mx-2 mb-2 max-h-[72dvh] overflow-y-auto rounded-2xl border border-white/15 bg-black/92 shadow-2xl backdrop-blur-xl sm:mx-auto sm:max-w-xl'
            : 'invisible pointer-events-none fixed bottom-0 left-0 h-px w-px overflow-hidden opacity-0'
        }
      >
        <LibrarySheet />
      </div>

      {/* COLLAPSED — slim bar: track + play/pause + next. Tap the track to expand. */}
      <div
        className="border-t border-white/10 bg-black/85 backdrop-blur-md"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex h-14 items-center gap-1.5 px-2 sm:gap-2 sm:px-3">
          <button
            type="button"
            onClick={togglePlay}
            disabled={!engineReady}
            aria-label={playing ? 'Pause' : engineReady ? 'Play' : 'Loading Spotify player'}
            title={playing ? 'Pause' : 'Play'}
            className="rounded-full bg-teal-300 p-2.5 text-black transition-opacity motion-reduce:transition-none hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white disabled:opacity-40"
          >
            {playing
              ? <Pause size={18} aria-hidden="true" />
              : <Play size={18} aria-hidden="true" className="ml-0.5" />}
          </button>

          <button
            type="button"
            onClick={next}
            aria-label="Next track"
            title="Next track"
            className={iconBtn}
          >
            <SkipForward size={18} aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-expanded={false}
            aria-label={`Expand radio library — now showing ${current ? `${current.title} by ${current.artist}` : station.shortName}`}
            title="Expand"
            className="min-w-0 flex-1 rounded-lg px-2 py-1 text-left transition-colors motion-reduce:transition-none hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300"
          >
            <span className="block truncate text-sm font-medium text-white">
              {current ? `${current.title}${current.explicit ? ' [E]' : ''}` : station.shortName}
            </span>
            <span className="block truncate text-[11px] text-white/55">
              {current ? `${current.artist} · ` : ''}{station.shortName}
              <span
                className="ml-1 rounded bg-white/10 px-1 py-px text-[10px] uppercase tracking-wide text-white/60"
                title="30-second preview — full tracks need Spotify Premium"
              >
                Preview
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={toggleShuffle}
            aria-pressed={shuffle}
            aria-label={shuffle ? 'Turn shuffle off' : 'Turn shuffle on'}
            title={shuffle ? 'Shuffle is on' : 'Shuffle is off'}
            className={`${iconBtn} ${shuffle ? '!text-teal-300' : '!text-white/45'}`}
          >
            <Shuffle size={17} aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => setMinimized(true)}
            aria-label="Minimize radio to the dock"
            title="Minimize to dock"
            className={iconBtn}
          >
            <Minus size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
