'use client';

// PerSymphony Tickets — the entry gate. Lives on the viewer's device:
// they provide their ticket number here to access the performance.
// For physical doors, the viewer shows the number and door staff type it in
// here (or the viewer types it at a kiosk) — same gate, both directions.
//
// On admission:
//   physical   -> door pass (venue name + address), ticket marked used
//   virtual    -> the in-house arena link
//   livestream -> the stream URL (revealed only now, never before)
//   hybrid     -> door pass + stream URL
import { useState } from 'react';
import Link from 'next/link';

export default function TicketEntryPage({ params }) {
  const { id } = params;
  const [number, setNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  async function check() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch('/api/persymphony/tickets/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket_number: number, show_id: id }),
      });
      const d = await res.json();
      setResult(d);
    } catch {
      setResult({ ok: false, error: 'Could not reach the gate. Try again.' });
    } finally {
      setBusy(false);
    }
  }

  const entry = result?.ok ? result.entry : null;

  return (
    <div className="min-h-screen bg-[#070d1d] text-[#f4f6ff]">
      <div className="max-w-md mx-auto px-4 pt-8 pb-24">
        <Link href={`/persymphony/tickets/${id}`} className="text-xs text-[#3a86ff]">
          ← Back to show
        </Link>
        <p className="text-xs tracking-[0.2em] uppercase text-[#3a86ff] mt-4">Entry gate</p>
        <h1 className="text-2xl font-black mt-1">Provide your ticket number</h1>

        {!result?.ok && (
          <div className="mt-6">
            <label className="text-sm text-zinc-400">
              Ticket number
              <input
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="PS-XXXXXXXX"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                className="mt-2 w-full min-h-[56px] rounded-xl bg-black/40 border border-white/15 px-4 text-xl font-mono tracking-widest text-center"
              />
            </label>
            <button
              onClick={check}
              disabled={busy || !number.trim()}
              className="w-full mt-3 min-h-[52px] rounded-xl bg-[#3a86ff] text-white font-semibold disabled:opacity-50"
            >
              {busy ? 'Checking…' : 'Enter'}
            </button>
            {result && !result.ok && (
              <p className="mt-4 text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                {result.error}
                {result.code === 'already_redeemed' && result.redeemed_at && (
                  <span className="block mt-1 text-xs text-red-300/70">
                    First scanned{' '}
                    {new Date(result.redeemed_at).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </span>
                )}
              </p>
            )}
          </div>
        )}

        {result?.ok && (
          <div className="mt-6 rounded-2xl border border-[#3a86ff]/50 bg-[#3a86ff]/10 p-6 text-center">
            <p className="text-[#3a86ff] text-sm font-bold tracking-widest uppercase">Admitted ✓</p>
            <p className="text-2xl font-mono font-black tracking-widest mt-2">{result.ticket_number}</p>
            {result.buyer_name && <p className="text-sm text-zinc-400 mt-1">{result.buyer_name}</p>}

            {entry?.door && (
              <div className="mt-5 text-left rounded-xl bg-black/30 border border-white/10 p-4">
                <p className="text-xs uppercase tracking-widest text-zinc-500">At the door</p>
                <p className="font-semibold mt-1">{entry.door.venue_name}</p>
                {entry.door.venue_address && (
                  <p className="text-sm text-zinc-400">{entry.door.venue_address}</p>
                )}
                <p className="text-xs text-zinc-500 mt-2">Show this screen for door validation.</p>
              </div>
            )}
            {entry?.arena && (
              <div className="mt-4">
                <Link
                  href={entry.arena.url}
                  className="inline-block min-h-[52px] px-8 py-3.5 rounded-xl bg-[#3a86ff] text-white font-semibold"
                >
                  Enter the arena →
                </Link>
              </div>
            )}
            {entry?.stream && (
              <div className="mt-4 rounded-xl bg-black/30 border border-white/10 p-4">
                <p className="text-xs uppercase tracking-widest text-zinc-500">Your stream</p>
                <a
                  href={entry.stream.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-2 min-h-[52px] px-8 py-3.5 rounded-xl bg-[#3a86ff] text-white font-semibold"
                >
                  Watch live →
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
