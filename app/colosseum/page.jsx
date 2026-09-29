'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Pit } from '@/components/colosseum/Pit';
import { ColosseumGame, ROUND_SECONDS, INJECTOR_MAX } from '@/lib/colosseum/game';
import { SoundFX } from '@/lib/colosseum/audio';
import { fetchTopScores, fetchRoomScores, submitScore } from '@/lib/colosseum/storage';
import { fx, unlockFx } from '@/lib/fx';
import OasisLobby from '@/components/oasis/Lobby';
import { supabase } from '@/lib/supabase';

function simulateNpcGlory(difficulty) {
  const d = Math.max(1, Math.min(10, Number(difficulty) || 3));
  const max = 500 + d * 700;
  return Math.max(100, Math.round(max * (0.45 + Math.random() * 0.55)));
}

const fmtTime = (s) => `${Math.ceil(s)}s`;

export default function ColosseumPage() {
  const router = useRouter();
  const [screen, setScreen] = useState('menu'); // menu | game
  const [mode, setMode] = useState('arena'); // arena | boss
  const [match, setMatch] = useState(null); // OASIS launch payload
  const [snap, setSnap] = useState(null);
  const [result, setResult] = useState(null);
  const [popups, setPopups] = useState([]);
  const [hall, setHall] = useState([]);
  const [roomBoard, setRoomBoard] = useState([]);
  const [playerName, setPlayerName] = useState('GLADIATOR');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState(null);
  const [muted, setMuted] = useState(false);
  const [showHow, setShowHow] = useState(false);
  const [cloudOffline, setCloudOffline] = useState(false);

  const gameRef = useRef(null);
  const sfxRef = useRef(null);
  const popupId = useRef(0);
  const npcGloryRef = useRef(null);

  if (!sfxRef.current) sfxRef.current = new SoundFX();
  const sfx = sfxRef.current;

  useEffect(() => { sfx.setMuted(muted); }, [muted, sfx]);

  useEffect(() => {
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
    // The shared supabase client throws synchronously when the database
    // connection isn't configured — the promise .catch below can't see it,
    // so wrap the call itself. Solo play stays fully playable offline.
    try {
      supabase.auth.getUser().then(({ data }) => {
        const u = data?.user || null;
        setUser(u);
        const dn = u?.user_metadata?.display_name;
        if (dn) setPlayerName(String(dn).slice(0, 24));
      }).catch(() => setCloudOffline(true));
    } catch {
      setCloudOffline(true);
    }
    fetchTopScores(10).then(({ scores }) => setHall(scores));
  }, []);

  function popup(text, color) {
    const id = ++popupId.current;
    setPopups((p) => [...p, { id, text, color, x: 15 + Math.random() * 60 }]);
    setTimeout(() => setPopups((p) => p.filter((x) => x.id !== id)), 1300);
  }

  function startGame(nextMode, nextMatch = null) {
    sfx.ensure();
    sfx.horn();
    const g = new ColosseumGame(nextMode);
    gameRef.current = g;
    setMode(nextMode);
    setMatch(nextMatch);
    setResult(null);
    setSaved(false);
    setSaving(false);
    setRoomBoard([]);
    npcGloryRef.current = null;
    if (nextMatch?.mode === 'npc') {
      const seat = (nextMatch.roster || []).find((r) => r.kind === 'npc');
      const rival = seat?.npc || (nextMatch.roster || [])[0]?.npc;
      if (rival) {
        npcGloryRef.current = { name: rival.name, glory: simulateNpcGlory(rival.difficulty) };
      }
    }
    g.onEvent((type, payload = {}) => {
      // The bespoke arena SoundFX stays (crowd, announcer, sword work is its
      // identity); central FX pairs are layered for haptic-matched feedback.
      if (type === 'strike') { sfx.strike(); fx.hit(); }
      else if (type === 'kill') {
        sfx.kill(payload.combo);
        if (payload.combo >= 3) fx.levelUp(); // hot streak: arpeggio + buzz
        else fx.hit();
      } else if (type === 'finish') {
        sfx.finish();
        fx.gameWin(); // match finished: full fanfare
        popup(`FINISH! +${payload.points}`, '#fde047');
      } else if (type === 'kill' && payload.combo >= 3) {
        popup(`COMBO x${Math.min(payload.combo, 8)}`, '#5eead4');
      } else if (type === 'hurt') { sfx.hurt(); fx.hit(); }
      else if (type === 'shockwave') { sfx.inject(); fx.boost(); }
      else if (type === 'enrage') { sfx.enrage(); popup('THE CHAMPION RAGES', '#ef4444'); }
      else if (type === 'breach') { /* crowd gasp could go here */ }
      else if (type === 'over') onGameOver(g, nextMatch, payload);
      else if (type === 'ui') setSnap(g.snapshot());
    });
    setSnap(g.snapshot());
    setScreen('game');
  }

  function onGameOver(g, m, payload) {
    sfx.buzzer();
    const champion = g.enemies.find((e) => e.type === 'champion');
    const bossVictory = g.mode === 'boss' && payload.reason === 'championFallen';
    const res = {
      score: g.score,
      kills: g.kills,
      finishes: g.finishes,
      bestCombo: g.bestCombo,
      reason: payload.reason,
      bossMode: g.mode === 'boss',
      bossVictory,
      bossHpLeft: champion ? champion.hp : null,
      npc: npcGloryRef.current,
      room: m?.room || null,
    };
    setResult(res);
    if (res.room) {
      fetchRoomScores(res.room.room_code, 10).then(({ scores }) => setRoomBoard(scores));
    }
  }

  function quitToMenu() {
    gameRef.current = null;
    setMatch(null);
    setResult(null);
    setScreen('menu');
    fetchTopScores(10).then(({ scores }) => setHall(scores));
  }

  async function handleSave() {
    if (!gameRef.current || saving || saved) return;
    setSaving(true);
    const { ok } = await submitScore({
      playerName,
      score: gameRef.current.score,
      mode,
      roomCode: result?.room?.room_code,
    });
    setSaving(false);
    if (ok) {
      setSaved(true);
      fetchTopScores(10).then(({ scores }) => setHall(scores));
      if (result?.room) {
        fetchRoomScores(result.room.room_code, 10).then(({ scores }) => setRoomBoard(scores));
      }
    }
  }

  const g = gameRef.current;
  const championSnap = snap?.enemies?.find((e) => e.type === 'champion');

  return (
    <div className="min-h-dvh bg-[#0a0a10] text-white flex flex-col" style={{ fontFamily: 'system-ui, sans-serif' }}>
      {screen === 'menu' && (
        <main className="flex-1 flex flex-col items-center px-5 py-8 max-w-xl mx-auto w-full">
          <button
            onClick={() => router.push('/')}
            className="self-start text-sm text-white/50 hover:text-white/80 mb-6 min-h-[44px]"
          >
            ← Launcher
          </button>
          <div className="text-5xl mb-2" aria-hidden>⚔️</div>
          <h1 className="text-4xl font-black tracking-widest text-center">COLOSSEUM</h1>
          <p className="text-white/60 text-center mt-2 mb-8">
            Sixty seconds in the pit. Tap gladiators to strike them down.
            Chain kills for combos, finish the wounded for double glory.
          </p>

          {cloudOffline && (
            <div className="w-full mb-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-400/40 text-amber-200 text-sm text-center">
              Cloud features are offline — this page needs the database connection.
              Solo play still works; score saving and multiplayer are unavailable.
            </div>
          )}

          <div className="w-full space-y-3">
            <button
              onClick={() => startGame('arena')}
              className="w-full min-h-[60px] rounded-2xl bg-gradient-to-r from-teal-500 to-emerald-600 font-bold text-lg tracking-wide active:scale-[0.98]"
            >
              ⚔️ ENTER THE PIT
              <span className="block text-xs font-normal opacity-80">60 seconds · endless waves</span>
            </button>
            <button
              onClick={() => startGame('boss')}
              className="w-full min-h-[60px] rounded-2xl bg-gradient-to-r from-red-600 to-orange-600 font-bold text-lg tracking-wide active:scale-[0.98]"
            >
              👑 CHALLENGE THE CHAMPION
              <span className="block text-xs font-normal opacity-80">Face the Undying Champion herself</span>
            </button>
          </div>

          <div className="w-full mt-8">
            <h2 className="text-sm font-bold tracking-widest text-white/50 mb-3">OASIS MULTIPLAYER</h2>
            {cloudOffline ? (
              <p className="text-white/40 text-sm">
                Multiplayer needs the database connection — it&apos;s unavailable right now.
              </p>
            ) : (
              <OasisLobby
                gameSlug="colosseum"
                supabase={supabase}
                userId={user?.id || null}
                callsign={playerName}
                stats={{}}
                onLaunch={(m) => startGame(m.mode === 'boss' ? 'boss' : 'arena', m)}
                onExit={() => {}}
              />
            )}
          </div>

          <div className="w-full mt-8">
            <h2 className="text-sm font-bold tracking-widest text-white/50 mb-3">🏛️ HALL OF CHAMPIONS</h2>
            {hall.length === 0 ? (
              <p className="text-white/40 text-sm">No legends yet. Be the first.</p>
            ) : (
              <ol className="space-y-1">
                {hall.map((s, i) => (
                  <li key={s.id} className="flex justify-between text-sm bg-white/5 rounded-lg px-3 py-2">
                    <span className="text-white/70">{i + 1}. {s.player_name}</span>
                    <span className="font-bold text-amber-300">{s.score.toLocaleString()}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <button
            onClick={() => setShowHow((v) => !v)}
            className="mt-8 text-sm text-teal-300 underline min-h-[44px]"
          >
            {showHow ? 'Hide the rules' : 'How to play'}
          </button>
          {showHow && (
            <div className="w-full text-sm text-white/70 space-y-2 bg-white/5 rounded-2xl p-4 mt-2">
              <p>👆 <b>Tap a gladiator</b> to strike. Shade takes 2 hits, Swift 1 (but fast), Brute 4.</p>
              <p>💛 A gladiator flashing gold is <b>staggered</b> — strike now for a <b>finishing move: double glory</b>.</p>
              <p>🔥 Kills within 3 seconds chain a <b>combo</b>, up to 8× glory.</p>
              <p>⚡ Every kill charges your <b>Injector</b>. When full, unleash a shockwave that wounds everything.</p>
              <p>🛡️ Gladiators that reach the center cost you a heart. You have 3.</p>
              <p>👑 The Undying Champion has huge health and <b>enrages below 25%</b> — her breakthroughs cost 2 hearts.</p>
            </div>
          )}

          <a href="/colosseum/accord" className="mt-6 text-xs text-white/40 underline min-h-[44px] flex items-center">
            The Accord — terms & privacy
          </a>
        </main>
      )}

      {screen === 'game' && g && (
        <div className="relative flex-1 flex flex-col">
          <div className="absolute inset-0">
            <Pit game={g} snap={snap || g.snapshot()} />
          </div>

          {/* HUD */}
          <div className="absolute top-0 left-0 right-0 p-3 flex items-start justify-between pointer-events-none">
            <div className="bg-black/50 rounded-2xl px-4 py-2 backdrop-blur">
              <div className="text-2xl font-black text-amber-300">{(snap?.score ?? 0).toLocaleString()}</div>
              <div className="text-[10px] tracking-widest text-white/50">GLORY</div>
            </div>
            <div className="bg-black/50 rounded-2xl px-4 py-2 backdrop-blur text-center">
              <div className="text-2xl font-black">{fmtTime(snap?.timeLeft ?? ROUND_SECONDS)}</div>
              <div className="text-[10px] tracking-widest text-white/50">TIME</div>
            </div>
            <div className="flex flex-col gap-2 items-end">
              <div className="bg-black/50 rounded-2xl px-3 py-2 backdrop-blur text-lg">
                {'❤️'.repeat(snap?.hearts ?? 3)}{'🖤'.repeat(Math.max(0, 3 - (snap?.hearts ?? 3)))}
              </div>
              <div className="flex gap-2 pointer-events-auto">
                <button
                  onClick={() => setMuted((m) => !m)}
                  className="w-11 h-11 rounded-full bg-black/50 backdrop-blur text-lg"
                  aria-label={muted ? 'Unmute' : 'Mute'}
                >
                  {muted ? '🔇' : '🔊'}
                </button>
                <button
                  onClick={() => g.togglePause()}
                  className="w-11 h-11 rounded-full bg-black/50 backdrop-blur text-lg"
                  aria-label="Pause"
                >
                  ⏸️
                </button>
              </div>
            </div>
          </div>

          {/* combo badge */}
          {snap && snap.combo >= 2 && (
            <div className="absolute top-24 left-1/2 -translate-x-1/2 pointer-events-none">
              <div className="bg-teal-500/80 rounded-full px-4 py-1 font-black text-sm animate-pulse">
                COMBO x{Math.min(snap.combo, 8)}
              </div>
            </div>
          )}

          {/* boss HP bar */}
          {mode === 'boss' && championSnap && (
            <div className="absolute top-40 left-1/2 -translate-x-1/2 w-64 pointer-events-none">
              <div className="text-center text-xs font-bold tracking-widest text-red-300 mb-1">
                THE UNDYING CHAMPION
              </div>
              <div className="h-3 bg-black/60 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${championSnap.enraged ? 'bg-red-500 animate-pulse' : 'bg-gradient-to-r from-red-500 to-orange-400'}`}
                  style={{ width: `${(championSnap.hp / championSnap.maxHp) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* injector */}
          <div className="absolute bottom-6 right-4">
            <button
              onClick={() => g.inject()}
              disabled={!(snap?.injectorReady)}
              className={`w-20 h-20 rounded-full font-black text-xs tracking-wide border-2 ${
                snap?.injectorReady
                  ? 'bg-teal-500 border-teal-200 text-black animate-pulse active:scale-95'
                  : 'bg-black/50 border-white/20 text-white/50'
              }`}
            >
              ⚡
              <span className="block">{snap?.injector ?? 0}/{INJECTOR_MAX}</span>
            </button>
          </div>

          {/* popups */}
          {popups.map((p) => (
            <div
              key={p.id}
              className="absolute top-1/3 font-black text-2xl pointer-events-none animate-bounce"
              style={{ left: `${p.x}%`, color: p.color, textShadow: '0 2px 8px black' }}
            >
              {p.text}
            </div>
          ))}

          {/* pause overlay */}
          {snap?.paused && !result && (
            <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-4 z-10">
              <h2 className="text-3xl font-black tracking-widest">PAUSED</h2>
              <button
                onClick={() => g.togglePause()}
                className="min-h-[52px] px-8 rounded-2xl bg-teal-500 font-bold text-black"
              >
                RESUME
              </button>
              <button
                onClick={quitToMenu}
                className="min-h-[52px] px-8 rounded-2xl bg-white/10 font-bold"
              >
                QUIT TO MENU
              </button>
            </div>
          )}

          {/* game over */}
          {result && (
            <div className="absolute inset-0 bg-black/85 overflow-y-auto z-10">
              <div className="min-h-full flex flex-col items-center justify-center px-5 py-8 max-w-md mx-auto">
                <h2 className="text-4xl font-black tracking-widest text-center mb-1">
                  {result.bossMode
                    ? result.bossVictory ? '👑 CHAMPION SLAIN' : '💀 THE CHAMPION PREVAILS'
                    : result.reason === 'fallen' ? '💀 FALLEN' : '⏱️ TIME'}
                </h2>
                <p className="text-white/60 text-sm mb-6 text-center">
                  {result.bossMode && result.bossVictory
                    ? 'The crowd roars your name. The pit is yours.'
                    : result.bossMode
                      ? 'She stands undefeated. Train, and return.'
                      : result.reason === 'fallen'
                        ? 'The pit claims another.'
                        : 'The sands settle.'}
                </p>
                <div className="text-5xl font-black text-amber-300 mb-1">
                  {result.score.toLocaleString()}
                </div>
                <div className="text-xs tracking-widest text-white/50 mb-6">GLORY</div>

                <div className="grid grid-cols-3 gap-2 w-full mb-6">
                  <div className="bg-white/5 rounded-xl p-3 text-center">
                    <div className="text-xl font-bold">{result.kills}</div>
                    <div className="text-[10px] text-white/50 tracking-widest">KILLS</div>
                  </div>
                  <div className="bg-white/5 rounded-xl p-3 text-center">
                    <div className="text-xl font-bold text-yellow-300">{result.finishes}</div>
                    <div className="text-[10px] text-white/50 tracking-widest">FINISHES</div>
                  </div>
                  <div className="bg-white/5 rounded-xl p-3 text-center">
                    <div className="text-xl font-bold text-teal-300">x{Math.min(result.bestCombo, 8)}</div>
                    <div className="text-[10px] text-white/50 tracking-widest">BEST COMBO</div>
                  </div>
                </div>

                {/* NPC head-to-head */}
                {result.npc && (
                  <div className={`w-full rounded-2xl p-4 mb-4 ${result.score >= result.npc.glory ? 'bg-teal-500/20 border border-teal-400/40' : 'bg-white/5'}`}>
                    <div className="text-xs tracking-widest text-white/50 mb-2">OASIS QUICK MATCH</div>
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="font-bold">{result.score >= result.npc.glory ? '🏆 YOU' : result.npc.name}</div>
                        <div className="text-white/50 text-sm">{Math.max(result.score, result.npc.glory).toLocaleString()} glory</div>
                      </div>
                      <div className="text-white/40 text-sm">vs</div>
                      <div className="text-right">
                        <div className="font-bold">{result.score >= result.npc.glory ? result.npc.name : 'YOU'}</div>
                        <div className="text-white/50 text-sm">{Math.min(result.score, result.npc.glory).toLocaleString()} glory</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* party room board */}
                {result.room && (
                  <div className="w-full mb-4">
                    <div className="text-xs tracking-widest text-white/50 mb-2">
                      PARTY ROOM {result.room.room_code} — shared leaderboard
                    </div>
                    {roomBoard.length === 0 ? (
                      <p className="text-white/40 text-sm">No saved scores in this room yet.</p>
                    ) : (
                      <ol className="space-y-1">
                        {roomBoard.map((s, i) => (
                          <li key={s.id} className="flex justify-between text-sm bg-white/5 rounded-lg px-3 py-2">
                            <span className="text-white/70">{i + 1}. {s.player_name}</span>
                            <span className="font-bold text-amber-300">{s.score.toLocaleString()}</span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                )}

                {/* save */}
                {!saved ? (
                  <div className="w-full flex gap-2 mb-4">
                    <input
                      value={playerName}
                      onChange={(e) => setPlayerName(e.target.value.slice(0, 24))}
                      placeholder="Your gladiator name"
                      maxLength={24}
                      className="flex-1 min-h-[52px] rounded-2xl bg-white/10 px-4 text-white placeholder:text-white/30 outline-none"
                    />
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="min-h-[52px] px-6 rounded-2xl bg-amber-400 text-black font-bold disabled:opacity-50"
                    >
                      {saving ? '…' : 'SAVE'}
                    </button>
                  </div>
                ) : (
                  <p className="text-teal-300 text-sm mb-4">✓ Glory recorded in the Hall of Champions</p>
                )}

                <div className="w-full space-y-2">
                  <button
                    onClick={() => startGame(mode, match)}
                    className="w-full min-h-[52px] rounded-2xl bg-teal-500 text-black font-bold"
                  >
                    FIGHT AGAIN
                  </button>
                  <button
                    onClick={quitToMenu}
                    className="w-full min-h-[52px] rounded-2xl bg-white/10 font-bold"
                  >
                    MAIN MENU
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      <div aria-hidden="true" className="h-[calc(4.5rem+env(safe-area-inset-bottom))]" />
    </div>
  );
}
