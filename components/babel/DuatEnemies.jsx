'use client';
import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mulberry32 } from '@/lib/babel/rand';
import { prefersReducedMotion } from '@/lib/babel/walk';
import { pushOutOfCircles } from '@/lib/babel/arena-collide';
import { enemyStatsForWave, bossStatsForWave } from '@/lib/babel/duat-arena';

// ---------------------------------------------------------------------------
// DuatEnemies — the Duat arena enemy layer (models + AI steering).
//
// Reads/writes the shared mutable gameRef (see DuatArenaContext contract).
// This component OWNS: gameRef.enemies entries' pos/y/yaw/state/stateT,
// spawn-queue draining, death animation + corpse removal, and the boss HUD
// mirror (gameRef.boss). It NEVER touches player HP — damage to the player
// goes through gameRef.pendingPlayerHits for the COMBAT worker to consume.
// Kill credit also belongs to COMBAT; we only emit an `enemyDown` event.
//
// Props: { gameRef, inputRef, walkMode } — gameRef is the mutable ref object,
// inputRef is the page-owned walker ref (we only read .current.pos).
// ---------------------------------------------------------------------------

export const DUAT_ARENA_EVENT = 'DUAT_ARENA_EVENT';

const TOAST = (text) => {
  try {
    window.dispatchEvent(
      new CustomEvent(DUAT_ARENA_EVENT, { detail: { kind: 'toast', text } })
    );
  } catch (_) {
    /* non-browser / early mount: toasts are best-effort */
  }
};

const MAX_ALIVE = 8; // phone-first cap: extra spawns wait in the spawnQueue
const SPAWN_PHASES = ['spawning', 'combat', 'boss'];
const SEED_SALT = 0xd041;
const PYRAMID = { x: 0, z: -45 }; // spawn ring is centred on the pyramid
const ATTACK_DUR = 0.5; // seconds: lunge out, hit check at 0.25s, recover
const DIE_DUR = 0.9; // seconds: sink into the sand + fade

// ---------------------------------------------------------------------------
// Spawn
// ---------------------------------------------------------------------------

function spawnEnemy(g, entry, playerPos, reduced, setRoster) {
  const type = entry && entry.type === 'scorpion' ? 'scorpion' : 'anubis';
  const isBoss = type === 'scorpion';
  const wave = typeof g.wave === 'number' && g.wave > 0 ? g.wave : 1;
  // Prefer the per-entry stats attached by the director (they already include
  // the applyPlayerMemory veteran bump); fall back to computing from the wave.
  const entryStats =
    entry && entry.stats && typeof entry.stats === 'object' ? entry.stats : null;
  const raw = entryStats || (isBoss ? bossStatsForWave(wave) : enemyStatsForWave(wave));
  // Defensive: if the stats lib isn't staged yet, fall back to sane values
  // so the frame loop never crashes. Real stats win whenever present.
  const s = raw && typeof raw === 'object' ? raw : {};
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);

  const id = typeof g.nextEnemyId === 'number' ? g.nextEnemyId : 1;
  g.nextEnemyId = id + 1;

  // Spawn position: prefer the director's explicit x/z (boss doorway spot,
  // precomputed wave spread); fall back to a deterministic pyramid ring.
  const hasXZ =
    entry &&
    typeof entry.x === 'number' &&
    isFinite(entry.x) &&
    typeof entry.z === 'number' &&
    isFinite(entry.z);
  // Deterministic per-enemy seed; spawn point on a ring around the pyramid.
  const seed = (mulberry32(SEED_SALT + id)() * 0xffffffff) >>> 0;
  const rng = mulberry32(seed);
  const ang = rng() * Math.PI * 2;
  const rad = 34 + rng() * 6; // 34..40: just outside the pyramid collider (r=30)
  const x = hasXZ ? entry.x : PYRAMID.x + Math.cos(ang) * rad;
  const z = hasXZ ? entry.z : PYRAMID.z + Math.sin(ang) * rad;

  const px = playerPos && typeof playerPos.x === 'number' ? playerPos.x : 0;
  const pz = playerPos && typeof playerPos.z === 'number' ? playerPos.z : 28;
  const yaw = Math.atan2(-(px - x), -(pz - z)); // face the player (fwd = -sin/-cos)

  const riseFrom = isBoss ? -3.5 : -2.2;
  const e = {
    id,
    type,
    pos: { x, z },
    y: riseFrom, // rise animation offset; 0 = standing on the sand
    yaw,
    hp: num(s.hp, isBoss ? 600 : 30),
    hpMax: num(s.hp, isBoss ? 600 : 30),
    speed: num(s.speed, isBoss ? 2.5 : 4.5),
    damage: num(s.damage, isBoss ? 25 : 10),
    attackRange: num(s.attackRange, isBoss ? 4 : 1.6),
    attackCd: num(s.attackCd, 1200), // cooldown DURATION (ms) between attacks
    attackCdUntil: 0, // performance.now() timestamp: next attack allowed after this
    state: 'rising',
    stateT: 0,
    seed,
    // internal animation helpers (not part of the shared contract, but harmless)
    riseFrom,
    riseDur: isBoss ? 2.0 : 1.4,
    hitDone: false,
    lunge: 0, // 0..1 attack lunge curve, applied along facing dir
    fade: reduced ? 0 : 1, // material opacity; reduced-motion fades in instead of rising
    puff: 0, // 0..1 sand-puff progress during rise (skipped under reduced motion)
  };
  g.enemies.push(e);
  setRoster((r) => (r.some((x) => x.id === id) ? r : [...r, { id, type, enemy: e }]));

  if (isBoss) {
    // HUD mirror — merge onto the director's boss descriptor (the ARENA
    // worker owns it and clears it on boss death); never overwrite it, and
    // don't toast here — the director already announced the boss.
    g.boss = { ...(g.boss || {}), id, hp: num(s.hp, 600), hpMax: num(s.hp, 600) };
  }
}

// ---------------------------------------------------------------------------
// AI steps (pure-ish: mutate the enemy object, no React)
// ---------------------------------------------------------------------------

function stepRising(e, reduced) {
  const t = Math.min(1, e.stateT / e.riseDur);
  if (reduced) {
    // No overshoot, no sand puff: straight rise + fade in.
    e.y = e.riseFrom + (0 - e.riseFrom) * t;
    e.fade = t;
  } else {
    // easeOutBack: rises from the sand with a slight overshoot past y=0.
    const c = 1.3;
    const u = t - 1;
    const k = 1 + (c + 1) * u * u * u + c * u * u;
    e.y = e.riseFrom * (1 - k);
    e.puff = Math.min(1, e.stateT / 0.9);
  }
  if (t >= 1) {
    e.state = 'chase';
    e.stateT = 0;
    e.y = 0;
    e.fade = 1;
  }
}

function stepChase(g, e, dt, now, pp) {
  const dx = pp.x - e.pos.x;
  const dz = pp.z - e.pos.z;
  const dist = Math.hypot(dx, dz);

  // Steer yaw toward the player (smooth turn, ~8 rad/s approach).
  const targetYaw = Math.atan2(-dx, -dz);
  let d = targetYaw - e.yaw;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  e.yaw += d * Math.min(1, 8 * dt);

  // Move forward at enemy speed.
  const fx = -Math.sin(e.yaw);
  const fz = -Math.cos(e.yaw);
  e.pos.x += fx * e.speed * dt;
  e.pos.z += fz * e.speed * dt;

  // Separation: push away from other live enemies within 1.2 units.
  // O(n^2) at n<=8 is fine.
  for (const o of g.enemies) {
    if (o === e || o.state === 'dying') continue;
    const sx = e.pos.x - o.pos.x;
    const sz = e.pos.z - o.pos.z;
    const sd = Math.hypot(sx, sz);
    if (sd > 0.0001 && sd < 1.2) {
      const push = ((1.2 - sd) * 0.5) * Math.min(1, 10 * dt);
      e.pos.x += (sx / sd) * push;
      e.pos.z += (sz / sd) * push;
    }
  }

  // Solid geometry: never pass through colliders (push-out slides around them).
  if (g.colliders && g.colliders.length) {
    try {
      const c = pushOutOfCircles(e.pos, g.colliders);
      e.pos.x = c.x;
      e.pos.z = c.z;
    } catch (_) {
      /* collide helper missing/misbehaving: keep last good pos */
    }
  }

  // River: enemies use the same riverCheck as the walker (bridges crossable).
  if (typeof g.riverCheck === 'function') {
    try {
      const r = g.riverCheck(e.pos);
      if (r && typeof r.x === 'number' && typeof r.z === 'number') {
        e.pos.x = r.x;
        e.pos.z = r.z;
      }
    } catch (_) {
      /* riverCheck contract unknown: ignore unusable results */
    }
  }

  // Enter melee range -> attack (gated by cooldown).
  if (dist < e.attackRange && now >= (e.attackCdUntil || 0)) {
    e.state = 'attack';
    e.stateT = 0;
    e.hitDone = false;
  }
}

function stepAttack(g, e, now, pp) {
  const t = Math.min(1, e.stateT / ATTACK_DUR);
  e.lunge = Math.sin(t * Math.PI); // quick jab out and back

  if (!e.hitDone && e.stateT >= 0.25) {
    e.hitDone = true;
    const dx = pp.x - e.pos.x;
    const dz = pp.z - e.pos.z;
    if (Math.hypot(dx, dz) < e.attackRange + 0.5) {
      // COMBAT worker owns player HP/iframes and consumes this array.
      if (!Array.isArray(g.pendingPlayerHits)) g.pendingPlayerHits = [];
      g.pendingPlayerHits.push({ damage: e.damage, at: performance.now() });
    }
  }

  if (e.stateT >= ATTACK_DUR) {
    e.state = 'chase';
    e.stateT = 0;
    e.lunge = 0;
    e.attackCdUntil = now + (typeof e.attackCd === 'number' ? e.attackCd : 1000);
  }
}

function startDying(g, e) {
  e.state = 'dying';
  e.stateT = 0;
  e.lunge = 0;
  e.dieFromY = e.y;
  // No kill credit here — COMBAT owns that. Emit the event for HUD/score.
  if (Array.isArray(g.events)) {
    try {
      g.events.push({ type: 'enemy-down', detail: { enemyType: e.type }, at: Date.now() });
    } catch (_) {
      /* events drain is best-effort */
    }
  }
}

// Returns true when the death animation is finished and the corpse can go.
function stepDying(e) {
  const t = Math.min(1, e.stateT / DIE_DUR);
  const from = typeof e.dieFromY === 'number' ? e.dieFromY : 0;
  e.y = from + (-2 - from) * t; // sink back into the sand
  e.fade = 1 - t;
  return t >= 1;
}

// ---------------------------------------------------------------------------
// Materials (cheap, flat, no shadows — phone-first)
// ---------------------------------------------------------------------------

function makeMats() {
  const std = (color, roughness, metalness, extra) =>
    new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness,
      transparent: true, // needed for rise fade-in + death fade-out
      ...(extra || {}),
    });
  const bronze = std(0x6b4a1f, 0.65, 0.35);
  const darkBronze = std(0x3a2410, 0.7, 0.3);
  const gold = std(0xc9a227, 0.4, 0.6);
  const chitin = std(0x17120e, 0.55, 0.25);
  const amber = std(0x201408, 0.4, 0.1, {
    emissive: new THREE.Color(0xffa726),
    emissiveIntensity: 2.0,
  });
  return { list: [bronze, darkBronze, gold, chitin, amber], bronze, darkBronze, gold, chitin, amber };
}

// ---------------------------------------------------------------------------
// Models (primitive-built, stylized — no photorealism)
// ---------------------------------------------------------------------------

function AnubisGeometry({ mats, armR }) {
  const { bronze, darkBronze, gold, amber } = mats;
  return (
    <group>
      {/* legs */}
      {[-0.14, 0.14].map((lx) => (
        <mesh key={lx} position={[lx, 0.35, 0]} material={darkBronze}>
          <cylinderGeometry args={[0.09, 0.11, 0.7, 6]} />
        </mesh>
      ))}
      {/* kilt */}
      <mesh position={[0, 0.88, 0]} material={gold}>
        <cylinderGeometry args={[0.3, 0.48, 0.42, 8]} />
      </mesh>
      {/* torso */}
      <mesh position={[0, 1.42, 0]} material={bronze}>
        <boxGeometry args={[0.55, 0.72, 0.34]} />
      </mesh>
      {/* belt */}
      <mesh position={[0, 1.08, 0]} material={gold}>
        <boxGeometry args={[0.57, 0.1, 0.36]} />
      </mesh>
      {/* left arm */}
      <mesh position={[-0.38, 1.35, 0]} rotation={[0, 0, 0.15]} material={darkBronze}>
        <cylinderGeometry args={[0.07, 0.08, 0.62, 6]} />
      </mesh>
      {/* right arm (pivot at shoulder) + khopesh blade */}
      <group ref={armR} position={[0.38, 1.62, 0]}>
        <mesh position={[0, -0.3, 0]} material={darkBronze}>
          <cylinderGeometry args={[0.07, 0.08, 0.6, 6]} />
        </mesh>
        <group position={[0, -0.62, -0.06]}>
          {/* khopesh-ish curved blade: flattened torus segment */}
          <mesh rotation={[0.35, 0, -1.15]} scale={[1, 1, 0.45]} material={gold}>
            <torusGeometry args={[0.34, 0.055, 8, 14, 2.0]} />
          </mesh>
          {/* grip */}
          <mesh position={[0, -0.02, 0.02]} material={darkBronze}>
            <cylinderGeometry args={[0.045, 0.045, 0.22, 6]} />
          </mesh>
        </group>
      </group>
      {/* jackal head: dark box skull + tapered snout + tall cone ears */}
      <mesh position={[0, 1.98, 0]} material={darkBronze}>
        <boxGeometry args={[0.3, 0.34, 0.3]} />
      </mesh>
      <mesh position={[0, 1.92, -0.32]} rotation={[Math.PI / 2, 0, Math.PI / 4]} material={darkBronze}>
        <cylinderGeometry args={[0.07, 0.13, 0.45, 4]} />
      </mesh>
      {[-0.13, 0.13].map((ex) => (
        <mesh
          key={ex}
          position={[ex, 2.32, 0.02]}
          rotation={[0, 0, ex > 0 ? -0.18 : 0.18]}
          material={darkBronze}
        >
          <coneGeometry args={[0.07, 0.4, 6]} />
        </mesh>
      ))}
      {/* eyes */}
      {[-0.08, 0.08].map((ex) => (
        <mesh key={ex} position={[ex, 2.0, -0.16]} material={amber}>
          <sphereGeometry args={[0.035, 8, 8]} />
        </mesh>
      ))}
    </group>
  );
}

function ScorpionGeometry({ mats, legGroups }) {
  const { chitin, amber, gold } = mats;
  let legIdx = 0;
  return (
    <group>
      {/* body: flattened sphere, ~6 units long overall */}
      <mesh position={[0, 0.85, 0]} scale={[1.05, 0.55, 2.1]} material={chitin}>
        <sphereGeometry args={[1, 20, 14]} />
      </mesh>
      {/* head plate */}
      <mesh position={[0, 0.8, -2.1]} scale={[1.2, 0.6, 1]} material={chitin}>
        <sphereGeometry args={[0.55, 14, 10]} />
      </mesh>
      {/* glowing amber eyes */}
      {[-0.28, 0.28].map((ex) => (
        <mesh key={ex} position={[ex, 1.05, -2.45]} material={amber}>
          <sphereGeometry args={[0.09, 8, 8]} />
        </mesh>
      ))}
      {/* segmented tail curving up */}
      {[
        { r: 0.5, p: [0, 1.1, 2.2] },
        { r: 0.44, p: [0, 1.5, 2.75] },
        { r: 0.38, p: [0, 2.0, 3.15] },
        { r: 0.32, p: [0, 2.5, 3.4] },
      ].map((seg, i) => (
        <mesh key={i} position={seg.p} material={chitin}>
          <sphereGeometry args={[seg.r, 12, 10]} />
        </mesh>
      ))}
      {/* stinger */}
      <mesh position={[0, 2.78, 3.28]} rotation={[-2.6, 0, 0]} material={gold}>
        <coneGeometry args={[0.16, 0.55, 8]} />
      </mesh>
      {/* 6 legs: 3 per side, scuttle-animated via group refs */}
      {[-1.3, 0, 1.3].map((lz) =>
        [-1, 1].map((side) => {
          const idx = legIdx++;
          return (
            <group
              key={`${lz}:${side}`}
              position={[side * 0.95, 0.95, lz]}
              ref={(el) => {
                legGroups.current[idx] = el;
              }}
            >
              <mesh position={[side * 0.25, -0.45, 0]} rotation={[0, 0, side * 0.5]} material={chitin}>
                <cylinderGeometry args={[0.1, 0.13, 1.2, 6]} />
              </mesh>
            </group>
          );
        })
      )}
      {/* claw arms + claws */}
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh
            position={[side * 1.05, 0.7, -2.1]}
            rotation={[-0.5, 0, side * 0.9]}
            material={chitin}
          >
            <cylinderGeometry args={[0.14, 0.17, 1.4, 6]} />
          </mesh>
          <mesh position={[side * 1.55, 0.55, -2.7]} scale={[1, 0.8, 1.25]} material={chitin}>
            <sphereGeometry args={[0.42, 12, 10]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// EnemyModel — renders one enemy; transforms driven imperatively from the
// mutable enemy object (no React re-render in the hot loop).
// ---------------------------------------------------------------------------

function EnemyModel({ enemy, reducedRef }) {
  const group = useRef();
  const rings = useRef([null, null, null]);
  const legGroups = useRef([]);
  const armR = useRef();
  const mats = useMemo(() => makeMats(), []);

  useFrame(({ clock }) => {
    const gr = group.current;
    if (!gr) return;
    const e = enemy;
    const reduced = reducedRef.current === true;

    // Lunge offset along facing direction (attack jab).
    const fx = -Math.sin(e.yaw);
    const fz = -Math.cos(e.yaw);
    const l = e.lunge || 0;
    gr.position.set(e.pos.x + fx * l * 0.5, e.y, e.pos.z + fz * l * 0.5);
    gr.rotation.y = e.yaw;

    // Fade (rise-in under reduced motion, sink-out on death).
    const fade = e.fade == null ? 1 : e.fade;
    for (const m of mats.list) m.opacity = fade;

    // Sand puff: 3 expanding fading rings at the base (skipped if reduced).
    const showPuff = !reduced && e.state === 'rising';
    for (let i = 0; i < 3; i++) {
      const r = rings.current[i];
      if (!r) continue;
      r.visible = showPuff;
      if (!showPuff) continue;
      const pt = Math.min(1, Math.max(0, (e.puff || 0) * 3 - i));
      const s = 0.5 + pt * (e.type === 'scorpion' ? 5 : 3);
      r.scale.set(s, s, s);
      r.material.opacity = 0.5 * (1 - pt);
    }

    // Anubis: swing the khopesh arm with the lunge.
    if (armR.current) armR.current.rotation.x = -0.3 - l * 1.4;

    // Scorpion: scuttle the legs while chasing (static if reduced motion).
    const scuttle = !reduced && e.state === 'chase';
    const t = clock.elapsedTime;
    for (let i = 0; i < legGroups.current.length; i++) {
      const lg = legGroups.current[i];
      if (lg) lg.rotation.x = scuttle ? Math.sin(t * 9 + i * 1.9) * 0.3 : 0;
    }
  });

  return (
    <group ref={group}>
      {enemy.type === 'scorpion' ? (
        <ScorpionGeometry mats={mats} legGroups={legGroups} />
      ) : (
        <AnubisGeometry mats={mats} armR={armR} />
      )}
      {/* sand-puff rings */}
      {[0, 1, 2].map((i) => (
        <mesh
          key={i}
          position={[0, 0.06, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          visible={false}
          ref={(el) => {
            rings.current[i] = el;
          }}
        >
          <torusGeometry args={[1, 0.09, 8, 28]} />
          <meshBasicMaterial color={0xd8a95c} transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// DuatEnemies — spawner + AI loop
// ---------------------------------------------------------------------------

export default function DuatEnemies({ gameRef, inputRef, walkMode }) {
  // Roster is React state ONLY for mount/unmount (spawn/die are discrete).
  // Per-frame transforms are written imperatively into each EnemyModel.
  const [roster, setRoster] = useState([]);
  const reduced = useRef(null);

  useFrame((_, dtRaw) => {
    const g = gameRef && gameRef.current;
    if (!g || !Array.isArray(g.enemies)) return;
    if (reduced.current === null) reduced.current = prefersReducedMotion();
    if (!g.arenaActive) return; // frozen outside walk mode on duat

    const now = performance.now();
    const dt = Math.min(Math.max(dtRaw || 0, 0), 0.05);
    const red = reduced.current === true;

    const ipos = inputRef && inputRef.current && inputRef.current.pos;
    const pp = {
      x: ipos && typeof ipos.x === 'number' ? ipos.x : 0,
      z: ipos && typeof ipos.z === 'number' ? ipos.z : 28,
    };

    // ---- Spawn consumption: shift entries whose absolute `at` timestamp
    // (performance.now()-based, set by the director) has passed; cap 8 alive.
    if (
      g.waveState &&
      Array.isArray(g.waveState.spawnQueue) &&
      SPAWN_PHASES.includes(g.matchPhase)
    ) {
      let alive = 0;
      for (const e of g.enemies) if (e.state !== 'dying') alive++;
      const q = g.waveState.spawnQueue;
      while (q.length > 0 && alive < MAX_ALIVE) {
        const entry = q[0];
        const at = entry && typeof entry.at === 'number' ? entry.at : 0;
        if (at > now) break; // not due yet — and queue is time-ordered
        q.shift();
        spawnEnemy(g, entry, pp, red, setRoster);
        alive++;
      }
    }

    // ---- AI (iterate backwards: dying corpses splice out mid-loop).
    for (let i = g.enemies.length - 1; i >= 0; i--) {
      const e = g.enemies[i];
      if (!e || !e.pos) continue;
      e.stateT = (e.stateT || 0) + dt;

      // Death is triggered by the COMBAT worker setting hp <= 0.
      if (e.hp <= 0 && e.state !== 'dying') startDying(g, e);

      if (e.state === 'rising') {
        stepRising(e, red);
      } else if (e.state === 'chase') {
        stepChase(g, e, dt, now, pp);
      } else if (e.state === 'attack') {
        stepAttack(g, e, now, pp);
      } else if (e.state === 'dying') {
        if (stepDying(e)) {
          g.enemies.splice(i, 1);
          const id = e.id;
          setRoster((r) => r.filter((x) => x.id !== id));
        }
      }
    }

    // ---- Boss HUD mirror: keep gameRef.boss.hp in sync with the live boss.
    // The ARENA worker clears gameRef.boss on boss death; we never clear it.
    if (g.boss) {
      const b = g.enemies.find((e) => e && e.type === 'scorpion' && e.state !== 'dying');
      if (b) g.boss.hp = Math.max(0, b.hp);
    }
  });

  return (
    <group>
      {roster.map((r) => (
        <EnemyModel key={r.id} enemy={r.enemy} reducedRef={reduced} />
      ))}
    </group>
  );
}
