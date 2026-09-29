// lib/window-dock/registry.js
// Minimal dock-entry registry — the shared minimize/dock contract for the
// launcher shell.
//
// The full universal window dock (queued unit) will consume this registry and
// render one persistent master dock. Until then, entries render their own
// interim minimized chips — but they ALL register here, so behavior stays
// consistent and the future dock picks every entry up automatically.
//
// Entry shape:
//   {
//     id: string,            // unique, e.g. 'nexus-radio'
//     title: string,         // plain-English label, e.g. 'Radio'
//     module: string,        // owning module, e.g. 'launcher' | 'nova'
//     minimized: boolean,    // true = currently docked
//     onRestore: () => void, // bring the window/panel back
//     onClose?: () => void,  // optional full close
//   }

const entries = new Map();
const listeners = new Set();

function snapshot() {
  return Array.from(entries.values()).map((e) => ({ ...e }));
}

function emit() {
  const snap = snapshot();
  for (const fn of listeners) {
    try { fn(snap); } catch {}
  }
}

export function registerDockEntry(entry) {
  if (!entry || typeof entry.id !== 'string' || !entry.id) {
    return { ok: false, error: 'invalid-id' };
  }
  if (typeof entry.onRestore !== 'function') {
    return { ok: false, error: 'missing-onRestore' };
  }
  entries.set(entry.id, {
    title: 'Window',
    module: 'launcher',
    minimized: true,
    ...entry,
  });
  emit();
  return { ok: true };
}

export function unregisterDockEntry(id) {
  const removed = entries.delete(id);
  if (removed) emit();
  return removed;
}

export function updateDockEntry(id, patch) {
  const existing = entries.get(id);
  if (!existing) return false;
  entries.set(id, { ...existing, ...patch, id });
  emit();
  return true;
}

export function getDockEntries() {
  return snapshot();
}

export function getDockEntry(id) {
  const e = entries.get(id);
  return e ? { ...e } : null;
}

// Subscribe to registry changes. Returns an unsubscribe function.
export function subscribeDock(fn) {
  if (typeof fn !== 'function') return () => {};
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

// Test/SSR helper — not for app code.
export function __clearDockRegistry() {
  entries.clear();
}
