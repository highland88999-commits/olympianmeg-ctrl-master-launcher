// lib/social-assistance/data.js — Omega Social Assistance directory.
//
// A curated directory of government assistance programs, by jurisdiction.
// Every entry links to its official government source. No amounts are
// printed here on purpose: benefit amounts change every year (and the
// same program was quoted at different figures by different official
// pages for different benefit years), so the official page is the
// source of truth for what a program pays today. Eligibility income
// limits ARE printed where the official page states them plainly,
// because they are the "who it's for" of the program.
//
// Pure data + pure helpers — no imports — so node tests exercise it
// directly, like lib/job-board/taxonomy.js.
//
// Jurisdictions so far: Canada (federal), Alberta, United States
// (federal). More provinces, states and territories join the same way:
// one JURISDICTIONS entry + PROGRAMS entries with that jurisdiction id.

export const DISCLAIMER = 'This page only lists programs. Each program decides for itself who qualifies — this site does not decide anything, and the official page always has the final word. Amounts and rules change; the official page is the source of truth.';

export const JURISDICTIONS = Object.freeze([
  {
    id: 'canada',
    country: 'Canada',
    kind: 'federal',
    name: 'Canada — federal',
    blurb: 'Federal programs for everyone in Canada, no matter the province.',
    startHere: 'Not sure where to start? Call Service Canada at 1-800-277-9914, or use the federal Benefits Finder.',
    startHereUrl: 'https://www.canada.ca/en/services/benefits/finder/tool.html',
  },
  {
    id: 'alberta',
    country: 'Canada',
    kind: 'province',
    name: 'Alberta',
    blurb: 'Provincial programs for Albertans, on top of the federal ones above.',
    startHere: 'Not sure where to start? Call Alberta Supports at 1-877-644-9992 (7:30 am–8 pm, Monday to Friday), or dial 211 for local help. Emergency help, any time: 1-866-644-5135.',
    startHereUrl: 'https://www.alberta.ca/alberta-supports',
  },
  {
    id: 'united-states',
    country: 'United States',
    kind: 'federal',
    name: 'United States — federal',
    blurb: 'Federal programs for everyone in the United States, no matter the state. Most are run through your state — the official page points to the right state office.',
    startHere: 'Not sure where to start? Call 1-844-872-4681 (1-844-USA-GOV1), or use the federal Benefit Finder.',
    startHereUrl: 'https://www.benefits.gov/',
  },
]);

export const CATEGORIES = Object.freeze([
  { id: 'income', label: 'Income support', blurb: 'Money when work stops, hours drop, or earnings are low.' },
  { id: 'disability', label: 'Disability support', blurb: 'Help for people whose disability limits work or daily life.' },
  { id: 'children', label: 'Child and family benefits', blurb: 'Help with the cost of raising children.' },
  { id: 'food', label: 'Food help', blurb: 'Money and support for groceries and meals.' },
  { id: 'housing', label: 'Housing help', blurb: 'Help paying rent and finding an affordable home.' },
  { id: 'health', label: 'Health coverage', blurb: 'Coverage for doctors, hospitals, dental and prescriptions.' },
  { id: 'emergency', label: 'Emergency aid', blurb: 'Fast help when an emergency leaves you with nothing.' },
  { id: 'education', label: 'Education', blurb: 'Grants and loans for school, college and training.' },
]);

// One entry per program. Every field is plain words, verified against
// the official source at `url` (Nov 21, 2026). `source` names the
// government body that runs the program, so the reader knows whose
// page they are opening.
export const PROGRAMS = Object.freeze([
  // --- Canada — federal -----------------------------------------------
  {
    id: 'ca-ccb',
    jurisdiction: 'canada',
    category: 'children',
    name: 'Canada Child Benefit',
    what: 'A tax-free monthly payment that helps families with the cost of raising children under 18.',
    who: 'Families living in Canada with children under 18. The amount depends on family income and the number and ages of the children.',
    apply: 'Apply online through your CRA My Account, or by mail with the RC66 form. File your taxes every year — the payment is recalculated each July.',
    url: 'https://www.canada.ca/en/revenue-agency/services/child-family-benefits/canada-child-benefit/how-apply.html',
    source: 'Canada Revenue Agency',
  },
  {
    id: 'ca-cgeb',
    jurisdiction: 'canada',
    category: 'food',
    name: 'Canada Groceries and Essentials Benefit',
    what: 'A tax-free payment, four times a year, that helps with the cost of groceries and essentials. It replaced the GST/HST credit in July 2026.',
    who: 'Canadians with low or modest incomes. The amount depends on family income and size.',
    apply: 'No separate application — file your taxes every year and the Canada Revenue Agency works out if you qualify and pays you automatically.',
    url: 'https://www.canada.ca/en/revenue-agency/services/child-family-benefits/canada-groceries-essentials-benefit.html',
    source: 'Canada Revenue Agency',
  },
  {
    id: 'ca-cwb',
    jurisdiction: 'canada',
    category: 'income',
    name: 'Canada Workers Benefit',
    what: 'A refundable tax credit that tops up the earnings of working Canadians with low incomes.',
    who: 'Working people aged 19 or older with low earnings (or living with a spouse or child). There is also a disability supplement for people who qualify for the Disability Tax Credit.',
    apply: 'Claim it on your tax return — there is no separate application. Advance payments can be paid during the year if you qualify.',
    url: 'http://canada.ca/canada-workers-benefit',
    source: 'Government of Canada',
  },
  {
    id: 'ca-cdb',
    jurisdiction: 'canada',
    category: 'disability',
    name: 'Canada Disability Benefit',
    what: 'A direct monthly payment for working-age Canadians with disabilities.',
    who: 'Canadians aged 18 to 64 with a disability, who hold the Disability Tax Credit. The amount depends on income.',
    apply: 'Apply through Service Canada once you have the Disability Tax Credit. You must file your taxes every year to keep receiving it.',
    url: 'https://www.canada.ca/en/services/benefits/disability.html',
    source: 'Employment and Social Development Canada',
  },
  {
    id: 'ca-dtc',
    jurisdiction: 'canada',
    category: 'disability',
    name: 'Disability Tax Credit',
    what: 'A non-refundable tax credit that lowers the income tax paid by people with a severe and prolonged disability — and it is also the key that opens the door to other programs, including the Canada Disability Benefit.',
    who: 'People with a severe and prolonged impairment in physical or mental function, including children. A medical practitioner must certify the disability on the form.',
    apply: 'Fill in Form T2201 with your doctor or medical practitioner and send it to the Canada Revenue Agency. You can apply for past years too, if you qualified then.',
    url: 'https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/rc4064/disability-related-information.html',
    source: 'Canada Revenue Agency',
  },
  {
    id: 'ca-oas-gis',
    jurisdiction: 'canada',
    category: 'income',
    name: 'Old Age Security and Guaranteed Income Supplement',
    what: 'Old Age Security is a monthly payment for most Canadians aged 65 and older. The Guaranteed Income Supplement is a non-taxable top-up for low-income seniors who already get Old Age Security.',
    who: 'Old Age Security: Canadians 65 and older who have lived in Canada for at least 10 years after age 18. Guaranteed Income Supplement: low-income seniors receiving Old Age Security.',
    apply: 'Many people are enrolled automatically — Service Canada writes to you. If not, apply online through My Service Canada Account or by mail. For the supplement, apply with Old Age Security and file your taxes every year.',
    url: 'https://www.canada.ca/en/services/benefits/publicpensions.html',
    source: 'Service Canada',
  },
  {
    id: 'ca-cppd',
    jurisdiction: 'canada',
    category: 'disability',
    name: 'CPP Disability',
    what: 'A monthly payment for people under 65 who paid into the Canada Pension Plan and can no longer work because of a severe and prolonged disability.',
    who: 'People under 65 who contributed to the Canada Pension Plan in enough recent years and have a severe and prolonged disability that stops them working regularly. Children of recipients may also get a benefit.',
    apply: 'Apply online through My Service Canada Account or by mail. A doctor’s report is part of the application.',
    url: 'https://www.canada.ca/en/services/benefits/disability.html',
    source: 'Service Canada',
  },
  {
    id: 'ca-ei',
    jurisdiction: 'canada',
    category: 'income',
    name: 'Employment Insurance — regular benefits',
    what: 'Temporary income for people who lose their job through no fault of their own, while they look for work.',
    who: 'People who lost their job, have enough insurable hours in the last year, and are ready, willing and able to work.',
    apply: 'Apply online as soon as you stop working — even before your record of employment arrives. Waiting more than four weeks can cost you benefits.',
    url: 'https://www.canada.ca/en/services/benefits/ei/ei-regular-benefit.html',
    source: 'Service Canada',
  },
  {
    id: 'ca-cdcp',
    jurisdiction: 'canada',
    category: 'health',
    name: 'Canadian Dental Care Plan',
    what: 'Dental care coverage for Canadians without private dental insurance — checkups, cleanings, fillings and more, with no fee to apply.',
    who: 'Canadians with family income under $90,000 a year who do not have access to private dental insurance.',
    apply: 'Apply online, by phone, or in person at a Service Canada office. You will need your Social Insurance Number and your tax information.',
    url: 'https://www.canada.ca/en/services/benefits/dental/dental-care-plan.html',
    source: 'Government of Canada',
  },
  {
    id: 'ca-student-aid',
    jurisdiction: 'canada',
    category: 'education',
    name: 'Canada Student Grants and Loans',
    what: 'Money for post-secondary school: grants you never repay, and interest-free loans you repay after you finish studying.',
    who: 'Students from low- and middle-income families, including students with dependants and students with disabilities. The amount depends on your situation and province.',
    apply: 'Apply through your province or territory’s student aid office — one application covers both the federal and provincial parts.',
    url: 'https://www.canada.ca/en/services/benefits/education/student-aid/grants-loans.html',
    source: 'Government of Canada',
  },
  {
    id: 'ca-chb',
    jurisdiction: 'canada',
    category: 'housing',
    name: 'Canada Housing Benefit',
    what: 'Help with rent for people who need it, delivered through the provinces and territories — each one runs it a little differently.',
    who: 'Renters with low incomes. The provinces set their own rules, so who qualifies depends on where you live.',
    apply: 'Apply through your province or territory’s housing program. In Alberta, start with Alberta Supports at 1-877-644-9992 or the Find Housing tool.',
    url: 'https://www.canada.ca/en/services/benefits/finder/tool.html',
    source: 'Government of Canada — Benefits Finder',
  },

  // --- Alberta ----------------------------------------------------------
  {
    id: 'ab-supports',
    jurisdiction: 'alberta',
    category: 'emergency',
    name: 'Alberta Supports',
    what: 'The front door for Alberta’s help: one place that covers more than 30 programs and 120 services — income, food, housing, health and more.',
    who: 'Any Albertan who needs help. Staff can tell you what you qualify for and start the application with you.',
    apply: 'Call 1-877-644-9992, 7:30 am to 8 pm Monday to Friday, or visit the Alberta Supports website. For emergency help after hours, call 1-866-644-5135 any time.',
    url: 'https://www.alberta.ca/alberta-supports',
    source: 'Government of Alberta',
  },
  {
    id: 'ab-income-support',
    jurisdiction: 'alberta',
    category: 'income',
    name: 'Income Support',
    what: 'Monthly help for Albertans who cannot meet their basic needs — money for food, shelter, clothing and other essentials while you get back on your feet.',
    who: 'Albertans who cannot meet their basic needs and have little income or assets. You must be actively looking for work unless you cannot work.',
    apply: 'Apply online with an Alberta.ca Account, by phone, or in person. You will need ID and 60 days of bank statements. Decisions usually take up to two weeks; emergency help can come in as little as two days.',
    url: 'https://www.alberta.ca/income-support-how-to-apply',
    source: 'Government of Alberta',
  },
  {
    id: 'ab-emergency',
    jurisdiction: 'alberta',
    category: 'emergency',
    name: 'Emergency Financial Assistance',
    what: 'Fast help when an emergency leaves you with no money for food, shelter or other essentials.',
    who: 'Albertans in an emergency with no other way to pay for essentials. You do not need to be on Income Support to ask.',
    apply: 'Call Alberta Supports at 1-877-644-9992, or the 24/7 emergency line at 1-866-644-5135. Emergency food benefits can be sent by Interac e-Transfer.',
    url: 'https://www.alberta.ca/alberta-supports',
    source: 'Government of Alberta',
  },
  {
    id: 'ab-aish',
    jurisdiction: 'alberta',
    category: 'disability',
    name: 'Assured Income for the Severely Handicapped (AISH)',
    what: 'A monthly living allowance, a child benefit, and health and personal benefits for Albertans with a severe permanent disability that stops them working.',
    who: 'Albertans 18 and older with a severe permanent disability that prevents employment, who are Canadian citizens or permanent residents living in Alberta.',
    apply: 'Apply through Alberta Supports. You will need medical information about your disability. If you receive the Canada Disability Benefit or the Disability Tax Credit, tell AISH — it can affect your payment.',
    url: 'https://www.alberta.ca/aish',
    source: 'Government of Alberta',
  },
  {
    id: 'ab-acfb',
    jurisdiction: 'alberta',
    category: 'children',
    name: 'Alberta Child and Family Benefit',
    what: 'A payment for lower- and middle-income families with children under 18, with a base amount for all eligible families and an extra working component for families earning income.',
    who: 'Families in Alberta with children under 18 and low or middle incomes. You can still qualify while on AISH, Income Support or a child care subsidy.',
    apply: 'No separate application — file your taxes every year and the Canada Revenue Agency pays it on Alberta’s behalf.',
    url: 'https://www.alberta.ca/alberta-child-and-family-benefit',
    source: 'Government of Alberta',
  },
  {
    id: 'ab-seniors',
    jurisdiction: 'alberta',
    category: 'income',
    name: 'Alberta Seniors Benefit',
    what: 'A monthly supplement on top of Old Age Security and the Guaranteed Income Supplement, for low-income seniors in Alberta.',
    who: 'Albertan seniors 65 and older with low incomes who receive Old Age Security and the Guaranteed Income Supplement.',
    apply: 'Apply online at sfa.alberta.ca or by mail with the Seniors Financial Assistance form.',
    url: 'https://www.alberta.ca/alberta-seniors-benefit',
    source: 'Government of Alberta',
  },
  {
    id: 'ab-ahcip',
    jurisdiction: 'alberta',
    category: 'health',
    name: 'Alberta Health Care Insurance Plan (AHCIP)',
    what: 'Alberta’s public health coverage — doctor visits, hospital stays and more, at no cost at the point of care.',
    who: 'Alberta residents. You must register within three months of arriving in Alberta.',
    apply: 'Fill in the application form and take it, with your original documents, to a registry agent office. It is free, and your card usually arrives within five days. Questions: call 780-427-1432.',
    url: 'https://www.alberta.ca/ahcip-how-to-apply',
    source: 'Government of Alberta',
  },
  {
    id: 'ab-childcare',
    jurisdiction: 'alberta',
    category: 'children',
    name: 'Child Care Subsidy',
    what: 'Help paying for licensed child care, including out-of-school care for children in full-time kindergarten to grade 6.',
    who: 'Families in Alberta with children in licensed care and family income under $90,000 a year.',
    apply: 'Apply online with an Alberta.ca Account. You will need your child care arrangement and income details.',
    url: 'https://www.alberta.ca/child-care-subsidy-program?utm_source=google&utm_medium=sem&utm_campaign=childcare&utm_term=subsidy&utm_content=ad&gclid=CjwKCAjwlqOXBhBqEiwA-hhitOjr4rPi4NMEPN9boS4jfr8d8GMRbXBRZAvY3rxdZVY2OcWozD6DYhoCwccQAvD_BwE',
    source: 'Government of Alberta',
  },
  {
    id: 'ab-student-aid',
    jurisdiction: 'alberta',
    category: 'education',
    name: 'Alberta Student Aid',
    what: 'Grants, loans and scholarships for Albertans going to post-secondary school — full-time or part-time.',
    who: 'Alberta residents studying at a designated post-secondary school, with financial need. Part-time students can qualify too.',
    apply: 'Apply online. Questions: call 1-855-606-2096.',
    url: 'https://studentaid.alberta.ca/apply/?authuser=0',
    source: 'Government of Alberta',
  },
  {
    id: 'ab-housing',
    jurisdiction: 'alberta',
    category: 'housing',
    name: 'Affordable Housing and Rent Assistance',
    what: 'Long-term help with rent for low-income Albertans, including the Rent Assistance Benefit — a monthly payment that goes toward your rent in a private unit.',
    who: 'Low-income Albertans who need help with rent. Help is prioritized by need, and waiting lists are common.',
    apply: 'Start with the Find Housing tool on the Alberta government site, or call Alberta Supports at 1-877-644-9992. A local housing provider takes the application.',
    url: 'https://www.alberta.ca/affordable-housing-programs',
    source: 'Government of Alberta',
  },

  // --- United States — federal ------------------------------------------
  {
    id: 'us-snap',
    jurisdiction: 'united-states',
    category: 'food',
    name: 'SNAP (food stamps)',
    what: 'Monthly money for groceries, loaded onto an EBT card, for people and families with low incomes.',
    who: 'People with low incomes — generally households earning no more than 130% of the poverty level. Work requirements apply to many adults.',
    apply: 'Apply through your state’s SNAP agency — each state runs its own program. The federal directory lists every state’s office.',
    url: 'https://www.fns.usda.gov/snap/state-directory',
    source: 'U.S. Department of Agriculture',
  },
  {
    id: 'us-wic',
    jurisdiction: 'united-states',
    category: 'food',
    name: 'WIC',
    what: 'Food, nutrition education and breastfeeding support for mothers and young children.',
    who: 'Pregnant, breastfeeding and postpartum women, infants, and children up to age 5 who are at nutritional risk and meet income guidelines.',
    apply: 'Apply at your local WIC clinic. You can find it through the federal WIC site or by calling your state WIC office.',
    url: 'https://www.fns.usda.gov/wic',
    source: 'U.S. Department of Agriculture',
  },
  {
    id: 'us-ssi',
    jurisdiction: 'united-states',
    category: 'income',
    name: 'Supplemental Security Income (SSI)',
    what: 'A monthly payment for people with little or no income who are aged 65 or older, blind, or have a disability.',
    who: 'People 65 and older, blind, or disabled, with limited income and limited resources — generally under $2,000 for an individual or $3,000 for a couple.',
    apply: 'Apply online, by phone at 1-800-772-1213, or at your local Social Security office. In most states, SSI recipients get Medicaid automatically.',
    url: 'https://www.ssa.gov/apply/ssi',
    source: 'Social Security Administration',
  },
  {
    id: 'us-ssdi',
    jurisdiction: 'united-states',
    category: 'disability',
    name: 'Social Security Disability Insurance (SSDI)',
    what: 'A monthly payment for people who worked and paid Social Security taxes, and now cannot work because of a disability expected to last at least a year or result in death.',
    who: 'Workers with enough Social Security work credits who have a qualifying disability. Family members may also qualify.',
    apply: 'Apply online, by phone at 1-800-772-1213, or at your local Social Security office.',
    url: 'https://www.ssa.gov/apply',
    source: 'Social Security Administration',
  },
  {
    id: 'us-tanf',
    jurisdiction: 'united-states',
    category: 'income',
    name: 'Temporary Assistance for Needy Families (TANF)',
    what: 'Temporary cash help for families with children, plus job training and other support to help families become self-sufficient.',
    who: 'Families with children and very low incomes. Each state sets its own rules — there is a 60-month federal lifetime limit.',
    apply: 'Apply through your state’s TANF office. The federal Benefit Finder points to the right state office for you.',
    url: 'https://www.benefits.gov/',
    source: 'U.S. federal government — Benefits.gov',
  },
  {
    id: 'us-medicaid',
    jurisdiction: 'united-states',
    category: 'health',
    name: 'Medicaid',
    what: 'Free or low-cost health coverage for people with low incomes, including doctor visits, hospital care and prescriptions.',
    who: 'Adults, children, pregnant women, seniors and people with disabilities with low incomes. The rules and income limits vary by state.',
    apply: 'Apply through your state Medicaid agency or through HealthCare.gov.',
    url: 'https://www.medicaid.gov/',
    source: 'Centers for Medicare & Medicaid Services',
  },
  {
    id: 'us-chip',
    jurisdiction: 'united-states',
    category: 'health',
    name: 'Children’s Health Insurance Program (CHIP)',
    what: 'Low-cost health coverage for children in families that earn too much for Medicaid but cannot afford private insurance.',
    who: 'Children under 19 in working families. The income limit varies by state.',
    apply: 'Apply through your state CHIP program or through HealthCare.gov — one application checks both Medicaid and CHIP.',
    url: 'https://www.medicaid.gov/',
    source: 'Centers for Medicare & Medicaid Services',
  },
  {
    id: 'us-section8',
    jurisdiction: 'united-states',
    category: 'housing',
    name: 'Housing Choice Vouchers (Section 8)',
    what: 'A voucher that pays part of your rent in a private home or apartment you choose, so your rent stays affordable.',
    who: 'Very low-income families, seniors and people with disabilities. Your local housing authority sets its own rules, and waiting lists are common.',
    apply: 'Apply through your local Public Housing Agency — the federal site can help you find yours.',
    url: 'https://www.hud.gov/helping-americans/housing-choice-vouchers-tenants',
    source: 'U.S. Department of Housing and Urban Development',
  },
  {
    id: 'us-public-housing',
    jurisdiction: 'united-states',
    category: 'housing',
    name: 'Public Housing',
    what: 'Affordable rental homes owned and run by local housing authorities, with rent set to about 30% of your income.',
    who: 'Low-income families, seniors and people with disabilities. Eligibility depends on your income and family size.',
    apply: 'Apply through your local Public Housing Agency. Call (800) 955-2232 to find yours.',
    url: 'https://www.hud.gov/helping-americans',
    source: 'U.S. Department of Housing and Urban Development',
  },
  {
    id: 'us-liheap',
    jurisdiction: 'united-states',
    category: 'emergency',
    name: 'LIHEAP — energy help',
    what: 'Help paying heating and cooling bills, and emergency help when your heat is shut off or about to be.',
    who: 'Households with low incomes. Each state runs its own program and sets its own income limits.',
    apply: 'Apply through your state’s LIHEAP office. For urgent help, call the National Energy Assistance Referral line at 1-866-674-6327.',
    url: 'https://www.benefits.gov/',
    source: 'U.S. federal government — Benefits.gov',
  },
  {
    id: 'us-eitc',
    jurisdiction: 'united-states',
    category: 'income',
    name: 'Earned Income Tax Credit (EITC)',
    what: 'A refundable tax credit that boosts the income of working people with low to moderate earnings — if the credit is bigger than the tax you owe, you get the difference back.',
    who: 'Working people with low to moderate income, with or without children. You must file a tax return to claim it.',
    apply: 'Claim it on your federal tax return with Form 1040 and Schedule EIC. Free tax help is available through the IRS Volunteer Income Tax Assistance program.',
    url: 'https://www.irs.gov/credits-deductions/individuals/earned-income-tax-credit/how-to-claim-the-earned-income-tax-credit-eitc',
    source: 'Internal Revenue Service',
  },
  {
    id: 'us-ctc',
    jurisdiction: 'united-states',
    category: 'children',
    name: 'Child Tax Credit',
    what: 'A tax credit that lowers the federal tax of families with children — and part of it is refundable, so you can get money back even if you owe no tax.',
    who: 'Families with qualifying children under 17. The exact amount changes from year to year — the official page shows the current figure.',
    apply: 'Claim it on your federal tax return with Schedule 8812.',
    url: 'https://www.irs.gov/credits-deductions/individuals/refundable-tax-credits',
    source: 'Internal Revenue Service',
  },
  {
    id: 'us-pell',
    jurisdiction: 'united-states',
    category: 'education',
    name: 'Pell Grants',
    what: 'Grants for college or career school that you do not have to repay, for students with exceptional financial need.',
    who: 'Undergraduate students who have not yet earned a bachelor’s degree and have exceptional financial need. The maximum award changes each school year.',
    apply: 'Fill in the Free Application for Federal Student Aid (FAFSA) — that is the application for Pell Grants and most other federal student aid.',
    url: 'https://studentaid.gov/understand-aid/types/grants/pell?sk=GGLLKBrand',
    source: 'Federal Student Aid, U.S. Department of Education',
  },
]);

// --- helpers ------------------------------------------------------------

export function jurisdictionById(id) {
  return JURISDICTIONS.find((j) => j.id === id) || null;
}

export function categoryById(id) {
  return CATEGORIES.find((c) => c.id === id) || null;
}

export function programsFor(jurisdictionId, categoryId = null) {
  return PROGRAMS.filter((p) => p.jurisdiction === jurisdictionId
    && (categoryId === null || p.category === categoryId));
}

export function countByJurisdiction(jurisdictionId) {
  return programsFor(jurisdictionId).length;
}

// Categories that have at least one program in this jurisdiction,
// each with its program count — drives the category chips.
export function categoriesFor(jurisdictionId) {
  return CATEGORIES.map((c) => ({ ...c, count: programsFor(jurisdictionId, c.id).length }))
    .filter((c) => c.count > 0);
}

// Categories with no program in this jurisdiction — rendered as an
// honest empty-state note, not hidden, so the gap is visible.
export function emptyCategoriesFor(jurisdictionId) {
  return CATEGORIES.filter((c) => programsFor(jurisdictionId, c.id).length === 0);
}
