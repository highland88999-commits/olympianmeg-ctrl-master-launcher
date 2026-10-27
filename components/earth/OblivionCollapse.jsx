// components/earth/OblivionCollapse.jsx — the Oblivion collapse
// cinematic (Merlin, 2026-10-26 late evening orders).
//
// An ORIGINAL effect in the grammar of his reference video — a
// bright mass blooms, pulls inward toward a central point, and
// collapses into a dark void with radiant light streaks — built
// here as a single phone-cheap fragment shader. NEVER the video
// file itself: no footage is embedded, copied, or hotlinked; the
// grammar is taken, the asset is not.
//
// Phases (lib/earth/oblivion.js COLLAPSE_PHASES, ~9.5 s total):
//   bloom (0–2.5 s): a warm gold-white mass blooms at center.
//   pull (2.5–7 s): the field streaks inward, ink-dark clouds
//     bloom at the edges, the outer field dims toward the point.
//   collapse (7–9.5 s): everything falls into a shrinking void
//     point with a radiant streak flash, then fades to black.
// onDone fires once at the end. If WebGL is unavailable, a plain
// fallback panel with a Continue button is shown instead — the
// user is never trapped behind a failed effect.
'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { COLLAPSE_TOTAL_MS } from '@/lib/earth/oblivion';

const VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAGMENT = `
  precision highp float;
  uniform float uTime;
  uniform vec2 uRes;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p *= 2.03;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 uv = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0) * 2.0;
    float r = length(uv);
    float ang = atan(uv.y, uv.x);
    float t = uTime;
    vec3 gold = vec3(1.0, 0.72, 0.32);
    vec3 white = vec3(1.0, 0.95, 0.85);
    vec3 col = vec3(0.0);

    // BLOOM: a warm mass grows at the center.
    float bloomT = clamp(t / 2.5, 0.0, 1.0);
    float bloomR = 0.08 + 0.5 * bloomT * bloomT;
    float core = smoothstep(bloomR, bloomR * 0.25, r);
    col += mix(gold, white, core) * core * bloomT;
    col += gold * smoothstep(1.2, 0.0, r) * 0.25 * bloomT;

    // PULL: the field streaks inward; ink clouds bloom at the
    // edges; the outer field dims toward the central point.
    float pullT = clamp((t - 2.5) / 4.5, 0.0, 1.0);
    if (pullT > 0.0) {
      float pr = r * (1.0 + pullT * 1.8);
      float streak = 0.5 + 0.5 * sin(ang * 36.0 + fbm(vec2(ang * 3.0, pr * 2.0)) * 6.0);
      float streakMask = smoothstep(0.75, 0.95, streak) * smoothstep(1.4, 0.2, pr);
      col += gold * streakMask * pullT * (1.0 - r * 0.5);
      float ink = fbm(uv * 2.5 + vec2(t * 0.05, -t * 0.03));
      float inkMask = smoothstep(0.55, 0.8, ink) * smoothstep(0.3, 1.3, r);
      col = mix(col, vec3(0.02, 0.0, 0.05), inkMask * pullT * 0.85);
      col *= 1.0 - pullT * smoothstep(0.4, 1.4, r) * 0.7;
    }

    // COLLAPSE: everything falls into a shrinking void point
    // with a radiant streak flash, then fades to black.
    float colT = clamp((t - 7.0) / 2.5, 0.0, 1.0);
    if (colT > 0.0) {
      float voidR = mix(1.3, 0.0, colT);
      float outside = smoothstep(voidR, voidR + 0.15, r);
      col *= 1.0 - outside;
      float streaks = 0.5 + 0.5 * sin(ang * 72.0);
      col += vec3(1.0, 0.9, 0.7) * streaks * pow(max(0.0, 1.0 - r), 3.0) * colT * (1.0 - colT) * 4.0;
      col += white * pow(max(0.0, 1.0 - r * 3.0), 2.0) * (1.0 - colT);
      col *= 1.0 - smoothstep(0.75, 1.0, colT);
    }

    gl_FragColor = vec4(col, 1.0);
  }
`;

export default function OblivionCollapse({ onDone }) {
  const mountRef = useRef(null);
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;
    let renderer = null;
    let raf = 0;
    let material = null;
    let geometry = null;
    const fireDone = () => {
      if (!doneRef.current) {
        doneRef.current = true;
        if (onDoneRef.current) onDoneRef.current();
      }
    };
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    } catch {
      setFailed(true);
      return undefined;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    const resize = () => {
      if (!mount || !renderer) return;
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      renderer.setSize(w, h);
      if (material) material.uniforms.uRes.value.set(w, h);
    };
    renderer.setSize(mount.clientWidth || 1, mount.clientHeight || 1);
    mount.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.Camera();
    material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uRes: { value: new THREE.Vector2(mount.clientWidth || 1, mount.clientHeight || 1) },
      },
    });
    geometry = new THREE.PlaneGeometry(2, 2);
    scene.add(new THREE.Mesh(geometry, material));
    window.addEventListener('resize', resize);
    const start = performance.now();
    const loop = () => {
      const t = (performance.now() - start) / 1000;
      material.uniforms.uTime.value = t;
      renderer.render(scene, camera);
      if (t * 1000 >= COLLAPSE_TOTAL_MS) {
        fireDone();
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      try {
        if (renderer) renderer.dispose();
        if (material) material.dispose();
        if (geometry) geometry.dispose();
        if (renderer && renderer.domElement && renderer.domElement.parentNode === mount) {
          mount.removeChild(renderer.domElement);
        }
      } catch {}
    };
  }, []);

  if (failed) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-black px-6 text-center">
        <p className="text-sm text-zinc-300">Earth is gone — the wait begins.</p>
        <button
          type="button"
          onClick={() => { if (!doneRef.current) { doneRef.current = true; if (onDone) onDone(); } }}
          className="rounded-full border border-cyan-400/50 bg-cyan-950/40 px-6 py-2.5 text-sm font-bold text-cyan-100"
        >
          Continue to the countdown
        </button>
      </div>
    );
  }
  return <div ref={mountRef} className="h-full w-full overflow-hidden bg-black" aria-label="Oblivion collapse" />;
}
