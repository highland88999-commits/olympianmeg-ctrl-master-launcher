'use client';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { setFxEnabled, fx } from '@/lib/fx';

const FX_KEY = 'nexus_fx_enabled'; // '1' = on, '0' = off

// Small, native settings entry for the Nexus Hub menu header.
// Hosts the language selector and the global "Sound & vibration" toggle
// (the central FX library: synthesized sounds + haptics, everywhere).
export default function SettingsGear() {
  const { lang, setLang, t, languages } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [fxOn, setFxOn] = useState(true);

  // Restore the persisted FX choice on mount.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(FX_KEY);
      const on = stored === null ? true : stored === '1';
      setFxEnabled(on);
      setFxOn(on);
    } catch { /* private mode: leave the default on */ }
  }, []);

  const toggleFx = () => {
    const next = !fxOn;
    setFxEnabled(next);
    setFxOn(next);
    try { localStorage.setItem(FX_KEY, next ? '1' : '0'); } catch { /* ignore */ }
  };

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open ]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => { fx.tap(); setOpen((o) => !o); }}
        title={t('ui.language')}
        aria-label={t('ui.language')}
        aria-expanded={open}
        className="p-1 text-zinc-500 hover:text-white transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-7 z-[70] w-44 rounded-lg border border-zinc-800 bg-zinc-950/95 p-1 shadow-[0_0_20px_rgba(0,0,0,0.6)] backdrop-blur-md">
          <div className="px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-500">
            {t('ui.language')}
          </div>
          {languages.map((l) => (
            <button
              key={l.code}
              onClick={() => { setLang(l.code); setOpen(false); }}
              className="flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-zinc-800/70"
            >
              <span className={l.code === lang ? 'text-white font-semibold' : 'text-zinc-400'}>
                {l.native}
              </span>
              {l.code === lang && <span className="text-cyan-400 text-[10px]">✓</span>}
            </button>
          ))}
          <div className="px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-500 mt-1 border-t border-zinc-800/70 pt-2">
            Sound &amp; vibration
          </div>
          <button
            onClick={toggleFx}
            aria-pressed={fxOn}
            className="flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-zinc-800/70"
          >
            <span className={fxOn ? 'text-white font-semibold' : 'text-zinc-400'}>
              {fxOn ? 'On' : 'Off'}
            </span>
            <span
              aria-hidden="true"
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${fxOn ? 'bg-cyan-500/70' : 'bg-zinc-700'}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${fxOn ? 'translate-x-4' : 'translate-x-0.5'}`}
              />
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
