// lib/menu-search.js
// Pure, unit-testable search over the 10 god menus.
//
// The UI (components/SatelliteMenu.jsx) calls filterMenuIndex(query, { t, satIndex })
// with the same `t` and `satIndex` it already uses for rendering, so search
// matches exactly what the user sees — translated satellite titles/subtitles
// plus the Babel tower floors (lib/babel/floors), which live one level deeper
// than the menu rows.
//
// Shape of a result entry:
//   { god, category, kind: 'satellite' | 'floor', key, name, sub, route, satKey, pos }
// The launch contract is (route, satKey, pos) — identical to the menu's
// onLaunch(route, key, sat.pos) path.
import { GOD_MENUS, AGENT_FORGE_MENU } from './god-menus.js';
import { FLOORS } from './babel/floors.js';

/**
 * Flat search index: one satellite entry per satellite, plus one floor entry
 * per Babel floor. `t` is the menu's i18n lookup, `satIndex` the menu's
 * satellite Map (key -> { route, pos, ... }).
 */
export function buildMenuIndex({ t, satIndex }) {
  const entries = [];
  for (const menu of GOD_MENUS) {
    for (const key of menu.satellites) {
      const sat = satIndex.get(key);
      if (!sat) continue;
      // Agent Forge has no locale strings: search results wear the same
      // shared display copy as the menu row, never an echoed key.
      const isForge = key === AGENT_FORGE_MENU.key;
      const title = isForge ? AGENT_FORGE_MENU.title : t(`sat.${key}.title`);
      const subtitle = isForge ? AGENT_FORGE_MENU.subtitle : t(`sat.${key}.subtitle`);
      entries.push({
        god: menu.god,
        category: menu.category,
        kind: 'satellite',
        key,
        name: title,
        sub: subtitle,
        route: sat.route,
        satKey: key,
        pos: sat.pos,
      });
      // Babel's floors are the only programs that live deeper than a
      // satellite row — mirror the floor list from the menu's programsFor().
      if (key === 'babel') {
        for (const f of FLOORS) {
          entries.push({
            god: menu.god,
            category: menu.category,
            kind: 'floor',
            key: `babel-floor-${f.id}`,
            name: f.name,
            sub: f.subtitle,
            route: f.kind === 'route' ? f.route : `/babel?floor=${f.id}`,
            satKey: 'babel',
            pos: sat.pos,
          });
        }
      }
    }
  }
  return entries;
}

/**
 * Case-insensitive includes-match over entry names + subtitles.
 * Returns groups in GOD_MENUS order:
 *   [{ god, category, results: [entry, ...] }, ...]
 * Empty/blank query -> [] (the UI renders the normal category view instead).
 */
export function filterMenuIndex(query, { t, satIndex }) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  const groups = new Map();
  for (const e of buildMenuIndex({ t, satIndex })) {
    const hay = `${e.name || ''} ${e.sub || ''}`.toLowerCase();
    if (!hay.includes(q)) continue;
    if (!groups.has(e.god)) {
      groups.set(e.god, { god: e.god, category: e.category, results: [] });
    }
    groups.get(e.god).results.push(e);
  }
  const order = new Map(GOD_MENUS.map((m, i) => [m.god, i]));
  return [...groups.values()].sort((a, b) => order.get(a.god) - order.get(b.god));
}
