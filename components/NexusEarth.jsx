'use client';
import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import GoogleEarthTiles from '@/components/GoogleEarthTiles';
import ProceduralEarthGlobe from '@/components/ProceduralEarthGlobe';
import RedwaterFarmstead from '@/components/earth/RedwaterFarmstead';
import EarthSupercar from '@/components/EarthSupercar';
import EarthKart from '@/components/EarthKart';
import EarthBoostPads from '@/components/EarthBoostPads';
import EarthPeers from '@/components/EarthPeers';
import StreetGroundPatch, { StreetFillLight } from '@/components/StreetGroundPatch';
import { EarthCracks, EarthOrbitCracks } from '@/components/earth/EarthCracks';
import { LENS_PRESETS, LENS_LIFT, lensTilePlan, buildLensGeometryData, sortTilesCenterFirst, latLonFromDir, CENTRE_FLUSH_TILES } from '@/lib/earth/lens';
import { tileCellKey, recordRenderedTileKey, loadRenderedTileKeys } from '@/lib/earth/lens-cache';
import { metalTileColorForCell, metalTileCropForTile, metalTileImageUrl, METAL_TILE_IMAGE_WIDTH, METAL_TILE_IMAGE_HEIGHT } from '@/lib/earth/metal-tiles';
import {
  coarsePresetFor,
  planTrailCentres,
  filterUnrenderedCentres,
  sortByAheadness,
  pruneStaleQueue,
  capTrailQueue,
  lacksMountedCoverage,
  centreDistanceHub,
  RENDER_QUEUE_RECONCILE_MS,
} from '@/lib/earth/render-queue';
import {
  RENDERED_RECORD_PRESETS,
  RENDERED_TILES_ROUTE,
  RENDERED_RECORD_BATCH_MAX,
  RESTORE_RADIUS_FACTOR,
  buildRestoreJobs,
} from '@/lib/earth/rendered-tiles';
import {
  createBitset,
  REVEAL_RADIUS_DEG,
  markDisc,
  unionInto,
  countBits,
  coveragePercent,
  serializeBitset,
  parseBitset,
  loadMappedBitset,
  saveMappedBitset,
  setMappedPercent,
} from '@/lib/earth/mapping-progress';
import { reportEarthSync } from '@/lib/earth/sync-status';
import { HUB_UNITS_PER_DEGREE, DISPLAY_UNITS_PER_METRE } from '@/lib/earth/placements';
import { loadHeightData, getHeightData } from '@/lib/earth/heightmap';
import { roamState, tangentFrame, headingVector, DRIVING_ENTER_MPS, DRIVING_EXIT_MPS, revealLeadHub } from '@/lib/earth/roam';
import { setStreetFlatActive } from '@/lib/earth/street-flat';
import { PATCH_RECENTER_M, PATCH_RECENTER_DRIVING_M } from '@/lib/earth/street-patch';
import { EARTH_RADIUS } from '@/lib/geo';
import { sunVector, getDayNightPlace, requestDayNightPlace } from '@/lib/day-night';

// The hub Earth: Google's photorealistic 3D tiles when they stream, a real
// procedural 3D terrain globe as the fallback — Earth is always 3D, never a
// flat picture.
// - Clickable: onSelect fires (gated by parent to hub_freeroam).
// - Orientation is driven through the shared quatRef so the flight
//   controller can rotate the world (the treadmill: the traveler stands
//   still, the environment comes to them).
// - A detail "lens" drapes real ESRI World Imagery over the terrain
//   at the current focus (overlook) or under the traveler's feet
//   (street level): the sheet is built from lib/earth/lens.js —
//   every vertex grounded on the heightmap, the texture registered
//   by true lat/lon, the rim feathered into the globe. (Day 2 fix
//   for demo flaw E2: the old flat, unregistered disc let terrain
//   poke through in wedges and never matched the coast beneath it.)
// - When Google's photorealistic 3D tiles are available (session minted
//   server-side from GOOGLE_MAP_TILES_API_KEY), the terrain globe swaps
//   for the real photorealistic globe. The procedural terrain globe is the
//   honest fallback: it renders until the tiles actually load, and returns
//   if they fail. All textures are self-hosted under public/textures/earth.
// - Street level (Day 2) runs on the terrain globe — the layer that
//   carries the placed world — so roaming forces the terrain layer
//   and mounts the driver's vehicle (EarthSupercar, vehicles only
//   since 2026-11-15 — the walker is gone).
// - A small badge names the active layer in plain English.
// Rendered lens sheets PERSIST (Merlin, 2026-10-20: "once a tile
// has rendered, it stays rendered"). Recentering used to dispose
// the previous sheet, so the photographic ground behind the
// traveler vanished back to bare globe. Now the last few sheets
// stay mounted; beyond the cap the sheet FARTHEST from the current
// centre is disposed (distance eviction — the ground under and
// behind the traveler outlives a far-away sheet from an earlier
// focus). The cap is a GPU-memory call: each street sheet is a
// 2160² canvas texture (~19 MB; it was 2048² ≈ 17 MB before the
// 2026-10-22 range tripling), so 4 sheets ≈ 75 MB worst case —
// the cap deliberately did NOT grow with the ×3 radius: per-sheet
// memory is ≈ unchanged, and 4 sheets at the tripled radius
// already cover ×9 the ground the old 4 did.
const MAX_LENS_SHEETS = 4;
// Far (15× reveal) sheets are coarser canvases (1440² ≈ 8 MB), so
// two live far sheets cost less than one near sheet — the cap
// stays small because the far sheet's job is coverage, and the
// newest two already span ~2.7 km of travel.
const MAX_FAR_LENS_SHEETS = 2;
// Coarse fallback sheets are small canvases (640² ≈ 1.6 MB), so
// three live coarse sheets are cheap — and three is what the
// render queue needs: the sheet ahead of the traveler, the one
// under them, and the one just left behind.
const MAX_COARSE_LENS_SHEETS = 3;

// Lens-build watchdog (2026-10-27, Merlin's tolerance: tiles may
// lag up to about a minute behind the traveler, but they MUST
// catch up inside that window). A build whose tiles stall —
// throttled network, a hung fetch under Low Power Mode, a wedged
// canvas — used to hold its pool's `busy` flag forever and kill
// every later build in the session. Past this age a build is
// force-finished (paints what it has, frees the pool, pumps the
// queue) so the next centre rebuilds instead of starving.
const LENS_BUILD_WATCHDOG_MS = 60000;

// Session token for the account's own ui-state record — the
// Concourse pattern (dynamic import, never a stored token). The
// ui-state route requires a Bearer token; the three Earth sync
// calls used to send none, so every one 401'd silently and no
// mapped ground ever reached the server (2026-10-27: live
// registry held zero cells across all users while the pill
// read 0.0% all session).
async function getEarthUiToken() {
  try {
    const { supabase } = await import('@/lib/supabase');
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
  } catch {
    return null;
  }
}

// The globe's centre in world space (this component's outer group
// position) — the atmosphere shell's camera-distance gate below
// measures against it.
const EARTH_CENTER_WORLD = new THREE.Vector3(0, -30, -80);
// The atmosphere shell (radius 55 × 1.025 ≈ 56.4) only renders
// while the camera is OUTSIDE this distance from the centre:
// additive BackSide shading saturates to a naked white frame for
// as long as the lens travels inside the shell band (round 4,
// defect 5 — the ~1.5 s whiteout on every ascend, and the flash
// on return to orbit: the shell used to remount the moment the
// phase left `roaming`, with the camera still at street level
// inside it).
const SHELL_CAMERA_MIN_DIST = 57.5;

export default function NexusEarth({ onSelect, onGlobeClick, quatRef, focus, phase, spinEnabled, controls }) {
  const spinRef = useRef();
  const sheetsRef = useRef([]); // [{ key, mesh }] — mirror of lensSheets for frame-loop access
  const farSheetsRef = useRef([]); // [{ key, mesh }] — 15× reveal sheets
  const coarseSheetsRef = useRef([]); // [{ key, mesh }] — always-on coarse fallback sheets
  const roamCenterRef = useRef(null);
  const patchCenterRef = useRef(null);
  const farCenterRef = useRef(null);
  const coarseCenterRef = useRef(null);
  const lastLensBuildRef = useRef(0);
  const farLastBuildRef = useRef(0);
  const coarseLastBuildRef = useRef(0);
  const lastRoamPosRef = useRef(null); // { lat, lon, t } — driving-speed sampling
  const speedSmoothRef = useRef(0); // display m/s, EMA
  const drivingRef = useRef(false);
  // Mapped coverage (2026-10-26): the bitset of 2° cells the
  // reveal disc has swept (see lib/earth/mapping-progress.js).
  // Lazy from localStorage so the frame loop never pays for a
  // parse; the server record unions in on mount (below).
  const mappedBitsetRef = useRef(null);
  const lastMarkRef = useRef(null); // { lat, lon, t } — coverage cadence
  const mappedDirtyRef = useRef(false); // unsynced marks exist
  const mappedSyncRef = useRef(0); // last server-sync ms
  // Rendered-tiles server record (2026-10-27, Merlin: a Supabase
  // table tracking what tiles have been rendered, so tiles sent
  // to it render again on load for that user). The device record
  // (lens-cache) is one device only and never synced; this is
  // the server half. Guests, offline, and a missing table degrade
  // to device-only, silently — never an error surface.
  const renderedServerRef = useRef(null); // fetched rows, or null when unloaded
  const renderedServerKeysRef = useRef(new Set()); // keys already on the server (never re-sent)
  const renderedStageRef = useRef([]); // staged tiles awaiting the flush beat
  const renderedSentRef = useRef(new Set()); // keys flushed this session
  const renderedSyncOffRef = useRef(false); // table not ready: stop trying this session
  const renderedSyncRef = useRef(0); // last flush attempt ms
  const restoreRef = useRef({ done: false, near: [], far: [] }); // per-pool restore jobs
  const getMappedBitset = () => {
    if (!mappedBitsetRef.current) {
      mappedBitsetRef.current = loadMappedBitset();
      setMappedPercent(coveragePercent(mappedBitsetRef.current));
    }
    return mappedBitsetRef.current;
  };
  const [lensSheets, setLensSheets] = useState([]);
  const [farSheets, setFarSheets] = useState([]);
  const [coarseSheets, setCoarseSheets] = useState([]);
  const [heightReady, setHeightReady] = useState(false);
  const [roamCenter, setRoamCenter] = useState(null);
  const [patchCenter, setPatchCenter] = useState(null);
  const [farCenter, setFarCenter] = useState(null);
  const [coarseCenter, setCoarseCenter] = useState(null);
  const [renderedServerLoaded, setRenderedServerLoaded] = useState(false); // server tiles fetch settled (rows or none)
  const [driving, setDriving] = useState(false);
  const skyMatRef = useRef(null); // street-level day-sky dome shader material
  // 'terrain' = procedural 3D globe + ESRI lens (default, always 3D).
  // 'photorealistic' = Google 3D tiles, only after they really render.
  const [layer, setLayer] = useState('terrain');
  const shellRef = useRef();

  const roaming = phase === 'diving_to_street' || phase === 'earth_roam';
  const effectiveLayer = roaming ? 'terrain' : layer;

  // Shared heightmap: one decode for globe, assets, lens, walker.
  useEffect(() => {
    let alive = true;
    loadHeightData().then((hd) => { if (alive && hd) setHeightReady(true); });
    return () => { alive = false; };
  }, []);

  // Street-level flat mode (Merlin, 2026-10-26): while roaming,
  // every ground sampler returns the constant sea-level radius —
  // the globe component morphs its geometry flat on the same
  // signal, so the visible world and the grounding agree. Cleared
  // on phase change and unmount: orbit keeps real relief.
  useEffect(() => {
    setStreetFlatActive(roaming);
    return () => setStreetFlatActive(false);
  }, [roaming]);

  // Day/night (Merlin, 2026-11-14): the street-level sky dome's
  // sunDirection follows the REAL sun for the walker's place
  // (real location when granted, Sydney when not — the shared
  // law, lib/day-night.js), refreshed ~once a second. The
  // shader itself is untouched: day side still gets the blue
  // sky, night side still holds the nightBlue floor so stars
  // show through. The dome only mounts while roaming, so a
  // missing material is a no-op, not an error.
  useEffect(() => {
    requestDayNightPlace();
    const updateSun = () => {
      const mat = skyMatRef.current;
      if (!mat || !mat.uniforms || !mat.uniforms.sunDirection) return;
      try {
        const place = getDayNightPlace();
        const v = sunVector(Date.now(), place.lat, place.lon);
        mat.uniforms.sunDirection.value.set(v.x, v.y, v.z);
      } catch {}
    };
    updateSun();
    const id = setInterval(updateSun, 1000);
    return () => clearInterval(id);
  }, []);

  // Mapped-coverage server record (2026-10-26): on mount, union
  // the account's server bitset into the device record, so a
  // reload (or a second device) starts from the same mapped
  // ground instead of zero. Guests, offline, and a missing key
  // degrade to device-only, silently — never an error surface.
  //
  // 2026-10-27 fix: this GET used to send no Authorization
  // header, so it 401'd for every signed-in user (the route
  // requires Bearer) and the union never ran. It now carries
  // the session token like every other ui-state caller. The
  // mount also flags local-ahead ground (device marks the
  // server has never seen — e.g. after a failed flush) as
  // dirty, so the next 30 s beat pushes the full bitset
  // instead of leaving those marks stranded on the device.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getEarthUiToken();
        if (cancelled) return;
        if (!token) { reportEarthSync({ token: false }); return; } // guest: device-only, as before
        reportEarthSync({ token: true });
        const r = await fetch('/api/ui-state', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled || !r.ok) return;
        const body = await r.json();
        if (cancelled) return;
        const hex = body && body.preferences && body.preferences.earth_mapped;
        const server = parseBitset(hex);
        const bitset = getMappedBitset();
        if (server && unionInto(bitset, server)) {
          saveMappedBitset(bitset);
          setMappedPercent(coveragePercent(bitset));
        }
        const probe = server ? server.slice() : createBitset();
        if (unionInto(probe, bitset)) mappedDirtyRef.current = true;
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  // Rendered-tiles server record (2026-10-27): on mount, fetch
  // the account's own recorded sheets, so the restore pass below
  // can rebuild the explored ground near the traveler instead of
  // starting from zero. Guests, offline, and a missing table
  // (migration not run yet) degrade to device-only, silently —
  // the loaded flag still settles so the restore pass runs its
  // no-op instead of waiting forever.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getEarthUiToken();
        if (cancelled) return;
        if (!token) { if (!cancelled) setRenderedServerLoaded(true); return; }
        const r = await fetch(RENDERED_TILES_ROUTE, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled) return;
        if (r.ok) {
          const body = await r.json().catch(() => null);
          if (cancelled) return;
          if (body && body.ok === true && Array.isArray(body.tiles)) {
            renderedServerRef.current = body.tiles;
            renderedServerKeysRef.current = new Set(
              body.tiles.map((t) => t.tileKey).filter((k) => typeof k === 'string'));
          } else if (body && body.error === 'not_ready') {
            renderedSyncOffRef.current = true;
          }
        }
        if (!cancelled) setRenderedServerLoaded(true);
      } catch {
        if (!cancelled) setRenderedServerLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Flush the mapped record to the server when roaming ends
  // (the 30 s beat covers long sessions; this covers short
  // ones). Fire-and-forget — never blocks unmount.
  //
  // 2026-10-27 fix: this POST used to send no Authorization
  // header, so it 401'd and the marks never landed. It now
  // carries the session token. It deliberately does NOT clear
  // the dirty flag: if the flush fails, the mount's
  // local-ahead probe re-flags it and the next beat retries
  // with the full bitset — a failed flush must never eat marks.
  useEffect(() => {
    if (roaming) return undefined;
    // Rendered-tiles flush on roam end (same fire-and-forget law
    // as mapping): staged sheet records go up in one batch. A
    // failure stays staged for the next session's beat; a
    // not_ready answer disables sync for the session instead of
    // spamming a table that does not exist yet.
    if (renderedStageRef.current.length > 0 && !renderedSyncOffRef.current) {
      const batch = renderedStageRef.current.slice(0, RENDERED_RECORD_BATCH_MAX);
      (async () => {
        try {
          const token = await getEarthUiToken();
          if (!token) return;
          const r = await fetch(RENDERED_TILES_ROUTE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ tiles: batch }),
          });
          const body = await r.json().catch(() => null);
          if (body && body.error === 'not_ready') { renderedSyncOffRef.current = true; return; }
          if (r.ok && body && body.ok) {
            const sent = new Set(batch.map((t) => t.tile_key));
            renderedStageRef.current = renderedStageRef.current.filter((t) => !sent.has(t.tile_key));
            for (const k of sent) renderedSentRef.current.add(k);
          }
        } catch {}
      })();
    }
    if (!mappedDirtyRef.current || !mappedBitsetRef.current) return undefined;
    const hex = serializeBitset(mappedBitsetRef.current);
    reportEarthSync({ lastBeat: Date.now(), token: null, lastHttp: null, lastOk: null });
    (async () => {
      try {
        const token = await getEarthUiToken();
        if (!token) { reportEarthSync({ token: false, lastHttp: 'no-token', lastOk: false }); return; }
        reportEarthSync({ token: true });
        const r = await fetch('/api/ui-state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ preferences: { earth_mapped: hex } }),
        });
        if (r.ok) { mappedDirtyRef.current = false; reportEarthSync({ lastHttp: r.status, lastOk: true, dirty: false }); }
        else { reportEarthSync({ lastHttp: r.status, lastOk: false }); }
      } catch { reportEarthSync({ lastHttp: 'network', lastOk: false }); }
    })();
    return undefined;
  }, [roaming]);

  // While roaming, recenter the street lens when the traveler has
  // walked out of its middle (throttled: the composite is a real
  // canvas build, and the feather hides the handoff).
  useFrame((state, delta) => {
    // Atmosphere shell gate (SHELL_CAMERA_MIN_DIST above): the
    // shell exists only for a camera outside its band — never
    // while the lens is transiting it on the way up or down.
    if (shellRef.current) {
      shellRef.current.visible = state.camera.position.distanceTo(EARTH_CENTER_WORLD) > SHELL_CAMERA_MIN_DIST;
    }
    if (spinEnabled && spinRef.current && quatRef?.current) {
      const qy = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0), delta * 0.05
      );
      quatRef.current.multiply(qy);
    }
    if (spinRef.current && quatRef?.current) {
      spinRef.current.quaternion.copy(quatRef.current);
    }
    if (sheetsRef.current.length || farSheetsRef.current.length || coarseSheetsRef.current.length) {
      // UNMASKED (2026-10-26, Earth 1 expansion): a rendered tile
      // STAYS rendered and visible. The old fade hid every sheet
      // whenever focus cleared or during earth_travel, so ground
      // the traveler had already revealed vanished back to bare
      // globe — a mask in everything but name. Rendered sheets
      // now hold at full opacity in every phase; the only thing
      // that still removes a sheet is the MAX_LENS_SHEETS distance
      // eviction (a GPU-memory cap, not a hide). The
      // photorealistic layer's own gate (hidden while roaming, so
      // the street layer can stand) is untouched — that layer is
      // a product decision, not a mask, and disabling it is out
      // of scope.
      // 2026-10-27 (render queue): the coarse pool was MISSING
      // from this loop — coarse meshes are created at opacity 0
      // and nothing ever raised them, so the whole driving
      // fallback layer mounted invisibly and driving ground
      // stayed bare dark globe. Coarse sheets animate here now,
      // like the other two pools.
      const target = 0.96;
      for (const s of sheetsRef.current) {
        const m = s.mesh.material;
        m.opacity += (target - m.opacity) * Math.min(1, delta * 3);
        s.mesh.visible = m.opacity > 0.02;
      }
      for (const s of farSheetsRef.current) {
        const m = s.mesh.material;
        m.opacity += (target - m.opacity) * Math.min(1, delta * 3);
        s.mesh.visible = m.opacity > 0.02;
      }
      for (const s of coarseSheetsRef.current) {
        const m = s.mesh.material;
        m.opacity += (target - m.opacity) * Math.min(1, delta * 3);
        s.mesh.visible = m.opacity > 0.02;
      }
    }
    if (roaming && roamState.active) {
      const c = roamCenterRef.current;
      // Recenter when the traveler walks out of the street disc's
      // middle: 40% of the street lens radius, in degrees. (The old
      // fixed 0.06° refired every few steps at full tilt, thrashing
      // the 64-tile composite; this keeps the traveler on the
      // photographic ground with far fewer rebuilds.)
      const recenterDeg = (LENS_PRESETS.street.radiusUnits * 0.4) / HUB_UNITS_PER_DEGREE;
      const moved = !c
        || Math.abs(c.lat - roamState.lat) > recenterDeg
        || Math.abs(c.lon - roamState.lon) > recenterDeg;
      const now = performance.now();
      if (moved && now - lastLensBuildRef.current > 900) {
        lastLensBuildRef.current = now;
        const next = { lat: roamState.lat, lon: roamState.lon };
        roamCenterRef.current = next;
        setRoamCenter(next);
      }
      // The street PATCH recenters on its own, much tighter beat: it
      // is pure geometry (no tile fetches), and at bike speed the
      // traveler crosses the lens's 900ms throttle in a blink — the
      // floor must already be there, all around and behind, before
      // it's needed (Merlin, 2026-10-20). ~10 m threshold on foot,
      // no timer; 100 m while driving (the flat disc is identical
      // wherever its centre sits inside its own radius, so the
      // 10 m beat at full boost would rebuild it 54×/s for
      // nothing).
      const pc = patchCenterRef.current;
      const patchM = drivingRef.current ? PATCH_RECENTER_DRIVING_M : PATCH_RECENTER_M;
      const patchDeg = (patchM * DISPLAY_UNITS_PER_METRE) / HUB_UNITS_PER_DEGREE;
      if (!pc
        || Math.abs(pc.lat - roamState.lat) > patchDeg
        || Math.abs(pc.lon - roamState.lon) > patchDeg) {
        const next = { lat: roamState.lat, lon: roamState.lon };
        patchCenterRef.current = next;
        setPatchCenter(next);
      }

      // Driving speed + the 15× reveal centre (2026-10-26, flat +
      // reveal): speed comes from the traveler's own position
      // delta, so it is true for walker, bike and car alike.
      // Hysteresis keeps the driving flag from flapping at the
      // boundary; the fine street sheet pauses while driving
      // (see the lens effect) and the far sheet carries the
      // ground, centred 1.5 s ahead of the heading so tiles
      // paint where the traveler is GOING.
      const nowMs = performance.now();
      const last = lastRoamPosRef.current;
      if (last) {
        const dtSec = (nowMs - last.t) / 1000;
        if (dtSec > 0.001 && dtSec < 1) {
          const p1 = (last.lat * Math.PI) / 180;
          const p2 = (roamState.lat * Math.PI) / 180;
          const dLon = ((roamState.lon - last.lon) * Math.PI) / 180;
          const cosC = Math.min(1, Math.max(-1,
            Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dLon)));
          const hubDist = Math.acos(cosC) * EARTH_RADIUS;
          const inst = hubDist / dtSec / DISPLAY_UNITS_PER_METRE;
          // Teleports (spawn jumps, journey portals) read as
          // absurd speeds — ignore them instead of flipping
          // driving mode and flinging the reveal centre.
          if (inst <= 1200) {
            speedSmoothRef.current = speedSmoothRef.current * 0.65 + inst * 0.35;
            const spd = speedSmoothRef.current;
            if (!drivingRef.current && spd > DRIVING_ENTER_MPS) {
              drivingRef.current = true;
              setDriving(true);
            } else if (drivingRef.current && spd < DRIVING_EXIT_MPS) {
              drivingRef.current = false;
              setDriving(false);
              // Stopping: recenter the fine sheet at once instead
              // of waiting out the 900 ms throttle on stale ground.
              lastLensBuildRef.current = 0;
            }
          }
        }
      }
      lastRoamPosRef.current = { lat: roamState.lat, lon: roamState.lon, t: nowMs };
      // Mapped coverage (2026-10-26): every position sweeps the
      // 15× reveal disc into the mapped record — the tracker
      // pill counts exactly this union. Marked at most every
      // 0.5° of travel or 5 s, so the frame loop never pays
      // per frame; the server record syncs on a 30 s beat
      // while roaming and once more when roaming ends.
      {
        const lm = lastMarkRef.current;
        const moved = !lm
          || Math.abs(lm.lat - roamState.lat) > 0.5
          || Math.abs(lm.lon - roamState.lon) > 0.5
          || nowMs - lm.t > 5000;
        if (moved) {
          const bitset = getMappedBitset();
          const added = markDisc(bitset, roamState.lat, roamState.lon, REVEAL_RADIUS_DEG);
          lastMarkRef.current = { lat: roamState.lat, lon: roamState.lon, t: nowMs };
          if (added > 0) {
            saveMappedBitset(bitset);
            setMappedPercent(coveragePercent(bitset));
            mappedDirtyRef.current = true;
            // Sync telemetry: the console's SYNC line shows this
            // device's marked cells and the waiting-to-send flag.
            reportEarthSync({ cells: countBits(bitset), dirty: true });
          }
          if (mappedDirtyRef.current && nowMs - mappedSyncRef.current > 30000) {
            // 2026-10-27 fix: this POST used to send no token
            // (every sync 401'd) AND cleared the dirty flag
            // before the fetch, so failed marks were never
            // retried. Now the flag clears only on a confirmed
            // ok response; a failure stays dirty and the next
            // beat retries with the full bitset. The 30 s
            // throttle still gates ATTEMPTS, not successes.
            mappedSyncRef.current = nowMs;
            const hex = serializeBitset(bitset);
            // Sync telemetry: every attempt reports here so the
            // console's SYNC line shows the real outcome instead
            // of failing silently.
            reportEarthSync({ lastBeat: Date.now(), token: null, lastHttp: null, lastOk: null });
            (async () => {
              try {
                const token = await getEarthUiToken();
                if (!token) { reportEarthSync({ token: false, lastHttp: 'no-token', lastOk: false }); return; }
                reportEarthSync({ token: true });
                const r = await fetch('/api/ui-state', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                  body: JSON.stringify({ preferences: { earth_mapped: hex } }),
                });
                if (r.ok) { mappedDirtyRef.current = false; reportEarthSync({ lastHttp: r.status, lastOk: true, dirty: false }); }
                else { reportEarthSync({ lastHttp: r.status, lastOk: false }); }
              } catch { reportEarthSync({ lastHttp: 'network', lastOk: false }); }
            })();
          }
        }
      }
      // Rendered-tiles server flush (same 30 s beat law as the
      // mapping sync above): staged sheet records go up in one
      // batch; a failure stays staged for the next beat; a
      // not_ready answer disables sync for the session (the
      // migration has not been run yet) instead of spamming.
      // The throttle gates ATTEMPTS, not successes.
      if (renderedStageRef.current.length > 0 && !renderedSyncOffRef.current
        && nowMs - renderedSyncRef.current > 30000) {
        renderedSyncRef.current = nowMs;
        const batch = renderedStageRef.current.slice(0, RENDERED_RECORD_BATCH_MAX);
        (async () => {
          try {
            const token = await getEarthUiToken();
            if (!token) return;
            const r = await fetch(RENDERED_TILES_ROUTE, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ tiles: batch }),
            });
            const body = await r.json().catch(() => null);
            if (body && body.error === 'not_ready') { renderedSyncOffRef.current = true; return; }
            if (r.ok && body && body.ok) {
              const sent = new Set(batch.map((t) => t.tile_key));
              renderedStageRef.current = renderedStageRef.current.filter((t) => !sent.has(t.tile_key));
              for (const k of sent) renderedSentRef.current.add(k);
            }
          } catch {}
        })();
      }
      // Far reveal centre: the player's position led along the
      // heading. Recenter when the led point leaves the far
      // sheet's middle (40% of its radius), throttled 500 ms —
      // at full boost that cadence is ~1 s, so the throttle
      // never starves the build.
      const farPreset = LENS_PRESETS.streetFar;
      const farRecenterDeg = (farPreset.radiusUnits * 0.4) / HUB_UNITS_PER_DEGREE;
      const leadHub = revealLeadHub(speedSmoothRef.current);
      const leadAng = leadHub / EARTH_RADIUS;
      const frame = tangentFrame(roamState.lat, roamState.lon);
      const fwd = headingVector(frame, roamState.yawDeg);
      const cosA = Math.cos(leadAng);
      const sinA = Math.sin(leadAng);
      const leadDir = {
        x: frame.normal.x * cosA + fwd.x * sinA,
        y: frame.normal.y * cosA + fwd.y * sinA,
        z: frame.normal.z * cosA + fwd.z * sinA,
      };
      const leadPos = latLonFromDir(leadDir);
      const fc = farCenterRef.current;
      if ((!fc
        || Math.abs(fc.lat - leadPos.lat) > farRecenterDeg
        || Math.abs(fc.lon - leadPos.lon) > farRecenterDeg)
        && nowMs - farLastBuildRef.current > 500) {
        farLastBuildRef.current = nowMs;
        farCenterRef.current = leadPos;
        setFarCenter(leadPos);
      }
      // Coarse fallback centre: the traveler's OWN position, not
      // led ahead — this sheet's job is ground underfoot, always.
      // Same 40%-of-radius recenter law as far, same 500 ms
      // throttle: at full boost the cadence is ~1 s, and a
      // 64-tile centre-first build paints the ground under the
      // car in its first fetches, so the car never outruns
      // photographic ground into bare dark globe again.
      // 2026-10-27 (render queue): the recenter radius is the
      // DRIVING-AWARE coarse radius — in a car the wide sheet's
      // doubled radius sets the beat, so the queue does not
      // recenter twice as often as the sheet it feeds.
      const coarsePreset = LENS_PRESETS[coarsePresetFor(drivingRef.current)];
      const coarseRecenterDeg = (coarsePreset.radiusUnits * 0.4) / HUB_UNITS_PER_DEGREE;
      const cc = coarseCenterRef.current;
      if ((!cc
        || Math.abs(cc.lat - roamState.lat) > coarseRecenterDeg
        || Math.abs(cc.lon - roamState.lon) > coarseRecenterDeg)
        && nowMs - coarseLastBuildRef.current > 500) {
        coarseLastBuildRef.current = nowMs;
        coarseCenterRef.current = { lat: roamState.lat, lon: roamState.lon };
        setCoarseCenter({ lat: roamState.lat, lon: roamState.lon });
      }
    }
  });

  // Dispose every persisted lens sheet (leaving Earth / unmount).
  const clearLensSheets = () => {
    for (const s of sheetsRef.current) {
      s.mesh.geometry.dispose();
      s.mesh.material.map?.dispose();
      s.mesh.material.dispose();
    }
    sheetsRef.current = [];
    setLensSheets([]);
  };

  // Build the lens for the current centre + range preset.
  const lensCenter = roaming ? roamCenter : focus;
  const presetName = roaming ? 'street' : 'overlook';
  const centerKey = lensCenter
    ? `${presetName}:${lensCenter.lat.toFixed(4)},${lensCenter.lon.toFixed(4)}`
    : null;

  // Lens build manager (2026-10-26, street-tiles fix). The old
  // effect abandoned a build the moment the traveler walked to a
  // new centre — and a street sheet needs 36×36 = 1,296 tile
  // fetches while walking recenters every ~36 m, so in motion NO
  // sheet ever finished and the ground stayed flat patch-colour
  // forever (Merlin's footage; only a rare standstill sheet
  // landed). Now builds run SERIALLY: a recenter while a build
  // runs only queues the newest centre, and sheets mount
  // PROGRESSIVELY — the mesh lands at once and tiles paint as
  // they arrive (texture uploads throttled to 750 ms so a
  // 2160² canvas isn't re-uploaded per tile), so photographic
  // ground grows within seconds instead of all-or-nothing.
  const lensBuildRef = useRef({ busy: false, pending: null, alive: true });
  const lensGenRef = useRef(0);
  const farLensBuildRef = useRef({ busy: false, pending: null, alive: true });
  const farLensGenRef = useRef(0);
  const coarseLensBuildRef = useRef({ busy: false, pending: null, queue: [], alive: true });
  const coarseLensGenRef = useRef(0);

  const disposeLensSheet = (s) => {
    s.mesh.geometry.dispose();
    s.mesh.material.map?.dispose();
    s.mesh.material.dispose();
  };

  // Persist a sheet alongside the recent ones (see
  // MAX_LENS_SHEETS): a rebuilt cell replaces its old sheet;
  // only sheets beyond the cap are disposed, farthest first —
  // never the one the traveler is standing on.
  const mountLensSheet = (key, mesh, lat, lon) => {
    const replaced = sheetsRef.current.find((s) => s.key === key);
    if (replaced) disposeLensSheet(replaced);
    const next = [...sheetsRef.current.filter((s) => s.key !== key),
      { key, mesh, lat, lon }];
    while (next.length > MAX_LENS_SHEETS) {
      let farIdx = 0;
      let farDist = -1;
      for (let i = 0; i < next.length - 1; i++) {
        const dLat = next[i].lat - lat;
        const dLon = next[i].lon - lon;
        const d = dLat * dLat + dLon * dLon;
        if (d > farDist) { farDist = d; farIdx = i; }
      }
      disposeLensSheet(next[farIdx]);
      next.splice(farIdx, 1);
    }
    sheetsRef.current = next;
    setLensSheets(next);
  };

  const removeLensSheet = (key) => {
    const hit = sheetsRef.current.find((s) => s.key === key);
    if (!hit) return;
    disposeLensSheet(hit);
    const next = sheetsRef.current.filter((s) => s.key !== key);
    sheetsRef.current = next;
    setLensSheets(next);
  };

  // Far-sheet pool (15× reveal): same persist + distance-eviction
  // law as the near pool, but a SEPARATE pool — a far sheet must
  // never evict a near sheet or vice versa, and the far cap (2)
  // reflects the coarser 1440² canvases.
  const mountFarLensSheet = (key, mesh, lat, lon) => {
    const replaced = farSheetsRef.current.find((s) => s.key === key);
    if (replaced) disposeLensSheet(replaced);
    const next = [...farSheetsRef.current.filter((s) => s.key !== key),
      { key, mesh, lat, lon }];
    while (next.length > MAX_FAR_LENS_SHEETS) {
      let farIdx = 0;
      let farDist = -1;
      for (let i = 0; i < next.length - 1; i++) {
        const dLat = next[i].lat - lat;
        const dLon = next[i].lon - lon;
        const d = dLat * dLat + dLon * dLon;
        if (d > farDist) { farDist = d; farIdx = i; }
      }
      disposeLensSheet(next[farIdx]);
      next.splice(farIdx, 1);
    }
    farSheetsRef.current = next;
    setFarSheets(next);
  };

  const removeFarLensSheet = (key) => {
    const hit = farSheetsRef.current.find((s) => s.key === key);
    if (!hit) return;
    disposeLensSheet(hit);
    const next = farSheetsRef.current.filter((s) => s.key !== key);
    farSheetsRef.current = next;
    setFarSheets(next);
  };

  const clearFarSheets = () => {
    for (const s of farSheetsRef.current) {
      s.mesh.geometry.dispose();
      s.mesh.material.map?.dispose();
      s.mesh.material.dispose();
    }
    farSheetsRef.current = [];
    setFarSheets([]);
  };

  // Coarse fallback pool (2026-10-27, driving void): same persist
  // + distance-eviction law as the far pool, but a SEPARATE pool
  // — a coarse sheet must never evict a far or near sheet.
  const mountCoarseLensSheet = (key, mesh, lat, lon) => {
    const replaced = coarseSheetsRef.current.find((s) => s.key === key);
    if (replaced) disposeLensSheet(replaced);
    const next = [...coarseSheetsRef.current.filter((s) => s.key !== key),
      { key, mesh, lat, lon }];
    while (next.length > MAX_COARSE_LENS_SHEETS) {
      let farIdx = 0;
      let farDist = -1;
      for (let i = 0; i < next.length - 1; i++) {
        const dLat = next[i].lat - lat;
        const dLon = next[i].lon - lon;
        const d = dLat * dLat + dLon * dLon;
        if (d > farDist) { farDist = d; farIdx = i; }
      }
      disposeLensSheet(next[farIdx]);
      next.splice(farIdx, 1);
    }
    coarseSheetsRef.current = next;
    setCoarseSheets(next);
  };

  const removeCoarseLensSheet = (key) => {
    const hit = coarseSheetsRef.current.find((s) => s.key === key);
    if (!hit) return;
    disposeLensSheet(hit);
    const next = coarseSheetsRef.current.filter((s) => s.key !== key);
    coarseSheetsRef.current = next;
    setCoarseSheets(next);
  };

  const clearCoarseSheets = () => {
    for (const s of coarseSheetsRef.current) {
      s.mesh.geometry.dispose();
      s.mesh.material.map?.dispose();
      s.mesh.material.dispose();
    }
    coarseSheetsRef.current = [];
    setCoarseSheets([]);
  };

  const pumpLensQueue = () => {
    const mgr = lensBuildRef.current;
    if (mgr.busy || !mgr.alive) return;
    const job = mgr.pending;
    mgr.pending = null;
    if (job) { startLensBuild(job, NEAR_CTX); return; }
    // Restore pickup: only while the pool is otherwise idle — a
    // live centre always wins over a restored sheet.
    const rj = nextRestoreJob(restoreRef.current.near);
    if (rj) startLensBuild({ key: rj.key, lat: rj.lat, lon: rj.lon, presetName: rj.presetName }, NEAR_CTX);
  };

  const farPumpLensQueue = () => {
    const mgr = farLensBuildRef.current;
    if (mgr.busy || !mgr.alive) return;
    const job = mgr.pending;
    mgr.pending = null;
    if (job) { startLensBuild(job, FAR_CTX); return; }
    // Restore pickup: same idle-only law as the near pool.
    const rj = nextRestoreJob(restoreRef.current.far);
    if (rj) startLensBuild({ key: rj.key, lat: rj.lat, lon: rj.lon, presetName: rj.presetName }, FAR_CTX);
  };

  // Next restore job for a pool that is still worth building:
  // restore jobs the traveler has since left more than two
  // preset radii behind are dropped, never built — live ground
  // always beats restored ground. Consumes from the list.
  const nextRestoreJob = (list) => {
    while (list.length > 0) {
      const j = list.shift();
      const preset = LENS_PRESETS[j.presetName];
      if (!preset) continue;
      if (centreDistanceHub({ lat: roamState.lat, lon: roamState.lon }, j)
        <= preset.radiusUnits * RESTORE_RADIUS_FACTOR) return j;
    }
    return null;
  };

  // Coarse pump (2026-10-27, render queue): unlike the near/far
  // pools' single pending slot, the coarse pool drains a real
  // QUEUE of trail centres in order — ahead first (the effect
  // sorts it that way each tick), then back toward the ground
  // behind. One build at a time, same serial law as before.
  const coarsePumpLensQueue = () => {
    const mgr = coarseLensBuildRef.current;
    if (mgr.busy || !mgr.alive) return;
    const job = mgr.queue.shift();
    if (job) startLensBuild(job, COARSE_CTX);
  };

  // Build contexts: one build routine serves both pools; the ctx
  // picks the manager, the mount/remove/pump set, and the draw
  // order (far below near — the near sheet's detail always wins
  // where the two overlap).
  const NEAR_CTX = {
    mgrRef: lensBuildRef, genRef: lensGenRef,
    mount: mountLensSheet, remove: removeLensSheet, pump: pumpLensQueue,
    renderOrder: 3,
  };
  const FAR_CTX = {
    mgrRef: farLensBuildRef, genRef: farLensGenRef,
    mount: mountFarLensSheet, remove: removeFarLensSheet, pump: farPumpLensQueue,
    renderOrder: 2,
  };
  const COARSE_CTX = {
    mgrRef: coarseLensBuildRef, genRef: coarseLensGenRef,
    mount: mountCoarseLensSheet, remove: removeCoarseLensSheet, pump: coarsePumpLensQueue,
    renderOrder: 1,
  };

  const startLensBuild = (job, bctx) => {
    const mgr = bctx.mgrRef.current;
    const gen = bctx.genRef.current;
    mgr.busy = true;
    mgr.job = job;
    const preset = LENS_PRESETS[job.presetName];
    const S = preset.canvasPx / preset.grid;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = preset.canvasPx;
    const ctx = canvas.getContext('2d');
    const hd = getHeightData();
    // iPhone hardening (2026-10-01, extended 2026-10-27): iOS
    // Safari returns null for 2D contexts under canvas memory
    // pressure. The old guard checked the build context and the
    // height data but NEVER the canvas context itself — a null
    // ctx threw inside the first tile onload BEFORE the settle
    // count moved, so finish() never ran and the pool's busy
    // flag wedged forever: no later build in the session ever
    // started, which is exactly "new ground never paints."
    // Skip honestly; the next recenter retries.
    if (!hd || !ctx) { if (mgr.job === job) { mgr.job = null; mgr.busy = false; } bctx.pump(); return; }
    // Progressive mount: the sheet is on screen at once (the
    // frame loop animates its opacity 0 → 0.96) and tiles paint
    // into it as they arrive — no more waiting on all 1,296
    // tiles before ANY photographic ground shows.
    let tex;
    let plan;
    try {
      plan = lensTilePlan(job.lat, job.lon, preset.zoom, preset.grid, preset.canvasPx);
      const data = buildLensGeometryData(
        hd.data, hd.w, hd.h, job.lat, job.lon,
        preset.radiusUnits, plan,
        {
          // Street rings 12 → 24 (2026-10-22, with the radius
          // tripling): the wider disc gets a denser drape so
          // relief still hugs the terrain out at the 90 m rim.
          // The far sheet takes 24 too — over a 45° cap the UV
          // registration across each triangle stays sub-tile.
          rings: job.presetName === 'overlook' ? 22 : 24,
          sectors: 48,
          lift: preset.lift ?? LENS_LIFT,
        },
      );
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(data.uvs, 2));
      geo.setIndex(new THREE.BufferAttribute(data.indices, 1));
      tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      const mat = new THREE.MeshBasicMaterial({
        map: tex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = bctx.renderOrder;
      bctx.mount(job.key, mesh, job.lat, job.lon);
    } catch {
      // Setup threw after busy was set (bad geometry data, a
      // canvas fault, a mount fault): drop any partial sheet,
      // free the pool, and let the next recenter retry instead
      // of wedging the queue for the rest of the session.
      try { bctx.remove(job.key); } catch {}
      if (mgr.job === job) { mgr.job = null; mgr.busy = false; }
      bctx.pump();
      return;
    }
    let settledCount = 0;
    let okCount = 0;
    let texTimer = null;
    let finished = false;
    let watchTimer = null;
    const queueTexUpload = () => {
      if (texTimer) return;
      texTimer = setTimeout(() => {
        texTimer = null;
        tex.needsUpdate = true;
      }, 750);
    };
    // Blank-canvas guard (2026-10-29, black ground): iOS Safari
    // can reclaim a 2D canvas backing store under memory pressure
    // (Low Power Mode makes it eager) WITHOUT drawImage throwing
    // — the calls become silent no-ops. The build then "succeeds"
    // with a blank canvas: okCount is up, the sheet mounts black,
    // the rendered-record marks it painted, and BOTH safety nets
    // are defeated at once — the mounted black sheet answers the
    // coverage check (so the 10 s reconciler never fires) and the
    // record answers the trail dedup (so the queue never rebuilds
    // it). Permanent black ground until reload, exactly Merlin's
    // video. Sample the canvas: if nothing painted, the build
    // failed no matter what the counters say.
    // Mostly-blank guard (Merlin, 2026-10-31, critical): the old
    // check only caught FULLY blank canvases. A sheet with 3 tiles
    // painted out of 1,296 passes the old check but renders as
    // near-black void on screen. Count painted samples — fewer
    // than 4 of 16 means the sheet is effectively void.
    const canvasIsBlank = () => {
      try {
        const w = canvas.width, h = canvas.height;
        // 4x4 grid of 1x1 samples — cheap, and centre-first
        // painting means a real build always touches the middle.
        let painted = 0;
        for (let gx = 1; gx <= 4; gx++) {
          for (let gy = 1; gy <= 4; gy++) {
            const d = ctx.getImageData(
              Math.floor((w * gx) / 5), Math.floor((h * gy) / 5), 1, 1).data;
            if (d[3] !== 0) painted += 1;
          }
        }
        return painted < 4;
      } catch {
        // getImageData threw: the canvas is tainted, which only
        // happens when cross-origin pixels WERE drawn — something
        // painted, so it is not blank. Never block on this.
        return false;
      }
    };
    const finish = () => {
      if (finished) return;
      finished = true;
      if (watchTimer) { clearTimeout(watchTimer); watchTimer = null; }
      if (texTimer) { clearTimeout(texTimer); texTimer = null; }
      tex.needsUpdate = true;
      if (gen !== bctx.genRef.current || !mgr.alive) {
        // Superseded (centre cleared) or unmounted: drop the sheet.
        bctx.remove(job.key);
      } else if (okCount > 0 && !canvasIsBlank()) {
        // Feather the rim into the globe: opaque through the
        // middle, gone at the edge — no hard matte ring.
        ctx.globalCompositeOperation = 'destination-in';
        const c = preset.canvasPx / 2;
        const grad = ctx.createRadialGradient(c, c, c * 0.68, c, c, c);
        grad.addColorStop(0, 'rgba(0,0,0,1)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, preset.canvasPx, preset.canvasPx);
        ctx.globalCompositeOperation = 'source-over';
        tex.needsUpdate = true;
        // The device record of rendered ground — this cell has
        // been mapped on this device, permanently (lens-cache.js).
        // The same build stages the same key for the server
        // record (rendered-tiles table), so a reload on any
        // device can rebuild it: the orbital overlook sheet is
        // not roaming ground and is never staged. Staged keys
        // ride the 30 s flush beat below; keys already on the
        // server (restored this load) or flushed this session
        // are never re-staged.
        const cellKey = tileCellKey(job.presetName, plan);
        recordRenderedTileKey(cellKey);
        if (cellKey && RENDERED_RECORD_PRESETS.includes(job.presetName)
          && !renderedServerKeysRef.current.has(cellKey)
          && !renderedSentRef.current.has(cellKey)
          && !renderedStageRef.current.some((t) => t.tile_key === cellKey)) {
          renderedStageRef.current.push({
            tile_key: cellKey, preset: job.presetName, center_lat: job.lat, center_lon: job.lon,
          });
        }
      } else {
        // Every tile failed, or the canvas went blank mid-build
        // (iOS memory pressure: drawImage no-ops without throwing).
        // Leave no black sheet behind and record nothing — the
        // coverage check then honestly reports bare ground, so the
        // 10 s reconciler retries, and the trail queue is free to
        // rebuild it when memory pressure eases.
        bctx.remove(job.key);
      }
      // Only the build that still owns the pool clears it: a
      // build invalidated mid-flight (stale-drop below) must
      // never clear the busy flag of the fresh build that
      // replaced it — its own finish only drops its sheet.
      if (mgr.job === job) { mgr.job = null; mgr.busy = false; }
      bctx.pump();
    };
    // Centre-first painting (2026-10-26, effective reveal): the
    // plan lists tiles row-major, which painted the north edge
    // first and the traveler's own ground halfway through the
    // build. Centre-first paints the ground under and around
    // the traveler in the first fetches — at any speed, the
    // nearest ground is the first ground.
    //
    // Centre-flush (2026-10-26, sharp-on-stop): the ground under
    // the traveler's feet sharpens the moment its tiles resolve,
    // instead of waiting out the 750 ms upload throttle. When
    // all CENTRE_FLUSH_TILES centre tiles have settled (loaded
    // or failed), the texture uploads at once, exactly once per
    // build. Later tiles still ride the throttle.
    const sortedTiles = sortTilesCenterFirst(plan.tiles, preset.canvasPx, S);
    let centreRemaining = Math.min(CENTRE_FLUSH_TILES, sortedTiles.length);
    let centreFlushed = false;
    const settleCentre = (idx) => {
      if (idx >= CENTRE_FLUSH_TILES || centreFlushed) return;
      centreRemaining -= 1;
      if (centreRemaining <= 0) {
        centreFlushed = true;
        tex.needsUpdate = true;
      }
    };
    // Metal tiling (Merlin, 2026-11-15): the sheet's skin is ONE
    // of the 9 scratched-metal graphics, picked deterministically
    // from the sheet's own tile cell key — the exact identity the
    // rendered record uses, so a tile keeps its color across
    // reloads and restore-on-load rebuilds it identically. The
    // tile SYSTEM is untouched: the same plan, the same
    // centre-first loop (each tile paints its own crop of the
    // one photo), the same settle/finish/record path. Only the
    // skin changed — no more ESRI photo fetches for this sheet.
    // The orbital overlook sheet flows through this same build,
    // so it wears metal too. No color is weighted; the pick is
    // FNV-1a(cellKey) mod 9 (lib/earth/metal-tiles.js).
    const metalColor = metalTileColorForCell(tileCellKey(job.presetName, plan));
    const metalUrl = metalColor ? metalTileImageUrl(metalColor) : null;
    if (!metalUrl) {
      // No skin to paint (no color for this cell — should never
      // happen, the pick is total over the 9 colors): drop the
      // sheet honestly, record nothing, free the pool. Same as
      // an all-tiles-failed build below.
      bctx.remove(job.key);
      if (mgr.job === job) { mgr.job = null; mgr.busy = false; }
      bctx.pump();
      return;
    }
    const metalImg = new Image();
    // No crossOrigin here, deliberately: the skin is a
    // same-origin repo file, so the canvas can never taint —
    // the blank-guard's getImageData always reads true pixels.
    // (The old ESRI tiles were cross-origin and needed it.)
    metalImg.onload = () => {
      if (gen !== bctx.genRef.current || !mgr.alive) { finish(); return; }
      // The skin arrived: paint the sheet from the ONE photo.
      // Each tile draws its own crop of the centered square
      // (metalTileCropForTile), so the whole photo spans the
      // sheet exactly once. A tile that fails to paint still
      // counts as settled (just not ok) — the 2026-10-27 rule:
      // a throwing drawImage must never strand the settle
      // count and wedge the pool.
      const imgW = metalImg.naturalWidth || METAL_TILE_IMAGE_WIDTH;
      const imgH = metalImg.naturalHeight || METAL_TILE_IMAGE_HEIGHT;
      sortedTiles.forEach((t, idx) => {
        // t.url is now only the pole test: lensTilePlan still
        // marks off-world (polar) tiles with url null, and those
        // canvas regions stay transparent — the globe shows
        // through exactly as it did under the photo tiles.
        if (!t.url) { settledCount += 1; settleCentre(idx); if (settledCount === plan.tiles.length) finish(); return; }
        let painted = false;
        if (gen === bctx.genRef.current && mgr.alive) {
          try {
            const col = Math.round(t.px / S);
            const row = Math.round(t.py / S);
            const crop = metalTileCropForTile(col, row, plan.grid, imgW, imgH);
            ctx.drawImage(metalImg, crop.sx, crop.sy, crop.sw, crop.sh, t.px, t.py, S, S);
            painted = true;
            queueTexUpload();
          } catch {}
        }
        if (painted) okCount += 1;
        settledCount += 1;
        settleCentre(idx);
        if (settledCount === plan.tiles.length) finish();
      });
    };
    metalImg.onerror = () => {
      // The skin never arrived: the same honest failure as
      // every photo tile failing — finish() with okCount 0
      // drops the sheet and records nothing, so the 10 s
      // reconciler retries instead of mounting a void.
      finish();
    };
    metalImg.src = metalUrl;
    // Watchdog: a build whose skin stalls (a hung load, a
    // canvas that never settles) must not hold the pool past
    // Merlin's ~1-minute lag tolerance. Force-finish:
    // whatever painted stays, the pool frees, the queue pumps,
    // and the next centre rebuilds. Never fires after a clean
    // finish (finished guard + timer cleared there).
    watchTimer = setTimeout(() => {
      if (!finished) finish();
    }, LENS_BUILD_WATCHDOG_MS);
  };

  // Drop a stale running build (2026-10-27, driving void): a
  // build whose centre the traveler has already left behind by
  // a full recenter step can only ever mount ground kilometres
  // behind the car, while blocking the pool for its whole
  // duration. Invalidating it frees the pool for a fresh build
  // at the current centre at once; the old build's in-flight
  // tiles stop painting on the gen check, and its finish only
  // drops its own sheet — it never clears the fresh build's
  // busy flag (finish owns the pool only while mgr.job is its
  // own job). Returns true when a build was dropped.
  const dropStaleBuild = (bctx, curLat, curLon, staleDeg) => {
    const mgr = bctx.mgrRef.current;
    const running = mgr.job;
    if (!mgr.busy || !running) return false;
    if (Math.abs(running.lat - curLat) <= staleDeg
      && Math.abs(running.lon - curLon) <= staleDeg) return false;
    bctx.genRef.current += 1;
    mgr.job = null;
    mgr.busy = false;
    return true;
  };

  useEffect(() => {
    if (!lensCenter || !heightReady) {
      // Leaving Earth / no focus: drop sheets AND any queued
      // build, and invalidate in-flight builds (their finish
      // disposes instead of mounting).
      lensGenRef.current += 1;
      lensBuildRef.current.pending = null;
      clearLensSheets();
      return undefined;
    }
    const mgr = lensBuildRef.current;
    const job = { key: centerKey, lat: lensCenter.lat, lon: lensCenter.lon, presetName };
    // Driving: the fine sheet is crossed in under a second at
    // vehicle speed, so starting builds for it would only churn
    // the serial queue and paint ground the traveler already
    // left. Queue the newest centre and let the far sheet carry
    // the ground; when driving ends this effect re-runs
    // (driving is a dep) and builds the latest centre at once.
    if (driving) { mgr.pending = job; return undefined; }
    if (mgr.busy) { mgr.pending = job; return undefined; }
    startLensBuild(job, NEAR_CTX);
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerKey, heightReady, driving]);

  // 15× reveal sheet (Merlin, 2026-10-26): a second, coarser
  // sheet centred ahead of the traveler, carrying photographic
  // ground out to 1350 display m. It has its own serial manager
  // so a slow near build never blocks it, and its own pool so
  // it never evicts a near sheet or vice versa. It only runs
  // while roaming; leaving street clears it (the orbit view
  // keeps its own overlook sheet, untouched).
  const farCenterKey = farCenter
    ? `streetFar:${farCenter.lat.toFixed(4)},${farCenter.lon.toFixed(4)}`
    : null;
  useEffect(() => {
    if (!roaming || !farCenter || !heightReady) {
      farLensGenRef.current += 1;
      farLensBuildRef.current.pending = null;
      clearFarSheets();
      return undefined;
    }
    const mgr = farLensBuildRef.current;
    const job = { key: farCenterKey, lat: farCenter.lat, lon: farCenter.lon, presetName: 'streetFar' };
    // Driving: same freeze as the fine sheet — a 1296-tile far
    // build started at boost can never finish before the car
    // leaves its disc, so starting them only churns the queue
    // while the coarse sheet carries the ground. Queue the
    // newest centre; when driving ends this effect re-runs
    // (driving is a dep) and builds the latest centre at once.
    if (driving) { mgr.pending = job; return undefined; }
    if (mgr.busy) {
      // A running build the car has already left behind by a
      // full recenter step is stale: drop it and start fresh
      // instead of mounting ground kilometres behind the car.
      const staleDeg = (LENS_PRESETS.streetFar.radiusUnits * 0.4) / HUB_UNITS_PER_DEGREE;
      if (dropStaleBuild(FAR_CTX, farCenter.lat, farCenter.lon, staleDeg)) {
        startLensBuild(job, FAR_CTX);
      } else {
        mgr.pending = job;
      }
      return undefined;
    }
    startLensBuild(job, FAR_CTX);
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farCenterKey, heightReady, roaming, driving]);

  // Coarse fallback sheet (2026-10-27, driving void): the
  // always-on photographic layer. It runs while roaming with
  // NO driving gate — it IS the driving layer — and its builds
  // are cheap enough (64 tiles) that dropping a stale one for a
  // fresh centre still leaves photographic ground under the car.
  //
  // 2026-10-27 (render queue): the coarse pool no longer builds
  // one centre at a time. Every recenter plans a TRAIL — ahead
  // of the traveler, then under them, then behind (lib/earth/
  // render-queue.js) — at the driving-doubled radius in a car,
  // drops the centres already rendered (dedup against the
  // render-side painted set + the in-session sheets), and
  // queues the rest most-ahead first. The serial pool drains
  // them one build at a time; a running build the traveler has
  // already left behind is dropped for the fresh queue head.
  // There is NO governor here by design (Merlin's correction):
  // nothing throttles or gates the drain beyond the pool's own
  // one-build-at-a-time law.
  const coarsePresetName = coarsePresetFor(driving);
  const coarseCenterKey = coarseCenter
    ? `${coarsePresetName}:${coarseCenter.lat.toFixed(4)},${coarseCenter.lon.toFixed(4)}`
    : null;
  useEffect(() => {
    if (!roaming || !coarseCenter || !heightReady) {
      coarseLensGenRef.current += 1;
      coarseLensBuildRef.current.pending = null;
      coarseLensBuildRef.current.queue = [];
      clearCoarseSheets();
      return undefined;
    }
    const mgr = coarseLensBuildRef.current;
    const radiusUnits = LENS_PRESETS[coarsePresetName].radiusUnits;
    // Trail plan for this recenter, minus anything already
    // rendered (painted record + mounted sheets + the running
    // build + the queue itself).
    const sessionCentres = [
      ...coarseSheetsRef.current.map((s) => ({ lat: s.lat, lon: s.lon })),
      ...(mgr.job ? [{ lat: mgr.job.lat, lon: mgr.job.lon }] : []),
      ...mgr.queue.map((j) => ({ lat: j.lat, lon: j.lon })),
    ];
    const trail = planTrailCentres({
      lat: coarseCenter.lat, lon: coarseCenter.lon,
      headingDeg: roamState.yawDeg, driving,
    });
    const fresh = filterUnrenderedCentres(trail, {
      renderedKeys: loadRenderedTileKeys(),
      sessionCentres,
    });
    // Queue hygiene first (drop what the traveler has left far
    // behind), then append the fresh centres, then re-rank the
    // whole queue most-ahead first and cap it — so the pool
    // always builds the furthest-forward unbuilt ground next.
    mgr.queue = pruneStaleQueue(mgr.queue, coarseCenter.lat, coarseCenter.lon, radiusUnits);
    for (const c of fresh) {
      const key = `${c.presetName}:${c.lat.toFixed(4)},${c.lon.toFixed(4)}`;
      if (mgr.job && mgr.job.key === key) continue;
      if (mgr.queue.some((j) => j.key === key)) continue;
      mgr.queue.push({ key, lat: c.lat, lon: c.lon, presetName: c.presetName });
    }
    mgr.queue = capTrailQueue(
      sortByAheadness(mgr.queue, coarseCenter.lat, coarseCenter.lon, roamState.yawDeg),
      coarseCenter.lat, coarseCenter.lon);
    if (mgr.busy) {
      const staleDeg = (radiusUnits * 0.4) / HUB_UNITS_PER_DEGREE;
      if (dropStaleBuild(COARSE_CTX, coarseCenter.lat, coarseCenter.lon, staleDeg)) {
        coarsePumpLensQueue();
      }
      return undefined;
    }
    coarsePumpLensQueue();
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coarseCenterKey, heightReady, roaming, driving]);

  // Rendered-tiles restore (2026-10-27, Merlin: tiles sent to
  // the server table render again on load). Once per mount, when
  // roaming with a real traveler position and the server fetch
  // settled: the fetched rows near the traveler become build
  // jobs — coarse jobs join the coarse queue (they drain through
  // its pump like trail centres, and the trail effect's own
  // prune/sort/cap laws still apply to them), near/far jobs
  // wait in per-pool restore lists that the pumps pick up only
  // while their pool is otherwise idle. Live ground always wins:
  // a recenter overwrites a pending live job, a stale restore
  // job is dropped by the pumps, and a running restore build
  // yields to the next live centre on finish. Mounted-sheet caps
  // (near 4 / far 2 / coarse 3) still bound what stays on screen;
  // the restore is the visible neighbourhood, not the archive.
  useEffect(() => {
    if (!roaming || !heightReady || !coarseCenter || !renderedServerLoaded) return undefined;
    if (restoreRef.current.done) return undefined;
    const rows = renderedServerRef.current;
    if (!rows || rows.length === 0) { restoreRef.current.done = true; return undefined; }
    restoreRef.current.done = true;
    const jobs = buildRestoreJobs(rows, { lat: roamState.lat, lon: roamState.lon });
    const coarseMgr = coarseLensBuildRef.current;
    for (const j of jobs) {
      if (j.pool === 'coarse') {
        if (coarseMgr.job && coarseMgr.job.key === j.key) continue;
        if (coarseMgr.queue.some((q) => q.key === j.key)) continue;
        coarseMgr.queue.push({ key: j.key, lat: j.lat, lon: j.lon, presetName: j.presetName });
      } else if (j.pool === 'far') {
        restoreRef.current.far.push(j);
      } else {
        restoreRef.current.near.push(j);
      }
    }
    coarsePumpLensQueue();
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roaming, heightReady, coarseCenter, renderedServerLoaded]);

  // Recovery reconciler (2026-10-27, render queue): the void in
  // Merlin's second video never healed — not on foot, not after
  // a second summon — because every recenter path assumed the
  // ground was coming and nothing ever re-checked. Every 10 s
  // while roaming, this asks what is ACTUALLY mounted under the
  // traveler across all three pools. If nothing covers the
  // position, it forces a fresh coarse build at the current
  // position, bypassing the rendered-record dedup: the record
  // saying "painted" must never overrule a bare screen. A
  // nearby running build is left alone (it is about to land);
  // only a stale one is dropped for the recovery job.
  useEffect(() => {
    if (!roaming) return undefined;
    const id = setInterval(() => {
      if (!roamState.active) return;
      // Visibility-aware coverage (Merlin, 2026-10-31, critical):
      // a sheet that is mounted but transparent/invisible (opacity
      // still fading in, or a black/blank sheet the guard missed)
      // must NOT count as coverage — the screen is what matters,
      // not the sheet record. Filter to sheets actually rendering.
      const isVisiblyMounted = (s) => {
        try {
          const m = s.mesh;
          if (!m || m.visible === false) return false;
          const op = m.material && typeof m.material.opacity === 'number'
            ? m.material.opacity : 1;
          return op > 0.1;
        } catch { return false; }
      };
      const nearSheets = sheetsRef.current.filter(isVisiblyMounted).map((s) => ({
        lat: s.lat, lon: s.lon, radiusUnits: LENS_PRESETS.street.radiusUnits,
      }));
      const farSheets = farSheetsRef.current.filter(isVisiblyMounted).map((s) => ({
        lat: s.lat, lon: s.lon, radiusUnits: LENS_PRESETS.streetFar.radiusUnits,
      }));
      const coarseSheets = coarseSheetsRef.current.filter(isVisiblyMounted).map((s) => {
        const preset = LENS_PRESETS[s.key.split(':')[0]];
        return {
          lat: s.lat, lon: s.lon,
          radiusUnits: preset ? preset.radiusUnits : LENS_PRESETS.streetCoarse.radiusUnits,
        };
      });
      if (!lacksMountedCoverage(roamState.lat, roamState.lon,
        [...nearSheets, ...farSheets, ...coarseSheets])) return;
      const mgr = coarseLensBuildRef.current;
      if (!mgr.alive) return;
      const presetName = coarsePresetFor(drivingRef.current);
      const radiusUnits = LENS_PRESETS[presetName].radiusUnits;
      const lat = roamState.lat;
      const lon = roamState.lon;
      if (mgr.busy) {
        const staleDeg = (radiusUnits * 0.4) / HUB_UNITS_PER_DEGREE;
        if (!dropStaleBuild(COARSE_CTX, lat, lon, staleDeg)) return;
      }
      const key = `${presetName}:${lat.toFixed(4)},${lon.toFixed(4)}`;
      if (mgr.job && mgr.job.key === key) return;
      mgr.queue = mgr.queue.filter((j) => j.key !== key);
      mgr.queue.unshift({ key, lat, lon, presetName });
      coarsePumpLensQueue();
    }, RENDER_QUEUE_RECONCILE_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roaming]);

  // Dispose all lens sheets on unmount.
  useEffect(() => () => {
    lensBuildRef.current.alive = false;
    lensBuildRef.current.pending = null;
    farLensBuildRef.current.alive = false;
    farLensBuildRef.current.pending = null;
    coarseLensBuildRef.current.alive = false;
    coarseLensBuildRef.current.pending = null;
    coarseLensBuildRef.current.queue = [];
    for (const s of sheetsRef.current) {
      s.mesh.geometry.dispose();
      s.mesh.material.map?.dispose();
      s.mesh.material.dispose();
    }
    sheetsRef.current = [];
    for (const s of farSheetsRef.current) {
      s.mesh.geometry.dispose();
      s.mesh.material.map?.dispose();
      s.mesh.material.dispose();
    }
    farSheetsRef.current = [];
    for (const s of coarseSheetsRef.current) {
      s.mesh.geometry.dispose();
      s.mesh.material.map?.dispose();
      s.mesh.material.dispose();
    }
    coarseSheetsRef.current = [];
  }, []);

  return (
    <group position={[0, -30, -80]}>
      <group ref={spinRef}>
        <group visible={!roaming}>
          <GoogleEarthTiles
            onSelect={onSelect}
            onGlobeClick={onGlobeClick}
            quatRef={quatRef}
            onActive={() => setLayer('photorealistic')}
            onInactive={() => setLayer('terrain')}
          />
        </group>
        {effectiveLayer === 'terrain' && <ProceduralEarthGlobe onSelect={onSelect} onGlobeClick={onGlobeClick} quatRef={quatRef} waterInOrbit={!roaming} flatTarget={roaming} />}
        {/* Jagged world-locked cracks over the orbit globe
            (2026-10-26 late night): the same crack field as the
            street plane, wrapped on the sphere — not lat/lon
            lines, not a grid. A separate overlay — the globe
            shader (and its orbit water illusion) is untouched,
            and it carries no click handlers, so globe clicks
            pass through. */}
        {effectiveLayer === 'terrain' && !roaming && <EarthOrbitCracks />}
        {/* Earth 1 simplification (2026-10-26): all placed 3D
            objects are staged off the scene — the full record
            lives in ~/workspace/earth1-staged-objects/inventory.json.
            Only the Redwater spawn farmstead remains, as journey
            dressing. Terrain, lens imagery, sky, ground, character
            and vehicles are untouched. */}
        {effectiveLayer === 'terrain' && <RedwaterFarmstead />}
        {/* VEHICLES ONLY (Merlin, 2026-11-15): the walker, the
            TRON bike, the Redwater journey mount, and the
            quicksand-pit marker are all gone — Earth 1 is
            vehicles only. The driver spawns in their vehicle
            (EarthSupercar) and stays in it. */}
        {/* The driver's vehicle — street only, Earth's fastest
            vehicle (Earth 1 expansion). The car itself stays
            grounded. */}
        {effectiveLayer === 'terrain' && roaming && <EarthSupercar controls={controls} />}
        {/* Mario Kart systems (Earth 1, 2026-11-15): torpedo
            orbs, heat-seeker torpedoes, rival drivers, bumper-
            car collisions, the explosion burst. Same street gate
            as the vehicle; renders nothing until the driver is
            mounted. */}
        {effectiveLayer === 'terrain' && roaming && <EarthKart />}
        {/* Ground-level boost pads for racers (Earth 1, 2026-11-15):
            light-up pads on a seeded grid across the planet —
            drivers pass over them for an extra speed boost. Same
            street gate as the vehicles; renders nothing while the
            driver is far from every pad. */}
        {effectiveLayer === 'terrain' && roaming && <EarthBoostPads />}
        {/* Passers-by (2026-10-26, see-each-other): other travelers
            on Earth 1 near you — their VEHICLE only (vehicles
            only since 2026-11-15, no on-foot figure). Same street
            gate as the vehicles; renders nothing and claims no
            count while presence is unavailable. */}
        {effectiveLayer === 'terrain' && roaming && <EarthPeers />}

        {effectiveLayer === 'terrain' && lensSheets.map((s) => (
          <primitive key={s.key} object={s.mesh} />
        ))}
        {/* Coarse fallback sheets: always-on photographic ground
            out to 1350 display m on foot, 2700 m in a car (the
            doubled driving radius, render queue 2026-10-27),
            drawn below the far sheets so finer detail always
            wins where it exists — the layer that keeps driving
            ground photographic instead of bare dark globe. */}
        {effectiveLayer === 'terrain' && coarseSheets.map((s) => (
          <primitive key={s.key} object={s.mesh} />
        ))}
        {/* 15× reveal sheets: coarser photographic ground out to
            1350 display m, drawn below the fine sheets so near
            detail always wins where the two overlap. */}
        {effectiveLayer === 'terrain' && farSheets.map((s) => (
          <primitive key={s.key} object={s.mesh} />
        ))}
        {/* Street-level detail ground + lantern fill: only on the
            terrain layer while roaming (walkthrough flaw 2026-10-17:
            the 160×120 globe's ~135 m facets read as broken shards
            from 1.62 m up). */}
        {effectiveLayer === 'terrain' && roaming && (
          <StreetGroundPatch center={patchCenter} />
        )}
        {/* Jagged world-locked cracks at street level
            (2026-10-26 late night): static fractures glowing
            faintly through the ground — the pattern is a pure
            function of planet-fixed direction, so the cracks
            stay put on the Earth while the car drives over
            them, plus a barely-there color-cycling glow light.
            One shader plane, never rebuilt — same street gate
            as the detail ground. */}
        {effectiveLayer === 'terrain' && roaming && <EarthCracks />}
        {effectiveLayer === 'terrain' && <StreetFillLight active={roaming} />}
        {/* Day sky dome at street level: blue during day, transparent at night.
            Uses sun direction to fade — day side gets blue sky, night side
            stays clear so stars show through. Replaces the atmosphere shell
            which saturates to white when the camera is inside it.
            The ONLY sky at street level: the old second sky for the
            removed second layer is gone with it. */}
        {effectiveLayer === 'terrain' && roaming && (
          <mesh scale={[1.5, 1.5, 1.5]}>
            <sphereGeometry args={[55, 32, 32]} />
            <shaderMaterial
              ref={skyMatRef}
              side={THREE.BackSide}
              transparent={true}
              depthWrite={false}
              uniforms={{
                sunDirection: { value: new THREE.Vector3(0, 150, 370).normalize() },
              }}
              vertexShader={`
                varying vec3 vWorldNormal;
                void main() {
                  vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
                  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
              `}
              fragmentShader={`
                uniform vec3 sunDirection;
                varying vec3 vWorldNormal;
                void main() {
                  float dayness = smoothstep(-0.1, 0.3, dot(normalize(vWorldNormal), sunDirection));
                  vec3 skyBlue = vec3(0.53, 0.81, 0.92);
                  // Skybox fallback (video QA V2-4 hardening,
                  // 2026-10-26): the sky never fades to fully
                  // transparent — at night it holds a deep blue
                  // floor instead of the void black behind the
                  // canvas, so a camera clip never reads as a
                  // solid black half-screen. The street camera's
                  // floor clamp (EarthFlightController) is the
                  // primary guard; this is the backstop.
                  vec3 nightBlue = vec3(0.04, 0.06, 0.15);
                  vec3 sky = mix(nightBlue, skyBlue, dayness);
                  gl_FragColor = vec4(sky, 0.35 + dayness * 0.6);
                }
              `}
            />
          </mesh>
        )}
      </group>

      {/* Atmosphere shell — hidden at street level (camera is inside it,
          additive blending saturates to white). Only for orbital view,
          and (round 4) only while the camera is outside its band: the
          group starts hidden and the frame loop shows it once the
          lens is clear, so ascents never flash white through it. */}
      {!roaming && (
      <group ref={shellRef} visible={false}>
      <mesh scale={[1.025, 1.025, 1.025]}>
        <sphereGeometry args={[55, 64, 64]} />
        <shaderMaterial
          blending={THREE.AdditiveBlending}
          side={THREE.BackSide}
          transparent={true}
          depthWrite={false}
          vertexShader={`
            varying vec3 vNormalWorld;
            void main() {
              vNormalWorld = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `}
          fragmentShader={`
            varying vec3 vNormalWorld;
            void main() {
              vec3 cameraDir = normalize(cameraPosition - vNormalWorld);
              float intensity = pow(0.6 - dot(normalize(vNormalWorld), cameraDir), 2.0);
              vec3 atmosphere = vec3(0.1, 0.4, 1.0) * intensity;
              gl_FragColor = vec4(atmosphere, 1.0) * (intensity * 1.5);
            }
          `}
        />
      </mesh>
      </group>
      )}
    </group>
  );
}
