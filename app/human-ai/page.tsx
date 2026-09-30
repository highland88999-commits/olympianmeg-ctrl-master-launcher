// @ts-nocheck
/* eslint-disable */
'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { BackButton } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import MarkdownRenderer from '@/components/human-ai/MarkdownRenderer';

export default function HumanAI() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [cloudOffline, setCloudOffline] = useState(false);
  
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{role: string, text: string, isError?: boolean, council?: {task: string, verdicts: {agent: string, focus: string, verdict: string}[], approved: boolean, nurture_score: number, consensus: string}}[]>([]);
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

  if (!mounted) return <div className="w-screen h-dvh bg-black" />;

  return (
    <>
      <BackButton label="EXIT MATRIX" />

      <video autoPlay loop muted playsInline className="deep-background-video">
        <source src="/assets/human-ai/deep-background.mp4" type="video/mp4" />
      </video>

      <div className="app-layout">
        <div className="matrix-container">
          <header className="header-bar">
            <div className="branding">
              <h1>HUMAN AI</h1>
              <span>BY OMEGA x OLYMPUS</span>
            </div>
            <div className="header-controls">
              <div className="mode-tabs" role="tablist" aria-label="Human AI mode">
                <button
                  className={`mode-tab${mode === 'chat' ? ' active' : ''}`}
                  onClick={() => setMode('chat')}
                  role="tab"
                  aria-selected={mode === 'chat'}
                >CHAT</button>
                <button
                  className={`mode-tab${mode === 'council' ? ' active' : ''}`}
                  onClick={() => setMode('council')}
                  role="tab"
                  aria-selected={mode === 'council'}
                >COUNCIL</button>
              </div>
              <button className="export-btn" onClick={exportChat} disabled={messages.length === 0}>EXPORT LOG</button>
              <select className="lang-selector" value={language} onChange={(e) => setLanguage(e.target.value)}>
                {languages.map(lang => <option key={lang.code} value={lang.code}>{lang.name}</option>)}
              </select>
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
                      <div className="council-note">SIMULATED COUNCIL — deliberation personas, not live model calls</div>
                      {msg.council.verdicts.map(v => (
                        <div key={v.agent} className="verdict-card">
                          <div className="verdict-agent">{v.agent}</div>
                          <div className="verdict-focus">{v.focus}</div>
                          <p className="verdict-text">{v.verdict}</p>
                        </div>
                      ))}
                      <div className="consensus-panel">
                        <div className="consensus-status">
                          CONSENSUS — {msg.council.approved ? 'APPROVED' : 'REJECTED'}
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
              {loading && <div className="loading-pulse">{mode === 'council' ? 'Convening the Council...' : 'Synthesizing...'}</div>}
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
            <button onClick={sendMessage}>TRANSMIT</button>
          </div>
        </div>

        {sandboxContent && (
          <div className="sandbox-panel">
            <div className="sandbox-header">
              <span>LIVE PREVIEW ENVIRONMENT</span>
              <button onClick={() => setSandboxContent('')}>✖ CLOSE</button>
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


