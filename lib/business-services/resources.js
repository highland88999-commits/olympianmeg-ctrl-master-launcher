// lib/business-services/resources.js — Omega Business Services directory.
//
// A static, curated directory of real business resources: grants, loans
// and financing, mentorship and advisory, registration and licensing,
// taxes, hiring help, and exporting and growth — for startups and for
// businesses that are already running, by jurisdiction.
//
// Every entry links to its OFFICIAL source (a government business
// portal, a grant program, or a recognised advisory body). No invented
// programs, no invented amounts or deadlines: an amount or a date
// appears only when the official source states it, and a note says so
// when a program is between intakes. Programs that have ended are left
// out on purpose — the Canada Digital Adoption Program, for example,
// closed March 31, 2025 and is not listed.
//
// Jurisdictions are data, not code: adding a province, state or
// territory means one JURISDICTIONS entry plus resources that name it.
// Canada first (federal + Alberta — the owner is in Redwater, Alberta),
// then United States federal, then US states (California, New York).
// Amounts and deadlines were checked November 21, 2026.
//
// Pure — no imports — so node tests exercise it directly.

export const CATEGORIES = [
  { id: 'grants', label: 'Grants' },
  { id: 'loans', label: 'Loans and financing' },
  { id: 'mentorship', label: 'Mentorship and advisory' },
  { id: 'registration', label: 'Registration and licensing' },
  { id: 'taxes', label: 'Taxes' },
  { id: 'hiring', label: 'Hiring help' },
  { id: 'exporting', label: 'Exporting and growth' },
];

export const AUDIENCES = [
  { id: 'startup', label: 'Startups' },
  { id: 'existing', label: 'Existing businesses' },
];

export const JURISDICTIONS = [
  { id: 'canada-federal', country: 'Canada', label: 'Canada — Federal' },
  { id: 'alberta', country: 'Canada', label: 'Alberta' },
  { id: 'us-federal', country: 'United States', label: 'United States — Federal' },
  { id: 'california', country: 'United States', label: 'California' },
  { id: 'new-york', country: 'United States', label: 'New York' },
];

// One resource. `audiences` is 'startup', 'existing', or both.
// `amount` and `note` appear only when the official source states them.
export const RESOURCES = [
  // -- Canada — Federal -----------------------------------------------------
  {
    id: 'benefits-finder',
    name: 'Business Benefits Finder',
    category: 'grants',
    audiences: ['startup', 'existing'],
    jurisdiction: 'canada-federal',
    source: 'Innovation, Science and Economic Development Canada',
    what: 'Answer a few questions about your business and it shows the federal, provincial and territorial programs you may qualify for — more than 1,500 of them.',
    who: 'Any Canadian business, whether you are starting out or already running.',
    how: 'Answer the short questionnaire on the page and it builds your list. Free.',
    url: 'https://innovation.ised-isde.canada.ca/s/list-liste?language=en_CA',
  },
  {
    id: 'ised-supports',
    name: 'Supports for business',
    category: 'grants',
    audiences: ['startup', 'existing'],
    jurisdiction: 'canada-federal',
    source: 'Innovation, Science and Economic Development Canada',
    what: 'The federal starting point for business help: funding programs, the permit finder, and the first steps to start or grow.',
    who: 'Any Canadian business looking for what the federal government offers.',
    how: 'Browse the hub and follow the links to the program that fits. Free.',
    url: 'https://ised-isde.canada.ca/site/ised/en/supports-for-business',
  },
  {
    id: 'starting-business-ca',
    name: 'Starting a business',
    category: 'registration',
    audiences: ['startup'],
    jurisdiction: 'canada-federal',
    source: 'Government of Canada (Canada.ca)',
    what: 'The federal checklist for starting a business in Canada: planning, choosing a structure, and registering.',
    who: 'Anyone starting a business in Canada.',
    how: 'Work through the steps on the page in order. Free.',
    url: 'https://www.canada.ca/en/services/business/start.html',
  },
  {
    id: 'bdc-small-loan',
    name: 'BDC Small Business Loan',
    category: 'loans',
    audiences: ['startup', 'existing'],
    jurisdiction: 'canada-federal',
    source: 'Business Development Bank of Canada',
    what: 'A term loan for small businesses, with flexible repayment that can match your cash flow.',
    who: 'Businesses with at least $100,000 in revenue and 24 months behind them.',
    how: 'Apply online through BDC; a BDC advisor reviews it with you.',
    amount: 'Up to $350,000',
    url: 'https://www.BDC.ca/en/financing/small-business-loan?languageOrigin=zh-hans',
  },
  {
    id: 'csbfp',
    name: 'Canada Small Business Financing Program',
    category: 'loans',
    audiences: ['startup', 'existing'],
    jurisdiction: 'canada-federal',
    source: 'Innovation, Science and Economic Development Canada',
    what: 'The federal government shares the risk with your lender, so a bank or credit union can lend to a small business that could not borrow on its own.',
    who: 'Small businesses with $10 million or less in annual revenue; farming is excluded.',
    how: 'Apply through your bank or credit union — the lender handles the program paperwork.',
    amount: 'Up to $1.15 million ($1 million term loan + $150,000 line of credit)',
    url: 'https://www.ised-isde.canada.ca/site/canada-small-business-financing-program/en/canada-small-business-financing-program/find-loan-your-small-business/helping-small-businesses-get-loans',
  },
  {
    id: 'futurpreneur',
    name: 'Futurpreneur',
    category: 'loans',
    audiences: ['startup'],
    jurisdiction: 'canada-federal',
    source: 'Futurpreneur Canada',
    what: 'A startup loan paired with a mentor: money to launch, plus up to two years of one-to-one mentoring from an experienced business person.',
    who: 'Founders aged 18 to 39 starting a new business in Canada.',
    how: 'Apply online; you are matched with a mentor if the loan is approved.',
    amount: 'Up to $75,000 loan + up to 2 years of mentorship',
    url: 'https://futurpreneur.ca/en/offering/core-startup/',
  },
  {
    id: 'nrc-irap',
    name: 'NRC IRAP',
    category: 'grants',
    audiences: ['startup', 'existing'],
    jurisdiction: 'canada-federal',
    source: 'National Research Council Canada',
    what: 'Non-repayable help for research and development: funding plus advice from an Industrial Technology Advisor.',
    who: 'Incorporated, for-profit Canadian small and medium businesses with 500 employees or fewer.',
    how: 'It starts with a phone call, not a form — call 1-877-994-4727 and an advisor talks it through.',
    url: 'https://nrc.canada.ca/en/support-technology-innovation/financial-support-technology-innovation',
  },
  {
    id: 'canexport-sme',
    name: 'CanExport SMEs',
    category: 'exporting',
    audiences: ['existing'],
    jurisdiction: 'canada-federal',
    source: 'Canadian Trade Commissioner Service',
    what: 'Cost-shared funding for export marketing: trade shows, travel to meet buyers, and adapting your product for a new market.',
    who: 'Small and medium businesses already selling and ready to export.',
    how: 'Apply through the Trade Commissioner Service when an intake is open.',
    amount: 'Up to $50,000 (50% cost-share)',
    note: 'The 2026–27 intake ended August 31, 2026 — between intakes, check the page for the next window.',
    url: 'https://www.tradecommissioner.gc.ca/en/our-solutions/funding-financing-international-business/canexport-smes/applicants-guide-2026-27.html',
  },
  {
    id: 'cra-bro',
    name: 'Registering your business (CRA)',
    category: 'registration',
    audiences: ['startup'],
    jurisdiction: 'canada-federal',
    source: 'Canada Revenue Agency',
    what: 'One place to get a business number and open the tax accounts a business needs: GST/HST, payroll, and import/export.',
    who: 'Anyone registering a new business in Canada.',
    how: 'Register online through the CRA Business Registration Online service. Free.',
    url: 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/registering-your-business/business-registration-online-overview.html',
  },
  {
    id: 'cra-digital',
    name: 'CRA digital services for businesses',
    category: 'taxes',
    audiences: ['startup', 'existing'],
    jurisdiction: 'canada-federal',
    source: 'Canada Revenue Agency',
    what: 'The CRA’s online services for businesses: My Business Account, GST/HST filing, payroll, and paying what you owe.',
    who: 'Any Canadian business that files or pays business taxes.',
    how: 'Sign in with a CRA user ID or a Sign-In Partner. Free.',
    url: 'https://www.canada.ca/en/revenue-agency/news/newsroom/tax-tips/tax-tips-2024/looking-fastest-easiest-way-view-manage-business-taxes-online-use-our-digital-services.html',
  },
  {
    id: 'corporations-canada',
    name: 'Incorporating federally',
    category: 'registration',
    audiences: ['startup'],
    jurisdiction: 'canada-federal',
    source: 'Corporations Canada (ISED)',
    what: 'The five steps to incorporate a business federally, so it can operate under the same name in every province and territory.',
    who: 'Founders who want a federal corporation rather than a provincial one.',
    how: 'Follow the five steps on the page and file online. Fees apply.',
    url: 'https://ised-isde.canada.ca/site/corporations-canada/en/business-corporations/how-incorporate-business',
  },
  {
    id: 'bizpal',
    name: 'BizPaL',
    category: 'registration',
    audiences: ['startup'],
    jurisdiction: 'canada-federal',
    source: 'BizPaL (federal, provincial, territorial and municipal partners)',
    what: 'A free finder for the permits and licences your business needs, from all levels of government, in one list.',
    who: 'Anyone starting or changing a business in Canada.',
    how: 'Answer a few questions about your business and location; it lists the permits that apply. Free.',
    url: 'https://bizpal.ca/en/faq/',
  },
  {
    id: 'edc',
    name: 'Export Development Canada (EDC)',
    category: 'exporting',
    audiences: ['existing'],
    jurisdiction: 'canada-federal',
    source: 'Export Development Canada',
    what: 'Canada’s export credit agency, a federal Crown corporation: export financing, credit insurance, bonding, and market know-how for selling abroad.',
    who: 'Canadian businesses that export, or are ready to.',
    how: 'Talk to EDC about your export plans; it works alongside your bank, not instead of it.',
    note: 'Budget 2026 (November 2026) announced a process to merge EDC with the Business Development Bank of Canada. EDC still operates as usual while that runs.',
    url: 'https://www.edc.ca/en/about-us.html',
  },
  {
    id: 'sred',
    name: 'SR&ED tax incentives',
    category: 'taxes',
    audiences: ['startup', 'existing'],
    jurisdiction: 'canada-federal',
    source: 'Canada Revenue Agency',
    what: 'Tax incentives for scientific research and experimental development done in Canada: a deduction plus an investment tax credit that can be refundable.',
    who: 'Corporations, individuals, trusts and partnerships doing research and development in Canada.',
    how: 'Claim it on your tax return; the CRA offers optional pre-claim approval before you start the work.',
    amount: '15% basic investment tax credit; 35% enhanced rate for small Canadian-controlled private corporations',
    url: 'https://www.canada.ca/en/revenue-agency/services/scientific-research-experimental-development-tax-incentive-program/what-are-sred-tax-incentives.html',
  },
  {
    id: 'canada-summer-jobs',
    name: 'Canada Summer Jobs',
    category: 'hiring',
    audiences: ['existing'],
    jurisdiction: 'canada-federal',
    source: 'Employment and Social Development Canada',
    what: 'A wage subsidy for summer jobs for young people aged 15 to 30: full-time work, 6 to 16 weeks, between April and August.',
    who: 'Not-for-profit and public-sector employers, and private-sector employers with 50 or fewer full-time employees.',
    how: 'Apply through the Grants and Contributions Online Services portal during the employer application period.',
    amount: 'Up to 100% of the provincial or territorial minimum wage (non-profits); up to 50% (public and small-business employers)',
    note: 'Employer applications for summer 2027 close December 3, 2026.',
    url: 'https://www.canada.ca/en/employment-social-development/services/funding/canada-summer-jobs/applicant-guide.html',
  },

  // -- Alberta ----------------------------------------------------------------
  {
    id: 'business-link',
    name: 'Business Link',
    category: 'mentorship',
    audiences: ['startup', 'existing'],
    jurisdiction: 'alberta',
    source: 'Business Link (Alberta)',
    what: 'Free one-to-one guidance from a Business Strategist: business plans, funding options, and what to do next.',
    who: 'Any Alberta business, starting or running.',
    how: 'Book a free guidance session on the page. Free.',
    url: 'https://businesslink.ca/services/business-guidance/',
  },
  {
    id: 'business-link-launch',
    name: 'Business Link Launch Program',
    category: 'mentorship',
    audiences: ['startup'],
    jurisdiction: 'alberta',
    source: 'Business Link (Alberta)',
    what: 'A free three-session program that walks a new founder through launching: the idea, the plan, and the first steps.',
    who: 'Albertans starting a new business.',
    how: 'Sign up for the program on the page. Free.',
    url: 'https://businesslink.ca/services/business-launch-program/',
  },
  {
    id: 'ab-innovates-vdg',
    name: 'Alberta Innovates Venture Development Grant',
    category: 'grants',
    audiences: ['startup', 'existing'],
    jurisdiction: 'alberta',
    source: 'Alberta Innovates',
    what: 'Funding to help Alberta technology ventures build and sell: product development, marketing, and getting to market.',
    who: 'Alberta technology ventures with fewer than 250 employees and under $50 million in revenue.',
    how: 'Apply online; intake is continuous, and the business puts in at least 25% cash.',
    amount: 'Up to $150,000',
    url: 'https://albertainnovates.ca/funding/venture-development-grant/',
  },
  {
    id: 'capg',
    name: 'Canada–Alberta Productivity Grant',
    category: 'hiring',
    audiences: ['existing'],
    jurisdiction: 'alberta',
    source: 'Government of Alberta',
    what: 'Shares the cost of job-relevant training for current or new employees: business, technical, and digital skills.',
    who: 'Alberta employers operating in the province for at least one year.',
    how: 'Apply before the training starts — retroactive funding is not allowed.',
    amount: '75% of eligible training costs, up to $5,000 per trainee per year and $100,000 per employer per year',
    // The URL carries a /fr/ path, but the page it serves is in English
    // (verified by opening it Nov 21, 2026) — do not "fix" the path.
    url: 'https://www.alberta.ca/fr/node/9728',
  },
  {
    id: 'ab-business-name',
    name: 'Registering an Alberta business name',
    category: 'registration',
    audiences: ['startup'],
    jurisdiction: 'alberta',
    source: 'Service Alberta',
    what: 'How to register a trade name or partnership in Alberta, through a registry agent.',
    who: 'Anyone starting a sole proprietorship or partnership in Alberta.',
    how: 'Apply through an Alberta registry agent. Fees apply.',
    url: 'https://www.servicealberta.gov.ab.ca/business-name-how-to-apply.cfm',
  },
  {
    id: 'ab-tap',
    name: 'Trade Accelerator Program',
    category: 'exporting',
    audiences: ['existing'],
    jurisdiction: 'alberta',
    source: 'Government of Alberta',
    what: 'Four hands-on export planning workshops that leave you with a real export plan for your business.',
    who: 'Alberta businesses with at least $50,000 in revenue and 2 years operating.',
    how: 'Apply for a cohort through the Alberta page.',
    url: 'https://www.alberta.ca/trade-accelerator-program',
  },
  {
    id: 'ab-level-up',
    name: 'Level Up',
    category: 'exporting',
    audiences: ['existing'],
    jurisdiction: 'alberta',
    source: 'Government of Alberta',
    what: 'Alberta’s trade program, launched in 2026: export help for Alberta businesses that want to sell beyond the province.',
    who: 'Alberta businesses ready to grow beyond local markets.',
    how: 'Start on the Alberta page.',
    url: 'https://www.alberta.ca/level-up',
  },
  {
    id: 'community-futures-ab',
    name: 'Community Futures Alberta',
    category: 'loans',
    audiences: ['startup', 'existing'],
    jurisdiction: 'alberta',
    source: 'Community Futures Network of Alberta',
    what: 'Guidance, workshops and small-business loans for rural Alberta: the first stop for entrepreneurs outside the big cities.',
    who: 'Small businesses and startups in rural Alberta.',
    how: 'Find your local office — 27 across rural Alberta — and book a free guidance session.',
    amount: 'Small-business loans up to $150,000',
    url: 'https://albertacf.com/services/starting-a-business',
  },
  {
    id: 'ab-ieg',
    name: 'Innovation Employment Grant',
    category: 'taxes',
    audiences: ['startup', 'existing'],
    jurisdiction: 'alberta',
    source: 'Government of Alberta (Tax and Revenue Administration)',
    what: 'A refundable tax credit for research and development done in Alberta, on top of the federal SR&ED credit.',
    who: 'Corporations doing research and development in Alberta.',
    how: 'No separate application — claim it on the Alberta corporate tax return (Schedule 29).',
    amount: '8% on Alberta R&D spending up to your base level; 20% on spending above it; up to $4 million a year',
    url: 'https://www.alberta.ca/innovation-employment-grant',
  },

  // -- United States — Federal ------------------------------------------------
  {
    id: 'sba-10-steps',
    name: '10 steps to start your business',
    category: 'registration',
    audiences: ['startup'],
    jurisdiction: 'us-federal',
    source: 'U.S. Small Business Administration',
    what: 'The SBA’s step-by-step guide to starting a business in the United States: planning, structure, registration, and funding.',
    who: 'Anyone starting a business in the United States.',
    how: 'Work through the ten steps on the page. Free.',
    url: 'https://legacy.sba.gov/business-guide/10-steps-start-your-business',
  },
  {
    id: 'sba-loans',
    name: 'SBA loans',
    category: 'loans',
    audiences: ['startup', 'existing'],
    jurisdiction: 'us-federal',
    source: 'U.S. Small Business Administration',
    what: 'Government-backed loans through banks and lenders: working capital, equipment, and real estate, with the SBA guaranteeing part of the loan.',
    who: 'Small businesses that meet the SBA’s size standards.',
    how: 'Apply through a participating lender; the SBA guarantee sits behind the loan.',
    amount: '7(a) loans up to $5 million; 504 loans up to $5.5 million; microloans up to $50,000',
    url: 'https://legacy.sba.gov/priorities/small-business-resource-hubs/interagency-capital-resources-small-businesses',
  },
  {
    id: 'score',
    name: 'SCORE',
    category: 'mentorship',
    audiences: ['startup', 'existing'],
    jurisdiction: 'us-federal',
    source: 'SCORE (SBA resource partner)',
    what: 'Free mentoring from experienced business people, plus workshops and templates for plans, money, and hiring.',
    who: 'Anyone starting or running a small business in the United States.',
    how: 'Find a mentor on the page and meet by email, phone or video. Free.',
    url: 'https://www.score.org/',
  },
  {
    id: 'grants-gov',
    name: 'Grants.gov',
    category: 'grants',
    audiences: ['startup', 'existing'],
    jurisdiction: 'us-federal',
    source: 'Grants.gov (U.S. federal government)',
    what: 'Search every federal grant opportunity in one place, from all federal agencies.',
    who: 'Organizations and businesses that fit a federal grant’s eligibility — grants fund projects, not personal expenses.',
    how: 'Search the site, check eligibility, and apply through the grant’s own process.',
    note: 'Federal grants go to organizations and projects, not personal expenses — check eligibility before applying.',
    url: 'https://www.grants.gov/',
  },
  {
    id: 'sbir-sttr',
    name: 'SBIR / STTR — America’s Seed Fund',
    category: 'grants',
    audiences: ['startup'],
    jurisdiction: 'us-federal',
    source: 'America’s Seed Fund (11 federal agencies)',
    what: 'Federal funding for small businesses doing research and development: no equity taken, no repayment.',
    who: 'Small businesses doing research and development with commercial potential.',
    how: 'Apply to the agency whose topic fits your work; the Seed Fund page explains the two programs.',
    note: 'Authority extended through September 30, 2031.',
    url: 'https://seed.nih.gov/small-business-funding/small-business-program-basics/understanding-sbir-sttr',
  },
  {
    id: 'irs-self-employed',
    name: 'IRS Self-Employed Tax Center',
    category: 'taxes',
    audiences: ['startup', 'existing'],
    jurisdiction: 'us-federal',
    source: 'Internal Revenue Service',
    what: 'The IRS’s home base for self-employed people and small businesses: what you owe, how to pay, and the forms to use.',
    who: 'Self-employed people and small businesses in the United States.',
    how: 'Browse the center for your topic. Free.',
    url: 'https://www.irs.gov/businesses/small-businesses-self-employed/self-employed-individuals-tax-center',
  },
  {
    id: 'exim',
    name: 'Export-Import Bank of the United States (EXIM)',
    category: 'exporting',
    audiences: ['existing'],
    jurisdiction: 'us-federal',
    source: 'Export-Import Bank of the United States',
    what: 'The official U.S. export credit agency: working-capital guarantees, export credit insurance, and term financing for foreign buyers.',
    who: 'U.S. businesses that export, or are ready to.',
    how: 'Talk to EXIM about your export sale; it works with your bank and your buyer’s bank.',
    amount: 'Working-capital guarantee up to 90% of a bank loan; export credit insurance up to 95% of the invoice',
    note: 'Support in more than 180 countries; no deal is too small.',
    url: 'https://www.exim.gov/government-exim-export-support',
  },

  // -- California ---------------------------------------------------------------
  {
    id: 'ca-gobiz-incentives',
    name: 'California Business Incentives List',
    category: 'grants',
    audiences: ['startup', 'existing'],
    jurisdiction: 'california',
    source: 'California Governor’s Office of Business and Economic Development (GO-Biz)',
    what: 'California’s list of state incentives in one place: tax credits, grants, export help, and rebates, with deadlines.',
    who: 'Businesses operating or expanding in California.',
    how: 'Find the incentive that fits on the list and follow its link to apply.',
    note: 'California Competes Tax Credit windows run January 4–25 and March 1–15, 2027; the State Trade Expansion Program reimburses export costs up to $10,000 (deadline April 30, 2027).',
    url: 'https://business.ca.gov/resources/incentives-grants-and-financing/calbis-resources/california-business-incentives-list/',
  },

  // -- New York -----------------------------------------------------------------
  {
    id: 'ny-esd-small-business',
    name: 'Empire State Development Small Business Hub',
    category: 'loans',
    audiences: ['startup', 'existing'],
    jurisdiction: 'new-york',
    source: 'Empire State Development (New York)',
    what: 'New York’s small-business programs in one hub: loans, grants, training, and a checklist that matches programs to your goals.',
    who: 'New York businesses with under 100 employees.',
    how: 'Use the hub’s checklist to find the programs that fit, then apply through the program’s own page.',
    amount: 'Loans up to $100,000 (Regional Revolving Loan Trust Fund); up to $250,000 (Small Business Revolving Loan Fund)',
    url: 'https://esd.ny.gov/doing-business-ny/small-business-hub',
  },
];

export function jurisdictionById(id) {
  return JURISDICTIONS.find((j) => j.id === id) || null;
}

export function categoryById(id) {
  return CATEGORIES.find((c) => c.id === id) || null;
}

export function filterResources({ audience = 'all', jurisdiction = 'all', category = 'all', query = '' } = {}) {
  const q = (query || '').trim().toLowerCase();
  return RESOURCES.filter((r) => {
    if (audience !== 'all' && !r.audiences.includes(audience)) return false;
    if (jurisdiction !== 'all' && r.jurisdiction !== jurisdiction) return false;
    if (category !== 'all' && r.category !== category) return false;
    if (!q) return true;
    const hay = `${r.name} ${r.source} ${r.what} ${r.who} ${r.how}`.toLowerCase();
    return hay.includes(q);
  });
}

export function countByJurisdiction() {
  const counts = {};
  for (const r of RESOURCES) counts[r.jurisdiction] = (counts[r.jurisdiction] || 0) + 1;
  return counts;
}
