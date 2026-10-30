// Tests for the Manuscript Forge module: document logic + static scans.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createDoc,
  createChapter,
  addChapter,
  updateChapter,
  renameChapter,
  updateChapterBody,
  deleteChapter,
  moveChapter,
  stripHtml,
  wordCount,
  readingMinutes,
  totalWords,
  exportText,
  exportMarkdown,
  exportHtml,
  importTextFile,
  serializeDoc,
  deserializeDoc,
  downloadFilename,
} from '../app/manuscript-forge/manuscript.js';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, '..', 'app', 'manuscript-forge');
const allCode = readdirSync(appDir)
  .filter((f) => f.endsWith('.js') || f.endsWith('.jsx'))
  .map((f) => readFileSync(join(appDir, f), 'utf8'))
  .join('\n');

// ---------- Static scans ----------

test('no telemetry or tracking strings in built files', () => {
  const banned = [
    'supabase', 'ipify', 'central_telemetry', 'track_ping', 'nexus_visitor_id',
    'logBrainAction', 'brain-uplink', 'OMEGA MIND', 'connected_repos', 'api.ipify',
    'stakeme10000',
  ];
  for (const s of banned) {
    assert.ok(!allCode.includes(s), `banned string present: ${s}`);
  }
});

test('no external URLs, iframes, video tags, or mailto links', () => {
  assert.ok(!allCode.includes('https://'), 'no https URLs allowed');
  // allow the SVG xmlns namespace inside data-URI textures (not a network fetch)
  const noXmlns = allCode.replace(/xmlns='http:\/\/www\.w3\.org\/2000\/svg'/g, '');
  assert.ok(!noXmlns.includes('http://'), 'no http URLs allowed');
  assert.ok(!/<iframe/i.test(allCode), 'no iframes allowed');
  assert.ok(!/<video/i.test(allCode), 'no video tags allowed');
  assert.ok(!allCode.includes('mailto:'), 'no mailto links allowed');
});

test('no CDN libraries (Quill, mammoth) or crypto/payment fields', () => {
  // 'quill' alone matches the feather-pen SVG icon key; match library paths instead
  const banned = ['unpkg', 'jsdelivr', 'cdnjs', 'quill/dist', 'quill.min', 'mammoth', 'wallet', 'price_btc', 'bitcoin'];
  for (const s of banned) {
    assert.ok(!allCode.toLowerCase().includes(s), `banned string present: ${s}`);
  }
});

test('no JWT-shaped secrets in built files', () => {
  assert.ok(!/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/.test(allCode), 'JWT-shaped token found');
});

// ---------- Document model ----------

test('createDoc starts with one chapter', () => {
  const doc = createDoc('My Book', 'Ada');
  assert.equal(doc.title, 'My Book');
  assert.equal(doc.author, 'Ada');
  assert.equal(doc.chapters.length, 1);
});

test('addChapter appends with unique ids', () => {
  let doc = createDoc();
  doc = addChapter(doc);
  doc = addChapter(doc);
  assert.equal(doc.chapters.length, 3);
  const ids = new Set(doc.chapters.map((c) => c.id));
  assert.equal(ids.size, 3);
});

test('renameChapter and updateChapterBody are immutable updates', () => {
  const doc = createDoc();
  const id = doc.chapters[0].id;
  const renamed = renameChapter(doc, id, 'Prologue');
  assert.equal(renamed.chapters[0].title, 'Prologue');
  assert.equal(doc.chapters[0].title, 'Chapter 1');
  const edited = updateChapterBody(doc, id, '<p>Hello</p>');
  assert.equal(edited.chapters[0].body, '<p>Hello</p>');
});

test('updateChapter ignores unknown ids', () => {
  const doc = createDoc();
  const out = updateChapter(doc, 'nope', { title: 'X' });
  assert.equal(out.chapters[0].title, 'Chapter 1');
});

test('deleteChapter never leaves zero chapters', () => {
  let doc = createDoc();
  const id = doc.chapters[0].id;
  doc = deleteChapter(doc, id);
  assert.equal(doc.chapters.length, 1);
  assert.equal(doc.chapters[0].title, 'Chapter 1');
});

test('deleteChapter removes the right chapter', () => {
  let doc = createDoc();
  doc = addChapter(doc, createChapter('Two'));
  const id = doc.chapters[0].id;
  doc = deleteChapter(doc, id);
  assert.equal(doc.chapters.length, 1);
  assert.equal(doc.chapters[0].title, 'Two');
});

test('moveChapter swaps chapters up and down', () => {
  let doc = createDoc();
  doc = addChapter(doc, createChapter('Two'));
  doc = addChapter(doc, createChapter('Three'));
  const twoId = doc.chapters[1].id;
  doc = moveChapter(doc, twoId, -1);
  assert.equal(doc.chapters[0].title, 'Two');
  doc = moveChapter(doc, twoId, 1);
  assert.equal(doc.chapters[1].title, 'Two');
});

test('moveChapter at the edges is a no-op', () => {
  const doc = createDoc();
  const id = doc.chapters[0].id;
  assert.deepEqual(moveChapter(doc, id, -1), doc);
  assert.deepEqual(moveChapter(doc, id, 1), doc);
});

// ---------- Text utilities ----------

test('stripHtml converts markup to readable text', () => {
  assert.equal(stripHtml('<p>Hello <b>world</b></p><p>Bye</p>').replace(/\n+/g, ' ').trim(), 'Hello world Bye');
  assert.equal(stripHtml('<p>A<br>B</p>'), 'A\nB\n');
  assert.equal(stripHtml('&lt;tag&gt; &amp; &quot;q&quot;'), '<tag> & "q"');
});

test('wordCount handles html and whitespace', () => {
  assert.equal(wordCount(''), 0);
  assert.equal(wordCount('<p><br></p>'), 0);
  assert.equal(wordCount('<p>One two  three</p>'), 3);
  assert.equal(wordCount('<h2>Hi</h2><p>there</p>'), 2);
});

test('readingMinutes rounds up, minimum one', () => {
  assert.equal(readingMinutes(0), 1);
  assert.equal(readingMinutes(200), 1);
  assert.equal(readingMinutes(201), 2);
});

test('totalWords sums chapters', () => {
  let doc = createDoc();
  doc = updateChapterBody(doc, doc.chapters[0].id, '<p>one two</p>');
  doc = addChapter(doc, createChapter('Two', '<p>three four five</p>'));
  assert.equal(totalWords(doc), 5);
});

// ---------- Export / import ----------

test('exportText includes title, author, and chapters', () => {
  let doc = createDoc('Epic', 'Homer');
  doc = updateChapterBody(doc, doc.chapters[0].id, '<p>Sing, goddess</p>');
  const txt = exportText(doc);
  assert.ok(txt.includes('Epic'));
  assert.ok(txt.includes('by Homer'));
  assert.ok(txt.includes('Sing, goddess'));
  assert.ok(!txt.includes('<p>'), 'html leaked into text export');
});

test('exportMarkdown uses markdown headings', () => {
  const doc = createDoc('Epic', 'Homer');
  const md = exportMarkdown(doc);
  assert.ok(md.startsWith('# Epic'));
  assert.ok(md.includes('## Chapter 1'));
});

test('exportHtml is a complete document with escaped titles', () => {
  const doc = createDoc('A <B> & "C"', '');
  const html = exportHtml(doc);
  assert.ok(html.includes('<!DOCTYPE html>'));
  assert.ok(html.includes('A &lt;B&gt; &amp; "C"'));
  assert.ok(html.includes('</html>'));
});

test('importTextFile splits on blank lines into chapters', () => {
  const doc = importTextFile('First para.\n\nSecond para.\nLine two.', 'my-novel.txt');
  assert.equal(doc.title, 'my novel');
  assert.equal(doc.chapters.length, 2);
  assert.ok(doc.chapters[1].body.includes('Line two.'));
});

test('importTextFile handles empty input', () => {
  const doc = importTextFile('', 'x.txt');
  assert.equal(doc.chapters.length, 1);
});

test('serialize/deserialize round-trips a document', () => {
  let doc = createDoc('T', 'A');
  doc = updateChapterBody(doc, doc.chapters[0].id, '<p>hi</p>');
  const back = deserializeDoc(serializeDoc(doc));
  assert.equal(back.title, 'T');
  assert.equal(back.chapters[0].body, '<p>hi</p>');
});

test('deserializeDoc rejects garbage', () => {
  assert.equal(deserializeDoc('not json'), null);
  assert.equal(deserializeDoc('{"chapters": "nope"}'), null);
  assert.equal(deserializeDoc('{}'), null);
});

test('downloadFilename slugifies the title', () => {
  assert.equal(downloadFilename({ title: 'My Great Book!' }, 'md'), 'my-great-book.md');
  assert.equal(downloadFilename({ title: '' }, 'txt'), 'manuscript.txt');
});
