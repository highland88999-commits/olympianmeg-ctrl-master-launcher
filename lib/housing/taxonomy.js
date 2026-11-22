// lib/housing/taxonomy.js — Sections and property types for Omega Housing.
//
// Three sections, in the user's words: Real Estate (homes for sale),
// Rentals (long-term rentals), Temporary (hotels, hostels, short stays).
// Property types are a small fixed list; typeForKeywords maps a listing's
// own words onto one, and returns null when nothing matches — never a
// guessed type.

export const SECTIONS = [
  { id: 'real-estate', label: 'Real Estate', hint: 'Homes for sale' },
  { id: 'rentals', label: 'Rentals', hint: 'Long-term rentals' },
  { id: 'temporary', label: 'Temporary', hint: 'Hotels, hostels, short stays' },
];

export function sectionById(id) {
  return SECTIONS.find((s) => s.id === id) || null;
}

export const PROPERTY_TYPES = [
  { id: 'house', label: 'House' },
  { id: 'condo', label: 'Condo / Apartment' },
  { id: 'townhouse', label: 'Townhouse' },
  { id: 'duplex', label: 'Duplex / Multi-unit' },
  { id: 'land', label: 'Land' },
  { id: 'hotel', label: 'Hotel' },
  { id: 'hostel', label: 'Hostel' },
  { id: 'guest-house', label: 'Guest house / B&B' },
  { id: 'motel', label: 'Motel' },
  { id: 'other', label: 'Other' },
];

// Stay kinds first: "Grand Hotel & Suites" is a hotel, not a condo —
// 'suite' is a condo word too, so the stay kinds must win the match.
const TYPE_KEYWORDS = [
  { id: 'hotel', words: ['hotel'] },
  { id: 'hostel', words: ['hostel'] },
  { id: 'guest-house', words: ['guest house', 'guesthouse', 'bed and breakfast', 'b&b', 'inn'] },
  { id: 'motel', words: ['motel'] },
  { id: 'house', words: ['house', 'single family', 'single-family', 'detached', 'bungalow', 'cottage'] },
  { id: 'condo', words: ['condo', 'apartment', 'apt', 'flat', 'suite', 'unit'] },
  { id: 'townhouse', words: ['townhouse', 'townhome', 'row house'] },
  { id: 'duplex', words: ['duplex', 'triplex', 'fourplex', 'multi-unit', 'multi-family'] },
  { id: 'land', words: ['land', 'lot', 'vacant', 'acreage'] },
];

export function typeForKeywords(text) {
  if (!text) return null;
  const hay = String(text).toLowerCase();
  for (const { id, words } of TYPE_KEYWORDS) {
    if (words.some((w) => hay.includes(w))) return id;
  }
  return null;
}

export function typeLabel(id) {
  return PROPERTY_TYPES.find((t) => t.id === id)?.label || null;
}
