'use client';

// app/sun-base/page.jsx — THE SUN BASE (Merlin, Nov 13, 2026).
//
// A base for each user inside the sun. Entry is the hub sun itself
// (components/HomeScene.jsx SunBackground): click it and you are
// PULLED in, or fly through it — either way the pull lands here,
// inside your own room.
//
// THE ROOM: one of the 3 reserved interiors
// (lib/earth2/fittings.js RESERVED_SUN_BASE_INTERIORS). First entry
// asks which of the three is yours; the pick persists device-local
// (lib/sun-base.js — the portal-progress pattern). Change it any
// time from inside the base.
//
// THE USER IS SMALL HERE (Merlin, Nov 13, 2026 — "I want the room
// to be huge for them"): one-fifth size inside the base, so the
// room reads five times bigger (lib/sun-base.js SUN_BASE_USER_SCALE).
// The stride is normal size, though (Merlin, Nov 14, 2026: motion
// speed matches normal size — 3.2 m/s).
//
// BUILDING (Merlin, Nov 13, 2026): the sun base is a build surface
// exactly like an Earth 2 parcel — the same catalog, the same
// placement law, the same piece renderer (lib/building/*), no copy.
// The 🔨 Build button opens the build menu: pick a piece, tap the
// floor to place it, double-tap a placed piece to pick it back up.
// Pieces render at the user's own 0.2 scale (Merlin, Nov 14, 2026:
// "Objects in solar base are too big"), so they read the size they
// would at normal scale; a freshly picked piece faces the placer
// (Nov 14: "by default, objects should be oriented logically"),
// and the ⟳ Turn button takes over from there. A portal piece
// (frame-portal / portal-frame) takes a destination from the shared
// PortalDestinationPicker — walk through it and you travel. Builds
// persist device-local per interior (lib/sun-base-build.js — the
// interior-pick pattern).
//
// THE GATE: signed-in accounts only (the Earth 2 rule, 2026-10-31:
// signed-out visitors get a plain locked screen, never the room).
// No menu entry: the sun in the hub is the door — menus stay
// untouched (dual-registry rule: nothing half-registered).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Canvas } from '@react-three/fiber';
import { supabase } from '@/lib/supabase';
import SunBaseScene from '@/components/SunBaseScene';
import WalkJoystick from '@/components/world/WalkJoystick';
import OrbButton, { OrbLabel } from '@/components/world/OrbButton';
import PortalDestinationPicker, { isPortalPiece } from '@/components/earth2/PortalDestinationPicker';
import {
  BUILDING_PIECES,
  FINISHES,
  ORIENTATIONS,
  PIECE_CATEGORIES,
  finishAllowed,
  normalizeOrientation,
  pieceById,
} from '@/lib/building/catalog';
import { snapRotation } from '@/lib/building/placement';
import {
  SUN_BASE_OPTIONS,
  SUN_BASE_OPTION_LABELS,
  loadSunBasePick,
  saveSunBasePick,
} from '@/lib/sun-base';
import { sunBaseSpecFor } from '@/lib/sun-base-spec';
import {
  loadSunBaseBuilds,
  resolveSunBasePortalDestination,
  saveSunBaseBuilds,
  sunBaseAutoRotY,
  sunBaseFilterLawfulPieces,
  sunBaseMyBuildFor,
  sunBaseParseBuild,
  sunBaseSerializeBuild,
  sunBaseUpsertBuild,
  sunBaseValidatePieces,
} from '@/lib/sun-base-build';

const GOLD = '#ffd98a';

function prettyCategory(id) {
  return String(id || '')
    .split('-')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

export default function SunBasePage() {
  const router = useRouter();
  const [gate, setGate] = useState('checking'); // 'checking' | 'open' | 'locked'
  // Where the way back goes (Merlin, Nov 17, 2026 — Mars 2 space):
  // the Sun is one Sun, so Mars 2's sun entry lands in this same
  // base — and ?from=mars-2 sends the way back to Mars 2 instead
  // of the hub. Read off window.location (no useSearchParams, so
  // no Suspense boundary is needed around this page).
  const [fromMars, setFromMars] = useState(false);
  useEffect(() => {
    try {
      setFromMars(new URLSearchParams(window.location.search).get('from') === 'mars-2');
    } catch {}
  }, []);
  const backRoute = fromMars ? '/mars-2' : '/';
  const backLabel = fromMars ? '← Back to Mars 2' : '← Back to the hub';
  const [user, setUser] = useState(null);
  const [pick, setPick] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const moveRef = useRef({ x: 0, y: 0 });
  const walkerRef = useRef({ x: 0, z: -0.5, yaw: Math.PI });

  // --- Building state (Earth 2 build functions, in the sun base) ---
  const [pieces, setPieces] = useState([]);
  const [piecesLoaded, setPiecesLoaded] = useState(false);
  const [buildMode, setBuildMode] = useState(false);
  const [buildTool, setBuildTool] = useState('place'); // 'place' | 'edit'
  const [pieceCategory, setPieceCategory] = useState('walls');
  const [pieceId, setPieceId] = useState('wall');
  const [orientation, setOrientation] = useState('upright');
  const [finishId, setFinishId] = useState('timber');
  // rotY null = face the placer (a fresh piece turns its front
  // toward the person placing it); the Turn button, or picking a
  // piece back up, sets an explicit turn that sticks.
  const [rotY, setRotY] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [carriedIndex, setCarriedIndex] = useState(null);
  const [portalPickIndex, setPortalPickIndex] = useState(null);
  const [ghostHint, setGhostHint] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let alive = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!alive) return;
        const u = data?.session?.user || null;
        setUser(u);
        setGate(u ? 'open' : 'locked');
      })
      .catch(() => {
        if (alive) setGate('locked');
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (gate !== 'open') return;
    setPick(loadSunBasePick());
    setLoaded(true);
  }, [gate]);

  const spec = useMemo(() => (pick ? sunBaseSpecFor(pick) : null), [pick]);
  const label = pick ? SUN_BASE_OPTION_LABELS[pick] || 'Base' : 'Base';

  // Load this interior's build when the pick changes.
  useEffect(() => {
    if (!pick || !spec) {
      setPieces([]);
      setPiecesLoaded(false);
      return;
    }
    const builds = loadSunBaseBuilds();
    const mine = sunBaseMyBuildFor(builds, pick);
    let next = [];
    if (mine && Array.isArray(mine.pieces)) {
      const parsed = sunBaseParseBuild(mine, spec);
      if (parsed.ok) next = parsed.build.pieces;
      else {
        // A stored build that no longer validates wholesale: keep
        // the pieces that are still lawful, drop the rest — never
        // wipe the room over one bad piece. (Legacy-aware: a
        // round-1 build in room metres converts first.)
        next = sunBaseFilterLawfulPieces(mine);
      }
    }
    setPieces(next);
    setPiecesLoaded(true);
    setSelectedIndex(null);
    setCarriedIndex(null);
    setPortalPickIndex(null);
  }, [pick, spec]);

  // Persist this interior's build on every change (device-local).
  useEffect(() => {
    if (!piecesLoaded || !pick) return;
    const build = {
      groundType: 'sun-base',
      groundId: pick,
      ownerId: user?.id || null,
      ownerEmail: user?.email || null,
      pieces: sunBaseSerializeBuild({
        groundType: 'sun-base',
        groundId: pick,
        pieces,
      }).pieces,
      updatedAt: new Date().toISOString(),
    };
    const next = sunBaseUpsertBuild(loadSunBaseBuilds(), build);
    saveSunBaseBuilds(next);
  }, [pieces, pick, piecesLoaded, user]);

  // A notice clears itself after a few seconds.
  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const choose = useCallback((assetId) => {
    saveSunBasePick(assetId);
    setPick(assetId);
    setShowPicker(false);
  }, []);

  const pickerOpen = loaded && gate === 'open' && (showPicker || !pick);

  const categories = useMemo(() => PIECE_CATEGORIES.slice(), []);
  const categoryPieces = useMemo(
    () => BUILDING_PIECES.filter((p) => p.category === pieceCategory),
    [pieceCategory]
  );
  const selectedPiece = pieceById(pieceId);
  const finishes = useMemo(
    () =>
      selectedPiece
        ? FINISHES.filter((f) => finishAllowed(selectedPiece, f.id))
        : FINISHES,
    [selectedPiece]
  );
  const selectedPlaced = selectedIndex != null ? pieces[selectedIndex] : null;

  const build = useMemo(
    () => ({
      active: buildMode,
      tool: buildTool,
      pieceId,
      orientation,
      finishId,
      tint: null,
      rotY,
      carriedIndex,
      selectedIndex,
    }),
    [buildMode, buildTool, pieceId, orientation, finishId, rotY, carriedIndex, selectedIndex]
  );

  const commitPlace = useCallback((placement, replaceIndex) => {
    // The ghost verdict is already the snapped, clamped, judged
    // placement — commit it in catalog shape.
    const committed = {
      pieceId: placement.pieceId,
      x: placement.x,
      y: placement.y || 0,
      z: placement.z,
      rotY: placement.rotY || 0,
      finish: placement.finish || 'timber',
      ...(placement.tint != null ? { tint: placement.tint } : {}),
      ...(placement.orientation && placement.orientation !== 'upright'
        ? { orientation: placement.orientation }
        : {}),
    };
    setPieces((prev) => {
      const next = prev.slice();
      if (replaceIndex != null && next[replaceIndex]) next[replaceIndex] = committed;
      else next.push(committed);
      return next;
    });
    setCarriedIndex(null);
  }, []);

  const pickUp = useCallback(
    (index) => {
      const piece = pieces[index];
      if (!piece) return;
      setCarriedIndex(index);
      setBuildTool('place');
      setPieceId(piece.pieceId);
      setOrientation(piece.orientation || 'upright');
      setFinishId(piece.finish || 'timber');
      setRotY(piece.rotY || 0);
      setSelectedIndex(null);
      setNotice('Picked up — tap the floor to set it down.');
    },
    [pieces]
  );

  const deleteSelected = useCallback(() => {
    if (selectedIndex == null) return;
    setPieces((prev) => prev.filter((_, i) => i !== selectedIndex));
    setSelectedIndex(null);
    setNotice('Piece removed.');
  }, [selectedIndex]);

  const rotateSelected = useCallback(() => {
    if (selectedIndex == null || !spec) return;
    setPieces((prev) => {
      const next = prev.slice();
      const p = next[selectedIndex];
      if (!p) return prev;
      next[selectedIndex] = {
        ...p,
        rotY: snapRotation((p.rotY || 0) + 15, p.pieceId),
      };
      if (!sunBaseValidatePieces(next, spec).ok) {
        setNotice('It cannot turn there — something is in the way.');
        return prev;
      }
      return next;
    });
  }, [selectedIndex, spec]);

  const cycleOrientation = useCallback(() => {
    setOrientation((o) => {
      const i = ORIENTATIONS.indexOf(normalizeOrientation(o));
      return ORIENTATIONS[(i + 1) % ORIENTATIONS.length];
    });
  }, []);

  const portalWalk = useCallback(
    (dest) => {
      const route = resolveSunBasePortalDestination(dest);
      if (route) {
        router.push(route);
        return;
      }
      if (dest && dest.kind === 'floors') {
        setNotice("You're already on the only floor of your sun base.");
        return;
      }
      setNotice("This portal doesn't go anywhere yet — give it a destination in Build mode.");
    },
    [router]
  );

  if (gate === 'checking') {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#140c02', color: GOLD }}>
        <p style={{ fontSize: 15, opacity: 0.85 }}>Warming up your sun base…</p>
      </div>
    );
  }

  if (gate === 'locked') {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24, textAlign: 'center', background: 'radial-gradient(90% 90% at 50% 20%, #3a2404 0%, #140c02 70%)', color: '#ffe9c4' }}>
        <div style={{ fontSize: 40 }}>☀️</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Your sun base is inside the sun</h1>
        <p style={{ fontSize: 15, opacity: 0.85, margin: 0, maxWidth: 420 }}>
          Sign in to claim it — one base per account, yours to pick and keep.
        </p>
        <button
          type="button"
          onClick={() => router.push(backRoute)}
          style={{ marginTop: 8, padding: '10px 22px', borderRadius: 999, cursor: 'pointer', background: GOLD, color: '#140c02', fontSize: 14, fontWeight: 800, border: 'none', fontFamily: 'inherit' }}
        >
          {backLabel}
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', minHeight: '100dvh', background: '#1c0f02', color: '#ffe9c4', overflow: 'hidden' }}>
      {/* The room itself (only once a pick exists and resolves). */}
      {spec && (
        <div style={{ position: 'absolute', inset: 0 }}>
          <Canvas
            camera={{ position: [0, 0.34, -0.5], fov: 60, near: 0.1, far: 100 }}
            dpr={[1, 1.75]}
            style={{ touchAction: 'none' }}
          >
            <SunBaseScene
              spec={spec}
              moveRef={moveRef}
              walkerRef={walkerRef}
              build={build}
              pieces={pieces}
              onGhostVerdict={(ok, reasons) => setGhostHint(ok ? '' : reasons[0] || '')}
              onPlace={commitPlace}
              onSelect={setSelectedIndex}
              onPickup={pickUp}
              onPortalWalk={portalWalk}
            />
          </Canvas>
        </div>
      )}
      {!spec && loaded && (
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(90% 90% at 50% 20%, #3a2404 0%, #140c02 70%)' }} />
      )}

      {/* HUD */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '14px 16px', pointerEvents: 'none' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.28em', color: GOLD }}>☀ SUN BASE</div>
          <div style={{ fontSize: 20, fontWeight: 800, marginTop: 2 }}>
            {spec ? `${label} — your base inside the sun` : 'Pick your base'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, pointerEvents: 'auto', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {spec && (
            <OrbButton accent={GOLD} size={48} active={buildMode}
              onClick={() => {
                setBuildMode((v) => !v);
                setSelectedIndex(null);
                setCarriedIndex(null);
              }}
              aria-pressed={buildMode}
              ariaLabel={buildMode ? 'Building — tap to stop building' : 'Build'}>
              <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>🔨</span>
              <OrbLabel>BUILD</OrbLabel>
            </OrbButton>
          )}
          {spec && (
            <OrbButton accent={GOLD} size={48}
              onClick={() => setShowPicker(true)}
              ariaLabel="Change interior">
              <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>🎨</span>
              <OrbLabel>STYLE</OrbLabel>
            </OrbButton>
          )}
          <OrbButton accent={GOLD} size={48}
            onClick={() => router.push(backRoute)}
            ariaLabel={fromMars ? 'Back to Mars 2' : 'Back to hub'}>
            <span aria-hidden="true" style={{ fontSize: 20, lineHeight: 1 }}>←</span>
          </OrbButton>
        </div>
      </div>

      {/* Notice line */}
      {notice && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: 74, textAlign: 'center', fontSize: 13, fontWeight: 700, color: GOLD, pointerEvents: 'none', textShadow: '0 1px 6px #000' }}>
          {notice}
        </div>
      )}

      {/* Walk controls (only while standing in the room, not picking). */}
      {spec && !pickerOpen && (
        <>
          <div style={{ position: 'absolute', left: 16, bottom: buildMode ? 252 : 16 }}>
            <WalkJoystick onMove={(x, y) => { moveRef.current = { x, y }; }} />
          </div>
          {!buildMode && (
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 18, textAlign: 'center', fontSize: 12, opacity: 0.7, pointerEvents: 'none' }}>
              Drag to look · WASD / arrows / stick to walk
            </div>
          )}
        </>
      )}

      {/* Build menu — the Earth 2 build functions, in the sun base. */}
      {spec && buildMode && !pickerOpen && portalPickIndex == null && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: 236, overflowY: 'auto', background: 'rgba(20,12,2,0.96)', borderTop: `1px solid ${GOLD}55`, padding: '10px 12px 12px' }}>
          {/* Build tools — plain circle orbs now, never pills. The
              picker rows below (categories, pieces, finishes) stay
              as labelled lists: the name IS the choice there. */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <OrbButton accent={GOLD} size={48} active={buildTool === 'place'} onClick={() => setBuildTool('place')} aria-pressed={buildTool === 'place'} ariaLabel="Place tool">
              <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>📍</span>
              <OrbLabel>PLACE</OrbLabel>
            </OrbButton>
            <OrbButton accent={GOLD} size={48} active={buildTool === 'edit'} onClick={() => setBuildTool('edit')} aria-pressed={buildTool === 'edit'} ariaLabel="Edit tool">
              <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>✏️</span>
              <OrbLabel>EDIT</OrbLabel>
            </OrbButton>
            <OrbButton accent={GOLD} size={48} onClick={() => setRotY((r) => snapRotation((r ?? sunBaseAutoRotY(walkerRef.current?.yaw ?? Math.PI, pieceId)) + 15, pieceId))} ariaLabel="Turn piece 15 degrees">
              <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>⟳</span>
              <OrbLabel>TURN</OrbLabel>
            </OrbButton>
            <OrbButton accent={GOLD} size={48} onClick={cycleOrientation}
              ariaLabel={`Orientation: ${orientation === 'upright' ? 'standing' : orientation === 'flat' ? 'lay flat' : 'lay flat, flipped'} — tap to cycle`}>
              <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>⇅</span>
              <OrbLabel>{orientation === 'upright' ? 'STAND' : orientation === 'flat' ? 'FLAT' : 'FLIP'}</OrbLabel>
            </OrbButton>
            {buildTool === 'edit' && selectedPlaced && (
              <>
                <OrbButton accent={GOLD} size={48} onClick={rotateSelected} ariaLabel="Turn selected piece">
                  <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>⟳</span>
                  <OrbLabel>PIECE</OrbLabel>
                </OrbButton>
                <OrbButton accent="#ff8a94" size={48} onClick={deleteSelected} ariaLabel="Remove selected piece">
                  <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>🗑</span>
                  <OrbLabel>DEL</OrbLabel>
                </OrbButton>
                {isPortalPiece(selectedPlaced.pieceId) && (
                  <OrbButton accent={GOLD} size={48} onClick={() => setPortalPickIndex(selectedIndex)}
                    ariaLabel={selectedPlaced.portalTo ? `Portal to ${selectedPlaced.portalTo.label}` : 'Set portal destination'}>
                    <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>🌀</span>
                    <OrbLabel>PORTAL</OrbLabel>
                  </OrbButton>
                )}
              </>
            )}
            <OrbButton accent={GOLD} size={48} onClick={() => setBuildMode(false)} ariaLabel="Done building"
              style={{ marginLeft: 'auto' }}>
              <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>✓</span>
              <OrbLabel>DONE</OrbLabel>
            </OrbButton>
          </div>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginTop: 8, paddingBottom: 2 }}>
            {categories.map((c) => (
              <button key={c} type="button" onClick={() => setPieceCategory(c)} aria-pressed={pieceCategory === c} style={{ flexShrink: 0, padding: '6px 10px', borderRadius: 999, cursor: 'pointer', background: pieceCategory === c ? 'rgba(255,217,138,0.25)' : 'transparent', color: '#ffe9c4', fontSize: 12, fontWeight: 700, border: `1px solid ${pieceCategory === c ? GOLD : `${GOLD}33`}`, fontFamily: 'inherit' }}>
                {prettyCategory(c)}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginTop: 8, paddingBottom: 2 }}>
            {categoryPieces.map((p) => {
              const active = pieceId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setPieceId(p.id);
                    // A freshly picked piece faces the placer —
                    // the ghost derives its turn from the walker's
                    // yaw until the Turn button sets one.
                    setRotY(null);
                    if (!finishAllowed(p, finishId)) setFinishId(p.finishes && p.finishes !== 'all' ? p.finishes[0] : 'timber');
                  }}
                  aria-pressed={active}
                  style={{ flexShrink: 0, minWidth: 110, textAlign: 'left', padding: '8px 10px', borderRadius: 12, cursor: 'pointer', background: active ? 'rgba(255,217,138,0.25)' : 'rgba(255,217,138,0.07)', color: '#ffe9c4', border: `1px solid ${active ? GOLD : `${GOLD}33`}`, fontFamily: 'inherit' }}
                >
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 800 }}>{p.name}</span>
                  <span style={{ display: 'block', fontSize: 11, opacity: 0.75, marginTop: 2 }}>
                    {p.size.w} × {p.size.h} × {p.size.d} m
                  </span>
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginTop: 8, paddingBottom: 2 }}>
            {finishes.map((f) => {
              const active = finishId === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFinishId(f.id)}
                  aria-pressed={active}
                  style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 999, cursor: 'pointer', background: active ? 'rgba(255,217,138,0.25)' : 'transparent', color: '#ffe9c4', fontSize: 12, fontWeight: 700, border: `1px solid ${active ? GOLD : `${GOLD}33`}`, fontFamily: 'inherit' }}
                >
                  <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 999, background: `#${f.tint.toString(16).padStart(6, '0')}` }} />
                  {f.name}
                </button>
              );
            })}
          </div>
          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.85, minHeight: 16 }}>
            {buildTool === 'place'
              ? ghostHint || (carriedIndex != null ? 'Carrying a piece — tap the floor to set it down.' : 'Tap the floor to place it — drag to look, stick to walk.')
              : selectedPlaced
                ? `Selected: ${pieceById(selectedPlaced.pieceId)?.name || 'piece'} — tap another piece to select it, double-tap to pick it up.`
                : 'Tap a placed piece to select it — double-tap to pick it up and move it.'}
          </div>
        </div>
      )}

      {/* Portal destination picker — the shared Earth 2 picker. */}
      {portalPickIndex != null && (
        <PortalDestinationPicker
          onPick={(dest) => {
            const idx = portalPickIndex;
            setPieces((prev) => {
              const next = prev.slice();
              if (next[idx]) next[idx] = { ...next[idx], portalTo: dest };
              return next;
            });
            setPortalPickIndex(null);
            setNotice(`Portal set — walk through it to reach ${dest.label}.`);
          }}
          onClose={() => setPortalPickIndex(null)}
        />
      )}

      {/* Interior picker — first entry, or "Change interior". */}
      {pickerOpen && (
        <div role="dialog" aria-label="Pick your sun base interior" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 20, background: 'rgba(20,12,2,0.88)', backdropFilter: 'blur(2px)' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.28em', color: GOLD }}>☀ YOUR SUN BASE</div>
            <h2 style={{ fontSize: 'clamp(1.4rem, 6vw, 2rem)', fontWeight: 800, margin: '8px 0 4px' }}>
              {pick ? 'Change your interior' : 'Pick your interior'}
            </h2>
            <p style={{ fontSize: 14, opacity: 0.85, margin: 0 }}>
              One of three rooms lives inside your sun. Pick one — you can change it any time.
            </p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center', maxWidth: 720 }}>
            {SUN_BASE_OPTIONS.map((opt) => {
              const s = sunBaseSpecFor(opt.assetId);
              const size = s ? `${s.widthM} × ${s.depthM} m room` : '';
              const active = pick === opt.assetId;
              return (
                <button
                  key={opt.assetId}
                  type="button"
                  onClick={() => choose(opt.assetId)}
                  style={{
                    flex: '0 1 200px', textAlign: 'left', cursor: 'pointer', borderRadius: 16, padding: '16px 16px 14px',
                    color: '#ffe9c4', fontFamily: 'inherit',
                    background: active ? 'rgba(255,217,138,0.22)' : 'linear-gradient(165deg, rgba(255,217,138,0.14) 0%, rgba(8,8,16,0.85) 60%)',
                    border: `1px solid ${active ? GOLD : `${GOLD}55`}`,
                    boxShadow: `0 0 24px rgba(255,217,138,${active ? 0.35 : 0.15})`,
                  }}
                >
                  <span style={{ display: 'block', width: 14, height: 14, borderRadius: 999, background: s ? s.lightColor : GOLD, boxShadow: `0 0 12px ${s ? s.lightColor : GOLD}` }} />
                  <span style={{ display: 'block', fontSize: 18, fontWeight: 800, marginTop: 10 }}>
                    {SUN_BASE_OPTION_LABELS[opt.assetId] || opt.class}
                  </span>
                  <span style={{ display: 'block', fontSize: 13, opacity: 0.85, marginTop: 4, lineHeight: 1.4 }}>{opt.why}</span>
                  {size && <span style={{ display: 'block', fontSize: 12, opacity: 0.7, marginTop: 8 }}>{size}</span>}
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 700, marginTop: 10, color: GOLD }}>
                    {active ? 'Your current base ✓' : 'Make it mine →'}
                  </span>
                </button>
              );
            })}
          </div>
          {pick && (
            <button
              type="button"
              onClick={() => setShowPicker(false)}
              style={{ padding: '10px 22px', borderRadius: 999, cursor: 'pointer', background: 'transparent', color: '#ffe9c4', fontSize: 14, fontWeight: 700, border: `1px solid ${GOLD}66`, fontFamily: 'inherit' }}
            >
              ← Keep my {label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
