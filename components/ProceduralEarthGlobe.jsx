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
  vec3 hypsometric(float h) {
    // ocean: abyss -> continental shelf (clear blue, not murky)
    vec3 ocean = mix(vec3(0.02, 0.15, 0.45), vec3(0.10, 0.45, 0.75), smoothstep(0.0, 0.047, h));
    // land: lowland -> highland -> rock -> snow
    vec3 land = vec3(0.16, 0.35, 0.13);
    land = mix(land, vec3(0.45, 0.33, 0.20), smoothstep(0.09, 0.24, h));
    land = mix(land, vec3(0.48, 0.45, 0.42), smoothstep(0.24, 0.45, h));
    land = mix(land, vec3(0.93, 0.95, 0.98), smoothstep(0.55, 0.72, h));
    vec3 t = mix(ocean, land, smoothstep(0.043, 0.051, h));
    // polar ice caps
    float lat = abs(vUv.y * 2.0 - 1.0);
    float ice = smoothstep(0.80, 0.88, lat);
    return mix(t, vec3(0.93, 0.95, 0.98), ice);
  }

  void main() {
    vec3 n = normalize(vNormalWorld);
    float h = texture2D(heightTexture, vUv).r;
    vec3 terrain = hypsometric(h);
    vec3 photo = texture2D(dayTexture, vUv).rgb;
    // Terrain tint carries the relief; the photo carries coastlines/deserts.
    vec3 dayColor = mix(photo, terrain, 0.55);
    vec3 nightColor = texture2D(nightTexture, vUv).rgb;
    float sunOrientation = dot(n, sunDirection);
    float dayMix = smoothstep(-0.15, 0.25, sunOrientation);
    vec3 col = mix(nightColor * 1.1, dayColor, dayMix);
    // Gentle terminator shading only — the texture is never washed out.
    col *= mix(0.72, 1.0, dayMix);
    gl_FragColor = vec4(col, 1.0);
  }
`;

export default function ProceduralEarthGlobe({ onSelect, onParachute, onTileSelect, quatRef }) {
  const [ready, setReady] = useState(null);
  const disposables = useRef([]);
  const doubleTapRef = useRef({ time: 0, x: 0, y: 0 });

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
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (!onParachute) return;
        const hit = e.intersections && e.intersections[0];
        if (!hit) return;
        // World → NexusEarth local → lat/lon (inverse of latLonToVec3)
        const wp = hit.point.clone();
        wp.y -= -60; wp.z -= -120;
        const q = quatRef?.current;
        if (q) wp.applyQuaternion(q.clone().invert());
        const r = Math.hypot(wp.x, wp.y, wp.z) || 55;
        const lat = 90 - (Math.acos(Math.max(-1, Math.min(1, wp.y / r))) * 180) / Math.PI;
        let lon = (Math.atan2(wp.z, -wp.x) * 180) / Math.PI - 180;
        while (lon > 180) lon -= 360;
        while (lon < -180) lon += 360;
        if (lat >= -85 && lat <= 85) onParachute({ lat, lon });
      }}
      onPointerDown={(e) => {
        // Double-tap for touch devices (iOS doesn't fire onDoubleClick)
        if (e.pointerType && e.pointerType !== 'touch') return;
        const now = performance.now();
        const last = doubleTapRef.current;
        const cx = e.clientX ?? e.nativeEvent?.clientX ?? 0;
        const cy = e.clientY ?? e.nativeEvent?.clientY ?? 0;
        if (now - last.time < 350 && Math.hypot(cx - last.x, cy - last.y) < 40) {
          doubleTapRef.current = { time: 0, x: 0, y: 0 };
          // Reuse the double-click handler logic
          e.stopPropagation();
          if (!onParachute) return;
          const hit = e.intersections && e.intersections[0];
          if (!hit) return;
          const wp = hit.point.clone();
          wp.y -= -60; wp.z -= -120;
          const q = quatRef?.current;
          if (q) wp.applyQuaternion(q.clone().invert());
          const r = Math.hypot(wp.x, wp.y, wp.z) || 55;
          const lat = 90 - (Math.acos(Math.max(-1, Math.min(1, wp.y / r))) * 180) / Math.PI;
          let lon = (Math.atan2(wp.z, -wp.x) * 180) / Math.PI - 180;
          while (lon > 180) lon -= 360;
          while (lon < -180) lon += 360;
          if (lat >= -85 && lat <= 85) onParachute({ lat, lon });
        } else {
          doubleTapRef.current = { time: now, x: cx, y: cy };
          // Single tap: select the tile (blue ring + DROP button via onTileSelect)
          const hit = e.intersections && e.intersections[0];
          if (hit && onTileSelect) {
            const wp = hit.point.clone();
            wp.y -= -60; wp.z -= -120;
            const q = quatRef?.current;
            if (q) wp.applyQuaternion(q.clone().invert());
            const r = Math.hypot(wp.x, wp.y, wp.z) || 55;
            const lat = 90 - (Math.acos(Math.max(-1, Math.min(1, wp.y / r))) * 180) / Math.PI;
            let lon = (Math.atan2(wp.z, -wp.x) * 180) / Math.PI - 180;
            while (lon > 180) lon -= 360;
            while (lon < -180) lon += 360;
            if (lat >= -85 && lat <= 85) onTileSelect({ lat, lon });
          }
        }
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
