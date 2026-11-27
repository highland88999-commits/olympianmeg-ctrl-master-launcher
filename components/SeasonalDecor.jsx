'use client';

// components/SeasonalDecor.jsx
//
// Seasonal decoration cycle for the launcher hub. Reads the calendar date
// once on mount, builds the matching procedural decoration set from
// lib/seasonal/decorations.js, and — Nov 27 through Twelfth Night — plants
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
import { buildChristmasTree, buildMistletoe, treeSwapPlacement } from '@/lib/seasonal/tree';
import { BUILDERS, buildMeteorShower, disposeGroup } from '@/lib/seasonal/decorations';
import { meteorShowerActive } from '@/lib/seasonal/hub-christmas-fx';
import ChristmasPresents from '@/components/ChristmasPresents';
import { EARTH_CENTER, EARTH_RADIUS } from '@/lib/god-orbits';
import { globeWorldPointToLatLon, GLOBE_CENTER } from '@/lib/earth/globe-click';
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

export default function SeasonalDecor({ onTreeSelect = null, onTreeGlobeClick = null, earthQuatRef = null } = {}) {
  const now = useMemo(() => new Date(), []);
  const season = useMemo(() => getSeason(now), [now]);
  const showTree = useMemo(() => treeVisible(now), [now]);
  // Tap-vs-drag for the tree hit-proxy (see the onClick guard below):
  // the press point of the current pointer-down, in client pixels.
  const treePressRef = useRef(null);

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
    if (season === 'christmas') {
      // Meteor shower (Merlin, Nov 27, 2026): built alongside the
      // snow, starts hidden — useFrame flips it on at the top of the
      // hour while the snow stands down.
      const shower = buildMeteorShower(THREE);
      group.add(shower.group);
      extras.meteorShower = shower;
    }
    if (showTree) {
      // Christmas swap (Merlin, Nov 25, 2026 — "tree where earth is"):
      // the tree stands at the Earth's centre, base at the Earth's
      // bottom, scaled so its height equals the Earth's diameter,
      // crowned with the blue giant sun for the season.
      const swap = treeSwapPlacement(EARTH_CENTER, EARTH_RADIUS);
      const tree = buildChristmasTree(THREE, { topper: swap.topper });
      tree.group.position.set(swap.position[0], swap.position[1], swap.position[2]);
      tree.group.scale.setScalar(swap.scale);
      group.add(tree.group);
      updates.push((t) => tree.update(t));
      // mistletoe high above the topper (rides with the tree group)
      const mistletoe = buildMistletoe(THREE);
      tree.group.add(mistletoe.group);
      // snowy platform disc echoing his winter mountaintop
      const plat = new THREE.Mesh(
        new THREE.CircleGeometry(9, 40),
        new THREE.MeshStandardMaterial({ color: 0xdfe9f5, roughness: 0.95 })
      );
      plat.rotation.x = -Math.PI / 2;
      plat.position.set(swap.position[0], swap.position[1] - 0.05, swap.position[2]);
      group.add(plat);
      // Invisible hit-proxy: a sphere bounding the whole swapped tree,
      // so the tree keeps the Earth's click behaviour. opacity: 0, NOT
      // visible=false (r3f skips invisible objects in raycasts), and
      // DoubleSide — the spawn camera sits inside the proxy, and a
      // FrontSide sphere raycasts nothing from inside.
      const treeHitProxy = new THREE.Mesh(
        new THREE.SphereGeometry(swap.hitRadius, 16, 16),
        new THREE.MeshBasicMaterial({
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
        })
      );
      treeHitProxy.position.set(EARTH_CENTER.x, EARTH_CENTER.y, EARTH_CENTER.z);
      group.add(treeHitProxy);
      extras.treeHitProxy = treeHitProxy;
      extras.swap = swap;
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
    // Meteor shower (Merlin, Nov 27, 2026): at the top of every hour
    // (local minutes 00-05) the shower runs INSTEAD of the snowfall —
    // snow stands down, shower runs; the rest of the hour snow runs
    // as normal. Only in the christmas season.
    if (built.meteorShower && built.setSnowVisible) {
      const showerOn = season === 'christmas' && meteorShowerActive(new Date());
      built.meteorShower.group.visible = showerOn;
      built.setSnowVisible(!showerOn);
      if (showerOn) built.meteorShower.update(t, step);
    }
  });

  if (!season && !showTree) return null;
  return (
    <>
      <primitive object={built.group} />
      {showTree && <ChristmasPresents built={built} />}
      {season === 'halloween' && built.proxies && (
        <PumpkinHarvest built={built} onToast={seasonToast} onTrophy={announceTrophy} />
      )}
      {showTree && built.treeHitProxy && (
        <mesh
          position={[EARTH_CENTER.x, EARTH_CENTER.y, EARTH_CENTER.z]}
          onPointerOver={(e) => {
            e.stopPropagation();
            if (onTreeSelect) document.body.style.cursor = 'pointer';
          }}
          onPointerOut={() => {
            document.body.style.cursor = '';
          }}
          onPointerDown={(e) => {
            treePressRef.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY };
          }}
          onClick={(e) => {
            // Tap, not drag: the spawn camera sits inside the proxy, so
            // every ray hits it — a drag-look whose release still lands
            // on the tree would open the menu. Ignore releases more
            // than 8px from the press point.
            const press = treePressRef.current;
            const ne = e.nativeEvent;
            if (press && ne && Math.max(Math.abs(ne.clientX - press.x), Math.abs(ne.clientY - press.y)) > 8) return;
            if (onTreeSelect) {
              onTreeSelect();
              return;
            }
            if (onTreeGlobeClick && earthQuatRef && earthQuatRef.current) {
              const ll = globeWorldPointToLatLon(e.point, GLOBE_CENTER, earthQuatRef.current);
              if (ll) onTreeGlobeClick(ll.lat, ll.lon);
            }
          }}
        >
          <sphereGeometry args={[built.swap.hitRadius, 16, 16]} />
          <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
        </mesh>
      )}
    </>
  );
}

// Season glyph — Halloween wears the generated pumpkin artwork
// (small + round, beside the season name); if the art fails to load,
// and for every other season, the emoji badge glyph renders exactly
// as before. The name text (t(b.nameKey)) is untouched.
function SeasonGlyph({ season, badge }) {
  const [failed, setFailed] = useState(false);
  if (season !== 'halloween' || failed) return <>{badge}</>;
  return (
    <img
      src="/concourse-icons/season-halloween.webp"
      alt=""
      aria-hidden="true"
      onError={() => setFailed(true)}
      style={{
        width: 18,
        height: 18,
        borderRadius: '50%',
        objectFit: 'cover',
        display: 'inline-block',
        verticalAlign: '-4px',
      }}
    />
  );
}

// Small badge so users know why the hub changed its look. Default
// form floats over the hub; the `inline` form lives at the bottom of
// the Concourse (Merlin, 2026-10-20 — the floating hub badge moved
// into the Concourse; HomeScene no longer mounts the floating form).
// With an `onGuide` handler (the Concourse passes one, Merlin round
// 3, 2026-10-23) the badge becomes the season GUIDE button: same
// face, now tappable — the handler receives the season key. Without
// a handler it renders exactly the display-only pill it always was.
export function SeasonBadge({ inline = false, onGuide = null } = {}) {
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
    position: 'relative',
    overflow: 'hidden',
  };
  const layout = inline
    ? { ...shared, display: 'inline-block' }
    : {
        ...shared,
        position: 'fixed',
        left: 12,
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 84px)',
        zIndex: 30,
      };
  const face = (
    <>
      {/* The Concourse TRON tile plate skins the pill too (Merlin,
          2026-10-21) — behind the season artwork + name. */}
      <img
        src="/concourse-icons/tile-plate.webp"
        alt=""
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: '50% 50%',
        }}
      />
      <span style={{ position: 'relative' }}>
        <SeasonGlyph season={season} badge={b.badge} /> {t(b.nameKey)}
      </span>
    </>
  );
  if (typeof onGuide === 'function') {
    return (
      <button
        type="button"
        onClick={() => onGuide(season)}
        aria-label={`${t(b.nameKey)} — season guide`}
        title="Season guide"
        className="transition-transform motion-reduce:transition-none active:scale-95"
        style={{ ...layout, pointerEvents: 'auto', cursor: 'pointer' }}
      >
        {face}
      </button>
    );
  }
  return (
    <div aria-hidden="true" style={layout}>
      {face}
    </div>
  );
}
