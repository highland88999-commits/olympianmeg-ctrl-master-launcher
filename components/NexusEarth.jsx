'use client';
import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import GoogleEarthTiles from '@/components/GoogleEarthTiles';
import ProceduralEarthGlobe from '@/components/ProceduralEarthGlobe';
import EarthAssets from '@/components/EarthAssets';
import EarthWalker from '@/components/EarthWalker';
import { LENS_PRESETS, lensTilePlan, buildLensGeometryData } from '@/lib/earth/lens';
import { loadHeightData, getHeightData } from '@/lib/earth/heightmap';
import { roamState } from '@/lib/earth/roam';

// The hub Earth: Google's photorealistic 3D tiles when they stream, a real
// procedural 3D terrain globe as the fallback — Earth is always 3D, never a
// flat picture.
// - Clickable: onSelect fires (gated by parent to hub_freeroam).
// - Orientation is driven through the shared quatRef so the flight
//   controller can rotate the world (the treadmill: the traveler stands
//   still, the environment comes to them).
// - A detail "lens" drapes real ESRI World Imagery over the terrain
//   at the current focus (overlook) or under the traveler's feet
//   (street level): the sheet is built from lib/earth/lens.js —
//   every vertex grounded on the heightmap, the texture registered
//   by true lat/lon, the rim feathered into the globe. (Day 2 fix
//   for demo flaw E2: the old flat, unregistered disc let terrain
//   poke through in wedges and never matched the coast beneath it.)
// - When Google's photorealistic 3D tiles are available (session minted
//   server-side from GOOGLE_MAP_TILES_API_KEY), the terrain globe swaps
//   for the real photorealistic globe. The procedural terrain globe is the
//   honest fallback: it renders until the tiles actually load, and returns
//   if they fail. All textures are self-hosted under public/textures/earth.
// - Street level (Day 2) runs on the terrain globe — the layer that
//   carries the placed world — so roaming forces the terrain layer
//   and mounts the embodied traveler (EarthWalker).
// - A small badge names the active layer in plain English.
export default function NexusEarth({ onSelect, quatRef, focus, phase, spinEnabled }) {
  const spinRef = useRef();
  const lensMatRef = useRef();
  const lensRef = useRef(null); // { tex, geo } awaiting disposal
  const roamCenterRef = useRef(null);
  const lastLensBuildRef = useRef(0);
  const [lens, setLens] = useState(null);
  const [heightReady, setHeightReady] = useState(false);
  const [roamCenter, setRoamCenter] = useState(null);
  // 'terrain' = procedural 3D globe + ESRI lens (default, always 3D).
  // 'photorealistic' = Google 3D tiles, only after they really render.
  const [layer, setLayer] = useState('terrain');

  const roaming = phase === 'diving_to_street' || phase === 'earth_roam';
  const effectiveLayer = roaming ? 'terrain' : layer;

  // Shared heightmap: one decode for globe, assets, lens, walker.
  useEffect(() => {
    let alive = true;
    loadHeightData().then((hd) => { if (alive && hd) setHeightReady(true); });
    return () => { alive = false; };
  }, []);

  // While roaming, recenter the street lens when the traveler has
  // walked out of its middle (throttled: the composite is a real
  // canvas build, and the feather hides the handoff).
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
    if (lensMatRef.current) {
      const target = (focus || roaming) && phase !== 'earth_travel' ? 0.96 : 0;
      const m = lensMatRef.current;
      m.opacity += (target - m.opacity) * Math.min(1, delta * 3);
    }
    if (roaming && roamState.active) {
      const c = roamCenterRef.current;
      const moved = !c
        || Math.abs(c.lat - roamState.lat) > 0.06
        || Math.abs(c.lon - roamState.lon) > 0.06;
      const now = performance.now();
      if (moved && now - lastLensBuildRef.current > 900) {
        lastLensBuildRef.current = now;
        const next = { lat: roamState.lat, lon: roamState.lon };
        roamCenterRef.current = next;
        setRoamCenter(next);
      }
    }
  });

  // Build the lens for the current centre + range preset.
  const lensCenter = roaming ? roamCenter : focus;
  const presetName = roaming ? 'street' : 'overlook';
  const centerKey = lensCenter
    ? `${presetName}:${lensCenter.lat.toFixed(4)},${lensCenter.lon.toFixed(4)}`
    : null;
  useEffect(() => {
    if (!lensCenter || !heightReady) { setLens(null); return undefined; }
    let alive = true;
    const preset = LENS_PRESETS[presetName];
    const plan = lensTilePlan(lensCenter.lat, lensCenter.lon, preset.zoom, preset.grid, preset.canvasPx);
    const S = preset.canvasPx / preset.grid;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = preset.canvasPx;
    const ctx = canvas.getContext('2d');
    // iPhone hardening (2026-10-01): iOS Safari returns null for 2D
    // contexts under canvas memory pressure — skip the lens honestly
    // instead of throwing into the React error boundary.
    if (!ctx) return undefined;
    let settledCount = 0;
    let okCount = 0;
    const finish = () => {
      if (!alive || okCount === 0) return;
      // Feather the rim into the globe: opaque through the middle,
      // gone at the edge — no hard matte ring.
      ctx.globalCompositeOperation = 'destination-in';
      const c = preset.canvasPx / 2;
      const grad = ctx.createRadialGradient(c, c, c * 0.68, c, c, c);
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, preset.canvasPx, preset.canvasPx);
      ctx.globalCompositeOperation = 'source-over';
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      const hd = getHeightData();
      if (!hd) return;
      const data = buildLensGeometryData(
        hd.data, hd.w, hd.h, lensCenter.lat, lensCenter.lon,
        preset.radiusUnits, plan,
        { rings: presetName === 'street' ? 12 : 22, sectors: 48 },
      );
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(data.uvs, 2));
      geo.setIndex(new THREE.BufferAttribute(data.indices, 1));
      if (lensRef.current) {
        lensRef.current.tex.dispose();
        lensRef.current.geo.dispose();
      }
      lensRef.current = { tex, geo };
      setLens(lensRef.current);
    };
    plan.tiles.forEach((t) => {
      if (!t.url) { settledCount += 1; if (settledCount === plan.tiles.length) finish(); return; }
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (!alive) return;
        ctx.drawImage(img, t.px, t.py, S, S);
        okCount += 1;
        settledCount += 1;
        if (settledCount === plan.tiles.length) finish();
      };
      img.onerror = () => {
        settledCount += 1;
        if (settledCount === plan.tiles.length) finish();
      };
      img.src = t.url;
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerKey, heightReady]);

  // Dispose the lens sheet on unmount.
  useEffect(() => () => {
    if (lensRef.current) {
      lensRef.current.tex.dispose();
      lensRef.current.geo.dispose();
      lensRef.current = null;
    }
  }, []);

  return (
    <group position={[0, -60, -120]}>
      <group ref={spinRef}>
        <group visible={!roaming}>
          <GoogleEarthTiles
            onSelect={onSelect}
            onActive={() => setLayer('photorealistic')}
            onInactive={() => setLayer('terrain')}
          />
        </group>
        {effectiveLayer === 'terrain' && <ProceduralEarthGlobe onSelect={onSelect} />}
        {effectiveLayer === 'terrain' && <EarthAssets />}
        {effectiveLayer === 'terrain' && <EarthWalker />}

        {effectiveLayer === 'terrain' && lens && (
          <mesh geometry={lens.geo} renderOrder={3}>
            <meshBasicMaterial
              ref={lensMatRef}
              map={lens.tex}
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
          {effectiveLayer === 'photorealistic' ? 'Photorealistic · Google' : 'Terrain · 3D'}
        </div>
      </Html>
    </group>
  );
}
