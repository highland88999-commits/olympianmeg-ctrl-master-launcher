// Forge — lightweight syntax highlighter.
// Pure functions, zero dependencies. Tokenizes code into typed tokens and
// renders escaped HTML spans. Never touches the network.

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const JS_KEYWORDS = new Set(
  'break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof new return super switch this throw try typeof var void while with yield let static async await of get set'.split(' ')
);
const JS_CONSTANTS = new Set(['true', 'false', 'null', 'undefined', 'NaN', 'Infinity']);
const PY_KEYWORDS = new Set(
  'False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield'.split(' ')
);
const PY_CONSTANTS = new Set(['True', 'False', 'None']);

function span(cls, escapedHtml) {
  return '<span class="tok-' + cls + '">' + escapedHtml + '</span>';
}

export function tokensToHtml(tokens) {
  return tokens
    .map((t) => (t.t === 'plain' ? escapeHtml(t.v) : span(t.t, escapeHtml(t.v))))
    .join('');
}

// Walk a global regex over the code, classifying each match.
function walk(code, re, classify) {
  const tokens = [];
  let last = 0;
  let m;
  re.lastIndex = 0;
  while ((m = re.exec(code)) !== null) {
    if (m.index > last) tokens.push({ t: 'plain', v: code.slice(last, m.index) });
    tokens.push(classify(m, code));
    last = m.index + m[0].length;
    if (m[0].length === 0) re.lastIndex += 1; // never spin forever
  }
  if (last < code.length) tokens.push({ t: 'plain', v: code.slice(last) });
  return tokens;
}

// ---------- JavaScript ----------
const JS_RE = /(\/\*[\s\S]*?(?:\*\/|$))|(\/\/[^\n]*)|('(?:[^'\\\n]|\\.)*'?|"(?:[^"\\\n]|\\.)*"?|`(?:[^`\\]|\\.)*`?)|(0[xX][\da-fA-F_]+|\b\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?\b)|([A-Za-z_$][\w$]*)/g;

export function tokenizeJs(code) {
  return walk(code, JS_RE, (m, src) => {
    if (m[1] || m[2]) return { t: 'com', v: m[0] };
    if (m[3]) return { t: 'str', v: m[0] };
    if (m[4]) return { t: 'num', v: m[0] };
    const word = m[5];
    if (JS_KEYWORDS.has(word)) return { t: 'kw', v: word };
    if (JS_CONSTANTS.has(word)) return { t: 'const', v: word };
    if (/^\s*\(/.test(src.slice(m.index + word.length))) return { t: 'fn', v: word };
    return { t: 'plain', v: word };
  });
}

// ---------- HTML ----------
const HTML_RE =
  /(<!--[\s\S]*?-->)|(<!DOCTYPE[^>]*>)|(<\/?[A-Za-z][^\s/>=]*(?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*\s*\/?>)/gi;
const TAG_OPEN_RE = /^(\s*<\/?\s*)([A-Za-z][^\s/>=]*)/;
const ATTR_RE = /([^\s=/>]+)(\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+)?/g;
const TAG_CLOSE_RE = /(\s*\/?>\s*)$/;

function highlightTag(tag) {
  let out = '';
  const open = TAG_OPEN_RE.exec(tag);
  let rest = tag;
  if (open) {
    out += escapeHtml(open[1]) + span('tag', escapeHtml(open[2]));
    rest = tag.slice(open[0].length);
  }
  const tail = TAG_CLOSE_RE.exec(rest);
  const body = tail ? rest.slice(0, rest.length - tail[0].length) : rest;
  let last = 0;
  let am;
  ATTR_RE.lastIndex = 0;
  while ((am = ATTR_RE.exec(body)) !== null) {
    out += escapeHtml(body.slice(last, am.index));
    out += span('attr', escapeHtml(am[1]));
    if (am[2]) out += escapeHtml(am[2]);
    if (am[3]) out += span('attrv', escapeHtml(am[3]));
    last = am.index + am[0].length;
    if (am[0].length === 0) ATTR_RE.lastIndex += 1;
  }
  out += escapeHtml(body.slice(last));
  if (tail) out += escapeHtml(tail[1]);
  return out;
}

export function tokenizeHtml(code) {
  const tokens = [];
  let last = 0;
  let m;
  HTML_RE.lastIndex = 0;
  while ((m = HTML_RE.exec(code)) !== null) {
    if (m.index > last) tokens.push({ t: 'htmltext', v: code.slice(last, m.index) });
    if (m[1]) tokens.push({ t: 'com', v: m[1] });
    else if (m[2]) tokens.push({ t: 'kw', v: m[2] });
    else tokens.push({ t: 'raw', v: highlightTag(m[3]) });
    last = m.index + m[0].length;
    if (m[0].length === 0) HTML_RE.lastIndex += 1;
  }
  if (last < code.length) tokens.push({ t: 'htmltext', v: code.slice(last) });
  return tokens;
}

// ---------- CSS ----------
export function tokenizeCss(code) {
  const tokens = [];
  let i = 0;
  let depth = 0;
  let buf = '';
  const flush = (kind) => {
    if (buf) {
      tokens.push({ t: kind, v: buf });
      buf = '';
    }
  };
  while (i < code.length) {
    const c = code[i];
    if (c === '/' && code[i + 1] === '*') {
      const end = code.indexOf('*/', i + 2);
      const stop = end === -1 ? code.length : end + 2;
      flush(depth === 0 ? 'sel' : 'plain');
      tokens.push({ t: 'com', v: code.slice(i, stop) });
      i = stop;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < code.length && code[j] !== c && code[j] !== '\n') {
        if (code[j] === '\\') j += 1;
        j += 1;
      }
      flush(depth === 0 ? 'sel' : 'val');
      tokens.push({ t: 'str', v: code.slice(i, Math.min(j + 1, code.length)) });
      i = Math.min(j + 1, code.length);
      continue;
    }
    if (c === '{') {
      flush('sel');
      tokens.push({ t: 'punc', v: '{' });
      depth += 1;
      i += 1;
      continue;
    }
    if (c === '}') {
      flush('val');
      tokens.push({ t: 'punc', v: '}' });
      depth = Math.max(0, depth - 1);
      i += 1;
      continue;
    }
    if (c === ';') {
      flush('val');
      tokens.push({ t: 'punc', v: ';' });
      i += 1;
      continue;
    }
    if (depth > 0 && c === ':') {
      if (/^\s*[a-zA-Z-]+\s*$/.test(buf)) {
        tokens.push({ t: 'prop', v: buf });
        buf = '';
      } else {
        flush('val');
      }
      tokens.push({ t: 'punc', v: ':' });
      i += 1;
      continue;
    }
    if (c === '@') {
      const m = /^@[\w-]+/.exec(code.slice(i));
      if (m) {
        flush(depth === 0 ? 'sel' : 'val');
        tokens.push({ t: 'kw', v: m[0] });
        i += m[0].length;
        continue;
      }
    }
    if (c === '#') {
      const m = /^#(?:[\da-fA-F]{3,8})\b/.exec(code.slice(i));
      if (m) {
        flush(depth === 0 ? 'sel' : 'val');
        tokens.push({ t: 'num', v: m[0] });
        i += m[0].length;
        continue;
      }
    }
    if (c >= '0' && c <= '9') {
      const m = /^\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw|vmin|vmax|s|ms|deg|fr)?/.exec(code.slice(i));
      if (m) {
        flush(depth === 0 ? 'sel' : 'val');
        tokens.push({ t: 'num', v: m[0] });
        i += m[0].length;
        continue;
      }
    }
    buf += c;
    i += 1;
  }
  flush(depth === 0 ? 'sel' : 'plain');
  return tokens;
}

// ---------- JSON ----------
const JSON_RE =
  /("(?:[^"\\\n]|\\.)*")(\s*:)?|(-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|(\btrue\b|\bfalse\b|\bnull\b)/g;

export function tokenizeJson(code) {
  return walk(code, JSON_RE, (m) => {
    if (m[1]) return m[2] ? { t: 'key', v: m[1] } : { t: 'str', v: m[1] };
    if (m[3]) return { t: 'num', v: m[3] };
    return { t: 'const', v: m[4] };
  });
}

// ---------- Markdown ----------
const MD_INLINE_RE = /(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*|_[^_\n]+_)|(`[^`\n]+`)|(\[[^\]\n]+\]\([^)\n]+\))/g;

function pushInline(text, tokens) {
  walk(text, MD_INLINE_RE, (m) => {
    if (m[1]) return { t: 'bold', v: m[1] };
    if (m[2]) return { t: 'italic', v: m[2] };
    if (m[3]) return { t: 'code', v: m[3] };
    return { t: 'link', v: m[4] };
  }).forEach((t) => tokens.push(t));
}

export function tokenizeMarkdown(code) {
  const tokens = [];
  const lines = code.split('\n');
  let inFence = false;
  lines.forEach((line, idx) => {
    if (/^```/.test(line)) {
      inFence = !inFence;
      tokens.push({ t: 'code', v: line });
    } else if (inFence) {
      tokens.push({ t: 'code', v: line });
    } else {
      const hm = /^(#{1,6}\s)/.exec(line);
      const qm = /^(>\s?)/.exec(line);
      const lm = /^(\s*(?:[-*+]|\d+\.)\s)/.exec(line);
      if (hm) {
        tokens.push({ t: 'head', v: hm[1] });
        pushInline(line.slice(hm[1].length), tokens);
      } else if (qm) {
        tokens.push({ t: 'quote', v: qm[1] });
        pushInline(line.slice(qm[1].length), tokens);
      } else if (lm) {
        tokens.push({ t: 'list', v: lm[1] });
        pushInline(line.slice(lm[1].length), tokens);
      } else {
        pushInline(line, tokens);
      }
    }
    if (idx < lines.length - 1) tokens.push({ t: 'plain', v: '\n' });
  });
  return tokens;
}

// ---------- Python ----------
const PY_RE =
  /(#[^\n]*)|('''[\s\S]*?(?:'''|$)|"""[\s\S]*?(?:"""|$)|'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*")|(@[A-Za-z_]\w*)|(\b\d[\d_]*(?:\.\d+)?\b)|(\b[A-Za-z_]\w*\b)/g;

export function tokenizePython(code) {
  return walk(code, PY_RE, (m) => {
    if (m[1]) return { t: 'com', v: m[1] };
    if (m[2]) return { t: 'str', v: m[2] };
    if (m[3]) return { t: 'fn', v: m[3] };
    if (m[4]) return { t: 'num', v: m[4] };
    const word = m[5];
    if (PY_KEYWORDS.has(word)) return { t: 'kw', v: word };
    if (PY_CONSTANTS.has(word)) return { t: 'const', v: word };
    return { t: 'plain', v: word };
  });
}

function tokensToHtmlMixed(tokens) {
  return tokens
    .map((t) => {
      if (t.t === 'plain' || t.t === 'htmltext') return escapeHtml(t.v);
      if (t.t === 'raw') return t.v; // already-highlighted HTML
      return span(t.t, escapeHtml(t.v));
    })
    .join('');
}

const MAX_HIGHLIGHT_CHARS = 200000;

export function highlight(code, lang) {
  const src = String(code == null ? '' : code);
  if (src.length > MAX_HIGHLIGHT_CHARS) return escapeHtml(src);
  let tokens;
  switch (lang) {
    case 'javascript':
      tokens = tokenizeJs(src);
      break;
    case 'html':
      tokens = tokenizeHtml(src);
      break;
    case 'css':
      tokens = tokenizeCss(src);
      break;
    case 'json':
      tokens = tokenizeJson(src);
      break;
    case 'markdown':
      tokens = tokenizeMarkdown(src);
      break;
    case 'python':
      tokens = tokenizePython(src);
      break;
    default:
      tokens = [{ t: 'plain', v: src }];
  }
  return tokensToHtmlMixed(tokens);
}

export { MAX_HIGHLIGHT_CHARS };
