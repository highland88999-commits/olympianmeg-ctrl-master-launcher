// app/nether-realm/page.jsx — NETHER-REALM: the world beneath the world.
//
// BASE SHELL (Merlin, Nov 12, 2026): the world only — dark mirror
// terrain, the River Styx, the Gates with Cerberus, Hades' Palace, the
// three fields, the Descent, and seven portal arches to the hell realms
// that already exist. No game mechanics yet: no ferry ride, no Hydra
// fight, no Cerberus trial — those come later. Medusa's gaze IS
// here (Merlin, 2026-11-15): her lair in the southwest, the
// beheading fight, her head as a held weapon, and the statues
// of the petrified. See lib/nether-realm/medusa.js for the law.
//
// First-person walk. WebGL via @react-three/fiber + drei (the Erebus /
// Cerberus stack), SceneContextGuard on the canvas, vortex travel on
// the arches (the Styx pattern). Lava pools drop into the World Engine
// (Merlin, Nov 13, 2026) — same vortex, the tube is the fall.
// Plain-English HUD, mobile-first:
// touch stick on the left, drag-to-look on the right, no desktop-only
// controls. Reduced motion respected.

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Canvas } from '@react-three/fiber';
import { useSceneContextGuard } from '@/components/SceneContextGuard';
import { useVortexTravel } from '@/components/VortexTravel';
import { useRealmInfoFade } from '@/components/useRealmInfoFade';
import { RealmLifeLine } from '@/components/RealmLifeLine';
import { NetherRealmScene } from './world3d';
import { GATES, LAVA_DROP_NAME, LAVA_DROP_ROUTE, PORTALS, SPAWN } from '@/lib/nether-realm/world';
import { ANTI_LIFE_PORTAL_NAME, ANTI_LIFE_ROUTE } from '@/lib/afterlife/anti-life-portal';
import {
  HEAD_ITEM_ID,
  MEDUSA_DEFAULT_DMG,
  MEDUSA_POS,
  ORC_SHARD_ITEM_ID,
  PETRIFY_RANGE_M,
  canUpgrade,
  createMedusaBoss,
  displayNameFor,
  foesInPetrifyCone,
  medusaHeadItem,
  petrifyRespawnSpot,
  reformInS,
  sanitizeStatue,
  statueRecordFor,
  strikeMedusa,
  tickMedusa,
  upgradeCostFor,
  victimsPerUse,
} from '@/lib/nether-realm/medusa';
import { strike, BLADE, aimYawFromWalker } from '@/app/middle-earth/orcs';
import { addFlamingChainItem, addMedusaHeadItem, countItem, equippedDamageForSlot, equippedWeaponEntry, removeItem } from '@/lib/backpack/backpack';
import {
  CHAIN_RANGE_M,
  canUpgradeChain,
  chainsPerThrow,
  chainStatus,
  chainUpgradeCostFor,
  chainUsable,
  createChainItem,
  findChainTargets,
  formatCooldown,
  incinerationRecordFor,
  refreshChain,
  sanitizeIncineration,
  setLakeLanding,
  useChain,
} from '@/lib/ghost-rider/chain';
import { getBackpackRecord, updateBackpack, useBackpack } from '@/lib/backpack/store';
import BackpackHud from '@/components/backpack/BackpackHud';
import { createPresenceClient } from '@/lib/presence';
import { reportDecayPosition } from '@/lib/anti-life/lingering';
import { supabase } from '@/lib/supabase';
import { createSoundEngine } from '@/lib/sound/engine';
import { SEED_PROFILES } from '@/lib/sound/seed-profiles';
import { HADES_PROFILES, ambientForRegion, shouldGrowl } from '@/lib/nether-realm/sounds';

const STICK_RADIUS = 60;

export default function NetherRealmPage() {
  const sceneGuard = useSceneContextGuard({ label: 'NETHER-REALM' });
  const { travel, overlay: vortexOverlay } = useVortexTravel();

  const playerRef = useRef({ x: SPAWN.x, z: SPAWN.z, yaw: SPAWN.yaw });
  const inputRef = useRef({ fwd: 0, strafe: 0, run: false, lookDx: 0 });
  const keysRef = useRef(new Set());
  const dragRef = useRef({ active: false, lastX: 0 });
  const stickRef = useRef({ id: null, ox: 0, oy: 0 });
  const lookTouchRef = useRef({ id: null, lastX: 0 });

  const [region, setRegion] = useState('The Descent');
  const regionRef = useRef(region);
  const [touchUI, setTouchUI] = useState(false);
  const [reduced, setReduced] = useState(false);
  const { infoHidden, fadeInfo, restoreInfo, infoStyle } = useRealmInfoFade({ reduced });
  const [stick, setStick] = useState({ dx: 0, dy: 0, active: false });

  // --- Medusa's lair -------------------------------------------------------
  // The boss clock, the head, the statues and the foes. The scene
  // renders them; this page owns the law (lib/nether-realm/medusa.js).
  const [user, setUser] = useState(null);
  const userRef = useRef(null);
  const [head, setHead] = useState({ owned: false, level: 0, uses: 0, serverLive: null });
  const headRef = useRef(head);
  const [boss, setBoss] = useState(() => createMedusaBoss());
  const bossRef = useRef(boss);
  const medusaPosRef = useRef({ x: MEDUSA_POS.x, z: MEDUSA_POS.z });
  const hunterRef = useRef({ alive: true, bladeT: 0, bowT: 0 });
  const [statues, setStatues] = useState([]);
  const statuesRef = useRef(statues);
  const [foes, setFoes] = useState([]);
  const foesRef = useRef(foes);
  const [headWielded, setHeadWielded] = useState(true);
  const [headState, setHeadState] = useState('idle');
  const [firingAtMs, setFiringAtMs] = useState(0);
  const [foesInCone, setFoesInCone] = useState(0);
  // THE FLAMING CHAIN (Merlin, 2026-11-15): won from the Ghost
  // Rider, used here in Hades. chainFx is the CGI effect the
  // scene renders ({ from, to, targets, atMs }); chainInReach is
  // the live target count for the button label. The chain's level
  // lives in the account (ghost_rider_chains), like the head's.
  const [chainFx, setChainFx] = useState(null);
  const [chainInReach, setChainInReach] = useState(0);
  const [chain, setChain] = useState({ owned: false, level: 0, serverLive: null });
  const chainRef = useRef(chain);
  const handledIncinerationIdsRef = useRef(new Set());
  const [notice, setNotice] = useState('');
  const [nowTick, setNowTick] = useState(Date.now());
  const noticeTimerRef = useRef(null);
  const sessionStartRef = useRef(Date.now());
  const handledStatueIdsRef = useRef(new Set());
  const presenceRef = useRef(null);
  const pack = useBackpack();

  const showNotice = useCallback((text) => {
    setNotice(text);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(''), 5000);
  }, []);

  const getToken = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getSession();
      return data && data.session ? data.session.access_token : null;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => { headRef.current = head; }, [head]);
  useEffect(() => { chainRef.current = chain; }, [chain]);
  useEffect(() => { bossRef.current = boss; }, [boss]);
  useEffect(() => { statuesRef.current = statues; }, [statues]);
  useEffect(() => { foesRef.current = foes; }, [foes]);
  useEffect(() => () => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    if (presenceRef.current) presenceRef.current.dispose();
  }, []);

  // Signed-in user (guests still walk Hades — they just cannot
  // earn the head or petrify anyone).
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

  // Head status from the server (the source of truth for owned /
  // level / uses). When the server says owned and the pack lacks
  // the item, the pack gains it — the server claim already
  // happened, the local handle just went missing.
  const fetchHeadStatus = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    try {
      const res = await fetch('/api/medusa/heads', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        if (res.status === 503) setHead((h) => ({ ...h, serverLive: false }));
        return;
      }
      const data = await res.json();
      setHead({ owned: !!data.owned, level: data.upgradeLevel || 0, uses: data.uses || 0, serverLive: true });
      if (data.owned) {
        try {
          const rec = getBackpackRecord();
          if (countItem(rec, HEAD_ITEM_ID) === 0) {
            updateBackpack((r) => addMedusaHeadItem(r, medusaHeadItem(data.earnedAt)));
          }
        } catch { /* pack unavailable */ }
      }
    } catch { /* API unreachable — the pack stays the interim truth */ }
  }, [getToken]);

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
          if (countItem(rec, 'flaming-chain') === 0) {
            updateBackpack((r) => addFlamingChainItem(r, createChainItem()));
          }
        } catch { /* pack unavailable */ }
      }
    } catch { /* API unreachable — the pack stays the interim truth */ }
  }, [getToken]);

  useEffect(() => {
    if (user) fetchHeadStatus();
  }, [user, fetchHeadStatus]);

  useEffect(() => {
    if (user) fetchChainStatus();
  }, [user, fetchChainStatus]);

  // Hades presence (lib/presence.js, sector 'hades'): every walker
  // upserts their position every 2.5 s and polls everyone else's
  // on the same cadence. Foes = other users in Hades. When the
  // presence table is missing the client no-ops cleanly and the
  // realm renders solo — no fake foes, ever.
  useEffect(() => {
    let cancelled = false;
    let client = null;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const sessionUser = data && data.session ? data.session.user : null;
        if (cancelled) return;
        client = createPresenceClient(supabase, {
          sector: 'hades',
          userId: sessionUser ? sessionUser.id : undefined,
          label: displayNameFor(sessionUser),
          getState: () => ({
            // pos.y carries the walker yaw (radians) — height is
            // always 0 on Hades' ground plane, so the slot is free.
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
  // inside the client — cheap to call every frame).
  useEffect(() => {
    const id = setInterval(() => {
      try {
        if (presenceRef.current) void presenceRef.current.update();
      } catch { /* noop */ }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // LINGERING DECAY (Merlin, 2026-11-15): report the walker to the
  // decay bus every second — the global heartbeat turns movement
  // into decayed spots (while a carrier) and infection checks.
  useEffect(() => {
    const id = setInterval(() => {
      try {
        reportDecayPosition('/nether-realm', playerRef.current.x, playerRef.current.z);
      } catch { /* noop */ }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Statues: the server list is the source of truth when it
  // answers; interim statues (recorded while the API was down)
  // ride alongside, clearly labelled, until the server list
  // carries them. Polled every 15 s — a petrify is not twitch.
  const INTERIM_KEY = 'olympus:medusa-statues-interim:v1';
  const loadInterimStatues = useCallback(() => {
    try {
      const raw = localStorage.getItem(INTERIM_KEY);
      if (!raw) return [];
      return (JSON.parse(raw) || []).map(sanitizeStatue).filter(Boolean);
    } catch {
      return [];
    }
  }, []);
  const saveInterimStatues = useCallback((list) => {
    try {
      localStorage.setItem(INTERIM_KEY, JSON.stringify(list));
    } catch { /* storage unavailable */ }
  }, []);

  const fetchStatues = useCallback(async () => {
    try {
      const res = await fetch('/api/medusa/statues?realm=hades');
      if (!res.ok) return;
      const data = await res.json();
      const server = (data.statues || []).map(sanitizeStatue).filter(Boolean);
      const interim = loadInterimStatues().filter((s) => !server.some(
        (sv) => sv.victim_user_id === s.victim_user_id
          && Math.hypot(sv.x - s.x, sv.z - s.z) < 2,
      ));
      saveInterimStatues(interim);
      setStatues([...server, ...interim]);
    } catch { /* API unreachable — the statues already on screen stay */ }
  }, [loadInterimStatues, saveInterimStatues]);

  useEffect(() => {
    fetchStatues();
    const id = setInterval(fetchStatues, 15000);
    return () => clearInterval(id);
  }, [fetchStatues]);

  // Self-petrify: a statue naming us, created after we arrived,
  // means someone turned us to stone — we wake 100 m away (the
  // Dutchman law) and our statue stands where we fell.
  useEffect(() => {
    const me = userRef.current;
    if (!me) return;
    for (const s of statues) {
      if (!s || s.victim_user_id !== me.id) continue;
      if (handledStatueIdsRef.current.has(s.id)) continue;
      if (!s.created_at || new Date(s.created_at).getTime() < sessionStartRef.current) continue;
      handledStatueIdsRef.current.add(s.id);
      const spot = petrifyRespawnSpot(s.x, s.z, Math.random() * Math.PI * 2);
      playerRef.current.x = spot.x;
      playerRef.current.z = spot.z;
      showNotice(`🐍 ${s.petrifier_name} turned you to stone — you wake 100 m away. Your statue stands where you fell.`);
    }
  }, [statues, showNotice]);

  // THE FLAMING CHAIN (Merlin, 2026-11-15): incinerations are the
  // chain's shared record — the server list is the source of truth
  // when it answers; interim records (burned while the API was
  // down) ride alongside, clearly labelled, until the server list
  // carries them. Polled every 15 s, same cadence as the statues.
  const INTERIM_INCIN_KEY = 'olympus:ghost-rider-incinerations-interim:v1';
  const loadInterimIncinerations = useCallback(() => {
    try {
      const raw = localStorage.getItem(INTERIM_INCIN_KEY);
      if (!raw) return [];
      return (JSON.parse(raw) || []).map(sanitizeIncineration).filter(Boolean);
    } catch {
      return [];
    }
  }, []);
  const saveInterimIncinerations = useCallback((list) => {
    try {
      localStorage.setItem(INTERIM_INCIN_KEY, JSON.stringify(list));
    } catch { /* storage unavailable */ }
  }, []);

  const fetchIncinerations = useCallback(async () => {
    try {
      const res = await fetch('/api/ghost-rider/incinerations?realm=hades');
      if (!res.ok) return;
      const data = await res.json();
      const server = (data.incinerations || []).map(sanitizeIncineration).filter(Boolean);
      const me = userRef.current;
      if (!me) return;
      for (const s of server) {
        if (!s || s.victim_kind !== 'user' || s.victim_user_id !== me.id) continue;
        if (handledIncinerationIdsRef.current.has(s.id)) continue;
        if (!s.created_at || new Date(s.created_at).getTime() < sessionStartRef.current) continue;
        handledIncinerationIdsRef.current.add(s.id);
        setLakeLanding(window.localStorage);
        showNotice(`🔥 ${s.chainer_name} burned you to ash with the flaming chain — you wake in the Lake of Fire.`);
        travel('/hell', 'the Lake of Fire');
      }
    } catch { /* API unreachable — no one is moved by a record the server never saw */ }
  }, [showNotice, travel]);

  useEffect(() => {
    fetchIncinerations();
    const id = setInterval(fetchIncinerations, 15000);
    return () => clearInterval(id);
  }, [fetchIncinerations]);

  // The boss clock + strike cooldowns + the head's aim state,
  // four times a second. Reform is the boss's own law (45 s);
  // the aim state reads live positions, not render state.
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      setNowTick(now);
      if (tickMedusa(bossRef.current, now) === 'reformed') {
        setBoss({ ...bossRef.current });
        showNotice('🐍 Medusa reforms in her lair — her head is there for the taking again.');
      }
      const h = hunterRef.current;
      h.bladeT = Math.max(0, h.bladeT - 0.25);
      h.bowT = Math.max(0, h.bowT - 0.25);
      // The chain's reach reads live positions too — foes in
      // front of you, inside its 20 m, count for the button (as
      // many as the throw wraps at this level).
      try {
        const chainItem = getBackpackRecord().items.find((e) => e.kind === 'flaming-chain');
        const hits = chainItem && chainUsable(refreshChain(chainItem, now), now).ok
          ? findChainTargets(playerRef.current, foesRef.current, [], chainsPerThrow(chainRef.current.level))
          : [];
        setChainInReach(hits.length);
      } catch { setChainInReach(0); }
      const hd = headRef.current;
      if (!hd.owned || !headWielded) {
        setHeadState('sheathed');
        setFoesInCone(0);
        return;
      }
      if (now - firingAtMs < 600) {
        setHeadState('firing');
        return;
      }
      const p = playerRef.current;
      const inCone = foesInPetrifyCone(p.x, p.z, p.yaw, foesRef.current, victimsPerUse(hd.level));
      setFoesInCone(inCone.length);
      setHeadState(inCone.length > 0 ? 'aiming' : 'idle');
    }, 250);
    return () => clearInterval(id);
  }, [headWielded, firingAtMs, showNotice]);

  // Sound engine (Merlin, Nov 12, 2026): one engine for every sound.
  // Cerberus growls, the Styx flows, Tartarus crackles, Elysium sings.
  const soundRef = useRef(null);
  const lastGrowlRef = useRef(0);
  const [soundOn, setSoundOn] = useState(true);
  const listenerPos = useCallback(() => {
    const p = playerRef.current;
    return { x: p.x, z: p.z, yaw: p.yaw };
  }, []);

  useEffect(() => {
    regionRef.current = region;
  }, [region]);

  useEffect(() => {
    try {
      setTouchUI(navigator.maxTouchPoints > 0);
      setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch { /* desktop defaults stand */ }
  }, []);

  // Headless probe hook: window.__netherRealm.player / .region / .teleport.
  // teleport() is test instrumentation only (the probe places the player
  // near an arch to prove vortex travel without a two-minute walk at
  // swiftshader frame rates); it changes nothing about the real game.
  useEffect(() => {
    try {
      window.__netherRealm = {
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

  // Sound engine: unlock on the first gesture (browsers demand it),
  // then the ambient bed for the region the player is standing in.
  // The engine is created once; the bed and the growl live below.
  useEffect(() => {
    const engine = createSoundEngine({ profiles: [...SEED_PROFILES, ...HADES_PROFILES] });
    soundRef.current = engine;
    const unlock = () => {
      if (!engine.unlock()) return;
      engine.startAmbient(ambientForRegion(regionRef.current), listenerPos);
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      engine.stopAmbient();
      soundRef.current = null;
    };
  }, [listenerPos]);

  // The ambient bed follows the region: birdsong in Elysium, fire in
  // Tartarus, whispers in Asphodel, the Styx on the bridge.
  useEffect(() => {
    const engine = soundRef.current;
    if (!engine || !engine.unlocked || !soundOn) return;
    engine.startAmbient(ambientForRegion(region), listenerPos);
  }, [region, soundOn, listenerPos]);

  // Cerberus growls when the player walks close to the Gates — at
  // most once every 12 seconds, so it stays a warning, not a loop.
  useEffect(() => {
    const id = setInterval(() => {
      const engine = soundRef.current;
      if (!engine || !engine.unlocked || !soundOn) return;
      const now = Date.now();
      if (!shouldGrowl(playerRef.current, lastGrowlRef.current, now)) return;
      lastGrowlRef.current = now;
      const p = playerRef.current;
      engine.playSound('cerberus', 'growl', { x: GATES.x, z: GATES.z }, { x: p.x, z: p.z, yaw: p.yaw });
    }, 1500);
    return () => clearInterval(id);
  }, [soundOn]);

  // Thunder (Merlin, 2026-11-14): the day/night rig flashes lightning
  // and dispatches window 'olympus:thunder' on a strike — this page
  // owns the only sound engine, so it answers with a low rumble.
  // No strike position rides the event, so the rumble is centred and
  // full-volume; the engine's own gain still applies. Respects the
  // sound toggle, like the growl does.
  useEffect(() => {
    const onThunder = (event) => {
      if (event?.detail?.realm && event.detail.realm !== 'hades') return;
      const engine = soundRef.current;
      if (!engine || !engine.unlocked || !soundOn) return;
      const p = playerRef.current;
      engine.playSound('hades-thunder', 'thunder', null, { x: p.x, z: p.z, yaw: p.yaw });
    };
    window.addEventListener('olympus:thunder', onThunder);
    return () => window.removeEventListener('olympus:thunder', onThunder);
  }, [soundOn]);

  // --- the fight, the head, the upgrades ----------------------------------
  // The beheading uses the Middle-earth strike pattern directly
  // (strike + BLADE + aimYawFromWalker, app/middle-earth/orcs.js):
  // a blade swing in the arc, on the 0.45 s cooldown, damage from
  // the equipped backpack weapon or 12 (the short sword) by default.
  const onStrikeMedusa = useCallback(() => {
    const b = bossRef.current;
    if (!b || b.state !== 'alive') return;
    const p = playerRef.current;
    const target = {
      state: 'alive',
      x: medusaPosRef.current.x,
      z: medusaPosRef.current.z,
      stats: { scale: 1.5 },
    };
    const hit = strike(hunterRef.current, [target], p.x, p.z, aimYawFromWalker(p.yaw), BLADE, 'melee');
    if (!hit) {
      showNotice('Out of reach — step closer to Medusa and face her.');
      return;
    }
    let dmg = MEDUSA_DEFAULT_DMG;
    try {
      const rec = getBackpackRecord();
      dmg = equippedDamageForSlot(equippedWeaponEntry(rec), 'melee') ?? MEDUSA_DEFAULT_DMG;
    } catch { /* native damage stands */ }
    const res = strikeMedusa(b, dmg, Date.now());
    setBoss({ ...b });
    if (!res.killed) {
      showNotice(`You strike Medusa — ${b.hp} of her ${b.maxHp} strength remains.`);
      return;
    }
    showNotice('🐍 Medusa falls — her head is yours to claim.');
    void claimHead();
  }, [showNotice]);

  // Claim the head: the server is the authority for one-per-user
  // (medusa_heads has one row per user). When the service is not
  // live, the head still lands in the pack, marked serverPending,
  // and the claim retries on the next status fetch.
  const claimHead = useCallback(async () => {
    const token = await getToken();
    if (!token) {
      showNotice('Sign in to claim Medusa’s head — one head per user, kept in your account.');
      return;
    }
    const grantLocally = (pending) => {
      try {
        const rec = getBackpackRecord();
        if (countItem(rec, HEAD_ITEM_ID) === 0) {
          const item = medusaHeadItem(new Date().toISOString());
          if (pending) item.meta.serverPending = true;
          updateBackpack((r) => addMedusaHeadItem(r, item));
        }
      } catch { /* pack unavailable */ }
    };
    try {
      const res = await fetch('/api/medusa/heads', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 503) {
        grantLocally(true);
        setHead((h) => ({ ...h, owned: true, serverLive: false }));
        showNotice('🐍 Her head is in your pack — the server claim will land when the Medusa service is live.');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showNotice(data.error || 'The claim did not land — her head waits in the lair.');
        return;
      }
      grantLocally(false);
      setHead({ owned: true, level: data.upgradeLevel || 0, uses: data.uses || 0, serverLive: true });
      showNotice(data.alreadyHeld
        ? 'You already hold her head — one per user, yours forever.'
        : '🐍 Medusa’s head is yours — one head, use it as often as you like.');
    } catch {
      grantLocally(true);
      setHead((h) => ({ ...h, owned: true, serverLive: false }));
      showNotice('🐍 Her head is in your pack — the server claim will land when the service is reachable.');
    }
  }, [getToken, showNotice]);

  // Use the head: foes in the gaze cone turn to stone. The server
  // records the statues (and counts the use); when it cannot be
  // reached the statues stand on this device, clearly labelled,
  // until the server list is live.
  const onUseHead = useCallback(async () => {
    const hd = headRef.current;
    const holdsLocally = (() => {
      try { return countItem(getBackpackRecord(), HEAD_ITEM_ID) > 0; } catch { return false; }
    })();
    if (!hd.owned && !holdsLocally) {
      showNotice('You don’t hold her head yet — cut it off in her lair first.');
      return;
    }
    if (!headWielded) {
      showNotice('Raise the head first — it only gazes while held up.');
      return;
    }
    const p = playerRef.current;
    const targets = foesInPetrifyCone(p.x, p.z, p.yaw, foesRef.current, victimsPerUse(hd.level));
    if (targets.length === 0) {
      showNotice(`No foe in the gaze — get within ${PETRIFY_RANGE_M} m and face them.`);
      return;
    }
    setFiringAtMs(Date.now());
    const me = userRef.current;
    const records = targets.map((t) => statueRecordFor({
      victim: { id: t.id, name: t.label, appearance: { color: t.color, characterId: t.characterId || null } },
      petrifier: { id: me ? me.id : null, name: displayNameFor(me) },
      x: t.x,
      z: t.z,
    }));
    const names = targets.map((t) => t.label || 'Traveller').join(', ');
    const token = await getToken();
    try {
      if (!token) throw new Error('signed-out');
      const res = await fetch('/api/medusa/statues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ statues: records }),
      });
      if (!res.ok) throw new Error(`statues-${res.status}`);
      const data = await res.json();
      const server = (data.statues || []).map(sanitizeStatue).filter(Boolean);
      setStatues((prev) => [...server, ...prev.filter((s) => !server.some((sv) => sv.id === s.id))]);
      setHead((h) => ({ ...h, uses: h.uses + targets.length }));
      showNotice(`🐍 ${names} turned to stone — their statues stand where they fell.`);
    } catch {
      const interim = records.map((r) => sanitizeStatue({ ...r, id: `interim-${r.victim_user_id}-${Date.now()}`, interim: true })).filter(Boolean);
      const kept = [...loadInterimStatues(), ...interim];
      saveInterimStatues(kept);
      setStatues((prev) => [...prev, ...interim]);
      showNotice(`🐍 ${names} turned to stone — their statues stand on this device until the server list is live.`);
    }
    await fetchStatues();
  }, [headWielded, getToken, showNotice, loadInterimStatues, saveInterimStatues, fetchStatues]);

  // Use the chain: foes in front of you, inside 20 m, burn to
  // ash and wake in the Lake of Fire — as many as the throw wraps
  // at this level (1 at level 0, 5 at level 4). 3 uses, then a
  // one-hour cooldown — the charge leaves the pack only when the
  // use lands. The server records the burns (and moves the
  // victims' clients); when it cannot be reached the burns stand
  // on this device, clearly labelled, until the server list is live.
  const onUseChain = useCallback(async () => {
    const chainItem = (() => {
      try { return getBackpackRecord().items.find((e) => e.kind === 'flaming-chain') || null; } catch { return null; }
    })();
    if (!chainItem) {
      showNotice('You don’t hold the flaming chain yet — win it from the Ghost Rider first.');
      return;
    }
    const check = chainUsable(refreshChain(chainItem, Date.now()), Date.now());
    if (!check.ok) {
      showNotice(check.reason === 'cooldown'
        ? `The chain is cooling down — ${formatCooldown(check.cooldownRemainingMs)} left. Use it wisely.`
        : 'The chain will not answer.');
      return;
    }
    const p = playerRef.current;
    const hits = findChainTargets(p, foesRef.current, [], chainsPerThrow(chainRef.current.level));
    if (hits.length === 0) {
      showNotice(`No foe in the chain’s reach — get within ${CHAIN_RANGE_M} m and face them.`);
      return;
    }
    const spent = useChain(chainItem, Date.now());
    try {
      updateBackpack((r) => ({
        ...r,
        items: r.items.map((e) => (e.uid === chainItem.uid ? spent : e)),
      }));
    } catch { /* pack unavailable — the burns still land */ }
    const first = hits[0];
    setChainFx({
      from: { x: p.x, z: p.z },
      to: { x: first.target.x, z: first.target.z },
      targets: hits.map((h) => ({ x: h.target.x, z: h.target.z })),
      atMs: Date.now(),
    });
    const me = userRef.current;
    const records = hits.map((h) => incinerationRecordFor({
      victim: { id: h.target.id, name: h.target.label || 'Traveller' },
      chainer: { id: me ? me.id : null, name: displayNameFor(me) },
      realm: 'hades',
      x: h.target.x,
      z: h.target.z,
      kind: 'user',
    }));
    const names = hits.map((h) => h.target.label || 'Traveller');
    const token = await getToken();
    try {
      if (!token) throw new Error('signed-out');
      const res = await fetch('/api/ghost-rider/incinerations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ incinerations: records }),
      });
      if (!res.ok) throw new Error(`incinerations-${res.status}`);
      showNotice(hits.length === 1
        ? `🔥 ${names[0]} burns to ash — the chain sends them to the Lake of Fire.`
        : `🔥 ${names.join(', ')} burn to ash — the chain sends them to the Lake of Fire.`);
    } catch {
      const interims = records.map((record, i) => sanitizeIncineration({ ...record, id: `interim-${hits[i].target.id}-${Date.now()}-${i}`, created_at: new Date().toISOString() })).filter(Boolean);
      if (interims.length > 0) saveInterimIncinerations([...loadInterimIncinerations(), ...interims]);
      showNotice(hits.length === 1
        ? `🔥 ${names[0]} burns to ash — the burn stands on this device until the Ghost Rider service is live.`
        : `🔥 ${names.join(', ')} burn to ash — the burns stand on this device until the Ghost Rider service is live.`);
    }
  }, [getToken, showNotice, loadInterimIncinerations, saveInterimIncinerations]);

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
        : `The chain wants ${chainUpgradeCostFor(ch.level)} orc shards — you hold ${shards}. Orcs in Middle-earth drop them.`);
      return;
    }
    const token = await getToken();
    if (!token) {
      showNotice('Sign in to upgrade the chain — the level lives in your account.');
      return;
    }
    try {
      const res = await fetch('/api/ghost-rider/chains/upgrade', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showNotice(data.error || 'The upgrade did not land — your shards are safe.');
        return;
      }
      try {
        updateBackpack((r) => removeItem(r, ORC_SHARD_ITEM_ID, chainUpgradeCostFor(ch.level)));
      } catch { /* pack unavailable */ }
      setChain((c) => ({ ...c, level: data.upgradeLevel || 0 }));
      showNotice(`🔥 The chain hungers for more — ${chainsPerThrow(data.upgradeLevel || 0)} chains per throw now.`);
    } catch {
      showNotice('The upgrade did not land — the service is unreachable, your shards are safe.');
    }
  }, [getToken, showNotice]);

  // Upgrade the head: flat 20 orc shards, +1 victim per use, up
  // to 5. The server is the authority for the level — the client
  // never self-grants one — and the shards leave the pack only
  // after the server confirms.
  const onUpgradeHead = useCallback(async () => {
    const hd = headRef.current;
    let shards = 0;
    try { shards = countItem(getBackpackRecord(), ORC_SHARD_ITEM_ID); } catch { /* pack unavailable */ }
    const check = canUpgrade(hd.level, shards);
    if (!check.ok) {
      showNotice(check.reason === 'max'
        ? 'The head is already at its full hunger — 5 victims per use.'
        : `The head wants ${upgradeCostFor(hd.level)} orc shards — you hold ${shards}. Orcs in Middle-earth drop them.`);
      return;
    }
    const token = await getToken();
    if (!token) {
      showNotice('Sign in to upgrade the head — the level lives in your account.');
      return;
    }
    try {
      const res = await fetch('/api/medusa/heads/upgrade', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showNotice(data.error || 'The upgrade did not land — your shards are safe.');
        return;
      }
      try {
        updateBackpack((r) => removeItem(r, ORC_SHARD_ITEM_ID, upgradeCostFor(hd.level)));
      } catch { /* pack unavailable */ }
      setHead((h) => ({ ...h, level: data.upgradeLevel || 0 }));
      showNotice(`🐍 The head hungers for more — ${victimsPerUse(data.upgradeLevel || 0)} victims per use now.`);
    } catch {
      showNotice('The upgrade did not land — the service is unreachable, your shards are safe.');
    }
  }, [getToken, showNotice]);

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
    // MEDUSA ARCH (Merlin, 2026-11-15): re-pointed to the boss chamber
    // in Hades — no route, the arch walks you to the lair gate inside
    // this realm. The region reads "Medusa's Lair" as you step in.
    if (portal.local) {
      playerRef.current.x = portal.local.x;
      playerRef.current.z = portal.local.z;
      playerRef.current.yaw = portal.local.yaw;
      return;
    }
    travel(portal.route, portal.label);
  }, [travel]);
  // ANTI-LIFE PORTAL (Merlin, 2026-11-15): the fall-through floor
  // portal in this realm drops the walker into Anti-Life — where the
  // 10-minute decay effect is granted. Same vortex travel as the
  // arches; the tube is the fall.
  const onAntiLife = useCallback(() => {
    travel(ANTI_LIFE_ROUTE, ANTI_LIFE_PORTAL_NAME);
  }, [travel]);

  // The scene reports Medusa's live patrol position every frame —
  // the strike needs her real x/z, not her chamber centre.
  const onMedusaMove = useCallback((pos) => {
    medusaPosRef.current = pos;
  }, []);

  // LAVA DROP (Merlin, 2026-11-13): stepping into a lava pool drops
  // the walker into the World Engine — the build surface. Same vortex
  // travel as the arches; the tube is the fall.
  const onLava = useCallback(() => {
    travel(LAVA_DROP_ROUTE, LAVA_DROP_NAME);
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

  // The chain's live status for its button (charges + cooldown).
  const chainItem = pack.items.find((e) => e.kind === 'flaming-chain') || null;
  const chainLabel = chainItem
    ? chainStatus(refreshChain(chainItem, nowTick), nowTick).label
    : '';

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
          <NetherRealmScene
            playerRef={playerRef}
            inputRef={inputRef}
            onPortal={onPortal}
            onAntiLife={onAntiLife}
            onLava={onLava}
            onRegion={onRegion}
            reduced={reduced}
            medusa={boss}
            statues={statues}
            foes={foes}
            headHeld={head.owned && headWielded}
            headState={headState}
            firingAtMs={firingAtMs}
            chainFx={chainFx}
            onMedusaMove={onMedusaMove}
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
          global radio bar (bottom-20); the stick sits above it too. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col items-center px-4 pt-16 text-center" style={infoStyle} aria-hidden={infoHidden}>
        <h1 className="text-2xl font-bold tracking-[0.3em] text-red-100 drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
          HADES
        </h1>
        <p className="mt-1 text-sm text-stone-300 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
          The world beneath the world — Hades rules here.
        </p>
        <p className="mt-1 text-sm font-semibold text-amber-200 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
          You are in: {region}
        </p>
        <p className="mt-3 rounded-full bg-black/55 px-4 py-2 text-xs text-stone-200">
          {touchUI
            ? 'Left stick to walk · drag the right side to look around · walk through a glowing arch to travel · step onto the dark Anti-Life disc to fall through · step into lava to drop into the World Engine · Medusa’s lair lies southwest'
            : 'WASD or arrows to walk · drag to look around · Shift to run · walk through a glowing arch to travel · step onto the dark Anti-Life disc to fall through · step into lava to drop into the World Engine · Medusa’s lair lies southwest'}
        </p>
        <RealmLifeLine realmKey="nether-realm" />
      </div>

      <div className="absolute left-4 top-4 z-30">
        <Link
          href="/"
          className="pointer-events-auto inline-block rounded-full border border-white/30 bg-black/60 px-4 py-2 text-sm font-semibold text-white"
        >
          ← Leave the Nether-Realm
        </Link>
      </div>

      <div className="absolute right-4 top-4 z-30 flex items-center gap-2">
        <BackpackHud realm="nether-realm" realmLabel="Hades" combatApplies docked />
        <button
          type="button"
          onClick={() => {
            const engine = soundRef.current;
            const next = !soundOn;
            setSoundOn(next);
            if (engine) engine.setMuted(!next);
          }}
          className="pointer-events-auto rounded-full border border-white/30 bg-black/60 px-4 py-2 text-sm font-semibold text-white"
        >
          {soundOn ? 'Sound: on' : 'Sound: off'}
        </button>
      </div>

      {/* Medusa notice — top-centre, above the action row */}
      {notice && (
        <div className="pointer-events-none absolute inset-x-0 bottom-36 z-30 flex justify-center px-4">
          <p className="rounded-full bg-black/75 px-4 py-2 text-center text-sm font-semibold text-green-100">
            {notice}
          </p>
        </div>
      )}

      {/* Medusa's lair actions — only the buttons that apply right now */}
      <div className="absolute inset-x-0 bottom-20 z-30 flex flex-wrap items-center justify-center gap-2 px-4">
        {region === "Medusa's Lair" && boss.state === 'alive' && (
          <button
            type="button"
            onClick={onStrikeMedusa}
            className="pointer-events-auto rounded-full border border-green-400/60 bg-black/70 px-4 py-2 text-sm font-semibold text-green-100"
          >
            ⚔ Strike Medusa — {boss.hp}/{boss.maxHp}
          </button>
        )}
        {region === "Medusa's Lair" && boss.state === 'dead' && (
          <p className="rounded-full bg-black/60 px-4 py-2 text-sm font-semibold text-stone-300">
            Medusa reforms in {reformInS(boss, nowTick)} s…
          </p>
        )}
        {head.owned && (
          <>
            <button
              type="button"
              onClick={onUseHead}
              className="pointer-events-auto rounded-full border border-green-400/60 bg-black/70 px-4 py-2 text-sm font-semibold text-green-100"
            >
              🐍 Use the Head{foesInCone > 0 ? ` — ${foesInCone} in the gaze` : ''} · {victimsPerUse(head.level)} per use
            </button>
            <button
              type="button"
              onClick={() => setHeadWielded((w) => !w)}
              className="pointer-events-auto rounded-full border border-white/30 bg-black/60 px-4 py-2 text-sm font-semibold text-white"
            >
              {headWielded ? 'Lower the head' : 'Raise the head'}
            </button>
            <button
              type="button"
              onClick={onUpgradeHead}
              className="pointer-events-auto rounded-full border border-white/30 bg-black/60 px-4 py-2 text-sm font-semibold text-white"
            >
              ⬆ Head level {head.level} → {Math.min(5, victimsPerUse(head.level) + 1)} per use · 20 orc shards ({countItem(pack, ORC_SHARD_ITEM_ID)} held)
            </button>
          </>
        )}
        {chainItem && (
          <>
            <button
              type="button"
              onClick={onUseChain}
              className="pointer-events-auto rounded-full border border-orange-400/60 bg-black/70 px-4 py-2 text-sm font-semibold text-orange-100"
            >
              {chainLabel}{chain.level > 0 ? ` — ${chainsPerThrow(chain.level)} chains` : ''}{chainInReach > 0 ? ` — ${chainInReach} in reach` : ''}
            </button>
            <button
              type="button"
              onClick={onUpgradeChain}
              className="pointer-events-auto rounded-full border border-white/30 bg-black/60 px-4 py-2 text-sm font-semibold text-white"
            >
              ⬆ Chain level {chain.level} → {Math.min(5, chainsPerThrow(chain.level) + 1)} chains per throw · 20 orc shards ({countItem(pack, ORC_SHARD_ITEM_ID)} held)
            </button>
          </>
        )}
      </div>

      {/* Realm info restore — the faded HUD comes back with one tap. */}
      {infoHidden && (
        <button
          type="button"
          aria-label="Show realm information"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={restoreInfo}
          className="absolute left-1/2 top-16 z-30 -translate-x-1/2 rounded-full border border-white/30 bg-black/60 px-3 py-1 text-xs font-semibold text-white"
        >
          ⓘ Info
        </button>
      )}

      {vortexOverlay}
    </main>
  );
}
