// tests/bug-report-text.test.mjs
// Space-integrity guard for the bug report form (bug report
// 2026-10-22: a hub report arrived as one spaceless blob —
// "make it so there are spaces in the bug reports between
// words"). Pins:
// - the verbatim report text that arrived smashed IS flagged;
// - Merlin's normally-spaced reports from the same account are
//   NOT flagged (no false warnings on real writing);
// - short texts are never flagged, whatever their spacing;
// - a long spaceless paste (URL / encoded blob) IS flagged — the
//   form warns once, but it is a soft guard, never a hard block
//   (that second-send behavior is pinned at the source level);
// - the form wiring: BugReportButton consults spacelessField
//   before sending, warns in plain language, and re-arms when
//   the text changes.
//
// Run: node --test tests/bug-report-text.test.mjs   (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  SPACELESS_MIN_LENGTH,
  SPACELESS_MAX_SPACE_RATIO,
  looksSpaceless,
  spacelessField,
} from '../lib/bug-report-text.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const button = readFileSync(join(repo, 'components', 'BugReportButton.jsx'), 'utf8');
const route = readFileSync(join(repo, 'app', 'api', 'bug-report', 'route.js'), 'utf8');

// The exact description that arrived on 2026-10-22 (report
// 33433799-99db-451c-a615-77ba7be9fdf6, stored verbatim).
const SMASHED =
  'IncouncourseAddahubbuttonandmakeitsotherearespacesinthebugreportsbetweenwords.makelifeprocedurallygenerate';

// Normally-spaced reports from the SAME account (stored verbatim):
const SPACED_LONG =
  'We need a button for world creations where they get out into the communiverse create the communiverse, add this planet to it as the first planet, allow users who own a planet to direct their builds using muse';
const SPACED_SHORT = 'Tiles are not clickable, bike not spawning beside user';

describe('looksSpaceless', () => {
  it('flags the verbatim 2026-10-22 smashed report', () => {
    assert.equal(looksSpaceless(SMASHED), true);
  });

  it('does not flag normally spaced prose from the same reporter', () => {
    assert.equal(looksSpaceless(SPACED_LONG), false);
    assert.equal(looksSpaceless(SPACED_SHORT), false);
    assert.equal(
      looksSpaceless('The controls are not minimizing and the planetary information window is also not minimizable, please fix this'),
      false,
    );
  });

  it('never flags short text, even with zero spaces', () => {
    assert.ok('abc'.length < SPACELESS_MIN_LENGTH);
    assert.equal(looksSpaceless('abc'), false);
    assert.equal(looksSpaceless('x'.repeat(SPACELESS_MIN_LENGTH - 1)), false);
    assert.equal(looksSpaceless(''), false);
    assert.equal(looksSpaceless('   '), false);
  });

  it('flags a long spaceless blob at and past the minimum length', () => {
    assert.equal(looksSpaceless('x'.repeat(SPACELESS_MIN_LENGTH)), true);
    assert.equal(looksSpaceless('word'.repeat(30)), true);
  });

  it('newlines and tabs count as spacing (multi-line reports are safe)', () => {
    const multiline = Array.from({ length: 12 }, () => 'lineoftext').join('\n');
    assert.equal(looksSpaceless(multiline), false);
  });

  it('thresholds stay sane: prose space share is far above the ceiling', () => {
    assert.ok(SPACELESS_MAX_SPACE_RATIO > 0 && SPACELESS_MAX_SPACE_RATIO <= 0.05);
    const spaces = (SPACED_LONG.match(/\s/g) || []).length;
    assert.ok(spaces / SPACED_LONG.length > SPACELESS_MAX_SPACE_RATIO * 3);
  });

  it('non-strings are never flagged', () => {
    assert.equal(looksSpaceless(null), false);
    assert.equal(looksSpaceless(undefined), false);
    assert.equal(looksSpaceless(42), false);
    assert.equal(looksSpaceless({}), false);
  });
});

describe('spacelessField', () => {
  it('names the description first', () => {
    assert.equal(spacelessField({ description: SMASHED, steps: '' }), 'description');
    assert.equal(spacelessField({ description: SMASHED, steps: SMASHED }), 'description');
  });

  it('names the steps when only they are smashed', () => {
    assert.equal(spacelessField({ description: SPACED_LONG, steps: SMASHED }), 'steps');
  });

  it('returns null for clean or empty input', () => {
    assert.equal(spacelessField({ description: SPACED_LONG, steps: SPACED_SHORT }), null);
    assert.equal(spacelessField({ description: '', steps: '' }), null);
    assert.equal(spacelessField({}), null);
    assert.equal(spacelessField(null), null);
  });
});

describe('bug report form wiring (source pins)', () => {
  it('the form consults the guard before sending', () => {
    assert.ok(button.includes("from '@/lib/bug-report-text'"), 'helper imported');
    assert.ok(button.includes('spacelessField({ description, steps })'), 'guard consulted in send()');
    assert.ok(
      button.indexOf('spacelessField({ description, steps })') < button.indexOf("fetch('/api/bug-report'"),
      'guard runs before the POST',
    );
  });

  it('the warning explains the failure in plain language and offers send-as-written', () => {
    assert.ok(button.includes('almost no spaces between words'), 'warning names the problem');
    assert.ok(button.includes('Send anyway — as written'), 'second tap sends verbatim');
    assert.ok(button.includes('setSpacelessWarnedFor(null)'), 'editing re-arms the guard');
  });

  it('the panel stands apart from the game layer while typing (ui-element)', () => {
    assert.ok(button.includes('className="ui-element fixed left-3'), 'panel marked ui-element');
  });

  it('the API still stores text verbatim — trim only, no rewriting', () => {
    // The guard belongs at input time; the server must never
    // "fix up" a reporter's words after the fact.
    assert.ok(route.includes("const s = typeof v === 'string' ? v.trim() : '';"), 'clean() is trim-only');
    assert.ok(!route.includes('looksSpaceless'), 'no server-side rejection of spaceless text');
  });
});
