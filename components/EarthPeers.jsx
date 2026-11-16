'use client';
// components/EarthPeers.jsx — the travelers you pass on Earth 1.
//
// Merlin, 2026-10-26 ("make sure users can see each other in
// passing"): when two users are on Earth 1 near each other —
// driving — each sees the other: their vehicle.
//
// VEHICLES ONLY (Merlin, 2026-11-15): Earth 1 has no walker,
// no on-foot mode, no characters. Peers render as VEHICLES
// only: their craft (cloned from the vehicle cache — the same
// file you drive), blue jet flame while their fixes are moving,
// name tag above. A peer whose row carries no vehicle ('on-foot'
// or unknown) renders NOTHING — there is no on-foot figure any
// more, not even a neutral one. The character sync (platform
// embodiment manager, extension loader, neutral figure) is gone
// with the walker; characterId is sent as null and never read.
//
// REAL, NOT FAKED: this wires the EXISTING presence
// infrastructure (lib/presence.js — DB-polling presence, the
// same client Persephone's AttendanceBar already uses) to the
// Earth sector 'argo:earth'. No bots, no simulated passers-by:
// when presence is unavailable (table missing, no client, no
// session), NOTHING renders and NO count is claimed — the
// Persephone offline law. Presence rows are ephemeral (30 s
// read window, 15 s staleness) and carry no new SQL table —
// but supabase/presence.sql (DRAFT) must gain its character_id
// column before it is run, and running it still needs Merlin's
// green light (see the file header; the client no-ops until
// then, so Earth renders solo until he says go).
//
// RLS LAW (fixed in this build): the draft policies let a
// signed-in rider touch ONLY their own row (auth.uid() = id),
// but the client used the random device sessionId as the row
// id — upserts would be denied. Earth resolves the session
// BEFORE creating the client and passes session.user.id as
// opts.userId; guests keep the sessionId row id.
//
// LIGHTWEIGHT (phone frame rates): position upserts throttle
// to 2.5 s (lib/presence.js UPDATE_MS); polls run on the same
// beat; only the ~6 nearest peers within ~200 m render
// (lib/earth/earth-presence.js); peer positions lerp per frame
// (2.5 s fixes would otherwise jump, worse for driving peers).
// Each peer costs at most one cloned GLB (geometries shared
// with the cache), one name sprite, and — for engine craft —
// two static cones. No particles, no per-peer canvas.
//
// COMBAT (Mario Kart, lib/earth/kart.js): this component also
// publishes the shared peer list (setSharedPeerVehicles —
// id/lat/lon/yaw/craft/speed/label) that EarthKart's torpedo
// and collision checks read, and it renders the peer hit
// sequence for peers THIS client shot: flip 3x around the
// forward axis while flipping, hidden while exploding. (A hit
// peer's own screen flips from the server event; a third
// observer sees the peer stop and resume — the flip visual
// renders on the shooter's screen.)
//
// WHAT IS SENT: lat/lon/yaw (encoded as pos x/y/z), the craft
// id (always — the driver is always in a vehicle), and the
// label 'Traveler' (no name is invented; the row's user_label
// is the client's sanitized label, and Earth sends nothing
// personal). characterId is sent as null — Earth 1 has no
// characters.

import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createPresenceClient } from '@/lib/presence';
import { supabase } from '@/lib/supabase';
import { roamState, tangentFrame, headingVector } from '@/lib/earth/roam';
import { carState } from '@/lib/earth/parachute';
import { latLonToVec3 } from '@/lib/geo';
import { surfaceRadiusOrBase } from '@/lib/earth/heightmap';
import { patchFacetRadiusAt } from '@/lib/earth/street-patch';
import { DISPLAY_UNITS_PER_METRE } from '@/lib/earth/placements';
import {
  EARTH_PRESENCE_SECTOR,
  encodeEarthPos,
  nearbyPeers,
  lerpEarthPos,
  earthDistanceM,
} from '@/lib/earth/earth-presence';
import { getVehicle, isVehicleId } from '@/lib/earth/vehicles';
import { getVehicleModel, ensureVehicleModel } from '@/lib/earth/vehicle-model';
import { buildJetFlame, animateJetFlame } from '@/lib/earth/jet-flame';
import {
  setSharedPeerVehicles,
  peerHitStates,
  advancePeerHit,
  flipRollAngle,
} from '@/lib/earth/kart';

const UPM = DISPLAY_UNITS_PER_METRE;

function localEarthState() {
  // Vehicles only: the driver is always in a vehicle from spawn.
  // Before the mount lands, roamState holds the spawn fix.
  return {
    lat: carState.mounted ? carState.lat : roamState.lat,
    lon: carState.mounted ? carState.lon : roamState.lon,
    yawDeg: carState.mounted ? carState.yawDeg : roamState.yawDeg,
    mounted: true,
    craftId: carState.craftId,
  };
}

function buildNameSprite(label) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 28px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.strokeText(label, 128, 32);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(label, 128, 32);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(6 * UPM, 1.5 * UPM, 1);
  sprite.position.y = 2.7 * UPM;
  sprite.renderOrder = 10;
  return { sprite, texture };
}

function disposeFlame(flame) {
  if (!flame) return;
  flame.group.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) o.material.dispose();
  });
}

function cloneModelInto(parent, model) {
  while (parent.children.length > 0) parent.remove(parent.children[0]);
  const holder = new THREE.Group();
  holder.scale.setScalar(model.scale);
  // Same inner rotation as the player's own craft (EarthSupercar):
  // without it, X-long models rode sideways on passers-by and
  // noseReversed craft rode backward. The flip audit
  // (lib/earth/vehicles.js, 2026-10-26) covers peers too.
  holder.rotation.y = model.rotY || 0;
  const inner = new THREE.Group();
  inner.position.y = model.liftY;
  inner.add(model.scene.clone(true));
  holder.add(inner);
  parent.add(holder);
}

export default function EarthPeers() {
  const parentRef = useRef();
  const clientRef = useRef(null);
  const entriesRef = useRef(new Map()); // key -> entry

  useEffect(() => {
    let cancelled = false;

    // Resolve the session FIRST (RLS law — see header), then
    // create the client with the signed-in id when there is one.
    (async () => {
      let userId = null;
      try {
        const { data } = await supabase.auth.getSession();
        userId = data && data.session ? data.session.user.id : null;
      } catch { /* guest path */ }
      if (cancelled) return;
      const client = createPresenceClient(supabase, {
        sector: EARTH_PRESENCE_SECTOR,
        userId: userId || undefined,
        label: 'Traveler',
        getState: () => {
          const s = localEarthState();
          return {
            pos: encodeEarthPos(s.lat, s.lon, s.yawDeg),
            vehicle: s.craftId,
            characterId: null, // vehicles only: no characters
          };
        },
        onPeers: (peers) => {
          if (cancelled) return;
          const parent = parentRef.current;
          if (!parent) return;
          const local = localEarthState();
          const near = nearbyPeers(peers, local.lat, local.lon);
          const seen = new Set();
          for (const { peer, at } of near) {
            const key = peer.id || peer.key;
            if (!key) continue;
            // Vehicles only: a peer with no vehicle renders
            // nothing — there is no on-foot figure any more.
            const craft = isVehicleId(peer.vehicle) ? peer.vehicle : null;
            if (!craft) continue;
            seen.add(key);
            const nowMs = performance.now();
            let e = entriesRef.current.get(key);
            if (!e) {
              const group = new THREE.Group();
              const { sprite, texture } = buildNameSprite(peer.label || 'Traveler');
              const craftGroup = new THREE.Group();
              group.add(craftGroup, sprite);
              parent.add(group);
              e = {
                key, group, craftGroup,
                nameSprite: sprite, nameTexture: texture,
                display: at, lastFix: at, moving: false,
                craftId: null, flame: null,
                speedMps: 0, fixAtMs: nowMs, prevFix: null, prevFixAtMs: 0,
                label: peer.label || 'Traveler',
              };
              entriesRef.current.set(key, e);
            }
            // Movement + speed across fixes: the flame shows
            // only while the peer's fixes are actually moving,
            // and the speed estimate feeds the torpedo / collision
            // checks (EarthKart reads it via sharedPeerVehicles).
            const moved = earthDistanceM(e.lastFix.lat, e.lastFix.lon, at.lat, at.lon) > 2;
            e.moving = moved;
            if (e.prevFix && nowMs > e.prevFixAtMs) {
              const distM = earthDistanceM(e.prevFix.lat, e.prevFix.lon, at.lat, at.lon);
              e.speedMps = distM / ((nowMs - e.prevFixAtMs) / 1000);
            }
            e.prevFix = e.lastFix;
            e.prevFixAtMs = e.fixAtMs;
            e.lastFix = at;
            e.fixAtMs = nowMs;
            // Craft sync: a valid craft id means mounted; the
            // vehicle never changes mid-drive in Earth 1, but a
            // peer re-entering after a respawn re-sends it.
            if (craft !== e.craftId) {
              e.craftId = craft;
              if (e.flame && e.flame.group.parent) e.flame.group.parent.remove(e.flame.group);
              disposeFlame(e.flame);
              e.flame = null;
              while (e.craftGroup.children.length > 0) e.craftGroup.remove(e.craftGroup.children[0]);
              if (!getVehicleModel(craft)) void ensureVehicleModel(craft);
            }
          }
          // Peers who left the nearby set: drop their groups,
          // sprites, and flames (no ghosts).
          for (const [key, e] of Array.from(entriesRef.current.entries())) {
            if (seen.has(key)) continue;
            entriesRef.current.delete(key);
            disposeFlame(e.flame);
            e.nameTexture.dispose();
            e.nameSprite.material.dispose();
            parent.remove(e.group);
          }
        },
      });
      clientRef.current = client;
      if (!cancelled) void client.join();
    })();

    return () => {
      cancelled = true;
      const client = clientRef.current;
      clientRef.current = null;
      if (client) void client.leave();
      for (const [, e] of entriesRef.current.entries()) {
        disposeFlame(e.flame);
        e.nameTexture.dispose();
        e.nameSprite.material.dispose();
      }
      entriesRef.current.clear();
    };
  }, []);

  useFrame((state, rawDt) => {
    const parent = parentRef.current;
    const client = clientRef.current;
    if (!parent) return;
    // The parent mounts only while roaming (NexusEarth), but
    // guard anyway: no street, no peers, no upserts.
    if (!roamState.active) {
      parent.visible = false;
      return;
    }
    parent.visible = true;
    if (client) void client.update();
    const dt = Math.min(0.05, rawDt || 0.016);
    const time = state.clock.elapsedTime;
    const nowMs = performance.now();
    const shared = [];
    for (const [, e] of entriesRef.current.entries()) {
      // Lerp toward the latest fix (2.5 s cadence would jump).
      e.display = lerpEarthPos(e.display, e.lastFix, dt);
      const { lat, lon, yawDeg } = e.display;
      const craft = e.craftId ? getVehicle(e.craftId) : null;
      const hoverM = craft ? craft.hoverM : 0;
      const surfR = surfaceRadiusOrBase(lat, lon);
      const facetR = patchFacetRadiusAt(lat, lon);
      const groundR = facetR != null ? Math.max(surfR, facetR) : surfR;
      const p = latLonToVec3(lat, lon, groundR + hoverM * UPM);
      e.group.position.set(p.x, p.y, p.z);
      const frame = tangentFrame(lat, lon);
      const fwd = headingVector(frame, yawDeg);
      const normal = new THREE.Vector3(frame.normal.x, frame.normal.y, frame.normal.z);
      const fwdV = new THREE.Vector3(fwd.x, fwd.y, fwd.z);
      const xAxis = new THREE.Vector3().crossVectors(normal, fwdV).normalize();
      const zAxis = new THREE.Vector3().crossVectors(xAxis, normal).normalize();
      e.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, normal, zAxis));

      // Hit sequence (peers THIS client shot): flip 3x around
      // the forward axis while flipping, hidden while exploding.
      const hit = peerHitStates.get(e.key);
      if (hit) {
        const adv = advancePeerHit(hit, nowMs);
        if (adv.phase === 'flipping') {
          const roll = flipRollAngle(hit, nowMs);
          e.group.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll));
        } else if (adv.phase === 'exploding') {
          e.group.visible = false;
        } else {
          peerHitStates.delete(e.key);
          e.group.visible = true;
        }
      } else {
        e.group.visible = true;
      }

      // Craft body: clone from the vehicle cache when the model
      // has landed; nothing renders before that (no fake body).
      let craftReady = false;
      if (craft) {
        const model = getVehicleModel(e.craftId);
        if (model) {
          if (e.craftGroup.children.length === 0) {
            cloneModelInto(e.craftGroup, model);
            if (craft.engine === 'jet') e.flame = buildJetFlame(craft.lengthM);
          }
          craftReady = true;
          if (e.flame) {
            if (!e.flame.group.parent) e.group.add(e.flame.group);
            animateJetFlame(e.flame, { driving: e.moving, speedRatio: 0.6, time });
          }
        }
      } else if (e.flame) {
        if (e.flame.group.parent) e.flame.group.parent.remove(e.flame.group);
        disposeFlame(e.flame);
        e.flame = null;
      }
      e.craftGroup.visible = craftReady;

      // Publish the shared peer list for EarthKart (torpedo
      // targeting + bumper-car collisions). Speed goes stale
      // 5 s after the last fix — a peer who stopped sending
      // reads as stopped, not as coasting forever.
      shared.push({
        id: e.key,
        lat,
        lon,
        yawDeg,
        craftId: e.craftId,
        speedMps: nowMs - e.fixAtMs < 5000 ? e.speedMps : 0,
        label: e.label,
      });
    }
    setSharedPeerVehicles(shared);
  });

  return <group ref={parentRef} visible={false} />;
}
