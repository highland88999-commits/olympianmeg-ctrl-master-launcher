'use client';
import { memo, useEffect, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { searchPlaces, formatCoords } from '@/lib/geo';
import { summonBike, dismissBike, toggleMount } from '@/components/EarthBike';
import { summonCar, dismissCar, toggleCarMount } from '@/components/EarthSupercar';
import EarthViewToggle from '@/components/EarthViewToggle';
import { beginReanimate, isAtStreetScale, parachuteState, bikeState, carState } from '@/lib/earth/parachute';
import { EARTH_DEFAULT_CHARACTER_ID } from '@/lib/characters/embodiment';
import { QUANTUM_ENABLED } from '@/lib/earth/quantum';
import { aetherState, totalAether } from '@/lib/earth/aether';
import { planetSeedFor } from '@/lib/planets/planet-seeds';
import { roamState } from '@/lib/earth/roam';
import { getEmbodimentForSurface } from '@/lib/gta/walker-embodiment';
import CharacterPicker from '@/components/characters/CharacterPicker';

const QUICK = [
  { label: 'Redwater, Alberta', lat: 53.9486, lon: -113.1067 },
  { label: 'Prince George, BC', lat: 53.9171, lon: -122.7497 },
  { label: 'Edmonton, Alberta', lat: 53.5462, lon: -113.4912 },
  { label: 'Great Pacific Garbage Patch', lat: 38.0, lon: -145.0 },
  { label: 'Mount Olympus, Greece', lat: 40.082, lon: 22.358 },
];

const MIN_KEY = 'earth-console-minimized';

// Earth's canonical seed (lib/planets/planet-seeds.js) — DISPLAY
// ONLY. Earth is special: its seed is descriptive harmony, and
// nothing in the Earth dive/roam path reads it to regenerate or
// alter terrain or behavior. It is shown here so the hub's Earth
// carries its seed name like every other world.
const EARTH_SEED_ENTRY = planetSeedFor('earth');

export default function EarthConsole({ focus, phase, onTravel, onReturn, onStreet, onAscend, onSpawnPick, spawns, selectedTile, onDropToTile, controlsRef }) {
  const { t } = useI18n();
  const [input, setInput] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  // Bike UI state is POLLED from the shared bikeState singleton: the
  // B / E keys mutate it without any React event, so a local useState
  // set only by the button would desync (and did — Merlin, 2026-10-20:
  // bike controls never appeared). Polling keeps every surface honest.
  const [bikeUi, setBikeUi] = useState({ out: false, mounted: false });
  // Supercar UI state, polled from carState on the same beat as
  // the bike (Earth 1 expansion): the V / F keys mutate it
  // outside React, so buttons must poll, not guess.
  const [carUi, setCarUi] = useState({ out: false, mounted: false });
  // Size UI state, polled from the same singletons for the
  // same reason as the bike state: the parachute dive mutates
  // it outside React, so a local useState set only by buttons
  // would desync.
  const [sizeUi, setSizeUi] = useState({ micro: false });
  // Aether collection, polled from the aether singleton like the
  // others (collection happens inside EarthAssets' driver).
  const [aetherUi, setAetherUi] = useState({ count: 0, total: 0 });
  // Auto-collapse (video QA V2-6, 2026-10-26): the console
  // covers ~45% of the screen during descent, so the moment the
  // traveler ARRIVES at street level it folds to its globe tab.
  // Only the diving_to_street → earth_roam edge collapses: a
  // traveler who reopens the console at street level is never
  // folded again by this effect.
  const prevPhaseRef = useRef(phase);
  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = phase;
    if (prev === 'diving_to_street' && phase === 'earth_roam') setMin(true);
  }, [phase]);

  useEffect(() => {
    const id = setInterval(() => {
      setBikeUi((prev) => {
        const next = { out: !!bikeState.summoned, mounted: !!bikeState.mounted };
        return prev.out === next.out && prev.mounted === next.mounted ? prev : next;
      });
      setCarUi((prev) => {
        const next = { out: !!carState.summoned, mounted: !!carState.mounted };
        return prev.out === next.out && prev.mounted === next.mounted ? prev : next;
      });
      setSizeUi((prev) => {
        const next = { micro: (parachuteState?.scale || 1) < 0.5 };
        return prev.micro === next.micro ? prev : next;
      });
      setAetherUi((prev) => {
        const next = { count: aetherState.count || 0, total: totalAether() };
        return prev.count === next.count && prev.total === next.total ? prev : next;
      });
    }, 250);
    return () => clearInterval(id);
  }, []);
  const [minimized, setMinimized] = useState(() => {
    try { return localStorage.getItem(MIN_KEY) === '1'; } catch { return false; }
  });

  const setMin = (v) => {
    setMinimized(v);
    try { localStorage.setItem(MIN_KEY, v ? '1' : '0'); } catch {}
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!input.trim() || searching) return;
    setSearching(true);
    try {
      setResults(await searchPlaces(input.trim()));
    } catch {
      setResults([]);
    }
    setSearching(false);
  };

  const busy = phase === 'diving_to_earth' || phase === 'earth_travel' || phase === 'diving_to_street';
  const atStreet = phase === 'earth_roam';
  const canWalk = phase === 'earth_surface' || atStreet;

  // MINIMIZE IS LAW (Merlin bug report, 2026-10-22: "the controls are
  // not minimizing"): an earlier version force-reopened the console
  // whenever a dive/travel phase began — tapping a tile to parachute,
  // or any travel kicked off while the console was minimized, popped
  // it straight back open over the scene. That auto-reopen is GONE:
  // only the user opens this console. Travel is not silent while
  // minimized — the docked globe pulses and carries a traveling
  // label until the phase settles (see the minimized branch below).
  //
  // Minimized: a floating globe icon docked on the right edge. Tap to open
  // the console in the middle of the screen. The bike controls overlay
  // renders in BOTH branches — riding with the menu closed must still
  // show the stick and thrust buttons.
  if (minimized) {
    return (
      <>
        <button
          onClick={() => setMin(false)}
          aria-label={busy ? 'Open Earth console (traveling)' : 'Open Earth console'}
          title={t('earth.consoleTitle')}
          className={`absolute right-4 top-[32%] z-[80] w-14 h-14 rounded-full bg-zinc-950/90 border border-cyan-500/50 shadow-[0_0_25px_rgba(0,242,255,0.25)] backdrop-blur-md flex items-center justify-center text-2xl hover:scale-105 active:scale-95 transition-all ui-element pointer-events-auto ${busy ? 'animate-pulse' : ''}`}
        >
          <span aria-hidden="true">🌍</span>
        </button>
        {busy && (
          <div aria-live="polite" className="absolute right-4 top-[32%] z-[80] mt-[4.25rem] rounded-full border border-cyan-500/40 bg-zinc-950/90 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.18em] text-cyan-300 ui-element pointer-events-none">
            {phase === 'earth_travel' ? t('earth.traveling') : t('earth.locating')}
          </div>
        )}
        {atStreet && bikeUi.out && (
          <BikeControls mounted={bikeUi.mounted} controlsRef={controlsRef} />
        )}
        {/* Supercar, minimized branch (Earth 1 expansion): one
            button under the globe tab — summon, or ride/dismount
            once it is out. Keys V / F do the same. */}
        {atStreet && (
          <button
            onClick={() => {
              if (!carUi.out) summonCar();
              else toggleCarMount();
            }}
            aria-label={carUi.out ? (carUi.mounted ? 'Dismount supercar' : 'Ride supercar') : 'Summon supercar'}
            title="Lamborghini Aventador — Earth's fastest vehicle (V · F to ride)"
            className="absolute right-4 z-[80] w-14 h-14 rounded-full bg-zinc-950/90 border border-amber-500/50 shadow-[0_0_25px_rgba(251,191,36,0.25)] backdrop-blur-md flex items-center justify-center text-2xl hover:scale-105 active:scale-95 transition-all ui-element pointer-events-auto"
            style={{ top: 'calc(32% + 6.25rem)' }}
          >
            <span aria-hidden="true">🏎</span>
          </button>
        )}
        <EarthViewToggle phase={phase} />
      </>
    );
  }

  return (
    <>
    {/* Earth console — opens centered; the minimize control collapses it to a
        floating globe icon on the right edge. Kept clear of the persistent
        radio bar (z-80) so its destination list is never buried.
        GHOST FIX (round 4, defect 6): the card used to be centered
        by a -translate-x/y-1/2 transform on its wrapper. On open
        and on phase/size state changes the card's content (and
        therefore its height) changes in the same frames — the
        transform recentered a backdrop-blur card mid-change, and
        iOS Safari painted both the old and new positions for
        several frames: an offset, semi-transparent double card.
        The card now centers by flex layout (no transform anywhere
        in its chain) and carries its own composited layer
        (translateZ(0) on the card itself), so a content change
        repaints ONE box in ONE place.
        SCROLL GHOST (Merlin's video, 2026-10-21): scrolling the
        console smeared its list rows into doubled, overlapping
        ghosts. Two causes, both removed: (1) the card itself was a
        backdrop-blur SCROLL container — iOS Safari re-composites
        the blurred backdrop on every scroll frame and paints stale
        row copies; the card is now a near-opaque solid (no blur).
        (2) The search-results and landmark lists were NESTED
        scrollers inside the card's scroller; they now flow in the
        card's single scroll surface.
        MINIMIZE REACHABILITY (Merlin bug report, 2026-10-22): the
        header — minimize button included — used to live INSIDE that
        one scroll surface, so on a phone the card's content pushed
        it off the top and scrolling buried it: the console looked
        like it would not minimize because its minimize button was
        no longer on screen. The header is now PINNED above the
        scroll body (the card clips, the body is still the single
        scroll surface), so minimize is always visible and tappable
        no matter how far the destination list is scrolled. */}
    <div className="absolute inset-0 z-[80] flex items-center justify-center pointer-events-none ui-element">
      <div className="bg-zinc-950/95 border border-cyan-500/30 rounded-xl p-4 shadow-[0_0_30px_rgba(0,242,255,0.12)] flex flex-col max-h-[70dvh] overflow-hidden w-[min(92vw,20rem)] pointer-events-auto [transform:translateZ(0)]">
        <div className="shrink-0 border-b border-zinc-800 pb-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-black tracking-[0.25em] uppercase text-cyan-300">
              {t('earth.consoleTitle')}
            </div>
            <button
              onClick={() => setMin(true)}
              aria-label="Minimize Earth console"
              title="Minimize"
              className="w-9 h-9 shrink-0 rounded-full border border-zinc-700 text-zinc-400 hover:text-white hover:border-cyan-500/60 flex items-center justify-center text-base leading-none transition-all"
            >
              <span aria-hidden="true">—</span>
            </button>
          </div>
          {focus && (
            <div className="text-[10px] text-zinc-400 mt-1 truncate">
              ◉ {focus.label} · {formatCoords(focus.lat, focus.lon)}
            </div>
          )}
          {EARTH_SEED_ENTRY && (
            <div className="text-[10px] text-zinc-500 mt-1 truncate">
              🌱 World seed · {EARTH_SEED_ENTRY.seed} — {EARTH_SEED_ENTRY.lifeLabel}
            </div>
          )}
          {busy && (
            <div className="text-[10px] text-cyan-400 mt-1 animate-pulse">
              {phase === 'earth_travel' ? t('earth.traveling')
                : phase === 'diving_to_street' ? 'Shrinking into tile world…'
                : t('earth.locating')}
            </div>
          )}
          {atStreet && (
            <div className="text-[10px] text-cyan-300 mt-1">
              {bikeUi.mounted
                ? 'On the bike — left stick steers & thrusts · BOOST / ▲ / ▼ buttons on the right.'
                : 'On foot — left thumb to walk, drag the right side to look around.'}
            </div>
          )}
          {atStreet && aetherUi.total > 0 && (
            <div className="text-[10px] text-[#aef4ff] mt-1">
              ◆ Aether {aetherUi.count} / {aetherUi.total} — hidden inside Earth&rsquo;s buildings. Walk in and find them.
            </div>
          )}
          {/* Parachute / climb / elevator hints. The parachute
              clause only shows while the Quantum Realm is enabled —
              with the realm off (lib/earth/quantum.js) a double-click
              no longer shrinks, and the hint must not promise it. */}
          <div className="text-[10px] text-zinc-500 mt-1 leading-relaxed">
            {QUANTUM_ENABLED ? 'Double-click any tile to parachute down · ' : ''}Double-click ladders to climb · Double-click monuments for the elevator
          </div>
        </div>

        {/* The card's ONE scroll surface — everything below the pinned
            header flows in here (see the scroll-ghost note above). */}
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto custom-scrollbar pt-3">
        <form onSubmit={submit} className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('earth.searchPlaceholder')}
            disabled={busy}
            className="flex-1 min-w-0 bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-xs placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={busy}
            className="px-3 py-1.5 text-[10px] font-bold tracking-widest uppercase bg-cyan-700 hover:bg-cyan-600 rounded transition-colors disabled:opacity-50"
          >
            {searching ? '…' : '›'}
          </button>
        </form>

        {results.length > 0 && (
          <div className="flex flex-col gap-1">
            {results.map((r, i) => (
              <button
                key={i}
                disabled={busy}
                onClick={() => { onTravel(r); setResults([]); setInput(''); }}
                className="text-left text-[11px] px-2 py-1.5 rounded bg-zinc-900/60 hover:bg-cyan-950/60 border border-zinc-800 hover:border-cyan-500/40 transition-all truncate disabled:opacity-50"
              >
                {r.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-1">
          <div className="text-[9px] font-bold tracking-[0.25em] uppercase text-zinc-500">
            Quick locations
          </div>
          {QUICK.map((q) => (
            <button
              key={q.label}
              disabled={busy}
              onClick={() => onTravel(q)}
              className="text-left text-[11px] px-2 py-1.5 rounded bg-zinc-900/60 hover:bg-cyan-950/60 border border-zinc-800 hover:border-cyan-500/40 transition-all truncate disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span aria-hidden="true" className="text-cyan-500 mr-1">→</span>{q.label}
            </button>
          ))}
        </div>

        {/* Street level (Day 2): descend to the ground and walk,
            embodied as your character. Spawn picks travel first,
            then land you on foot at the landmark. */}
        {canWalk && !atStreet && (
          <button
            onClick={onStreet}
            disabled={busy || !focus}
            className="w-full py-2 text-[10px] font-bold tracking-[0.2em] uppercase text-cyan-200 border border-cyan-600/60 bg-cyan-950/50 rounded hover:border-cyan-400 hover:text-white transition-all disabled:opacity-50"
          >
            ⌄ Street level — walk here
          </button>
        )}
        {atStreet && (
          <>
            <button
              onClick={onAscend}
              className="w-full py-2 text-[10px] font-bold tracking-[0.2em] uppercase text-zinc-300 border border-zinc-700 rounded hover:border-cyan-500/50 hover:text-white transition-all"
            >
              ↑ Back to overlook
            </button>
            {/* Summonable TRON bike (B key) */}
            <button
              onClick={() => {
                if (bikeUi.out) dismissBike();
                else summonBike();
              }}
              className="w-full py-2 text-[10px] font-bold tracking-[0.2em] uppercase text-teal-200 border border-teal-600/60 bg-teal-950/50 rounded hover:border-teal-400 hover:text-white transition-all"
            >
              {bikeUi.out ? '✕ Dismiss bike' : '🏍 Summon bike'} <span className="text-zinc-500 normal-case tracking-normal">(B · E to ride)</span>
            </button>
            {/* Summonable Lamborghini Aventador (V key) — Earth's
                fastest vehicle for rapid exploration. */}
            <button
              onClick={() => {
                if (carUi.out) dismissCar();
                else summonCar();
              }}
              className="w-full py-2 text-[10px] font-bold tracking-[0.2em] uppercase text-amber-200 border border-amber-600/60 bg-amber-950/50 rounded hover:border-amber-400 hover:text-white transition-all"
            >
              {carUi.out ? '✕ Dismiss supercar' : '🏎 Summon supercar'} <span className="text-zinc-500 normal-case tracking-normal">(V · F to ride)</span>
            </button>
            {carUi.out && (
              <button
                onClick={() => toggleCarMount()}
                className="w-full py-2 text-[10px] font-bold tracking-[0.2em] uppercase text-zinc-100 border border-zinc-500/60 bg-zinc-900/70 rounded hover:border-amber-400 hover:text-white transition-all"
              >
                {carUi.mounted ? '⏏ Dismount supercar' : '🏎 Ride supercar'}
              </button>
            )}
            {/* Quicksand-pit hint (video QA V2-5): shown near
                Redwater, where the gold-beam marker stands. */}
            {focus && Math.abs(focus.lat - 53.9486) < 0.6 && Math.abs(focus.lon + 113.1067) < 0.6 && (
              <div className="text-[10px] text-amber-200/90">
                ⛏ Quicksand pit nearby — look for the gold beam ~100 m east of Redwater centre. Walk into it to sink.
              </div>
            )}
            {/* Size state (polled from the parachute singleton like
                the bike state above): which size world am I in? */}
            <div className={`text-[10px] mt-1 ${sizeUi.micro ? 'text-violet-300' : 'text-zinc-500'}`}>
              {sizeUi.micro
                ? '🔬 Quantum Realm — Ant-Man scale · you are micrometres tall · third person locked'
                : 'Size — normal view'}
            </div>
            {/* Size: Normal View vs Quantum Realm. The Quantum door
                stands at street level ALWAYS (Merlin, 2026-10-20:
                "the quantum realm isn't showing up" — the button
                used to exist only when a tile had been selected in
                the aerial view, so at street level there was no
                door at all). With a tile selected it drops there;
                without one it shrinks HERE, into the tile under
                the walker's feet — same parachuteTo path either
                way (beginRoam + beginParachuteDive in page.jsx).
                QUANTUM OFF (Merlin, 2026-10-22, "for now"): the
                door is hidden while QUANTUM_ENABLED is false
                (lib/earth/quantum.js) and parachuteTo refuses the
                shrink besides; Normal View stays — it is the
                harmless way back and a no-op at normal scale. */}
            <div className={QUANTUM_ENABLED ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-1 gap-2'}>
              <button
                onClick={() => beginReanimate()}
                className="py-2 text-[10px] font-bold tracking-[0.15em] uppercase text-amber-200 border border-amber-600/60 bg-amber-950/50 rounded hover:border-amber-400 hover:text-white transition-all"
              >
                ✦ Normal View
              </button>
              {QUANTUM_ENABLED && onDropToTile && (
                <button
                  onClick={() => onDropToTile(selectedTile || { lat: roamState.lat, lon: roamState.lon })}
                  className="py-2 text-[10px] font-bold tracking-[0.15em] uppercase text-cyan-200 border border-cyan-600/60 bg-cyan-950/50 rounded hover:border-cyan-400 hover:text-white transition-all animate-pulse"
                >
                  🔬 Quantum Realm
                </button>
              )}
            </div>
            {/* Character selection — in the menu, not floating */}
            <div className="mt-1">
              <div className="text-[9px] font-bold tracking-[0.2em] uppercase text-zinc-500 mb-1">Character</div>
              <CharacterPicker
                embedded
                surface="earth"
                accent="#00f2ff"
                // Earth never falls back to the capsule (video QA
                // V2-1): a null pick here means "no override, no
                // profile", which is exactly when EarthWalker
                // spawns the Earth default — so hand the adapter
                // that default instead of null.
                onPick={(id) => getEmbodimentForSurface('earth')?.setCharacter(id || EARTH_DEFAULT_CHARACTER_ID)}
              />
            </div>
          </>
        )}
        {canWalk && spawns && spawns.length > 0 && (
          <div className="flex flex-col gap-1">
            <div className="text-[9px] font-bold tracking-[0.25em] uppercase text-zinc-500">
              Walk at a landmark
            </div>
            <div className="flex flex-col gap-1">
              {spawns.map((s) => (
                <button
                  key={s.id}
                  disabled={busy}
                  onClick={() => onSpawnPick({ lat: s.lat, lon: s.lon, label: s.name })}
                  className="text-left text-[12px] px-2 py-1.5 rounded bg-zinc-900/60 hover:bg-cyan-950/60 border border-zinc-800 hover:border-cyan-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span aria-hidden="true" className="text-cyan-500 mr-1">→</span>
                  {s.name} <span className="text-zinc-500">· {formatCoords(s.lat, s.lon)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={onReturn}
          disabled={busy}
          className="w-full py-2 text-[10px] font-bold tracking-[0.2em] uppercase text-zinc-300 border border-zinc-700 rounded hover:border-cyan-500/50 hover:text-white transition-all disabled:opacity-50"
        >
          {t('earth.returnToOrbit')}
        </button>
        </div>
      </div>
    </div>
    {atStreet && bikeUi.out && (
      <BikeControls mounted={bikeUi.mounted} controlsRef={controlsRef} />
    )}
    <EarthViewToggle phase={phase} />
    </>
  );
}

// BikeControls — the bike's VISIBLE controls (Merlin, 2026-10-20: "The
// thrust controls for the bike and steering joystick are not seen").
// Before this, Earth riding relied on the invisible touch-anywhere
// joystick and keyboard keys that don't exist on a phone. Now, while
// the bike is out, a persistent glass control cluster is on screen:
//   - left: a steering + thrust stick (push up = thrust, left/right
//     = steer) writing the same moveX/moveY channels everything uses
//   - right: hold-to-press BOOST, RISE ▲ and SINK ▼ buttons writing
//     bikeBoost / bikeUp / bikeDown into the shared controls object
//     (EarthBike reads them alongside the keyboard)
//   - a RIDE / DISMOUNT button so touch users can get on and off
// Premium glass styling, big targets — a 7-year-old can ride it.
// Memoized (round 4, defect 6): the console re-renders on every
// 250 ms state poll, but the control clusters' inputs are stable
// refs and rounded numbers — memo keeps their DOM (and the
// browser's paint of everything near them) out of card re-renders.
const BikeControls = memo(function BikeControls({ mounted, controlsRef }) {
  const padRef = useRef(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [held, setHeld] = useState({ boost: false, up: false, down: false });

  const writeStick = (dx, dy) => {
    if (!controlsRef?.current) return;
    const max = 38;
    const len = Math.hypot(dx, dy);
    const cl = len > max ? max / len : 1;
    const x = dx * cl;
    const y = dy * cl;
    setKnob({ x, y });
    controlsRef.current.moveX = x / max;
    controlsRef.current.moveY = y / max;
  };
  const releaseStick = () => {
    setKnob({ x: 0, y: 0 });
    if (controlsRef?.current) {
      controlsRef.current.moveX = 0;
      controlsRef.current.moveY = 0;
    }
  };
  const padPoint = (e) => {
    const r = padRef.current.getBoundingClientRect();
    return { dx: e.clientX - (r.left + r.width / 2), dy: e.clientY - (r.top + r.height / 2) };
  };
  const setFlag = (name, on) => {
    setHeld((h) => ({ ...h, [name]: on }));
    if (controlsRef?.current) {
      if (name === 'boost') controlsRef.current.bikeBoost = on;
      if (name === 'up') controlsRef.current.bikeUp = on;
      if (name === 'down') controlsRef.current.bikeDown = on;
    }
  };
  const holdProps = (name) => ({
    onPointerDown: (e) => { e.preventDefault(); setFlag(name, true); },
    onPointerUp: () => setFlag(name, false),
    onPointerLeave: () => setFlag(name, false),
    onPointerCancel: () => setFlag(name, false),
    onContextMenu: (e) => e.preventDefault(),
  });
  const btnBase = 'ui-element pointer-events-auto select-none touch-none flex items-center justify-center rounded-full border backdrop-blur-md font-black transition-all active:scale-95';

  return (
    <>
      {/* Steering + thrust stick */}
      <div
        className="fixed z-[70] ui-element"
        style={{ left: 'calc(env(safe-area-inset-left, 0px) + 18px)', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 92px)' }}
      >
        <div
          ref={padRef}
          role="application"
          aria-label="Bike steering and thrust joystick"
          className="ui-element pointer-events-auto relative w-28 h-28 rounded-full border-2 border-teal-400/50 bg-zinc-950/60 shadow-[0_0_30px_rgba(0,255,204,0.25)] backdrop-blur-md touch-none select-none"
          onPointerDown={(e) => { e.preventDefault(); padRef.current.setPointerCapture(e.pointerId); const p = padPoint(e); writeStick(p.dx, p.dy); }}
          onPointerMove={(e) => { if (e.buttons > 0) { const p = padPoint(e); writeStick(p.dx, p.dy); } }}
          onPointerUp={releaseStick}
          onPointerCancel={releaseStick}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="absolute inset-0 flex items-center justify-center text-teal-300/50 text-[9px] font-black tracking-[0.2em] pointer-events-none">THRUST</div>
          <div
            className="absolute left-1/2 top-1/2 w-12 h-12 -ml-6 -mt-6 rounded-full bg-teal-400/85 shadow-[0_0_18px_rgba(0,255,204,0.7)] pointer-events-none"
            style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}
          />
        </div>
      </div>

      {/* Boost / rise / sink + mount toggle */}
      <div
        className="fixed z-[70] ui-element flex flex-col items-end gap-2.5"
        style={{ right: 'calc(env(safe-area-inset-right, 0px) + 18px)', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 92px)' }}
      >
        <button
          type="button"
          onClick={() => toggleMount()}
          className={`${btnBase} px-4 h-10 text-[10px] tracking-[0.18em] uppercase text-zinc-100 border-zinc-500/60 bg-zinc-900/70`}
        >
          {mounted ? '⏏ Dismount' : '🏍 Ride bike'}
        </button>
        {mounted && (
          <>
            <button
              type="button"
              aria-label="Rise"
              {...holdProps('up')}
              className={`${btnBase} w-14 h-14 text-xl text-cyan-100 border-cyan-400/60 ${held.up ? 'bg-cyan-500/60' : 'bg-cyan-950/60'} shadow-[0_0_20px_rgba(0,242,255,0.3)]`}
            >
              ▲
            </button>
            <button
              type="button"
              aria-label="Boost"
              {...holdProps('boost')}
              className={`${btnBase} w-[4.5rem] h-[4.5rem] text-[10px] tracking-[0.15em] text-amber-100 border-amber-400/70 ${held.boost ? 'bg-amber-500/60' : 'bg-amber-950/60'} shadow-[0_0_24px_rgba(255,180,0,0.35)]`}
            >
              BOOST
            </button>
            <button
              type="button"
              aria-label="Sink"
              {...holdProps('down')}
              className={`${btnBase} w-14 h-14 text-xl text-cyan-100 border-cyan-400/60 ${held.down ? 'bg-cyan-500/60' : 'bg-cyan-950/60'} shadow-[0_0_20px_rgba(0,242,255,0.3)]`}
            >
              ▼
            </button>
          </>
        )}
      </div>
    </>
  );
});

// SwimControls REMOVED 2026-10-26 (Earth 1 water removal):
// Earth 1 has no water, so there are no dive/surface buttons and
// no swimming readout. The walker walks the exposed seabed at
// normal pace; nothing replaces these controls.
