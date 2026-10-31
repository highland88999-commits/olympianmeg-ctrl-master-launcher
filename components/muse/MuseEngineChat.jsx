'use client';

// MuseEngineChat — Muse lives INSIDE the engines.
//
// A floating chat panel that users open while building. Muse sees which
// engine they're in and what they're working on (via the context prop),
// so guidance is specific: "your terrain roughness is high — that'll give
// you jagged peaks" not generic help-desk text.
//
// Props:
//   engine  — machine name, e.g. 'world-engine' (sent as page context)
//   title   — display name, e.g. 'World Engine'
//   context — object describing the current build (params, selections).
//             Serialized into the prompt so Muse can see the work.
//   accent  — hex color for the UI theme.

import { useEffect, useRef, useState } from 'react';

export default function MuseEngineChat({ engine, title, context, accent = '#00f0ff' }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [threadId, setThreadId] = useState(null);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setSending(true);
    setMessages((m) => [...m, { sender: 'user', body: text }]);
    try {
      const res = await fetch('/api/muse/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          thread_id: threadId,
          page_url: typeof window !== 'undefined' ? window.location.href : '',
          engine,
          engine_context: context ? JSON.stringify(context).slice(0, 2000) : '',
        }),
      });
      const data = await res.json();
      if (data.ok) {
        if (data.thread_id) setThreadId(data.thread_id);
        setMessages((m) => [...m, { sender: 'muse', body: data.reply || '...' }]);
      } else {
        setMessages((m) => [...m, { sender: 'muse', body: data.error || 'Something went wrong. Try again.' }]);
      }
    } catch {
      setMessages((m) => [...m, { sender: 'muse', body: 'Could not reach Muse. Check your connection.' }]);
    } finally {
      setSending(false);
    }
  };

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Ask Muse"
          style={{
            position: 'fixed', right: 20, bottom: 20, zIndex: 2147483000,
            width: 60, height: 60, borderRadius: '50%',
            background: `linear-gradient(135deg, ${accent}, ${accent}88)`,
            border: `2px solid ${accent}`,
            color: '#fff', fontSize: 28, cursor: 'pointer',
            boxShadow: `0 4px 24px ${accent}66`,
          }}
        >
          ✦
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div
          style={{
            position: 'fixed', right: 20, bottom: 20, zIndex: 2147483000,
            width: 'min(380px, calc(100vw - 40px))', height: 'min(520px, calc(100vh - 100px))',
            display: 'flex', flexDirection: 'column',
            background: 'rgba(8, 14, 24, 0.97)',
            border: `1px solid ${accent}55`, borderRadius: 16,
            boxShadow: `0 8px 40px rgba(0,0,0,0.6), 0 0 24px ${accent}22`,
            overflow: 'hidden',
          }}
          role="dialog"
          aria-label={`Ask Muse — ${title}`}
        >
          {/* Header */}
          <div
            style={{
              padding: '12px 16px', display: 'flex', alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: `1px solid ${accent}33`,
              background: `${accent}11`,
            }}
          >
            <div>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>✦ Muse</div>
              <div style={{ color: `${accent}cc`, fontSize: 11 }}>{title} assistant</div>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close"
              style={{ background: 'none', border: 'none', color: '#8899aa', fontSize: 20, cursor: 'pointer' }}
            >
              ×
            </button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {messages.length === 0 && (
              <div style={{ color: '#667788', fontSize: 13, textAlign: 'center', marginTop: 20 }}>
                Ask me anything about building in the {title}.<br />
                I can see what you're working on.
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  alignSelf: m.sender === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '85%',
                  padding: '8px 12px', borderRadius: 12,
                  background: m.sender === 'user' ? `${accent}33` : 'rgba(255,255,255,0.06)',
                  color: '#e8f0f8', fontSize: 13, lineHeight: 1.45,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}
              >
                {m.body}
              </div>
            ))}
            {sending && (
              <div style={{ color: '#667788', fontSize: 13 }}>Muse is thinking…</div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ padding: 12, borderTop: `1px solid ${accent}33`, display: 'flex', gap: 8 }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder="Ask Muse for help…"
              disabled={sending}
              style={{
                flex: 1, padding: '10px 12px', borderRadius: 10,
                background: 'rgba(255,255,255,0.06)',
                border: `1px solid ${accent}44`, color: '#fff',
                fontSize: 13, outline: 'none',
              }}
            />
            <button
              onClick={send}
              disabled={sending || !input.trim()}
              style={{
                padding: '10px 16px', borderRadius: 10, cursor: 'pointer',
                background: accent, border: 'none', color: '#04121a',
                fontWeight: 700, fontSize: 13,
                opacity: sending || !input.trim() ? 0.5 : 1,
              }}
            >
              Send
            </button>
          </div>
        </div>
      )}
    </>
  );
}
