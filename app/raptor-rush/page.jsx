'use client';


// Menu Art Transfer batch 2 — submenu art. Background image + dark legibility
// scrim; a missing image hides itself via onError so the card falls back to
// its plain style. Never breaks the UI.
function SubmenuArt({ slot }) {
  return (
    <>
      <img
        src={submenuArtFor(slot)}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        loading="lazy"
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
      />
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-black/55" />
    </>
  );
}

// Raptor Rush — vertical dead-ahead canyon runner. Steer left/right to eat
// rabbits and dodge rock. Solo hunt: 3 hits ends the run, best saved on this
// device. OASIS party: timed PvP matches in real rooms — everyone runs their
// own track at once, rabbits spawn increasingly more and obstacles get harder
// as the match progresses, high score wins.

import { useCallback, useEffect, useRef, useState } from 'react';
import { submenuArtFor } from '@/lib/god-menus';
import { BackButton } from '@/components/ui';
import {
  createGame,
  startGame,
  update,
  steerTo,
  nudge,
  distanceMeters,
  timeLeft,
  escalationAt,
  WORLD_W,
  WORLD_H,
} from './game';
import { createRenderer } from './render';
import {
  fetchTopScores,
  fetchRoomScores,
  submitScore,
  sanitizeName,
} from '@/lib/raptor-rush/storage';
import OasisLobby from '@/components/oasis/Lobby';
import { supabase } from '@/lib/supabase';
import { fx, unlockFx } from '@/lib/fx';

const BEST_KEY = 'raptor_rush_best';
const NAME_KEY = 'raptor_rush_name';

export default function RaptorRushPage() {
  const canvasRef = useRef(null);
  const gameRef = useRef(null);
  const rafRef = useRef(0);
  const lastRef = useRef(0);
  const hudTimerRef = useRef(0);
  const reducedMotionRef = useRef(false);
  const bestRef = useRef(0);
  const phaseRef = useRef('ready');
  const modeRef = useRef('solo'); // solo | party
  const matchRef = useRef(null); // { kind:'party', roomCode }
  // Previous-frame values for FX event edges (coin / hit / checkpoint / death).
  const fxPrevRef = useRef({ prey: 0, hearts: 3, level: 0 });

  const [screen, setScreen] = useState('menu'); // menu | game
  const [phase, setPhase] = useState('ready'); // ready | running | over
  const [score, setScore] = useState(0);
  const [prey, setPrey] = useState(0);
  const [meters, setMeters] = useState(0);
  const [hearts, setHearts] = useState(3);
  const [best, setBest] = useState(0);
  const [newBest, setNewBest] = useState(false);
  const [timeUp, setTimeUp] = useState(false);
  const [clock, setClock] = useState(null);
  const [intensity, setIntensity] = useState(0);
  const [oasisOpen, setOasisOpen] = useState(false);
  const [match, setMatch] = useState(null);
  const [partyNotice, setPartyNotice] = useState('');
  const [userId, setUserId] = useState(null);
  const [callsign, setCallsign] = useState('');
  const [cloudUp, setCloudUp] = useState(false);
  const [topScores, setTopScores] = useState([]);
  const [scoresNote, setScoresNote] = useState('');
  const [roomScores, setRoomScores] = useState([]);
  const [roomNote, setRoomNote] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveNote, setSaveNote] = useState('');

  const syncHud = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    setScore(g.score);
    setPrey(g.prey);
    setMeters(distanceMeters(g));
    setHearts(g.hearts);
    setClock(timeLeft(g));
    const level = escalationAt(g.time).level;
    setIntensity(level);
    // --- game-feel FX edges -----------------------------------------------
    const prev = fxPrevRef.current;
    if (g.prey > prev.prey) fx.coin(); // rabbit eaten: bright pickup chirp
    const died = g.hearts <= 0 && prev.hearts > 0;
    if (g.hearts < prev.hearts && !died) fx.hit(); // rock hit: dull thud
    if (level > prev.level) fx.checkpoint(); // escalation level up: soft chime
    fxPrevRef.current = { prey: g.prey, hearts: g.hearts, level };
    if (g.phase !== phaseRef.current) {
      phaseRef.current = g.phase;
      setPhase(g.phase);
      if (g.phase === 'over') {
        setTimeUp(!!g.timedOut);
        if (g.timedOut) fx.gameWin(); // party match ended on the clock: fanfare
        else fx.death(); // 3 hits: the hunt is over
        if (g.score > bestRef.current) {
          bestRef.current = g.score;
          setBest(g.score);
          setNewBest(true);
          try { localStorage.setItem(BEST_KEY, String(g.score)); } catch { /* ignore */ }
        }
      }
    }
  }, []);

  const begin = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    fx.tap(); // run confirmed
    fxPrevRef.current = { prey: 0, hearts: 3, level: 0 };
    setNewBest(false);
    setSaved(false);
    setSaveNote('');
    setRoomScores([]);
    setRoomNote('');
    startGame(g, { mode: modeRef.current });
    phaseRef.current = 'running';
    setPhase('running');
    syncHud();
  }, [syncHud]);

  const startRun = useCallback((mode, partyRoom) => {
    fx.tap(); // mode confirmed
    modeRef.current = mode;
    matchRef.current = partyRoom || null;
    setMatch(partyRoom || null);
    setScreen('game');
    // Defer begin so the canvas mounts first.
    setTimeout(() => begin(), 0);
  }, [begin]);

  const quitToMenu = useCallback(() => {
    setScreen('menu');
    setMatch(null);
    matchRef.current = null;
    setPhase('ready');
    phaseRef.current = 'ready';
    gameRef.current = createGame(Date.now() >>> 0, { mode: 'solo' });
  }, []);

  // Session: guests play solo; host/join need sign-in (the lobby enforces it).
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        setCloudUp(true);
        const u = data?.user;
        if (u) {
          setUserId(u.id);
          const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(NAME_KEY) : '';
          setCallsign(sanitizeName(stored) || 'HUNTER');
        }
      } catch { /* guest play still works */ }
    })();
    try {
      bestRef.current = Number(localStorage.getItem(BEST_KEY) || 0) || 0;
      setBest(bestRef.current);
      setPlayerName(localStorage.getItem(NAME_KEY) || '');
    } catch { /* ignore */ }
    // FX system: unlock sound+haptics on the first gesture (deep links may
    // land here without passing through the hub).
    const unlock = () => unlockFx();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  // ?code= deep link opens the lobby once the cloud is reachable.
  useEffect(() => {
    if (!cloudUp || typeof window === 'undefined') return;
    const code = new URLSearchParams(window.location.search).get('code');
    if (code && code.length >= 5) setOasisOpen(true);
  }, [cloudUp]);

  // Leaderboard on the menu.
  useEffect(() => {
    if (screen !== 'menu') return;
    fetchTopScores(10).then(({ scores, error, missing }) => {
      setTopScores(scores);
      if (error) {
        setScoresNote(missing
          ? 'The shared scoreboard is coming soon — your best is saved on this device.'
          : 'Scores are unavailable right now.');
      } else {
        setScoresNote('');
      }
    });
  }, [screen]);

  // Map a client X to world X (the renderer letterboxes with "cover" fit).
  const clientToWorldX = useCallback((clientX) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const s = Math.max(rect.width / WORLD_W, rect.height / WORLD_H);
    const offX = (rect.width - WORLD_W * s) / 2;
    return (clientX - rect.left - offX) / s;
  }, []);

  const doSteer = useCallback((clientX) => {
    const wx = clientToWorldX(clientX);
    if (wx != null && gameRef.current) steerTo(gameRef.current, wx);
  }, [clientToWorldX]);

  useEffect(() => {
    gameRef.current = createGame(Date.now() >>> 0, { mode: 'solo' });
    reducedMotionRef.current =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const canvas = canvasRef.current;
    const renderer = createRenderer(canvas, { reducedMotion: reducedMotionRef.current });
    renderer.resize();

    const onResize = () => renderer.resize();
    window.addEventListener('resize', onResize);

    const onKey = (e) => {
      if (e.repeat) return;
      const g = gameRef.current;
      if (!g) return;
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        e.preventDefault();
        if (g.phase === 'running') nudge(g, -1);
      } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        e.preventDefault();
        if (g.phase === 'running') nudge(g, 1);
      } else if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Enter') {
        e.preventDefault();
        if (g.phase !== 'running') begin();
      }
    };
    window.addEventListener('keydown', onKey);

    // Touch/mouse: drag to steer, tap to start.
    let dragging = false;
    let downAt = 0;
    const onPointerDown = (e) => {
      dragging = true;
      downAt = Date.now();
      if (gameRef.current?.phase === 'running') doSteer(e.clientX);
    };
    const onPointerMove = (e) => {
      if (dragging && gameRef.current?.phase === 'running') doSteer(e.clientX);
    };
    const onPointerUp = (e) => {
      const quick = Date.now() - downAt < 300;
      dragging = false;
      if (quick && gameRef.current?.phase !== 'running') begin();
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    lastRef.current = performance.now();
    const loop = (now) => {
      const dt = (now - lastRef.current) / 1000;
      lastRef.current = now;
      const g = gameRef.current;
      if (g && g.phase === 'running') {
        update(g, dt);
        hudTimerRef.current += dt;
        if (hudTimerRef.current > 0.12) {
          hudTimerRef.current = 0;
          syncHud();
        }
        if (g.phase !== 'running') syncHud();
      }
      if (g && screen === 'game') renderer.draw(g, dt);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKey);
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      renderer.dispose();
    };
  }, [doSteer, begin, syncHud, screen]);

  // OASIS: party rooms are real hunters only — a host that starts with just
  // themselves waits for a real rival; quick match is a plain solo hunt.
  const handleOasisLaunch = useCallback(({ mode, room, roster }) => {
    if (mode === 'pvp') {
      const humans = (roster || []).filter((s) => s.kind === 'human');
      if (humans.length < 2) {
        setPartyNotice('Waiting for a real rival — share your hunt code, then start again when someone joins.');
        setTimeout(() => setPartyNotice(''), 6000);
        return; // lobby stays open
      }
      setOasisOpen(false);
      setPartyNotice('');
      startRun('party', { kind: 'party', roomCode: room?.room_code });
      return;
    }
    // Quick match / boss: solo hunt, honestly — no CPU rivals in Raptor Rush.
    setOasisOpen(false);
    startRun('solo', null);
  }, [startRun]);

  const handleSave = useCallback(async () => {
    const g = gameRef.current;
    if (!g || saving || saved) return;
    setSaving(true);
    const name = sanitizeName(playerName);
    try { localStorage.setItem(NAME_KEY, name); } catch { /* ignore */ }
    setCallsign(name);
    const { ok, missing } = await submitScore({
      playerName: name,
      score: g.score,
      rabbits: g.prey,
      mode: match?.kind === 'party' ? 'party' : 'solo',
      roomCode: match?.kind === 'party' ? match.roomCode : undefined,
    });
    setSaving(false);
    if (ok) {
      setSaved(true);
    } else {
      setSaveNote(missing
        ? 'The shared scoreboard is coming soon — your best is saved on this device.'
        : 'Could not save — try again.');
    }
  }, [saving, saved, playerName, match]);

  // Party room leaderboard: poll while the game-over screen is up.
  useEffect(() => {
    if (match?.kind !== 'party' || phase !== 'over' || screen !== 'game') return;
    let alive = true;
    const load = async () => {
      const { scores, error, missing } = await fetchRoomScores(match.roomCode);
      if (!alive) return;
      setRoomScores(scores);
      setRoomNote(error
        ? (missing ? 'The party board is coming soon — scores land on this device for now.' : 'Party board unavailable right now.')
        : '');
    };
    load();
    const t = setInterval(load, 2000);
    return () => { alive = false; clearInterval(t); };
  }, [match, phase, screen]);

  const heartRow = '❤'.repeat(Math.max(hearts, 0)) + '🖤'.repeat(Math.max(3 - hearts, 0));
  const isParty = match?.kind === 'party';

  if (screen === 'menu') {
    return (
      <main className="fixed inset-0 w-screen h-[100dvh] bg-black overflow-y-auto select-none">
        <div className="min-h-full flex flex-col items-center justify-center px-6 py-10 text-center max-w-md mx-auto">
          <div className="text-[10px] tracking-[0.5em] text-emerald-500 uppercase mb-2">The canyon runs dead ahead</div>
          <h1 className="text-5xl font-black tracking-[0.12em] uppercase text-white">
            Raptor<span className="text-emerald-400">Rush</span>
          </h1>
          <p className="text-zinc-400 tracking-[0.25em] uppercase text-xs mt-2">
            Eat rabbits · Dodge rock · High score wins
          </p>
          <div className="text-amber-300 text-sm tracking-widest mt-3">BEST {best}</div>

          <div className="w-full flex flex-col gap-3 mt-8">
            <button
              onClick={() => startRun('solo', null)}
              className="relative overflow-hidden px-6 py-5 rounded border border-emerald-400/60 bg-emerald-500/15 hover:bg-emerald-500/30 transition-all text-left min-h-[44px]"
            >
              <SubmenuArt slot="submenu-prog-raptor-rush-solo-hunt" />
              <div className="relative text-lg font-black tracking-[0.2em] uppercase text-emerald-100">Solo hunt</div>
              <div className="relative text-xs text-zinc-400 tracking-widest uppercase mt-1">Endless canyon · 3 hits and the hunt is over</div>
            </button>
            <button
              onClick={() => setOasisOpen(true)}
              className="relative overflow-hidden px-6 py-5 rounded border border-amber-400/60 bg-amber-500/15 hover:bg-amber-500/30 transition-all text-left min-h-[44px]"
            >
              <SubmenuArt slot="submenu-prog-raptor-rush-pvp-party-hunt" />
              <div className="relative text-lg font-black tracking-[0.2em] uppercase text-amber-100">PvP party hunt</div>
              <div className="relative text-xs text-zinc-400 tracking-widest uppercase mt-1">Timed match · Real rooms · Rabbits keep coming · High score wins</div>
            </button>
          </div>

          <div className="w-full mt-8 text-left text-sm text-zinc-300 bg-black/40 border border-zinc-800 rounded p-4 space-y-2">
            <p><span className="text-emerald-300 font-bold">Steer.</span> Drag left and right — the raptor follows your finger. On desktop: ←/→ or A/D.</p>
            <p><span className="text-emerald-300 font-bold">Eat.</span> Run into rabbits to gobble them — each one is worth 25 points.</p>
            <p><span className="text-emerald-300 font-bold">Dodge.</span> Rock spires, boulders, and drifting rockfall cost you a heart. Three hits ends the hunt.</p>
            <p><span className="text-emerald-300 font-bold">Party.</span> Timed matches: the longer it runs, the more rabbits spawn and the harder the rocks get.</p>
          </div>

          <div className="w-full mt-8">
            <div className="text-[10px] tracking-[0.4em] text-zinc-500 uppercase mb-3">Top hunters</div>
            {scoresNote && <p className="text-zinc-600 text-xs">{scoresNote}</p>}
            {!scoresNote && topScores.length === 0 && (
              <p className="text-zinc-600 text-sm">No scores yet — be the first!</p>
            )}
            <div className="flex flex-col gap-1.5">
              {topScores.map((s, i) => (
                <div key={s.id} className="flex items-center justify-between px-4 py-2 bg-black/40 border border-zinc-800 rounded text-sm">
                  <span className="text-zinc-500 font-bold w-8">#{i + 1}</span>
                  <span className="flex-1 text-left text-zinc-200 tracking-widest uppercase truncate">
                    {s.player_name}
                    <span className="ml-2 text-zinc-500 text-xs">🐇 {s.rabbits ?? 0}</span>
                  </span>
                  <span className="text-emerald-300 font-black">{s.score}</span>
                </div>
              ))}
            </div>
          </div>

          <BackButton label="Back to the launcher" />
          <div aria-hidden="true" className="player-clear" />
        </div>

        {/* OASIS lobby (host/join need sign-in; guests get the disabled buttons) */}
        {oasisOpen && (
          <div className="fixed inset-0 z-50">
            <OasisLobby
              gameSlug="raptor-rush"
              supabase={supabase}
              userId={userId}
              callsign={callsign}
              onLaunch={handleOasisLaunch}
              onExit={() => setOasisOpen(false)}
            />
          </div>
        )}

        {/* Party notice toast */}
        {partyNotice && (
          <div className="fixed z-[60] bottom-8 inset-x-0 flex justify-center px-6 pointer-events-none">
            <div className="bg-amber-950/95 border border-amber-500/60 text-amber-100 text-sm px-5 py-3 rounded-lg max-w-sm text-center">
              {partyNotice}
            </div>
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="fixed inset-0 w-screen h-[100dvh] bg-black overflow-hidden select-none">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full touch-none" />

      {/* HUD */}
      <div className="absolute top-0 left-0 right-0 flex items-start justify-between px-5 pt-4 pointer-events-none">
        <div className="text-left">
          <div className="text-cyan-300 font-bold text-xl tracking-widest" style={{ textShadow: '0 0 12px #00f2ff' }}>
            SCORE {score}
          </div>
          <div className="text-emerald-300 text-sm tracking-widest mt-1">RABBITS {prey}</div>
        </div>
        <div className="text-center">
          <div className="text-2xl tracking-widest" aria-label={`${hearts} hearts left`}>{heartRow}</div>
          {isParty && (
            <div className={`text-xs font-black tracking-widest mt-1 ${intensity > 0 ? 'text-orange-400 animate-pulse' : 'text-zinc-500'}`}>
              INTENSITY LV {intensity}
            </div>
          )}
        </div>
        <div className="text-right">
          {isParty ? (
            <>
              <div className={`font-bold text-xl tracking-widest ${clock != null && clock <= 10 ? 'text-red-400 animate-pulse' : 'text-amber-300'}`}
                style={{ textShadow: '0 0 12px #ffd700' }}>
                {clock != null ? `${Math.floor(clock / 60)}:${String(clock % 60).padStart(2, '0')}` : '—'}
              </div>
              <div className="text-zinc-400 text-sm tracking-widest mt-1">BEST {best}</div>
            </>
          ) : (
            <>
              <div className="text-amber-300 font-bold text-xl tracking-widest" style={{ textShadow: '0 0 12px #ffd700' }}>
                {meters} m
              </div>
              <div className="text-zinc-400 text-sm tracking-widest mt-1">BEST {best}</div>
            </>
          )}
        </div>
      </div>

      {isParty && match?.roomCode && phase === 'running' && (
        <div className="absolute top-20 inset-x-0 text-center pointer-events-none">
          <div className="text-[10px] tracking-[0.4em] text-amber-300/80 uppercase">Party hunt · code {match.roomCode}</div>
        </div>
      )}

      {/* OASIS lobby */}
      {oasisOpen && (
        <div className="absolute inset-0 z-50">
          <OasisLobby
            gameSlug="raptor-rush"
            supabase={supabase}
            userId={userId}
            callsign={callsign}
            onLaunch={handleOasisLaunch}
            onExit={() => setOasisOpen(false)}
          />
        </div>
      )}

      {/* Party notice toast */}
      {partyNotice && (
        <div className="absolute z-[60] bottom-8 inset-x-0 flex justify-center px-6 pointer-events-none">
          <div className="bg-amber-950/95 border border-amber-500/60 text-amber-100 text-sm px-5 py-3 rounded-lg max-w-sm text-center">
            {partyNotice}
          </div>
        </div>
      )}

      {/* Intro overlay */}
      {phase === 'ready' && !oasisOpen && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 px-6 text-center">
          <h1 className="text-5xl font-black tracking-widest text-emerald-300" style={{ textShadow: '0 0 24px #34d399' }}>
            RAPTOR RUSH
          </h1>
          <p className="text-zinc-300 mt-4 max-w-md leading-relaxed">
            {isParty
              ? `Party hunt — ${match?.roomCode ? `room ${match.roomCode}. ` : ''}A timed match. Rabbits spawn more and more, the rocks get meaner. High score wins.`
              : 'The canyon runs dead ahead. Steer the raptor, eat rabbits, dodge the rock. Three hits and the hunt is over.'}
          </p>
          <p className="text-zinc-500 text-sm mt-3">
            Drag left/right to steer · Tap or press Space to start
          </p>
          <button
            onClick={begin}
            className="mt-8 px-10 py-4 min-h-[44px] text-xl font-bold rounded-lg bg-emerald-400 text-black hover:bg-emerald-300 transition-colors"
          >
            {isParty ? 'Start the party hunt' : 'Start the hunt'}
          </button>
        </div>
      )}

      {/* Game over overlay */}
      {phase === 'over' && (
        <div className="absolute inset-0 z-30 overflow-y-auto bg-black/80">
          <div className="min-h-full flex flex-col items-center justify-center px-6 py-8 text-center">
            <h2 className="text-4xl font-black tracking-widest text-red-400" style={{ textShadow: '0 0 24px #f87171' }}>
              {timeUp ? "TIME'S UP" : 'THE HUNT ENDS'}
            </h2>
            {newBest && (
              <div className="mt-3 px-4 py-1.5 rounded-full bg-amber-400/20 border border-amber-400/60 text-amber-300 text-sm font-black tracking-[0.25em] uppercase animate-pulse">
                New best!
              </div>
            )}
            <div className="text-zinc-200 mt-6 space-y-1 text-lg">
              <div>Score <span className="text-cyan-300 font-bold">{score}</span></div>
              <div>Distance <span className="text-amber-300 font-bold">{meters} m</span></div>
              <div>Rabbits eaten <span className="text-emerald-300 font-bold">{prey}</span></div>
              <div className="text-zinc-400">Best <span className="font-bold">{best}</span></div>
            </div>

            {/* Party leaderboard */}
            {isParty && (
              <div className="mt-4 w-full max-w-xs bg-black/50 border border-amber-400/40 rounded p-4">
                <div className="text-[10px] tracking-[0.35em] uppercase text-amber-300/80 mb-2">
                  Party room {match?.roomCode} — high score wins
                </div>
                <div className="flex flex-col gap-1.5">
                  {roomScores.map((s, i) => (
                    <div key={s.id} className={`flex items-center justify-between px-3 py-1.5 rounded text-sm border ${
                      i === 0 ? 'bg-amber-400/10 border-amber-400/50' : 'bg-black/40 border-zinc-800'
                    }`}>
                      <span className="text-zinc-500 font-bold w-8">#{i + 1}</span>
                      <span className="flex-1 text-left text-zinc-200 tracking-widest uppercase truncate">
                        {i === 0 ? '👑 ' : ''}{s.player_name}
                      </span>
                      <span className="text-amber-300 font-black">{s.score}</span>
                    </div>
                  ))}
                  {roomScores.length === 0 && (
                    <p className="text-zinc-500 text-xs tracking-widest uppercase">
                      {roomNote || 'Waiting for party scores…'}
                    </p>
                  )}
                </div>
                {roomNote && roomScores.length > 0 && (
                  <p className="text-zinc-500 text-xs mt-2">{roomNote}</p>
                )}
              </div>
            )}

            {/* Save score */}
            {!saved && (
              <div className="flex flex-col gap-2 mt-4 w-full max-w-xs">
                <div className="flex gap-2">
                  <input
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    placeholder="Your hunter name"
                    maxLength={24}
                    className="flex-1 px-4 py-3 min-h-[44px] bg-black/60 border border-emerald-500/40 rounded text-white placeholder-zinc-500 tracking-widest uppercase text-sm focus:outline-none focus:border-emerald-300"
                  />
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-4 py-3 min-h-[44px] bg-emerald-500/20 border border-emerald-400/60 rounded text-emerald-200 text-sm font-bold tracking-widest uppercase hover:bg-emerald-500/40 disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
                {saveNote && <p className="text-zinc-500 text-xs">{saveNote}</p>}
              </div>
            )}
            {saved && <p className="text-emerald-300 tracking-widest uppercase text-sm mt-4">Saved to the scoreboard</p>}

            <div className="mt-4 flex flex-col gap-2 w-full max-w-xs">
              <button
                onClick={begin}
                className="w-full px-6 py-4 min-h-[44px] rounded border text-sm font-black tracking-[0.25em] uppercase bg-emerald-500/15 border-emerald-400/60 text-emerald-100 hover:bg-emerald-500/35 transition-all"
              >
                {isParty ? 'Run it back' : 'Hunt again'}
              </button>
              <button
                onClick={quitToMenu}
                className="w-full px-6 py-4 min-h-[44px] rounded border text-sm font-black tracking-[0.25em] uppercase bg-black/40 border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-400 transition-all"
              >
                Main menu
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

