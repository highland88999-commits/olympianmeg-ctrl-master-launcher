// lib/job-board/sources.js — Source registry for the Omega Job Board.
//
// status 'live' = a working adapter exists and was verified returning real
// listings during the build (see STATE.md for the verification log).
// status 'staged' = shown on the board with an outbound link; `gap` states
// exactly what is missing before it can go live. Nothing here is invented:
// a staged source never returns listings it does not have.

export const SOURCE_REGISTRY = [
  // --- Live: federal ---
  {
    id: 'job-bank-ca',
    name: 'Job Bank Canada',
    kind: 'federal',
    status: 'live',
    url: 'https://www.jobbank.gc.ca/',
    // No public API: the pattern is the RSS/Atom feed (summary + URL
    // only), then fetch each posting page for the full description.
    // The adapter currently surfaces the feed summary as a cleaned
    // location/employer/salary line; full posting text is a fetch away.
    notes: 'No public API — RSS feed (summary + URL only), then fetch each posting page for the full description.',
  },
  // --- Live: remote feeds ---
  {
    id: 'arbeitnow',
    name: 'Arbeitnow',
    kind: 'remote',
    status: 'live',
    url: 'https://www.arbeitnow.com/',
  },
  {
    id: 'remote-ok',
    name: 'Remote OK',
    kind: 'remote',
    status: 'live',
    url: 'https://remoteok.com/',
  },
  {
    id: 'remotive',
    name: 'Remotive',
    kind: 'remote',
    status: 'live',
    url: 'https://remotive.com/',
  },
  {
    id: 'we-work-remotely',
    name: 'We Work Remotely',
    kind: 'remote',
    status: 'live',
    url: 'https://weworkremotely.com/',
  },
  {
    id: 'jobicy',
    name: 'Jobicy',
    kind: 'remote',
    status: 'live',
    url: 'https://jobicy.com/',
  },
  {
    id: 'himalayas',
    name: 'Himalayas',
    kind: 'remote',
    status: 'live',
    url: 'https://himalayas.app/',
  },
  // --- Live: ATS boards (curated employers verified at build time) ---
  {
    id: 'greenhouse',
    name: 'Greenhouse boards',
    kind: 'ats',
    status: 'live',
    url: 'https://boards.greenhouse.io/',
  },
  // --- Staged: commercial, key or partnership needed ---
  {
    id: 'adzuna',
    name: 'Adzuna',
    kind: 'commercial',
    status: 'staged',
    url: 'https://www.adzuna.com/',
    // Live free path (verified against Adzuna's own dashboard, Nov 21):
    // free signup for app_id + app_key at developer.adzuna.com; ca and us
    // plus ~20 markets; keyword/location/category + salary search.
    // VERIFIED LIMIT (dashboard, Nov 21): the plan is "Pending Activation:
    // 25 test calls" — a ONE-TIME allowance of 25 calls, NOT a recurring
    // free tier. Full access (5,000 calls/month, 500/day) needs a card +
    // plan choice. Listings MUST carry Adzuna attribution (see
    // `attribution` below). The adapter lives in
    // lib/job-board/adapters/adzuna.js and reads its keys from the server
    // env vars ADZUNA_APP_ID / ADZUNA_APP_KEY; getSourceRegistry() below
    // flips this entry to live (with the budget note) when they are set.
    gap: 'Adzuna account created and activated, but the API keys are not set on the server yet. Gap: ADZUNA_APP_ID and ADZUNA_APP_KEY env vars.',
    attribution: 'Listings by Adzuna — each Adzuna listing must carry the "Adzuna" label hyperlinked to adzuna.ca (Canada) / adzuna.com (US), per the Adzuna API Terms of Service.',
  },
  {
    id: 'usajobs',
    name: 'USAJOBS (US federal)',
    kind: 'federal',
    status: 'staged',
    url: 'https://www.usajobs.gov/',
    gap: 'Free API key issued Nov 21, 2026 (Olympus Job Board, olympiannexus@gmail.com) but not set on the server yet. Gap: USAJOBS_API_KEY env var. US federal jobs only; up to 10,000 rows per query, 500 rows per page. Federal announcement data is under an open licence — publishable with USAJOBS named as the source.',
  },
  {
    id: 'jsearch',
    name: 'JSearch (RapidAPI)',
    kind: 'commercial',
    status: 'staged',
    url: 'https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch',
    // Live free path (verified on the RapidAPI dashboard, Nov 21):
    // JSearch subscribed to the FREE Basic plan ($0.00/month) under
    // highland88999-commits / highland88999@gmail.com; 200 requests/month
    // HARD limit, 1000 requests/hour. Aggregates Indeed, LinkedIn,
    // Glassdoor, ZipRecruiter and others via Google for Jobs. The adapter
    // lives in lib/job-board/adapters/jsearch.js and reads its key from
    // the server env var RAPIDAPI_KEY; getSourceRegistry() below flips
    // this entry to live (with the budget note) when it is set.
    gap: 'JSearch subscribed Nov 21, 2026 (RapidAPI free Basic plan, highland88999-commits) but the API key is not set on the server yet. Gap: RAPIDAPI_KEY env var.',
    attribution: 'Listings by JSearch — each JSearch listing carries the "Listed by JSearch" label linked to the JSearch API page on RapidAPI; the Apply link goes to the original posting on the underlying board.',
  },
  {
    id: 'indeed',
    name: 'Indeed',
    kind: 'commercial',
    status: 'staged',
    url: 'https://www.indeed.com/',
    // DOCUMENTED DEAD END, not a live source: the public Job Search
    // (Publisher) API was deprecated in 2023 and its endpoints return
    // 410 Gone. The APIs Indeed still ships are employer-side only
    // (publishing jobs INTO Indeed; partner approval + signed agreement)
    // with no self-serve key for reading listings. The only remaining
    // route is a JavaScript plugin that renders search on a site but
    // returns no listings as data to store or match — so Indeed cannot
    // feed the agent matcher. Never present Indeed as live.
    gap: 'DEAD END — do not present as live. Public Job Search (Publisher) API deprecated 2023, endpoints return 410 Gone. Remaining APIs are employer-side only (publish jobs INTO Indeed; partner approval + signed agreement) with no self-serve key for reading listings. The JavaScript plugin renders search on a site but returns no listings as data. Gap: none available — Indeed cannot feed the matcher.',
  },
  {
    id: 'ziprecruiter',
    name: 'ZipRecruiter',
    kind: 'commercial',
    status: 'staged',
    url: 'https://www.ziprecruiter.com/',
    gap: 'Partner API only, application-based — not self-serve. Status still needs verifying before relying on it. Gap: ZipRecruiter partnership (unverified).',
  },
  {
    id: 'linkedin',
    name: 'LinkedIn Jobs',
    kind: 'commercial',
    status: 'staged',
    url: 'https://www.linkedin.com/jobs/',
    gap: 'No public read API for job search. Gap: LinkedIn partnership / Talent Solutions access.',
  },
  {
    id: 'glassdoor',
    name: 'Glassdoor',
    kind: 'commercial',
    status: 'staged',
    url: 'https://www.glassdoor.com/',
    gap: 'No public job-search API. Gap: Glassdoor partnership.',
  },
  {
    id: 'kijiji',
    name: 'Kijiji Jobs',
    kind: 'commercial',
    status: 'staged',
    url: 'https://www.kijiji.ca/b-jobs/',
    gap: 'CONFIRMED by Merlin Nov 21 ~15:23 — he meant Kijiji Jobs, not Kimono. No public jobs API. Kijiji\u2019s old RSS search feed no longer works (verified Nov 21: rss-srp URLs return 403, and no RSS link exists on current search pages). Terms of Use ban robots, spiders and scrapers without express written permission, so no scraping. Gap: express written permission from Kijiji Canada Ltd. or a licensed feed; paid third-party scraper APIs exist (ReefAPI: 1,000 free credits, then ~$0.67\u2013$1.50/1,000 credits) — priced option only, not built. Outbound link only.',
  },
  {
    id: 'monster',
    name: 'Monster',
    kind: 'commercial',
    status: 'staged',
    url: 'https://www.monster.ca/',
    gap: 'No public job-search API. Gap: Monster partnership.',
  },
  {
    id: 'simplyhired',
    name: 'SimplyHired',
    kind: 'commercial',
    status: 'staged',
    url: 'https://www.simplyhired.ca/',
    gap: 'No public job-search API. Gap: SimplyHired partnership.',
  },
  // --- Staged: ATS with no verified public board ---
  {
    id: 'lever',
    name: 'Lever boards',
    kind: 'ats',
    status: 'staged',
    url: 'https://www.lever.co/',
    gap: 'Generic adapter built, but no employer board slug verified returning 200 at build time (netflix and robinhood both 404). Gap: a verified employer slug.',
  },
  {
    id: 'ashby',
    name: 'Ashby boards',
    kind: 'ats',
    status: 'staged',
    url: 'https://www.ashbyhq.com/',
    gap: 'Generic adapter built, but the posting API returned 401 for the slugs tried at build time (openai, linear). Gap: a verified employer slug / access change.',
  },
  // --- Staged: provincial boards ---
  {
    id: 'workbc',
    name: 'WorkBC',
    kind: 'provincial',
    status: 'staged',
    url: 'https://www.workbc.ca/',
    gap: 'No public API verified. Gap: WorkBC API access or a verified public feed.',
  },
  {
    id: 'ontario-gojobs',
    name: 'Ontario GO Jobs',
    kind: 'provincial',
    status: 'staged',
    url: 'https://www.gojobs.gov.on.ca/',
    gap: 'No keyword search — exact Job ID only. Gap: a searchable public feed.',
  },
  {
    id: 'alberta-jobs',
    name: 'Alberta Jobs (alis)',
    kind: 'provincial',
    status: 'staged',
    url: 'https://alis.alberta.ca/',
    gap: 'No public API verified. Gap: a verified public feed or API access.',
  },
  {
    id: 'saskjobs',
    name: 'SaskJobs',
    kind: 'provincial',
    status: 'staged',
    url: 'https://www.saskjobs.ca/',
    gap: 'No public API verified. Gap: a verified public feed or API access.',
  },
  {
    id: 'manitoba-jobs',
    name: 'Manitoba Jobs',
    kind: 'provincial',
    status: 'staged',
    url: 'https://www.gov.mb.ca/jobs/',
    gap: 'No public API verified. Gap: a verified public feed or API access.',
  },
  {
    id: 'quebec-emploi',
    name: 'Emploi Québec',
    kind: 'provincial',
    status: 'staged',
    url: 'https://www.quebec.ca/emploi/',
    gap: 'No public API verified. Gap: a verified public feed or API access.',
  },
  {
    id: 'careerbeacon-atlantic',
    name: 'CareerBeacon (Atlantic)',
    kind: 'provincial',
    status: 'staged',
    url: 'https://www.careerbeacon.com/',
    gap: 'No public API verified. Gap: a verified public feed or API access.',
  },
];

import { isAdzunaConfigured, ADZUNA_BUDGET_NOTE, ADZUNA_MISSING_KEYS_GAP } from './adapters/adzuna.js';
import { isUsajobsConfigured, USAJOBS_LIVE_NOTES, USAJOBS_MISSING_KEY_GAP } from './adapters/usajobs.js';
import { isJsearchConfigured, JSEARCH_BUDGET_NOTE, JSEARCH_MISSING_KEY_GAP } from './adapters/jsearch.js';

// The registry as written is the static base. getSourceRegistry() applies
// the env-dependent overrides: Adzuna, USAJobs and JSearch are live (with
// their notes) when their server keys are set, and staged with the keys
// gap when not. The sources API route returns getSourceRegistry(), never
// the static list, so the board never presents a keyed source as live
// before its keys exist.
export function getSourceRegistry(env = process.env) {
  const adzunaOn = isAdzunaConfigured(env);
  const usajobsOn = isUsajobsConfigured(env);
  const jsearchOn = isJsearchConfigured(env);
  return SOURCE_REGISTRY.map((s) => {
    if (s.id === 'adzuna') {
      if (adzunaOn) {
        const { gap: _gap, ...rest } = s;
        return { ...rest, status: 'live', notes: ADZUNA_BUDGET_NOTE };
      }
      return { ...s, status: 'staged', gap: ADZUNA_MISSING_KEYS_GAP };
    }
    if (s.id === 'usajobs') {
      if (usajobsOn) {
        const { gap: _gap, ...rest } = s;
        return { ...rest, status: 'live', notes: USAJOBS_LIVE_NOTES };
      }
      return { ...s, status: 'staged', gap: USAJOBS_MISSING_KEY_GAP };
    }
    if (s.id === 'jsearch') {
      if (jsearchOn) {
        const { gap: _gap, ...rest } = s;
        return { ...rest, status: 'live', notes: JSEARCH_BUDGET_NOTE };
      }
      return { ...s, status: 'staged', gap: JSEARCH_MISSING_KEY_GAP };
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
