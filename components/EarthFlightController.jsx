'use client';
import { useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { latLonToVec3, vec3ToLatLon, easeInOutCubic } from '@/lib/geo';
import {
  roamState,
  beginRoam,
  cameraRig,
  ROAM_PITCH_MIN,
  ROAM_PITCH_MAX,
} from '@/lib/earth/roam';
import {
  getHeightData,
  loadHeightData,
  surfaceRadiusOrBase,
} from '@/lib/earth/heightmap';
import {
  carState,
} from '@/lib/earth/parachute';
import {
  DISPLAY_UNITS_PER_METRE,
  globeGridSurfaceRadius,
} from '@/lib/earth/placements';
import { effectiveEarthViewMode } from '@/lib/earth/view-mode';
import { getInteriorAltM } from '@/lib/earth/interiors';
import { patchFacetRadiusAt } from '@/lib/earth/street-patch';

export const EARTH_CENTER = new THREE.Vector3(0, -30, -80);
const HUB_HOME = new THREE.Vector3(0, 75, 20);

// Cinematic Earth flights. The core idea (Merlin's driving
// experiment): the traveler drives — the WORLD moves.
// Destination travel rotates the planet under a fixed camera
// instead of flying the camera across it.
//
// VEHICLES ONLY (Merlin, 2026-11-15): Earth 1 has no walker, no
// on-foot mode, no climb (ladders / monument elevators served
// the walker), no bike, and no Redwater journey (it was reached
// on foot). The street is driving only: 'diving_to_street'
// continues the dive past the overlook all the way down to the
// mounted vehicle, and 'earth_roam' drives it — the page
// joystick (full-tilt analog: push farther, move faster) and
// right-side drag-look drive the supercar (EarthSupercar owns
// roamState while mounted). Street level runs on the terrain
// globe (the layer that carries the placed world); NexusEarth
// forces that layer while roaming.
export default function EarthFlightController({
  launchState, setLaunchState, quatRef, focus, pendingDest, onArriveDest, controls,
}) {
  const { camera } = useThree();
  const travel = useRef(null);
  const streetDive = useRef(null);

  const smoothLook = (target, delta, speed = 4) => {
    const m = new THREE.Matrix4().lookAt(camera.position, target, camera.up);
    const tq = new THREE.Quaternion().setFromRotationMatrix(m);
    camera.quaternion.slerp(tq, 1 - Math.exp(-speed * delta));
  };

  // The street rig in world space: globe-local rig points rotated
  // by the shared planet quaternion and centred on EARTH_CENTER —
  // the same transform the dive math has always used.
  //
  // REMOVED 2026-10-26 (Merlin: "Remove the quantum realm
  // completely"): the old shrink/reanimate scaling is gone. The
  // camera offsets are used exactly as the rig computes them — one
  // level, normal size, always.
  const streetRigWorld = () => {
    const hd = getHeightData();
    // View mode (lib/earth/view-mode.js): the traveler's first /
    // third person choice — it rules everywhere now.
    const rig = cameraRig(roamState, hd ? hd.data : null, hd ? hd.w : 0, hd ? hd.h : 0, {
      firstPerson: effectiveEarthViewMode() === 'first',
      // The embodied character's measured size (published by
      // EarthWalker): the boom frames the whole body, raptor
      // included — not a human's 7.5 m default shot.
      charSizeM: roamState.charSizeM || null,
      // No water on Earth 1 (2026-10-26): no swim lift — the rig
      // frames the walker standing on the ground, seabed included.
    });
    const q = quatRef.current;
    const toWorld = (p) => new THREE.Vector3(p.x, p.y, p.z).applyQuaternion(q).add(EARTH_CENTER);

    // Rig lift along the surface normal: interior altitude only
    // (climb — ladders/elevators — and the bike's hover lift are
    // gone with the walker and the bike; the rig no longer lifts
    // for either).
    const altU = getInteriorAltM() * DISPLAY_UNITS_PER_METRE;
    const n = new THREE.Vector3(rig.normal.x, rig.normal.y, rig.normal.z);
    const ground = new THREE.Vector3(rig.ground.x, rig.ground.y, rig.ground.z);

    // Lift the rig points by climb altitude, then place in the world.
    const liftFromGround = (p) => {
      const v = new THREE.Vector3(p.x, p.y, p.z);
      v.addScaledVector(n, altU);
      return v;
    };
    const groundLifted = ground.clone().addScaledVector(n, altU);

    return {
      rig,
      camPos: toWorld(liftFromGround(rig.camPos)),
      look: toWorld(liftFromGround(rig.lookTarget)),
      ground: toWorld(groundLifted),
      up: new THREE.Vector3(rig.normal.x, rig.normal.y, rig.normal.z).applyQuaternion(q),
    };
  };

  const lookAtQuat = (pos, target, up) => {
    const m = new THREE.Matrix4().lookAt(pos, target, up);
    return new THREE.Quaternion().setFromRotationMatrix(m);
  };

  // At street scale the default near plane (0.1) would clip the
  // ground at the traveler's feet; shrink it with altitude.
  // CRITICAL: the distance passed in must be the world-space
  // camera-to-ground distance.
  const tuneNear = (distToGround) => {
    const near = THREE.MathUtils.clamp(distToGround * 0.15, 1e-8, 0.06);
    if (Math.abs(camera.near - near) > 0.002) {
      camera.near = near;
      camera.updateProjectionMatrix();
    }
  };
  const restoreNear = () => {
    if (Math.abs(camera.near - 0.1) > 0.002) {
      camera.near = 0.1;
      camera.updateProjectionMatrix();
    }
  };

  useFrame((state, delta) => {
    if (launchState === 'diving_to_earth' && focus && quatRef.current) {
      const lp = latLonToVec3(focus.lat, focus.lon, 55);
      const local = new THREE.Vector3(lp.x, lp.y, lp.z);
      const world = local.applyQuaternion(quatRef.current).add(EARTH_CENTER);
      const n = world.clone().sub(EARTH_CENTER).normalize();
      const desired = world.clone().addScaledVector(n, 20);
      camera.position.lerp(desired, 1 - Math.exp(-2.5 * delta));
      smoothLook(world, delta, 4);
      if (camera.position.distanceTo(desired) < 1.2) {
        setLaunchState('earth_surface');
      }
    } else if (launchState === 'earth_travel' && pendingDest && quatRef.current) {
      if (!travel.current) {
        const lp = latLonToVec3(pendingDest.lat, pendingDest.lon, 1);
        const pLocal = new THREE.Vector3(lp.x, lp.y, lp.z).normalize();
        const camDir = camera.position.clone().sub(EARTH_CENTER).normalize();
        travel.current = {
          t: 0,
          dur: 3.8,
          q0: quatRef.current.clone(),
          q1: new THREE.Quaternion().setFromUnitVectors(pLocal, camDir),
        };
      }
      const tr = travel.current;
      tr.t += delta / tr.dur;
      const k = easeInOutCubic(Math.min(tr.t, 1));
      quatRef.current.slerpQuaternions(tr.q0, tr.q1, k);
      camera.fov = THREE.MathUtils.lerp(camera.fov, 46, delta * 2);
      camera.updateProjectionMatrix();
      if (tr.t >= 1) {
        travel.current = null;
        camera.fov = 52;
        camera.updateProjectionMatrix();
        onArriveDest(pendingDest);
      }
    } else if (launchState === 'diving_to_street' && quatRef.current) {
      if (!streetDive.current) {
        if (!roamState.active && focus) {
          beginRoam(roamState, focus.lat, focus.lon, roamState.yawDeg || 0);
        }
        loadHeightData();
        // Street dive (2026-10-26, quantum removed): a pure camera
        // descent to the surface. The traveler lands at NORMAL size
        // on the ground — no shrink, no second level. Spawning here
        // used to start the parachute shrink, which emptied the
        // world into a black void (the "quantum realm" in Merlin's
        // footage); that call is gone, and the scale it drove is
        // gone with it.
        streetDive.current = {
          t: 0,
          dur: 3.2,
          fromPos: camera.position.clone(),
          fromQuat: camera.quaternion.clone(),
        };
      }
      const dv = streetDive.current;
      dv.t += delta / dv.dur;
      const k = easeInOutCubic(Math.min(dv.t, 1));
      const { rig, camPos, look, up } = streetRigWorld();
      camera.position.lerpVectors(dv.fromPos, camPos, k);
      camera.quaternion.slerpQuaternions(
        dv.fromQuat, lookAtQuat(camera.position, look, up), k,
      );
      tuneNear(Math.hypot(
        rig.camPos.x - rig.ground.x,
        rig.camPos.y - rig.ground.y,
        rig.camPos.z - rig.ground.z,
      ));
      camera.fov = THREE.MathUtils.lerp(camera.fov, 55, delta * 2);
      camera.updateProjectionMatrix();
      if (dv.t >= 1) {
        streetDive.current = null;
        setLaunchState('earth_roam');
      }
    } else if (launchState === 'earth_roam' && quatRef.current) {
      const c = controls.current;
      // Look: the page's right-side drag, in compass terms (drag
      // right turns right, drag down pitches the view down — the
      // hub's own drag feel, mapped onto the orbit rig).
      if (c.lookDeltaX !== 0 || c.lookDeltaY !== 0) {
        roamState.yawDeg = (roamState.yawDeg + c.lookDeltaX * 0.15) % 360;
        roamState.pitchDeg = THREE.MathUtils.clamp(
          roamState.pitchDeg + c.lookDeltaY * 0.05,
          ROAM_PITCH_MIN, ROAM_PITCH_MAX,
        );
        c.lookDeltaX = 0;
        c.lookDeltaY = 0;
      }
      // No walk stepping (vehicles only): the supercar owns
      // roamState while mounted (EarthSupercar syncs it every
      // frame) — the walker stepping that used to run here is
      // gone with the walker.
      if (!roamState.moving) roamState.faceDeg = roamState.yawDeg;

      // Street camera: the Redwater journey used to own the lens
      // while journeyActive — the journey is gone with the walker,
      // so the street camera block always runs.
      {
        const { rig, camPos, look, up } = streetRigWorld();
        // First person sits AT the head (2026-10-26, street QA 3):
        // the old exponential lerp trailed the lens behind a fast
        // car by speed/20 — at boost the "first person" view showed
        // the car's rear from metres back, and as speed fell the
        // lens closed onto the roof. Third person keeps the soft
        // boom follow; first person snaps to the head exactly.
        if (effectiveEarthViewMode() === 'first') {
          camera.position.copy(camPos);
        } else {
          // Third-person boom follow at speed (2026-10-27
          // driving video: the chase camera pulled far back
          // intermittently at boost). The old flat 20/s rate
          // trailed a moving target by speed/20 — 27 display m
          // at Aventador boost (540 display m/s), so the boom
          // sat ~4× its 7.5 m design distance on every
          // acceleration. Scale the rate with mounted speed so
          // the lag stays under a metre at any speed; the
          // walking rate (20) is untouched.
          const speedMps = carState.mounted ? (carState.speed || 0) * 3 : 0;
          const rate = 20 + speedMps * 1.5;
          camera.position.lerp(camPos, 1 - Math.exp(-rate * delta));
        }
        camera.quaternion.copy(lookAtQuat(camera.position, look, up));
        tuneNear(Math.hypot(
          rig.camPos.x - rig.ground.x,
          rig.camPos.y - rig.ground.y,
          rig.camPos.z - rig.ground.z,
        ));
        camera.fov = THREE.MathUtils.lerp(camera.fov, 55, delta * 2);
        camera.updateProjectionMatrix();
      }
    } else if (launchState === 'earth_surface') {
      // Glide to the overlook when we are not there (arriving from
      // street level on ascend, or settling the dive's last
      // stretch); once settled, the surface look-around owns it.
      let settled = false;
      if (focus && quatRef.current) {
        const lp = latLonToVec3(focus.lat, focus.lon, 55);
        const world = new THREE.Vector3(lp.x, lp.y, lp.z)
          .applyQuaternion(quatRef.current).add(EARTH_CENTER);
        const n = world.clone().sub(EARTH_CENTER).normalize();
        const desired = world.clone().addScaledVector(n, 20);
        if (camera.position.distanceTo(desired) > 0.35) {
          camera.position.lerp(desired, 1 - Math.exp(-2.8 * delta));
          smoothLook(world, delta, 4);
          restoreNear();
        } else {
          settled = true;
        }
      } else {
        settled = true;
      }
      if (settled) {
        // Explorable: look around from the surface.
        if (controls.current.lookDeltaX !== 0 || controls.current.lookDeltaY !== 0) {
          camera.rotation.order = 'YXZ';
          camera.rotation.y -= controls.current.lookDeltaX * 0.003;
          camera.rotation.x -= controls.current.lookDeltaY * 0.003;
          camera.rotation.x = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, camera.rotation.x));
          camera.rotation.z = 0;
          controls.current.lookDeltaX = 0;
          controls.current.lookDeltaY = 0;
        }
      }
    } else if (launchState === 'returning_to_orbit') {
      restoreNear();
      camera.position.lerp(HUB_HOME, 1 - Math.exp(-2.2 * delta));
      smoothLook(new THREE.Vector3(0, 35, -60), delta, 3);
      camera.fov = THREE.MathUtils.lerp(camera.fov, 52, delta * 3);
      camera.updateProjectionMatrix();
      if (camera.position.distanceTo(HUB_HOME) < 2) {
        setLaunchState('hub_freeroam');
      }
    }

    // Floor clamp: camera never passes below the terrain (street phases only).
    // Pushes the camera out along the surface normal if it's under the floor.
    // This is the ABSOLUTE cutoff — the land layer is the limit, no exceptions.
    // Uses the TRUE local surface radius at the traveler (not a flat 55):
    // at high-elevation sites the flat value let the clamp fight the rig
    // (the Christ the Redeemer shake). While inside an interior the
    // authored interior path owns altitude, so the clamp stands down
    // entirely there.
    if ((launchState === 'diving_to_street' || launchState === 'earth_roam') && getInteriorAltM() <= 0.05) {
      const camPos = camera.position;
      // Earth center in world space
      const ex = 0, ey = -30, ez = -80;
      const dx = camPos.x - ex, dy = camPos.y - ey, dz = camPos.z - ez;
      const distFromCenter = Math.hypot(dx, dy, dz) || 1;
      // Minimum distance: the terrain surface UNDER THE CAMERA +
      // 0.3m margin. Round 3 (the black-band
      // shot): this clamp used to read the surface at the WALKER's
      // lat/lon — but the boom parks the lens metres behind him,
      // where a rising slope or a structure's side can stand higher
      // than his own ground; the lens sank under THAT surface and
      // the frame filled with geometry undersides. The camera now
      // answers for its own position: un-rotate the world offset
      // into globe-local space, recover the camera's lat/lon, and
      // clamp against the surface there (cameraRig applies the
      // same law in rig space; this is the world-space backstop).
      let camLat = roamState.lat;
      let camLon = roamState.lon;
      if (quatRef.current) {
        const invQ = quatRef.current.clone().invert();
        const camLocal = new THREE.Vector3(dx, dy, dz).applyQuaternion(invQ);
        const camLL = vec3ToLatLon(camLocal);
        if (camLL.radius > 0) { camLat = camLL.lat; camLon = camLL.lon; }
      }
      // The backstop reads the DRAWN surface like cameraRig does
      // (round 4, defect 5): the higher of the true sampled
      // surface and the coarse globe-grid surface the facets and
      // the street patch actually render — on relief the grid
      // stands above the smooth surface, and a true-only clamp
      // still let the lens enter a facet and white out.
      let floorR = surfaceRadiusOrBase(camLat, camLon);
      const hdClamp = getHeightData();
      if (hdClamp) {
        floorR = Math.max(
          floorR,
          globeGridSurfaceRadius(hdClamp.data, hdClamp.w, hdClamp.h, camLat, camLon),
        );
      }
      // Drawn-facet floor (2026-10-26, street QA 3): on concave
      // ground the street patch's facet stands above both smooth
      // samplers, and the lens went under terrain (black frames).
      const facetR = patchFacetRadiusAt(camLat, camLon);
      if (facetR != null) floorR = Math.max(floorR, facetR);
      const minDist = floorR
        + 0.3 * DISPLAY_UNITS_PER_METRE;
      if (distFromCenter < minDist) {
        const push = (minDist - distFromCenter) / distFromCenter;
        camPos.x += dx * push;
        camPos.y += dy * push;
        camPos.z += dz * push;
      }
    }
  });

  return null;
}
