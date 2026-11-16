'use client';

// components/world/ControlsCore.jsx — the UNIVERSAL CONTROLS CORE,
// React half (Merlin, Nov 16 ~03:49). ONE shared implementation of
// the confirmed universal controls; every world consumes it, no
// per-world copies of the control layer. Worlds keep their own
// content (vehicles, monsters, art); the controls come from here.
//
// What the core renders (only the slots the world actually has —
// a world opts in per slot, nothing is invented for it):
//   · joystick FIXED bottom-left (shared WalkJoystick) — works,
//     never moves, never docked.
//   · right column, top-to-bottom BACKPACK / JUMP / FIRE, each orb
//     free-floating draggable through the shared orb dock
//     (useOrbDock, one `olympus:<world>:orb-dock:v1` key) with the
//     home slots from lib/world/controls-core.js. JUMP wears the
//     tron-jump face, FIRE the tron-reticle face (per-function faces,
//     OrbButton fn=). BACKPACK has no TRON face yet and wears its
//     icon + label until one is drawn.
//   · HP pill + ORBS counter orb, top-left — only when the world
//     has a merchant (onOpenMerchant); clicking ORBS opens it.
//   · control-instructions hint pill, top-centre, fades after 5 s.
//   · fullscreen orb, very top-right — only when the world has a
//     fullscreen mode (onToggleFullscreen).
//   · children: the world's own extra orbs (fly/tour/rover…), which
//     the caller positions — the core never places them.
//
// What the core does NOT own: the scene's drag-look (stays in the
// scene; the shared step is dragLookStep in lib/world/controls-core.js,
// for the next pass with Merlin's phone check), the recenter math
// (recenterLookOffset in lib/planet-walker.js, consumed, never
// re-implemented), or any world content.
//
// Props — what a world passes in:
//   world (required): dock key slug, e.g. 'mars-2'.
//   accent: the world's orb accent colour.
//   onMove(x, y): joystick — x strafe (-1..1), y fwd (-1..1).
//   onJump(): JUMP pressed (edge — called on pointerdown).
//   onFire(): FIRE pressed (edge — fires the backpack weapon).
//   onOpenBackpack(): BACKPACK orb tapped.
//   onOpenMerchant(): ORBS orb tapped; also shows the HP/ORBS pill.
//   hp, orbs: numbers for the top-left pill (null hides each half).
//   hint: instruction text, or null for no hint pill.
//   fullscreen (bool), onToggleFullscreen(): the top-right orb.
//   columnBottom: px floor of the right column (default 14; worlds
//     with a bottom-right button row pass a higher floor so the
//     column parks above it — Earth 3 / Earth 4 pass 80).

import { useEffect, useState } from 'react';
import WalkJoystick from '@/components/world/WalkJoystick';
import OrbButton, { OrbLabel } from '@/components/world/OrbButton';
import { useOrbDock } from '@/components/world/useOrbDock';
import {
  resolveControlsCore,
  rightColumnHomeSlots,
  visibleSlots,
  JOYSTICK_HOME,
  JOYSTICK_SIZE,
  ORB_SIZE,
  CONTROLS_HINT_FADE_MS,
  CONTROLS_HINT_FADE_OUT_MS,
} from '@/lib/world/controls-core';

export default function ControlsCore({
  world,
  accent,
  onMove,
  onJump,
  onFire,
  onOpenBackpack,
  onOpenMerchant,
  hp,
  orbs,
  hint,
  fullscreen,
  onToggleFullscreen,
  columnBottom,
  children,
}) {
  const config = resolveControlsCore({
    world,
    accent,
    showJoystick: typeof onMove === 'function',
    showJump: typeof onJump === 'function',
    showFire: typeof onFire === 'function',
    showBackpack: typeof onOpenBackpack === 'function',
    showHpOrbs: typeof onOpenMerchant === 'function',
    showFullscreen: typeof onToggleFullscreen === 'function',
    showHint: typeof hint === 'string' && hint.length > 0,
    columnBottom,
    hint,
    hp,
    orbs,
  });
  const dock = useOrbDock(config.world);
  const slots = visibleSlots(config);
  const home = rightColumnHomeSlots(config.columnBottom);

  // Hint pill: on screen for 5 s, fading over the last 500 ms.
  const [hintShown, setHintShown] = useState(!!config.hint);
  const [hintFading, setHintFading] = useState(false);
  useEffect(() => {
    if (!config.hint) return undefined;
    setHintShown(true);
    setHintFading(false);
    const t1 = setTimeout(() => setHintFading(true), CONTROLS_HINT_FADE_MS - CONTROLS_HINT_FADE_OUT_MS);
    const t2 = setTimeout(() => setHintShown(false), CONTROLS_HINT_FADE_MS);
    return () => { clearTimeout(t1); clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.hint]);

  const showHpOrbs = config.showHpOrbs && (config.hp !== null || config.orbs !== null);

  return (
    <div aria-label="World controls"
      style={{ position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none' }}>
      {/* Joystick — FIXED bottom-left, never docked, never moves. */}
      {config.showJoystick && (
        <div style={{ position: 'absolute', left: JOYSTICK_HOME.left, bottom: `calc(${JOYSTICK_HOME.bottom}px + env(safe-area-inset-bottom))`, zIndex: 6, pointerEvents: 'auto' }}>
          <WalkJoystick onMove={onMove} size={JOYSTICK_SIZE} />
        </div>
      )}

      {/* Right column, top-to-bottom BACKPACK / JUMP / FIRE. Each orb
          drags individually through the shared dock; the home slot
          is its floor position until the user moves it. */}
      {slots.includes('backpack') && (
        <div {...dock.bind('backpack')} style={{ ...dock.styleFor('backpack', home.backpack), pointerEvents: 'auto' }}>
          <OrbButton accent={config.accent} size={ORB_SIZE} ariaLabel="Open backpack"
            onClick={() => { if (!dock.tapGuard()) onOpenBackpack(); }}>
            <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>🎒</span>
            <OrbLabel>PACK</OrbLabel>
          </OrbButton>
        </div>
      )}
      {slots.includes('jump') && (
        <div {...dock.bind('jump', { onPointerDown: () => onJump() })} style={{ ...dock.styleFor('jump', home.jump), pointerEvents: 'auto' }}>
          <OrbButton fn="jump" accent={config.accent} size={ORB_SIZE} ariaLabel="Jump">
            <OrbLabel>JUMP</OrbLabel>
          </OrbButton>
        </div>
      )}
      {slots.includes('fire') && (
        <div {...dock.bind('fire', { onPointerDown: () => onFire() })} style={{ ...dock.styleFor('fire', home.fire), pointerEvents: 'auto' }}>
          <OrbButton fn="fire" accent={config.accent} size={ORB_SIZE} ariaLabel="Fire weapon">
            <OrbLabel>FIRE</OrbLabel>
          </OrbButton>
        </div>
      )}

      {/* HP pill + ORBS counter orb, top-left. ORBS opens the merchant. */}
      {showHpOrbs && (
        <div style={{ position: 'absolute', left: 14, top: 14, zIndex: 8, display: 'flex', gap: 8, alignItems: 'center', pointerEvents: 'auto' }}>
          {config.hp !== null && (
            <span role="status" aria-label={`Health ${config.hp}`}
              style={{ background: 'rgba(0,0,0,0.55)', border: `2px solid ${config.accent}`, borderRadius: 999, padding: '6px 12px', fontSize: 12, fontWeight: 800, letterSpacing: 1, color: config.accent, whiteSpace: 'nowrap' }}>
              ♥ {config.hp}
            </span>
          )}
          {config.orbs !== null && (
            <OrbButton accent={config.accent} size={48} ariaLabel={`Elemental orbs: ${config.orbs}. Open merchant for upgrades`}
              onClick={onOpenMerchant}>
              <span aria-hidden="true" style={{ fontSize: 14, lineHeight: 1 }}>◆ {config.orbs}</span>
              <OrbLabel>ORBS</OrbLabel>
            </OrbButton>
          )}
        </div>
      )}

      {/* Fullscreen orb — the very top right OF the game screen. */}
      {config.showFullscreen && (
        <OrbButton fn={fullscreen ? 'fullscreen-exit' : 'fullscreen'} accent={config.accent}
          ariaLabel={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          onClick={onToggleFullscreen}
          style={{ position: 'absolute', right: 14, top: 14, zIndex: 9, pointerEvents: 'auto' }}>
          <span aria-hidden="true" style={{ fontSize: 20, lineHeight: 1 }}>⛶</span>
          <OrbLabel>{fullscreen ? 'EXIT' : 'FULL'}</OrbLabel>
        </OrbButton>
      )}

      {/* Control-instructions hint pill — fades after 5 seconds. */}
      {config.hint && hintShown && (
        <div role="status"
          style={{
            position: 'absolute', left: '50%', top: 12, transform: 'translateX(-50%)',
            zIndex: 8, maxWidth: 'calc(100% - 130px)', textAlign: 'center',
            background: 'rgba(0,0,0,0.65)', border: `1px solid ${config.accent}`,
            borderRadius: 999, padding: '7px 14px', fontSize: 12, letterSpacing: 0.5,
            color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            opacity: hintFading ? 0 : 1, transition: 'opacity 500ms ease',
            pointerEvents: 'none',
          }}>
          {config.hint}
        </div>
      )}

      {children}
    </div>
  );
}
