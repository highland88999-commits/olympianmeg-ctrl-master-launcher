// components/prime/PrimeChart.jsx — the Prime map canvas.
//
// Canvas 2D, DPR capped at 2, debounced resize, dirty-only rendering. Pan by
// drag, zoom by wheel/pinch/buttons, tap a destination to select it. At low
// zoom the chart shows constellation clusters; diving in resolves individual
// satellite nodes (declutter by design). Respects prefers-reduced-motion:
// camera moves are instant, no idle animation.
//
// Zero external requests. The chart itself is the interface — no legend
// chrome: tapping a cluster opens its member list in the destination sheet.

'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import {
  mulberry32,
  hashString,
  screenToWorld,
  worldToScreen,
  hitTest,
  initialCamera,
  CLUSTER_BREAKOVER_ZOOM,
  ZOOM_MIN,
  ZOOM_MAX,
} from '@/lib/prime-chart';

const BG = '#060609';

// How many pixels a node label needs of vertical room; labels are drawn for
// in-view nodes only and clipped to the viewport.
const LABEL_ZOOM_FLOOR = 0.8;

function reducedMotion() {
  try {
    return (
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  } catch {
    return false;
  }
}

const PrimeChart = forwardRef(function PrimeChart(
  { chart, selectedKey, pinnedKeys = [], onTapNode, onTapCluster, onTapEmpty, onCameraSettle },
  ref
) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  // Camera: current rendered, target desired. rAF eases current -> target
  // unless reduced motion is on, in which case they snap together.
  const cam = useRef(null);
  const camTarget = useRef(null);
  const dirty = useRef(true);
  const animating = useRef(false);
  const starsRef = useRef(null);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const pointers = useRef(new Map());
  const pinch = useRef(null);
  const gesture = useRef(null); // { x, y, moved, startT, pointerCount }
  const handlersRef = useRef({ onTapNode, onTapCluster, onTapEmpty, onCameraSettle });
  const stateRef = useRef({ chart, selectedKey, pinnedKeys });
  const rmRef = useRef(false);
  const settleTimer = useRef(null);

  handlersRef.current = { onTapNode, onTapCluster, onTapEmpty, onCameraSettle };
  stateRef.current = { chart, selectedKey, pinnedKeys };

  const markDirty = () => {
    dirty.current = true;
  };

  // Imperative API used by the page (search results, reset, +/- buttons).
  useImperativeHandle(ref, () => ({
    focusOn(x, y, zoom, opts = {}) {
      const t = camTarget.current;
      t.x = x;
      t.y = y;
      t.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom));
      if (opts.instant || rmRef.current) {
        cam.current.x = t.x;
        cam.current.y = t.y;
        cam.current.zoom = t.zoom;
      } else {
        startAnim();
      }
      markDirty();
    },
    zoomBy(factor) {
      const t = camTarget.current;
      const nz = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, t.zoom * factor));
      if (nz === t.zoom) return;
      t.zoom = nz;
      if (rmRef.current) cam.current.zoom = nz;
      else startAnim();
      markDirty();
    },
    getCamera() {
      return { ...camTarget.current };
    },
    resetView() {
      // Handled by the page: it calls focusOn with the initial camera.
    },
  }));

  const startAnim = () => {
    if (animating.current || rmRef.current) return;
    animating.current = true;
    const step = () => {
      const c = cam.current;
      const t = camTarget.current;
      const k = 0.18;
      c.x += (t.x - c.x) * k;
      c.y += (t.y - c.y) * k;
      c.zoom += (t.zoom - c.zoom) * k;
      markDirty();
      const done =
        Math.abs(t.x - c.x) < 0.5 &&
        Math.abs(t.y - c.y) < 0.5 &&
        Math.abs(t.zoom - c.zoom) < 0.002;
      if (done) {
        c.x = t.x;
        c.y = t.y;
        c.zoom = t.zoom;
        animating.current = false;
        scheduleSettle();
      } else {
        requestAnimationFrame(step);
      }
    };
    requestAnimationFrame(step);
  };

  const scheduleSettle = () => {
    // Debounce: persist the viewport only after the camera has rested.
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      const h = handlersRef.current.onCameraSettle;
      if (h) h({ ...camTarget.current });
    }, 700);
  };

  const render = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { w, h, dpr } = sizeRef.current;
    if (w === 0 || h === 0) return;
    const ctx = canvas.getContext('2d');
    const c = cam.current;
    const { chart: ch, selectedKey: sel, pinnedKeys: pins } = stateRef.current;
    const pinned = new Set(pins);

    ctx.save();
    ctx.scale(dpr, dpr);
    // Background.
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, w, h);

    // Starfield (seeded, static — computed once per chart).
    const stars = starsRef.current || [];
    ctx.fillStyle = '#ffffff';
    for (const s of stars) {
      const p = worldToScreen(s.x, s.y, c, w, h);
      if (p.x < -4 || p.y < -4 || p.x > w + 4 || p.y > h + 4) continue;
      ctx.globalAlpha = s.a;
      ctx.fillRect(p.x, p.y, s.r, s.r);
    }
    ctx.globalAlpha = 1;

    const zoom = c.zoom;
    const nodeAlpha = Math.max(0, Math.min(1, (zoom - 0.32) / (CLUSTER_BREAKOVER_ZOOM - 0.32)));
    const clusterAlpha = 1 - Math.max(0, Math.min(1, (zoom - 0.42) / (CLUSTER_BREAKOVER_ZOOM - 0.42)));

    // Clusters: soft halo + label. Glow is localized to the selected cluster.
    if (clusterAlpha > 0.01) {
      ctx.textAlign = 'center';
      for (const cl of ch.clusters) {
        const p = worldToScreen(cl.x, cl.y, c, w, h);
        if (p.x < -260 || p.y < -160 || p.x > w + 260 || p.y > h + 160) continue;
        const isClusterSelected = sel && cl.nodes.some((n) => n.key === sel);
        const haloR = Math.max(48, 120 * zoom);
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, haloR);
        grad.addColorStop(0, hexA(cl.hue, 0.16 * clusterAlpha));
        grad.addColorStop(1, hexA(cl.hue, 0));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, haloR, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = clusterAlpha;
        ctx.fillStyle = isClusterSelected ? '#ffffff' : hexA(cl.hue, 0.9);
        ctx.beginPath();
        ctx.arc(p.x, p.y, isClusterSelected ? 7 : 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillText(cl.constellation, p.x, p.y + 22);
        ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.fillText(`${cl.count} destinations`, p.x, p.y + 38);
        ctx.globalAlpha = 1;
      }
    }

    // Satellite nodes.
    if (nodeAlpha > 0.01) {
      ctx.textAlign = 'center';
      for (const cl of ch.clusters) {
        for (const n of cl.nodes) {
          const p = worldToScreen(n.x, n.y, c, w, h);
          if (p.x < -60 || p.y < -60 || p.x > w + 60 || p.y > h + 60) continue;
          const isSel = sel === n.key;
          const isPinned = pinned.has(n.key);

          if (isSel) {
            const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 30);
            g.addColorStop(0, 'rgba(255,255,255,0.35)');
            g.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 30, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.85)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
            ctx.stroke();
          }

          ctx.globalAlpha = nodeAlpha;
          ctx.fillStyle = isSel ? '#ffffff' : hexA(cl.hue, 0.85);
          ctx.beginPath();
          ctx.arc(p.x, p.y, isSel ? 5 : 3.5, 0, Math.PI * 2);
          ctx.fill();

          if (isPinned && !isSel) {
            ctx.strokeStyle = 'rgba(255,215,0,0.75)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.globalAlpha = 1;

          if (zoom >= LABEL_ZOOM_FLOOR && (isSel || nodeAlpha > 0.6)) {
            ctx.font = '500 11px ui-sans-serif, system-ui, sans-serif';
            ctx.fillStyle = isSel ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.6)';
            ctx.fillText(n.name.toUpperCase(), p.x, p.y + 20);
          }
        }
      }
    }

    ctx.restore();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    rmRef.current = reducedMotion();
    const { chart: ch } = stateRef.current;

    // Initial camera: full chart fit.
    const fitZoom = () => {
      const rect = wrap.getBoundingClientRect();
      return rect;
    };
    let rect = fitZoom();
    const init = initialCamera(ch, rect.width, rect.height);
    cam.current = { ...init };
    camTarget.current = { ...init };

    // Seeded static starfield across the chart extent.
    const rng = mulberry32(hashString('prime-stars'));
    const stars = [];
    for (let i = 0; i < 260; i++) {
      stars.push({
        x: (rng() - 0.5) * 7200,
        y: (rng() - 0.5) * 7200,
        a: 0.08 + rng() * 0.32,
        r: rng() < 0.12 ? 2 : 1,
      });
    }
    starsRef.current = stars;

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      sizeRef.current = { w: r.width, h: r.height, dpr };
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      canvas.style.width = `${r.width}px`;
      canvas.style.height = `${r.height}px`;
      markDirty();
    };
    let resizeT = null;
    const onResize = () => {
      if (resizeT) clearTimeout(resizeT);
      resizeT = setTimeout(resize, 120); // debounced
    };
    resize();
    window.addEventListener('resize', onResize);

    // Idle render loop: draws only when dirty, so the map costs nothing at rest.
    let raf = 0;
    const loop = () => {
      if (dirty.current) {
        dirty.current = false;
        render();
      }
      raf = requestAnimationFrame(loop);
    };
    loop();

    // --- gestures ---
    const toLocal = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const onPointerDown = (e) => {
      canvas.setPointerCapture?.(e.pointerId);
      pointers.current.set(e.pointerId, toLocal(e));
      if (pointers.current.size === 2) {
        const [a, b] = [...pointers.current.values()];
        pinch.current = { dist: dist(a, b), zoom: camTarget.current.zoom };
      } else {
        gesture.current = {
          x: e.clientX,
          y: e.clientY,
          moved: 0,
          startT: performance.now(),
        };
      }
      markDirty();
    };

    const onPointerMove = (e) => {
      if (!pointers.current.has(e.pointerId)) return;
      const prev = pointers.current.get(e.pointerId);
      const cur = toLocal(e);
      pointers.current.set(e.pointerId, cur);
      const t = camTarget.current;

      if (pointers.current.size === 2 && pinch.current) {
        const [a, b] = [...pointers.current.values()];
        const d = dist(a, b);
        if (d > 0 && pinch.current.dist > 0) {
          const nz = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, pinch.current.zoom * (d / pinch.current.dist)));
          t.zoom = nz;
          if (rmRef.current) cam.current.zoom = nz;
        }
        markDirty();
        return;
      }

      const dx = cur.x - prev.x;
      const dy = cur.y - prev.y;
      const g = gesture.current;
      if (g) g.moved += Math.abs(e.clientX - g.x) + Math.abs(e.clientY - g.y);
      // Drag: pan the camera (screen delta -> world delta).
      t.x -= dx / t.zoom;
      t.y -= dy / t.zoom;
      if (rmRef.current) {
        cam.current.x = t.x;
        cam.current.y = t.y;
      } else if (!animating.current) {
        cam.current.x = t.x;
        cam.current.y = t.y;
      }
      markDirty();
    };

    const endPointer = (e) => {
      const wasTap =
        gesture.current &&
        pointers.current.size === 1 &&
        gesture.current.moved < 10 &&
        performance.now() - gesture.current.startT < 500;
      pointers.current.delete(e.pointerId);
      pinch.current = null;
      if (pointers.current.size === 0) {
        if (wasTap) handleTap(e);
        gesture.current = null;
        scheduleSettle();
      }
      markDirty();
    };

    const handleTap = (e) => {
      const { w, h } = sizeRef.current;
      const pt = toLocal(e);
      const world = screenToWorld(pt.x, pt.y, camTarget.current, w, h);
      const hit = hitTest(stateRef.current.chart, world.x, world.y, camTarget.current);
      const hh = handlersRef.current;
      if (!hit) {
        if (hh.onTapEmpty) hh.onTapEmpty();
      } else if (hit.kind === 'node') {
        if (hh.onTapNode) hh.onTapNode(hit.node);
      } else if (hh.onTapCluster) {
        hh.onTapCluster(hit.cluster);
      }
    };

    const onWheel = (e) => {
      e.preventDefault();
      const t = camTarget.current;
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const nz = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, t.zoom * factor));
      if (nz === t.zoom) return;
      t.zoom = nz;
      if (rmRef.current) {
        cam.current.zoom = nz;
      } else {
        startAnim();
      }
      markDirty();
    };

    const onKeyDown = (e) => {
      const t = camTarget.current;
      const step = 220 / t.zoom;
      let handled = true;
      switch (e.key) {
        case 'ArrowLeft': t.x -= step; break;
        case 'ArrowRight': t.x += step; break;
        case 'ArrowUp': t.y -= step; break;
        case 'ArrowDown': t.y += step; break;
        case '+':
        case '=': t.zoom = Math.min(ZOOM_MAX, t.zoom * 1.2); break;
        case '-':
        case '_': t.zoom = Math.max(ZOOM_MIN, t.zoom / 1.2); break;
        default: handled = false;
      }
      if (!handled) return;
      e.preventDefault();
      if (rmRef.current) {
        cam.current.x = t.x;
        cam.current.y = t.y;
        cam.current.zoom = t.zoom;
      }
      markDirty();
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('keydown', onKeyDown);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      if (resizeT) clearTimeout(resizeT);
      if (settleTimer.current) clearTimeout(settleTimer.current);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', endPointer);
      canvas.removeEventListener('pointercancel', endPointer);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('keydown', onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-render when selection or pins change.
  useEffect(() => {
    markDirty();
  }, [selectedKey, pinnedKeys, chart]);

  return (
    <div ref={wrapRef} className="prime-chart-wrap">
      <canvas
        ref={canvasRef}
        role="img"
        tabIndex={0}
        aria-label="Prime star chart: every destination in the launcher as a node. Drag to pan, scroll or pinch to zoom, arrow keys work too."
        className="prime-chart-canvas"
      />
    </div>
  );
});

export default PrimeChart;

// --- helpers (also exported for tests) ---------------------------------------

export function hexA(hex, alpha) {
  const h = String(hex).replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export { initialCamera };
