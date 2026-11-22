// lib/education/adapters/index.js — Fan-out for Omega Education search.
//
// The baked-in directory is always live. College Scorecard joins in only
// when its key is set (see adapters/scorecard.js). A dead source reports
// its error in `statuses` — never a silent drop. Server-side only.

import { DIRECTORY } from '../directory.js';
import { searchDirectory, dedupeEntries } from '../search.js';
import { fetchScorecard, isScorecardConfigured } from './scorecard.js';

export async function fetchAllLive({ q = '', level = '', field = '', state = '', limit = 25, sources = null, env = process.env } = {}) {
  const statuses = [];
  let entries = [];

  const wantDirectory = !sources || sources.includes('omega-directory');
  if (wantDirectory) {
    const found = searchDirectory(DIRECTORY, { q, level, field });
    entries = entries.concat(found);
    statuses.push({ id: 'omega-directory', status: 'live', count: found.length });
  }

  const wantScorecard = (!sources || sources.includes('college-scorecard'))
    && isScorecardConfigured(env);
  if (wantScorecard) {
    const { entries: sc, error } = await fetchScorecard({ q, field, state, limit, env });
    if (error) {
      statuses.push({ id: 'college-scorecard', status: 'error', error });
    } else {
      // Scorecard results are US schools; the directory search already
      // applied level/field/keyword to its own entries, so apply the same
      // filters here before merging.
      const filtered = searchDirectory(sc, { q, level, field });
      entries = entries.concat(filtered);
      statuses.push({ id: 'college-scorecard', status: 'live', count: filtered.length });
    }
  } else if (!sources || sources.includes('college-scorecard')) {
    statuses.push({ id: 'college-scorecard', status: 'staged', error: 'SCORECARD_API_KEY not set' });
  }

  return { entries: dedupeEntries(entries), statuses };
}
