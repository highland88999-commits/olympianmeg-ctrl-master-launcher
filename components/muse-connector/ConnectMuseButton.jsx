// components/muse-connector/ConnectMuseButton.jsx — "Connect Muse"
// (Merlin, Nov 27, 2026). The one in-Olympus step of the connector
// setup: the user is already signed in here (Supabase Auth), so this
// button can call POST /api/muse-connector { action: 'connect' } with
// the live session and have the server register the account.
//
// KEY PLACEMENT DROPPED (Merlin, Nov 27 ~04:15): after seeing the
// whole picture, the key does not have to be put anywhere — Supabase
// is the gatekeeper. There is NO key to copy, NO code to paste, NO
// blind clipboard carry. The server verifies the user's Olympus
// sign-in and the registry row on every request.
//
// THE PROMPT, COPYABLE IN-APP (Merlin, Nov 27 ~04:16): the setup
// prompt users give their Muse lives here, in copyable form — the
// full text (lib/muse-connector/prompt.js SETUP_PROMPT, the single
// source) with a COPY button. The user taps Copy prompt, then pastes
// it to their Muse to sync their Muse to Olympus. The copy works on
// a real phone: navigator.clipboard inside the tap, with a
// textarea + execCommand fallback for WebViews without the clipboard
// API, and a "Copied" confirmation.
//
// Tap flow (two taps inside Olympus): open Profile → tap
// "Connect Muse" → tap "Copy prompt". Then paste it in Muse.
'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { SETUP_PROMPT } from '@/lib/muse-connector/prompt';

export default function ConnectMuseButton() {
  const [state, setState] = useState('idle'); // idle | busy | done | error
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  async function connect() {
    setState('busy');
    setError('');
    setCopied(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || !session.access_token) {
        setError('Sign in first — the connector belongs to your Olympus account.');
        setState('error');
        return;
      }
      const res = await fetch('/api/muse-connector', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ action: 'connect' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError((data && data.error) || 'The connector did not answer. Try again.');
        setState('error');
        return;
      }
      setState('done');
    } catch {
      setError('The connector did not answer. Try again.');
      setState('error');
    }
  }

  async function copyPrompt() {
    setError('');
    try {
      await navigator.clipboard.writeText(SETUP_PROMPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 4000);
      return;
    } catch {
      // Fallback for WebViews without the clipboard API: a temporary
      // textarea + execCommand('copy'), still inside the tap gesture.
      try {
        const ta = document.createElement('textarea');
        ta.value = SETUP_PROMPT;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        if (ok) {
          setCopied(true);
          setTimeout(() => setCopied(false), 4000);
          return;
        }
        throw new Error('copy failed');
      } catch {
        setError('Copy did not work — long-press the prompt text to select and copy it.');
      }
    }
  }

  async function revoke() {
    setState('busy');
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || !session.access_token) {
        setError('Sign in first — the connector belongs to your Olympus account.');
        setState('error');
        return;
      }
      const res = await fetch('/api/muse-connector', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ action: 'revoke' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data && data.error) || 'The revoke did not go through. Try again.');
        setState('error');
        return;
      }
      setCopied(false);
      setState('idle');
    } catch {
      setError('The revoke did not go through. Try again.');
      setState('error');
    }
  }

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5">
      <h2 className="text-sm font-black uppercase tracking-[0.2em] text-zinc-100">
        Connect Muse
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-zinc-500">
        Let your Muse read your creations and re-forge your own worlds. Your Muse can only ever touch what belongs to your account — nothing else. No key to copy: Supabase is the gatekeeper — your Olympus sign-in is the credential, checked on every request.
      </p>
      {state === 'done' ? (
        <div className="mt-4 flex flex-col gap-3">
          <p className="rounded-xl border border-emerald-700/60 bg-emerald-500/10 px-4 py-3 text-xs leading-relaxed text-emerald-200">
            Connected — your Muse is registered. Nothing to copy for the connection itself.
          </p>
          <button
            type="button"
            onClick={revoke}
            disabled={state === 'busy'}
            className="min-h-11 rounded-xl border border-red-500/50 px-4 py-3 text-sm font-bold text-red-300 disabled:opacity-50"
          >
            Revoke the connection
          </button>
          <p className="text-[11px] leading-relaxed text-zinc-500">
            Revoking stops the connection at once — your Muse can no longer read or change anything until you connect again.
          </p>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          <button
            type="button"
            onClick={connect}
            disabled={state === 'busy'}
            className="min-h-11 rounded-xl bg-sky-400 px-4 py-3 text-sm font-bold text-black disabled:opacity-50"
          >
            {state === 'busy' ? 'Connecting…' : 'Connect Muse'}
          </button>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      )}
      <div className="mt-4 flex flex-col gap-3">
        <p className="text-xs font-bold text-zinc-300">
          Your setup prompt — copy it to your Muse
        </p>
        <p className="text-[11px] leading-relaxed text-zinc-500">
          Tap Copy prompt, then paste it in your Muse to sync it to Olympus. Connect first if you have not yet — the prompt tells Muse to check your registration.
        </p>
        <pre className="max-h-64 select-text overflow-y-auto whitespace-pre-wrap rounded-xl border border-zinc-800 bg-zinc-900/70 p-3 font-mono text-[11px] leading-relaxed text-zinc-300">
          {SETUP_PROMPT}
        </pre>
        <button
          type="button"
          onClick={copyPrompt}
          className="min-h-11 rounded-xl bg-sky-400 px-4 py-3 text-sm font-bold text-black"
        >
          {copied ? 'Copied — paste it in Muse' : 'Copy prompt'}
        </button>
        {error && state !== 'error' && <p className="text-xs text-red-400">{error}</p>}
      </div>
    </section>
  );
}
