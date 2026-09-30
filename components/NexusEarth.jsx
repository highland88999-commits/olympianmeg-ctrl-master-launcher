'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { latLonToVec3, tileGrid } from '@/lib/geo';
import GoogleEarthTiles from '@/components/GoogleEarthTiles';

// The hub Earth, fused with real satellite imagery.
// - Clickable: onSelect fires (gated by parent to hub_freeroam).
// - Orientation is driven through the shared quatRef so the flight
//   controller can rotate the world (the treadmill: the traveler stands
//   still, the environment comes to them).
// - A detail "lens" patch shows real ESRI World Imagery tiles at the
//   current focus point.
// - When Google's photorealistic 3D tiles are available (session minted
//   server-side from GOOGLE_MAP_TILES_API_KEY), the stylized globe swaps
//   for the real photorealistic globe. The ESRI lens is the honest fallback:
//   it stays until the tiles actually render, and returns if they fail.
// - A small badge names the active layer in plain English.
export default function NexusEarth({ onSelect, quatRef, focus, phase, spinEnabled }) {
  const spinRef = useRef();
  const patchRef = useRef();
  const patchMatRef = useRef();
  const [textures, setTextures] = useState(null);
  const [patchTex, setPatchTex] = useState(null);
  // 'satellite' = stylized globe + ESRI lens (default, always honest).
  // 'photorealistic' = Google 3D tiles, only after they really render.
  const [layer, setLayer] = useState('satellite');

  useEffect(() => {
    let isMounted = true;
    const loader = new THREE.TextureLoader();
    const dayUrl = 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_atmos_2048.jpg';
    const nightUrl = 'https://unpkg.com/three-globe/example/img/earth-night.jpg';

    loader.load(dayUrl, (dayTex) => {
      dayTex.colorSpace = THREE.SRGBColorSpace;
      loader.load(nightUrl, (nightTex) => {
        nightTex.colorSpace = THREE.SRGBColorSpace;
        if (isMounted) setTextures({ day: dayTex, night: nightTex });
      }, undefined, () => {
        const blank = new THREE.DataTexture(new Uint8Array([5, 5, 15, 255]), 1, 1, THREE.RGBAFormat);
        blank.needsUpdate = true;
        if (isMounted) setTextures({ day: dayTex, night: blank });
      });
    }, undefined, () => {
      const blankDay = new THREE.DataTexture(new Uint8Array([50, 100, 200, 255]), 1, 1, THREE.RGBAFormat);
      blankDay.needsUpdate = true;
      if (isMounted) setTextures({ day: blankDay, night: blankDay });
    });

    return () => { isMounted = false; };
  }, []);

  const earthUniforms = useMemo(() => {
    if (!textures) return null;
    const sunPos = new THREE.Vector3(0, 90, 250);
    const earthPos = new THREE.Vector3(0, -60, -120);
    const sunDir = new THREE.Vector3().subVectors(sunPos, earthPos).normalize();

    return {
      dayTexture: { value: textures.day },
      nightTexture: { value: textures.night },
      sunDirection: { value: sunDir }
    };
  }, [textures]);

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

  // The stylized globe only renders once its textures exist; the
  // photorealistic tiles render as soon as Google's tileset loads.
  if (layer === 'satellite' && !textures) return null;
  const showStylized = layer === 'satellite' && textures && earthUniforms;

  return (
    <group position={[0, -60, -120]}>
      <group ref={spinRef}>
        <GoogleEarthTiles
          onSelect={onSelect}
          onActive={() => setLayer('photorealistic')}
          onInactive={() => setLayer('satellite')}
        />
        {showStylized && (
        <mesh
          receiveShadow
          castShadow
          onClick={(e) => { e.stopPropagation(); if (onSelect) onSelect(); }}
          onPointerOver={(e) => { e.stopPropagation(); if (onSelect) document.body.style.cursor = 'pointer'; }}
          onPointerOut={() => { document.body.style.cursor = ''; }}
        >
          <sphereGeometry args={[55, 64, 64]} />
          <shaderMaterial
            uniforms={earthUniforms}
            vertexShader={`
              varying vec2 vUv;
              varying vec3 vNormalWorld;
              void main() {
                vUv = uv;
                vNormalWorld = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
              }
            `}
            fragmentShader={`
              uniform sampler2D dayTexture;
              uniform sampler2D nightTexture;
              uniform vec3 sunDirection;
              varying vec2 vUv;
              varying vec3 vNormalWorld;
              void main() {
                vec3 n = normalize(vNormalWorld);
                float sunOrientation = dot(n, sunDirection);
                float dayMix = smoothstep(-0.2, 0.2, sunOrientation);
                vec3 dayColor = texture2D(dayTexture, vUv).rgb;
                vec3 nightColor = texture2D(nightTexture, vUv).rgb;
                vec3 sunset = vec3(0.8, 0.4, 0.1) * (1.0 - abs(sunOrientation * 5.0));
                sunset = clamp(sunset, 0.0, 1.0) * 0.4;
                gl_FragColor = vec4(mix(nightColor, dayColor, dayMix) + sunset, 1.0);
              }
            `}
          />
        </mesh>
        )}

        {layer === 'satellite' && patchTex && (
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
          {layer === 'photorealistic' ? 'Photorealistic · Google' : 'Satellite · ESRI'}
        </div>
      </Html>
    </group>
  );
}
