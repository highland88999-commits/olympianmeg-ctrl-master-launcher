// Nexus Codex — pure logic for the manuscript writer.
// Splits a raw manuscript into chapters (double line breaks), escapes HTML,
// and estimates a printed page count. No network, no storage, no telemetry.

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Double line breaks (blank lines) start a new chapter/page.
export function splitChapters(text) {
  const raw = String(text ?? '').replace(/\r\n?/g, '\n');
  return raw
    .split(/\n\s*\n/)
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

export function countWords(text) {
  const m = String(text ?? '').trim().match(/\S+/g);
  return m ? m.length : 0;
}

// Rough print estimate: ~400 words per page.
export function estimatePages(text) {
  const words = countWords(text);
  return Math.max(words === 0 ? 0 : 1, Math.ceil(words / 400));
}

export function bookStats(title, author, text) {
  const chapters = splitChapters(text);
  const words = countWords(text);
  return {
    title: String(title ?? '').trim() || 'Untitled Manuscript',
    author: String(author ?? '').trim() || 'Anonymous',
    chapters: chapters.length,
    words,
    pages: estimatePages(text),
  };
}
