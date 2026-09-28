// @ts-nocheck
/* eslint-disable */
'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import MarkdownRenderer from '@/components/human-ai/MarkdownRenderer';

export default function HumanAI() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{role: string, text: string, isError?: boolean}[]>([]);
  const [language, setLanguage] = useState('en');
  const [loading, setLoading] = useState(false);
  const [sandboxContent, setSandboxContent] = useState(''); 

  const languages = [
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Español' },
    { code: 'fr', name: 'Français' },
    { code: 'zh', name: '中文' },
    { code: 'hi', name: 'हिन्दी' }
  ];

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return router.push('/');
      setMounted(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.push('/');
    });

    return () => subscription.unsubscribe();
  }, [router]);

  const sendMessage = async () => {
    if (!input.trim()) return;
    const newMessages = [...messages, { role: 'user', text: input }];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

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
    const formattedChat = messages.map(msg => `### ${msg.role === 'user' ? 'USER' : 'HUMAN AI'}\n${msg.text}\n`).join('\n---\n\n');
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

  if (!mounted) return <div className="w-screen h-screen bg-black" />;

  return (
    <>
      <button 
        onClick={() => router.push('/')} 
        className="absolute z-[9999] px-4 py-2 text-[10px] font-bold tracking-widest text-zinc-400 uppercase transition-colors border rounded top-5 right-5 bg-black/80 border-zinc-700 hover:text-emerald-400 hover:border-emerald-400"
      >
        EXIT MATRIX
      </button>

      <video autoPlay loop muted playsInline className="deep-background-video">
        <source src="https://files.catbox.moe/dddwtq.mov" type="video/mp4" />
      </video>

      <div className="app-layout">
        <div className="matrix-container">
          <header className="header-bar">
            <div className="branding">
              <h1>HUMAN AI</h1>
              <span>BY OMEGA x OLYMPUS</span>
            </div>
            <div className="header-controls">
              <button className="export-btn" onClick={exportChat} disabled={messages.length === 0}>EXPORT LOG</button>
              <select className="lang-selector" value={language} onChange={(e) => setLanguage(e.target.value)}>
                {languages.map(lang => <option key={lang.code} value={lang.code}>{lang.name}</option>)}
              </select>
            </div>
          </header>

          <div className="chat-window-wrapper">
            <video autoPlay loop muted playsInline className="logo-background-video">
              <source src="https://files.catbox.moe/tbqq7i.mov" type="video/mp4" />
            </video>

            <div className="chat-window">
              {messages.map((msg, idx) => (
                <div key={idx} className={`message-wrapper ${msg.role}`}>
                  <div className={`message-bubble ${msg.isError ? 'error-block' : ''}`}>
                    {msg.role === 'ai' && !msg.isError ? (
                      <MarkdownRenderer content={msg.text} onPreview={setSandboxContent} />
                    ) : (
                      msg.text
                    )}
                  </div>
                </div>
              ))}
              {loading && <div className="loading-pulse">Synthesizing...</div>}
            </div>
          </div>

          <div className="input-area">
            <input 
              type="text" value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()} placeholder="Initiate sequence..."
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


