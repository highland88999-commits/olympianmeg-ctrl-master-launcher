// ARES "Gold-label review" panel — Phase 1 gold-label review queue.
//
// Flagged events (heuristic labels, tier 1) wait here for a human:
// one click confirms the event was a real threat, or rejects it as
// benign. Confirmed and rejected labels become the tier-2/3 gold set
// the future model trains on — heuristic-only labels never enter
// production training data, so this queue is what makes an event
// trustworthy.
//
// Graceful degradation: the labels table (ares_event_labels) ships as
// a schema addition Merlin runs later. Until it exists, the queue still
// lists candidates from the evidence log and says so honestly —
// decisions are not saved yet, and nothing crashes.
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

const QUEUE_LIMIT = 20;

function eventThreatClass(event) {
  return event?.details?.ares_ml?.threat_class || null;
}

export default function ReviewQueue({ events, authedFetch, onRefresh }) {
  const [labels, setLabels] = useState(null); // null = not loaded yet
  const [provisioned, setProvisioned] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState('');

  const loadLabels = useCallback(async () => {
    if (!authedFetch) return;
    try {
      const res = await authedFetch('/api/ares/labels');
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setLabels(Array.isArray(data.labels) ? data.labels : []);
        setProvisioned(data.provisioned !== false);
      } else {
        setLabels([]);
        setProvisioned(data.provisioned !== false);
      }
    } catch {
      setLabels([]);
      setProvisioned(false);
    }
  }, [authedFetch]);

  useEffect(() => { loadLabels(); }, [loadLabels]);

  const labeledIds = useMemo(() => {
    const set = new Set();
    for (const l of labels || []) set.add(Number(l.event_id));
    return set;
  }, [labels]);

  // Candidates: labeled events first (they carry a threat class), newest
  // first, skipping anything a human already decided on.
  const queue = useMemo(() => {
    const rows = (events || [])
      .filter((e) => e && typeof e.id === 'number' && !labeledIds.has(Number(e.id)))
      .filter((e) => eventThreatClass(e) && eventThreatClass(e) !== 'benign')
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return rows.slice(0, QUEUE_LIMIT);
  }, [events, labeledIds]);

  const decide = async (event, decision) => {
    if (!authedFetch || busyId !== null) return;
    if (!provisioned) {
      setNotice('Labels table not yet provisioned — this decision cannot be saved yet.');
      return;
    }
    setBusyId(event.id);
    setNotice('');
    try {
      const res = await authedFetch('/api/ares/labels', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          eventId: event.id,
          decision,
          threatClass: eventThreatClass(event),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice(data.provisioned === false
          ? 'Labels table not yet provisioned — this decision cannot be saved yet.'
          : 'That decision did not save. Try again.');
        return;
      }
      setLabels((prev) => [...(prev || []), { event_id: event.id, decision, threat_class: decision === 'reject' ? 'benign' : eventThreatClass(event) }]);
      if (onRefresh) onRefresh();
    } catch {
      setNotice('That decision did not save. Try again.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-black uppercase tracking-[0.2em] text-zinc-100">
            Gold-label review
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            Flagged events waiting for a human word. Confirm a real threat, or reject it as benign — your call becomes the gold label the future model trains on.
          </p>
        </div>
        <span className="rounded-full border border-zinc-700 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-zinc-300">
          {queue.length} waiting
        </span>
      </div>

      {!provisioned && (
        <p className="mt-4 rounded-xl border border-amber-700/60 bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-200">
          Labels table not yet provisioned — the queue below is still worth reading, but confirm/reject decisions cannot be saved until the ares_event_labels table is created (supabase-additions.sql, run in the SQL editor).
        </p>
      )}
      {notice && (
        <p className="mt-4 rounded-xl border border-zinc-700 bg-black/40 px-4 py-3 text-xs leading-relaxed text-zinc-300">
          {notice}
        </p>
      )}

      {labels === null ? (
        <p className="mt-4 text-xs text-zinc-500">Loading the review queue…</p>
      ) : queue.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-zinc-800 bg-black/30 px-4 py-3 text-xs leading-relaxed text-zinc-500">
          Nothing waiting. Every flagged event in the recent log already has a human label — or nothing has been flagged yet.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {queue.map((event) => (
            <article key={event.id} className="rounded-xl border border-zinc-800 bg-black/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-bold uppercase tracking-widest text-zinc-200">
                  {event.event_type} · {eventThreatClass(event)}
                </div>
                <div className="text-[11px] tabular-nums text-zinc-500">
                  {event.created_at ? new Date(event.created_at).toLocaleString() : ''}
                </div>
              </div>
              <p className="mt-2 font-mono text-[11px] leading-relaxed text-zinc-400">
                {event.path || '(no path)'} · {(event.ip_hash || '').slice(0, 12)}
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => decide(event, 'confirm')}
                  disabled={busyId === event.id || !provisioned}
                  className="rounded-lg border border-emerald-700/60 px-4 py-2 text-xs font-bold uppercase tracking-widest text-emerald-300 transition-colors hover:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busyId === event.id ? 'Saving…' : 'Confirm threat'}
                </button>
                <button
                  onClick={() => decide(event, 'reject')}
                  disabled={busyId === event.id || !provisioned}
                  className="rounded-lg border border-zinc-700 px-4 py-2 text-xs font-bold uppercase tracking-widest text-zinc-300 transition-colors hover:border-zinc-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busyId === event.id ? 'Saving…' : 'Reject — benign'}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <p className="mt-4 text-[11px] leading-relaxed text-zinc-600">
        Only human-confirmed labels train a production model. Heuristic guesses alone never do.
      </p>
    </section>
  );
}
