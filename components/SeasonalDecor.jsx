'use client';

// components/SeasonalDecor.jsx
//
// Seasonal decoration cycle for the launcher hub. Reads the calendar date
// once on mount, builds the matching procedural decoration set from
// lib/seasonal/decorations.js, and — Nov 22 through Twelfth Night — plants
// Merlin's perfected Christmas tree (lib/seasonal/tree.js, ported from his
// perfected-tree.html) front-and-center among the satellites.
//
// Decor lives on a ring outside the satellite bands: it accents the hub,
// never clutters it. On dates with no season (and no tree) this renders
// nothing at all — the hub stays clean.

import { useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getSeason, treeVisible, seasonBadge, starwarsDay } from '@/lib/seasonal/seasons';
import { buildChristmasTree } from '@/lib/seasonal/tree';
import { BUILDERS, disposeGroup } from '@/lib/seasonal/decorations';
import { ORBIT_CENTER } from '@/lib/god-orbits';
import { useI18n } from '@/lib/i18n';

// Tree placement: inside the satellite constellation, front-and-center of
// the spawn view (camera at ORBIT_CENTER looks -Z), slightly below eye
// level — "right in front of the user but out a little bit in the middle
// of our satellites."
const TREE_POS = [ORBIT_CENTER.x, 10, ORBIT_CENTER.z - 24];
const TREE_SCALE = 0.55;

export default function SeasonalDecor() {
  const now = useMemo(() => new Date(), []);
  const season = useMemo(() => getSeason(now), [now]);
  const showTree = useMemo(() => treeVisible(now), [now]);

  const built = useMemo(() => {
    const group = new THREE.Group();
    const updates = [];
    if (season && BUILDERS[season]) {
      const extra = season === 'starwars' ? starwarsDay(now) : undefined;
      const made = BUILDERS[season](THREE, extra);
      group.add(made.group);
      if (made.update) updates.push(made.update);
    }
    if (showTree) {
      const tree = buildChristmasTree(THREE);
      tree.group.position.set(TREE_POS[0], TREE_POS[1], TREE_POS[2]);
      tree.group.scale.setScalar(TREE_SCALE);
      group.add(tree.group);
      updates.push((t) => tree.update(t));
      // snowy platform disc echoing his winter mountaintop
      const plat = new THREE.Mesh(
        new THREE.CircleGeometry(9, 40),
        new THREE.MeshStandardMaterial({ color: 0xdfe9f5, roughness: 0.95 })
      );
      plat.rotation.x = -Math.PI / 2;
      plat.position.set(TREE_POS[0], TREE_POS[1] - 0.05, TREE_POS[2]);
      group.add(plat);
    }
    return { group, updates };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const g = built.group;
    return () => disposeGroup(g);
  }, [built]);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const step = Math.min(dt, 0.05);
    for (const u of built.updates) u(t, step);
  });

  if (!season && !showTree) return null;
  return <primitive object={built.group} />;
}

// Small floating badge so users know why the hub changed its look.
export function SeasonBadge() {
  const season = useMemo(() => getSeason(new Date()), []);
  const { t } = useI18n();
  if (!season) return null;
  const b = seasonBadge(season);
  if (!b) return null;
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        left: 12,
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 84px)',
        zIndex: 30,
        pointerEvents: 'none',
        padding: '6px 12px',
        borderRadius: 999,
        fontSize: 13,
        letterSpacing: '0.02em',
        color: 'rgba(255,255,255,0.85)',
        background: 'rgba(10,14,24,0.55)',
        border: '1px solid rgba(255,255,255,0.14)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      {b.badge} {t(b.nameKey)}
    </div>
  );
}
