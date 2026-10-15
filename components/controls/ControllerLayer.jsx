'use client';

// components/controls/ControllerLayer.jsx
//
// The controller layer: positions a game's pads over its arena
// (clean-UI law — pads hug the edges, the play area stays
// undisturbed), hosts the Settings gear + panel, and runs Custom
// arrange mode (drag a pad over the live arena; the placement is
// saved the moment it's set down and restored on every load).
//
// The layer itself never intercepts touches — only the pads, the
// gear, and the panel do.

import { useRef, useState } from 'react';
import NGonPad from './NGonPad.jsx';
import ControllerSettings from './ControllerSettings.jsx';
import { resolvePadPlacement, toLayerPercent } from '../../lib/controls/layout.js';

const ACCENTS = {
  movement: '#38bdf8',
  combat: '#fb923c',
  powers: '#c084fc',
};

export default function ControllerLayer({
  pads,
  settings,
  onSettingsChange,
  runtimeByPad = {}, // padId -> { controlKey: { cooldown, dark, lit } }
  wrap = null, // { border, deadSpace } image URLs, or null for CSS borders
  dimmed = false, // cinematic law: while a cinematic plays the pads
  // fade OUT entirely (and stop taking touches) — engaged = legible,
  // cinematic = gone. They fade back the moment it ends.
  onPress,
  onHold,
  onAnalog,
}) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [livePositions, setLivePositions] = useState({}); // padId -> {x,y,scale}
  const layerRef = useRef(null);
  const dragRef = useRef(null); // { padId, grabDX, grabDY } in px

  const arranging = editMode && settings.layout === 'custom';

  // ---------------------------------------------------------------
  // custom arrange: drag pads over the live controller
  // ---------------------------------------------------------------
  const handleEditPointer = (padId, e, phase) => {
    const layer = layerRef.current;
    if (!layer) return;
    const rect = layer.getBoundingClientRect();
    if (phase === 'down') {
      const placement = resolvePadPlacement(settings, pads.find((p) => p.id === padId));
      const cur = livePositions[padId] || settings.custom?.[padId];
      const centerPx = cur
        ? { x: rect.left + (cur.x / 100) * rect.width, y: rect.top + (cur.y / 100) * rect.height }
        : { x: e.clientX, y: e.clientY }; // first grab of an anchored pad: jump to finger
      dragRef.current = {
        padId,
        grabDX: centerPx.x - e.clientX,
        grabDY: centerPx.y - e.clientY,
        scale: cur?.scale || placement.size / Math.max(1, pads.find((p) => p.id === padId).baseSize * settings.padScale),
      };
      const pos = toLayerPercent(e.clientX + dragRef.current.grabDX, e.clientY + dragRef.current.grabDY, rect);
      setLivePositions((m) => ({ ...m, [padId]: { ...pos, scale: dragRef.current.scale } }));
    } else if (phase === 'move') {
      const d = dragRef.current;
      if (!d || d.padId !== padId) return;
      const pos = toLayerPercent(e.clientX + d.grabDX, e.clientY + d.grabDY, rect);
      setLivePositions((m) => ({ ...m, [padId]: { ...pos, scale: d.scale } }));
    } else if (phase === 'up') {
      const d = dragRef.current;
      dragRef.current = null;
      if (!d || d.padId !== padId) return;
      const pos = livePositions[padId];
      if (pos) {
        // saved the moment it's set down — and never moved again
        onSettingsChange({
          ...settings,
          custom: { ...settings.custom, [padId]: pos },
        });
      }
    }
  };

  const placementFor = (pad) => {
    const placement = resolvePadPlacement(settings, pad);
    if (settings.layout === 'custom') {
      const pos = livePositions[pad.id] || settings.custom?.[pad.id];
      if (pos) {
        return {
          ...placement,
          custom: true,
          size: Math.round(pad.baseSize * settings.padScale * (pos.scale || 1)),
          style: { leftPct: pos.x, topPct: pos.y },
        };
      }
    }
    return placement;
  };

  const wrapperStyle = (placement) => {
    if (placement.custom) {
      return {
        position: 'absolute',
        left: `${placement.style.leftPct}%`,
        top: `${placement.style.topPct}%`,
        transform: 'translate(-50%, -50%)',
        pointerEvents: dimmed ? 'none' : 'auto',
      };
    }
    const s = { position: 'absolute', bottom: placement.style.bottom, pointerEvents: dimmed ? 'none' : 'auto' };
    if (placement.style.left != null) s.left = placement.style.left;
    if (placement.style.right != null) s.right = placement.style.right;
    return s;
  };

  return (
    <div
      ref={layerRef}
      className="absolute inset-0 z-20"
      style={{
        pointerEvents: 'none',
        opacity: dimmed ? 0 : 1,
        transition: 'opacity 350ms ease',
      }}
    >
      {pads.map((pad) => {
        const placement = placementFor(pad);
        return (
          <div key={pad.id} style={wrapperStyle(placement)}>
            <NGonPad
              pad={pad}
              size={placement.size}
              idleOpacity={placement.idleOpacity}
              borderOpacity={settings.borderOpacity}
              labelsOn={settings.labels}
              mousePadMode={settings.desktopMode === 'mousepad'}
              accent={ACCENTS[pad.id] || '#f59e0b'}
              wrapBorder={wrap?.border || null}
              wrapDeadSpace={wrap?.deadSpace || null}
              runtime={runtimeByPad[pad.id] || {}}
              editMode={arranging}
              onPress={onPress}
              onHold={onHold}
              onAnalog={onAnalog}
              onEditPointer={handleEditPointer}
            />
          </div>
        );
      })}

      {/* arrange-mode banner */}
      {arranging ? (
        <div className="absolute inset-x-0 top-16 flex justify-center" style={{ pointerEvents: 'auto' }}>
          <button
            onClick={() => setEditMode(false)}
            className="rounded-full border border-amber-300/70 bg-black/75 px-4 py-2 text-[11px] font-black tracking-widest text-amber-200"
            style={{ touchAction: 'manipulation' }}
          >ARRANGING — DRAG PADS · TAP TO FINISH</button>
        </div>
      ) : null}

      {/* settings gear — bottom center, out of the thumbs' way */}
      {!panelOpen ? (
        <button
          aria-label="Controller settings"
          onClick={() => setPanelOpen(true)}
          className="absolute bottom-0 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-white/25 bg-black/55 px-3 py-1.5 text-[10px] font-black tracking-widest text-white/75"
          style={{
            pointerEvents: dimmed ? 'none' : 'auto',
            touchAction: 'manipulation',
            marginBottom: 'max(0.45rem, env(safe-area-inset-bottom))',
            opacity: 0.65,
          }}
        >⚙ CONTROLS</button>
      ) : null}

      {panelOpen ? (
        <ControllerSettings
          settings={settings}
          onChange={onSettingsChange}
          onClose={() => setPanelOpen(false)}
          editMode={arranging}
          onToggleEditMode={() => {
            setEditMode((v) => !v);
            setPanelOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
