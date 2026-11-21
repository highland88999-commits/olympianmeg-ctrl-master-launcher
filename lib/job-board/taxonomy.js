// lib/job-board/taxonomy.js — Job category system for the Omega Job Board.
//
// Categories are grounded in the Canadian National Occupational Classification
// (NOC 2021) major groups (the two-digit codes in `noc`). Where a category
// maps cleanly onto the US Standard Occupational Classification (SOC), the
// crosswalk lives in SOC_MAP. These are classification aids for matching and
// filtering — not a legal or statistical claim about any listing.

export const CATEGORIES = [
  {
    id: 'trades',
    label: 'Trades & Skilled Trades',
    noc: ['72', '73', '74'],
    subcategories: [
      { id: 'electrical', label: 'Electrical' },
      { id: 'plumbing-hvac', label: 'Plumbing & HVAC' },
      { id: 'welding-metal', label: 'Welding & Metalwork' },
      { id: 'carpentry-wood', label: 'Carpentry & Woodworking' },
      { id: 'automotive', label: 'Automotive & Heavy Equipment' },
      { id: 'millwright-machinist', label: 'Millwright & Machinist' },
    ],
    keywords: [
      'welder', 'welding', 'electrician', 'electrical', 'plumber', 'plumbing',
      'hvac', 'carpenter', 'carpentry', 'millwright', 'machinist', 'mechanic',
      'pipefitter', 'steamfitter', 'boilermaker', 'ironworker', 'sheet metal',
      'journeyman', 'red seal', 'apprentice', 'fitter', 'fabricator',
      'tool and die', 'refrigeration', 'gas fitter', 'heavy duty mechanic',
    ],
  },
  {
    id: 'healthcare',
    label: 'Healthcare',
    noc: ['30', '31', '32', '33'],
    subcategories: [
      { id: 'nursing', label: 'Nursing' },
      { id: 'physicians', label: 'Physicians & Specialists' },
      { id: 'allied-health', label: 'Allied Health' },
      { id: 'pharmacy', label: 'Pharmacy' },
      { id: 'care-aide', label: 'Care Aides & Support' },
      { id: 'mental-health', label: 'Mental Health & Counselling' },
    ],
    keywords: [
      'nurse', 'nursing', 'registered nurse', 'rn ', 'lpn', 'rpn', 'physician',
      'doctor', 'surgeon', 'pharmacist', 'pharmacy', 'paramedic', 'emt',
      'physiotherapist', 'occupational therapist', 'dental', 'dentist',
      'care aide', 'personal support worker', 'psw', 'health care aide',
      'medical', 'clinical', 'therapist', 'counsellor', 'counselor',
      'radiology', 'laboratory technologist', 'midwife', 'respiratory therapist',
    ],
  },
  {
    id: 'tech',
    label: 'Tech & IT',
    noc: ['20', '21', '22'],
    subcategories: [
      { id: 'software-dev', label: 'Software Development' },
      { id: 'data-ai', label: 'Data & AI' },
      { id: 'it-support', label: 'IT Support & Infrastructure' },
      { id: 'cybersecurity', label: 'Cybersecurity' },
      { id: 'design-ux', label: 'Design & UX' },
      { id: 'product', label: 'Product & Project Management' },
    ],
    keywords: [
      'software', 'developer', 'programmer', 'engineer', 'data scientist',
      'data analyst', 'devops', 'sysadmin', 'network', 'cybersecurity',
      'security analyst', 'web developer', 'frontend', 'front-end', 'backend',
      'back-end', 'full stack', 'full-stack', 'python', 'javascript', 'java',
      'cloud', 'database', 'dba', 'qa ', 'quality assurance', 'tester',
      'ux ', 'ui ', 'designer', 'product manager', 'scrum', 'machine learning',
      'artificial intelligence', 'it support', 'help desk', 'technician',
    ],
  },
  {
    id: 'retail-sales',
    label: 'Retail & Sales',
    noc: ['60', '62', '64', '65'],
    subcategories: [
      { id: 'retail-associate', label: 'Retail Associate' },
      { id: 'store-management', label: 'Store Management' },
      { id: 'sales-rep', label: 'Sales Representative' },
      { id: 'cashier', label: 'Cashier & Checkout' },
      { id: 'ecommerce', label: 'E-commerce' },
    ],
    keywords: [
      'retail', 'sales associate', 'cashier', 'store manager', 'sales rep',
      'sales representative', 'account manager', 'account executive',
      'customer service', 'merchandiser', 'stock clerk', 'sales clerk',
      'business development', 'inside sales', 'outside sales', 'key holder',
    ],
  },
  {
    id: 'hospitality-food',
    label: 'Hospitality & Food Service',
    noc: ['60', '63', '64', '65'],
    subcategories: [
      { id: 'cooks-chefs', label: 'Cooks & Chefs' },
      { id: 'servers', label: 'Servers & Bartenders' },
      { id: 'hotel', label: 'Hotel & Front Desk' },
      { id: 'tourism', label: 'Tourism & Travel' },
      { id: 'bakery', label: 'Bakery & Butchery' },
    ],
    keywords: [
      'cook', 'chef', 'server', 'bartender', 'barista', 'hotel', 'front desk',
      'housekeeping', 'concierge', 'restaurant', 'food service', 'dishwasher',
      'hostess', 'host ', 'tour guide', 'tourism', 'baker', 'butcher',
      'catering', 'sommelier', 'line cook', 'sous chef',
    ],
  },
  {
    id: 'transport-logistics',
    label: 'Transport & Logistics',
    noc: ['72', '73', '74', '75'],
    subcategories: [
      { id: 'trucking', label: 'Trucking & Driving' },
      { id: 'warehouse', label: 'Warehouse & Fulfillment' },
      { id: 'dispatch', label: 'Dispatch & Fleet' },
      { id: 'aviation', label: 'Aviation' },
      { id: 'rail-marine', label: 'Rail & Marine' },
      { id: 'courier', label: 'Courier & Delivery' },
    ],
    keywords: [
      'truck driver', 'driver', 'courier', 'delivery', 'warehouse',
      'forklift', 'dispatcher', 'logistics', 'supply chain', 'fleet',
      'pilot', 'flight attendant', 'rail', 'conductor', 'marine', 'seafarer',
      'shipping', 'receiving', 'material handler', 'class 1', 'class 3',
      'az driver', 'dz driver', 'aircraft', 'customs broker',
    ],
  },
  {
    id: 'admin-office',
    label: 'Admin & Office',
    noc: ['12', '13', '14'],
    subcategories: [
      { id: 'admin-assistant', label: 'Administrative Assistant' },
      { id: 'executive-assistant', label: 'Executive Assistant' },
      { id: 'reception', label: 'Reception & Front Office' },
      { id: 'data-entry', label: 'Data Entry & Records' },
      { id: 'office-management', label: 'Office Management' },
    ],
    keywords: [
      'administrative assistant', 'admin assistant', 'executive assistant',
      'receptionist', 'office manager', 'office administrator', 'secretary',
      'data entry', 'clerk', 'records', 'coordinator', 'scheduler',
      'mail room', 'filing', 'office support', 'virtual assistant',
    ],
  },
  {
    id: 'education',
    label: 'Education',
    noc: ['40', '41', '42', '44', '45'],
    subcategories: [
      { id: 'teachers', label: 'Teachers' },
      { id: 'early-childhood', label: 'Early Childhood Education' },
      { id: 'postsecondary', label: 'Post-Secondary' },
      { id: 'support-staff', label: 'Education Support Staff' },
      { id: 'training', label: 'Training & Instruction' },
    ],
    keywords: [
      'teacher', 'teaching', 'educator', 'professor', 'instructor',
      'early childhood educator', 'ece', 'educational assistant', 'tutor',
      'principal', 'school', 'curriculum', 'lecturer', 'trainer',
      'teaching assistant', 'librarian', 'childcare', 'daycare',
    ],
  },
  {
    id: 'finance-accounting',
    label: 'Finance & Accounting',
    noc: ['10', '11', '12'],
    subcategories: [
      { id: 'accounting', label: 'Accounting & Bookkeeping' },
      { id: 'banking', label: 'Banking' },
      { id: 'financial-advisory', label: 'Financial Advisory' },
      { id: 'insurance', label: 'Insurance' },
      { id: 'audit-tax', label: 'Audit & Tax' },
    ],
    keywords: [
      'accountant', 'accounting', 'bookkeeper', 'bookkeeping', 'finance',
      'financial analyst', 'banker', 'bank teller', 'auditor', 'tax',
      'payroll', 'accounts payable', 'accounts receivable', 'controller',
      'cpa', 'cfa', 'insurance', 'underwriter', 'claims adjuster',
      'investment', 'mortgage', 'credit analyst',
    ],
  },
  {
    id: 'manufacturing',
    label: 'Manufacturing',
    noc: ['90', '92', '93', '94', '95'],
    subcategories: [
      { id: 'production', label: 'Production & Assembly' },
      { id: 'machine-operation', label: 'Machine Operation' },
      { id: 'quality-control', label: 'Quality Control' },
      { id: 'maintenance', label: 'Plant Maintenance' },
      { id: 'food-processing', label: 'Food Processing' },
    ],
    keywords: [
      'manufacturing', 'production', 'assembly', 'machine operator',
      'cnc', 'quality control', 'quality assurance', 'plant', 'factory',
      'packaging', 'food processing', 'meat packing', 'sawmill',
      'production supervisor', 'industrial', 'fabrication',
    ],
  },
  {
    id: 'agriculture-natural-resources',
    label: 'Agriculture & Natural Resources',
    noc: ['80', '82', '83', '84', '85'],
    subcategories: [
      { id: 'farming', label: 'Farming & Ranching' },
      { id: 'forestry', label: 'Forestry & Logging' },
      { id: 'fishing', label: 'Fishing & Aquaculture' },
      { id: 'landscaping', label: 'Landscaping & Grounds' },
      { id: 'veterinary', label: 'Veterinary & Animal Care' },
    ],
    keywords: [
      'farm', 'farmer', 'ranch', 'agriculture', 'agronomist', 'forestry',
      'logger', 'logging', 'fishing', 'fisherman', 'aquaculture',
      'landscaper', 'landscaping', 'groundskeeper', 'arborist',
      'veterinarian', 'vet tech', 'animal care', 'harvest', 'greenhouse',
      'horticulture', 'grain', 'livestock', 'dairy',
    ],
  },
  {
    id: 'government-public-service',
    label: 'Government & Public Service',
    noc: ['40', '41', '43', '44'],
    subcategories: [
      { id: 'federal', label: 'Federal Government' },
      { id: 'provincial', label: 'Provincial Government' },
      { id: 'municipal', label: 'Municipal Government' },
      { id: 'policy', label: 'Policy & Analysis' },
      { id: 'public-safety-admin', label: 'Public Safety Administration' },
    ],
    keywords: [
      'government', 'public service', 'policy analyst', 'civil service',
      'municipal', 'federal', 'provincial', 'city clerk', 'bylaw',
      'public administration', 'program officer', 'regulator', 'inspector',
      'crown', 'ministry', 'department of', 'elections',
    ],
  },
  {
    id: 'construction',
    label: 'Construction',
    noc: ['70', '72', '73', '75'],
    subcategories: [
      { id: 'general-labour', label: 'General Labour' },
      { id: 'concrete', label: 'Concrete & Masonry' },
      { id: 'roofing', label: 'Roofing' },
      { id: 'drywall-painting', label: 'Drywall & Painting' },
      { id: 'heavy-equipment', label: 'Heavy Equipment Operation' },
      { id: 'project-management', label: 'Construction Management' },
    ],
    keywords: [
      'construction', 'labourer', 'laborer', 'concrete', 'masonry', 'bricklayer',
      'roofer', 'roofing', 'drywall', 'painter', 'painting', 'crane operator',
      'heavy equipment', 'excavator', 'carpenter', 'framer', 'scaffolder',
      'site supervisor', 'foreman', 'project manager', 'estimator',
      'surveyor', 'insulator', 'glazier', 'flooring',
    ],
  },
  {
    id: 'engineering',
    label: 'Engineering',
    noc: ['20', '21', '22'],
    subcategories: [
      { id: 'civil', label: 'Civil Engineering' },
      { id: 'mechanical', label: 'Mechanical Engineering' },
      { id: 'electrical-eng', label: 'Electrical Engineering' },
      { id: 'chemical', label: 'Chemical Engineering' },
      { id: 'software-eng', label: 'Software Engineering' },
      { id: 'technologists', label: 'Engineering Technologists' },
    ],
    keywords: [
      'engineer', 'engineering', 'civil engineer', 'mechanical engineer',
      'electrical engineer', 'chemical engineer', 'structural engineer',
      'peng', 'eit', 'technologist', 'cad', 'design engineer',
      'process engineer', 'project engineer', 'geotechnical',
    ],
  },
  {
    id: 'legal',
    label: 'Legal',
    noc: ['41', '42', '43'],
    subcategories: [
      { id: 'lawyers', label: 'Lawyers' },
      { id: 'paralegal', label: 'Paralegal & Legal Assistant' },
      { id: 'court', label: 'Court Services' },
      { id: 'compliance', label: 'Compliance' },
    ],
    keywords: [
      'lawyer', 'attorney', 'paralegal', 'legal assistant', 'legal secretary',
      'court', 'clerk', 'notary', 'compliance', 'counsel', 'litigation',
      'law clerk', 'judge', 'mediator', 'arbitrator',
    ],
  },
  {
    id: 'arts-media',
    label: 'Arts & Media',
    noc: ['50', '51', '52', '53', '54', '55'],
    subcategories: [
      { id: 'visual-arts', label: 'Visual Arts' },
      { id: 'performing-arts', label: 'Performing Arts' },
      { id: 'writing', label: 'Writing & Editing' },
      { id: 'film-tv', label: 'Film & TV' },
      { id: 'music', label: 'Music & Audio' },
      { id: 'marketing-comms', label: 'Marketing & Communications' },
    ],
    keywords: [
      'artist', 'graphic designer', 'photographer', 'writer', 'editor',
      'journalist', 'actor', 'musician', 'producer', 'videographer',
      'marketing', 'communications', 'public relations', 'social media',
      'content creator', 'illustrator', 'animator', 'broadcaster',
      'copywriter', 'curator', 'archivist',
    ],
  },
  {
    id: 'science-research',
    label: 'Science & Research',
    noc: ['20', '21', '22'],
    subcategories: [
      { id: 'life-sciences', label: 'Life Sciences' },
      { id: 'physical-sciences', label: 'Physical Sciences' },
      { id: 'environmental', label: 'Environmental Science' },
      { id: 'lab-tech', label: 'Laboratory Technology' },
      { id: 'research', label: 'Research & Academia' },
    ],
    keywords: [
      'scientist', 'researcher', 'research', 'biologist', 'chemist',
      'physicist', 'geologist', 'environmental', 'laboratory', 'lab tech',
      'biochemist', 'microbiologist', 'ecologist', 'hydrologist',
      'clinical research', 'data science', 'statistician', 'mathematician',
    ],
  },
  {
    id: 'social-services',
    label: 'Social Services',
    noc: ['41', '42', '44'],
    subcategories: [
      { id: 'social-work', label: 'Social Work' },
      { id: 'community', label: 'Community Services' },
      { id: 'youth', label: 'Youth Services' },
      { id: 'addictions', label: 'Addictions & Support' },
      { id: 'nonprofit', label: 'Nonprofit & Charity' },
    ],
    keywords: [
      'social worker', 'social work', 'community worker', 'youth worker',
      'support worker', 'case manager', 'counsellor', 'counselor',
      'outreach', 'nonprofit', 'charity', 'addictions', 'mental health',
      'family services', 'shelter', 'advocate', 'settlement',
    ],
  },
  {
    id: 'energy-mining',
    label: 'Energy & Mining',
    noc: ['82', '83', '92', '94'],
    subcategories: [
      { id: 'oil-gas', label: 'Oil & Gas' },
      { id: 'mining', label: 'Mining' },
      { id: 'renewables', label: 'Renewables' },
      { id: 'utilities', label: 'Utilities & Power' },
    ],
    keywords: [
      'oil', 'gas', 'petroleum', 'miner', 'mining', 'drilling', 'rig',
      'pipeline', 'powerline', 'lineman', 'renewable', 'solar', 'wind turbine',
      'energy', 'utility', 'power plant', 'geologist', 'roughneck',
      'derrickhand', 'operator', 'refinery',
    ],
  },
  {
    id: 'security-protective',
    label: 'Security & Protective Services',
    noc: ['42', '43', '44'],
    subcategories: [
      { id: 'police', label: 'Police' },
      { id: 'fire', label: 'Fire Services' },
      { id: 'security-guard', label: 'Security Guard' },
      { id: 'corrections', label: 'Corrections' },
      { id: 'ems', label: 'Emergency Medical Services' },
    ],
    keywords: [
      'police', 'officer', 'firefighter', 'security guard', 'security',
      'corrections', 'paramedic', 'emt', 'emergency', 'sheriff', 'constable',
      'rcmp', 'border', 'customs', 'loss prevention', 'dispatch', '911',
    ],
  },
];

// US SOC crosswalk: NOC category id -> SOC major groups (2-digit).
// SOC majors: 11 Management, 13 Business/Financial, 15 Computer/Math,
// 17 Architecture/Engineering, 19 Life/Physical/Social Science, 21 Community/Social,
// 23 Legal, 25 Education, 27 Arts/Media, 29 Healthcare Practitioners,
// 31 Healthcare Support, 33 Protective Service, 35 Food Prep/Serving,
// 37 Building/Grounds, 39 Personal Care, 41 Sales, 43 Office/Admin,
// 45 Farming/Fishing/Forestry, 47 Construction/Extraction,
// 49 Installation/Maintenance/Repair, 51 Production, 53 Transportation.
export const SOC_MAP = {
  'trades': ['49'],
  'healthcare': ['29', '31'],
  'tech': ['15'],
  'retail-sales': ['41'],
  'hospitality-food': ['35', '39'],
  'transport-logistics': ['53'],
  'admin-office': ['43'],
  'education': ['25'],
  'finance-accounting': ['13'],
  'manufacturing': ['51'],
  'agriculture-natural-resources': ['45'],
  'government-public-service': ['11'],
  'construction': ['47'],
  'engineering': ['17'],
  'legal': ['23'],
  'arts-media': ['27'],
  'science-research': ['19'],
  'social-services': ['21'],
  'energy-mining': ['47'],
  'security-protective': ['33'],
};

// NOC COVERAGE NOTE (audited Nov 21 against the official NOC 2021 major-group
// list, noc.esdc.gc.ca): every real major group is now covered by at least
// one category except '00' (Legislative and senior managers), which spans
// all sectors and is deliberately left unassigned — a senior manager's
// category comes from the industry keywords, not from 00. Two bogus groups
// the first build carried were removed: '71' (construction) and '23'
// (engineering) are not NOC 2021 major groups. Groups added in this audit:
// '45' (education), '54'/'55' (arts-media), '80' (agriculture),
// '90'/'93' (manufacturing).

// ADZUNA CATEGORY CROSSWALK — Adzuna category slugs -> our category ids.
//
// Source: Adzuna's published category list (developer.adzuna.com/docs/
// categories — endpoint GET /v1/api/jobs/{country}/categories; tags are
// country-specific, so re-check the ca/us lists when the Adzuna adapter is
// built and a key is held). The slug set below is Adzuna's published list
// (28 sector labels in the ONS Adzuna dataset + Adzuna's own browse pages);
// the labels are Adzuna's, the mapping to OUR ids is the crosswalk — no new
// taxonomy was invented. Where Adzuna has no exact home in our taxonomy,
// the closest fit is used and marked below.
// Non-sector tags (level/type buckets, not industries) are NOT mapped —
// they stay in ADZUNA_NON_SECTOR_TAGS and the adapter must fall back to
// keyword classification for them, never force them into a wrong category.
export const ADZUNA_CATEGORY_MAP = {
  'accounting-finance-jobs': 'finance-accounting',
  'admin-jobs': 'admin-office',
  'charity-jobs': 'social-services',
  // Closest fit: management/business consulting has no dedicated home here.
  'consultancy-jobs': 'finance-accounting',
  'creative-design-jobs': 'arts-media',
  'customer-services-jobs': 'retail-sales',
  // Closest fit: domestic cleaning/housekeeping sits with hospitality.
  'domestic-help-cleaning-jobs': 'hospitality-food',
  'energy-oil-gas-jobs': 'energy-mining',
  'engineering-jobs': 'engineering',
  'facilities-maintenance-jobs': 'trades',
  'healthcare-nursing-jobs': 'healthcare',
  'hospitality-catering-jobs': 'hospitality-food',
  // Closest fit: HR/recruitment admin sits with office admin.
  'hr-recruitment-jobs': 'admin-office',
  'it-jobs': 'tech',
  'legal-jobs': 'legal',
  'manufacturing-jobs': 'manufacturing',
  'marketing-pr-jobs': 'arts-media',
  // Closest fit: no dedicated real-estate category; property roles
  // (surveyors, property/development managers) sit with construction.
  'property-jobs': 'construction',
  'retail-jobs': 'retail-sales',
  'sales-jobs': 'retail-sales',
  'scientific-qa-jobs': 'science-research',
  'social-care-jobs': 'social-services',
  'teaching-jobs': 'education',
  'trade-construction-jobs': 'construction',
  'transport-logistics-jobs': 'transport-logistics',
  'travel-jobs': 'hospitality-food',
};

// Adzuna tags that are NOT sectors: a level (graduate), a contract pattern
// (part-time), or a catch-all (other/general). Deliberately unmapped.
export const ADZUNA_NON_SECTOR_TAGS = [
  'graduate-jobs',
  'part-time-jobs',
  'other-jobs',
];

// Map an Adzuna category tag to one of our category ids, or null when the
// tag is a non-sector bucket or unknown (caller falls back to keyword
// classification via categoryForKeywords).
export function adzunaCategoryToOurs(tag) {
  if (!tag || typeof tag !== 'string') return null;
  return ADZUNA_CATEGORY_MAP[tag.trim().toLowerCase()] || null;
}

export function categoryById(id) {
  return CATEGORIES.find((c) => c.id === id) || null;
}

export function subcategoriesOf(id) {
  const cat = categoryById(id);
  return cat ? cat.subcategories : [];
}

// Classify free text (a job title, description, or resume excerpt) into the
// best-matching category id, or null when nothing matches. Scores by
// keyword hits with word-boundary matching; longer phrases win ties.
export function categoryForKeywords(text) {
  if (!text || typeof text !== 'string') return null;
  const hay = text.toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const cat of CATEGORIES) {
    let score = 0;
    for (const kw of cat.keywords) {
      const k = kw.trim().toLowerCase();
      if (!k) continue;
      // Word-boundary match so "rn" never matches "learn" and "cook"
      // never matches "cookie".
      const re = new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (re.test(hay)) score += k.includes(' ') ? 3 : 1;
    }
    // Subcategory labels also count.
    for (const sub of cat.subcategories) {
      if (hay.includes(sub.label.toLowerCase())) score += 2;
    }
    if (score > bestScore) {
      bestScore = score;
      best = cat.id;
    }
  }
  return bestScore > 0 ? best : null;
}
