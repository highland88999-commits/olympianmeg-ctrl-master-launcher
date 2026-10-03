'use client';

// PerSymphony Tickets — post-purchase. Polls until the webhook issues the
// ticket numbers, then shows them big (mobile-first: screenshot this page).
import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

function SuccessInner() {
  const params = useSearchParams();
  const sessionId = params.get('session_id') || '';
  const [state, setState] = useState({ phase: 'waiting', tickets: [], show_id: null, show_title: '' });

  useEffect(() => {
    if (!sessionId) {
      setState({ phase: 'error', error: 'Missing checkout session.' });
      return;
    }
    let alive = true;
    let attempts = 0;
    const tick = async () => {
      attempts += 1;
      try {
        const r = await fetch(`/api/persymphony/tickets/by-session?session_id=${encodeURIComponent(sessionId)}`);
        const d = await r.json();
        if (!alive) return;
        if (d.ok && d.ready) {
          setState({ phase: 'ready', tickets: d.tickets, show_id: d.show_id, show_title: d.show_title });
          return;
        }
      } catch {
        // keep polling
      }
      if (alive && attempts < 30) setTimeout(tick, 2000);
      else if (alive) setState({ phase: 'error', error: 'Tickets are taking longer than usual. Check your email receipt — your numbers are on the way.' });
    };
    tick();
    return () => {
      alive = false;
    };
  }, [sessionId]);

  return (
    <div className="min-h-screen bg-[#070d1d] text-[#f4f6ff]">
      <div className="max-w-md mx-auto px-4 pt-10 pb-24 text-center">
        {state.phase === 'waiting' && (
          <>
            <p className="text-[#3a86ff] text-sm font-semibold">Payment received ✓</p>
            <h1 className="text-xl font-bold mt-2">Issuing your tickets…</h1>
            <p className="text-sm text-zinc-400 mt-2">This usually takes a few seconds.</p>
          </>
        )}
        {state.phase === 'error' && (
          <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-4">
            {state.error}
          </p>
        )}
        {state.phase === 'ready' && (
          <>
            <p className="text-[#3a86ff] text-sm font-semibold">You&apos;re in ✓</p>
            <h1 className="text-xl font-bold mt-2">{state.show_title}</h1>
            <p className="text-sm text-zinc-400 mt-2">
              Show {state.tickets.length === 1 ? 'this number' : 'these numbers'} at entry:
            </p>
            <div className="mt-4 grid gap-3">
              {state.tickets.map((t) => (
                <div
                  key={t.ticket_number}
                  className="rounded-xl border border-[#3a86ff]/50 bg-[#3a86ff]/10 p-5"
                >
                  <p className="text-2xl font-mono font-black tracking-widest">{t.ticket_number}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-zinc-500 mt-4">
              Screenshot this page. You&apos;ll provide the ticket number at the door or on the entry screen.
            </p>
            {state.show_id && (
              <Link
                href={`/persymphony/tickets/${state.show_id}/enter`}
                className="inline-block mt-6 min-h-[48px] px-6 py-3 rounded-lg bg-[#3a86ff] text-white font-semibold"
              >
                Go to entry →
              </Link>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function TicketSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#070d1d] text-[#f4f6ff] px-4 pt-10">
          <p className="text-zinc-500 text-sm max-w-md mx-auto">Loading…</p>
        </div>
      }
    >
      <SuccessInner />
    </Suspense>
  );
}
