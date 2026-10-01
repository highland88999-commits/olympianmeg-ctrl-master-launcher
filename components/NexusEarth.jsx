'use client';
import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { latLonToVec3, tileGrid } from '@/lib/geo';
import GoogleEarthTiles from '@/components/GoogleEarthTiles';
import ProceduralEarthGlobe from '@/components/ProceduralEarthGlobe';

// The hub Earth: Google's photorealistic 3D tiles when they stream, a real
// procedural 3D terrain globe as the fallback — Earth is always 3D, never a
// flat picture.
// - Clickable: onSelect fires (gated by parent to hub_freeroam).
// - Orientation is driven through the shared quatRef so the flight
//   controller can rotate the world (the treadmill: the traveler stands
//   still, the environment comes to them).
// - A detail "lens" patch shows real ESRI World Imagery tiles at the
//   current focus point.
// - When Google's photorealistic 3D tiles are available (session minted
//   server-side from GOOGLE_MAP_TILES_API_KEY), the terrain globe swaps
//   for the real photorealistic globe. The procedural terrain globe is the
//   honest fallback: it renders until the tiles actually load, and returns
//   if they fail. All textures are self-hosted under public/textures/earth.
// - A small badge names the active layer in plain English.
export default function NexusEarth({ onSelect, quatRef, focus, phase, spinEnabled }) {
  const spinRef = useRef();
  const patchRef = useRef();
  const patchMatRef = useRef();
  const [patchTex, setPatchTex] = useState(null);
  // 'terrain' = procedural 3D globe + ESRI lens (default, always 3D).
  // 'photorealistic' = Google 3D tiles, only after they really render.
  const [layer, setLayer] = useState('terrain');

  // Shared-orientation spin + patch fade.
  useFrame((state, delta) => {
    if (spinEnabled && spinRef.current && quatRef?.current) {
      const qy = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0), delta * 0.05
      );
      quatRef.current.multiply(qy);
    }
    if (spinRef.current && quatRef?.current) {
      spinRef.current.quaternion.copy(quatRef.current);
    }
    if (patchMatRef.current) {
      const target = focus && phase !== 'earth_travel' ? 0.96 : 0;
      const m = patchMatRef.current;
      m.opacity += (target - m.opacity) * Math.min(1, delta * 3);
    }
  });

  // Real satellite imagery lens at the focus point.
  useEffect(() => {
    if (!focus) { setPatchTex(null); return; }
    let alive = true;
    // Detail lens: zoom 12 gives street-level sharpness at the dive
    // distance (zoom 8 rendered as brown/green blur up close).
    const Z = 12, N = 6, S = 256;
    const tiles = tileGrid(focus.lat, focus.lon, Z, N);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = S * N;
    const ctx = canvas.getContext('2d');
    // iPhone hardening (2026-10-01): iOS Safari returns null for 2D
    // contexts under canvas memory pressure — skip the tile paint honestly
    // instead of throwing into the React error boundary.
    if (!ctx) return () => { alive = false; };
    let done = 0;
    tiles.forEach((tl, idx) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (!alive) return;
        ctx.drawImage(img, (idx % N) * S, Math.floor(idx / N) * S, S, S);
        done += 1;
        if (done === tiles.length) {
          const tex = new THREE.CanvasTexture(canvas);
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = 4;
          if (alive) setPatchTex(tex);
        }
      };
      img.onerror = () => {
        done += 1;
        if (alive && done === tiles.length && done > 0) {
          const tex = new THREE.CanvasTexture(canvas);
          tex.colorSpace = THREE.SRGBColorSpace;
          setPatchTex(tex);
        }
      };
      img.src = tl.url;
    });
    return () => { alive = false; };
  }, [focus?.lat, focus?.lon]);

  // Glue the lens to the sphere at the focus lat/lon.
  useEffect(() => {
    if (patchRef.current && focus) {
      const p = latLonToVec3(focus.lat, focus.lon, 55.5);
      patchRef.current.position.set(p.x, p.y, p.z);
      const n = new THREE.Vector3(p.x, p.y, p.z).normalize();
      patchRef.current.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    }
  }, [focus?.lat, focus?.lon, patchTex]);

  return (
    <group position={[0, -60, -120]}>
      <group ref={spinRef}>
        <GoogleEarthTiles
          onSelect={onSelect}
          onActive={() => setLayer('photorealistic')}
          onInactive={() => setLayer('terrain')}
        />
        {layer === 'terrain' && <ProceduralEarthGlobe onSelect={onSelect} />}

        {layer === 'terrain' && patchTex && (
          <mesh ref={patchRef}>
            <circleGeometry args={[5.2, 48]} />
            <meshBasicMaterial
              ref={patchMatRef}
              map={patchTex}
              transparent
              opacity={0}
              depthWrite={false}
            />
          </mesh>
        )}
      </group>

      <mesh scale={[1.025, 1.025, 1.025]}>
        <sphereGeometry args={[55, 64, 64]} />
        <shaderMaterial
          blending={THREE.AdditiveBlending}
          side={THREE.BackSide}
          transparent={true}
          depthWrite={false}
          vertexShader={`
            varying vec3 vNormalWorld;
            void main() {
              vNormalWorld = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `}
          fragmentShader={`
            varying vec3 vNormalWorld;
            void main() {
              vec3 cameraDir = normalize(cameraPosition - vNormalWorld);
              float intensity = pow(0.6 - dot(normalize(vNormalWorld), cameraDir), 2.0);
              vec3 atmosphere = vec3(0.1, 0.4, 1.0) * intensity;
              gl_FragColor = vec4(atmosphere, 1.0) * (intensity * 1.5);
            }
          `}
        />
      </mesh>

      {/* Honest layer badge: names what is actually rendering, in plain English. */}
      <Html position={[0, 64, 0]} center zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
        <div className="pointer-events-none select-none whitespace-nowrap rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-medium tracking-wide text-white/90 backdrop-blur-sm">
          {layer === 'photorealistic' ? 'Photorealistic · Google' : 'Terrain · 3D'}
        </div>
      </Html>
    </group>
  );
}
