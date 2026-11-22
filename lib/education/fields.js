// lib/education/fields.js — Fields of study for Omega Education.
//
// Grounded in the Classification of Instructional Programs (CIP), the
// standard the US College Scorecard and Canadian institutions use to
// classify programs. Each field carries its CIP 2-digit family (or
// families) so the Scorecard adapter can filter on it; `cip` is null
// where no single CIP family fits (general K-12, early childhood).
//
// K-12 schools carry fields ['general'] in the directory and match ANY
// field filter in search.js — a K-12 school teaches the full curriculum,
// so it is never wrong to show it for a field. The page says so in plain
// words next to the field picker.

export const FIELDS = [
  { id: 'general', label: 'General (K-12)', cip: null, blurb: 'The full school curriculum — elementary through senior high.' },
  { id: 'early-childhood', label: 'Early childhood', cip: '19', blurb: 'Child care and early learning for ages 0–5.' },
  { id: 'trades', label: 'Skilled trades', cip: '46', blurb: 'Electrician, welder, plumber, carpenter and more — Red Seal trades.' },
  { id: 'engineering-tech', label: 'Engineering technology', cip: '15', blurb: 'Technician and technologist programs that keep things running.' },
  { id: 'engineering', label: 'Engineering', cip: '14', blurb: 'Civil, mechanical, electrical, chemical and more.' },
  { id: 'health', label: 'Health', cip: '51', blurb: 'Nursing, medicine, pharmacy, paramedicine and allied health.' },
  { id: 'business', label: 'Business', cip: '52', blurb: 'Commerce, management, accounting, marketing and finance.' },
  { id: 'science', label: 'Science', cip: '26', blurb: 'Biology, chemistry, physics, math and the natural sciences.' },
  { id: 'computing', label: 'Computing', cip: '11', blurb: 'Computer science, software, data and IT.' },
  { id: 'education', label: 'Education', cip: '13', blurb: 'Teaching and education — become a teacher.' },
  { id: 'arts', label: 'Arts', cip: '50', blurb: 'Fine arts, design, music, media and performance.' },
  { id: 'social-sciences', label: 'Social sciences', cip: '45', blurb: 'Psychology, sociology, political science, economics and history.' },
  { id: 'law', label: 'Law', cip: '22', blurb: 'Law degrees and legal studies.' },
  { id: 'agriculture', label: 'Agriculture', cip: '01', blurb: 'Farming, horticulture, animal science and food.' },
];

export const FIELD_IDS = new Set(FIELDS.map((f) => f.id));

export function fieldById(id) {
  return FIELDS.find((f) => f.id === id) || null;
}

// Keywords that suggest a field, for matching a typed search against
// fields. A typed word that names a field pre-selects it in the page.
export const FIELD_KEYWORDS = {
  trades: ['welder', 'welding', 'electrician', 'plumber', 'plumbing', 'carpenter', 'carpentry', 'millwright', 'mechanic', 'apprentice', 'apprenticeship', 'red seal'],
  'engineering-tech': ['technician', 'technologist', 'power engineering'],
  engineering: ['engineer', 'engineering', 'civil', 'mechanical', 'electrical engineering', 'chemical engineering'],
  health: ['nurse', 'nursing', 'doctor', 'medicine', 'medical', 'pharmacy', 'paramedic', 'health'],
  business: ['business', 'commerce', 'accounting', 'marketing', 'finance', 'management'],
  science: ['science', 'biology', 'chemistry', 'physics', 'math'],
  computing: ['computer', 'computing', 'software', 'programming', 'data'],
  education: ['teacher', 'teaching', 'education'],
  arts: ['art', 'arts', 'design', 'music', 'fine arts'],
  'social-sciences': ['psychology', 'sociology', 'political', 'economics', 'history'],
  law: ['law', 'legal'],
  agriculture: ['agriculture', 'farming', 'horticulture', 'animal science'],
  'early-childhood': ['daycare', 'child care', 'childcare', 'preschool', 'kindergarten'],
};

export function fieldForKeywords(text) {
  if (!text) return null;
  const hay = ` ${String(text).toLowerCase()} `;
  let best = null;
  let bestLen = 0;
  for (const [id, words] of Object.entries(FIELD_KEYWORDS)) {
    for (const w of words) {
      if (hay.includes(w) && w.length > bestLen) {
        best = id;
        bestLen = w.length;
      }
    }
  }
  return best;
}
