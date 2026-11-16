'use client';

// OrbButton — the ONE circle-orb control (Merlin, Nov 16, 2026 —
// STANDING LAW: every control under a game screen is a circle orb,
// never a rectangle; the maximize/fullscreen button sits at the very
// top right OF the game screen). PLAIN round buttons, the same kind
// as the existing joystick and JUMP circles (Merlin, Nov 16 ~01:10):
// NOT the Earth 1 collectible missile orbs — no glowing orb visuals,
// no video wraps, no missile-orb styling on any button. Just a flat
// circle with an icon over a short label. One shared shape for every
// world so the law cannot drift per page: a circle (default 56 px),
// the full wording kept in aria-label + title. Long text is
// shortened to a short label that fits inside the orb — it never runs
// under another button (the OMEGA LAYOUT law: no element may overlap
// another, ever).
//
// Props: children (icon + optional short label, stacked), ariaLabel
// (the full control name — required for icon-only orbs), title,
// active (filled accent = the on state), disabled, size, accent
// (border + text colour), bg, href (renders a link orb, e.g. Leave),
// style (positioning — the caller owns placement), plus any other
// button props (onClick, onPointerDown, aria-pressed, …) passed through.
export default function OrbButton({
  children,
  ariaLabel,
  title,
  active = false,
  disabled = false,
  size = 56,
  accent = '#e8a35c',
  bg,
  href,
  style,
  type = 'button',
  ...rest
}) {
  const orbStyle = {
    width: size,
    height: size,
    minWidth: size,
    minHeight: size,
    borderRadius: '50%',
    border: `2px solid ${accent}`,
    background: active ? accent : (bg || 'rgba(0,0,0,0.55)'),
    color: active ? '#160a04' : accent,
    fontWeight: 800,
    fontSize: 11,
    letterSpacing: 0.5,
    lineHeight: 1.15,
    cursor: disabled ? 'default' : 'pointer',
    display: 'inline-flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    padding: 4,
    textAlign: 'center',
    opacity: disabled ? 0.5 : 1,
    flexShrink: 0,
    touchAction: 'none',
    textDecoration: 'none',
    ...style,
  };
  const label = ariaLabel || title || '';
  if (href) {
    return (
      <a href={href} aria-label={label} title={title || label} style={orbStyle} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <button type={type} aria-label={label} title={title || label} disabled={disabled}
      style={orbStyle} {...rest}>
      {children}
    </button>
  );
}

// The short label that rides under an orb's icon — small enough to
// fit inside the circle, never truncated mid-word into another control.
export function OrbLabel({ children }) {
  return (
    <span style={{ fontSize: 9, letterSpacing: 1, lineHeight: 1, whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: '100%' }}>
      {children}
    </span>
  );
}
