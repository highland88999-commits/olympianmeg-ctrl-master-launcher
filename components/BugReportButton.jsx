'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { spacelessField } from '@/lib/bug-report-text';

// Global "Report a bug" floating button — mounted once in the root layout so
// it exists on every page. Reports go straight into the bug_reports table
// so Muse can see and act on them (not into email).
//
// Auto-captured with every report: page URL, user agent, viewport size,
// timestamp, and the reporter's account when signed in.

export default function BugReportButton({ concourse = false } = {}) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  // Space-integrity guard (bug report 2026-10-22): the field whose
  // text arrived with essentially no spaces between words, once the
  // reporter has been warned about it. Editing either field re-arms
  // the guard; a second Send tap sends the text exactly as written.
  const [spacelessWarnedFor, setSpacelessWarnedFor] = useState(null);
  const panelRef = useRef(null);

  // The Concourse rehoused this button's launcher: its Bug tile
  // fires `olympus:concourse-open` and we just open the form.
  useEffect(() => {
    if (!concourse) return undefined;
    const handler = (e) => { if (e?.detail?.tile === 'bug') setOpen(true); };
    window.addEventListener('olympus:concourse-open', handler);
    return () => window.removeEventListener('olympus:concourse-open', handler);
  }, [concourse]);

  // Close on Escape; close when tapping outside the panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    const onDown = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  const send = async () => {
    if (!description.trim() || sending) return;
    // Spaces check first: if the text came through with no spaces
    // between words (a keyboard that ate the spacebar — the exact
    // failure in the 2026-10-22 report), warn once and let the
    // reporter fix it or confirm. Never silently store a blob the
    // build team cannot read back.
    const smashed = spacelessField({ description, steps });
    if (smashed && spacelessWarnedFor !== smashed) {
      setSpacelessWarnedFor(smashed);
      setError('');
      return;
    }
    setSending(true);
    setError('');
    try {
      // Best effort: attach the session so the report links to the account.
      let token = '';
      try {
        const { data: { session } } = await supabase.auth.getSession();
        token = session?.access_token || '';
      } catch { /* anonymous report is fine */ }

      const res = await fetch('/api/bug-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          description: description.trim(),
          steps: steps.trim(),
          page_url: typeof window !== 'undefined' ? window.location.href : '',
          user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
          viewport: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : '',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) throw new Error(data.error || 'Could not send the report.');
      setSent(true);
      setTimeout(() => {
        setOpen(false);
        setSent(false);
        setDescription('');
        setSteps('');
        setSpacelessWarnedFor(null);
      }, 1600);
    } catch (e) {
      setError(e.message || 'Could not send the report.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="ui-element fixed left-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-[60]">
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Report a bug"
          className="mb-3 w-[19rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-white/15 bg-zinc-950/95 p-4 shadow-2xl backdrop-blur-md"
        >
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Report a bug</h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close bug report"
              className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <p className="mb-2 text-xs leading-relaxed text-zinc-400">
            What went wrong? The page address and your device details are added automatically.
          </p>
          <textarea
            value={description}
            onChange={(e) => { setDescription(e.target.value); setSpacelessWarnedFor(null); }}
            rows={3}
            placeholder="Describe the bug…"
            aria-label="Bug description"
            autoCapitalize="sentences"
            autoCorrect="on"
            spellCheck
            className="mb-2 w-full resize-none rounded-xl border border-white/10 bg-black/60 p-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-teal-300/60 focus:outline-none"
          />
          <textarea
            value={steps}
            onChange={(e) => { setSteps(e.target.value); setSpacelessWarnedFor(null); }}
            rows={2}
            placeholder="What were you doing? (optional)"
            aria-label="What you were doing"
            autoCapitalize="sentences"
            autoCorrect="on"
            spellCheck
            className="mb-3 w-full resize-none rounded-xl border border-white/10 bg-black/60 p-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-teal-300/60 focus:outline-none"
          />
          {spacelessWarnedFor && !error && (
            <p role="alert" className="mb-2 text-xs leading-relaxed text-amber-300">
              Your {spacelessWarnedFor === 'steps' ? '“what you were doing” text' : 'description'} came
              through with almost no spaces between words — some phone keyboards drop the
              spacebar in this small panel. Please check it above and add the spaces, or tap
              Send again to send it exactly as written.
            </p>
          )}
          {error && (
            <p className="mb-2 text-xs leading-relaxed text-red-300">{error}</p>
          )}
          <button
            type="button"
            onClick={send}
            disabled={sending || !description.trim()}
            className="w-full rounded-xl bg-teal-300/90 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-teal-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending ? 'Sending…' : sent ? 'Report sent — thank you!' : spacelessWarnedFor ? 'Send anyway — as written' : 'Send bug report'}
          </button>
          <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
            Goes straight to the build team. No email needed.
          </p>
        </div>
      )}
      {!concourse && (
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close bug report' : 'Report a bug'}
        title="Report a bug"
        className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/85 text-zinc-300 shadow-lg backdrop-blur-md transition-transform motion-reduce:transition-none hover:scale-105 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M9 3h6M10 3v4.5L4.5 12a2.1 2.1 0 0 0 0 3L10 19.5V21a1.5 1.5 0 0 0 1.5 1.5h1A1.5 1.5 0 0 0 14 21v-1.5l5.5-4.5a2.1 2.1 0 0 0 0-3L14 7.5V3"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="12" r="2.2" fill="currentColor" opacity="0.55" />
        </svg>
      </button>
      )}
    </div>
  );
}
