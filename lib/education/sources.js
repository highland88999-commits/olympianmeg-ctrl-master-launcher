// lib/education/sources.js — Source registry for Omega Education.
//
// status 'live' = the data is in the tree and was verified returning real
// entries during the build (see STATE.md for the verification log).
// status 'staged' = shown on the page with an outbound link; `gap` states
// exactly what is missing before it can go live. Nothing here is invented:
// a staged source never returns entries it does not have.

export const SOURCE_REGISTRY = [
  // --- Live: the baked-in directory ---
  {
    id: 'omega-directory',
    name: 'Omega Education directory',
    kind: 'directory',
    status: 'live',
    url: 'https://www.alberta.ca/education',
    notes: '615 entries: 476 Alberta K-12 schools (Alberta open data, Open Government Licence – Alberta) plus 139 universities, colleges, daycare providers and trades authorities, each linked to its real official homepage. URLs checked at build time.',
  },
  // --- Live when keyed: US College Scorecard ---
  {
    id: 'college-scorecard',
    name: 'College Scorecard (US Dept of Education)',
    kind: 'federal',
    status: 'staged',
    url: 'https://collegescorecard.ed.gov/data/',
    // Free API key via api.data.gov; ~6,500 Title IV institutions;
    // field-of-study search by CIP code; 1,000 requests/hour per key.
    // The adapter lives in lib/education/adapters/scorecard.js and reads
    // its key from the server env var SCORECARD_API_KEY.
    gap: 'Free API key not set on the server yet. Gap: SCORECARD_API_KEY env var (free signup at api.data.gov — no card). Until then, US coverage is the 12 bundled universities in the directory.',
  },
  // --- Staged: Canada ---
  {
    id: 'ircc-dli',
    name: 'IRCC Designated Learning Institutions',
    kind: 'federal',
    status: 'staged',
    url: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit/prepare/designated-learning-institutions-list.html',
    gap: 'Searchable web table only — no public API or downloadable file found. Gap: a public API or file from IRCC. Note: all primary and secondary schools in Canada are designated learning institutions by definition, so K-12 coverage does not depend on this list.',
  },
  {
    id: 'alberta-child-care',
    name: 'Alberta Child Care Lookup',
    kind: 'provincial',
    status: 'staged',
    url: 'https://www.alberta.ca/child-care',
    gap: 'Web lookup tool only — no public API or downloadable list found. Gap: a public API or file from Alberta Children’s Services. Daycare coverage today is the 5 licensed providers in the directory.',
  },
  {
    id: 'ontario-schools',
    name: 'Ontario public school contact information',
    kind: 'provincial',
    status: 'staged',
    url: 'https://data.ontario.ca/dataset/ontario-public-school-contact-information',
    gap: 'Downloadable open data (XLSX/ZIP) exists on the Ontario Data Catalogue but has not been ingested yet. Gap: ingest the file into the directory (same pattern as the Alberta file).',
  },
  {
    id: 'ontario-child-care',
    name: 'Licensed child care facilities in Ontario',
    kind: 'provincial',
    status: 'staged',
    url: 'https://data.ontario.ca/dataset/licensed-child-care-facilities',
    gap: 'Downloadable open data (XLSX/WEB) exists on the Ontario Data Catalogue but has not been ingested yet. Gap: ingest the file into the directory.',
  },
  {
    id: 'education-planner-bc',
    name: 'EducationPlannerBC',
    kind: 'provincial',
    status: 'staged',
    url: 'https://www.educationplannerbc.ca/',
    gap: 'Web search only — no public API verified. Gap: a public API or downloadable program list. BC coverage today is the universities and colleges in the directory.',
  },
  {
    id: 'ontario-colleges',
    name: 'ontariocolleges.ca (Find a Program)',
    kind: 'provincial',
    status: 'staged',
    url: 'https://www.ontariocolleges.ca/en/programs',
    gap: 'Web search only — no public API verified. Gap: a public API or licensed program feed.',
  },
  // --- Staged: United States ---
  {
    id: 'ipeds',
    name: 'IPEDS (US National Center for Education Statistics)',
    kind: 'federal',
    status: 'staged',
    url: 'https://nces.ed.gov/ipeds/',
    gap: 'Bulk survey data files are downloadable, but there is no search API — the files would need ingesting like the Alberta file. Gap: ingest the IPEDS institution files into the directory.',
  },
  {
    id: 'childcare-gov',
    name: 'ChildCare.gov (US)',
    kind: 'federal',
    status: 'staged',
    url: 'https://www.childcare.gov/',
    gap: 'State-by-state directory only — no public API verified. Gap: a public API or licensed feed.',
  },
];

import { isScorecardConfigured, SCORECARD_LIVE_NOTES, SCORECARD_MISSING_KEY_GAP } from './adapters/scorecard.js';

// The registry as written is the static base. getSourceRegistry() applies
// the env-dependent override: College Scorecard is live (with its notes)
// when its server key is set, and staged with the key gap when not. The
// sources API route returns getSourceRegistry(), never the static list, so
// the page never presents a keyed source as live before its key exists.
export function getSourceRegistry(env = process.env) {
  const scorecardOn = isScorecardConfigured(env);
  return SOURCE_REGISTRY.map((s) => {
    if (s.id === 'college-scorecard') {
      if (scorecardOn) {
        const { gap: _gap, ...rest } = s;
        return { ...rest, status: 'live', notes: SCORECARD_LIVE_NOTES };
      }
      return { ...s, status: 'staged', gap: SCORECARD_MISSING_KEY_GAP };
    }
    return { ...s };
  });
}

export function sourceById(id) {
  return SOURCE_REGISTRY.find((s) => s.id === id) || null;
}

export function liveSources(env = process.env) {
  return getSourceRegistry(env).filter((s) => s.status === 'live');
}

export function stagedSources(env = process.env) {
  return getSourceRegistry(env).filter((s) => s.status === 'staged');
}
