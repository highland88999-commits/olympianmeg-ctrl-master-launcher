// lib/concourse-actions.js
// THE CONCOURSE'S OWN CARDS in the merged menu (Merlin, Nov 18,
// 2026: "Concourse becomes the portal menu" — the Concourse
// landing IS the portal menu, and the Concourse's own tile menu
// rides beside it as the second panel).
//
// These are the Concourse tiles that are NOT portal destinations:
// the 5 exact duplicates (store, order-67, renewal-plan, profile,
// social-media-cheat-code) live once already, as portal cards in
// the portal panel, so they are NOT listed here; the 2
// self-referential tiles (Menu, Portals) are absorbed — the merged
// menu IS the menu. What remains is 14 items: the hub functions,
// the sheets/panels, and ARES. Each one wears its own portal video
// (public/videos/portals/<key>.mp4, wired in lib/portal-videos.js),
// so the tile panel shares the portal grid's card component.
//
// A card tap plays its video fullscreen first (the portal suck-in),
// then the action runs — the action variant of the card tap:
//   - route actions (hub, ares) travel through the Concourse's own
//     vortex ride (fireTile in components/Concourse.jsx)
//   - everything else fires its tile id on `olympus:concourse-open`
//     (fireTile) — the hub page, the layout sheets (Muse, bug,
//     alerts, radio) and the Concourse's own sheets (Phone,
//     Settings, FINTRAC, Tour) answer it, exactly as the old tile
//     grid's taps did. `tileId` is the id those listeners know;
//     `key` is the video key (ARES' tile id is the legacy `molly`,
//     its video key is `ares`).
//   - `section` is only the face-ring hue (lib/portal-roster.js
//     SECTION_HUES) — the tile panel is one unsectioned grid, so
//     every Concourse card wears the Concourse hue.
//
// Pure data — no imports — so node tests exercise it directly
// (tests/concourse-merge.test.mjs).

// The Concourse's own cards, in the old tile grid's composed order.
export const CONCOURSE_ACTION_ITEMS = Object.freeze([
  { key: 'hub', tileId: 'hub', title: 'Hub', subtitle: 'Back to the hub', section: 'CONCOURSE' },
  { key: 'tour', tileId: 'tour', title: 'Tour', subtitle: 'Guided tour of the hub', section: 'CONCOURSE' },
  { key: 'intro', tileId: 'intro', title: 'Intro', subtitle: 'Replay the hub intro', section: 'CONCOURSE' },
  { key: 'guide', tileId: 'guide', title: 'Guide', subtitle: 'Hub tutorial', section: 'CONCOURSE' },
  { key: 'night', tileId: 'night', title: 'Night', subtitle: 'Shadow Realm race', section: 'CONCOURSE' },
  { key: 'bike', tileId: 'bike', title: 'Bike', subtitle: 'TRON bike', section: 'CONCOURSE' },
  { key: 'muse', tileId: 'muse', title: 'Muse', subtitle: 'Your assistant', section: 'CONCOURSE' },
  { key: 'phone', tileId: 'phone', title: 'Phone', subtitle: 'In-app app drawer', section: 'CONCOURSE' },
  { key: 'radio', tileId: 'radio', title: 'Radio', subtitle: 'Spotify radio', section: 'CONCOURSE' },
  { key: 'alerts', tileId: 'alerts', title: 'Alerts', subtitle: 'Notifications', section: 'CONCOURSE' },
  { key: 'settings', tileId: 'settings', title: 'Settings', subtitle: 'Concourse settings', section: 'CONCOURSE' },
  { key: 'bug', tileId: 'bug', title: 'Bug', subtitle: 'Report a bug', section: 'CONCOURSE' },
  { key: 'fintrac', tileId: 'fintrac', title: 'FINTRAC', subtitle: 'FINTRAC explanation', section: 'CONCOURSE' },
  { key: 'ares', tileId: 'molly', title: 'ARES', subtitle: 'ARES defense', section: 'CONCOURSE' },
]);

// Hub-only cards — their actions live on the hub page alone (the
// hub intro/tutorial, the Shadow Realm race, the TRON bike), so
// off the hub they drop out of the tile panel, exactly as the old
// tile grid's hubOnly tiles did.
export const HUB_ONLY_CONCOURSE_TILE_IDS = Object.freeze([
  'intro',
  'guide',
  'night',
  'bike',
]);

// The exact duplicates — Concourse tiles that are ALSO portal
// destinations and so appear exactly once, as portal cards. The
// tile panel must never list one of these (tests pin it). The fifth
// duplicate, the Social Media Cheat Code banner, is not a tile —
// it is kept once as the TOOLS section banner in the portal panel.
export const DUPLICATE_CONCOURSE_TILE_IDS = Object.freeze([
  'store',
  'calls',
  'renewal',
  'profile',
]);
