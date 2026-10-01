// components/GodTower.jsx
// One tower satellite per god-menu category — the Zeus.jsx pattern,
// parameterized the way Merlin described it: copy Zeus, change the name
// and the color, one for each of the categories in the menu (2026-09-30).
//
// Each tower carries four ad panels reading the real billboard inventory
// (lib/partners.js, assigned deterministically by lib/tower-panels.js).
// Panel 0 is ALWAYS Merlin's native stake.com placement — his own
// inventory, never removed, never rotated out. Panels 1–3 rotate the
// affiliate partners, Betty, and YOUR AD HERE fillers so the forty panels
// are no longer forty identical stake placeholders. Towers are solid: each
// registers its own sphere collider (bounce/deflect, never kill). They bob
// gently and rotate slowly, Zeus-style.

'use client';
import { useState, useRef, useMemo, useEffect, memo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { registerCollider, unregisterCollider } from '@/lib/hub-collision';
import {
  createBillboardFaceCanvas,
  drawCoverFit,
} from '@/lib/billboard-face';
import { STAKE_SLOT } from '@/lib/partners';
import { panelsForTower } from '@/lib/tower-panels';

// Tower panel faces are static canvas textures (380×450 ≈ 100px per world
// unit on the 3.8×4.5 face) — forty autoplaying videos would melt phone
// GPUs. When a slot later ships a real image creative, it paints cover-fit.
const FACE_PX_W = 380;
const FACE_PX_H = 450;

// Same advertise-inquiry address as the street monuments.
const INQUIRIES_EMAIL = 'olympianmeg@gmail.com';

// Glitch-stabilized ad border (Merlin, 2026-09-30): the old flat
// meshBasicMaterial border plane sat coplanar with the backing box face
// (z=0.1) and only 0.01 under the ad face — on phone GPUs that strobes.
// Fix: a real canvas-generated brushed texture in the god color (Merlin's
// call: "add a texture to the border"), plus honest depth separation and
// polygonOffset so the stacked faces can never z-fight again.
//
// iPhone hardening (2026-10-01): one shared texture per god color, cached
// at module level — 10 canvases for the whole ring instead of 40 (one per
// panel). iOS aggressively reclaims 2D canvas contexts under memory
// pressure; getContext('2d') can return null, so every canvas here has an
// honest no-texture fallback instead of throwing.
const borderTextureCache = new Map();
function getBorderTexture(color) {
  if (!borderTextureCache.has(color)) {
    borderTextureCache.set(color, makeBorderTexture(color));
  }
  return borderTextureCache.get(color);
}

function makeBorderTexture(color) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 160;
  const g = c.getContext('2d');
  if (!g) return null; // iOS canvas exhaustion: caller falls back to flat color
  const base = new THREE.Color(color);
  const dark = base.clone().multiplyScalar(0.35);
  const mid = base.clone().multiplyScalar(0.6);
  const grad = g.createLinearGradient(0, 0, 128, 160);
  grad.addColorStop(0, `#${dark.getHexString()}`);
  grad.addColorStop(0.5, `#${mid.getHexString()}`);
  grad.addColorStop(1, `#${dark.getHexString()}`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 160);
  // Brushed streaks — break up flat-color banding/shimmer on mobile GPUs.
  for (let i = 0; i < 220; i++) {
    const x = Math.random() * 128;
    g.strokeStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x + (Math.random() * 8 - 4), 160);
    g.stroke();
  }
  // Inner edge highlight so the rim reads as a frame around the creative.
  g.strokeStyle = 'rgba(255,255,255,0.28)';
  g.lineWidth = 3;
  g.strokeRect(2, 2, 124, 156);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Static face texture for one panel's slot: the shared honest branded face,
// or the slot's real image creative cover-fit when one has shipped. The
// stake slot reuses the shared gold stake creative (never removed).
function usePanelFaceTexture(slot, stakeTex) {
  const [tex, setTex] = useState(null);
  useEffect(() => {
    if (slot.key === STAKE_SLOT.key) {
      setTex(stakeTex || null);
      return;
    }
    let cancelled = false;
    let owned = null;
    const toTexture = (canvas) => {
      if (cancelled) return;
      if (!canvas) {
        setTex(null); // honest fallback: flat face color, never a crash
        return;
      }
      const t = new THREE.CanvasTexture(canvas);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      owned = t;
      setTex(t);
    };
    const paintPlaceholder = () =>
      toTexture(createBillboardFaceCanvas(slot, FACE_PX_W, FACE_PX_H));
    const creative = slot.creatives && slot.creatives[0];
    if (creative && creative.imageUrl) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (cancelled) return;
        const canvas = document.createElement('canvas');
        canvas.width = FACE_PX_W;
        canvas.height = FACE_PX_H;
        drawCoverFit(canvas.getContext('2d'), img, FACE_PX_W, FACE_PX_H);
        toTexture(canvas);
      };
      img.onerror = paintPlaceholder;
      img.src = creative.imageUrl;
    } else {
      paintPlaceholder();
    }
    return () => {
      cancelled = true;
      if (owned) owned.dispose();
      setTex(null);
    };
  }, [slot.key, stakeTex]);
  return tex;
}

function TowerAdPanel({ slot, stakeTex, color, onLaunchExternal }) {
  const [hovered, setHovered] = useState(false);
  const [btnHovered, setBtnHovered] = useState(false);
  const [emailHovered, setEmailHovered] = useState(false);

  // One shared border texture per god color (module cache) — 10 canvases
  // for the whole ring, not 40. Null when iOS reclaims the 2D context;
  // the material below falls back to the flat god color.
  const borderTex = getBorderTexture(color);
  const faceTex = usePanelFaceTexture(slot, stakeTex);

  const isStake = slot.key === STAKE_SLOT.key;
  // Merlin's native slot keeps its ENTER NOW call-to-action; everyone else
  // is honest about what a tap does.
  const ctaLabel = isStake
    ? 'ENTER NOW'
    : slot.trackingUrl
      ? 'VISIT SITE'
      : 'ADVERTISE';

  const handleFaceClick = (e) => {
    e.stopPropagation();
    if (e.nativeEvent) e.nativeEvent.stopPropagation();
    if (slot.trackingUrl) {
      onLaunchExternal(slot.trackingUrl);
    } else {
      window.location.href = `mailto:${INQUIRIES_EMAIL}`;
    }
  };

  const handleEmailClick = (e) => {
    e.stopPropagation();
    if (e.nativeEvent) e.nativeEvent.stopPropagation();
    window.location.href = `mailto:${INQUIRIES_EMAIL}`;
  };

  return (
    <group>
      <mesh position={[0, 0, 0]} receiveShadow>
        <boxGeometry args={[4.2, 7.2, 0.2]} />
        <meshStandardMaterial color="#222222" metalness={0.8} roughness={0.4} emissive="#121214" emissiveIntensity={0.5} />
      </mesh>

      <mesh
        position={[0, 1, 0.24]}
        onClick={handleFaceClick}
        onPointerOver={() => { setHovered(true); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = 'default'; }}
      >
        <planeGeometry args={[3.8, 4.5]} />
        <meshStandardMaterial
          map={faceTex || undefined}
          color={faceTex ? (hovered ? '#dddddd' : '#ffffff') : '#0a0f1e'}
          metalness={0.2}
          roughness={0.8}
        />
      </mesh>

      {/* Textured border: 0.08 above the backing box face (was coplanar at
          0.1), 0.08 below the ad face (was 0.01), polygonOffset as a belt
          on top so the rim never fights the creative on any GPU. */}
      <mesh position={[0, 1, 0.16]}>
        <planeGeometry args={[4.0, 4.7]} />
        <meshStandardMaterial
          map={borderTex || undefined}
          color={borderTex ? '#ffffff' : color}
          metalness={0.6}
          roughness={0.35}
          polygonOffset
          polygonOffsetFactor={2}
          polygonOffsetUnits={2}
        />
      </mesh>

      <group
        position={[0, -1.8, 0.11]}
        onClick={handleFaceClick}
        onPointerOver={() => { setBtnHovered(true); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { setBtnHovered(false); document.body.style.cursor = 'default'; }}
      >
        <mesh>
          <boxGeometry args={[3.8, 0.8, 0.1]} />
          <meshStandardMaterial color={btnHovered ? "#ffffff" : color} emissive={color} emissiveIntensity={btnHovered ? 0.8 : 0.4} />
        </mesh>
        <Text position={[0, 0, 0.06]} fontSize={0.35} color="#000000" fontWeight="bold">{ctaLabel}</Text>
      </group>

      <group
        position={[0, -2.8, 0.16]}
        onClick={handleEmailClick}
        onPointerOver={() => { setEmailHovered(true); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { setEmailHovered(false); document.body.style.cursor = 'default'; }}
      >
        <mesh>
          <planeGeometry args={[3.8, 0.6]} />
          <meshBasicMaterial color="#000000" transparent opacity={0.6} polygonOffset polygonOffsetFactor={1} polygonOffsetUnits={1} />
        </mesh>
        <Text position={[0, 0, 0.01]} fontSize={0.25} color={emailHovered ? "#ffffff" : "#aaaaaa"}>Advertise Here: Email Us</Text>
      </group>
    </group>
  );
}

function GodTower({ god, color, position, onLaunchExternal, textures, panels = panelsForTower(0) }) {
  const satelliteRef = useRef();
  useFrame((state, delta) => {
    if (satelliteRef.current) {
      satelliteRef.current.rotation.y += delta * 0.15;
      // Bob around the mount point (inner group is already inside the
      // positioned outer group — offsetting by position[1] again would float
      // the tower at twice its height, away from its collider).
      satelliteRef.current.position.y = Math.sin(state.clock.elapsedTime + position[0]) * 0.5;
    }
  });

  // Solid: generous sphere covering the body + the four ad panels.
  useEffect(() => {
    registerCollider(`tower-${god}`, () => ({ x: position[0], y: position[1], z: position[2] }), 11);
    return () => unregisterCollider(`tower-${god}`);
  }, [god, position]);

  const { propTex, bodyTex, hullTex, tailTex, adTex } = textures;
  const darkMetal = useMemo(() => new THREE.MeshStandardMaterial({ color: '#222222', metalness: 0.9, roughness: 0.2, emissive: '#121214', emissiveIntensity: 0.5 }), []);

  return (
    <group position={position}>
      <group ref={satelliteRef} scale={[0.8, 0.8, 0.8]}>

        <Billboard position={[0, 16, 0]}>
          <Text fontSize={1.6} color={color} letterSpacing={0.2} fontWeight="bold">
            {god}
          </Text>
        </Billboard>

        <mesh position={[0, 0, 0]} receiveShadow>
          <cylinderGeometry args={[2.5, 2.5, 24, 32]} />
          <meshStandardMaterial map={bodyTex} color="#ffffff" metalness={0.6} roughness={0.4} emissive="#222222" emissiveIntensity={0.5} />

          <Text position={[0, 2, 2.55]} fontSize={1.5} color={color} letterSpacing={0.3} anchorX="center" anchorY="middle" rotation={[0, 0, -Math.PI / 2]}>{god}</Text>
          <Text position={[0, 2, -2.55]} fontSize={1.5} color={color} letterSpacing={0.3} anchorX="center" anchorY="middle" rotation={[0, Math.PI, Math.PI / 2]}>{god}</Text>
        </mesh>

        <mesh position={[0, -2, 0]} receiveShadow>
          <cylinderGeometry args={[4.5, 3.5, 8, 8, 1, true]} />
          <meshStandardMaterial map={hullTex} metalness={0.9} roughness={0.1} side={THREE.DoubleSide} color="#ffffff" transparent={true} opacity={0.35} depthWrite={false} emissive="#121214" emissiveIntensity={0.5} />
        </mesh>

        <mesh position={[0, -12, 0]} receiveShadow>
          <cylinderGeometry args={[3.5, 4.5, 2, 8, 1, true]} />
          <meshStandardMaterial map={tailTex} metalness={0.8} roughness={0.3} side={THREE.DoubleSide} color="#ffffff" emissive="#121214" emissiveIntensity={0.5} />
        </mesh>

        {[0, Math.PI / 2, Math.PI, -Math.PI / 2].map((angle, i) => (
          <group key={`ad-${i}`} rotation={[0, angle, 0]}>
            <group position={[0, -1, 5.0]}>
              <TowerAdPanel
                slot={panels[i]}
                stakeTex={adTex}
                color={color}
                onLaunchExternal={onLaunchExternal}
              />
            </group>
          </group>
        ))}

        {[0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].map((rot, i) => (
          <group key={`prop-${i}`} position={[0, 12, 0]} rotation={[0, rot, 0]}>
            <mesh position={[0, 0, 5.5]} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
              <boxGeometry args={[1.5, 9, 0.1]} />
              <meshStandardMaterial map={propTex} metalness={0.6} roughness={0.4} color="#ffffff" emissive="#222222" emissiveIntensity={0.5} />
            </mesh>
            <mesh material={darkMetal} position={[0, 0, 1.5]} receiveShadow><cylinderGeometry args={[0.1, 0.1, 3]} rotation={[Math.PI / 2, 0, 0]} /></mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

// Memoized around the ad inventory (stake.com native panel inside) —
// internals untouched.
export default memo(GodTower);
