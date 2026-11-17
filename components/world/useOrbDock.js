'use client';

// components/world/useOrbDock.js — the React wiring for the ONE shared
// orb dock (lib/world/orb-dock.js; Merlin, Nov 16 ~02:30 Hollow Earth,
// ~02:35 mirror order for Jupiter 2). Hollow Earth's page wires the
// same pure functions inline for its one cluster; Jupiter 2's orbs
// are spread across the stage (joystick bottom-left, JUMP
// bottom-right, SUMMON/DISMOUNT/TRADE top-left, SHOOT/BOOST
// bottom-right), so each orb drags INDIVIDUALLY through this hook —
// same functions, same key pattern, no second implementation.
//
// How it works (the Hollow Earth / backpack-icon pattern, per orb):
//   - positions are viewport fractions {x, y} of the STAGE's free
//     span (stage minus the orb's box), stored per orb in a map
//     { orbId: {x, y} } under one key per world —
//     `olympus:<world>:orb-dock:v1` (orbDockStorageKeyFor). One key
//     with per-world entries is NOT the pattern: Hollow Earth keeps
//     one key per world, and so does Jupiter 2.
//   - never dragged = no stored fraction = the orb renders its CSS
//     home slot (the defaults the caller passes — today's layout,
//     read off the stage, never invented), so the default tracks
//     the safe-area exactly. A stored spot renders as
//     left/top calc() fractions, so it scales with the stage and
//     survives resize/rotation with no measuring and no snap.
//   - press-and-move past 8 px turns the press into a drag — no
//     hold-to-lift timer; a press that never crosses the threshold
//     stays a TAP, so the orb still fires and a drag never fires
//     it. Pointer capture is taken only AFTER the threshold is
//     crossed (capturing at pointerdown would retarget the
//     pointerup and the orb's click would never fire), the grab
//     offset is kept, and the top-left is clamped live so the whole
//     orb stays on screen with an 8 px margin. The click that
//     follows a drag is swallowed (capture-phase + a 500 ms tap
//     guard the orb's onClick also checks, the backpack pattern),
//     and the drop spot persists: localStorage instantly,
//     /api/ui-state debounced when signed in, the account copy
//     winning on login. The route does NOT whitelist the
//     `<world>_orb_dock` keys yet, so the server copy is ignored
//     today and the device copy stands alone.
//   - drag-vs-tap for pointerdown-driven orbs (JUMP, BOOST hold,
//     the joystick): the hook calls handlers.onDragStart the moment
//     the threshold is crossed, so the caller can stand the action
//     down (JUMP clears its queued jump, BOOST releases its key,
//     the stick recentres). The orb's own pointerdown still fires
//     first — a tap never crosses the threshold, so a tap always
//     fires and a drag never does.
//
// Two hook instances, one key: the J2 page (JUMP) and the J2 scene
// (the rest) each hold an instance for 'jupiter-2'. That is safe by
// construction — the orb ids are disjoint across the two instances,
// and every save merges against a FRESH storage read, never against
// the instance's possibly-stale state, so one instance's drag can
// never clobber the other's newer save.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  loadOrbDockMap, saveOrbDockMap, resolveOrbDockMap,
  orbDockPxToFrac, dragOrbDockTopLeft,
  isOrbDockDrag, orbDockStorageKeyFor, orbDockUiStateKeyFor,
  orbDockFracRect, rectsOverlap, pushRectOutOfExclusions, pruneOrbDockMap,
} from '@/lib/world/orb-dock';

/** px side of an orb by id when the caller passes no size (orbs are square). */
const DEFAULT_ORB_SIDE_PX = 56;

// Exclusions (Merlin, Nov 16 — J2 overlap fix): stage-px rects a
// dock orb may never cover, e.g. another control's fixed home slot.
// The caller passes them in `options` alongside the stage size they
// were measured against — { stageSize: {w, h} | null, exclusions:
// [{x, y, w, h}] | null }. Callers that pass none keep today's
// behaviour exactly: the dock never knew about other controls, and
// a dragged orb could park on top of one (Jupiter 2's SUMMON and
// DISMOUNT were both found sitting on the backpack's home slot).
// Enforcement is threefold: the rendered spot falls back to its CSS
// home when the stored spot would cover an exclusion; a prune
// effect drops such stored spots (a bad saved position is
// corrected, not kept); and a live drag slides along an exclusion's
// edge instead of parking on it.
export function useOrbDock(world, sizes = {}, options = {}) {
  const storageKey = orbDockStorageKeyFor(world);
  const uiStateKey = orbDockUiStateKeyFor(world);
  const [map, setMap] = useState(() => loadOrbDockMap(undefined, storageKey));
  const mapRef = useRef(map);
  mapRef.current = map;
  const sizesRef = useRef(sizes);
  sizesRef.current = sizes;
  // Latest stage size + exclusions, for the drag closures (which
  // must never read a stale render's props).
  const stageSizeRef = useRef(options.stageSize || null);
  stageSizeRef.current = options.stageSize || null;
  const exclusionsRef = useRef(options.exclusions || null);
  exclusionsRef.current = options.exclusions || null;
  const draggingRef = useRef(null); // orb id mid-drag, or null
  const suppressUntilRef = useRef(0); // Date.now() ms — clicks before this are a drag's
  const saveTimerRef = useRef(null);

  const sideFor = useCallback((id) => (sizesRef.current && sizesRef.current[id]) || DEFAULT_ORB_SIDE_PX, []);

  // Persist a whole map: localStorage instantly, /api/ui-state
  // debounced when signed in (the Hollow Earth persistDock shape).
  const persist = useCallback((nextMap) => {
    saveOrbDockMap(nextMap, undefined, storageKey);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      let token = null;
      try {
        const { supabase } = await import('@/lib/supabase');
        const { data: { session } } = await supabase.auth.getSession();
        token = session && session.access_token ? session.access_token : null;
      } catch { /* signed out: localStorage only */ }
      if (!token) return;
      try {
        await fetch('/api/ui-state', {
          method: 'POST',
          headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ preferences: { [uiStateKey]: nextMap } }),
        });
      } catch { /* offline — localStorage already holds it; next drag retries */ }
    }, 800);
  }, [storageKey, uiStateKey]);

  // Hydrate: localStorage instantly (the useState initializer); the
  // account copy wins when signed in (same precedence as Hollow
  // Earth and the backpack icon).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let token = null;
      try {
        const { supabase } = await import('@/lib/supabase');
        const { data: { session } } = await supabase.auth.getSession();
        token = session && session.access_token ? session.access_token : null;
      } catch { /* signed out: device copy stands */ }
      if (!token || cancelled) return;
      try {
        const res = await fetch('/api/ui-state', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        const data = await res.json().catch(() => null);
        const server = resolveOrbDockMap({ server: data && data.preferences ? data.preferences[uiStateKey] : null });
        if (!cancelled && Object.keys(server).length > 0) {
          // The account copy wins — but a stored spot covering an
          // exclusion is still a bad spot, so it is pruned here
          // too (the prune effect above re-runs on the next
          // measurement either way).
          const stageSize = stageSizeRef.current;
          const exclusions = exclusionsRef.current;
          const clean = stageSize && exclusions && exclusions.length > 0
            ? pruneOrbDockMap(server, exclusions, stageSize.w, stageSize.h, sizesRef.current)
            : server;
          mapRef.current = clean;
          setMap(clean);
          saveOrbDockMap(clean, undefined, storageKey);
        }
      } catch { /* offline — the device copy stands */ }
    })();
    return () => {
      cancelled = true;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // True while the click after a drag is still a drag's click, not a tap.
  const tapGuard = useCallback(() => Date.now() < suppressUntilRef.current, []);

  // Prune stored spots that cover an exclusion (a bad saved position
  // is corrected — the orb falls back to its CSS home). Runs when the
  // stage is first measured and whenever the exclusions change, and
  // after the account copy hydrates. Never loops: it only fires on
  // [stageSize, exclusions] change, and it only writes when a spot
  // was actually dropped.
  useEffect(() => {
    const stageSize = options.stageSize;
    const exclusions = options.exclusions;
    if (!stageSize || !exclusions || exclusions.length === 0) return undefined;
    const pruned = pruneOrbDockMap(mapRef.current, exclusions, stageSize.w, stageSize.h, sizesRef.current);
    if (Object.keys(pruned).length !== Object.keys(mapRef.current).length) {
      mapRef.current = pruned;
      setMap(pruned);
      persist(pruned);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.stageSize, options.exclusions]);

  // The rendered spot for one orb: a stored spot as left/top calc()
  // fractions (scales with the stage, no measuring), else the
  // caller's CSS home slot (today's layout). A stored spot that
  // would cover an exclusion never renders there — it falls back
  // to the home slot instead, even before the prune effect runs.
  const styleFor = useCallback((id, defaults) => {
    const frac = map[id];
    if (!frac) return { position: 'absolute', ...defaults, zIndex: 6, cursor: 'grab' };
    const s = sideFor(id);
    const stageSize = stageSizeRef.current;
    const exclusions = exclusionsRef.current;
    if (stageSize && exclusions && exclusions.length > 0) {
      const rect = orbDockFracRect(frac, stageSize.w, stageSize.h, s);
      if (exclusions.some((ex) => rectsOverlap(rect, ex, 0))) {
        return { position: 'absolute', ...defaults, zIndex: 6, cursor: 'grab' };
      }
    }
    return {
      position: 'absolute',
      left: `calc(${frac.x} * (100% - ${s}px))`,
      top: `calc(${frac.y} * (100% - ${s}px))`,
      zIndex: 6,
      cursor: 'grab',
    };
  }, [map, sideFor]);

  // Drag wiring for one orb. handlers: onPointerDown (the orb's own
  // press action — chained first), onDragStart (called the moment
  // the press becomes a drag — stand the press action down),
  // onDragEnd (called after the drop persists).
  const bind = useCallback((id, handlers = {}) => {
    const onPointerDown = (e) => {
      if (e.isPrimary === false) return;
      if (e.button != null && e.button !== 0) return;
      if (handlers.onPointerDown) handlers.onPointerDown(e);
      const el = e.currentTarget;
      const s = sideFor(id);
      const parent = el.offsetParent || el.parentElement;
      const parentRect = parent ? parent.getBoundingClientRect() : { left: 0, top: 0 };
      const r = el.getBoundingClientRect();
      const vw = parent ? parent.clientWidth : window.innerWidth;
      const vh = parent ? parent.clientHeight : window.innerHeight;
      const info = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        origX: r.left - parentRect.left,
        origY: r.top - parentRect.top,
        x: r.left - parentRect.left,
        y: r.top - parentRect.top,
        moved: false,
        captured: false,
      };
      const onMove = (ev) => {
        if (ev.pointerId !== info.pointerId) return;
        if (!info.moved && !isOrbDockDrag(ev.clientX - info.startX, ev.clientY - info.startY)) return; // still a tap
        if (!info.moved) {
          info.moved = true;
          draggingRef.current = id;
          try { el.setPointerCapture(ev.pointerId); info.captured = true; } catch { /* no capture — window listeners still track */ }
          // Switch from the default (right/bottom) anchoring to
          // left/top before the first move, or the orb jumps.
          el.style.right = 'auto';
          el.style.bottom = 'auto';
          el.style.cursor = 'grabbing';
          if (handlers.onDragStart) handlers.onDragStart(ev);
        }
        const tl = dragOrbDockTopLeft(
          { x: info.origX, y: info.origY },
          { x: info.startX, y: info.startY },
          { x: ev.clientX, y: ev.clientY },
          vw, vh, s, s,
        );
        // An exclusion (another control's fixed slot) slides the orb
        // along its edge instead of letting it park on top: the
        // dropped spot is already valid, so it always persists.
        const excl = exclusionsRef.current;
        const spot = excl && excl.length > 0
          ? pushRectOutOfExclusions({ x: tl.x, y: tl.y, w: s, h: s }, excl, vw, vh)
          : tl;
        info.x = spot.x;
        info.y = spot.y;
        el.style.left = `${spot.x}px`;
        el.style.top = `${spot.y}px`;
      };
      const onUp = (ev) => {
        if (ev.pointerId !== info.pointerId) return;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        if (info.captured) { try { el.releasePointerCapture(info.pointerId); } catch { /* noop */ } }
        el.style.cursor = '';
        if (!info.moved) return; // plain tap — the orb's click handler runs
        draggingRef.current = null;
        suppressUntilRef.current = Date.now() + 500;
        const next = orbDockPxToFrac({ x: info.x, y: info.y }, vw, vh, s, s);
        // Merge against a FRESH storage read: the page and the
        // scene each hold an instance, and a drag here must never
        // clobber the other instance's newer save.
        const nextMap = { ...loadOrbDockMap(undefined, storageKey), [id]: next };
        mapRef.current = nextMap;
        setMap(nextMap);
        persist(nextMap);
        if (handlers.onDragEnd) handlers.onDragEnd(ev);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    };
    const onClickCapture = (e) => {
      if (tapGuard()) {
        e.stopPropagation();
        e.preventDefault();
      }
    };
    return { onPointerDown, onClickCapture };
  }, [persist, sideFor, storageKey, tapGuard]);

  // Forget one orb's stored spot (back to its CSS home slot).
  const resetOrb = useCallback((id) => {
    const nextMap = { ...loadOrbDockMap(undefined, storageKey) };
    delete nextMap[id];
    mapRef.current = nextMap;
    setMap(nextMap);
    persist(nextMap);
  }, [persist, storageKey]);

  return { styleFor, bind, tapGuard, draggingRef, resetOrb, map };
}

export default useOrbDock;
