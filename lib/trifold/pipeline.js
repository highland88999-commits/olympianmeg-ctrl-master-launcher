// lib/trifold/pipeline.js
// TRIFOLD late-post fallback pipeline — pure helpers + the draft factory.
// Server-only (routes), but imports nothing Next-specific so the pure
// functions are unit-testable in plain Node.
//
// The schedule (see vercel.json): the pipeline cron runs every 15 minutes
// on Mon+Tue and walks one open edition through the week using
// America/Edmonton wall-clock — never UTC:
//   Mon >= 12:59 Edmonton, status draft/review      -> AI writes the fiction (buddy's key)
//   Tue >= 03:00 Edmonton, status devan_submitted/... -> DECIDE: buddy's version wins, else finalize AI
//   Tue >= 06:00 Edmonton, status ready              -> PUBLISH + email subscribers
// Every step is idempotent: each one moves the status forward, so a repeat
// run finds nothing to do. A week is NEVER empty: no open edition at all
// means we draft one with the standard newspaper-rotation + RSS logic.

import { TRIFOLD_NEWSPAPERS, nextNewspaper } from './constants.js';
import { fetchTopStories } from './fetch-news.js';

export const EDMONTON_TZ = 'America/Edmonton';

// Mandatory closing line on both fictional lenses — everywhere, always.
export const FICTION_CLOSING_LINE = '— This edition is 100% FICTION.';

/** ISO-ish week number, same as the weekly cron used to use. */
export function weekNumber(d = new Date()) {
  const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - start) / 86400000 + start.getUTCDay() + 1) / 7);
}

/**
 * Edmonton wall-clock parts for a Date.
 * Returns { weekday (1=Mon..7=Sun), hour, minute, totalMinutes }.
 */
export function edmontonParts(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: EDMONTON_TZ,
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value || '';
  const wd = get('weekday'); // 'Mon', 'Tue', ...
  const WEEKDAYS = { Sun: 7, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  let hour = parseInt(get('hour'), 10);
  if (hour === 24) hour = 0; // hour12:false can report midnight as '24' in some ICU builds
  const minute = parseInt(get('minute'), 10);
  return {
    weekday: WEEKDAYS[wd] || 0,
    hour: Number.isNaN(hour) ? 0 : hour,
    minute: Number.isNaN(minute) ? 0 : minute,
    totalMinutes: (Number.isNaN(hour) ? 0 : hour) * 60 + (Number.isNaN(minute) ? 0 : minute),
  };
}

// Status sets each pipeline step is allowed to act on.
const AI_GENERATE_FROM = ['draft', 'review'];
const DECIDE_FROM = ['devan_submitted', 'ai_generated', 'draft', 'review'];

/**
 * Which pipeline step (if any) should fire for this Edmonton time + status.
 * Returns 'ai_generate' | 'decide' | 'publish' | null.
 */
export function pipelineStepFor(weekday, totalMinutes, status) {
  if (weekday === 1 && totalMinutes >= 12 * 60 + 59 && AI_GENERATE_FROM.includes(status)) {
    return 'ai_generate';
  }
  if (weekday === 2 && totalMinutes >= 3 * 60 && DECIDE_FROM.includes(status)) {
    return 'decide';
  }
  if (weekday === 2 && totalMinutes >= 6 * 60 && status === 'ready') {
    return 'publish';
  }
  return null;
}

/**
 * Trim fiction text and guarantee the mandatory FICTION closing line.
 * Empty stays empty (an empty lens gets AI-filled separately, never
 * force-labeled).
 */
export function normalizeFiction(text) {
  const t = String(text || '').trim();
  if (!t) return '';
  if (t.endsWith(FICTION_CLOSING_LINE)) return t;
  return t + '\n\n' + FICTION_CLOSING_LINE;
}

/**
 * The "a week is NEVER empty" guarantee: draft this week's edition using
 * the newspaper rotation + RSS fetch, exactly as the Monday cron does.
 * Returns { edition, paper, stories }. Throws with an honest message.
 */
export async function createDraftEdition(admin) {
  const { data: settings } = await admin.from('trifold_settings').select('*').eq('id', 1).maybeSingle();
  const rotationIndex = settings?.rotation_index || 0;
  const { paper, nextIndex } = nextNewspaper(rotationIndex);

  const stories = await fetchTopStories(paper.rss, 8);

  const { data: edition, error } = await admin
    .from('trifold_editions')
    .insert({
      week_number: weekNumber(),
      newspaper_name: paper.name,
      newspaper_region: paper.region,
      newspaper_url: paper.url,
      og_stories: stories,
      status: 'draft',
    })
    .select()
    .single();
  if (error || !edition) throw new Error('Could not draft this week\u2019s issue.');

  const log = Array.isArray(settings?.rotation_log) ? settings.rotation_log : [];
  log.push({ at: new Date().toISOString(), newspaper: paper.name, region: paper.region, stories: stories.length });
  await admin.from('trifold_settings').update({
    rotation_index: nextIndex % TRIFOLD_NEWSPAPERS.length,
    rotation_log: log.slice(-52),
    updated_at: new Date().toISOString(),
  }).eq('id', 1);

  return { edition, paper, stories };
}
