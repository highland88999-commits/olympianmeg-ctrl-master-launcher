// lib/education/levels.js — Levels for Omega Education, daycare through
// post-secondary. One level = one card graphic (public/images/education/
// <id>.webp, 900x600, gold/indigo, no text) and one search filter.
//
// The directory currently holds entries for five of the six levels:
// preschool has art but no entries yet — licensed child-care data (the
// staged Alberta Child Care Lookup / Ontario licensed child care sources)
// is what will fill it. A level with no entries still shows in the grid;
// searching it says so honestly instead of pretending.

export const LEVELS = [
  {
    id: 'daycare',
    label: 'Daycare',
    blurb: 'Licensed daycare and out-of-school care for the littlest ones.',
    subs: ['Infant', 'Toddler', 'Preschool', 'Out-of-school care'],
  },
  {
    id: 'preschool',
    label: 'Preschool',
    blurb: 'Preschool programs that get kids ready for school.',
    subs: ['Ages 3–5', 'School readiness', 'Play-based learning'],
  },
  {
    id: 'k12',
    label: 'K-12 schools',
    blurb: 'Elementary, junior high and senior high schools.',
    subs: ['Elementary', 'Junior high', 'Senior high'],
  },
  {
    id: 'trades',
    label: 'Trades & apprenticeships',
    blurb: 'Apprenticeships and trade authorities, including Red Seal.',
    subs: ['Electrician', 'Welder', 'Plumber', 'Carpenter'],
  },
  {
    id: 'college',
    label: 'Colleges',
    blurb: 'Diplomas, certificates and applied degrees.',
    subs: ['Diplomas', 'Certificates', 'Applied degrees'],
  },
  {
    id: 'university',
    label: 'Universities',
    blurb: 'Degrees from bachelor’s to doctorate.',
    subs: ['Bachelor’s', 'Master’s', 'Doctorate'],
  },
];

export const LEVEL_IDS = new Set(LEVELS.map((l) => l.id));

export function levelById(id) {
  return LEVELS.find((l) => l.id === id) || null;
}

// One 900x600 WebP per real level, in public/images/education/<id>.webp,
// plus the page background at public/images/education/background.webp
// (1920x1080, very dark low-contrast gold nebula). Only the six real level
// ids have art: anything else renders NO image — never a wrong one, never
// a broken one.
export const BACKGROUND_IMAGE_SRC = '/images/education/background.webp';

export function levelImageSrc(id) {
  if (!id || typeof id !== 'string') return null;
  return LEVEL_IDS.has(id) ? `/images/education/${id}.webp` : null;
}
