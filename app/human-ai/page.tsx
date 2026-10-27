// @ts-nocheck
/* eslint-disable */
'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { BackButton } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import MarkdownRenderer from '@/components/human-ai/MarkdownRenderer';

/* ATHENA interior treatment: inline SVG glyph set (zero image weight).
   Geometry only — no logos, no faces, no text inside the glyphs. */
function HAGlyph({ size = 14, children }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round"
      strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}>
      {children}
    </svg>
  );
}
const GlyphChat = ({ size = 12 }) => (
  <HAGlyph size={size}>
    <path d="M4 6 H20 V14 H13 L9 18 V14 H4 Z" />
  </HAGlyph>
);
const GlyphCouncil = ({ size = 12 }) => (
  <HAGlyph size={size}>
    <path d="M3 20 H21 M6 20 V9 M12 20 V9 M18 20 V9 M4 9 H20" />
  </HAGlyph>
);
const GlyphExport = ({ size = 12 }) => (
  <HAGlyph size={size}>
    <path d="M12 3 V15 M7 10 L12 15 L17 10 M4 21 H20" />
  </HAGlyph>
);
const GlyphGlobe = ({ size = 14 }) => (
  <HAGlyph size={size}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12 H21 M12 3 C7 8 7 16 12 21 M12 3 C17 8 17 16 12 21" />
  </HAGlyph>
);
const GlyphTransmit = ({ size = 14 }) => (
  <HAGlyph size={size}>
    <path d="M22 2 L11 13" />
    <path d="M22 2 L15 22 L11 13 L2 9 Z" />
  </HAGlyph>
);
const GlyphSpark = ({ size = 18 }) => (
  <HAGlyph size={size}>
    <path d="M12 2 L14 10 L22 12 L14 14 L12 22 L10 14 L2 12 L10 10 Z" />
  </HAGlyph>
);
const GlyphShield = ({ size = 12 }) => (
  <HAGlyph size={size}>
    <path d="M12 3 L20 6 V12 C20 17 16 20 12 21 C8 20 4 17 4 12 V6 Z" />
  </HAGlyph>
);
const GlyphClose = ({ size = 12 }) => (
  <HAGlyph size={size}>
    <path d="M6 6 L18 18 M18 6 L6 18" />
  </HAGlyph>
);

export default function HumanAI() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [cloudOffline, setCloudOffline] = useState(false);
  
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{role: string, text: string, isError?: boolean, council?: {task: string, verdicts: {agent: string, focus: string, verdict: string, live?: boolean}[], approved: boolean, nurture_score: number, consensus: string, note?: string}}[]>([]);
  const [language, setLanguage] = useState('en');
  const [loading, setLoading] = useState(false);
  const [sandboxContent, setSandboxContent] = useState('');
  const [mode, setMode] = useState<'chat' | 'council'>('chat');

  const languages = [
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Español' },
    { code: 'fr', name: 'Français' },
    { code: 'zh', name: '中文' },
    { code: 'hi', name: 'हिन्दी' }
  ];

  useEffect(() => {
    // The shared supabase client throws when the database connection isn't
    // configured. Catch that (and any auth failure) and say so honestly
    // instead of crashing into the error boundary.
    let subscription: { unsubscribe(): void } | undefined;
    try {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session) return router.push('/');
        setMounted(true);
      }).catch(() => setCloudOffline(true));

      const { data: { subscription: sub } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!session) router.push('/');
      });
      subscription = sub;
    } catch {
      setCloudOffline(true);
    }

    return () => subscription?.unsubscribe();
  }, [router]);

  const sendMessage = async () => {
    if (!input.trim()) return;
    const newMessages = [...messages, { role: 'user', text: input }];
    setMessages(newMessages);
    const submitted = input;
    setInput('');
    setLoading(true);

    // Council mode: run the query through the multi-agent council and render
    // the per-agent verdicts plus the final consensus.
    if (mode === 'council') {
      try {
        const res = await fetch('/api/council', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task: submitted })
        });
        const data = await res.json();
        if (!res.ok) {
          setMessages(prev => [...prev, { role: 'ai', text: data.error, isError: true }]);
        } else {
          setMessages(prev => [...prev, { role: 'council', text: data.consensus, council: data }]);
        }
      } catch (err) {
        setMessages(prev => [...prev, { role: 'ai', text: 'The Council could not convene.', isError: true }]);
      }
      setLoading(false);
      return;
    }

    let attempt = 0;
    const maxAttempts = 3;
    let success = false;

    while (attempt < maxAttempts && !success) {
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: input, language })
        });

        if (res.status === 429 && attempt < maxAttempts - 1) {
          attempt++;
          const delay = Math.pow(2, attempt) * 1500; 
          await new Promise(r => setTimeout(r, delay));
          continue; 
        }

        const data = await res.json();
        if (!res.ok) {
          setMessages(prev => [...prev, { role: 'ai', text: data.error, isError: true }]);
        } else {
          setMessages(prev => [...prev, { role: 'ai', text: data.text }]);
        }
        success = true; 
      } catch (err) {
        setMessages(prev => [...prev, { role: 'ai', text: 'System offline.', isError: true }]);
        success = true; 
      }
    }
    setLoading(false);
  };

  const exportChat = () => {
    if (messages.length === 0) return;
    const formattedChat = messages.map(msg => {
      if (msg.council) {
        const cards = msg.council.verdicts
          .map(v => `#### ${v.agent} — ${v.focus}\n${v.verdict}`)
          .join('\n\n');
        return `### COUNCIL DELIBERATION\n**Task:** ${msg.council.task}\n\n${cards}\n\n**Consensus:** ${msg.council.approved ? 'APPROVED' : 'REJECTED'} (nurture score ${msg.council.nurture_score}/10)\n${msg.council.consensus}\n`;
      }
      return `### ${msg.role === 'user' ? 'USER' : 'HUMAN AI'}\n${msg.text}\n`;
    }).join('\n---\n\n');
    const documentContent = `# HUMAN AI Session Log\n**Date:** ${new Date().toLocaleString()}\n\n---\n\n${formattedChat}`;
    const blob = new Blob([documentContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `HumanAI_Log_${new Date().toISOString().split('T')[0]}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (cloudOffline) return (
    <div className="w-screen h-dvh bg-black flex items-center justify-center p-8">
      <div className="max-w-md text-center">
        <p className="text-zinc-300 tracking-widest uppercase text-sm mb-3">Cloud features are offline</p>
        <p className="text-zinc-500 text-sm mb-6">
          This page needs the database connection. Check back once the cloud is connected.
        </p>
        <BackButton label="Exit matrix" />
      </div>
    </div>
  );

  if (!mounted) return (
    <div className="hai-veil" aria-hidden="true">
      <GlyphSpark size={44} />
      <span>ESTABLISHING LINK</span>
    </div>
  );

  return (
    <>
      <BackButton label="EXIT MATRIX" />

      <style>{`
        /* ATHENA interior treatment — hero backdrop: fixed webp layer sits
           behind the deep-background video (z-index -2) so existing video art
           keeps its position; gradient scrim keeps content readable. */
        .hai-bg-layer { position: fixed; inset: 0; z-index: -3; pointer-events: none;
          opacity: 0.6;
          background:
            linear-gradient(rgba(11,12,16,0.45), rgba(11,12,16,0.65)),
            url('/images/human-ai/bg.webp') center / cover no-repeat,
            #0b0c10; }
        /* Panel texture: faint circuit hatch over chat bubbles. */
        .human-ai-wrapper .message-bubble,
        .human-ai-wrapper .verdict-card,
        .human-ai-wrapper .consensus-panel {
          background-image:
            linear-gradient(rgba(69,243,255,0.035) 1px, transparent 1px),
            linear-gradient(90deg, rgba(69,243,255,0.035) 1px, transparent 1px);
          background-size: 22px 22px;
        }
        /* Glyph-bearing buttons: keep icon + label aligned. */
        .human-ai-wrapper .mode-tab,
        .human-ai-wrapper .export-btn,
        .human-ai-wrapper .input-area button,
        .human-ai-wrapper .sandbox-header button {
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
        }
        .human-ai-wrapper .loading-pulse {
          display: flex; align-items: center; justify-content: center; gap: 10px;
        }
        .hai-lang-wrap { display: inline-flex; align-items: center; gap: 8px; color: var(--omega-cyan); }
        .human-ai-wrapper .verdict-agent {
          display: inline-flex; align-items: center; gap: 6px;
        }
        /* Styled loading veil — real loading only (auth-session wait). */
        .hai-veil { position: fixed; inset: 0; background: #050507;
          display: flex; flex-direction: column; align-items: center;
          justify-content: center; gap: 18px; color: #00f2ff;
          font-family: 'Courier New', monospace; font-size: 11px;
          letter-spacing: 4px; }
        .hai-veil svg { animation: hai-veil-breathe 1.6s ease-in-out infinite; }
        @keyframes hai-veil-breathe { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) {
          .hai-veil svg { animation: none; }
        }
      `}</style>
      <div aria-hidden="true" className="hai-bg-layer" />

      <video autoPlay loop muted playsInline className="deep-background-video">
        <source src="/assets/human-ai/deep-background.mp4" type="video/mp4" />
      </video>

      <div className="app-layout">
        <div className="matrix-container">
          <header className="header-bar">
            <div className="branding">
              <h1>AI HELPER</h1>
              <span>BY OMEGA x OLYMPUS</span>
            </div>
            <div className="header-controls">
              <div className="mode-tabs" role="tablist" aria-label="Human AI mode">
                <button
                  className={`mode-tab${mode === 'chat' ? ' active' : ''}`}
                  onClick={() => setMode('chat')}
                  role="tab"
                  aria-selected={mode === 'chat'}
                ><GlyphChat />CHAT</button>
                <button
                  className={`mode-tab${mode === 'council' ? ' active' : ''}`}
                  onClick={() => setMode('council')}
                  role="tab"
                  aria-selected={mode === 'council'}
                ><GlyphCouncil />COUNCIL</button>
              </div>
              <button className="export-btn" onClick={exportChat} disabled={messages.length === 0}><GlyphExport />EXPORT LOG</button>
              <span className="hai-lang-wrap">
                <GlyphGlobe />
                <select className="lang-selector" value={language} onChange={(e) => setLanguage(e.target.value)}>
                  {languages.map(lang => <option key={lang.code} value={lang.code}>{lang.name}</option>)}
                </select>
              </span>
            </div>
          </header>

          <div className="chat-window-wrapper">
            <video autoPlay loop muted playsInline className="logo-background-video">
              <source src="/assets/human-ai/logo-background.mp4" type="video/mp4" />
            </video>

            <div className="chat-window">
              {messages.map((msg, idx) => (
                <div key={idx} className={`message-wrapper ${msg.role === 'council' ? 'ai' : msg.role}`}>
                  {msg.role === 'council' && msg.council ? (
                    <div className="council-verdict">
                      <div className="council-note">{msg.council.note ?? 'LIVE COUNCIL — Muse + Gemini deliberation'}</div>
                      {msg.council.verdicts.map(v => (
                        <div key={v.agent} className="verdict-card">
                          <div className="verdict-agent"><GlyphShield />{v.agent}</div>
                          <div className="verdict-focus">{v.focus}</div>
                          <p className="verdict-text">{v.verdict}</p>
                        </div>
                      ))}
                      <div className="consensus-panel">
                        <div className="consensus-status">
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                            <GlyphSpark size={14} />
                            CONSENSUS — {msg.council.approved ? 'APPROVED' : 'REJECTED'}
                          </span>
                          <span className="nurture-score">NURTURE {msg.council.nurture_score}/10</span>
                        </div>
                        <p className="consensus-text">{msg.council.consensus}</p>
                      </div>
                    </div>
                  ) : (
                    <div className={`message-bubble ${msg.isError ? 'error-block' : ''}`}>
                      {msg.role === 'ai' && !msg.isError ? (
                        <MarkdownRenderer content={msg.text} onPreview={setSandboxContent} />
                      ) : (
                        msg.text
                      )}
                    </div>
                  )}
                </div>
              ))}
              {loading && <div className="loading-pulse"><GlyphSpark />{mode === 'council' ? 'Convening the Council...' : 'Synthesizing...'}</div>}
              {/* Safari bottom-bar clearance */}
              <div aria-hidden="true" className="player-clear shrink-0" />
            </div>
          </div>

          <div className="input-area">
            <input 
              type="text" value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
              placeholder={mode === 'council' ? 'Present a task to the Council...' : 'Initiate sequence...'}
            />
            <button onClick={sendMessage}><GlyphTransmit />TRANSMIT</button>
          </div>
        </div>

        {sandboxContent && (
          <div className="sandbox-panel">
            <div className="sandbox-header">
              <span>LIVE PREVIEW ENVIRONMENT</span>
              <button onClick={() => setSandboxContent('')}><GlyphClose /> CLOSE</button>
            </div>
            <iframe 
              className="sandbox-frame" 
              srcDoc={sandboxContent} 
              sandbox="allow-scripts allow-popups allow-same-origin"
            />
          </div>
        )}
      </div>
    </>
  );
}


