'use client';
// components/EarthConsole.jsx — the Earth 1 IN-DRIVE HUD.
//
// VEHICLES ONLY (Merlin, 2026-11-15): Earth 1 has no walker,
// no on-foot mode, no characters, no landmarks, no search, no
// quick locations, no craft picker, no team panel. This console
// is the driving HUD only: speed, boost state, torpedo count +
// FIRE, notices, and the Overlook / Drive / Leave Earth
// controls. Everything the old console carried that served the
// walker is gone: the search + quick locations, "Street level
// — walk here", the craft picker + car buttons (V summon / F
// ride / dismiss / swap), CharacterPicker, EarthExtensionPicker,
// EarthTeamPanel, the "Walk at a landmark" spawns list, the
// quicksand hint, BikeControls (bottom-right stick, bottom-left
// BOOST/▲/▼, RIDE/DISMOUNT), and the minimized globe-tab branch
// that hid the drive controls. SwimControls REMOVED 2026-10-26
// (water removed). The page joystick still steers
// the car (app/page.jsx); the HUD owns only the fire button.
//
// FIRE (Mario Kart, lib/earth/kart.js): one tap = one missile
// spent (one orb = one missile). The button is a 64 px tap
// target beside the torpedo count, disabled/greyed at 0. The F
// key fires too. The count is polled from kartHud on the same
// 250 ms beat the old console polled bikeState/carState on —
// the fire call mutates the kart singleton outside React, so
// the HUD polls, never guesses.
//
// NOTICES: the boost-pad flash ("⚡ BOOST!", lib/earth/
// boost-pads.js) and the kart notices ("🎯 +1 TORPEDO",
// "🚀 TORPEDO!", "💥 BOOM!", lib/earth/kart.js) share one
// centre pill each — both polled on the same beat.

import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { formatCoords } from '@/lib/geo';
import EarthViewToggle from '@/components/EarthViewToggle';
import { readBoostNotice } from '@/lib/earth/boost-pads';
import { planetSeedFor } from '@/lib/planets/planet-seeds';
import {
  kartHud,
  readKartNotice,
  fireFromHud,
} from '@/lib/earth/kart';

const MIN_KEY = 'earth-console-minimized';

// Earth's canonical seed (lib/planets/planet-seeds.js) — DISPLAY
// ONLY. Earth is special: its seed is descriptive harmony, and
// nothing in the Earth dive/roam path reads it to regenerate or
// alter terrain or behavior. It is shown here so the hub's Earth
// carries its seed name like every other world.
const EARTH_SEED_ENTRY = planetSeedFor('earth');

export default function EarthConsole({ focus, phase, onReturn, onStreet, onAscend }) {
  const { t } = useI18n();
  // HUD state is POLLED from the kart singleton: the fire call,
  // the drive loop, and the orb/pad writers all mutate it
  // outside React, so a local useState set only by the button
  // would desync. Polling keeps every surface honest.
  const [hud, setHud] = useState({ speedKmh: 0, boostActive: false, missiles: 0, hitPhase: 'none' });
  const [boostFlash, setBoostFlash] = useState('');
  const [kartNotice, setKartNotice] = useState('');
  const [minimized, setMinimized] = useState(() => {
    try { return localStorage.getItem(MIN_KEY) === '1'; } catch { return false; }
  });

  const setMin = (v) => {
    setMinimized(v);
    try { localStorage.setItem(MIN_KEY, v ? '1' : '0'); } catch {}
  };

  useEffect(() => {
    const id = setInterval(() => {
      setHud((prev) => {
        const next = {
          speedKmh: Math.round(kartHud.speedKmh || 0),
          boostActive: !!kartHud.boostActive,
          missiles: kartHud.missiles || 0,
          hitPhase: kartHud.hitPhase || 'none',
        };
        return prev.speedKmh === next.speedKmh
          && prev.boostActive === next.boostActive
          && prev.missiles === next.missiles
          && prev.hitPhase === next.hitPhase ? prev : next;
      });
      setBoostFlash((prev) => {
        const next = readBoostNotice(performance.now());
        return prev === next ? prev : next;
      });
      setKartNotice((prev) => {
        const next = readKartNotice(performance.now());
        return prev === next ? prev : next;
      });
    }, 250);
    return () => clearInterval(id);
  }, []);

  // F fires a torpedo (the FIRE button's keyboard twin).
  useEffect(() => {
    const down = (e) => {
      if (e.repeat) return;
      if (e.key.toLowerCase() === 'f') fireFromHud();
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, []);

  const busy = phase === 'diving_to_earth' || phase === 'earth_travel' || phase === 'diving_to_street';
  const atStreet = phase === 'earth_roam';
  const atSurface = phase === 'earth_surface';

  const notice = kartNotice !== '' ? kartNotice : boostFlash;

  return (
    <>
      {/* Top card — compact, collapsible to a globe tab. The
          drive cluster below (speed / FIRE) never collapses:
          the HUD must stay visible while driving. */}
      {minimized ? (
        <button
          onClick={() => setMin(false)}
          aria-label={busy ? 'Open Earth console (traveling)' : 'Open Earth console'}
          title={t('earth.consoleTitle')}
          className={`absolute right-4 top-[32%] z-[80] w-14 h-14 rounded-full bg-zinc-950/90 border border-cyan-500/50 shadow-[0_0_25px_rgba(0,242,255,0.25)] backdrop-blur-md flex items-center justify-center text-2xl hover:scale-105 active:scale-95 transition-all ui-element pointer-events-auto ${busy ? 'animate-pulse' : ''}`}
        >
          <span aria-hidden="true">🌍</span>
        </button>
      ) : (
        <div className="absolute right-4 top-4 z-[80] w-[min(92vw,17rem)] rounded-xl border border-cyan-500/30 bg-zinc-950/95 p-3 shadow-[0_0_30px_rgba(0,242,255,0.12)] ui-element pointer-events-auto">
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
                : phase === 'diving_to_street' ? 'Descending to street level…'
                : t('earth.locating')}
            </div>
          )}
          {/* The mapped-coverage sync readout is gone with the
              mapping system (Merlin, 2026-11-15: the map goes
              away completely) — no pill, no percentage, no
              tracking. */}
          {atStreet && (
            <button
              onClick={onAscend}
              className="mt-2 w-full py-2 text-[10px] font-bold tracking-[0.2em] uppercase text-zinc-300 border border-zinc-700 rounded hover:border-cyan-500/50 hover:text-white transition-all"
            >
              ⤒ Overlook
            </button>
          )}
          {atSurface && (
            <button
              onClick={onStreet}
              disabled={busy || !focus}
              className="mt-2 w-full py-2 text-[10px] font-bold tracking-[0.2em] uppercase text-cyan-200 border border-cyan-600/60 bg-cyan-950/50 rounded hover:border-cyan-400 hover:text-white transition-all disabled:opacity-50"
            >
              ⤓ Drive
            </button>
          )}
          <button
            onClick={onReturn}
            disabled={busy}
            className="mt-2 w-full py-2 text-[10px] font-bold tracking-[0.2em] uppercase text-zinc-300 border border-zinc-700 rounded hover:border-cyan-500/50 hover:text-white transition-all disabled:opacity-50"
          >
            ← {t('earth.returnToOrbit')}
          </button>
        </div>
      )}

      {/* Drive cluster — always on screen while driving:
          speed + boost bottom-left, torpedo count + FIRE
          bottom-right. The FIRE button is a 64 px tap target,
          disabled/greyed at 0 missiles. */}
      {atStreet && (
        <>
          <div
            className="fixed z-[70] ui-element flex flex-col items-start gap-1.5 pointer-events-none"
            style={{ left: 'calc(env(safe-area-inset-left, 0px) + 18px)', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 92px)' }}
          >
            <div className="rounded-xl border border-cyan-500/40 bg-zinc-950/80 px-4 py-2 backdrop-blur-md">
              <div className="text-2xl font-black tabular-nums text-white leading-none">
                {hud.speedKmh}
                <span className="text-xs font-bold text-zinc-400 ml-1">km/h</span>
              </div>
              {hud.boostActive && (
                <div className="text-[10px] font-black tracking-[0.25em] text-cyan-300 mt-1">⚡ BOOST</div>
              )}
              {hud.hitPhase !== 'none' && (
                <div className="text-[10px] font-black tracking-[0.25em] text-red-400 mt-1">💥 HIT!</div>
              )}
            </div>
          </div>
          {/* FIRE sits ABOVE the drive stick: the page's drive
              stick owns bottom-right at 92px (112px tall, so
              92–204px from the bottom); the FIRE cluster rides
              at 216px so the two never overlap. VERTICAL STACK
              (Merlin, 2026-11-15): the rocket pill sits where
              the FIRE button was, and FIRE sits below the
              rocket pill — a right-edge column, not a row. */}
          <div
            className="fixed z-[70] ui-element flex flex-col items-end gap-2 pointer-events-none"
            style={{ right: 'calc(env(safe-area-inset-right, 0px) + 18px)', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 216px)' }}
          >
            <div className="rounded-full border border-amber-500/50 bg-zinc-950/80 px-3 py-2 text-sm font-black tabular-nums text-amber-100 backdrop-blur-md">
              🚀 ×{hud.missiles}
            </div>
            <button
              type="button"
              onClick={() => fireFromHud()}
              disabled={hud.missiles <= 0}
              aria-label="Fire torpedo"
              title={hud.missiles > 0 ? 'Fire torpedo (F)' : 'No torpedoes — drive through an orb'}
              className={`pointer-events-auto flex h-16 w-16 items-center justify-center rounded-full border-2 font-black tracking-wide backdrop-blur-md transition-all active:scale-95 ${
                hud.missiles > 0
                  ? 'border-red-400/80 bg-red-950/80 text-red-100 shadow-[0_0_24px_rgba(255,60,60,0.45)] hover:scale-105'
                  : 'border-zinc-700 bg-zinc-900/70 text-zinc-500 cursor-not-allowed opacity-50'
              }`}
            >
              FIRE
            </button>
          </div>
        </>
      )}

      {/* Notices — kart notices take the pill over the pad flash
          while either is live. */}
      {notice !== '' && (
        <div aria-live="polite" className="fixed left-1/2 top-[22%] z-[85] -translate-x-1/2 rounded-full border border-cyan-300/70 bg-cyan-950/80 px-5 py-2 text-sm font-black tracking-[0.25em] text-cyan-100 shadow-[0_0_30px_rgba(0,255,204,0.5)] ui-element pointer-events-none">
          {notice}
        </div>
      )}
      <EarthViewToggle phase={phase} />
    </>
  );
}
