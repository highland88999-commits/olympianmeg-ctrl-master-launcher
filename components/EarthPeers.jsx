'use client';
// components/EarthPeers.jsx — the travelers you pass on Earth 1.
//
// Merlin, 2026-10-26 ("make sure users can see each other in
// passing"): when two users are on Earth 1 near each other —
// walking or driving — each sees the other: their character
// plus the craft they are riding.
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
// WHAT A PEER LOOKS LIKE:
//   mounted  -> their craft (cloned from the vehicle cache —
//               the same file you drive), blue jet flame while
//               their fixes are moving, name tag above.
//   on foot  -> their character: platform picks through the
//               shared presence embodiment manager (live GLB
//               up to the scene cap of 4, preview billboard
//               beyond it); extension picks through the direct
//               Earth extension loader (same files as your own
//               extension body); anything unknown or still
//               loading -> a neutral procedural figure, never
//               a fake user and never nothing-at-all with a tag.
//   stale/gone -> removed (stale rows never render: the
//               client already filters them, and the nearby
//               filter drops anything without a decodable fix).
//
// WHAT IS SENT: lat/lon/yaw (encoded as pos x/y/z), the craft
// id while mounted ('on-foot' otherwise), the character pick
// (extension pick preferred — same mutual-exclusion rule as
// your own body), and the label 'Traveler' (no name is
// invented; the row's user_label is the client's sanitized
// label, and Earth sends nothing personal).

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
import { isExtensionCharacterId } from '@/lib/earth/earth-characters';
import { getExtensionCharacterModel, ensureExtensionCharacterModel } from '@/lib/earth/extension-character-model';
import { readExtensionCharacterPick } from '@/lib/earth/earth-extension-character';
import { surfacePickKey, PROFILE_CHARACTER_LS_KEY } from '@/lib/characters/embodiment';
import { createPresenceEmbodiments } from '@/lib/characters/presence-embodiment';
import { getEmbodiment } from '@/lib/characters/embodiment';

const UPM = DISPLAY_UNITS_PER_METRE;
const PROC_SIZE = { x: 1 * UPM, y: 2 * UPM, z: 1 * UPM };

function localEarthState() {
  if (carState.mounted) {
    return { lat: carState.lat, lon: carState.lon, yawDeg: carState.yawDeg, mounted: true, craftId: carState.craftId };
  }
  return { lat: roamState.lat, lon: roamState.lon, yawDeg: roamState.faceDeg, mounted: false, craftId: null };
}

function myCharacterId() {
  // Same preference as your own body: extension pick first,
  // then the platform pick chain (surface override > profile).
  const ext = readExtensionCharacterPick();
  if (ext) return ext;
  try {
    const surface = localStorage.getItem(surfacePickKey('earth'));
    if (surface) return surface;
    return localStorage.getItem(PROFILE_CHARACTER_LS_KEY) || null;
  } catch {
    return null;
  }
}

function buildNativeFigure() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#9aa3b2', roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.25 * UPM, 1.0 * UPM, 4, 12), mat);
  body.position.y = 1.05 * UPM;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18 * UPM, 16, 12), mat);
  head.position.y = 1.95 * UPM;
  g.add(body, head);
  return g;
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
  const embRef = useRef(null);
  const entriesRef = useRef(new Map()); // key -> entry

  useEffect(() => {
    let cancelled = false;
    const emb = createPresenceEmbodiments({ keyPrefix: 'earth', maxLiveGlb: 4 });
    embRef.current = emb;

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
            vehicle: s.mounted ? s.craftId : 'on-foot',
            characterId: myCharacterId(),
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
            seen.add(key);
            let e = entriesRef.current.get(key);
            if (!e) {
              const group = new THREE.Group();
              const native = buildNativeFigure();
              const { sprite, texture } = buildNameSprite(peer.label || 'Traveler');
              const host = emb.hostFor(key);
              const craftGroup = new THREE.Group();
              const extGroup = new THREE.Group();
              group.add(native, host, craftGroup, extGroup, sprite);
              parent.add(group);
              e = {
                key, group, native, host, craftGroup, extGroup,
                nameSprite: sprite, nameTexture: texture,
                display: at, lastFix: at, moving: false,
                characterId: null, craftId: null, flame: null,
              };
              entriesRef.current.set(key, e);
            }
            // Movement detection across fixes: the flame shows
            // only while the peer's fixes are actually moving.
            const moved = earthDistanceM(e.lastFix.lat, e.lastFix.lon, at.lat, at.lon) > 2;
            e.moving = moved;
            e.lastFix = at;
            // Character sync: platform picks through the shared
            // manager; extension picks through the direct loader
            // (the manager validates against the platform roster
            // only, so it would clear an extension pick to the
            // native figure — never let it see one).
            const cid = peer.characterId || null;
            if (cid !== e.characterId) {
              e.characterId = cid;
              if (cid && isExtensionCharacterId(cid)) {
                emb.sync(key, null);
                if (!getExtensionCharacterModel(cid)) void ensureExtensionCharacterModel(cid);
              } else if (cid && getEmbodiment(cid)) {
                emb.sync(key, null);
                emb.sync(key, cid, PROC_SIZE);
              } else {
                emb.sync(key, null);
              }
            }
            // Craft sync: a valid craft id means mounted; anything
            // else ('on-foot', unknown) means walking.
            const craft = isVehicleId(peer.vehicle) ? peer.vehicle : null;
            if (craft !== e.craftId) {
              e.craftId = craft;
              if (e.flame && e.flame.group.parent) e.flame.group.parent.remove(e.flame.group);
              disposeFlame(e.flame);
              e.flame = null;
              while (e.craftGroup.children.length > 0) e.craftGroup.remove(e.craftGroup.children[0]);
              if (craft && !getVehicleModel(craft)) void ensureVehicleModel(craft);
            }
          }
          // Peers who left the nearby set: drop their groups,
          // embodiments, sprites, and flames (no ghosts).
          for (const [key, e] of Array.from(entriesRef.current.entries())) {
            if (seen.has(key)) continue;
            entriesRef.current.delete(key);
            emb.remove(key);
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
      emb.disposeAll();
      embRef.current = null;
    };
  }, []);

  useFrame((state, rawDt) => {
    const parent = parentRef.current;
    const client = clientRef.current;
    const emb = embRef.current;
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

      // Bodies, one at a time: craft when mounted, else the live
      // character (platform manager or extension clone), else
      // the neutral figure. The manager's handle needs its
      // per-frame update (pose + floor clamp); the extension
      // clone rides the group directly (same bob as your own
      // extension body, smaller: a passer-by, not the hero).
      const handle = emb ? emb.handleFor(e.key) : null;
      const platformReady = !!(handle && handle.isReady());
      if (handle) {
        try { handle.update({ x: 0, y: 0, z: 0, heading: 0, moving: e.moving }, dt, time, {}); } catch { /* a peer's pose must never break the frame */ }
      }
      let extReady = false;
      if (e.characterId && isExtensionCharacterId(e.characterId) && !craft) {
        const model = getExtensionCharacterModel(e.characterId);
        if (model) {
          if (e.extGroup.children.length === 0) cloneModelInto(e.extGroup, model);
          extReady = true;
          e.extGroup.position.y = (e.moving ? Math.abs(Math.sin(time * 9)) * 0.05 : Math.sin(time * 1.5) * 0.015) * UPM;
          e.extGroup.rotation.z = e.moving ? Math.sin(time * 9) * 0.03 : 0;
        }
      } else if (e.extGroup.children.length > 0) {
        while (e.extGroup.children.length > 0) e.extGroup.remove(e.extGroup.children[0]);
      }
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
      e.native.visible = !platformReady && !extReady && !craftReady;
      e.host.visible = platformReady;
      e.extGroup.visible = extReady;
      e.craftGroup.visible = craftReady;
    }
  });

  return <group ref={parentRef} visible={false} />;
}
