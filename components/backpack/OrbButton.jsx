'use client';

// components/backpack/OrbButton.jsx
// THE ORB — the backpack's one selection control (Merlin, 2026-11-15).
//
// Every pick-one control in the backpack is an orb: a circular
// glowing control, selected = lit/filled. The tap target is
// 44px (the phone rule); the visible orb is 28px inside it.
// The look is the portal room's holographic idiom (components/
// PortalRoom.jsx): a conic sheen when lit, a dim hollow ring
// when not, a soft outer glow — readable, never a washout.
//
// One component, both panels: the profile section and the realm
// HUD import it, so selection looks and behaves the same
// everywhere the pack lives (cross-realm by construction).
//
// HOLO — the semi-holographic panel treatment, same idiom:
// translucent gradient panels, hue-tinted 1px borders, a soft
// inset glow. "Semi" means the text sits on a dark scrim — the
// gradient's lower half is near-opaque — so nothing washes out.

export const ORB_GOLD = '#ffd98a';
export const ORB_HOLO = '#8fd8ff';

/** The semi-holographic panel: translucent, glowing, readable. Spread onto a panel's style. */
export const HOLO_PANEL = {
  background:
    'linear-gradient(180deg, rgba(143,216,255,0.10) 0%, rgba(18,16,28,0.82) 45%, rgba(18,16,28,0.88) 100%)',
  border: '1px solid rgba(143,216,255,0.33)',
  boxShadow:
    '0 0 40px rgba(143,216,255,0.12) inset, 0 0 24px rgba(192,132,252,0.10)',
};

/** The holographic sheen layered over a panel that already has its own background (e.g. the profile pack's style gradient). */
export const HOLO_SHEEN =
  'linear-gradient(180deg, rgba(143,216,255,0.08) 0%, rgba(143,216,255,0.02) 45%, transparent 60%)';

/**
 * The orb visual alone (a span, not a button) — for embedding
 * inside a row button that is itself the control (the pack-style
 * picker rows are radio buttons; a button inside a button is
 * invalid HTML, so the row carries the orb as its visual).
 */
export function OrbVisual({ selected = false, tone = 'gold' }) {
  const glow = tone === 'cyan' ? ORB_HOLO : ORB_GOLD;
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'block',
        flexShrink: 0,
        width: 28,
        height: 28,
        borderRadius: '50%',
        border: selected ? 'none' : `2px solid ${glow}73`,
        background: selected
          ? 'conic-gradient(from 0deg, #7ef0c8, #8fd8ff, #c084fc, #ff7a1a, #7ef0c8)'
          : 'radial-gradient(circle at 35% 35%, rgba(143,216,255,0.14) 0%, transparent 70%)',
        boxShadow: selected
          ? `0 0 14px ${glow}cc, 0 0 28px rgba(143,216,255,0.45), inset 0 0 6px rgba(255,255,255,0.65)`
          : 'none',
        transition: 'box-shadow 160ms ease, background 160ms ease',
      }}
    />
  );
}

/**
 * A selection orb.
 *   selected: lit/filled when true, dim hollow ring when false.
 *   onSelect: the tap handler (selection IS the use for single-purpose items: equip, summon, hatch).
 *   label: accessible name ("Equip Revolver", "Summon Brachiosaurus", "Pick the GTA Street Pack").
 *   tone: 'gold' (default) or 'cyan'.
 *   role: 'radio' (style picker) or 'button' (everything else); aria-checked/aria-pressed set accordingly.
 */
export default function OrbButton({ selected = false, onSelect, label, tone = 'gold', role = 'button' }) {
  const checkedProps = role === 'radio'
    ? { role: 'radio', 'aria-checked': selected }
    : { 'aria-pressed': selected };
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={label}
      title={label}
      {...checkedProps}
      style={{
        flexShrink: 0,
        width: 44,
        height: 44,
        minWidth: 44,
        minHeight: 44,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
      }}
    >
      <OrbVisual selected={selected} tone={tone} />
    </button>
  );
}
