'use client';
import { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  rootUrlForSession,
  sessionExpiryMs,
  refreshDelayMs,
  withSession,
} from '@/lib/maptiles';

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

export default function GoogleEarthTiles({ onSelect, onActive, onInactive, onParachute, quatRef }) {
  const { camera, gl, size, raycaster } = useThree();
  const [tiles, setTiles] = useState(null);
  const sessionRef = useRef(null);
  const stateRef = useRef({ tiles: null, timers: [], alive: true });
  const cbRef = useRef({ onActive, onInactive, onParachute, quatRef });
  cbRef.current = { onActive, onInactive, onParachute, quatRef };

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
        renderer.errorTarget = 24;
        renderer.downloadQueue.maxJobs = 20;
        renderer.parseQueue.maxJobs = 8;
        renderer.lruCache.minSize = 1500;
        renderer.lruCache.maxSize = 3000;

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
  // Double-click parachute: raycast the tile meshes, convert the hit
  // point back to lat/lon, and hand it to the parent for the parachute
  // dive. The tile group is ECEF meters (Z-up) scaled to hub units and
  // rotated to Y-up, nested under NexusEarth's spin group at
  // [0,-60,-120] with quatRef rotation.
  const handleDoubleClick = (e) => {
    e.stopPropagation();
    const cb = cbRef.current;
    if (!cb.onParachute) return;
    const hit = e.intersections && e.intersections[0];
    if (!hit) return;
    // World → NexusEarth local: un-translate, un-rotate
    const wp = hit.point.clone();
    wp.x -= 0; wp.y -= -60; wp.z -= -120;
    const q = cb.quatRef?.current;
    if (q) wp.applyQuaternion(q.clone().invert());
    // Globe-local Cartesian (55-unit Y-up sphere) → lat/lon.
    // Inverse of latLonToVec3 (lib/geo.js).
    const r = Math.hypot(wp.x, wp.y, wp.z) || 55;
    const lat = 90 - (Math.acos(Math.max(-1, Math.min(1, wp.y / r))) * 180) / Math.PI;
    let lon = (Math.atan2(wp.z, -wp.x) * 180) / Math.PI - 180;
    while (lon > 180) lon -= 360;
    while (lon < -180) lon += 360;
    if (lat >= -85 && lat <= 85) cb.onParachute({ lat, lon });
  };

  return (
    <group
      onClick={(e) => { e.stopPropagation(); if (onSelect) onSelect(); }}
      onDoubleClick={handleDoubleClick}
    >
      <primitive object={tiles.group} />
    </group>
  );
}
