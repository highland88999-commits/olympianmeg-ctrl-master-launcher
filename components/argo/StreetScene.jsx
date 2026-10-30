// components/argo/StreetScene.jsx — The street-level world.
//
// The user stands (rides, flies, walks) inside the REAL city: Google's
// photorealistic 3D tiles re-rooted to a local meter frame. Around them:
// partner billboard monuments, portals that launch pocket universes,
// hidden gold bars, and satellites crossing a real sky.
//
// Movement: RIDE (terrain-following TRON bike), FLY (free), WALK (eye
// level). Touch joystick + WASD/arrows + right-side drag look. Autopilot
// cinematic tour. Reduced motion: no idle animation, no autopilot.
//
// Collision: the real world is SOLID — a throttled dual-raycast keeps the
// rig on the terrain and predicts walls ahead. Walk and fly bounce/deflect
// off walls, never kill, never clip through.
//
// Merlin 2026-09-30 explicit override, scoped to BIKE RIDE MODE ONLY: the
// bike passes THROUGH buildings and solid objects with the rider still
// mounted — no deflect, no bounce, no dismount. Terrain following stays
// (the bike still rides the streets). See isWallDeflectionEnabled() in
// lib/argo-street.js. The ONLY other pass-through is a portal, by design.

'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useRouter } from 'next/navigation';
import * as THREE from 'three';
import { WispBike, CometBike, AtlasBike } from '@/components/nova/TronBikes';
import TronRider from '@/components/nova/TronRider';
import { fx } from '@/lib/fx';
import { billboardInventory } from '@/lib/partners';
import {
  streetLayout,
  STREET_HOVER_M,
  STREET_WALK_EYE_M,
  STREET_GOLD_PER_BAR,
  addLiquidGold,
  markBarCollected,
  collectedBarIds,
  updateRideSteering,
  angleDiff,
} from '@/lib/argo-street';
import BillboardMonument from './BillboardMonument';

const BIKES = { wisp: WispBike, comet: CometBike, atlas: AtlasBike };
const BIKE_COLORS = { wisp: '#00ffcc', comet: '#38bdf8', atlas: '#f59e0b' };

const RIDE_SPEED = 16;
const FLY_SPEED = 34;
const WALK_SPEED = 6;
const GROUND_SAMPLE_MS = 400;

// --- sky -------------------------------------------------------------------

function SkyDome() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          zenith: { value: new THREE.Color('#2e6bd0') },
          horizon: { value: new THREE.Color('#c3d9ec') },
          ground: { value: new THREE.Color('#8fa3b8') },
        },
        vertexShader: `
          varying vec3 vPos;
          void main() {
            vPos = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `
          varying vec3 vPos;
          uniform vec3 zenith; uniform vec3 horizon; uniform vec3 ground;
          void main() {
            float h = normalize(vPos).y;
            vec3 c = h >= 0.0
              ? mix(horizon, zenith, pow(h, 0.55))
              : mix(horizon, ground, pow(-h, 0.7));
            gl_FragColor = vec4(c, 1.0);
          }`,
      }),
    []
  );
  useEffect(() => () => mat.dispose(), [mat]);
  return (
    <mesh material={mat} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[12000, 32, 20]} />
    </mesh>
  );
}

function Sun() {
  const dir = useMemo(() => new THREE.Vector3(0.45, 0.62, 0.34).normalize(), []);
  return (
    <group>
      <directionalLight position={[dir.x * 8000, dir.y * 8000, dir.z * 8000]} intensity={2.0} />
      <mesh position={[dir.x * 11000, dir.y * 11000, dir.z * 11000]}>
        <circleGeometry args={[320, 32]} />
        <meshBasicMaterial color="#fff7e0" toneMapped={false} fog={false} />
      </mesh>
      <mesh position={[dir.x * 11000, dir.y * 11000, dir.z * 11000]}>
        <circleGeometry args={[520, 32]} />
        <meshBasicMaterial color="#fff3c4" transparent opacity={0.25} toneMapped={false} fog={false} />
      </mesh>
    </group>
  );
}

function SkySatellites({ reduced }) {
  const ref = useRef(null);
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const n = 90;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = 0.25 + Math.random() * 1.2; // elevation radians
      const r = 9500;
      pos[i * 3] = Math.cos(a) * Math.cos(e) * r;
      pos[i * 3 + 1] = Math.sin(e) * r;
      pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);
  useEffect(() => () => geom.dispose(), [geom]);
  useFrame((_, dt) => {
    if (!reduced && ref.current) ref.current.rotation.y += dt * 0.004;
  });
  return (
    <points ref={ref} geometry={geom} frustumCulled={false}>
      <pointsMaterial size={26} color="#ffffff" transparent opacity={0.75} sizeAttenuation={false} fog={false} depthWrite={false} />
    </points>
  );
}

// --- portal ------------------------------------------------------------------

function makeLabelSprite(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.font = '800 64px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd700';
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 12;
  ctx.fillText(text, 256, 84);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(14, 3.5, 1);
  return sprite;
}

function Portal({ def, y, reduced, onEnter }) {
  const ring = useRef(null);
  const disc = useRef(null);
  const label = useMemo(() => makeLabelSprite(def.name), [def.name]);
  useEffect(() => () => {
    label.material.map.dispose();
    label.material.dispose();
  }, [label]);
  useFrame(({ clock }) => {
    if (reduced) return;
    const t = clock.elapsedTime;
    if (ring.current) ring.current.rotation.z = t * 0.6;
    if (disc.current) disc.current.material.opacity = 0.35 + Math.sin(t * 2.2) * 0.12;
  });
  return (
    <group position={[def.x, y + 4.5, def.z]}>
      <mesh ref={ring}>
        <torusGeometry args={[4, 0.4, 14, 48]} />
        <meshStandardMaterial color="#201803" emissive="#ffd700" emissiveIntensity={1.4} roughness={0.35} />
      </mesh>
      <mesh ref={disc}>
        <circleGeometry args={[3.7, 40]} />
        <meshBasicMaterial color="#ffdf80" transparent opacity={0.35} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <primitive object={label} position={[0, 6.4, 0]} />
    </group>
  );
}

// --- gold bar ------------------------------------------------------------------

function GoldBar({ def, y, collected, reduced, onCollect }) {
  const ref = useRef(null);
  useFrame(({ clock }) => {
    if (reduced || collected || !ref.current) return;
    const t = clock.elapsedTime;
    ref.current.rotation.y = t * 1.2;
    ref.current.position.y = y + 0.6 + Math.sin(t * 1.8) * 0.15;
  });
  if (collected) return null;
  return (
    <mesh ref={ref} position={[def.x, y + 0.6, def.z]}>
      <boxGeometry args={[0.7, 0.35, 0.4]} />
      <meshStandardMaterial
        color="#ffd700"
        metalness={1.0}
        roughness={0.22}
        emissive="#8a6d00"
        emissiveIntensity={0.35}
      />
    </mesh>
  );
}

// --- main scene ------------------------------------------------------------------

export default function StreetScene({
  destKey,
  bikeKey = 'wisp',
  tilesRenderer,
  reduced,
  controlsRef,
  mode, // 'ride' | 'fly' | 'walk'
  autopilot,
  onAutopilotEnd,
  onGold,
  // Called when the rider walks into a portal instead of pushing the
  // route directly — the page rides the vortex (Merlin, 2026-10-29).
  onPortalEnter,
}) {
  const router = useRouter();
  const { camera, scene } = useThree();
  const layout = useMemo(() => streetLayout(destKey), [destKey]);
  const slots = useMemo(() => billboardInventory(), []);
  const [grounded, setGrounded] = useState(null); // { billboards: [{x,y,z}], portals: [...], gold: [...] }
  const [foundIds, setFoundIds] = useState(() => collectedBarIds(destKey));
  const [sessionFinds, setSessionFinds] = useState(0);

  const rig = useRef({
    pos: new THREE.Vector3(0, STREET_HOVER_M + 2, -14),
    yaw: 0,
    // camYaw: the camera's facing yaw — the ONLY steering master in ride
    // mode (see the ride branch below). Driven purely by look input, never
    // by the bike's own heading, which breaks the chase-cam circularity.
    camYaw: 0,
    bankTarget: 0,
    groundY: 0,
    groundYSmooth: 0,
    lastSample: 0,
    keys: {},
    portalCooldown: 0,
  });
  const ray = useMemo(() => new THREE.Raycaster(), []);
  const scratch = useMemo(
    () => ({
      fwd: new THREE.Vector3(),
      down: new THREE.Vector3(0, -1, 0),
      origin: new THREE.Vector3(),
      ahead: new THREE.Vector3(),
      camGoal: new THREE.Vector3(),
      look: new THREE.Vector3(),
      v: new THREE.Vector3(),
    }),
    []
  );
  const autoAngle = useRef(0.6);

  // Keep the steering master aligned whenever ride mode is (re)entered,
  // so the bike never swings toward a stale camera yaw after fly/walk.
  const prevMode = useRef(mode);
  useEffect(() => {
    if (mode === 'ride' && prevMode.current !== 'ride') {
      rig.current.camYaw = rig.current.yaw;
      rig.current.bankTarget = 0;
    }
    prevMode.current = mode;
  }, [mode]);

  // Fog + lights for the street world.
  useEffect(() => {
    scene.fog = new THREE.Fog(0xc3d9ec, 250, 8000);
    return () => {
      scene.fog = null;
    };
  }, [scene]);

  // Keyboard.
  useEffect(() => {
    const down = (e) => {
      rig.current.keys[e.code] = true;
    };
    const up = (e) => {
      rig.current.keys[e.code] = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // Ground the monuments/portals/gold on the real terrain once tiles arrive.
  useEffect(() => {
    if (!tilesRenderer) return;
    let alive = true;
    const group = tilesRenderer.group;
    const rc = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0);
    const o = new THREE.Vector3();
    const sample = (x, z) => {
      o.set(x, 120, z);
      rc.set(o, down);
      rc.far = 400;
      try {
        const hits = rc.intersectObject(group, true);
        if (hits.length) return hits[0].point.y;
      } catch {
        /* tiles still streaming */
      }
      return 0;
    };
    // Defer one tick so the street transform has applied.
    const id = setTimeout(() => {
      if (!alive) return;
      setGrounded({
        billboards: layout.billboards.map((b) => ({ ...b, y: sample(b.x, b.z) })),
        portals: layout.portals.map((p) => ({ ...p, y: sample(p.x, p.z) })),
        gold: layout.goldBars.map((g) => ({ ...g, y: sample(g.x, g.z) })),
      });
    }, 1200);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [tilesRenderer, layout]);

  const sampleGround = (x, z, fromY) => {
    if (!tilesRenderer) return null;
    const s = scratch;
    s.origin.set(x, fromY + 80, z);
    ray.set(s.origin, s.down);
    ray.far = 200;
    try {
      const hits = ray.intersectObject(tilesRenderer.group, true);
      if (hits.length) return hits[0].point.y;
    } catch {
      /* streaming */
    }
    return null;
  };

  useFrame((state, rawDt) => {
    const dt = Math.min(0.05, rawDt || 0.016);
    const r = rig.current;
    const s = scratch;
    const ctl = controlsRef.current;
    const now = state.clock.elapsedTime;

    // --- input ---
    let thrust = ctl.thrust;
    let strafe = ctl.strafe;
    let vertical = ctl.vertical;
    const k = r.keys;
    if (k['KeyW'] || k['ArrowUp']) thrust += 1;
    if (k['KeyS'] || k['ArrowDown']) thrust -= 1;
    if (k['KeyA'] || k['ArrowLeft']) strafe -= 1;
    if (k['KeyD'] || k['ArrowRight']) strafe += 1;
    if (k['Space']) vertical += 1;
    if (k['ShiftLeft'] || k['ShiftRight'] || k['KeyC']) vertical -= 1;
    thrust = Math.max(-1, Math.min(1, thrust));
    strafe = Math.max(-1, Math.min(1, strafe));
    vertical = Math.max(-1, Math.min(1, vertical));

    if (autopilot && (Math.abs(thrust) > 0.15 || Math.abs(strafe) > 0.15 || Math.abs(vertical) > 0.15)) {
      onAutopilotEnd && onAutopilotEnd();
    }

    // --- throttled terrain sampling: under the bike + 20m ahead (wall predict) ---
    if (now * 1000 - r.lastSample > GROUND_SAMPLE_MS) {
      r.lastSample = now * 1000;
      s.fwd.set(Math.sin(r.yaw), 0, Math.cos(r.yaw));
      const g = sampleGround(r.pos.x, r.pos.z, r.pos.y);
      if (g != null) r.groundY = g;
      const aheadG = sampleGround(r.pos.x + s.fwd.x * 20, r.pos.z + s.fwd.z * 20, r.pos.y + 10);
      r.wallAhead = aheadG != null && aheadG - r.pos.y > 4.5;
    }
    r.groundYSmooth += (r.groundY - r.groundYSmooth) * Math.min(1, dt * 4);

    // --- movement ---
    s.fwd.set(Math.sin(r.yaw), 0, Math.cos(r.yaw));
    if (autopilot && !reduced) {
      // Cinematic circuit: 130m ring at ~55m over downtown.
      autoAngle.current += dt * 0.09;
      const a = autoAngle.current;
      const nx = Math.cos(a) * 130;
      const nz = Math.sin(a) * 130;
      r.yaw = Math.atan2(-(Math.cos(a + 0.02) * 130 - nx), -(Math.sin(a + 0.02) * 130 - nz));
      r.pos.x = nx;
      r.pos.z = nz;
      r.pos.y += (r.groundYSmooth + 55 - r.pos.y) * Math.min(1, dt * 2);
      r.camYaw = r.yaw; // keep the steering master aligned for handoff
    } else if (mode === 'fly') {
      const sp = FLY_SPEED * (0.35 + 0.65 * Math.abs(thrust)) * Math.sign(thrust || 1);
      r.yaw -= strafe * 1.6 * dt;
      s.fwd.set(Math.sin(r.yaw), 0, Math.cos(r.yaw));
      // Wall deflect: slide, bounce back gently, never stop dead.
      if (r.wallAhead && thrust > 0) {
        r.pos.addScaledVector(s.fwd, -6 * dt);
        r.yaw += 1.4 * dt;
        if (!r.bumpFx || now - r.bumpFx > 1.2) {
          r.bumpFx = now;
          try { fx.tap(); } catch { /* audio unavailable */ }
        }
      } else {
        r.pos.addScaledVector(s.fwd, sp * thrust * dt);
      }
      r.pos.y = Math.max(r.groundYSmooth + 2, Math.min(400, r.pos.y + vertical * 22 * dt));
    } else if (mode === 'walk') {
      r.yaw -= strafe * 1.9 * dt;
      s.fwd.set(Math.sin(r.yaw), 0, Math.cos(r.yaw));
      if (!(r.wallAhead && thrust > 0)) {
        r.pos.addScaledVector(s.fwd, WALK_SPEED * thrust * dt);
      }
      r.pos.y += (r.groundYSmooth + STREET_WALK_EYE_M - r.pos.y) * Math.min(1, dt * 6);
    } else {
      // ride: terrain-following bike — camera-relative steering.
      //
      // Steering scheme (Merlin 2026-09-30: "make sure bike goes in the
      // direction the camera is pointed at"). The old chase camera DERIVED
      // from the bike's heading, which makes "steer by camera" circular.
      // Resolved by splitting the two: camYaw is the camera's facing yaw
      // and the ONLY steering master — driven purely by look input
      // (right-side drag lookDX, A/D keys, joystick strafe), never by the
      // bike. The bike's heading chases camYaw at a capped rate and the
      // bike always travels along its own heading, so it swings onto the
      // camera's line with a natural turn lag + banking instead of
      // snapping. Drag right -> camera turns right -> bike follows right.
      //
      // Pass-through (Merlin 2026-09-30 explicit override of the
      // solid-state rule, ride mode ONLY): isWallDeflectionEnabled('ride')
      // is false, so the wall-predict deflect is gone — the bike ghosts
      // through buildings and solid objects with the rider still mounted
      // (no bounce, no deflect, no dismount). Terrain following STAYS: the
      // bike still rides the streets, it just doesn't hit walls.
      const steer = updateRideSteering(r, { strafe, thrust, lookDX: ctl.lookDX || 0 }, dt);
      r.yaw = steer.yaw;
      r.camYaw = steer.camYaw;
      ctl.lookDX = 0; // drained every frame: drag deltas are per-frame, so a
      // released drag leaves nothing behind and the ±40 clamp never sticks
      s.fwd.set(Math.sin(r.yaw), 0, Math.cos(r.yaw));
      r.pos.addScaledVector(s.fwd, RIDE_SPEED * thrust * dt);
      r.pos.y += (r.groundYSmooth + STREET_HOVER_M - r.pos.y) * Math.min(1, dt * 5);
      // Banking follows the turn: lean into the heading chase.
      r.bankTarget = Math.max(-0.35, Math.min(0.35, angleDiff(r.yaw, r.camYaw) * 0.6));
    }

    // --- portals: the ONLY pass-through ---
    if (grounded && now > r.portalCooldown) {
      for (const p of grounded.portals) {
        const dx = r.pos.x - p.x;
        const dz = r.pos.z - p.z;
        if (dx * dx + dz * dz < 49 && Math.abs(r.pos.y - (p.y + 4.5)) < 7) {
          r.portalCooldown = now + 3;
          try { fx.portal(); } catch { /* audio unavailable */ }
          if (onPortalEnter) onPortalEnter(p.route, p.name);
          else router.push(p.route);
          break;
        }
      }
    }

    // --- gold bars ---
    if (grounded) {
      for (const gbar of grounded.gold) {
        if (foundIds.has(gbar.id)) continue;
        const dx = r.pos.x - gbar.x;
        const dy = r.pos.y - (gbar.y + 0.6);
        const dz = r.pos.z - gbar.z;
        if (dx * dx + dy * dy + dz * dz < 36) {
          const next = new Set(foundIds);
          next.add(gbar.id);
          setFoundIds(next);
          markBarCollected(destKey, gbar.id);
          const total = addLiquidGold(STREET_GOLD_PER_BAR);
          const finds = sessionFinds + 1;
          setSessionFinds(finds);
          onGold && onGold(total, finds);
          try { fx.tap(); } catch { /* audio unavailable */ }
        }
      }
    }
  });

  // --- camera + bike transform (separate frame loop for clarity) ---
  const bikeGroup = useRef(null);
  useFrame((state, rawDt) => {
    const dt = Math.min(0.05, rawDt || 0.016);
    const r = rig.current;
    const s = scratch;
    const ctl = controlsRef.current;
    s.fwd.set(Math.sin(r.yaw), 0, Math.cos(r.yaw));

    if (bikeGroup.current && mode !== 'walk') {
      bikeGroup.current.position.copy(r.pos);
      bikeGroup.current.rotation.set(0, r.yaw, 0);
      // Banking into the turn: ride mode leans with the heading chase,
      // fly keeps the old strafe lean.
      const strafe = Math.max(-1, Math.min(1, ctl.strafe));
      const bankTarget = mode === 'ride' ? r.bankTarget || 0 : -strafe * 0.28;
      bikeGroup.current.rotation.z = THREE.MathUtils.lerp(
        bikeGroup.current.rotation.z,
        bankTarget,
        Math.min(1, dt * 6)
      );
    }

    if (mode === 'walk') {
      camera.position.set(r.pos.x, r.pos.y, r.pos.z);
      s.look.set(r.pos.x + s.fwd.x * 10, r.pos.y - 0.4, r.pos.z + s.fwd.z * 10);
      camera.lookAt(s.look);
    } else {
      const back = mode === 'fly' ? 13 : 10;
      const up = mode === 'fly' ? 5.5 : 4.2;
      const oy = (ctl.lookDY || 0) * 0.02;
      // Ride mode: the camera sits behind the CAMERA yaw (the steering
      // master) and looks along it — the bike visibly swings onto the view
      // line. lookDX is steering input in ride mode now, not a dolly
      // offset, so the old back-distance nudge is dropped there. Fly keeps
      // the previous yaw-chase framing untouched.
      const viewYaw = mode === 'ride' ? r.camYaw : r.yaw;
      s.fwd.set(Math.sin(viewYaw), 0, Math.cos(viewYaw));
      const ox = mode === 'ride' ? 0 : (ctl.lookDX || 0) * 0.02;
      s.camGoal
        .copy(r.pos)
        .addScaledVector(s.fwd, -(back + ox * 20))
        .add(s.v.set(0, up + oy * 30, 0));
      const step = Math.min(1, dt * 5);
      camera.position.lerp(s.camGoal, step);
      s.look.copy(r.pos).addScaledVector(s.fwd, 12);
      camera.lookAt(s.look);
    }
  });

  const Bike = BIKES[bikeKey] || BIKES.wisp;
  const bikeColor = BIKE_COLORS[bikeKey] || BIKE_COLORS.wisp;
  const bb = grounded ? grounded.billboards : layout.billboards.map((b) => ({ ...b, y: 0 }));
  const pp = grounded ? grounded.portals : layout.portals.map((p) => ({ ...p, y: 0 }));
  const gg = grounded ? grounded.gold : layout.goldBars.map((g) => ({ ...g, y: 0 }));

  return (
    <>
      <hemisphereLight args={['#bcd6f0', '#5c6b7a', 0.85]} />
      <SkyDome />
      <Sun />
      <SkySatellites reduced={reduced} />

      {bb.map((b) => {
        const slot = slots[b.slot % slots.length];
        return (
          <BillboardMonument
            key={`bb-${b.slot}`}
            slot={slot}
            position={[b.x, b.y, b.z]}
            faceAngle={b.faceAngle}
            reduced={reduced}
          />
        );
      })}

      {pp.map((p) => (
        <Portal key={p.route} def={p} y={p.y} reduced={reduced} />
      ))}

      {gg.map((gbar) => (
        <GoldBar
          key={gbar.id}
          def={gbar}
          y={gbar.y}
          collected={foundIds.has(gbar.id)}
          reduced={reduced}
        />
      ))}

      {mode !== 'walk' && (
        <group ref={bikeGroup}>
          <Bike color={bikeColor} />
          <TronRider bikeKey={bikeKey} reduced={reduced} />
        </group>
      )}
    </>
  );
}
