// components/earth/RedwaterQuicksand.tsx
// Redwater quicksand journey — Merlin's spec (2026-10-17).
//
// A SINGLE quicksand pit sits in Redwater. Walking over it drops the player
// through slow-rising compact sand (video texture scrolling UP = illusion of
// sinking DOWN), 100m down into a rock chamber, then a 2km tunnel lined with
// uniquely-wrapped rocks and gems, down to the Earth's core. Behind the
// barrier: 3 gold bars. Claiming one opens a vertical circular portal to
// Mega City (New York). Global cap: 5 gold collects, ever. Exempt:
// olympiannexus@gmail.com, olympianmeg@gmail.com. Every completer earns the
// 'redwater-core-diver' achievement + a diamond-crusted sniper (diamond
// bullets) in their backpack.
//
// Mount: inside any R3F <Canvas> in an Earth-surface scene. Props:
//   playerPosition: { x, z } — the walker's ground-plane position
//   onTeleportNYC: () => void — called when the player walks through the portal
'use client';

import { useRef, useState, useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { supabase } from '@/lib/supabase';
import { fx } from '@/lib/fx';
import AchievementBanner from '@/components/achievements/AchievementBanner';

// ---------------------------------------------------------------- constants
// PIT is exported: the NexusEarth mount (RedwaterMount) maps the
// walker's lat/lon into this local frame, so the trigger radius
// and the pit position stay single-sourced here.
export const PIT = { x: 100, z: -50, r: 3 };       // the ONE quicksand pit in Redwater
const SINK_DEPTH = 100;                      // metres of slow quicksand sink
export const CORE_DEPTH = 2000;              // metres down: the Earth's core (the mount's core camera reads it)
const QUICKSAND_VIDEO = '/media/quicksand_texture.mp4';
const CLAIM_URL = '/api/redwater/claim';
const ACHIEVEMENT_KEY = 'redwater-core-diver';

// Seeded PRNG (same discipline as app/*/textures.js) — session-stable,
// every rock/gem wrap unique.
function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let z = Math.imul(s ^ (s >>> 15), 1 | s);
    z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) ^ z;
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

// Procedural canvas texture: fine ore flecks in straight rock. Seed makes
// each wrap unique.
function makeRockTexture(seed, base = '#5a4a3a', ore = '#c9a227') {
  const rand = mulberry32(seed);
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  // strata bands
  for (let i = 0; i < 7; i++) {
    ctx.fillStyle = `rgba(0,0,0,${0.08 + rand() * 0.12})`;
    const y = rand() * size;
    ctx.fillRect(0, y, size, 4 + rand() * 18);
  }
  // cracks
  ctx.strokeStyle = 'rgba(20,12,8,0.55)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 14; i++) {
    ctx.beginPath();
    let x = rand() * size, y = rand() * size;
    ctx.moveTo(x, y);
    for (let s = 0; s < 5; s++) { x += (rand() - 0.5) * 60; y += (rand() - 0.5) * 60; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  // fine ore flecks
  for (let i = 0; i < 260; i++) {
    const r = 1 + rand() * 2.4;
    ctx.fillStyle = rand() > 0.82 ? ore : `rgba(255,240,200,${0.12 + rand() * 0.25})`;
    ctx.beginPath();
    ctx.arc(rand() * size, rand() * size, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Procedural gem texture: faceted glints on a deep hue. Each gem unique.
function makeGemTexture(seed, hue) {
  const rand = mulberry32(seed);
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, `hsl(${hue},70%,28%)`);
  g.addColorStop(0.5, `hsl(${hue},85%,45%)`);
  g.addColorStop(1, `hsl(${hue},70%,22%)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  // facet lines
  ctx.strokeStyle = `hsla(${hue},90%,75%,0.5)`;
  ctx.lineWidth = 1;
  for (let i = 0; i < 22; i++) {
    ctx.beginPath();
    ctx.moveTo(rand() * size, rand() * size);
    ctx.lineTo(rand() * size, rand() * size);
    ctx.stroke();
  }
  // glints
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `hsla(${hue},100%,88%,${0.3 + rand() * 0.5})`;
    ctx.beginPath();
    ctx.arc(rand() * size, rand() * size, 1 + rand() * 2, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const GEM_HUES = [0, 45, 120, 180, 210, 280, 320, 160]; // ruby, gold, emerald, aqua, sapphire, amethyst, rose, jade

export default function RedwaterQuicksand({ playerPosition, onTeleportNYC, onPhaseChange, worldScale = 1 }) {
  const { camera } = useThree();
  const [phase, setPhase] = useState('surface'); // surface | quicksand | descent | core
  const [depth, setDepth] = useState(0);          // metres below the pit
  const [claim, setClaim] = useState(null);      // server claim result
  const [claiming, setClaiming] = useState(false);
  const [showAchievement, setShowAchievement] = useState(false);
  const sandTexRef = useRef(null);
  const claimedRef = useRef(false);

  // Mount bridges (NexusEarth): report phase changes so the hub
  // can stand its street camera rig down while the journey owns
  // the lens, and scale the journey's own camera nudges into the
  // hub's display units (worldScale = DISPLAY_UNITS_PER_METRE
  // there; 1 in a metre-scale scene). Both props are optional —
  // standalone mounts behave exactly as before.
  useEffect(() => {
    onPhaseChange?.(phase);
  }, [phase, onPhaseChange]);

  // Unique wraps for the tunnel walls + gems (built once).
  const wraps = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const rocks = Array.from({ length: 6 }, (_, i) =>
      makeRockTexture(9000 + i * 131, ['#5a4a3a', '#4a3f33', '#63503c', '#54423a', '#5e4b38', '#463a30'][i]));
    const gems = GEM_HUES.map((h, i) => makeGemTexture(41000 + i * 733, h));
    return { rocks, gems };
  }, []);

  // Quicksand video texture: compact sand scrolling UP = slow-fall illusion.
  // Falls back to a procedural sand canvas if the video asset is missing.
  useEffect(() => {
    let texture = null;
    let video = null;
    let cancelled = false;
    const fallback = () => {
      if (cancelled || texture) return;
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const ctx = c.getContext('2d');
      const rand = mulberry32(777);
      ctx.fillStyle = '#a97e4f';
      ctx.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 900; i++) {
        ctx.fillStyle = `rgba(${120 + rand() * 90},${85 + rand() * 60},${45 + rand() * 35},0.7)`;
        ctx.beginPath();
        ctx.arc(rand() * 256, rand() * 256, 1 + rand() * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      texture = new THREE.CanvasTexture(c);
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      sandTexRef.current = texture;
    };
    try {
      video = document.createElement('video');
      video.src = QUICKSAND_VIDEO;
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      video.onerror = fallback;
      video.oncanplay = () => {
        if (cancelled) return;
        texture = new THREE.VideoTexture(video);
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        sandTexRef.current = texture;
      };
      video.play().catch(fallback);
      // If the video hasn't produced a texture in 2.5s, fall back.
      const t = setTimeout(() => { if (!sandTexRef.current) fallback(); }, 2500);
      return () => { cancelled = true; clearTimeout(t); video?.pause(); texture?.dispose(); };
    } catch {
      fallback();
      return () => { cancelled = true; texture?.dispose(); };
    }
  }, []);

  // Gem placements along the 2km tunnel (seeded, stable).
  const gemField = useMemo(() => {
    const rand = mulberry32(20261017);
    const gems = [];
    for (let i = 0; i < 90; i++) {
      const d = 120 + rand() * (CORE_DEPTH - 260); // metres below pit
      const a = rand() * Math.PI * 2;
      const r = 3.4 + rand() * 1.2;                 // just inside the 5m tunnel wall
      gems.push({
        pos: [Math.cos(a) * r, -d, Math.sin(a) * r],
        hueIdx: Math.floor(rand() * GEM_HUES.length),
        size: 0.35 + rand() * 0.75,
        spin: rand() * Math.PI * 2,
      });
    }
    return gems;
  }, []);

  // Journey driver.
  useFrame((state, delta) => {
    const d = Math.min(delta, 0.05);

    if (phase === 'surface') {
      const dist = Math.hypot(playerPosition.x - PIT.x, playerPosition.z - PIT.z);
      if (dist < PIT.r) {
        setPhase('quicksand');
        try { fx.playAudio('quicksand_sink'); } catch { /* silent */ }
      }
      return;
    }

    if (phase === 'quicksand') {
      // Slow compact sand rising past the camera = sinking slowly.
      if (sandTexRef.current) sandTexRef.current.offset.y += d * 0.55;
      const shake = Math.sin(state.clock.elapsedTime * 14) * 0.06 * worldScale;
      camera.position.x += shake;
      camera.position.y -= d * 0.35 * worldScale;
      setDepth((prev) => {
        const next = prev + d * 12; // ~8s to sink 100m
        if (next >= SINK_DEPTH) { setPhase('descent'); try { fx.playAudio('cavern_drop'); } catch { /* silent */ } }
        return Math.min(next, SINK_DEPTH);
      });
      return;
    }

    if (phase === 'descent') {
      if (sandTexRef.current) sandTexRef.current.offset.y += d * 0.12;
      const shake = Math.sin(state.clock.elapsedTime * 22) * 0.09 * worldScale;
      camera.position.x += shake;
      setDepth((prev) => {
        const next = prev + d * 160; // fast fall down the 2km tunnel
        if (next >= CORE_DEPTH) { setPhase('core'); try { fx.playAudio('core_arrival'); } catch { /* silent */ } }
        return Math.min(next, CORE_DEPTH);
      });
      return;
    }

    if (phase === 'core' && claim?.portal && playerPosition) {
      // Walk into the vertical circular portal -> Mega City (New York).
      const pdx = playerPosition.x - PIT.x;
      const pdz = playerPosition.z - (PIT.z - 10);
      if (Math.hypot(pdx, pdz) < 2.2) {
        onTeleportNYC?.();
      }
    }
  });

  const claimGoldBar = async () => {
    if (claiming || claimedRef.current) return;
    setClaiming(true);
    try {
      const token = (await supabase.auth.getSession()).data?.session?.access_token || null;
      const res = await fetch(CLAIM_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const json = await res.json().catch(() => ({}));
      claimedRef.current = true;
      setClaim({ ok: res.ok, ...json });
      if (res.ok && json?.collected) {
        try { fx.playAudio('gold_claim'); } catch { /* silent */ }
        setShowAchievement(true);
      }
    } catch (err) {
      setClaim({ ok: false, error: String((err && err.message) || err) });
    } finally {
      setClaiming(false);
    }
  };

  const inJourney = phase !== 'surface';
  const groupY = -depth; // the world drops past the camera as depth grows

  return (
    <group>
      {/* The pit on the Redwater surface */}
      {!inJourney && (
        <mesh position={[PIT.x, 0.02, PIT.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[PIT.r, 40]} />
          {sandTexRef.current
            ? <meshBasicMaterial map={sandTexRef.current} color="#c49a63" />
            : <meshBasicMaterial color="#a97e4f" />}
        </mesh>
      )}

      {/* Journey world: sinks with depth */}
      {inJourney && (
        <group position={[PIT.x, groupY, PIT.z]}>
          {/* Quicksand shaft walls (first 100m): compact sand closing in */}
          <mesh position={[0, -SINK_DEPTH / 2 + 2, 0]}>
            <cylinderGeometry args={[3.2, 4.2, SINK_DEPTH, 20, 1, true]} />
            {sandTexRef.current
              ? <meshStandardMaterial map={sandTexRef.current} side={THREE.BackSide} roughness={1} />
              : <meshStandardMaterial color="#a97e4f" side={THREE.BackSide} roughness={1} />}
          </mesh>

          {/* The chamber at 100m: rock all around, tunnel mouth ahead */}
          {depth >= SINK_DEPTH - 2 && (
            <group position={[0, -SINK_DEPTH, 0]}>
              <mesh>
                <sphereGeometry args={[26, 32, 24]} />
                <meshStandardMaterial
                  map={wraps?.rocks?.[0]} color="#8a7460"
                  side={THREE.BackSide} roughness={0.95} />
              </mesh>
              <pointLight position={[0, 8, 0]} intensity={60} color="#ffb36b" distance={60} />
              {/* tunnel mouth: dark opening leading forward and down */}
              <mesh position={[0, -4, -22]} rotation={[Math.PI / 2.6, 0, 0]}>
                <circleGeometry args={[5.4, 24]} />
                <meshBasicMaterial color="#050302" />
              </mesh>
            </group>
          )}

          {/* The 2km tunnel: rock walls + unique gem inlays */}
          {depth >= SINK_DEPTH && (
            <group>
              <mesh position={[0, -(SINK_DEPTH + CORE_DEPTH) / 2, 0]}>
                <cylinderGeometry args={[5, 6.5, CORE_DEPTH - SINK_DEPTH, 24, 24, true]} />
                <meshStandardMaterial
                  map={wraps?.rocks?.[2]} color="#7d6a55"
                  side={THREE.BackSide} roughness={0.95} />
              </mesh>
              {/* rock ribs: segmented wraps, each unique */}
              {Array.from({ length: 12 }, (_, i) => {
                const y = -(SINK_DEPTH + 90 + i * 150);
                return (
                  <mesh key={i} position={[0, y, 0]}>
                    <torusGeometry args={[5.1, 0.5, 10, 24]} />
                    <meshStandardMaterial
                      map={wraps?.rocks?.[i % wraps.rocks.length]}
                      color="#6b5844" roughness={1} />
                  </mesh>
                );
              })}
              {/* gems: finest ores among straight rock, every one unique */}
              {gemField.map((g, i) => (
                <mesh key={i} position={g.pos} rotation={[0, g.spin, 0]}>
                  <octahedronGeometry args={[g.size, 0]} />
                  <meshStandardMaterial
                    map={wraps?.gems?.[g.hueIdx]}
                    color={`hsl(${GEM_HUES[g.hueIdx]},70%,60%)`}
                    roughness={0.15} metalness={0.4}
                    emissive={`hsl(${GEM_HUES[g.hueIdx]},80%,30%)`}
                    emissiveIntensity={0.55} />
                </mesh>
              ))}
              <pointLight position={[0, -600, 0]} intensity={80} color="#ff9a4d" distance={120} />
              <pointLight position={[0, -1400, 0]} intensity={120} color="#ff5a1f" distance={160} />
            </group>
          )}

          {/* The Earth's core: barrier + heart chamber with 3 gold bars */}
          {depth >= CORE_DEPTH - 4 && (
            <group position={[0, -CORE_DEPTH, 0]}>
              {/* barrier shimmer the player passes through */}
              <mesh>
                <sphereGeometry args={[30, 32, 24]} />
                <meshBasicMaterial color="#ff7a1a" transparent opacity={0.16} side={THREE.BackSide} />
              </mesh>
              {/* heart chamber */}
              <mesh position={[0, -6, 0]}>
                <sphereGeometry args={[18, 32, 24]} />
                <meshStandardMaterial color="#2a0d05" side={THREE.BackSide} roughness={0.9} />
              </mesh>
              <pointLight position={[0, 4, 0]} intensity={200} color="#ff6a00" distance={90} />
              <pointLight position={[0, -10, 0]} intensity={90} color="#ffd76a" distance={50} />

              {/* 3 gold bars on a stone plinth */}
              <mesh position={[0, -14.5, 0]}>
                <cylinderGeometry args={[4.5, 5.5, 1.2, 8]} />
                <meshStandardMaterial map={wraps?.rocks?.[4]} color="#6f5f4c" roughness={1} />
              </mesh>
              {[-2.2, 0, 2.2].map((x, i) => (
                <mesh
                  key={i}
                  position={[x, -13.4, 0]}
                  rotation={[0, (i * 0.5), 0]}
                  onClick={claimGoldBar}
                >
                  <boxGeometry args={[1.5, 0.55, 0.8]} />
                  <meshStandardMaterial
                    color={claim?.collected ? '#8a7a4a' : '#ffd700'}
                    metalness={1} roughness={0.18}
                    emissive={claim?.collected ? '#000000' : '#7a5c00'}
                    emissiveIntensity={claim?.collected ? 0 : 0.35} />
                </mesh>
              ))}

              {/* The claim prize on display beside the bars. */}
              <CoreSniperDisplay />

              {/* HUD hint */}
              {!claim && !claiming && (
                <mesh position={[0, -10.5, 0]}>
                  <planeGeometry args={[10, 1.4]} />
                  <meshBasicMaterial color="#000000" transparent opacity={0.0} />
                </mesh>
              )}

              {/* The vertical circular portal -> Mega City (New York) */}
              {claim?.collected && claim?.portal && (
                <group position={[0, -11, -10]}>
                  <mesh>
                    <torusGeometry args={[2.4, 0.28, 14, 40]} />
                    <meshStandardMaterial color="#9adfff" emissive="#00c8ff" emissiveIntensity={1.4} roughness={0.2} />
                  </mesh>
                  <mesh>
                    <circleGeometry args={[2.3, 40]} />
                    <meshBasicMaterial color="#00e5ff" transparent opacity={0.55} side={THREE.DoubleSide} />
                  </mesh>
                  <pointLight position={[0, 0, 2]} intensity={120} color="#00e5ff" distance={30} />
                </group>
              )}
            </group>
          )}
        </group>
      )}

      {/* Claim status / achievement celebration (DOM overlay) */}
      {claim && !claim.ok && (
        <HtmlOverlay>
          <div style={overlayStyle}>
            {claim.reason === 'exempt'
              ? 'The core recognizes its makers — the gold is not for collecting.'
              : claim.reason === 'exhausted'
                ? 'All 5 gold bars have been claimed. The core is spent.'
                : claim.reason === 'already_collected'
                  ? 'You already hold the core\u2019s gold.'
                  : (claim.error || 'The claim did not go through.')}
          </div>
        </HtmlOverlay>
      )}
      {showAchievement && (
        <HtmlOverlay>
          <AchievementBanner
            achievementKey={ACHIEVEMENT_KEY}
            show={showAchievement}
            onDismiss={() => setShowAchievement(false)}
          />
        </HtmlOverlay>
      )}
    </group>
  );
}

// The claim prize, on display at the core: the optimized Tripo
// crystal sniper, stood upright on the plinth beside the gold bars
// and turning slowly. Loaded with the repo's GLTFLoader +
// MeshoptDecoder pattern (the optimized GLB is meshopt-compressed);
// a failed load simply shows nothing — the journey and the claim
// never depend on the model. Native model space, measured from the
// optimized GLB: ~0.98 m long on X, 0.32 m tall on Y, base at Y=0 —
// so a +90° Z rotation stands it up, a +0.489 Y offset plants its
// butt on the plinth top, and a +0.16 X offset centers it on the
// turntable axis.
const SNIPER_MODEL_URL = '/models/weapons/crystal-sniper-rifle.glb';
const SNIPER_HALF_LENGTH_M = 0.489;
const SNIPER_CENTER_OFFSET_M = 0.16;

function CoreSniperDisplay() {
  const spinRef = useRef(null);
  const [scene, setScene] = useState(null);
  useEffect(() => {
    let alive = true;
    let loaded = null;
    (async () => {
      try {
        const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
          import('three/examples/jsm/loaders/GLTFLoader.js'),
          import('three/examples/jsm/libs/meshopt_decoder.module.js'),
        ]);
        const loader = new GLTFLoader();
        loader.setMeshoptDecoder(MeshoptDecoder);
        const gltf = await loader.loadAsync(SNIPER_MODEL_URL);
        if (!alive) return;
        loaded = gltf.scene;
        setScene(loaded);
      } catch {
        // No sniper on display — the journey and the claim stand.
      }
    })();
    return () => {
      alive = false;
      if (loaded) {
        loaded.traverse((obj) => {
          if (obj.geometry) obj.geometry.dispose();
          const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
          for (const m of mats) {
            for (const v of Object.values(m)) {
              if (v && v.isTexture) v.dispose();
            }
            m.dispose();
          }
        });
      }
    };
  }, []);
  useFrame((state, delta) => {
    if (spinRef.current) spinRef.current.rotation.y += delta * 0.4;
  });
  if (!scene) return null;
  return (
    <group ref={spinRef} position={[3.4, -13.9, 0]}>
      <primitive
        object={scene}
        rotation={[0, 0, Math.PI / 2]}
        position={[SNIPER_CENTER_OFFSET_M, SNIPER_HALF_LENGTH_M, 0]}
      />
    </group>
  );
}

// Minimal DOM overlay inside the R3F tree without pulling drei in.
function HtmlOverlay({ children }) {  const { gl } = useThree();
  const [el] = useState(() => document.createElement('div'));
  useEffect(() => {
    const parent = gl.domElement.parentElement;
    el.style.position = 'absolute';
    el.style.inset = '0';
    el.style.pointerEvents = 'none';
    el.style.display = 'flex';
    el.style.alignItems = 'flex-start';
    el.style.justifyContent = 'center';
    el.style.zIndex = '10';
    parent.style.position = 'relative';
    parent.appendChild(el);
    return () => { parent.removeChild(el); };
  }, [gl, el]);
  useEffect(() => {
    const inner = document.createElement('div');
    inner.style.pointerEvents = 'auto';
    el.appendChild(inner);
    import('react-dom/client').then(({ createRoot }) => {
      const root = createRoot(inner);
      root.render(children);
    });
    return () => { el.innerHTML = ''; };
  }, [el]);
  return null;
}

const overlayStyle = {
  marginTop: '18vh',
  padding: '14px 22px',
  background: 'rgba(8,6,4,0.88)',
  border: '1px solid #c9a227',
  borderRadius: '10px',
  color: '#ffe9b0',
  fontFamily: 'system-ui, sans-serif',
  fontSize: '15px',
  maxWidth: '420px',
  textAlign: 'center' as const,
};
