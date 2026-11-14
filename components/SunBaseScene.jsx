'use client';

// components/SunBaseScene.jsx — the inside of a sun base.
//
// One reserved interior (farmhouse / barn / windmill —
// lib/earth2/interior-room.js buildInteriorRoom, the same factory
// Earth 2 hangs its rooms from), re-based at the origin, lit warm
// like the inside of the sun: the windows glow, the doorway spills
// light, and a gold sun disc hangs outside the door.
//
// THE USER IS SMALL HERE (Merlin, Nov 13, 2026 — "I want the
// room to be huge for them"): the walker is one-fifth normal size
// (lib/sun-base.js SUN_BASE_USER_SCALE 0.2 — eye 0.34 m, stride
// 0.64 m/s), so the same room reads five times bigger — the
// farmhouse reads as a 45 m hall, the barn as 60 m. The rig is
// first-person and deliberately small: drag to look, WASD /
// arrows / the shared WalkJoystick to walk, clamped to the room's
// own walls. The door is a view, not an exit — leaving is the
// page's "Back to hub" button, so nobody walks out of their base
// into the void by accident.
//
// BUILDING (Merlin, Nov 13, 2026): the sun base is a build
// surface exactly like an Earth 2 parcel — the SAME catalog, the
// SAME placement law, the SAME piece renderer (lib/building/*),
// no copy. The build frame is the room's own inset floor and
// placements live in ROOM space — (0, 0) one corner of the floor,
// (width, depth) the opposite — so the placement law's 0..width
// frame math holds unchanged; the build group is centred on the
// origin by the room offset. Pieces stay FULL Earth 2 size (a 4 m
// wall is a 4 m wall): to the shrunken user a wall reads 20 m
// wide — the things they build are huge to them, exactly like
// the room. The ghost follows the camera-centre ground point
// (the Earth 2 camera-aim law), a tap places it, a double-tap
// picks a placed piece back up, and a portal piece (frame-portal
// / portal-frame) takes a destination from the shared
// PortalDestinationPicker — walk through it and you travel.

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { buildInteriorRoom } from '@/lib/earth2/interior-room';
import {
  buildGhostGroup,
  buildPieceGroup,
  setGhostValidity,
} from '@/lib/building/piece-render';
import { pieceById, pieceFootprint } from '@/lib/building/catalog';
import {
  clampPlacementToFrame,
  judgeGhost,
  snapPlacement,
  stackingSeat,
} from '@/lib/building/placement';
import { isPortalPiece } from '@/components/earth2/PortalDestinationPicker';
import {
  SUN_BASE_EYE_HEIGHT_M,
  SUN_BASE_WALK_SPEED_MPS,
  SUN_BASE_WALL_MARGIN_M,
} from '@/lib/sun-base';
import { sunBaseBuildFrame, sunBaseBuildOffset } from '@/lib/sun-base-build';

function disposeGroup(group) {
  group.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
    mats.forEach((m) => m.dispose && m.dispose());
  });
}

// Room-space → world-space: the build group is centred on the
// origin, so a room-space point (x, z) stands at (x + off.x, z +
// off.z) in the scene.
function toWorld(placement, off) {
  return { x: placement.x + off.x, y: placement.y || 0, z: placement.z + off.z };
}

function BaseRig({ spec, moveRef, walkerRef }) {
  const { camera, gl } = useThree();
  // Arrive facing the door (+Z): the light spill is the first
  // thing the user sees inside their own base.
  const yaw = useRef(Math.PI);
  const pitch = useRef(0);
  const pos = useRef({ x: 0, z: -0.5 });
  const keys = useRef(new Set());
  const dragging = useRef(null);

  useEffect(() => {
    const down = (e) => keys.current.add(String(e.key).toLowerCase());
    const up = (e) => keys.current.delete(String(e.key).toLowerCase());
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useEffect(() => {
    const el = gl.domElement;
    const onDown = (e) => {
      dragging.current = { x: e.clientX, y: e.clientY };
    };
    const onMove = (e) => {
      const d = dragging.current;
      if (!d) return;
      yaw.current -= (e.clientX - d.x) * 0.004;
      pitch.current = Math.max(-1.2, Math.min(1.2, pitch.current - (e.clientY - d.y) * 0.004));
      dragging.current = { x: e.clientX, y: e.clientY };
    };
    const onUp = () => {
      dragging.current = null;
    };
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    };
  }, [gl]);

  useFrame((state, delta) => {
    const k = keys.current;
    let fwd =
      (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
    let strafe =
      (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
    if (moveRef && moveRef.current) {
      fwd += moveRef.current.y || 0;
      strafe += moveRef.current.x || 0;
    }
    const len = Math.hypot(fwd, strafe);
    if (len > 1) {
      fwd /= len;
      strafe /= len;
    }
    if (len > 0) {
      const step = Math.min(delta, 0.05) * SUN_BASE_WALK_SPEED_MPS;
      const sin = Math.sin(yaw.current);
      const cos = Math.cos(yaw.current);
      // Camera looks -Z rotated by yaw: forward (-sin, 0, -cos),
      // right (cos, 0, -sin). At yaw PI (facing the door, +Z) both
      // read correctly.
      const nx = pos.current.x + (cos * strafe - sin * fwd) * step;
      const nz = pos.current.z + (-sin * strafe - cos * fwd) * step;
      // Clamped to the room's own walls — the base keeps you in.
      // The margin scales with the walker: a fifth-size user can
      // step five times closer to a wall than a full-size one.
      const halfW = (spec.widthM * 0.94) / 2 - SUN_BASE_WALL_MARGIN_M;
      const halfD = (spec.depthM * 0.94) / 2 - SUN_BASE_WALL_MARGIN_M;
      pos.current.x = Math.max(-halfW, Math.min(halfW, nx));
      pos.current.z = Math.max(-halfD, Math.min(halfD, nz));
    }
    camera.position.set(pos.current.x, SUN_BASE_EYE_HEIGHT_M, pos.current.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(pitch.current, yaw.current, 0);
    if (walkerRef) {
      walkerRef.current = { x: pos.current.x, z: pos.current.z, yaw: yaw.current };
    }
  });

  return null;
}

// The build layer: the ghost, the tap-to-place / tap-to-select,
// the double-tap pickup, and the walk-through portal travel.
// All placement judgement is the Earth 2 placement law, judged
// against the room frame.
function BuildLayer({
  spec,
  pieces,
  build,
  walkerRef,
  onGhostVerdict,
  onPlace,
  onSelect,
  onPickup,
  onPortalWalk,
}) {
  const { camera, gl, scene } = useThree();
  const frame = useMemo(() => sunBaseBuildFrame(spec), [spec]);
  const off = useMemo(() => sunBaseBuildOffset(spec), [spec]);
  const ghostRef = useRef(null);
  const ghostKeyRef = useRef('');
  const ghostPlacementRef = useRef(null);
  const verdictKeyRef = useRef('');
  const lastAimRef = useRef(null);
  const lastTapRef = useRef({ at: 0, index: -1 });
  const portalCooldownRef = useRef(0);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const floorPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const aimVec = useMemo(() => new THREE.Vector3(), []);
  const piecesGroupRef = useRef(null);

  // The placed pieces live in a group this layer owns, so the
  // edit raycast has something to hit.
  const placedGroup = useMemo(() => new THREE.Group(), []);
  useEffect(() => {
    scene.add(placedGroup);
    return () => {
      scene.remove(placedGroup);
      disposeGroup(placedGroup);
    };
  }, [scene, placedGroup]);
  useEffect(() => {
    while (placedGroup.children.length) {
      const child = placedGroup.children[0];
      placedGroup.remove(child);
      disposeGroup(child);
    }
    (Array.isArray(pieces) ? pieces : []).forEach((piece, index) => {
      if (!piece || !pieceById(piece.pieceId)) return;
      const pg = buildPieceGroup(THREE, piece.pieceId, piece.finish, piece.tint, piece.orientation);
      const w = toWorld(piece, off);
      pg.position.set(w.x, w.y, w.z);
      pg.rotation.y = ((piece.rotY || 0) * Math.PI) / 180;
      pg.userData.buildPiece = { index };
      pg.traverse((obj) => {
        obj.userData.buildPiece = { index };
      });
      placedGroup.add(pg);
      if (piece.portalTo) {
        const p = pieceById(piece.pieceId);
        const fp = pieceFootprint(p, piece);
        const r = Math.max(0.3, Math.min(1.5, Math.min(fp.maxX - fp.minX, fp.maxZ - fp.minZ) / 4));
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(r * 0.7, r, 32),
          new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(w.x, 0.05, w.z);
        ring.userData.buildPiece = { index };
        placedGroup.add(ring);
      }
    });
    piecesGroupRef.current = placedGroup;
  }, [pieces, off, placedGroup]);

  // Selected-piece marker: a gold wire box around the selection.
  const markerRef = useRef(null);
  useEffect(() => {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0xffd700, wireframe: true, transparent: true, opacity: 0.9 })
    );
    m.visible = false;
    scene.add(m);
    markerRef.current = m;
    return () => {
      scene.remove(m);
      m.geometry.dispose();
      m.material.dispose();
      markerRef.current = null;
    };
  }, [scene]);

  useFrame(() => {
    const m = markerRef.current;
    if (!m) return;
    const idx = build && build.selectedIndex;
    const piece = idx != null && Array.isArray(pieces) ? pieces[idx] : null;
    if (!build || !build.active || build.tool !== 'edit' || !piece || !pieceById(piece.pieceId)) {
      m.visible = false;
      return;
    }
    const p = pieceById(piece.pieceId);
    const fp = pieceFootprint(p, piece);
    const w = toWorld(piece, off);
    const topY = (piece.y || 0) + (p.size ? p.size.h : 1);
    m.visible = true;
    m.position.set(w.x, (piece.y || 0) + topY / 2, w.z);
    m.scale.set(
      Math.max(0.2, fp.maxX - fp.minX + 0.15),
      Math.max(0.2, topY + 0.15),
      Math.max(0.2, fp.maxZ - fp.minZ + 0.15)
    );
    m.rotation.y = ((piece.rotY || 0) * Math.PI) / 180;
  });

  // The ghost follows the camera-centre ground point (the Earth 2
  // camera-aim law): march the centre ray down to the floor every
  // frame; when the ray finds no floor at all, the aim HOLDS its
  // last spot instead of jumping.
  useFrame(() => {
    const active = build && build.active && build.tool === 'place' && build.pieceId;
    if (!active) {
      if (ghostRef.current) ghostRef.current.visible = false;
      ghostPlacementRef.current = null;
      return;
    }
    raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    const hit = raycaster.ray.intersectPlane(floorPlane, aimVec);
    if (hit) {
      lastAimRef.current = { x: aimVec.x - off.x, z: aimVec.z - off.z };
    }
    const aim = lastAimRef.current;
    if (!aim) {
      if (ghostRef.current) ghostRef.current.visible = false;
      ghostPlacementRef.current = null;
      return;
    }
    const key = `${build.pieceId}|${build.orientation || 'upright'}|${build.finishId || 'timber'}|${build.tint ?? ''}`;
    if (!ghostRef.current || ghostKeyRef.current !== key) {
      if (ghostRef.current) {
        scene.remove(ghostRef.current);
        disposeGroup(ghostRef.current);
      }
      ghostRef.current = buildGhostGroup(THREE, build.pieceId, build.orientation, build.finishId, build.tint);
      ghostKeyRef.current = key;
      scene.add(ghostRef.current);
    }
    const ghost = ghostRef.current;
    const judgePieces =
      build.carriedIndex != null && Array.isArray(pieces) && pieces[build.carriedIndex]
        ? pieces.filter((_, i) => i !== build.carriedIndex)
        : Array.isArray(pieces)
          ? pieces
          : [];
    const candidate = {
      pieceId: build.pieceId,
      x: aim.x,
      z: aim.z,
      y: 0,
      rotY: build.rotY || 0,
      // The placement law reads `finish` (normalizePlacement's
      // field), not `finishId` — the ghost's finishId is the menu
      // selection, the candidate carries it as `finish`.
      finish: build.finishId || 'timber',
      tint: build.tint ?? null,
      orientation: build.orientation || 'upright',
    };
    const snapped = snapPlacement(candidate);
    const clamped = clampPlacementToFrame(snapped, frame);
    const seat = stackingSeat(judgePieces, clamped);
    const seated = { ...clamped, y: Math.round(Math.max(0, seat) * 100) / 100 };
    const verdict = judgeGhost(judgePieces, seated, { frame });
    const w = toWorld(verdict.placement, off);
    ghost.visible = true;
    ghost.position.set(w.x, w.y, w.z);
    ghost.rotation.y = ((verdict.placement.rotY || 0) * Math.PI) / 180;
    setGhostValidity(THREE, ghost, verdict.ok);
    ghostPlacementRef.current = verdict.ok ? verdict.placement : null;
    const vkey = verdict.ok ? 'ok' : verdict.reasons[0] || 'bad';
    if (vkey !== verdictKeyRef.current) {
      verdictKeyRef.current = vkey;
      if (onGhostVerdict) onGhostVerdict(verdict.ok, verdict.reasons);
    }
  });

  // Walk-through portal travel (walk mode only): step into a
  // portal-marked piece's footprint and you travel. One firing
  // per entry — the guard re-arms once you step out.
  useFrame(() => {
    if (!walkerRef || !walkerRef.current) return;
    if (build && build.active) return;
    const list = Array.isArray(pieces) ? pieces : [];
    const wx = walkerRef.current.x - off.x;
    const wz = walkerRef.current.z - off.z;
    let inside = null;
    for (let i = 0; i < list.length; i++) {
      const piece = list[i];
      if (!piece || !piece.portalTo || !pieceById(piece.pieceId)) continue;
      const fp = pieceFootprint(pieceById(piece.pieceId), piece);
      if (wx >= fp.minX - 0.1 && wx <= fp.maxX + 0.1 && wz >= fp.minZ - 0.1 && wz <= fp.maxZ + 0.1) {
        inside = piece.portalTo;
        break;
      }
    }
    if (inside) {
      if (Date.now() >= portalCooldownRef.current) {
        portalCooldownRef.current = Date.now() + 5000;
        if (onPortalWalk) onPortalWalk(inside);
      }
    } else {
      portalCooldownRef.current = 0;
    }
  });

  // Tap handling on the canvas: a tap is down+up with almost no
  // movement (a drag looks instead — the rig owns that). In
  // place mode a tap commits the ghost; in edit mode a tap
  // selects, a double-tap picks the piece back up.
  useEffect(() => {
    const el = gl.domElement;
    let down = null;
    const onDown = (e) => {
      down = { x: e.clientX, y: e.clientY, at: performance.now() };
    };
    const onUp = (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const d = down;
      down = null;
      if (moved > 10 || performance.now() - d.at > 600) return;
      if (!build || !build.active) return;
      if (build.tool === 'place') {
        if (ghostPlacementRef.current && onPlace) {
          onPlace(ghostPlacementRef.current, build.carriedIndex != null ? build.carriedIndex : null);
        }
        return;
      }
      // Edit tool: raycast the placed pieces.
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(ndc, camera);
      const group = piecesGroupRef.current;
      if (!group) return;
      const hits = raycaster.intersectObjects(group.children, true);
      let idx = -1;
      if (hits.length) {
        let obj = hits[0].object;
        while (obj && !(obj.userData && obj.userData.buildPiece)) obj = obj.parent;
        if (obj) idx = obj.userData.buildPiece.index;
      }
      const now = performance.now();
      if (
        idx >= 0 &&
        lastTapRef.current.index === idx &&
        now - lastTapRef.current.at < 350
      ) {
        lastTapRef.current = { at: 0, index: -1 };
        if (onPickup) onPickup(idx);
        return;
      }
      lastTapRef.current = { at: now, index: idx };
      if (onSelect) onSelect(idx >= 0 ? idx : null);
    };
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
    };
  }, [gl, build, camera, raycaster, onPlace, onSelect, onPickup]);

  useEffect(
    () => () => {
      if (ghostRef.current) {
        scene.remove(ghostRef.current);
        disposeGroup(ghostRef.current);
        ghostRef.current = null;
      }
    },
    [scene]
  );

  return null;
}

export default function SunBaseScene({ spec, moveRef, build, pieces, walkerRef, onGhostVerdict, onPlace, onSelect, onPickup, onPortalWalk }) {
  const { group } = useMemo(() => buildInteriorRoom(spec, 0), [spec]);
  useEffect(() => () => disposeGroup(group), [group]);
  const D = spec.depthM * 0.94;

  return (
    <>
      <color attach="background" args={['#1c0f02']} />
      <ambientLight intensity={0.55} color="#ffe6b8" />
      <pointLight
        position={[0, Math.max(2.5, spec.heightM * 0.7), 0]}
        intensity={60}
        distance={40}
        color={spec.lightColor}
      />
      <directionalLight position={[4, 8, 6]} intensity={0.7} color="#ffd98a" />
      <primitive object={group} />
      {/* The sun outside the door — a gold disc glowing through the doorway. */}
      <mesh position={[0, 2.2, D / 2 + 4]} rotation={[0, Math.PI, 0]}>
        <circleGeometry args={[7, 32]} />
        <meshBasicMaterial color="#ffd98a" toneMapped={false} />
      </mesh>
      <BaseRig spec={spec} moveRef={moveRef} walkerRef={walkerRef} />
      <BuildLayer
        spec={spec}
        pieces={pieces}
        build={build}
        walkerRef={walkerRef}
        onGhostVerdict={onGhostVerdict}
        onPlace={onPlace}
        onSelect={onSelect}
        onPickup={onPickup}
        onPortalWalk={onPortalWalk}
      />
    </>
  );
}
