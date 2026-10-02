'use client';
// DUAT ARENA — state machine, match lifecycle, HUD, and toast plumbing.
//
// Owns: DuatArenaContext / DuatArenaProvider (the mutable gameRef contract),
// the wave/match director (DuatDirector, a useFrame component that runs the
// state machine with NO React state in the hot loop), and the arena HUD +
// toasts (React DOM overlays, snapshotted at ~4Hz).
//
// Sibling workers own DuatEnv (dressing + colliders + pickups), DuatEnemies
// (spawning from gameRef.waveState.spawnQueue, enemy AI, boss flagging) and
// DuatCombat (player hp/weapon/projectiles, consumes pendingPlayerHits).
// This file never touches their internals — everyone reads/writes the same
// mutable gameRef via context.
//
// Toast convention mirrors SylvaGold: window CustomEvent(DUAT_ARENA_EVENT)
// with detail { kind:'toast', text }. Arena-scoped <DuatToasts/> renders
// them standalone so no app/babel/page.jsx change is needed; the parallel
// page wiring can later hoist toast rendering to the page level.

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useFrame } from '@react-three/fiber';
import {
  loadMemory,
  recordMatch,
  rewardForMatch,
  enemyStatsForWave,
  bossStatsForWave,
  applyPlayerMemory,
  WAVE_TOTAL,
  WEAPONS,
  playersStub,
} from '@/lib/babel/duat-arena';
import { mulberry32 } from '@/lib/babel/rand';

export const DUAT_ARENA_EVENT = 'DUAT_ARENA_EVENT';
export const DUAT_ARENA_RESET_EVENT = 'duat-arena-reset';

// Pyramid trigger disc — just outside the pyramid collider (pyramid at
// (0,-45) with collider r=30; the disc at (0,-12) r=6 sits ~33 units from
// the pyramid center, clear of the wall). Walk into it in walk mode to
// start a match.
export const PYRAMID_DOOR = { x: 0, z: -12, r: 6 };

// Arena spawn point (matches the page's Duat walk spawn).
export const ARENA_SPAWN = { x: 0, z: 28, yaw: 0 };

export const DuatArenaContext = createContext(null);

export function useDuatArena() {
  return useContext(DuatArenaContext);
}

// ---------------------------------------------------------------------------
// gameRef contract
// ---------------------------------------------------------------------------

function makeInitialGameState() {
  return {
    // ---- match lifecycle (director owns) ----
    arenaActive: false,
    matchPhase: 'idle', // idle | spawning | combat | boss | intermission | victory | defeat
    wave: 0,
    waveTotal: WAVE_TOTAL,
    waveState: {
      spawnQueue: [], // { type, at, x, z, stats? } — drained by DuatEnemies
      intermissionEndsAt: 0,
      spawned: 0,
      alive: 0,
      toSpawn: 0,
    },
    boss: null, // { name, type, hp, hpMax, damage } — hp synced from the live scorpion
    bossSeen: false, // set once a scorpion enemy exists this boss phase
    bossGone: false, // set by DuatEnemies when it splices a dead boss (belt & braces)
    kingsConquered: 0,

    // ---- player (DuatCombat owns hp/weapon/kills; pos lives in inputRef) ----
    player: {
      hp: 100,
      hpMax: 100,
      weapon: 'sword',
      attackCdUntil: 0,
      iframesUntil: 0,
      kills: 0,
      dead: false,
    },

    // ---- combat/shared arrays ----
    enemies: [], // owned by DuatEnemies
    projectiles: [], // owned by DuatCombat
    pickups: [], // spawned by DuatEnv, consumed by DuatCombat/DuatEnemies
    colliders: [], // owned by DuatEnv (pyramid, obelisks)
    riverCheck: null,
    pendingPlayerHits: [], // combat consumes { damage, from } — set by DuatEnemies
    events: [], // transient log { type, detail, at }

    // ---- persistence / multiplayer ----
    best: loadMemory(), // player memory object (updated via recordMatch)
    multiplayer: playersStub(), // single-player today; peers[] for later
    lastReward: 0, // gold bars earned by the last finished match (HUD reads)

    // ---- walker handle: set by the provider every render so DuatEnv can
    // ---- read inputRef.current.pos without taking an inputRef prop ----
    inputRef: null,
  };
}

export function DuatArenaProvider({ children, inputRef }) {
  const gameRef = useRef(null);
  if (!gameRef.current) gameRef.current = makeInitialGameState();
  // ENV worker integration: DuatEnv reads the walker from
  // gameRef.current.inputRef (its props are only { gameRef, walkMode }).
  gameRef.current.inputRef = inputRef;

  useEffect(() => {
    const onReset = () => {
      if (gameRef.current) resetArena(gameRef.current, gameRef.current.inputRef);
    };
    window.addEventListener(DUAT_ARENA_RESET_EVENT, onReset);
    return () => window.removeEventListener(DUAT_ARENA_RESET_EVENT, onReset);
  }, []);

  return (
    <DuatArenaContext.Provider value={gameRef}>
      {children}
    </DuatArenaContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Helpers: toasts, events, spawns
// ---------------------------------------------------------------------------

function toastArena(text) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(DUAT_ARENA_EVENT, { detail: { kind: 'toast', text } })
  );
}

function pushEvent(g, type, detail) {
  g.events.push({ type, detail: detail || {}, at: Date.now() });
  if (g.events.length > 60) g.events.splice(0, g.events.length - 60);
}

// Deterministic spawn ring for a wave: seeded by wave number so SSR/client
// and repeat runs agree. Enemies pour in from the open sand around the
// arena bowl, kept clear of the pyramid mass and inside the walk box.
function waveSpawnPositions(wave, count) {
  const rand = mulberry32(0xd047 + wave * 101);
  const pts = [];
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2;
    const r = 55 + rand() * 35;
    let x = Math.cos(a) * r;
    let z = -20 + Math.sin(a) * r;
    if (Math.hypot(x, z + 45) < 38) x += 44 * (x >= 0 ? 1 : -1); // clear the pyramid
    x = Math.max(-120, Math.min(120, x));
    z = Math.max(-120, Math.min(120, z));
    pts.push({ x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10 });
  }
  return pts;
}

function queueWave(g, wave, now) {
  // Veteran difficulty bump: enemies get fractionally tougher as the
  // player's remembered max wave grows (applyPlayerMemory, on-ramp 1-3).
  const stats = applyPlayerMemory(enemyStatsForWave(wave), g.best);
  const pts = waveSpawnPositions(wave, stats.count);
  for (let i = 0; i < pts.length; i++) {
    g.waveState.spawnQueue.push({
      type: 'anubis',
      at: now + i * 400,
      x: pts[i].x,
      z: pts[i].z,
      stats,
    });
  }
  g.waveState.toSpawn = pts.length;
  g.waveState.spawned = 0;
}

function queueBoss(g, wave, now) {
  const stats = applyPlayerMemory(bossStatsForWave(wave), g.best);
  g.waveState.spawnQueue.push({
    type: 'scorpion',
    at: now + 800,
    x: 0,
    z: -24, // just in front of the pyramid doorway
    stats,
    boss: true,
  });
  g.boss = {
    name: 'The Scorpion King',
    type: 'scorpion',
    hp: stats.hp,
    hpMax: stats.hp,
    damage: stats.damage,
  };
  g.bossSeen = false;
  g.bossGone = false;
  g.matchPhase = 'boss';
  toastArena('The Scorpion King rises!');
  pushEvent(g, 'boss-spawn', { wave });
}

function startMatch(g, now) {
  g.arenaActive = true;
  g.wave = 1;
  g.kingsConquered = 0;
  g.lastReward = 0;
  g.player.hp = g.player.hpMax;
  g.player.dead = false;
  g.player.kills = 0;
  g.player.attackCdUntil = 0;
  g.player.iframesUntil = 0;
  g.waveState.spawnQueue.length = 0;
  g.waveState.intermissionEndsAt = 0;
  queueWave(g, 1, now);
  g.matchPhase = 'spawning';
  toastArena('The Army of Anubis rises!');
  pushEvent(g, 'match-start', { wave: 1 });
}

function victory(g) {
  const bars = rewardForMatch({ victory: true, survived: !g.player.dead });
  g.best = recordMatch(g.best, {
    victory: true,
    waveReached: g.waveTotal,
    kills: g.player.kills,
    barsEarned: bars,
  });
  g.lastReward = bars;
  g.matchPhase = 'victory';
  g.arenaActive = false;
  pushEvent(g, 'victory', { kings: g.kingsConquered, bars, kills: g.player.kills });
  toastArena(`Victory! Ten kings conquered. +${bars} gold bars.`);
}

function defeat(g) {
  g.best = recordMatch(g.best, {
    victory: false,
    waveReached: g.wave,
    kills: g.player.kills,
    barsEarned: 0,
  });
  g.lastReward = 0;
  g.matchPhase = 'defeat';
  g.arenaActive = false;
  pushEvent(g, 'defeat', { wave: g.wave, kills: g.player.kills });
  toastArena('You fell in the Duat. The sands claim another.');
}

export function resetArena(g, inputRef) {
  const keepBest = g.best;
  const keepMp = g.multiplayer;
  const fresh = makeInitialGameState();
  fresh.best = keepBest;
  fresh.multiplayer = keepMp;
  fresh.inputRef = g.inputRef || inputRef || null;
  for (const k of Object.keys(fresh)) g[k] = fresh[k];
  // Respawn the walker at the arena spawn (matches the Duat walk spawn).
  const ir = inputRef || g.inputRef;
  if (ir && ir.current) {
    ir.current.pos = { x: ARENA_SPAWN.x, z: ARENA_SPAWN.z };
    ir.current.yaw = ARENA_SPAWN.yaw;
    ir.current.pitch = 0;
  }
  pushEvent(g, 'reset', {});
}

// ---------------------------------------------------------------------------
// Director — the wave/match state machine. Runs in useFrame; mutates
// gameRef only, never calls React setState.
// ---------------------------------------------------------------------------

function directorTick(g, inputRef, walkMode, now) {
  const p = g.player;

  // idle: waiting for a walker to step into the pyramid doorway (walk only)
  if (g.matchPhase === 'idle' && !g.arenaActive) {
    if (walkMode && inputRef && inputRef.current && inputRef.current.pos) {
      const { x, z } = inputRef.current.pos;
      const d = Math.hypot(x - PYRAMID_DOOR.x, z - PYRAMID_DOOR.z);
      if (d < PYRAMID_DOOR.r) startMatch(g, now);
    }
    return;
  }
  if (!g.arenaActive) return;

  // Player death (COMBAT sets dead=true, hp=0): with living co-op peers the
  // match continues and the HUD shows a wait-queue overlay; single-player
  // (peers[] stubbed empty today) goes straight to defeat.
  if (
    p.dead &&
    g.matchPhase !== 'victory' &&
    g.matchPhase !== 'defeat'
  ) {
    const peers = (g.multiplayer && g.multiplayer.peers) || [];
    const peerAlive = peers.some((pe) => pe && !pe.dead && pe.hp > 0);
    if (!peerAlive) {
      defeat(g);
      return;
    }
    // co-op: the match continues for the living peers — fall through to the
    // phase machine so boss kills / wave clears are still detected; the HUD
    // shows the wait-queue overlay for the fallen player.
  }

  const q = g.waveState.spawnQueue;
  const aliveCount = g.enemies.reduce(
    (n, e) => n + (e && e.state !== 'dying' ? 1 : 0),
    0
  );

  switch (g.matchPhase) {
    case 'spawning':
    case 'combat': {
      if (q.length === 0 && aliveCount > 0 && g.matchPhase === 'spawning') {
        g.matchPhase = 'combat';
        break;
      }
      if (q.length === 0 && aliveCount === 0) queueBoss(g, g.wave, now);
      break;
    }
    case 'boss': {
      // Sync the HUD boss bar from the live scorpion; detect its removal.
      const scorp = g.enemies.find((e) => e && e.type === 'scorpion');
      if (scorp) {
        g.bossSeen = true;
        if (g.boss) {
          g.boss.hp = Math.max(0, scorp.hp);
          g.boss.hpMax = scorp.hpMax || g.boss.hpMax;
        }
      } else if (g.bossSeen || g.bossGone) {
        g.kingsConquered += 1;
        g.boss = null;
        g.bossSeen = false;
        g.bossGone = false;
        pushEvent(g, 'king-conquered', { wave: g.wave, kings: g.kingsConquered });
        if (g.kingsConquered >= g.waveTotal) {
          victory(g);
        } else {
          g.matchPhase = 'intermission';
          g.waveState.intermissionEndsAt = now + 4000;
          toastArena(`Wave ${g.wave} conquered!`);
        }
      }
      break;
    }
    case 'intermission': {
      if (now >= g.waveState.intermissionEndsAt) {
        g.wave += 1;
        queueWave(g, g.wave, now);
        g.matchPhase = 'spawning';
        pushEvent(g, 'wave-start', { wave: g.wave });
      }
      break;
    }
    default:
      break;
  }
}

// Exported for headless tests and sibling workers.
export {
  directorTick,
  queueWave,
  queueBoss,
  startMatch,
  victory,
  defeat,
  makeInitialGameState,
  toastArena,
};

export function DuatDirector({ gameRef, inputRef, walkMode }) {
  const walkModeRef = useRef(walkMode);
  walkModeRef.current = walkMode;
  const inputRefRef = useRef(inputRef);
  inputRefRef.current = inputRef;
  useFrame(() => {
    const g = gameRef && gameRef.current;
    if (!g) return;
    directorTick(g, inputRefRef.current, walkModeRef.current, performance.now());
  });
  return null;
}

// ---------------------------------------------------------------------------
// Toasts — arena-scoped, mirrors the Sylva toast pattern. Listens for
// DUAT_ARENA_EVENT { kind:'toast', text }; stacked pills, 3.5s dismiss.
// ---------------------------------------------------------------------------

let toastSeq = 0;

export function DuatToasts() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const onEvt = (e) => {
      const d = (e && e.detail) || {};
      if (d.kind !== 'toast' || !d.text) return;
      const id = ++toastSeq;
      setToasts((t) => [...t.slice(-2), { id, text: String(d.text) }]);
      setTimeout(() => {
        setToasts((t) => t.filter((x) => x.id !== id));
      }, 3500);
    };
    window.addEventListener(DUAT_ARENA_EVENT, onEvt);
    return () => window.removeEventListener(DUAT_ARENA_EVENT, onEvt);
  }, []);

  if (toasts.length === 0) return null;
  return (
    <div
      data-duat-toasts
      style={{
        position: 'fixed',
        left: '50%',
        transform: 'translateX(-50%)',
        bottom: '14rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        pointerEvents: 'none',
        zIndex: 60,
        width: 'min(92vw, 380px)',
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            background: 'rgba(12, 9, 4, 0.88)',
            border: '1px solid rgba(245, 185, 66, 0.55)',
            color: '#f5d98b',
            borderRadius: 999,
            padding: '8px 16px',
            fontSize: 13,
            lineHeight: 1.35,
            textAlign: 'center',
            boxShadow: '0 4px 18px rgba(0,0,0,0.45)',
          }}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// HUD — React overlay snapshotted from gameRef at ~4Hz. Never setState per
// frame. Phone-first, gold-on-dark, data-ui on every button so walk
// controls ignore them. No animated/pulsing styling (reduced-motion safe).
// ---------------------------------------------------------------------------

function snapshotHud(gameRef) {
  const g = gameRef && gameRef.current;
  if (!g) return null;
  const peers = (g.multiplayer && g.multiplayer.peers) || [];
  return {
    hp: g.player.hp,
    hpMax: g.player.hpMax,
    wave: g.wave,
    waveTotal: g.waveTotal,
    kings: g.kingsConquered,
    kills: g.player.kills,
    phase: g.matchPhase,
    weapon: g.player.weapon,
    dead: g.player.dead,
    peersAlive: peers.some((pe) => pe && !pe.dead && pe.hp > 0),
    bossName: g.boss ? g.boss.name : null,
    bossHp: g.boss ? g.boss.hp : 0,
    bossHpMax: g.boss ? g.boss.hpMax : 1,
    lastReward: g.lastReward,
    goldBars: g.best ? g.best.goldBars : 0,
  };
}

function weaponBlurb(key) {
  const w = WEAPONS[key];
  if (!w) return '';
  const kind =
    w.kind === 'melee' ? 'Melee' : w.kind === 'hitscan' ? 'Hitscan' : 'Projectile';
  const splash = w.aoe ? ` · ${w.aoe}u splash` : '';
  const arc = w.arcDeg ? ` · ${w.arcDeg}° arc` : '';
  return `${kind} · ${w.damage} dmg${arc}${splash}`;
}

const hudBar = {
  position: 'fixed',
  top: 'calc(env(safe-area-inset-top, 0px) + 10px)',
  left: '50%',
  transform: 'translateX(-50%)',
  width: 'min(94vw, 430px)',
  background: 'rgba(12, 9, 4, 0.78)',
  border: '1px solid rgba(245, 185, 66, 0.45)',
  borderRadius: 12,
  color: '#f5d98b',
  padding: '8px 12px',
  zIndex: 55,
  fontSize: 12,
  lineHeight: 1.4,
};

const hudBtn = {
  background: 'rgba(245, 185, 66, 0.14)',
  border: '1px solid rgba(245, 185, 66, 0.55)',
  color: '#f5d98b',
  borderRadius: 10,
  padding: '8px 10px',
  fontSize: 12,
  cursor: 'pointer',
};

function restartArena() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(DUAT_ARENA_RESET_EVENT));
  }
}

export function DuatHUD() {
  const gameRef = useDuatArena();
  const [snap, setSnap] = useState(() => snapshotHud(gameRef));

  useEffect(() => {
    const id = setInterval(() => setSnap(snapshotHud(gameRef)), 250);
    return () => clearInterval(id);
  }, [gameRef]);

  if (!snap) return null;

  const hpFrac = Math.max(0, Math.min(1, snap.hp / Math.max(1, snap.hpMax)));
  const showBossBar = snap.phase === 'boss' && snap.bossName;
  const bossFrac = Math.max(
    0,
    Math.min(1, snap.bossHp / Math.max(1, snap.bossHpMax))
  );
  const showWaitQueue =
    snap.dead && snap.peersAlive && snap.phase !== 'victory' && snap.phase !== 'defeat';
  const showWeaponPicker = snap.phase === 'idle';

  const setWeapon = (key) => {
    const g = gameRef && gameRef.current;
    if (g && g.matchPhase === 'idle') g.player.weapon = key;
  };

  return (
    <>
      {/* top status bar */}
      <div data-duat-hud style={hudBar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span aria-label="health" style={{ whiteSpace: 'nowrap' }}>
            ❤ {Math.ceil(snap.hp)}/{snap.hpMax}
          </span>
          <div
            style={{
              flex: 1,
              height: 8,
              borderRadius: 999,
              background: 'rgba(245, 185, 66, 0.16)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${Math.round(hpFrac * 100)}%`,
                height: '100%',
                borderRadius: 999,
                background: hpFrac > 0.35 ? '#e8a93c' : '#c0392b',
              }}
            />
          </div>
          <span style={{ whiteSpace: 'nowrap' }}>
            Wave {snap.wave > 0 ? `${snap.wave}/${snap.waveTotal}` : `–/${snap.waveTotal}`}
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: 4,
            opacity: 0.92,
          }}
        >
          <span>👑 {snap.kings} kings</span>
          <span>⚔ {snap.kills} kills</span>
          <span>🪙 {Number(snap.goldBars || 0).toFixed(1)} bars</span>
        </div>
        {showBossBar && (
          <div style={{ marginTop: 6 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: 2,
              }}
            >
              <span>{snap.bossName}</span>
              <span>
                {Math.ceil(snap.bossHp)}/{snap.bossHpMax}
              </span>
            </div>
            <div
              style={{
                height: 8,
                borderRadius: 999,
                background: 'rgba(192, 57, 43, 0.25)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${Math.round(bossFrac * 100)}%`,
                  height: '100%',
                  background: '#c0392b',
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* weapon picker — pre-match only */}
      {showWeaponPicker && (
        <div
          data-duat-hud
          style={{
            position: 'fixed',
            left: '50%',
            transform: 'translateX(-50%)',
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 7.5rem)',
            width: 'min(94vw, 430px)',
            zIndex: 55,
          }}
        >
          <div
            style={{
              background: 'rgba(12, 9, 4, 0.82)',
              border: '1px solid rgba(245, 185, 66, 0.45)',
              borderRadius: 12,
              color: '#f5d98b',
              padding: '10px 12px',
              fontSize: 12,
            }}
          >
            <div style={{ marginBottom: 8, opacity: 0.9 }}>
              Choose your weapon, then step into the pyramid doorway.
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 8,
              }}
            >
              {Object.keys(WEAPONS).map((key) => {
                const w = WEAPONS[key];
                const active = snap.weapon === key;
                return (
                  <button
                    key={key}
                    data-ui
                    type="button"
                    onClick={() => setWeapon(key)}
                    style={{
                      ...hudBtn,
                      background: active
                        ? 'rgba(245, 185, 66, 0.35)'
                        : hudBtn.background,
                      borderColor: active ? '#f5b942' : hudBtn.border,
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{w.name}</div>
                    <div style={{ opacity: 0.85, fontSize: 11 }}>
                      {weaponBlurb(key)}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* wait-queue overlay — co-op only (single-player goes to defeat) */}
      {showWaitQueue && (
        <OverlayCard>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>
            You fell.
          </div>
          <div style={{ opacity: 0.9 }}>
            Waiting for the match to end…
          </div>
        </OverlayCard>
      )}

      {/* victory overlay */}
      {snap.phase === 'victory' && (
        <OverlayCard>
          <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>
            👑 The Duat is conquered!
          </div>
          <div style={{ opacity: 0.92, marginBottom: 4 }}>
            Ten kings fallen · {snap.kills} kills
          </div>
          <div style={{ opacity: 0.92, marginBottom: 12 }}>
            +{snap.lastReward} gold bars earned
          </div>
          <button data-ui type="button" onClick={restartArena} style={hudBtn}>
            Restart
          </button>
        </OverlayCard>
      )}

      {/* defeat overlay */}
      {snap.phase === 'defeat' && (
        <OverlayCard>
          <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>
            The sands claim another.
          </div>
          <div style={{ opacity: 0.92, marginBottom: 4 }}>
            Fell on wave {snap.wave} · {snap.kills} kills · {snap.kings} kings
            conquered
          </div>
          <div style={{ opacity: 0.75, marginBottom: 12, fontSize: 11 }}>
            The fallen earn no bars — victory pays the survivors.
          </div>
          <button data-ui type="button" onClick={restartArena} style={hudBtn}>
            Restart
          </button>
        </OverlayCard>
      )}
    </>
  );
}

function OverlayCard({ children }) {
  return (
    <div
      data-duat-hud
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.55)',
        zIndex: 58,
        padding: 16,
      }}
    >
      <div
        style={{
          width: 'min(92vw, 320px)',
          background: 'rgba(12, 9, 4, 0.94)',
          border: '1px solid rgba(245, 185, 66, 0.55)',
          borderRadius: 14,
          color: '#f5d98b',
          padding: '18px 16px',
          fontSize: 13,
          lineHeight: 1.45,
          textAlign: 'center',
        }}
      >
        {children}
      </div>
    </div>
  );
}
