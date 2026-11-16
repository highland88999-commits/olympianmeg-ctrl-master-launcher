'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { latLonToVec3 } from '@/lib/geo';
import { surfaceRadiusOrBase } from '@/lib/earth/heightmap';
import { patchFacetRadiusAt } from '@/lib/earth/street-patch';
import { DISPLAY_UNITS_PER_METRE } from '@/lib/earth/placements';
import { roamState, tangentFrame, headingVector } from '@/lib/earth/roam';
import { carState } from '@/lib/earth/parachute';
import { getVehicle, isVehicleId } from '@/lib/earth/vehicles';
import { getVehicleModel, subscribeVehicleModel, ensureVehicleModel } from '@/lib/earth/vehicle-model';
import { buildJetFlame, animateJetFlame } from '@/lib/earth/jet-flame';
import { haversineM } from '@/lib/earth/boost-pads';
import { getParticleTexture } from '@/lib/particles/sprites';
import { useScratchedTexture } from '@/lib/portal/scratched-textures';
import { useGoldTexture } from '@/lib/portal/gold-texture';
import { makeSessionId } from '@/lib/presence';
import { supabase } from '@/lib/supabase';
import {
  ORB_BEAM_RENDER_M,
  EXPLODE_MS,
  INTEGRITY_MAX,
  KART_SERVER_POLL_MS,
  kartState,
  kartHud,
  kartClientId,
  setKartClientId,
  sharedPeerVehicles,
  startPeerHit,
  orbsNear,
  collectOrbs,
  collectPlayerMissile,
  fireTorpedo,
  stepTorpedoes,
  stepRivals,
  buildRivals,
  createHit,
  startHit,
  advanceHit,
  flipRollAngle,
  applyCollisionDamage,
  setKartNotice,
  kartServerSync,
  kartServerGrant,
  kartServerSpend,
  kartServerReport,
  kartServerPoll,
  fnv1a,
  mulberry32,
} from '@/lib/earth/kart';

// EarthKart — Earth 1 Mario Kart systems (Merlin, 2026-11-15):
// torpedo orbs, torpedo combat, AI rivals, bumper-car collision
// damage, and the flip-3x-explode-respawn sequence.
//
// One orb = exactly one missile (Merlin). Orbs are a virtual
// seeded grid (lib/earth/kart.js — 6,480,000, ~11 km apart);
// only the orbs near the driver get meshes. The missile a
// torpedo wears is the scratched-metal wrap of the orb it came
// from (deep gold = the archway gold). The explosion is a real
// 3D particle burst + expanding shell + flash (emissive only,
// no new real lights) — no video was needed.
//
// The component owns the per-frame combat loop; the player's own
// car (EarthSupercar) reads kartState.playerHit for its flip /
// hide, and EarthPeers reads peerHitStates for peer flips.
// Server state (missile inventory + combat events) is best
// effort: until supabase/earth1-kart.sql runs, everything stays
// local and the session count carries the game.

const UPM = DISPLAY_UNITS_PER_METRE;

/** Orb colour name -> hex (the sphere + beam tint; the missile
 *  wrap itself is the scratched-metal photo, not this flat colour). */
const ORB_COLOR_HEX = {
  magenta: '#ff00ff',
  cyan: '#00e5ff',
  blue: '#2f6bff',
  'bright-gold': '#ffd700',
  red: '#ff2a2a',
  green: '#22ff66',
  purple: '#a020f0',
  silver: '#d7dde3',
  'deep-gold': '#d4af37',
};

/** Ground-hugging world position for a lat/lon + altitude. */
function groundPos(lat, lon, altM) {
  const surfR = surfaceRadiusOrBase(lat, lon);
  const facetR = patchFacetRadiusAt(lat, lon);
  const groundR = facetR != null ? Math.max(surfR, facetR) : surfR;
  return latLonToVec3(lat, lon, groundR + altM * UPM);
}

/** Orient a group: +Z along the heading, +Y along the normal. */
function orientGroup(g, lat, lon, yawDeg) {
  const frame = tangentFrame(lat, lon);
  const fwd = headingVector(frame, yawDeg);
  const normal = new THREE.Vector3(frame.normal.x, frame.normal.y, frame.normal.z);
  const fwdV = new THREE.Vector3(fwd.x, fwd.y, fwd.z);
  const xAxis = new THREE.Vector3().crossVectors(normal, fwdV).normalize();
  const zAxis = new THREE.Vector3().crossVectors(xAxis, normal).normalize();
  g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, normal, zAxis));
}

function cloneModelInto(parent, model) {
  while (parent.children.length > 0) parent.remove(parent.children[0]);
  const holder = new THREE.Group();
  holder.scale.setScalar(model.scale);
  holder.rotation.y = model.rotY || 0;
  const inner = new THREE.Group();
  inner.position.y = model.liftY;
  inner.add(model.scene.clone(true));
  holder.add(inner);
  parent.add(holder);
}

/** One torpedo orb: a glowing sphere floating over the street
 *  plus a tall light beam, so the driver can spot the next
 *  pickup from driving distance. Distinct from the boost pads
 *  (flat discs on the ground) — spheres in the air, not discs. */
function OrbMesh({ orb }) {
  const groupRef = useRef();
  const sphereRef = useRef();
  const { position, quaternion } = useMemo(() => {
    const p = groundPos(orb.lat, orb.lon, 0);
    const frame = tangentFrame(orb.lat, orb.lon);
    const normal = new THREE.Vector3(frame.normal.x, frame.normal.y, frame.normal.z);
    const fwd = new THREE.Vector3(frame.east.x, frame.east.y, frame.east.z);
    const xAxis = new THREE.Vector3().crossVectors(normal, fwd).normalize();
    const zAxis = new THREE.Vector3().crossVectors(xAxis, normal).normalize();
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, normal, zAxis));
    return { position: [p.x, p.y, p.z], quaternion: q };
  }, [orb]);
  const color = ORB_COLOR_HEX[orb.color] || '#ff00ff';
  const phase = useMemo(() => (fnv1a(orb.id) % 1000) / 1000 * Math.PI * 2, [orb.id]);

  useFrame(({ clock }) => {
    const s = sphereRef.current;
    if (!s) return;
    // Bobbing: the orb floats 2.5 m up, breathing +/-0.5 m.
    s.position.y = (2.5 + Math.sin(clock.elapsedTime * 2 + phase) * 0.5) * UPM;
  });

  return (
    <group ref={groupRef} position={position} quaternion={quaternion}>
      {/* Light beam: a tall additive shaft, visible from ~8 km. */}
      <mesh position={[0, 30 * UPM, 0]} renderOrder={2}>
        <cylinderGeometry args={[0.4 * UPM, 1.2 * UPM, 60 * UPM, 12, 1, true]} />
        <meshBasicMaterial color={color} transparent opacity={0.22} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={sphereRef} position={[0, 2.5 * UPM, 0]} renderOrder={3}>
        <sphereGeometry args={[2 * UPM, 20, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.9} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** One torpedo in flight: a small missile wearing the
 *  scratched-metal wrap of the orb it came from (deep gold =
 *  the archway gold). Light-reflecting metal (0.9 / 0.3, the
 *  shared law), no new real lights. */
function TorpedoMesh({ torpedo }) {
  const groupRef = useRef();
  const scratchTex = useScratchedTexture(torpedo.color);
  const goldTex = useGoldTexture();
  const tex = torpedo.color === 'deep-gold' ? goldTex : scratchTex;

  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;
    const p = groundPos(torpedo.lat, torpedo.lon, 1.2);
    g.position.set(p.x, p.y, p.z);
    orientGroup(g, torpedo.lat, torpedo.lon, torpedo.yawDeg);
  });

  return (
    <group ref={groupRef}>
      {/* Nose cone (points +Z after the X-rotation) + body. */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.9 * UPM]}>
        <coneGeometry args={[0.45 * UPM, 1.2 * UPM, 12]} />
        <meshStandardMaterial map={tex || undefined} metalness={0.9} roughness={0.3} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -0.3 * UPM]}>
        <cylinderGeometry args={[0.45 * UPM, 0.45 * UPM, 1.6 * UPM, 12]} />
        <meshStandardMaterial map={tex || undefined} metalness={0.9} roughness={0.3} />
      </mesh>
      {/* Exhaust glow: a short additive tail behind the missile. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -1.6 * UPM]}>
        <coneGeometry args={[0.5 * UPM, 1.8 * UPM, 12]} />
        <meshBasicMaterial color="#ff8c1a" transparent opacity={0.75} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
}

/** One AI rival: its roster craft (cloned from the vehicle
 *  cache, same rotY as the player's car) + jet flame. Flips 3x
 *  on a hit, hides while exploding. */
function RivalMesh({ rival }) {
  const groupRef = useRef();
  const hostRef = useRef();
  const [model, setModel] = useState(() => getVehicleModel(rival.craftId));
  const craft = getVehicle(rival.craftId);
  const flame = useMemo(
    () => (craft && craft.engine === 'jet' ? buildJetFlame(craft.lengthM) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rival.craftId],
  );

  useEffect(() => {
    const unsub = subscribeVehicleModel(({ id, model: m }) => {
      if (id === rival.craftId) setModel(m);
    });
    if (!getVehicleModel(rival.craftId)) void ensureVehicleModel(rival.craftId);
    return unsub;
  }, [rival.craftId]);

  useEffect(() => {
    const f = flame;
    return () => {
      if (!f) return;
      f.group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    };
  }, [flame]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (model) cloneModelInto(host, model);
    else while (host.children.length > 0) host.remove(host.children[0]);
  }, [model]);

  useFrame((state) => {
    const g = groupRef.current;
    if (!g) return;
    const nowMs = performance.now();
    const hit = rival.hit;
    if (hit.phase === 'exploding') {
      g.visible = false;
      return;
    }
    g.visible = true;
    const p = groundPos(rival.lat, rival.lon, craft ? craft.hoverM : 0.35);
    g.position.set(p.x, p.y, p.z);
    orientGroup(g, rival.lat, rival.lon, rival.yawDeg);
    if (hit.phase === 'flipping') {
      const roll = flipRollAngle(hit, nowMs);
      g.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll));
    }
    if (flame) {
      animateJetFlame(flame, {
        driving: Math.abs(rival.speed) > 1,
        speedRatio: craft ? Math.abs(rival.speed) / (craft.tuning?.maxSpeed || 90) : 0,
        time: state.clock.elapsedTime,
      });
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      <group ref={hostRef} />
      {flame && <primitive object={flame.group} />}
    </group>
  );
}

/** The explosion: a real 3D particle burst (ember sprites,
 *  additive) + an expanding shell + a white-hot flash core.
 *  Reads kartState.lastBlast; the latest blast wins the one
 *  visual slot. Emissive only — no new real lights. */
function ExplosionBurst() {
  const groupRef = useRef();
  const pointsRef = useRef();
  const shellRef = useRef();
  const flashRef = useRef();
  const blastIdRef = useRef(null);
  const partsRef = useRef(null);
  const emberTex = useMemo(() => getParticleTexture('ember'), []);

  const COUNT = 120;
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));
    return geo;
  }, [COUNT]);

  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;
    const blast = kartState.lastBlast;
    const nowMs = performance.now();
    if (!blast) {
      g.visible = false;
      return;
    }
    const t = (nowMs - blast.startedMs) / EXPLODE_MS;
    if (t < 0 || t >= 1) {
      g.visible = false;
      return;
    }
    g.visible = true;
    if (blastIdRef.current !== blast.id) {
      blastIdRef.current = blast.id;
      const rand = mulberry32(fnv1a(blast.id));
      const dirs = [];
      const speeds = [];
      const colors = new Float32Array(COUNT * 3);
      for (let i = 0; i < COUNT; i++) {
        // Random direction on a sphere, biased upward.
        const u = rand() * 2 - 1;
        const a = rand() * Math.PI * 2;
        const r = Math.sqrt(Math.max(0, 1 - u * u));
        dirs.push({ x: r * Math.cos(a), y: Math.abs(u) * 0.8 + 0.2, z: r * Math.sin(a) });
        speeds.push(8 + rand() * 20);
        // Ember palette: white-yellow core -> orange -> deep red.
        const pick = rand();
        const c = pick < 0.25 ? [1, 0.95, 0.7] : pick < 0.7 ? [1, 0.55, 0.1] : [0.9, 0.15, 0.05];
        colors[i * 3] = c[0];
        colors[i * 3 + 1] = c[1];
        colors[i * 3 + 2] = c[2];
      }
      partsRef.current = { dirs, speeds };
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const p = groundPos(blast.lat, blast.lon, 2);
      g.position.set(p.x, p.y, p.z);
    }
    const parts = partsRef.current;
    if (parts && pointsRef.current) {
      const pos = geometry.attributes.position;
      const ageS = (t * EXPLODE_MS) / 1000;
      for (let i = 0; i < COUNT; i++) {
        const d = parts.dirs[i];
        const dist = parts.speeds[i] * ageS * UPM;
        pos.array[i * 3] = d.x * dist;
        pos.array[i * 3 + 1] = d.y * dist;
        pos.array[i * 3 + 2] = d.z * dist;
      }
      pos.needsUpdate = true;
      pointsRef.current.material.opacity = 1 - t;
    }
    if (shellRef.current) {
      shellRef.current.scale.setScalar((2 + t * 14) * UPM);
      shellRef.current.material.opacity = (1 - t) * 0.45;
    }
    if (flashRef.current) {
      flashRef.current.scale.setScalar((1.5 + t * 5) * UPM);
      flashRef.current.material.opacity = Math.max(0, 1 - t * 3);
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      <points ref={pointsRef} geometry={geometry} frustumCulled={false}>
        <pointsMaterial
          size={1.6 * UPM}
          sizeAttenuation
          map={emberTex || undefined}
          vertexColors
          transparent
          opacity={1}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
      <mesh ref={shellRef}>
        <sphereGeometry args={[1, 24, 16]} />
        <meshBasicMaterial color="#ff7a00" transparent opacity={0.45} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={flashRef}>
        <sphereGeometry args={[1, 16, 12]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={1} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
}

export default function EarthKart() {
  const [orbs, setOrbs] = useState([]);
  const [torps, setTorps] = useState([]);
  const [rivals, setRivals] = useState([]);
  const prevPosRef = useRef(null);
  const nearKeyRef = useRef('');
  const torpKeyRef = useRef('');
  const rivalsBuiltRef = useRef(false);

  // Mount: resolve this client's combat id, sync the server
  // missile count (server wins on a fresh load), start the
  // combat-event poll.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let id = null;
      try {
        const { data } = await supabase.auth.getSession();
        id = data && data.session ? data.session.user.id : null;
      } catch { /* guest path */ }
      if (!id) {
        try { id = makeSessionId(); } catch { id = null; }
      }
      if (!cancelled) setKartClientId(id);
    })();
    void kartServerSync(kartState);
    const pollId = setInterval(() => {
      void kartServerPoll().then((events) => {
        if (!events || cancelled) return;
        const nowMs = performance.now();
        for (const e of events) {
          if (!e || e.targetId !== kartClientId.id) continue;
          if (!e.nonce || kartState.processedNonces.has(e.nonce)) continue;
          kartState.processedNonces.add(e.nonce);
          if (e.kind === 'torpedo') {
            if (nowMs >= kartState.invulnUntilMs && kartState.playerHit.phase === 'none') {
              startHit(kartState.playerHit, { lat: e.lat ?? carState.lat, lon: e.lon ?? carState.lon, nowMs });
              setKartNotice('💥 TORPEDO HIT!', nowMs);
            }
          } else if (e.kind === 'collision' && typeof e.damage === 'number') {
            kartState.integrity = Math.max(0, kartState.integrity - e.damage);
            if (kartState.integrity <= 0 && kartState.playerHit.phase === 'none') {
              startHit(kartState.playerHit, { lat: e.lat ?? carState.lat, lon: e.lon ?? carState.lon, nowMs });
              setKartNotice('💥 SMASHED!', nowMs);
            }
          }
        }
      });
    }, KART_SERVER_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(pollId);
    };
  }, []);

  useFrame((_state, rawDt) => {
    const dt = Math.min(0.05, rawDt || 0.016);
    const nowMs = performance.now();
    if (!carState.mounted) return;
    const craft = getVehicle(carState.craftId);
    const playerSpeedMps = Math.abs(carState.speed || 0) * 3;
    const player = {
      kind: 'player',
      id: kartClientId.id || 'player',
      lat: carState.lat,
      lon: carState.lon,
      yawDeg: carState.yawDeg,
      speedMps: playerSpeedMps,
      invulnUntilMs: kartState.invulnUntilMs,
    };

    // Rivals: build once, lazily, when the driver is mounted.
    if (!rivalsBuiltRef.current) {
      rivalsBuiltRef.current = true;
      const built = buildRivals({
        playerLat: carState.lat,
        playerLon: carState.lon,
        playerCraftId: carState.craftId,
      });
      kartState.rivals = built;
      setRivals(built);
    }

    // Orb collection (player): drive through -> +1 missile.
    const prev = prevPosRef.current;
    collectOrbs(kartState, {
      lat: carState.lat,
      lon: carState.lon,
      prevLat: prev ? prev.lat : carState.lat,
      prevLon: prev ? prev.lon : carState.lon,
      driving: true,
      nowMs,
    }, (orb) => {
      collectPlayerMissile(kartState, orb);
      void kartServerGrant(kartState);
      setKartNotice(`🚀 +1 TORPEDO — ${orb.color}`, nowMs);
    });
    prevPosRef.current = { lat: carState.lat, lon: carState.lon };
    kartHud.missiles = kartState.missiles;

    // Rivals drive, collect, and fire.
    stepRivals(kartState, { dt, nowMs, player });

    // Torpedo flight + hits.
    const vehicles = [
      player,
      ...kartState.rivals.map((r) => ({
        kind: 'rival', id: r.id, lat: r.lat, lon: r.lon,
        speedMps: Math.abs(r.speed || 0) * 3, invulnUntilMs: r.invulnUntilMs || 0,
      })),
      ...sharedPeerVehicles.map((p) => ({
        kind: 'peer', id: p.id, lat: p.lat, lon: p.lon,
        speedMps: p.speedMps || 0, invulnUntilMs: 0,
      })),
    ];
    const events = stepTorpedoes(kartState, { dt, nowMs, vehicles });
    for (const e of events) {
      if (e.type !== 'hit') continue;
      if (e.targetKind === 'player') {
        if (kartState.playerHit.phase === 'none') {
          startHit(kartState.playerHit, { lat: e.lat, lon: e.lon, nowMs });
          setKartNotice('💥 TORPEDO HIT!', nowMs);
        }
      } else if (e.targetKind === 'rival') {
        const rival = kartState.rivals.find((r) => r.id === e.targetId);
        if (rival && rival.hit.phase === 'none') {
          startHit(rival.hit, { lat: e.lat, lon: e.lon, nowMs });
          setKartNotice('🎯 DIRECT HIT!', nowMs);
        }
      } else if (e.targetKind === 'peer') {
        startPeerHit(e.targetId, { lat: e.lat, lon: e.lon, nowMs });
        setKartNotice('🎯 DIRECT HIT!', nowMs);
        void kartServerReport({
          kind: 'torpedo',
          actorId: kartClientId.id,
          targetId: e.targetId,
          damage: 0,
          lat: e.lat,
          lon: e.lon,
          nonce: `torp:${e.torpedoId}:${e.targetId}`,
        });
      }
    }

    // Advance the player's hit sequence.
    const adv = advanceHit(kartState.playerHit, nowMs);
    if (adv.phase === 'exploding' && kartState.playerHit.phase === 'exploding') {
      if (!kartState.lastBlast || kartState.lastBlast.startedMs !== kartState.playerHit.startedMs) {
        kartState.lastBlast = {
          id: `blast-player-${kartState.playerHit.startedMs}`,
          lat: kartState.playerHit.lat,
          lon: kartState.playerHit.lon,
          startedMs: nowMs,
        };
        setKartNotice('💥 BOOM!', nowMs);
      }
    }
    if (adv.respawn) {
      carState.lat = adv.respawn.lat;
      carState.lon = adv.respawn.lon;
      carState.speed = 0;
      roamState.lat = adv.respawn.lat;
      roamState.lon = adv.respawn.lon;
      kartState.integrity = INTEGRITY_MAX;
      kartState.invulnUntilMs = adv.respawn.invulnUntilMs;
      kartState.playerHit = createHit();
      setKartNotice('🏁 Back in the race!', nowMs);
    }
    kartHud.hitPhase = kartState.playerHit.phase;

    // Advance rival hits.
    for (const rival of kartState.rivals) {
      const r = advanceHit(rival.hit, nowMs);
      if (r.phase === 'exploding') {
        if (!kartState.lastBlast || kartState.lastBlast.startedMs !== rival.hit.startedMs) {
          kartState.lastBlast = {
            id: `blast-${rival.id}-${rival.hit.startedMs}`,
            lat: rival.hit.lat,
            lon: rival.hit.lon,
            startedMs: nowMs,
          };
        }
      }
      if (r.respawn) {
        rival.lat = r.respawn.lat;
        rival.lon = r.respawn.lon;
        rival.speed = 0;
        rival.integrity = INTEGRITY_MAX;
        rival.invulnUntilMs = r.respawn.invulnUntilMs;
        rival.hit = createHit();
      }
    }

    // Bumper-car collisions: player vs rivals + peers.
    const playerLen = craft ? craft.lengthM : 4.6;
    const collideWith = (other, otherLen, otherSpeedMps) => {
      const dist = haversineM(carState.lat, carState.lon, other.lat, other.lon);
      if (dist >= (playerLen + otherLen) / 2 + 1) return;
      const rel = Math.abs(playerSpeedMps - otherSpeedMps);
      const results = applyCollisionDamage(kartState, {
        a: { kind: 'player', id: kartClientId.id || 'player' },
        b: { kind: other.kind, id: other.id },
        relSpeedMps: rel,
        nowMs,
      });
      for (const res of results) {
        if (res.target.kind === 'player' && res.boom && kartState.playerHit.phase === 'none') {
          startHit(kartState.playerHit, { lat: carState.lat, lon: carState.lon, nowMs });
          setKartNotice('💥 SMASHED!', nowMs);
        }
        if (res.target.kind === 'rival' && res.boom) {
          const rival = kartState.rivals.find((x) => x.id === res.target.id);
          if (rival && rival.hit.phase === 'none') {
            startHit(rival.hit, { lat: rival.lat, lon: rival.lon, nowMs });
          }
        }
        if (res.target.kind === 'peer') {
          void kartServerReport({
            kind: 'collision',
            actorId: kartClientId.id,
            targetId: res.target.id,
            damage: res.dmg,
            lat: carState.lat,
            lon: carState.lon,
            nonce: `coll:${nowMs}:${res.target.id}`,
          });
        }
      }
      if (results.length > 0) setKartNotice('💥 BUMP!', nowMs);
    };
    for (const rival of kartState.rivals) {
      if (rival.hit.phase === 'flipping' || rival.hit.phase === 'exploding') continue;
      if (nowMs < (rival.invulnUntilMs || 0)) continue;
      const rc = getVehicle(rival.craftId);
      collideWith(
        { kind: 'rival', id: rival.id, lat: rival.lat, lon: rival.lon },
        rc ? rc.lengthM : 4.6,
        Math.abs(rival.speed || 0) * 3,
      );
    }
    for (const p of sharedPeerVehicles) {
      if (!isVehicleId(p.craftId)) continue;
      const pc = getVehicle(p.craftId);
      collideWith(
        { kind: 'peer', id: p.id, lat: p.lat, lon: p.lon },
        pc ? pc.lengthM : 4.6,
        p.speedMps || 0,
      );
    }

    // Render sets: orbs (beam range) + torpedoes.
    const nearOrbs = orbsNear(carState.lat, carState.lon, ORB_BEAM_RENDER_M);
    const orbKey = nearOrbs.map((o) => o.id).join(',');
    if (orbKey !== nearKeyRef.current) {
      nearKeyRef.current = orbKey;
      setOrbs(nearOrbs);
    }
    const torpKey = kartState.torpedoes.map((t) => t.id).join(',');
    if (torpKey !== torpKeyRef.current) {
      torpKeyRef.current = torpKey;
      setTorps([...kartState.torpedoes]);
    }
  });

  return (
    <group>
      {orbs.map((orb) => (
        <OrbMesh key={orb.id} orb={orb} />
      ))}
      {torps.map((t) => (
        <TorpedoMesh key={t.id} torpedo={t} />
      ))}
      {rivals.map((rival) => (
        <RivalMesh key={rival.id} rival={rival} />
      ))}
      <ExplosionBurst />
    </group>
  );
}

/** Fire one missile from the HUD (the Fire button + F key).
 *  Returns the torpedo, or null when the count is 0. The server
 *  spend is recorded best-effort; the local count is the session
 *  truth (see kartServerSpend). */
export function fireFromHud() {
  if (!carState.mounted) return null;
  const vehicles = [
    ...kartState.rivals.map((r) => ({
      kind: 'rival', id: r.id, lat: r.lat, lon: r.lon,
      speedMps: Math.abs(r.speed || 0) * 3,
    })),
    ...sharedPeerVehicles.map((p) => ({
      kind: 'peer', id: p.id, lat: p.lat, lon: p.lon, speedMps: p.speedMps || 0,
    })),
  ];
  const torp = fireTorpedo(kartState, {
    lat: carState.lat,
    lon: carState.lon,
    yawDeg: carState.yawDeg,
    nowMs: performance.now(),
    vehicles,
  });
  if (torp) void kartServerSpend(kartState);
  return torp;
}
