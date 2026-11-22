// tests/alexandria-reader.test.mjs
// Pins for lib/alexandria/reader.js — the artifact reader's HTML pipeline.
//
// Why this exists: the Publisher Studio stores Quill HTML in
// manuscripts.content, and the reader used to split that HTML on '\n\n'
// and render it as escaped text — a studio-minted book showed RAW HTML
// TAGS, all on one page. These tests pin the fixed behaviour: sanitize,
// paginate, title.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeHtml,
  htmlToText,
  paginateHtml,
  pageTitle,
  STUDIO_PLACEHOLDER_TEXT,
} from '../lib/alexandria/reader.js';

const STUDIO_SAMPLE =
  '<h1>Chapter 1: Genesis</h1>' +
  '<p>First paragraph of the book.</p>' +
  '<p>Second paragraph, with <strong>bold</strong> and <em>italic</em> text.</p>' +
  '<p>Third paragraph.</p>' +
  '<p>Fourth paragraph.</p>' +
  '<p>Fifth paragraph.</p>' +
  '<p>Sixth paragraph.</p>' +
  '<p>Seventh paragraph.</p>' +
  '<h2>Chapter 2: The Turn</h2>' +
  '<p>Eighth paragraph, in chapter two.</p>';

test('sanitizeHtml keeps reading markup and drops everything dangerous', () => {
  const out = sanitizeHtml(
    '<p onclick="steal()">Hello <strong>world</strong></p>' +
      '<script>alert(1)</script>' +
      '<iframe src="https://evil.example"></iframe>' +
      '<a href="javascript:alert(1)">bad</a> ' +
      '<a href="https://example.com/page">good</a>' +
      '<img src="x" onerror="alert(2)">' +
      '<p style="color:red" class="ql-align-center">styled</p>',
  );
  assert.ok(!out.includes('<script'), 'no script tag survives');
  assert.ok(!out.includes('iframe'), 'no iframe survives');
  assert.ok(!out.includes('onclick'), 'no event handler survives');
  assert.ok(!out.includes('javascript:'), 'no javascript: href survives');
  assert.ok(!out.includes('<img'), 'no img survives');
  assert.ok(!out.includes('style='), 'no style attribute survives');
  assert.ok(!out.includes('class='), 'no class attribute survives');
  assert.ok(out.includes('<p>Hello <strong>world</strong></p>'), 'reading markup kept');
  assert.ok(out.includes('<a href="https://example.com/page"'), 'safe link kept');
  assert.ok(out.includes('>good</a>'), 'safe link text kept');
  assert.ok(out.includes('<a>bad</a>'), 'unsafe link keeps its text, loses the href');
});

test('sanitizeHtml leaves plain text alone', () => {
  assert.equal(sanitizeHtml('Just words, no tags.'), 'Just words, no tags.');
  assert.equal(sanitizeHtml(''), '');
});

test('htmlToText strips tags for empty checks', () => {
  assert.equal(htmlToText('<h1>Chapter 1: Genesis</h1><p>Begin transmitting your codex here.</p>').replace(/\s+/g, ' '), STUDIO_PLACEHOLDER_TEXT);
  assert.equal(htmlToText('<p><br></p>'), '');
  assert.equal(htmlToText('<p>Hello</p><p>World</p>').replace(/\s+/g, ' '), 'Hello World');
});

test('paginateHtml splits studio HTML into real pages, headings break pages', () => {
  const pages = paginateHtml(STUDIO_SAMPLE);
  assert.ok(pages.length >= 3, `expected 3+ pages, got ${pages.length}`);
  assert.ok(!pages.some((p) => p.includes('&lt;') || p.includes('&gt;')), 'no escaped tags leak into pages');
  assert.ok(pages[0].includes('<h1>Chapter 1: Genesis</h1>'), 'first page opens with chapter one');
  assert.ok(pages.some((p) => p.includes('<h2>Chapter 2: The Turn</h2>')), 'chapter two starts its own page');
  assert.ok(pages.every((p) => p.includes('<p>') || p.includes('<h')), 'every page carries real markup');
  assert.ok(pages[0].includes('<p>First paragraph of the book.</p>'), 'paragraphs are markup, not escaped text');
});

test('paginateHtml handles plain-text content (no tags)', () => {
  const pages = paginateHtml('First para.\n\nSecond para.\n\nThird para.');
  assert.equal(pages.length, 1);
  assert.ok(pages[0].includes('<p>First para.</p>'), 'plain text becomes paragraphs');
  assert.ok(pages[0].includes('<p>Third para.</p>'));
});

test('paginateHtml returns no pages for empty content', () => {
  assert.deepEqual(paginateHtml(''), []);
  assert.deepEqual(paginateHtml('<p><br></p>'), []);
  assert.deepEqual(paginateHtml(null), []);
});

test('pageTitle reads the heading, falls back to empty', () => {
  assert.equal(pageTitle('<h1>Chapter 1: Genesis</h1><p>text</p>'), 'Chapter 1: Genesis');
  assert.equal(pageTitle('<h2>The Turn</h2><p>text</p>'), 'The Turn');
  assert.equal(pageTitle('<p>No heading here</p>'), '');
});
