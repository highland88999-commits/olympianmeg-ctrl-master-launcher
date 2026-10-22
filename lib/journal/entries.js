// lib/journal/entries.js
// Pure helpers for the Journal (/journal) — Merlin, 2026-10-22: a
// per-user journal in the UTILITIES menu. Entries are timestamped by
// the database (created_at default now() — the client NEVER supplies
// a timestamp), listed newest -> oldest by default, searchable, and
// shown in a horizontal carousel or a vertical list.
//
// Everything here is dependency-free and unit-tested
// (tests/journal.test.mjs). The API route (app/api/journal/route.js)
// and the page share these helpers so the rules live in exactly one
// place.

export const JOURNAL_ORDERS = ['desc', 'asc'];
export const JOURNAL_LAYOUTS = ['horizontal', 'vertical'];

export const JOURNAL_TITLE_MAX = 200;
export const JOURNAL_BODY_MAX = 20000;

/** Sort order from an untrusted value: 'asc' opts in, else newest first. */
export function normalizeOrder(value) {
  return value === 'asc' ? 'asc' : 'desc';
}

/** Layout from an untrusted value: 'vertical' opts in, else the carousel. */
export function normalizeLayout(value) {
  return value === 'vertical' ? 'vertical' : 'horizontal';
}

/**
 * Sort a copy of the entries by created_at. 'desc' (default) is
 * newest -> oldest; 'asc' is oldest -> newest. Ties break on id so
 * the order is stable and total. Never mutates the input.
 */
export function sortEntries(entries, order) {
  const dir = normalizeOrder(order) === 'asc' ? 1 : -1;
  const list = Array.isArray(entries) ? [...entries] : [];
  list.sort((a, b) => {
    const ta = Date.parse(a && a.created_at) || 0;
    const tb = Date.parse(b && b.created_at) || 0;
    if (ta !== tb) return (ta - tb) * dir;
    return String((a && a.id) || '').localeCompare(String((b && b.id) || '')) * dir;
  });
  return list;
}

/**
 * Escape a raw search string for a PostgREST ilike pattern: the
 * pattern wildcards (% _) and the escape char itself are neutralised
 * so users search for literal text, never pattern syntax.
 */
export function escapeIlikeTerm(raw) {
  return String(raw == null ? '' : raw)
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
}

/**
 * Build the PostgREST `.or(...)` filter that searches title + body.
 * Values are double-quoted so commas in the query cannot break the
 * filter grammar; embedded quotes/backslashes are stripped first.
 * Returns null when there is nothing to search for.
 */
export function buildSearchOrFilter(rawQuery) {
  const q = String(rawQuery == null ? '' : rawQuery).trim();
  if (!q) return null;
  const safe = q.replace(/["\\]/g, ' ').slice(0, 100);
  const pattern = `%${escapeIlikeTerm(safe)}%`;
  return `title.ilike."${pattern}",body.ilike."${pattern}"`;
}

/**
 * Validate + normalise a create/edit payload. ONLY title and body are
 * ever read from the request — created_at/updated_at are the
 * database's business (server-side default / route-side bump), so a
 * client-supplied timestamp is ignored by construction.
 *   { ok: true, value: { title, body } } | { ok: false, error }
 * With { partial: true } (edits), absent fields stay absent.
 */
export function sanitizeEntryInput(payload, { partial = false } = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, error: 'Entry must be an object.' };
  }
  const value = {};

  if (!partial || 'title' in payload) {
    const rawTitle = payload.title;
    if (rawTitle == null || rawTitle === '') {
      value.title = null;
    } else if (typeof rawTitle !== 'string') {
      return { ok: false, error: 'Title must be text.' };
    } else {
      const title = rawTitle.trim().slice(0, JOURNAL_TITLE_MAX);
      value.title = title || null;
    }
  }

  if (!partial || 'body' in payload) {
    const rawBody = payload.body;
    if (typeof rawBody !== 'string' || !rawBody.trim()) {
      return { ok: false, error: 'Write something first — an empty entry has nothing to keep.' };
    }
    if (rawBody.length > JOURNAL_BODY_MAX) {
      return { ok: false, error: `Entries are capped at ${JOURNAL_BODY_MAX} characters.` };
    }
    value.body = rawBody;
  }

  if (partial && !('title' in value) && !('body' in value)) {
    return { ok: false, error: 'Nothing to update.' };
  }
  return { ok: true, value };
}

/**
 * True when a Supabase/PostgREST error means "the journal_entries
 * table isn't there yet" (migration not run) — the route then answers
 * with the honest setup-pending state instead of a fake save or a
 * crash. Same detector shape as the Earth 2 chamber routes.
 */
export function isMissingTableError(error) {
  if (!error) return false;
  const code = String(error.code || '');
  const msg = String(error.message || '');
  return code === '42P01' || code === 'PGRST205' || /does not exist|schema cache/i.test(msg);
}

/** Readable local date + time for an entry's automatic timestamp. */
export function formatEntryTimestamp(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return (
    d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) +
    ', ' +
    d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  );
}

/** An entry counts as edited when its update stamp is later than its creation stamp. */
export function entryWasEdited(entry) {
  if (!entry || !entry.created_at || !entry.updated_at) return false;
  return Date.parse(entry.updated_at) > Date.parse(entry.created_at);
}
