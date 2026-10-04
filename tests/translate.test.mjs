// tests/translate.test.mjs
// Headless tests for in-app translation (English default).
// Run: node tests/translate.test.mjs (from the repo root). No browser, no network.
import {
  targetDefault,
  DEFAULT_TARGET_LANG,
  MAX_TRANSLATE_CHARS,
  needsTranslation,
  guessSourceLang,
  latinGuess,
  languageName,
  validateTranslateInput,
  cacheKey,
  normLang,
  isValidLanguageCode,
  resolvePreferredLanguage,
  BUNDLED_LANGUAGES,
  EXTENDED_LANGUAGES,
} from '../lib/translate.js';
import { validateProfileUpdate } from '../lib/profiles/validation.js';
import { readFileSync } from 'node:fs';

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

const BURMESE = 'ဘာတွေမှန်းမသိ နားမလည်သော်လည်းကြည့်ခဲ့သည်';
const JAPANESE = 'これはテストです';
const KOREAN = '테스트입니다';
const CHINESE = '这是一个测试';
const ARABIC = 'هذا اختبار';
const SPANISH = 'porque cuando llegué ya era muy tarde';
const FRENCH = 'merci beaucoup parce que vous êtes gentil';
const ENGLISH = 'Just a normal English title for a recording';

// --- target default ----------------------------------------------------------
t('targetDefault() is en', targetDefault() === 'en');
t('DEFAULT_TARGET_LANG is en', DEFAULT_TARGET_LANG === 'en');

// --- needsTranslation ---------------------------------------------------------
t('Burmese needs translation', needsTranslation(BURMESE) === true);
t('Japanese needs translation', needsTranslation(JAPANESE) === true);
t('Korean needs translation', needsTranslation(KOREAN) === true);
t('Chinese needs translation', needsTranslation(CHINESE) === true);
t('Arabic needs translation', needsTranslation(ARABIC) === true);
t('Spanish needs translation', needsTranslation(SPANISH) === true);
t('French needs translation', needsTranslation(FRENCH) === true);
t('English does not', needsTranslation(ENGLISH) === false);
t('empty does not', needsTranslation('') === false);
t('whitespace does not', needsTranslation('   ') === false);
t('null does not', needsTranslation(null) === false);
t('English + emoji does not', needsTranslation('Race highlights 🏁🔥') === false);
t('mixed EN + Burmese does', needsTranslation('My race ' + BURMESE) === true);
t('single English stopword-lookalike does not', needsTranslation('die') === false);
t('numbers only do not', needsTranslation('12345') === false);

// --- latinGuess ----------------------------------------------------------------
t('latinGuess finds Spanish', latinGuess(SPANISH) === 'es');
t('latinGuess finds French', latinGuess(FRENCH) === 'fr');
t('latinGuess null on English', latinGuess(ENGLISH) === null);
t('latinGuess null on single hit', latinGuess('die') === null);

// --- guessSourceLang ---------------------------------------------------------------
t('guess Burmese -> my', guessSourceLang(BURMESE) === 'my');
t('guess Japanese -> ja', guessSourceLang(JAPANESE) === 'ja');
t('kanji-only with kana -> ja', guessSourceLang('日本語テスト') === 'ja');
t('guess Korean -> ko', guessSourceLang(KOREAN) === 'ko');
t('guess Chinese-only -> zh', guessSourceLang(CHINESE) === 'zh');
t('guess Arabic -> ar', guessSourceLang(ARABIC) === 'ar');
t('guess English -> null', guessSourceLang(ENGLISH) === null);
t('guess empty -> null', guessSourceLang('') === null);

// --- languageName ---------------------------------------------------------------------
t('my -> Burmese', languageName('my') === 'Burmese');
t('ja -> Japanese', languageName('ja') === 'Japanese');
t('zh-CN -> Chinese', languageName('zh-CN') === 'Chinese');
t('unknown code -> another language', languageName('xx') === 'another language');
t('null -> another language', languageName(null) === 'another language');

// --- validateTranslateInput --------------------------------------------------------------
let v;
v = validateTranslateInput({});
t('missing text -> 400', v.ok === false && v.status === 400);
v = validateTranslateInput({ text: '   ' });
t('blank text -> 400', v.ok === false && v.status === 400);
v = validateTranslateInput({ text: 'x'.repeat(MAX_TRANSLATE_CHARS + 1) });
t('over-long text -> 413', v.ok === false && v.status === 413);
v = validateTranslateInput({ text: 'hello' });
t('valid -> ok, target defaults to en', v.ok === true && v.target === 'en' && v.text === 'hello');
v = validateTranslateInput({ text: 'hola', target: 'es' });
t('target passthrough es', v.ok === true && v.target === 'es');
v = validateTranslateInput({ text: 'hola', target: 'not-a-lang!!' });
t('bad target falls back to en', v.ok === true && v.target === 'en');
v = validateTranslateInput(null);
t('null body -> 400', v.ok === false && v.status === 400);

// --- cacheKey -------------------------------------------------------------------------------
t('cacheKey deterministic', cacheKey('abc', 'en') === cacheKey('abc', 'en'));
t('cacheKey separates targets', cacheKey('abc', 'en') !== cacheKey('abc', 'es'));

// --- wiring source-checks ---------------------------------------------------------------------
const comp = readFileSync('components/TranslatedText.jsx', 'utf8');
t('component calls /api/translate', comp.includes('/api/translate'));
t('component has Show original toggle', comp.includes('Show original'));
t('component shows Translated from label', comp.includes('Translated from'));
t('component gates on needsTranslation', comp.includes('needsTranslation'));
t('component honest error state', comp.includes('t translate'));

const route = readFileSync('app/api/translate/route.js', 'utf8');
t('route tries Google primary', route.includes('viaGoogle'));
t('route falls back to MyMemory', route.includes('viaMyMemory'));
t('route rate-limits (429)', route.includes('429'));
t('route caches (CACHE_TTL)', route.includes('CACHE_TTL_MS'));
t('route honest 502 on total failure', route.includes('502'));
t('route never exposes keys client-side', !/API_KEY|apiKey/.test(route));

const page = readFileSync('app/live-recordings/page.jsx', 'utf8');
t('live-recordings imports TranslatedText', page.includes("from '@/components/TranslatedText'"));
t('live-recordings title uses TranslatedText', page.includes('<TranslatedText as="h3"'));

// --- both-ways: preferred-language-aware detection --------------------------------
t('Burmese + preferred en -> needs translation', needsTranslation(BURMESE, 'en') === true);
t('Burmese + preferred my -> no translation', needsTranslation(BURMESE, 'my') === false);
t('Japanese + preferred ja -> no translation', needsTranslation(JAPANESE, 'ja') === false);
t('Japanese + preferred en -> needs translation', needsTranslation(JAPANESE, 'en') === true);
t('Spanish + preferred es -> no translation', needsTranslation(SPANISH, 'es') === false);
t('Spanish + preferred en -> needs translation', needsTranslation(SPANISH, 'en') === true);
t('English + preferred es -> needs translation', needsTranslation(ENGLISH, 'es') === true);
t('English + preferred en -> no translation', needsTranslation(ENGLISH, 'en') === false);
t('invalid preferred falls back to en behavior', needsTranslation(BURMESE, 'xx!') === true);
t('invalid preferred: English still passes', needsTranslation(ENGLISH, 'xx!') === false);

// --- normLang / isValidLanguageCode ------------------------------------------------
t('normLang zh-CN -> zh', normLang('zh-CN') === 'zh');
t('normLang EN -> en', normLang('EN') === 'en');
t('normLang garbage -> null', normLang('xx!') === null);
t('isValidLanguageCode en', isValidLanguageCode('en') === true);
t('isValidLanguageCode zh-CN', isValidLanguageCode('zh-CN') === true);
t('isValidLanguageCode rejects garbage', isValidLanguageCode('e n') === false);
t('isValidLanguageCode rejects empty', isValidLanguageCode('') === false);

// --- resolvePreferredLanguage -------------------------------------------------------
t('profile lang wins', resolvePreferredLanguage({ profileLang: 'es', storedLang: 'fr' }) === 'es');
t('stored lang fallback', resolvePreferredLanguage({ storedLang: 'fr' }) === 'fr');
t('invalid profile falls to stored', resolvePreferredLanguage({ profileLang: 'xx!', storedLang: 'de' }) === 'de');
t('nothing -> en', resolvePreferredLanguage({}) === 'en');
t('nulls -> en', resolvePreferredLanguage({ profileLang: null, storedLang: null }) === 'en');

// --- language lists -------------------------------------------------------------------
t('7 bundled languages', BUNDLED_LANGUAGES.length === 7);
t('bundled includes en first', BUNDLED_LANGUAGES[0].code === 'en');
t('bundled codes match i18n dicts', ['en','el','es','fr','de','pt','it'].every((c) => BUNDLED_LANGUAGES.some((l) => l.code === c)));
t('extended list non-empty', EXTENDED_LANGUAGES.length > 0);
t('extended has Japanese', EXTENDED_LANGUAGES.some((l) => l.code === 'ja'));
t('no overlap bundled/extended', !EXTENDED_LANGUAGES.some((l) => BUNDLED_LANGUAGES.some((b) => b.code === l.code)));

// --- profile validation: preferred_language --------------------------------------------
let pv;
pv = validateProfileUpdate({ preferred_language: 'es' });
t('validation accepts es', pv.ok === true && pv.value.preferred_language === 'es');
pv = validateProfileUpdate({ preferred_language: 'ja' });
t('validation accepts ja (non-bundled)', pv.ok === true && pv.value.preferred_language === 'ja');
pv = validateProfileUpdate({ preferred_language: 'not a lang!!' });
t('validation fail-softs garbage to en', pv.ok === true && pv.value.preferred_language === 'en');
pv = validateProfileUpdate({ display_name: 'x' });
t('validation omits when absent', pv.ok === true && !('preferred_language' in pv.value));

// --- migration source-checks ----------------------------------------------------------------
const mig = readFileSync('supabase/migrations/20261004_preferred_language.sql', 'utf8');
t('migration adds preferred_language', mig.includes('preferred_language'));
t('migration defaults en + not null', mig.includes("not null default 'en'"));
t('migration has format check', mig.includes('user_profiles_preferred_language_chk'));
t('migration NOT executed (green-light header)', /DO NOT RUN|GREEN LIGHT/i.test(mig));

// --- profile edit page source-checks ---------------------------------------------------------------
const editPage = readFileSync('app/u/[username]/edit/page.jsx', 'utf8');
t('edit page has language picker', editPage.includes('pe-lang'));
t('edit page lists bundled group', editPage.includes('Instant — built in'));
t('edit page lists live-translation group', editPage.includes('Live translation'));
t('edit page honest fallback note', editPage.includes('menus stay in English'));
t('edit page sends preferred_language on save', editPage.includes('preferred_language: preferredLanguage'));
t('edit page syncs localStorage on save', editPage.includes("setItem('nexus-language', preferredLanguage)"));

const profilesRoute = readFileSync('app/api/profiles/me/route.js', 'utf8');
t('PATCH writes preferred_language defensively', profilesRoute.includes('preferred_language: preferredLanguage'));
t('PATCH tolerates 42703 for language', profilesRoute.includes("lErr.code !== '42703'"));
t('PATCH keeps language personal-only', profilesRoute.includes("type === 'personal' && 'preferred_language' in v.value"));

const lrPage = readFileSync('app/live-recordings/page.jsx', 'utf8');
t('live-recordings resolves viewer lang', lrPage.includes('resolvePreferredLanguage'));
t('live-recordings passes target to TranslatedText', lrPage.includes('target={viewerLang}'));

const i18n = readFileSync('lib/i18n/index.tsx', 'utf8');
t('i18n accepts non-bundled codes', i18n.includes('isLangCode'));
t('i18n chrome falls back to English dict', i18n.includes('DICTS[lang] || en'));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
