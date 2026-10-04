// lib/museum.js
// MUSEUM - the gallery of Merlin's creative output.
// Pure data + helpers. No DOM, no network. Headless-testable.
//
// 2026-10-02 — FULL WIPE per Merlin ("remove all graphics and try again").
// Every graphic was stripped: the old wings were full of personal material
// (Facebook-download filenames, screenshots, personal stuff). The rebuilt
// museum shows ONLY Gemini-made pieces: Photos in one wing, Videos in
// another. New pieces arrive via the Menu Art Transfer app — nothing is
// re-added without verifiable Gemini provenance. When in doubt, leave it out.

export const SERIES = [
  { id: 'transfer', title: "Menu Art Transfer", blurb: "Merlin's Gemini-made gallery pieces — photos and concept films from the Menu Art Transfer app.", count: 19 },
];

export const ITEMS = [
  { id: 'm-gold-robot', series: 'transfer', title: "Gold Robot \u2014 Museum Study", blurb: "The golden robot brand mascot in a vast dark gallery hall.", src: '/images/museum/photos/museum-photo-gold-robot.webp' },
  { id: 'm-valkyrie', series: 'transfer', title: "Valkyrie \u2014 Neon Sigil", blurb: "A Valkyrie warrior silhouette formed from neon light trails.", src: '/images/museum/photos/museum-photo-valkyrie.webp' },
  { id: 'm-neon-city', series: 'transfer', title: "Neon City \u2014 Night Study", blurb: "A towering futuristic city at night, rivers of neon light.", src: '/images/museum/photos/museum-photo-neon-city.webp' },
  { id: 'm-artemis', series: 'transfer', title: "Artemis \u2014 The Claimed Name", blurb: "A mythic archer drawing a bow of pure moonlight.", src: '/images/museum/photos/museum-photo-artemis.webp' },
  { id: 'm-guillotine', series: 'transfer', title: "Guillotine \u2014 Torchlight", blurb: "An ancient guillotine ringed by wall-mounted torches.", src: '/images/museum/photos/museum-photo-guillotine.webp' },
  { id: 'm-shadow-realm', series: 'transfer', title: "Shadow Realm \u2014 Blue Night", blurb: "A lone light-cycle rider carving a glowing blue trail.", src: '/images/museum/photos/museum-photo-shadow-realm.webp' },
  { id: 'm-medusa', series: 'transfer', title: "Medusa \u2014 Character Study", blurb: "A cybernetic Medusa portrait, serpentine cables for hair.", src: '/images/museum/photos/museum-photo-medusa.webp' },
  { id: 'm-air-car', series: 'transfer', title: "AURA-GENESIS \u2014 Air-Car", blurb: "The air-powered car concept, gallery study.", src: '/images/museum/photos/museum-photo-air-car.webp' },
  { id: 'm-vault', series: 'transfer', title: "Miles' Vault \u2014 The Door", blurb: "The door to Miles' legacy vault at the base of BABEL.", src: '/images/museum/photos/museum-photo-vault.webp' },
  { id: 'm-starblood', series: 'transfer', title: "Starblood \u2014 Sigil Card", blurb: "Card art from the Starblood prototype.", src: '/images/museum/photos/museum-photo-starblood.webp' },
  { id: 'm-gems', series: 'transfer', title: "Liquid Gold \u2014 Gem Study", blurb: "The visual language of Liquid Gold.", src: '/images/museum/photos/museum-photo-gems.webp' },
  { id: 'm-colosseum', series: 'transfer', title: "Colosseum \u2014 Night Arena", blurb: "The arena under night lights.", src: '/images/museum/photos/museum-photo-colosseum.webp' },
];

export const VIDEOS = [
  { id: 'mv-air-car', slug: 'aura-genesis', title: "AURA-GENESIS \u2014 Concept Film", blurb: "The air-car concept film.", src: '/textures/museum/videos/museum-video-air-car.mp4' },
  { id: 'mv-light-cycle', slug: 'light-cycle-run', title: "Shadow Realm \u2014 Light-Cycle Run", blurb: "A light-cycle run through the night grid.", src: '/textures/museum/videos/museum-video-light-cycle.mp4' },
  { id: 'mv-logo-reveal', slug: 'sigil-reveal', title: "Olympus \u2014 Sigil Reveal", blurb: "The Olympus sigil reveal.", src: '/textures/museum/videos/museum-video-logo-reveal.mp4' },
  { id: 'mv-medusa', slug: 'medusa-awakening', title: "Medusa \u2014 Awakening", blurb: "Medusa awakens. Ties to Medusa\u2019s Lair.", src: '/textures/museum/videos/museum-video-medusa.mp4' },
  { id: 'mv-neon-drive', slug: 'neon-drive', title: "Neon City \u2014 Night Drive", blurb: "A night drive through the neon city.", src: '/textures/museum/videos/museum-video-neon-drive.mp4' },
  { id: 'mv-vault', slug: 'vault-opening', title: "Miles' Vault \u2014 The Opening", blurb: "The vault door opens.", src: '/textures/museum/videos/museum-video-vault.mp4' },
];

export const CONCEPTS = [];

export const STATUSES = ['shipped', 'prototype', 'idea', 'spec', 'not-approved'];

export const STATUS_LABELS = {
  shipped: 'Shipped',
  prototype: 'Prototype',
  idea: 'Idea',
  spec: 'Spec',
  'not-approved': 'Not approved',
};

export function seriesById(id) {
  return SERIES.find((s) => s.id === id) || null;
}

export function itemsInSeries(seriesId) {
  if (!seriesId || seriesId === 'all') return ITEMS.slice();
  return ITEMS.filter((i) => i.series === seriesId);
}

export function searchItems(q) {
  const needle = String(q || '').trim().toLowerCase();
  if (!needle) return ITEMS.slice();
  return ITEMS.filter((i) => {
    const s = seriesById(i.series);
    const hay = (i.title + ' ' + i.blurb + ' ' + (s ? s.title : '')).toLowerCase();
    return hay.indexOf(needle) !== -1;
  });
}

export function conceptsByStatus(status) {
  if (!status || status === 'all') return CONCEPTS.slice();
  return CONCEPTS.filter((c) => c.status === status);
}

export function searchConcepts(q) {
  const needle = String(q || '').trim().toLowerCase();
  if (!needle) return CONCEPTS.slice();
  return CONCEPTS.filter((c) =>
    (c.name + ' ' + c.category + ' ' + c.blurb).toLowerCase().indexOf(needle) !== -1
  );
}

const KEPT_KEY = 'museum.kept.v1';

export function loadKept() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEPT_KEY) : null;
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
  } catch (e) { return []; }
}

export function saveKept(ids) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(KEPT_KEY, JSON.stringify(ids));
    }
    return true;
  } catch (e) { return false; }
}

export function toggleKept(ids, id) {
  const set = new Set(ids);
  if (set.has(id)) set.delete(id); else set.add(id);
  return Array.from(set);
}
