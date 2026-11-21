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
    // Live free path (verified against Adzuna's own docs/terms, Nov 21):
    // free signup for app_id + app_key at developer.adzuna.com; ca and us
    // plus ~20 markets; keyword/location/category + salary search; published
    // free limits 25/min, 250/day, 1,000/week, 2,500/month. Listings MUST
    // carry Adzuna attribution (see `attribution` below). CAVEAT, stated
    // honestly: Adzuna describes free access as a 14-day trial for
    // commercial use, after which a licence agreement may be required.
    // NO ADAPTER EXISTS YET (Worker A's record said one was built — it was
    // not; there is no lib/job-board/adapters/adzuna.js). When one is built
    // it must map each result's latitude/longitude into location.lat/lon
    // (radius filtering depends on it) and set `attribution` on every
    // listing; normalizeJob already passes `attribution` through.
    gap: 'Free API key registration required (app_id + app_key at developer.adzuna.com); no key held by us yet, and no adapter built yet. Caveat: Adzuna describes free access as a 14-day trial for commercial use, after which a licence agreement may be required.',
    attribution: 'Listings by Adzuna — each Adzuna listing must carry the "Adzuna" label hyperlinked to adzuna.ca (Canada) / adzuna.com (US), per the Adzuna API Terms of Service.',
  },
  {
    id: 'usajobs',
    name: 'USAJOBS (US federal)',
    kind: 'federal',
    status: 'staged',
    url: 'https://www.usajobs.gov/',
    gap: 'Free API key by application at developer.usajobs.gov (key + registered email as User-Agent); no key held by us yet. US federal jobs only; up to 10,000 rows per query, 500 rows per page. Data is licensed to the registering company only — no resale as a standalone feed.',
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

export function sourceById(id) {
  return SOURCE_REGISTRY.find((s) => s.id === id) || null;
}

export function liveSources() {
  return SOURCE_REGISTRY.filter((s) => s.status === 'live');
}

export function stagedSources() {
  return SOURCE_REGISTRY.filter((s) => s.status === 'staged');
}
