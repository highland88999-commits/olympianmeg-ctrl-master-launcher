'use client';

// MIDDLE-EARTH — six free-roam pods + the Hunt campaign.
// Modes: menu | map | zone.
// map  -> the Map of Middle-earth: pod cards at galaxy-card standard
//         (mode choice 🎯 Missions / 🧭 Free Roam per pod, mission
//         lists with completion marks) + the campaign card (orc
//         kills per pod and in total, the Saruman gate, the finale).
// zone -> buildZone(THREE, PODS[id], T, opts): walk the pod with
//         the walker pinned to the analytic ground (snapY), hunt
//         its orc war-bands with blade and bow, and — in Rohan,
//         once the gate opens — face Saruman at Isengard.

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { guardCanvasContext } from '../../lib/scene-context-guard.js';
import { buildZone } from './zone';
import * as T from './textures';
import * as DATA from './data';
import { podGraphic, neutralGraphic } from '../../lib/middle-earth/menu-graphics.js';
import { PLAYABLE, PLAYABLE_ORDER, buildFigure } from './characters.js';
import {
  createCampaign, loadCampaign, saveCampaign, recordKill, gateOpen,
  gateProgress, completeSaruman, claimReward, applyLootToRecord,
  applyRewardToRecord, heatOf, setHeat, cutHeatOnDeath,
} from './campaign';
import { heatLevel } from './hunt.js';
import {
  createHunter, stepHunter, hurtHunter, reviveHunter,
  strike, damageOrc, alertBand, aimYawFromWalker,
  mulberry32, PLAYER_MAX_HP, BLADE,
} from './orcs';
import { damageBoss, bossSlowFactor, bossPhase } from './boss';
import { orcLifeFor, bossLifeFor } from './operators.js';
import { RETICLE_BY_CLASS, equippedDamageForSlot, equippedReticleForSlot, equippedWeaponEntry, weaponHand } from '../../lib/backpack/backpack.js';
import {
  cgiForWeapon, rangedFiringFor, meleeFiringFor,
  spawnProjectile, stepProjectile,
  buildProjectileMesh, buildSwingArc, buildMuzzleFlash,
  loadWeaponGroup, mountWeaponInHand, mountWeaponSheathed,
} from '../../lib/weapons/cgi.js';
import { getBackpackRecord, updateBackpack, useBackpack } from '../../lib/backpack/store.js';
import { spawnCompanion, updateCompanions, removeCompanion, hasCompanion } from '../../lib/dino-companion.js';
import { isDinoItem, dinoIdOf, dinoDisplayName, DINO_STATE_OUT, DINO_STATE_PACK, setDinoItemState } from '../../lib/earth2/breeding.js';
import BackpackHud from '@/components/backpack/BackpackHud';
import OrbButton, { OrbLabel } from '@/components/world/OrbButton';
import { useOrbDock } from '@/components/world/useOrbDock';
import { createWalker, stepWalker, applyLook, resolveColliders, clampBounds } from '@/lib/world/walk-controls';
import { reportDecayPosition } from '@/lib/anti-life/lingering';
import { followCameraPose } from '@/lib/world/follow-camera';
import { goalArrowDeg } from './goal-compass';
import {
  heroMotionPose, heroPhaseRate, heroSeatPose, horseGallopPose, gallopPhaseRate,
  blendPoses, MOUNT_BLEND_S, shouldTuckMissionCard, MISSION_RETUCK_AFTER_S,
} from './figure-motion';
import {
  RIDE_SPEED_MPS, nearestHorseInRange, riderSeatOffsetY,
  dismountSpot, horseYawForWalker,
} from './riding';
import { createKeyInput, attachDragLook } from '@/lib/world/walk-input';
import { firstConnectedPad, newlyPressedButtons, pressedButtonSet, triggerRisingEdge, triggerValue, GAMEPAD_BUTTONS } from '@/lib/gamepad';
import WalkJoystick from '@/components/world/WalkJoystick';

const BANNER_CLEAR = 'max(3.5rem, calc(env(safe-area-inset-top) + 3rem))';
const BOTTOM_CLEAR = 'max(1.5rem, calc(env(safe-area-inset-bottom) + 1rem))';
const CARD_CLEAR = 'max(7.5rem, calc(env(safe-area-inset-bottom) + 6.5rem))';
const GOLD = '#d8b25c';
// Orb sizes for the shared dock (lib/world/orb-dock.js): the weapon
// orbs are the plain 56 px OrbButton circles.
const ME_ORB_SIZES = { melee: 56, ranged: 56 };

function readProgress() {
  try { return DATA.loadProgress() || DATA.createProgress(); } catch { return DATA.createProgress(); }
}
function readCampaign() {
  try { return loadCampaign() || createCampaign(); } catch { return createCampaign(); }
}

export default function MiddleEarthPage() {
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const contextGuardRef = useRef(null);
  const joyRef = useRef({ x: 0, y: 0 });
  /* Touch action buttons: sprint held + jump edge, read by the
   * frame loop (keyboard state stays the desktop path). */
  const touchRef = useRef({ sprint: false, jump: false });
  /* The zone's strike, so the on-screen Strike button can call it:
   * assigned inside the zone effect, reset to a noop on cleanup. */
  const strikeRef = useRef(() => {});
  /* Mission-card tuck, round 2: the tuck is a function of the mission
   * clock (the one clock proven to advance in real play), not a
   * one-shot timer — the round-1 timer never landed in production
   * (the full card stayed up for a whole 3-minute session). This ref
   * holds the mission seconds when the player last tapped the tucked
   * chip open; -RETUCK means "never expanded". */
  const missionHudExpandRef = useRef(-MISSION_RETUCK_AFTER_S);
  const goalHudRef = useRef('');
  const toastTimer = useRef(null);
  const introRef = useRef(false);
  const hunterRef = useRef(null);
  // DINO COMPANIONS (Merlin, 2026-11-14): raised dinos ride the
  // backpack across realms — the zone spawns 'out' dinos beside
  // the walker and follows them; the HUD summons/recalls through
  // dinoApiRef (the scene lives in the zone effect).
  const companionsRef = useRef([]);
  const dinoApiRef = useRef(null);
  const weaponRef = useRef('melee');
  const heroRef = useRef(null);
  // The backpack's equipped weapon, read at strike time (a ref so
  // the zone's tap closure never goes stale on a mid-hunt equip).
  const pack = useBackpack();
  const equippedRef = useRef(null);
  useEffect(() => { equippedRef.current = equippedWeaponEntry(pack); }, [pack]);
  const playerFigRef = useRef(null);
  /* The hero's in-hand weapon mount, assigned in the zone effect:
   * { swap } re-mounts when the pack or the hand changes. */
  const handWeaponRef = useRef(null);
  const playerSwingRef = useRef(0);
  /* Strike motion: which hand swung (the raise reads differently for
   * a staff blast than for a blade), the walk-cycle phase, and the
   * last frame's feet position for real travel speed. */
  const playerSwingKindRef = useRef('melee');
  const walkPhaseRef = useRef(0);
  const prevPlayerRef = useRef(null);
  const senseFrameRef = useRef(0);
  const huntHudRef = useRef(-1);
  const missionKillsRef = useRef(0);
  const lootRngRef = useRef(null);
  const campaignRef = useRef(null);
  const bossHudRef = useRef('');
  const elapsedMirror = useRef(0);
  const respawnRef = useRef(() => {});
  const beatOverlayRef = useRef(false);
  const fallenRef = useRef(false);
  const finaleRef = useRef(false);
  /* HORSES RIDEABLE (Merlin, Nov 15 ~00:57): Rohan's horses mount.
   * rideRef is the frame loop's truth ({ horse } while mounted);
   * the blend eases the hero between the walk pose and the seat
   * pose over MOUNT_BLEND_S so mounting never snaps. */
  const rideRef = useRef(null);
  const ridePhaseRef = useRef(0); // gallop-cycle phase, radians
  const rideBlendRef = useRef(0); // 0 = walk pose, 1 = seat pose
  const seatHeightRef = useRef(0); // saddle height above ground, metres
  const mountPromptRef = useRef(null); // horse id with a live prompt
  const rideApiRef = useRef(null); // { mountPrompted, dismount } for the buttons

  const [mode, setMode] = useState('menu'); // menu | map | zone
  const [podId, setPodId] = useState(null);
  const [entry, setEntry] = useState(null); // {kind:'mission',missionId} | {kind:'roam'}
  const [selectedId, setSelectedId] = useState(null);
  const [progress, setProgress] = useState(readProgress);
  const [campaign, setCampaign] = useState(readCampaign);
  const [toast, setToast] = useState('');
  const [intro, setIntro] = useState(false);
  const [beatState, setBeatState] = useState(null); // { reached, total } travel | { kills, need } hunt
  const [beatOverlay, setBeatOverlay] = useState(false);
  const [finishInfo, setFinishInfo] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [hp, setHp] = useState(PLAYER_MAX_HP);
  const [weapon, setWeapon] = useState('melee'); // melee | ranged
  // Orb dock (Merlin, Nov 16 ~02:42 — the Middle-earth mirror of the
  // Hollow Earth / Jupiter 2 treatment): the melee + ranged orbs are
  // free-floating and draggable; their spots persist per user under
  // `olympus:middle-earth:orb-dock:v1` (lib/world/orb-dock.js). The
  // action column (Strike/Jump/Sprint) keeps its mid-right home,
  // untouched by this pass; the backpack keeps its own dock.
  const dock = useOrbDock('middle-earth', ME_ORB_SIZES);
  const [huntHud, setHuntHud] = useState(null); // { heat, level }
  const [senseHud, setSenseHud] = useState('');
  const [bossHud, setBossHud] = useState(null); // { hp, maxHp, phase, state }
  const [fallen, setFallen] = useState(false);
  const [finaleOverlay, setFinaleOverlay] = useState(false);
  const [roamCard, setRoamCard] = useState(true);
  const [webglFail, setWebglFail] = useState(false);
  /* Mission card law (fix, 2026-10-25): full card on entry, then it
   * tucks to one line so it stops covering the hero's head and the
   * hunt readout; tapping the tucked chip opens it again. */
  const [missionHudCollapsed, setMissionHudCollapsed] = useState(false);
  /* First-entry strike hint: shown until the first strike or 8 s. */
  const [showStrikeHint, setShowStrikeHint] = useState(false);
  /* Goal compass: the active travel goal's label, distance, arrow. */
  const [goalHud, setGoalHud] = useState(null);
  const [sprintHeld, setSprintHeld] = useState(false);
  /* Mount prompt (nearest horse in range) and mounted state —
   * React mirrors of rideRef/mountPromptRef, for the buttons. */
  const [mountPrompt, setMountPrompt] = useState(null); // { id, name } | null
  const [mounted, setMounted] = useState(null); // { id, name } | null

  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2800);
  }, []);

  useEffect(() => { introRef.current = intro; }, [intro]);
  useEffect(() => { campaignRef.current = campaign; }, [campaign]);
  useEffect(() => { weaponRef.current = weapon; }, [weapon]);
  /* A mid-hunt equip (or hand swap) re-mounts the hero's weapon:
   * the zone effect owns the scene, this only asks it to swap. */
  useEffect(() => {
    if (handWeaponRef.current) handWeaponRef.current.swap();
  }, [pack, weapon]);
  useEffect(() => { elapsedMirror.current = elapsed; }, [elapsed]);
  useEffect(() => { beatOverlayRef.current = beatOverlay; }, [beatOverlay]);
  useEffect(() => { fallenRef.current = fallen; }, [fallen]);
  useEffect(() => { finaleRef.current = finaleOverlay; }, [finaleOverlay]);

  const pod = podId ? DATA.PODS[podId] : null;
  const activeMission = useMemo(() => {
    if (!pod || !entry || entry.kind !== 'mission') return null;
    return (pod.missions || []).find((m) => m.id === entry.missionId) || null;
  }, [pod, entry]);

  /* Free-roam banner law (house): full card on entry, fades after
   * ~6 s of exploring to a small persistent mode chip. */
  useEffect(() => {
    if (mode !== 'zone' || !entry || entry.kind !== 'roam') return undefined;
    setRoamCard(true);
    const t = setTimeout(() => setRoamCard(false), 6000);
    return () => clearTimeout(t);
  }, [mode, entry]);

  /* Zone-entry HUD timers: the strike hint fades after ~8 s (or on
   * the first strike). The mission card's tuck is NOT timed here
   * anymore — round 2 drives it from the mission clock (see the
   * clock effect), because the round-1 one-shot tuck timer never
   * landed in real play. */
  useEffect(() => {
    if (mode !== 'zone' || !entry) return undefined;
    setMissionHudCollapsed(false);
    setShowStrikeHint(true);
    const t2 = setTimeout(() => setShowStrikeHint(false), 8000);
    return () => {
      clearTimeout(t2);
    };
  }, [mode, entry]);

  /* Re-opening the tucked mission card: the clock rule re-tucks it
   * after the re-tuck window (see shouldTuckMissionCard). */
  const expandMissionHud = useCallback(() => {
    setMissionHudCollapsed(false);
    missionHudExpandRef.current = elapsedMirror.current;
  }, []);

  /* Mission clock (par is a soft clock — a verdict, never a gate).
   * The interval also owns the mission-card tuck (round 2): the
   * card tucks once the clock passes the tuck time, and stays open
   * for the re-tuck window after the player taps it open. Driven
   * by the clock rather than a one-shot timer, the tuck cannot
   * silently never fire again. */
  useEffect(() => {
    if (mode !== 'zone' || !entry || entry.kind !== 'mission' || intro || beatOverlay || fallen) return undefined;
    const started = Date.now() - elapsed * 1000;
    const iv = setInterval(() => {
      const s = Math.floor((Date.now() - started) / 1000);
      setElapsed(s);
      if (shouldTuckMissionCard(s, missionHudExpandRef.current)) setMissionHudCollapsed(true);
    }, 500);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, entry, intro, beatOverlay, fallen]);

  const hero = PLAYABLE[DATA.heroOf(progress)] || PLAYABLE.ranger;

  const enterPod = useCallback((id, ent) => {
    setPodId(id);
    setEntry(ent);
    setBeatOverlay(false);
    setFinishInfo(null);
    setElapsed(0);
    setBeatState(null);
    setBossHud(null);
    bossHudRef.current = '';
    setFallen(false);
    setHuntHud(null);
    setSenseHud('');
    setGoalHud(null);
    goalHudRef.current = '';
    missionKillsRef.current = 0;
    hunterRef.current = createHunter(hero.maxHp);
    heroRef.current = hero;
    missionHudExpandRef.current = -MISSION_RETUCK_AFTER_S;
    setHp(hero.maxHp);
    setIntro(ent.kind === 'mission');
    setMode('zone');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hero]);

  /* ---------------- the zone ---------------- */
  useEffect(() => {
    if (mode !== 'zone' || !pod || !entry) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    let cancelled = false;
    let renderer = rendererRef.current;
    if (!renderer) {
      try {
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
      } catch (e) {
        setWebglFail(true);
        return undefined;
      }
      rendererRef.current = renderer;
      contextGuardRef.current = guardCanvasContext(canvas, { label: 'MIDDLE EARTH' });
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2500);
    camera.rotation.order = 'YXZ';

    const resize = () => {
      const w = canvas.clientWidth || window.innerWidth;
      const h = canvas.clientHeight || window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      renderer.setSize(w, h, false);
      renderer.setPixelRatio(dpr);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener('resize', resize);

    const hunter = hunterRef.current || createHunter();
    hunterRef.current = hunter;
    lootRngRef.current = mulberry32(((pod.seed >>> 0) ^ ((campaignRef.current ? campaignRef.current.totalKills : 0) * 7919)) >>> 0);

    const mission = entry.kind === 'mission'
      ? (pod.missions || []).find((m) => m.id === entry.missionId) || null : null;
    const huntNeed = mission && mission.hunt ? mission.hunt.count : 0;
    if (huntNeed) setBeatState({ kills: 0, need: huntNeed });

    let zone = null;
    let missionDone = false;

    const finishMission = () => {
      if (missionDone || cancelled || !mission) return;
      missionDone = true;
      try {
        const np = DATA.completeMission(progress, pod.id, mission.id);
        DATA.saveProgress(np);
        setProgress(np);
      } catch { /* storage may be unavailable */ }
      setFinishInfo({ seconds: elapsedMirror.current, par: mission.par || null });
      setBeatOverlay(true);
    };

    const onOrcKilled = (orc, loot, lifeLine) => {
      let nc = recordKill(campaignRef.current, pod.id);
      // the gate may open mid-roam — wake the vale live
      if (zone && zone.hunt.boss && zone.hunt.boss.state === 'dormant' && gateOpen(nc)) {
        zone.hunt.boss.state = 'ready';
        showToast('⚔ The gate is met — Saruman waits at Isengard (Rohan).');
      }
      campaignRef.current = nc;
      saveCampaign(nc);
      setCampaign(nc);
      if (Array.isArray(loot) && loot.length) {
        try { updateBackpack((rec) => applyLootToRecord(rec, loot)); } catch { /* pack unavailable */ }
        const names = loot.map((l) => (l.weapon ? l.weapon.name : `${l.name} ×${l.qty}`)).join(', ');
        showToast(`Loot: ${names}` + (lifeLine ? ` · ${lifeLine}` : ''));
      } else if (lifeLine) {
        showToast(lifeLine);
      }
      if (mission && mission.hunt && !missionDone) {
        missionKillsRef.current += 1;
        setBeatState({ kills: missionKillsRef.current, need: huntNeed });
        if (missionKillsRef.current >= huntNeed) finishMission();
      }
    };

    const onPlayerHit = (dmg) => {
      if (!hunter.alive) return;
      const died = hurtHunter(hunter, dmg);
      setHp(hunter.hp);
      if (died) {
        if (zone) zone.setPlayerAlive(false);
        if (zone && zone.hunt.boss && zone.hunt.boss.state === 'combat') {
          zone.hunt.boss.state = 'ready';
          zone.hunt.boss.pending = [];
        }
        /* death cuts the meter — the orcs lost your trail */
        const nc = cutHeatOnDeath(campaignRef.current, pod.id);
        campaignRef.current = nc;
        saveCampaign(nc);
        setCampaign(nc);
        setFallen(true);
      }
    };

    const onBossEvent = (ev) => {
      if (!ev) return;
      if (ev.type === 'woke') showToast('Saruman the White has turned his eye on you.');
      if (ev.type === 'phase') showToast(ev.phase === 2 ? 'His voice rolls over the vale…' : 'The White Wizard rages!');
      if (ev.type === 'died') {
        let nc = completeSaruman(campaignRef.current, Date.now());
        if (!nc.rewardClaimed) {
          try { updateBackpack((rec) => applyRewardToRecord(rec)); } catch { /* pack unavailable */ }
          nc = claimReward(nc);
          showToast('🏆 Saruman has fallen. His staff is yours — find it in your backpack.');
        }
        campaignRef.current = nc;
        saveCampaign(nc);
        setCampaign(nc);
        setFinaleOverlay(true);
      }
    };

    zone = buildZone(THREE, pod, T, {
      mission,
      freeRoam: entry.kind === 'roam',
      gateOpen: gateOpen(campaignRef.current),
      playerKey: heroRef.current ? heroRef.current.key : null,
      playerQuiet: heroRef.current ? heroRef.current.quiet : 1,
      initialHeat: heatOf(campaignRef.current, pod.id),
      onPlayerHit,
      onOrcKilled,
      onBossEvent,
    });
    scene.add(zone.group);
    scene.background = new THREE.Color(zone.sky);
    scene.fog = new THREE.FogExp2(zone.fog.color, zone.fog.density);

    /* The player's own body: the chosen hero, rendered at the
     * walker's feet so the follow camera can SEE who you are.
     * (The zone skips this hero's NPC seat — the twin rule.) */
    let playerFig = null;
    let playerBody = null;
    try {
      const h = heroRef.current;
      const sp = zone.spawn || { x: 0, z: 95 };
      playerFig = buildFigure(THREE, {
        id: 'player', model: h.key, name: h.name, height: h.height,
        at: [sp.x, sp.z], hideLabel: true,
      }, zone.groundHeight);
      playerBody = playerFig.group.getObjectByName('figure-body');
      scene.add(playerFig.group);
      playerFigRef.current = playerFig;
    } catch (e) { playerFig = null; }

    /* The hero's hand carries a weapon (lib/weapons/cgi.js): the
     * equipped weapon when it arms the hand in use, else the
     * hero's own — staff for the wizard, bow for the archers,
     * mace for the dwarf's axe, sword for the rest. The GLB when
     * one exists, the procedural build when it does not or fails
     * to load. Swaps live through handWeaponRef (the pack/weapon
     * effect above calls swap); the zone cleanup disposes it.
     * Nothing the hero carries ever vanishes: the weapon that
     * leaves the hand is SHEATHED on the body (mountWeaponSheathed),
     * and so is the other hand's weapon — the sheathed set is
     * always the hero's actual carried weapons, at their fitted
     * size, on the hip or the back, never floating. */
    const handWeapon = { group: null, spec: null, token: 0 };
    const sheathed = { groups: new Map(), lastOut: null, token: 0 };
    const disposeHandGroup = (group) => {
      if (!group) return;
      group.traverse((o) => {
        if (o.isMesh) {
          if (o.geometry) { try { o.geometry.dispose(); } catch (e) { /* noop */ } }
          const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
          for (const m of mats) { try { m.dispose(); } catch (e) { /* noop */ } }
        }
      });
    };
    const nativeWeaponClassFor = (hero, hand) => {
      if (hand === 'ranged') return hero.ranged.kind === 'staff' ? 'staff' : 'bow';
      if (hero.key === 'wizard') return 'staff';
      if (hero.key === 'dwarf') return 'blunt'; // the axe, swung like a maul
      return 'blade';
    };
    const nativePresetIdFor = (wc) => (
      wc === 'staff' ? 'preset-staff'
        : wc === 'bow' ? 'preset-bow'
          : wc === 'blunt' ? 'preset-mace'
            : 'preset-sword'
    );
    /* The weapon a hand carries: the equipped weapon when it arms
     * that hand, else the hero's native weapon for the hand. The
     * one place that decision lives, for the hand and the sheathe. */
    const specForHand = (hand) => {
      const hero = heroRef.current;
      if (!hero) return null;
      const eq = equippedRef.current;
      if (eq && weaponHand(eq) === hand) {
        return {
          wc: (eq.meta && eq.meta.weaponClass) || nativeWeaponClassFor(hero, hand),
          id: eq.id,
        };
      }
      const wc = nativeWeaponClassFor(hero, hand);
      return { wc, id: nativePresetIdFor(wc) };
    };
    /* The sheathed set, kept in step with the hand: the other
     * hand's weapon, plus the weapon just swapped out. A weapon
     * is never sheathed while it is in the hand, never twice,
     * and never at the wrong size — every sheathed group is a
     * fitted loadWeaponGroup, mounted by mountWeaponSheathed.
     * Async loads are token-guarded like the hand swap, so a
     * fast double-swap cannot leave a stale weapon on the body. */
    const syncSheathe = async (activeHand, activeSpec) => {
      const myToken = ++sheathed.token;
      const hero = heroRef.current;
      if (!hero || !playerBody) return;
      const activeKey = activeSpec ? (activeSpec.wc + ':' + (activeSpec.id || '')) : '';
      const desired = new Map();
      const addDesired = (spec) => {
        if (!spec || !spec.wc) return;
        const key = spec.wc + ':' + (spec.id || '');
        if (key === activeKey) return;
        if (!desired.has(key)) desired.set(key, spec);
      };
      addDesired(specForHand(activeHand === 'ranged' ? 'melee' : 'ranged'));
      addDesired(sheathed.lastOut);
      for (const [key, g] of [...sheathed.groups]) {
        if (!desired.has(key)) {
          playerBody.remove(g);
          disposeHandGroup(g);
          sheathed.groups.delete(key);
        }
      }
      for (const [key, spec] of desired) {
        if (sheathed.groups.has(key)) continue;
        const group = await loadWeaponGroup(THREE, cgiForWeapon({ id: spec.id, weaponClass: spec.wc }));
        if (cancelled || myToken !== sheathed.token || !playerBody || !group) {
          if (group) disposeHandGroup(group);
          continue;
        }
        if (sheathed.groups.has(key)) { disposeHandGroup(group); continue; }
        mountWeaponSheathed(THREE, playerBody, group, { weaponClass: spec.wc, height: hero.height });
        sheathed.groups.set(key, group);
      }
    };
    const mountHandWeapon = async () => {
      const myToken = ++handWeapon.token;
      const hero = heroRef.current;
      if (!hero || !playerBody) return;
      const hand = weaponRef.current;
      const spec = specForHand(hand);
      if (!spec) return;
      const { wc, id } = spec;
      const group = await loadWeaponGroup(THREE, cgiForWeapon({ id, weaponClass: wc }));
      if (cancelled || myToken !== handWeapon.token || !playerBody || !group) {
        if (group) disposeHandGroup(group);
        return;
      }
      if (handWeapon.group) {
        // The outgoing weapon goes on the body, not into the void.
        sheathed.lastOut = handWeapon.spec;
        playerBody.remove(handWeapon.group);
        disposeHandGroup(handWeapon.group);
      }
      mountWeaponInHand(THREE, playerBody, group, { weaponClass: wc, height: hero.height });
      handWeapon.group = group;
      handWeapon.spec = spec;
      void syncSheathe(hand, spec);
    };
    handWeaponRef.current = { swap: mountHandWeapon };
    mountHandWeapon();

    const detachers = [];
    const spawn = zone.spawn || { x: 0, z: 95, yaw: Math.PI };
    const walker = createWalker({ x: spawn.x, z: spawn.z, yaw: spawn.yaw || 0, pitch: 0 });

    // ── Horses rideable (Merlin, 2026-11-15) ────────────────
    // Mounting steps the walker onto the horse (the gap is at most
    // the 4 m prompt range — never a teleport across the pod); the
    // horse turns to face the way the rider faces and travels with
    // the walker from then on. Dismounting sets the walker beside
    // the horse, settled by the walker's own push-out, and the
    // horse waits exactly where it was left, still rideable.
    const resetHorseBody = (horse) => {
      if (!horse || !horse.group) return;
      const hb = horse.group.getObjectByName('figure-body');
      if (hb) { hb.rotation.x = 0; hb.rotation.z = 0; }
    };
    const mountHorse = (horse) => {
      if (!horse || rideRef.current || !hunter.alive) return;
      walker.pos.x = horse.x;
      walker.pos.z = horse.z;
      walker.jumpY = 0; walker.jumpV = 0; walker.grounded = true;
      prevPlayerRef.current = { x: horse.x, z: horse.z };
      horse.yaw = horseYawForWalker(walker.yaw);
      horse.group.rotation.y = horse.yaw;
      rideRef.current = { horse };
      ridePhaseRef.current = 0;
      setMounted({ id: horse.id, name: horse.name });
      setMountPrompt(null);
      mountPromptRef.current = null;
      showToast(`🐎 Mounted — ${horse.name}. Ride with the stick; strike from the saddle.`);
    };
    const dismountHorse = () => {
      const ride = rideRef.current;
      if (!ride) return;
      const horse = ride.horse;
      const spot = dismountSpot(horse);
      const settled = { x: spot.x, z: spot.z };
      resolveColliders(settled, zone.colliders);
      clampBounds(settled, zone.bounds);
      walker.pos.x = settled.x;
      walker.pos.z = settled.z;
      walker.jumpY = 0; walker.jumpV = 0; walker.grounded = true;
      prevPlayerRef.current = { x: settled.x, z: settled.z };
      resetHorseBody(horse);
      rideRef.current = null;
      setMounted(null);
      showToast(`🚶 Dismounted — ${horse.name} waits where you left it.`);
    };
    rideApiRef.current = {
      mountPrompted: () => {
        const id = mountPromptRef.current;
        if (!id) return;
        const hh = (zone.horses || []).find((x) => x.id === id);
        if (hh) mountHorse(hh);
      },
      dismount: dismountHorse,
    };

    // ── Dino companions (Merlin, 2026-11-14) ───────────────
    // Raised dinos ride the backpack: 'out' dinos from the pack
    // join the walker here, and the HUD summons/recalls through
    // dinoApiRef. The record is the truth — the zone only renders
    // it, so a dino follows its user across realms.
    const companions = companionsRef.current;
    const summonDino = async (dinoItem) => {
      const species = dinoItem && dinoItem.meta ? dinoItem.meta.species : null;
      if (!species) return;
      const dinoId = dinoIdOf(dinoItem);
      if (hasCompanion(companions, dinoId)) return;
      const handle = await spawnCompanion({
        scene, walker, groundHeight: zone.groundHeight,
        species, bornAt: dinoItem.meta.bornAt || Date.now(), dinoId,
      }).catch(() => null);
      if (!handle || cancelled) return;
      companions.push(handle);
      updateBackpack((r) => ({ ...r, items: setDinoItemState(r.items || [], dinoId, DINO_STATE_OUT, undefined, true) }));
      showToast(`🦖 ${dinoDisplayName(species)} joins you!`);
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
      showToast(`🦖 ${dinoDisplayName(species)} returns to your backpack.`);
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

    const keys = createKeyInput();
    keys.attach();
    detachers.push(() => keys.detach());

    /* Travel beats: sequential checkpoints, then the target. */
    const cps = mission && Array.isArray(mission.checkpoints) ? mission.checkpoints : [];
    const tgt = mission && !mission.hunt ? mission.target : null;
    const total = cps.length + (tgt ? 1 : 0);
    if (mission && !mission.hunt) setBeatState({ reached: 0, total });
    let reached = 0;
    const checkBeat = (x, z) => {
      if (missionDone || !mission || mission.hunt) return;
      if (reached < cps.length) {
        const cp = cps[reached];
        if (Math.hypot(x - cp.x, z - cp.z) <= (cp.r || 6)) {
          reached += 1;
          setBeatState({ reached, total });
          if (reached >= cps.length && !tgt) finishMission();
        }
        return;
      }
      if (tgt && Math.hypot(x - tgt.x, z - tgt.z) <= (tgt.r || 6)) {
        setBeatState({ reached: total, total });
        finishMission();
      }
    };

    /* Visible shots: every strike flies a real projectile record
     * (lib/weapons/cgi.js) — a revolver bullet with muzzle flash
     * and tracer when a firearm arms the ranged hand, an arrow
     * for a bow, a blast for a staff; melee draws a swing arc.
     * Cosmetic only — damage already landed (or missed) in
     * strike(); the shot never decides anything. The frame loop
     * steps the records and fades them; the effect cleanup
     * removes stragglers. */
    const shots = []; // { record, built, life }
    const arcs = []; // { built, life }
    const flashes = []; // { built, life }
    const shotOrigin = () => {
      const h = heroRef.current;
      if (!h) return null;
      const fx = -Math.sin(walker.yaw), fz = -Math.cos(walker.yaw);
      const rx = -fz, rz = fx; // right-hand side, walker facing convention
      const gy = zone.groundHeight(walker.pos.x, walker.pos.z);
      return {
        origin: [
          walker.pos.x + fx * 0.4 + rx * 0.45,
          gy + h.height * 0.85,
          walker.pos.z + fz * 0.4 + rz * 0.45,
        ],
        dir: [fx, 0, fz],
      };
    };
    const spawnShot = (firing, rangeM) => {
      const o = shotOrigin();
      if (!o || !firing) return;
      const record = spawnProjectile(firing, o.origin, o.dir, performance.now() / 1000, rangeM);
      const built = buildProjectileMesh(THREE, record);
      scene.add(built.group);
      shots.push({ record, built, life: (rangeM || firing.rangeM) / firing.speedMps + 0.1 });
      if (firing.kind === 'bullet') {
        const flash = buildMuzzleFlash(THREE, o.origin, firing.tracerColor);
        scene.add(flash.sprite);
        flashes.push({ built: flash, life: flash.life });
      }
    };
    const spawnSwing = (firing) => {
      const h = heroRef.current;
      if (!h) return;
      const built = buildSwingArc(THREE, {
        origin: [walker.pos.x, zone.groundHeight(walker.pos.x, walker.pos.z) + h.height * 0.62, walker.pos.z],
        yaw: aimYawFromWalker(walker.yaw),
        kind: firing && firing.kind === 'thrust' ? 'thrust' : 'swing',
        color: '#ffe9b0',
      });
      scene.add(built.mesh);
      arcs.push({ built, life: built.life });
    };

    /* Combat input: a tap strikes with the hand in use — on TAP
     * RELEASE, through drag-look's own onTap (quick tap, small
     * movement, short time). A press that turns into a drag is a
     * look, never a swing: the old canvas pointerdown strike fired
     * on every touch-down, so looking around attacked by accident.
     * The hero's own numbers drive the strike (characters.js
     * PLAYABLE); a ranged shot is loud — the zone hears it. */
    const onTap = () => {
      if (introRef.current || !hunter.alive || !zone) return;
      setShowStrikeHint(false);
      const h = heroRef.current;
      const aim = aimYawFromWalker(walker.yaw);
      const targets = [...zone.hunt.orcs];
      const boss = zone.hunt.boss;
      if (boss && boss.state === 'combat') targets.push(boss);
      const ranged = weaponRef.current === 'ranged';
      const spec = ranged
        ? { range: h.ranged.range, arcCos: Math.cos(0.21), cooldown: h.ranged.cooldown }
        : { range: BLADE.range, arcCos: BLADE.arcCos, cooldown: BLADE.cooldown };
      // Motion plays on any strike the hand is READY for — hit or
      // miss (a swing at air still swings; the old code only moved
      // on a hit, so whiffed blows looked frozen). Damage, range,
      // and cooldown are untouched: strike() still decides those.
      const timer = ranged ? hunter.bowT : hunter.bladeT;
      const wasReady = timer <= 0;
      const hit = strike(hunter, targets, walker.pos.x, walker.pos.z, aim, spec, ranged ? 'ranged' : 'melee');
      if (wasReady) {
        playerSwingRef.current = 0.25;
        playerSwingKindRef.current = ranged ? 'ranged' : 'melee';
        const eq = equippedRef.current;
        if (ranged) {
          // The ranged hand fires what arms it: an equipped
          // firearm shoots real bullets, a bow arrows, else the
          // hero's own bow/staff. The record flies the strike's
          // own range, so the shot lands where the hit was decided.
          spawnShot(
            rangedFiringFor({
              equippedId: eq && eq.id,
              equippedClass: eq && eq.meta && eq.meta.weaponClass,
              heroKind: h.ranged.kind,
            }),
            h.ranged.range,
          );
        } else {
          spawnSwing(meleeFiringFor({
            equippedId: eq && eq.id,
            equippedClass: eq && eq.meta && eq.meta.weaponClass,
          }));
        }
      }
      if (!hit) return;
      if (ranged) zone.hunt.noteLoud(walker.pos.x, walker.pos.z);
      // The equipped backpack weapon arms its hand when it fits:
      // its rating replaces the hero's native number, else native.
      const dmg = ranged
        ? (equippedDamageForSlot(equippedRef.current, 'ranged') ?? h.ranged.dmg)
        : (equippedDamageForSlot(equippedRef.current, 'melee') ?? h.meleeDmg);
      /* Life line (operators.js) on the strike-result toast —
       * tap is still strike, the toast only reports it. Orcs
       * and Saruman have no name label to carry it (orcs wear
       * only the hunt marker, the boss none), so the toast is
       * their surface; placed creatures carry theirs on the
       * figure tag instead (zone.js). A killing blow's line is
       * the Remains line — it rides the loot toast so the loot
       * names are never lost. A dead boss keeps the finale /
       * reward toast instead of a line. */
      const respawnS = (pod.orcs && pod.orcs.respawnS) || 45;
      if (hit.isBoss) {
        const events = damageBoss(hit, dmg);
        for (const ev of events) onBossEvent(ev);
        if (hit.state !== 'dead') {
          showToast(bossLifeFor(hit, Date.now(), { totalKills: campaignRef.current.totalKills }).line);
        }
      } else {
        const loot = damageOrc(hit, dmg, lootRngRef.current);
        alertBand(zone.hunt.orcs, hit);
        if (loot) {
          zone.hunt.noteKill(walker.pos.x, walker.pos.z);
          zone.hunt.markDead(hit);
          const rec = zone.hunt.records.find((r) => r.id === hit.recordId);
          onOrcKilled(hit, loot, orcLifeFor(hit, Date.now(), {
            deadAt: rec ? rec.deadAt : -1, respawnS,
          }).line);
        } else {
          showToast(orcLifeFor(hit, Date.now(), { respawnS }).line);
        }
      }
    };
    strikeRef.current = onTap;
    detachers.push(attachDragLook(canvas, {
      onLook: (dx, dy) => applyLook(walker, dx, dy),
      onTap: () => onTap(),
    }));
    const onKey = (e) => {
      if (e.key === '1') setWeapon('melee');
      if (e.key === '2') setWeapon('ranged');
      if (e.key === 'f' || e.key === 'F') onTap();
      /* E mounts the prompted horse / dismounts (desktop parity
       * with the Mount / Dismount buttons) */
      if (e.key === 'e' || e.key === 'E') {
        if (rideRef.current) dismountHorse();
        else if (mountPromptRef.current) {
          const hh = (zone.horses || []).find((x) => x.id === mountPromptRef.current);
          if (hh) mountHorse(hh);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    detachers.push(() => window.removeEventListener('keydown', onKey));

    respawnRef.current = () => {
      /* fallen off the horse: the horse waits where it was left,
       * still rideable — the rider wakes at the pod's edge alone */
      if (rideRef.current) {
        resetHorseBody(rideRef.current.horse);
        rideRef.current = null;
      }
      setMounted(null);
      setMountPrompt(null);
      mountPromptRef.current = null;
      walker.pos.x = spawn.x; walker.pos.z = spawn.z; walker.yaw = spawn.yaw || 0;
      reviveHunter(hunter);
      setHp(hunter.hp);
      if (zone) {
        zone.setPlayerAlive(true);
        zone.hunt.resetHunt();
        /* the meter was cut on death — carry the cut value in */
        zone.hunt.setHeat(heatOf(campaignRef.current, pod.id));
      }
      missionKillsRef.current = 0;
      if (mission && mission.hunt) setBeatState({ kills: 0, need: huntNeed });
      setFallen(false);
    };

    let raf = 0;
    let last = performance.now();
    let lastDecayReport = 0;
    // Gamepad strike state: rising-edge sets, reset when no pad is
    // attached so a held button can never fire stale on reconnect.
    let gpButtons = new Set();
    let gpPrevRt = 0;
    const frame = (now) => {
      if (cancelled) return;
      if (contextGuardRef.current && contextGuardRef.current.isLost()) { raf = requestAnimationFrame(frame); return; }
      // Gamepad: ✕/A (CONFIRM) and R2 (RT) strike, exactly like a
      // tap — rising edge only, so a held button never repeats.
      // onTap() itself guards intro/death/no-zone, so polling here
      // is safe during overlays.
      if (typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function') {
        const pad = firstConnectedPad(navigator.getGamepads());
        if (pad) {
          if (triggerRisingEdge(gpPrevRt, pad.buttons)) onTap();
          const pressed = newlyPressedButtons(gpButtons, pad.buttons);
          gpButtons = pressedButtonSet(pad.buttons);
          if (pressed.includes(GAMEPAD_BUTTONS.CONFIRM)) onTap();
          gpPrevRt = triggerValue(Array.isArray(pad.buttons) ? pad.buttons[GAMEPAD_BUTTONS.RT] : null);
        } else { gpButtons = new Set(); gpPrevRt = 0; }
      }
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const t = now / 1000;

      stepHunter(hunter, dt);
      const paused = introRef.current || beatOverlayRef.current || fallenRef.current || finaleRef.current;
      if (!paused) {
        const boss = zone.hunt.boss;
        const h = heroRef.current;
        const ride = rideRef.current;
        if (ride) {
          /* RIDING: the horse goes where the rider steers it, at
           * the gallop — sprint and jump are ignored from the
           * saddle (the gallop IS the fast speed; stacking the
           * sprint multiplier on it would pass 39 m/s). The
           * horse's own collider is left out of the step so the
           * rider is never pushed off their own horse; every
           * other collider still stops the horse dead, like any
           * solid thing. The boss's Voice slows the gallop too. */
          let rideSpeed = RIDE_SPEED_MPS;
          if (boss && boss.state === 'combat') {
            const d = Math.hypot(walker.pos.x - boss.x, walker.pos.z - boss.z);
            rideSpeed = RIDE_SPEED_MPS * bossSlowFactor(boss, d);
          }
          keys.consumeJump();
          touchRef.current.jump = false; // no jumping from the saddle
          stepWalker(walker, {
            fwd: keys.state.fwd + joyRef.current.y,
            strafe: keys.state.strafe + joyRef.current.x,
            sprint: false, jump: false,
          }, dt, {
            groundHeight: zone.groundHeight,
            colliders: zone.colliders.filter((c) => c !== ride.horse.collider),
            bounds: zone.bounds,
            snapY: true,
            speed: rideSpeed,
          });
          /* the horse travels with the rider: its facing follows
           * travel, its solid circle travels with it, and the
           * figure group rides at the walker's feet */
          ride.horse.x = walker.pos.x;
          ride.horse.z = walker.pos.z;
          ride.horse.yaw = horseYawForWalker(walker.yaw);
          ride.horse.collider.x = walker.pos.x;
          ride.horse.collider.z = walker.pos.z;
          ride.horse.group.position.set(walker.pos.x, zone.groundHeight(walker.pos.x, walker.pos.z), walker.pos.z);
          ride.horse.group.rotation.y = ride.horse.yaw;
        } else {
          let speed = 10 * (h ? h.speedMult : 1);
          if (boss && boss.state === 'combat') {
            const d = Math.hypot(walker.pos.x - boss.x, walker.pos.z - boss.z);
            speed = 10 * (h ? h.speedMult : 1) * bossSlowFactor(boss, d);
          }
          const jump = keys.consumeJump() || touchRef.current.jump;
          touchRef.current.jump = false;
          stepWalker(walker, {
            fwd: keys.state.fwd + joyRef.current.y,
            strafe: keys.state.strafe + joyRef.current.x,
            sprint: keys.state.sprint || touchRef.current.sprint, jump,
          }, dt, {
            groundHeight: zone.groundHeight,
            colliders: zone.colliders,
            bounds: zone.bounds,
            snapY: true,
            speed,
          });
        }
        /* mount prompt: the nearest horse in range, threshold
         * crossings only (the Earth 2 board-prompt pattern) — the
         * button appears before the walker is pressed against the
         * horse, and never while mounted, dead, or mid-overlay */
        if (!rideRef.current && zone.horses && zone.horses.length && hunter.alive) {
          const near = nearestHorseInRange(zone.horses, walker.pos.x, walker.pos.z);
          const nearId = near ? near.id : null;
          if (nearId !== mountPromptRef.current) {
            mountPromptRef.current = nearId;
            setMountPrompt(near ? { id: near.id, name: near.name } : null);
          }
        } else if (mountPromptRef.current) {
          mountPromptRef.current = null;
          setMountPrompt(null);
        }
      }
      /* THIRD-PERSON FOLLOW (the honest nearest thing): the
       * walker's first-person eye is replaced by a camera that
       * trails the hero's body — drag-look turns hero and camera
       * together, the house chase-cam idiom. The pose comes from
       * lib/world/follow-camera.js: pitch turns the view, it never
       * dollies the camera (the old pitch-coupled height swung the
       * framing wildly on look-drag). No collision-swept shoulder
       * cam — that is a bigger camera system, not smuggled in here. */
      const h2 = heroRef.current;
      /* mounted, the head rides a saddle-height higher — the blend
       * keeps the camera from snapping up or down on mount/dismount */
      const seatY = seatHeightRef.current * rideBlendRef.current;
      const headY = zone.groundHeight(walker.pos.x, walker.pos.z) + seatY + (h2 ? h2.height * 0.9 : 1.6);
      const cam = followCameraPose({
        x: walker.pos.x, z: walker.pos.z, yaw: walker.yaw, pitch: walker.pitch,
        headY, groundHeight: zone.groundHeight,
      });
      camera.position.set(cam.cx, cam.cy, cam.cz);
      camera.lookAt(cam.lookX, cam.lookY, cam.lookZ);
      /* the ridden horse's gallop pose, computed with the hero
       * pose below (pure math) and applied to the horse body after
       * zone.update() — the zone's figure update owns the body
       * absolutely, so the gallop is added on top of it */
      let gallopPose = null;
      if (playerFig) {
        const ride = rideRef.current;
        /* mount/dismount blend: the hero rises into the saddle
         * (and sinks back down) over MOUNT_BLEND_S, never snapping */
        const blendTarget = ride ? 1 : 0;
        const b0 = rideBlendRef.current;
        rideBlendRef.current = blendTarget > b0
          ? Math.min(1, b0 + dt / MOUNT_BLEND_S)
          : Math.max(0, b0 - dt / MOUNT_BLEND_S);
        const blend = rideBlendRef.current;
        if (ride) seatHeightRef.current = riderSeatOffsetY(ride.horse.height, h2 ? h2.height : 1.85);
        playerFig.group.position.set(walker.pos.x, zone.groundHeight(walker.pos.x, walker.pos.z) + seatHeightRef.current * blend, walker.pos.z);
        playerFig.group.rotation.y = walker.yaw + Math.PI;
        /* Hero motion (round 3, 2026-11-15 — the glide fix): the
         * hero is an unrigged GLB (one fused mesh, no separable
         * legs), so the walk is a STEP RHYTHM on the whole body —
         * two bobs per cycle, a lateral weight shift onto the
         * planted foot, roll + pelvis/shoulder counter-twist in
         * counter-phase, a small forward surge per step. Travel
         * speed comes from real feet movement per frame (a
         * teleport-sized jump reads as standing, never as a
         * sprint); the phase advances at a readable step rate
         * (heroPhaseRate — ~4.5 steps/s at the 10 m/s walk, not
         * the old 7 sway cycles/s that blurred into a glide).
         * The figure's own breathing runs in update() first;
         * this pose is ADDED on top of it, never fighting it:
         * leanX/rollZ/swayX/stepZ are set before update()
         * (it owns position.y and rotation.y only), bobY/twistY
         * are added after it. */
        const prev = prevPlayerRef.current;
        const moved = prev ? Math.hypot(walker.pos.x - prev.x, walker.pos.z - prev.z) : 0;
        prevPlayerRef.current = { x: walker.pos.x, z: walker.pos.z };
        let speed = dt > 0 ? moved / dt : 0;
        if (moved > 2) speed = 0; // respawn/teleport, not a stride
        if (speed > 0.5) walkPhaseRef.current += dt * heroPhaseRate(speed);
        if (ride && speed > 0.5) ridePhaseRef.current += dt * gallopPhaseRate(speed);
        let swingP = 0;
        if (playerSwingRef.current > 0) {
          playerSwingRef.current = Math.max(0, playerSwingRef.current - dt);
          const p = 1 - playerSwingRef.current / 0.25;
          swingP = Math.sin(p * Math.PI);
        }
        const walkPose = heroMotionPose({
          speed, phase: walkPhaseRef.current, swingP, kind: playerSwingKindRef.current,
        });
        let pose = walkPose;
        if (ride || blend > 0) {
          /* SEATED: the rider borrows the horse's own bob so the
           * two never detach, and the walk pose blends into the
           * seat pose over the mount blend. The strike still
           * swings from the saddle — the walk pose already
           * carries the swing, so the blend would thin it by the
           * blend factor; add that share back on top. */
          gallopPose = horseGallopPose({ speed: ride ? speed : 0, phase: ridePhaseRef.current });
          const seatPose = heroSeatPose({
            speed: ride ? speed : 0, phase: ridePhaseRef.current, horseBobY: gallopPose.bobY,
          });
          pose = blendPoses(walkPose, seatPose, blend);
          if (swingP > 0 && blend > 0) {
            if (playerSwingKindRef.current === 'ranged') {
              pose = { ...pose, leanX: pose.leanX + 0.2 * swingP * blend, twistY: pose.twistY + 0.15 * swingP * blend };
            } else {
              pose = { ...pose, twistY: pose.twistY + 0.55 * swingP * blend, leanX: pose.leanX - 0.35 * swingP * blend };
            }
          }
        }
        if (playerBody) {
          playerBody.rotation.x = pose.leanX;
          playerBody.rotation.z = pose.rollZ;
          playerBody.position.x = pose.swayX;
          playerBody.position.z = pose.stepZ;
        }
        playerFig.update(t, dt, 6);
        if (playerBody) {
          // update() owns position.y (breath) and rotation.y (sway)
          // absolutely — add the walk/swing pose on top of it.
          playerBody.position.y += pose.bobY;
          playerBody.rotation.y += pose.twistY;
        }
      }
      zone.setObserver(walker.pos.x, walker.pos.z);
      if (!paused) checkBeat(walker.pos.x, walker.pos.z);

      /* boss HUD: update state only when it actually changes */
      const boss = zone.hunt.boss;
      if (boss) {
        const key = boss.state + ':' + boss.hp;
        if (key !== bossHudRef.current) {
          bossHudRef.current = key;
          setBossHud(boss.state === 'dormant' ? null
            : { hp: boss.hp, maxHp: boss.maxHp, phase: bossPhase(boss.hp), state: boss.state });
        }
      }

      /* hunt HUD: the meter, throttled to whole points */
      const heatInt = Math.round(zone.hunt.heat);
      if (heatInt !== huntHudRef.current) {
        huntHudRef.current = heatInt;
        setHuntHud({ heat: heatInt, level: zone.hunt.level });
      }

      /* ranger tracking sense: nearest live orc, every ~30 frames */
      senseFrameRef.current += 1;
      if (h2 && h2.sense && senseFrameRef.current % 30 === 0) {
        let best = null, bestD = Infinity;
        for (const o of zone.hunt.orcs) {
          if (o.state === 'dead') continue;
          const d = Math.hypot(o.x - walker.pos.x, o.z - walker.pos.z);
          if (d < bestD) { best = o; bestD = d; }
        }
        if (best && bestD <= 130) {
          const dx = best.x - walker.pos.x, dz = best.z - walker.pos.z;
          const winds = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
          const idx = Math.round(((Math.atan2(dx, -dz) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8;
          setSenseHud(`🧭 Orc-sign: ${Math.round(bestD)}m ${winds[idx]}`);
        } else {
          setSenseHud('🧭 Orc-sign: nothing near');
        }
      }

      /* goal compass (travel missions only): the next checkpoint,
       * else the target — every ~15 frames, state only when the
       * reading actually changes (5° buckets, whole metres) */
      if (mission && !mission.hunt && senseFrameRef.current % 15 === 0) {
        let g = null;
        if (reached < cps.length) g = cps[reached];
        else if (tgt) g = tgt;
        if (g) {
          const dx = g.x - walker.pos.x, dz = g.z - walker.pos.z;
          const dist = Math.round(Math.hypot(dx, dz));
          const deg = goalArrowDeg(dx, dz, walker.yaw);
          const key = `${g.label || ''}|${dist}|${Math.round(deg / 5)}`;
          if (key !== goalHudRef.current) {
            goalHudRef.current = key;
            setGoalHud({ label: g.label || 'the goal', dist, deg });
          }
        } else if (goalHudRef.current !== '') {
          goalHudRef.current = '';
          setGoalHud(null);
        }
      }

      /* visible shots: step the records, fly the meshes, fade out */
      for (let i = shots.length - 1; i >= 0; i--) {
        const s = shots[i];
        s.life -= dt;
        const impacted = stepProjectile(s.record, dt);
        s.built.group.position.set(s.record.pos[0], s.record.pos[1], s.record.pos[2]);
        if (impacted || s.life <= 0) {
          scene.remove(s.built.group);
          try { s.built.dispose(); } catch (e) { /* noop */ }
          shots.splice(i, 1);
        }
      }
      for (let i = arcs.length - 1; i >= 0; i--) {
        const a = arcs[i];
        a.life -= dt;
        if (a.life <= 0) {
          scene.remove(a.built.mesh);
          try { a.built.dispose(); } catch (e) { /* noop */ }
          arcs.splice(i, 1);
          continue;
        }
        a.built.mesh.material.opacity = Math.max(0, (a.life / a.built.life) * 0.9);
      }
      for (let i = flashes.length - 1; i >= 0; i--) {
        const f = flashes[i];
        f.life -= dt;
        if (f.life <= 0) {
          scene.remove(f.built.sprite);
          try { f.built.dispose(); } catch (e) { /* noop */ }
          flashes.splice(i, 1);
          continue;
        }
        f.built.sprite.material.opacity = Math.max(0, f.life / f.built.life);
        const sc = 1.4 + (1 - f.life / f.built.life) * 0.8;
        f.built.sprite.scale.set(sc, sc, 1);
      }

      // Dino companions follow the walker (their own step).
      updateCompanions(companions, dt);
      zone.update(t, dt);
      /* GALLOP: the ridden horse's body rocks AFTER the zone's own
       * figure update (which owns body y/rotation absolutely) —
       * the same add-on-top pattern as the hero pose. Standing
       * mounted is all zeros: the horse stands, breathing only. */
      if (rideRef.current && gallopPose) {
        const hb = rideRef.current.horse.group.getObjectByName('figure-body');
        if (hb) {
          hb.position.y += gallopPose.bobY;
          hb.rotation.x = gallopPose.pitchX;
          hb.rotation.z = gallopPose.rollZ;
        }
      }
      // LINGERING DECAY (Merlin, 2026-11-15): report the walker to
      // the decay bus, throttled — the heartbeat turns movement into
      // decayed spots (while a carrier) and infection checks.
      const nowMs = performance.now();
      if (nowMs - lastDecayReport > 2500) {
        lastDecayReport = nowMs;
        reportDecayPosition('/middle-earth', walker.pos.x, walker.pos.z);
      }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      detachers.forEach((d) => { try { d(); } catch (e) { /* noop */ } });
      strikeRef.current = () => {};
      rideRef.current = null;
      rideApiRef.current = null;
      setMounted(null);
      setMountPrompt(null);
      try { if (playerFig) playerFig.dispose(); } catch (e) { /* noop */ }
      /* carry the hunt meter back to the campaign store */
      try {
        const nc = setHeat(campaignRef.current, pod.id, zone.hunt.heat);
        campaignRef.current = nc;
        saveCampaign(nc);
        setCampaign(nc);
      } catch (e) { /* noop */ }
      try { zone.dispose(); } catch (e) { /* noop */ }
      // Dino companions leave with the zone; the record keeps
      // their state, so they rejoin in the next realm.
      for (const h of companionsRef.current.splice(0)) { try { h.dispose(); } catch (e) { /* noop */ } }
      dinoApiRef.current = null;
      scene.remove(zone.group);
      for (const s of shots) {
        scene.remove(s.built.group);
        try { s.built.dispose(); } catch (e) { /* noop */ }
      }
      for (const a of arcs) {
        scene.remove(a.built.mesh);
        try { a.built.dispose(); } catch (e) { /* noop */ }
      }
      for (const f of flashes) {
        scene.remove(f.built.sprite);
        try { f.built.dispose(); } catch (e) { /* noop */ }
      }
      handWeaponRef.current = null;
      if (handWeapon.group) {
        if (playerBody) playerBody.remove(handWeapon.group);
        disposeHandGroup(handWeapon.group);
        handWeapon.group = null;
      }
      for (const g of sheathed.groups.values()) {
        if (playerBody) playerBody.remove(g);
        disposeHandGroup(g);
      }
      sheathed.groups.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, podId, entry]);

  const onJoy = useCallback((x, y) => { joyRef.current = { x, y }; }, []);
  const gate = gateProgress(campaign);
  /* reticle by the hand in use, from the backpack law's own table:
   * melee blade -> dot; bow -> chevron; wizard staff -> dot.
   * An equipped weapon lends its own reticle to the hand it arms. */
  const equippedEntry = equippedWeaponEntry(pack);
  const reticle = weapon === 'ranged'
    ? (equippedReticleForSlot(equippedEntry, 'ranged') || RETICLE_BY_CLASS[hero.ranged.kind] || 'dot')
    : (equippedReticleForSlot(equippedEntry, 'melee') || 'dot');

  /* mission state line, shared by the full card and the tucked chip:
   * kills or gates, the par clock, and the goal compass */
  const missionStateLine = activeMission && (
    <>
      {activeMission.hunt
        ? `⚔ ${beatState ? beatState.kills : 0}/${activeMission.hunt.count} orcs`
        : `Gates ${beatState ? beatState.reached : 0}/${beatState ? beatState.total : 0}`}
      {activeMission.par ? ` · ⏱ ${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')} / par ${Math.floor(activeMission.par / 60)}:${String(activeMission.par % 60).padStart(2, '0')}` : ''}
      {goalHud ? (<> · 🧭 {goalHud.label} {goalHud.dist}m <span style={{ display: 'inline-block', transform: `rotate(${goalHud.deg}deg)` }}>↑</span></>) : null}
    </>
  );
  return (
    <div style={styles.root}>
      <style>{'@keyframes meFade { from { opacity: 0; } to { opacity: 1; } } @keyframes mePulse { 0%,100% { opacity: 1; } 50% { opacity: 0.45; } }'}</style>
      <canvas ref={canvasRef} style={styles.canvas} />

      {webglFail && (
        <div style={styles.overlay}>
          <div style={styles.panel}>
            <div style={styles.panelTitle}>3D isn’t available on this device.</div>
          </div>
        </div>
      )}

      {/* ================= MENU ================= */}
      {mode === 'menu' && (
        <div style={styles.overlay}>
          <div style={styles.menuPanel}>
            <div style={styles.kicker}>A POCKET WORLD</div>
            <h1 style={styles.title}>Middle-earth</h1>
            <p style={styles.blurb}>
              Six lands to roam — the Shire to Mordor — and one errand through all of them:
              the orcs are abroad again. Hunt them. Then go to Isengard, and finish it.
            </p>
            <div style={styles.campaignStrip}>
              <span>⚔ Orcs hunted: <b>{campaign.totalKills}</b></span>
              <span>{campaign.saruman === 'dead' ? '🏆 Saruman has fallen' : gate.open ? '🗼 The way to Isengard is open' : `🗼 Saruman stirs at ${gate.total}/${gate.needed} kills`}</span>
            </div>
            <button style={{ ...styles.primaryBtn, ...neutralGraphic(), color: '#f5ecc9' }} onClick={() => setMode('map')}>View the Map</button>
          </div>
        </div>
      )}

      {/* ================= MAP ================= */}
      {mode === 'map' && (
        <div style={styles.mapWrap}>
          <div style={styles.mapHead}>
            <button style={{ ...styles.ghostBtn, ...neutralGraphic() }} onClick={() => setMode('menu')}>← Back</button>
            <div style={styles.mapTitle}>The Map of Middle-earth</div>
            <div style={{ width: 74 }} />
          </div>

          <div style={styles.campaignCard}>
            <div style={styles.campaignTitle}>⚔ The Hunt — Campaign</div>
            <div style={styles.campaignPods}>
              {DATA.POD_ORDER.map((id) => (
                <span key={id} style={styles.campaignPod}>
                  {DATA.PODS[id].name.replace(/^The /, '')}: <b>{campaign.killsByPod[id] || 0}</b> kills
                  {heatOf(campaign, id) > 0 ? ` · hunt ${heatLevel(heatOf(campaign, id))}` : ''}
                </span>
              ))}
            </div>
            <div style={styles.gateRow}>
              <span>Total kills <b>{gate.total}</b></span>
              <div style={styles.gateBarOuter}>
                <div style={{ ...styles.gateBarInner, width: `${Math.min(100, (gate.total / gate.needed) * 100)}%` }} />
              </div>
              <span>{campaign.saruman === 'dead' ? 'Saruman: FALLEN 🏆' : gate.open ? 'Saruman: the way is open' : `Saruman: ${gate.total}/${gate.needed}`}</span>
            </div>
            {campaign.saruman === 'dead' && (
              <div style={styles.campaignNote}>The campaign is complete. The lands remain open — roam them freely.</div>
            )}
          </div>

          {/* hero pick: the fellowship cast. The pick persists in
              the progress store and you PLAY AS that figure; the
              twin's NPC seat in its home pod stands empty. */}
          <div style={styles.campaignCard}>
            <div style={styles.campaignTitle}>🧝 Choose your hero</div>
            <div style={styles.heroGrid}>
              {PLAYABLE_ORDER.map((key) => {
                const h = PLAYABLE[key];
                const picked = hero.key === key;
                return (
                  <button key={key}
                    style={{ ...styles.heroBtn, ...(picked ? styles.heroBtnOn : null), ...neutralGraphic() }}
                    onClick={() => {
                      const np = DATA.setHero(progress, key);
                      DATA.saveProgress(np);
                      setProgress(np);
                    }}>
                    <span style={styles.heroName}>{h.name}{picked ? ' ✓' : ''}</span>
                    <span style={styles.heroBlurb}>{h.blurb}</span>
                    <span style={styles.heroStats}>
                      ♥ {h.maxHp} · {h.meleeLabel} {h.meleeDmg} · {h.rangedLabel} {h.ranged.dmg}/{h.ranged.range}m
                    </span>
                  </button>
                );
              })}
            </div>
            <div style={styles.heroNote}>
              Playing as <b>{hero.name}</b> — {hero.blurb} The dark lord stays in Mordor; he is not a hero pick.
            </div>
          </div>

          <div style={styles.podGrid}>
            {DATA.POD_ORDER.map((id) => {
              const d = DATA.PODS[id];
              const done = DATA.podMissionsDone(progress, id);
              const selected = selectedId === id;
              return (
                <div key={id} style={{ ...styles.podCard, ...(selected ? styles.podCardSel : null) }}>
                  <button style={{ ...styles.podCardMain, ...podGraphic(id) }} onClick={() => setSelectedId(selected ? null : id)}>
                    <span style={styles.podName}>{d.name}</span>
                    <span style={styles.podMeta}>
                      {done}/{d.missions.length} missions{progress.beatsDone[id] ? ' · ✓ first tale told' : ''}
                      {' · '}⚔ {campaign.killsByPod[id] || 0} kills
                    </span>
                  </button>
                  {selected && (
                    <div style={styles.podDetail}>
                      <div style={styles.howVisit}>How do you want to visit?</div>
                      {(d.missions || []).map((m) => {
                        const isDone = DATA.isMissionDone(progress, id, m);
                        return (
                          <button key={m.id} style={{ ...styles.missionBtn, ...podGraphic(id) }}
                            onClick={() => enterPod(id, { kind: 'mission', missionId: m.id })}>
                            <span>🎯 {m.title} {isDone ? '✓' : ''}</span>
                            <span style={styles.missionMeta}>
                              {DATA.DIFFICULTY_LABELS[m.difficulty] || ''}{m.hunt ? ` · hunt ${m.hunt.count}` : ''}{m.par ? ` · par ${Math.floor(m.par / 60)}:${String(m.par % 60).padStart(2, '0')}` : ''}
                            </span>
                          </button>
                        );
                      })}
                      <button style={{ ...styles.roamBtn, ...podGraphic(id) }} onClick={() => enterPod(id, { kind: 'roam' })}>
                        🧭 Free Roam — no objectives, progress untouched
                      </button>
                      {id === 'rohan' && (
                        <div style={styles.bossNote}>
                          {campaign.saruman === 'dead'
                            ? '🗼 Isengard stands silent. Saruman has fallen.'
                            : gate.open
                              ? '🗼 Isengard: Saruman waits at Orthanc — go and finish it.'
                              : `🗼 Isengard stirs… the finale opens at ${gate.needed} campaign kills (${gate.total} so far).`}
                        </div>
                      )}
                      {id === 'gondor' && (
                        <a href="/world-engine/weapons?patron=dwarf" style={{ ...styles.roamBtn, ...podGraphic('gondor'), display: 'block', marginTop: '0.5rem', textDecoration: 'none' }}>
                          ⚒️ The Dwarven Smith keeps a forge by the White Tree — commission a weapon
                        </a>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ================= ZONE HUD ================= */}
      {mode === 'zone' && pod && (
        <>
          {/* the top band, stacked in normal flow — header row,
              objective row, hunt row, each its own band, none on
              top of another (Nov 15 phone video: the old absolute
              stack clipped the hunt pill at the left edge and the
              mission card sat on the header). The container is
              pointer-events-none; the tappable rows opt back in. */}
          <div style={styles.hudTop}>
            <div style={styles.topBar}>
              <OrbButton accent={GOLD} size={48} onClick={() => { setMode('map'); setEntry(null); }} ariaLabel="Map">
                <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>🗺</span>
              </OrbButton>
              <div style={styles.zoneTitle}>{pod.name} · {hero.name}</div>
              <div style={styles.hpWrap}>
                <div style={styles.hpLabel}>♥ {Math.max(0, Math.round(hp))}</div>
                <div style={styles.hpOuter}><div style={{ ...styles.hpInner, width: `${Math.max(0, (hp / hero.maxHp) * 100)}%` }} /></div>
              </div>
              {/* kills chip, re-homed from the dissolved weapon bar —
                  display only, next to the HP in the top bar */}
              <span style={styles.killsChip}>⚔ {campaign.totalKills}</span>
            </div>

            {activeMission && !intro && !beatOverlay && (
              missionHudCollapsed ? (
                <OrbButton accent={GOLD} onClick={expandMissionHud} title="Tap to open the mission card"
                  ariaLabel={`${activeMission.title} · ${missionStateLine} — tap to open the mission card`}
                  style={{ pointerEvents: 'auto' }}>
                  <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>🎯</span>
                </OrbButton>
              ) : (
                <div style={{ ...styles.missionHud, cursor: 'pointer' }} onClick={() => setMissionHudCollapsed(true)} title="Tap to tuck away">
                  <div style={styles.missionHudTitle}>🎯 {activeMission.title} <span style={{ fontSize: '0.8rem' }}>▾</span></div>
                  <div style={styles.missionHudObj}>{activeMission.objective}</div>
                  <div style={styles.missionHudState}>{missionStateLine}</div>
                </div>
              )
            )}

            {entry && entry.kind === 'roam' && (
              roamCard ? (
                <div style={styles.roamCardFull}>
                  <div style={styles.roamCardTitle}>🧭 Free Roam — {pod.name}</div>
                  <div>No objectives. The hunt still counts: every orc you fell feeds the campaign.</div>
                </div>
              ) : (
                <div style={styles.roamChip}>🧭 Free Roam</div>
              )
            )}

            {/* the hunt meter: readable danger, always visible,
                in its own row below the objective — it wraps
                instead of running off the screen edge. */}
            {huntHud && (
              <div style={styles.huntChip}>
                🔥 The hunt: {huntHud.level} · {huntHud.heat}
                {senseHud ? <span style={styles.senseText}> · {senseHud}</span> : null}
              </div>
            )}

            {/* HORSES RIDEABLE (Merlin, Nov 15 ~00:57): the mount
                prompt lives here, in the top band's own flow — a
                visible plain circle orb in reach, like the
                egg-steal button, never hidden inside a collapsed
                panel and never overlapping the HUD rows above it
                or the action column. While mounted it becomes the
                Dismount orb; walking away is NOT dismount. */}
            {mountPrompt && !mounted && (
              <OrbButton accent={GOLD}
                onClick={() => { if (rideApiRef.current) rideApiRef.current.mountPrompted(); }}
                ariaLabel={`Mount ${mountPrompt.name}`}
                style={{ pointerEvents: 'auto' }}>
                <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>🐎</span>
                <OrbLabel>MOUNT</OrbLabel>
              </OrbButton>
            )}
            {mounted && (
              <OrbButton accent={GOLD}
                onClick={() => { if (rideApiRef.current) rideApiRef.current.dismount(); }}
                ariaLabel="Dismount"
                style={{ pointerEvents: 'auto' }}>
                <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>⬇</span>
                <OrbLabel>OFF</OrbLabel>
              </OrbButton>
            )}
          </div>

          {bossHud && bossHud.state !== 'ready' && (
            <div style={styles.bossBar}>
              <div style={styles.bossName}>SARUMAN THE WHITE {bossHud.phase > 1 ? `· Phase ${bossHud.phase}` : ''}</div>
              <div style={styles.bossOuter}><div style={{ ...styles.bossInner, width: `${(bossHud.hp / bossHud.maxHp) * 100}%` }} /></div>
            </div>
          )}
          {bossHud && bossHud.state === 'ready' && (
            <div style={styles.bossHint}>🗼 Saruman waits at Orthanc — approach, if you dare.</div>
          )}

          {/* reticle: blade wears the dot, the bow the chevron —
              the backpack reticle law, read from its own table */}
          {!intro && !fallen && (
            <div style={styles.reticle} aria-hidden="true">
              {reticle === 'chevron' ? <span style={styles.chevron}>⌄</span> : <span style={styles.dot}>•</span>}
            </div>
          )}

          {/* weapon orbs — free-floating, draggable, persistent
              (Merlin, Nov 16 ~02:42 — the shared orb dock,
              lib/world/orb-dock.js): the old weaponBar row is
              dissolved. Each orb shows the weapon's glyph +
              damage, the full name stays in its aria-label. Home
              slots are the row's old spots at the bottom-right,
              left of the backpack's own home: ranged nearest the
              backpack, melee left of it. The kills chip moved up
              into the top bar; the backpack keeps its own docked
              home at the row's right end. */}
          <OrbButton accent={GOLD} active={weapon === 'melee'}
            {...dock.bind('melee')}
            style={dock.styleFor('melee', { right: 'calc(0.8rem + 112px + 0.9rem)', bottom: BOTTOM_CLEAR })}
            onClick={() => setWeapon('melee')}
            ariaLabel={`${hero.meleeLabel} ${hero.meleeDmg} — tap to switch to melee`}>
            <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1 }}>{hero.meleeLabel.split(' ')[0]}</span>
            <span style={{ fontSize: 9, lineHeight: 1 }}>{hero.meleeDmg}</span>
          </OrbButton>
          <OrbButton accent={GOLD} active={weapon === 'ranged'}
            {...dock.bind('ranged')}
            style={dock.styleFor('ranged', { right: 'calc(0.8rem + 56px + 0.45rem)', bottom: BOTTOM_CLEAR })}
            onClick={() => setWeapon('ranged')}
            ariaLabel={`${hero.rangedLabel} ${hero.ranged.dmg} — tap to switch to ranged`}>
            <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1 }}>{hero.rangedLabel.split(' ')[0]}</span>
            <span style={{ fontSize: 9, lineHeight: 1 }}>{hero.ranged.dmg}</span>
          </OrbButton>
          <div style={styles.backpackHome}>
            <BackpackHud realm="middle-earth" realmLabel="Middle-earth" combatApplies docked
              onDinoSummon={(it) => { if (dinoApiRef.current) dinoApiRef.current.summon(it); }}
              onDinoRecall={(it) => { if (dinoApiRef.current) dinoApiRef.current.recall(it); }} />
          </div>

          {/* touch actions: the right-thumb column — strike, jump,
              sprint — parked mid-right, clear of the weapon orbs
              below it and the top bar above it */}
          {!intro && !fallen && (
            <div style={styles.actionCol}>
              <button style={styles.strikeBtn} onClick={() => strikeRef.current()} aria-label="Strike">
                ⚔<span style={styles.strikeLabel}>Strike</span>
              </button>
              <button style={styles.actionBtn}
                onPointerDown={() => { touchRef.current.jump = true; }}
                aria-label="Jump">
                ⤒<span style={styles.actionLabel}>Jump</span>
              </button>
              <button style={{ ...styles.actionBtn, ...(sprintHeld ? styles.actionBtnOn : null) }}
                onPointerDown={() => { touchRef.current.sprint = true; setSprintHeld(true); }}
                onPointerUp={() => { touchRef.current.sprint = false; setSprintHeld(false); }}
                onPointerLeave={() => { touchRef.current.sprint = false; setSprintHeld(false); }}
                onPointerCancel={() => { touchRef.current.sprint = false; setSprintHeld(false); }}
                aria-label="Sprint">
                »<span style={styles.actionLabel}>Sprint</span>
              </button>
            </div>
          )}

          {showStrikeHint && !intro && !fallen && (
            <div style={styles.strikeHint}>Tap the world to strike · drag to look · left stick to walk</div>
          )}

          {/* the move stick, parked bottom-left in thumb reach —
              never again bare in flow under the Map button */}
          <div style={styles.stickWrap}>
            <WalkJoystick onMove={onJoy} size={120} />
          </div>
        </>
      )}

      {/* mission intro */}
      {mode === 'zone' && intro && activeMission && (
        <div style={styles.overlay}>
          <div style={styles.panel}>
            <div style={styles.kicker}>{pod ? pod.name : ''} · {DATA.DIFFICULTY_LABELS[activeMission.difficulty] || ''}</div>
            <div style={styles.panelTitle}>{activeMission.title}</div>
            <p style={styles.blurb}>{activeMission.text}</p>
            <p style={styles.objective}>Objective: {activeMission.objective}</p>
            <button style={styles.primaryBtn} onClick={() => setIntro(false)}>Begin</button>
          </div>
        </div>
      )}

      {/* mission complete */}
      {mode === 'zone' && beatOverlay && (
        <div style={styles.overlay}>
          <div style={styles.panel}>
            <div style={styles.panelTitle}>Tale told. ✓</div>
            <p style={styles.blurb}>
              {activeMission ? activeMission.title : 'Mission'} complete
              {finishInfo && finishInfo.par
                ? ` in ${Math.floor(finishInfo.seconds / 60)}:${String(finishInfo.seconds % 60).padStart(2, '0')} (par ${Math.floor(finishInfo.par / 60)}:${String(finishInfo.par % 60).padStart(2, '0')}) — ${finishInfo.seconds <= finishInfo.par ? 'inside par. Swiftly done.' : 'the road took longer than par; the tale is no less told.'}`
                : '.'}
            </p>
            <button style={styles.primaryBtn} onClick={() => { setBeatOverlay(false); setMode('map'); setEntry(null); }}>Back to the Map</button>
            <button style={styles.ghostBtnBlock} onClick={() => setBeatOverlay(false)}>Keep roaming here</button>
          </div>
        </div>
      )}

      {/* fallen */}
      {mode === 'zone' && fallen && (
        <div style={styles.overlay}>
          <div style={styles.panel}>
            <div style={styles.panelTitle}>You have fallen</div>
            <p style={styles.blurb}>The road goes ever on — but not for the careless. You wake at the pod’s edge, whole again. Your kills and tales are kept; the orcs who felled you regroup.</p>
            <button style={styles.primaryBtn} onClick={() => respawnRef.current()}>Rise again</button>
          </div>
        </div>
      )}

      {/* finale */}
      {mode === 'zone' && finaleOverlay && (
        <div style={styles.overlay}>
          <div style={styles.panel}>
            <div style={styles.kicker}>THE CAMPAIGN</div>
            <div style={styles.panelTitle}>Saruman has fallen 🏆</div>
            <p style={styles.blurb}>Isengard is broken, and the white staff is in your backpack. The lands stay open — roam them, and tell the tale.</p>
            <button style={styles.primaryBtn} onClick={() => { setFinaleOverlay(false); setMode('map'); setEntry(null); }}>Back to the Map</button>
            <button style={styles.ghostBtnBlock} onClick={() => setFinaleOverlay(false)}>Stand in the silent vale</button>
          </div>
        </div>
      )}

      {toast && <div style={styles.toast}>{toast}</div>}
    </div>
  );
}

const styles = {
  root: { position: 'fixed', inset: 0, overflow: 'hidden', background: '#10130c', fontFamily: 'Georgia, serif', color: '#f0e6c8' },
  canvas: { position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', touchAction: 'none' },
  overlay: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(6,8,5,0.55)', padding: '1rem', zIndex: 30 },
  panel: { maxWidth: 520, width: '100%', background: 'rgba(16,20,12,0.92)', border: `1px solid ${GOLD}`, borderRadius: 16, padding: '1.4rem', textAlign: 'center', animation: 'meFade 0.4s ease' },
  menuPanel: { maxWidth: 560, width: '100%', background: 'rgba(16,20,12,0.9)', border: `1px solid ${GOLD}`, borderRadius: 18, padding: '2rem 1.6rem', textAlign: 'center', animation: 'meFade 0.5s ease' },
  kicker: { letterSpacing: '0.3em', fontSize: '0.7rem', color: GOLD, marginBottom: '0.5rem' },
  title: { fontSize: '2.6rem', margin: '0.2rem 0 0.8rem', color: '#f5ecc9' },
  panelTitle: { fontSize: '1.5rem', marginBottom: '0.6rem', color: '#f5ecc9' },
  blurb: { lineHeight: 1.55, color: '#ddd2ae', fontSize: '0.98rem' },
  objective: { color: GOLD, marginTop: '0.6rem' },
  campaignStrip: { display: 'flex', gap: '1.2rem', justifyContent: 'center', flexWrap: 'wrap', margin: '1rem 0 1.2rem', color: '#cfc49c', fontSize: '0.92rem' },
  primaryBtn: { background: GOLD, color: '#221a08', border: 'none', borderRadius: 10, padding: '0.7rem 1.5rem', fontSize: '1rem', fontFamily: 'Georgia, serif', cursor: 'pointer', marginTop: '0.6rem' },
  ghostBtn: { background: 'rgba(16,20,12,0.75)', color: '#f0e6c8', border: `1px solid ${GOLD}`, borderRadius: 8, padding: '0.4rem 0.8rem', cursor: 'pointer', fontFamily: 'Georgia, serif', flexShrink: 0, whiteSpace: 'nowrap' },
  ghostBtnBlock: { display: 'block', margin: '0.7rem auto 0', background: 'none', border: 'none', color: '#cfc49c', cursor: 'pointer', fontFamily: 'Georgia, serif', textDecoration: 'underline' },
  mapWrap: { position: 'absolute', inset: 0, overflowY: 'auto', padding: `calc(${BANNER_CLEAR}) 1rem calc(${CARD_CLEAR})`, background: 'radial-gradient(ellipse at 50% 30%, #243118 0%, #10130c 70%)', zIndex: 20 },
  mapHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', maxWidth: 880, margin: '0 auto 1rem' },
  mapTitle: { flex: '1 1 auto', minWidth: 0, textAlign: 'center', fontSize: '1.15rem', color: '#f5ecc9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  campaignCard: { maxWidth: 880, margin: '0 auto 1rem', background: 'rgba(22,28,16,0.92)', border: `1px solid ${GOLD}`, borderRadius: 14, padding: '1rem 1.2rem' },
  campaignTitle: { fontSize: '1.05rem', color: '#f5ecc9', marginBottom: '0.5rem' },
  campaignPods: { display: 'flex', flexWrap: 'wrap', gap: '0.4rem 1rem', color: '#cfc49c', fontSize: '0.9rem' },
  gateRow: { display: 'flex', alignItems: 'center', gap: '0.8rem', marginTop: '0.7rem', flexWrap: 'wrap', fontSize: '0.92rem' },
  gateBarOuter: { flex: '1 1 140px', height: 10, background: 'rgba(255,255,255,0.12)', borderRadius: 5, overflow: 'hidden' },
  gateBarInner: { height: '100%', background: GOLD, borderRadius: 5, transition: 'width 0.4s ease' },
  campaignNote: { marginTop: '0.5rem', color: GOLD, fontSize: '0.9rem' },
  heroGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.5rem', marginTop: '0.5rem' },
  heroBtn: { display: 'flex', flexDirection: 'column', gap: '0.2rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(216,178,92,0.35)', borderRadius: 10, color: '#f0e6c8', padding: '0.6rem 0.8rem', cursor: 'pointer', fontFamily: 'Georgia, serif', textAlign: 'left' },
  heroBtnOn: { border: `1px solid ${GOLD}`, background: 'rgba(216,178,92,0.14)' },
  heroName: { color: '#f5ecc9', fontSize: '0.98rem' },
  heroBlurb: { color: '#cfc49c', fontSize: '0.85rem', lineHeight: 1.4 },
  heroStats: { color: GOLD, fontSize: '0.82rem' },
  heroNote: { marginTop: '0.6rem', color: '#cfc49c', fontSize: '0.88rem' },
  podGrid: { maxWidth: 880, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '0.7rem' },
  podCard: { background: 'rgba(20,26,15,0.92)', border: '1px solid rgba(216,178,92,0.4)', borderRadius: 14, overflow: 'hidden' },
  podCardSel: { border: `1px solid ${GOLD}` },
  podCardMain: { width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', background: 'none', border: 'none', color: '#f0e6c8', padding: '0.9rem 1.1rem', cursor: 'pointer', fontFamily: 'Georgia, serif', textAlign: 'left', flexWrap: 'wrap' },
  podName: { fontSize: '1.15rem', color: '#f5ecc9' },
  podMeta: { color: '#bdb28c', fontSize: '0.88rem' },
  podDetail: { borderTop: '1px solid rgba(216,178,92,0.3)', padding: '0.8rem 1.1rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.45rem' },
  howVisit: { color: GOLD, fontSize: '0.9rem', marginBottom: '0.2rem' },
  missionBtn: { display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(216,178,92,0.35)', borderRadius: 10, color: '#f0e6c8', padding: '0.55rem 0.8rem', cursor: 'pointer', fontFamily: 'Georgia, serif', textAlign: 'left' },
  missionMeta: { color: '#bdb28c', fontSize: '0.85rem' },
  roamBtn: { background: 'rgba(216,178,92,0.14)', border: `1px solid ${GOLD}`, borderRadius: 10, color: '#f5ecc9', padding: '0.55rem 0.8rem', cursor: 'pointer', fontFamily: 'Georgia, serif', textAlign: 'left' },
  bossNote: { color: '#e8d9a8', fontSize: '0.9rem', marginTop: '0.3rem' },
  /* the top band, stacked in normal flow: one flex column, the
   * header row full-width, the objective and hunt rows centred
   * in their own bands below it. Nothing here is absolutely
   * positioned against a guessed rem offset, so no row can sit
   * on another on a narrow phone — the Nov 15 overlap fix. */
  hudTop: { position: 'absolute', top: 'max(0.6rem, env(safe-area-inset-top))', left: '0.8rem', right: '0.8rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', zIndex: 10, pointerEvents: 'none' },
  topBar: { display: 'flex', alignItems: 'center', gap: '0.6rem', width: '100%', pointerEvents: 'auto' },
  zoneTitle: { flex: '1 1 auto', minWidth: 0, fontSize: '1.05rem', color: '#f5ecc9', textShadow: '0 1px 4px rgba(0,0,0,0.7)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  hpWrap: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 },
  hpLabel: { color: '#ffb3a0', fontSize: '0.95rem', textShadow: '0 1px 3px rgba(0,0,0,0.8)' },
  hpOuter: { width: 110, height: 9, background: 'rgba(0,0,0,0.5)', borderRadius: 5, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.25)' },
  hpInner: { height: '100%', background: '#c8452c', transition: 'width 0.25s ease' },
  huntChip: { background: 'rgba(16,20,12,0.78)', border: '1px solid rgba(216,178,92,0.45)', borderRadius: 999, padding: '0.35rem 0.9rem', fontSize: '0.88rem', color: '#e8d9a8', maxWidth: '100%', textAlign: 'center', lineHeight: 1.45, pointerEvents: 'none' },
  /* mount / dismount: a gold pill in the top band's own flow —
   * pointer-events back on (the band itself is pointer-events-none) */
  mountBtn: { background: 'rgba(216,178,92,0.95)', color: '#221a08', border: `1px solid ${GOLD}`, borderRadius: 999, padding: '0.55rem 1.1rem', fontSize: '0.95rem', fontWeight: '700', fontFamily: 'Georgia, serif', cursor: 'pointer', pointerEvents: 'auto', minHeight: 44 },
  senseText: { color: '#bcd6ff' },
  roamCardFull: { maxWidth: 420, width: '100%', background: 'rgba(16,20,12,0.9)', border: `1px solid ${GOLD}`, borderRadius: 14, padding: '1rem 1.2rem', textAlign: 'center', animation: 'meFade 0.4s ease', lineHeight: 1.5 },
  roamCardTitle: { color: '#f5ecc9', marginBottom: '0.3rem', fontSize: '1.05rem' },
  roamChip: { background: 'rgba(16,20,12,0.75)', border: '1px solid rgba(216,178,92,0.5)', borderRadius: 999, padding: '0.25rem 0.8rem', fontSize: '0.85rem' },
  missionHud: { background: 'rgba(16,20,12,0.82)', border: '1px solid rgba(216,178,92,0.55)', borderRadius: 12, padding: '0.55rem 0.9rem', textAlign: 'center', maxWidth: '100%', pointerEvents: 'auto' },
  missionHudTitle: { color: '#f5ecc9', fontSize: '0.98rem' },
  missionHudObj: { color: '#cfc49c', fontSize: '0.85rem' },
  missionHudState: { color: GOLD, fontSize: '0.85rem', marginTop: '0.15rem' },
  missionChip: { background: 'rgba(16,20,12,0.82)', border: '1px solid rgba(216,178,92,0.55)', borderRadius: 12, padding: '0.45rem 0.9rem', textAlign: 'center', maxWidth: '100%', color: '#f5ecc9', fontSize: '0.88rem', fontFamily: 'Georgia, serif', cursor: 'pointer', lineHeight: 1.45, pointerEvents: 'auto' },
  bossBar: { position: 'absolute', bottom: 'max(6rem, calc(env(safe-area-inset-bottom) + 5.5rem))', left: '50%', transform: 'translateX(-50%)', width: 'min(520px, calc(100% - 2rem))', zIndex: 9, textAlign: 'center' },
  bossName: { letterSpacing: '0.22em', fontSize: '0.8rem', color: '#dfe9ff', textShadow: '0 1px 4px rgba(0,0,0,0.9)', marginBottom: '0.3rem' },
  bossOuter: { height: 12, background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(191,216,255,0.6)', borderRadius: 6, overflow: 'hidden' },
  bossInner: { height: '100%', background: 'linear-gradient(90deg, #7fa8e0, #dfe9ff)', transition: 'width 0.2s ease' },
  bossHint: { position: 'absolute', bottom: 'max(6rem, calc(env(safe-area-inset-bottom) + 5.5rem))', left: '50%', transform: 'translateX(-50%)', color: '#dfe9ff', background: 'rgba(10,12,20,0.7)', borderRadius: 999, padding: '0.3rem 0.9rem', fontSize: '0.88rem', zIndex: 9 },
  reticle: { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 8, pointerEvents: 'none', color: 'rgba(255,244,200,0.9)', textShadow: '0 0 6px rgba(0,0,0,0.8)' },
  chevron: { fontSize: '2rem', lineHeight: 1, display: 'block' },
  dot: { fontSize: '1.6rem', lineHeight: 1, display: 'block' },
  /* backpack home: the docked BackpackHud's own in-flow slot at the
   * old weapon row's right end — its own drag/persist (v2 keys),
   * untouched by the shared orb dock. */
  backpackHome: { position: 'absolute', right: '0.8rem', bottom: BOTTOM_CLEAR, zIndex: 10 },
  weaponBtn: { background: 'rgba(16,20,12,0.8)', color: '#cfc49c', border: '1px solid rgba(216,178,92,0.5)', borderRadius: 999, padding: '0.5rem 0.85rem', minHeight: 44, display: 'flex', alignItems: 'center', cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: '0.9rem', whiteSpace: 'nowrap' },
  weaponBtnOn: { background: GOLD, color: '#221a08', border: `1px solid ${GOLD}`, fontWeight: '700' },
  killsChip: { background: 'rgba(16,20,12,0.8)', border: '1px solid rgba(216,178,92,0.4)', borderRadius: 999, padding: '0.5rem 0.75rem', fontSize: '0.95rem', fontWeight: '700', color: '#e8d9a8', whiteSpace: 'nowrap' },
  /* touch controls: the stick bottom-left, the action column
   * mid-right, the hint above the stick — each its own cluster,
   * none of them on top of another control */
  stickWrap: { position: 'absolute', left: '0.8rem', bottom: BOTTOM_CLEAR, zIndex: 10 },
  actionCol: { position: 'absolute', right: '0.8rem', top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: '0.7rem', zIndex: 10, alignItems: 'center' },
  strikeBtn: { width: 68, height: 68, borderRadius: '50%', background: 'rgba(216,178,92,0.92)', color: '#221a08', border: `1px solid ${GOLD}`, fontSize: '1.4rem', cursor: 'pointer', fontFamily: 'Georgia, serif', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1 },
  strikeLabel: { fontSize: '0.6rem', marginTop: '0.1rem' },
  actionBtn: { width: 56, height: 56, borderRadius: '50%', background: 'rgba(16,20,12,0.8)', color: '#f0e6c8', border: '1px solid rgba(216,178,92,0.5)', fontSize: '1.1rem', cursor: 'pointer', fontFamily: 'Georgia, serif', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1 },
  actionBtnOn: { background: GOLD, color: '#221a08' },
  actionLabel: { fontSize: '0.55rem', marginTop: '0.1rem' },
  strikeHint: { position: 'absolute', left: '0.8rem', bottom: 'max(9.8rem, calc(env(safe-area-inset-bottom) + 9.3rem))', zIndex: 9, color: '#f5ecc9', background: 'rgba(16,20,12,0.75)', border: '1px solid rgba(216,178,92,0.5)', borderRadius: 999, padding: '0.3rem 0.8rem', fontSize: '0.82rem', pointerEvents: 'none', maxWidth: 'calc(100% - 2rem)' },
  toast: { position: 'absolute', bottom: 'max(10rem, calc(env(safe-area-inset-bottom) + 9.5rem))', left: '50%', transform: 'translateX(-50%)', background: 'rgba(16,20,12,0.92)', border: `1px solid ${GOLD}`, color: '#f5ecc9', borderRadius: 10, padding: '0.6rem 1rem', zIndex: 40, maxWidth: 'calc(100% - 2rem)', textAlign: 'center', animation: 'meFade 0.3s ease' },
};
