// components/MusePortal.jsx — the floating Muse assistance portal.
// Mounted once in the root layout so it exists in every section. Tapping the
// spark opens a warm, conversational chat sheet: message bubbles, a typing
// indicator while the reply is composed, smooth threading, phone-first.
// PUBLIC: no sign-in required — anonymous visitors can open it and send.
// Sensitive data is protected by the no-leak rule server-side, never by a
// lock on this UI.
'use client';

import { useEffect, useRef, useState } from 'react';

const THREAD_KEY = 'muse_thread_id';
const POLL_MS = 5000;

const GREETING = {
  id: 'greeting',
  sender: 'muse',
  body: "Hey — I'm Muse, your helper around the launcher. Ask me anything: where things are, how the store or Order 67 calls work, how to submit a HERMES listing… what's on your mind?",
  created_at: null,
};

function fmtTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

export default function MusePortal() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([GREETING]);
  const [threadId, setThreadId] = useState(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState('');
  const panelRef = useRef(null);
  const scrollRef = useRef(null);
  const openRef = useRef(false);
  openRef.current = open;

  // Restore the visitor's thread.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(THREAD_KEY);
      if (saved) setThreadId(saved);
    } catch {
      // private mode — each visit starts fresh
    }
  }, []);

  const getToken = async () => {
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data: { session } } = await supabase.auth.getSession();
      return session?.access_token || null;
    } catch {
      return null;
    }
  };

  const loadThread = async (id) => {
    try {
      const res = await fetch(`/api/muse/messages?thread_id=${encodeURIComponent(id)}`);
      const data = await res.json();
      if (data?.ok && Array.isArray(data.messages)) {
        setMessages(data.messages.length ? data.messages : [GREETING]);
      }
    } catch {
      // keep whatever is on screen
    }
  };

  // While the sheet is open, poll for new messages so Merlin's console
  // replies (and AI replies) land without a reload.
  useEffect(() => {
    if (!open || !threadId) return;
    let alive = true;
    const tick = async () => {
      if (!alive || !openRef.current) return;
      try {
        const res = await fetch(`/api/muse/messages?thread_id=${encodeURIComponent(threadId)}`);
        const data = await res.json();
        if (alive && data?.ok && Array.isArray(data.messages) && data.messages.length) {
          setMessages(data.messages);
          setTyping(false);
        }
      } catch {
        // next poll will try again
      }
    };
    const id = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [open, threadId]);

  // Keep the latest message in view.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, typing, open]);

  // Escape closes; tapping outside closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onDown = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [open ]);

  const toggle = () => {
    if (!open && threadId) loadThread(threadId);
    setOpen((v) => !v);
  };

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setError('');
    setSending(true);
    setTyping(true);
    // Optimistic bubble so the chat feels instant.
    const optimistic = { id: `local-${Date.now()}`, sender: 'user', body: text, created_at: new Date().toISOString() };
    setMessages((m) => [...m.filter((x) => x.id !== 'greeting' || m.length > 1), optimistic]);
    try {
      let pageUrl = '';
      try {
        pageUrl = window.location.href;
      } catch {
        pageUrl = '';
      }
      const access_token = await getToken();
      const res = await fetch('/api/muse/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ thread_id: threadId, message: text, page_url: pageUrl, access_token }),
      });
      const data = await res.json();
      if (!data?.ok) {
        throw new Error(data?.error || 'The message would not send.');
      }
      if (data.thread_id && data.thread_id !== threadId) {
        setThreadId(data.thread_id);
        try {
          window.localStorage.setItem(THREAD_KEY, data.thread_id);
        } catch {
          // ignore
        }
      }
      // Refresh from the server for the true thread state.
      await loadThread(data.thread_id);
    } catch (e) {
      setError(e?.message ? String(e.message) : 'The message would not send — try again.');
    } finally {
      setSending(false);
      setTyping(false);
    }
  };

  return (
    <>
      {/* the floating spark */}
      <button
        type="button"
        onClick={toggle}
        aria-label={open ? 'Close Muse chat' : 'Chat with Muse'}
        title="Chat with Muse"
        className="fixed right-3 bottom-[calc(7rem+env(safe-area-inset-bottom))] z-[65] flex h-12 w-12 items-center justify-center rounded-full border border-violet-300/40 bg-violet-950/90 text-violet-200 shadow-[0_0_24px_rgba(167,139,250,0.35)] backdrop-blur-md transition-transform motion-reduce:transition-none hover:scale-105 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-300"
      >
        {open ? (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M4 4l12 12M16 4L4 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 2c.6 4.8 2.4 7.8 4.5 9.5 2.2 1.8 5 2.6 7.5 2.5-2.5.1-5.3.7-7.5 2.5C14.4 18.2 12.6 21.2 12 26c-.6-4.8-2.4-7.8-4.5-9.5C5.3 14.7 2.5 13.9 0 14c2.5-.1 5.3-.7 7.5-2.5C9.6 9.8 11.4 6.8 12 2z"
              fill="currentColor"
              opacity="0.9"
              transform="translate(0,-2)"
            />
          </svg>
        )}
      </button>

      {/* the chat sheet */}
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Chat with Muse"
          className="fixed inset-x-3 bottom-[calc(11rem+env(safe-area-inset-bottom))] z-[65] flex max-h-[62dvh] min-h-[22rem] flex-col overflow-hidden rounded-3xl border border-violet-300/25 bg-zinc-950/97 shadow-2xl backdrop-blur-xl sm:inset-x-auto sm:right-3 sm:w-[24rem]"
        >
          <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
            <span
              aria-hidden="true"
              className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-violet-500/20 text-lg text-violet-200"
            >
              ✦
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold tracking-wide text-white">Muse</h2>
              <p className="truncate text-[11px] text-zinc-400">Your universal helper around the launcher</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-2.5 overflow-y-auto px-4 py-3" aria-live="polite">
            {messages.map((m) => {
              const mine = m.sender === 'user';
              return (
                <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                      mine
                        ? 'rounded-br-md bg-violet-500/90 text-white'
                        : 'rounded-bl-md border border-white/10 bg-zinc-900/90 text-zinc-100'
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    {m.created_at && (
                      <p className={`mt-1 text-right text-[10px] ${mine ? 'text-violet-200/70' : 'text-zinc-500'}`}>
                        {fmtTime(m.created_at)}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
            {typing && (
              <div className="flex justify-start" aria-label="Muse is typing">
                <div className="rounded-2xl rounded-bl-md border border-white/10 bg-zinc-900/90 px-4 py-3">
                  <span className="flex gap-1.5">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="h-2 w-2 animate-bounce rounded-full bg-violet-300/80 motion-reduce:animate-none"
                        style={{ animationDelay: `${i * 0.15}s` }}
                        aria-hidden="true"
                      />
                    ))}
                  </span>
                </div>
              </div>
            )}
          </div>

          {error && (
            <p role="alert" className="px-4 pb-1 text-xs text-red-300">
              {error}
            </p>
          )}

          <div className="border-t border-white/10 p-3">
            <div className="flex items-end gap-2">
              <label htmlFor="muse-portal-input" className="sr-only">
                Message Muse
              </label>
              <textarea
                id="muse-portal-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={1}
                placeholder="Ask Muse anything…"
                className="max-h-28 min-h-[44px] flex-1 resize-none rounded-2xl border border-white/10 bg-black/60 px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:border-violet-300/60 focus:outline-none"
              />
              <button
                type="button"
                onClick={send}
                disabled={sending || !input.trim()}
                aria-label="Send message"
                className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-violet-500/90 text-white transition hover:bg-violet-400 disabled:opacity-40"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M4 12l16-8-6 16-2.5-6.5L4 12z" fill="currentColor" />
                </svg>
              </button>
            </div>
            <p className="mt-1.5 px-1 text-center text-[10px] text-zinc-600">
              Chatting with Muse — private account details are never shared here.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
