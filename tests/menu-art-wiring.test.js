// tests/menu-art-wiring.test.js — Wiring audit for Menu Art Transfer batches 1+2.
// Verifies every transfer slot resolves through its art helper to exactly one
// path, every god-menu program has art, and the graceful-fallback contract
// holds (bad input -> '' so callers can fall back instead of crashing).
// Run: node tests/menu-art-wiring.test.js (from the repo root).
import {
  GOD_MENUS, allGodMenuSatellites,
  menuArtFor, menuBannerFor, submenuArtFor,
  tronUiArtFor, bikeSkinArtFor, museumPhotoArtFor, museumVideoFor,
} from '../lib/god-menus.js';
import { SERIES, ITEMS, VIDEOS } from '../lib/museum.js';
import { BIKE_SKINS, skinArtFor, skinByKey } from '../app/shadow-realm/schemes.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

// --- batch 2 slot inventory (from the transfer app's uploads table) --------
const SUBMENU = ["submenu-agora-civic","submenu-agora-cosmos","submenu-agora-craft","submenu-agora-faith","submenu-agora-olympus","submenu-agora-play","submenu-argo-dest-edmonton","submenu-argo-dest-giza","submenu-argo-dest-london","submenu-argo-dest-new-york","submenu-argo-dest-paris","submenu-argo-dest-rio","submenu-argo-dest-sydney","submenu-argo-dest-tokyo","submenu-argo-fleet-comet","submenu-argo-fleet-cruiser","submenu-argo-fleet-dart","submenu-argo-fleet-hauler","submenu-argo-fleet-skiff","submenu-argo-fleet-titan","submenu-argo-fleet-wisp","submenu-babel-avalon","submenu-babel-duat","submenu-babel-hermes","submenu-babel-overlook","submenu-babel-sylva","submenu-babel-vault","submenu-prog-air-hockey-easy","submenu-prog-air-hockey-hard","submenu-prog-air-hockey-medium","submenu-prog-air-hockey-table-classic","submenu-prog-air-hockey-table-kaleidoscope","submenu-prog-auction-house-all","submenu-prog-auction-house-curiosities","submenu-prog-auction-house-instruments","submenu-prog-auction-house-manuscripts","submenu-prog-auction-house-relics","submenu-prog-auction-house-star-charts","submenu-prog-basketball-free-play","submenu-prog-basketball-oasis-multiplayer","submenu-prog-basketball-timed-shootout","submenu-prog-blueprint-allocation-matrix","submenu-prog-blueprint-cooperative","submenu-prog-blueprint-economics","submenu-prog-blueprint-foundation","submenu-prog-blueprint-midas","submenu-prog-blueprint-roadmap","submenu-prog-colosseum-challenge-the-champion","submenu-prog-colosseum-enter-the-pit","submenu-prog-enyo-dust-hollow","submenu-prog-enyo-free-for-all","submenu-prog-enyo-neon-depot","submenu-prog-enyo-recruit","submenu-prog-enyo-regular","submenu-prog-enyo-ruined-plaza","submenu-prog-enyo-team-battle","submenu-prog-enyo-veteran","submenu-prog-holoframe-carousel","submenu-prog-holoframe-single","submenu-prog-holoframe-stacked","submenu-prog-iq-test-easy","submenu-prog-iq-test-hard","submenu-prog-iq-test-medium","submenu-prog-omega-hub-nexus-prime","submenu-prog-omega-hub-obsidian-reef","submenu-prog-omega-hub-quiet-harbor","submenu-prog-omega-hub-tab-backpack","submenu-prog-omega-hub-tab-hub","submenu-prog-omega-hub-tab-terminal","submenu-prog-omega-hub-tab-world","submenu-prog-omega-hub-vortex-fields","submenu-prog-persymphony-burning-fractal","submenu-prog-persymphony-canyon","submenu-prog-persymphony-digital-rain","submenu-prog-persymphony-mega-city","submenu-prog-persymphony-nebula","submenu-prog-persymphony-neural-web","submenu-prog-persymphony-pearl","submenu-prog-persymphony-singularity","submenu-prog-persymphony-storm-engine","submenu-prog-plutus-tab-budget","submenu-prog-plutus-tab-data","submenu-prog-plutus-tab-goals","submenu-prog-plutus-tab-overview","submenu-prog-raptor-rush-pvp-party-hunt","submenu-prog-raptor-rush-solo-hunt","submenu-prog-rogers-arena-concert-night","submenu-prog-rogers-arena-empty-arena","submenu-prog-rogers-arena-game-night","submenu-prog-user-profile-tab-borrowed","submenu-prog-user-profile-tab-library","submenu-prog-user-profile-tab-saved","submenu-prog-zeus-v-hades-gates","submenu-prog-zeus-v-hades-river-styx","submenu-prog-zeus-v-hades-tartarus","submenu-skyscraper-amusement","submenu-skyscraper-omega","submenu-skyscraper-park","submenu-skyscraper-thunderdome","submenu-worldengine-architect","submenu-worldengine-characters","submenu-worldengine-engine","submenu-worldengine-objects","submenu-worldengine-studio","submenu-worldengine-uplink","submenu-worldengine-vehicles","submenu-worldengine-weapons","submenu-worldengine-weather"];
const MUSEUM_PHOTOS = ["museum-photo-air-car","museum-photo-artemis","museum-photo-colosseum","museum-photo-gems","museum-photo-gold-robot","museum-photo-guillotine","museum-photo-medusa","museum-photo-neon-city","museum-photo-shadow-realm","museum-photo-starblood","museum-photo-valkyrie","museum-photo-vault"];
const MUSEUM_VIDEOS = ["museum-video-air-car","museum-video-light-cycle","museum-video-logo-reveal","museum-video-medusa","museum-video-neon-drive","museum-video-vault"];
const TRON_UI = ["tron-boost","tron-brake","tron-gas","tron-leave","tron-menu-bg","tron-pause","tron-recenter","tron-steer-left","tron-steer-right"];
const SKINS = ["skin-bike-ares-crimson","skin-bike-legacy-blue","skin-bike-legacy-circuit","skin-bike-neon-cyber","skin-bike-obsidian-ghost","skin-bike-olympus-gold","skin-bike-redline","skin-bike-rose-thorn","skin-bike-teal-pulse"];

// --- helper contracts ------------------------------------------------------
const helpers = [
  ['menuArtFor', menuArtFor, '/images/menu/programs/'],
  ['submenuArtFor', submenuArtFor, '/images/menu/submenu/'],
  ['tronUiArtFor', tronUiArtFor, '/images/shadow-realm/ui/'],
  ['bikeSkinArtFor', bikeSkinArtFor, '/images/shadow-realm/skins/'],
  ['museumPhotoArtFor', museumPhotoArtFor, '/images/museum/photos/'],
  ['museumVideoFor', museumVideoFor, '/textures/museum/videos/'],
];
for (const [name, fn, prefix] of helpers) {
  t(`${name}: empty string in -> empty string out`, fn('') === '' && fn(null) === '' && fn(undefined) === '');
  t(`${name}: non-string in -> empty string out`, fn(123) === '' && fn({}) === '');
}

// --- every slot resolves to exactly one path --------------------------------
const seen = new Map();
function checkUnique(key, path) {
  t(`${key}: resolves to a path`, typeof path === 'string' && path.length > 0);
  if (seen.has(path)) {
    t(`${key}: path not shared with ${seen.get(path)}`, false);
  } else {
    seen.set(path, key);
    t(`${key}: path unique`, true);
  }
}
for (const k of SUBMENU) checkUnique(k, submenuArtFor(k));
for (const k of MUSEUM_PHOTOS) checkUnique(k, museumPhotoArtFor(k));
for (const k of MUSEUM_VIDEOS) checkUnique(k, museumVideoFor(k));
for (const k of TRON_UI) checkUnique(k, tronUiArtFor(k));
for (const k of SKINS) checkUnique(k, bikeSkinArtFor(k));

// --- god-menu programs all have art ------------------------------------------
const sats = allGodMenuSatellites();
t('god menus claim satellites', sats.length > 100);
for (const k of sats) {
  const p = menuArtFor(k);
  t(`program ${k}: menuArtFor path`, p === `/images/menu/programs/${k}.webp`);
  checkUnique(`program:${k}`, p);
}
for (const m of GOD_MENUS) {
  const b = menuBannerFor(m.god);
  // Textured homes resolve to their banner; texture-less homes (UTILITIES,
  // HADES, the 12 nether-realms homes) honestly return '' and the tab
  // falls back to its plain style — that is menuBannerFor's documented
  // graceful-fallback contract, not a missing banner.
  t(`banner ${m.god}: resolves`, typeof b === 'string' && (b.length > 0 || m.texture === null));
  if (m.texture) t(`banner ${m.god}: matches its texture`, b === m.texture);
}

// --- museum populated ---------------------------------------------------------
t('museum has the transfer series', SERIES.some((s) => s.id === 'transfer'));
t('museum has 12 transfer photos', ITEMS.filter((i) => i.series === 'transfer').length === 12);
t('museum has 6 transfer videos', VIDEOS.length === 6);
for (const item of ITEMS) {
  t(`museum item ${item.id}: src under /images/museum/photos/`,
    typeof item.src === 'string' && item.src.startsWith('/images/museum/photos/'));
}
for (const v of VIDEOS) {
  t(`museum video ${v.id}: src under /textures/museum/videos/`,
    typeof v.src === 'string' && v.src.startsWith('/textures/museum/videos/') && v.src.endsWith('.mp4'));
}

// --- bike skins ---------------------------------------------------------------
t('9 bike skins defined', BIKE_SKINS.length === 9);
for (const sk of SKINS) {
  t(`skin ${sk}: defined in BIKE_SKINS`, BIKE_SKINS.some((s) => s.key === sk));
  t(`skin ${sk}: skinArtFor path`, skinArtFor(sk) === `/images/shadow-realm/skins/${sk}.webp`);
  t(`skin ${sk}: skinByKey resolves`, skinByKey(sk).key === sk);
}
t('skinByKey falls back to first skin', skinByKey('nope').key === BIKE_SKINS[0].key);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
