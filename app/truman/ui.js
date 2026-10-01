/*
 * TRUMAN UI state helpers — pure, headless-testable.
 *
 * Character panels (henry / valkyrie / rasputin) can each be minimized into
 * a floating icon docked in a tidy stack; the bottom control menu expands
 * from / collapses into a single floating action icon.
 * No DOM, no React — safe to import from node tests.
 */

export const CHARACTER_IDS = ['henry', 'valkyrie', 'rasputin'];

export function initialMinimized() {
  return { henry: false, valkyrie: false, rasputin: false };
}

// Toggle one character's minimized flag; unknown ids leave state unchanged.
export function toggleMinimized(minimized, id) {
  if (!CHARACTER_IDS.includes(id)) return { ...minimized };
  return { ...minimized, [id]: !minimized[id] };
}

export function minimizedCount(minimized) {
  return CHARACTER_IDS.filter((id) => minimized[id]).length;
}

export function visibleCharacters(characters, minimized) {
  return characters.filter((c) => !minimized[c.id]);
}

export function minimizedCharacters(characters, minimized) {
  return characters.filter((c) => minimized[c.id]);
}

// Bottom control menu expand/collapse.
export function toggleMenu(open) {
  return !open;
}
