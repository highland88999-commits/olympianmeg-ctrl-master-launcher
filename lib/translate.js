// lib/translate.js — pure, headless translation helpers. No network, no DOM.
// The API route (app/api/translate/route.js) owns all fetching; this module
// owns detection heuristics, defaults, labels, and input validation.
//
// Merlin's rule: English is the default target. Translation is always
// user-initiated (a tap) — this module never sends anything anywhere.

/** Default translation target. Merlin: "translate with English as default." */
export const DEFAULT_TARGET_LANG = 'en';
export function targetDefault() {
  return DEFAULT_TARGET_LANG;
}

/** Max characters the API route will translate in one call. */
export const MAX_TRANSLATE_CHARS = 2000;

// Script buckets: [lo, hi, code]. Only letter ranges — emoji, punctuation,
// digits, and symbols never count toward detection.
const SCRIPT_RANGES = [
  [0x1000, 0x109f, 'my'], // Myanmar
  [0x3040, 0x309f, 'ja'], // Hiragana
  [0x30a0, 0x30ff, 'ja'], // Katakana
  [0xff66, 0xff9f, 'ja'], // Halfwidth katakana
  [0x1100, 0x11ff, 'ko'], // Hangul jamo
  [0x3130, 0x318f, 'ko'], // Hangul compatibility jamo
  [0xac00, 0xd7af, 'ko'], // Hangul syllables
  [0x3400, 0x4dbf, 'zh'], // CJK ext A
  [0x4e00, 0x9fff, 'zh'], // CJK unified
  [0xf900, 0xfaff, 'zh'], // CJK compatibility
  [0x0600, 0x06ff, 'ar'], // Arabic
  [0x0750, 0x077f, 'ar'], // Arabic supplement
  [0x0590, 0x05ff, 'he'], // Hebrew
  [0x0400, 0x04ff, 'ru'], // Cyrillic
  [0x0500, 0x052f, 'ru'], // Cyrillic supplement
  [0x0e00, 0x0e7f, 'th'], // Thai
  [0x0900, 0x097f, 'hi'], // Devanagari
  [0x0370, 0x03ff, 'el'], // Greek
  [0x00c0, 0x024f, 'latin'], // Latin-1 supplement + Latin extended (é, ñ, ł…)
];

function scriptOf(cp) {
  if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a)) return 'latin';
  for (const [lo, hi, code] of SCRIPT_RANGES) {
    if (cp >= lo && cp <= hi) return code;
  }
  return null;
}

/** Count of letters per script bucket in the text. */
export function countScripts(text) {
  const counts = new Map();
  if (typeof text !== 'string') return counts;
  for (const ch of text) {
    const s = scriptOf(ch.codePointAt(0));
    if (s) counts.set(s, (counts.get(s) || 0) + 1);
  }
  return counts;
}

// Distinctive stopwords per Latin-script language. A text must contain at
// least two DIFFERENT words from one list to count — one match is too easy
// to hit by accident in English ("die", "pour").
const LATIN_STOPWORDS = {
  es: ['porque', 'está', 'están', 'también', 'gracias', 'cuando', 'donde', 'muy'],
  fr: ['vous', 'avec', 'cette', 'sont', 'être', 'merci', 'bonjour', 'parce'],
  de: ['nicht', 'für', 'danke', 'bitte', 'haben', 'werden', 'meine', 'einen'],
  pt: ['não', 'você', 'obrigado', 'também', 'quando', 'muito'],
  it: ['grazie', 'perché', 'questo', 'della', 'molto', 'sono'],
  nl: ['voor', 'niet', 'jullie', 'graag', 'dankjewel'],
};
const LATIN_MIN_HITS = 2;

/** Guess a Latin-script language from stopwords, or null. Conservative. */
export function latinGuess(text) {
  if (typeof text !== 'string') return null;
  const tokens = new Set(text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean));
  if (tokens.size === 0) return null;
  let best = null;
  let bestHits = 0;
  for (const [lang, words] of Object.entries(LATIN_STOPWORDS)) {
    let hits = 0;
    for (const w of words) if (tokens.has(w)) hits++;
    if (hits > bestHits) {
      bestHits = hits;
      best = lang;
    }
  }
  return bestHits >= LATIN_MIN_HITS ? best : null;
}

/**
 * Heuristic: does this text look like it needs translation into
 * `preferredLang` (default English)?
 * True when the text is detectably NOT in the preferred language:
 * any non-Latin script letters (Burmese, Japanese, Korean, Chinese,
 * Arabic, …) whose guessed source differs from preferred, or
 * confident Latin-script non-preferred language. Latin text we can't
 * identify is assumed English (needs translation only when preferred
 * isn't English). False for English-when-preferred-English, empty,
 * emoji-only, or numbers.
 */
export function needsTranslation(text, preferredLang = DEFAULT_TARGET_LANG) {
  if (typeof text !== 'string') return false;
  const t = text.trim();
  if (!t) return false;
  const pref = normLang(preferredLang) || 'en';
  const counts = countScripts(t);
  let nonLatin = 0;
  for (const [code, n] of counts) if (code !== 'latin') nonLatin += n;
  if (nonLatin > 0) {
    const src = guessSourceLang(t);
    if (!src) return true;
    return normLang(src) !== pref;
  }
  const g = latinGuess(t);
  if (g === pref) return false;
  if (g) return true;
  return pref !== 'en';
}

/** Normalize a language code for comparison: lowercase, base subtag. */
export function normLang(code) {
  if (!code || typeof code !== 'string') return null;
  const t = code.trim();
  if (!isValidLanguageCode(t)) return null;
  return t.toLowerCase().split('-')[0];
}

/** `en`, `es`, `zh-CN` … — the shape the API route and DB column accept. Case-insensitive; callers normalize. */
export function isValidLanguageCode(code) {
  return typeof code === 'string' && /^[a-z]{2,3}(-[a-z]{2})?$/i.test(code.trim());
}

/**
 * Resolve the effective content language.
 * Signed-in users: profile column wins. Guests: localStorage
 * (`nexus-language`, the prior i18n convention). English default
 * everywhere — Merlin's rule.
 */
export function resolvePreferredLanguage({ profileLang, storedLang } = {}) {
  if (isValidLanguageCode(profileLang)) return profileLang.trim();
  if (isValidLanguageCode(storedLang)) return storedLang.trim();
  return DEFAULT_TARGET_LANG;
}

/**
 * The 7 locales bundled offline in lib/i18n (zero-network chrome).
 * Keep in sync with lib/i18n/index.tsx LANGUAGES.
 */
export const BUNDLED_LANGUAGES = [
  { code: 'en', native: 'English', english: 'English' },
  { code: 'el', native: 'Ελληνικά', english: 'Greek' },
  { code: 'es', native: 'Español', english: 'Spanish' },
  { code: 'fr', native: 'Français', english: 'French' },
  { code: 'de', native: 'Deutsch', english: 'German' },
  { code: 'pt', native: 'Português', english: 'Portuguese' },
  { code: 'it', native: 'Italiano', english: 'Italian' },
];

/**
 * Languages beyond the bundle: content translates via the live API,
 * chrome honestly stays in English (fallback). Built from the label map
 * so the picker never offers a code we can't name.
 */
export const EXTENDED_LANGUAGES = [
  { code: 'ja', english: 'Japanese', native: '日本語' },
  { code: 'ko', english: 'Korean', native: '한국어' },
  { code: 'zh', english: 'Chinese', native: '中文' },
  { code: 'ar', english: 'Arabic', native: 'العربية' },
  { code: 'he', english: 'Hebrew', native: 'עברית' },
  { code: 'ru', english: 'Russian', native: 'Русский' },
  { code: 'uk', english: 'Ukrainian', native: 'Українська' },
  { code: 'th', english: 'Thai', native: 'ไทย' },
  { code: 'hi', english: 'Hindi', native: 'हिन्दी' },
  { code: 'nl', english: 'Dutch', native: 'Nederlands' },
  { code: 'my', english: 'Burmese', native: 'မြန်မာ' },
  { code: 'vi', english: 'Vietnamese', native: 'Tiếng Việt' },
  { code: 'tr', english: 'Turkish', native: 'Türkçe' },
  { code: 'pl', english: 'Polish', native: 'Polski' },
  { code: 'id', english: 'Indonesian', native: 'Bahasa Indonesia' },
];

/**
 * Best-effort ISO source guess, used for the MyMemory fallback (which
 * needs an explicit pair) and as a pre-translate hint. The Google
 * response's detected language wins for the "Translated from X" label.
 */
export function guessSourceLang(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  const counts = countScripts(text);
  // Kanji/hanzi are shared: kana presence decides Japanese, hangul Korean.
  if ((counts.get('ja') || 0) > 0) return 'ja';
  if ((counts.get('ko') || 0) > 0) return 'ko';
  let best = null;
  let bestN = 0;
  for (const [code, n] of counts) {
    if (code === 'latin') continue;
    if (n > bestN) {
      best = code;
      bestN = n;
    }
  }
  if (best) return best;
  return latinGuess(text);
}

const LANGUAGE_NAMES = {
  en: 'English',
  my: 'Burmese',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
  'zh-cn': 'Chinese',
  'zh-tw': 'Chinese',
  ar: 'Arabic',
  he: 'Hebrew',
  ru: 'Russian',
  uk: 'Ukrainian',
  th: 'Thai',
  hi: 'Hindi',
  el: 'Greek',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  pt: 'Portuguese',
  it: 'Italian',
  nl: 'Dutch',
  vi: 'Vietnamese',
  tr: 'Turkish',
  pl: 'Polish',
  id: 'Indonesian',
  ms: 'Malay',
};

/** Human label for the "Translated from X" tag. Never throws. */
export function languageName(code) {
  if (!code) return 'another language';
  const c = String(code).toLowerCase();
  return LANGUAGE_NAMES[c] || LANGUAGE_NAMES[c.split('-')[0]] || 'another language';
}

function fail(error, status) {
  return { ok: false, error, status };
}

/**
 * Validate a translate request body. Pure — the route calls this, tests
 * call this. Target defaults to English; anything malformed falls back
 * to English rather than failing.
 */
export function validateTranslateInput(body) {
  if (!body || typeof body !== 'object') return fail('Invalid request body.', 400);
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) return fail('Nothing to translate.', 400);
  if (text.length > MAX_TRANSLATE_CHARS) {
    return fail(`Text is too long to translate (max ${MAX_TRANSLATE_CHARS} characters).`, 413);
  }
  let target = targetDefault();
  if (isValidLanguageCode(body.target)) {
    target = body.target.trim();
  }
  return { ok: true, text, target };
}

/** Cache key for the route's in-memory translation cache. */
export function cacheKey(text, target) {
  return `${target}::${text}`;
}
