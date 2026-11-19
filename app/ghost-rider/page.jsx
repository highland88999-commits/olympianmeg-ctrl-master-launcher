// app/ghost-rider/page.jsx — GHOST RIDER: the Rider's realm in
// Christian hell.
//
// (Merlin, Nov 15 ~02:39): you come here to meet the Ghost Rider.
// Walk north past the damned field, talk to him, and fight him
// Pokémon-style — win and the flaming chain is yours. The chain
// burns a soul to ash: a damned soul reforms at the field's edge
// after 45 s; a traveller wakes in the Lake of Fire in Hell.
//
// First-person walk. WebGL via @react-three/fiber + drei (the
// Erebus / Cerberus stack), SceneContextGuard on the canvas, vortex
// travel on the arch (the Styx pattern). Plain-English HUD,
// mobile-first: touch stick on the left, drag-to-look on the right,
// no desktop-only controls. Reduced motion respected.
//
// The chain's burn records follow the Medusa self-petrify pattern
// (app/nether-realm/page.jsx): the server list is the source of
// truth when it answers; interim records (recorded while the API
// was down) ride on this device, clearly labelled, until the
// server list carries them. Polled every 15 s — a burn is not
// twitch. The victim poll covers realm 'ghost-rider' only — the
// hades victim poll lives in the nether-realm page.

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { useSceneContextGuard } from '@/components/SceneContextGuard';
import { useVortexTravel } from '@/components/VortexTravel';
import { useRealmInfoFade } from '@/components/useRealmInfoFade';
import { RealmLifeLine } from '@/components/RealmLifeLine';
import OrbButton, { OrbLabel } from '@/components/world/OrbButton';
import { GhostRiderScene } from './world3d';
import {
  DAMNED_FIELD,
  PORTALS,
  SPAWN,
  makeDamned,
  nearRider,
} from '@/lib/ghost-rider/world';
import {
  DIALOGUE,
  PLAYER_MOVES,
  PLAYER_MAX_HP,
  RIDER_LOSE_LINE,
  RIDER_MAX_HP,
  RIDER_WIN_LINE,
  createBattle,
  hpFraction,
  takeTurn,
} from '@/lib/ghost-rider/battle';
import {
  canUpgradeChain,
  chainsPerThrow,
  chainStatus,
  chainUpgradeCostFor,
  chainUsable,
  createChainItem,
  findChainTargets,
  formatCooldown,
  incinerationRecordFor,
  sanitizeIncineration,
  setLakeLanding,
  useChain,
} from '@/lib/ghost-rider/chain';
import { ORC_SHARD_ITEM_ID } from '@/lib/nether-realm/medusa';
import { addFlamingChainItem, countItem, removeItem } from '@/lib/backpack/backpack';
import { getBackpackRecord, updateBackpack, useBackpack } from '@/lib/backpack/store';
import { createPresenceClient } from '@/lib/presence';
import { ANTI_LIFE_PORTAL_NAME, ANTI_LIFE_ROUTE } from '@/lib/afterlife/anti-life-portal';
import { supabase } from '@/lib/supabase';

const STICK_RADIUS = 60;
// The damned reform 45 s after the chain burns them — the same
// number as Medusa's reform and Hollow Earth's, reused, not invented.
const DAMNED_REFORM_MS = 45000;
// The chain effect runs ~3.4 s in the scene; the soul leaves the
// field just after the ash falls.
const CHAIN_FX_MS = 3500;

function displayNameFor(user) {
  if (!user) return 'Traveller';
  const meta = user.user_metadata || {};
  const named = meta.full_name || meta.name || '';
  if (typeof named === 'string' && named.trim()) return named.trim().slice(0, 24);
  const email = typeof user.email === 'string' ? user.email : '';
  if (email.includes('@')) return email.split('@')[0].slice(0, 24) || 'Traveller';
  return 'Traveller';
}

export default function GhostRiderPage() {
  const sceneGuard = useSceneContextGuard({ label: 'GHOST-RIDER' });
  const { travel, overlay: vortexOverlay } = useVortexTravel();

  const playerRef = useRef({ x: SPAWN.x, z: SPAWN.z, yaw: SPAWN.yaw });
  const inputRef = useRef({ fwd: 0, strafe: 0, run: false, lookDx: 0 });
  const keysRef = useRef(new Set());
  const dragRef = useRef({ active: false, lastX: 0 });
  const stickRef = useRef({ id: null, ox: 0, oy: 0 });
  const lookTouchRef = useRef({ id: null, lastX: 0 });

  const [region, setRegion] = useState('The Approach');
  const regionRef = useRef(region);
  const [touchUI, setTouchUI] = useState(false);
  const [reduced, setReduced] = useState(false);
  const { infoHidden, fadeInfo, restoreInfo, infoStyle } = useRealmInfoFade({ reduced });
  const [stick, setStick] = useState({ dx: 0, dy: 0, active: false });

  // One plain-English notice line, auto-cleared (the hell shape:
  // { text, tone }).
  const [notice, setNotice] = useState(null);
  const noticeTimerRef = useRef(null);
  const showNotice = useCallback((text, tone = 'info') => {
    setNotice({ text, tone });
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(null), 6000);
  }, []);

  // --- the Rider: talk, then battle --------------------------------------
  const [user, setUser] = useState(null);
  const userRef = useRef(null);
  const [near, setNear] = useState(false);
  const [dialogueStep, setDialogueStep] = useState(null); // null | 0 | 1 | 2
  const [battle, setBattle] = useState(null);
  const battleRef = useRef(null);
  const battleGrantedRef = useRef(false);
  const pack = useBackpack();
  const chainItem = (pack.items || []).find((e) => e.kind === 'flaming-chain') || null;
  const [nowTick, setNowTick] = useState(Date.now());
  // The chain's level lives in the account (ghost_rider_chains),
  // like the head's — the server is the authority, the pack is
  // the local handle. Until the service is live the level is 0.
  const [chain, setChain] = useState({ owned: false, level: 0, serverLive: null });
  const chainRef = useRef(chain);

  // --- the damned + the chain --------------------------------------------
  const [damned, setDamned] = useState(() => makeDamned());
  const damnedRef = useRef(damned);
  const [foes, setFoes] = useState([]);
  const foesRef = useRef(foes);
  const [chainFx, setChainFx] = useState(null);
  const chainFxTimerRef = useRef(null);
  const reformTimersRef = useRef([]);
  const sessionStartRef = useRef(Date.now());
  const handledIncinerationIdsRef = useRef(new Set());
  const presenceRef = useRef(null);
  const [incinerations, setIncinerations] = useState([]);

  useEffect(() => { regionRef.current = region; }, [region]);
  useEffect(() => { battleRef.current = battle; }, [battle]);
  useEffect(() => { chainRef.current = chain; }, [chain]);
  useEffect(() => { damnedRef.current = damned; }, [damned]);
  useEffect(() => { foesRef.current = foes; }, [foes]);
  useEffect(() => () => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    if (chainFxTimerRef.current) clearTimeout(chainFxTimerRef.current);
    for (const t of reformTimersRef.current) clearTimeout(t);
    if (presenceRef.current) presenceRef.current.dispose();
  }, []);

  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  useEffect(() => {
    try {
      setTouchUI(navigator.maxTouchPoints > 0);
      setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch { /* desktop defaults stand */ }
  }, []);

  // Signed-in user (guests still walk the realm — they just cannot
  // win the chain or burn anyone).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        const u = data && data.session ? data.session.user : null;
        setUser(u);
        userRef.current = u;
      } catch { /* guest path */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const getToken = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getSession();
      return data && data.session ? data.session.access_token : null;
    } catch {
      return null;
    }
  }, []);

  // Chain status from the server (the source of truth for owned /
  // level). When the server says owned and the pack lacks the item,
  // the pack gains it — the server claim already happened, the
  // local handle just went missing. Mirrors the head's fetch.
  const fetchChainStatus = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    try {
      const res = await fetch('/api/ghost-rider/chains', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        if (res.status === 503) setChain((c) => ({ ...c, serverLive: false }));
        return;
      }
      const data = await res.json();
      setChain({ owned: !!data.owned, level: data.upgradeLevel || 0, serverLive: true });
      if (data.owned) {
        try {
          const rec = getBackpackRecord();
          if (!(rec.items || []).some((e) => e.kind === 'flaming-chain')) {
            updateBackpack((r) => addFlamingChainItem(r, createChainItem()));
          }
        } catch { /* pack unavailable */ }
      }
    } catch { /* API unreachable — the pack stays the interim truth */ }
  }, [getToken]);

  useEffect(() => {
    if (user) fetchChainStatus();
  }, [user, fetchChainStatus]);

  // Claim the chain on the server (one row per user — the level's
  // home). Best-effort: the win already granted the chain locally,
  // so a down service costs nothing; the row lands on the next
  // win. Mirrors the head's claim.
  const claimChain = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    try {
      const res = await fetch('/api/ghost-rider/chains', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json().catch(() => ({}));
      setChain({ owned: true, level: data.upgradeLevel || 0, serverLive: true });
    } catch { /* the win stands locally */ }
  }, [getToken]);

  // Headless probe hook: window.__ghost-rider.player / .region /
  // .teleport — test instrumentation only (the probe places the
  // player near the Rider to prove the talk + battle without a
  // two-minute walk at swiftshader frame rates); it changes
  // nothing about the real game.
  useEffect(() => {
    try {
      window['__ghost-rider'] = {
        ready: true,
        portals: PORTALS,
        get player() { return { ...playerRef.current }; },
        get region() { return regionRef.current; },
        teleport(x, z) {
          playerRef.current.x = x;
          playerRef.current.z = z;
        },
      };
    } catch { /* probe hook is best-effort */ }
  }, []);

  // Near the Rider? Checked four times a second — the talk button
  // appears the moment you step into range.
  useEffect(() => {
    const id = setInterval(() => {
      setNear(nearRider(playerRef.current.x, playerRef.current.z));
    }, 250);
    return () => clearInterval(id);
  }, []);

  // The chain's cooldown clock: one tick a second keeps the
  // "cooling down, N min left" label honest.
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Ghost Rider presence (lib/presence.js, sector 'ghost-rider'):
  // every walker upserts their position every 2.5 s and polls
  // everyone else's on the same cadence. Foes = other users here.
  // When the presence table is missing the client no-ops cleanly
  // and the realm renders solo — no fake foes, ever.
  useEffect(() => {
    let cancelled = false;
    let client = null;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const sessionUser = data && data.session ? data.session.user : null;
        if (cancelled) return;
        client = createPresenceClient(supabase, {
          sector: 'ghost-rider',
          userId: sessionUser ? sessionUser.id : undefined,
          label: displayNameFor(sessionUser),
          getState: () => ({
            // pos.y carries the walker yaw (radians) — height is
            // always 0 on this ground plane, so the slot is free.
            pos: { x: playerRef.current.x, y: playerRef.current.yaw, z: playerRef.current.z },
            vehicle: 'on-foot',
          }),
          onPeers: (peers) => {
            if (cancelled) return;
            const mine = sessionUser ? sessionUser.id : null;
            setFoes((peers || [])
              .filter((p) => p && p.id !== mine)
              .map((p) => ({
                id: p.id,
                label: p.label || 'Traveller',
                color: p.color || '#22d3ee',
                x: p.pos ? p.pos.x : 0,
                z: p.pos ? p.pos.z : 0,
                yaw: p.pos ? p.pos.y : 0,
                characterId: p.characterId || null,
              })));
          },
        });
        presenceRef.current = client;
        await client.join();
      } catch { /* presence unavailable — solo realm */ }
    })();
    return () => {
      cancelled = true;
      if (client) void client.leave();
      presenceRef.current = null;
    };
  }, []);

  // Keep our presence row fresh while walking (throttled to 2.5 s
  // inside the client — cheap to call every second).
  useEffect(() => {
    const id = setInterval(() => {
      try {
        if (presenceRef.current) void presenceRef.current.update();
      } catch { /* noop */ }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // --- interim incinerations (the Medusa pattern) -------------------------
  // Records the server never saw, kept on this device and clearly
  // labelled, until the server list carries them.
  const INTERIM_KEY = 'olympus:ghost-rider-incinerations-interim:v1';
  const loadInterimIncinerations = useCallback(() => {
    try {
      const raw = localStorage.getItem(INTERIM_KEY);
      if (!raw) return [];
      return (JSON.parse(raw) || []).map(sanitizeIncineration).filter(Boolean);
    } catch {
      return [];
    }
  }, []);
  const saveInterimIncinerations = useCallback((list) => {
    try {
      localStorage.setItem(INTERIM_KEY, JSON.stringify(list));
    } catch { /* storage unavailable */ }
  }, []);

  const fetchIncinerations = useCallback(async () => {
    try {
      const res = await fetch('/api/ghost-rider/incinerations?realm=ghost-rider');
      if (!res.ok) return;
      const data = await res.json();
      const server = (data.incinerations || []).map(sanitizeIncineration).filter(Boolean);
      const interim = loadInterimIncinerations().filter((s) => !server.some(
        (sv) => sv.victim_user_id === s.victim_user_id
          && Math.hypot(sv.x - s.x, sv.z - s.z) < 2,
      ));
      saveInterimIncinerations(interim);
      setIncinerations([...server, ...interim]);
    } catch { /* API unreachable — the records already on screen stay */ }
  }, [loadInterimIncinerations, saveInterimIncinerations]);

  useEffect(() => {
    fetchIncinerations();
    const id = setInterval(fetchIncinerations, 15000);
    return () => clearInterval(id);
  }, [fetchIncinerations]);

  // VICTIM POLL: a fresh record naming us means the chain burned
  // us — we wake in the Lake of Fire in Hell. The flag lands us at
  // the lake's rim (/hell honours it on mount) and the travel rides
  // the vortex, the same as every arch. `user` is a dep so the
  // check re-runs the moment sign-in resolves, not only on the
  // next 15 s poll.
  useEffect(() => {
    const me = userRef.current;
    if (!me) return;
    for (const s of incinerations) {
      if (!s || s.victim_user_id !== me.id) continue;
      if (s.victim_kind !== 'user') continue;
      if (handledIncinerationIdsRef.current.has(s.id)) continue;
      if (!s.created_at || new Date(s.created_at).getTime() < sessionStartRef.current) continue;
      handledIncinerationIdsRef.current.add(s.id);
      try { setLakeLanding(window.localStorage); } catch { /* the travel still happens */ }
      showNotice(`🔥 ${s.chainer_name || 'The chain'} burned you to ash — you wake in the Lake of Fire.`, 'bad');
      travel('/hell', 'the Lake of Fire');
    }
  }, [incinerations, user, showNotice, travel]);

  // --- talk + battle --------------------------------------------------------
  const startTalk = useCallback(() => {
    if (battleRef.current) return;
    battleGrantedRef.current = false;
    setDialogueStep(0);
  }, []);

  const advanceDialogue = useCallback(() => {
    if (dialogueStep == null) return;
    if (dialogueStep >= DIALOGUE.length - 1) {
      // The last answer is the challenge — the battle starts.
      setBattle(createBattle());
      setDialogueStep(null);
      return;
    }
    setDialogueStep(dialogueStep + 1);
  }, [dialogueStep]);

  const pickMove = useCallback((moveId) => {
    const b = battleRef.current;
    if (!b || b.phase !== 'player') return;
    setBattle(takeTurn(b, moveId));
  }, []);

  // The battle's end: a win grants the chain (once — the guard
  // survives re-renders, and resets when a new talk starts); a
  // loss INCINERATES you (Merlin, Nov 18, 2026): his fire takes
  // you and you wake in the Lake of Fire in Hell. The lake-landing
  // flag + the travel are the whole law — the same shape as the
  // victim poll above — and no incineration record is posted: the
  // incinerations route drops any record naming its own caller
  // (the self-burn guard), and the respawn needs no record.
  useEffect(() => {
    if (!battle || battle.phase === 'player') return;
    if (battle.phase === 'won') {
      if (!battleGrantedRef.current) {
        battleGrantedRef.current = true;
        try {
          const rec = getBackpackRecord();
          const already = (rec.items || []).some((e) => e.kind === 'flaming-chain');
          if (!already) updateBackpack((r) => addFlamingChainItem(r, createChainItem()));
        } catch { /* pack unavailable — the win still stands */ }
        claimChain();
        showNotice(`🔥 The flaming chain is yours — 3 uses, then an hour's rest. Use it wisely.`, 'good');
      }
      return;
    }
    if (battle.phase === 'lost') {
      try { setLakeLanding(window.localStorage); } catch { /* the travel still happens */ }
      showNotice(`${RIDER_WIN_LINE} You wake in the Lake of Fire.`, 'bad');
      setBattle(null);
      travel('/hell', 'the Lake of Fire');
    }
  }, [battle, showNotice, claimChain, travel]);

  // --- the chain ------------------------------------------------------------
  const onUseChain = useCallback(async () => {
    let item = null;
    try {
      item = (getBackpackRecord().items || []).find((e) => e.kind === 'flaming-chain') || null;
    } catch { /* pack unavailable */ }
    if (!item) {
      showNotice('You do not hold the flaming chain — beat the Ghost Rider first.', 'bad');
      return;
    }
    const check = chainUsable(item, Date.now());
    if (!check.ok) {
      if (check.reason === 'cooldown') {
        showNotice(`The chain is cooling down — ${formatCooldown(check.cooldownRemainingMs)} left before its fire returns.`, 'bad');
      } else {
        showNotice('The chain will not burn right now.', 'bad');
      }
      return;
    }
    const p = playerRef.current;
    const damnedTargets = (damnedRef.current || []).map((d) => ({ ...d, label: 'A damned soul' }));
    // One throw wraps as many souls as the chain's level carries
    // (1 at level 0, 5 at level 4) — one use, however many chains fly.
    const found = findChainTargets({ x: p.x, z: p.z, yaw: p.yaw }, foesRef.current, damnedTargets, chainsPerThrow(chainRef.current.level));
    if (found.length === 0) {
      showNotice('No soul in the chain’s reach — face a damned soul or a traveller within 20 m.', 'bad');
      return;
    }
    // Spend the charge: the pack entry is replaced with the
    // useChain result — the same shape as every other backpack
    // update on this page.
    try {
      updateBackpack((r) => ({
        ...r,
        items: (r.items || []).map((e) => (e.kind === 'flaming-chain' ? useChain(e, Date.now()) : e)),
      }));
    } catch { /* pack unavailable — the throw still happens */ }
    const first = found[0];
    setChainFx({
      from: { x: p.x, z: p.z },
      to: { x: first.target.x, z: first.target.z },
      targets: found.map((f) => ({ x: f.target.x, z: f.target.z })),
      atMs: Date.now(),
      targetId: first.kind === 'npc' ? first.target.id : null,
      targetKind: first.kind,
    });
    if (chainFxTimerRef.current) clearTimeout(chainFxTimerRef.current);
    chainFxTimerRef.current = setTimeout(() => setChainFx(null), CHAIN_FX_MS);
    // An NPC target burns to ash, leaves the field, and reforms
    // after 45 s at the field's edge — one timer pair per soul.
    for (const f of found) {
      if (f.kind !== 'npc') continue;
      const burnedId = f.target.id;
      const reformTimer = setTimeout(() => {
        const a = Math.random() * Math.PI * 2;
        setDamned((prev) => {
          if (prev.some((d) => d.id === burnedId)) return prev;
          return [...prev, {
            id: burnedId,
            x: DAMNED_FIELD.x + Math.cos(a) * (DAMNED_FIELD.r - 4),
            z: DAMNED_FIELD.z + Math.sin(a) * (DAMNED_FIELD.r - 4),
            slow: 0.3 + Math.random() * 0.4,
          }];
        });
      }, DAMNED_REFORM_MS);
      reformTimersRef.current.push(reformTimer);
      const removeTimer = setTimeout(() => {
        setDamned((prev) => prev.filter((d) => d.id !== burnedId));
      }, CHAIN_FX_MS);
      reformTimersRef.current.push(removeTimer);
    }
    // The shared records: the server verifies the caller holds the
    // chain; when it cannot be reached the burns stand on this
    // device, clearly labelled, until the server list is live.
    const records = found.map((f) => incinerationRecordFor({
      victim: { id: f.kind === 'npc' ? null : f.target.id, name: f.kind === 'npc' ? 'A damned soul' : (f.target.label || 'Traveller') },
      chainer: { id: userRef.current ? userRef.current.id : null, name: displayNameFor(userRef.current) },
      realm: 'ghost-rider',
      x: f.target.x,
      z: f.target.z,
      kind: f.kind,
    }));
    const npcCount = found.filter((f) => f.kind === 'npc').length;
    const userNames = found.filter((f) => f.kind === 'user').map((f) => f.target.label || 'Traveller');
    const token = await getToken();
    try {
      if (!token) throw new Error('signed-out');
      const res = await fetch('/api/ghost-rider/incinerations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ incinerations: records }),
      });
      if (!res.ok) throw new Error(`incinerations-${res.status}`);
      const data = await res.json();
      const server = (data.incinerations || []).map(sanitizeIncineration).filter(Boolean);
      setIncinerations((prev) => [...server, ...prev.filter((s) => !server.some((sv) => sv.id === s.id))]);
      showNotice(
        userNames.length === 0
          ? (npcCount === 1
            ? '🔥 The chain takes the damned soul — ash on the wind. It will reform at the field’s edge.'
            : `🔥 The chain takes ${npcCount} damned souls — ash on the wind. They will reform at the field’s edge.`)
          : (found.length === 1
            ? `🔥 The chain takes ${userNames[0]} — they burn to ash and wake in the Lake of Fire.`
            : `🔥 The chain takes ${found.length} souls — they burn to ash and wake in the Lake of Fire.`),
        'good',
      );
    } catch {
      const interims = records.map((record, i) => sanitizeIncineration({
        ...record,
        id: `interim-${found[i].kind === 'npc' ? found[i].target.id : found[i].target.id}-${Date.now()}-${i}`,
        interim: true,
        created_at: new Date().toISOString(),
      })).filter(Boolean);
      if (interims.length > 0) {
        const kept = [...loadInterimIncinerations(), ...interims];
        saveInterimIncinerations(kept);
        setIncinerations((prev) => [...prev, ...interims]);
      }
      showNotice(
        userNames.length === 0
          ? (npcCount === 1
            ? '🔥 The chain takes the damned soul — ash on the wind. The burn is recorded on this device until the Ghost Rider service is live.'
            : `🔥 The chain takes ${npcCount} damned souls — ash on the wind. The burns are recorded on this device until the Ghost Rider service is live.`)
          : (found.length === 1
            ? `🔥 The chain takes ${userNames[0]} — they burn to ash. The burn is recorded on this device until the Ghost Rider service is live.`
            : `🔥 The chain takes ${found.length} souls — they burn to ash. The burns are recorded on this device until the Ghost Rider service is live.`),
        'good',
      );
    }
    await fetchIncinerations();
  }, [getToken, showNotice, loadInterimIncinerations, saveInterimIncinerations, fetchIncinerations]);

  // Upgrade the chain: flat 20 orc shards, +1 chain per throw, up
  // to 5. The server is the authority for the level — the client
  // never self-grants one — and the shards leave the pack only
  // after the server confirms. Mirrors the head's upgrade.
  const onUpgradeChain = useCallback(async () => {
    const ch = chainRef.current;
    let shards = 0;
    try { shards = countItem(getBackpackRecord(), ORC_SHARD_ITEM_ID); } catch { /* pack unavailable */ }
    const check = canUpgradeChain(ch.level, shards);
    if (!check.ok) {
      showNotice(check.reason === 'max'
        ? 'The chain is already at its full hunger — 5 chains per throw.'
        : `The chain wants ${chainUpgradeCostFor(ch.level)} orc shards — you hold ${shards}. Orcs in Middle-earth drop them.`, 'bad');
      return;
    }
    const token = await getToken();
    if (!token) {
      showNotice('Sign in to upgrade the chain — the level lives in your account.', 'bad');
      return;
    }
    try {
      const res = await fetch('/api/ghost-rider/chains/upgrade', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showNotice(data.error || 'The upgrade did not land — your shards are safe.', 'bad');
        return;
      }
      try {
        updateBackpack((r) => removeItem(r, ORC_SHARD_ITEM_ID, chainUpgradeCostFor(ch.level)));
      } catch { /* pack unavailable */ }
      setChain((c) => ({ ...c, level: data.upgradeLevel || 0 }));
      showNotice(`🔥 The chain hungers for more — ${chainsPerThrow(data.upgradeLevel || 0)} chains per throw now.`, 'good');
    } catch {
      showNotice('The upgrade did not land — the service is unreachable, your shards are safe.', 'bad');
    }
  }, [getToken, showNotice]);

  // --- movement: keys + stick + drag (the hell pattern) --------------------
  const applyKeys = useCallback(() => {
    const k = keysRef.current;
    const fwd = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
    const strafe = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
    inputRef.current.fwd = fwd;
    inputRef.current.strafe = strafe;
    inputRef.current.run = k.has('shift');
  }, []);

  useEffect(() => {
    const down = (e) => {
      const key = String(e.key || '').toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(key)) {
        e.preventDefault();
        keysRef.current.add(key);
        applyKeys();
      }
    };
    const up = (e) => {
      keysRef.current.delete(String(e.key || '').toLowerCase());
      applyKeys();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [applyKeys]);

  const onPortal = useCallback((portal) => {
    travel(portal.route, portal.label);
  }, [travel]);
  // ANTI-LIFE PORTAL: the fall-through floor portal in this realm
  // drops the walker into Anti-Life — same vortex travel as the
  // arches; the tube is the fall.
  const onAntiLife = useCallback(() => {
    travel(ANTI_LIFE_ROUTE, ANTI_LIFE_PORTAL_NAME);
  }, [travel]);

  const onRegion = useCallback((name) => {
    setRegion(name);
  }, []);

  // --- mouse drag to look (desktop) ---------------------------------------
  const onPointerDown = (e) => {
    if (e.pointerType !== 'mouse') return;
    dragRef.current = { active: true, lastX: e.clientX };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!dragRef.current.active || e.pointerType !== 'mouse') return;
    inputRef.current.lookDx += e.clientX - dragRef.current.lastX;
    dragRef.current.lastX = e.clientX;
  };
  const onPointerUp = () => {
    dragRef.current.active = false;
  };

  // --- touch stick (left) + drag-to-look (right) ---------------------------
  const onStickStart = (e) => {
    const t = e.changedTouches[0];
    if (!t || stickRef.current.id !== null) return;
    stickRef.current = { id: t.identifier, ox: t.clientX, oy: t.clientY };
    setStick({ dx: 0, dy: 0, active: true });
  };
  const onStickMove = (e) => {
    const s = stickRef.current;
    if (s.id === null) return;
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier !== s.id) continue;
      let dx = t.clientX - s.ox;
      let dy = t.clientY - s.oy;
      const len = Math.hypot(dx, dy);
      if (len > STICK_RADIUS) {
        dx = (dx / len) * STICK_RADIUS;
        dy = (dy / len) * STICK_RADIUS;
      }
      inputRef.current.strafe = dx / STICK_RADIUS;
      inputRef.current.fwd = -dy / STICK_RADIUS;
      setStick({ dx, dy, active: true });
    }
  };
  const onStickEnd = (e) => {
    const s = stickRef.current;
    if (s.id === null) return;
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier !== s.id) continue;
      stickRef.current = { id: null, ox: 0, oy: 0 };
      inputRef.current.strafe = 0;
      inputRef.current.fwd = 0;
      setStick({ dx: 0, dy: 0, active: false });
    }
  };
  const onLookStart = (e) => {
    const t = e.changedTouches[0];
    if (!t || lookTouchRef.current.id !== null) return;
    lookTouchRef.current = { id: t.identifier, lastX: t.clientX };
  };
  const onLookMove = (e) => {
    const l = lookTouchRef.current;
    if (l.id === null) return;
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier !== l.id) continue;
      inputRef.current.lookDx += t.clientX - l.lastX;
      lookTouchRef.current.lastX = t.clientX;
    }
  };
  const onLookEnd = (e) => {
    const l = lookTouchRef.current;
    if (l.id === null) return;
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier !== l.id) continue;
      lookTouchRef.current = { id: null, lastX: 0 };
    }
  };

  const chainLabel = chainItem ? chainStatus(chainItem, nowTick).label : null;
  const dialogue = dialogueStep != null ? DIALOGUE[dialogueStep] : null;

  return (
    <main className="fixed inset-0 overflow-hidden bg-black text-white" style={{ touchAction: 'none' }} onPointerDown={fadeInfo}>
      {/* 3D world */}
      <div
        className="absolute inset-0"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <Canvas
          dpr={[1, 2]}
          gl={{ antialias: false, powerPreference: 'high-performance' }}
          camera={{ fov: 60, near: 0.1, far: 900, position: [SPAWN.x, 2.4, SPAWN.z] }}
          onCreated={sceneGuard.onCreated}
          style={{ width: '100%', height: '100%' }}
        >
          <GhostRiderScene
            playerRef={playerRef}
            inputRef={inputRef}
            onPortal={onPortal}
            onAntiLife={onAntiLife}
            onRegion={onRegion}
            reduced={reduced}
            damned={damned}
            foes={foes}
            chainFx={chainFx}
          />
        </Canvas>
      </div>

      {/* touch controls: left stick walks, right side drag looks */}
      {touchUI && (
        <>
          <div
            className="absolute bottom-0 left-0 z-10 h-[45%] w-[45%]"
            style={{ touchAction: 'none' }}
            onTouchStart={onStickStart}
            onTouchMove={onStickMove}
            onTouchEnd={onStickEnd}
            onTouchCancel={onStickEnd}
          >
            <div
              className="absolute bottom-24 left-8 h-28 w-28 rounded-full border-2 border-white/25 bg-white/5"
              style={{ touchAction: 'none' }}
            >
              <div
                className="absolute left-1/2 top-1/2 h-12 w-12 rounded-full bg-white/35"
                style={{
                  transform: `translate(calc(-50% + ${stick.dx}px), calc(-50% + ${stick.dy}px))`,
                }}
              />
            </div>
          </div>
          <div
            className="absolute bottom-0 right-0 z-10 h-[45%] w-[55%]"
            style={{ touchAction: 'none' }}
            onTouchStart={onLookStart}
            onTouchMove={onLookMove}
            onTouchEnd={onLookEnd}
            onTouchCancel={onLookEnd}
          />
        </>
      )}

      {/* HUD — plain English, nothing overlaps anything else. The title
          sits below the Leave button (pt-16); the hint sits above the
          global radio bar (bottom-20); the stick sits above it too.
          SPLIT (Merlin, Nov 18, 2026): only the realm intro fades —
          the talk + battle used to live inside the fading block, so
          the TALK orb was invisible by the time you reached the
          Rider. The intro keeps its place in layout when faded
          (opacity only), so nothing below it ever jumps. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col items-center px-4 pt-16 text-center">
        {/* The realm intro: the only part that fades. */}
        <div style={infoStyle} aria-hidden={infoHidden} className="flex flex-col items-center">
          <h1 className="text-2xl font-bold tracking-[0.3em] text-red-100 drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
            GHOST RIDER
          </h1>
          <p className="mt-1 text-sm text-stone-300 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
            The reckoning waits in the fire — walk north and meet him.
          </p>
          <p className="mt-1 text-sm font-semibold text-amber-200 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
            You are in: {region}
          </p>
          {chainLabel && (
            <p className="mt-1 text-sm text-orange-200 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
              {chainLabel}
            </p>
          )}
          <p className="mt-3 rounded-full bg-black/55 px-4 py-2 text-xs text-stone-200">
            {touchUI
              ? 'Left stick to walk · drag the right side to look around · walk through the glowing arch to return to Hell · step onto the dark Anti-Life disc to fall through'
              : 'WASD or arrows to walk · drag to look around · Shift to run · walk through the glowing arch to return to Hell · step onto the dark Anti-Life disc to fall through'}
          </p>
          <RealmLifeLine realmKey="ghost-rider" />
        </div>
        {/* Talk / battle / chain — NEVER fades: the fight must be
            reachable the moment you step into range. */}
        {near && !dialogue && !battle && (
          <p className="mt-3 rounded-full bg-black/55 px-4 py-2 text-xs text-orange-200">
            The Ghost Rider is waiting — tap 💬 TALK
          </p>
        )}
        {/* Talk / battle / chain — one plain circle orb per deed, in
            a row, only where the deed lives. */}
        <div className="pointer-events-auto mt-3 flex flex-row items-center justify-center gap-3">
          {near && !dialogue && !battle && (
            <OrbButton accent="#fb923c" onClick={startTalk}
              ariaLabel="Talk to the Ghost Rider" title="Talk to the Ghost Rider">
              <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>💬</span>
              <OrbLabel>TALK</OrbLabel>
            </OrbButton>
          )}
          {chainItem && !battle && !dialogue && (
            <OrbButton accent="#f87171" onClick={onUseChain}
              ariaLabel={`Use the Chain${chain.level > 0 ? ` — ${chainsPerThrow(chain.level)} chains` : ''}`}
              title={`Use the Chain${chain.level > 0 ? ` — ${chainsPerThrow(chain.level)} chains` : ''}`}>
              <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>🔥</span>
              <OrbLabel>USE</OrbLabel>
            </OrbButton>
          )}
          {chainItem && !battle && !dialogue && (
            <OrbButton accent="#ffffff" onClick={onUpgradeChain}
              ariaLabel={`Chain level ${chain.level} → ${Math.min(5, chainsPerThrow(chain.level) + 1)} chains per throw · 20 orc shards (${countItem(pack, ORC_SHARD_ITEM_ID)} held)`}
              title={`Chain level ${chain.level} → ${Math.min(5, chainsPerThrow(chain.level) + 1)} chains per throw · 20 orc shards (${countItem(pack, ORC_SHARD_ITEM_ID)} held)`}>
              <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>⬆</span>
              <OrbLabel>UP</OrbLabel>
            </OrbButton>
          )}
        </div>
        {/* The conversation: his line, two answers, either advances. */}
        {dialogue && (
          <div className="pointer-events-auto mt-3 max-w-md rounded-2xl border border-orange-400/40 bg-black/70 px-4 py-3 text-left">
            <p className="text-sm italic text-orange-100">🔥 “{dialogue.rider}”</p>
            <div className="mt-3 flex flex-col gap-2">
              {dialogue.choices.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  onClick={advanceDialogue}
                  className="rounded-full border border-white/30 bg-black/60 px-4 py-2 text-left text-sm text-white"
                >
                  {choice}
                </button>
              ))}
            </div>
          </div>
        )}
        {/* The battle: HP bars, three moves, the log. */}
        {battle && (
          <div className="pointer-events-auto mt-3 w-full max-w-md rounded-2xl border border-red-400/40 bg-black/70 px-4 py-3 text-left">
            <p className="text-center text-sm font-bold tracking-widest text-red-200">THE FIGHT — TURN {battle.turn}</p>
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-white">You</span>
                <span className="text-stone-300">{battle.playerHp} / {PLAYER_MAX_HP}</span>
              </div>
              <div className="mt-1 h-3 overflow-hidden rounded-full bg-white/15">
                <div className="h-full rounded-full bg-emerald-400" style={{ width: `${hpFraction(battle.playerHp, PLAYER_MAX_HP) * 100}%` }} />
              </div>
            </div>
            <div className="mt-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-orange-200">The Ghost Rider</span>
                <span className="text-stone-300">{battle.riderHp} / {RIDER_MAX_HP}</span>
              </div>
              <div className="mt-1 h-3 overflow-hidden rounded-full bg-white/15">
                <div className="h-full rounded-full bg-orange-500" style={{ width: `${hpFraction(battle.riderHp, RIDER_MAX_HP) * 100}%` }} />
              </div>
            </div>
            {battle.phase === 'player' && (
              <div className="mt-3 flex flex-col gap-2">
                {Object.values(PLAYER_MOVES).map((move) => (
                  <button
                    key={move.id}
                    type="button"
                    onClick={() => pickMove(move.id)}
                    className="rounded-full border border-orange-400/60 bg-black/60 px-4 py-2 text-sm font-semibold text-orange-100"
                  >
                    {move.name} — {move.damage} damage{move.accuracy < 1 ? ` · ${Math.round(move.accuracy * 100)}% to hit` : ''}
                  </button>
                ))}
              </div>
            )}
            {battle.phase === 'won' && (
              <p className="mt-3 text-sm text-emerald-200">{RIDER_LOSE_LINE}</p>
            )}
            {battle.log.length > 0 && (
              <div className="mt-3 space-y-1">
                {battle.log.slice(-4).map((line, i) => (
                  <p key={`${battle.turn}-${i}`} className="text-xs leading-relaxed text-stone-300">{line}</p>
                ))}
              </div>
            )}
          </div>
        )}
        {notice && (
          <p className="mt-3 max-w-md rounded-full bg-black/55 px-4 py-2 text-xs text-stone-200">
            {notice.text}
          </p>
        )}
      </div>

      <div className="absolute left-4 top-4 z-30">
        <OrbButton href="/" ariaLabel="Leave" accent="#ffffff">
          <span aria-hidden="true" style={{ fontSize: 20, lineHeight: 1 }}>←</span>
        </OrbButton>
      </div>

      {/* Realm info restore — the faded HUD comes back with one tap. */}
      {infoHidden && (
        <OrbButton accent="#ffffff" ariaLabel="Show realm information"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={restoreInfo}
          style={{ position: 'absolute', left: '50%', top: 64, transform: 'translateX(-50%)', zIndex: 30 }}>
          <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>ⓘ</span>
        </OrbButton>
      )}

      {vortexOverlay}
    </main>
  );
}
