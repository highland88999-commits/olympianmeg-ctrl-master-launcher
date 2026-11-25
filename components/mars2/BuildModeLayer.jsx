// components/mars2/BuildModeLayer.jsx
// MARS 2 — BUILD MODE layer (Merlin, Nov 17, 2026).
//
// What it draws, and when:
//   · Land plots — ONLY in build mode. Amber squares on the dirt:
//     empty plots glow amber, a selected plot glows bright, a
//     plot with a building on it stops drawing (the building
//     stands there instead).
//   · Mining areas — ONLY in build mode. A tinted disc per area
//     in its material's colour, so the designated ground reads
//     at a glance: mines go here, nowhere else.
//   · Buildings — ALWAYS, once built. A mine is a drill rig
//     (silo + mast, its material's colour); barracks are a long
//     hut with a lit door. Both grow with their tier — the
//     upgrade you can see.
// Tap a plot in build mode to select it (a tap is a press and
// release with almost no movement — drags still look around).
// Pure R3F: no state of its own, everything arrives as props.

'use client';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { mars2TerrainHeight } from '@/lib/mars2/terrain';
import { zoneDiscGeometry, zoneRingGeometry } from '@/lib/mars2/zone-geometry';
import { BUILDING_SCALE, PLOT_SIZE_M } from '@/lib/mars2/build-mode';
import { materialById } from '@/lib/economy/materials';

function plotFrameGeometry(size) {
  // A square frame lying on the dirt: four thin bars.
  const g = new THREE.Group();
  const bar = (w, d, x, z) => {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.12, d),
      new THREE.MeshBasicMaterial({ color: '#ffb37a', transparent: true, opacity: 0.9 }),
    );
    m.material.userData.frameBar = true;
    m.position.set(x, 0.06, z);
    return m;
  };
  const h = size / 2;
  const t = 0.25;
  g.add(bar(size, t, 0, -h));
  g.add(bar(size, t, 0, h));
  g.add(bar(t, size, -h, 0));
  g.add(bar(t, size, h, 0));
  return g;
}

function MinePlotPulse({ group, active }) {
  // Unclaimed mine plots glow brighter and pulse until the first
  // mine is staked — the starter guidance, in 3D: the free mines
  // are the thing a new user is looking for. When the first mine
  // lands, the pulse stops and the bars sit at their normal 0.9.
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    group.traverse((o) => {
      if (o.material && o.material.userData && o.material.userData.frameBar) {
        o.material.opacity = active
          ? 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(t * 3))
          : 0.9;
      }
    });
  });
  return null;
}

function MineMesh({ building, plot }) {
  const scale = BUILDING_SCALE.mine[building.tier - 1];
  const mat = materialById(plot.materialId) || { color: '#c98a5a' };
  const y = plot.y;
  return (
    <group position={[plot.x, y, plot.z]} scale={scale}>
      {/* drill pad */}
      <mesh position={[0, 0.15, 0]}>
        <boxGeometry args={[3.4, 0.3, 3.4]} />
        <meshStandardMaterial color="#5a3220" roughness={0.9} />
      </mesh>
      {/* silo — wears the material's colour */}
      <mesh position={[-0.8, 1.1, -0.6]}>
        <cylinderGeometry args={[0.55, 0.65, 2.2, 12]} />
        <meshStandardMaterial color={mat.color} roughness={0.6} metalness={0.35} />
      </mesh>
      {/* drill mast, leaning over the seam */}
      <mesh position={[0.9, 1.4, 0.7]} rotation={[0.35, 0, -0.25]}>
        <cylinderGeometry args={[0.09, 0.12, 2.8, 8]} />
        <meshStandardMaterial color="#cfd6dd" roughness={0.4} metalness={0.6} />
      </mesh>
      {/* drill bit at the ground */}
      <mesh position={[1.25, 0.35, 1.0]}>
        <coneGeometry args={[0.28, 0.7, 10]} />
        <meshStandardMaterial color="#8a94a8" roughness={0.4} metalness={0.7} />
      </mesh>
      {/* status light — amber while it works */}
      <mesh position={[0, 2.45, -0.6]}>
        <sphereGeometry args={[0.14, 10, 10]} />
        <meshBasicMaterial color="#ffb37a" />
      </mesh>
      {/* tier pips: one light per tier, so the upgrade reads */}
      {Array.from({ length: building.tier }).map((_, i) => (
        <mesh key={i} position={[-1.4 + i * 0.4, 0.45, 1.55]}>
          <sphereGeometry args={[0.09, 8, 8]} />
          <meshBasicMaterial color="#9dffb0" />
        </mesh>
      ))}
    </group>
  );
}

function BarracksMesh({ building, plot }) {
  const scale = BUILDING_SCALE.barracks[building.tier - 1];
  const y = plot.y;
  return (
    <group position={[plot.x, y, plot.z]} scale={scale}>
      {/* long hut */}
      <mesh position={[0, 0.9, 0]}>
        <boxGeometry args={[4.6, 1.8, 2.6]} />
        <meshStandardMaterial color="#b0703c" roughness={0.85} />
      </mesh>
      {/* roof */}
      <mesh position={[0, 1.95, 0]}>
        <boxGeometry args={[4.9, 0.25, 2.9]} />
        <meshStandardMaterial color="#7a4a28" roughness={0.9} />
      </mesh>
      {/* lit door — crew are home */}
      <mesh position={[0, 0.85, 1.32]}>
        <planeGeometry args={[0.9, 1.5]} />
        <meshBasicMaterial color="#ffca7a" />
      </mesh>
      {/* bunks read as windows along the flank */}
      {[-1.5, 0, 1.5].map((x) => (
        <mesh key={x} position={[x, 1.1, 1.31]}>
          <planeGeometry args={[0.55, 0.4]} />
          <meshBasicMaterial color="#ffd9a0" />
        </mesh>
      ))}
      {/* tier pips */}
      {Array.from({ length: building.tier }).map((_, i) => (
        <mesh key={i} position={[-1.4 + i * 0.4, 2.25, 1.0]}>
          <sphereGeometry args={[0.09, 8, 8]} />
          <meshBasicMaterial color="#9dffb0" />
        </mesh>
      ))}
    </group>
  );
}

export default function BuildModeLayer({
  profile, buildMode, plots, areas, buildings, selectedPlotId, onSelectPlot,
}) {
  const { camera, gl } = useThree();
  const plotMeshes = useRef(new Map());
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const pointer = useMemo(() => new THREE.Vector2(), []);

  const occupied = useMemo(() => {
    const set = new Set();
    for (const b of buildings || []) set.add(b.plotId);
    return set;
  }, [buildings]);

  // The first mine staked anywhere ends the starter pulse.
  const hasAnyMine = useMemo(
    () => (buildings || []).some((b) => b.kind === 'mine'),
    [buildings],
  );

  // Zone tint + boundary line, DRAPED over the terrain: the
  // geometry vertices already carry world coordinates and the
  // levelled height, so the meshes sit at the origin, unrotated.
  const zoneGeoms = useMemo(() => {
    const heightAt = (x, z) => mars2TerrainHeight(x, z, profile);
    return (areas || []).map((a) => ({
      area: a,
      disc: zoneDiscGeometry(a, heightAt),
      ring: zoneRingGeometry(a, heightAt),
    }));
  }, [areas, profile]);

  useEffect(() => () => {
    for (const g of zoneGeoms) {
      g.disc.dispose();
      g.ring.dispose();
    }
  }, [zoneGeoms]);

  const plotById = useMemo(() => {
    const map = new Map();
    for (const p of plots || []) map.set(p.id, p);
    return map;
  }, [plots]);

  // Tap to select a plot in build mode: press + release with
  // almost no movement (a drag still looks around — the walker
  // rig owns it). Raycast against the plot frames only.
  useEffect(() => {
    if (!buildMode) return undefined;
    const el = gl.domElement;
    let down = null;
    const onDown = (e) => {
      const t = e.touches ? e.touches[0] : e;
      down = { x: t.clientX, y: t.clientY, t: Date.now() };
    };
    const onUp = (e) => {
      if (!down) return;
      const t = e.changedTouches ? e.changedTouches[0] : e;
      const moved = Math.hypot(t.clientX - down.x, t.clientY - down.y);
      const held = Date.now() - down.t;
      down = null;
      if (moved > 8 || held > 500) return;
      const rect = el.getBoundingClientRect();
      pointer.set(
        ((t.clientX - rect.left) / rect.width) * 2 - 1,
        -((t.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const meshes = [...plotMeshes.current.values()].filter(Boolean);
      const hits = raycaster.intersectObjects(meshes, true);
      for (const h of hits) {
        let o = h.object;
        while (o) {
          if (o.userData && o.userData.plotId) {
            if (onSelectPlot) onSelectPlot(o.userData.plotId);
            return;
          }
          o = o.parent;
        }
      }
    };
    el.addEventListener('mousedown', onDown);
    el.addEventListener('mouseup', onUp);
    el.addEventListener('touchstart', onDown, { passive: true });
    el.addEventListener('touchend', onUp, { passive: true });
    return () => {
      el.removeEventListener('mousedown', onDown);
      el.removeEventListener('mouseup', onUp);
      el.removeEventListener('touchstart', onDown);
      el.removeEventListener('touchend', onUp);
    };
  }, [buildMode, gl, camera, raycaster, pointer, onSelectPlot]);

  const frames = useMemo(() => {
    // One frame group per plot, built once per plots list.
    return (plots || []).map((p) => ({ plot: p, group: plotFrameGeometry(p.size) }));
  }, [plots]);

  useEffect(() => () => {
    for (const { group } of frames) {
      group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    }
  }, [frames]);

  return (
    <group>
      {/* Mining areas — build mode only: one tinted disc each, in
          its material's colour, draped flush with the dirt, plus
          the boundary line hugging the rim. */}
      {buildMode && zoneGeoms.map(({ area: a, disc, ring }) => {
        const mat = materialById(a.materialId) || { color: '#c98a5a' };
        return (
          <group key={a.id}>
            <mesh geometry={disc}>
              <meshBasicMaterial color={mat.color} transparent opacity={0.16} depthWrite={false} />
            </mesh>
            <mesh geometry={ring}>
              <meshBasicMaterial color={mat.color} transparent opacity={0.7} depthWrite={false} />
            </mesh>
          </group>
        );
      })}
      {/* Plots — build mode only: empty plots glow amber; the
          selected one glows bright; occupied plots are the
          building itself, so no frame. */}
      {buildMode && frames.map(({ plot, group }) => {
        const selected = plot.id === selectedPlotId;
        if (occupied.has(plot.id)) {
          // A built plot has no frame — the building stands there —
          // but it still needs a tap target, or tapping a built
          // mine selects nothing and the panel never shows it. An
          // invisible plane on the ground, registered in the same
          // raycast map as the frames; the selected highlight reads
          // the same as an empty plot's.
          return (
            <mesh
              key={plot.id}
              rotation={[-Math.PI / 2, 0, 0]}
              position={[plot.x, mars2TerrainHeight(plot.x, plot.z, profile) + 0.05, plot.z]}
              ref={(el) => {
                if (el) {
                  el.userData.plotId = plot.id;
                  plotMeshes.current.set(plot.id, el);
                } else {
                  plotMeshes.current.delete(plot.id);
                }
              }}
            >
              <planeGeometry args={[PLOT_SIZE_M, PLOT_SIZE_M]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              {selected && (
                <mesh position={[0, 0, 0.02]}>
                  <planeGeometry args={[PLOT_SIZE_M, PLOT_SIZE_M]} />
                  <meshBasicMaterial color="#ffd9a0" transparent opacity={0.22} depthWrite={false} />
                </mesh>
              )}
            </mesh>
          );
        }
        return (
          <primitive
            key={plot.id}
            object={group}
            position={[plot.x, mars2TerrainHeight(plot.x, plot.z, profile) + 0.05, plot.z]}
            ref={(el) => {
              if (el) {
                el.userData.plotId = plot.id;
                el.traverse((o) => { o.userData.plotId = plot.id; });
                plotMeshes.current.set(plot.id, el);
              } else {
                plotMeshes.current.delete(plot.id);
              }
            }}
          >
            {/* brighten the selected frame */}
            {selected && (
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
                <planeGeometry args={[PLOT_SIZE_M, PLOT_SIZE_M]} />
                <meshBasicMaterial color="#ffd9a0" transparent opacity={0.22} depthWrite={false} />
              </mesh>
            )}
            {/* unclaimed mine plots pulse until the first mine is staked */}
            {plot.kind === 'mine' && <MinePlotPulse group={group} active={!hasAnyMine} />}
          </primitive>
        );
      })}
      {/* Buildings — always, once built. */}
      {(buildings || []).map((b) => {
        const plot = plotById.get(b.plotId);
        if (!plot) return null;
        if (b.kind === 'mine') {
          const area = (areas || []).find((a) => a.id === plot.areaId);
          return <MineMesh key={b.id} building={b} plot={{ ...plot, materialId: area ? area.materialId : null }} />;
        }
        return <BarracksMesh key={b.id} building={b} plot={plot} />;
      })}
    </group>
  );
}
