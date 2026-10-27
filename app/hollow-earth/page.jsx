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
// Controls live in a Concourse-style bottom bar (rounded-full
// pills, backdrop blur, safe-area insets — the hub Concourse
// language): Spawn to Base, base status, health, kills toward
// the shield, weapon toggle. No one-off floating buttons.

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { guardCanvasContext } from '../../lib/scene-context-guard.js';
import { buildWorld } from './zone';
import * as T from './textures';
import * as DATA from './data';
import { HEROES, HERO_ORDER, heroDef, buildHeroFigure } from './characters.js';
import {
  createHunterState, onMonsterKilled, applyDamage, isInBase, canTeleport,
  SAFE_BASE, PLAYER_MAX_HP, KORUS_POS, damageMonster, MONSTER_TYPES,
  monsterColliders,
} from './spawns.js';
import { RETICLE_BY_CLASS, equippedDamageForSlot, equippedReticleForSlot, equippedWeaponEntry } from '../../lib/backpack/backpack.js';
import { boltKindFor, BOLT_STYLE, BOLT_SPEED, BOLT_MAX_LIFE } from './bolt-visual.js';
import { updateBackpack, useBackpack } from '../../lib/backpack/store.js';
import BackpackHud from '@/components/backpack/BackpackHud';
import { roarToneFor, GHORRUM_LAUGH_TONE } from './behavior.js';
import { playRoarTone } from './roar-audio.js';
import { createWalker, stepWalker, applyLook, walkerCamera } from '@/lib/world/walk-controls';
import { createKeyInput, attachDragLook } from '@/lib/world/walk-input';
import { firstConnectedPad, newlyPressedButtons, pressedButtonSet, triggerRisingEdge, triggerValue, GAMEPAD_BUTTONS } from '@/lib/gamepad';
import WalkJoystick from '@/components/world/WalkJoystick';

const GOLD = '#d8b25c';
const BOTTOM_CLEAR = 'max(1.5rem, calc(env(safe-area-inset-bottom) + 1rem))';

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
  const joyRef = useRef({ x: 0, y: 0 });
  const worldRef = useRef(null);
  const walkerRef = useRef(null);
  const hunterRef = useRef(null);
  const heroFigRef = useRef(null);
  const toastTimer = useRef(null);
  const lastTeleportRef = useRef(null);
  const hazardsRef = useRef([]);
  const hazardMeshesRef = useRef([]);
  const dmgFlashTimer = useRef(null);
  const missionKillsRef = useRef(0);
  const noiseRef = useRef(null);
  const weaponRef = useRef('melee');
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
  const [progress, setProgress] = useState(readProgress);
  const [campaign, setCampaign] = useState(readCampaign);
  const campaignRef = useRef(campaign);
  campaignRef.current = campaign;
  const [heroKey, setHeroKey] = useState(() => readProgress().hero);
  const [clusterId, setClusterId] = useState(null);
  const [entry, setEntry] = useState(null); // {kind:'mission',missionId} | {kind:'roam'}
  const [hud, setHud] = useState({ hp: PLAYER_MAX_HP, shield: 0, kills: 0, inBase: false, weapon: 'melee', sense: null, bossHp: null, bossAwake: false });
  const [dmgFlash, setDmgFlash] = useState(0);
  const [bannerFailed, setBannerFailed] = useState(false); // intro banner art; procedural orbs are the fallback
  const [videoFailed, setVideoFailed] = useState(false); // intro video; falls back to the banner image, then the orbs
  const [toast, setToast] = useState('');
  const [korusDead, setKorusDead] = useState(false);

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

  const spawnToBase = useCallback(() => {
    const w = walkerRef.current;
    if (!w) return;
    if (!canTeleport(lastTeleportRef.current, Date.now())) {
      notice('🏠 The Haven call needs a moment to recharge (10 s).');
      return;
    }
    lastTeleportRef.current = Date.now();
    w.pos.x = SAFE_BASE.x;
    w.pos.z = SAFE_BASE.z;
    notice('🏠 Back to The Haven — sanctuary. No monster can touch you here.');
  }, [notice]);

  // ---- world mount ----
  useEffect(() => {
    if (mode !== 'world' || !canvasRef.current) return undefined;
    const canvas = canvasRef.current;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(DATA.WORLD.sky);
    scene.fog = new THREE.Fog(DATA.WORLD.fog, 60, 420);
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

    // Damage flash: a red vignette pulse whenever the hunter
    // actually loses HP (monster hit or hazard) — the video
    // showed deaths with no visible hit feedback at all.
    const flashDamage = () => {
      setDmgFlash(1);
      if (dmgFlashTimer.current) clearTimeout(dmgFlashTimer.current);
      dmgFlashTimer.current = setTimeout(() => setDmgFlash(0), 300);
    };

    const world = buildWorld(THREE, DATA.WORLD, T, {
      gateOpen: DATA.gateOpen(campaign),
      onPlayerHit: (dmg, from, archetype) => {
        const h = hunterRef.current;
        if (!h || h.hp <= 0) return;
        if (isInBase(walker.pos.x, walker.pos.z)) return; // sanctuary: no damage lands
        const res = applyDamage(h, dmg);
        if (res.hpLost > 0) flashDamage();
        if (res.absorbed > 0) notice(`🛡️ Shield absorbed ${res.absorbed} damage${res.shieldBroken ? ' — shield broken!' : ''}.`);
        setCampaign((c) => { const nc = DATA.setShield(c, h.shield); DATA.saveCampaign(nc); return nc; });
        if (h.hp <= 0) {
          // Death respawns at The Haven, full HP, kills + shield kept.
          walker.pos.x = SAFE_BASE.x;
          walker.pos.z = SAFE_BASE.z;
          h.hp = hero.maxHp;
          notice('💀 Slain — you wake at The Haven, whole. Your kills and shield remain.');
        }
        setHud((prev) => ({ ...prev, hp: h.hp, shield: h.shield }));
      },
      onMonsterKilled: () => {},
      onHazard: (hz) => {
        // Telegraphed hazard: a ring appears; damage lands after
        // the telegraph only if the hunter is still inside it.
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(hz.radius * 0.8, hz.radius, 24),
          new THREE.MeshBasicMaterial({ color: 0xff5544, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(hz.x, world.groundHeight(hz.x, hz.z) + 0.3, hz.z);
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

    // The hunter's own figure, third-person follow: a small
    // stand-in trailing the walker so the hero is visible.
    const heroFig = buildHeroFigure(THREE, heroKey);
    heroFigRef.current = heroFig;
    scene.add(heroFig);

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
    const weaponSpec = () => (weaponRef.current === 'melee'
      ? { dmg: equippedDamageForSlot(equippedRef.current, 'melee') ?? hero.meleeDmg, range: 2.4, arcCos: Math.cos(1.22), cooldown: 0.45 }
      : { dmg: equippedDamageForSlot(equippedRef.current, 'ranged') ?? hero.ranged.dmg, range: hero.ranged.range, arcCos: Math.cos(0.21), cooldown: 0.8 });
    let lastStrike = 0;
    /* Ranged-shot visuals: a visible bolt that flies from the
     * shooter toward the hit point on every ranged strike.
     * Cosmetic only — damage already landed in strikeHunter() /
     * damageKorus(); the bolt never decides anything. Firearms
     * throw a warm streak, bows a thin gold arrow, spells a fat
     * purple bolt (the Middle-earth staff-blast precedent). */
    const blasts = [];
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
    };
    const spawnImpact = (m, lethal) => {
      spawnImpactAt(m.x, world.groundHeight(m.x, m.z) + (m.stats?.flyHeight || 0) + (m.stats?.scaleM || 2.5) * 0.6, m.z, lethal);
    };
    const spawnSlash = () => {
      const fx = -Math.sin(walker.yaw), fz = -Math.cos(walker.yaw);
      const gy = world.groundHeight(walker.pos.x, walker.pos.z);
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(2.2, 1.2),
        new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.85, side: THREE.DoubleSide, fog: false }),
      );
      mesh.position.set(walker.pos.x + fx * 1.4, gy + hero.height * 0.7, walker.pos.z + fz * 1.4);
      mesh.lookAt(walker.pos.x, gy + hero.height * 0.7, walker.pos.z);
      scene.add(mesh);
      impacts.push({ mesh, life: 0.18, maxLife: 0.18, kind: 'slash', grow: 0 });
    };
    const spawnBolt = (endpoint) => {
      const fx = -Math.sin(walker.yaw), fz = -Math.cos(walker.yaw);
      const rx = -fz, rz = fx; // right-hand side, walker facing convention
      const gy = world.groundHeight(walker.pos.x, walker.pos.z);
      const kind = boltKindFor(equippedRef.current, hero.ranged.kind);
      const style = BOLT_STYLE[kind];
      const origin = new THREE.Vector3(
        walker.pos.x + fx * 0.4 + rx * 0.45,
        gy + hero.height * 0.85,
        walker.pos.z + fz * 0.4 + rz * 0.45,
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
      const life = Math.min(dist / BOLT_SPEED, BOLT_MAX_LIFE);
      blasts.push({ mesh, vx: dir.x * BOLT_SPEED, vy: dir.y * BOLT_SPEED, vz: dir.z * BOLT_SPEED, life, maxLife: life });
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
        spawnImpactAt(KORUS_POS.x, world.groundHeight(KORUS_POS.x, KORUS_POS.z) + 2.5, KORUS_POS.z, died);
        if (died) {
          setCampaign((c) => {
            const nc = DATA.completeKorus(c, Date.now());
            DATA.saveCampaign(nc);
            return nc;
          });
          try { updateBackpack((rec) => DATA.applyRewardToRecord(rec)); } catch { /* pack unavailable */ }
          setKorusDead(true);
          notice('👑 KORUS FALLS — Stormfang is yours. The Monsterverse remembers.');
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
          endpoint = { x: target.x, y: world.groundHeight(target.x, target.z) + (target.stats?.flyHeight || 1.1), z: target.z };
        } else if (korusInRange) {
          endpoint = { x: KORUS_POS.x, y: world.groundHeight(KORUS_POS.x, KORUS_POS.z) + 2.5, z: KORUS_POS.z };
        } else {
          const fx = -Math.sin(walker.yaw), fz = -Math.cos(walker.yaw);
          const ex = walker.pos.x + fx * spec.range, ez = walker.pos.z + fz * spec.range;
          endpoint = { x: ex, y: world.groundHeight(ex, ez) + 1.1, z: ez };
        }
        spawnBolt(endpoint);
      }
      for (const m of hits) {
        const died = damageMonster(m, spec.dmg);
        if (!died) { m.hitFlash = 1; spawnImpact(m, false); continue; }
        spawnImpact(m, true);
        const h = hunterRef.current;
        const res = onMonsterKilled(h);
        missionKillsRef.current += 1;
        if (res.shieldGranted) notice(`🛡️ SHIELD GAINED — 30 kills! It absorbs 50 damage until broken.`);
        else if (res.heal > 0) notice(`❤️ +${res.heal} health for the kill.`);
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
      stepWalker(walker, {
        fwd: keys.state.fwd + joyRef.current.y,
        strafe: keys.state.strafe + joyRef.current.x,
        sprint: keys.state.sprint,
      }, dt, {
        groundHeight: world.groundHeight,
        // Solid characters: landmarks + scatter colliders PLUS
        // every active monster and Korus, rebuilt each frame
        // (monsters move; world.colliders itself is never
        // mutated, so the zone's own data stays clean).
        colliders: [...world.colliders, ...monsterColliders(world.monsters, world.korus)],
        bounds: world.bounds,
        snapY: true,
        speed: 10 * (hero.speedMult || 1),
      });
      world.setObserver({
        x: walker.pos.x, z: walker.pos.z,
        quiet: hero.quiet || 1,
        noise: noiseRef.current,
        inBase: isInBase(walker.pos.x, walker.pos.z),
      });
      // Mid-session gate crossing: if the hunter just earned the
      // 40th kill out in the field, the throne wakes without a
      // re-entry.
      if (DATA.gateOpen(campaignRef.current) && world.korus.dormant) world.korus.dormant = false;
      world.update(dt);
      // Elemental sky: the sun/moon cycle + smoke haze retint
      // the sky and fog each frame (zone-owned colors).
      const cyc = world.cycleColors && world.cycleColors();
      if (cyc) {
        scene.background.set(cyc.sky);
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
              walker.pos.x = SAFE_BASE.x;
              walker.pos.z = SAFE_BASE.z;
              h.hp = hero.maxHp;
              notice('💀 Slain — you wake at The Haven, whole.');
            }
          }
        }
        return false;
      });
      const cam = walkerCamera(walker, { groundHeight: world.groundHeight });
      camera.position.set(cam.x, cam.y, cam.z);
      camera.rotation.set(walker.pitch, walker.yaw, 0);
      // Hero figure trails a step behind the walker.
      heroFig.position.set(
        walker.pos.x + Math.sin(walker.yaw) * 1.2,
        world.groundHeight(walker.pos.x, walker.pos.z),
        walker.pos.z + Math.cos(walker.yaw) * 1.2
      );
      heroFig.rotation.y = walker.yaw;
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
      }
      /* impact bursts + melee slash arcs: pop, fade, leave */
      for (let i = impacts.length - 1; i >= 0; i--) {
        const fx = impacts[i];
        fx.life -= dt;
        if (fx.life <= 0) {
          scene.remove(fx.mesh);
          try { fx.mesh.geometry.dispose(); fx.mesh.material.dispose(); } catch (e) { /* noop */ }
          impacts.splice(i, 1);
          continue;
        }
        const t = fx.life / fx.maxLife;
        fx.mesh.material.opacity = Math.max(0, t);
        const s = fx.kind === 'burst' ? 1 + (1 - t) * fx.grow : 0.8 + (1 - t) * 0.35;
        fx.mesh.scale.set(s, s, s);
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
      for (const fx of impacts) { try { scene.remove(fx.mesh); fx.mesh.geometry.dispose(); fx.mesh.material.dispose(); } catch (e) { /* noop */ } }
      impacts.length = 0;
      if (dmgFlashTimer.current) clearTimeout(dmgFlashTimer.current);
      renderer.dispose();
      worldRef.current = null;
      walkerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, clusterId]);

  const killsToShield = hud.shield > 0 ? 0 : (30 - (hud.kills % 30)) % 30 || 30;

  if (mode === 'menu') {
    // THE CONCOURSE ENTRY: intro + character selection first.
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg,#1a1426 0%,#3a2a1a 55%,#c2a15e 100%)', color: '#fff', padding: '2rem 1rem', fontFamily: 'Georgia, serif' }}>
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
          <h2 style={{ marginTop: '2rem' }}>Choose your hunter</h2>
          <p style={{ opacity: 0.7, fontSize: 14 }}>Tapping the Monsterverse Concourse icon opens here — pick first, then enter as that character.</p>
          <div style={{ display: 'grid', gap: 10, marginTop: '1rem', textAlign: 'left' }}>
            {HERO_ORDER.map((key) => {
              const h = HEROES[key];
              const selected = key === heroKey;
              return (
                <button key={key} type="button" onClick={() => pickHero(key)}
                  style={{ padding: '0.9rem 1rem', borderRadius: 14, border: selected ? `2px solid ${GOLD}` : '1px solid rgba(255,255,255,0.2)', background: selected ? 'rgba(216,178,92,0.18)' : 'rgba(0,0,0,0.35)', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <div style={{ fontWeight: 700 }}>{h.name} <span style={{ opacity: 0.6, fontWeight: 400 }}>· {h.realm}</span></div>
                  <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>❤️ {h.maxHp} · {h.meleeLabel} {h.meleeDmg} · {h.rangedLabel} {h.ranged.dmg} @ {h.ranged.range} m{h.sense ? ' · 🔍 Tracking sense' : ''}</div>
                  <div style={{ fontSize: 13, opacity: 0.7, marginTop: 2 }}>{h.blurb}</div>
                  {h.trait && <div style={{ fontSize: 13, color: GOLD, marginTop: 2 }}>{h.trait}</div>}
                </button>
              );
            })}
          </div>
          <button type="button" onClick={() => setMode('map')}
            style={{ marginTop: '1.5rem', padding: '0.9rem 2.2rem', borderRadius: 999, border: 'none', background: GOLD, color: '#1a1426', fontWeight: 800, fontSize: 16, cursor: 'pointer' }}>
            Enter as {hero.name} →
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'map') {
    const gp = DATA.gateProgress(campaign);
    return (
      <div style={{ minHeight: '100vh', background: '#17121f', color: '#fff', padding: '2rem 1rem', fontFamily: 'Georgia, serif' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <button type="button" onClick={() => setMode('menu')} style={{ background: 'none', border: 'none', color: GOLD, cursor: 'pointer' }}>← Hunters</button>
          <h1 style={{ color: GOLD }}>Olympian Monsterverse</h1>
          <p style={{ opacity: 0.8 }}>Entering as <b>{hero.name}</b> · ❤️ {hero.maxHp} · {hero.meleeLabel} {hero.meleeDmg}</p>
          <div style={{ border: '1px solid rgba(216,178,92,0.5)', borderRadius: 14, padding: '1rem', margin: '1rem 0', background: 'rgba(216,178,92,0.08)' }}>
            <div style={{ fontWeight: 700 }}>🏆 Campaign — {campaign.kills} kills{campaign.shield > 0 ? ` · 🛡️ Shield ${campaign.shield}` : ''}</div>
            <div style={{ marginTop: 4 }}>
              {campaign.korusDone ? '👑 Korus has fallen. The throne is silent.'
                : gp.remaining === 0 ? '👑 The gate is OPEN — Korus waits on his throne.'
                  : `👑 Korus gate: ${gp.kills}/${gp.needed} kills — ${gp.remaining} more to wake the throne.`}
            </div>
          </div>
          {DATA.CLUSTER_ORDER.map((cid) => {
            const c = DATA.CLUSTERS[cid];
            const done = DATA.clusterMissionsDone(progress, cid);
            return (
              <div key={cid} style={{ border: '1px solid rgba(255,255,255,0.15)', borderRadius: 14, padding: '1rem', marginBottom: '1rem', background: 'rgba(0,0,0,0.3)' }}>
                <div style={{ fontWeight: 700 }}>{c.name} <span style={{ opacity: 0.6 }}>· {done}/{c.missions.length} missions</span></div>
                <div style={{ opacity: 0.75, fontSize: 14 }}>{c.blurb}</div>
                {c.missions.map((m) => {
                  const isDone = DATA.isMissionDone(progress, cid, m);
                  return (
                    <div key={m.id} style={{ marginTop: 8, fontSize: 14 }}>
                      {isDone ? '✅' : '🎯'} <b>{m.title}</b> — {m.objective} <span style={{ opacity: 0.6 }}>({DATA.DIFFICULTY_LABELS[m.difficulty]}, par {m.par}s)</span>
                      {!isDone && (
                        <button type="button" onClick={() => enterCluster(cid, 'mission', m.id)} style={{ marginLeft: 8, background: GOLD, color: '#1a1426', border: 'none', borderRadius: 999, padding: '0.2rem 0.8rem', cursor: 'pointer', fontWeight: 700 }}>Hunt</button>
                      )}
                    </div>
                  );
                })}
                <button type="button" onClick={() => enterCluster(cid, 'roam')} style={{ marginTop: 10, background: 'none', color: GOLD, border: `1px solid ${GOLD}`, borderRadius: 999, padding: '0.4rem 1rem', cursor: 'pointer' }}>🧭 Free Roam — {c.name}</button>
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
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} />
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
      <div style={{ position: 'absolute', top: 'max(0.75rem, env(safe-area-inset-top))', left: '1rem', right: '1rem', display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ background: 'rgba(0,0,0,0.55)', borderRadius: 999, padding: '0.3rem 0.8rem', color: '#fff', fontSize: 14 }}>
            ❤️ {hud.hp}/{hero.maxHp}{hud.shield > 0 ? ` · 🛡️ ${hud.shield}` : ''}
          </span>
          <span style={{ background: 'rgba(0,0,0,0.55)', borderRadius: 999, padding: '0.3rem 0.8rem', color: '#fff', fontSize: 14 }}>
            ☠️ {hud.kills} kills{hud.shield <= 0 ? ` · shield in ${killsToShield}` : ''}
          </span>
          {hud.inBase && <span style={{ background: 'rgba(216,178,92,0.85)', borderRadius: 999, padding: '0.3rem 0.8rem', color: '#1a1426', fontSize: 14, fontWeight: 700 }}>🏠 The Haven — sanctuary</span>}
        </div>
        {hud.sense && (
          <div style={{ alignSelf: 'flex-start', background: 'rgba(0,0,0,0.55)', borderRadius: 999, padding: '0.3rem 0.8rem', color: '#ffe14d', fontSize: 13 }}>
            🔍 {hud.sense.type} · {hud.sense.element} · {hud.sense.dist} m
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
      {/* Concourse-style control bar */}
      <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: BOTTOM_CLEAR, display: 'flex', alignItems: 'center', gap: 6, zIndex: 10 }}>
        <div className="ui-element pointer-events-auto flex min-w-0 items-center gap-1 rounded-full border border-white/15 bg-zinc-950/55 py-1 pl-1 pr-1.5 backdrop-blur-md">
          <button type="button" onClick={spawnToBase} title="Spawn to base — return to The Haven"
            className="ui-element pointer-events-auto flex h-9 shrink-0 items-center gap-1 rounded-full bg-amber-300 px-3 text-black transition-all hover:opacity-90 active:scale-95"
            style={{ fontWeight: 800, fontSize: 13 }}>
            🏠 Base
          </button>
          <span style={{ color: '#fff', fontSize: 13, padding: '0 0.3rem' }}>
            {hud.inBase ? '🛡️ Sanctuary' : '⚔️ Wilds'}
          </span>
          <span style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.15)' }} />
          <button type="button" onClick={() => setHud((p) => { const w = p.weapon === 'melee' ? 'ranged' : 'melee'; weaponRef.current = w; return { ...p, weapon: w }; })}
            className="ui-element pointer-events-auto flex h-9 shrink-0 items-center rounded-full bg-white/10 px-3 text-white transition-all hover:bg-white/20 active:scale-95"
            style={{ fontSize: 13 }}>
            {hud.weapon === 'melee'
              ? (equippedDamageForSlot(equippedEntry, 'melee') != null && equippedEntry
                ? `🎒 ${equippedEntry.name} ${equippedDamageForSlot(equippedEntry, 'melee')}`
                : `${hero.meleeLabel} ${hero.meleeDmg}`)
              : (equippedDamageForSlot(equippedEntry, 'ranged') != null && equippedEntry
                ? `🎒 ${equippedEntry.name} ${equippedDamageForSlot(equippedEntry, 'ranged')}`
                : `${hero.rangedLabel} ${hero.ranged.dmg}`)}
          </button>
          <button type="button" onClick={() => worldRef.current && worldRef.current.attack && worldRef.current.attack()}
            className="ui-element pointer-events-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-400 text-black transition-all hover:opacity-90 active:scale-95"
            title="Strike" style={{ fontSize: 16 }}>⚔️</button>
          <button type="button" onClick={() => setMode('map')}
            className="ui-element pointer-events-auto flex h-9 shrink-0 items-center rounded-full bg-white/10 px-3 text-white transition-all hover:bg-white/20 active:scale-95"
            style={{ fontSize: 13 }}>🗺️ Map</button>
          <BackpackHud realm="hollow-earth" realmLabel="the Monsterverse" combatApplies />
        </div>
        <div style={{ position: 'absolute', bottom: '4.5rem', left: '0.75rem' }}>
          <WalkJoystick size={118} onMove={(x, y) => { joyRef.current.x = x; joyRef.current.y = y; }} />
        </div>
      </div>
    </div>
  );
}
