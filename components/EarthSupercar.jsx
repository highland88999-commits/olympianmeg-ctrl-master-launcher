'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { stepFlight } from '@/lib/nova-flight';
import { latLonToVec3 } from '@/lib/geo';
import { surfaceRadiusOrBase } from '@/lib/earth/heightmap';
import { DISPLAY_UNITS_PER_METRE } from '@/lib/earth/placements';
import { roamState, tangentFrame, headingVector } from '@/lib/earth/roam';
import { carState } from '@/lib/earth/parachute';
import { getVehicle, resolveCraftId, boostTopSpeed } from '@/lib/earth/vehicles';
import { getVehicleModel, subscribeVehicleModel, ensureVehicleModel } from '@/lib/earth/vehicle-model';
import { buildJetFlame, animateJetFlame } from '@/lib/earth/jet-flame';
import { moveWithCollision } from '@/lib/earth/collision';
import { patchFacetRadiusAt } from '@/lib/earth/street-patch';
import { effectiveEarthViewMode } from '@/lib/earth/view-mode';

// EarthSupercar — the summonable Earth 1 vehicle (file name is
// historical: it began as the Lamborghini Aventador only).
//
// 2026-10-26, craft expansion (Merlin: "when a user clicks car,
// make it get them to let them select their craft, just like the
// character selection"): this component now renders the SELECTED
// craft from the Earth vehicle roster (lib/earth/vehicles.js) —
// the wedge-supercar stays the default, so nothing changes for a
// traveler who never opens the picker. The drive pattern is the
// EarthBike pattern exactly (shared singleton carState, summon +
// auto-mount, great-circle stepping, solid collision, roamState
// sync so the street camera follows), with per-craft tuning,
// hover height, and length from the roster.
//
// PICK FLOW (mirrors character selection): tapping the car button
// in the Earth console (either branch) while no craft is out
// opens the craft picker; picking a craft spawns it, auto-mounted.
// Picking while mounted swaps the craft in place (position,
// heading, speed kept). The V key keeps its old fast path —
// nothing out summons the currently selected craft directly;
// F still mounts/dismounts. Clicking the 3D craft itself still
// toggles mount (it never opened selection — reported plainly).
//
// BLUE JET FEEL: engine-powered craft (roster engine 'jet') carry
// the Tatooine speeder's blue flame (lib/earth/jet-flame.js — two
// additive cones, visible only while driving, length with speed).
// The one non-jet craft, the rotor Hover Skiff, hovers instead
// and gets no flame. The TRON bike is untouched (separate summon).
//
// GOLD RING REMOVED (Merlin, 2026-10-26): the QA3 metre ring at
// the vehicle's feet (car 2.8–3.2 m) is gone — visual only, no
// logic rode on it (it was a mounted-state coloured mesh, nothing
// else read it). Same removal in EarthBike.
//
// LAZY LOAD (2026-10-26 outage repair, preserved): the model
// starts downloading only on summon — never at street entry.
// A tap while loading is a no-op visually; a failed load stays
// absent (never a crash) and retries on the next summon. Each
// craft's model is cached for the session, so swapping back to a
// ridden craft never re-downloads it.
//
// Dismount law (Merlin, 2026-10-26): exiting the craft VANISHES
// it and the walker takes its place — same law as the bike. The
// character is hidden while driving (EarthWalker) and reappears
// exactly where the craft was.
//
// Model orientation note: a GLB's nose direction is not encoded
// anywhere, so the longest horizontal axis is aligned to the
// heading and the nose is assumed to face +Z after that
// alignment — EXCEPT the five craft the 2026-10-26 silhouette
// audit proved backward (luxury-gt-1, teardrop-coupe, pickup-hd,
// cruiser-bike, ghost-throttle): they carry noseReversed in the
// roster and the loader adds a half-turn (lib/earth/vehicle-model.js
// effectiveRotY). The jet flame rides the group at −Z regardless,
// so a flipped craft's flame stays at its rear. Passers-by
// (EarthPeers) apply the same rotY.

const UPM = DISPLAY_UNITS_PER_METRE;

// Inverse of latLonToVec3 (same helper as EarthBike).
function vec3ToLatLon(x, y, z) {
  const r = Math.hypot(x, y, z) || 1;
  const lat = 90 - (Math.acos(Math.max(-1, Math.min(1, y / r))) * 180) / Math.PI;
  let theta = Math.atan2(z, -x);
  let lon = (theta * 180) / Math.PI - 180;
  while (lon > 180) lon -= 360;
  while (lon < -180) lon += 360;
  return { lat, lon };
}

export function summonCar(craftId) {
  if (!roamState.active) return false;
  if (craftId) carState.craftId = resolveCraftId(craftId);
  const craft = getVehicle(carState.craftId);
  carState.summoned = true;
  carState.mounted = true; // auto-mount: spawn driving
  carState.lat = roamState.lat;
  carState.lon = roamState.lon;
  carState.altM = craft ? craft.hoverM : 0.35;
  carState.yawDeg = roamState.yawDeg;
  carState.speed = 0;
  // LAZY LOAD (see header): the model starts downloading only
  // now, on the summon — never at street entry.
  void ensureVehicleModel(carState.craftId);
  // Nudge a few metres east so it sits beside the walker.
  const frame = tangentFrame(carState.lat, carState.lon);
  const r = surfaceRadiusOrBase(carState.lat, carState.lon);
  const p = latLonToVec3(carState.lat, carState.lon, r);
  const side = new THREE.Vector3(
    p.x + frame.east.x * 3 * UPM,
    p.y + frame.east.y * 3 * UPM,
    p.z + frame.east.z * 3 * UPM,
  );
  const ll = vec3ToLatLon(side.x, side.y, side.z);
  carState.lat = ll.lat;
  carState.lon = ll.lon;
  return true;
}

export function dismissCar() {
  carState.summoned = false;
  carState.mounted = false;
  carState.speed = 0;
}

export function toggleCarMount() {
  if (!carState.summoned) return false;
  carState.mounted = !carState.mounted;
  if (carState.mounted) {
    carState.yawDeg = roamState.yawDeg;
  } else {
    // Dismount: walker takes the craft's position — and the craft
    // vanishes (Merlin, 2026-10-26). The walker reappears exactly
    // where the craft was; summoning again brings a fresh craft.
    roamState.lat = carState.lat;
    roamState.lon = carState.lon;
    roamState.yawDeg = carState.yawDeg;
    carState.summoned = false;
    carState.speed = 0;
  }
  return carState.mounted;
}

/** Swap the mounted craft in place (picker swap while driving):
 *  position, heading, and speed are kept; only the body changes. */
export function swapCarCraft(craftId) {
  const next = getVehicle(craftId);
  if (!next || !carState.summoned) return false;
  carState.craftId = next.id;
  carState.altM = next.hoverM;
  void ensureVehicleModel(next.id);
  return true;
}

export default function EarthSupercar({ controls }) {
  const groupRef = useRef();
  const { camera } = useThree();
  const keys = useRef({});
  // The model arrives via subscription (lib/earth/vehicle-model.js):
  // nothing loads at street entry — only the summon starts the
  // download, so descent never pays a craft's cost. A missing or
  // failed file just leaves the craft absent — never a crash.
  const [craftId, setCraftId] = useState(() => resolveCraftId(carState.craftId));
  const [model, setModel] = useState(() => getVehicleModel(resolveCraftId(carState.craftId)));
  const craft = getVehicle(craftId);
  const flame = useMemo(
    () => (craft && craft.engine === 'jet' ? buildJetFlame(craft.lengthM) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [craftId],
  );
  useEffect(() => subscribeVehicleModel(({ id, model: m }) => {
    if (id === resolveCraftId(carState.craftId)) setModel(m);
  }), []);
  // Dispose a swapped-out flame's cone geometry/materials (the
  // useMemo above rebuilds per craft; nothing else owns them).
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

  // V = summon/dismiss (fast path: summons the selected craft
  // directly — the console buttons are the picker path), F =
  // mount/dismount.
  useEffect(() => {
    const down = (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      keys.current[k] = true;
      if (!roamState.active) return;
      if (k === 'v') {
        if (carState.summoned) dismissCar();
        else summonCar();
      } else if (k === 'f') {
        toggleCarMount();
      }
    };
    const up = (e) => {
      keys.current[e.key.toLowerCase()] = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useFrame((state, rawDt) => {
    const g = groupRef.current;
    // Craft swap detection: the picker writes carState.craftId
    // outside React, so the frame loop is what notices the swap
    // (same poll-the-singleton pattern the console already uses).
    const currentId = resolveCraftId(carState.craftId);
    if (currentId !== craftId) {
      setCraftId(currentId);
      setModel(getVehicleModel(currentId));
      if (!getVehicleModel(currentId)) void ensureVehicleModel(currentId);
    }
    if (!g || !carState.summoned || !roamState.active) {
      if (g) g.visible = false;
      return;
    }
    // First-person clean-view law (2026-10-26, street QA 3): the
    // walker already leaves the frame in first person; the craft
    // does the same while mounted — its roof sits under the lens,
    // so any downward look filled the screen with bodywork.
    // Third person still shows the craft.
    g.visible = !(carState.mounted && effectiveEarthViewMode() === 'first');
    const dt = Math.min(0.05, rawDt || 0.016);
    const tuning = (craft && craft.tuning) || { maxSpeed: 45, accel: 30, turnRate: 1.9, boostMult: 1.6, brakeRate: 55 };

    if (carState.mounted) {
      const c = controls?.current || {};
      const k = keys.current;
      const thrust = -((c.moveY || 0) + ((c.keyS ? 1 : 0) - (c.keyW ? 1 : 0)));
      const turn = (c.moveX || 0) + ((c.keyD ? 1 : 0) - (c.keyA ? 1 : 0));
      const boost = !!(k['shift'] || c.carBoost);
      const brake = thrust < -0.5;
      // Grounded: no rise/sink — a craft drives on the ground
      // (the skiff's hoverM lifts it instead, same channel).
      const f = {
        pos: { x: 0, y: 0, z: 0 },
        yaw: (carState.yawDeg * Math.PI) / 180,
        pitch: 0,
        speed: carState.speed,
      };
      const next = stepFlight(f, { thrust, turn, pitch: 0, boost, brake }, dt, tuning);
      carState.speed = next.speed;
      carState.yawDeg = ((next.yaw * 180) / Math.PI) % 360;

      // Great-circle step along the heading (same stepping as
      // the bike, so the craft and the camera agree exactly).
      const distM = next.speed * dt * 3;
      const distRad = (distM * UPM) / surfaceRadiusOrBase(carState.lat, carState.lon);
      const br = (carState.yawDeg * Math.PI) / 180;
      const p1 = (carState.lat * Math.PI) / 180;
      const l1 = (carState.lon * Math.PI) / 180;
      const lat2 = Math.asin(Math.max(-1, Math.min(1,
        Math.sin(p1) * Math.cos(distRad) + Math.cos(p1) * Math.sin(distRad) * Math.cos(br))));
      const lon2 = l1 + Math.atan2(
        Math.sin(br) * Math.sin(distRad) * Math.cos(p1),
        Math.cos(distRad) - Math.sin(p1) * Math.sin(lat2),
      );
      const newLat = Math.max(-85, Math.min(85, (lat2 * 180) / Math.PI));
      let lonD = (lon2 * 180) / Math.PI;
      while (lonD > 180) lonD -= 360;
      while (lonD < -180) lonD += 360;
      // Solid collision: mountains, large structures, oil rigs
      // block; vegetation pass-through, same rule as the bike.
      // Radius scales with the craft (floor 2.2 m, the old car
      // radius) so the hauler doesn't clip through its own nose.
      const radiusM = Math.max(2.2, (craft ? craft.lengthM : 4.6) / 2);
      const moved = moveWithCollision(carState.lat, carState.lon, newLat, lonD, radiusM, true);
      carState.lat = moved.lat;
      carState.lon = moved.lon;

      // Sync the walker so the street camera follows the craft.
      roamState.lat = carState.lat;
      roamState.lon = carState.lon;
      roamState.yawDeg = carState.yawDeg;
      roamState.moving = Math.abs(next.speed) > 0.5;
      roamState.speed01 = Math.min(1, Math.abs(next.speed) / tuning.maxSpeed);
    }

    // Position on the globe: ground-hugging, like the bike.
    // Never sink under the DRAWN world (2026-10-26, street QA 3):
    // ride the higher of the smooth heightmap surface and the
    // street patch's drawn facet — on concave ground the facet
    // stands above the smooth sample and the craft drove roof-deep
    // into slopes. The facet is null off-patch; smooth stands.
    const surfR = surfaceRadiusOrBase(carState.lat, carState.lon);
    const facetR = patchFacetRadiusAt(carState.lat, carState.lon);
    const groundR = facetR != null ? Math.max(surfR, facetR) : surfR;
    const hoverM = Math.max(0.05, craft ? craft.hoverM : carState.altM);
    const r = groundR + hoverM * UPM;
    const p = latLonToVec3(carState.lat, carState.lon, r);
    g.position.set(p.x, p.y, p.z);

    // Orient: +Z along heading, +Y along surface normal.
    const frame = tangentFrame(carState.lat, carState.lon);
    const fwd = headingVector(frame, carState.yawDeg);
    const normal = new THREE.Vector3(frame.normal.x, frame.normal.y, frame.normal.z);
    const fwdV = new THREE.Vector3(fwd.x, fwd.y, fwd.z);
    const xAxis = new THREE.Vector3().crossVectors(normal, fwdV).normalize();
    const zAxis = new THREE.Vector3().crossVectors(xAxis, normal).normalize();
    const basis = new THREE.Matrix4().makeBasis(xAxis, normal, zAxis);
    g.quaternion.setFromRotationMatrix(basis);

    // Blue jet flame: only while driving, length with speed.
    if (flame) {
      animateJetFlame(flame, {
        driving: carState.mounted && Math.abs(carState.speed) > 1,
        speedRatio: craft ? Math.abs(carState.speed) / boostTopSpeed(craft) : 0,
        time: state.clock.elapsedTime,
      });
    }
  });

  // Keep the camera variable referenced (the mount's frame loop
  // runs inside the Canvas; camera is intentionally unused here
  // — the street rig owns the lens, exactly like EarthBike).
  void camera;

  if (!model) return <group ref={groupRef} visible={false} />;
  return (
    <group
      ref={groupRef}
      visible={false}
      onClick={(e) => {
        e.stopPropagation();
        if (carState.summoned && roamState.active) toggleCarMount();
      }}
    >
      <group scale={model.scale} rotation={[0, model.rotY, 0]}>
        <group position={[0, model.liftY, 0]}>
          <primitive object={model.scene} />
        </group>
      </group>
      {/* Blue jet exhaust (engine craft only) — rides the group,
          so it follows every drive step. The rotor skiff and the
          (separate) TRON bike carry no flame. */}
      {flame && <primitive object={flame.group} />}
    </group>
  );
}
