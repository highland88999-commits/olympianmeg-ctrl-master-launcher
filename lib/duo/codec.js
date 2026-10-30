// DUO-Math codec — 20-symbol bijective base-20 shared alphabet.
// Canonical version: symbols 1-9, a-k; dash separates left position from
// right modular identity. Matches the verified 10k x 10k tables.
//
// For Mod M > 1: N = c*(M-1) + r, 1 <= r <= M-1, c >= 0.
//   encode -> bij20(r)            (c = 0, first span)
//   encode -> bij20(r)-bij20(c)   (c > 0)
// For Mod 1: encode -> 1-bij20(N).

const SYMBOLS = '123456789abcdefghijk';
const SYMBOL_VALUE = {};
for (let i = 0; i < SYMBOLS.length; i++) SYMBOL_VALUE[SYMBOLS[i]] = i + 1;

/** Bijective base-20: 1 -> '1', 20 -> 'k', 21 -> '11'. '' for 0. */
export function bij20(n) {
  n = Math.floor(n);
  if (n <= 0) return '';
  let s = '';
  while (n > 0) {
    n -= 1;
    s = SYMBOLS[n % 20] + s;
    n = Math.floor(n / 20);
  }
  return s;
}

/** Parse a bijective base-20 string back to a number. Returns null if invalid. */
export function unbij20(s) {
  if (!s || typeof s !== 'string') return null;
  let n = 0;
  for (const ch of s.toLowerCase()) {
    const v = SYMBOL_VALUE[ch];
    if (!v) return null;
    n = n * 20 + v;
  }
  return n;
}

/** Encode decimal N under DUO Mod M. Returns the DUO notation string. */
export function duoEncode(N, M) {
  N = Math.floor(N); M = Math.floor(M);
  if (!(N >= 1) || !(M >= 1)) return null;
  if (M === 1) return '1-' + bij20(N);
  const S = M - 1;
  const r = ((N - 1) % S) + 1;
  const c = Math.floor((N - 1) / S);
  const left = bij20(r);
  return c === 0 ? left : left + '-' + bij20(c);
}

/**
 * Decode a DUO notation string under Mod M back to decimal.
 * Returns { ok, value } or { ok: false, error }.
 */
export function duoDecode(code, M) {
  M = Math.floor(M);
  if (!(M >= 1)) return { ok: false, error: 'Mod must be 1 or higher.' };
  if (!code || typeof code !== 'string') return { ok: false, error: 'Empty code.' };
  const clean = code.trim().toLowerCase();
  if (M === 1) {
    const m = clean.match(/^1-(.+)$/);
    if (!m) return { ok: false, error: 'Mod 1 codes look like 1-x.' };
    const v = unbij20(m[1]);
    if (v === null || v < 1) return { ok: false, error: 'Bad symbol in code.' };
    return { ok: true, value: v };
  }
  const parts = clean.split('-');
  if (parts.length > 2) return { ok: false, error: 'Too many dashes.' };
  const r = unbij20(parts[0]);
  if (r === null || r < 1) return { ok: false, error: 'Bad left symbol.' };
  if (r > M - 1) return { ok: false, error: `Left position ${r} exceeds Mod ${M} span (${M - 1}).` };
  let c = 0;
  if (parts.length === 2) {
    c = unbij20(parts[1]);
    if (c === null || c < 1) return { ok: false, error: 'Bad right symbol.' };
  }
  return { ok: true, value: c * (M - 1) + r };
}

// --- Text mode: A=1..Z=26, space=27, 0-9 = 28-37, common punctuation 38-47 ---
const CHAR_TO_NUM = {};
const NUM_TO_CHAR = {};
'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach((ch, i) => { CHAR_TO_NUM[ch] = i + 1; NUM_TO_CHAR[i + 1] = ch; });
CHAR_TO_NUM[' '] = 27; NUM_TO_CHAR[27] = ' ';
'0123456789'.split('').forEach((ch, i) => { CHAR_TO_NUM[ch] = 28 + i; NUM_TO_CHAR[28 + i] = ch; });
'.,!?;:\'"-()'.split('').forEach((ch, i) => { CHAR_TO_NUM[ch] = 38 + i; NUM_TO_CHAR[38 + i] = ch; });

/** Encode text to a space-separated DUO string under Mod M. Unknown chars are skipped. */
export function duoEncodeText(text, M) {
  if (!text) return '';
  const out = [];
  for (const ch of text.toUpperCase()) {
    const n = CHAR_TO_NUM[ch];
    if (!n) continue;
    const enc = duoEncode(n, M);
    if (enc) out.push(enc);
  }
  return out.join(' ');
}

/** Decode a space-separated DUO string under Mod M back to text. */
export function duoDecodeText(codes, M) {
  if (!codes) return { ok: true, text: '' };
  const chars = [];
  for (const code of codes.trim().split(/\s+/)) {
    const d = duoDecode(code, M);
    if (!d.ok) return { ok: false, error: `Bad code "${code}": ${d.error}` };
    const ch = NUM_TO_CHAR[d.value];
    if (!ch) return { ok: false, error: `Code "${code}" decodes to ${d.value}, outside the text alphabet.` };
    chars.push(ch);
  }
  return { ok: true, text: chars.join('') };
}
