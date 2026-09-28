'use client';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import en from './locales/en.json';
import el from './locales/el.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import de from './locales/de.json';
import pt from './locales/pt.json';
import it from './locales/it.json';

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
}

export const LANGUAGES: Language[] = [
  { code: 'en', native: 'English', english: 'English' },
  { code: 'el', native: 'Ελληνικά', english: 'Greek' },
  { code: 'es', native: 'Español', english: 'Spanish' },
  { code: 'fr', native: 'Français', english: 'French' },
  { code: 'de', native: 'Deutsch', english: 'German' },
  { code: 'pt', native: 'Português', english: 'Portuguese' },
  { code: 'it', native: 'Italiano', english: 'Italian' },
];

type Dict = Record<string, string>;
const DICTS: Record<string, Dict> = { en, el, es, fr, de, pt, it };

const STORAGE_KEY = 'nexus-language';
const DEFAULT_LANG = 'en';

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
    if (saved && DICTS[saved]) return saved;
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
    if (!DICTS[code]) return;
    setLangState(code);
    try { window.localStorage.setItem(STORAGE_KEY, code); } catch { /* ignore */ }
    try { document.documentElement.lang = code; } catch { /* ignore */ }
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
