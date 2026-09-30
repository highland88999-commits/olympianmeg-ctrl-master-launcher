// components/argo/StreetEarth.jsx — Google photorealistic 3D tiles, two modes.
//
// mode="globe": the classic 55-unit hub globe (ECEF meters -> hub units,
// Z-up -> Y-up), exactly as the original GoogleEarthTiles.
// mode="street": the SAME tileset re-rooted into a local ENU meter frame
// centered on (lat, lon): three.x = east, three.y = up, three.z = south.
// The camera walks the real streets at 1 unit = 1 meter.
//
// One TilesRenderer serves both modes; the group transform swaps on mode
// change (masked by the descent crossfade) and tiles refine to street LOD
// over the next few seconds — the world sharpens as you land.
//
// Honesty: if the session can't be minted or the tileset fails, onInactive
// fires and the caller falls back to its stylized scene. The API key never
// reaches the browser (session token only, minted server-side).

'use client';
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { rootUrlForSession, withSession } from '@/lib/maptiles';
import { useMapTilesSession } from '@/lib/maptiles-session';
import { ecefToStreetMatrix } from '@/lib/argo-street';
import { HUB_EARTH_RADIUS, ECEF_EARTH_RADIUS_M } from '@/lib/argo-flight';

const TILESET_LOAD_TIMEOUT_MS = 30000;

function globeMatrix() {
  const s = HUB_EARTH_RADIUS / ECEF_EARTH_RADIUS_M;
  const m = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
  m.scale(new THREE.Vector3(s, s, s));
  return m;
}

function streetMatrix(lat, lon) {
  return new THREE.Matrix4().set(...ecefToStreetMatrix(lat, lon, 0));
}

export default function StreetEarth({
  mode = 'globe', // 'globe' | 'street'
  lat = 53.5461,
  lon = -113.4938,
  onActive,
  onInactive,
  onRenderer,
}) {
  const { camera, gl } = useThree();
  const { session, error } = useMapTilesSession();
  const stateRef = useRef({ renderer: null, timers: [], alive: true, activeNotified: false });
  const cbRef = useRef({ onActive, onInactive, onRenderer });
  cbRef.current = { onActive, onInactive, onRenderer };
  const modeRef = useRef({ mode, lat, lon });
  modeRef.current = { mode, lat, lon };

  // Camera clip planes per mode: street needs cm-scale near, km-scale far.
  useEffect(() => {
    if (mode === 'street') {
      camera.near = 0.1;
      camera.far = 40000;
    } else {
      camera.near = 0.5;
      camera.far = 3000;
    }
    camera.updateProjectionMatrix();
  }, [mode, camera]);

  // Swap the group transform when the mode changes.
  useEffect(() => {
    const r = stateRef.current.renderer;
    if (!r) return;
    const { mode: m, lat: la, lon: lo } = modeRef.current;
    r.group.matrixAutoUpdate = false;
    r.group.matrix.copy(m === 'street' ? streetMatrix(la, lo) : globeMatrix());
    r.group.matrixWorldNeedsUpdate = true;
  }, [mode, lat, lon, session]);

  useEffect(() => {
    const st = stateRef.current;
    st.alive = true;
    st.activeNotified = false;

    const later = (ms, fn) => {
      const id = setTimeout(() => {
        if (st.alive) fn();
      }, ms);
      st.timers.push(id);
      return id;
    };

    const fail = () => {
      if (st.renderer) {
        try { st.renderer.dispose(); } catch { /* gone */ }
        st.renderer = null;
      }
      cbRef.current.onInactive?.();
    };

    if (error) {
      fail();
      return () => {
        st.alive = false;
      };
    }
    if (!session) return () => {
      st.alive = false;
    };

    let settled = false;
    (async () => {
      try {
        const [{ TilesRenderer }] = await Promise.all([import('3d-tiles-renderer')]);
        if (!st.alive) return;

        const renderer = new TilesRenderer(rootUrlForSession(session));
        let currentSession = session;
        renderer.preprocessURL = (uri) => withSession(uri, currentSession);
        renderer.fetchOptions.mode = 'cors';
        renderer.errorTarget = 20; // finer than globe default: street deserves detail
        renderer.downloadQueue.maxJobs = 20;
        renderer.parseQueue.maxJobs = 8;
        renderer.lruCache.minSize = 1500;
        renderer.lruCache.maxSize = 3000;

        const { mode: m, lat: la, lon: lo } = modeRef.current;
        renderer.group.matrixAutoUpdate = false;
        renderer.group.matrix.copy(m === 'street' ? streetMatrix(la, lo) : globeMatrix());
        renderer.group.matrixWorldNeedsUpdate = true;

        renderer.addEventListener('load-tile-set', () => {
          if (settled || !st.alive) return;
          settled = true;
          st.activeNotified = true;
          cbRef.current.onActive?.();
        });

        renderer.setCamera(camera);
        renderer.setResolutionFromRenderer(camera, gl);

        st.renderer = renderer;
        cbRef.current.onRenderer?.(renderer);

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
      if (st.renderer) {
        try { st.renderer.dispose(); } catch { /* gone */ }
        st.renderer = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, error, camera]);

  useFrame(() => {
    const r = stateRef.current.renderer;
    if (r) {
      try { r.update(); } catch { /* renderer gone */ }
    }
  });

  return null;
}
