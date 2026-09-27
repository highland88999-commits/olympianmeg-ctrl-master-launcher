// Streetball — main route component: menu, HUD, game over, input wiring.
'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { GameCanvas } from '@/components/basketball/GameCanvas';
import { BasketballGame } from '@/lib/basketball/game';
import { SoundFX } from '@/lib/basketball/audio';
import { fetchTopScores, fetchRoomScores, submitScore, sanitizeName } from '@/lib/basketball/storage';
import OasisLobby from '@/components/oasis/Lobby';
import { supabase } from '@/lib/supabase';

/** Simulate an NPC rival's shootout score from its OASIS difficulty (1-10). */
function simulateNpcScore(difficulty) {
  const d = Math.max(1, Math.min(10, Number(difficulty) || 3));
  return Math.max(5, Math.round(10 + d * 4 + (Math.random() * 12 - 6)));
}

function InputLayer({ game }) {
  const { camera, gl, size } = useThree();
  const drag = useRef(null);

  useEffect(() => {
    const el = gl.domElement;

    const spotAt = (clientX, clientY) => {
      const rect = el.getBoundingClientRect();
      const v = new THREE.Vector3();
      let best = -1;
      let bestD = 52; // px
      game.spots.forEach((s, i) => {
        v.set(s.x, 0.1, s.z).project(camera);
        const px = (v.x * 0.5 + 0.5) * rect.width + rect.left;
        const py = (-v.y * 0.5 + 0.5) * rect.height + rect.top;
        const d = Math.hypot(px - clientX, py - clientY);
        if (d < bestD) { bestD = d; best = i; }
      });
      return best;
    };

    const down = (e) => {
      if (game.phase !== 'idle' || game.paused || game.screen !== 'game') return;
      game.startAim();
      drag.current = {
        id: e.pointerId, x0: e.clientX, y0: e.clientY,
        x: e.clientX, y: e.clientY, t: performance.now(),
      };
      el.setPointerCapture?.(e.pointerId);
    };
    const move = (e) => {
      const d = drag.current;
      if (!d || d.id !== e.pointerId || game.phase !== 'aiming') return;
      game.moveAim(e.clientX - d.x, e.clientY - d.y);
      d.x = e.clientX; d.y = e.clientY;
    };
    const up = (e) => {
      const d = drag.current;
      if (!d || d.id !== e.pointerId) return;
      drag.current = null;
      if (game.phase !== 'aiming') return;
      const dist = Math.hypot(e.clientX - d.x0, e.clientY - d.y0);
      const dt = performance.now() - d.t;
      if (dist < 12 && dt < 400) {
        // tap: cancel the aim, maybe move to a spot
        game.cancelAim();
        const i = spotAt(e.clientX, e.clientY);
        if (i >= 0) game.moveToSpot(i);
      } else {
        game.releaseShot();
      }
    };
    const cancel = (e) => {
      if (drag.current?.id === e.pointerId) {
        drag.current = null;
        game.cancelAim();
      }
    };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', cancel);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
    };
  }, [camera, gl, size, game]);

  return null;
}

let popupId = 0;

export default function BasketballPage() {
  const router = useRouter();
  const [screen, setScreen] = useState('menu'); // menu | game
  const [mode, setMode] = useState('shootout');
  const [game, setGame] = useState(null);
  const [snap, setSnap] = useState(null);
  const [popups, setPopups] = useState([]);
  const [scores, setScores] = useState([]);
  const [scoresNote, setScoresNote] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [muted, setMuted] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [oasisOpen, setOasisOpen] = useState(false);
  const [oasisMatch, setOasisMatch] = useState(null); // {kind:'npc'|'boss', name, rivalScore} | {kind:'party', roomCode}
  const [userId, setUserId] = useState(null);
  const [callsign, setCallsign] = useState('');
  const [roomScores, setRoomScores] = useState([]);
  const sfx = useRef(null);

  // session for OASIS identity; ?code= deep link opens the lobby
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const u = data?.user;
        if (u) {
          setUserId(u.id);
          const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('streetball_name') : '';
          setCallsign(sanitizeName(stored) || 'PLAYER');
        }
      } catch { /* guest play still works */ }
      if (typeof window !== 'undefined') {
        const code = new URLSearchParams(window.location.search).get('code');
        if (code && code.length >= 5) setOasisOpen(true);
      }
    })();
  }, []);
  if (!sfx.current && typeof window !== 'undefined') sfx.current = new SoundFX();

  const addPopup = useCallback((text, kind = 'info') => {
    const id = ++popupId;
    setPopups((p) => [...p.slice(-4), { id, text, kind }]);
    setTimeout(() => setPopups((p) => p.filter((x) => x.id !== id)), 1500);
  }, []);

  // leaderboard on the menu
  useEffect(() => {
    if (screen !== 'menu') return;
    fetchTopScores(10).then(({ scores, error }) => {
      setScores(scores);
      if (error) setScoresNote('Scores are unavailable right now.');
    });
  }, [screen]);

  useEffect(() => {
    try {
      setPlayerName(localStorage.getItem('streetball_name') || '');
      setMuted(localStorage.getItem('streetball_muted') === '1');
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    sfx.current?.setMuted(muted);
    try { localStorage.setItem('streetball_muted', muted ? '1' : '0'); } catch { /* ignore */ }
  }, [muted]);

  const startGame = useCallback((m) => {
    const g = new BasketballGame(m);
    const unsub = g.onEvent((type, payload) => {
      const s = sfx.current;
      switch (type) {
        case 'bounce': s?.bounce(payload.intensity); break;
        case 'rim': s?.rim(payload.intensity); break;
        case 'board': s?.board(); break;
        case 'swish': s?.swish(); break;
        case 'score':
          s?.score(payload.streak);
          if (payload.streak >= 2) s?.crowdCheer(payload.streak >= 4);
          addPopup(
            `+${payload.points}${payload.swish ? '  SWISH!' : ''}${payload.streak >= 2 ? `   STREAK x${payload.streak}` : ''}`,
            payload.swish ? 'swish' : 'score'
          );
          break;
        case 'miss':
          addPopup('Off the mark', 'miss');
          break;
        case 'buzzer': s?.buzzer(); break;
        case 'buzzerBeater':
          s?.buzzerBeater();
          addPopup('BUZZER BEATER!', 'buzzer');
          break;
        case 'over':
          s?.whistle();
          s?.crowdCheer(true);
          setSaved(false);
          break;
        case 'ui':
          setSnap(g.snapshot());
          break;
        default: break;
      }
    });
    sfx.current?.ensure();
    sfx.current?.click();
    sfx.current?.startCrowd();
    setMode(m);
    setGame(g);
    setSnap(g.snapshot());
    setScreen('game');
    return unsub;
  }, [addPopup]);

  const quitToMenu = useCallback(() => {
    sfx.current?.click();
    sfx.current?.stopCrowd();
    setGame(null);
    setSnap(null);
    setOasisMatch(null);
    setScreen('menu');
  }, []);

  // OASIS: npc/boss -> branded solo shootout vs a simulated rival score;
  // pvp party -> simultaneous 60s shootout, scores share the room leaderboard.
  const handleOasisLaunch = useCallback(async ({ mode, room, roster, boss }) => {
    setOasisOpen(false);
    if (mode === 'pvp') {
      const code = room?.room_code;
      const npcSeats = (roster || []).filter((s) => s.kind === 'npc');
      // backfilled rivals post simulated scores to the party board
      for (const seat of npcSeats) {
        await submitScore({
          playerName: seat.npc?.name || 'RIVAL',
          score: simulateNpcScore(seat.npc?.difficulty),
          mode: 'shootout',
          roomCode: code,
        });
      }
      setOasisMatch({ kind: 'party', roomCode: code });
      startGame('shootout');
      return;
    }
    const rival = mode === 'boss' ? boss : (roster || []).find((s) => s.kind === 'npc')?.npc;
    setOasisMatch({
      kind: mode === 'boss' ? 'boss' : 'npc',
      name: rival?.name || 'RIVAL',
      rivalScore: simulateNpcScore(rival?.difficulty),
    });
    startGame('shootout');
  }, [startGame]);

  const handleSave = useCallback(async () => {
    if (!snap || saving || saved) return;
    setSaving(true);
    const name = sanitizeName(playerName);
    try { localStorage.setItem('streetball_name', name); } catch { /* ignore */ }
    const { ok } = await submitScore({
      playerName: name,
      score: snap.score,
      mode: snap.mode,
      roomCode: oasisMatch?.kind === 'party' ? oasisMatch.roomCode : undefined,
    });
    setSaving(false);
    if (ok) {
      setSaved(true);
      addPopup('Score saved!', 'score');
    } else {
      addPopup('Could not save — try again', 'miss');
    }
  }, [snap, saving, saved, playerName, addPopup, oasisMatch]);

  // party room leaderboard: poll while the game-over screen is up
  useEffect(() => {
    if (oasisMatch?.kind !== 'party' || snap?.screen !== 'over') return;
    let alive = true;
    const load = async () => {
      const { scores } = await fetchRoomScores(oasisMatch.roomCode);
      if (alive) setRoomScores(scores);
    };
    load();
    const t = setInterval(load, 2000);
    return () => { alive = false; clearInterval(t); };
  }, [oasisMatch, snap?.screen]);

  // stop the crowd if the player leaves the route entirely
  useEffect(() => {
    return () => { sfx.current?.stopCrowd(); };
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#04060c] text-white select-none">
      {screen === 'menu' && (
        <MenuScreen
          onPlay={startGame}
          scores={scores}
          scoresNote={scoresNote}
          showHelp={showHelp}
          setShowHelp={setShowHelp}
          onExit={() => router.push('/')}
          onOasis={() => setOasisOpen(true)}
        />
      )}
      {oasisOpen && (
        <div className="absolute inset-0 z-50">
          <OasisLobby
            gameSlug="basketball"
            supabase={supabase}
            userId={userId}
            callsign={callsign}
            onLaunch={handleOasisLaunch}
            onExit={() => setOasisOpen(false)}
          />
        </div>
      )}

      {screen === 'game' && game && snap && (
        <>
          <div className="absolute inset-0" style={{ touchAction: 'none' }}>
            <GameCanvas key={mode + gameId(game)} game={game} snap={snap}>
              <InputLayer game={game} />
            </GameCanvas>
          </div>
          <Hud
            snap={snap}
            muted={muted}
            onMute={() => setMuted((m) => !m)}
            onPause={() => game.togglePause()}
            onQuit={quitToMenu}
          />
          <Popups popups={popups} />
          {snap.slowMo && (
            <div className="absolute top-24 inset-x-0 text-center pointer-events-none">
              <span className="text-2xl font-black tracking-[0.3em] text-amber-300 uppercase animate-pulse">
                Buzzer beater…
              </span>
            </div>
          )}
          {snap.paused && snap.screen === 'game' && (
            <Overlay>
              <h2 className="text-3xl font-black tracking-widest uppercase">Paused</h2>
              <MenuButton onClick={() => game.togglePause()}>Keep playing</MenuButton>
              <MenuButton onClick={quitToMenu} dim>Quit to menu</MenuButton>
            </Overlay>
          )}
          {snap.screen === 'over' && (
            <Overlay>
              <h2 className="text-3xl font-black tracking-widest uppercase text-cyan-300">Time&apos;s up!</h2>
              <p className="text-6xl font-black text-white my-2">{snap.score}</p>
              <p className="text-zinc-400 tracking-widest uppercase text-sm">points</p>
              <p className="text-zinc-300 mt-3">
                You made {snap.makes} of {snap.attempts} shots
                {snap.bestStreak >= 2 ? ` • Best streak: ${snap.bestStreak}` : ''}
              </p>
              {(oasisMatch?.kind === 'npc' || oasisMatch?.kind === 'boss') && (
                <div className="mt-4 w-full max-w-xs bg-black/50 border border-amber-400/40 rounded p-4">
                  <div className="text-[10px] tracking-[0.35em] uppercase text-amber-300/80 mb-2">
                    {oasisMatch.kind === 'boss' ? 'Boss battle' : 'OASIS quick match'}
                  </div>
                  <div className="flex items-center justify-between text-lg font-black tracking-widest uppercase">
                    <span className="text-cyan-200">You {snap.score}</span>
                    <span className="text-zinc-500 text-sm">vs</span>
                    <span className="text-amber-200">{oasisMatch.name} {oasisMatch.rivalScore}</span>
                  </div>
                  <div className={`mt-2 text-2xl font-black tracking-[0.25em] uppercase ${
                    snap.score > oasisMatch.rivalScore ? 'text-emerald-300' : snap.score < oasisMatch.rivalScore ? 'text-red-300' : 'text-zinc-300'
                  }`}>
                    {snap.score > oasisMatch.rivalScore ? 'Victory' : snap.score < oasisMatch.rivalScore ? 'Defeat' : 'Draw'}
                  </div>
                </div>
              )}
              {oasisMatch?.kind === 'party' && (
                <div className="mt-4 w-full max-w-xs bg-black/50 border border-fuchsia-400/40 rounded p-4">
                  <div className="text-[10px] tracking-[0.35em] uppercase text-fuchsia-300/80 mb-2">
                    Party room {oasisMatch.roomCode}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {roomScores.map((s, i) => (
                      <div key={s.id} className="flex items-center justify-between px-3 py-1.5 bg-black/40 border border-zinc-800 rounded text-sm">
                        <span className="text-zinc-500 font-bold w-8">#{i + 1}</span>
                        <span className="flex-1 text-left text-zinc-200 tracking-widest uppercase truncate">{s.player_name}</span>
                        <span className="text-amber-300 font-black">{s.score}</span>
                      </div>
                    ))}
                    {roomScores.length === 0 && (
                      <p className="text-zinc-500 text-xs tracking-widest uppercase">Waiting for party scores…</p>
                    )}
                  </div>
                </div>
              )}
              {snap.score > 0 && !saved && (
                <div className="flex gap-2 mt-4 w-full max-w-xs">
                  <input
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    placeholder="Your name"
                    maxLength={24}
                    className="flex-1 px-4 py-3 bg-black/60 border border-cyan-500/40 rounded text-white placeholder-zinc-500 tracking-widest uppercase text-sm focus:outline-none focus:border-cyan-300"
                  />
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-4 py-3 bg-cyan-500/20 border border-cyan-400/60 rounded text-cyan-200 text-sm font-bold tracking-widest uppercase hover:bg-cyan-500/40 disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              )}
              {saved && <p className="text-emerald-300 tracking-widest uppercase text-sm mt-4">Saved to the leaderboard</p>}
              <div className="mt-4 flex flex-col gap-2 w-full max-w-xs">
                <MenuButton onClick={() => { sfx.current?.stopCrowd(); startGame(mode); }}>Play again</MenuButton>
                <MenuButton onClick={quitToMenu} dim>Main menu</MenuButton>
              </div>
            </Overlay>
          )}
        </>
      )}
    </div>
  );
}

function gameId(g) {
  return g._id || (g._id = Math.random().toString(36).slice(2));
}

function MenuButton({ children, onClick, dim }) {
  return (
    <button
      onClick={onClick}
      className={`w-full px-6 py-4 rounded border text-sm font-black tracking-[0.25em] uppercase transition-all ${
        dim
          ? 'bg-black/40 border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-400'
          : 'bg-cyan-500/15 border-cyan-400/60 text-cyan-100 hover:bg-cyan-500/35 hover:border-cyan-300'
      }`}
    >
      {children}
    </button>
  );
}

function Overlay({ children }) {
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/70 backdrop-blur-sm px-6 text-center">
      {children}
    </div>
  );
}

function Hud({ snap, muted, onMute, onPause, onQuit }) {
  const mm = Math.floor(snap.timeLeft / 60);
  const ss = String(snap.timeLeft % 60).padStart(2, '0');
  const urgent = snap.mode === 'shootout' && snap.timeLeft <= 10 && snap.screen === 'game';
  return (
    <div className="absolute inset-x-0 top-0 z-20 pointer-events-none">
      <div className="flex items-start justify-between px-4 pt-4">
        <div>
          <div className="text-[10px] tracking-[0.3em] text-zinc-500 uppercase">Score</div>
          <div className="text-4xl font-black text-white leading-none">{snap.score}</div>
          {snap.streak >= 2 && (
            <div className="text-sm font-bold text-amber-300 tracking-widest uppercase mt-1 animate-pulse">
              Streak x{snap.streak}
            </div>
          )}
        </div>
        <div className="text-center">
          {snap.mode === 'shootout' ? (
            <>
              <div className="text-[10px] tracking-[0.3em] text-zinc-500 uppercase">Time left</div>
              <div className={`text-4xl font-black leading-none ${urgent ? 'text-red-400 animate-pulse' : 'text-white'}`}>
                {mm}:{ss}
              </div>
            </>
          ) : (
            <>
              <div className="text-[10px] tracking-[0.3em] text-zinc-500 uppercase">Shots made</div>
              <div className="text-4xl font-black text-white leading-none">
                {snap.makes}<span className="text-lg text-zinc-500">/{snap.attempts}</span>
              </div>
              {snap.bestStreak >= 2 && (
                <div className="text-[10px] tracking-[0.3em] text-zinc-500 uppercase mt-1">
                  Best streak {snap.bestStreak}
                </div>
              )}
            </>
          )}
        </div>
        <div className="flex gap-2 pointer-events-auto">
          <button onClick={onMute} className="w-11 h-11 rounded border border-zinc-700 bg-black/60 text-zinc-300 text-sm font-bold hover:border-cyan-400 hover:text-cyan-300" aria-label="Sound on or off">
            {muted ? '🔇' : '🔊'}
          </button>
          <button onClick={onPause} className="h-11 px-4 rounded border border-zinc-700 bg-black/60 text-zinc-300 text-xs font-bold tracking-widest uppercase hover:border-cyan-400 hover:text-cyan-300">
            {snap.paused ? 'Go' : 'Pause'}
          </button>
          <button onClick={onQuit} className="w-11 h-11 rounded border border-zinc-700 bg-black/60 text-zinc-300 text-sm font-bold hover:border-red-400 hover:text-red-300" aria-label="Quit to menu">
            ✕
          </button>
        </div>
      </div>
      {snap.phase === 'idle' && snap.screen === 'game' && !snap.paused && (
        <p className="text-center text-zinc-500 text-xs tracking-[0.2em] uppercase mt-2">
          Drag to shoot &nbsp;•&nbsp; Tap a glowing spot to move
        </p>
      )}
      {snap.phase === 'aiming' && (
        <div className="mx-auto mt-3 w-56">
          <div className="text-center text-[10px] tracking-[0.3em] text-cyan-400 uppercase mb-1">Power</div>
          <div className="h-2.5 rounded bg-zinc-800 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan-400 via-amber-300 to-red-400 transition-all"
              style={{ width: `${Math.round(snap.power01 * 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Popups({ popups }) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center pointer-events-none gap-1">
      {popups.map((p) => (
        <div
          key={p.id}
          className={`popup-float text-2xl font-black tracking-[0.2em] uppercase ${
            p.kind === 'score' ? 'text-cyan-300' :
            p.kind === 'swish' ? 'text-emerald-300' :
            p.kind === 'buzzer' ? 'text-amber-300 text-4xl' :
            'text-zinc-500 text-lg'
          }`}
        >
          {p.text}
        </div>
      ))}
      <style>{`
        @keyframes popupFloat {
          0% { opacity: 0; transform: translateY(14px) scale(0.9); }
          15% { opacity: 1; transform: translateY(0) scale(1.05); }
          30% { transform: translateY(-4px) scale(1); }
          75% { opacity: 1; }
          100% { opacity: 0; transform: translateY(-26px) scale(1); }
        }
        .popup-float { animation: popupFloat 1.5s ease-out forwards; text-shadow: 0 2px 12px rgba(0,0,0,0.8); }
      `}</style>
    </div>
  );
}

function MenuScreen({ onPlay, scores, scoresNote, showHelp, setShowHelp, onExit, onOasis }) {
  return (
    <div className="absolute inset-0 z-10 overflow-y-auto bg-gradient-to-b from-[#04060c] via-[#071120] to-[#04060c]">
      <div className="min-h-full flex flex-col items-center justify-center px-6 py-10 text-center max-w-md mx-auto">
        <div className="text-[10px] tracking-[0.5em] text-cyan-500 uppercase mb-2">Zeus presents</div>
        <h1 className="text-5xl font-black tracking-[0.12em] uppercase text-white">
          Street<span className="text-cyan-400">ball</span>
        </h1>
        <p className="text-zinc-400 tracking-[0.25em] uppercase text-xs mt-2">Full-court shootout</p>

        <div className="w-full flex flex-col gap-3 mt-8">
          <button
            onClick={() => onPlay('shootout')}
            className="px-6 py-5 rounded border border-cyan-400/60 bg-cyan-500/15 hover:bg-cyan-500/30 transition-all text-left"
          >
            <div className="text-lg font-black tracking-[0.2em] uppercase text-cyan-100">Timed shootout</div>
            <div className="text-xs text-zinc-400 tracking-widest uppercase mt-1">60 seconds • Streaks earn bonus points</div>
          </button>
          <button
            onClick={() => onPlay('freeplay')}
            className="px-6 py-5 rounded border border-zinc-700 bg-black/40 hover:border-zinc-400 transition-all text-left"
          >
            <div className="text-lg font-black tracking-[0.2em] uppercase text-zinc-100">Free play</div>
            <div className="text-xs text-zinc-500 tracking-widest uppercase mt-1">No clock • Just shoot around</div>
          </button>
          <button
            onClick={onOasis}
            className="px-6 py-5 rounded border border-fuchsia-400/60 bg-fuchsia-500/15 hover:bg-fuchsia-500/30 transition-all text-left"
          >
            <div className="text-lg font-black tracking-[0.2em] uppercase text-fuchsia-100">OASIS multiplayer</div>
            <div className="text-xs text-zinc-400 tracking-widest uppercase mt-1">Party rooms • Rival matches • Boss battles</div>
          </button>
          <button
            onClick={() => setShowHelp((v) => !v)}
            className="text-zinc-500 text-xs tracking-[0.3em] uppercase hover:text-zinc-300 mt-1"
          >
            {showHelp ? 'Hide how to play ▲' : 'How to play ▼'}
          </button>
          {showHelp && (
            <div className="text-left text-sm text-zinc-300 bg-black/40 border border-zinc-800 rounded p-4 space-y-2">
              <p><span className="text-cyan-300 font-bold">1.</span> Press and drag anywhere to aim — the glowing arc shows your shot.</p>
              <p><span className="text-cyan-300 font-bold">2.</span> Drag <em>down</em> for more power, <em>up</em> for less. Drag sideways to steer.</p>
              <p><span className="text-cyan-300 font-bold">3.</span> Let go to shoot. Nothing but net = <em>Swish!</em> bonus.</p>
              <p><span className="text-cyan-300 font-bold">4.</span> Tap a glowing spot on the court to move there.</p>
              <p><span className="text-cyan-300 font-bold">5.</span> In a shootout, every basket switches ends. Make shots in a row for streak bonuses.</p>
            </div>
          )}
        </div>

        <div className="w-full mt-8">
          <div className="text-[10px] tracking-[0.4em] text-zinc-500 uppercase mb-3">Top scores</div>
          {scoresNote && <p className="text-zinc-600 text-xs">{scoresNote}</p>}
          {!scoresNote && scores.length === 0 && (
            <p className="text-zinc-600 text-sm">No scores yet — be the first!</p>
          )}
          <div className="flex flex-col gap-1.5">
            {scores.map((s, i) => (
              <div key={s.id} className="flex items-center justify-between px-4 py-2 bg-black/40 border border-zinc-800 rounded text-sm">
                <span className="text-zinc-500 font-bold w-8">#{i + 1}</span>
                <span className="flex-1 text-left text-zinc-200 tracking-widest uppercase truncate">{s.player_name}</span>
                <span className="text-cyan-300 font-black">{s.score}</span>
              </div>
            ))}
          </div>
        </div>

        <button onClick={onExit} className="mt-8 text-zinc-600 text-xs tracking-[0.3em] uppercase hover:text-zinc-300">
          ← Back to the launcher
        </button>
      </div>
    </div>
  );
}
