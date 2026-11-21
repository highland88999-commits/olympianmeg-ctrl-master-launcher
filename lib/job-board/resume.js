// lib/job-board/resume.js — Pure resume text parsing for the Omega Job Board.
//
// parseResumeText(text) extracts only what is actually in the text — nothing
// is invented, guessed, or fetched. No network, no storage, no logging.

import { categoryForKeywords } from './taxonomy.js';

// Skills vocabulary, grouped by field. Matched case-insensitively against the
// resume text with word boundaries. Phrases beat single words for ranking.
export const SKILLS = [
  // Trades
  'welding', 'blueprint reading', 'smaw', 'mig welding', 'tig welding',
  'electrical wiring', 'plumbing', 'hvac', 'carpentry', 'framing',
  'millwright', 'machining', 'cnc machining', 'pipefitting', 'scaffolding',
  'concrete finishing', 'roofing', 'drywall', 'forklift operation',
  'heavy equipment operation', 'osha', 'whmis', 'first aid', 'fall protection',
  'lockout tagout', 'safety inspection', 'preventive maintenance',
  'troubleshooting', 'mechanical repair', 'hydraulics', 'pneumatics',
  // Tech
  'javascript', 'python', 'java', 'typescript', 'react', 'node.js', 'sql',
  'html', 'css', 'git', 'aws', 'azure', 'docker', 'kubernetes', 'linux',
  'machine learning', 'data analysis', 'excel', 'power bi', 'tableau',
  'cybersecurity', 'network administration', 'cloud computing', 'devops',
  'agile', 'scrum', 'api development', 'database administration',
  'technical support', 'qa testing', 'ui design', 'ux design',
  // Healthcare
  'patient care', 'vital signs', 'medication administration', 'phlebotomy',
  'cpr', 'bls', 'acls', 'electronic medical records', 'emr', 'triage',
  'infection control', 'wound care', 'iv therapy', 'charting',
  'medical terminology', 'diagnostic imaging', 'pharmacy', 'physiotherapy',
  // Office / business
  'project management', 'customer service', 'sales', 'bookkeeping',
  'payroll', 'accounts payable', 'accounts receivable', 'data entry',
  'scheduling', 'inventory management', 'procurement', 'negotiation',
  'leadership', 'team management', 'public speaking', 'report writing',
  'microsoft office', 'quickbooks', 'sap', 'crm', 'social media management',
  'marketing', 'event planning', 'billing', 'cash handling',
  // General
  'communication', 'problem solving', 'time management', 'teamwork',
  'bilingual', 'french', 'spanish', 'class 5 licence', 'class 1 licence',
  'food safety', 'food handling', 'servsafe', 'bartending', 'cooking',
  'teaching', 'tutoring', 'childcare', 'driving',
];

// Job titles recognised in resumes. Matched case-insensitively; the longest
// matching titles win when several overlap on the same line.
export const TITLES = [
  'welder', 'fitter-welder', 'electrician', 'plumber', 'carpenter',
  'millwright', 'machinist', 'mechanic', 'heavy duty mechanic',
  'pipefitter', 'steamfitter', 'boilermaker', 'ironworker',
  'registered nurse', 'licensed practical nurse', 'nurse', 'physician',
  'pharmacist', 'paramedic', 'physiotherapist', 'care aide',
  'personal support worker', 'medical laboratory technologist',
  'software developer', 'software engineer', 'web developer',
  'data analyst', 'data scientist', 'systems administrator',
  'network administrator', 'devops engineer', 'product manager',
  'project manager', 'it support technician', 'ux designer',
  'graphic designer', 'sales representative', 'account manager',
  'store manager', 'cashier', 'customer service representative',
  'chef', 'sous chef', 'line cook', 'cook', 'server', 'bartender',
  'barista', 'hotel manager', 'housekeeper', 'truck driver',
  'delivery driver', 'warehouse associate', 'forklift operator',
  'dispatcher', 'logistics coordinator', 'administrative assistant',
  'executive assistant', 'receptionist', 'office manager', 'clerk',
  'data entry clerk', 'teacher', 'professor', 'instructor',
  'early childhood educator', 'educational assistant', 'tutor',
  'accountant', 'bookkeeper', 'financial analyst', 'bank teller',
  'auditor', 'payroll administrator', 'production supervisor',
  'machine operator', 'quality control inspector', 'assembler',
  'farm worker', 'landscaper', 'forestry worker', 'veterinary technician',
  'construction labourer', 'labourer', 'concrete finisher', 'roofer',
  'drywall installer', 'painter', 'crane operator', 'site supervisor',
  'foreman', 'civil engineer', 'mechanical engineer', 'electrical engineer',
  'lawyer', 'paralegal', 'legal assistant', 'artist', 'photographer',
  'writer', 'editor', 'journalist', 'marketing manager',
  'scientist', 'researcher', 'biologist', 'chemist', 'social worker',
  'community support worker', 'case manager', 'security guard',
  'police officer', 'firefighter', 'oilfield operator', 'miner',
  'drilling rig operator', 'electrician apprentice', 'welder apprentice',
];

const DEGREE_PATTERNS = [
  /\b(ph\.?d\.?|doctorate)\b/i,
  /\b(master'?s(?: degree)?|m\.?sc\.?|m\.?a\.?|mba|m\.?eng\.?)\b/i,
  /\b(bachelor'?s(?: degree)?|b\.?sc\.?|b\.?a\.?|b\.?eng\.?|b\.?comm\.?)\b/i,
  /\b(associate(?:'s)? degree|associate diploma)\b/i,
  /\b(diploma|certificate|certification)\b/i,
  /\b(red seal|journeyman|journeyperson)\b/i,
  /\b(md|dds|rn|rp n|lpn|dvm)\b/i,
];

const PROVINCES = {
  AB: 'Alberta', BC: 'British Columbia', MB: 'Manitoba', NB: 'New Brunswick',
  NL: 'Newfoundland and Labrador', NS: 'Nova Scotia', NT: 'Northwest Territories',
  NU: 'Nunavut', ON: 'Ontario', PE: 'Prince Edward Island', QC: 'Quebec',
  SK: 'Saskatchewan', YT: 'Yukon',
};
const PROVINCE_NAMES = Object.values(PROVINCES);
const US_STATES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida',
  GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana',
  IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine',
  MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska',
  NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico',
  NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island',
  SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas',
  UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
  WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia',
};

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findPhrases(text, phrases) {
  const hits = [];
  for (const phrase of phrases) {
    const re = new RegExp(`\\b${escapeRegExp(phrase)}\\b`, 'i');
    if (re.test(text)) hits.push(phrase);
  }
  return hits;
}

function extractYears(text) {
  // Union of calendar years covered by YYYY–YYYY / YYYY–present ranges.
  const years = new Set();
  const rangeRe = /\b(19\d{2}|20\d{2})\s*(?:[-–—]|to)\s*(present|current|now|19\d{2}|20\d{2})\b/gi;
  let m;
  while ((m = rangeRe.exec(text)) !== null) {
    const start = parseInt(m[1], 10);
    const endRaw = m[2].toLowerCase();
    const end = /present|current|now/.test(endRaw)
      ? new Date().getFullYear()
      : parseInt(endRaw, 10);
    if (end >= start && end - start <= 60) {
      for (let y = start; y <= end; y++) years.add(y);
    }
  }
  let fromRanges = years.size;
  // Explicit "N years of experience" phrasing.
  let explicit = 0;
  const expRe = /(\d{1,2})\+?\s*(?:years?|yrs?)\s*(?:of\s+)?(?:experience|in|as|working)/gi;
  while ((m = expRe.exec(text)) !== null) {
    explicit = Math.max(explicit, parseInt(m[1], 10));
  }
  return Math.max(fromRanges, explicit);
}

function extractEducation(text) {
  const found = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (DEGREE_PATTERNS.some((re) => re.test(trimmed))) {
      found.push(trimmed.length > 140 ? trimmed.slice(0, 140) : trimmed);
    } else if (/\b(university|college|institute|polytechnic)\b/i.test(trimmed)
      && trimmed.length < 120) {
      found.push(trimmed);
    }
  }
  // Dedupe, keep order.
  return [...new Set(found)].slice(0, 12);
}

function extractLocation(text) {
  // Canadian postal code: A1A 1A1 (space optional).
  const caPostal = text.match(/\b([A-CEGHJ-NPR-TVXY]\d[A-CEGHJ-NPR-TV-Z])\s?(\d[A-CEGHJ-NPR-TV-Z]\d)\b/i);
  // "City, Province/State" pattern — the most reliable signal in resumes.
  const cityRegion = text.match(
    /\b([A-Z][A-Za-z'’.-]+(?:[ \t][A-Z][A-Za-z'’.-]+)?)[ \t]*,[ \t]*(Alberta|British Columbia|Manitoba|New Brunswick|Newfoundland and Labrador|Nova Scotia|Ontario|Quebec|Saskatchewan|Prince Edward Island|Yukon|Northwest Territories|Nunavut|AB|BC|MB|NB|NL|NS|ON|QC|SK|PE|YT|NT|NU|Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming)\b/,
  );
  if (cityRegion) {
    const regionRaw = cityRegion[2];
    const isCanadian = PROVINCES[regionRaw]
      || PROVINCE_NAMES.includes(regionRaw);
    const region = PROVINCES[regionRaw] || regionRaw;
    return {
      city: cityRegion[1].trim(),
      region,
      country: isCanadian ? 'Canada' : 'United States',
    };
  }
  if (caPostal) {
    return { city: null, region: null, country: 'Canada' };
  }
  // US ZIP on its own is weak, but combined with a state name it counts.
  const stateName = text.match(
    new RegExp(`\\b(${Object.values(US_STATES).join('|')})\\b`),
  );
  if (stateName) {
    return { city: null, region: stateName[1], country: 'United States' };
  }
  const provName = text.match(new RegExp(`\\b(${PROVINCE_NAMES.join('|')})\\b`));
  if (provName) {
    return { city: null, region: provName[1], country: 'Canada' };
  }
  return null;
}

function extractTitles(text) {
  const hits = findPhrases(text, TITLES);
  // Also catch "Title at Company" lines inside Experience / Work History
  // sections that name a title not in the vocabulary list.
  const lines = text.split(/\r?\n/);
  let inExperience = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^(experience|work history|employment|professional experience)\b/i.test(trimmed)) {
      inExperience = true;
      continue;
    }
    if (/^(education|skills|certifications|projects|references)\b/i.test(trimmed)) {
      inExperience = false;
      continue;
    }
    if (!inExperience) continue;
    const m = trimmed.match(/^([A-Z][A-Za-z'’&/ -]{2,48}?)\s+(?:at|@|,)\s+[A-Z]/);
    if (m && !hits.some((h) => h.toLowerCase() === m[1].toLowerCase())) {
      const candidate = m[1].trim();
      if (!/^(the|a|an)\b/i.test(candidate)) hits.push(candidate);
    }
  }
  return hits;
}

export function parseResumeText(text) {
  const rawText = typeof text === 'string' ? text : '';
  const skills = findPhrases(rawText, SKILLS);
  const titles = extractTitles(rawText);
  const experienceYears = extractYears(rawText);
  const education = extractEducation(rawText);
  const location = extractLocation(rawText);
  return {
    skills,
    titles,
    experienceYears,
    education,
    location,
    category: categoryForKeywords(`${titles.join(' ')} ${rawText.slice(0, 4000)}`),
    rawText,
  };
}
