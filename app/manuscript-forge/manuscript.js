// manuscript.js — pure document logic for the Manuscript Forge.
// Documents live entirely on the device: { title, author, chapters } where
// each chapter is { id, title, body } and body is an HTML string produced by
// the editor. No DOM, no network.

export const STORAGE_KEY = 'manuscript-forge-doc-v1';

let idCounter = 0;
export function makeId() {
  idCounter += 1;
  return `ch-${Date.now().toString(36)}-${idCounter}`;
}

export function createDoc(title = '', author = '') {
  return { title, author, chapters: [createChapter('Chapter 1')] };
}

export function createChapter(title = 'New chapter', body = '') {
  return { id: makeId(), title, body };
}

export function addChapter(doc, chapter = createChapter(`Chapter ${doc.chapters.length + 1}`)) {
  return { ...doc, chapters: [...doc.chapters, chapter] };
}

export function updateChapter(doc, id, patch) {
  return {
    ...doc,
    chapters: doc.chapters.map((c) => (c.id === id ? { ...c, ...patch } : c)),
  };
}

export function renameChapter(doc, id, title) {
  return updateChapter(doc, id, { title });
}

export function updateChapterBody(doc, id, body) {
  return updateChapter(doc, id, { body });
}

export function deleteChapter(doc, id) {
  const chapters = doc.chapters.filter((c) => c.id !== id);
  return { ...doc, chapters: chapters.length > 0 ? chapters : [createChapter('Chapter 1')] };
}

export function moveChapter(doc, id, direction) {
  // direction: -1 (up) or +1 (down)
  const idx = doc.chapters.findIndex((c) => c.id === id);
  const j = idx + direction;
  if (idx < 0 || j < 0 || j >= doc.chapters.length) return doc;
  const chapters = [...doc.chapters];
  [chapters[idx], chapters[j]] = [chapters[j], chapters[idx]];
  return { ...doc, chapters };
}

export function stripHtml(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function wordCount(html) {
  const words = stripHtml(html).trim().split(/\s+/).filter(Boolean);
  return words.length === 1 && words[0] === '' ? 0 : words.length;
}

export function readingMinutes(words, wpm = 200) {
  return Math.max(1, Math.ceil(words / wpm));
}

export function totalWords(doc) {
  return doc.chapters.reduce((sum, c) => sum + wordCount(c.body), 0);
}

export function chapterWordCount(chapter) {
  return wordCount(chapter.body);
}

// ---- Exports ----

export function exportText(doc) {
  const head = [doc.title || 'Untitled', doc.author ? `by ${doc.author}` : '', ''].join('\n');
  const parts = doc.chapters.map(
    (c) => `${c.title}\n${'='.repeat(Math.min(c.title.length, 60))}\n\n${stripHtml(c.body).trim()}\n`
  );
  return head + parts.join('\n');
}

export function exportMarkdown(doc) {
  const head = [`# ${doc.title || 'Untitled'}`, doc.author ? `*by ${doc.author}*` : '', ''].join('\n');
  const parts = doc.chapters.map((c) => `## ${c.title}\n\n${stripHtml(c.body).trim()}\n`);
  return head + parts.join('\n');
}

export function exportHtml(doc) {
  const esc = (s) =>
    String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const parts = doc.chapters
    .map((c) => `<section>\n<h2>${esc(c.title)}</h2>\n${c.body || '<p></p>'}\n</section>`)
    .join('\n');
  return (
    `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n` +
    `<title>${esc(doc.title || 'Untitled')}</title>\n</head>\n<body>\n` +
    `<h1>${esc(doc.title || 'Untitled')}</h1>\n` +
    (doc.author ? `<p><em>by ${esc(doc.author)}</em></p>\n` : '') +
    parts +
    `\n</body>\n</html>\n`
  );
}

// ---- Import: plain text becomes a document; blank-line groups become chapters ----

export function importTextFile(text, filename = 'import.txt') {
  const title = filename.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || 'Imported draft';
  const chunks = String(text || '')
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const chapters =
    chunks.length > 0
      ? chunks.map((chunk, i) => ({
          id: makeId(),
          title: `Chapter ${i + 1}`,
          body: chunk.split('\n').map((line) => `<p>${line.trim()}</p>`).join(''),
        }))
      : [createChapter('Chapter 1')];
  return { title, author: '', chapters };
}

// ---- Persistence helpers (storage-agnostic; the view passes localStorage) ----

export function serializeDoc(doc) {
  return JSON.stringify(doc);
}

export function deserializeDoc(json) {
  try {
    const doc = JSON.parse(json);
    if (!doc || !Array.isArray(doc.chapters)) return null;
    return {
      title: String(doc.title || ''),
      author: String(doc.author || ''),
      chapters: doc.chapters
        .filter((c) => c && typeof c === 'object')
        .map((c) => ({
          id: String(c.id || makeId()),
          title: String(c.title || 'Untitled chapter'),
          body: String(c.body || ''),
        })),
    };
  } catch (e) {
    return null;
  }
}

export function downloadFilename(doc, ext) {
  const slug = (doc.title || 'manuscript')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'manuscript';
  return `${slug}.${ext}`;
}
