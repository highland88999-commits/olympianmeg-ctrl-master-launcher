'use client';

// components/controls/NGonPad.jsx
//
// One N-gon pad of Merlin's controller. The polygon's sides EQUAL
// its control count (the Shape Law); the center is NEUTRAL; a single
// unbroken touch glides across wedges (continuous-contact law);
// lifting the finger disengages everything. At rest the pad is
// barely visible; engaged, it wakes to full brightness — state
// awareness is presence only, never position or function.
//
// Labels ring the pad EXTERNALLY, one per wedge, as drawn on
// Merlin's paper. The rim takes a border wrap image and the dead
// space a dead-space wrap image when the game's art is provided
// (Menu Art Transfer slots); otherwise a clean themed CSS/SVG
// border stands in.
//
// Input grammar per wedge kind:
//   press  — fires on wedge entry (sliding back in re-fires)
//   hold   — on while the finger rests in the wedge (Block)
//   analog — reports tilt (0..1 from center) while active
// A pad flagged analogVector (the brawl compass) reports a full
// direction vector instead.
//
// Desktop Mouse Pad mode: click the NEUTRAL CENTER to engage; the
// mouse's angle/distance then drives wedge + tilt; click again or
// press Esc to release. Standard touch/pen input is press-and-glide.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  polygonPointsAttr,
  wedgeBoundaryAngles,
  wedgePath,
  labelPosition,
  rimPoint,
  splitLabel,
} from '../../lib/controls/shapes.js';
import { createPadGesture, DEFAULT_DEAD_ZONE } from '../../lib/controls/gesture.js';

const RIM = 52; // polygon radius in viewBox units (viewBox 150)
// External label ring: percent of the pad's width from its center
// (the rim sits at ~34.7%, so labels ring just outside it).
const LABEL_R = 44;

export default function NGonPad({
  pad,
  size,
  idleOpacity,
  borderOpacity,
  labelsOn,
  mousePadMode,
  accent = '#f59e0b',
  wrapBorder = null,
  wrapDeadSpace = null,
  runtime = {}, // controlKey -> { cooldown, dark, lit }
  editMode = false,
  selected = false,
  onPress,
  onHold,
  onAnalog,
  onEditPointer,
}) {
  const sides = pad.controls.length;
  const gestureRef = useRef(null);
  if (!gestureRef.current || gestureRef.current.__sides !== sides) {
    gestureRef.current = createPadGesture({ sides });
    gestureRef.current.__sides = sides;
  }
  const gesture = gestureRef.current;
  const [engaged, setEngaged] = useState(false);
  const [activeWedge, setActiveWedge] = useState(-1);
  // Edge-flipped labels (2026-10-14): an external-ring label whose
  // text would run past the viewport edge grows the OTHER way
  // instead — still outside the rim, still on its ring point, just
  // never clipped (Merlin's playtest: "Command…", "Tidal Thr…" and
  // "Retreat" cut at the screen edges on iPhone width). The 34px
  // LABEL_GUTTER only covers ~30px of label; long special names
  // need the flip. controlKey -> 'start' | 'end' override.
  const [labelFlips, setLabelFlips] = useState({});
  const heldKeyRef = useRef(null);
  const mouseEngagedRef = useRef(false);
  const rootRef = useRef(null);
  const uid = useMemo(() => `pad-${pad.id}-${Math.random().toString(36).slice(2, 8)}`, [pad.id]);

  // ---------------------------------------------------------------
  // gesture events -> game input
  // ---------------------------------------------------------------
  const emitAnalogNull = () => onAnalog?.(pad.id, { key: null, tilt: 0, vector: { x: 0, y: 0 } });

  const handleEvents = (events) => {
    for (const ev of events) {
      if (ev.type === 'engage') {
        setEngaged(true);
      } else if (ev.type === 'release') {
        setEngaged(false);
        setActiveWedge(-1);
        if (heldKeyRef.current) {
          onHold?.(heldKeyRef.current, false);
          heldKeyRef.current = null;
        }
        emitAnalogNull();
      } else if (ev.type === 'wedgeOn') {
        setActiveWedge(ev.index);
        const c = pad.controls[ev.index];
        if (!c) continue;
        if (c.kind === 'press') onPress?.(c.key);
        else if (c.kind === 'hold') {
          heldKeyRef.current = c.key;
          onHold?.(c.key, true);
        }
      } else if (ev.type === 'wedgeOff') {
        const c = pad.controls[ev.index];
        if (c && c.kind === 'hold' && heldKeyRef.current === c.key) {
          heldKeyRef.current = null;
          onHold?.(c.key, false);
        }
        if (activeWedge === ev.index) setActiveWedge(-1);
      } else if (ev.type === 'tilt') {
        if (pad.analogVector) {
          const c = ev.index >= 0 ? pad.controls[ev.index] : null;
          onAnalog?.(pad.id, { key: c ? c.key : null, tilt: ev.tilt, vector: ev.vector });
        } else if (ev.index >= 0) {
          const c = pad.controls[ev.index];
          if (c && c.kind === 'analog') {
            onAnalog?.(pad.id, { key: c.key, tilt: ev.tilt, vector: ev.vector });
          } else {
            emitAnalogNull();
          }
        } else {
          emitAnalogNull();
        }
      }
    }
  };

  // unmount safety: never leave a hold or a move latched
  useEffect(() => () => {
    if (heldKeyRef.current) onHold?.(heldKeyRef.current, false);
    emitAnalogNull();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Measure label overflow against the live viewport and flip any
  // label that would clip. Runs after every render (cheap: <= 8
  // labels) so custom-layout drags and rotations stay correct; the
  // state write is guarded so a stable result never loops.
  useEffect(() => {
    if (!labelsOn) return;
    const el = rootRef.current;
    if (!el || typeof window === 'undefined') return;
    const rect = el.getBoundingClientRect();
    if (!rect.width) return;
    const vw = window.innerWidth;
    const next = {};
    pad.controls.forEach((c, i) => {
      const pos = labelPosition(i, sides, LABEL_R);
      if (pos.anchor === 'middle') return;
      const lines = splitLabel(c.shortLabel || c.label);
      const fontSize = lines.some((l) => l.length > 9) ? 9 : 10.5;
      // font-black advance + letter-spacing, estimated wide on
      // purpose: flipping a label one frame early beats clipping it.
      const estW = Math.max(...lines.map((l) => l.length)) * fontSize * 0.78 + 4;
      const anchorPx = rect.left + ((50 + pos.x) / 100) * rect.width;
      if (pos.anchor === 'start' && anchorPx + 4 + estW > vw - 2) next[c.key] = 'end';
      else if (pos.anchor === 'end' && anchorPx - 4 - estW < 2) next[c.key] = 'start';
    });
    setLabelFlips((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  });

  // Esc releases a mouse-pad engagement
  useEffect(() => {
    if (!mousePadMode) return;
    const onKey = (e) => {
      if (e.key === 'Escape' && mouseEngagedRef.current) {
        mouseEngagedRef.current = false;
        handleEvents(gesture.forceRelease());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mousePadMode]);

  // ---------------------------------------------------------------
  // pointer plumbing
  // ---------------------------------------------------------------
  const toPadSpace = (e) => {
    const rect = rootRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    return {
      x: (e.clientX - cx) / (rect.width / 2),
      y: (e.clientY - cy) / (rect.height / 2),
    };
  };

  const onPointerDown = (e) => {
    if (editMode) { onEditPointer?.(pad.id, e, 'down'); return; }
    e.preventDefault();
    const el = rootRef.current;
    try { el.setPointerCapture(e.pointerId); } catch { /* older Safari */ }
    if (mousePadMode && e.pointerType === 'mouse') {
      if (mouseEngagedRef.current) {
        mouseEngagedRef.current = false;
        handleEvents(gesture.up(null));
        return;
      }
      const p = toPadSpace(e);
      // Mouse Pad mode engages from the NEUTRAL ZONE only
      if (Math.hypot(p.x, p.y) <= DEFAULT_DEAD_ZONE + 0.1) {
        mouseEngagedRef.current = true;
        handleEvents(gesture.down(e.pointerId, 0, 0));
      }
      return;
    }
    const p = toPadSpace(e);
    handleEvents(gesture.down(e.pointerId, p.x, p.y));
  };

  const onPointerMove = (e) => {
    if (editMode) { onEditPointer?.(pad.id, e, 'move'); return; }
    if (!gesture.engaged) return;
    if (mousePadMode && e.pointerType === 'mouse' && !mouseEngagedRef.current) return;
    const p = toPadSpace(e);
    handleEvents(gesture.move(e.pointerId, p.x, p.y));
  };

  const onPointerUp = (e) => {
    if (editMode) { onEditPointer?.(pad.id, e, 'up'); return; }
    if (mousePadMode && e.pointerType === 'mouse') return; // toggle mode: click/Esc releases
    handleEvents(gesture.up(e.pointerId));
  };

  const onPointerCancel = (e) => {
    if (editMode) { onEditPointer?.(pad.id, e, 'up'); return; }
    mouseEngagedRef.current = false;
    handleEvents(gesture.up(e.pointerId));
  };

  // ---------------------------------------------------------------
  // render
  // ---------------------------------------------------------------
  const spokes = wedgeBoundaryAngles(sides);
  const awake = engaged || editMode || selected;
  const wrapPatternId = `${uid}-wrap`;

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={`${pad.group} pad`}
      className="select-none"
      style={{
        width: size,
        height: size,
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
        opacity: awake ? 1 : idleOpacity,
        transition: 'opacity 180ms ease',
        position: 'relative',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onContextMenu={(e) => e.preventDefault()}
    >
      <style>{`
        @keyframes ngon-armed { 0%,100% { opacity: .45; } 50% { opacity: .95; } }
        .ngon-armed { animation: ngon-armed .9s ease-in-out infinite; }
      `}</style>
      <svg viewBox="-75 -75 150 150" width={size} height={size} style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          {(wrapBorder || wrapDeadSpace) ? (
            <pattern id={wrapPatternId} patternUnits="userSpaceOnUse" width="46" height="46">
              <image href={wrapBorder || wrapDeadSpace} width="46" height="46" preserveAspectRatio="xMidYMid slice" />
            </pattern>
          ) : null}
        </defs>

        {/* border wrap: a rim of the game's texture map */}
        {wrapBorder ? (
          <polygon points={polygonPointsAttr(sides, RIM + 4)} fill={`url(#${wrapPatternId})`} opacity={0.95} />
        ) : null}

        {/* dead space: the pad's interior (its own transparent wrap) */}
        <polygon
          points={polygonPointsAttr(sides, RIM)}
          fill={wrapDeadSpace ? `url(#${wrapPatternId})` : 'rgba(10,10,18,0.55)'}
          fillOpacity={wrapDeadSpace ? 0.5 : 1}
        />

        {/* wedge fills: cooldown shade, sleeping finisher, active light */}
        {pad.controls.map((c, i) => {
          const rt = runtime[c.key] || {};
          return (
            <g key={c.key}>
              {rt.dark ? (
                <path d={wedgePath(i, sides, RIM)} fill="rgba(0,0,0,0.6)" />
              ) : null}
              {rt.lit ? (
                <path className="ngon-armed" d={wedgePath(i, sides, RIM)} fill="#dc2626" opacity={0.6} />
              ) : null}
              {activeWedge === i ? (
                <path d={wedgePath(i, sides, RIM)} fill={accent} opacity={0.38} />
              ) : null}
              {rt.cooldown > 0 ? (
                <path d={wedgePath(i, sides, RIM)} fill="rgba(0,0,0,0.78)" opacity={Math.min(0.85, rt.cooldown)} />
              ) : null}
            </g>
          );
        })}

        {/* spokes + rim: the themed CSS border (fallback + under wrap) */}
        {spokes.map((a, i) => {
          const [x, y] = rimPoint(a, RIM);
          return (
            <line key={i} x1={0} y1={0} x2={x} y2={y}
              stroke="rgba(255,255,255,0.35)" strokeWidth={0.7}
              strokeOpacity={0.25 + borderOpacity * 0.4} />
          );
        })}
        <polygon
          points={polygonPointsAttr(sides, RIM)}
          fill="none"
          stroke={accent}
          strokeWidth={engaged ? 2.4 : 1.7}
          strokeOpacity={Math.min(1, borderOpacity * (engaged ? 1.5 : 1))}
          strokeLinejoin="round"
        />

        {/* NEUTRAL center */}
        <circle r={8.5} fill={engaged && activeWedge < 0 ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.07)'}
          stroke="rgba(255,255,255,0.4)" strokeWidth={0.8} strokeOpacity={0.3 + borderOpacity * 0.5} />
        <circle r={1.6} fill="rgba(255,255,255,0.55)" />
      </svg>

      {/* external labels — ringed outside the rim, as drawn */}
      {labelsOn ? pad.controls.map((c, i) => {
        const pos = labelPosition(i, sides, LABEL_R);
        const anchor = labelFlips[c.key] || pos.anchor;
        const rt = runtime[c.key] || {};
        const lines = splitLabel(c.shortLabel || c.label);
        return (
          <div
            key={c.key}
            className="pointer-events-none absolute font-black"
            style={{
              left: `calc(50% + ${pos.x}%)`,
              top: `calc(50% + ${pos.y}%)`,
              transform: `translate(${anchor === 'start' ? '4px' : anchor === 'end' ? 'calc(-100% - 4px)' : '-50%'}, -50%)`,
              textAlign: anchor === 'end' ? 'right' : anchor === 'start' ? 'left' : 'center',
              fontSize: lines.some((l) => l.length > 9) ? 9 : 10.5,
              lineHeight: 1.15,
              letterSpacing: '0.04em',
              color: rt.lit ? '#fca5a5' : rt.dark ? 'rgba(255,255,255,0.35)' : '#fff',
              opacity: rt.dark ? 0.6 : engaged ? 1 : 0.75,
              textShadow: '0 1px 3px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.7)',
              whiteSpace: 'nowrap',
            }}
          >
            {lines.map((l, li) => (
              <span key={li} style={{ display: 'block' }}>{l}</span>
            ))}
          </div>
        );
      }) : null}

      {/* arrange-mode affordance */}
      {editMode ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-full border border-dashed border-white/70 bg-black/45 px-2 py-1 text-[9px] font-black tracking-widest text-white/85">
            DRAG · {pad.group.toUpperCase()}
          </div>
        </div>
      ) : null}
    </div>
  );
}
