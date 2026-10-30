// app/prime/page.jsx
// PRIME — the launcher's navigator. "Google Maps on steroids" for the Nexus
// universe: a zoomable, explorable star chart where every satellite is a
// destination. Pan, zoom, tap a node, and travel.
//
// Honesty: the chart is procedural and deterministic (lib/prime-chart.js) —
// it always works offline and never claims to be live. The map is the
// interface: panels stay out of the way until needed.
//
// Music-bar boundary: everything on this page clears the persistent radio
// bar via --player-clear (bar height + env(safe-area-inset-bottom)); the
// bar itself sits above Safari's chrome. Fixed controls use the same token.
// Account-mapped: viewport, pins, and recents persist per account
// (lib/prime-state.js) and never leak across accounts.

'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BackButton } from '@/components/ui';
import { SATELLITES } from '@/lib/i18n/satellites';
import { fx } from '@/lib/fx';
import { useVortexTravel } from '@/components/VortexTravel';
import {
  buildChart,
  searchChart,
  initialCamera,
} from '@/lib/prime-chart';
import {
  loadState,
  saveState,
  togglePin,
  recordVisit,
  withCamera,
  sanitizeState,
  resolveAccountId,
  subscribeAccountChanges,
} from '@/lib/prime-state';
import { supabase } from '@/lib/supabase';

// The canvas module touches window at import-adjacent time only inside
// effects, but dynamic(ssr:false) keeps the server bundle clean anyway.
const PrimeChart = dynamic(() => import('@/components/prime/PrimeChart'), {
  ssr: false,
  loading: () => (
    <div className="prime-loading" aria-label="Chart loading">
      <span className="prime-loading-ic"><Glyph size={24}>{IC.compass}</Glyph></span>
      Charting the universe…
    </div>
  ),
});

function Glyph({ size = 15, children }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ flexShrink: 0 }}>{children}</svg>
  );
}

const IC = {
  compass: <><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2 5-5 2 2-5z" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  reset: <><circle cx="12" cy="12" r="7" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /></>,
  arrow: <path d="M5 12h14m0 0l-6-6m6 6l-6 6" />,
  star: <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  video: <><rect x="3" y="6" width="13" height="12" rx="2" /><path d="M16 10l5-3v10l-5-3" /></>,
};

const CSS = `
.prime-root {
  --player-clear: calc(72px + env(safe-area-inset-bottom));
  min-height: 100dvh;
  background: #060609;
  color: #f4f4f5;
  font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
}
.prime-main {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 0 calc(var(--player-clear) + 56px);
}
.prime-topbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  position: sticky;
  top: 0;
  z-index: 30;
  background: rgba(6, 6, 9, 0.92);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
}
.prime-back {
  min-height: 44px;
  min-width: 44px;
  padding: 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 10px;
  background: transparent;
  color: #d4d4d8;
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  white-space: nowrap;
}
.prime-back:hover { border-color: rgba(255, 255, 255, 0.35); color: #fff; }
.prime-back:focus-visible { outline: 2px solid #7dd3fc; outline-offset: 2px; }
.prime-title { line-height: 1.2; flex: 0 0 auto; }
.prime-title h1 {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 800;
  letter-spacing: 0.32em;
  color: #fff;
}
.prime-title p {
  margin: 2px 0 0;
  font-size: 0.68rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #71717a;
}
.prime-search-wrap { position: relative; flex: 1; min-width: 0; }
.prime-search {
  width: 100%;
  min-height: 44px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  color: #fff;
  padding: 10px 14px;
  font-size: 0.95rem;
}
.prime-search::placeholder { color: #52525b; }
.prime-search:focus {
  outline: none;
  border-color: rgba(125, 211, 252, 0.6);
  box-shadow: 0 0 0 1px rgba(125, 211, 252, 0.3);
}
.prime-results {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  z-index: 40;
  max-height: 46dvh;
  overflow-y: auto;
  background: rgba(10, 10, 14, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 14px;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.6);
  padding: 6px;
}
.prime-result-group {
  font-size: 0.65rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: #71717a;
  padding: 10px 12px 4px;
}
.prime-result-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  text-align: left;
  background: transparent;
  border: none;
  border-radius: 10px;
  padding: 11px 12px;
  color: #e4e4e7;
  font-size: 0.92rem;
  cursor: pointer;
  min-height: 44px;
}
.prime-result-row:hover { background: rgba(255, 255, 255, 0.06); }
.prime-result-row:focus-visible { outline: 2px solid #7dd3fc; outline-offset: -2px; }
.prime-result-dot {
  width: 8px; height: 8px; border-radius: 50%; flex: 0 0 auto;
}
.prime-result-sub {
  display: block;
  font-size: 0.72rem;
  color: #71717a;
  margin-top: 2px;
}
.prime-map-section {
  position: relative;
  margin: 0 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  overflow: hidden;
  background: #060609;
}
.prime-chart-wrap { height: calc(100dvh - 196px); min-height: 340px; }
.prime-chart-canvas {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
  cursor: grab;
}
.prime-chart-canvas:active { cursor: grabbing; }
.prime-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-size: 0.75rem;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: #71717a;
}
.prime-status {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  max-width: calc(100% - 32px);
  background: rgba(6, 6, 9, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  padding: 8px 18px;
  font-size: 0.75rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #d4d4d8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 1;
  transition: opacity 0.35s ease;
  pointer-events: none;
}
.prime-status-hidden { opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .prime-status { transition: none; }
}
.prime-zoom {
  position: absolute;
  right: 12px;
  bottom: 12px;
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.prime-zoom button {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(6, 6, 9, 0.85);
  color: #e4e4e7;
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.prime-zoom button:hover { border-color: rgba(255, 255, 255, 0.4); }
.prime-zoom button:focus-visible { outline: 2px solid #7dd3fc; outline-offset: 2px; }
.prime-zoom .prime-zoom-reset { font-size: 0.95rem; }
.prime-about {
  margin: 22px auto 0;
  padding: 0 20px;
  max-width: 640px;
  text-align: center;
}
.prime-about p {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.7;
  color: #71717a;
}
.prime-foot {
  margin-top: 28px;
  text-align: center;
}
.prime-foot a {
  color: #52525b;
  font-size: 0.8rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  text-decoration: none;
  padding: 12px;
}
.prime-foot a:hover { color: #a1a1aa; }
/* Destination sheet: one clear primary action, pinned above the music bar. */
.prime-sheet {
  position: fixed;
  left: 12px;
  right: 12px;
  bottom: calc(var(--player-clear) + 12px);
  z-index: 50;
  max-width: 480px;
  margin: 0 auto;
  background: rgba(10, 10, 15, 0.97);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 18px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.65);
  padding: 18px 18px 16px;
  max-height: 52dvh;
  overflow-y: auto;
}
.prime-sheet-head { display: flex; align-items: flex-start; gap: 12px; }
.prime-sheet-dot {
  width: 12px; height: 12px; border-radius: 50%; margin-top: 4px; flex: 0 0 auto;
}
.prime-sheet-title { flex: 1; min-width: 0; }
.prime-sheet-title h2 {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: #fff;
}
.prime-sheet-title p {
  margin: 4px 0 0;
  font-size: 0.72rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #71717a;
}
.prime-sheet-close {
  min-width: 44px; min-height: 44px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 10px;
  background: transparent;
  color: #a1a1aa;
  font-size: 1.2rem;
  cursor: pointer;
  flex: 0 0 auto;
}
.prime-sheet-close:hover { color: #fff; border-color: rgba(255, 255, 255, 0.35); }
.prime-sheet-close:focus-visible { outline: 2px solid #7dd3fc; outline-offset: 2px; }
.prime-sheet-blurb {
  margin: 10px 0 0;
  font-size: 0.9rem;
  line-height: 1.6;
  color: #a1a1aa;
}
.prime-sheet-actions {
  display: flex;
  gap: 10px;
  margin-top: 16px;
}
.prime-travel {
  flex: 1;
  min-height: 48px;
  border: none;
  border-radius: 12px;
  background: #f4f4f5;
  color: #09090b;
  font-size: 0.85rem;
  font-weight: 800;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  cursor: pointer;
}
.prime-travel:hover { background: #ffffff; }
.prime-travel:focus-visible { outline: 2px solid #7dd3fc; outline-offset: 2px; }
.prime-pin {
  min-height: 48px;
  min-width: 48px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 12px;
  background: transparent;
  color: #e4e4e7;
  font-size: 1.1rem;
  cursor: pointer;
}
.prime-pin:hover { border-color: rgba(255, 215, 0, 0.6); }
.prime-pin:focus-visible { outline: 2px solid #7dd3fc; outline-offset: 2px; }
.prime-pin[data-on="true"] { color: #ffd700; border-color: rgba(255, 215, 0, 0.5); }
.prime-members { margin: 12px 0 0; padding: 0; list-style: none; }
.prime-members li { margin: 0; }
.prime-member-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  text-align: left;
  background: transparent;
  border: none;
  border-radius: 10px;
  padding: 10px 8px;
  color: #e4e4e7;
  font-size: 0.92rem;
  cursor: pointer;
  min-height: 44px;
}
.prime-member-row:hover { background: rgba(255, 255, 255, 0.05); }
.prime-member-row:focus-visible { outline: 2px solid #7dd3fc; outline-offset: -2px; }
/* Prime ambience: starfield video -> still -> off, persisted */
.prime-root { position: relative; }
.prime-main { position: relative; z-index: 1; }
.prime-amb { position: fixed; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
.prime-amb img, .prime-amb video { width: 100%; height: 100%; object-fit: cover; opacity: 0.35; }
.prime-scrim { position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background: linear-gradient(180deg, rgba(4,4,8,0.78) 0%, rgba(4,4,8,0.5) 35%, rgba(4,4,8,0.9) 100%); }
.prime-tex { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 0.84 0 0 0 0 0 0 0 0 0.05 0'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E"); background-size: 140px 140px; }
.prime-sheet { background-color: rgba(10, 10, 15, 0.97); background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 0.84 0 0 0 0 0 0 0 0 0.05 0'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E"); background-size: 140px 140px; }
.prime-results { background-color: rgba(10, 10, 14, 0.98); background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 0.84 0 0 0 0 0 0 0 0 0.05 0'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E"); background-size: 140px 140px; }
.prime-title h1 { display: flex; align-items: center; gap: 10px; }
.prime-emblem { color: #ffd700; display: inline-flex; filter: drop-shadow(0 0 8px rgba(255,215,0,0.5)); }
.prime-icobtn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
.prime-ambbtn { min-width: 44px; min-height: 44px; padding: 8px 10px; border: 1px solid rgba(255,255,255,0.14);
  border-radius: 10px; background: transparent; color: #a1a1aa; font-size: 0.68rem; font-weight: 600;
  letter-spacing: 0.1em; text-transform: uppercase; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px; flex: 0 0 auto; }
.prime-ambbtn:hover { color: #fff; border-color: rgba(255,215,0,0.4); }
.prime-loading { flex-direction: column; gap: 14px; }
.prime-loading-ic { color: #ffd700; display: inline-flex; animation: prime-pulse 1.6s ease-in-out infinite; }
@keyframes prime-pulse { 0%,100% { opacity: 0.55; } 50% { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .prime-loading-ic { animation: none; } }
`;

export default function PrimePage() {
  const router = useRouter();
  // Node taps ride the vortex like every other entry point
  // (Merlin, 2026-10-29). The local launcher fanfare stays.
  const { travel: vortexTravel, overlay: vortexOverlay } = useVortexTravel();
  const chart = useMemo(() => buildChart(SATELLITES), []);
  const nodeMap = useMemo(() => {
    const m = new Map();
    for (const c of chart.clusters) for (const n of c.nodes) m.set(n.key, { node: n, cluster: c });
    return m;
  }, [chart]);

  const chartRef = useRef(null);
  const accountRef = useRef(null); // current account id (or null for device)
  const stateRef = useRef(sanitizeState(null));

  const [selection, setSelection] = useState(null); // { kind:'node'|'cluster', key }
  const [query, setQuery] = useState('');
  // Tour preview: the Travelator shows the program as itself, so the
  // page's own back button hides — the tour carries its own HUB button
  // (Merlin, 2026-10-29).
  const [isTourPreview] = useState(() => {
    try { return new URLSearchParams(window.location.search).get('tourPreview') === '1'; }
    catch { return false; }
  });
  const [searchOpen, setSearchOpen] = useState(false);
  const [status, setStatus] = useState('');
  const [pins, setPins] = useState([]);
  const [recents, setRecents] = useState([]);
  const [amb, setAmb] = useState('video');
  const statusTimer = useRef(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('prime-amb');
      const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (saved === 'video' || saved === 'still' || saved === 'off') setAmb(saved);
      else if (reduce) setAmb('still');
    } catch { /* default video */ }
  }, []);

  const cycleAmb = () => {
    const order = ['video', 'still', 'off'];
    const next = order[(order.indexOf(amb) + 1) % order.length];
    setAmb(next);
    try { window.localStorage.setItem('prime-amb', next); } catch { /* ignore */ }
  };

  const persist = useCallback((next) => {
    stateRef.current = next;
    try {
      saveState(window.localStorage, accountRef.current, next);
    } catch {
      /* noop */
    }
  }, []);

  const showStatus = useCallback((text, ms = 2600) => {
    setStatus(text);
    if (statusTimer.current) clearTimeout(statusTimer.current);
    if (text && ms > 0) {
      statusTimer.current = setTimeout(() => setStatus(''), ms);
    }
  }, []);

  // --- account-mapped state: load under the account key; re-load on change ---
  useEffect(() => {
    let alive = true;
    const storage = window.localStorage;
    const applyFor = (accountId, stored) => {
      accountRef.current = accountId;
      stateRef.current = stored;
      setPins(stored.pins);
      setRecents(stored.recents);
      if (stored.camera && chartRef.current) {
        chartRef.current.focusOn(stored.camera.x, stored.camera.y, stored.camera.zoom, { instant: true });
      }
    };
    const load = async () => {
      const accountId = await resolveAccountId(supabase, storage);
      if (!alive) return;
      applyFor(accountId, loadState(storage, accountId));
    };
    load();
    const unsub = subscribeAccountChanges(supabase, (accountId) => {
      if (!alive) return;
      if (accountId === accountRef.current) return; // no-op: same account
      applyFor(accountId, loadState(storage, accountId));
      setSelection(null);
      showStatus(accountId ? 'Signed-in view restored' : 'Device view', 2000);
    });
    return () => {
      alive = false;
      unsub();
      if (statusTimer.current) clearTimeout(statusTimer.current);
    };
  }, [showStatus]);

  const handleCameraSettle = useCallback(
    (camera) => {
      persist(withCamera(stateRef.current, camera));
    },
    [persist]
  );

  const selectedNode = selection && selection.kind === 'node' ? nodeMap.get(selection.key) : null;
  const selectedCluster =
    selection && selection.kind === 'cluster'
      ? chart.clusters.find((c) => c.constellation === selection.key)
      : null;

  const handleTapNode = useCallback(
    (node) => {
      setSelection({ kind: 'node', key: node.key });
      setSearchOpen(false);
    },
    []
  );

  const handleTapCluster = useCallback((cluster) => {
    setSelection({ kind: 'cluster', key: cluster.constellation });
    setSearchOpen(false);
  }, []);

  const handleTapEmpty = useCallback(() => {
    setSelection(null);
  }, []);

  const gotoNode = useCallback(
    (node, zoom = 1.1) => {
      setSelection({ kind: 'node', key: node.key });
      setSearchOpen(false);
      setQuery('');
      if (chartRef.current) chartRef.current.focusOn(node.x, node.y, zoom);
    },
    []
  );

  const travel = useCallback(
    (node) => {
      // The launch fanfare lives in the central FX lib; the actual hop
      // rides the vortex — the tube is the launcher shell's launch beat
      // now (Merlin, 2026-10-29).
      showStatus(`Opening ${node.name}…`, 4000);
      const next = recordVisit(stateRef.current, node.key);
      setRecents(next.recents);
      persist(next);
      try {
        fx.routeLaunch(node.route);
      } catch {
        /* fx is best-effort */
      }
      const reduce =
        typeof window !== 'undefined' &&
        window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce) {
        router.push(node.route);
      } else {
        vortexTravel(node.route, node.name);
      }
    },
    [persist, router, showStatus, vortexTravel]
  );

  const togglePinFor = useCallback(
    (key) => {
      const next = togglePin(stateRef.current, key);
      setPins(next.pins);
      persist(next);
    },
    [persist]
  );

  const results = useMemo(() => searchChart(chart, query), [chart, query]);
  const pinnedNodes = useMemo(
    () => pins.map((k) => nodeMap.get(k)).filter(Boolean),
    [pins, nodeMap]
  );
  const recentNodes = useMemo(
    () => recents.map((k) => nodeMap.get(k)).filter(Boolean),
    [recents, nodeMap]
  );

  const resetView = useCallback(() => {
    // Re-fit the whole chart. Deterministic: recompute the same initial
    // camera the canvas started with.
    const el = document.querySelector('.prime-chart-wrap');
    const w = el ? el.clientWidth : 800;
    const h = el ? el.clientHeight : 600;
    const c = initialCamera(chart, w, h);
    if (chartRef.current) chartRef.current.focusOn(c.x, c.y, c.zoom);
    setSelection(null);
  }, [chart]);

  return (
    <div className="prime-root">
      <style>{CSS}</style>
      {amb !== 'off' && (
        <div className="prime-amb" aria-hidden="true">
          {amb === 'video' ? (
            <video autoPlay muted loop playsInline preload="metadata"
              poster="/images/prime/prime-bg.webp" src="/images/prime/prime-bg-loop.mp4" />
          ) : (
            <img src="/images/prime/prime-bg.webp" alt="" />
          )}
        </div>
      )}
      {amb !== 'off' && <div className="prime-scrim" aria-hidden="true" />}
      <main className="prime-main">
        {/* top bar: back, title, search — everything else lives on the map */}
        <div className="prime-topbar">
          {!isTourPreview && <BackButton label="Hub" />}
          <div className="prime-title">
            <h1><span className="prime-emblem"><Glyph size={18}>{IC.compass}</Glyph></span>STAR NAVIGATOR</h1>
            <p>Star chart</p>
          </div>
          <div className="prime-search-wrap">
            <input
              className="prime-search"
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
              placeholder="Search destinations…"
              aria-label="Search destinations"
            />
            {searchOpen && (query.trim() || pinnedNodes.length > 0 || recentNodes.length > 0) && (
              <div className="prime-results" role="listbox" aria-label="Search results">
                {results.map(({ node, cluster }) => (
                  <button
                    key={node.key}
                    type="button"
                    role="option"
                    aria-selected={false}
                    className="prime-result-row"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => gotoNode(node)}
                  >
                    <span className="prime-result-dot" style={{ background: cluster.hue }} />
                    <span>
                      {node.name}
                      <span className="prime-result-sub">
                        {cluster.constellation} · {node.section.toLowerCase()}
                      </span>
                    </span>
                  </button>
                ))}
                {!query.trim() && (
                  <>
                    {pinnedNodes.length > 0 && (
                      <>
                        <div className="prime-result-group">Pinned</div>
                        {pinnedNodes.map(({ node, cluster }) => (
                          <button
                            key={`pin-${node.key}`}
                            type="button"
                            className="prime-result-row"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => gotoNode(node)}
                          >
                            <span className="prime-result-dot" style={{ background: '#ffd700' }} />
                            <span>
                              {node.name}
                              <span className="prime-result-sub">{cluster.constellation.toLowerCase()}</span>
                            </span>
                          </button>
                        ))}
                      </>
                    )}
                    {recentNodes.length > 0 && (
                      <>
                        <div className="prime-result-group">Recent</div>
                        {recentNodes.map(({ node, cluster }) => (
                          <button
                            key={`rec-${node.key}`}
                            type="button"
                            className="prime-result-row"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => gotoNode(node)}
                          >
                            <span className="prime-result-dot" style={{ background: cluster.hue }} />
                            <span>
                              {node.name}
                              <span className="prime-result-sub">{cluster.constellation.toLowerCase()}</span>
                            </span>
                          </button>
                        ))}
                      </>
                    )}
                  </>
                )}
                {query.trim() && results.length === 0 && (
                  <div className="prime-result-group">No destinations match “{query.trim()}”</div>
                )}
              </div>
            )}
          </div>
          <button type="button" onClick={cycleAmb} className="prime-ambbtn"
            aria-label="Cycle background ambience: video, still, off" title="Background ambience">
            <Glyph size={15}>{IC.video}</Glyph>{amb === 'video' ? 'Video' : amb === 'still' ? 'Still' : 'Off'}
          </button>
        </div>

        {/* the map */}
        <section className="prime-map-section" aria-label="Prime star chart">
          <PrimeChart
            ref={chartRef}
            chart={chart}
            selectedKey={selection && selection.kind === 'node' ? selection.key : null}
            pinnedKeys={pins}
            onTapNode={handleTapNode}
            onTapCluster={handleTapCluster}
            onTapEmpty={handleTapEmpty}
            onCameraSettle={handleCameraSettle}
          />
          <div
            className={`prime-status${status ? '' : ' prime-status-hidden'}`}
            role="status"
            aria-live="polite"
          >
            {status || ' '}
          </div>
          <div className="prime-zoom">
            <button type="button" aria-label="Zoom in" onClick={() => chartRef.current && chartRef.current.zoomBy(1.35)}><Glyph size={18}>{IC.plus}</Glyph></button>
            <button type="button" aria-label="Zoom out" onClick={() => chartRef.current && chartRef.current.zoomBy(1 / 1.35)}><Glyph size={18}>{IC.minus}</Glyph></button>
            <button type="button" className="prime-zoom-reset" aria-label="Reset view" onClick={resetView}><Glyph size={18}>{IC.reset}</Glyph></button>
          </div>
        </section>

        {/* honest footnote — the chart makes no live claims */}
        <div className="prime-about">
          <p>
            Every destination in the universe, charted. The map is procedural —
            the same sky for everyone, works offline, no live data. Drag to
            explore, pinch or scroll to dive in, tap a star to travel.
          </p>
        </div>

        <div className="prime-foot">
          <BackButton label="Back to the hub" />
        </div>
      </main>

      {/* destination sheet — appears only when a star or cluster is tapped */}
      {selectedNode && (
        <div className="prime-sheet" role="dialog" aria-label={`Destination: ${selectedNode.node.name}`}>
          <div className="prime-sheet-head">
            <span className="prime-sheet-dot" style={{ background: selectedNode.cluster.hue }} />
            <div className="prime-sheet-title">
              <h2>{selectedNode.node.name}</h2>
              <p>
                {selectedNode.cluster.constellation} · {selectedNode.node.section.toLowerCase()} · {selectedNode.node.route}
              </p>
            </div>
            <button type="button" className="prime-sheet-close prime-icobtn" aria-label="Close" onClick={() => setSelection(null)}>
              <Glyph size={18}>{IC.x}</Glyph>
            </button>
          </div>
          <p className="prime-sheet-blurb">{selectedNode.node.blurb}</p>
          <div className="prime-sheet-actions">
            <button type="button" className="prime-travel prime-icobtn" onClick={() => travel(selectedNode.node)}>
              <Glyph size={16}>{IC.arrow}</Glyph>Travel
            </button>
            <button
              type="button"
              className="prime-pin prime-icobtn"
              data-on={pins.includes(selectedNode.node.key) ? 'true' : 'false'}
              aria-label={pins.includes(selectedNode.node.key) ? 'Unpin destination' : 'Pin destination'}
              aria-pressed={pins.includes(selectedNode.node.key)}
              onClick={() => togglePinFor(selectedNode.node.key)}
            >
              {pins.includes(selectedNode.node.key) ? (
                <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" /></svg>
              ) : (
                <Glyph size={18}>{IC.star}</Glyph>
              )}
            </button>
          </div>
        </div>
      )}

      {selectedCluster && (
        <div className="prime-sheet" role="dialog" aria-label={`Constellation: ${selectedCluster.constellation}`}>
          <div className="prime-sheet-head">
            <span className="prime-sheet-dot" style={{ background: selectedCluster.hue }} />
            <div className="prime-sheet-title">
              <h2>{selectedCluster.constellation}</h2>
              <p>{selectedCluster.label} · {selectedCluster.count} destinations</p>
            </div>
            <button type="button" className="prime-sheet-close prime-icobtn" aria-label="Close" onClick={() => setSelection(null)}>
              <Glyph size={18}>{IC.x}</Glyph>
            </button>
          </div>
          <ul className="prime-members">
            {selectedCluster.nodes.map((n) => (
              <li key={n.key}>
                <button type="button" className="prime-member-row" onClick={() => gotoNode(n)}>
                  <span className="prime-result-dot" style={{ background: selectedCluster.hue }} />
                  {n.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {vortexOverlay}
    </div>
  );
}
