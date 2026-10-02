'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { WEAPONS } from '@/lib/babel/duat-arena';
import { pushOutOfCircles } from '@/lib/babel/arena-collide';
import { prefersReducedMotion } from '@/lib/babel/walk';
import { useDuatArena } from './DuatArena';

// Page-level toast plumbing: same DUAT_ARENA_EVENT string the page listens
// for ({ detail: { kind: 'toast', text } }). Kept as a local export so this
// file carries no cross-stage imports — DuatEnv exports the identical string.
export const DUAT_ARENA_EVENT = 'DUAT_ARENA_EVENT';
export const DUAT_ATTACK_REQUEST_EVENT = 'duat-attack-request';
export const DUAT_PLAYER_HIT_EVENT = 'duat-player-hit';

const BOUND = 150; // walker box ±150 (lib/babel/walk WALK_AREAS duat)
const MAX_PROJECTILES = 24; // phone-first live cap
const TAP_SLOP_PX = 6; // pointer travel under this = tap = attack
const IFRAMES_MS = 1000; // post-hit invulnerability window
const BLASTER_HALF_CONE = (4 * Math.PI) / 180; // 8° full cone → 4° half-angle
const SWING_DUR = 0.22; // seconds for the swing/kickback animation
const WEAPON_Y = 1.5; // rig height, just under the WALK_EYE=2 camera
const WEAPON_FWD = 0.95; // forward offset from the walker
const WEAPON_RIGHT = 0.5; // right offset from the walker

// Enemy body radii (brief): anubis 0.8, scorpion 2.2.
const ENEMY_RADIUS = { anubis: 0.8, scorpion: 2.2 };
const DEFAULT_ENEMY_R = 0.8;
function enemyRadius(e) {
  return ENEMY_RADIUS[e.type] ?? DEFAULT_ENEMY_R;
}

// Signed smallest angle between two headings (radians), in [-π, π].
function angleDiff(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Apply damage to one enemy. On a killing blow: mark 'dying' (ENEMIES animates
// and splices), bump player kills, and record the event for the HUD.
function applyDamage(g, enemy, dmg) {
  enemy.hp -= dmg;
  if (enemy.hp <= 0 && enemy.state !== 'dying') {
    enemy.state = 'dying';
    enemy.stateT = 0;
    const p = g.player;
    p.kills = (p.kills || 0) + 1;
    if (Array.isArray(g.events)) {
      g.events.push({ type: 'enemy-down', detail: { enemyType: enemy.type }, at: Date.now() });
    }
  }
}

// DuatCombat — the player-combat layer for the Duat arena.
//
// Props: { gameRef, inputRef, walkMode }.
// Mounted inside FloorDuat's Canvas (which sits before WalkMode in the page's
// mount order, so this component's useFrame mutates inputRef.pos BEFORE
// WalkMode's clamp runs — the ordering RECON.md relies on).
//
// READS:  gameRef.current.{arenaActive, matchPhase, enemies, colliders,
//         riverCheck, projectiles, pendingPlayerHits, events}
// WRITES: player.{attackCdUntil, iframesUntil, hp, dead, kills},
//         enemy.{hp, state, stateT}, projectiles (push/splice), inputRef.pos,
//         events (push).
export default function DuatCombat({ gameRef, inputRef, walkMode }) {
  const gl = useThree((s) => s.gl);
  const reduced = useRef(null);
  const rig = useRef(null); // outer group: positioned from walker yaw each frame
  const holder = useRef(null); // inner group: bob + swing animation offsets
  const perWeapon = useRef({}); // sword/blaster/bow/staff sub-groups
  const tipMat = useRef(null); // blaster muzzle material (emissive flash)
  const swingT = useRef(0); // seconds left in the swing animation
  const flashT = useRef(0); // seconds left in the muzzle flash
  const bobPhase = useRef(0);
  const nextId = useRef(1);
  const pool = useRef([]); // recycled projectile objects (phone-first, no churn)
  const downPos = useRef(null); // canvas tap start
  const walkModeRef = useRef(walkMode);
  walkModeRef.current = walkMode;

  const getGame = useCallback(
    () => (gameRef && gameRef.current ? gameRef.current : null),
    [gameRef]
  );
  const getInput = useCallback(() => {
    const g = getGame();
    return (
      (inputRef && inputRef.current) ||
      (g && g.inputRef && g.inputRef.current) ||
      null
    );
  }, [getGame, inputRef]);

  // ---- attack -----------------------------------------------------------
  // Gated: walkMode && arenaActive && !player.dead, plus per-weapon cooldown.
  const tryAttack = useCallback(() => {
    const g = getGame();
    if (!g || !walkModeRef.current || !g.arenaActive) return;
    const p = g.player;
    if (!p || p.dead) return;
    const w = p.weapon;
    const W = WEAPONS[w];
    if (!W) return;
    const now = performance.now();
    if (now < (p.attackCdUntil || 0)) return;
    p.attackCdUntil = now + W.cooldownMs;
    swingT.current = SWING_DUR;
    if (w === 'blaster') flashT.current = 0.12;

    const inp = getInput();
    if (!inp || !inp.pos) return;
    const yaw = inp.yaw;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const enemies = g.enemies || [];

    if (W.kind === 'melee') {
      // Sword: arc sweep — enemies inside range AND inside the swing arc.
      const halfArc = (((W.arcDeg ?? 100) / 2) * Math.PI) / 180;
      for (const e of enemies) {
        if (e.state === 'rising' || e.state === 'dying') continue;
        const dx = e.pos.x - inp.pos.x;
        const dz = e.pos.z - inp.pos.z;
        if (Math.hypot(dx, dz) > W.range) continue;
        const yawTo = Math.atan2(-dx, -dz); // yaw 0 faces −z
        if (Math.abs(angleDiff(yaw, yawTo)) > halfArc) continue;
        applyDamage(g, e, W.damage);
      }
    } else if (W.kind === 'hitscan') {
      // Blaster: nearest enemy within range inside a narrow 8° cone.
      let best = null;
      let bestD = Infinity;
      for (const e of enemies) {
        if (e.state === 'rising' || e.state === 'dying') continue;
        const dx = e.pos.x - inp.pos.x;
        const dz = e.pos.z - inp.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > W.range) continue;
        const yawTo = Math.atan2(-dx, -dz);
        if (Math.abs(angleDiff(yaw, yawTo)) > BLASTER_HALF_CONE) continue;
        if (d < bestD) {
          bestD = d;
          best = e;
        }
      }
      if (best) applyDamage(g, best, W.damage);
    } else if (W.kind === 'projectile') {
      // Bow / staff: spawn a world-space projectile from local
      // (fwd 1.0, y 1.6, right 0), velocity = facing × speed.
      const proj = pool.current.pop() || {};
      proj.id = nextId.current++;
      proj.friendly = true;
      proj.weapon = w;
      proj.kind = w;
      proj.pos = { x: inp.pos.x + fx * 1.0, y: 1.6, z: inp.pos.z + fz * 1.0 };
      proj.vel = { x: fx * W.speed, z: fz * W.speed };
      proj.damage = W.damage;
      proj.radius = 0.5;
      proj.aoe = W.aoe || 0; // staff splash
      proj.life = W.range / W.speed; // seconds
      if (!Array.isArray(g.projectiles)) g.projectiles = [];
      if (g.projectiles.length >= MAX_PROJECTILES) {
        const old = g.projectiles.shift();
        if (old) pool.current.push(old);
      }
      g.projectiles.push(proj);
    }
  }, [getGame, getInput]);

  // ---- Space key — scoped to walk mode, like the lantern L-key effect ----
  useEffect(() => {
    if (!walkMode) return undefined;
    const onKey = (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        tryAttack();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [walkMode, tryAttack]);

  // ---- Canvas tap: travel < 6px = attack (drags stay the page's look) ----
  useEffect(() => {
    const el = gl && gl.domElement;
    if (!el) return undefined;
    const down = (e) => {
      downPos.current = { x: e.clientX, y: e.clientY };
    };
    const up = (e) => {
      const d = downPos.current;
      downPos.current = null;
      if (!d) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < TAP_SLOP_PX) tryAttack();
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointerup', up);
    };
  }, [gl, tryAttack]);

  // ---- FIRE button (page-level DuatFireControls) requests attacks here ----
  useEffect(() => {
    const h = () => tryAttack();
    window.addEventListener(DUAT_ATTACK_REQUEST_EVENT, h);
    return () => window.removeEventListener(DUAT_ATTACK_REQUEST_EVENT, h);
  }, [tryAttack]);

  // ---- per-frame: collision, weapon rig, projectiles, incoming damage ----
  useFrame((state, delta) => {
    const g = getGame();
    if (reduced.current === null) reduced.current = prefersReducedMotion();
    const dt = Math.min(delta, 0.05);
    if (!g) return;

    // 1. Player collision — BEFORE WalkMode's clamp (mount order guarantees it).
    const inp = getInput();
    if (inp && inp.pos) {
      let c = pushOutOfCircles(inp.pos, g.colliders || []);
      if (typeof g.riverCheck === 'function') c = g.riverCheck(c.x, c.z);
      inp.pos.x = Math.max(-BOUND, Math.min(BOUND, c.x));
      inp.pos.z = Math.max(-BOUND, Math.min(BOUND, c.z));
    }

    const p = g.player;
    const active =
      walkModeRef.current &&
      g.arenaActive &&
      p &&
      !p.dead &&
      g.matchPhase !== 'victory' &&
      g.matchPhase !== 'defeat';

    // 2. First-person weapon rig follows the walker (forward/right from yaw).
    const rigG = rig.current;
    if (rigG) {
      rigG.visible = !!active;
      if (active && inp && inp.pos) {
        const t = state.clock.elapsedTime;
        const yaw = inp.yaw;
        const fx = -Math.sin(yaw);
        const fz = -Math.cos(yaw);
        const rx = Math.cos(yaw);
        const rz = -Math.sin(yaw);
        const moving =
          (inp.keys &&
            (inp.keys.fwd || inp.keys.back || inp.keys.left || inp.keys.right)) ||
          (inp.joy && Math.hypot(inp.joy.x, inp.joy.y) > 0.08);
        // Swing timer always ticks down; the visible dip is gated below.
        if (swingT.current > 0) swingT.current = Math.max(0, swingT.current - dt);
        if (flashT.current > 0) flashT.current = Math.max(0, flashT.current - dt);
        if (moving && !reduced.current) bobPhase.current += dt * 9;
        const bobA = reduced.current || !moving ? 0 : 1;
        const bobY = Math.abs(Math.sin(bobPhase.current)) * 0.05 * bobA;
        const bobX = Math.sin(bobPhase.current) * 0.012 * bobA;
        rigG.position.set(
          inp.pos.x + fx * WEAPON_FWD + rx * (WEAPON_RIGHT + bobX),
          WEAPON_Y + bobY,
          inp.pos.z + fz * WEAPON_FWD + rz * (WEAPON_RIGHT + bobX)
        );
        rigG.rotation.set(0, yaw, 0);
        // Instant weapon switch — React never re-renders for this.
        const w = p.weapon;
        for (const k of ['sword', 'blaster', 'bow', 'staff']) {
          const m = perWeapon.current[k];
          if (m) m.visible = k === w;
        }
        // Swing anim: quick rotate dip (+ blaster kickback). Static under
        // reduced motion.
        const h = holder.current;
        if (h) {
          if (swingT.current > 0 && !reduced.current) {
            const ph = 1 - swingT.current / SWING_DUR;
            const k = Math.sin(ph * Math.PI);
            h.rotation.x = -0.55 * k;
            h.position.z = w === 'blaster' ? 0.14 * k : 0;
          } else {
            h.rotation.x = 0;
            h.position.z = 0;
          }
        }
        // Blaster muzzle flash: brief emissive pulse; skipped (static) under
        // reduced motion.
        if (tipMat.current) {
          tipMat.current.emissiveIntensity =
            !reduced.current && flashT.current > 0 ? 4.5 : 1.4;
        }
      }
    }

    // 3. Projectiles: move, age, collide with enemies, splash for staff.
    const projs = g.projectiles;
    if (projs && projs.length) {
      const enemies = g.enemies || [];
      for (let i = projs.length - 1; i >= 0; i--) {
        const pr = projs[i];
        pr.life -= dt;
        pr.pos.x += pr.vel.x * dt;
        pr.pos.z += pr.vel.z * dt;
        let hit = null;
        if (pr.life > 0) {
          for (const e of enemies) {
            if (e.state === 'rising' || e.state === 'dying') continue;
            const d = Math.hypot(e.pos.x - pr.pos.x, e.pos.z - pr.pos.z);
            if (d < 0.9 + enemyRadius(e)) {
              hit = e;
              break;
            }
          }
        }
        if (hit || pr.life <= 0) {
          if (hit) {
            applyDamage(g, hit, pr.damage);
            if (pr.aoe > 0) {
              for (const e of enemies) {
                if (e === hit || e.state === 'rising' || e.state === 'dying')
                  continue;
                const d = Math.hypot(e.pos.x - pr.pos.x, e.pos.z - pr.pos.z);
                if (d < pr.aoe) applyDamage(g, e, pr.damage);
              }
            }
          }
          projs.splice(i, 1);
          pool.current.push(pr); // recycle the object
        }
      }
    }

    // 4. Incoming player damage (ENEMIES pushes { damage } here).
    const hits = g.pendingPlayerHits;
    if (hits && hits.length && p && !p.dead) {
      let total = 0;
      for (const h of hits) total += h.damage || 0;
      hits.length = 0; // consumed either way
      const now = performance.now();
      if (total > 0 && now > (p.iframesUntil || 0)) {
        p.hp = Math.max(0, (p.hp ?? 100) - total);
        p.iframesUntil = now + IFRAMES_MS;
        // Hit feedback is rendered by page-level DuatFireControls (DOM lives
        // outside the R3F Canvas — raw divs / react-dom portals inside Canvas
        // throw "not part of the THREE namespace").
        try {
          window.dispatchEvent(new CustomEvent(DUAT_PLAYER_HIT_EVENT));
        } catch {
          // best-effort; hp still applied
        }
        if (p.hp <= 0) {
          p.dead = true;
          try {
            window.dispatchEvent(
              new CustomEvent(DUAT_ARENA_EVENT, {
                detail: { kind: 'toast', text: 'You fell…' },
              })
            );
          } catch {
            // dispatch is best-effort; dead=true still drives the director
          }
        }
      }
    }
  });

  return (
    <>
      {/* first-person weapon rig — primitives only, no shadows */}
      <group ref={rig} visible={false}>
        <group ref={holder}>
          {/* SWORD — gold blade + guard */}
          <group ref={(m) => { perWeapon.current.sword = m; }}>
            <mesh position={[0, 0.06, -0.55]}>
              <boxGeometry args={[0.06, 0.1, 0.85]} />
              <meshStandardMaterial
                color="#e8c46a" metalness={0.85} roughness={0.25}
                emissive="#7a5a1a" emissiveIntensity={0.5}
              />
            </mesh>
            <mesh position={[0, 0.06, -1.0]} rotation={[-Math.PI / 2, 0, 0]}>
              <coneGeometry args={[0.05, 0.16, 4]} />
              <meshStandardMaterial
                color="#e8c46a" metalness={0.85} roughness={0.25}
                emissive="#7a5a1a" emissiveIntensity={0.5}
              />
            </mesh>
            <mesh position={[0, 0.06, -0.1]}>
              <boxGeometry args={[0.3, 0.07, 0.09]} />
              <meshStandardMaterial color="#8a5a2a" metalness={0.7} roughness={0.4} />
            </mesh>
            <mesh position={[0, 0.06, 0.06]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.035, 0.035, 0.24, 10]} />
              <meshStandardMaterial color="#3a2a1a" roughness={0.8} />
            </mesh>
          </group>

          {/* BLASTER — dark body + glowing teal tip */}
          <group ref={(m) => { perWeapon.current.blaster = m; }}>
            <mesh position={[0, 0, -0.3]}>
              <boxGeometry args={[0.16, 0.18, 0.55]} />
              <meshStandardMaterial color="#23262e" metalness={0.7} roughness={0.4} />
            </mesh>
            <mesh position={[0, 0.02, -0.66]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.05, 0.05, 0.3, 12]} />
              <meshStandardMaterial color="#15171c" metalness={0.6} roughness={0.5} />
            </mesh>
            <mesh position={[0, 0.02, -0.84]}>
              <sphereGeometry args={[0.055, 12, 12]} />
              <meshStandardMaterial
                ref={(m) => { tipMat.current = m || null; }}
                color="#37e6d4" emissive="#37e6d4" emissiveIntensity={1.4}
              />
            </mesh>
            <mesh position={[0, -0.16, -0.16]} rotation={[0.25, 0, 0]}>
              <boxGeometry args={[0.09, 0.22, 0.12]} />
              <meshStandardMaterial color="#1a1d24" roughness={0.6} />
            </mesh>
          </group>

          {/* BOW — curved torus limb + string */}
          <group ref={(m) => { perWeapon.current.bow = m; }}>
            <mesh position={[0, 0.12, -0.5]} rotation={[0, Math.PI / 2, 0]}>
              <torusGeometry args={[0.42, 0.03, 8, 24, 2.4]} />
              <meshStandardMaterial color="#7a4a22" roughness={0.7} />
            </mesh>
            <mesh position={[0, 0.12, -0.32]}>
              <cylinderGeometry args={[0.008, 0.008, 0.72, 6]} />
              <meshStandardMaterial color="#d8cfae" roughness={0.9} />
            </mesh>
            <mesh position={[0, 0.12, -0.5]}>
              <boxGeometry args={[0.07, 0.16, 0.07]} />
              <meshStandardMaterial color="#4a2c14" roughness={0.85} />
            </mesh>
          </group>

          {/* STAFF — rod + glowing orb */}
          <group ref={(m) => { perWeapon.current.staff = m; }}>
            <mesh position={[0, 0.12, -0.45]} rotation={[0.35, 0, 0]}>
              <cylinderGeometry args={[0.035, 0.045, 1.5, 10]} />
              <meshStandardMaterial color="#6a4426" roughness={0.75} />
            </mesh>
            <mesh position={[0, 0.12 + 0.75 * Math.cos(0.35), -0.45 - 0.75 * Math.sin(0.35)]}>
              <sphereGeometry args={[0.1, 16, 16]} />
              <meshStandardMaterial
                color="#ffd97a" emissive="#ffbe3c" emissiveIntensity={1.6}
              />
            </mesh>
            {[-0.09, 0.09].map((px) => (
              <mesh
                key={px}
                position={[px, 0.12 + 0.75 * Math.cos(0.35) - 0.08, -0.45 - 0.75 * Math.sin(0.35)]}
              >
                <coneGeometry args={[0.02, 0.14, 6]} />
                <meshStandardMaterial color="#8a5a2a" metalness={0.7} roughness={0.4} />
              </mesh>
            ))}
          </group>
        </group>
      </group>
    </>
  );
}

// ---------------------------------------------------------------------------
// DuatFireControls — DOM-only fire button + hit flash.
//
// Mounted at page level (OUTSIDE the R3F Canvas): raw divs and react-dom
// portals inside <Canvas> throw "not part of the THREE namespace". Attacks
// are requested via DUAT_ATTACK_REQUEST_EVENT, which the in-Canvas
// DuatCombat listens for; hit feedback arrives via DUAT_PLAYER_HIT_EVENT.
// ---------------------------------------------------------------------------
export function DuatFireControls({ walkMode }) {
  const gameRef = useDuatArena();
  const [showFire, setShowFire] = useState(false);
  const [redFlash, setRedFlash] = useState(false);
  const flashTimer = useRef(null);
  const [staticFlash] = useState(() => {
    try {
      return prefersReducedMotion();
    } catch {
      return false;
    }
  });

  // FIRE button visibility — 4Hz poll, never per-frame setState.
  useEffect(() => {
    const id = setInterval(() => {
      const g = gameRef && gameRef.current;
      const p = g && g.player;
      const v =
        !!walkMode &&
        !!(g && g.arenaActive) &&
        !!p &&
        !p.dead &&
        g.matchPhase !== 'victory' &&
        g.matchPhase !== 'defeat';
      setShowFire((prev) => (prev === v ? prev : v));
    }, 250);
    return () => clearInterval(id);
  }, [walkMode, gameRef]);

  // Hit feedback from the in-Canvas combat loop.
  useEffect(() => {
    const onHit = () => {
      setRedFlash(true);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setRedFlash(false), 400);
    };
    window.addEventListener(DUAT_PLAYER_HIT_EVENT, onHit);
    return () => {
      window.removeEventListener(DUAT_PLAYER_HIT_EVENT, onHit);
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, []);

  const onFire = (e) => {
    e.preventDefault();
    try {
      window.dispatchEvent(new CustomEvent(DUAT_ATTACK_REQUEST_EVENT));
    } catch {
      // best-effort
    }
  };

  return (
    <>
      {/* phone-friendly FIRE button — fixed bottom-right, data-ui */}
      {showFire && (
        <button
          data-ui
          type="button"
          aria-label="Fire weapon"
          onPointerDown={onFire}
          className="fixed z-30 w-16 h-16 rounded-full border-2 border-amber-400/70 bg-black/60 text-amber-300 text-xs font-black tracking-[0.2em] uppercase shadow-[0_0_24px_rgba(212,162,78,0.45)] active:scale-95 touch-none select-none"
          style={{ right: '1rem', bottom: 'calc(12.5rem + env(safe-area-inset-bottom))' }}
        >
          Fire
        </button>
      )}

      {/* hit feedback — screen-edge red flash; static under reduced motion */}
      {redFlash && (
        <>
          {!staticFlash && (
            <style>{`@keyframes duat-redflash{0%{opacity:.9}100%{opacity:0}}`}</style>
          )}
          <div
            aria-hidden="true"
            className="fixed inset-0 z-40 pointer-events-none"
            style={{
              background:
                'radial-gradient(ellipse at center, transparent 55%, rgba(200,30,30,0.55) 100%)',
              animation: staticFlash ? undefined : 'duat-redflash 0.4s ease-out forwards',
            }}
          />
        </>
      )}
    </>
  );
}
