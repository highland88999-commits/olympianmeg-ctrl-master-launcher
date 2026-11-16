'use client';

// OLYMPIAN MONSTERVERSE — the Hollow Earth world program.
// Modes: menu | map | world.
// menu  -> THE CONCOURSE ENTRY: the intro panel (Merlin's own
//          uploaded "OLYMPIAN MONSTERVERSE" banner art, with the
//          procedural gradient + elemental orbs as fallback only)
//          + CHARACTER SELECTION first
//          — the Monster Hunter by default, or any imported hero
//          — and entering the realm happens as that character.
//          There is no standalone picker page, by design.
// map   -> cluster cards (missions + completion) + the campaign
//          card (kills, shield progress, the Korus gate) +
//          🎯 Missions / 🧭 Free Roam entry per cluster.
// world -> buildWorld(THREE, WORLD, T, opts): walk the blended
//          biomes, hunt monsters (and be hunted — sight cone,
//          hearing, proximity, give-up, sanctuary break), heal
//          +12 per kill, shield at 30 kills, and — once the gate
//          opens — face Korus on his throne. Death respawns at
//          The Haven with full HP, kills and shield kept.
//          Logging off returns the hunter to The Haven next
//          entry (the realm's return point).
//
// Controls are FREE-FLOATING circle orbs (Merlin, Nov 16 ~02:30):
// no bar, no pill, no container holding them. Spawn to Base,
// weapon toggle, Strike and Map live in one draggable ORB DOCK
// (lib/world/orb-dock.js — the one shared mechanism, also used by
// Jupiter 2) at the bottom-left, next to the
// joystick — Map at the far top end of the dock, Strike at the
// bottom, never next to each other. The user drags the dock to a
// comfortable spot and the spot persists (localStorage, per user).
// Health, kills, sanctuary/wilds and the orb tally live in the HUD
// row. No one-off floating buttons beyond the dock, the joystick,
// JUMP, the backpack launcher and the fullscreen orb.

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { guardCanvasContext } from '../../lib/scene-context-guard.js';
import { buildWorld } from './zone';
import * as T from './textures';
import { HOLLOW_EARTH_SKY_VIDEO_URL, HOLLOW_EARTH_SKY_ART_URL } from './sky';
import { useNetherVideoTexture } from '../../lib/nether-realm/video-wraps';
import { LANDMARK_ART_TYPES, useLandmarkArtTextures } from './landmark-art';
import { applyLandmarkArt } from './landmarks';
import * as DATA from './data';
import { HEROES, HERO_ORDER, heroDef, buildHeroFigure } from './characters.js';
import {
  createHunterState, onMonsterKilled, applyDamage, isInBase, canTeleport,
  SAFE_BASE, PLAYER_MAX_HP, KORUS_POS, damageMonster, MONSTER_TYPES,
  monsterColliders, ELEMENT_COLORS,
  applyHitSecondary, tickHunterDot, clearHunterSecondaries,
  poolDpsAt, prunePools, activeSecondary, chillFactorFor,
} from './spawns.js';
import { getParticleTexture } from '../../lib/particles/sprites.js';
import {
  createOrbDrop, collectOrbs, pruneOrbs, addOrb, totalOrbs,
  loadProgress as loadOrbProgress, saveProgress as saveOrbProgress,
  buyShieldTier, buyWeaponTier, rechargeShield,
  shieldTierFor, weaponTierFor, SHIELD_TIERS, WEAPON_TIERS,
  SHIELD_RECHARGE_COST, ORB_ELEMENTS,
} from './elemental-orbs.js';
import { monsterLifeFor, korusLifeFor } from './operators.js';
import { RETICLE_BY_CLASS, equippedDamageForSlot, equippedReticleForSlot, equippedWeaponEntry } from '../../lib/backpack/backpack.js';
import { boltKindFor, BOLT_STYLE, BOLT_SPEED, BOLT_MAX_LIFE } from './bolt-visual.js';
import { updateBackpack, useBackpack, getBackpackRecord } from '../../lib/backpack/store.js';
import { spawnCompanion, updateCompanions, removeCompanion, hasCompanion } from '../../lib/dino-companion.js';
import { isDinoItem, dinoIdOf, dinoDisplayName, DINO_STATE_OUT, DINO_STATE_PACK, setDinoItemState } from '../../lib/earth2/breeding.js';
import BackpackHud from '@/components/backpack/BackpackHud';
import { roarToneFor, GHORRUM_LAUGH_TONE } from './behavior.js';
import { playRoarTone } from './roar-audio.js';
import { createWalker, applyLook, resolveColliders, WALK_EYE } from '@/lib/world/walk-controls';
import {
  sphereStateForDeck, stepHollowEarthWalker, spherePointFromDeck, sphereUpAtDeck,
  liftedPoint, frameFromRef, orientationQuat, flatQuat,
} from '../../lib/hollow-earth/planet.js';
import { nearestMountInRange, riderSeatOffsetY, mountYawForWalker, dismountSpot, rideSpeedForMount, MOUNT_BLEND_S, mountSpot, tryMount, dismountRide } from './riding';
import { createKeyInput, attachDragLook } from '@/lib/world/walk-input';
import { firstConnectedPad, newlyPressedButtons, pressedButtonSet, triggerRisingEdge, triggerValue, GAMEPAD_BUTTONS } from '@/lib/gamepad';
import WalkJoystick from '@/components/world/WalkJoystick';
import OrbButton, { OrbLabel } from '@/components/world/OrbButton';
import {
  loadOrbDockPosition, saveOrbDockPosition, resolveOrbDockPosition,
  orbDockFracToPx, orbDockPxToFrac, clampOrbDockPx, dragOrbDockTopLeft,
  isOrbDockDrag, ORB_DOCK_GAP, ORB_DOCK_UI_STATE_KEY,
} from '@/lib/world/orb-dock';

const GOLD = '#d8b25c';
const BOTTOM_CLEAR = 'max(1.5rem, calc(env(safe-area-inset-bottom) + 1rem))';
// No CORNER_CLEAR any more (Merlin, Nov 16 ~02:30): the 5.5 rem lift
// existed ONLY to clear the deleted bottom bar. With the bar gone
// the joystick (bottom-left) and JUMP (bottom-right) sit at
// BOTTOM_CLEAR, bottom-aligned with the orb dock — measured: at
// 320 px the dock's right edge is x 198 and JUMP's left edge x 232,
// 34 px clear, so nothing can sit on anything.
// MOUNT_SLOT — the Mount/Dismount orb's own absolutely-positioned
// slot, centred below the HUD: 13 rem clears the tallest HUD stack
// (two wrapped pill rows + sense + boss bar + two-line toast ≈ 12.6 rem)
// so the orb never sits on the boss bar and never shifts when a toast
// appears or fades.
const MOUNT_SLOT = { position: 'absolute', left: '50%', top: 'max(13rem, calc(env(safe-area-inset-top) + 12rem))', transform: 'translateX(-50%)', zIndex: 7 };

function readProgress() {
  try { return DATA.loadProgress() || DATA.createProgress(); } catch { return DATA.createProgress(); }
}
function readCampaign() {
  try { return DATA.loadCampaign() || DATA.createCampaign(); } catch { return DATA.createCampaign(); }
}

function reticleFor(weaponClass) {
  // RETICLE_BY_CLASS holds plain strings ('crosshair'/'chevron'/'dot'), not
  // {style} objects — the old `.style` read always fell back to 'dot', so
  // bows and firearms wore the wrong reticle. Fixed 2026-10-24.
  return RETICLE_BY_CLASS[weaponClass] || 'dot';
}

export default function HollowEarthPage() {
  const canvasRef = useRef(null);
  const worldRootRef = useRef(null);
  const joyRef = useRef({ x: 0, y: 0 });
  const jumpRef = useRef(false); // JUMP orb edge — consumed by the tick, one frame only
  const worldRef = useRef(null);
  const walkerRef = useRef(null);
  // INNER SPHERE (Nov 16): the sphere walker rides beside the
  // flat walker — walker.pos.x/z stay the deck coordinates
  // every distance rule reads, and sphereRef holds the 3D feet
  // + the transported heading the sphere step needs.
  const sphereRef = useRef(null);
  // Reset the sphere walker (deck + 3D feet + heading ref)
  // whenever the hunter teleports — spawn, death, mount,
  // dismount. The flat walker.pos is reset by the caller.
  const resetSphere = useCallback((x, z) => {
    const w = worldRef.current;
    sphereRef.current = sphereStateForDeck(x, z, w ? w.groundHeight : () => 0);
  }, []);
  // DINO COMPANIONS (Merlin, 2026-11-14): raised dinos ride the
  // backpack across realms — the world spawns 'out' dinos beside
  // the walker and follows them; the HUD summons/recalls through
  // dinoApiRef (the scene lives in the world effect).
  const companionsRef = useRef([]);
  const dinoApiRef = useRef(null);
  const hunterRef = useRef(null);
  const heroFigRef = useRef(null);
  const toastTimer = useRef(null);
  const lastTeleportRef = useRef(null);
  const hazardsRef = useRef([]);
  const hazardMeshesRef = useRef([]);
  const poolsRef = useRef([]); // WS6 acid pools: {x, z, radius, dps, until, ring, disc}
  /* ELEMENTAL ORBS (Merlin, Nov 16 ~01:52 — the J2 drop + trade
   * loop, MonsterVerse flavour): live drops on the field, the
   * device-local wallet + tiers, the walker's previous position
   * for the segment-collect check. */
  const orbDropsRef = useRef([]); // live drops {id, element, x, y, z, droppedAtMs}
  const orbProgressRef = useRef(null); // {orbs, shieldTier, weaponTier} — loaded on world entry
  const prevWalkerPosRef = useRef(null); // {x, y, z} last tick, for collectOrbs
  const dmgFlashTimer = useRef(null);
  const missionKillsRef = useRef(0);
  const noiseRef = useRef(null);
  const weaponRef = useRef('melee');
  /* MOUNTS (Merlin, Nov 15 ~01:29): Embermane + Frostbite ride.
   * rideRef is the frame loop's truth ({ mount } while mounted — the shared lib/mounting.js ride shape);
   * the blend eases the hero between the walk pose and the seat
   * pose over MOUNT_BLEND_S so mounting never snaps. */
  const rideRef = useRef(null);
  const rideBlendRef = useRef(0); // 0 = walk pose, 1 = seat pose
  const seatHeightRef = useRef(0); // saddle height above ground, metres
  const mountPromptRef = useRef(null); // monster id with a live prompt
  const rideApiRef = useRef(null); // { mountPrompted, dismount } for the buttons
  // The backpack's equipped weapon, read at strike time (a ref so
  // the zone effect's attack closure never goes stale when the
  // traveller equips mid-hunt).
  const pack = useBackpack();
  const equippedRef = useRef(null);
  useEffect(() => { equippedRef.current = equippedWeaponEntry(pack); }, [pack]);
  // The world effect mounts once per entry; campaign state keeps
  // moving under it (kills land mid-session), so the gate checks
  // read through this ref instead of the stale mount closure.
  const [mode, setMode] = useState('menu');
  // WS4 sky (G-02): the savage sky video owns the sky when live;
  // the static dome image is the fallback. Hollow Earth is NOT a
  // nether realm — its URL is wired directly, never added to
  // NETHER_VIDEO_SKY_REALMS.
  const skyVideoTex = useNetherVideoTexture(HOLLOW_EARTH_SKY_VIDEO_URL);
  const skyVideoTexRef = useRef(null);
  useEffect(() => { skyVideoTexRef.current = skyVideoTex; }, [skyVideoTex]);
  // WS4 landmark art (G-03): one illustrated graphic per landmark
  // type, hung once the textures land (plain faces until then).
  const landmarkTextures = useLandmarkArtTextures(LANDMARK_ART_TYPES);
  // Apply the video + landmark art to the live world whenever
  // either lands — or when entering the world after they already
  // landed (worldRef is null until the world mounts, so this
  // effect re-runs on mode too).
  useEffect(() => {
    const w = worldRef.current;
    if (!w) return;
    if (skyVideoTex && w.setSkyVideoTexture) w.setSkyVideoTexture(skyVideoTex);
    if (w.landmarkGroups) {
      for (const lg of w.landmarkGroups) {
        const tex = landmarkTextures[lg.group.userData.landmarkType];
        if (tex) applyLandmarkArt(lg.group, THREE, tex);
      }
    }
  }, [skyVideoTex, landmarkTextures, mode]);
  const [progress, setProgress] = useState(readProgress);
  const [campaign, setCampaign] = useState(readCampaign);
  const campaignRef = useRef(campaign);
  campaignRef.current = campaign;
  const [heroKey, setHeroKey] = useState(() => readProgress().hero);
  const [clusterId, setClusterId] = useState(null);
  const [entry, setEntry] = useState(null); // {kind:'mission',missionId} | {kind:'roam'}
  const [hud, setHud] = useState({ hp: PLAYER_MAX_HP, shield: 0, kills: 0, inBase: false, weapon: 'melee', sense: null, bossHp: null, bossAwake: false, secondary: null });
  const [orbHud, setOrbHud] = useState(null); // orb wallet mirror {orbs, shieldTier, weaponTier} — HUD tally + trade panel
  const [tradeOpen, setTradeOpen] = useState(false); // elemental trade panel — The Haven only
  const [dmgFlash, setDmgFlash] = useState(0);
  const [bannerFailed, setBannerFailed] = useState(false); // intro banner art; procedural orbs are the fallback
  const [videoFailed, setVideoFailed] = useState(false); // intro video; falls back to the banner image, then the orbs
  const [toast, setToast] = useState('');
  const [korusDead, setKorusDead] = useState(false);
  /* Mount prompt (nearest mountable monster in range) and mounted
   * state — React mirrors of rideRef/mountPromptRef, for the buttons. */
  const [mountPrompt, setMountPrompt] = useState(null); // { id, name } | null
  const [mounted, setMounted] = useState(null); // { id, name } | null
  // FULLSCREEN (Merlin, Nov 16 — standing law: the maximize button
  // sits at the very top right OF the game screen). The world root is
  // already fixed inset-0, so this is the real Fullscreen API on the
  // root, not a layout change — Escape (or the EXIT orb) leaves it.
  const [fullscreen, setFullscreen] = useState(false);
  const toggleFullscreen = useCallback(() => {
    if (fullscreen) {
      if (typeof document !== 'undefined' && document.fullscreenElement) document.exitFullscreen().catch(() => {});
      setFullscreen(false);
    } else {
      const el = worldRootRef.current;
      if (el && el.requestFullscreen) el.requestFullscreen().catch(() => {});
      setFullscreen(true);
    }
  }, [fullscreen]);
  useEffect(() => {
    if (!fullscreen) return undefined;
    const down = (e) => { if (e.key === 'Escape') setFullscreen(false); };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, [fullscreen]);
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // ORB DOCK (Merlin, Nov 16 ~02:30 — the bottom bar is gone): the
  // four world orbs (Spawn, Weapon, Strike, Map) are free-floating
  // in one draggable cluster at the bottom-left, next to the
  // joystick. The cluster drags as ONE unit (the simpler robust
  // choice — four individually-draggable orbs would each need their
  // own stored spot and could be parked on top of each other).
  // Position is viewport fractions {x, y} (the backpack-icon /
  // Concourse-Orb pattern, lib/backpack/icon.js): localStorage
  // instantly, /api/ui-state debounced when signed in, the account
  // copy winning on login. The route does NOT whitelist the
  // hollow_earth_orb_dock key yet, so the server copy is ignored
  // today and the device copy stands alone — one route line to
  // whitelist it for cross-device (flagged in the build report, not
  // done here: the route is outside this worker's regions).
  // Never dragged = no stored fractions = the CSS home slot
  // (left 142, bottom BOTTOM_CLEAR, bottom-aligned with the
  // joystick), so the default tracks the safe-area exactly.
  // Drag-vs-tap: a press that never travels past 8 px stays a tap
  // and the orb fires; past 8 px it is a drag, the click is
  // swallowed (timestamp guard + pointer capture mid-drag, the
  // backpack pattern), and the drop spot persists.
  const [dockFrac, setDockFrac] = useState(null); // {x, y} fractions, null = never dragged (CSS home)
  const [dockDragPx, setDockDragPx] = useState(null); // live top-left px while dragging
  const [dockViewport, setDockViewport] = useState(null); // {w, h} — re-clamps the spot on resize/rotation
  const dockRef = useRef(null);
  const dockSuppressClickRef = useRef(0);
  const dockSaveTimerRef = useRef(null);
  const dockTapGuard = useCallback(() => Date.now() - dockSuppressClickRef.current < 500, []);
  const persistDock = useCallback((frac) => {
    saveOrbDockPosition(frac);
    if (dockSaveTimerRef.current) clearTimeout(dockSaveTimerRef.current);
    dockSaveTimerRef.current = setTimeout(async () => {
      let token = null;
      try {
        const { supabase } = await import('@/lib/supabase');
        const { data: { session } } = await supabase.auth.getSession();
        token = session && session.access_token ? session.access_token : null;
      } catch { /* signed out: localStorage only */ }
      if (!token) return;
      try {
        await fetch('/api/ui-state', {
          method: 'POST',
          headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ preferences: { [ORB_DOCK_UI_STATE_KEY]: frac } }),
        });
      } catch { /* offline — localStorage already holds it; next drag retries */ }
    }, 800);
  }, []);
  // Hydrate: localStorage instantly; the account copy wins when
  // signed in (same precedence as the backpack icon). A
  // resize/rotation listener keeps fractions rendering back inside
  // the viewport at every size.
  useEffect(() => {
    const applyViewport = () => setDockViewport({ w: window.innerWidth, h: window.innerHeight });
    applyViewport();
    window.addEventListener('resize', applyViewport);
    setDockFrac(loadOrbDockPosition());
    let cancelled = false;
    (async () => {
      let token = null;
      try {
        const { supabase } = await import('@/lib/supabase');
        const { data: { session } } = await supabase.auth.getSession();
        token = session && session.access_token ? session.access_token : null;
      } catch { /* signed out: device copy stands */ }
      if (!token || cancelled) return;
      try {
        const res = await fetch('/api/ui-state', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        const data = await res.json().catch(() => null);
        const server = resolveOrbDockPosition({ server: data && data.preferences ? data.preferences[ORB_DOCK_UI_STATE_KEY] : null });
        if (!cancelled && server) setDockFrac(server);
      } catch { /* offline — the device copy stands */ }
    })();
    return () => {
      window.removeEventListener('resize', applyViewport);
      cancelled = true;
      if (dockSaveTimerRef.current) clearTimeout(dockSaveTimerRef.current);
    };
  }, []);
  // Drag engine (the backpack icon's, via orb-dock.js): a press
  // that never crosses 8 px stays a tap; past 8 px the cluster
  // follows the finger with its grab offset kept, clamped fully
  // on screen, and the drop persists. Pointer capture is taken
  // only AFTER the threshold is crossed — capturing at pointerdown
  // would retarget the pointerup to the cluster and the orb's
  // click would never fire.
  const beginDockDrag = (e) => {
    if (e.isPrimary === false) return;
    if (e.button != null && e.button !== 0) return;
    const el = dockRef.current;
    if (!el) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const origin = dockFrac && dockViewport
      ? clampOrbDockPx(orbDockFracToPx(dockFrac, vw, vh), vw, vh)
      : (() => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top }; })();
    const info = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: origin.x,
      origY: origin.y,
      x: origin.x,
      y: origin.y,
      moved: false,
      captured: false,
    };
    const onMove = (ev) => {
      if (ev.pointerId !== info.pointerId) return;
      if (!info.moved && !isOrbDockDrag(ev.clientX - info.startX, ev.clientY - info.startY)) return; // still a tap
      if (!info.moved) {
        info.moved = true;
        try { el.setPointerCapture(ev.pointerId); info.captured = true; } catch { /* no capture — window listeners still track */ }
      }
      const tl = dragOrbDockTopLeft(
        { x: info.origX, y: info.origY },
        { x: info.startX, y: info.startY },
        { x: ev.clientX, y: ev.clientY },
        window.innerWidth,
        window.innerHeight,
      );
      info.x = tl.x;
      info.y = tl.y;
      setDockDragPx(tl);
    };
    const onUp = (ev) => {
      if (ev.pointerId !== info.pointerId) return;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (info.captured) { try { el.releasePointerCapture(info.pointerId); } catch { /* noop */ } }
      setDockDragPx(null);
      if (!info.moved) return; // plain tap — the orb's click handler runs
      dockSuppressClickRef.current = Date.now();
      const next = orbDockPxToFrac({ x: info.x, y: info.y }, window.innerWidth, window.innerHeight);
      setDockFrac(next);
      persistDock(next);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };
  // The dock's rendered spot: live drag px while dragging, the
  // stored fractions otherwise, the CSS home slot (left 142,
  // bottom BOTTOM_CLEAR) while never dragged.
  const dockPx = dockDragPx || (dockFrac && dockViewport
    ? clampOrbDockPx(orbDockFracToPx(dockFrac, dockViewport.w, dockViewport.h), dockViewport.w, dockViewport.h)
    : null);
  const dockStyle = dockPx
    ? { left: dockPx.x, top: dockPx.y }
    : { left: 142, bottom: BOTTOM_CLEAR };

  const hero = useMemo(() => heroDef(heroKey), [heroKey]);
  const gateIsOpen = useMemo(() => DATA.gateOpen(campaign), [campaign]);

  const notice = useCallback((text) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 4200);
  }, []);

  const pickHero = (key) => {
    setHeroKey(key);
    setProgress((p) => {
      const next = DATA.setHero(p, key);
      DATA.saveProgress(next);
      return next;
    });
  };

  const enterCluster = (cid, kind, missionId) => {
    setClusterId(cid);
    setEntry(kind === 'mission' ? { kind: 'mission', missionId } : { kind: 'roam' });
    setMode('world');
  };

  /* ELEMENTAL TRADE (Merlin, Nov 16 ~01:52): orbs buy shield
   * tiers/recharge + bolt tiers, at The Haven only. Any-mix
   * costs (acid drains first, poison last — elemental-orbs.js).
   * The shield charge is applied to the hunter AND the campaign
   * (data.js owns it); the wallet + tiers persist device-local. */
  const tradeGuard = () => {
    if (hud.inBase) return true;
    notice('🔮 Trade only at The Haven — sanctuary is where the trade lives.');
    return false;
  };
  const applyOrbProgress = (next) => {
    orbProgressRef.current = next;
    saveOrbProgress(next);
    setOrbHud({ ...next, orbs: { ...next.orbs } });
  };
  const buyOrbShield = (tier) => {
    if (!tradeGuard()) return;
    const prog = orbProgressRef.current || loadOrbProgress();
    const h = hunterRef.current;
    const res = buyShieldTier(prog.orbs, prog.shieldTier, tier, h ? h.shield : 0);
    if (!res.ok) {
      notice(res.reason === 'need-orbs' ? '🔮 Not enough elemental orbs for that shield.' : '🛡️ You already own that shield or better.');
      return;
    }
    applyOrbProgress({ ...prog, orbs: res.wallet, shieldTier: res.tier });
    if (h) {
      h.shield = res.shield;
      setCampaign((c) => { const nc = DATA.setShield(c, h.shield); DATA.saveCampaign(nc); return nc; });
      setHud((prev) => ({ ...prev, shield: h.shield }));
    }
    notice(`🛡️ ${shieldTierFor(res.tier).label} — shield ${res.shield}.`);
  };
  const rechargeOrbShield = () => {
    if (!tradeGuard()) return;
    const prog = orbProgressRef.current || loadOrbProgress();
    const h = hunterRef.current;
    const res = rechargeShield(prog.orbs, prog.shieldTier, h ? h.shield : 0);
    if (!res.ok) {
      notice(res.reason === 'need-orbs' ? '🔮 2 orbs to recharge — you do not have them.' : res.reason === 'already-full' ? '🛡️ Shield is already full.' : '🛡️ No bought shield to recharge — buy a tier first.');
      return;
    }
    applyOrbProgress({ ...prog, orbs: res.wallet });
    if (h) {
      h.shield = res.shield;
      setCampaign((c) => { const nc = DATA.setShield(c, h.shield); DATA.saveCampaign(nc); return nc; });
      setHud((prev) => ({ ...prev, shield: h.shield }));
    }
    notice(`🛡️ Shield recharged to ${res.shield}.`);
  };
  const buyOrbWeapon = (tier) => {
    if (!tradeGuard()) return;
    const prog = orbProgressRef.current || loadOrbProgress();
    const res = buyWeaponTier(prog.orbs, prog.weaponTier, tier);
    if (!res.ok) {
      notice(res.reason === 'need-orbs' ? '🔮 Not enough elemental orbs for that bolt.' : '🏹 You already own that bolt or better.');
      return;
    }
    applyOrbProgress({ ...prog, orbs: res.wallet, weaponTier: res.tier });
    notice(`🏹 ${weaponTierFor(res.tier).label} — ${weaponTierFor(res.tier).dmg} dmg, ${weaponTierFor(res.tier).rangeM} m.`);
  };
  // Leaving The Haven closes the trade panel — the trade lives
  // in the sanctuary, not in the field.
  useEffect(() => {
    if (!hud.inBase && tradeOpen) setTradeOpen(false);
  }, [hud.inBase, tradeOpen]);

  const spawnToBase = useCallback(() => {
    const w = walkerRef.current;
    if (!w) return;
    // Riding home still means getting off first — the mount
    // waits where it was left, it does not teleport with you.
    if (rideApiRef.current) rideApiRef.current.dismount();
    if (!canTeleport(lastTeleportRef.current, Date.now())) {
      notice('🏠 The Haven call needs a moment to recharge (10 s).');
      return;
    }
    lastTeleportRef.current = Date.now();
    w.pos.x = SAFE_BASE.x;
    w.pos.z = SAFE_BASE.z;
    resetSphere(SAFE_BASE.x, SAFE_BASE.z);
    notice('🏠 Back to The Haven — sanctuary. No monster can touch you here.');
  }, [notice, resetSphere]);

  // ---- world mount ----
  useEffect(() => {
    if (mode !== 'world' || !canvasRef.current) return undefined;
    const canvas = canvasRef.current;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(DATA.WORLD.sky);
    // Fog far 1300: the sphere is 764 m across, so the far side
    // as seen from the near side is ~764 m away — fog far must
    // exceed the diameter, not just the radius, or the far side
    // drowns in fog (the old 420 m far was a fog wall on the
    // bigger disc). Camera far 2000 was already ample.
    scene.fog = new THREE.Fog(DATA.WORLD.fog, 60, 1300);
    const camera = new THREE.PerspectiveCamera(68, 1, 0.1, 2000);
    camera.rotation.order = 'YXZ';
    const guard = guardCanvasContext(canvas, { onLost: () => {}, onRestored: () => {} });

    const start = DATA.entrySpawn(progress);
    const walker = createWalker({ x: start.x, z: start.z, yaw: Math.PI, pitch: 0 });
    walkerRef.current = walker;
    const hunter = createHunterState();
    hunter.hp = hero.maxHp;
    hunter.kills = campaign.kills;
    hunter.shield = campaign.shield;
    hunterRef.current = hunter;
    missionKillsRef.current = 0;
    hazardsRef.current = [];
    poolsRef.current = [];
    // Fresh HUD + weapon on every entry (Merlin, Nov 16 WS1): the
    // weapon, sense and boss readouts reset with the hunter — a
    // previous session's ranged weapon, sense line or boss HP must
    // not linger into the next hunt. A stale JUMP edge is dropped too.
    weaponRef.current = 'melee';
    jumpRef.current = false;
    setHud({ hp: hero.maxHp, shield: campaign.shield, kills: campaign.kills, inBase: false, weapon: 'melee', sense: null, bossHp: null, bossAwake: false, secondary: null });
    // Elemental orbs: the wallet + tiers load device-local on
    // entry (the field drops start empty each entry — uncollected
    // drops do not survive leaving the world).
    orbProgressRef.current = loadOrbProgress();
    orbDropsRef.current = [];
    prevWalkerPosRef.current = { x: walker.pos.x, y: 0, z: walker.pos.z };
    setOrbHud({ ...orbProgressRef.current, orbs: { ...orbProgressRef.current.orbs } });
    setTradeOpen(false);

    // Damage flash: a red vignette pulse whenever the hunter
    // actually loses HP (monster hit or hazard) — the video
    // showed deaths with no visible hit feedback at all.
    const flashDamage = () => {
      setDmgFlash(1);
      if (dmgFlashTimer.current) clearTimeout(dmgFlashTimer.current);
      dmgFlashTimer.current = setTimeout(() => setDmgFlash(0), 300);
    };

    // WS6 acid pools: a green ring + translucent disc at (x, z),
    // live 4 s, ticked in the frame loop beside hazards. Meshes
    // are removed when the pool expires (frame loop), on death
    // (clearSecondaries), or on leaving the world (cleanup).
    const createPool = (x, z) => {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(3.5 * 0.8, 3.5, 24),
        new THREE.MeshBasicMaterial({ color: ELEMENT_COLORS.acid, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
      );
      // On the shell: the ring + disc lie on the local up at
      // their ground point, not on flat world Y.
      const rp = liftedPoint(x, z, 0.3, world.groundHeight);
      ring.quaternion.copy(flatQuat(sphereUpAtDeck(x, z)));
      ring.position.set(rp.x, rp.y, rp.z);
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(3.5, 24),
        new THREE.MeshBasicMaterial({ color: ELEMENT_COLORS.acid, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })
      );
      const dp = liftedPoint(x, z, 0.32, world.groundHeight);
      disc.quaternion.copy(flatQuat(sphereUpAtDeck(x, z)));
      disc.position.set(dp.x, dp.y, dp.z);
      scene.add(ring);
      scene.add(disc);
      poolsRef.current.push({ x, z, radius: 3.5, dps: 4, until: Date.now() + 4000, ring, disc });
    };

    // WS6: death-respawn clears the whole secondary state (DoT,
    // pools, slow, dim/gust) — the hunter wakes at The Haven
    // whole, not burning.
    const clearSecondaries = () => {
      const h = hunterRef.current;
      if (h) clearHunterSecondaries(h);
      for (const p of poolsRef.current) {
        if (p.ring) scene.remove(p.ring);
        if (p.disc) scene.remove(p.disc);
        try { p.ring.geometry.dispose(); p.ring.material.dispose(); p.disc.geometry.dispose(); p.disc.material.dispose(); } catch (e) { /* noop */ }
      }
      poolsRef.current = [];
    };

    // Death respawn, one place: the flat walker returns to The
    // Haven in deck coordinates and the sphere walker is reset
    // there too (feet + heading ref) — a stale sphere state
    // would keep walking from the death point.
    const respawnAtBase = () => {
      walker.pos.x = SAFE_BASE.x;
      walker.pos.z = SAFE_BASE.z;
      sphereRef.current = sphereStateForDeck(SAFE_BASE.x, SAFE_BASE.z, world.groundHeight);
    };

    // Shared hunter-damage path: monster hits, Korus hits and
    // lightning aura-strikes all land here — shield absorbs
    // first, the rest hits HP, death respawns at The Haven.
    // Returns true when the strike must NOT light a burn
    // (already dead, sanctuary, or slain by this hit), false
    // when the hunter took the hit and lives.
    const damageHunter = (dmg, element, eventKind = 'hit') => {
      const h = hunterRef.current;
      if (!h || h.hp <= 0) return true;
      if (isInBase(walker.pos.x, walker.pos.z)) return true; // sanctuary: no damage lands
      const res = applyDamage(h, dmg);
      if (res.hpLost > 0) flashDamage();
      if (res.absorbed > 0) notice(`🛡️ Shield absorbed ${res.absorbed} damage${res.shieldBroken ? ' — shield broken!' : ''}.`);
      setCampaign((c) => { const nc = DATA.setShield(c, h.shield); DATA.saveCampaign(nc); return nc; });
      if (h.hp <= 0) {
        // Death respawns at The Haven, full HP, kills + shield kept.
        // The mount stays where it fell — dismount first, or the
        // rider would respawn still sitting on it.
        if (rideApiRef.current) rideApiRef.current.dismount();
        respawnAtBase();
        h.hp = hero.maxHp;
        clearSecondaries();
        notice('💀 Slain — you wake at The Haven, whole. Your kills and shield remain.');
        setHud((prev) => ({ ...prev, hp: h.hp, shield: h.shield, secondary: null }));
        return true;
      }
      // WS6: the hit's element lights its secondary (R1–R7) —
      // burn/venom share one DoT slot, frost chills, shadow/sand
      // haze, acid leaves a pool at the hunter's feet. Korus hits
      // carry no element, so they stay flat by design.
      if (element) {
        const sec = applyHitSecondary(h, element, eventKind, Date.now());
        if (sec && sec.kind === 'pool') createPool(walker.pos.x, walker.pos.z);
      }
      setHud((prev) => ({ ...prev, hp: h.hp, shield: h.shield }));
      return false;
    };

    const world = buildWorld(THREE, DATA.WORLD, T, {
      gateOpen: DATA.gateOpen(campaign),
      onPlayerHit: (dmg, from, archetype, element) => { damageHunter(dmg, element); },
      onAuraStrike: (ev) => {
        // ELEMENTAL AURA-STRIKE (Merlin, Nov 16 ~00:11 lightning /
        // Nov 16 ~01:33-01:34 all seven elements): the streak
        // lands through the same damage path as a monster hit,
        // carrying its element + 'aura' kind — so damageHunter
        // routes the secondary through WS6's state machine
        // (fire burn, acid pool at the hunter's feet, poison
        // venom, shadow dim, sand gust, frost chill x0.7;
        // lightning keeps its existing burn path, 6/s x 3 s,
        // higher-dps-wins against any fire/poison burn running).
        // A hunter slain by the hit wakes whole, not burning;
        // sanctuary returns before any secondary lights.
        // An event with no element stays flat (no secondary).
        damageHunter(ev.dmg, ev.element || null, 'aura');
      },
      onMonsterKilled: ({ victim, killer, cause }) => {
        // Monster-vs-monster kill feed (savagery step 1): a short
        // toast naming killer + victim — no heal, no shield, no
        // Korus-gate progress (MvM pays the hunter nothing).
        if (!victim) return;
        const victimName = (MONSTER_TYPES[victim.type] && MONSTER_TYPES[victim.type].name) || victim.type;
        const killerName = killer
          ? ((MONSTER_TYPES[killer.type] && MONSTER_TYPES[killer.type].name) || killer.type)
          : 'The storm';
        const verb = cause === 'territorial-duel' ? 'slew in a duel' : 'slew';
        notice(`⚡ ${killerName} ${verb} the ${victimName}`);
      },
      onHazard: (hz) => {
        // Telegraphed hazard: a ring appears; damage lands after
        // the telegraph only if the hunter is still inside it.
        // WS6: the telegraph ring wears the hazard's element
        // colour (was one hardcoded red for all seven elements).
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(hz.radius * 0.8, hz.radius, 24),
          new THREE.MeshBasicMaterial({ color: ELEMENT_COLORS[hz.element] || 0xff5544, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
        );
        const hp = liftedPoint(hz.x, hz.z, 0.3, world.groundHeight);
        ring.quaternion.copy(flatQuat(sphereUpAtDeck(hz.x, hz.z)));
        ring.position.set(hp.x, hp.y, hp.z);
        scene.add(ring);
        hazardMeshesRef.current.push(ring);
        const at = Date.now() + hz.telegraph * 1000;
        hazardsRef.current.push({ ...hz, at });
        setTimeout(() => { scene.remove(ring); }, hz.telegraph * 1000 + 300);
      },
      onSpotted: (m) => { if (m) playRoarTone(roarToneFor(m.type, m.element)); },
      onWatcherLaugh: () => playRoarTone(GHORRUM_LAUGH_TONE),
      onKorusEvent: (ev) => {
        if (ev.kind === 'wake') notice('👑 KORUS WAKES — the throne empties!');
        if (ev.kind === 'telegraph') notice('⚡ Korus gathers storm — MOVE!');
      },
    });
    worldRef.current = world;
    scene.add(world.group);
    // INNER SPHERE (Nov 16): the sphere walker starts on the
    // ground at the entry deck point — 3D feet on the shell,
    // heading ref facing north (yaw 0 = north at spawn).
    sphereRef.current = sphereStateForDeck(walker.pos.x, walker.pos.z, world.groundHeight);

    // WS4 sky (G-02): the video texture if it already landed, else
    // the static art image as the dome fallback — the flat tint
    // stands until either lands, so the scene can never blank on
    // video failure.
    if (skyVideoTexRef.current && world.setSkyVideoTexture) world.setSkyVideoTexture(skyVideoTexRef.current);
    new THREE.TextureLoader().load(
      HOLLOW_EARTH_SKY_ART_URL,
      (tex) => { tex.colorSpace = THREE.SRGBColorSpace; if (worldRef.current) worldRef.current.setSkyArtTexture(tex); },
      undefined,
      () => { /* missing art: the flat-tint dome stands */ }
    );

    // ── Dino companions (Merlin, 2026-11-14) ───────────────
    // Raised dinos ride the backpack: 'out' dinos from the pack
    // join the walker here, and the HUD summons/recalls through
    // dinoApiRef. The record is the truth — the world only
    // renders it, so a dino follows its user across realms.
    const companions = companionsRef.current;
    const summonDino = async (dinoItem) => {
      const species = dinoItem && dinoItem.meta ? dinoItem.meta.species : null;
      if (!species) return;
      const dinoId = dinoIdOf(dinoItem);
      if (hasCompanion(companions, dinoId)) return;
      const handle = await spawnCompanion({
        scene, walker, groundHeight: world.groundHeight,
        groundPoint: (x, z, lift = 0) => liftedPoint(x, z, lift, world.groundHeight),
        groundUp: (x, z) => sphereUpAtDeck(x, z),
        species, bornAt: dinoItem.meta.bornAt || Date.now(), dinoId,
      }).catch(() => null);
      if (!handle || !walkerRef.current) return;
      companions.push(handle);
      updateBackpack((r) => ({ ...r, items: setDinoItemState(r.items || [], dinoId, DINO_STATE_OUT, undefined, true) }));
      notice(`🦖 ${dinoDisplayName(species)} joins you!`);
    };
    const recallDino = (dinoItem) => {
      const species = dinoItem && dinoItem.meta ? dinoItem.meta.species : null;
      if (!species) return;
      const dinoId = dinoIdOf(dinoItem);
      removeCompanion(companions, dinoId);
      // The backpack IS home (Merlin, 2026-11-14): back to
      // 'pack', travel cleared. No land home in this realm —
      // the Earth 2 home copies live there, not here.
      updateBackpack((r) => ({ ...r, items: setDinoItemState(r.items || [], dinoId, DINO_STATE_PACK, undefined, false) }));
      notice(`🦖 ${dinoDisplayName(species)} returns to your backpack.`);
    };
    dinoApiRef.current = { summon: summonDino, recall: recallDino };
    // Restore: 'out' dinos from the pack join the walker here.
    {
      let rec = null;
      try { rec = getBackpackRecord(); } catch { rec = null; }
      for (const it of (rec && rec.items) || []) {
        if (isDinoItem(it) && it.meta.state === DINO_STATE_OUT) void summonDino(it);
      }
    }

    // The hunter's own figure, third-person follow: a small
    // stand-in trailing the walker so the hero is visible.
    const heroFig = buildHeroFigure(THREE, heroKey);
    heroFigRef.current = heroFig;
    scene.add(heroFig);

    // ── Mounts (Merlin, 2026-11-15) ────────────────────────
    // Embermane + Frostbite (families.js mount: true) ride
    // through the shared mounting idiom: walk up, a top-centre
    // Mount button appears, tap to get on; ride at the mount's
    // own pace; dismount beside it, and it waits where left.
    // The zone skips the hunt AI for a mounted monster
    // (zone.js: m.mounted) and strike() never targets it, so
    // the rider can never strike their own mount.
    const mountMonster = (m) => {
      if (!m || rideRef.current) return;
      const spot = mountSpot(m);
      walker.pos.x = spot.x;
      walker.pos.z = spot.z;
      walker.jumpY = 0; walker.jumpV = 0; walker.grounded = true;
      sphereRef.current = sphereStateForDeck(spot.x, spot.z, world.groundHeight);
      m.faceYaw = mountYawForWalker(walker.yaw);
      m.mounted = true;
      rideRef.current = tryMount(rideRef.current, m);
      rideBlendRef.current = 0;
      seatHeightRef.current = riderSeatOffsetY(m.stats.scaleM, hero.height);
      const name = (MONSTER_TYPES[m.type] && MONSTER_TYPES[m.type].name) || m.type;
      setMounted({ id: m.id, name });
      setMountPrompt(null);
      mountPromptRef.current = null;
      notice(`🐎 Mounted — ${name}. Ride with the stick; strike from the saddle.`);
    };
    const dismountMonster = () => {
      const ride = rideRef.current;
      if (!ride) return;
      const m = ride.mount;
      const spot = dismountSpot(m);
      // Settle the landing spot out of solid geometry with the
      // walker's own push-out — never inside the mount, never
      // inside a landmark. No bounds clamp: the sphere has no
      // edge to clamp against.
      const settled = { x: spot.x, z: spot.z };
      resolveColliders(settled, [...world.colliders, ...monsterColliders(world.monsters.filter((mm) => mm !== m), world.korus)]);
      walker.pos.x = settled.x;
      walker.pos.z = settled.z;
      walker.jumpY = 0; walker.jumpV = 0; walker.grounded = true;
      sphereRef.current = sphereStateForDeck(settled.x, settled.z, world.groundHeight);
      m.mounted = false;
      rideRef.current = dismountRide(rideRef.current);
      setMounted(null);
      const name = (MONSTER_TYPES[m.type] && MONSTER_TYPES[m.type].name) || m.type;
      notice(`🚶 Dismounted — ${name} waits where you left it.`);
    };
    rideApiRef.current = {
      mountPrompted: () => {
        const id = mountPromptRef.current;
        if (!id) return;
        const mm = world.monsters.find((x) => x.id === id);
        if (mm) mountMonster(mm);
      },
      dismount: dismountMonster,
    };

    const keys = createKeyInput();
    keys.attach();
    const detachLook = attachDragLook(canvas, {
      onLook: (dx, dy) => applyLook(walker, dx, dy),
      onTap: (x, y) => {
        // Tap = strike with the current weapon (also the loud
        // action monsters hear within 30 m).
        noiseRef.current = { x: walker.pos.x, z: walker.pos.z };
        setTimeout(() => { noiseRef.current = null; }, 100);
        attack();
      },
    });

    // The equipped backpack weapon arms its hand when it fits:
    // its rating replaces the hero's native number, else native.
    // Elemental bolt tiers (orb trade): above tier 0 the bought
    // tier lifts the ranged spec — damage and range take the
    // better of the equipped/hero number and the tier, cooldown
    // takes the tier's. Tier 0 leaves the stock spec untouched
    // (heroes range 20–34 dmg, so a blind max() with the stock
    // 28 would buff some heroes for free).
    const weaponSpec = () => {
      if (weaponRef.current === 'melee') {
        return { dmg: equippedDamageForSlot(equippedRef.current, 'melee') ?? hero.meleeDmg, range: 2.4, arcCos: Math.cos(1.22), cooldown: 0.45 };
      }
      const base = { dmg: equippedDamageForSlot(equippedRef.current, 'ranged') ?? hero.ranged.dmg, range: hero.ranged.range, arcCos: Math.cos(0.21), cooldown: 0.8 };
      const boltTier = weaponTierFor(orbProgressRef.current ? orbProgressRef.current.weaponTier : 0);
      if (boltTier.tier <= 0) return base;
      return {
        dmg: Math.max(base.dmg, boltTier.dmg),
        range: Math.max(base.range, boltTier.rangeM),
        arcCos: base.arcCos,
        cooldown: boltTier.cooldownMs / 1000,
      };
    };
    let lastStrike = 0;
    /* Ranged-shot visuals: a visible bolt that flies from the
     * shooter toward the hit point on every ranged strike.
     * Cosmetic only — damage already landed in strikeHunter() /
     * damageKorus(); the bolt never decides anything. Firearms
     * throw a warm streak, bows a thin gold arrow, spells a fat
     * purple bolt (the Middle-earth staff-blast precedent). */
    const blasts = [];
    /* WS6: the player's own effects wear the same glow sprite
     * as the monster projectiles (additive halo, never a
     * replacement body). Null texture (SSR) means the plain
     * geometry stands alone, never a crash. */
    const glowSprite = (opacity) => {
      const tex = getParticleTexture('glow');
      if (!tex) return null;
      return new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, color: 0xfff2b0, transparent: true, opacity,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
    };
    /* Impact feedback: every landed hit pops a burst at the
     * monster's chest (bigger + red on a kill), and every melee
     * swing draws a slash arc — melee used to have NO visual
     * at all, which is why hits in the video looked like
     * nothing happened. Cosmetic only; damage numbers never
     * change here. */
    const impacts = [];
    const spawnImpactAt = (x, y, z, lethal) => {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(lethal ? 0.5 : 0.28, 10, 8),
        new THREE.MeshBasicMaterial({ color: lethal ? 0xff5544 : 0xffcc88, transparent: true, opacity: 0.95, fog: false }),
      );
      mesh.position.set(x, y, z);
      scene.add(mesh);
      impacts.push({ mesh, life: 0.3, maxLife: 0.3, kind: 'burst', grow: lethal ? 2.2 : 1.4 });
      const halo = glowSprite(0.95);
      if (halo) {
        halo.position.set(x, y, z);
        scene.add(halo);
        impacts.push({ mesh: halo, life: 0.3, maxLife: 0.3, kind: 'halo', grow: 0, baseX: lethal ? 1.6 : 1.0, baseY: lethal ? 1.6 : 1.0 });
      }
    };
    const spawnImpact = (m, lethal) => {
      const ip = liftedPoint(m.x, m.z, (m.stats?.flyHeight || 0) + (m.stats?.scaleM || 2.5) * 0.6, world.groundHeight);
      spawnImpactAt(ip.x, ip.y, ip.z, lethal);
    };
    const spawnSlash = () => {
      // The slash hangs in front of the hunter on the sphere:
      // chest height along the local up, 1.4 m along the 3D
      // facing, the plane looking back at the hunter.
      const s = sphereRef.current;
      const up = sphereUpAtDeck(walker.pos.x, walker.pos.z);
      const fwd = s ? frameFromRef(s.feet, s.ref, walker.yaw).forward : { x: -Math.sin(walker.yaw), y: 0, z: -Math.cos(walker.yaw) };
      const feet = s ? s.feet : spherePointFromDeck(walker.pos.x, walker.pos.z, world.groundHeight);
      const chest = {
        x: feet.x + up.x * hero.height * 0.7,
        y: feet.y + up.y * hero.height * 0.7,
        z: feet.z + up.z * hero.height * 0.7,
      };
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(2.2, 1.2),
        new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.85, side: THREE.DoubleSide, fog: false }),
      );
      mesh.position.set(chest.x + fwd.x * 1.4, chest.y + fwd.y * 1.4, chest.z + fwd.z * 1.4);
      mesh.lookAt(chest.x, chest.y, chest.z);
      scene.add(mesh);
      impacts.push({ mesh, life: 0.18, maxLife: 0.18, kind: 'slash', grow: 0 });
      const slashHalo = glowSprite(0.85);
      if (slashHalo) {
        slashHalo.position.copy(mesh.position);
        scene.add(slashHalo);
        impacts.push({ mesh: slashHalo, life: 0.18, maxLife: 0.18, kind: 'halo', grow: 0, baseX: 2.2, baseY: 1.2 });
      }
    };
    const spawnBolt = (endpoint) => {
      // The bolt leaves the hunter's hand: 0.4 m forward, 0.45 m
      // to the right, at 85% of the hero's height — all in the
      // sphere frame, so the hand is beside the hunter on the
      // far side too, not floating in world-Y space.
      const s = sphereRef.current;
      const up = sphereUpAtDeck(walker.pos.x, walker.pos.z);
      const frame = s ? frameFromRef(s.feet, s.ref, walker.yaw)
        : { forward: { x: -Math.sin(walker.yaw), y: 0, z: -Math.cos(walker.yaw) }, right: { x: Math.cos(walker.yaw), y: 0, z: -Math.sin(walker.yaw) } };
      const feet = s ? s.feet : spherePointFromDeck(walker.pos.x, walker.pos.z, world.groundHeight);
      const kind = boltKindFor(equippedRef.current, hero.ranged.kind);
      const style = BOLT_STYLE[kind];
      const origin = new THREE.Vector3(
        feet.x + up.x * hero.height * 0.85 + frame.forward.x * 0.4 + frame.right.x * 0.45,
        feet.y + up.y * hero.height * 0.85 + frame.forward.y * 0.4 + frame.right.y * 0.45,
        feet.z + up.z * hero.height * 0.85 + frame.forward.z * 0.4 + frame.right.z * 0.45,
      );
      const dir = new THREE.Vector3(endpoint.x - origin.x, endpoint.y - origin.y, endpoint.z - origin.z);
      const dist = dir.length();
      if (dist < 0.001) return;
      dir.normalize();
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(style.thick, style.thick, style.len),
        new THREE.MeshBasicMaterial({ color: style.color, transparent: true, fog: false }),
      );
      mesh.position.copy(origin);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
      scene.add(mesh);
      // WS6: a glow sprite head on the bolt body.
      const head = glowSprite(0.95);
      if (head) {
        head.scale.set(0.9, 0.9, 1);
        head.position.set(0, 0, style.len / 2);
        mesh.add(head);
      }
      const life = Math.min(dist / BOLT_SPEED, BOLT_MAX_LIFE);
      blasts.push({ mesh, head: head || null, vx: dir.x * BOLT_SPEED, vy: dir.y * BOLT_SPEED, vz: dir.z * BOLT_SPEED, life, maxLife: life });
    };
    function attack() {
      const now = performance.now();
      const spec = weaponSpec();
      if (now - lastStrike < spec.cooldown * 1000) return;
      lastStrike = now;
      // Melee swings show even on a whiff: a slash arc in front
      // of the hunter (ranged strikes already throw bolts).
      if (weaponRef.current === 'melee') spawnSlash();
      const hits = world.strikeHunter(walker.pos.x, walker.pos.z, walker.yaw, spec);
      // Korus, in range of the throne.
      const kd = Math.hypot(walker.pos.x - KORUS_POS.x, walker.pos.z - KORUS_POS.z);
      const korusInRange = DATA.gateOpen(campaignRef.current) && !world.korus.dead
        && ((weaponRef.current === 'melee' && kd <= 6) || (weaponRef.current !== 'melee' && kd <= spec.range));
      if (korusInRange) {
        const died = world.damageKorus(spec.dmg);
        const kp = liftedPoint(KORUS_POS.x, KORUS_POS.z, 2.5, world.groundHeight);
        spawnImpactAt(kp.x, kp.y, kp.z, died);
        if (died) {
          setCampaign((c) => {
            const nc = DATA.completeKorus(c, Date.now());
            DATA.saveCampaign(nc);
            return nc;
          });
          try { updateBackpack((rec) => DATA.applyRewardToRecord(rec)); } catch { /* pack unavailable */ }
          setKorusDead(true);
          notice('👑 KORUS FALLS — Stormfang is yours. The Monsterverse remembers.');
        } else {
          /* Life line (operators.js): Korus has no figure label
           * (GLB-only throne figure), so the strike notice is
           * his surface — the death notice stands on a kill. */
          notice(korusLifeFor(world.korus, Date.now(), {
            totalKills: campaignRef.current ? campaignRef.current.kills : 0,
          }).line);
        }
      }
      if (weaponRef.current !== 'melee') {
        // Visible bolt to the nearest hit, else Korus, else max range.
        let target = null;
        let bestD = Infinity;
        for (const m of hits) {
          const d = Math.hypot(m.x - walker.pos.x, m.z - walker.pos.z);
          if (d < bestD) { bestD = d; target = m; }
        }
        let endpoint;
        if (target) {
          // The bolt ends at the monster's chest, on the shell.
          const tp = liftedPoint(target.x, target.z, target.stats?.flyHeight || 1.1, world.groundHeight);
          endpoint = { x: tp.x, y: tp.y, z: tp.z };
        } else if (korusInRange) {
          const kp = liftedPoint(KORUS_POS.x, KORUS_POS.z, 2.5, world.groundHeight);
          endpoint = { x: kp.x, y: kp.y, z: kp.z };
        } else {
          const fx = -Math.sin(walker.yaw), fz = -Math.cos(walker.yaw);
          const ex = walker.pos.x + fx * spec.range, ez = walker.pos.z + fz * spec.range;
          const ep = liftedPoint(ex, ez, 1.1, world.groundHeight);
          endpoint = { x: ep.x, y: ep.y, z: ep.z };
        }
        spawnBolt(endpoint);
      }
      /* Life lines (operators.js) on the strike notice — tap is
       * still strike, the notice only reports it. Monsters have
       * no name label (GLB-only figures; only a damage HP bar),
       * so the notice is their surface. A dead monster's figure
       * goes invisible (fig.visible = false), so no Remains line
       * can live on the figure — the killing strike's notice
       * carries it instead, unless the kill already reports a
       * shield or a heal. Ghorrum has no surface at all (never
       * struck, never a record) and stays unwired. */
      for (const m of hits) {
        const died = damageMonster(m, spec.dmg);
        if (!died) { m.hitFlash = 1; spawnImpact(m, false); notice(monsterLifeFor(m, Date.now()).line); continue; }
        spawnImpact(m, true);
        /* Elemental orb drop (Merlin, Nov 16 ~01:52): a hunter
         * kill drops one orb of the monster's family element at
         * the death point. Monster-vs-monster kills never reach
         * this site (they flow through zone.js onMonsterKilled),
         * so they drop nothing — the J2 user-kill-only law. */
        const drop = createOrbDrop({
          monster: m, killerId: 'user',
          // The drop's y is the real 3D ground height at the
          // death point — collectOrbs measures a 3D segment,
          // so a flat heightAt would miss every far-side drop.
          position: spherePointFromDeck(m.x, m.z, world.groundHeight),
          nowMs: Date.now(),
        });
        if (drop) {
          orbDropsRef.current = pruneOrbs([...orbDropsRef.current, drop], Date.now());
          if (world.setOrbDrops) world.setOrbDrops(orbDropsRef.current);
        }
        const h = hunterRef.current;
        const res = onMonsterKilled(h);
        missionKillsRef.current += 1;
        if (res.shieldGranted) notice(`🛡️ SHIELD GAINED — 30 kills! It absorbs 50 damage until broken.`);
        else if (res.heal > 0) notice(`❤️ +${res.heal} health for the kill.`);
        else notice(monsterLifeFor(m, Date.now()).line);
        setCampaign((c) => {
          let nc = DATA.recordKill(c);
          nc = DATA.setShield(nc, h.shield);
          DATA.saveCampaign(nc);
          return nc;
        });
        setHud((prev) => ({ ...prev, hp: h.hp, shield: h.shield, kills: h.kills }));
      }
      checkMission();
    }
    // Expose attack to the HUD buttons.
    worldRef.current.attack = attack;

    function checkMission() {
      if (!entry || entry.kind !== 'mission') return;
      const cluster = DATA.clusterDef(clusterId);
      const mission = cluster && cluster.missions.find((mm) => mm.id === entry.missionId);
      if (!mission) return;
      let done = false;
      if (mission.hunt) {
        done = missionKillsRef.current >= mission.hunt.count;
      } else if (mission.target) {
        const d = Math.hypot(walker.pos.x - mission.target.x, walker.pos.z - mission.target.z);
        done = d <= mission.target.r;
      }
      if (done) {
        setProgress((p) => {
          const next = DATA.completeMission(p, clusterId, mission.id);
          DATA.saveProgress(next);
          return next;
        });
        notice(`🏆 Mission complete: ${mission.title}`);
        setEntry({ kind: 'roam' });
      }
    }

    let raf = 0;
    let last = performance.now();
    let hudTick = 0;
    // Gamepad strike state: rising-edge sets, reset when no pad is
    // attached so a held button can never fire stale on reconnect.
    let gpButtons = new Set();
    let gpPrevRt = 0;
    function tick() {
      raf = requestAnimationFrame(tick);
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      // Gamepad: ✕/A (CONFIRM) and R2 (RT) strike, exactly like a
      // tap — rising edge only, so a held button never repeats.
      // attack() itself guards cooldown, so a same-frame double
      // edge is a no-op, not a double swing.
      if (typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function') {
        const pad = firstConnectedPad(navigator.getGamepads());
        if (pad) {
          if (triggerRisingEdge(gpPrevRt, pad.buttons)) attack();
          const pressed = newlyPressedButtons(gpButtons, pad.buttons);
          gpButtons = pressedButtonSet(pad.buttons);
          if (pressed.includes(GAMEPAD_BUTTONS.CONFIRM)) attack();
          gpPrevRt = triggerValue(Array.isArray(pad.buttons) ? pad.buttons[GAMEPAD_BUTTONS.RT] : null);
        } else { gpButtons = new Set(); gpPrevRt = 0; }
      }
      const ride = rideRef.current;
      // JUMP (Merlin, Nov 16): Space (keys.consumeJump) or the JUMP
      // orb (jumpRef) — edge-triggered, consumed for exactly one
      // frame. Mounted, the press is consumed and discarded (the
      // Middle-earth pattern): no jumping from the saddle.
      if (ride) { keys.consumeJump(); jumpRef.current = false; }
      const jump = ride ? false : keys.consumeJump() || jumpRef.current;
      jumpRef.current = false;
      // WS6 frost chill: the walker runs at x0.7 while chilled —
      // suppressed inside The Haven (full speed there, R4).
      const hunterNow = hunterRef.current;
      const chillF = hunterNow && !isInBase(walker.pos.x, walker.pos.z)
        ? chillFactorFor(hunterNow, Date.now()) : 1;
      // INNER SPHERE (Nov 16): the flat stepWalker is retired
      // for this realm — the sphere step walks the inside of
      // the shell, gravity pulling toward the shell, up toward
      // the core-sun. walker.pos stays deck coordinates (every
      // distance rule reads deck space); the sphere state
      // carries the 3D feet + the transported heading. Solid
      // geometry still resolves in deck space after the step,
      // and a push-out re-syncs the sphere deck from the
      // settled point (a collider push is horizontal; the
      // step re-projects onto the ground next frame).
      const speed = ride ? rideSpeedForMount(ride.mount.stats) : 10 * (hero.speedMult || 1) * chillF;
      let s = sphereRef.current || sphereStateForDeck(walker.pos.x, walker.pos.z, world.groundHeight);
      s = stepHollowEarthWalker(s, {
        fwd: keys.state.fwd + joyRef.current.y,
        strafe: keys.state.strafe + joyRef.current.x,
        sprint: ride ? false : keys.state.sprint,
        jump,
        yaw: walker.yaw,
      }, dt, { heightAt: world.groundHeight, walkSpeed: speed });
      sphereRef.current = s;
      walker.pos.x = s.deck.x;
      walker.pos.z = s.deck.z;
      {
        // Solid characters: landmarks + scatter colliders PLUS
        // every active monster and Korus, rebuilt each frame
        // (monsters move; world.colliders itself is never
        // mutated, so the zone's own data stays clean) — minus
        // the ridden mount, which the rider sits on.
        const settled = { x: walker.pos.x, z: walker.pos.z };
        resolveColliders(settled, ride
          ? [...world.colliders, ...monsterColliders(world.monsters.filter((m) => m !== ride.mount), world.korus)]
          : [...world.colliders, ...monsterColliders(world.monsters, world.korus)]);
        if (settled.x !== walker.pos.x || settled.z !== walker.pos.z) {
          walker.pos.x = settled.x;
          walker.pos.z = settled.z;
          sphereRef.current = sphereStateForDeck(settled.x, settled.z, world.groundHeight);
        }
      }
      if (ride) {
        const mm = ride.mount;
        mm.x = walker.pos.x;
        mm.z = walker.pos.z;
        mm.faceYaw = mountYawForWalker(walker.yaw);
      }
      /* mount prompt: the nearest mountable monster in range,
       * threshold crossings only (the Earth 2 board-prompt
       * pattern) — the button appears before the walker is
       * pressed against the mount, and never while mounted */
      if (!rideRef.current) {
        const near = nearestMountInRange(world.monsters, walker.pos.x, walker.pos.z);
        const nearId = near ? near.id : null;
        if (nearId !== mountPromptRef.current) {
          mountPromptRef.current = nearId;
          setMountPrompt(near ? { id: near.id, name: (MONSTER_TYPES[near.type] && MONSTER_TYPES[near.type].name) || near.type } : null);
        }
      } else if (mountPromptRef.current) {
        mountPromptRef.current = null;
        setMountPrompt(null);
      }
      /* Elemental orb collect (Merlin, Nov 16 ~01:52): walk over
       * a drop to collect it — 3.0 m, checked against the path
       * SEGMENT between ticks, so a fast walker cannot step over
       * one. Expired drops (120 s) and the 32 cap prune here too.
       * Pickup notices name the element (+1 🔥 fire element).
       * The segment is the walker's real 3D feet (collectOrbs
       * measures in 3D), not the flat ground height. */
      const sNow = sphereRef.current;
      const prevPos = prevWalkerPosRef.current || { ...(sNow ? sNow.feet : { x: walker.pos.x, y: 0, z: walker.pos.z }) };
      const curPos = sNow ? { ...sNow.feet } : { x: walker.pos.x, y: world.groundHeight(walker.pos.x, walker.pos.z), z: walker.pos.z };
      if (orbDropsRef.current.length > 0) {
        const pruned = pruneOrbs(orbDropsRef.current, Date.now());
        const { collected, remaining } = collectOrbs(pruned, prevPos, curPos);
        if (collected.length > 0 || remaining.length !== orbDropsRef.current.length) {
          orbDropsRef.current = remaining;
          if (world.setOrbDrops) world.setOrbDrops(remaining);
        }
        if (collected.length > 0) {
          let prog = orbProgressRef.current || loadOrbProgress();
          for (const o of collected) prog = { ...prog, orbs: addOrb(prog.orbs, o.element) };
          applyOrbProgress(prog);
          for (const o of collected) {
            const row = ORB_ELEMENTS[o.element];
            if (row) notice(`+1 ${row.icon} ${row.label} element`);
          }
        }
      }
      prevWalkerPosRef.current = curPos;
      world.setObserver({
        x: walker.pos.x, z: walker.pos.z,
        quiet: hero.quiet || 1,
        noise: noiseRef.current,
        inBase: isInBase(walker.pos.x, walker.pos.z),
        // WS6: hit-driven haze deadlines for the zone's haze dome.
        dimUntil: hunterRef.current ? hunterRef.current.dimUntil || 0 : 0,
        gustUntil: hunterRef.current ? hunterRef.current.gustUntil || 0 : 0,
      });
      // Mid-session gate crossing: if the hunter just earned the
      // 40th kill out in the field, the throne wakes without a
      // re-entry.
      if (DATA.gateOpen(campaignRef.current) && world.korus.dormant) world.korus.dormant = false;
      world.update(dt);
      // Dino companions follow the walker (their own step).
      updateCompanions(companions, dt);
      // Elemental sky: the sun/moon cycle + smoke haze retint
      // the sky and fog each frame (zone-owned colors). WS4 (G-02):
      // the retint goes to the sky DOME material (colour multiply
      // over the video or the static art), not scene.background —
      // the background colour stays as the behind-the-dome fallback.
      const cyc = world.cycleColors && world.cycleColors();
      if (cyc) {
        if (world.setSkyTint) world.setSkyTint(cyc.sky);
        else scene.background.set(cyc.sky);
        scene.fog.color.set(cyc.fog);
      }
      // Resolve telegraphed hazards.
      const hzNow = Date.now();
      hazardsRef.current = hazardsRef.current.filter((hz) => {
        if (hzNow < hz.at) return true;
        const d = Math.hypot(walker.pos.x - hz.x, walker.pos.z - hz.z);
        if (d <= hz.radius && !isInBase(walker.pos.x, walker.pos.z)) {
          const h = hunterRef.current;
          if (h && h.hp > 0) {
            const res = applyDamage(h, hz.dmg);
            if (res.hpLost > 0) flashDamage();
            setHud((prev) => ({ ...prev, hp: h.hp, shield: h.shield }));
            if (h.hp <= 0) {
              if (rideApiRef.current) rideApiRef.current.dismount();
              respawnAtBase();
              h.hp = hero.maxHp;
              clearSecondaries();
              notice('💀 Slain — you wake at The Haven, whole.');
            } else if (hz.element) {
              // WS6: hazards light secondaries too — fire burns,
              // poison venoms, acid leaves a pool at the hazard.
              const sec = applyHitSecondary(h, hz.element, 'hazard', Date.now());
              if (sec && sec.kind === 'pool') createPool(hz.x, hz.z);
            }
          }
        }
        return false;
      });
      // WS6 DoT + acid pools: the single DoT slot (fire burn /
      // lightning aura burn / poison venom / frost chip, higher
      // dps wins) and the acid pools tick here on the existing
      // frame loop, beside the hazard resolution — no second
      // loop. The shield absorbs first, like every other damage
      // source; inside The Haven the timers count down but deal
      // no damage (R4 — no instant cleanse).
      const hb = hunterRef.current;
      if (hb && hb.dotRemainingS > 0 && hb.hp > 0) {
        const dotDmg = tickHunterDot(hb, dt);
        if (dotDmg > 0 && !isInBase(walker.pos.x, walker.pos.z)) {
          const res = applyDamage(hb, dotDmg);
          if (res.hpLost > 0) flashDamage();
          setHud((prev) => ({ ...prev, hp: hb.hp, shield: hb.shield }));
          if (hb.hp <= 0) {
            if (rideApiRef.current) rideApiRef.current.dismount();
            respawnAtBase();
            hb.hp = hero.maxHp;
            clearSecondaries();
            notice('💀 Slain — you wake at The Haven, whole.');
          }
        }
      }
      // Acid pools: the highest live pool under the hunter's
      // feet deals its dps; stepping out ends it.
      if (poolsRef.current.length > 0) {
        const nowMs = Date.now();
        const live = prunePools(poolsRef.current, nowMs);
        for (const p of poolsRef.current) {
          if (p.until <= nowMs) {
            scene.remove(p.ring);
            scene.remove(p.disc);
            try { p.ring.geometry.dispose(); p.ring.material.dispose(); p.disc.geometry.dispose(); p.disc.material.dispose(); } catch (e) { /* noop */ }
          }
        }
        poolsRef.current = live;
        const poolDps = poolDpsAt(live, walker.pos.x, walker.pos.z, nowMs);
        const hp2 = hunterRef.current;
        if (poolDps > 0 && hp2 && hp2.hp > 0 && !isInBase(walker.pos.x, walker.pos.z)) {
          const res = applyDamage(hp2, poolDps * dt);
          if (res.hpLost > 0) flashDamage();
          setHud((prev) => ({ ...prev, hp: hp2.hp, shield: hp2.shield }));
          if (hp2.hp <= 0) {
            if (rideApiRef.current) rideApiRef.current.dismount();
            respawnAtBase();
            hp2.hp = hero.maxHp;
            clearSecondaries();
            notice('💀 Slain — you wake at The Haven, whole.');
          }
        }
      }
      // Mounted, the eye rides a saddle-height higher — the
      // blend keeps the camera from snapping up or down on
      // mount/dismount. (This world is first-person: the rider
      // keeps the hunter's own eye, raised by the seat.)
      // INNER SPHERE camera: up is toward the core-sun, the eye
      // sits above the 3D feet along that up, and the view
      // direction is the sphere frame's forward pitched by
      // walker.pitch toward the up — the old walkerCamera's
      // world-Y up would roll the view upside-down past the
      // equator.
      const seatY = seatHeightRef.current * rideBlendRef.current;
      const camState = sphereRef.current;
      const camUp = sphereUpAtDeck(walker.pos.x, walker.pos.z);
      const camFeet = camState ? camState.feet : spherePointFromDeck(walker.pos.x, walker.pos.z, world.groundHeight);
      const camFrame = camState ? frameFromRef(camState.feet, camState.ref, walker.yaw)
        : { forward: { x: -Math.sin(walker.yaw), y: 0, z: -Math.cos(walker.yaw) } };
      const eyeH = WALK_EYE + seatY;
      const eye = {
        x: camFeet.x + camUp.x * eyeH,
        y: camFeet.y + camUp.y * eyeH,
        z: camFeet.z + camUp.z * eyeH,
      };
      const cp = Math.cos(walker.pitch);
      const sp = Math.sin(walker.pitch);
      camera.up.set(camUp.x, camUp.y, camUp.z);
      camera.position.set(eye.x, eye.y, eye.z);
      camera.lookAt(
        eye.x + camFrame.forward.x * cp + camUp.x * sp,
        eye.y + camFrame.forward.y * cp + camUp.y * sp,
        eye.z + camFrame.forward.z * cp + camUp.z * sp,
      );
      // Mount/dismount blend: the hero rises into the saddle
      // (and sinks back down) over MOUNT_BLEND_S, never
      // snapping — and slides from trailing a step behind the
      // walker to sitting on the mount as the blend rises.
      const rideNow = rideRef.current;
      const blendTarget = rideNow ? 1 : 0;
      const b0 = rideBlendRef.current;
      rideBlendRef.current = blendTarget > b0
        ? Math.min(1, b0 + dt / MOUNT_BLEND_S)
        : Math.max(0, b0 - dt / MOUNT_BLEND_S);
      const blend = rideBlendRef.current;
      if (rideNow) seatHeightRef.current = riderSeatOffsetY(rideNow.mount.stats.scaleM, hero.height);
      const trail = 1.2 * (1 - blend);
      // Hero figure trails a step behind the walker on foot,
      // and sits on the mount while riding — on the shell, at
      // its ground point, standing on the local up.
      const hx = walker.pos.x + Math.sin(walker.yaw) * trail;
      const hz = walker.pos.z + Math.cos(walker.yaw) * trail;
      const hg = liftedPoint(hx, hz, seatHeightRef.current * blend, world.groundHeight);
      heroFig.position.set(hg.x, hg.y, hg.z);
      heroFig.quaternion.copy(orientationQuat(hg, walker.yaw));
      if (++hudTick % 15 === 0) {
        const h = hunterRef.current;
        let sense = null;
        if (hero.sense) {
          let best = null;
          let bestD = Infinity;
          for (const m of world.monsters) {
            if (m.dead || !m.active) continue;
            const d = Math.hypot(m.x - walker.pos.x, m.z - walker.pos.z);
            if (d < bestD) { bestD = d; best = m; }
          }
          if (best) sense = { type: (MONSTER_TYPES[best.type] && MONSTER_TYPES[best.type].name) || best.type, element: best.element, dist: Math.round(bestD) };
        }
        setHud((prev) => ({
          ...prev,
          hp: h ? h.hp : prev.hp,
          shield: h ? h.shield : prev.shield,
          kills: h ? h.kills : prev.kills,
          inBase: isInBase(walker.pos.x, walker.pos.z),
          secondary: h ? activeSecondary(h, Date.now()) : null,
          bossHp: world.korus.dead ? 0 : world.korus.dormant ? null : world.korus.hp,
          bossAwake: world.korus.awake,
        }));
      }
      /* ranged bolts: fly straight, fade out, then leave the scene */
      for (let i = blasts.length - 1; i >= 0; i--) {
        const b = blasts[i];
        b.life -= dt;
        if (b.life <= 0) {
          scene.remove(b.mesh);
          try { b.mesh.geometry.dispose(); b.mesh.material.dispose(); } catch (e) { /* noop */ }
          blasts.splice(i, 1);
          continue;
        }
        b.mesh.position.x += b.vx * dt;
        b.mesh.position.y += b.vy * dt;
        b.mesh.position.z += b.vz * dt;
        b.mesh.material.opacity = Math.max(0, b.life / b.maxLife);
        if (b.head) b.head.material.opacity = Math.max(0, b.life / b.maxLife);
      }
      /* impact bursts + melee slash arcs: pop, fade, leave */
      for (let i = impacts.length - 1; i >= 0; i--) {
        const fx = impacts[i];
        fx.life -= dt;
        if (fx.life <= 0) {
          scene.remove(fx.mesh);
          try { if (fx.mesh.geometry) fx.mesh.geometry.dispose(); fx.mesh.material.dispose(); } catch (e) { /* noop */ }
          impacts.splice(i, 1);
          continue;
        }
        const t = fx.life / fx.maxLife;
        fx.mesh.material.opacity = Math.max(0, t);
        const s = fx.kind === 'burst' ? 1 + (1 - t) * fx.grow : 0.8 + (1 - t) * 0.35;
        // WS6 halos keep their own footprint (slash halo is a
        // wide 2.2 x 1.2 arc, burst halos are round).
        if (fx.kind === 'halo') fx.mesh.scale.set((fx.baseX || 1) * s, (fx.baseY || 1) * s, 1);
        else fx.mesh.scale.set(s, s, s);
      }
      renderer.setSize(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight, false);
      renderer.render(scene, camera);
    }
    tick();

    // Leaving the world persists the return point: next entry
    // comes back to The Haven.
    setProgress((p) => {
      const next = DATA.markVisited(p);
      DATA.saveProgress(next);
      return next;
    });

    return () => {
      cancelAnimationFrame(raf);
      detachLook();
      keys.detach && keys.detach();
      guard.dispose && guard.dispose();
      world.dispose();
      for (const b of blasts) { try { scene.remove(b.mesh); b.mesh.geometry.dispose(); b.mesh.material.dispose(); } catch (e) { /* noop */ } }
      blasts.length = 0;
      for (const fx of impacts) { try { scene.remove(fx.mesh); if (fx.mesh.geometry) fx.mesh.geometry.dispose(); fx.mesh.material.dispose(); } catch (e) { /* noop */ } }
      impacts.length = 0;
      // WS6 acid pools die with the world.
      for (const p of poolsRef.current) { try { scene.remove(p.ring); scene.remove(p.disc); p.ring.geometry.dispose(); p.ring.material.dispose(); p.disc.geometry.dispose(); p.disc.material.dispose(); } catch (e) { /* noop */ } }
      poolsRef.current = [];
      if (dmgFlashTimer.current) clearTimeout(dmgFlashTimer.current);
      // Dino companions leave with the world; the record keeps
      // their state, so they rejoin in the next realm.
      for (const h of companionsRef.current.splice(0)) { try { h.dispose(); } catch (e) { /* noop */ } }
      dinoApiRef.current = null;
      // A mount never survives leaving the world: the ride refs
      // die with the effect, and the next entry starts on foot.
      rideRef.current = null;
      rideApiRef.current = null;
      mountPromptRef.current = null;
      setMounted(null);
      setMountPrompt(null);
      renderer.dispose();
      worldRef.current = null;
      walkerRef.current = null;
    };
    // `entry` is INTENTIONALLY excluded from the deps below (Merlin,
    // Nov 16 WS1): checkMission() reassigns it mid-session
    // (mission -> roam on completion), and listing it would rebuild
    // the whole world — walker, hunter and mounts reset — the moment
    // a mission completes. enterCluster always changes mode/clusterId
    // together with entry, so the mount closure still sees the entry
    // for this session; do not add it without a mid-session guard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, clusterId]);

  const killsToShield = hud.shield > 0 ? 0 : (30 - (hud.kills % 30)) % 30 || 30;

  if (mode === 'menu') {
    // THE CONCOURSE ENTRY: intro + character selection first.
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg,#1a1426 0%,#3a2a1a 55%,#c2a15e 100%)', color: '#fff', padding: '2rem 1rem 0.75rem', fontFamily: 'Georgia, serif' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontSize: 12, letterSpacing: 4, color: GOLD }}>THE WORLD INSIDE THE WORLD</div>
          <h1 style={{ fontSize: 'clamp(2rem, 7vw, 3.4rem)', margin: '0.4rem 0', background: 'linear-gradient(180deg,#ffe9a8,#d8b25c)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
            {DATA.INTRO.title}
          </h1>
          {/* Intro video (Merlin's own render from the banner); the banner image is the fallback, then the procedural orbs. */}
          {bannerFailed ? (
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', margin: '0.6rem 0 0.2rem' }}>
              {DATA.INTRO.orbs.map((o) => (
                <span key={o.element} title={o.element} style={{ width: 22, height: 22, borderRadius: '50%', background: o.color, boxShadow: `0 0 14px ${o.color}`, display: 'inline-block' }} />
              ))}
            </div>
          ) : videoFailed ? (
            <img src="/images/hollow-earth/intro-banner.jpg" alt="Olympian Monsterverse banner"
              onError={() => setBannerFailed(true)}
              style={{ width: '100%', maxWidth: 640, borderRadius: 16, margin: '0.8rem auto 0.2rem', display: 'block', boxShadow: '0 0 24px rgba(216,178,92,0.35)' }} />
          ) : (
            <video src="/videos/hollow-earth/intro.mp4" poster="/images/hollow-earth/intro-banner.jpg" alt="Olympian Monsterverse intro"
              autoPlay muted loop playsInline
              onError={() => setVideoFailed(true)}
              style={{ width: '100%', maxWidth: 640, borderRadius: 16, margin: '0.8rem auto 0.2rem', display: 'block', boxShadow: '0 0 24px rgba(216,178,92,0.35)' }} />
          )}
          <p style={{ opacity: 0.85 }}>{DATA.INTRO.tagline}</p>
          {/* Compact one-frame hunter pick (Merlin, Nov 16 ~02:32):
              the whole menu fits in a single phone frame under the
              banner — no scroll. 6 heroes as a 3x2 chip grid (name +
              HP + weapon damage); the selected hero's full card
              (realm, full stats, blurb, trait) lives in the detail
              strip below, so tapping any chip shows its story. */}
          <h2 style={{ marginTop: '0.5rem', marginBottom: 0, fontSize: 17 }}>Choose your hunter</h2>
          <p style={{ opacity: 0.7, fontSize: 12, margin: '0 0 0.4rem', lineHeight: 1.25 }}>Tapping the Monsterverse Concourse icon opens here — pick first, then enter as that character.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: '0.4rem', textAlign: 'left' }}>
            {HERO_ORDER.map((key) => {
              const h = HEROES[key];
              const selected = key === heroKey;
              return (
                <button key={key} type="button" onClick={() => pickHero(key)}
                  style={{ padding: '0.4rem', borderRadius: 10, border: selected ? `2px solid ${GOLD}` : '1px solid rgba(255,255,255,0.2)', background: selected ? 'rgba(216,178,92,0.22)' : 'rgba(0,0,0,0.35)', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', minWidth: 0, overflow: 'hidden' }}>
                  <div style={{ fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.name}{h.sense ? ' 🔍' : ''}</div>
                  <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2, whiteSpace: 'nowrap' }}>❤️{h.maxHp} {Array.from(h.meleeLabel)[0]}{h.meleeDmg} {Array.from(h.rangedLabel)[0]}{h.ranged.dmg}</div>
                </button>
              );
            })}
          </div>
          <div style={{ marginTop: 6, padding: '0.45rem 0.6rem', borderRadius: 10, border: `1px solid ${GOLD}`, background: 'rgba(216,178,92,0.12)', textAlign: 'left' }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{hero.name} <span style={{ opacity: 0.6, fontWeight: 400 }}>· {hero.realm}</span></div>
            <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>❤️ {hero.maxHp} · {hero.meleeLabel} {hero.meleeDmg} · {hero.rangedLabel} {hero.ranged.dmg} @ {hero.ranged.range} m{hero.sense ? ' · 🔍 Tracking sense' : ''}</div>
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{hero.blurb}</div>
            {hero.trait && <div style={{ fontSize: 12, color: GOLD, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{hero.trait}</div>}
          </div>
          <button type="button" onClick={() => setMode('map')}
            style={{ marginTop: '0.5rem', padding: '0.5rem 2rem', borderRadius: 999, border: 'none', background: GOLD, color: '#1a1426', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>
            Enter as {hero.name} →
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'map') {
    const gp = DATA.gateProgress(campaign);
    return (
      <div style={{ minHeight: '100vh', background: '#17121f', color: '#fff', padding: '1rem 1rem 0.75rem', fontFamily: 'Georgia, serif' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          {/* Compact one-frame mission map (Merlin, Nov 16 ~02:32):
              every cluster, mission, Hunt / Hunt again, Free Roam
              and the campaign + Korus gate readout fit in a single
              phone frame — no long scroll. Cluster blurbs stay;
              mission rows are one flex line each (text wraps, the
              Hunt pill stays pinned right); Free Roam rides in the
              cluster header, element-coloured by first biome. */}
          <button type="button" onClick={() => setMode('menu')} style={{ background: 'none', border: 'none', color: GOLD, cursor: 'pointer', fontSize: 13, padding: 0 }}>← Hunters</button>
          <h1 style={{ color: GOLD, fontSize: 20, margin: '0.15rem 0' }}>Olympian Monsterverse</h1>
          <p style={{ opacity: 0.8, fontSize: 12, margin: '0 0 0.5rem' }}>Entering as <b>{hero.name}</b> · ❤️ {hero.maxHp} · {hero.meleeLabel} {hero.meleeDmg}</p>
          <div style={{ border: '1px solid rgba(216,178,92,0.5)', borderRadius: 10, padding: '0.45rem 0.6rem', margin: '0 0 0.5rem', background: 'rgba(216,178,92,0.08)', fontSize: 13 }}>
            <div style={{ fontWeight: 700 }}>🏆 Campaign — {campaign.kills} kills{campaign.shield > 0 ? ` · 🛡️ Shield ${campaign.shield}` : ''}</div>
            <div style={{ marginTop: 2 }}>
              {campaign.korusDone ? '👑 Korus has fallen. The throne is silent.'
                : gp.remaining === 0 ? '👑 The gate is OPEN — Korus waits on his throne.'
                  : `👑 Korus gate: ${gp.kills}/${gp.needed} kills — ${gp.remaining} more to wake the throne.`}
            </div>
          </div>
          {DATA.CLUSTER_ORDER.map((cid) => {
            const c = DATA.CLUSTERS[cid];
            const done = DATA.clusterMissionsDone(progress, cid);
            const accent = (DATA.INTRO.orbs.find((o) => o.element === c.biomes[0]) || {}).color || GOLD;
            return (
              <div key={cid} style={{ border: '1px solid rgba(255,255,255,0.15)', borderLeft: `3px solid ${accent}`, borderRadius: 10, padding: '0.5rem 0.6rem', marginBottom: '0.5rem', background: 'rgba(0,0,0,0.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, flex: 1, minWidth: 0 }}>{c.name} <span style={{ opacity: 0.6, fontWeight: 400 }}>· {done}/{c.missions.length} missions</span></div>
                  <button type="button" onClick={() => enterCluster(cid, 'roam')} style={{ background: 'none', color: GOLD, border: `1px solid ${GOLD}`, borderRadius: 999, padding: '0.15rem 0.6rem', cursor: 'pointer', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>🧭 Free Roam</button>
                </div>
                <div style={{ opacity: 0.75, fontSize: 12, marginTop: 2 }}>{c.blurb}</div>
                {c.missions.map((m) => {
                  const isDone = DATA.isMissionDone(progress, cid, m);
                  return (
                    <div key={m.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 4, fontSize: 12.5 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {isDone ? '✅' : '🎯'} <b>{m.title}</b> — {m.objective} <span style={{ opacity: 0.6 }}>({DATA.DIFFICULTY_LABELS[m.difficulty]}, par {m.par}s)</span>
                      </div>
                      {/* D-M2 / mission replay (2026-11-16, Merlin: YES,
                          finished missions are replayable): a done
                          mission stays done — replay re-enters it and
                          re-completing just re-marks it (completeMission
                          is an idempotent flag-set, and there is no
                          per-mission reward to double-award; kills
                          still feed the campaign, as in Free Roam). */}
                      {isDone ? (
                        <button type="button" onClick={() => enterCluster(cid, 'mission', m.id)} style={{ background: 'none', color: GOLD, border: `1px solid ${GOLD}`, borderRadius: 999, padding: '0.15rem 0.7rem', cursor: 'pointer', fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap', flexShrink: 0 }}>Hunt again</button>
                      ) : (
                        <button type="button" onClick={() => enterCluster(cid, 'mission', m.id)} style={{ background: GOLD, color: '#1a1426', border: 'none', borderRadius: 999, padding: '0.15rem 0.7rem', cursor: 'pointer', fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap', flexShrink: 0 }}>Hunt</button>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ---- world ----
  // The equipped weapon lends its reticle to the hand it arms
  // (the backpack law); otherwise the hero's native reticle.
  const equippedEntry = equippedWeaponEntry(pack);
  const weaponReticle = equippedReticleForSlot(equippedEntry, hud.weapon)
    || (hud.weapon === 'melee' ? reticleFor(hero.meleeClass) : reticleFor(hero.ranged.kind));
  // The weapon orb's face: the weapon's glyph + its damage, so the
  // orb carries what the old pill showed (the full name + damage
  // stays in the orb's aria-label). A backpack weapon shows 🎒.
  // Structured (Merlin, Nov 16 WS1): glyph + damage come from the
  // same parts as the label — the damage from its NUMBER source,
  // never re-parsed out of the display string, so a future label
  // that breaks the "emoji first, number last" shape cannot
  // silently show the wrong damage. The hero glyph is the label's
  // first code point (every hero label leads with its emoji).
  const weaponLabel = hud.weapon === 'melee'
    ? (equippedDamageForSlot(equippedEntry, 'melee') != null && equippedEntry
      ? `🎒 ${equippedEntry.name} ${equippedDamageForSlot(equippedEntry, 'melee')}`
      : `${hero.meleeLabel} ${hero.meleeDmg}`)
    : (equippedDamageForSlot(equippedEntry, 'ranged') != null && equippedEntry
      ? `🎒 ${equippedEntry.name} ${equippedDamageForSlot(equippedEntry, 'ranged')}`
      : `${hero.rangedLabel} ${hero.ranged.dmg}`);
  const weaponFace = hud.weapon === 'melee'
    ? (equippedDamageForSlot(equippedEntry, 'melee') != null && equippedEntry
      ? { glyph: '🎒', dmg: equippedDamageForSlot(equippedEntry, 'melee') }
      : { glyph: Array.from(hero.meleeLabel)[0], dmg: hero.meleeDmg })
    : (equippedDamageForSlot(equippedEntry, 'ranged') != null && equippedEntry
      ? { glyph: '🎒', dmg: equippedDamageForSlot(equippedEntry, 'ranged') }
      : { glyph: Array.from(hero.rangedLabel)[0], dmg: hero.ranged.dmg });
  // Visible word on the weapon orb: the weapon class (MELEE/RANGED).
  const weaponClassLabel = hud.weapon === 'melee' ? 'MELEE' : 'RANGED';
  return (
    <div ref={worldRootRef} style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} />
      {/* FULLSCREEN orb — the maximize button sits at the very top
          right OF the game screen (Merlin, Nov 16 — standing law),
          never under it. In fullscreen the same corner carries the
          EXIT orb instead. The HUD column below keeps 4.75 rem of
          right-side clearance (12 + 56 orb + 8 gap) so this orb
          never sits on the health pill. */}
      {!fullscreen && (
        <OrbButton fn="fullscreen" ariaLabel="Enter fullscreen" onClick={toggleFullscreen}
          style={{ position: 'absolute', right: 12, top: 12, zIndex: 9 }}>
          <OrbLabel>FULL</OrbLabel>
        </OrbButton>
      )}
      {fullscreen && (
        <OrbButton fn="fullscreen-exit" ariaLabel="Exit fullscreen" onClick={toggleFullscreen}
          style={{ position: 'absolute', right: 12, top: 12, zIndex: 9 }}>
          <OrbLabel>EXIT</OrbLabel>
        </OrbButton>
      )}
      {/* JUMP orb (Merlin, Nov 16): bottom-right, its own plain
          circle — back at BOTTOM_CLEAR now the bar is gone (the
          CORNER_CLEAR lift existed only to clear it). A press while
          mounted is swallowed by the tick, never a jump off the
          saddle. Measured clear of the dock: at 320 px the dock's
          right edge is x 198, JUMP's left edge x 232. */}
      <OrbButton fn="jump" ariaLabel="Jump" size={76}
        onPointerDown={() => { jumpRef.current = true; }}
        style={{ position: 'absolute', right: 12, bottom: BOTTOM_CLEAR, zIndex: 6 }}>
        <span style={{ fontSize: 15 }}>JUMP</span>
      </OrbButton>
      {/* Crosshair reticle, from the backpack law */}
      <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', color: '#fff', fontSize: 22, opacity: 0.85, pointerEvents: 'none' }}>
        {weaponReticle === 'crosshair' ? '✛' : weaponReticle === 'chevron' ? '⌃' : '•'}
      </div>
      {/* Damage flash: red vignette pulse when the hunter loses HP */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse at center, transparent 42%, rgba(255,30,30,0.55) 100%)', opacity: dmgFlash ? 0.9 : 0, transition: 'opacity 0.28s' }} />
      {/* HUD: health / shield / kills / sense / boss / toast — one
          column in flow, so the pills can never stack over each
          other or over the sense pill on a notched phone. The
          old absolute sense pill at a fixed 3.2rem landed
          squarely on the hearts pill whenever the safe-area
          inset pushed the top bar down — that overlap is gone
          by construction now: everything stacks, nothing floats. */}
      <div style={{ position: 'absolute', top: 'max(0.75rem, env(safe-area-inset-top))', left: '1rem', right: '4.75rem', display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ background: 'rgba(0,0,0,0.55)', borderRadius: 999, padding: '0.3rem 0.8rem', color: '#fff', fontSize: 14 }}>
            ❤️ {hud.hp}/{hero.maxHp}{hud.shield > 0 ? ` · 🛡️ ${hud.shield}` : ''}
          </span>
          <span style={{ background: 'rgba(0,0,0,0.55)', borderRadius: 999, padding: '0.3rem 0.8rem', color: '#fff', fontSize: 14 }}>
            ☠️ {hud.kills} kills{hud.shield <= 0 ? ` · shield in ${killsToShield}` : ''}
          </span>
          {/* Elemental orb tally (Merlin, Nov 16 ~01:52): counts per
              element, same HUD row as kills/shield. Nonzero
              elements only; empty wallet reads "0 orbs". */}
          {orbHud && (
            <span style={{ background: 'rgba(0,0,0,0.55)', borderRadius: 999, padding: '0.3rem 0.8rem', color: '#fff', fontSize: 14 }}>
              🔮 {Object.values(ORB_ELEMENTS).filter((o) => (orbHud.orbs[o.element] || 0) > 0).map((o) => `${o.icon}${orbHud.orbs[o.element]}`).join(' ') || '0 orbs'}
            </span>
          )}
          {hud.inBase && <span style={{ background: 'rgba(216,178,92,0.85)', borderRadius: 999, padding: '0.3rem 0.8rem', color: '#1a1426', fontSize: 14, fontWeight: 700 }}>🏠 The Haven — sanctuary</span>}
          {/* Sanctuary/Wilds readout, re-homed from the deleted bar
              (Merlin, Nov 16 ~02:30): display-only, same words the
              bar showed — the Haven pill above when in base, this
              Wilds pill out in the field. */}
          {!hud.inBase && <span style={{ background: 'rgba(0,0,0,0.55)', borderRadius: 999, padding: '0.3rem 0.8rem', color: '#fff', fontSize: 14 }}>⚔️ Wilds</span>}
          {/* Trade opens at The Haven only — the button lives in
              the HUD row (pointerEvents re-enabled: the HUD
              column itself is pointer-events none). */}
          {hud.inBase && orbHud && (
            <OrbButton fn="trade" size={44} accent={GOLD} onClick={() => setTradeOpen(true)} ariaLabel="Open elemental trade" style={{ pointerEvents: 'auto' }}>
              <OrbLabel>TRADE</OrbLabel>
            </OrbButton>
          )}
        </div>
        {hud.sense && (
          <div style={{ alignSelf: 'flex-start', background: 'rgba(0,0,0,0.55)', borderRadius: 999, padding: '0.3rem 0.8rem', color: '#ffe14d', fontSize: 13 }}>
            🔍 {hud.sense.type} · {hud.sense.element} · {hud.sense.dist} m
          </div>
        )}
        {/* WS6: the active secondary — one pill, same stacked
            column, no new layout. */}
        {hud.secondary && (
          <div style={{ alignSelf: 'flex-start', background: 'rgba(0,0,0,0.55)', borderRadius: 999, padding: '0.3rem 0.8rem', color: '#fff', fontSize: 13 }}>
            {hud.secondary.icon} {hud.secondary.label} · {hud.secondary.seconds}s
          </div>
        )}
        {hud.bossHp != null && (
          <div style={{ width: 'min(420px, 70vw)', margin: '0 auto' }}>
            <div style={{ textAlign: 'center', color: '#ff5544', fontWeight: 800 }}>👑 KORUS {hud.bossAwake ? '— AWAKE' : ''}</div>
            <div style={{ height: 10, borderRadius: 999, background: 'rgba(255,255,255,0.2)', overflow: 'hidden' }}>
              <div style={{ width: `${Math.max(0, (hud.bossHp / 1000) * 100)}%`, height: '100%', background: '#ff5544' }} />
            </div>
          </div>
        )}
        {toast && (
          <div style={{ alignSelf: 'center', background: 'rgba(0,0,0,0.7)', borderRadius: 999, padding: '0.4rem 1rem', color: '#fff', fontSize: 14, textAlign: 'center', maxWidth: '90vw' }}>{toast}</div>
        )}
      </div>
      {/* MOUNTS (Merlin, 2026-11-15): the mount prompt lives in its
          own absolutely-positioned slot (MOUNT_SLOT), centred below
          the HUD and clear of the boss bar — a visible plain circle
          orb, like the egg-steal button, never hidden inside a
          collapsed panel. It sits OUTSIDE the HUD column's flow, so
          a toast appearing or fading never shifts it under the
          thumb. While mounted it becomes the Dismount orb; walking
          away is NOT dismount. */}
      {mountPrompt && !mounted && (
        <OrbButton fn="mount" accent={GOLD} onClick={() => { if (rideApiRef.current) rideApiRef.current.mountPrompted(); }}
          ariaLabel={`Mount ${mountPrompt.name}`}
          style={MOUNT_SLOT}>
          <OrbLabel>MOUNT</OrbLabel>
        </OrbButton>
      )}
      {mounted && (
        <OrbButton fn="dismount" accent={GOLD} onClick={() => { if (rideApiRef.current) rideApiRef.current.dismount(); }}
          ariaLabel="Dismount"
          style={MOUNT_SLOT}>
          <OrbLabel>OFF</OrbLabel>
        </OrbButton>
      )}
      {korusDead && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)' }}>
          <div style={{ background: '#1a1426', border: `2px solid ${GOLD}`, borderRadius: 16, padding: '2rem', textAlign: 'center', color: '#fff', maxWidth: '90vw' }}>
            <div style={{ fontSize: 40 }}>👑</div>
            <h2 style={{ color: GOLD }}>KORUS HAS FALLEN</h2>
            <p>Stormfang is in your backpack. The Monsterverse remembers this hunt.</p>
            <button type="button" onClick={() => { setKorusDead(false); setMode('map'); }} style={{ background: GOLD, color: '#1a1426', border: 'none', borderRadius: 999, padding: '0.7rem 1.6rem', fontWeight: 800, cursor: 'pointer' }}>Back to the map</button>
          </div>
        </div>
      )}
      {/* ELEMENTAL TRADE (Merlin, Nov 16 ~01:52) — The Haven only.
          Orbs buy shield tiers/recharge + bolt tiers. Any-mix
          costs: acid drains first, poison last. No aether, no
          gold — orbs only. One track maxes at 30 orbs (5+10+15),
          both at 60. Closes when the hunter leaves The Haven. */}
      {tradeOpen && orbHud && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', zIndex: 20 }}>
          <div style={{ background: '#1a1426', border: `2px solid ${GOLD}`, borderRadius: 16, padding: '1.5rem', color: '#fff', maxWidth: '92vw', width: 420, maxHeight: '86vh', overflowY: 'auto' }}>
            <h2 style={{ color: GOLD, margin: '0 0 0.25rem' }}>🔮 Elemental Trade — The Haven</h2>
            <p style={{ margin: '0 0 1rem', fontSize: 14, opacity: 0.85 }}>
              Wallet: {Object.values(ORB_ELEMENTS).map((o) => `${o.icon} ${orbHud.orbs[o.element] || 0}`).join(' · ')} — {totalOrbs(orbHud.orbs)} total
            </p>
            <h3 style={{ color: GOLD, margin: '0 0 0.5rem', fontSize: 15 }}>🛡️ Shield — owned tier {orbHud.shieldTier} · charge {hud.shield}</h3>
            {SHIELD_TIERS.filter((t) => t.tier > 0).map((t) => (
              <div key={t.tier} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 14 }}>{t.label} — absorbs {t.max}</span>
                <OrbButton fn="buy-shield" accent={GOLD} disabled={orbHud.shieldTier >= t.tier} onClick={() => buyOrbShield(t.tier)} ariaLabel={orbHud.shieldTier >= t.tier ? `${t.label} shield — owned` : `Buy ${t.label} shield — ${t.cost} orbs`}>
                  <OrbLabel>{orbHud.shieldTier >= t.tier ? 'OWNED' : `BUY ${t.cost}`}</OrbLabel>
                </OrbButton>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 16 }}>
              <span style={{ fontSize: 14 }}>Recharge shield to full</span>
              <OrbButton fn="recharge" accent={GOLD} disabled={orbHud.shieldTier <= 0 || hud.shield >= shieldTierFor(orbHud.shieldTier).max} onClick={rechargeOrbShield} ariaLabel={`Recharge shield — ${SHIELD_RECHARGE_COST} orbs`}>
                <OrbLabel>BUY {SHIELD_RECHARGE_COST}</OrbLabel>
              </OrbButton>
            </div>
            <h3 style={{ color: GOLD, margin: '0 0 0.5rem', fontSize: 15 }}>🏹 Bolt — owned tier {orbHud.weaponTier}</h3>
            {WEAPON_TIERS.filter((t) => t.tier > 0).map((t) => (
              <div key={t.tier} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 14 }}>{t.label} — {t.dmg} dmg · {t.rangeM} m · {(t.cooldownMs / 1000).toFixed(1)} s</span>
                <OrbButton fn="buy-weapon" accent={GOLD} disabled={orbHud.weaponTier >= t.tier} onClick={() => buyOrbWeapon(t.tier)} ariaLabel={orbHud.weaponTier >= t.tier ? `${t.label} — owned` : `Buy ${t.label} — ${t.cost} orbs`}>
                  <OrbLabel>{orbHud.weaponTier >= t.tier ? 'OWNED' : `BUY ${t.cost}`}</OrbLabel>
                </OrbButton>
              </div>
            ))}
            <p style={{ fontSize: 12, opacity: 0.7, margin: '0.75rem 0 1rem' }}>Any orbs pay — acid first, poison last. The 30-kill shield is separate and cannot be recharged here.</p>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <OrbButton fn="close" accent={GOLD} onClick={() => setTradeOpen(false)} ariaLabel="Close trade">
                <OrbLabel>CLOSE</OrbLabel>
              </OrbButton>
            </div>
          </div>
        </div>
      )}
      {/* ORB DOCK (Merlin, Nov 16 ~02:30 — the bar is GONE, and with
          it WS1 Q4, the pill-wrapper question, answered by removal):
          no bar, no pill, no container — the four orbs are
          free-floating in one draggable cluster, bottom-left next
          to the joystick. Default arrangement, measured from the
          fixed orb sizes: a vertical column, left 142 (= 12 +
          118 px joystick + 12 gap), bottom BOTTOM_CLEAR, 8 px gaps,
          56 px wide, 212 px tall (44+8+44+8+56+8+44). Top to bottom:
          MAP, WEAPON, SPAWN, STRIKE — Map at the far top end,
          Strike at the bottom by the thumb, 116 px of Spawn +
          Weapon between their near edges, so Map NEVER sits next
          to Strike. One label per orb; plain circles, no rectangles.
          The weapon orb wears the shared weapon face + damage; the full
          name stays in its aria-label. Drag the cluster anywhere
          (see beginDockDrag above); the spot persists per user. */}
      <div ref={dockRef} onPointerDown={beginDockDrag}
        style={{ position: 'absolute', ...dockStyle, zIndex: 10, display: 'flex', flexDirection: 'column', gap: ORB_DOCK_GAP, touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', cursor: dockDragPx ? 'grabbing' : 'grab' }}>
        <OrbButton fn="map" size={44} accent="#d8b25c" onClick={() => { if (dockTapGuard()) return; setMode('map'); }} ariaLabel="Map">
        </OrbButton>
        {/* Weapon orb: 56 px, not 44 — the glyph + damage + the
            visible class word (MELEE/RANGED) need three stacked
            rows, and 44 px clips the 6-letter word. */}
        <OrbButton fn="weapon" size={56} accent="#d8b25c" onClick={() => { if (dockTapGuard()) return; setHud((p) => { const w = p.weapon === 'melee' ? 'ranged' : 'melee'; weaponRef.current = w; return { ...p, weapon: w }; }); }}
          ariaLabel={`Weapon: ${weaponLabel} — tap to switch weapon`}>
          <span style={{ fontSize: 9, lineHeight: 1 }}>{weaponFace.dmg}</span>
          <OrbLabel>{weaponClassLabel}</OrbLabel>
        </OrbButton>
        <OrbButton fn="home" size={44} accent="#d8b25c" onClick={() => { if (dockTapGuard()) return; spawnToBase(); }} title="Spawn to base — return to The Haven" ariaLabel="Spawn to base — return to The Haven">
        </OrbButton>
        <OrbButton fn="strike" size={44} accent="#ff5544" onClick={() => { if (dockTapGuard()) return; if (worldRef.current && worldRef.current.attack) worldRef.current.attack(); }}
          ariaLabel="Strike">
          <OrbLabel>STRIKE</OrbLabel>
        </OrbButton>
      </div>
      {/* Backpack launcher — NOT folded into the dock (Merlin's
          order leaves it separate and draggable as-is). Its old
          home was the deleted bar row, and a docked launcher with
          no stored spot renders in-flow — left parentless it would
          fall below the 100%-height canvas and vanish — so it gets
          its own home slot: bottom-right, 12 px above the JUMP orb
          (bottom BOTTOM_CLEAR + 76 JUMP + 12 gap), right-aligned
          with it. Its drag, v2 persistence and panel are untouched;
          a user-dragged spot still renders fixed at that spot. */}
      <div style={{ position: 'absolute', right: 12, bottom: `calc(${BOTTOM_CLEAR} + 88px)`, zIndex: 10 }}>
        <BackpackHud realm="hollow-earth" realmLabel="the Monsterverse" combatApplies docked
          onDinoSummon={(it) => { if (dinoApiRef.current) dinoApiRef.current.summon(it); }}
          onDinoRecall={(it) => { if (dinoApiRef.current) dinoApiRef.current.recall(it); }} />
      </div>
      {/* Walk joystick — anchored to the world root (viewport).
          Bottom-left at BOTTOM_CLEAR now the bar is gone (the
          CORNER_CLEAR lift existed only to clear it); the orb dock
          stands 12 px to its right, bottom-aligned with it. */}
      <div style={{ position: 'absolute', left: 12, bottom: BOTTOM_CLEAR, zIndex: 6 }}>
        <WalkJoystick size={118} onMove={(x, y) => { joyRef.current.x = x; joyRef.current.y = y; }} />
      </div>
    </div>
  );
}
