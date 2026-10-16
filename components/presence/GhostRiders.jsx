// components/presence/GhostRiders.jsx — Render other riders inside a
// @react-three/fiber bike scene from the live presence peer list.
//
// Every peer rides the translucent ghost bike built below (a minimal
// geometric silhouette — deliberately NOT the full detailed bike, so
// twenty peers don't cost twenty detailed bikes). A peer whose
// presence row carries a character pick is UPGRADED (Merlin's call,
// 2026-10-15): the picked character itself sits in the rider's seat,
// in the Wave 6 'seated' pose, through the shared embodiment
// (components/characters/CharacterGlb.jsx + lib/ghost-riders.js for
// the mount contract). The ghost rider hump + helmet step aside the
// moment the model reports ready; the bike, the glow and the name
// label stay ghost either way.
//
// PERFORMANCE LAW: embodiment is capped at the NEAREST
// MAX_EMBODIED_GHOST_RIDERS picked peers (lib/ghost-riders.js
// selectEmbodiedPeerKeys, recomputed as peers and camera move);
// beyond the cap — and for every peer with no pick or an unknown
// pick — the peer renders EXACTLY as the ghost bike always has.
// A per-field slot registry capped at the same number backs the
// selection up at the attach layer.
//
// DISPOSAL LAW: when a peer leaves, changes pick, or falls out of
// the nearest-6, its CharacterGlb unmounts in the same commit and
// its cleanup disposes the model + frees the slot that same tick.
// Nothing translucent is left behind.
//
// Props: { peers = [], visible = true }
// peer: { id, label, sector, pos:{x,y,z}, vehicle, color,
//         characterId (roster pick, may be null), ageMs }
// Tolerates empty / malformed peer lists: renders nothing, never throws.

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { peerKey } from '@/lib/presence';
import CharacterGlb from '@/components/characters/CharacterGlb';
import { createGlbSlotRegistry } from '@/lib/characters/glb-slots';
import {
  MAX_EMBODIED_GHOST_RIDERS,
  GHOST_RIDER_POSE,
  GHOST_RIDER_PROC_SIZE,
  GHOST_RIDER_MOUNT,
  ghostRiderCharacterId,
  ghostRiderSlotKey,
  selectEmbodiedPeerKeys,
  sameKeySet,
} from '@/lib/ghost-riders';

const GHOST_OPACITY = 0.5;
const FALLBACK_COLOR = '#00f2ff';
// How often the nearest-6 selection re-checks against camera motion.
const SELECTION_REFRESH_S = 0.4;

function safeColor(raw) {
  return typeof raw === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw) ? raw : FALLBACK_COLOR;
}

function safePos(raw) {
  const p = raw && typeof raw === 'object' ? raw : {};
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return { x: n(p.x), y: n(p.y), z: n(p.z) };
}

// --- name label sprite ------------------------------------------------------

function makeLabelTexture(label) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 64);
  ctx.font = '600 28px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Soft dark pill behind the text so it reads over bright scenes.
  const w = Math.min(240, ctx.measureText(label).width + 28);
  ctx.fillStyle = 'rgba(2,6,12,0.55)';
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect((256 - w) / 2, 10, w, 44, 22);
  } else {
    ctx.rect((256 - w) / 2, 10, w, 44);
  }
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fillText(label, 128, 33);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// --- one ghost rider --------------------------------------------------------
//
// The ghost bike is the native body. With a valid pick + a
// nearest-6 seat (`embody`), the shared embodiment mounts inside
// the seat host and the native rider (hump + helmet) hides while
// the model is live — the Persephone hall pattern, on a bike.
// If the attach layer ever answers with a billboard instead of a
// live model (slot contention the selection didn't foresee), the
// peer stays a ghost: a preview card never sits in the seat.

function Ghost({ peer, embody = false, registry = null }) {
  const group = useRef(null);
  const color = safeColor(peer.color);
  const label = typeof peer.label === 'string' && peer.label ? peer.label : 'Rider';
  const phase = useMemo(() => Math.random() * Math.PI * 2, []);
  const characterId = ghostRiderCharacterId(peer);

  const labelTex = useMemo(() => {
    if (typeof document === 'undefined') return null;
    return makeLabelTexture(label.slice(0, 24));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label]);

  useEffect(() => {
    return () => {
      if (labelTex) labelTex.dispose();
    };
  }, [labelTex]);

  // Embodiment state: `live` only while the model is on stage;
  // `denied` latches when the attach layer hands back a billboard
  // so this peer stops asking and stays ghost until its pick or
  // its nearest-6 seat changes.
  const host = useMemo(() => new THREE.Group(), []);
  const poseRef = useRef(GHOST_RIDER_POSE);
  const [live, setLive] = useState(false);
  const [denied, setDenied] = useState(false);
  useEffect(() => {
    setLive(false);
    setDenied(false);
  }, [characterId, embody]);

  const showCharacter = !!embody && !!characterId && !denied;

  const target = useMemo(() => new THREE.Vector3(), []);
  const tmp = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    const p = safePos(peer.pos);
    target.set(p.x, p.y, p.z);
    const k = Math.min(1, (dt || 0.016) * 4);
    g.position.lerp(target, k);
    // Gentle hover bob so ghosts feel alive but clearly not local.
    tmp.copy(g.position);
    g.position.y = tmp.y + Math.sin(state.clock.elapsedTime * 2 + phase) * 0.25;
  });

  const ghostMat = (extra = {}) => ({
    transparent: true,
    opacity: GHOST_OPACITY,
    depthWrite: false,
    ...extra,
  });

  return (
    <group ref={group} position={[safePos(peer.pos).x, safePos(peer.pos).y, safePos(peer.pos).z]}>
      {/* frame: narrow elongated body, nose +Z like the real bikes */}
      <mesh position={[0, 0.55, 0]}>
        <boxGeometry args={[0.85, 0.45, 3.4]} />
        <meshStandardMaterial color="#0b1220" {...ghostMat()} />
      </mesh>
      {/* glow spine */}
      <mesh position={[0, 0.82, 0]}>
        <boxGeometry args={[0.18, 0.08, 3.0]} />
        <meshBasicMaterial color={color} {...ghostMat({ opacity: 0.85 })} />
      </mesh>
      {/* wheels */}
      {[1.25, -1.25].map((z) => (
        <mesh key={z} position={[0, 0.55, z]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.55, 0.1, 10, 24]} />
          <meshBasicMaterial color={color} {...ghostMat({ opacity: 0.7 })} />
        </mesh>
      ))}
      {/* the rider: the picked character when this peer holds a
          nearest-6 seat, seated on the bike; the ghost hump +
          helmet otherwise, and until the model reports ready */}
      {showCharacter && (
        <group position={GHOST_RIDER_MOUNT.position}>
          <primitive object={host} />
          <CharacterGlb
            characterId={characterId}
            host={host}
            poseRef={poseRef}
            procSize={GHOST_RIDER_PROC_SIZE}
            registry={registry}
            slotKey={ghostRiderSlotKey(peer)}
            onMode={(kind) => { if (kind === 'billboard') setDenied(true); }}
            onReady={(ok) => setLive(!!ok)}
          />
        </group>
      )}
      {!live && (
        <>
          <mesh position={[0, 1.05, -0.3]}>
            <boxGeometry args={[0.55, 0.5, 1.0]} />
            <meshStandardMaterial color="#111827" {...ghostMat()} />
          </mesh>
          <mesh position={[0, 1.35, 0.05]}>
            <sphereGeometry args={[0.28, 16, 16]} />
            <meshStandardMaterial color={color} {...ghostMat({ opacity: 0.65 })} />
          </mesh>
        </>
      )}
      {/* name label — rides higher while a full-size rider is up */}
      {labelTex && (
        <sprite position={[0, live ? 3.3 : 2.6, 0]} scale={[9, 2.25, 1]}>
          <spriteMaterial map={labelTex} transparent depthWrite={false} opacity={0.95} />
        </sprite>
      )}
    </group>
  );
}

// --- the field --------------------------------------------------------------

export default function GhostRiders({ peers = [], visible = true }) {
  const list = Array.isArray(peers) ? peers : [];
  const valid = list.filter((p) => p && typeof p === 'object' && p.id);

  // One slot registry per mounted field, capped at the embodiment
  // cap: the attach-layer backstop behind the nearest-6 selection.
  const registry = useMemo(
    () => createGlbSlotRegistry(MAX_EMBODIED_GHOST_RIDERS),
    [],
  );

  // Nearest-6 selection: recomputed when the peer list changes and
  // throttled against camera motion. State only changes when the
  // selected SET changes, so steady scenes never re-render.
  const camera = useThree((s) => s.camera);
  const [embodiedKeys, setEmbodiedKeys] = useState([]);
  const embodiedRef = useRef([]);
  const peersRef = useRef(valid);
  peersRef.current = valid;

  const selectNow = useCallback(() => {
    const next = selectEmbodiedPeerKeys(
      peersRef.current,
      camera.position,
      MAX_EMBODIED_GHOST_RIDERS,
    );
    if (!sameKeySet(next, embodiedRef.current)) {
      embodiedRef.current = next;
      setEmbodiedKeys(next);
    }
  }, [camera]);
  const selectRef = useRef(selectNow);
  selectRef.current = selectNow;

  useEffect(() => { selectRef.current(); }, [valid]);

  const accum = useRef(0);
  useFrame((_, dt) => {
    accum.current += dt || 0;
    if (accum.current >= SELECTION_REFRESH_S) {
      accum.current = 0;
      selectRef.current();
    }
  });

  const embodied = useMemo(() => new Set(embodiedKeys), [embodiedKeys]);

  return (
    <group visible={!!visible}>
      {valid.map((p) => (
        <Ghost
          key={peerKey(p)}
          peer={p}
          embody={embodied.has(peerKey(p))}
          registry={registry}
        />
      ))}
    </group>
  );
}
