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

'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { LightCycle } from './scene';
import { interpBeacon, isBeaconStale } from '../../lib/shadow-realm/net';
import { ghostColorFor } from '../../lib/luge/pvp';

// One canvas-texture callsign plate per rider — drawn once, never per frame.
function CallsignSprite({ name, color }) {
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 64;
    const g = c.getContext('2d');
    g.font = '700 30px system-ui, -apple-system, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = color;
    g.shadowBlur = 12;
    g.fillStyle = color;
    g.fillText(String(name || 'Rider').slice(0, 16), 128, 34);
    const t = new THREE.CanvasTexture(c);
    t.needsUpdate = true;
    return t;
  }, [name, color]);

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
  const color = ghostColorFor(beacon.user_id);
  const scheme = useMemo(
    () => ({ primary: color, secondary: color, trail: color }),
    [color]
  );

  // Register with the shared frame loop (posed there, not here — one
  // useFrame total for all ghosts, same as Bots.jsx's advancement loop).
  useEffect(() => {
    const entry = { group: group.current, beacon, pose };
    register(entry);
    return () => register(null);
  }, [beacon, register]);

  return (
    <group ref={group}>
      <LightCycle scheme={scheme} bikeRef={undefined} />
      <CallsignSprite name={beacon.callsign} color={color} />
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
  useFrame(() => {
    const now = Date.now();
    if (nowRef) nowRef.current = now;
    rigs.current.forEach(({ group, beacon, pose }) => {
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
