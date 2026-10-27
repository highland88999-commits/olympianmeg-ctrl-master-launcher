// app/console/page.jsx — the in-house console. MERLIN ONLY.
// His private throne-room view: the Muse portal inbox (read + reply, replies
// land in the visitor's portal chat) and the review/approval queues
// (HERMES directory submissions). The gate is enforced server-side in
// app/api/muse/console — this page just renders the locked screen when the
// API says no.
'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

const POLL_MS = 15000;

function fmtWhen(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

export default function ConsolePage() {
  const [gate, setGate] = useState('checking'); // checking | locked | open
  const [token, setToken] = useState(null);
  const [tab, setTab] = useState('inbox');
  const [threads, setThreads] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState('');
  const [listings, setListings] = useState([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const scrollRef = useRef(null);

  const callConsole = async (action, params = {}) => {
    const res = await fetch('/api/muse/console', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ access_token: token, action, ...params }),
    });
    if (res.status === 401 || res.status === 403) {
      setGate('locked');
      return null;
    }
    return res.json();
  };

  // Gate check on mount.
  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          setGate('locked');
          return;
        }
        setToken(session.access_token);
        const res = await fetch('/api/muse/console', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ access_token: session.access_token, action: 'list_threads' }),
        });
        if (res.status === 401 || res.status === 403) {
          setGate('locked');
          return;
        }
        const data = await res.json();
        if (data?.ok) {
          setThreads(data.threads || []);
          setGate('open');
        } else {
          setGate('locked');
        }
      } catch {
        setGate('locked');
      }
    })();
  }, []);

  const refreshThreads = async () => {
    if (!token) return;
    const data = await callConsole('list_threads');
    if (data?.ok) setThreads(data.threads);
  };

  const refreshListings = async () => {
    if (!token) return;
    const data = await callConsole('list_hermes_pending');
    if (data?.ok) setListings(data.listings);
  };

  useEffect(() => {
    if (gate !== 'open') return;
    refreshListings();
    const id = setInterval(() => {
      refreshThreads();
      if (tab === 'approvals') refreshListings();
    }, POLL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gate, token, tab]);

  const openThread = async (id) => {
    setActiveId(id);
    setMessages([]);
    const data = await callConsole('get_thread', { thread_id: id });
    if (data?.ok) {
      setMessages(data.messages);
      refreshThreads();
    }
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const sendReply = async () => {
    const text = reply.trim();
    if (!text || !activeId || busy) return;
    setBusy(true);
    setNotice('');
    try {
      const data = await callConsole('reply', { thread_id: activeId, body: text });
      if (data?.ok) {
        setReply('');
        await openThread(activeId);
        setNotice('Reply sent — the visitor sees it in their portal chat.');
      } else {
        setNotice(data?.error || 'The reply would not send.');
      }
    } finally {
      setBusy(false);
    }
  };

  const closeThread = async () => {
    if (!activeId || busy) return;
    setBusy(true);
    try {
      await callConsole('close_thread', { thread_id: activeId });
      setActiveId(null);
      setMessages([]);
      refreshThreads();
    } finally {
      setBusy(false);
    }
  };

  const reviewListing = async (id, approve) => {
    setBusy(true);
    setNotice('');
    try {
      const data = await callConsole(approve ? 'hermes_approve' : 'hermes_reject', { id });
      if (data?.ok) {
        setNotice(approve ? 'Listing approved — it is live in the directory.' : 'Listing rejected.');
        refreshListings();
      } else {
        setNotice(data?.error || 'That did not go through.');
      }
    } finally {
      setBusy(false);
    }
  };

  if (gate === 'checking') {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-black px-6 text-center">
        <p className="text-xs tracking-[0.3em] text-zinc-500">VERIFYING THE SEAL…</p>
      </main>
    );
  }

  if (gate === 'locked') {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-black px-6">
        <div className="max-w-sm text-center">
          <p className="text-4xl" aria-hidden="true">🔒</p>
          <h1 className="mt-4 text-lg font-black tracking-[0.25em] text-white">THE CONSOLE IS SEALED</h1>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            This is Merlin&apos;s private throne-room view — the inbox, the approvals, everything
            needing his eyes. Sign in with his account and knock again.
          </p>
        </div>
      </main>
    );
  }

  const active = threads.find((t) => t.id === activeId);

  return (
    <main className="min-h-dvh bg-black px-4 pb-16 pt-[max(1.25rem,env(safe-area-inset-top))] text-zinc-100">
      <header className="mx-auto max-w-3xl">
        <p className="text-[10px] tracking-[0.35em] text-violet-300/70">PRIVATE</p>
        <h1 className="mt-1 text-2xl font-black tracking-[0.2em] text-white">CONSOLE</h1>
        <p className="mt-1 text-xs text-zinc-500">Everything needing your eyes, in one throne-room view.</p>
        <div className="mt-4 flex gap-2" role="tablist" aria-label="Console sections">
          {[
            { key: 'inbox', label: 'INBOX' },
            { key: 'approvals', label: 'APPROVALS' },
          ].map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`min-h-[44px] flex-1 rounded-xl border text-xs font-bold tracking-[0.2em] transition ${
                tab === t.key
                  ? 'border-violet-300/60 bg-violet-500/20 text-white'
                  : 'border-white/10 bg-black/40 text-zinc-400 hover:border-white/25'
              }`}
            >
              {t.label}
              {t.key === 'inbox' && threads.reduce((n, x) => n + (x.unread || 0), 0) > 0 && (
                <span className="ml-2 rounded-full bg-violet-500 px-2 py-0.5 text-[10px] text-white">
                  {threads.reduce((n, x) => n + (x.unread || 0), 0)}
                </span>
              )}
            </button>
          ))}
        </div>
        <a
          href="/ad-spaces"
          className="mt-2 block min-h-[44px] rounded-xl border border-amber-300/40 bg-amber-500/10 px-3 py-3 text-center text-xs font-bold tracking-[0.2em] text-amber-200"
        >
          AD SPACES · BILLBOARD MANAGER
        </a>
      </header>

      {notice && (
        <p role="status" className="mx-auto mt-3 max-w-3xl rounded-xl border border-white/10 bg-zinc-900/80 px-4 py-2.5 text-xs text-zinc-300">
          {notice}
        </p>
      )}

      {tab === 'inbox' && (
        <section className="mx-auto mt-4 grid max-w-3xl gap-3 sm:grid-cols-[1fr_1.4fr]">
          <div className="flex max-h-[60dvh] flex-col gap-2 overflow-y-auto">
            {threads.length === 0 && (
              <p className="rounded-xl border border-white/10 p-4 text-xs text-zinc-500">
                No conversations yet — the portal is out there waiting.
              </p>
            )}
            {threads.map((t) => (
              <button
                key={t.id}
                onClick={() => openThread(t.id)}
                className={`min-h-[64px] rounded-xl border p-3 text-left transition ${
                  activeId === t.id
                    ? 'border-violet-300/60 bg-violet-500/10'
                    : 'border-white/10 bg-zinc-950/80 hover:border-white/25'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-zinc-500">{fmtWhen(t.last_message_at)}</span>
                  {t.unread > 0 && (
                    <span className="rounded-full bg-violet-500 px-2 py-0.5 text-[10px] font-bold text-white">
                      {t.unread} new
                    </span>
                  )}
                  {t.status === 'closed' && (
                    <span className="text-[10px] tracking-widest text-zinc-600">CLOSED</span>
                  )}
                </div>
                <p className="mt-1 truncate text-xs text-zinc-300">
                  {t.preview_sender === 'user' ? '' : 'Muse: '}{t.preview || '(empty)'}
                </p>
                {t.page_url && (
                  <p className="mt-0.5 truncate text-[10px] text-zinc-600">{t.page_url.replace(/^https?:\/\//, '')}</p>
                )}
              </button>
            ))}
          </div>

          <div className="flex max-h-[60dvh] min-h-[24rem] flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/80">
            {!active ? (
              <p className="flex flex-1 items-center justify-center p-6 text-center text-xs text-zinc-500">
                Pick a conversation on the left.
              </p>
            ) : (
              <>
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
                  <span className="text-[11px] text-zinc-500">{fmtWhen(active.last_message_at)}</span>
                  <button
                    onClick={closeThread}
                    disabled={busy}
                    className="min-h-[36px] rounded-lg border border-white/15 px-3 text-[11px] tracking-widest text-zinc-400 hover:text-white disabled:opacity-40"
                  >
                    CLOSE THREAD
                  </button>
                </div>
                <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
                  {messages.map((m) => {
                    const mine = m.sender === 'merlin';
                    return (
                      <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                            m.sender === 'user'
                              ? 'rounded-bl-md border border-white/10 bg-zinc-900 text-zinc-100'
                              : mine
                                ? 'rounded-br-md bg-violet-500/90 text-white'
                                : 'rounded-bl-md border border-teal-300/20 bg-teal-950/60 text-teal-100'
                          }`}
                        >
                          {!mine && m.sender !== 'user' && (
                            <p className="mb-0.5 text-[10px] font-bold tracking-widest text-teal-300/80">
                              {m.sender === 'muse' ? 'MUSE (AI)' : m.sender.toUpperCase()}
                            </p>
                          )}
                          <p className="whitespace-pre-wrap break-words">{m.body}</p>
                          <p className="mt-1 text-right text-[10px] text-zinc-500">{fmtWhen(m.created_at)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="border-t border-white/10 p-3">
                  <div className="flex items-end gap-2">
                    <label htmlFor="console-reply" className="sr-only">Reply as Merlin</label>
                    <textarea
                      id="console-reply"
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      rows={2}
                      placeholder="Reply as Merlin…"
                      className="max-h-32 min-h-[44px] flex-1 resize-none rounded-xl border border-white/10 bg-black/60 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-violet-300/60 focus:outline-none"
                    />
                    <button
                      onClick={sendReply}
                      disabled={busy || !reply.trim()}
                      className="min-h-[44px] flex-none rounded-xl bg-violet-500/90 px-5 text-xs font-bold tracking-[0.15em] text-white transition hover:bg-violet-400 disabled:opacity-40"
                    >
                      SEND
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {tab === 'approvals' && (
        <section className="mx-auto mt-4 max-w-3xl">
          <h2 className="mb-2 text-[10px] font-bold tracking-[0.3em] text-zinc-500">HERMES DIRECTORY — AWAITING REVIEW</h2>
          {listings.length === 0 && (
            <p className="rounded-xl border border-white/10 p-4 text-xs text-zinc-500">
              Nothing waiting — every listing is decided.
            </p>
          )}
          <ul className="flex flex-col gap-2">
            {listings.map((l) => (
              <li key={l.id} className="rounded-xl border border-white/10 bg-zinc-950/80 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-white">{l.name}</p>
                    <p className="truncate text-xs text-violet-300/80">{l.url}</p>
                    <p className="mt-1 text-[11px] text-zinc-500">
                      {l.category} · {l.root_domain} · {l.payment_status.toUpperCase()} · submitted {fmtWhen(l.created_at)}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => reviewListing(l.id, true)}
                    disabled={busy || l.payment_status === 'approved'}
                    className="min-h-[44px] flex-1 rounded-xl bg-emerald-500/90 text-xs font-black tracking-[0.15em] text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-40"
                  >
                    {l.payment_status === 'approved' ? 'LIVE' : 'APPROVE'}
                  </button>
                  <button
                    onClick={() => reviewListing(l.id, false)}
                    disabled={busy || l.payment_status === 'rejected'}
                    className="min-h-[44px] flex-1 rounded-xl border border-red-400/40 text-xs font-bold tracking-[0.15em] text-red-300 transition hover:bg-red-500/10 disabled:opacity-40"
                  >
                    REJECT
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] leading-relaxed text-zinc-600">
            Approving publishes the listing to the directory for the standard 12-month term.
            Paid listings approve themselves automatically when Stripe confirms — this queue is for your eyes and your call.
          </p>
        </section>
      )}
    </main>
  );
}
