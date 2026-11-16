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
// ONE GRAPHIC PER BUTTON FUNCTION (Merlin, Nov 16 ~02:42 + the UNIFY
// order): the same function wears the same face in every realm, so a
// player recognises JUMP on Jupiter 2, Hollow Earth, or the Moon
// without reading. Pass fn="jump" (see ORB_FUNCTIONS below) and the
// orb wears that function's TRON face; the caller's children keep
// their meaning (label, damage, state word).
//
// Props: children (icon + optional short label, stacked), fn (the
// button's function key — see ORB_FUNCTIONS below), art (a custom
// full-bleed face image, e.g. a vehicle face from the selection
// menu — used instead of fn when the orb wears a picture of a
// THING rather than a function), ariaLabel
// (the full control name — required for icon-only orbs), title,
// active (filled accent = the on state), disabled, size, accent
// (border + text colour), bg, href (renders a link orb, e.g. Leave),
// style (positioning — the caller owns placement), plus any other
// button props (onClick, onPointerDown, aria-pressed, …) passed through.
export default function OrbButton({
  children,
  fn,
  art,
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
    // A faced orb positions its art against itself; the caller's
    // own position (absolute, when placed) still wins below.
    ...((fn || art) ? { position: 'relative' } : null),
    ...style,
  };
  const label = ariaLabel || title || '';
  // fn: the button's function — its one shared graphic face (see
  // ORB_FUNCTIONS below). The face wears the art; the caller's
  // children keep their meaning (label, damage, state word).
  // art: a custom full-bleed face (the vehicle-selection menu) —
  // the same full-bleed wear as an icon-only fn orb, a missing
  // file hiding itself so the caller's text shows through.
  const content = fn ? <OrbFace fn={fn} size={size}>{children}</OrbFace>
    : art ? (
      <span aria-hidden="true" style={{ position: 'absolute', inset: 0, borderRadius: '50%', overflow: 'hidden', pointerEvents: 'none' }}>
        <img src={art} alt="" aria-hidden="true" draggable={false}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          onError={(e) => { e.currentTarget.style.display = 'none'; }} />
      </span>
    ) : children;
  if (href) {
    return (
      <a href={href} aria-label={label} title={title || label} style={orbStyle} {...rest}>
        {content}
      </a>
    );
  }
  return (
    <button type={type} aria-label={label} title={title || label} disabled={disabled}
      style={orbStyle} {...rest}>
      {content}
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

// --- ONE GRAPHIC PER BUTTON FUNCTION (Merlin, Nov 16 ~02:42 + the
// UNIFY order) -----------------------------------------------------------
// The same function wears the same face in every realm: JUMP on
// Jupiter 2, Hollow Earth, the Moon, or Earth 3 is one graphic, so a
// player recognises it without reading. The art is the TRON house
// style — a flat printed disc, never a video and never a glowing
// missile orb: the plain circle stays, the art is only the FACE.
// REUSED as-is, the 8 TRON motion graphics that already live in
// public/images/shadow-realm/ui/ (worn today by the Shadow Realm
// ride controls): boost, gas, brake, steer-left, steer-right,
// recenter, pause, leave. The rest were drawn in the same style,
// same 256x256 webp, by scripts/gen-tron-orb-art.py — re-run it to
// regenerate; it never touches the 8 originals. `label` is the short
// word that rides under the face; `art` is the face file.
export const ORB_FUNCTIONS = {
  // Movement — shared by every walking/driving world.
  jump: { label: 'JUMP', art: '/images/shadow-realm/ui/tron-jump.webp' },
  sprint: { label: 'SPRINT', art: '/images/shadow-realm/ui/tron-sprint.webp' },
  walk: { label: 'WALK', art: '/images/shadow-realm/ui/tron-walk.webp' },
  fly: { label: 'FLY', art: '/images/shadow-realm/ui/tron-fly.webp' },
  orbit: { label: 'ORBIT', art: '/images/shadow-realm/ui/tron-orbit.webp' },
  ascend: { label: 'UP', art: '/images/shadow-realm/ui/tron-ascend.webp' },
  descend: { label: 'DOWN', art: '/images/shadow-realm/ui/tron-descend.webp' },
  // Combat.
  shoot: { label: 'SHOOT', art: '/images/shadow-realm/ui/tron-shoot.webp' },
  strike: { label: 'STRIKE', art: '/images/shadow-realm/ui/tron-strike.webp' },
  fire: { label: 'FIRE', art: '/images/shadow-realm/ui/tron-reticle.webp' },
  weapon: { label: 'WEAPON', art: '/images/shadow-realm/ui/tron-weapon.webp' },
  'buy-weapon': { label: 'BOLT', art: '/images/shadow-realm/ui/tron-buy-weapon.webp' },
  'buy-shield': { label: 'SHIELD', art: '/images/shadow-realm/ui/tron-buy-shield.webp' },
  recharge: { label: 'RECHARGE', art: '/images/shadow-realm/ui/tron-recharge.webp' },
  grapple: { label: 'HOOK', art: '/images/shadow-realm/ui/tron-grapple.webp' },
  'steal-egg': { label: 'STEAL', art: '/images/shadow-realm/ui/tron-steal-egg.webp' },
  oblivion: { label: 'ARMED', art: '/images/shadow-realm/ui/tron-oblivion.webp' },
  // Mounts + vehicles.
  mount: { label: 'MOUNT', art: '/images/shadow-realm/ui/tron-mount.webp' },
  dismount: { label: 'OFF', art: '/images/shadow-realm/ui/tron-dismount.webp' },
  summon: { label: 'SUMMON', art: '/images/shadow-realm/ui/tron-summon.webp' },
  board: { label: 'RIDE', art: '/images/shadow-realm/ui/tron-board.webp' },
  // Driving — the TRON motion graphics, reused as-is.
  boost: { label: 'BOOST', art: '/images/shadow-realm/ui/tron-boost.webp' },
  gas: { label: 'GAS', art: '/images/shadow-realm/ui/tron-gas.webp' },
  brake: { label: 'BRAKE', art: '/images/shadow-realm/ui/tron-brake.webp' },
  'steer-left': { label: 'STEER L', art: '/images/shadow-realm/ui/tron-steer-left.webp' },
  'steer-right': { label: 'STEER R', art: '/images/shadow-realm/ui/tron-steer-right.webp' },
  // Navigation + world.
  map: { label: 'MAP', art: '/images/shadow-realm/ui/tron-map.webp' },
  home: { label: 'HOME', art: '/images/shadow-realm/ui/tron-home.webp' },
  'back-to-hub': { label: 'BACK', art: '/images/shadow-realm/ui/tron-back-to-hub.webp' },
  leave: { label: 'LEAVE', art: '/images/shadow-realm/ui/tron-leave.webp' },
  portal: { label: 'PORTAL', art: '/images/shadow-realm/ui/tron-portal.webp' },
  here: { label: 'HERE', art: '/images/shadow-realm/ui/tron-here.webp' },
  visit: { label: 'VISIT', art: '/images/shadow-realm/ui/tron-visit.webp' },
  claim: { label: 'CLAIM', art: '/images/shadow-realm/ui/tron-claim.webp' },
  mission: { label: 'MISSION', art: '/images/shadow-realm/ui/tron-mission.webp' },
  // Hollow Earth picks (Merlin, Nov 16 — the hunter-pick +
  // missions-map orb rework): each hero, cluster and mission
  // wears its own face, drawn by scripts/gen-hero-orb-art.py.
  // The pick IS the orb — no words on it; the full name rides
  // in the caller's aria-label.
  'hero-monster-hunter': { label: 'KAEL', art: '/images/shadow-realm/ui/tron-hero-monster-hunter.webp' },
  'hero-wizard': { label: 'PILGRIM', art: '/images/shadow-realm/ui/tron-hero-wizard.webp' },
  'hero-ranger': { label: 'RANGER', art: '/images/shadow-realm/ui/tron-hero-ranger.webp' },
  'hero-elf-archer': { label: 'ELF', art: '/images/shadow-realm/ui/tron-hero-elf-archer.webp' },
  'hero-dwarf': { label: 'DWARF', art: '/images/shadow-realm/ui/tron-hero-dwarf.webp' },
  'hero-halfling': { label: 'HALFLING', art: '/images/shadow-realm/ui/tron-hero-halfling.webp' },
  'cluster-wilds': { label: 'WILDS', art: '/images/shadow-realm/ui/tron-cluster-wilds.webp' },
  'cluster-stormlands': { label: 'STORMLANDS', art: '/images/shadow-realm/ui/tron-cluster-stormlands.webp' },
  'cluster-dark-reaches': { label: 'REACHES', art: '/images/shadow-realm/ui/tron-cluster-dark-reaches.webp' },
  'mission-ooze-crossing': { label: 'OOZE', art: '/images/shadow-realm/ui/tron-mission-ooze-crossing.webp' },
  'mission-mire-hunt': { label: 'MIRE', art: '/images/shadow-realm/ui/tron-mission-mire-hunt.webp' },
  'mission-pylon-run': { label: 'PYLON', art: '/images/shadow-realm/ui/tron-mission-pylon-run.webp' },
  'mission-storm-hunt': { label: 'STORM', art: '/images/shadow-realm/ui/tron-mission-storm-hunt.webp' },
  'mission-wreck-field': { label: 'WRECK', art: '/images/shadow-realm/ui/tron-mission-wreck-field.webp' },
  'mission-gloom-hunt': { label: 'GLOOM', art: '/images/shadow-realm/ui/tron-mission-gloom-hunt.webp' },
  'mission-throne-road': { label: 'THRONE', art: '/images/shadow-realm/ui/tron-mission-throne-road.webp' },
  tour: { label: 'TOUR', art: '/images/shadow-realm/ui/tron-tour.webp' },
  'tour-prev': { label: 'PREV', art: '/images/shadow-realm/ui/tron-tour-prev.webp' },
  'tour-next': { label: 'NEXT', art: '/images/shadow-realm/ui/tron-tour-next.webp' },
  atlas: { label: 'ATLAS', art: '/images/shadow-realm/ui/tron-atlas.webp' },
  autopilot: { label: 'AUTO', art: '/images/shadow-realm/ui/tron-autopilot.webp' },
  // Trade + economy.
  trade: { label: 'TRADE', art: '/images/shadow-realm/ui/tron-trade.webp' },
  exchange: { label: 'EXCHANGE', art: '/images/shadow-realm/ui/tron-exchange.webp' },
  'trade-fossils': { label: 'FOSSILS', art: '/images/shadow-realm/ui/tron-trade-fossils.webp' },
  // Building.
  build: { label: 'BUILD', art: '/images/shadow-realm/ui/tron-build.webp' },
  style: { label: 'STYLE', art: '/images/shadow-realm/ui/tron-style.webp' },
  place: { label: 'PLACE', art: '/images/shadow-realm/ui/tron-place.webp' },
  edit: { label: 'EDIT', art: '/images/shadow-realm/ui/tron-edit.webp' },
  turn: { label: 'TURN', art: '/images/shadow-realm/ui/tron-turn.webp' },
  orient: { label: 'FLIP', art: '/images/shadow-realm/ui/tron-orient.webp' },
  delete: { label: 'DEL', art: '/images/shadow-realm/ui/tron-delete.webp' },
  done: { label: 'DONE', art: '/images/shadow-realm/ui/tron-done.webp' },
  // Time + sky.
  'live-time': { label: 'LIVE', art: '/images/shadow-realm/ui/tron-live-time.webp' },
  'time-dawn': { label: 'DAWN', art: '/images/shadow-realm/ui/tron-time-dawn.webp' },
  'time-day': { label: 'DAY', art: '/images/shadow-realm/ui/tron-time-day.webp' },
  'time-dusk': { label: 'DUSK', art: '/images/shadow-realm/ui/tron-time-dusk.webp' },
  'time-night': { label: 'NIGHT', art: '/images/shadow-realm/ui/tron-time-night.webp' },
  // Camera + console.
  recenter: { label: 'RECENTER', art: '/images/shadow-realm/ui/tron-recenter.webp' },
  'drive-cam': { label: 'CAM', art: '/images/shadow-realm/ui/tron-drive-cam.webp' },
  'flight-axis': { label: 'AXIS', art: '/images/shadow-realm/ui/tron-flight-axis.webp' },
  console: { label: 'CONSOLE', art: '/images/shadow-realm/ui/tron-console.webp' },
  minimize: { label: 'MIN', art: '/images/shadow-realm/ui/tron-minimize.webp' },
  expand: { label: 'EXPAND', art: '/images/shadow-realm/ui/tron-expand.webp' },
  // Hell deeds.
  forge: { label: 'FORGE', art: '/images/shadow-realm/ui/tron-forge.webp' },
  ferry: { label: 'FERRY', art: '/images/shadow-realm/ui/tron-ferry.webp' },
  guide: { label: 'GUIDE', art: '/images/shadow-realm/ui/tron-guide.webp' },
  // Chrome.
  'fullscreen': { label: 'FULL', art: '/images/shadow-realm/ui/tron-fullscreen.webp' },
  'fullscreen-exit': { label: 'EXIT', art: '/images/shadow-realm/ui/tron-fullscreen-exit.webp' },
  close: { label: 'CLOSE', art: '/images/shadow-realm/ui/tron-close.webp' },
  pause: { label: 'HOLD', art: '/images/shadow-realm/ui/tron-pause.webp' },
  info: { label: 'INFO', art: '/images/shadow-realm/ui/tron-info.webp' },
};

// OrbFace — the per-function graphic worn by an orb. Icon-only orbs
// wear it full-bleed, the Shadow Realm glyphFace pattern (the art
// fills the circle; a missing file hides itself and the caller's
// text shows through as the fallback). Labelled orbs wear it as a
// medallion above the label, the way the emoji sat before it. Either
// way the circle stays a plain circle — the art is the FACE, not a
// new shape. An unknown fn renders no face, only the children.
export function OrbFace({ fn, size = 56, children }) {
  const entry = ORB_FUNCTIONS[fn];
  if (!entry) return <>{children}</>;
  const img = (
    <img src={entry.art} alt="" aria-hidden="true" draggable={false}
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      onError={(e) => { e.currentTarget.style.display = 'none'; }} />
  );
  if (!children) {
    return (
      <span aria-hidden="true" style={{ position: 'absolute', inset: 0, borderRadius: '50%', overflow: 'hidden', pointerEvents: 'none' }}>
        {img}
      </span>
    );
  }
  const m = Math.max(24, Math.round(size * 0.52));
  return (
    <>
      <span aria-hidden="true" style={{ position: 'relative', width: m, height: m, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
        {img}
      </span>
      {children}
    </>
  );
}
