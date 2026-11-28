// app/ares/prison/cgi.jsx — the ARES Prison CGI dressing (Merlin, Nov 15, 2026).
//
// ADDITIVE ONLY. This component adds geometry the flat hall never
// had — light-fixture housings over the existing red point lights,
// the Warden's dais at the far end, cold dust in the walkway — and
// changes nothing that already works. It never touches the cell
// front frames (bars and rails stay exactly as world3d.jsx builds
// them — the concurrent silver-wraps worker owns those), never
// touches the one-way glass, the prisoner figures, or the walker,
// and adds NO real lights: the fixture diffusers and the dais sigil
// are emissive only, flickering on the real clock (prisonFlicker).
//
// The dais stands outside the walker clamp (|x| <= 23): its front
// face is 0.15 m clear of it (wardenDaisFor), so the keeper walks
// right up to the Warden's post and never through it.

'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { updateDustField } from '@/lib/planet-cgi/motion';
import {
  PRISON_CGI_MOOD,
  makePrisonDust,
  prisonFlicker,
  prisonMaterial,
  wardenDaisFor,
} from '@/lib/ares/prison-cgi';

export function PrisonCgiDressing({ hall, lightPositions }) {
  const dais = useMemo(() => wardenDaisFor(hall), [hall]);
  const dust = useMemo(() => makePrisonDust(), []);
  const steel = useMemo(() => prisonMaterial('prisonSteel', 'prison-hall'), []);
  const deck = useMemo(() => prisonMaterial('prisonDeck', 'prison-dais', '#ffffff', { repeatX: 1, repeatY: 1 }), []);

  // One diffuser material per fixture: the flicker is per-fixture,
  // so the row never stutters in lockstep.
  const diffusers = useMemo(
    () => (lightPositions || []).map(() => new THREE.MeshStandardMaterial({
      color: '#2E0A07',
      emissive: new THREE.Color(PRISON_CGI_MOOD.red),
      emissiveIntensity: PRISON_CGI_MOOD.fixtureEmissiveIntensity,
      roughness: 0.4,
      metalness: 0.1,
    })),
    [lightPositions],
  );
  const sigilMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#2E0A07',
    emissive: new THREE.Color(PRISON_CGI_MOOD.red),
    emissiveIntensity: PRISON_CGI_MOOD.sigilEmissiveIntensity,
    roughness: 0.4,
    metalness: 0.1,
  }), []);
  const stripMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: PRISON_CGI_MOOD.redCss,
    emissive: new THREE.Color(PRISON_CGI_MOOD.red),
    emissiveIntensity: 1.4,
    roughness: 0.5,
    metalness: 0.1,
  }), []);

  useFrame(() => {
    const now = Date.now();
    for (let i = 0; i < diffusers.length; i += 1) {
      diffusers[i].emissiveIntensity = PRISON_CGI_MOOD.fixtureEmissiveIntensity * prisonFlicker(now, i);
    }
    if (dust) updateDustField(dust, now);
  });

  return (
    <group>
      {/* Light fixtures: a steel housing over each existing red
          point light, with an emissive diffuser facing down. The
          lights themselves are untouched — same positions, same
          budget (8 + 4 per grown level). */}
      {(lightPositions || []).map((p, i) => {
        const housingY = Math.min(p.y + 0.55, hall.heightM - 0.15);
        return (
          <group key={`fixture-${p.x}-${p.y}`}>
            <mesh position={[p.x, housingY, 0]} material={steel}>
              <boxGeometry args={[2.4, 0.14, 0.6]} />
            </mesh>
            <mesh position={[p.x, housingY - 0.09, 0]} rotation={[Math.PI / 2, 0, 0]} material={diffusers[i]}>
              <planeGeometry args={[2.0, 0.4]} />
            </mesh>
          </group>
        );
      })}

      {/* The Warden's dais: platform + console desk + sigil strip,
          against the far end wall, outside the walker clamp. */}
      <group>
        <mesh position={[dais.centreX, dais.platformHeightM / 2, 0]} material={deck}>
          <boxGeometry args={[dais.depthM, dais.platformHeightM, dais.widthM]} />
        </mesh>
        {/* emissive edge strip on the platform's walkway face */}
        <mesh position={[dais.frontX - 0.01, 0.18, 0]} rotation={[0, -Math.PI / 2, 0]} material={stripMat}>
          <planeGeometry args={[dais.widthM, 0.08]} />
        </mesh>
        <mesh
          position={[dais.centreX + 0.08, dais.platformHeightM + dais.deskHeightM / 2, 0]}
          material={steel}
        >
          <boxGeometry args={[dais.deskDepthM, dais.deskHeightM, dais.deskWidthM]} />
        </mesh>
        {/* the Warden's sigil: an emissive red band on the desk's
            walkway face, facing the keeper down the hall */}
        <mesh
          position={[dais.centreX + 0.08 - dais.deskDepthM / 2 - 0.01, dais.platformHeightM + dais.sigilY, 0]}
          rotation={[0, -Math.PI / 2, 0]}
          material={sigilMat}
        >
          <planeGeometry args={[2.4, 0.22]} />
        </mesh>
      </group>

      {/* Warm dust drifting down the walkway. */}
      <primitive object={dust} />
    </group>
  );
}
