'use client';

// Earth2HubGate — THE EARTH 2 DOOR in the main hub (Merlin, 2026-10-22):
// "Put the portal to earth 2 in the main hub, but only my account can
// open it." It stands beyond the Sun on the Omega Arch's own plane,
// flanking it to the east — a smaller sibling monument in the Ω family
// form, skinned in earth tones, its swirl disc turning deep green and
// ocean blue under a serif EARTH 2 crown.
//
// THE GATE IS THE POINT: this component watches the Supabase browser
// session (the PortalRoomGate pattern) and runs every email through
// lib/earth2-hub-portal.js's pure decision, which defers to the
// Earth 2 access module — the one definition of Earth 2 access
// (the owner, plus the one named POC guest since 2026-10-23). For anyone
// without access — signed out, another account, or the session still
// resolving — the component returns null: the portal does not exist
// in the scene at all. No mesh, no label, no click target, nothing to
// inspect. The arch component below (and every texture it builds)
// only ever mounts behind a proven owner session.
//
// It is a door only: no Earth 2 models, characters, or content ride
// along — the chamber at /earth-2 keeps its own server-side owner
// gate as the second lock. Like the Omega Arch beside it, the door
// has no collider (portals are the hub's one pass-through exception):
// click it, or fly through the swirl, to step through.

import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useRouter } from 'next/navigation';
import * as THREE from 'three';
import { supabase } from '@/lib/supabase';
import { paintPortalSwirl } from '@/lib/portal-swirl';
import { paintVanGoghText, isVanGoghActive, useVanGoghActive } from '@/lib/vangogh';
import {
  EARTH2_HUB_ARCH,
  EARTH2_HUB_LABEL,
  EARTH2_HUB_PORTAL_RADIUS,
  EARTH2_HUB_POSITION,
  EARTH2_HUB_RING_CENTER_Y,
  EARTH2_HUB_ROUTE,
  EARTH2_SWIRL_PALETTE,
  earth2HubFootX,
  earth2HubFootY,
  earth2HubPortalCenter,
  earth2HubPortalVisible,
} from '@/lib/earth2-hub-portal';

// The swirl disc's face: the shared portal swirl, repainted in the
// door's earth palette at disc resolution.
function makeSwirlTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) paintPortalSwirl(ctx, size, EARTH2_SWIRL_PALETTE);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// The ring's skin: a marbled earth-tone wrap painted procedurally —
// deep green and ocean bands with gold-sand flecks. Deterministic
// (mulberry32, the portal-swirl discipline): the same stone on every
// mount, no Math.random.
function makeRingTexture() {
  const width = 1024;
  const height = 256;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  let a = 0x51ab3;
  const rand = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, '#0d4d3a');
  grad.addColorStop(0.35, '#0a3a5c');
  grad.addColorStop(0.62, '#0e5c46');
  grad.addColorStop(1, '#062840');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
  // Marble veins: soft translucent strokes wandering the band.
  for (let i = 0; i < 130; i++) {
    const y = rand() * height;
    const len = 60 + rand() * 260;
    const x = rand() * width;
    ctx.strokeStyle = rand() > 0.5 ? 'rgba(90,220,170,0.10)' : 'rgba(70,150,255,0.10)';
    ctx.lineWidth = 1 + rand() * 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(
      x + len * 0.3, y + (rand() - 0.5) * 22,
      x + len * 0.7, y + (rand() - 0.5) * 22,
      x + len, y + (rand() - 0.5) * 12
    );
    ctx.stroke();
  }
  // Gold-sand flecks, sparse.
  ctx.fillStyle = 'rgba(255,214,120,0.35)';
  for (let i = 0; i < 220; i++) {
    const s = rand() * 1.8 + 0.4;
    ctx.beginPath();
    ctx.arc(rand() * width, rand() * height, s, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 1);
  return tex;
}

// The crown label, in the Omega Arch's canvas-sprite convention:
// bold serif, a soft glow, floating over the ring.
function makeLabelSprite() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (isVanGoghActive()) {
    // Painterly umber shadow instead of the digital glow.
    paintVanGoghText(ctx, EARTH2_HUB_LABEL, canvas.width / 2, canvas.height / 2, {
      font: '700 118px Georgia, serif',
      fill: '#d2f7dc',
    });
  } else {
    ctx.font = '700 118px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(46, 224, 160, 0.9)';
    ctx.shadowBlur = 34;
    ctx.fillStyle = '#d2f7dc';
    ctx.fillText(EARTH2_HUB_LABEL, canvas.width / 2, canvas.height / 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function Earth2HubArch({ freeroam = false }) {
  const router = useRouter();
  const bobRef = useRef(null);
  const discRef = useRef(null);
  const enteredRef = useRef(false);
  const [swirlTex, setSwirlTex] = useState(null);
  const [ringTex, setRingTex] = useState(null);
  const [labelTex, setLabelTex] = useState(null);
  const vgogh = useVanGoghActive();

  useEffect(() => {
    const swirl = makeSwirlTexture();
    const ring = makeRingTexture();
    const label = makeLabelSprite();
    setSwirlTex(swirl);
    setRingTex(ring);
    setLabelTex(label);
    return () => {
      swirl.dispose();
      ring.dispose();
      label.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vgogh]);

  const enter = () => {
    if (!freeroam || enteredRef.current) return;
    enteredRef.current = true;
    router.push(EARTH2_HUB_ROUTE);
  };

  // Breathing bob (the Omega original's rhythm: sin(t * 1.5) * 2),
  // the slow turn of the swirl, and fly-through entry: crossing the
  // disc in freeroam steps through to the chamber.
  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    const bob = Math.sin(t * 1.5) * 2;
    if (bobRef.current) bobRef.current.position.y = bob;
    if (discRef.current) discRef.current.rotation.z = -t * 0.12;
    if (!freeroam || enteredRef.current) return;
    const c = state.camera.position;
    const center = earth2HubPortalCenter(bob);
    const dx = c.x - center.x;
    const dy = c.y - center.y;
    const dz = c.z - center.z;
    const inDisc =
      dx * dx + dy * dy < EARTH2_HUB_PORTAL_RADIUS * EARTH2_HUB_PORTAL_RADIUS * 0.81;
    if (inDisc && Math.abs(dz) < 26) enter();
  });

  const footX = earth2HubFootX() + EARTH2_HUB_ARCH.footLength / 2;
  const footY = EARTH2_HUB_RING_CENTER_Y + earth2HubFootY();
  const pointerProps = freeroam
    ? {
        onClick: (e) => {
          e.stopPropagation();
          enter();
        },
        onPointerOver: (e) => {
          e.stopPropagation();
          document.body.style.cursor = 'pointer';
        },
        onPointerOut: () => {
          document.body.style.cursor = '';
        },
      }
    : {};

  const ringMaterial = ringTex ? (
    <meshStandardMaterial
      map={ringTex}
      emissiveMap={ringTex}
      emissive="#ffffff"
      emissiveIntensity={0.55}
      roughness={0.35}
      metalness={0.55}
      fog={false}
    />
  ) : (
    <meshStandardMaterial
      color="#0b3d2e"
      emissive="#14532d"
      emissiveIntensity={0.5}
      roughness={0.35}
      metalness={0.6}
      fog={false}
    />
  );

  return (
    <group
      position={[EARTH2_HUB_POSITION.x, EARTH2_HUB_POSITION.y, EARTH2_HUB_POSITION.z]}
    >
      <group ref={bobRef}>
        {/* The Arch — 288° torus in marbled earth stone. fog:false so
            the door reads as a beacon through the hub's thin fog. */}
        <mesh
          position={[0, EARTH2_HUB_RING_CENTER_Y, 0]}
          rotation={[0, 0, EARTH2_HUB_ARCH.rotationZ]}
          {...pointerProps}
        >
          <torusGeometry
            args={[EARTH2_HUB_ARCH.radius, EARTH2_HUB_ARCH.tube, 48, 96, EARTH2_HUB_ARCH.arc]}
          />
          {ringMaterial}
        </mesh>

        {/* The Ω feet — horizontal cylinders at the gap's endpoints. */}
        {[footX, -footX].map((x) => (
          <mesh
            key={x}
            position={[x, footY, 0]}
            rotation={[0, 0, Math.PI / 2]}
            {...pointerProps}
          >
            <cylinderGeometry
              args={[EARTH2_HUB_ARCH.tube, EARTH2_HUB_ARCH.tube, EARTH2_HUB_ARCH.footLength, 48]}
            />
            {ringMaterial}
          </mesh>
        ))}

        {/* The swirl disc inside the Arch — deep green and ocean
            blue, turning slowly on its own axis. */}
        <mesh ref={discRef} position={[0, EARTH2_HUB_RING_CENTER_Y, 0]} {...pointerProps}>
          <circleGeometry args={[EARTH2_HUB_PORTAL_RADIUS, 64]} />
          {swirlTex ? (
            <meshBasicMaterial
              map={swirlTex}
              transparent
              opacity={0.95}
              side={THREE.DoubleSide}
              fog={false}
            />
          ) : (
            <meshBasicMaterial
              color="#06231a"
              transparent
              opacity={0.9}
              side={THREE.DoubleSide}
              fog={false}
            />
          )}
        </mesh>

        {/* Sea-green arch glow. */}
        <pointLight
          position={[0, EARTH2_HUB_RING_CENTER_Y, 24]}
          intensity={2}
          distance={520}
          decay={0}
          color="#2ee6a8"
        />

        {/* Name label floating over the crown. */}
        {labelTex && (
          <sprite
            position={[0, EARTH2_HUB_RING_CENTER_Y + EARTH2_HUB_ARCH.radius + EARTH2_HUB_ARCH.tube + 16, 0]}
            scale={[84, 21, 1]}
          >
            <spriteMaterial
              map={labelTex}
              transparent
              depthWrite={false}
              toneMapped={false}
              fog={false}
            />
          </sprite>
        )}
      </group>
    </group>
  );
}

export default function Earth2HubGate({ freeroam = false }) {
  // The session's email, or null while it resolves / when signed out.
  // Null is not the owner — the door stays absent until the session
  // proves whose it is.
  const [sessionEmail, setSessionEmail] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (alive) setSessionEmail(data?.session?.user?.email || null);
      } catch {
        if (alive) setSessionEmail(null);
      }
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (alive) setSessionEmail(session?.user?.email || null);
    });
    return () => {
      alive = false;
      if (sub && sub.subscription) sub.subscription.unsubscribe();
    };
  }, []);

  if (!earth2HubPortalVisible(sessionEmail)) return null;
  return <Earth2HubArch freeroam={freeroam} />;
}
