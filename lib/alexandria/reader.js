// lib/alexandria/reader.js
// Pure helpers for the Alexandria artifact reader.
//
// The Publisher Studio stores Quill HTML in manuscripts.content, so the
// reader must render that HTML safely (author-controlled content shown to
// other signed-in readers) and split it into swipeable pages. No imports,
// so node tests exercise these directly.
//
// sanitizeHtml: allowlist-based. Drops script/style/iframe/object/embed/
// form/media/svg/math and every attribute except a safe href on <a>.
// paginateHtml: splits sanitized HTML into pages of top-level blocks; a
// level-1/2 heading starts a new page (a chapter break).
// pageTitle: the first heading inside a page, for the "Chapter N" header.

const ALLOWED_TAGS = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'b', 'em', 'i', 'u', 's', 'strike',
  'blockquote', 'ul', 'ol', 'li', 'br', 'a', 'span',
  'div', 'hr', 'pre', 'code', 'sub', 'sup',
]);

const DANGEROUS_WITH_CONTENT = /<(script|style|iframe|object|embed|form|noscript|template|title|textarea|noscript)[\s\S]*?<\/\1\s*>/gi;
const DANGEROUS_VOID = /<(script|style|iframe|object|embed|form|link|meta|base|img|video|audio|svg|math|input|button|select|canvas)[^>]*\/?>/gi;
const HTML_COMMENTS = /<!--[\s\S]*?-->/g;

export function sanitizeHtml(html) {
  let s = String(html || '');
  s = s.replace(DANGEROUS_WITH_CONTENT, '');
  s = s.replace(DANGEROUS_VOID, '');
  s = s.replace(HTML_COMMENTS, '');
  s = s.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (match, tag) => {
    const t = String(tag).toLowerCase();
    if (!ALLOWED_TAGS.has(t)) return '';
    if (match.startsWith('</')) return `</${t}>`;
    if (t === 'a') {
      const href = match.match(/href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const url = href ? (href[1] ?? href[2] ?? href[3] ?? '') : '';
      const safe = /^(https?:\/\/|mailto:|#)/i.test(url.trim());
      return safe
        ? `<a href="${url.trim().replace(/"/g, '%22')}" target="_blank" rel="noopener noreferrer">`
        : '<a>';
    }
    if (t === 'br' || t === 'hr') return `<${t}>`;
    return `<${t}>`;
  });
  return s;
}

/** Plain text of stored content (tags stripped) — for empty checks. */
export function htmlToText(html) {
  return sanitizeHtml(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|blockquote|pre)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/** Split sanitized HTML into pages of top-level blocks. */
export function paginateHtml(html, blocksPerPage = 6) {
  const clean = sanitizeHtml(html);
  const blocks = [];
  const re = /<(h[1-6]|p|blockquote|ul|ol|pre|div)[^>]*>[\s\S]*?<\/\1>|<(hr|br)\s*\/?>|[^<]+/gi;
  let m;
  while ((m = re.exec(clean)) !== null) {
    const b = m[0].trim();
    if (!b) continue;
    // Bare text between tags: split on blank lines, one <p> each.
    if (!b.startsWith('<')) {
      b.split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean)
        .forEach((p) => blocks.push(`<p>${p.replace(/\n/g, '<br>')}</p>`));
      continue;
    }
    // Drop blocks with no readable text (Quill's empty paragraph is
    // <p><br></p>); a bare <hr> divider still counts as a block.
    if (htmlToText(b) === '' && !/^<hr[\s>]/.test(b)) continue;
    blocks.push(b);
  }
  // Nothing readable left (empty content, or tagged content with no
  // readable blocks such as Quill's empty <p><br></p>).
  if (blocks.length === 0) return [];
  const pages = [];
  let current = [];
  const flush = () => {
    if (current.length) pages.push(current.join(''));
    current = [];
  };
  for (const b of blocks) {
    const isHeading = /^<h[12][\s>]/.test(b);
    if (isHeading && current.length) flush();
    current.push(b);
    if (!isHeading && current.length >= blocksPerPage) flush();
  }
  flush();
  return pages;
}

/** Heading text of a page, for the chapter header; '' when there is none. */
export function pageTitle(pageHtml) {
  const m = String(pageHtml || '').match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/i);
  if (!m) return '';
  return m[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

/** The Studio's untouched placeholder, as plain text with whitespace
    normalised to single spaces — minting it is minting nothing. Callers:
    compare htmlToText(html).replace(/\s+/g, ' ') against this. */
export const STUDIO_PLACEHOLDER_TEXT = 'Chapter 1: Genesis Begin transmitting your codex here.';
