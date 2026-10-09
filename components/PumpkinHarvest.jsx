'use client';

// components/PumpkinHarvest.jsx
//
// Tap-to-harvest for the Halloween gold pumpkins (Merlin 2026-10-09).
// Lives INSIDE the hub Canvas next to SeasonalDecor. Each pumpkin carries
// one gold piece (100 gold = 1/10 of a gold bar); harvesting is once per
// pumpkin per user per season, credited through the gold ledger under the
// shared $1/day engagement cap — the SERVER decides the amount and the cap,
// the client only says which pumpkin was tapped.
//
// Flow: tap pumpkin -> raycast hit-proxy -> POST /api/seasonal/harvest ->
// on ok: nugget vanishes (built.setHarvested), a gold mote flies up, toast.
// Already-harvested pumpkins are dimmed on load via GET /api/seasonal/harvests.
// Guests (no session) get a "sign in" toast; nothing is credited.

import { useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { supabase } from '@/lib/supabase';
import { ECONOMY } from '@/lib/economy/config';

const pidToIndex = (pid) => {
  const m = /^pumpkin-(\d+)$/.exec(String(pid || ''));
  return m ? parseInt(m[1], 10) : -1;
};

export default function PumpkinHarvest({ built, onToast }) {
  const { gl, camera, scene } = useThree();
  const harvestedRef = useRef(new Set());
  const motesRef = useRef([]); // { mesh, age }
  const toastRef = useRef(onToast);
  toastRef.current = onToast;

  const say = (msg) => { try { toastRef.current?.(msg); } catch { /* noop */ } };

  // Load this season's harvested set and dim those pumpkins.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session || cancelled) return;
        const r = await fetch('/api/seasonal/harvests', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const j = await r.json().catch(() => ({}));
        if (cancelled || !j?.ok || !Array.isArray(j.harvested)) return;
        for (const pid of j.harvested) {
          harvestedRef.current.add(pid);
          const idx = pidToIndex(pid);
          if (idx >= 0) built.setHarvested(idx);
        }
      } catch { /* soft fail: pumpkins stay harvestable-looking */ }
    })();
    return () => { cancelled = true; };
  }, [built]);

  // Tap detection -> raycast -> harvest.
  useEffect(() => {
    const el = gl.domElement;
    const ray = new THREE.Raycaster();
    const ptr = new THREE.Vector2();
    let downX = 0, downY = 0, downT = 0, tracking = false;

    const onDown = (e) => {
      tracking = true;
      downX = e.clientX; downY = e.clientY; downT = Date.now();
    };
    const onUp = async (e) => {
      if (!tracking) return;
      tracking = false;
      // Tap, not drag: small movement, quick release.
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 14) return;
      if (Date.now() - downT > 600) return;
      const rect = el.getBoundingClientRect();
      ptr.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ptr.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      ray.setFromCamera(ptr, camera);
      const hits = ray.intersectObjects(built.proxies || [], false);
      if (!hits.length) return;
      const pid = hits[0].object.userData.pumpkinId;
      const idx = pidToIndex(pid);
      if (harvestedRef.current.has(pid)) {
        say('Already harvested — fresh pumpkins next Halloween 🎃');
        return;
      }
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { say('Sign in to harvest gold'); return; }
        const r = await fetch('/api/seasonal/harvest', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ pumpkinId: pid }),
        });
        const j = await r.json().catch(() => ({}));
        if (j.already) {
          harvestedRef.current.add(pid);
          if (idx >= 0) built.setHarvested(idx);
          say('Already harvested — fresh pumpkins next Halloween 🎃');
        } else if (j.capped) {
          say('Daily gold limit reached — come back tomorrow 🌙');
        } else if (j.ok) {
          harvestedRef.current.add(pid);
          if (idx >= 0) built.setHarvested(idx);
          spawnMote(hits[0].point);
          say(`+${j.piece ?? ECONOMY.PUMPKIN_GOLD_PER_PIECE} gold harvested ✨`);
        } else {
          say(j.error || 'Could not harvest');
        }
      } catch {
        say('Could not harvest — try again');
      }
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [built, gl, camera]);

  // Gold mote: small glowing octahedron that flies up and fades.
  const spawnMote = (at) => {
    const mesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.7),
      new THREE.MeshBasicMaterial({
        color: 0xffd75e, transparent: true, opacity: 1,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    mesh.position.copy(at).add(new THREE.Vector3(0, 2, 0));
    // The built group may not be added to the scene directly (it's nested in
    // SeasonalDecor's group) — attach motes to the scene root instead.
    scene.add(mesh);
    motesRef.current.push({ mesh, age: 0 });
  };

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const motes = motesRef.current;
    for (let i = motes.length - 1; i >= 0; i--) {
      const m = motes[i];
      m.age += dt;
      m.mesh.position.y += dt * 9;
      m.mesh.rotation.y += dt * 4;
      m.mesh.material.opacity = Math.max(0, 1 - m.age / 1.1);
      const s = Math.max(0.01, 1 - m.age / 1.4);
      m.mesh.scale.setScalar(s);
      if (m.age > 1.4) {
        scene.remove(m.mesh);
        m.mesh.geometry.dispose();
        m.mesh.material.dispose();
        motes.splice(i, 1);
      }
    }
  });

  // Cleanup any stray motes on unmount (off-season teardown).
  useEffect(() => () => {
    for (const m of motesRef.current) {
      scene.remove(m.mesh);
      m.mesh.geometry.dispose();
      m.mesh.material.dispose();
    }
    motesRef.current = [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
