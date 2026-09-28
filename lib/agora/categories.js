// lib/agora/categories.js
// AGORA category matrix. Plain-English names.
// MARKETPLACE was intentionally dropped: the Olympus store module owns commerce.

export const CATEGORIES = [
  { id: 'civic', name: 'Civic & Community', blurb: 'Local life, events, and getting things done together.' },
  { id: 'faith', name: 'Faith & Philosophy', blurb: 'Beliefs, meaning, and the big questions.' },
  { id: 'cosmos', name: 'The Cosmos', blurb: 'Space, science, and everything out there.' },
  { id: 'play', name: 'Entertainment & Games', blurb: 'Games, movies, music, and fun.' },
  { id: 'craft', name: 'Arts, Trades & Work', blurb: 'Making things: art, tech, trades, careers.' },
  { id: 'olympus', name: 'Olympus', blurb: 'Announcements and news from the multiverse.' },
];

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id);

export function isValidCategory(id) {
  return CATEGORY_IDS.includes(id);
}

export function categoryName(id) {
  const found = CATEGORIES.find((c) => c.id === id);
  return found ? found.name : 'General';
}
