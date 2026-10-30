'use client';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import en from './locales/en.json';
import el from './locales/el.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import de from './locales/de.json';
import pt from './locales/pt.json';
import it from './locales/it.json';
// Machine-translated (Gemini) — honest "AI" badge in the language picker.
import zh from './locales/zh.json';
import hi from './locales/hi.json';
import ar from './locales/ar.json';
import bn from './locales/bn.json';
import ru from './locales/ru.json';
import ur from './locales/ur.json';
import id from './locales/id.json';
import ja from './locales/ja.json';
import ms from './locales/ms.json';
import tr from './locales/tr.json';
import ko from './locales/ko.json';
import vi from './locales/vi.json';
import ta from './locales/ta.json';
import fa from './locales/fa.json';
import pl from './locales/pl.json';
import uk from './locales/uk.json';
import nl from './locales/nl.json';
import th from './locales/th.json';
import sw from './locales/sw.json';
import ha from './locales/ha.json';
import yo from './locales/yo.json';
import am from './locales/am.json';
import ne from './locales/ne.json';
import pa from './locales/pa.json';
import jv from './locales/jv.json';
import te from './locales/te.json';
import mr from './locales/mr.json';

// ---------------------------------------------------------------------------
// Nexus i18n — zero-dependency, zero-network translation layer.
// Every dictionary is bundled at build time: no runtime API calls, no CDN,
// no external requests. Works fully offline.
// To add a language: drop one JSON file in ./locales and register it below.
// ---------------------------------------------------------------------------

export interface Language {
  code: string;
  native: string;   // name in its own language
  english: string;  // name in English
  machine?: boolean; // true = AI machine-translated (honest badge in picker)
}

export const LANGUAGES: Language[] = [
  { code: 'en', native: 'English', english: 'English' },
  { code: 'el', native: 'Ελληνικά', english: 'Greek' },
  { code: 'es', native: 'Español', english: 'Spanish' },
  { code: 'fr', native: 'Français', english: 'French' },
  { code: 'de', native: 'Deutsch', english: 'German' },
  { code: 'pt', native: 'Português', english: 'Portuguese' },
  { code: 'it', native: 'Italiano', english: 'Italian' },
  // Machine-translated via Gemini — whole app translates, marked honestly.
  { code: 'zh', native: '中文', english: 'Chinese', machine: true },
  { code: 'hi', native: 'हिन्दी', english: 'Hindi', machine: true },
  { code: 'ar', native: 'العربية', english: 'Arabic', machine: true },
  { code: 'bn', native: 'বাংলা', english: 'Bengali', machine: true },
  { code: 'ru', native: 'русский', english: 'Russian', machine: true },
  { code: 'ur', native: 'اردو', english: 'Urdu', machine: true },
  { code: 'id', native: 'Bahasa Indonesia', english: 'Indonesian', machine: true },
  { code: 'ja', native: '日本語', english: 'Japanese', machine: true },
  { code: 'ms', native: 'Bahasa Melayu', english: 'Malay', machine: true },
  { code: 'tr', native: 'Türkçe', english: 'Turkish', machine: true },
  { code: 'ko', native: '한국어', english: 'Korean', machine: true },
  { code: 'vi', native: 'Tiếng Việt', english: 'Vietnamese', machine: true },
  { code: 'ta', native: 'தமிழ்', english: 'Tamil', machine: true },
  { code: 'fa', native: 'فارسی', english: 'Persian', machine: true },
  { code: 'pl', native: 'polski', english: 'Polish', machine: true },
  { code: 'uk', native: 'українська', english: 'Ukrainian', machine: true },
  { code: 'nl', native: 'Nederlands', english: 'Dutch', machine: true },
  { code: 'th', native: 'ไทย', english: 'Thai', machine: true },
  { code: 'sw', native: 'Kiswahili', english: 'Swahili', machine: true },
  { code: 'ha', native: 'Hausa', english: 'Hausa', machine: true },
  { code: 'yo', native: 'Èdè Yorùbá', english: 'Yoruba', machine: true },
  { code: 'am', native: 'አማርኛ', english: 'Amharic', machine: true },
  { code: 'ne', native: 'नेपाली', english: 'Nepali', machine: true },
  { code: 'pa', native: 'ਪੰਜਾਬੀ', english: 'Punjabi', machine: true },
  { code: 'jv', native: 'Basa Jawa', english: 'Javanese', machine: true },
  { code: 'te', native: 'తెలుగు', english: 'Telugu', machine: true },
  { code: 'mr', native: 'मराठी', english: 'Marathi', machine: true },
];

type Dict = Record<string, string>;
const DICTS: Record<string, Dict> = {
  en, el, es, fr, de, pt, it,
  zh, hi, ar, bn, ru, ur, id, ja, ms, tr, ko, vi,
  ta, fa, pl, uk, nl, th, sw, ha, yo, am, ne, pa,
  jv, te, mr,
};

const STORAGE_KEY = 'nexus-language';
const DEFAULT_LANG = 'en';

// Any well-formed language code is acceptable as the *preferred* language:
// bundled codes get offline chrome, everything else keeps English chrome
// (honest fallback) while content translates via the live API.
function isLangCode(code) {
  return typeof code === 'string' && /^[a-z]{2,3}(-[a-z]{2})?$/i.test(code.trim());
}

interface I18nCtx {
  lang: string;
  setLang: (code: string) => void;
  t: (key: string) => string;
  languages: Language[];
}

const Ctx = createContext<I18nCtx>({
  lang: DEFAULT_LANG,
  setLang: () => {},
  t: (k: string) => k,
  languages: LANGUAGES,
});

function initialLang(): string {
  if (typeof window === 'undefined') return DEFAULT_LANG;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    // Accept any well-formed code (not just bundled): non-bundled codes
    // keep English chrome via the t() fallback while content translates.
    if (saved && isLangCode(saved)) return saved.trim().toLowerCase();
    const nav = (window.navigator.language || 'en').slice(0, 2).toLowerCase();
    if (DICTS[nav]) return nav;
  } catch { /* private mode etc. — fall through */ }
  return DEFAULT_LANG;
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<string>(DEFAULT_LANG);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setLangState(initialLang());
    setReady(true);
  }, []);

  const setLang = useCallback((code: string) => {
    if (!isLangCode(code)) return;
    const c = code.trim().toLowerCase();
    setLangState(c);
    try { window.localStorage.setItem(STORAGE_KEY, c); } catch { /* ignore */ }
    try { document.documentElement.lang = c; } catch { /* ignore */ }
  }, []);

  const t = useCallback(
    (key: string): string => {
      const d = DICTS[lang] || en;
      if (d[key]) return d[key];
      if (en[key]) return en[key]; // English fallback — never a blank label
      return key;
    },
    [lang]
  );

  const value = useMemo(() => ({ lang, setLang, t, languages: LANGUAGES }), [lang, setLang, t]);

  // Avoid a flash of English on first paint for returning visitors:
  // render children only once the stored language is resolved.
  if (!ready) return null;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nCtx {
  return useContext(Ctx);
}

// Standalone translator for non-React code (tests, scripts).
export function translate(key: string, lang: string = DEFAULT_LANG): string {
  const d = DICTS[lang] || en;
  return d[key] || en[key] || key;
}

export function supportedLanguage(code: string): boolean {
  return !!DICTS[code];
}
