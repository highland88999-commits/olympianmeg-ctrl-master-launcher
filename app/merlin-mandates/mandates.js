// mandates.js — pure logic for the Merlin Mandates ledger.
// A mandate is { id, title, detail, fulfilled, createdAt }. Lists persist in
// localStorage via the view layer. No DOM, no network.

export const STORAGE_KEY = 'merlin-mandates-v1';

let idCounter = 0;
export function makeId() {
  idCounter += 1;
  return `mandate-${Date.now().toString(36)}-${idCounter}`;
}

// Starter mandates drawn from documented build directives of this project.
// The source repo contained no mandates at all, so these are plainly labeled
// as examples the user can edit or delete.
export function seedMandates() {
  return [
    {
      id: makeId(),
      title: 'Light must never drown out texture wraps',
      detail: 'Keep bloom and glow localized. Textures stay readable.',
      fulfilled: false,
      createdAt: Date.now(),
    },
    {
      id: makeId(),
      title: 'Strip telemetry before anything ships',
      detail: 'No phone-home code, trackers, or hardcoded keys in production builds.',
      fulfilled: false,
      createdAt: Date.now(),
    },
    {
      id: makeId(),
      title: 'Never stall waiting on a permission',
      detail: 'Do everything possible without blocking. Queue what needs approval and keep building.',
      fulfilled: false,
      createdAt: Date.now(),
    },
  ];
}

export function createMandate(title, detail = '') {
  const t = String(title || '').trim();
  if (!t) throw new Error('A mandate needs a title');
  return {
    id: makeId(),
    title: t,
    detail: String(detail || '').trim(),
    fulfilled: false,
    createdAt: Date.now(),
  };
}

export function addMandate(list, mandate) {
  return [mandate, ...list];
}

export function updateMandate(list, id, patch) {
  return list.map((m) => (m.id === id ? { ...m, ...patch } : m));
}

export function toggleMandate(list, id) {
  return updateMandate(list, id, {
    fulfilled: !list.find((m) => m.id === id)?.fulfilled,
  });
}

export function deleteMandate(list, id) {
  return list.filter((m) => m.id !== id);
}

export function moveMandate(list, id, direction) {
  const idx = list.findIndex((m) => m.id === id);
  const j = idx + direction;
  if (idx < 0 || j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[idx], next[j]] = [next[j], next[idx]];
  return next;
}

export function stats(list) {
  const fulfilled = list.filter((m) => m.fulfilled).length;
  return { total: list.length, fulfilled, active: list.length - fulfilled };
}

export function exportText(list) {
  const lines = ['MERLIN MANDATES', ''];
  for (const m of list) {
    lines.push(`${m.fulfilled ? '[x]' : '[ ]'} ${m.title}`);
    if (m.detail) lines.push(`    ${m.detail}`);
  }
  return lines.join('\n') + '\n';
}

export function serializeList(list) {
  return JSON.stringify(list);
}

export function deserializeList(json) {
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return null;
    return arr
      .filter((m) => m && typeof m === 'object' && String(m.title || '').trim())
      .map((m) => ({
        id: String(m.id || makeId()),
        title: String(m.title).trim(),
        detail: String(m.detail || '').trim(),
        fulfilled: Boolean(m.fulfilled),
        createdAt: Number(m.createdAt) || Date.now(),
      }));
  } catch (e) {
    return null;
  }
}
