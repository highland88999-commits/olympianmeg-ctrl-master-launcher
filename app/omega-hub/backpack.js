// Local loadout / inventory ("Neural Backpack") logic.
// The source's neural-backpack.js read a cloud database and rendered remote
// 3D model URLs. This version keeps the same idea — a personal gear loadout —
// but everything is local data with procedurally drawn icons, persisted to
// localStorage by the page.

export const CATALOG = [
  { id: 'pulse-lantern', name: 'Pulse Lantern', kind: 'tool', hue: 190, desc: 'A hand lamp that hums in the dark.' },
  { id: 'rift-compass', name: 'Rift Compass', kind: 'tool', hue: 280, desc: 'Always points at the nearest portal.' },
  { id: 'aegis-weave', name: 'Aegis Weave', kind: 'armor', hue: 150, desc: 'Light mesh that shrugs off storm static.' },
  { id: 'ion-cutter', name: 'Ion Cutter', kind: 'tool', hue: 20, desc: 'Trims hull plating like paper.' },
  { id: 'echo-charm', name: 'Echo Charm', kind: 'trinket', hue: 320, desc: 'Replays the last thing you heard.' },
  { id: 'star-chart', name: 'Star Chart', kind: 'trinket', hue: 210, desc: 'A map of sectors, hand-annotated.' },
  { id: 'grav-boots', name: 'Grav Boots', kind: 'armor', hue: 90, desc: 'Heavy boots for light-gravity walks.' },
  { id: 'signal-flare', name: 'Signal Flare', kind: 'consumable', hue: 0, desc: 'One bright call for help.' },
];

export function getItem(id) {
  return CATALOG.find((i) => i.id === id) || null;
}

// Backpack state is a plain object: { items: { id: qty } }
export function createBackpack() {
  return { items: {} };
}

export function addItem(bp, id) {
  if (!getItem(id)) return false;
  const next = { items: { ...bp.items } };
  next.items[id] = (next.items[id] || 0) + 1;
  return next;
}

export function removeItem(bp, id) {
  if (!bp.items[id]) return bp;
  const next = { items: { ...bp.items } };
  if (next.items[id] <= 1) delete next.items[id];
  else next.items[id] -= 1;
  return next;
}

export function listItems(bp) {
  return Object.entries(bp.items).map(([id, qty]) => ({ ...getItem(id), qty }));
}

export function itemCount(bp) {
  return Object.values(bp.items).reduce((a, b) => a + b, 0);
}

export function summarizeBackpack(bp) {
  return listItems(bp).map((i) => `  ${i.name} x${i.qty}`);
}

export function serializeBackpack(bp) {
  return JSON.stringify(bp);
}

export function deserializeBackpack(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.items !== 'object') return createBackpack();
    const clean = createBackpack();
    for (const [id, qty] of Object.entries(parsed.items)) {
      if (getItem(id) && Number.isInteger(qty) && qty > 0 && qty < 1000) clean.items[id] = qty;
    }
    return clean;
  } catch {
    return createBackpack();
  }
}
