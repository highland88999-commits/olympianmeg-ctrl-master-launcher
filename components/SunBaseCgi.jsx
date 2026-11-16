'use client';

// components/SunBaseCgi.jsx — the sun-base CGI overlay (Merlin, Nov 15, 2026).
//
// A thin React shell over lib/sun-base/cgi.js: it builds the overlay
// group once per interior spec, steps it every frame on the device
// clock, and disposes it on unmount. The group is NEW meshes only —
// it never touches the factory room or the bright-gold wrap on its
// structural surfaces, and it adds no real lights (emissive +
// additive glow only).

import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { buildSunBaseCgi, disposeSunBaseCgi, updateSunBaseCgi } from '@/lib/sun-base/cgi';

export default function SunBaseCgi({ spec }) {
  const group = useMemo(() => buildSunBaseCgi(spec), [spec]);
  useEffect(() => () => disposeSunBaseCgi(group), [group]);
  useFrame(() => {
    updateSunBaseCgi(group, Date.now());
  });
  if (!group) return null;
  return <primitive object={group} />;
}
