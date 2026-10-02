// app/order-67/page.jsx — ORDER 67: holographic peer-to-peer calls.
// Each caller gets their own throne room; the peer materializes on the dais
// as a Palpatine-style hologram. Signaling rides the OASIS room pattern
// (6-char codes, ~2s polling); media is peer-to-peer WebRTC.
//
// "Summon test hologram" loops your own camera through the hologram shader
// so the effect works with no peer at all.

'use client';

import { useEffect, useRef, useState } from 'react';
import { BackButton } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { createThroneRoom } from './throne-room';
import {
  hostCall,
  joinCall,
  publishSignalPart,
  readSignalPart,
  fetchRoom,
  watchCall,
  endCall,
  normalizeCode,
  isValidRoomCode,
  isMissingMigrationError,
} from './signaling';
import {
  createPeerConnection,
  makeOffer,
  makeAnswer,
  acceptAnswer,
  closePeerConnection,
  stopStream,
} from './webrtc';
import {
  BACKDROP_REALMS,
  BACKDROP_NONE,
  BACKDROP_STORAGE_KEY,
  normalizeBackdropSelection,
} from '@/lib/order-67';
import {
  fetchFriends,
  fetchPendingRequests,
  searchPlayersClient,
  sendFriendRequest,
  respondToFriendshipClient,
  sendCallInvite,
} from '@/lib/friends';

const CSS = `
.o67-mono { font-family: ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, Consolas, monospace; }
.o67-chip-scroll { scrollbar-width: none; -ms-overflow-style: none; }
.o67-chip-scroll::-webkit-scrollbar { display: none; }
@keyframes o67-pulse-code { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
.o67-waiting { animation: o67-pulse-code 2.2s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .o67-waiting { animation: none; } }
`;

const MEDIA_CONSTRAINTS = {
  audio: true,
  video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
};

const REALM_LABEL = {
  ares: 'ARES', apollo: 'APOLLO', hermes: 'HERMES', hephaestus: 'HEPHAESTUS',
  athena: 'ATHENA', artemis: 'ARTEMIS', hestia: 'HESTIA', dionysus: 'DIONYSUS',
  plutus: 'PLUTUS', aphrodite: 'APHRODITE',
};

export default function Order67Page() {
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const unwatchRef = useRef(null);
  const answeredRef = useRef(false);
  const offeredRef = useRef(false);
  const roomCodeRef = useRef('');
  const mountedRef = useRef(true);

  const [phase, setPhase] = useState('idle'); // idle | hosting | joining | in-call | solo
  const [status, setStatus] = useState('Your throne room awaits.');
  const [busy, setBusy] = useState(false);
  const [roomCode, setRoomCodeState] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [muted, setMuted] = useState(false);
  const [backdrop, setBackdropState] = useState(BACKDROP_NONE);
  const [cloudError, setCloudError] = useState(null); // null | 'no-session' | 'no-db' | 'no-migration' | 'no-camera'
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [friends, setFriends] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [playerQuery, setPlayerQuery] = useState('');
  const [playerResults, setPlayerResults] = useState([]);
  const [searchingPlayers, setSearchingPlayers] = useState(false);
  const [sentRequests, setSentRequests] = useState([]);
  const [summoningName, setSummoningName] = useState('');
  const searchTimerRef = useRef(null);

  const setRoomCode = (c) => {
    roomCodeRef.current = c;
    setRoomCodeState(c);
  };

  // ---------- throne room lifecycle ----------
  useEffect(() => {
    mountedRef.current = true;
    const reduced = typeof window !== 'undefined'
      && window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const scene = createThroneRoom(canvasRef.current, { reducedMotion: !!reduced });
    sceneRef.current = scene;
    try {
      const saved = normalizeBackdropSelection(window.localStorage.getItem(BACKDROP_STORAGE_KEY));
      setBackdropState(saved);
      scene.setBackdrop(saved);
    } catch { /* private mode — void it is */ }

    return () => {
      mountedRef.current = false;
      if (unwatchRef.current) unwatchRef.current();
      closePeerConnection(pcRef.current);
      stopStream(localStreamRef.current);
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  const chooseBackdrop = (realm) => {
    const clean = normalizeBackdropSelection(realm);
    setBackdropState(clean);
    try {
      window.localStorage.setItem(BACKDROP_STORAGE_KEY, clean);
    } catch { /* ignore */ }
    sceneRef.current?.setBackdrop(clean);
  };

  // ---------- helpers ----------
  const getUserId = async () => {
    let session;
    try {
      ({ data: { session } } = await supabase.auth.getSession());
    } catch {
      setCloudError('no-db');
      return null;
    }
    if (!session?.user?.id) {
      setCloudError('no-session');
      return null;
    }
    return session.user.id;
  };

  const getLocalStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(MEDIA_CONSTRAINTS);
      return stream;
    } catch (e) {
      const name = e && e.name;
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setCloudError('no-camera');
      } else {
        setStatus('Could not reach your camera and mic — the throne room still works.');
      }
      return null;
    }
  };

  const handleCallError = (e) => {
    if (isMissingMigrationError(e)) {
      setCloudError('no-migration');
      setStatus('The database needs one update first.');
    } else {
      setStatus(e?.message ? String(e.message) : 'Something interrupted the summons.');
    }
    setPhase('idle');
  };

  const onRemoteStream = (stream) => {
    if (!mountedRef.current) return;
    const el = remoteVideoRef.current;
    if (el) {
      el.srcObject = stream;
      el.play().catch(() => {});
    }
    sceneRef.current?.setStream(el);
    sceneRef.current?.setProjecting(true);
    sceneRef.current?.showHologram();
    setPhase('in-call');
    setStatus('Your peer materializes.');
  };

  const hangUp = (msg) => {
    if (unwatchRef.current) {
      unwatchRef.current();
      unwatchRef.current = null;
    }
    if (roomCodeRef.current) endCall(roomCodeRef.current);
    closePeerConnection(pcRef.current);
    pcRef.current = null;
    stopStream(localStreamRef.current);
    localStreamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    sceneRef.current?.clearStream();
    sceneRef.current?.hideHologram();
    sceneRef.current?.setProjecting(false);
    answeredRef.current = false;
    offeredRef.current = false;
    setMuted(false);
    setRoomCode('');
    setJoinCode('');
    setSummoningName('');
    setPhase('idle');
    setStatus(msg || 'The channel closes.');
  };

  // ---------- friends ----------
  const getToken = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      return session?.access_token || '';
    } catch { return ''; }
  };

  const refreshFriends = async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const [f, p] = await Promise.all([fetchFriends(token), fetchPendingRequests(token)]);
      if (!mountedRef.current) return;
      setFriends(f.friends || []);
      setPendingRequests(p.requests || []);
    } catch { /* offline — keep last state */ }
  };

  const openFriends = () => {
    setFriendsOpen(true);
    refreshFriends();
  };

  const doPlayerSearch = async (q) => {
    const token = await getToken();
    if (!token) return;
    setSearchingPlayers(true);
    try {
      const data = await searchPlayersClient(token, q);
      if (!mountedRef.current) return;
      setPlayerResults(data.players || []);
    } catch {
      if (mountedRef.current) setPlayerResults([]);
    } finally {
      if (mountedRef.current) setSearchingPlayers(false);
    }
  };

  const onPlayerQueryChange = (v) => {
    setPlayerQuery(v);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (v.trim().length < 2) {
      setPlayerResults([]);
      setSearchingPlayers(false);
      return;
    }
    searchTimerRef.current = setTimeout(() => { doPlayerSearch(v); }, 450);
  };

  const addPlayer = async (player) => {
    try {
      const token = await getToken();
      if (!token) return;
      await sendFriendRequest(token, player.user_id);
      setSentRequests((s) => (s.includes(player.user_id) ? s : [...s, player.user_id]));
    } catch (e) {
      setStatus(e?.message ? String(e.message) : 'Could not send the request.');
    }
  };

  const answerRequest = async (friendshipId, action) => {
    try {
      const token = await getToken();
      if (!token) return;
      await respondToFriendshipClient(token, friendshipId, action);
      await refreshFriends();
    } catch (e) {
      setStatus(e?.message ? String(e.message) : 'Could not answer the request.');
    }
  };

  // ---------- host flow: EXECUTE ORDER 67 ----------
  const executeOrder67 = async (inviteFriend) => {
    if (busy || phase !== 'idle') return;
    setBusy(true);
    setCloudError(null);
    try {
      const userId = await getUserId();
      if (!userId) return;
      setStatus('Waking your camera…');
      const stream = await getLocalStream();
      if (!stream) return;
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(() => {});
      }
      setStatus('Opening your channel…');
      const room = await hostCall(userId);
      setRoomCode(room.room_code);

      const pc = createPeerConnection(onRemoteStream);
      pcRef.current = pc;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      setPhase('hosting');
      setStatus('Broadcasting your summons…');
      const sdp = await makeOffer(pc);
      if (!sdp) throw new Error('Could not prepare the call — try again.');
      await publishSignalPart(room.room_code, 'offer', sdp);
      if (!mountedRef.current) return;
      setStatus('Channel open — share the code.');

      unwatchRef.current = watchCall(room.room_code, (r) => {
        if (!mountedRef.current) return;
        if (r.status === 'finished') {
          hangUp('Your peer ended the call.');
          return;
        }
        if (!answeredRef.current) {
          const answer = readSignalPart(r, 'answer');
          if (answer) {
            answeredRef.current = true;
            setStatus('Your peer answers…');
            acceptAnswer(pc, answer).catch(() => {
              setStatus('The answer would not land — hang up and try again.');
            });
          }
        }
      });

      if (inviteFriend && mountedRef.current) {
        const name = inviteFriend.display_name || inviteFriend.username || 'your friend';
        setFriendsOpen(false);
        setSummoningName(name);
        setStatus(`Summoning ${name}…`);
        try {
          const token = await getToken();
          if (token) await sendCallInvite(token, inviteFriend.user_id, room.room_code);
        } catch { /* invite failed — the code is still shareable */ }
      }
    } catch (e) {
      handleCallError(e);
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  // ---------- guest flow: join by code ----------
  const answerSummons = async (room, pc, code) => {
    const offer = readSignalPart(room, 'offer');
    if (!offer || offeredRef.current) return;
    offeredRef.current = true;
    try {
      setStatus('Answering the summons…');
      const sdp = await makeAnswer(pc, offer);
      if (!sdp) throw new Error('Could not prepare the answer — try again.');
      await publishSignalPart(code, 'answer', sdp);
      if (mountedRef.current) setStatus('Connecting…');
    } catch (e) {
      handleCallError(e);
    }
  };

  const joinByCode = async () => {
    if (busy || phase !== 'idle') return;
    const clean = normalizeCode(joinCode);
    if (!isValidRoomCode(clean)) {
      setStatus('That code does not look right — six characters, no spaces.');
      return;
    }
    setBusy(true);
    setCloudError(null);
    try {
      const userId = await getUserId();
      if (!userId) return;
      setStatus('Waking your camera…');
      const stream = await getLocalStream();
      if (!stream) return;
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(() => {});
      }
      setPhase('joining');
      setStatus('Entering the channel…');
      const room = await joinCall(clean, userId);
      setRoomCode(clean);

      const pc = createPeerConnection(onRemoteStream);
      pcRef.current = pc;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      unwatchRef.current = watchCall(clean, (r) => {
        if (!mountedRef.current) return;
        if (r.status === 'finished') {
          hangUp('The channel closed.');
          return;
        }
        answerSummons(r, pc, clean);
      });
      // the offer may already be waiting
      const current = await fetchRoom(clean);
      if (current && mountedRef.current) {
        setStatus('The summons is here — answering…');
        await answerSummons(current, pc, clean);
      }
    } catch (e) {
      handleCallError(e);
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  // ---------- solo demo: your own camera as the hologram ----------
  const summonTestHologram = async () => {
    if (busy || phase !== 'idle') return;
    setBusy(true);
    setCloudError(null);
    try {
      setStatus('Waking your camera…');
      const stream = await getLocalStream();
      if (!stream) return;
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(() => {});
      }
      sceneRef.current?.setStream(localVideoRef.current, { mirror: true });
      sceneRef.current?.setProjecting(true);
      sceneRef.current?.showHologram();
      setPhase('solo');
      setStatus('Behold — you, as a hologram.');
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const endSolo = () => {
    stopStream(localStreamRef.current);
    localStreamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    sceneRef.current?.clearStream();
    sceneRef.current?.hideHologram();
    sceneRef.current?.setProjecting(false);
    setPhase('idle');
    setStatus('The test hologram fades.');
  };

  const toggleMute = () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !muted;
    stream.getAudioTracks().forEach((t) => { t.enabled = !next; });
    setMuted(next);
  };

  const inCall = phase === 'in-call';

  return (
    <main className="o67-mono relative h-dvh w-full overflow-hidden bg-black text-cyan-100 select-none">
      <style>{CSS}</style>

      {/* the throne room */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-label="Your throne room" />

      {/* hidden remote video: feeds the hologram texture (audio still plays) */}
      <video ref={remoteVideoRef} playsInline autoPlay className="pointer-events-none absolute h-px w-px opacity-0" aria-hidden="true" />

      {/* header */}
      <header className="absolute inset-x-0 top-0 z-20 flex items-start justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <BackButton label="EXIT" href="/" />
        <div className="text-right">
          <h1 className="text-lg font-black tracking-[0.3em] text-white" style={{ textShadow: '0 0 14px rgba(70,200,255,0.6)' }}>
            ORDER 67
          </h1>
          <p className="mt-0.5 text-[10px] tracking-[0.25em] text-cyan-300/70">HOLOGRAPHIC P2P CALLS</p>
        </div>
      </header>

      {/* status line */}
      <div className="pointer-events-none absolute inset-x-0 top-24 z-20 flex justify-center px-6">
        <p className={`text-center text-xs tracking-[0.2em] text-cyan-200/90 ${phase === 'hosting' || phase === 'joining' ? 'o67-waiting' : ''}`}>
          {status}
        </p>
      </div>

      {/* idle: the summons */}
      {phase === 'idle' && !cloudError && (
        <div className="absolute inset-x-0 bottom-44 z-20 flex flex-col items-center gap-3 px-6">
          <button
            onClick={() => executeOrder67()}
            disabled={busy}
            className="min-h-[56px] rounded-2xl border border-cyan-300/70 bg-cyan-400/15 px-10 text-base font-black tracking-[0.3em] text-white backdrop-blur-md transition hover:bg-cyan-400/25 active:scale-[0.98] disabled:opacity-50"
            style={{ boxShadow: '0 0 28px rgba(70,200,255,0.25)' }}
          >
            {busy ? 'SUMMONING…' : 'EXECUTE ORDER 67'}
          </button>
          <div className="flex w-full max-w-xs items-center gap-2">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
              onKeyDown={(e) => { if (e.key === 'Enter') joinByCode(); }}
              placeholder="ENTER CODE"
              aria-label="Room code"
              maxLength={6}
              autoComplete="off" autoCapitalize="characters" spellCheck={false}
              className="min-h-[44px] flex-1 rounded-xl border border-white/15 bg-black/50 px-4 text-center text-base tracking-[0.4em] text-white placeholder:text-zinc-600 focus:border-cyan-300/60 focus:outline-none backdrop-blur-md"
            />
            <button
              onClick={joinByCode}
              disabled={busy}
              className="min-h-[44px] rounded-xl border border-white/20 bg-black/50 px-5 text-xs font-bold tracking-[0.2em] text-cyan-200 backdrop-blur-md transition hover:border-cyan-300/60 disabled:opacity-50"
            >
              JOIN
            </button>
          </div>
          <button
            onClick={openFriends}
            disabled={busy}
            className="min-h-[44px] rounded-xl border border-white/20 bg-black/50 px-6 text-xs font-bold tracking-[0.25em] text-cyan-200 backdrop-blur-md transition hover:border-cyan-300/60 disabled:opacity-50"
          >
            CHOOSE FRIEND
          </button>
          <button
            onClick={summonTestHologram}
            disabled={busy}
            className="min-h-[44px] px-4 text-[11px] tracking-[0.25em] text-cyan-300/70 underline-offset-4 hover:text-cyan-200 hover:underline disabled:opacity-50"
          >
            SUMMON TEST HOLOGRAM
          </button>
        </div>
      )}

      {/* cloud errors: honest, actionable */}
      {phase === 'idle' && cloudError && (
        <div className="absolute inset-x-0 bottom-44 z-20 flex flex-col items-center gap-3 px-8 text-center">
          {cloudError === 'no-session' && (
            <>
              <p className="max-w-xs text-xs leading-relaxed text-zinc-300">
                Calls need you signed in — the signal server has to know who is calling whom.
              </p>
              <BackButton label="GO SIGN IN" href="/" />
            </>
          )}
          {cloudError === 'no-db' && (
            <p className="max-w-xs text-xs leading-relaxed text-zinc-300">
              The database is unreachable right now — calls, hosting, and joining all run through it.
              The throne room itself still works.
            </p>
          )}
          {cloudError === 'no-migration' && (
            <p className="max-w-xs text-xs leading-relaxed text-zinc-300">
              One database update stands between you and holograms: run{' '}
              <span className="text-cyan-300">supabase/order-67.sql</span> on the Supabase dashboard,
              then summon again.
            </p>
          )}
          {cloudError === 'no-camera' && (
            <>
              <p className="max-w-xs text-xs leading-relaxed text-zinc-300">
                Your camera and mic are blocked — allow access in the browser to place calls.
                The throne room and backdrops still work.
              </p>
              <button
                onClick={() => { setCloudError(null); setStatus('Your throne room awaits.'); }}
                className="min-h-[44px] rounded-xl border border-white/20 bg-black/50 px-6 text-xs tracking-[0.2em] text-cyan-200"
              >
                BACK TO THE THRONE
              </button>
            </>
          )}
        </div>
      )}

      {/* hosting: share the code */}
      {phase === 'hosting' && (
        <div className="absolute inset-x-0 bottom-44 z-20 flex flex-col items-center gap-3 px-6">
          <p className="text-[10px] tracking-[0.3em] text-cyan-300/70">YOUR CHANNEL CODE</p>
          <p className="o67-waiting text-5xl font-black tracking-[0.35em] text-white" style={{ textShadow: '0 0 24px rgba(70,200,255,0.7)' }}>
            {roomCode}
          </p>
          {summoningName ? (
            <p className="max-w-[240px] text-center text-[11px] leading-relaxed text-zinc-400">
              Summoning {summoningName} — the code is on its way to them.
            </p>
          ) : (
            <p className="max-w-[240px] text-center text-[11px] leading-relaxed text-zinc-400">
              Share it with your peer — they enter it on their own throne room screen.
            </p>
          )}
          <button
            onClick={() => hangUp('The channel closes.')}
            className="min-h-[44px] rounded-xl border border-red-400/40 bg-black/50 px-8 text-xs font-bold tracking-[0.25em] text-red-300 backdrop-blur-md transition hover:bg-red-400/10"
          >
            CLOSE CHANNEL
          </button>
        </div>
      )}

      {/* joining: brief transit state */}
      {phase === 'joining' && (
        <div className="absolute inset-x-0 bottom-44 z-20 flex flex-col items-center gap-3 px-6">
          <p className="o67-waiting text-2xl font-black tracking-[0.3em] text-white">{roomCode}</p>
          <button
            onClick={() => hangUp('You step back.')}
            className="min-h-[44px] rounded-xl border border-white/20 bg-black/50 px-8 text-xs tracking-[0.25em] text-zinc-300"
          >
            STEP BACK
          </button>
        </div>
      )}

      {/* in call / solo: local preview + controls */}
      {(inCall || phase === 'solo') && (
        <>
          <video
            ref={localVideoRef}
            playsInline autoPlay muted
            className="absolute bottom-40 right-4 z-20 aspect-[4/3] w-28 rounded-xl border border-cyan-300/40 bg-black object-cover"
            style={{ transform: 'scaleX(-1)' }}
            aria-label="Your camera preview"
          />
          <div className="absolute inset-x-0 bottom-40 z-20 flex items-center justify-center gap-3 px-6">
            <button
              onClick={toggleMute}
              className={`min-h-[44px] rounded-xl border px-6 text-xs font-bold tracking-[0.2em] backdrop-blur-md transition ${
                muted
                  ? 'border-amber-300/60 bg-amber-400/15 text-amber-200'
                  : 'border-white/20 bg-black/50 text-cyan-200 hover:border-cyan-300/60'
              }`}
            >
              {muted ? 'UNMUTE' : 'MUTE'}
            </button>
            <button
              onClick={() => (phase === 'solo' ? endSolo() : hangUp())}
              className="min-h-[44px] rounded-xl border border-red-400/50 bg-red-500/15 px-8 text-xs font-black tracking-[0.25em] text-red-200 backdrop-blur-md transition hover:bg-red-500/25"
            >
              {phase === 'solo' ? 'END DEMO' : 'HANG UP'}
            </button>
          </div>
        </>
      )}

      {/* friends sheet: choose a friend, search players, answer requests */}
      {friendsOpen && phase === 'idle' && (
        <div role="dialog" aria-label="Friends" className="absolute inset-0 z-30 flex flex-col bg-black/90 backdrop-blur-md">
          <div className="flex items-center justify-between px-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
            <h2 className="text-sm font-black tracking-[0.3em] text-white">CHOOSE YOUR COMPANY</h2>
            <button
              onClick={() => setFriendsOpen(false)}
              aria-label="Close friends"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-white/20 text-zinc-300 hover:text-white"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-6">
            {/* your friends */}
            <section aria-label="Your friends">
              <h3 className="mb-2 text-[10px] font-bold tracking-[0.3em] text-cyan-300/70">YOUR FRIENDS</h3>
              {friends.length === 0 ? (
                <p className="text-xs leading-relaxed text-zinc-500">
                  No friends yet — search players below to add some.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {friends.map((f) => (
                    <li
                      key={f.user_id}
                      className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/50 px-4 py-2.5"
                    >
                      <span
                        aria-hidden="true"
                        className="flex h-10 w-10 flex-none items-center justify-center rounded-full border border-cyan-300/40 bg-cyan-400/10 text-sm font-black text-cyan-200"
                      >
                        {(f.display_name || f.username || '?').charAt(0).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-white">{f.display_name}</span>
                        <span className="block truncate text-[11px] text-zinc-500">@{f.username}</span>
                      </span>
                      <button
                        onClick={() => executeOrder67(f)}
                        disabled={busy}
                        className="min-h-[44px] flex-none rounded-xl border border-cyan-300/60 bg-cyan-400/15 px-5 text-[11px] font-black tracking-[0.2em] text-white transition hover:bg-cyan-400/25 disabled:opacity-50"
                      >
                        SUMMON
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            {/* search players */}
            <section aria-label="Search players">
              <h3 className="mb-2 text-[10px] font-bold tracking-[0.3em] text-cyan-300/70">SEARCH PLAYERS</h3>
              <input
                value={playerQuery}
                onChange={(e) => onPlayerQueryChange(e.target.value)}
                placeholder="username or name"
                aria-label="Search players"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                className="min-h-[44px] w-full rounded-xl border border-white/15 bg-black/50 px-4 text-base text-white placeholder:text-zinc-600 focus:border-cyan-300/60 focus:outline-none select-text"
              />
              {searchingPlayers && (
                <p className="mt-2 text-xs text-zinc-500">Searching…</p>
              )}
              {!searchingPlayers && playerQuery.trim().length >= 2 && playerResults.length === 0 && (
                <p className="mt-2 text-xs text-zinc-500">No players match that name.</p>
              )}
              {playerResults.length > 0 && (
                <ul className="mt-2 flex flex-col gap-2">
                  {playerResults.map((pl) => (
                    <li
                      key={pl.user_id}
                      className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/50 px-4 py-2.5"
                    >
                      <span
                        aria-hidden="true"
                        className="flex h-10 w-10 flex-none items-center justify-center rounded-full border border-white/20 bg-white/5 text-sm font-black text-zinc-300"
                      >
                        {(pl.display_name || pl.username || '?').charAt(0).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-white">{pl.display_name}</span>
                        <span className="block truncate text-[11px] text-zinc-500">@{pl.username}</span>
                      </span>
                      {sentRequests.includes(pl.user_id) ? (
                        <span className="flex-none text-[11px] font-bold tracking-[0.2em] text-emerald-300/80">
                          REQUEST SENT
                        </span>
                      ) : (
                        <button
                          onClick={() => addPlayer(pl)}
                          className="min-h-[44px] flex-none rounded-xl border border-white/20 px-5 text-[11px] font-bold tracking-[0.2em] text-cyan-200 transition hover:border-cyan-300/60"
                        >
                          ADD
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            {/* incoming requests */}
            <section aria-label="Friend requests">
              <h3 className="mb-2 text-[10px] font-bold tracking-[0.3em] text-cyan-300/70">
                REQUESTS{pendingRequests.length > 0 ? ` (${pendingRequests.length})` : ''}
              </h3>
              {pendingRequests.length === 0 ? (
                <p className="text-xs text-zinc-500">No pending requests.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {pendingRequests.map((r) => (
                    <li
                      key={r.friendship_id}
                      className="flex items-center gap-3 rounded-xl border border-amber-200/20 bg-amber-100/[0.04] px-4 py-2.5"
                    >
                      <span
                        aria-hidden="true"
                        className="flex h-10 w-10 flex-none items-center justify-center rounded-full border border-amber-200/40 bg-amber-100/10 text-sm font-black text-amber-200"
                      >
                        {(r.requester.display_name || r.requester.username || '?').charAt(0).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-white">{r.requester.display_name}</span>
                        <span className="block truncate text-[11px] text-zinc-500">@{r.requester.username} wants to be friends</span>
                      </span>
                      <span className="flex flex-none gap-2">
                        <button
                          onClick={() => answerRequest(r.friendship_id, 'accept')}
                          className="min-h-[44px] rounded-xl bg-emerald-400/90 px-4 text-[11px] font-black tracking-[0.15em] text-emerald-950 transition hover:bg-emerald-300"
                        >
                          ACCEPT
                        </button>
                        <button
                          onClick={() => answerRequest(r.friendship_id, 'decline')}
                          className="min-h-[44px] rounded-xl border border-zinc-600 px-4 text-[11px] font-bold tracking-[0.15em] text-zinc-300 transition hover:border-zinc-400 hover:text-white"
                        >
                          DECLINE
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}

      {/* bottom control panel: realm backdrop picker */}
      <div className="absolute inset-x-0 bottom-0 z-20 border-t border-cyan-300/15 bg-black/70 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md">
        <p className="mb-2 text-center text-[9px] tracking-[0.35em] text-cyan-300/60">
          PROJECTED REALM BACKDROP
        </p>
        <div className="o67-chip-scroll flex gap-2 overflow-x-auto px-1 pb-1" role="radiogroup" aria-label="Realm backdrop">
          {[{ key: BACKDROP_NONE, label: 'VOID' }].concat(
            BACKDROP_REALMS.map((r) => ({ key: r, label: REALM_LABEL[r] }))
          ).map((opt) => {
            const active = backdrop === opt.key;
            return (
              <button
                key={opt.key}
                role="radio"
                aria-checked={active}
                onClick={() => chooseBackdrop(opt.key)}
                className={`min-h-[44px] shrink-0 rounded-full border px-4 text-[11px] font-bold tracking-[0.18em] transition ${
                  active
                    ? 'border-cyan-300/80 bg-cyan-400/20 text-white'
                    : 'border-white/15 bg-black/40 text-zinc-400 hover:border-cyan-300/40 hover:text-cyan-200'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-center text-[9px] leading-relaxed text-zinc-500">
          Peer-to-peer: video and audio travel directly between the two phones.
          The signal server only sees room codes — never your media.
        </p>
      </div>

      {/* Safari bottom-bar clearance */}
      <div aria-hidden="true" className="player-clear shrink-0" />
    </main>
  );
}
