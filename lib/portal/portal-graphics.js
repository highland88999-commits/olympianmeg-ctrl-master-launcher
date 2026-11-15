/**
 * lib/portal/portal-graphics.js
 *
 * PORTAL -> GRAPHIC MAP for the heaven and hell realms (Merlin,
 * 2026-11-15): every portal in every heaven and hell realm gets its
 * OWN illustrated graphic, true to that realm, and NO graphic repeats
 * across realms. Hades' portals are the focus — the seven stone
 * arches in the palace plaza — and Medusa's lair gets its own graphic
 * on the lair arch's doorway.
 *
 * Pure module: no JSX, no document/window access at import time.
 * Art lives under public/art/portals/ so it ships with the build.
 * Generated (media pipeline) — no Tripo, no paid assets. No text,
 * logos, watermarks, or faces in any image.
 *
 * The graphics hang on the portal surfaces, Swamp Run menu-dressing
 * standard: art behind/around the portal UI, NO layout, label,
 * action, order, or size change anywhere; everything still works
 * exactly as before.
 */

export const PORTAL_ART_BASE = '/art/portals';

/* One distinct graphic per realm (PORTAL_REALMS keys in
 * lib/portal/realms.js — 13 nether + 11 higher). */
export const PORTAL_GRAPHICS = {
  // ——— Nether-realms (bottom portal) ———
  hades: `${PORTAL_ART_BASE}/hades.jpg`,
  helheim: `${PORTAL_ART_BASE}/helheim.jpg`,
  duat: `${PORTAL_ART_BASE}/duat.jpg`,
  hell: `${PORTAL_ART_BASE}/hell.jpg`,
  naraka: `${PORTAL_ART_BASE}/naraka.jpg`,
  yomi: `${PORTAL_ART_BASE}/yomi.jpg`,
  annwn: `${PORTAL_ART_BASE}/annwn.jpg`,
  mictlan: `${PORTAL_ART_BASE}/mictlan.jpg`,
  xibalba: `${PORTAL_ART_BASE}/xibalba.jpg`,
  kur: `${PORTAL_ART_BASE}/kur.jpg`,
  nav: `${PORTAL_ART_BASE}/nav.jpg`,
  diyu: `${PORTAL_ART_BASE}/diyu.jpg`,
  orun: `${PORTAL_ART_BASE}/orun.jpg`,
  // ——— Higher realms (upper portal) ———
  elysium: `${PORTAL_ART_BASE}/elysium.jpg`,
  valhalla: `${PORTAL_ART_BASE}/valhalla.jpg`,
  aaru: `${PORTAL_ART_BASE}/aaru.jpg`,
  heaven: `${PORTAL_ART_BASE}/heaven.jpg`,
  svarga: `${PORTAL_ART_BASE}/svarga.jpg`,
  takamagahara: `${PORTAL_ART_BASE}/takamagahara.jpg`,
  'tir-na-nog': `${PORTAL_ART_BASE}/tir-na-nog.jpg`,
  tlalocan: `${PORTAL_ART_BASE}/tlalocan.jpg`,
  'maya-sky': `${PORTAL_ART_BASE}/maya-sky.jpg`,
  vyraj: `${PORTAL_ART_BASE}/vyraj.jpg`,
  tiangong: `${PORTAL_ART_BASE}/tiangong.jpg`,
};

/* Medusa's lair — its own graphic, on the lair arch's doorway in the
 * Hades palace plaza (the arch Merlin re-pointed to the boss chamber,
 * 2026-11-15). Not a realm, so it lives outside PORTAL_GRAPHICS. */
export const LAIR_GRAPHIC = `${PORTAL_ART_BASE}/medusas-lair.jpg`;

/* What each graphic depicts (from the realm's own code: its centre
 * landmark in ~/workspace/heaven-hell-purposes.md, its mythos and hue
 * in lib/portal/realms.js — not invented). */
export const PORTAL_DEPICTS = {
  hades: "Hades' dark palace, the River Styx with its stone bridge, Cerberus at the gates, torchlight",
  helheim: "Éljúðnir, Hel's cold hall, mist and ice-blue light, the dead wandering in fog",
  duat: 'The Hall of Two Truths, Egyptian weighing hall, gold and lapis, scales and pillars',
  hell: 'The Pit, the Lake of Fire, flame and black rock, the gates of the Christian hell',
  naraka: "Yama's Court, Hindu hell, judgment hall, fire and the wheel of rebirth",
  yomi: "Izanami's Palace, Japanese underworld, dark water, stone and paper lanterns",
  annwn: 'Caer Siddi, the glass fortress on the far bank, Celtic mist and still water',
  mictlan: 'The Throne of the Dead, Aztec underworld, nine levels, fire and bone',
  xibalba: 'The Ballcourt, Maya underworld, stone court, dark jungle and torches',
  kur: 'The Throne of Ereshkigal, Mesopotamian underworld, dark stone, dust and ziggurat',
  nav: "Veles' Throne, Slavic underworld, dark forest, green wisps and still water",
  diyu: "King Yama's Court, Chinese hell, red lanterns, judgment halls and fire",
  orun: "Obatala's Hall, Yoruba spirit world, white cloth and gold light, serves both sides",
  elysium: 'White marble, still water, the Meander Fountain, white blossom gardens in endless light',
  valhalla: 'The Great Hall, feasting warriors, golden light, shields and banners',
  aaru: 'The Temple of Osiris, reed fields, the weighing of the heart, Egyptian gold and green',
  heaven: 'The Throne before the Sea of Glass, white and gold light, still water',
  svarga: "Amaravati, Indra's golden city, celestial gardens and white elephants",
  takamagahara: "Amaterasu's Hall, the sun goddess's hall, golden torii light, clouds and sun",
  'tir-na-nog': 'The Palace of the Ever-Young, green fae light, eternal spring, white horses',
  tlalocan: "Tlaloc's Temple, rain and green water, Aztec stone, jade and gold",
  'maya-sky': 'The Sky Temple, Maya pyramids above the clouds, gold and jade',
  vyraj: 'The Great Oak, Slavic paradise, birds and green light, still water',
  tiangong: 'The Celestial Palace, Chinese heaven, gold and jade, clouds and cranes',
};

/** Graphic for a realm key; unknown keys fall back to the Hades graphic. */
export function graphicForRealm(realmKey) {
  return PORTAL_GRAPHICS[realmKey] || PORTAL_GRAPHICS.hades;
}

/**
 * CSS background value: the realm's art under a dark scrim so the
 * card label stays legible at phone size, over the realm's own hue.
 * `opacity` is the scrim strength (0.62 for portal cards).
 */
export function portalCardBackground(realmKey, hue, opacity) {
  const o = opacity == null ? 0.62 : opacity;
  const h = hue || '#7c3aed';
  return `linear-gradient(rgba(6,8,18,${o}), rgba(6,8,18,${o})), linear-gradient(165deg, ${h}26 0%, rgba(8,8,16,0.85) 55%), url(${graphicForRealm(realmKey)})`;
}
