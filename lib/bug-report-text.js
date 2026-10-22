// lib/bug-report-text.js — text-integrity helpers for the bug report form.
//
// Bug report 2026-10-22 (Merlin, from the hub on iPhone Chrome):
// "make it so there are spaces in the bug reports between words" —
// his own report ARRIVED as one spaceless blob
// ("IncouncourseAddahubbuttonandmakeitso…") even though the same
// account's other reports arrived normally spaced.
//
// Audit of the whole chain (2026-10-22): the form
// (components/BugReportButton.jsx) sends the textarea value
// verbatim, POST /api/bug-report stores it verbatim (trim only),
// the admin page and the Bug Reports review artifact render it
// verbatim. NOTHING in Olympus strips spaces — the loss happens
// at input time on the device (a cramped / glide keyboard in a
// shrunken viewport can swallow spacebar taps before the page
// ever sees them), and once a smashed report is stored, no
// server-side edit can put the word boundaries back.
//
// So the fix lives where the loss is still recoverable: in the
// form, BEFORE sending. looksSpaceless() flags a long run of text
// with essentially no whitespace; the form then warns the reporter
// and makes them tap Send a second time to send it exactly as
// written. A smashed report can no longer go through silently,
// and a legitimately spaceless paste (a long URL, an encoded
// blob) is one extra tap, never a hard block.
//
// Pure logic, no DOM: unit-tested in tests/bug-report-text.test.mjs.

/** Texts shorter than this are never flagged — short reports are
 *  often a handful of words and a false warning would just nag. */
export const SPACELESS_MIN_LENGTH = 48;

/** Whitespace share below this reads as "no spaces between words".
 *  Ordinary English prose runs ~15-18% spaces; even dense technical
 *  text stays above ~8%. 3% is far below any real writing and far
 *  above a smashed blob (0-1 stray spaces). */
export const SPACELESS_MAX_SPACE_RATIO = 0.03;

/**
 * looksSpaceless(text) -> bool.
 * True when a long text carries essentially no whitespace — the
 * signature of a report whose spaces never registered.
 */
export function looksSpaceless(text) {
  if (typeof text !== 'string') return false;
  const t = text.trim();
  if (t.length < SPACELESS_MIN_LENGTH) return false;
  const whitespace = (t.match(/\s/g) || []).length;
  return whitespace / t.length < SPACELESS_MAX_SPACE_RATIO;
}

/**
 * spacelessField({ description, steps }) -> 'description' | 'steps' | null.
 * The first field that looks spaceless, so the form can name the
 * field its warning is about. Steps are optional — empty is fine.
 */
export function spacelessField(fields) {
  if (!fields || typeof fields !== 'object') return null;
  if (looksSpaceless(fields.description)) return 'description';
  if (looksSpaceless(fields.steps)) return 'steps';
  return null;
}
