'use client';

// components/world/VehicleSelectMenu.jsx — THE ONE shared vehicle
// selection menu (Merlin, Nov 16 ~03:49 — UNIVERSAL CONTROLS CORE,
// workstream E).
//
// For worlds where MORE THAN ONE vehicle can be summoned, clicking
// SUMMON opens THIS menu instead of summoning directly. One
// implementation, not per-world copies: the caller maps its roster
// into options (lib/world/vehicle-select.js normalizeVehicleOptions
// and friends), this menu wears them, and the caller's onSelect
// spawns the pick — with the user in it, ready to go, front-
// forward (the shared summonSpawnPose in that module).
//
// ORBS ONLY (the CIRCLE ORB CONTROLS LAW): every selection is a
// plain circle orb, never a rectangle. Each orb wears a graphic of
// THAT vehicle in the button — a TRON-house-style side profile
// styled after the actual machine (class, stance, colour) — and
// NO WORDS on the orbs: the name rides in the aria-label / title
// and in the detail line under the grid, never printed on the orb.
// The menu fits one frame (the grid scrolls inside its own box
// when a roster runs long — Earth 1's 19 — instead of running
// off the screen) and is dismissible (the CLOSE orb, top right,
// plus onClose).
//
// MODES: as a full overlay (default — Star Wars summon) it
// centres itself over the game; embedded (embedded — Earth 1's
// entry menu, the Shadow Realm garage) it renders as a plain
// panel the parent places, with no title bar and no close orb,
// and onSelect only SELECTS (the parent's own spawn step still
// runs — Earth 1's globe tap, the garage's launch button).
//
// Props: options [{ id, name, blurb, art }], selectedId (the
// currently picked id — the orb wears the active fill), onSelect
// (option) — required, onClose () — omit to hide the dismiss
// orb, title (heading text; default 'Choose your ride'),
// showTitle (default true; embedded callers hide it), accent,
// orbSize (default 56), columns (default fits the roster).

import OrbButton, { OrbFace } from './OrbButton';
import { vehicleMenuColumns } from '@/lib/world/vehicle-select';

export default function VehicleSelectMenu({
  options = [],
  selectedId = null,
  onSelect,
  onClose = null,
  title = 'Choose your ride',
  showTitle = true,
  accent = '#2ee8d8',
  orbSize = 56,
  columns = null,
  embedded = false,
}) {
  const list = Array.isArray(options) ? options : [];
  const cols = columns || vehicleMenuColumns(list.length);
  const selected = list.find((o) => o && o.id === selectedId) || null;

  const grid = (
    <div
      role="listbox"
      aria-label={title}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, ${orbSize}px)`,
        gap: 10,
        justifyContent: 'center',
        overflowY: 'auto',
        maxHeight: '46dvh',
        padding: 2,
      }}
    >
      {list.map((opt) => (
        <OrbButton
          key={opt.id}
          role="option"
          aria-selected={opt.id === selectedId}
          art={opt.art}
          ariaLabel={opt.name}
          title={opt.name}
          active={opt.id === selectedId}
          size={orbSize}
          accent={accent}
          onClick={() => { if (onSelect) onSelect(opt); }}
        />
      ))}
    </div>
  );

  const detail = selected ? (
    <div style={{ marginTop: 10, textAlign: 'center', minHeight: 32 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>{selected.name}</div>
      {selected.blurb ? (
        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{selected.blurb}</div>
      ) : null}
    </div>
  ) : (
    <div style={{ marginTop: 10, textAlign: 'center', minHeight: 32 }}>
      <div style={{ fontSize: 11, color: '#6b7280' }}>Tap a ride — it spawns with you in it.</div>
    </div>
  );

  const panel = (
    <div
      style={{
        background: 'rgba(9, 12, 16, 0.96)',
        border: `1px solid ${accent}55`,
        borderRadius: 16,
        padding: 14,
        // Embedded (Earth 1's 22rem entry column, the Shadow
        // Realm garage) the panel fills its parent — a fixed
        // 24rem would clip against the parent's overflow.
        width: embedded ? '100%' : 'min(92vw, 24rem)',
        boxShadow: '0 0 30px rgba(46, 232, 216, 0.12)',
      }}
    >
      {showTitle ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.25em', textTransform: 'uppercase', color: accent }}>
            {title}
          </div>
          {onClose ? (
            <OrbButton fn="close" ariaLabel="Close — no vehicle summoned" size={36} accent={accent}
              onClick={onClose} />
          ) : null}
        </div>
      ) : null}
      {grid}
      {detail}
    </div>
  );

  if (embedded) return panel;
  return (
    <div
      role="dialog"
      aria-label={title}
      style={{
        position: 'absolute', inset: 0, zIndex: 90,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'auto',
      }}
    >
      {panel}
    </div>
  );
}

// Re-exported so callers that already import the menu get the
// face helper in one place (OrbFace is the per-function face).
export { OrbFace };
