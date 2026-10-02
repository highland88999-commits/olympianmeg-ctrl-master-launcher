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

export const SERIES = [];

export const ITEMS = [];

export const VIDEOS = [];

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
