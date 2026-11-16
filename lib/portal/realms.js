// lib/portal/realms.js — THE PORTAL SYSTEM data (Merlin, Nov 13, 2026).
//
// Two nanite particle portals in the hub, both HORIZONTAL — flat
// discs/rings lying flat, not vertical doorways (Merlin's correction,
// Nov 13 ~01:34):
//   · HEAVEN REALMS PORTAL — a horizontal disc ABOVE the tower top,
//     aurora system, transparent effect, aurora field streaming down.
//   · NETHER-REALMS PORTAL — a horizontal disc BELOW Earth (where the
//     descent starts), filled with nanites / light particles.
//
// The 10 satellites and the 4 pyramids stay exactly as they are;
// nothing else in the hub moves.
//
// REALM ASSIGNMENT (Merlin, Nov 13 ~01:20–01:21):
//   · heaven-mythos realms live in the UPPER portal;
//   · nether-realm-mythos realms live in the BOTTOM portal;
//   · ORUN lives in BOTH — that which serves both sides can live
//     in both;
//   · ELYSIUM lives in BOTH places — the Elysium field inside Hades
//     (nether-realm) and the standalone higher realm /elysium.
//     Default: two doors into ONE Elysium (same route, one realm).
//
// HUES: each realm's transit hue is its own first torch/light colour
// from its world module (lib/<realm>/world.js TORCH_COLORS or
// LIGHT_COLORS) — the realm tints its own tunnel, nothing invented.
//
// Pure: no DOM, no React — node tests drive this module directly.

import { ORBIT_CENTER, EARTH_CENTER, EARTH_RADIUS } from '../god-orbits.js';

/**
 * HEAVEN PORTAL — horizontal disc above the tower top.
 * The towers stand on a ring at ORBIT_CENTER.y (35) with their tops
 * at ~74 (god label 24.5 inner × 1.6 scale + 35); the disc sits at
 * y 100, clear above every tower, centred on the hub axis so the
 * aurora field streams down over Earth below.
 */
export const HEAVEN_PORTAL = {
  key: 'heaven-portal',
  label: 'Heaven Realms',
  center: [ORBIT_CENTER.x, 100, ORBIT_CENTER.z],
  radius: 42,
  ringRadius: 46,
};

/**
 * NETHER PORTAL — horizontal disc below Earth, where the descent
 * starts. Earth bottom is EARTH_CENTER.y − EARTH_RADIUS (−85);
 * the disc sits 35 below Earth's underside, derived from the centre
 * so it follows Earth if Earth ever moves again.
 */
export const NETHER_PORTAL = {
  key: 'nether-portal',
  label: 'Nether-Realms',
  center: [EARTH_CENTER.x, EARTH_CENTER.y - EARTH_RADIUS - 35, EARTH_CENTER.z],
  radius: 42,
  ringRadius: 46,
};

/** Unlock rule: 1 Nether Realm visit opens the Heaven portal. */
export const HEAVEN_UNLOCK_VISITS = 1;

/** Portal Gun rule: earned at 10 portals entered. */
export const PORTAL_GUN_VISITS = 10;

/**
 * Every realm the portals reach. side: 'heaven' | 'nether' | 'both'.
 * Orun serves both sides; Elysium has two doors into one realm.
 * Routes are the live app routes (all 25 exist under app/).
 */
export const PORTAL_REALMS = [
  // ——— Nether-realms (bottom portal) ———
  { key: 'hades', label: 'Hades', route: '/nether-realm', side: 'nether', hue: '#ffb03a', mythos: 'Greek' },
  { key: 'helheim', label: 'Helheim', route: '/helheim', side: 'nether', hue: '#8fd8ff', mythos: 'Norse' },
  { key: 'duat', label: 'Duat', route: '/duat', side: 'nether', hue: '#ffb03a', mythos: 'Egyptian' },
  { key: 'hell', label: 'Hell', route: '/hell', side: 'nether', hue: '#ff5a1a', mythos: 'Christian' },
  { key: 'naraka', label: 'Naraka', route: '/naraka', side: 'nether', hue: '#6fb1ff', mythos: 'Hindu' },
  { key: 'yomi', label: 'Yomi', route: '/yomi', side: 'nether', hue: '#6fb1ff', mythos: 'Japanese' },
  { key: 'annwn', label: 'Annwn', route: '/annwn', side: 'nether', hue: '#6fb1ff', mythos: 'Celtic' },
  { key: 'mictlan', label: 'Mictlan', route: '/mictlan', side: 'nether', hue: '#ff5a2a', mythos: 'Aztec' },
  { key: 'xibalba', label: 'Xibalba', route: '/xibalba', side: 'nether', hue: '#ff5a2a', mythos: 'Maya' },
  { key: 'kur', label: 'Kur', route: '/kur', side: 'nether', hue: '#e07a2a', mythos: 'Mesopotamian' },
  { key: 'nav', label: 'Nav', route: '/nav', side: 'nether', hue: '#7ce8a8', mythos: 'Slavic' },
  { key: 'diyu', label: 'Diyu', route: '/diyu', side: 'nether', hue: '#ff4a2a', mythos: 'Chinese' },
  { key: 'orun', label: 'Orun', route: '/orun', side: 'both', hue: '#ffd27a', mythos: 'Yoruba' },
  // ——— Higher realms (upper portal) ———
  { key: 'elysium', label: 'Elysium', route: '/elysium', side: 'both', hue: '#ffe1a8', mythos: 'Greek' },
  { key: 'valhalla', label: 'Valhalla', route: '/valhalla', side: 'heaven', hue: '#ffcf5e', mythos: 'Norse' },
  { key: 'aaru', label: 'Aaru', route: '/aaru', side: 'heaven', hue: '#ffe27a', mythos: 'Egyptian' },
  { key: 'heaven', label: 'Heaven', route: '/heaven', side: 'heaven', hue: '#ffd98a', mythos: 'Christian' },
  { key: 'svarga', label: 'Svarga', route: '/svarga', side: 'heaven', hue: '#ffd98a', mythos: 'Hindu' },
  { key: 'takamagahara', label: 'Takamagahara', route: '/takamagahara', side: 'heaven', hue: '#ffd98a', mythos: 'Japanese' },
  { key: 'tir-na-nog', label: 'Tír na nÓg', route: '/tir-na-nog', side: 'heaven', hue: '#7dff9a', mythos: 'Celtic' },
  { key: 'tlalocan', label: 'Tlalocan', route: '/tlalocan', side: 'heaven', hue: '#4dffd2', mythos: 'Aztec' },
  { key: 'maya-sky', label: 'Maya Sky', route: '/maya-sky', side: 'heaven', hue: '#ffd166', mythos: 'Maya' },
  { key: 'vyraj', label: 'Vyraj', route: '/vyraj', side: 'heaven', hue: '#ffb3d9', mythos: 'Slavic' },
  { key: 'tiangong', label: 'Tiangong', route: '/tiangong', side: 'heaven', hue: '#ffd166', mythos: 'Chinese' },
];

/** One realm by key, or null. */
export function portalRealmByKey(key) {
  return PORTAL_REALMS.find((r) => r.key === key) || null;
}

/**
 * The realms one portal shows.
 *   'heaven' → the 11 higher realms + Orun (12 cards);
 *   'nether' → the 14 nether-realms + Elysium's field door (15 cards);
 *   'gun'    → all 24 unique realms (the gun opens every door).
 * Elysium's nether card carries the field note (same route, one realm).
 */
export function realmsForSide(side) {
  if (side === 'gun') return PORTAL_REALMS.slice();
  if (side === 'heaven') return PORTAL_REALMS.filter((r) => r.side === 'heaven' || r.side === 'both');
  if (side === 'nether') return PORTAL_REALMS.filter((r) => r.side === 'nether' || r.side === 'both');
  return [];
}

/** The transit hue for a realm key (its own torch/light colour). */
export function hueForRealm(key) {
  const realm = portalRealmByKey(key);
  return realm ? realm.hue : '#7c3aed';
}

/** The room note for a card: Elysium's nether door is the field inside Hades. */
export function realmCardNote(realm, side) {
  if (realm.key === 'elysium' && side === 'nether') return 'The field inside Hades — one Elysium, two doors.';
  if (realm.key === 'orun') return 'Serves both sides — heaven and hell alike.';
  return '';
}

/** Room lighting palette per side (PortalRoom reads this). */
export const ROOM_LIGHTING = {
  nether: {
    title: 'Nether-Realms',
    glow: '#ff2200',
    ember: '#ff7a1a',
    deep: '#1c0505',
    text: '#ffe1d6',
  },
  heaven: {
    title: 'Heaven Realms',
    glow: '#7ef0c8',
    ember: '#ffd98a',
    deep: '#0a1a24',
    text: '#e6fff4',
  },
  gun: {
    title: 'Portal Gun — All Realms',
    glow: '#c084fc',
    ember: '#ff7a1a',
    deep: '#140a24',
    text: '#f3e8ff',
  },
};
