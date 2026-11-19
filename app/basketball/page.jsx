// Streetball — main route component: menu, HUD, game over, input wiring.
'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackButton } from '@/components/ui';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { GameCanvas } from '@/components/basketball/GameCanvas';
import { BasketballGame } from '@/lib/basketball/game';
import { SoundFX } from '@/lib/basketball/audio';
import { fetchTopScores, fetchRoomScores, submitScore, sanitizeName } from '@/lib/basketball/storage';
import { fx, unlockFx } from '@/lib/fx';
import { grantAchievement } from '@/lib/achievements/award';
import AchievementBanner from '@/components/achievements/AchievementBanner';
import OasisLobby from '@/components/oasis/Lobby';
import { supabase } from '@/lib/supabase';
import { AresBackdrop, AresButton, AresIcon, AresLoader, AresEmpty, AresPanel, ARES } from '@/components/ares/ares-chrome';

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
  const [screen, setScreen] = useState('menu'); // menu | game
  const [mode, setMode] = useState('shootout');
  const [game, setGame] = useState(null);
  const [snap, setSnap] = useState(null);
  const [popups, setPopups] = useState([]);
  const [scores, setScores] = useState([]);
  const [scoresNote, setScoresNote] = useState('');
  const [scoresLoading, setScoresLoading] = useState(true);
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

  const [celebrateKey, setCelebrateKey] = useState(null); // achievement celebration
  const bucketAwardedRef = useRef(false);
  const courtKingAwardedRef = useRef(false);
  const savedNameRef = useRef('');

  // Fire-and-forget achievement grant. Signed-in users only (guests earn
  // nothing server-side); the banner shows only when the server confirms
  // a fresh award (awarded=false means already held — no repeat celebration).
  const getToken = async () => {
    try {
      const { data } = await supabase.auth.getSession();
      return data?.session?.access_token || null;
    } catch { return null; }
  };
  const award = (key) => {
    grantAchievement(key, getToken).then((r) => {
      if (r && r.awarded) setCelebrateKey((cur) => cur ?? key);
    }).catch(() => {});
  };

  // session for OASIS identity; ?code= deep link opens the lobby
  useEffect(() => {
    (async () => {
      let cloudUp = false;
      try {
        const { data } = await supabase.auth.getUser();
        cloudUp = true;
        const u = data?.user;
        if (u) {
          setUserId(u.id);
          const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('streetball_name') : '';
          setCallsign(sanitizeName(stored) || 'PLAYER');
        }
      } catch { /* guest play still works */ }
      // Only auto-open the lobby deep link when the database connection is
      // up — otherwise the lobby would mount with no backend behind it.
      if (cloudUp && typeof window !== 'undefined') {
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
      setScoresLoading(false);
      if (error) setScoresNote('Scores are unavailable right now.');
    });
  }, [screen]);

  useEffect(() => {
    try {
      setPlayerName(localStorage.getItem('streetball_name') || '');
      setMuted(localStorage.getItem('streetball_muted') === '1');
    } catch { /* ignore */ }
    // FX system: unlock sound+haptics on the first gesture.
    const unlock = () => unlockFx();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(() => {
    sfx.current?.setMuted(muted);
    try { localStorage.setItem('streetball_muted', muted ? '1' : '0'); } catch { /* ignore */ }
  }, [muted]);

  const startGame = useCallback((m) => {
    const g = new BasketballGame(m);
    bucketAwardedRef.current = false;
    courtKingAwardedRef.current = false;
    const unsub = g.onEvent((type, payload) => {
      const s = sfx.current;
      switch (type) {
        case 'bounce': s?.bounce(payload.intensity); break;
        case 'rim': s?.rim(payload.intensity); break;
        case 'board': s?.board(); break;
        case 'swish': s?.swish(); fx.coin(); break; // net sparkle + pickup tick layered on the arena swish
        case 'score':
          s?.score(payload.streak);
          if (!bucketAwardedRef.current) {
            bucketAwardedRef.current = true;
            award('basketball-first-bucket');
          }
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
          fx.gameWin(); // buzzer beater: full fanfare moment
          addPopup('BUZZER BEATER!', 'buzzer');
          break;
        case 'over':
          s?.whistle();
          s?.crowdCheer(true);
          setSaved(false);
          if (g.snapshot().score >= 30) award('basketball-sharpshooter');
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
          isNpc: true, // backfilled CPU rival — badge it on the board
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
    savedNameRef.current = name;
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

  // Court King (PvP): rank 1 in a party room with at least 3 human
  // players. Evaluated once the player's own saved score is on the board
  // (the poll refreshes it). NOTE: the grant route verifies PvP wins via
  // pvp_matches — no match records are written anywhere yet, so this 403s
  // until that path exists.
  useEffect(() => {
    if (oasisMatch?.kind !== 'party' || snap?.screen !== 'over') return;
    if (courtKingAwardedRef.current || !savedNameRef.current || !roomScores.length) return;
    const humans = roomScores.filter((s) => !s.is_npc);
    if (humans.length < 3) return;
    const mine = roomScores.find((s) => s.player_name === savedNameRef.current && s.score === snap.score);
    if (!mine) return;
    const rank = 1 + roomScores.filter((s) => s.score > mine.score).length;
    if (rank === 1) {
      courtKingAwardedRef.current = true;
      award('basketball-court-king');
    }
  }, [roomScores, snap, oasisMatch]);

  // stop the crowd if the player leaves the route entirely
  useEffect(() => {
    return () => { sfx.current?.stopCrowd(); };
  }, []);

  return (
    <div className="relative w-screen h-dvh overflow-hidden bg-[#04060c] text-white select-none">
      {/* ARES interior art: page backdrop behind menus/HUD (never over gameplay) */}
      <AresBackdrop src="/images/basketball/basketball-bg.webp" strength={0.35} />
      {screen === 'menu' && (
        <MenuScreen
          onPlay={startGame}
          scores={scores}
          scoresNote={scoresNote}
          scoresLoading={scoresLoading}
          showHelp={showHelp}
          setShowHelp={setShowHelp}
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
                <AresPanel className="mt-4 w-full max-w-xs p-4">
                  <div className="text-[10px] tracking-[0.35em] uppercase text-fuchsia-300/80 mb-2">
                    Party room {oasisMatch.roomCode}
                  </div>
                  <p className="text-[10px] text-zinc-600 tracking-widest uppercase mb-2">
                    CPU rivals are badged CPU once the leaderboard update is live.
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {roomScores.map((s, i) => (
                      <div key={s.id} className="flex items-center justify-between px-3 py-1.5 bg-black/40 border border-zinc-800 rounded text-sm">
                        <span className="text-zinc-500 font-bold w-8">#{i + 1}</span>
                        <span className="flex-1 text-left text-zinc-200 tracking-widest uppercase truncate">
                          {s.player_name}
                          {s.is_npc && (
                            <span className="ml-2 inline-block px-1.5 py-0.5 text-[10px] font-black tracking-widest uppercase bg-zinc-700 text-zinc-200 rounded align-middle">CPU</span>
                          )}
                        </span>
                        <span className="text-amber-300 font-black">{s.score}</span>
                      </div>
                    ))}
                    {roomScores.length === 0 && (
                      <AresEmpty title="WAITING FOR PARTY SCORES" hint="Scores land here once rivals finish." />
                    )}
                  </div>
                </AresPanel>
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
                  <AresButton
                    icon="save"
                    tone="gold"
                    onClick={handleSave}
                    disabled={saving}
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </AresButton>
                </div>
              )}
              {saved && <p className="text-emerald-300 tracking-widest uppercase text-sm mt-4">Saved to the leaderboard</p>}
              <div className="mt-4 flex flex-col gap-2 w-full max-w-xs">
                <MenuButton icon="rotate" onClick={() => { sfx.current?.stopCrowd(); startGame(mode); }}>Play again</MenuButton>
                <MenuButton icon="home" onClick={quitToMenu} dim>Main menu</MenuButton>
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

function MenuButton({ children, onClick, dim, icon }) {
  return (
    <AresButton
      icon={icon}
      tone={dim ? 'ghost' : 'gold'}
      onClick={onClick}
      className="w-full"
    >
      {children}
    </AresButton>
  );
}

function Overlay({ children }) {
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/70 backdrop-blur-sm px-6 text-center overflow-hidden">
      {/* ARES panel texture behind overlay content */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `url('${ARES.panelTile}')`,
          backgroundSize: '512px 512px',
          opacity: 0.15,
        }}
      />
      <div className="relative flex flex-col items-center gap-3 w-full">{children}</div>
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
          <button onClick={onMute} className="w-11 h-11 rounded border border-zinc-700 bg-black/60 text-zinc-300 hover:border-cyan-400 hover:text-cyan-300 flex items-center justify-center" aria-label={muted ? 'Unmute sound' : 'Mute sound'}>
            <AresIcon name={muted ? 'mute' : 'sound'} className="h-5 w-5" />
          </button>
          <button onClick={onPause} className="h-11 px-4 rounded border border-zinc-700 bg-black/60 text-zinc-300 hover:border-cyan-400 hover:text-cyan-300 flex items-center gap-2 text-xs font-bold tracking-widest uppercase">
            <AresIcon name={snap.paused ? 'play' : 'pause'} className="h-4 w-4" />
            {snap.paused ? 'Go' : 'Pause'}
          </button>
          <button onClick={onQuit} className="w-11 h-11 rounded border border-zinc-700 bg-black/60 text-zinc-300 hover:border-red-400 hover:text-red-300 flex items-center justify-center" aria-label="Quit to menu">
            <AresIcon name="close" className="h-4 w-4" />
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

function MenuScreen({ onPlay, scores, scoresNote, scoresLoading, showHelp, setShowHelp, onOasis }) {
  return (
    <div className="absolute inset-0 z-10 overflow-y-auto overflow-hidden bg-gradient-to-b from-[#04060c] via-[#071120] to-[#04060c]">
      {/* ARES interior art behind the menu */}
      <img
        src="/images/basketball/basketball-bg.webp"
        alt=""
        aria-hidden="true"
        draggable={false}
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-40"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: 'linear-gradient(180deg, rgba(4,6,12,0.45) 0%, rgba(4,6,12,0.88) 100%)' }}
      />
      <div className="relative min-h-full flex flex-col items-center justify-center px-6 py-10 text-center max-w-md mx-auto">
        <div className="text-[10px] tracking-[0.5em] text-cyan-500 uppercase mb-2">Zeus presents</div>
        <h1 className="text-5xl font-black tracking-[0.12em] uppercase text-white">
          Street<span className="text-cyan-400">ball</span>
        </h1>
        <p className="text-zinc-400 tracking-[0.25em] uppercase text-xs mt-2">Full-court shootout</p>

        <div className="w-full flex flex-col gap-3 mt-8">
          <AresButton icon="timer" tone="gold" onClick={() => onPlay('shootout')} className="w-full text-left">
            <span className="flex flex-col text-left leading-tight">
              <span className="text-base font-black tracking-[0.2em] uppercase">Timed shootout</span>
              <span className="text-[11px] font-normal normal-case tracking-wider opacity-75">60 seconds • Streaks earn bonus points</span>
            </span>
          </AresButton>
          <AresButton icon="spark" tone="ghost" onClick={() => onPlay('freeplay')} className="w-full text-left">
            <span className="flex flex-col text-left leading-tight">
              <span className="text-base font-black tracking-[0.2em] uppercase">Free play</span>
              <span className="text-[11px] font-normal normal-case tracking-wider opacity-75">No clock • Just shoot around</span>
            </span>
          </AresButton>
          <AresButton icon="users" tone="crimson" onClick={onOasis} className="w-full text-left">
            <span className="flex flex-col text-left leading-tight">
              <span className="text-base font-black tracking-[0.2em] uppercase">OASIS multiplayer</span>
              <span className="text-[11px] font-normal normal-case tracking-wider opacity-75">Party rooms • Rival matches • Boss battles</span>
            </span>
          </AresButton>
          <AresButton icon="help" tone="ghost" onClick={() => setShowHelp((v) => !v)} className="self-center">
            {showHelp ? 'Hide how to play' : 'How to play'}
          </AresButton>
          {showHelp && (
            <AresPanel className="p-4">
              <div className="text-left text-sm text-zinc-300 space-y-2">
              <p><span className="text-cyan-300 font-bold">1.</span> Press and drag anywhere to aim — the glowing arc shows your shot.</p>
              <p><span className="text-cyan-300 font-bold">2.</span> Drag <em>down</em> for more power, <em>up</em> for less. Drag sideways to steer.</p>
              <p><span className="text-cyan-300 font-bold">3.</span> Let go to shoot. Nothing but net = <em>Swish!</em> bonus.</p>
              <p><span className="text-cyan-300 font-bold">4.</span> Tap a glowing spot on the court to move there.</p>
              <p><span className="text-cyan-300 font-bold">5.</span> In a shootout, every basket switches ends. Make shots in a row for streak bonuses.</p>
              </div>
            </AresPanel>
          )}
        </div>

        <div className="w-full mt-8">
          <div className="text-[10px] tracking-[0.4em] text-zinc-500 uppercase mb-3">Top scores</div>
          {scoresNote && <p className="text-zinc-600 text-xs">{scoresNote}</p>}
          {scoresLoading && !scoresNote ? (
            <AresLoader label="FETCHING SCORES" />
          ) : !scoresNote && scores.length === 0 ? (
            <AresEmpty title="NO SCORES YET" hint="Be the first to light up the board." />
          ) : (
          <AresPanel className="p-2">
            <div className="flex flex-col gap-1.5">
              {scores.map((s, i) => (
                <div key={s.id} className="flex items-center justify-between px-4 py-2 rounded text-sm">
                  <span className="text-zinc-500 font-bold w-8">#{i + 1}</span>
                  <span className="flex-1 text-left text-zinc-200 tracking-widest uppercase truncate">
                    {s.player_name}
                    {s.is_npc && (
                      <span className="ml-2 inline-block px-1.5 py-0.5 text-[10px] font-black tracking-widest uppercase bg-zinc-700 text-zinc-200 rounded align-middle">CPU</span>
                    )}
                  </span>
                  <span className="font-black" style={{ color: ARES.goldSoft }}>{s.score}</span>
                </div>
              ))}
            </div>
          </AresPanel>
          )}
        </div>

        <BackButton label="Back to the launcher" />

        {/* Safari bottom-bar clearance: lets the menu content rest above the browser bar */}
        <div aria-hidden="true" className="player-clear shrink-0" />
      </div>
      <AchievementBanner
        achievementKey={celebrateKey}
        show={!!celebrateKey}
        onDismiss={() => setCelebrateKey(null)}
      />
    </div>
  );
}
