'use client';
import { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  rootUrlForSession,
  sessionExpiryMs,
  refreshDelayMs,
  withSession,
} from '@/lib/maptiles';
import { globeWorldPointToLatLon, GLOBE_CENTER } from '@/lib/earth/globe-click';

// Renders Google's photorealistic 3D tiles as the hub Earth globe.
//
// Real data only: the tileset streams from tile.googleapis.com using a
// short-lived session token minted by /api/earth/tiles/session. The API key
// never reaches the browser. If the session can't be minted, the tileset
// won't load, or the token can't be refreshed, this component reports the
// failure and renders nothing — NexusEarth then keeps its ESRI satellite
// lens, which is the honest fallback.
//
// Orientation: Google's tiles are in ECEF meters (Z-up). The wrapper group
// scales meters -> hub units (55-unit globe) and rotates Z-up -> Y-up so the
// photorealistic globe lines up exactly with the stylized globe it replaces
// (prime meridian at +X, north pole at +Y).

const ECEF_EARTH_RADIUS_M = 6378137;
const HUB_EARTH_RADIUS = 55;
// Give the tileset this long to deliver its root before giving up.
const TILESET_LOAD_TIMEOUT_MS = 30000;

async function fetchSessionToken() {
  const res = await fetch('/api/earth/tiles/session', { cache: 'no-store' });
  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (!res.ok || !data.session) {
    throw new Error(data.error || `tile session unavailable (HTTP ${res.status})`);
  }
  return data;
}

export default function GoogleEarthTiles({ onSelect, onGlobeClick, onActive, onInactive, quatRef }) {
  const { camera, gl, size, raycaster } = useThree();
  const [tiles, setTiles] = useState(null);
  const sessionRef = useRef(null);
  const stateRef = useRef({ tiles: null, timers: [], alive: true });
  const cbRef = useRef({ onActive, onInactive, quatRef });
  // Blue tap-highlight marker: shows where a single tap landed (fades after 800ms).
  const [tapSpot, setTapSpot] = useState(null);
  const tapTimerRef = useRef(null);
  cbRef.current = { onActive, onInactive, quatRef };

  // Show a brief blue ring at the tapped 3D point for visual feedback.
  const flashTapSpot = (point) => {
    if (!point) return;
    setTapSpot(point.clone ? point.clone() : { ...point });
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    tapTimerRef.current = setTimeout(() => setTapSpot(null), 800);
  };

  useEffect(() => {
    const st = stateRef.current;
    st.alive = true;

    const later = (ms, fn) => {
      const id = setTimeout(() => {
        if (st.alive) fn();
      }, ms);
      st.timers.push(id);
      return id;
    };

    const fail = () => {
      if (st.tiles) {
        try { st.tiles.removeEventListener?.('load-tile-set', st.onTileSet); } catch { /* noop */ }
        try { st.tiles.dispose(); } catch { /* already gone */ }
        st.tiles = null;
      }
      setTiles(null);
      cbRef.current.onInactive?.();
    };

    const scheduleRefresh = (expiry) => {
      const delay = refreshDelayMs(sessionExpiryMs(expiry));
      if (delay == null) return;
      later(delay, async () => {
        try {
          const data = await fetchSessionToken();
          if (!st.alive) return;
          sessionRef.current = data.session;
          scheduleRefresh(data.expiry);
        } catch {
          // Token expired and couldn't be renewed: fall back honestly.
          fail();
        }
      });
    };

    let settled = false;
    const settleActive = () => {
      if (settled || !st.alive) return;
      settled = true;
      cbRef.current.onActive?.();
    };

    (async () => {
      try {
        // 3d-tiles-renderer is loaded lazily so it never touches SSR and
        // stays out of the initial bundle.
        const [{ TilesRenderer }] = await Promise.all([import('3d-tiles-renderer')]);
        if (!st.alive) return;

        const data = await fetchSessionToken();
        if (!st.alive) return;
        sessionRef.current = data.session;

        const renderer = new TilesRenderer(rootUrlForSession(data.session));
        // Every tile request carries the current session token. The token
        // is read from a ref so refreshes apply without rebuilding the
        // renderer; URLs that already carry a token pass through untouched.
        renderer.preprocessURL = (uri) => withSession(uri, sessionRef.current);
        renderer.fetchOptions.mode = 'cors';
        // Detail radius + persistence (Merlin, 2026-10-20): a lower
        // screen-space error target keeps tiles refined farther
        // from the camera (bigger full-detail radius), and a larger
        // LRU cache means tiles that have rendered STAY rendered
        // instead of being evicted and re-streamed when the view
        // swings back. The cache only fills with what actually
        // streams in, so the ceiling costs nothing until used.
        renderer.errorTarget = 16;
        renderer.downloadQueue.maxJobs = 20;
        renderer.parseQueue.maxJobs = 8;
        renderer.lruCache.minSize = 2500;
        renderer.lruCache.maxSize = 6000;

        const onTileSet = () => settleActive();
        renderer.addEventListener('load-tile-set', onTileSet);
        st.onTileSet = onTileSet;

        // Align ECEF (meters, Z-up) with the hub globe (units, Y-up).
        const s = HUB_EARTH_RADIUS / ECEF_EARTH_RADIUS_M;
        renderer.group.scale.setScalar(s);
        renderer.group.rotation.x = -Math.PI / 2;

        renderer.setCamera(camera);
        renderer.setResolutionFromRenderer(camera, gl);

        st.tiles = renderer;
        setTiles(renderer);
        scheduleRefresh(data.expiry);

        // If the root tileset never arrives, don't leave the globe blank
        // forever — fall back to the satellite lens.
        later(TILESET_LOAD_TIMEOUT_MS, () => {
          if (!settled) fail();
        });
      } catch {
        fail();
      }
    })();

    return () => {
      st.alive = false;
      st.timers.forEach(clearTimeout);
      st.timers = [];
      if (st.tiles) {
        try { st.tiles.removeEventListener?.('load-tile-set', st.onTileSet); } catch { /* noop */ }
        try { st.tiles.dispose(); } catch { /* already gone */ }
        st.tiles = null;
      }
      setTiles(null);
    };
    // camera/gl are stable for the Canvas lifetime; size changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, gl]);

  // Keep screen-space error correct when the viewport changes.
  useEffect(() => {
    if (tiles) {
      try { tiles.setResolutionFromRenderer(camera, gl); } catch { /* not ready */ }
    }
  }, [size, tiles, camera, gl]);

  useFrame(() => {
    const t = stateRef.current.tiles;
    if (t) {
      try { t.update(); } catch { /* renderer gone */ }
    }
  });

  if (!tiles) return null;
  // Clicks pass through to the hub like the stylized globe's. Only onClick
  // is attached (no hover handlers) so the tile meshes are raycast on click
  // only, never on every pointer move.
  //
  // REMOVED 2026-10-26 (Merlin: "Remove the quantum realm
  // completely"): the double-click / double-tap tile shrink entry
  // is gone. Taps only flash the blue ring (visual feedback);
  // nothing shrinks, nothing selects a tile for a drop.

  const handlePointerDown = (e) => {
    // Only for touch pointers; mouse uses onClick.
    if (e.pointerType && e.pointerType !== 'touch') return;
    // Single tap: flash a blue ring where it landed (visual feedback).
    try {
      const rect = gl.domElement.getBoundingClientRect();
      const cx = e.nativeEvent?.clientX ?? 0;
      const cy = e.nativeEvent?.clientY ?? 0;
      const nx = ((cx - rect.left) / rect.width) * 2 - 1;
      const ny = -((cy - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera({ x: nx, y: ny }, camera);
      const tileGroup = tiles?.group;
      if (tileGroup) {
        const hits = raycaster.intersectObject(tileGroup, true);
        if (hits.length > 0) {
          flashTapSpot(hits[0].point);
        }
      }
    } catch {}
  };

  return (
    <group
      onClick={(e) => {
        e.stopPropagation();
        if (onSelect) onSelect();
        // Click-to-spawn (Earth 1, vehicles only, 2026-11-15):
        // the entry menu's pick step turns a globe tap into a
        // spawn lat/lon — the world-space hit point, un-rotated
        // by the globe's spin quaternion (lib/earth/globe-click).
        if (onGlobeClick && quatRef?.current) {
          const ll = globeWorldPointToLatLon(e.point, GLOBE_CENTER, quatRef.current);
          if (ll) onGlobeClick(ll);
        }
      }}
      onPointerDown={handlePointerDown}
    >
      <primitive object={tiles.group} />
      {/* Blue tap-highlight ring: brief visual feedback for single taps */}
      {tapSpot && (
        <mesh position={[tapSpot.x, tapSpot.y, tapSpot.z]} raycast={() => null}>
          <ringGeometry args={[0.35, 0.5, 32]} />
          <meshBasicMaterial color="#00aaff" transparent opacity={0.9} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}
