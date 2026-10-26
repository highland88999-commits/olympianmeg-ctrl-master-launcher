// app/hollow-earth/bolt-visual.js — Ranged-shot visuals for the Monsterverse.
//
// Pure logic only (no THREE): which visible bolt a ranged strike throws,
// what color and shape it is, how fast it flies. The page renders it;
// this module only decides. Cosmetic — damage, range, cooldown, and
// ammo (there is none) live elsewhere and are untouched.

export const BOLT_SPEED = 30; // m/s, same as Middle-earth's bolt
export const BOLT_MAX_LIFE = 1.5; // s; very long shots fade before landing

// One look per weapon kind: firearms throw a warm streak, bows a thin
// gold arrow, spells a fat purple bolt (the Middle-earth staff-blast
// precedent). Colors are hex numbers, as THREE expects.
export const BOLT_STYLE = {
  firearm: { color: 0xffb347, thick: 0.09, len: 0.7 },
  bow: { color: 0xf5d67a, thick: 0.06, len: 0.9 },
  spell: { color: 0xc084fc, thick: 0.16, len: 0.5 },
};

// Which bolt a strike throws. The equipped backpack weapon wins when it
// has a class or a telling name; otherwise the hero's native ranged
// kind decides; a bare fallback is a firearm streak.
export function boltKindFor(entry, heroKind) {
  const cls = entry && entry.meta && entry.meta.weaponClass;
  if (cls === 'bow') return 'bow';
  if (cls === 'firearm') return 'firearm';
  const text = `${(entry && entry.name) || ''} ${(entry && entry.description) || ''}`.toLowerCase();
  if (text.includes('bow') || text.includes('arrow')) return 'bow';
  if (
    text.includes('staff') || text.includes('wand') || text.includes('spell')
    || text.includes('arcane') || text.includes('tome')
  ) return 'spell';
  if (heroKind === 'staff') return 'spell';
  if (heroKind === 'bow') return 'bow';
  return 'firearm';
}
