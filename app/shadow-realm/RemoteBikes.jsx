// app/shadow-realm/RemoteBikes.jsx — remote-rider ghost renderer for
// SHADOW REALM drop 2 (PvP track matches + open-world presence).
//
// Each remote rider renders as the shared LightCycle mesh (exported from
// scene.jsx — NOT duplicated) in a per-rider neon color hashed from their
// user_id (the luge ghost-color pattern), plus one cheap floating callsign
// sprite per rider (canvas texture, baked once per rider).
//
// GHOST BY DESIGN: remote bikes never collide with anything — no
// remote-vs-player and no remote-vs-remote collision, same as the VS AI.
// The player always rides a clean line.
//
// One shared useFrame poses every ghost: each beacon is smoothed with
// interpBeacon (lib/shadow-realm/net.js) — extrapolated along
// heading*speed for up to 0.5s so ghosts glide between beacon arrivals,
// eased toward the target to swallow jitter, heading lerped on the
// shortest arc. Stale beacons (>10s) hide the ghost gracefully — no pop-up.
//
// The parent passes already-capped beacons (nearestN / REMOTE_CAP).
//
// WAVE 6 — plate identity: the callsign plate also carries the
// rider's profile character (a circular preview icon beside the
// name), resolved by lib/shadow-realm/plate-identity.js: the
// beacon's own stamped pick if it ever carries one, else the
// rider's public profile character, else the name-only plate this
// file has always drawn. Bike colors are unchanged (per-rider
// neon from the user id) — identity is added, never substituted.

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { LightCycle, TrailMesh } from './scene';
import { interpBeacon, isBeaconStale } from '../../lib/shadow-realm/net';
import { ghostColorFor } from '../../lib/luge/pvp';
import { deserializeTrail } from '../../lib/shadow-realm/trails';
import { getEmbodiment } from '../../lib/characters/embodiment';
import {
  PLATE_CANVAS, characterIdForBeacon, drawPlate,
  sharedProfileCharacterLookup,
} from '../../lib/shadow-realm/plate-identity';

// One canvas-texture callsign plate per rider — drawn once, never
// per frame. The name plate draws immediately; when the rider's
// character preview arrives, the plate redraws once with the icon.
function CallsignSprite({ name, color, characterId }) {
  const preview = characterId ? (getEmbodiment(characterId) || {}).preview : null;
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = PLATE_CANVAS.width;
    c.height = PLATE_CANVAS.height;
    drawPlate(c.getContext('2d'), { name, color, iconImage: null });
    const t = new THREE.CanvasTexture(c);
    t.needsUpdate = true;
    return t;
  }, [name, color]);

  // The icon is a second draw of the same canvas once the preview
  // image loads — still a one-time bake, never a per-frame cost.
  // A failed image leaves the name-only plate standing.
  useEffect(() => {
    if (!preview || !tex.image) return undefined;
    let live = true;
    const img = new Image();
    img.onload = () => {
      if (!live) return;
      drawPlate(tex.image.getContext('2d'), { name, color, iconImage: img });
      tex.needsUpdate = true;
    };
    img.src = preview;
    return () => { live = false; };
  }, [preview, tex, name, color]);

  useEffect(() => () => tex.dispose(), [tex]);

  return (
    <sprite position={[0, 2.7, 0]} scale={[7, 1.75, 1]}>
      <spriteMaterial map={tex} transparent depthWrite={false} />
    </sprite>
  );
}

function RemoteRig({ beacon, register }) {
  const group = useRef();
  const pose = useRef(null); // last rendered pose { x, z, heading, at }
  // LETHAL TRAILS: the rider's trail, rebuilt when the beacon updates.
  const trailRef = useRef(null);
  const lastSig = useRef('');
  const color = ghostColorFor(beacon.user_id);
  const scheme = useMemo(
    () => ({ primary: color, secondary: color, trail: color }),
    [color]
  );

  // WAVE 6 — plate identity: this rider's profile character. The
  // beacon's stamped pick (if any) resolves synchronously; the
  // public profile lookup fills in asynchronously, once per rider
  // (session-cached in plate-identity). No pick anywhere -> the
  // plate stays name-only, as it always has.
  const [lookedUpId, setLookedUpId] = useState(null);
  const userId = beacon.user_id;
  useEffect(() => {
    if (characterIdForBeacon(beacon, null)) return undefined;
    let live = true;
    sharedProfileCharacterLookup.lookup(userId).then((id) => {
      if (live && id) setLookedUpId(id);
    });
    return () => { live = false; };
    // beacon identity changes per poll; the rider is the key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);
  const characterId = characterIdForBeacon(beacon, lookedUpId);

  // Register with the shared frame loop (posed there, not here — one
  // useFrame total for all ghosts, same as Bots.jsx's advancement loop).
  useEffect(() => {
    const entry = { group: group.current, beacon, pose, trailRef, lastSig };
    register(entry);
    return () => register(null);
  }, [beacon, register]);

  return (
    <group ref={group}>
      <LightCycle scheme={scheme} bikeRef={undefined} />
      <CallsignSprite name={beacon.callsign} color={color} characterId={characterId} />
      {/* LETHAL TRAILS: the remote rider's light trail (lethal to the
          player — symmetric local resolution). */}
      <TrailMesh trailGetter={() => trailRef.current} color={color} />
    </group>
  );
}

export default function RemoteBikes({ beacons, myUserId, nowRef }) {
  const rigs = useRef(new Map()); // user_id -> { group, beacon, pose }

  // Stable per-rider registration callbacks.
  const registers = useRef(new Map());
  const registerFor = (userId) => {
    let fn = registers.current.get(userId);
    if (!fn) {
      fn = (entry) => {
        if (entry) rigs.current.set(userId, entry);
        else {
          rigs.current.delete(userId);
          registers.current.delete(userId);
        }
      };
      registers.current.set(userId, fn);
    }
    return fn;
  };

  // THE shared frame loop: tick the shared clock, then pose every ghost
  // from its latest beacon. Stale beacons hide the ghost (rider dropped).
  // LETHAL TRAILS: each ghost's beacon trail is deserialized (cached by a
  // signature) so the local player can collide with it — symmetric local
  // resolution, deaths self-reported via the beacon.
  useFrame(() => {
    const now = Date.now();
    if (nowRef) nowRef.current = now;
    rigs.current.forEach(({ group, beacon, pose, trailRef, lastSig }) => {
      if (!group) return;
      if (isBeaconStale(beacon, now)) {
        group.visible = false;
        return;
      }
      group.visible = true;
      const p = interpBeacon(beacon, pose.current, now);
      pose.current = p;
      group.position.set(p.x, 0.06, p.z);
      group.rotation.y = p.heading;
      // Rebuild the trail when the beacon payload changes.
      if (trailRef && Array.isArray(beacon.trail) && beacon.trail.length >= 4) {
        const sig = beacon.trail.length + ':' + beacon.trail[0] + ':' + beacon.trail[beacon.trail.length - 1];
        if (lastSig.current !== sig) {
          lastSig.current = sig;
          trailRef.current = deserializeTrail(beacon.trail, now / 1000);
        }
      } else if (trailRef) {
        trailRef.current = null;
      }
    });
  });

  // Never render self — the player's own bike is the Rig's LightCycle.
  const remotes = (beacons || []).filter((b) => b && b.user_id !== myUserId);

  return (
    <group>
      {remotes.map((b) => (
        <RemoteRig key={b.user_id} beacon={b} register={registerFor(b.user_id)} />
      ))}
    </group>
  );
}
