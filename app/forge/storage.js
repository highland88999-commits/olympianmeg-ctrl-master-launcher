// Forge — device-local tab persistence. Storage object is injected so this
// stays testable without a browser. Never sends anything anywhere.

import { defaultExtFor } from './editor.js';

export const TABS_KEY = 'forge:tabs:v1';
export const ACTIVE_KEY = 'forge:active:v1';
export const MAX_TABS = 24;
export const MAX_TAB_CHARS = 500000;

export function uid() {
  return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function blankTab(name, lang) {
  const safeLang = lang || 'text';
  return {
    id: uid(),
    name: String(name || 'untitled').slice(0, 80),
    ext: defaultExtFor(safeLang),
    lang: safeLang,
    content: '',
  };
}

function safeParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function cleanTab(t) {
  if (!t || typeof t.id !== 'string') return null;
  return {
    id: t.id,
    name: String(t.name || 'untitled').slice(0, 80),
    ext: String(t.ext || '.txt').slice(0, 8),
    lang: String(t.lang || 'text'),
    content: String(t.content || '').slice(0, MAX_TAB_CHARS),
  };
}

export function loadTabs(storage) {
  try {
    const arr = safeParse(storage.getItem(TABS_KEY));
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const tabs = arr.map(cleanTab).filter(Boolean).slice(0, MAX_TABS);
    return tabs.length > 0 ? tabs : null;
  } catch {
    return null;
  }
}

export function saveTabs(storage, tabs) {
  try {
    const slim = (tabs || []).slice(0, MAX_TABS).map((t) => {
      const c = cleanTab(t);
      return c;
    });
    storage.setItem(TABS_KEY, JSON.stringify(slim));
    return true;
  } catch {
    return false; // quota exceeded or storage unavailable — editing still works
  }
}

export function loadActiveId(storage) {
  try {
    return storage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function saveActiveId(storage, id) {
  try {
    storage.setItem(ACTIVE_KEY, id);
    return true;
  } catch {
    return false;
  }
}
