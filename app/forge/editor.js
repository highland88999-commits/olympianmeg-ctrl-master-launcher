// Forge — pure text-editing logic. No DOM, no network, fully testable.

export function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const EXT_TO_LANG = {
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'javascript',
  tsx: 'javascript',
  html: 'html',
  htm: 'html',
  css: 'css',
  json: 'json',
  md: 'markdown',
  markdown: 'markdown',
  py: 'python',
  txt: 'text',
};

export function guessLanguage(filename) {
  const parts = String(filename || '').toLowerCase().split('.');
  const ext = parts.length > 1 ? parts.pop() : '';
  return EXT_TO_LANG[ext] || 'text';
}

const LANG_TO_EXT = {
  javascript: '.js',
  html: '.html',
  css: '.css',
  json: '.json',
  markdown: '.md',
  python: '.py',
  text: '.txt',
};

export function defaultExtFor(lang) {
  return LANG_TO_EXT[lang] || '.txt';
}

export function countStats(text) {
  const t = String(text == null ? '' : text);
  return {
    lines: t.split('\n').length,
    words: (t.match(/[^\s]+/g) || []).length,
    chars: t.length,
  };
}

// Tab key: insert 4 spaces, or indent every touched line when a range is selected.
export function insertIndent(text, start, end) {
  const t = String(text);
  if (start === end) {
    return {
      text: t.slice(0, start) + '    ' + t.slice(end),
      start: start + 4,
      end: start + 4,
    };
  }
  const lineStart = t.lastIndexOf('\n', start - 1) + 1;
  let lineEnd = t.indexOf('\n', end);
  if (lineEnd === -1) lineEnd = t.length;
  const before = t.slice(0, lineStart);
  const block = t.slice(lineStart, lineEnd);
  const after = t.slice(lineEnd);
  const lines = block.split('\n');
  const indented = lines.map((l) => '    ' + l).join('\n');
  return {
    text: before + indented + after,
    start: start + 4,
    end: end + lines.length * 4,
  };
}

// Shift+Tab: remove up to 4 leading spaces (or one tab) from each touched line.
export function outdent(text, start, end) {
  const t = String(text);
  const lineStart = t.lastIndexOf('\n', start - 1) + 1;
  let lineEnd = t.indexOf('\n', end);
  if (lineEnd === -1) lineEnd = t.length;
  const before = t.slice(0, lineStart);
  const block = t.slice(lineStart, lineEnd);
  const after = t.slice(lineEnd);
  let removedFirst = 0;
  let removedTotal = 0;
  const out = block
    .split('\n')
    .map((line, i) => {
      const m = /^( {1,4}|\t)/.exec(line);
      if (!m) return line;
      if (i === 0) removedFirst = m[0].length;
      removedTotal += m[0].length;
      return line.slice(m[0].length);
    })
    .join('\n');
  return {
    text: before + out + after,
    start: Math.max(lineStart, start - removedFirst),
    end: Math.max(lineStart, end - removedTotal),
  };
}

export function findMatches(text, query, opts) {
  const t = String(text == null ? '' : text);
  const q = String(query == null ? '' : query);
  if (!q) return [];
  const options = opts || {};
  const caseSensitive = !!options.caseSensitive;
  const wholeWord = !!options.wholeWord;
  const flags = 'g' + (caseSensitive ? '' : 'i');
  const src = wholeWord ? '\\b' + escapeRegExp(q) + '\\b' : escapeRegExp(q);
  const re = new RegExp(src, flags);
  const out = [];
  let m;
  while ((m = re.exec(t)) !== null) {
    out.push({ start: m.index, end: m.index + m[0].length });
    if (m[0].length === 0) re.lastIndex += 1;
  }
  return out;
}

export function replaceAll(text, query, replacement, opts) {
  const matches = findMatches(text, query, opts);
  if (matches.length === 0) return { text: String(text == null ? '' : text), count: 0 };
  const rep = String(replacement == null ? '' : replacement);
  let t = String(text == null ? '' : text);
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const m = matches[i];
    t = t.slice(0, m.start) + rep + t.slice(m.end);
  }
  return { text: t, count: matches.length };
}
