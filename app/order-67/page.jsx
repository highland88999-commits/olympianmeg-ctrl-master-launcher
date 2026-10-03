// app/order-67/page.jsx — ORDER 67: holographic peer-to-peer calls.
//
// Each caller gets their own throne room; the peer materializes on the dais
// as a Palpatine-style hologram. Signaling rides the OASIS room pattern
// (6-char codes, ~2s polling); media is peer-to-peer WebRTC.
//
// UX: when a call (or solo test) starts, the header collapses into a slim bar
// (TikTok-live style) so the call owns the screen; a floating portal-vortex
// icon expands it back. Multi-guest calls fan up to 4 projector daises in an
// arc — mesh WebRTC, one 1:1 room per guest. Four is the ceiling on purpose:
// each extra guest is another full encode/decode pipeline on the phone, and
// beyond that the call needs an SFU media server (out of scope).
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
  monitorPeerConnection,
} from './webrtc';
import {
  BACKDROP_REALMS,
  BACKDROP_NONE,
  BACKDROP_STORAGE_KEY,
  MAX_GUEST_PROJECTORS,
  isCompactPhase,
  normalizeBackdropSelection,
} from '@/lib/order-67';
import {
  fetchFriends,
  fetchPendingRequests,
  searchPlayersClient,
  sendFriendRequest,
  respondToFriendshipClient,
  sendCallInvite,
  blockUserClient,
} from '@/lib/friends';

const CSS = `
.o67-mono { font-family: ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, Consolas, monospace; }
.o67-chip-scroll { scrollbar-width: none; -ms-overflow-style: none; }
.o67-chip-scroll::-webkit-scrollbar { display: none; }
@keyframes o67-pulse-code { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
.o67-waiting { animation: o67-pulse-code 2.2s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .o67-waiting { animation: none; } }
@keyframes o67-vortex-spin { to { transform: rotate(360deg); } }
.o67-vortex-video { animation: o67-vortex-spin 14s linear infinite; }
@media (prefers-reduced-motion: reduce) { .o67-vortex-video { animation: none; } }
`;

const mediaConstraints = (facing = 'user') => ({
  audio: true,
  video: { facingMode: facing, width: { ideal: 640 }, height: { ideal: 480 } },
});

const REALM_LABEL = {
  tartarus: 'TARTARUS',
  elysium: 'ELYSIUM',
  olympus: 'OLYMPUS',
  styx: 'STYX',
  aether: 'AETHER',
};

const JOIN_URL = (code) => `https://olympusverse.com/order-67?code=${code}`;

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
  const searchTimerRef = useRef(null);
  const confirmBlockTimerRef = useRef(null);
  // link-health: unmonitor fns + watchdog timers, all cleared on hangup/unmount
  const linkMonitorRef = useRef(null);
  const linkWatchdogRef = useRef(null);
  // multi-projector guests: id -> { id, name, code, pc, unwatch, videoEl, audioNodes, live, answered }
  const guestsRef = useRef(new Map());
  const audioCtxRef = useRef(null);

  const [phase, setPhase] = useState('idle'); // idle | hosting | joining | in-call | solo
  const [status, setStatus] = useState('Your throne room awaits.');
  const [busy, setBusy] = useState(false);
  const [roomCode, setRoomCodeState] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [muted, setMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [facingMode, setFacingMode] = useState('user'); // 'user' | 'environment'
  const [backdrop, setBackdropState] = useState(BACKDROP_NONE);
  const [cloudError, setCloudError] = useState(null); // null | 'no-session' | 'no-db' | 'no-migration' | 'no-camera'
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [friendsMode, setFriendsMode] = useState('summon'); // summon (idle) | invite (mid-call)
  const [friends, setFriends] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [playerQuery, setPlayerQuery] = useState('');
  const [playerResults, setPlayerResults] = useState([]);
  const [searchingPlayers, setSearchingPlayers] = useState(false);
  const [sentRequests, setSentRequests] = useState([]);
  const [summoningName, setSummoningName] = useState('');
  const [confirmBlockId, setConfirmBlockId] = useState(null);
  const [guests, setGuests] = useState([]); // [{ id, name, code, live }]
  // compact-on-join: slim header while a call owns the screen
  const [headerExpanded, setHeaderExpanded] = useState(false);
  const [reducedMotion] = useState(() => (
    typeof window !== 'undefined'
    && !!window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ));

  // refs that mirror state for use inside async callbacks
  const mutedRef = useRef(muted);
  const speakerOnRef = useRef(speakerOn);
  const cameraOnRef = useRef(cameraOn);
  const setMutedBoth = (v) => { mutedRef.current = v; setMuted(v); };
  const setSpeakerBoth = (v) => { speakerOnRef.current = v; setSpeakerOn(v); };
  const setCameraBoth = (v) => { cameraOnRef.current = v; setCameraOn(v); };

  const inCall = phase === 'in-call';
  const inSolo = phase === 'solo';
  const compact = isCompactPhase(phase);

  const setRoomCode = (c) => {
    roomCodeRef.current = c;
    setRoomCodeState(c);
  };

  const syncGuestList = () => {
    if (!mountedRef.current) return;
    setGuests([...guestsRef.current.values()].map((g) => ({
      id: g.id, name: g.name, code: g.code, live: !!g.live,
    })));
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
    // deep link: /order-67?code=XXXXXX (share invites, bell join buttons).
    // The code is pre-filled; joining still needs a tap + a signed-in session.
    try {
      const q = new URLSearchParams(window.location.search);
      const c = normalizeCode(q.get('code') || '');
      if (isValidRoomCode(c)) {
        setJoinCode(c);
        setStatus(`Code ${c} is loaded — sign in, then tap JOIN.`);
      }
    } catch { /* ignore */ }

    return () => {
      mountedRef.current = false;
      if (unwatchRef.current) unwatchRef.current();
      clearLinkHealth();
      for (const g of guestsRef.current.values()) {
        try { if (g.unwatch) g.unwatch(); } catch { /* noop */ }
        try { if (g.unmonitor) g.unmonitor(); } catch { /* noop */ }
        closePeerConnection(g.pc);
        if (g.videoEl) g.videoEl.srcObject = null;
        try { g.audioNodes?.src?.disconnect(); g.audioNodes?.gain?.disconnect(); } catch { /* noop */ }
      }
      guestsRef.current.clear();
      if (audioCtxRef.current) {
        try { audioCtxRef.current.close(); } catch { /* noop */ }
        audioCtxRef.current = null;
      }
      closePeerConnection(pcRef.current);
      stopStream(localStreamRef.current);
      if (confirmBlockTimerRef.current) clearTimeout(confirmBlockTimerRef.current);
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  // projection fit: the camera reframes whenever the phase changes —
  // 'call' pulls back so dais + hologram sit in the phone-portrait band.
  useEffect(() => {
    sceneRef.current?.setFraming(compact ? 'call' : 'idle');
  }, [phase, compact]);

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

  const getLocalStream = async (facing = 'user') => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(mediaConstraints(facing));
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

  // mute / camera-off states persist across every fresh stream (flips, rejoins)
  const applyLocalTrackStates = (stream) => {
    if (!stream) return;
    stream.getAudioTracks().forEach((t) => { t.enabled = !mutedRef.current; });
    stream.getVideoTracks().forEach((t) => { t.enabled = cameraOnRef.current; });
  };

  const attachLocalPreview = (stream) => {
    const el = localVideoRef.current;
    if (el && stream) {
      el.srcObject = stream;
      el.play().catch(() => {});
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

  // ---------- link health: never leave the user staring at "Connecting…" ---
  // WebRTC only calls ontrack on success. Without this, a dead P2P link
  // (strict NAT, carrier firewall, no TURN) parks the UI on a pulsing
  // "Connecting…" forever. Every branch below ends in an honest message.
  const LINK_FAILED_MSG =
    'The peer-to-peer link failed — a strict network may be blocking it. ' +
    'Try Wi-Fi instead of cellular, then summon again.';
  const LINK_LOST_MSG =
    'The peer-to-peer link dropped and did not recover. Hang up and summon again.';

  const clearLinkHealth = () => {
    if (linkMonitorRef.current) {
      try {
        linkMonitorRef.current();
      } catch {
        /* noop */
      }
      linkMonitorRef.current = null;
    }
    if (linkWatchdogRef.current) {
      clearTimeout(linkWatchdogRef.current);
      linkWatchdogRef.current = null;
    }
  };

  // Wire connection-state monitoring onto a live RTCPeerConnection.
  // onLinkDead runs when the link is terminally failed; the caller decides
  // whether to hang up (1:1 call) or just flag the guest (projector).
  const watchLinkHealth = (pc, onLinkDead) => {
    clearLinkHealth();
    if (!pc) return;
    linkMonitorRef.current = monitorPeerConnection(pc, {
      onFailed: () => {
        if (!mountedRef.current) return;
        onLinkDead(LINK_FAILED_MSG);
      },
      onDisconnected: () => {
        if (!mountedRef.current) return;
        onLinkDead(LINK_LOST_MSG);
      },
      onConnected: () => {
        if (!mountedRef.current) return;
        if (linkWatchdogRef.current) {
          clearTimeout(linkWatchdogRef.current);
          linkWatchdogRef.current = null;
        }
        setStatus('Peer link established.');
      },
    });
  };

  // After the SDP handshake, the link should establish within ~25s. If it
  // does not, say so honestly instead of pulsing forever.
  const armLinkWatchdog = (pc, giveUp) => {
    if (linkWatchdogRef.current) clearTimeout(linkWatchdogRef.current);
    linkWatchdogRef.current = setTimeout(() => {
      linkWatchdogRef.current = null;
      if (!mountedRef.current || !pc) return;
      const s = pc.connectionState;
      if (s !== 'connected' && s !== 'completed' && s !== 'closed') {
        setStatus(
          'Still connecting — your network may be blocking peer-to-peer. ' +
            'Hang up and try again on Wi-Fi.'
        );
        if (giveUp) giveUp();
      }
    }, 25000);
  };

  // guest audio mixer: each guest's audio rides the Web Audio graph so every
  // hologram is heard even though their <video> elements stay muted for
  // autoplay. Created/resumed inside the tap that opens the projector.
  const ensureAudioMixer = () => {
    try {
      if (!audioCtxRef.current) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        audioCtxRef.current = new AC();
      }
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      }
      return audioCtxRef.current;
    } catch { return null; }
  };

  const onRemoteStream = (stream) => {
    if (!mountedRef.current) return;
    const el = remoteVideoRef.current;
    if (el) {
      el.srcObject = stream;
      el.muted = !speakerOnRef.current;
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
    clearLinkHealth();
    if (roomCodeRef.current) endCall(roomCodeRef.current).catch(() => {});
    closePeerConnection(pcRef.current);
    pcRef.current = null;
    // guests leave with the call — every projector room is closed
    for (const g of guestsRef.current.values()) {
      try { if (g.unwatch) g.unwatch(); } catch { /* noop */ }
      try { if (g.unmonitor) g.unmonitor(); } catch { /* noop */ }
      if (g.code) endCall(g.code).catch(() => {});
      closePeerConnection(g.pc);
      if (g.videoEl) g.videoEl.srcObject = null;
      try { g.audioNodes?.src?.disconnect(); g.audioNodes?.gain?.disconnect(); } catch { /* noop */ }
      sceneRef.current?.clearProjectorStream(g.id);
      sceneRef.current?.hideProjector(g.id);
      sceneRef.current?.removeProjector(g.id);
    }
    guestsRef.current.clear();
    syncGuestList();
    stopStream(localStreamRef.current);
    localStreamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    sceneRef.current?.clearStream();
    sceneRef.current?.hideHologram();
    sceneRef.current?.setProjecting(false);
    answeredRef.current = false;
    offeredRef.current = false;
    setMutedBoth(false);
    setCameraBoth(true);
    setRoomCode('');
    setJoinCode('');
    setSummoningName('');
    setHeaderExpanded(false);
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
    setFriendsMode('summon');
    setFriendsOpen(true);
    refreshFriends();
  };

  // in-call: open the friends list in invite mode — inviting adds a projector
  // room and never touches the existing connection
  const openInviteFriends = () => {
    setFriendsMode('invite');
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

  // two-tap block, no pop-ups: first tap arms, second tap within 3s executes.
  // Silent — the blocked user is never notified.
  const doBlockUser = async (userId) => {
    if (confirmBlockId !== userId) {
      setConfirmBlockId(userId);
      if (confirmBlockTimerRef.current) clearTimeout(confirmBlockTimerRef.current);
      confirmBlockTimerRef.current = setTimeout(() => {
        if (mountedRef.current) setConfirmBlockId(null);
      }, 3000);
      return;
    }
    if (confirmBlockTimerRef.current) clearTimeout(confirmBlockTimerRef.current);
    setConfirmBlockId(null);
    try {
      const token = await getToken();
      if (!token) return;
      await blockUserClient(token, userId);
      await refreshFriends();
      setPlayerResults((r) => r.filter((p) => p.user_id !== userId));
      setStatus('Blocked. They cannot reach you here, and they will not be told.');
    } catch (e) {
      setStatus(e?.message ? String(e.message) : 'Could not block this player.');
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
      const stream = await getLocalStream(facingMode);
      if (!stream) return;
      applyLocalTrackStates(stream);
      localStreamRef.current = stream;
      attachLocalPreview(stream);
      setStatus('Opening your channel…');
      const room = await hostCall(userId);
      setRoomCode(room.room_code);

      const pc = createPeerConnection(onRemoteStream);
      pcRef.current = pc;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      // a dead P2P link must say so — never pulse "Connecting…" forever
      watchLinkHealth(pc, (msg) => hangUp(msg));

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
            acceptAnswer(pc, answer)
              .then(() => {
                if (mountedRef.current) armLinkWatchdog(pc);
              })
              .catch(() => {
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
      if (mountedRef.current) {
        setStatus('Connecting…');
        armLinkWatchdog(pc);
      }
    } catch (e) {
      handleCallError(e);
    }
  };

  const joinByCode = async () => {
    if (busy || phase !== 'idle') return;
    const clean = normalizeCode(joinCode);
    if (!isValidRoomCode(clean)) {
      setStatus('That code does not look right — six letters or numbers.');
      return;
    }
    setBusy(true);
    setCloudError(null);
    try {
      const userId = await getUserId();
      if (!userId) return;
      setStatus('Waking your camera…');
      const stream = await getLocalStream(facingMode);
      if (!stream) return;
      applyLocalTrackStates(stream);
      localStreamRef.current = stream;
      attachLocalPreview(stream);

      setStatus('Finding the channel…');
      const room = await joinCall(clean, userId);
      setRoomCode(clean);

      const pc = createPeerConnection(onRemoteStream);
      pcRef.current = pc;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      // a dead P2P link must say so — never pulse "Connecting…" forever
      watchLinkHealth(pc, (msg) => hangUp(msg));

      setPhase('joining');
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
      const stream = await getLocalStream(facingMode);
      if (!stream) return;
      applyLocalTrackStates(stream);
      localStreamRef.current = stream;
      attachLocalPreview(stream);
      if (cameraOnRef.current) {
        sceneRef.current?.setStream(localVideoRef.current, { mirror: facingMode === 'user' });
        sceneRef.current?.setProjecting(true);
        sceneRef.current?.showHologram();
      }
      setPhase('solo');
      setStatus(cameraOnRef.current ? 'Behold — you, as a hologram.' : 'Solo test — camera is off, tap CAM to appear.');
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
    setMutedBoth(false);
    setCameraBoth(true);
    setHeaderExpanded(false);
    setPhase('idle');
    setStatus('The test hologram fades.');
  };

  // ---------- call controls ----------
  const toggleMute = () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !mutedRef.current;
    stream.getAudioTracks().forEach((t) => { t.enabled = !next; });
    setMutedBoth(next);
    setStatus(next ? 'You are muted.' : 'You are unmuted.');
  };

  const toggleSpeaker = () => {
    const next = !speakerOnRef.current;
    setSpeakerBoth(next);
    const el = remoteVideoRef.current;
    if (el) el.muted = !next;
    for (const g of guestsRef.current.values()) {
      try { if (g.audioNodes?.gain) g.audioNodes.gain.gain.value = next ? 1 : 0; } catch { /* noop */ }
    }
    setStatus(next ? 'Speaker on.' : 'Call audio muted.');
  };

  const toggleCamera = () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !cameraOnRef.current;
    stream.getVideoTracks().forEach((t) => { t.enabled = next; });
    setCameraBoth(next);
    // solo: the hologram IS your camera — hide it when the camera is off
    if (inSolo) {
      if (next) {
        sceneRef.current?.setStream(localVideoRef.current, { mirror: facingMode === 'user' });
        sceneRef.current?.showHologram();
      } else {
        sceneRef.current?.clearStream();
        sceneRef.current?.hideHologram();
      }
    }
    setStatus(next ? 'Camera on.' : 'Camera off — your peer hears you but cannot see you.');
  };

  // ---------- camera flip: front <-> back, live, no renegotiation ----------
  // The hologram source stays the device camera in every mode: solo demo,
  // P2P calls, and under the realm dome. The old stream is only stopped
  // after the new one is live, so a failed flip never kills the call.
  const switchCamera = async () => {
    if (busy || !(inSolo || inCall || phase === 'hosting')) return;
    const next = facingMode === 'user' ? 'environment' : 'user';
    setBusy(true);
    try {
      let stream = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia(mediaConstraints(next));
      } catch {
        stream = null;
      }
      if (!stream || !mountedRef.current) {
        setStatus('Could not switch camera — keeping the current one.');
        return;
      }
      applyLocalTrackStates(stream);
      stopStream(localStreamRef.current);
      localStreamRef.current = stream;
      attachLocalPreview(stream);
      // swap the outbound video track without renegotiating the call
      const videoTrack = stream.getVideoTracks()[0];
      const swapOn = (pc) => {
        if (!pc || !videoTrack) return;
        const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
        if (sender && typeof sender.replaceTrack === 'function') {
          sender.replaceTrack(videoTrack).catch(() => { /* keep the old track */ });
        }
      };
      swapOn(pcRef.current);
      for (const g of guestsRef.current.values()) swapOn(g.pc);
      // re-feed the hologram texture (mirror only the front camera)
      if (inSolo && cameraOnRef.current) {
        sceneRef.current?.setStream(localVideoRef.current, { mirror: next === 'user' });
      }
      setFacingMode(next);
      setStatus(next === 'user' ? 'Front camera.' : 'Back camera.');
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  // ---------- external share invite ----------
  // Native share sheet with a ?code= deep link; clipboard fallback.
  // A signed-out visitor lands on Order 67 with the code pre-filled and an
  // honest prompt to sign in first (calls need a session).
  const shareInvite = async (code) => {
    const clean = normalizeCode(code || '');
    if (!isValidRoomCode(clean)) {
      setStatus('No channel code to share yet.');
      return;
    }
    const url = JOIN_URL(clean);
    const text = `Join my Order 67 hologram call — code ${clean}. Open the link, sign in, and tap JOIN.`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Order 67 call', text, url });
        return;
      }
      throw new Error('no-share');
    } catch (e) {
      if (e && e.name === 'AbortError') return; // dismissed — not an error
      try {
        await navigator.clipboard.writeText(`${text} ${url}`);
        setStatus('Invite link copied — send it to your peer.');
      } catch {
        setStatus(`Share this code: ${clean}`);
      }
    }
  };

  // ---------- multi-projector guests ----------
  // Each guest is a fresh 1:1 room (their own offer/answer pair) — the
  // existing main connection is never touched. Returns the guest room code.
  const addProjector = async (friend = null) => {
    if (busy) return null;
    if (guestsRef.current.size >= MAX_GUEST_PROJECTORS) {
      setStatus(
        `Four holograms is the ceiling — a phone cannot mesh more than ${MAX_GUEST_PROJECTORS} guests. ` +
        'Beyond that the call needs a media server.'
      );
      return null;
    }
    setBusy(true);
    try {
      const userId = await getUserId();
      if (!userId) return null;
      let stream = localStreamRef.current;
      if (!stream) {
        stream = await getLocalStream(facingMode);
        if (!stream) return null;
        applyLocalTrackStates(stream);
        localStreamRef.current = stream;
        attachLocalPreview(stream);
      }
      const room = await hostCall(userId);
      const code = room.room_code;
      const name = friend
        ? (friend.display_name || friend.username || 'Friend')
        : 'Guest';
      const id = `g${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
      const pc = createPeerConnection((s) => onGuestStream(id, s));
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      // guests get their own link monitor — a dead guest projector is
      // removed with an honest message, never left pulsing
      const guestUnmonitor = monitorPeerConnection(pc, {
        onFailed: () => {
          if (mountedRef.current) removeGuest(id, `${name}'s projector link failed — invite them again.`);
        },
        onDisconnected: () => {
          if (mountedRef.current) removeGuest(id, `${name}'s projector link dropped.`);
        },
      });
      const sdp = await makeOffer(pc);
      if (!sdp) throw new Error('Could not prepare the projector — try again.');
      await publishSignalPart(code, 'offer', sdp);

      const videoEl = document.createElement('video');
      videoEl.playsInline = true;
      videoEl.autoplay = true;
      videoEl.muted = true; // video only — audio rides the mixer
      videoEl.setAttribute('aria-hidden', 'true');
      sceneRef.current?.addProjector(id);
      const rec = { id, name, code, pc, videoEl, audioNodes: null, live: false, answered: false, unwatch: null, unmonitor: guestUnmonitor };
      rec.unwatch = watchCall(code, (r) => onGuestSignal(rec, r));
      guestsRef.current.set(id, rec);
      ensureAudioMixer();
      syncGuestList();

      if (friend) {
        setStatus(`Inviting ${name} — they join as a hologram alongside the call.`);
        try {
          const token = await getToken();
          if (token) await sendCallInvite(token, friend.user_id, code);
        } catch (e) {
          // the projector room is still open — the invite just did not send
          setStatus(e?.message ? String(e.message) : 'Projector open, but the invite did not send.');
        }
      } else {
        setStatus(`Projector ${code} is open — share the code or the link.`);
      }
      return code;
    } catch (e) {
      handleCallError(e);
      return null;
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const onGuestStream = (id, stream) => {
    const rec = guestsRef.current.get(id);
    if (!rec || !mountedRef.current) return;
    rec.videoEl.srcObject = stream;
    rec.videoEl.play().catch(() => {});
    sceneRef.current?.setProjectorStream(id, rec.videoEl, { mirror: false });
    sceneRef.current?.showProjector(id);
    // guest audio through the mixer (their video element stays muted)
    try {
      const ctx = ensureAudioMixer();
      const audioTracks = stream.getAudioTracks();
      if (ctx && audioTracks.length > 0) {
        const src = ctx.createMediaStreamSource(stream);
        const gain = ctx.createGain();
        gain.gain.value = speakerOnRef.current ? 1 : 0;
        src.connect(gain);
        gain.connect(ctx.destination);
        rec.audioNodes = { src, gain };
      }
    } catch { /* video-only hologram then */ }
    rec.live = true;
    syncGuestList();
    setStatus(`${rec.name} materializes.`);
  };

  const onGuestSignal = async (rec, room) => {
    if (!mountedRef.current || !guestsRef.current.has(rec.id)) return;
    if (room.status === 'finished') {
      removeGuest(rec.id, `${rec.name} left the call.`);
      return;
    }
    if (!rec.answered) {
      const answer = readSignalPart(room, 'answer');
      if (answer) {
        rec.answered = true;
        try {
          await acceptAnswer(rec.pc, answer);
        } catch {
          rec.answered = false; // retry on the next poll
        }
      }
    }
  };

  const removeGuest = (id, msg) => {
    const rec = guestsRef.current.get(id);
    if (!rec) return;
    try { if (rec.unwatch) rec.unwatch(); } catch { /* noop */ }
    try { if (rec.unmonitor) rec.unmonitor(); } catch { /* noop */ }
    if (rec.code) endCall(rec.code).catch(() => {});
    closePeerConnection(rec.pc);
    if (rec.videoEl) rec.videoEl.srcObject = null;
    try { rec.audioNodes?.src?.disconnect(); rec.audioNodes?.gain?.disconnect(); } catch { /* noop */ }
    sceneRef.current?.clearProjectorStream(id);
    sceneRef.current?.hideProjector(id);
    sceneRef.current?.removeProjector(id);
    guestsRef.current.delete(id);
    syncGuestList();
    if (msg && mountedRef.current) setStatus(msg);
  };

  // in-call "add friend": the friend gets a fresh projector room via the
  // normal multi-projector path — the existing connection never drops.
  const inviteToCall = async (friend) => {
    const code = await addProjector(friend);
    if (code) setFriendsOpen(false);
  };

  // in-call share: open a projector room for a link-invite, then share it.
  const shareGuestInvite = async () => {
    const code = await addProjector(null);
    if (code) shareInvite(code);
  };

  // ---------- render helpers ----------
  const renderRealmChips = () => (
    <div className="o67-chip-scroll flex gap-2 overflow-x-auto px-1 pb-1" role="radiogroup" aria-label="Realm backdrop">
      {[{ key: BACKDROP_NONE, label: 'VOID' }].concat(
        BACKDROP_REALMS.map((r) => ({ key: r, label: REALM_LABEL[r] }))
      ).map((opt) => {
        const active = backdrop === opt.key;
        const thumb = opt.key === BACKDROP_NONE
          ? null
          : `/images/menu/banners/banner-${opt.key}.webp`;
        return (
          <button
            key={opt.key}
            role="radio"
            aria-checked={active}
            aria-label={`Realm backdrop: ${opt.label}`}
            onClick={() => chooseBackdrop(opt.key)}
            className={`min-h-[64px] w-[92px] shrink-0 overflow-hidden rounded-xl border text-left transition ${
              active
                ? 'border-cyan-300/80 bg-cyan-400/15'
                : 'border-white/15 bg-black/40 hover:border-cyan-300/40'
            }`}
          >
            {thumb ? (
              <img
                src={thumb}
                alt=""
                aria-hidden="true"
                loading="lazy"
                className="h-9 w-full object-cover"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            ) : (
              <div className="h-9 w-full bg-gradient-to-b from-zinc-800/80 to-black" aria-hidden="true" />
            )}
            <span className={`block px-2 py-1.5 text-center text-[10px] font-bold tracking-[0.18em] ${
              active ? 'text-white' : 'text-zinc-400'
            }`}>
              {opt.label}
            </span>
          </button>
        );
      })}
    </div>
  );

  const ctrlBtn = 'min-h-[48px] flex-1 rounded-xl border px-2 text-[10px] font-bold tracking-[0.12em] backdrop-blur-md transition active:scale-[0.97]';

  const renderControlCluster = () => (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <button
          onClick={toggleMute}
          className={`${ctrlBtn} ${
            muted
              ? 'border-amber-300/60 bg-amber-400/15 text-amber-200'
              : 'border-white/20 bg-black/50 text-cyan-200 hover:border-cyan-300/60'
          }`}
        >
          {muted ? 'UNMUTE' : 'MUTE'}
        </button>
        <button
          onClick={toggleSpeaker}
          className={`${ctrlBtn} ${
            speakerOn
              ? 'border-white/20 bg-black/50 text-cyan-200 hover:border-cyan-300/60'
              : 'border-zinc-600/60 bg-zinc-800/40 text-zinc-400'
          }`}
        >
          SPEAKER
        </button>
        <button
          onClick={toggleCamera}
          className={`${ctrlBtn} ${
            cameraOn
              ? 'border-white/20 bg-black/50 text-cyan-200 hover:border-cyan-300/60'
              : 'border-amber-300/60 bg-amber-400/15 text-amber-200'
          }`}
        >
          CAM
        </button>
        <button
          onClick={switchCamera}
          disabled={busy}
          aria-label="Switch camera"
          className={`${ctrlBtn} border-cyan-300/50 bg-cyan-400/10 text-cyan-100 hover:border-cyan-300/80 disabled:opacity-50`}
        >
          FLIP
        </button>
      </div>
      {inCall ? (
        <>
          <div className="flex items-center gap-2">
            <button
              onClick={() => addProjector(null)}
              disabled={busy}
              className={`${ctrlBtn} border-cyan-300/50 bg-cyan-400/10 text-cyan-100 hover:border-cyan-300/80 disabled:opacity-50`}
            >
              ADD PROJECTOR
            </button>
            <button
              onClick={openInviteFriends}
              disabled={busy}
              className={`${ctrlBtn} border-white/20 bg-black/50 text-cyan-200 hover:border-cyan-300/60 disabled:opacity-50`}
            >
              ADD FRIEND
            </button>
            <button
              onClick={shareGuestInvite}
              disabled={busy}
              className={`${ctrlBtn} border-white/20 bg-black/50 text-cyan-200 hover:border-cyan-300/60 disabled:opacity-50`}
            >
              SHARE
            </button>
          </div>
          <button
            onClick={() => hangUp()}
            className="min-h-[48px] rounded-xl border border-red-400/50 bg-red-500/15 px-8 text-xs font-black tracking-[0.25em] text-red-200 backdrop-blur-md transition hover:bg-red-500/25 active:scale-[0.98]"
          >
            HANG UP
          </button>
        </>
      ) : (
        <button
          onClick={endSolo}
          className="min-h-[48px] rounded-xl border border-red-400/50 bg-red-500/15 px-8 text-xs font-black tracking-[0.25em] text-red-200 backdrop-blur-md transition hover:bg-red-500/25 active:scale-[0.98]"
        >
          END DEMO
        </button>
      )}
    </div>
  );

  const previewVisible = inCall || inSolo;

  return (
    <main className="o67-mono relative h-dvh w-full overflow-hidden bg-black text-cyan-100 select-none">
      <style>{CSS}</style>

      {/* the throne room */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-label="Your throne room" />

      {/* hidden remote video: feeds the hologram texture (audio still plays) */}
      <video ref={remoteVideoRef} playsInline autoPlay className="pointer-events-none absolute h-px w-px opacity-0" aria-hidden="true" />

      {/* local preview: always mounted so no stream assignment ever hits a null ref.
          Pinned bottom-center, above the control cluster and the Safari bar —
          the hologram owns the dais/stage above, this never overlaps it. */}
      <video
        ref={localVideoRef}
        playsInline autoPlay muted
        aria-label="Your camera preview"
        style={{
          transform: facingMode === 'user' ? 'translateX(-50%) scaleX(-1)' : 'translateX(-50%)',
          bottom: 'calc(max(0.9rem, env(safe-area-inset-bottom)) + 12.5rem)',
        }}
        className={`absolute left-1/2 z-20 aspect-[4/3] w-24 rounded-xl border bg-black object-cover transition-opacity ${
          previewVisible ? 'border-cyan-300/40 opacity-100' : 'pointer-events-none border-transparent opacity-0'
        } ${previewVisible && !cameraOn ? 'opacity-40' : ''}`}
      />
      {previewVisible && !cameraOn && (
        <p
          className="absolute left-1/2 z-20 rounded-md bg-black/70 px-2 py-1 text-[9px] font-bold tracking-[0.2em] text-amber-200"
          style={{
            transform: 'translateX(-50%)',
            bottom: 'calc(max(0.9rem, env(safe-area-inset-bottom)) + 16.75rem)',
          }}
        >
          CAM OFF
        </p>
      )}

      {/* header: full on idle, slim bar once the call owns the screen */}
      {!compact && (
        <header className="absolute inset-x-0 top-0 z-20 flex items-start justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <BackButton label="EXIT" href="/" />
          <div className="text-right">
            <h1 className="text-lg font-black tracking-[0.3em] text-white" style={{ textShadow: '0 0 14px rgba(70,200,255,0.6)' }}>
              ORDER 67
            </h1>
            <p className="mt-0.5 text-[10px] tracking-[0.25em] text-cyan-300/70">HOLOGRAPHIC P2P CALLS</p>
            <p className="ml-auto mt-1 max-w-[230px] text-[10px] leading-relaxed text-zinc-400">
              Step onto the dais — your peer materializes as a hologram.
            </p>
          </div>
        </header>
      )}
      {compact && !headerExpanded && (
        <header className="absolute inset-x-0 top-0 z-20 flex items-center gap-3 bg-black/60 px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur-md">
          <BackButton label="EXIT" href="/" />
          <p className="flex-none text-xs font-black tracking-[0.3em] text-white">ORDER 67</p>
          <p className="min-w-0 flex-1 truncate text-[10px] tracking-[0.15em] text-cyan-200/80">{status}</p>
        </header>
      )}

      {/* floating portal-vortex icon: expands the collapsed header */}
      {compact && !headerExpanded && !friendsOpen && (
        <button
          onClick={() => setHeaderExpanded(true)}
          aria-label="Expand header"
          title="Show header"
          className="absolute right-3 top-[4.25rem] z-30 flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-cyan-300/60"
          style={{ boxShadow: '0 0 24px rgba(70,200,255,0.45)' }}
        >
          {reducedMotion ? (
            <span aria-hidden="true" className="block h-full w-full bg-gradient-to-br from-cyan-500/70 via-violet-600/70 to-black" />
          ) : (
            <video
              src="/videos/menu-background.mp4"
              autoPlay muted loop playsInline
              aria-hidden="true"
              className="o67-vortex-video h-full w-full object-cover"
            />
          )}
        </button>
      )}

      {/* expanded header drawer: the collapsed chrome, one tap away */}
      {compact && headerExpanded && (
        <div className="absolute inset-x-0 top-0 z-30 border-b border-cyan-300/15 bg-black/90 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-md">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-black tracking-[0.3em] text-white" style={{ textShadow: '0 0 14px rgba(70,200,255,0.6)' }}>
                ORDER 67
              </h1>
              <p className="mt-0.5 text-[10px] tracking-[0.25em] text-cyan-300/70">HOLOGRAPHIC P2P CALLS</p>
              <p className="mt-1 max-w-[260px] text-[10px] leading-relaxed text-zinc-400">
                Step onto the dais — your peer materializes as a hologram.
              </p>
            </div>
            <button
              onClick={() => setHeaderExpanded(false)}
              aria-label="Collapse header"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-white/20 text-zinc-300 hover:text-white"
            >
              ✕
            </button>
          </div>
          <p className="mb-2 text-[9px] tracking-[0.35em] text-cyan-300/60">PROJECTED REALM BACKDROP</p>
          {renderRealmChips()}
          <p className="mt-2 text-[9px] leading-relaxed text-zinc-500">
            Peer-to-peer: video and audio travel directly between the two phones.
            The signal server only sees room codes — never your media.
          </p>
        </div>
      )}

      {/* status line (idle only — compact mode folds it into the slim bar) */}
      {!compact && (
        <div className="pointer-events-none absolute inset-x-0 top-32 z-20 flex justify-center px-6">
          <p className="text-center text-xs tracking-[0.2em] text-cyan-200/90">
            {status}
          </p>
        </div>
      )}

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
            onClick={() => shareInvite(roomCode)}
            className="min-h-[48px] rounded-xl border border-cyan-300/60 bg-cyan-400/15 px-8 text-xs font-bold tracking-[0.25em] text-white backdrop-blur-md transition hover:bg-cyan-400/25 active:scale-[0.98]"
          >
            SHARE INVITE
          </button>
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

      {/* in call / solo: guest strip + control cluster */}
      {(inCall || inSolo) && (
        <div className="absolute inset-x-0 bottom-0 z-20 px-4 pb-[max(0.9rem,env(safe-area-inset-bottom))] pt-2">
          {inCall && guests.length > 0 && (
            <div className="o67-chip-scroll mb-2 flex gap-2 overflow-x-auto" aria-label="Guests">
              {guests.map((g) => (
                <div
                  key={g.id}
                  className="flex min-h-[44px] flex-none items-center gap-2 rounded-xl border border-cyan-300/30 bg-black/60 py-1 pl-3 pr-1 backdrop-blur-md"
                >
                  <span
                    aria-hidden="true"
                    className={`h-2 w-2 flex-none rounded-full ${g.live ? 'bg-emerald-400' : 'bg-amber-300 o67-waiting'}`}
                  />
                  <span className="max-w-[90px] truncate text-[11px] font-bold text-white">{g.name}</span>
                  <span className="text-[10px] tracking-[0.2em] text-cyan-300/70">{g.code}</span>
                  <button
                    onClick={() => shareInvite(g.code)}
                    aria-label={`Share invite for ${g.name}`}
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-cyan-200 transition hover:bg-white/10"
                  >
                    ↗
                  </button>
                  <button
                    onClick={() => removeGuest(g.id, `${g.name} removed.`)}
                    aria-label={`Remove ${g.name}`}
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-red-300 transition hover:bg-white/10"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          {renderControlCluster()}
        </div>
      )}

      {/* friends sheet: summon (idle) or invite (mid-call) */}
      {friendsOpen && (friendsMode === 'summon' ? phase === 'idle' : (inCall || inSolo)) && (
        <div role="dialog" aria-label="Friends" className="absolute inset-0 z-30 flex flex-col bg-black/90 backdrop-blur-md">
          <div className="flex items-center justify-between px-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
            <h2 className="text-sm font-black tracking-[0.3em] text-white">
              {friendsMode === 'invite' ? 'ADD TO THIS CALL' : 'CHOOSE YOUR COMPANY'}
            </h2>
            <button
              onClick={() => setFriendsOpen(false)}
              aria-label="Close friends"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-white/20 text-zinc-300 hover:text-white"
            >
              ✕
            </button>
          </div>
          {friendsMode === 'invite' && (
            <p className="px-5 pt-2 text-[11px] leading-relaxed text-zinc-400">
              They join as another hologram — your current call keeps going.
            </p>
          )}
          <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-5 py-4">
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
                      {friendsMode === 'invite' ? (
                        <button
                          onClick={() => inviteToCall(f)}
                          disabled={busy}
                          className="min-h-[44px] flex-none rounded-xl border border-cyan-300/60 bg-cyan-400/15 px-5 text-[11px] font-black tracking-[0.2em] text-white transition hover:bg-cyan-400/25 disabled:opacity-50"
                        >
                          INVITE
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => executeOrder67(f)}
                            disabled={busy}
                            className="min-h-[44px] flex-none rounded-xl border border-cyan-300/60 bg-cyan-400/15 px-5 text-[11px] font-black tracking-[0.2em] text-white transition hover:bg-cyan-400/25 disabled:opacity-50"
                          >
                            SUMMON
                          </button>
                          <button
                            onClick={() => doBlockUser(f.user_id)}
                            aria-label={`Block ${f.display_name || f.username}`}
                            className={`min-h-[44px] flex-none rounded-xl border px-4 text-[11px] font-bold tracking-[0.15em] transition ${
                              confirmBlockId === f.user_id
                                ? 'border-red-400/70 bg-red-500/20 text-red-200'
                                : 'border-white/10 text-zinc-500 hover:border-red-400/50 hover:text-red-300'
                            }`}
                          >
                            {confirmBlockId === f.user_id ? 'SURE?' : 'BLOCK'}
                          </button>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            {friendsMode === 'summon' && (
              <>
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
                    className="select-text min-h-[44px] w-full rounded-xl border border-white/15 bg-black/50 px-4 text-base text-white placeholder:text-zinc-600 focus:border-cyan-300/60 focus:outline-none"
                  />
                  {searchingPlayers && (
                    <p className="mt-2 text-xs text-zinc-500">Searching…</p>
                  )}
                  {!searchingPlayers && playerQuery.trim().length >= 2 && playerResults.length === 0 && (
                    <p className="mt-2 text-xs text-zinc-500">No players match that name.</p>
                  )}
                  {playerResults.length > 0 && (
                    <ul className="mt-2 flex flex-col gap-2">
                      {playerResults.map((pl) => {
                        // already a friend? Offer SUMMON, not ADD — tapping ADD
                        // just 409s with "You are already friends."
                        const alreadyFriend = friends.some((f) => f.user_id === pl.user_id);
                        return (
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
                          {alreadyFriend ? (
                            <button
                              onClick={() => executeOrder67({ user_id: pl.user_id, display_name: pl.display_name, username: pl.username })}
                              disabled={busy}
                              className="min-h-[44px] flex-none rounded-xl border border-cyan-300/60 bg-cyan-400/15 px-5 text-[11px] font-black tracking-[0.2em] text-white transition hover:bg-cyan-400/25 disabled:opacity-50"
                            >
                              SUMMON
                            </button>
                          ) : sentRequests.includes(pl.user_id) ? (
                            <span className="flex-none text-[11px] font-bold tracking-[0.2em] text-emerald-300/80">
                              REQUEST SENT
                            </span>
                          ) : (
                            <>
                              <button
                                onClick={() => addPlayer(pl)}
                                className="min-h-[44px] flex-none rounded-xl border border-white/20 px-5 text-[11px] font-bold tracking-[0.2em] text-cyan-200 transition hover:border-cyan-300/60"
                              >
                                ADD
                              </button>
                              <button
                                onClick={() => doBlockUser(pl.user_id)}
                                aria-label={`Block ${pl.display_name || pl.username}`}
                                className={`min-h-[44px] flex-none rounded-xl border px-4 text-[11px] font-bold tracking-[0.15em] transition ${
                                  confirmBlockId === pl.user_id
                                    ? 'border-red-400/70 bg-red-500/20 text-red-200'
                                    : 'border-white/10 text-zinc-500 hover:border-red-400/50 hover:text-red-300'
                                }`}
                              >
                                {confirmBlockId === pl.user_id ? 'SURE?' : 'BLOCK'}
                              </button>
                            </>
                          )}
                        </li>
                        );
                      })}
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
              </>
            )}
          </div>
        </div>
      )}

      {/* bottom control panel: realm backdrop picker (idle only — the drawer holds it mid-call) */}
      {!compact && (
        <div className="absolute inset-x-0 bottom-0 z-20 border-t border-cyan-300/15 bg-black/70 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md">
          <p className="mb-2 text-center text-[9px] tracking-[0.35em] text-cyan-300/60">
            PROJECTED REALM BACKDROP
          </p>
          {renderRealmChips()}
          <p className="mt-2 text-center text-[9px] leading-relaxed text-zinc-500">
            Peer-to-peer: video and audio travel directly between the two phones.
            The signal server only sees room codes — never your media.
          </p>
        </div>
      )}

      {/* Safari bottom-bar clearance */}
      <div aria-hidden="true" className="player-clear shrink-0" />
    </main>
  );
}
