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

import { useMemo, useEffect, useState, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getSeason, treeVisible, seasonBadge, starwarsDay } from '@/lib/seasonal/seasons';
import { buildChristmasTree } from '@/lib/seasonal/tree';
import { BUILDERS, disposeGroup } from '@/lib/seasonal/decorations';
import { ORBIT_CENTER } from '@/lib/god-orbits';
import { useI18n } from '@/lib/i18n';
import PumpkinHarvest from '@/components/PumpkinHarvest';

// Tiny toast bus: PumpkinHarvest (inside the Canvas) publishes, SeasonToast
// (DOM, mounted next to SeasonBadge in HomeScene) renders. Off-season there
// are no publishers, so nothing ever shows.
const toastListeners = new Set();
export function seasonToast(msg) {
  for (const fn of toastListeners) {
    try { fn(msg); } catch { /* noop */ }
  }
}

export function SeasonToast() {
  const [msg, setMsg] = useState(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    const fn = (m) => { setMsg(m); setNonce((n) => n + 1); };
    toastListeners.add(fn);
    return () => { toastListeners.delete(fn); };
  }, []);
  useEffect(() => {
    if (msg == null) return;
    const t = setTimeout(() => setMsg(null), 2600);
    return () => clearTimeout(t);
  }, [msg, nonce]);
  if (msg == null) return null;
  return (
    <div
      key={nonce}
      aria-live="polite"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 148px)',
        transform: 'translateX(-50%)',
        zIndex: 40,
        pointerEvents: 'none',
        padding: '8px 16px',
        borderRadius: 999,
        fontSize: 14,
        fontWeight: 600,
        whiteSpace: 'nowrap',
        color: '#fff8e7',
        background: 'rgba(20,14,4,0.72)',
        border: '1px solid rgba(255,215,94,0.45)',
        boxShadow: '0 0 18px rgba(255,180,60,0.35)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      {msg}
    </div>
  );
}

// Trophy bus: PumpkinHarvest (inside the Canvas) publishes, TrophyOverlay
// (DOM, mounted next to SeasonToast in HomeScene) renders the celebration.
// Fires at most once per user per season — the server enforces that.
const trophyListeners = new Set();
export function announceTrophy() {
  for (const fn of trophyListeners) {
    try { fn(); } catch { /* noop */ }
  }
}

const TROPHY_VIDEO = '/videos/spooky-coin-collector.mp4';

// Spooky Coin Collector celebration. A banner, never a blocking modal:
// the backdrop is pointer-transparent (taps pass through to the hub),
// the card is dismissible with a clear close button, and it auto-dismisses
// shortly after the video finishes. Mobile-first, Safari-safe.
export function TrophyOverlay() {
  const [show, setShow] = useState(false);
  const [nonce, setNonce] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    const fn = () => { setShow(true); setNonce((n) => n + 1); };
    trophyListeners.add(fn);
    return () => { trophyListeners.delete(fn); };
  }, []);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const dismiss = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    setShow(false);
  };

  if (!show) return null;
  return (
    <div
      key={nonce}
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 70,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding:
          'calc(env(safe-area-inset-top, 0px) + 16px) 16px calc(env(safe-area-inset-bottom, 0px) + 16px)',
        pointerEvents: 'none', // banner, not a modal: hub stays interactive
      }}
    >
      <div
        style={{
          pointerEvents: 'auto',
          position: 'relative',
          width: '100%',
          maxWidth: 'min(92vw, 400px)',
          borderRadius: 18,
          padding: '14px 14px 18px',
          textAlign: 'center',
          color: '#fff7e6',
          background: 'rgba(16, 8, 28, 0.92)',
          border: '2px solid rgba(255, 190, 80, 0.65)',
          boxShadow: '0 0 42px rgba(255, 170, 60, 0.35), 0 18px 60px rgba(0,0,0,0.55)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
        }}
      >
        <button
          onClick={dismiss}
          aria-label="Close celebration"
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            width: 40,
            height: 40,
            borderRadius: '50%',
            border: '1px solid rgba(255,255,255,0.25)',
            background: 'rgba(0,0,0,0.45)',
            color: '#fff',
            fontSize: 18,
            lineHeight: 1,
            cursor: 'pointer',
          }}
        >
          ✕
        </button>
        <video
          src={TROPHY_VIDEO}
          autoPlay
          muted
          loop
          playsInline
          aria-hidden="true"
          onLoadedMetadata={(e) => {
            const ms = (e.currentTarget.duration || 10) * 1000;
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(dismiss, ms + 800);
          }}
          style={{ width: '100%', borderRadius: 12, display: 'block', background: '#000' }}
        />
        <div style={{ marginTop: 12, fontSize: 22, fontWeight: 800, letterSpacing: '0.02em', color: '#ffd75e' }}>
          🏆 Spooky Coin Collector
        </div>
        <div style={{ marginTop: 6, fontSize: 14, color: 'rgba(255,247,230,0.85)' }}>
          You harvested every pumpkin — a rare achievement
        </div>
      </div>
    </div>
  );
}

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
    const extras = {};
    if (season && BUILDERS[season]) {
      const extra = season === 'starwars' ? starwarsDay(now) : undefined;
      const made = BUILDERS[season](THREE, extra);
      group.add(made.group);
      if (made.update) updates.push(made.update);
      // Pass through everything the builder returns (proxies, setHarvested,
      // pumpkinSpots, ...) — PumpkinHarvest mounts on built.proxies.
      for (const k of Object.keys(made)) {
        if (k !== 'group' && k !== 'update') extras[k] = made[k];
      }
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
    return { group, updates, ...extras };
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
  return (
    <>
      <primitive object={built.group} />
      {season === 'halloween' && built.proxies && (
        <PumpkinHarvest built={built} onToast={seasonToast} onTrophy={announceTrophy} />
      )}
    </>
  );
}

// Small badge so users know why the hub changed its look. Default
// form floats over the hub; the `inline` form lives at the bottom of
// the Concourse (Merlin, 2026-10-20 — the floating hub badge moved
// into the Concourse; HomeScene no longer mounts the floating form).
export function SeasonBadge({ inline = false } = {}) {
  const season = useMemo(() => getSeason(new Date()), []);
  const { t } = useI18n();
  if (!season) return null;
  const b = seasonBadge(season);
  if (!b) return null;
  const shared = {
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
  };
  return (
    <div
      aria-hidden="true"
      style={
        inline
          ? { ...shared, display: 'inline-block' }
          : {
              ...shared,
              position: 'fixed',
              left: 12,
              bottom: 'calc(env(safe-area-inset-bottom, 0px) + 84px)',
              zIndex: 30,
            }
      }
    >
      {b.badge} {t(b.nameKey)}
    </div>
  );
}
