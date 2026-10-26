'use client';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  TERRAIN_TEXTURES,
  buildTerrainGeometry,
} from '@/lib/terrain';

// ProceduralEarthGlobe — the always-3D fallback Earth.
//
// When Google's photorealistic 3D tiles can't stream, Earth does NOT go
// flat: this globe renders real global relief — a sphere displaced by a
// self-hosted elevation heightmap (public/textures/earth/earth-topology.png),
// colored by a hypsometric ramp (abyss -> shelf -> lowland -> highland ->
// rock -> snow, plus polar ice caps), blended with self-hosted day/night
// satellite imagery. Displacement is precomputed once at load in JS (cheaper
// per-frame than vertex texture fetch on low-end phones); segment density
// adapts to the device so phones stay smooth.
//
// Lighting is deliberately gentle: a soft day/night terminator only, so the
// surface texture is never washed out. The atmosphere rim comes from the
// shell mesh in NexusEarth.

const VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalWorld;
  void main() {
    vUv = uv;
    vNormalWorld = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D dayTexture;
  uniform sampler2D nightTexture;
  uniform sampler2D heightTexture;
  uniform vec3 sunDirection;
  varying vec2 vUv;
  varying vec3 vNormalWorld;

  // Hypsometric tint: real terrain colors by elevation.
  // No water on Earth 1 (2026-10-26): the former ocean floor is
  // dry seabed — dusty basin tones rising to shelf sand, then
  // blending into the ordinary lowland ramp. Nothing renders blue.
  vec3 hypsometric(float h) {
    // seabed: deep basin -> shelf sand (dry, walkable terrain)
    vec3 seabed = mix(vec3(0.42, 0.36, 0.26), vec3(0.55, 0.48, 0.33), smoothstep(0.0, 0.047, h));
    // land: lowland -> highland -> rock -> snow
    vec3 land = vec3(0.16, 0.35, 0.13);
    land = mix(land, vec3(0.45, 0.33, 0.20), smoothstep(0.09, 0.24, h));
    land = mix(land, vec3(0.48, 0.45, 0.42), smoothstep(0.24, 0.45, h));
    land = mix(land, vec3(0.93, 0.95, 0.98), smoothstep(0.55, 0.72, h));
    float landAmt = smoothstep(0.043, 0.051, h);
    vec3 t = mix(seabed, land, landAmt);
    // Polar ice caps: with no water left, the polar basins are dry
    // land, so ice sits at polar latitudes outright (no land gate).
    float lat = abs(vUv.y * 2.0 - 1.0);
    float ice = smoothstep(0.80, 0.88, lat);
    return mix(t, vec3(0.93, 0.95, 0.98), ice);
  }

  void main() {
    vec3 n = normalize(vNormalWorld);
    float h = texture2D(heightTexture, vUv).r;
    vec3 terrain = hypsometric(h);
    vec3 photo = texture2D(dayTexture, vUv).rgb;
    // Dry Earth (2026-10-26, quantum-removal follow-up): the day
    // photo still carries blue oceans — that is the "trace of
    // water" in the orbit view (the globe's own texture, not a
    // water system: game water was already removed). Any texel
    // that reads ocean-blue (blue clearly above red AND green —
    // land, cloud and ice never read that way) is repainted as
    // dry seabed BEFORE the terrain mix, so no blue survives
    // anywhere on the globe. Land photo detail is untouched.
    float oceanness = smoothstep(0.05, 0.15, photo.b - max(photo.r, photo.g));
    photo = mix(photo, terrain, oceanness);
    // Terrain tint carries the relief; the photo carries coastlines/deserts.
    vec3 dayColor = mix(photo, terrain, 0.55);
    vec3 nightColor = texture2D(nightTexture, vUv).rgb;
    float sunOrientation = dot(n, sunDirection);
    float dayMix = smoothstep(-0.15, 0.25, sunOrientation);
    vec3 col = mix(nightColor * 1.1, dayColor, dayMix);
    // Gentle terminator shading only — the texture is never washed out.
    col *= mix(0.72, 1.0, dayMix);
    // Ambient floor (round 4): over former ocean beds the night
    // texture is ~black, so any facet turned from the sun went PURE black —
    // the black slabs over former polar basins and the black
    // polygons seen from the overlook. Unlit terrain now keeps a
    // floor of its own day identity: shadow sides read deep
    // brown-grey, never naked black. Night stays night (the floor
    // is dim and it vanishes on the day side).
    col += dayColor * 0.14 * (1.0 - dayMix);
    gl_FragColor = vec4(col, 1.0);
  }
`;

export default function ProceduralEarthGlobe({ onSelect, quatRef }) {
  const [ready, setReady] = useState(null);
  const disposables = useRef([]);

  useEffect(() => {
    let alive = true;
    const mobile =
      typeof window !== 'undefined' &&
      (window.innerWidth < 768 || 'ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0);
    const loader = new THREE.TextureLoader();
    const load = (url) =>
      new Promise((resolve, reject) => {
        loader.load(url, resolve, undefined, reject);
      });

    (async () => {
      try {
        const [heightTex, dayTex, nightTex] = await Promise.all([
          load(TERRAIN_TEXTURES.height),
          load(TERRAIN_TEXTURES.day),
          load(TERRAIN_TEXTURES.night),
        ]);
        if (!alive) return;
        // Read the elevation pixels once on the CPU.
        const img = heightTex.image;
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        const px = ctx.getImageData(0, 0, img.width, img.height).data;
        const gray = new Uint8Array(img.width * img.height);
        for (let i = 0; i < gray.length; i++) gray[i] = px[i * 4];
        const geometry = buildTerrainGeometry(gray, img.width, img.height, mobile);
        dayTex.colorSpace = THREE.SRGBColorSpace;
        nightTex.colorSpace = THREE.SRGBColorSpace;
        disposables.current = [geometry, heightTex, dayTex, nightTex];
        const sunPos = new THREE.Vector3(0, 90, 250);
        const earthPos = new THREE.Vector3(0, -60, -120);
        const sunDirection = new THREE.Vector3().subVectors(sunPos, earthPos).normalize();
        if (alive) {
          setReady({
            geometry,
            uniforms: {
              dayTexture: { value: dayTex },
              nightTexture: { value: nightTex },
              heightTexture: { value: heightTex },
              sunDirection: { value: sunDirection },
            },
          });
        }
      } catch {
        // Textures missing/unreadable: render nothing; the tile globe or a
        // retry owns the screen. Never a flat picture, never a crash.
        if (alive) setReady({ failed: true });
      }
    })();

    return () => {
      alive = false;
      disposables.current.forEach((d) => {
        try {
          d.dispose();
        } catch {
          /* already gone */
        }
      });
      disposables.current = [];
    };
  }, []);

  if (!ready || ready.failed) return null;

  return (
    <mesh
      geometry={ready.geometry}
      receiveShadow
      castShadow
      onClick={(e) => {
        e.stopPropagation();
        if (onSelect) onSelect();
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        if (onSelect) document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        document.body.style.cursor = '';
      }}
    >
      <shaderMaterial
        uniforms={ready.uniforms}
        vertexShader={VERTEX_SHADER}
        fragmentShader={FRAGMENT_SHADER}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
